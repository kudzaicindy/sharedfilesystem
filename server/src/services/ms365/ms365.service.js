const User = require('../../models/User');
const Document = require('../../models/Document');
const { downloadDocument, updateDocumentFromBuffer } = require('../documents/document.service');
const { assertFolderRole } = require('../folders/folder-access');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const AUTH = 'https://login.microsoftonline.com';

function isConfigured() {
  return Boolean(
    process.env.MS365_CLIENT_ID
    && process.env.MS365_CLIENT_SECRET
    && process.env.MS365_TENANT_ID
    && process.env.MS365_REDIRECT_URI,
  );
}

function status() {
  return {
    configured: isConfigured(),
    tenantId: process.env.MS365_TENANT_ID || null,
    redirectUri: process.env.MS365_REDIRECT_URI || null,
  };
}

function authUrl(state) {
  if (!isConfigured()) {
    throw Object.assign(new Error('Microsoft 365 is not configured on the server'), { status: 503 });
  }
  const tenant = process.env.MS365_TENANT_ID;
  const params = new URLSearchParams({
    client_id: process.env.MS365_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.MS365_REDIRECT_URI,
    response_mode: 'query',
    scope: [
      'offline_access',
      'User.Read',
      'Files.ReadWrite.AppFolder',
      'Files.ReadWrite',
    ].join(' '),
    state: state || '',
  });
  return `${AUTH}/${tenant}/oauth2/v2.0/authorize?${params}`;
}

async function exchangeCode(code) {
  const tenant = process.env.MS365_TENANT_ID;
  const body = new URLSearchParams({
    client_id: process.env.MS365_CLIENT_ID,
    client_secret: process.env.MS365_CLIENT_SECRET,
    code,
    redirect_uri: process.env.MS365_REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  const res = await fetch(`${AUTH}/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data.error_description || data.error || 'Token exchange failed'), { status: 400 });
  }
  return data;
}

async function refreshAccessToken(user) {
  const tenant = process.env.MS365_TENANT_ID;
  const full = await User.findById(user._id).select('+microsoft.accessToken +microsoft.refreshToken microsoft');
  if (!full?.microsoft?.refreshToken) {
    throw Object.assign(new Error('Connect your Microsoft account first'), { status: 401, code: 'MS365_NOT_LINKED' });
  }

  if (full.microsoft.expiresAt && full.microsoft.expiresAt.getTime() > Date.now() + 60_000) {
    return full.microsoft.accessToken;
  }

  const body = new URLSearchParams({
    client_id: process.env.MS365_CLIENT_ID,
    client_secret: process.env.MS365_CLIENT_SECRET,
    refresh_token: full.microsoft.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(`${AUTH}/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data.error_description || 'Could not refresh Microsoft token'), { status: 401, code: 'MS365_NOT_LINKED' });
  }

  full.microsoft.accessToken = data.access_token;
  if (data.refresh_token) full.microsoft.refreshToken = data.refresh_token;
  full.microsoft.expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
  await full.save();
  return data.access_token;
}

async function linkAccount({ user, code }) {
  const tokens = await exchangeCode(code);
  const meRes = await fetch(`${GRAPH}/me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const me = await meRes.json();
  if (!meRes.ok) {
    throw Object.assign(new Error(me.error?.message || 'Could not read Microsoft profile'), { status: 400 });
  }

  const doc = await User.findById(user._id).select('+microsoft.accessToken +microsoft.refreshToken');
  doc.microsoft = {
    accountId: me.id,
    email: me.mail || me.userPrincipalName,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
  };
  await doc.save();
  return {
    linked: true,
    email: doc.microsoft.email,
  };
}

async function linkStatus(user) {
  const full = await User.findById(user._id).select('microsoft.email microsoft.accountId microsoft.expiresAt');
  return {
    configured: isConfigured(),
    linked: Boolean(full?.microsoft?.accountId),
    email: full?.microsoft?.email || null,
  };
}

async function graphFetch(accessToken, path, options = {}) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
  return res;
}

async function ensureAppFolder(accessToken) {
  const create = await graphFetch(accessToken, '/me/drive/special/approot/children', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Alamait',
      folder: {},
      '@microsoft.graph.conflictBehavior': 'replace',
    }),
  });
  const folder = await create.json();
  if (create.ok) return folder;

  // Fallback: /drive/root/Alamait
  const rootCreate = await graphFetch(accessToken, '/me/drive/root/children', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Alamait',
      folder: {},
      '@microsoft.graph.conflictBehavior': 'replace',
    }),
  });
  const rootFolder = await rootCreate.json();
  if (!rootCreate.ok) {
    throw Object.assign(new Error(rootFolder.error?.message || folder.error?.message || 'Could not create OneDrive folder'), { status: 502 });
  }
  return rootFolder;
}

async function startEditSession({ docId, user, req }) {
  if (!isConfigured()) {
    throw Object.assign(new Error('Microsoft 365 is not configured. Set MS365_* env vars.'), { status: 503 });
  }

  const doc = await Document.findById(docId);
  if (!doc || doc.isDeleted) throw Object.assign(new Error('Document not found'), { status: 404 });
  await assertFolderRole(doc.folder, user._id, 'editor');

  const accessToken = await refreshAccessToken(user);
  const { stream } = await downloadDocument({ docId, user, req });
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  const buffer = Buffer.concat(chunks);

  const folder = await ensureAppFolder(accessToken);
  const remoteName = `${docId}_${doc.name}`.replace(/[/\\?%*:|"<>]/g, '_');
  const uploadPath = `/me/drive/items/${folder.id}:/${encodeURIComponent(remoteName)}:/content`;

  const put = await graphFetch(accessToken, uploadPath, {
    method: 'PUT',
    headers: { 'Content-Type': doc.mimeType || 'application/octet-stream' },
    body: buffer,
  });
  const item = await put.json();
  if (!put.ok) {
    throw Object.assign(new Error(item.error?.message || 'Upload to OneDrive failed'), { status: 502 });
  }

  // Prefer webUrl for Office Online editing
  const editUrl = item.webUrl
    || `https://www.office.com/?auth=2&from=OfficeDotCom`;

  return {
    documentId: doc._id,
    driveItemId: item.id,
    editUrl,
    webUrl: item.webUrl,
    name: doc.name,
    message: 'Opened in Microsoft 365. When you finish editing in the browser tab, click “Sync back to Alamait”.',
  };
}

async function pullEdits({ docId, driveItemId, user, req }) {
  if (!driveItemId) {
    throw Object.assign(new Error('Missing OneDrive item id'), { status: 400 });
  }
  const doc = await Document.findById(docId);
  if (!doc || doc.isDeleted) throw Object.assign(new Error('Document not found'), { status: 404 });
  await assertFolderRole(doc.folder, user._id, 'editor');

  const accessToken = await refreshAccessToken(user);
  const res = await graphFetch(accessToken, `/me/drive/items/${driveItemId}/content`);
  if (!res.ok) {
    const errText = await res.text();
    throw Object.assign(new Error(errText || 'Could not download from OneDrive'), { status: 502 });
  }
  const ab = await res.arrayBuffer();
  const buffer = Buffer.from(ab);

  const updated = await updateDocumentFromBuffer({
    docId,
    buffer,
    originalName: doc.name,
    mimeType: doc.mimeType || 'application/octet-stream',
    user,
    comment: 'Synced from Microsoft 365 Online',
    req,
  });

  return {
    document: updated,
    message: 'Edits synced from Microsoft 365. A new version was created.',
  };
}

module.exports = {
  isConfigured,
  status,
  authUrl,
  linkAccount,
  linkStatus,
  startEditSession,
  pullEdits,
};
