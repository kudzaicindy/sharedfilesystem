import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

function apiBaseUrl() {
  const base = import.meta.env.VITE_API_URL || '/api';
  return base.replace(/\/$/, '');
}

/**
 * Desktop Word/Excel fetch this URL themselves (not via the browser).
 * Prefer a direct API origin so we don't rely on the Vite proxy.
 */
function officeApiBaseUrl() {
  const base = apiBaseUrl();
  if (/^https?:\/\//i.test(base)) return base;
  const port = import.meta.env.VITE_API_PORT || '5000';
  return `http://localhost:${port}/api`;
}

/** Desktop Office apps need a full http(s) URL, not a relative /api path. */
function toAbsoluteUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

function extFromFilename(name) {
  const ext = name?.split('.').pop()?.toLowerCase();
  return ext || '';
}

function safeOfficeFilename(name, fallbackExt = 'docx') {
  const raw = String(name || `document.${fallbackExt}`).trim() || `document.${fallbackExt}`;
  // Keep extension; strip characters that break URLs / Office parsing
  return raw.replace(/[/\\?%*:|"<>]/g, '_');
}

export function getDocumentViewUrl(docId, { download = false, filename } = {}) {
  const token = localStorage.getItem('token');
  const params = new URLSearchParams();
  if (download) params.set('download', '1');
  if (token) params.set('token', token);
  const qs = params.toString();
  const filePart = filename
    ? `/${encodeURIComponent(safeOfficeFilename(filename))}`
    : '';
  const path = `${apiBaseUrl()}/documents/${docId}/download${filePart}${qs ? `?${qs}` : ''}`;
  return toAbsoluteUrl(path);
}

function getOfficeDocumentUrl(docId, filename) {
  const token = localStorage.getItem('token');
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  const safeName = safeOfficeFilename(filename, extFromFilename(filename) || 'docx');
  const path = `${officeApiBaseUrl()}/documents/${docId}/download/${encodeURIComponent(safeName)}${qs ? `?${qs}` : ''}`;
  return path;
}

export function openDocumentInBrowser(docId, { sameTab = false } = {}) {
  const url = getDocumentViewUrl(docId);
  if (sameTab) {
    window.location.assign(url);
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
}

/**
 * Open in Microsoft 365 / Office desktop via protocol handlers.
 * Uses WebDAV URL so Save in Word/Excel writes back to Alamait (no browser download).
 */
export function openDocumentLocallyInOffice(docId, filename, webdavUrl) {
  const ext = extFromFilename(filename);
  const app =
    ext === 'doc' || ext === 'docx' ? 'ms-word' :
    ext === 'xls' || ext === 'xlsx' || ext === 'csv' ? 'ms-excel' :
    ext === 'ppt' || ext === 'pptx' ? 'ms-powerpoint' :
    null;

  if (!app) return false;

  const fileUrl = webdavUrl || getOfficeDocumentUrl(docId, filename);
  // Official Office URI scheme — do not wrap in iframe (breaks the command).
  const protocolUrl = `${app}:ofe|u|${fileUrl}`;
  window.location.href = protocolUrl;
  return true;
}

export function isDesktopOfficeFile(filename) {
  const ext = extFromFilename(filename);
  return ['doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx'].includes(ext);
}

/** Download so Windows opens with the default app (often WPS if set as default). */
export async function openDocumentWithApp(docId, filename) {
  await downloadDocument(docId, filename);
}

export async function downloadDocument(docId, filename) {
  const { data } = await api.get(`/documents/${docId}/download`, {
    params: { download: '1' },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'download';
  link.click();
  URL.revokeObjectURL(url);
}
