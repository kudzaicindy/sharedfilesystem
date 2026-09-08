const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes     = require('./routes/auth.routes');
const folderRoutes   = require('./routes/folder.routes');
const documentRoutes = require('./routes/document.routes');
const auditRoutes    = require('./routes/audit.routes');
const sendRoutes     = require('./routes/send.routes');
const onlyOfficeRoutes = require('./routes/onlyoffice.routes');
const fileRequestRoutes = require('./routes/fileRequest.routes');
const webdavRoutes   = require('./routes/webdav.routes');
const { getUploadDir } = require('./utils/storage');
const { getAllowedOrigins } = require('./config/cors');

const app = express();

app.use(helmet({
  // Allow Office / WebDAV clients to fetch documents
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin(origin, cb) {
    // allow same-origin / server-to-server requests (no Origin header)
    if (!origin) return cb(null, true);
    const allowed = getAllowedOrigins();
    const normalized = origin.replace(/\/$/, '');
    if (allowed.includes(normalized)) return cb(null, true);
    console.warn(`CORS blocked: ${origin} (allowed: ${allowed.join(', ')})`);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(morgan('dev'));

// WebDAV must run before express.json() so PUT bodies stay binary
app.use('/webdav', webdavRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// Routes
app.use('/api/auth',      authRoutes);
app.use('/api/folders',   folderRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/audit',     auditRoutes);
app.use('/api/sends',     sendRoutes);
app.use('/api/onlyoffice', onlyOfficeRoutes);
app.use('/api/file-requests', fileRequestRoutes);
app.use('/api/ms365', require('./routes/ms365.routes'));

// Local file uploads (dev)
if ((process.env.STORAGE_TYPE || 'local') === 'local') {
  app.use('/uploads', express.static(getUploadDir()));
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

module.exports = app;
