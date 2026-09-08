const router  = require('express').Router();
const multer  = require('multer');
const { authenticate } = require('../middleware/authenticate');
const {
  uploadDocument, updateDocument,
  softDeleteDocument, listDocuments, listDeletedDocuments,
  restoreDocument, getVersions, downloadDocument, renameDocument,
  getDocumentMeta,
  beginLocalEdit, endLocalEdit,
} = require('../services/documents/document.service');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

router.use(authenticate);

router.get('/folder/:folderId', async (req, res, next) => {
  try {
    const docs = await listDocuments(req.params.folderId, req.user._id);
    res.json(docs);
  } catch (err) { next(err); }
});

router.get('/deleted', async (req, res, next) => {
  try {
    const docs = await listDeletedDocuments(req.user._id);
    res.json(docs);
  } catch (err) { next(err); }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const doc = await uploadDocument({ file: req.file, folderId: req.body.folderId, user: req.user, req });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

router.put('/:docId', upload.single('file'), async (req, res, next) => {
  try {
    const doc = await updateDocument({ docId: req.params.docId, file: req.file, user: req.user, comment: req.body.comment, req });
    res.json(doc);
  } catch (err) { next(err); }
});

router.patch('/:docId', async (req, res, next) => {
  try {
    const doc = await renameDocument({ docId: req.params.docId, name: req.body?.name, user: req.user, req });
    res.json(doc);
  } catch (err) { next(err); }
});

router.post('/:docId/restore', async (req, res, next) => {
  try {
    const doc = await restoreDocument({ docId: req.params.docId, user: req.user, req });
    res.json(doc);
  } catch (err) { next(err); }
});

router.get('/:docId/meta', async (req, res, next) => {
  try {
    const doc = await getDocumentMeta({ docId: req.params.docId, user: req.user });
    res.json({ _id: doc._id, name: doc.name });
  } catch (err) { next(err); }
});

function officeMimeForExt(ext) {
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'doc') return 'application/msword';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (ext === 'ppt') return 'application/vnd.ms-powerpoint';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'txt') return 'text/plain; charset=utf-8';
  return null;
}

async function sendDocumentDownload(req, res, next) {
  try {
    const { stream, doc } = await downloadDocument({
      docId: req.params.docId,
      user: req.user,
      req,
    });
    const asAttachment = req.query.download === '1';
    const name = doc.name || req.params.filename || 'document';
    const ext = name.split('.').pop()?.toLowerCase();
    const inferred = officeMimeForExt(ext);
    res.setHeader('Content-Type', doc.mimeType || inferred || 'application/octet-stream');
    // ASCII fallback + RFC5987 filename so Word/Excel keep the real extension
    const safeAscii = String(name).replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    res.setHeader(
      'Content-Disposition',
      `${asAttachment ? 'attachment' : 'inline'}; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(name)}`
    );
    // Help desktop Office treat this as a document URL
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // OnlyOffice file token downloads — allow short private cache to speed reopen
    if (req.query.token && !asAttachment) {
      res.setHeader('Cache-Control', 'private, max-age=120');
    }
    stream.on('error', next);
    stream.pipe(res);
  } catch (err) { next(err); }
}

router.post('/:docId/local-edit/start', async (req, res, next) => {
  try {
    const { createWebDavTicket, safeFilename } = require('../services/webdav/webdav.service');
    const doc = await beginLocalEdit({
      docId: req.params.docId,
      user: req.user,
      req,
    });
    const ticket = createWebDavTicket({ userId: req.user._id, docId: doc._id });
    const base = (process.env.SERVER_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const name = encodeURIComponent(safeFilename(doc.name || 'document.docx'));
    // Path-based ticket (NOT ?token=) — Word keeps this path on LOCK/Save
    const webdavUrl = `${base}/webdav/t/${ticket}/d/${doc._id}/${name}`;
    res.json({
      document: doc,
      webdavUrl,
      ticket,
      message: 'Opened for desktop editing. Save in Word/Excel to sync changes to Alamait.',
    });
  } catch (err) { next(err); }
});

router.post('/:docId/local-edit/save', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw Object.assign(new Error('Edited file is required'), { status: 400 });
    const doc = await updateDocument({
      docId: req.params.docId,
      file: req.file,
      user: req.user,
      comment: req.body.comment || 'Saved from desktop app',
      req,
    });
    res.json(doc);
  } catch (err) { next(err); }
});

router.post('/:docId/local-edit/cancel', async (req, res, next) => {
  try {
    const doc = await endLocalEdit({ docId: req.params.docId, user: req.user });
    res.json(doc);
  } catch (err) { next(err); }
});

router.get('/:docId/download/:filename', sendDocumentDownload);
router.get('/:docId/download', sendDocumentDownload);

router.delete('/:docId', async (req, res, next) => {
  try {
    await softDeleteDocument({ docId: req.params.docId, user: req.user, req });
    res.json({ message: 'Document deleted' });
  } catch (err) { next(err); }
});

router.get('/:docId/versions', async (req, res, next) => {
  try {
    const versions = await getVersions(req.params.docId);
    res.json(versions);
  } catch (err) { next(err); }
});

module.exports = router;
