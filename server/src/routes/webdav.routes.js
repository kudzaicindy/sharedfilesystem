const express = require('express');
const {
  buildFileHandlers,
  buildDocFolderHandlers,
  buildTicketRootHandlers,
  davHeaders,
} = require('../services/webdav/webdav.service');

const router = express.Router();
const file = buildFileHandlers();
const docFolder = buildDocFolderHandlers();
const ticketRoot = buildTicketRootHandlers();

async function dispatch(handlers, req, res, next) {
  try {
    const method = String(req.method || '').toLowerCase();
    // Express lowercases method; PROPFIND becomes 'propfind'
    const fn = handlers[method];
    if (!fn) {
      davHeaders(res);
      // Still advertise DAV on unknown methods
      if (method === 'options') return res.sendStatus(200);
      console.warn(`[webdav] unsupported ${req.method} ${req.originalUrl}`);
      return res.sendStatus(405);
    }
    console.log(`[webdav] ${req.method} ${req.originalUrl}`);
    await fn(req, res);
  } catch (err) {
    if (err.status === 401) {
      res.set('WWW-Authenticate', 'Basic realm="Alamait WebDAV"');
    }
    next(err);
  }
}

// Root OPTIONS so Office can discover DAV capability
router.options('/', (req, res) => {
  davHeaders(res);
  res.sendStatus(200);
});

router.all('/t/:ticket', (req, res, next) => dispatch(ticketRoot, req, res, next));
router.all('/t/:ticket/', (req, res, next) => dispatch(ticketRoot, req, res, next));
router.all('/t/:ticket/d/:docId', (req, res, next) => dispatch(docFolder, req, res, next));
router.all('/t/:ticket/d/:docId/', (req, res, next) => dispatch(docFolder, req, res, next));
router.all('/t/:ticket/d/:docId/:filename', (req, res, next) => dispatch(file, req, res, next));

module.exports = router;
