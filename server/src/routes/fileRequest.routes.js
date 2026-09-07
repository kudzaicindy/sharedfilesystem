const router = require('express').Router();
const multer = require('multer');
const { authenticate } = require('../middleware/authenticate');
const FileRequest = require('../models/FileRequest');
const Folder = require('../models/Folder');
const Document = require('../models/Document');
const Version = require('../models/Version');
const { uploadFile } = require('../utils/storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function makeToken() {
  // short, URL-safe token
  return require('crypto').randomBytes(18).toString('base64url');
}

async function assertOwnerOrMember(folderId, userId) {
  const folder = await Folder.findById(folderId);
  if (!folder) throw Object.assign(new Error('Folder not found'), { status: 404 });
  const isOwner = folder.owner.equals(userId);
  const member = folder.members.find(m => m.user.equals(userId));
  if (!isOwner && !member) throw Object.assign(new Error('Insufficient permissions'), { status: 403 });
  return folder;
}

// List my requests
router.get('/', authenticate, async (req, res, next) => {
  try {
    const items = await FileRequest.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(items);
  } catch (err) { next(err); }
});

// Create a request link for a folder
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { folderId, label, expiresAt, maxUploads } = req.body || {};
    if (!folderId) throw Object.assign(new Error('folderId is required'), { status: 400 });
    await assertOwnerOrMember(folderId, req.user._id);

    const token = makeToken();
    const item = await FileRequest.create({
      token,
      folder: folderId,
      createdBy: req.user._id,
      label: label?.trim() || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      maxUploads: typeof maxUploads === 'number' ? maxUploads : null,
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

router.post('/:id/revoke', authenticate, async (req, res, next) => {
  try {
    const item = await FileRequest.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!item) throw Object.assign(new Error('Request not found'), { status: 404 });
    item.isActive = false;
    await item.save();
    res.json(item);
  } catch (err) { next(err); }
});

// Public upload endpoint (no auth) - used by share link
router.post('/:token/upload', upload.single('file'), async (req, res, next) => {
  try {
    const token = req.params.token;
    const item = await FileRequest.findOne({ token }).lean();
    if (!item || !item.isActive) throw Object.assign(new Error('Upload link is not active'), { status: 404 });
    if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
      throw Object.assign(new Error('Upload link has expired'), { status: 410 });
    }
    if (typeof item.maxUploads === 'number' && item.uploadCount >= item.maxUploads) {
      throw Object.assign(new Error('Upload limit reached'), { status: 410 });
    }

    const file = req.file;
    if (!file) throw Object.assign(new Error('No file provided'), { status: 400 });

    const { key } = await uploadFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      prefix: `${item.folder}/`,
    });

    const now = new Date();
    const doc = await Document.create({
      name: file.originalname,
      folder: item.folder,
      mimeType: file.mimetype,
      size: file.size,
      storageKey: key,
      uploadedBy: { name: req.body?.name || 'External upload', at: now },
      lastModifiedBy: { name: req.body?.name || 'External upload', at: now },
    });

    const version = await Version.create({
      document: doc._id,
      versionNum: 1,
      storageKey: key,
      size: file.size,
      createdBy: { name: req.body?.name || 'External upload' },
      comment: 'Uploaded via link',
    });

    doc.currentVersion = version._id;
    await doc.save();

    await FileRequest.updateOne({ token }, { $inc: { uploadCount: 1 } });

    res.status(201).json({ message: 'Uploaded', document: doc });
  } catch (err) { next(err); }
});

module.exports = router;

