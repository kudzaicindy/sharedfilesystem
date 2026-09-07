const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function onlyOfficeSecret() {
  return process.env.ONLYOFFICE_JWT_SECRET || '';
}

/** Random session key (hex only) — legacy / fallback. */
function createDocumentSessionKey() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Stable key per document version so multiple users join the same OnlyOffice session (live co-editing).
 * Pattern: only 0-9, a-z, A-Z, _, -, = (no colons).
 */
function onlyOfficeDocumentKey(docId, versionNum) {
  return `${String(docId)}_v${versionNum}`;
}

/** Short-lived token embedded in document.url for OnlyOffice server-side downloads. */
function signOnlyOfficeFileToken(docId, userId) {
  return jwt.sign(
    {
      purpose: 'oo-file',
      docId: String(docId),
      userId: String(userId),
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' },
  );
}

function extractTokenFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url).searchParams.get('token');
  } catch {
    const match = url.match(/[?&]token=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

function findDocumentDownloadUrl(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return null;
  if (typeof obj.url === 'string' && obj.url.includes('/download')) return obj.url;
  if (obj.document?.url) return obj.document.url;
  if (obj.payload) return findDocumentDownloadUrl(obj.payload, depth + 1);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findDocumentDownloadUrl(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** When JWT is enabled, OnlyOffice may send its own Bearer token instead of ?token=. */
function extractFileTokenFromOnlyOfficeJwt(bearer) {
  const secret = onlyOfficeSecret();
  if (!secret || !bearer) return null;
  try {
    const decoded = jwt.verify(bearer, secret);
    const downloadUrl = findDocumentDownloadUrl(decoded);
    return extractTokenFromUrl(downloadUrl);
  } catch {
    return null;
  }
}

module.exports = {
  createDocumentSessionKey,
  onlyOfficeDocumentKey,
  signOnlyOfficeFileToken,
  extractTokenFromUrl,
  extractFileTokenFromOnlyOfficeJwt,
};
