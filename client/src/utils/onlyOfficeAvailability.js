/** Whether the browser can load OnlyOffice (public DS URL configured). */

export function getConfiguredOnlyOfficeDsUrl() {
  const raw = import.meta.env.VITE_ONLYOFFICE_DS_URL?.trim();
  return raw ? raw.replace(/\/$/, '') : '';
}

export function isOnlyOfficeFileExt(ext = '') {
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext);
}

/** Localhost DS URLs work in dev only — not on Vercel production. */
export function isLocalOnlyOfficeDsUrl(url = '') {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(url).replace(/\/$/, ''));
}

export function isOnlyOfficeConfigured() {
  const url = getConfiguredOnlyOfficeDsUrl();
  if (!url) return false;
  if (import.meta.env.PROD && isLocalOnlyOfficeDsUrl(url)) return false;
  return true;
}

/** Drop unusable DS URLs (e.g. API returning localhost in production). */
export function sanitizeOnlyOfficeDsUrl(url) {
  const normalized = String(url || '').trim().replace(/\/$/, '');
  if (!normalized) return '';
  if (import.meta.env.PROD && isLocalOnlyOfficeDsUrl(normalized)) return '';
  return normalized;
}

/** Default in-app editor when user clicks Open (production-friendly). */
export function pickDefaultOpenChoice({ ext, browserOk, officeDesktopOk }) {
  if (ext === 'docx') return 'collab-docx';
  if (ext === 'xlsx') return 'xlsx-editor';
  if (isOnlyOfficeConfigured() && isOnlyOfficeFileExt(ext)) return 'onlyoffice';
  if (officeDesktopOk) return 'office-desktop';
  if (browserOk) return 'browser';
  return 'browser';
}
