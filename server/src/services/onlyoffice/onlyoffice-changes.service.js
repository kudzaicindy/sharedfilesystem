const User = require('../../models/User');
const { uploadFile } = require('../../utils/storage');

function dsUrl() {
  return (process.env.ONLYOFFICE_DS_URL || 'http://localhost:8082').replace(/\/$/, '');
}

/** Rewrite OnlyOffice cache URLs to our configured Document Server host. */
function resolveOnlyOfficeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const target = new URL(url);
    const ds = new URL(dsUrl());
    target.protocol = ds.protocol;
    target.host = ds.host;
    return target.toString();
  } catch {
    return url;
  }
}

function parseOnlyOfficeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Flatten history.changes from OnlyOffice callback into revision rows.
 * Each row: { at: Date, userId, userName, serverVersion? }
 */
function flattenHistoryChanges(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [];

  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;

    if (Array.isArray(item.changes) && item.changes.length) {
      out.push(...flattenHistoryChanges(item.changes));
      continue;
    }

    const at = parseOnlyOfficeDate(item.created);
    const userId = item.user?.id != null ? String(item.user.id) : null;
    const userName = item.user?.name ? String(item.user.name) : null;

    if (at || userId || userName) {
      out.push({
        at: at || new Date(),
        userId,
        userName,
        serverVersion: item.serverVersion,
      });
    }
  }
  return out;
}

async function resolveRevisionUsers(revisions) {
  const ids = [...new Set(revisions.map(r => r.userId).filter(Boolean))];
  const users = ids.length
    ? await User.find({ _id: { $in: ids } }).select('name email').lean()
    : [];
  const byId = new Map(users.map(u => [String(u._id), u]));

  return revisions.map((rev, index) => {
    const dbUser = rev.userId ? byId.get(rev.userId) : null;
    return {
      index: index + 1,
      at: rev.at.toISOString(),
      userId: rev.userId,
      userName: dbUser?.name || rev.userName || 'Unknown',
      userEmail: dbUser?.email,
    };
  });
}

async function downloadAndStoreChangesZip(changesurl, { docId, versionNum }) {
  const url = resolveOnlyOfficeUrl(changesurl);
  if (!url) return null;

  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    if (!buffer.length) return null;

    const { key } = await uploadFile({
      buffer,
      originalName: `changes-v${versionNum}.zip`,
      mimeType: 'application/zip',
      prefix: `onlyoffice-changes/${docId}/`,
    });
    return key;
  } catch {
    return null;
  }
}

/**
 * Build Activity payload from OnlyOffice save callback (docx/doc).
 */
async function buildRevisionActivity(body, { fallbackUser }) {
  const flat = flattenHistoryChanges(body.history?.changes);
  let revisions = await resolveRevisionUsers(flat);

  if (!revisions.length && fallbackUser) {
    const savedAt = body.lastsave ? parseOnlyOfficeDate(body.lastsave) : new Date();
    revisions = [{
      index: 1,
      at: (savedAt || new Date()).toISOString(),
      userId: String(fallbackUser._id),
      userName: fallbackUser.name,
      userEmail: fallbackUser.email,
    }];
  }

  return {
    revisions,
    serverVersion: body.history?.serverVersion,
    revisionCount: revisions.length,
  };
}

module.exports = {
  flattenHistoryChanges,
  resolveOnlyOfficeUrl,
  buildRevisionActivity,
  downloadAndStoreChangesZip,
};
