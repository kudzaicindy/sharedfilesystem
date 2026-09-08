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

module.exports = { getAllowedOrigins };
