const Document = require('../../models/Document');
const Version  = require('../../models/Version');
const Folder   = require('../../models/Folder');
const { uploadFile, deleteFile, getFileStream, localFileExists } = require('../../utils/storage');
const { logEvent } = require('../audit/audit.service');
const { trackEdit } = require('../send/send.service');
const { assertFolderRole } = require('../folders/folder-access');

async function assertFolderAccess(folderId, userId, minimumRole = 'viewer') {
  const { folder } = await assertFolderRole(folderId, userId, minimumRole);
  return folder;
}

async function uploadDocument({ file, folderId, user, req }) {
  await assertFolderAccess(folderId, user._id, 'editor');

  const { key } = await uploadFile({
    buffer:       file.buffer,
    originalName: file.originalname,
    mimeType:     file.mimetype,
    prefix:       `${folderId}/`,
  });

  const now = new Date();

  const doc = await Document.create({
    name:       file.originalname,
    folder:     folderId,
    mimeType:   file.mimetype,
    size:       file.size,
    storageKey: key,
    uploadedBy: { user: user._id, name: user.name, at: now },
    lastModifiedBy: { user: user._id, name: user.name, at: now },
  });

  // Create version 1
  const version = await Version.create({
    document:   doc._id,
    versionNum: 1,
    storageKey: key,
    size:       file.size,
    createdBy:  { user: user._id, name: user.name },
  });

  doc.currentVersion = version._id;
  await doc.save();

  await logEvent({ user, action: 'uploaded', resourceType: 'document',
    resourceId: doc._id, resourceName: doc.name, folderId, versionId: version._id, req });

  return doc;
}

async function updateDocument({ docId, file, user, comment, req }) {
  return updateDocumentFromBuffer({
    docId,
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    user,
    comment,
    req,
  });
}

async function updateDocumentFromBuffer({
  docId,
  buffer,
  originalName,
  mimeType,
  size,
  user,
  comment,
  req,
}) {
  const doc = await Document.findById(docId);
  if (!doc || doc.isDeleted) throw Object.assign(new Error('Document not found'), { status: 404 });

  await assertFolderAccess(doc.folder, user._id, 'editor');

  const byteLength = size ?? buffer.length;
  const previousKey = doc.storageKey;
  const { key } = await uploadFile({
    buffer,
    originalName: originalName || doc.name,
    mimeType: mimeType || doc.mimeType || 'application/octet-stream',
    prefix: `${doc.folder}/`,
  });

  try {
    const { invalidateFileCache } = require('../../utils/file-cache');
    if (previousKey) invalidateFileCache(previousKey);
  } catch { /* ignore */ }

  const lastVersion = await Version.findOne({ document: docId }).sort({ versionNum: -1 });
  const nextNum = (lastVersion?.versionNum || 0) + 1;

  const version = await Version.create({
    document:   docId,
    versionNum: nextNum,
    storageKey: key,
    size:       byteLength,
    createdBy:  { user: user._id, name: user.name },
    comment,
  });

  const now = new Date();
  doc.storageKey = key;
  doc.size = byteLength;
  if (mimeType) doc.mimeType = mimeType;
  doc.currentVersion = version._id;
  doc.lastModifiedBy = { user: user._id, name: user.name, at: now };
  await doc.save();
  await Document.updateOne({ _id: docId }, { $unset: { localEdit: 1 } });

  await logEvent({ user, action: 'edited', resourceType: 'document',
    resourceId: doc._id, resourceName: doc.name, folderId: doc.folder,
    versionId: version._id, metadata: { source: comment || 'local-edit' }, req });

  await trackEdit({ documentId: doc._id, user, req });

  return Document.findById(docId);
}

async function beginLocalEdit({ docId, user, req }) {
  const doc = await Document.findById(docId);
  if (!doc || doc.isDeleted) throw Object.assign(new Error('Document not found'), { status: 404 });
  await assertFolderAccess(doc.folder, user._id, 'editor');

  if (doc.localEdit?.user && !doc.localEdit.user.equals(user._id)) {
    throw Object.assign(
      new Error(`This file is being edited locally by ${doc.localEdit.userName || 'another user'}`),
      { status: 423 },
    );
  }

  doc.localEdit = {
    user: user._id,
    userName: user.name,
    startedAt: new Date(),
  };
  await doc.save();

  await logEvent({
    user,
    action: 'opened',
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    folderId: doc.folder,
    metadata: { mode: 'local-edit' },
    req,
  });

  return doc;
}

async function endLocalEdit({ docId, user }) {
  const doc = await Document.findById(docId);
  if (!doc || doc.isDeleted) throw Object.assign(new Error('Document not found'), { status: 404 });
  if (doc.localEdit?.user && !doc.localEdit.user.equals(user._id)) {
    throw Object.assign(new Error('Only the editor who checked out this file can end the session'), { status: 403 });
  }
  await Document.updateOne({ _id: docId }, { $unset: { localEdit: 1 } });
  return Document.findById(docId);
}

async function softDeleteDocument({ docId, user, req }) {
  const doc = await Document.findById(docId);
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 });

  await assertFolderAccess(doc.folder, user._id, 'editor');

  doc.isDeleted = true;
  doc.deletedAt = new Date();
  await doc.save();

  await logEvent({ user, action: 'deleted', resourceType: 'document',
    resourceId: doc._id, resourceName: doc.name, folderId: doc.folder, req });

  return doc;
}

async function listDocuments(folderId, userId) {
  await assertFolderAccess(folderId, userId, 'viewer');
  return Document.find({ folder: folderId, isDeleted: false })
    .sort({ updatedAt: -1 })
    .lean();
}

async function listDeletedDocuments(userId) {
  const { listAccessibleFolders } = require('../folders/folder-access');
  const folders = await listAccessibleFolders(userId);
  const folderIds = folders.map(f => f._id);
  return Document.find({ folder: { $in: folderIds }, isDeleted: true })
    .sort({ deletedAt: -1 })
    .lean();
}

async function restoreDocument({ docId, user, req }) {
  const doc = await Document.findById(docId);
  if (!doc || !doc.isDeleted) throw Object.assign(new Error('Document not found'), { status: 404 });

  await assertFolderAccess(doc.folder, user._id, 'editor');

  doc.isDeleted = false;
  doc.deletedAt = undefined;
  await doc.save();

  await logEvent({ user, action: 'restored', resourceType: 'document',
    resourceId: doc._id, resourceName: doc.name, folderId: doc.folder, req });

  return doc;
}

async function getVersions(docId) {
  return Version.find({ document: docId }).sort({ versionNum: -1 }).lean();
}

async function downloadDocument({ docId, user, req }) {
  const doc = await Document.findById(docId).select('name folder storageKey mimeType isDeleted').lean();
  if (!doc || doc.isDeleted) throw Object.assign(new Error('Document not found'), { status: 404 });

  // OnlyOffice already proved access when the editor config was issued
  if (req?.authPurpose !== 'oo-file') {
    await assertFolderAccess(doc.folder, user._id);
  }

  if (!doc.storageKey || !localFileExists(doc.storageKey)) {
    throw Object.assign(
      new Error('File not found on server. It may have been deleted — try uploading again.'),
      { status: 404 }
    );
  }

  const { streamFromCache } = require('../../utils/file-cache');
  let stream = streamFromCache(doc.storageKey);
  if (!stream) {
    stream = await getFileStream(doc.storageKey);
  }

  // Only log explicit user-initiated downloads (attachment) to avoid spamming
  // "downloaded" when editors/viewers (e.g. OnlyOffice) fetch the file to render.
  if (String(req?.query?.download || '') === '1') {
    await logEvent({
      user,
      action: 'downloaded',
      resourceType: 'document',
      resourceId: doc._id,
      resourceName: doc.name,
      folderId: doc.folder,
      req,
    });
  }

  return { stream, doc };
}

async function renameDocument({ docId, name, user, req }) {
  const nextName = String(name || '').trim();
  if (!nextName) throw Object.assign(new Error('Name is required'), { status: 400 });

  const doc = await Document.findById(docId);
  if (!doc || doc.isDeleted) throw Object.assign(new Error('Document not found'), { status: 404 });

  await assertFolderAccess(doc.folder, user._id);

  const prevName = doc.name;
  doc.name = nextName;
  await doc.save();

  await logEvent({
    user,
    action: 'renamed',
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    folderId: doc.folder,
    metadata: { from: prevName, to: nextName },
    req,
  });

  return doc.toObject();
}

module.exports = {
  uploadDocument, updateDocument, updateDocumentFromBuffer,
  beginLocalEdit, endLocalEdit,
  softDeleteDocument,
  listDocuments, listDeletedDocuments, restoreDocument, getVersions,
  downloadDocument,
  renameDocument,
};
