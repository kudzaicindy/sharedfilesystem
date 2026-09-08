const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { authenticate } = require('../middleware/authenticate');
const Document = require('../models/Document');
const Version = require('../models/Version');
const { uploadFile, getFileStream, getPresignedDownloadUrl } = require('../utils/storage');
const { warmFileCache } = require('../utils/file-cache');
const User = require('../models/User');
const { logEvent } = require('../services/audit/audit.service');
const {
  buildRevisionActivity,
  downloadAndStoreChangesZip,
} = require('../services/onlyoffice/onlyoffice-changes.service');
const { buildReadableTextDiff } = require('../utils/text-diff');
const { docxToComparableText } = require('../utils/docx-extract');
const { buildSpreadsheetDiff, attributeSpreadsheetDiff } = require('../utils/spreadsheet-diff');
const {
  onlyOfficeDocumentKey,
  signOnlyOfficeFileToken,
} = require('../utils/onlyoffice-tokens');

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function clampText(text, maxChars) {
  const s = String(text || '');
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n…(truncated ${s.length - maxChars} chars)`;
}

function onlyOfficeSecret() {
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!secret) throw Object.assign(new Error('OnlyOffice JWT secret not configured'), { status: 500 });
  return secret;
}

function dsUrl() {
  return (process.env.ONLYOFFICE_DS_URL || 'http://localhost:8082').replace(/\/$/, '');
}

function serverUrl() {
  const base =
    process.env.ONLYOFFICE_SERVER_URL ||
    process.env.SERVER_PUBLIC_URL ||
    'http://localhost:5000';
  return base.replace(/\/$/, '');
}

function extFromFilename(name) {
  const ext = name?.split('.').pop()?.toLowerCase();
  return ext || '';
}

function onlyOfficeFileType(ext) {
  // OnlyOffice expects fileType without dot, lower-case.
  return ext;
}

function onlyOfficeDocumentType(ext) {
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'cell';
  if (['pptx', 'ppt'].includes(ext)) return 'slide';
  return 'word';
}

function assertOnlyOfficeSupported(name) {
  const ext = extFromFilename(name);
  const ok = ['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt'].includes(ext);
  if (!ok) throw Object.assign(new Error('This file type is not supported for in-browser editing'), { status: 400 });
  return ext;
}

function isWordExt(ext) {
  return ['docx', 'doc'].includes(ext);
}

function isSpreadsheetExt(ext) {
  return ['xlsx', 'xls'].includes(ext);
}

// Create editor config for the frontend
router.get('/config/:docId', authenticate, async (req, res, next) => {
  try {
    const [doc, lastVersion] = await Promise.all([
      Document.findById(req.params.docId)
        .select('name isDeleted storageKey mimeType')
        .lean(),
      Version.findOne({ document: req.params.docId })
        .sort({ versionNum: -1 })
        .select('versionNum')
        .lean(),
    ]);
    if (!doc || doc.isDeleted) throw Object.assign(new Error('Document not found'), { status: 404 });

    const ext = assertOnlyOfficeSupported(doc.name);
    const versionNum = lastVersion?.versionNum || 1;
    const callbackUrl = `${serverUrl()}/api/onlyoffice/callback/${doc._id}`;

    // Prefer direct S3 URL so Document Server does not wait on Node → S3
    let fileUrl = null;
    if (doc.storageKey) {
      try {
        fileUrl = await getPresignedDownloadUrl(doc.storageKey, 2 * 60 * 60);
      } catch {
        fileUrl = null;
      }
    }
    if (!fileUrl) {
      const fileAccessToken = signOnlyOfficeFileToken(doc._id, req.user._id);
      const urlParams = new URLSearchParams();
      urlParams.set('token', fileAccessToken);
      fileUrl = `${serverUrl()}/api/documents/${doc._id}/download?${urlParams.toString()}`;
      // Warm RAM cache so the proxy download is instant if S3 presign failed
      if (doc.storageKey) {
        warmFileCache(doc.storageKey, getFileStream, {
          name: doc.name,
          mimeType: doc.mimeType,
        });
      }
    } else if (doc.storageKey) {
      // Still warm cache for save/diff paths
      warmFileCache(doc.storageKey, getFileStream, {
        name: doc.name,
        mimeType: doc.mimeType,
      });
    }

    const payload = {
      documentType: onlyOfficeDocumentType(ext),
      document: {
        fileType: onlyOfficeFileType(ext),
        // Same key for all editors on this version → live co-editing in OnlyOffice.
        key: onlyOfficeDocumentKey(doc._id, versionNum),
        title: doc.name,
        url: fileUrl,
        permissions: {
          edit: true,
          download: true,
          print: true,
          review: true,
          comment: true,
        },
      },
      editorConfig: {
        callbackUrl,
        mode: 'edit',
        user: {
          id: String(req.user._id),
          name: req.user.name || 'User',
        },
        // Spreadsheets: strict co-editing highlights each user's edits until Save (closest to Word track changes).
        ...(isSpreadsheetExt(ext) ? { coEditing: { mode: 'strict', change: true } } : {}),
        customization: {
          compactToolbar: true,
          compactHeader: true,
          forceSave: true,
          autosave: true,
          // Skip heavy chrome so the editor shell appears sooner
          plugins: false,
          help: false,
          about: false,
          feedback: false,
          chat: false,
          logo: { visible: false },
          // Do not set loaderName — OO 9.x then requests main/index_loader.html (missing in this image)
          ...(isWordExt(ext) ? {
            review: {
              trackChanges: true,
              showReviewChanges: false,
            },
          } : {}),
        },
      },
    };

    const signed = jwt.sign(payload, onlyOfficeSecret());

    res.set('Cache-Control', 'private, max-age=15');
    res.json({
      dsUrl: dsUrl(),
      config: payload,
      token: signed,
    });
  } catch (err) {
    next(err);
  }
});

// OnlyOffice save callback (called by Document Server)
router.post('/callback/:docId', async (req, res, next) => {
  try {
    const authHeader =
      req.headers.authorization ||
      req.headers.Authorization ||
      req.headers.authorizationjwt ||
      req.headers.AuthorizationJwt ||
      '';

    const token = String(authHeader || '').startsWith('Bearer ')
      ? String(authHeader).slice('Bearer '.length)
      : String(authHeader || '');

    if (!token) return res.status(401).json({ error: 1, message: 'Missing OnlyOffice token' });

    try {
      jwt.verify(token, onlyOfficeSecret());
    } catch {
      return res.status(401).json({ error: 1, message: 'Invalid OnlyOffice token' });
    }

    const body = req.body || {};
    const status = Number(body.status);

    // 2 = MustSave, 6 = MustForceSave (OnlyOffice)
    if (status !== 2 && status !== 6) {
      return res.json({ error: 0 });
    }

    const doc = await Document.findById(req.params.docId);
    if (!doc || doc.isDeleted) return res.json({ error: 0 });

    const fileUrl = body.url;
    if (!fileUrl) return res.status(400).json({ error: 1, message: 'Missing url in callback' });

    const r = await fetch(fileUrl);
    if (!r.ok) return res.status(502).json({ error: 1, message: 'Failed to fetch updated file from OnlyOffice' });
    const arrayBuffer = await r.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = extFromFilename(doc.name);

    // What changed: Word = text, Excel = cells
    let contentDiff = null;
    if (doc.storageKey) {
      try {
        const prevStream = await getFileStream(doc.storageKey);
        const prevBuf = await streamToBuffer(prevStream);
        if (isWordExt(ext)) {
          const beforeText = await docxToComparableText(prevBuf);
          const afterText = await docxToComparableText(buffer);
          contentDiff = buildReadableTextDiff(beforeText, afterText);
        } else if (isSpreadsheetExt(ext)) {
          contentDiff = buildSpreadsheetDiff(prevBuf, buffer);
        }
      } catch {
        // ignore diff failures
      }
    }

    // Who actually edited (OnlyOffice sends this on save).
    let editorUser = null;
    try {
      const decoded = jwt.verify(token, onlyOfficeSecret());
      const lastEditedUserId = Array.isArray(body.users) && body.users[0] ? String(body.users[0]) : null;
      const editorUserId = lastEditedUserId || decoded?.editorConfig?.user?.id;
      if (editorUserId) editorUser = await User.findById(editorUserId);
    } catch {
      // ignore
    }

    const editorSnapshot = editorUser
      ? { user: editorUser._id, name: editorUser.name }
      : doc.lastModifiedBy?.user
        ? { user: doc.lastModifiedBy.user, name: doc.lastModifiedBy.name || 'OnlyOffice' }
        : null;

    const { key } = await uploadFile({
      buffer,
      originalName: doc.name,
      mimeType: doc.mimeType || 'application/octet-stream',
      prefix: `${doc.folder}/`,
    });

    const lastVersion = await Version.findOne({ document: doc._id }).sort({ versionNum: -1 });
    const nextNum = (lastVersion?.versionNum || 0) + 1;

    let changesStorageKey = null;
    if ((isWordExt(ext) || isSpreadsheetExt(ext)) && body.changesurl) {
      changesStorageKey = await downloadAndStoreChangesZip(body.changesurl, {
        docId: doc._id,
        versionNum: nextNum,
      });
    }

    const version = await Version.create({
      document: doc._id,
      versionNum: nextNum,
      storageKey: key,
      size: buffer.length,
      createdBy: editorSnapshot
        ? { user: editorSnapshot.user, name: editorSnapshot.name }
        : { user: doc.lastModifiedBy?.user, name: doc.lastModifiedBy?.name || 'OnlyOffice' },
      comment: 'Edited in OnlyOffice',
      changesStorageKey: changesStorageKey || undefined,
      onlyOfficeServerVersion: body.history?.serverVersion
        ? String(body.history.serverVersion)
        : undefined,
    });

    doc.storageKey = key;
    doc.size = buffer.length;
    doc.currentVersion = version._id;
    if (editorSnapshot) {
      doc.lastModifiedBy = { user: editorSnapshot.user, name: editorSnapshot.name, at: new Date() };
    }
    await doc.save();

    if (editorUser) {
      const savedAt = body.lastsave ? new Date(body.lastsave) : new Date();
      const { revisions, serverVersion, revisionCount } = await buildRevisionActivity(body, {
        fallbackUser: editorUser,
      });

      if (contentDiff && isSpreadsheetExt(ext)) {
        contentDiff = attributeSpreadsheetDiff(contentDiff, revisions);
      }

      const revUserIds = [...new Set(revisions.map(r => r.userId).filter(Boolean))];
      const revUsers = revUserIds.length
        ? await User.find({ _id: { $in: revUserIds } })
        : [];
      const revUserById = new Map(revUsers.map(u => [String(u._id), u]));

      for (const rev of revisions) {
        const revUser = rev.userId ? revUserById.get(rev.userId) : null;
        await logEvent({
          user: revUser || editorUser,
          action: 'revision',
          resourceType: 'document',
          resourceId: doc._id,
          resourceName: doc.name,
          folderId: doc.folder,
          versionId: version._id,
          metadata: {
            via: 'onlyoffice',
            fileType: ext,
            revisionIndex: rev.index,
            revisionTotal: revisionCount,
            serverVersion,
            changesStorageKey: changesStorageKey || undefined,
          },
          req,
          timestamp: new Date(rev.at),
        });
      }

      await logEvent({
        user: editorUser,
        action: 'edited',
        resourceType: 'document',
        resourceId: doc._id,
        resourceName: doc.name,
        folderId: doc.folder,
        versionId: version._id,
        metadata: {
          via: 'onlyoffice',
          fileType: ext,
          savedAt: savedAt.toISOString(),
          onlyOfficeStatus: status,
          versionNum: nextNum,
          revisionCount,
          revisions,
          changesStorageKey: changesStorageKey || undefined,
          serverVersion,
          forcesavetype: body.forcesavetype,
          ...(contentDiff ? { diff: contentDiff } : {}),
        },
        req,
        timestamp: savedAt,
      });
    }

    return res.json({ error: 0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

