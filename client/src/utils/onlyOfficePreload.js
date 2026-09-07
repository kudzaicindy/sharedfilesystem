/** Fast path for OnlyOffice: preload api.js + short-lived config cache. */

import api from './api';

const DEFAULT_DS =
  (import.meta.env.VITE_ONLYOFFICE_DS_URL || 'http://localhost:8082').replace(/\/$/, '');

const scriptPromises = new Map();
let cachedDsUrl = DEFAULT_DS;
const configCache = new Map(); // docId -> { data, at }
const configInflight = new Map(); // docId -> Promise
const CONFIG_TTL_MS = 5_000;

export function getOnlyOfficeDsUrl() {
  return cachedDsUrl || DEFAULT_DS;
}

export function rememberOnlyOfficeDsUrl(url) {
  if (url) cachedDsUrl = String(url).replace(/\/$/, '');
}

export function onlyOfficeApiScriptUrl(dsUrl = getOnlyOfficeDsUrl()) {
  return `${String(dsUrl).replace(/\/$/, '')}/web-apps/apps/api/documents/api.js`;
}

/** Load DocsAPI once; concurrent callers share the same promise. */
export function loadOnlyOfficeApi(dsUrl = getOnlyOfficeDsUrl()) {
  rememberOnlyOfficeDsUrl(dsUrl);
  if (typeof window !== 'undefined' && window.DocsAPI?.DocEditor) {
    return Promise.resolve(window.DocsAPI);
  }

  const src = onlyOfficeApiScriptUrl(dsUrl);
  const existing = scriptPromises.get(src);
  if (existing) return existing;

  const promise = new Promise((resolve, reject) => {
    const prev = document.querySelector(`script[data-oo-api="1"]`);
    if (prev?.getAttribute('data-loaded') === '1' && window.DocsAPI?.DocEditor) {
      resolve(window.DocsAPI);
      return;
    }

    const script = prev && prev.getAttribute('data-src') === src
      ? prev
      : document.createElement('script');

    if (!script.parentNode) {
      script.src = src;
      script.async = true;
      script.dataset.ooApi = '1';
      script.dataset.src = src;
      document.head.appendChild(script);
    }

    script.onload = () => {
      script.setAttribute('data-loaded', '1');
      if (window.DocsAPI?.DocEditor) resolve(window.DocsAPI);
      else reject(new Error('OnlyOffice editor API not available'));
    };
    script.onerror = () => {
      scriptPromises.delete(src);
      reject(new Error('Failed to load editor script'));
    };
  });

  scriptPromises.set(src, promise);
  return promise;
}

/** Kick off script download as early as possible (Open click / app idle). */
export function preloadOnlyOfficeApi() {
  const src = onlyOfficeApiScriptUrl();
  if (typeof document !== 'undefined') {
    const existingPreload = document.querySelector(`link[data-oo-preload="${src}"]`);
    if (!existingPreload) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'script';
      link.href = src;
      link.dataset.ooPreload = src;
      document.head.appendChild(link);
    }
  }
  loadOnlyOfficeApi().catch(() => {});
}

export function getCachedOnlyOfficeConfig(docId) {
  const hit = configCache.get(String(docId));
  if (!hit) return null;
  if (Date.now() - hit.at > CONFIG_TTL_MS) {
    configCache.delete(String(docId));
    return null;
  }
  return hit.data;
}

export function setCachedOnlyOfficeConfig(docId, data) {
  if (!docId || !data) return;
  rememberOnlyOfficeDsUrl(data.dsUrl);
  configCache.set(String(docId), { data, at: Date.now() });
}

export function clearCachedOnlyOfficeConfig(docId) {
  if (docId) configCache.delete(String(docId));
  else configCache.clear();
}

/** Shared config fetch — Open warm-up and editor page share one request. */
export function fetchOnlyOfficeConfig(docId, { force = false } = {}) {
  const id = String(docId);
  if (force) clearCachedOnlyOfficeConfig(id);
  const cached = !force ? getCachedOnlyOfficeConfig(id) : null;
  if (cached) return Promise.resolve(cached);

  const pending = configInflight.get(id);
  if (pending) return pending;

  const promise = api.get(`/onlyoffice/config/${id}`)
    .then(({ data }) => {
      setCachedOnlyOfficeConfig(id, data);
      return data;
    })
    .finally(() => {
      configInflight.delete(id);
    });

  configInflight.set(id, promise);
  return promise;
}
