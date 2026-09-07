const { Readable } = require('stream');

/** Short-lived in-memory file buffers so OnlyOffice downloads skip a second S3 round-trip. */
const cache = new Map(); // storageKey -> { buffer, at, name, mimeType }
const MAX_ENTRIES = 24;
const TTL_MS = 5 * 60 * 1000;
const MAX_BYTES = 25 * 1024 * 1024; // don't cache huge files
const warming = new Set();

function getCachedFile(storageKey) {
  const hit = cache.get(String(storageKey));
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(String(storageKey));
    return null;
  }
  return hit;
}

function setCachedFile(storageKey, buffer, meta = {}) {
  const key = String(storageKey);
  if (!buffer || buffer.length > MAX_BYTES) return;
  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, {
    buffer,
    at: Date.now(),
    name: meta.name || '',
    mimeType: meta.mimeType || '',
  });
}

function streamFromCache(storageKey) {
  const hit = getCachedFile(storageKey);
  if (!hit) return null;
  return Readable.from(hit.buffer);
}

async function warmFileCache(storageKey, getStreamFn, meta = {}) {
  const key = String(storageKey || '');
  if (!key || warming.has(key) || getCachedFile(key)) return;
  warming.add(key);
  try {
    const stream = await getStreamFn(key);
    const chunks = [];
    let total = 0;
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_BYTES) return;
      chunks.push(buf);
    }
    setCachedFile(key, Buffer.concat(chunks), meta);
  } catch {
    // warm is best-effort
  } finally {
    warming.delete(key);
  }
}

function invalidateFileCache(storageKey) {
  if (storageKey) cache.delete(String(storageKey));
}

module.exports = {
  getCachedFile,
  setCachedFile,
  streamFromCache,
  warmFileCache,
  invalidateFileCache,
};
