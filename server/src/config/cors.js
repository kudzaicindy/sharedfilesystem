function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/$/, '');
}

/** Allowed browser origins for CORS / Socket.IO (no trailing slash). */
function getAllowedOrigins() {
  const fromEnv = [process.env.CLIENT_URL, process.env.CORS_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => value.split(','))
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const defaults = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];

  return [...new Set([...fromEnv, ...defaults])];
}

/** Match Vercel preview URLs for the same project as CLIENT_URL (e.g. *-git-main-*.vercel.app). */
function getVercelPreviewRegex() {
  const clientUrl = process.env.CLIENT_URL?.trim();
  if (!clientUrl) return null;
  try {
    const { hostname } = new URL(clientUrl);
    const match = hostname.match(/^([a-z0-9-]+)\.vercel\.app$/i);
    if (!match) return null;
    const slug = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^https://${slug}(-[a-z0-9-]+)*\\.vercel\\.app$`, 'i');
  } catch {
    return null;
  }
}

function isOriginAllowed(origin) {
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (getAllowedOrigins().includes(normalized)) return true;

  if (process.env.CORS_ALLOW_VERCEL_PREVIEWS !== 'false') {
    const vercelRe = getVercelPreviewRegex();
    if (vercelRe?.test(normalized)) return true;
  }

  const patterns = (process.env.CORS_ORIGIN_PATTERNS || '')
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  for (const pattern of patterns) {
    try {
      if (new RegExp(pattern, 'i').test(normalized)) return true;
    } catch {
      // ignore invalid regex in env
    }
  }

  return false;
}

module.exports = { getAllowedOrigins, isOriginAllowed };
