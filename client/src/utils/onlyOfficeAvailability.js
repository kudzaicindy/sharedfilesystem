/** Whether the browser can load OnlyOffice (explicit DS URL configured). */

export function getConfiguredOnlyOfficeDsUrl() {
  const raw = import.meta.env.VITE_ONLYOFFICE_DS_URL?.trim();
  return raw ? raw.replace(/\/$/, '') : '';
}

/** URL the browser loads OnlyOffice from — only when VITE_ONLYOFFICE_DS_URL is set. */
export function getEffectiveOnlyOfficeDsUrl() {
  return sanitizeOnlyOfficeDsUrl(getConfiguredOnlyOfficeDsUrl());
}

export function isOnlyOfficeFileExt(ext = '') {
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext);
}

/** Localhost DS URLs work in dev only — not on Vercel production. */
export function isLocalOnlyOfficeDsUrl(url = '') {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(url).replace(/\/$/, ''));
}

export function isOnlyOfficeConfigured() {
  return Boolean(getEffectiveOnlyOfficeDsUrl());
}

/** Drop unusable DS URLs (e.g. API returning localhost in production). */
export function sanitizeOnlyOfficeDsUrl(url) {
  const normalized = String(url || '').trim().replace(/\/$/, '');
  if (!normalized) return '';
  if (import.meta.env.PROD && isLocalOnlyOfficeDsUrl(normalized)) return '';
  return normalized;
}

/** Default in-app editor — collab/xlsx work without OnlyOffice (local + Vercel). */
export function pickDefaultOpenChoice({ ext, browserOk, officeDesktopOk }) {
  if (isOnlyOfficeConfigured() && isOnlyOfficeFileExt(ext)) return 'onlyoffice';
  if (ext === 'docx') return 'collab-docx';
  if (ext === 'xlsx') return 'xlsx-editor';
  if (officeDesktopOk) return 'office-desktop';
  if (browserOk) return 'browser';
  return 'browser';
}

/** Route path for the default in-app editor (when OnlyOffice is unavailable). */
export function getFallbackEditorPath(docId, ext = '') {
  const e = String(ext).toLowerCase();
  if (e === 'docx') return `/collab/${docId}`;
  if (e === 'xlsx') return `/xlsx-editor/${docId}`;
  if (e === 'doc') return `/docx-editor/${docId}`;
  return null;
}
