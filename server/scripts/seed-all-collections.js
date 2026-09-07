/**
 * Seed every Mongo collection used by the app for one admin user.
 * Usage (from server/): node scripts/seed-all-collections.js
 */
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const Folder = require('../src/models/Folder');
const Document = require('../src/models/Document');
const Version = require('../src/models/Version');
const AuditLog = require('../src/models/AuditLog');
const DocumentSend = require('../src/models/DocumentSend');
const FileRequest = require('../src/models/FileRequest');
const { uploadFile } = require('../src/utils/storage');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'kcpemhiwa@gmail.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'kudzai30';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Kudzai';

async function upsertAdmin() {
  let user = await User.findOne({ email: ADMIN_EMAIL }).select('+password');
  if (!user) {
    user = await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
    });
    console.log('users: created', user._id.toString());
  } else {
    if (user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }
    console.log('users: exists', user._id.toString());
  }
  return user;
}

async function seed(user) {
  const now = new Date();

  // folders
  let folder = await Folder.findOne({ owner: user._id, name: 'My Documents', parent: null });
  if (!folder) {
    folder = await Folder.create({
      name: 'My Documents',
      parent: null,
      owner: user._id,
      members: [{ user: user._id, role: 'owner' }],
      isRoot: true,
      color: '#0f766e',
      description: 'Default workspace',
    });
    console.log('folders: created', folder._id.toString());
  } else {
    console.log('folders: exists', folder._id.toString());
  }

  // documents + versions (real storage object)
  let doc = await Document.findOne({
    folder: folder._id,
    name: 'Welcome.txt',
    isDeleted: false,
  });

  if (!doc) {
    const buffer = Buffer.from(
      `Welcome to Shared Docs\n\nSeeded for ${user.email} at ${now.toISOString()}\n`,
      'utf8',
    );
    const { key } = await uploadFile({
      buffer,
      originalName: 'Welcome.txt',
      mimeType: 'text/plain',
      prefix: `${folder._id}/`,
    });

    doc = await Document.create({
      name: 'Welcome.txt',
      folder: folder._id,
      mimeType: 'text/plain',
      size: buffer.length,
      storageKey: key,
      uploadedBy: { user: user._id, name: user.name, at: now },
      lastModifiedBy: { user: user._id, name: user.name, at: now },
    });

    const version = await Version.create({
      document: doc._id,
      versionNum: 1,
      storageKey: key,
      size: buffer.length,
      createdBy: { user: user._id, name: user.name },
      comment: 'Initial seed',
    });

    doc.currentVersion = version._id;
    await doc.save();
    console.log('documents: created', doc._id.toString());
    console.log('versions: created', version._id.toString());
  } else {
    console.log('documents: exists', doc._id.toString());
    const version = await Version.findOne({ document: doc._id }).sort({ versionNum: -1 });
    console.log('versions: exists', version?._id?.toString() || '(none)');
  }

  const version = await Version.findOne({ document: doc._id }).sort({ versionNum: -1 });

  // auditlogs
  const hasUploadAudit = await AuditLog.findOne({
    userId: user._id,
    action: 'uploaded',
    resourceId: doc._id,
  });
  if (!hasUploadAudit) {
    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      action: 'uploaded',
      resourceType: 'document',
      resourceId: doc._id,
      resourceName: doc.name,
      folderId: folder._id,
      versionId: version?._id,
      metadata: { via: 'seed' },
      timestamp: now,
    });
    console.log('auditlogs: created uploaded');
  } else {
    console.log('auditlogs: uploaded exists');
  }

  const hasFolderAudit = await AuditLog.findOne({
    userId: user._id,
    action: 'uploaded',
    resourceType: 'folder',
    resourceId: folder._id,
  });
  // Use a folder-related action that exists in enum — "shared" or create via renamed-style.
  // Schema has no "created" — log opened on folder isn't valid (document|folder with opened typically docs).
  // Use renamed as a lightweight folder activity seed if missing shared.
  const hasSharedFolder = await AuditLog.findOne({
    userId: user._id,
    action: 'shared',
    resourceId: folder._id,
  });
  if (!hasSharedFolder) {
    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      action: 'shared',
      resourceType: 'folder',
      resourceId: folder._id,
      resourceName: folder.name,
      folderId: folder._id,
      metadata: { via: 'seed', note: 'workspace ready' },
      timestamp: now,
    });
    console.log('auditlogs: created shared (folder)');
  } else {
    console.log('auditlogs: folder shared exists');
  }
  void hasFolderAudit;

  // filerequests
  let fileRequest = await FileRequest.findOne({
    folder: folder._id,
    createdBy: user._id,
    isActive: true,
  });
  if (!fileRequest) {
    fileRequest = await FileRequest.create({
      token: crypto.randomBytes(16).toString('hex'),
      folder: folder._id,
      createdBy: user._id,
      label: 'Seed upload link',
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      maxUploads: 10,
      uploadCount: 0,
    });
    console.log('filerequests: created', fileRequest._id.toString(), 'token=', fileRequest.token);
  } else {
    console.log('filerequests: exists', fileRequest._id.toString());
  }

  // documentsends (to a second address; creates send trail without requiring recipient account)
  const recipientEmail = process.env.SEED_RECIPIENT_EMAIL || 'colleague@example.com';
  let send = await DocumentSend.findOne({
    document: doc._id,
    sender: user._id,
    recipientEmail,
  });
  if (!send) {
    send = await DocumentSend.create({
      document: doc._id,
      documentName: doc.name,
      folder: folder._id,
      sender: user._id,
      senderName: user.name,
      recipientEmail,
      role: 'editor',
      status: 'sent',
      token: crypto.randomBytes(16).toString('hex'),
      events: [{
        type: 'sent',
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        timestamp: now,
      }],
      sentAt: now,
    });

    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      action: 'shared',
      resourceType: 'document',
      resourceId: doc._id,
      resourceName: doc.name,
      folderId: folder._id,
      metadata: { via: 'seed', recipientEmail, sendId: send._id },
      timestamp: now,
    });
    console.log('documentsends: created', send._id.toString());
  } else {
    console.log('documentsends: exists', send._id.toString());
  }

  return {
    userId: user._id.toString(),
    folderId: folder._id.toString(),
    documentId: doc._id.toString(),
    versionId: version?._id?.toString(),
    fileRequestToken: fileRequest.token,
    sendToken: send.token,
  };
}

async function counts() {
  const names = [
    ['users', User],
    ['folders', Folder],
    ['documents', Document],
    ['versions', Version],
    ['auditlogs', AuditLog],
    ['filerequests', FileRequest],
    ['documentsends', DocumentSend],
  ];
  const out = {};
  for (const [name, Model] of names) {
    out[name] = await Model.countDocuments();
  }
  return out;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('DB:', mongoose.connection.name);

  const user = await upsertAdmin();
  const summary = await seed(user);
  const c = await counts();

  console.log('\n--- collection counts ---');
  console.log(c);
  console.log('\n--- seed summary ---');
  console.log(summary);
  console.log('\nLogin:', ADMIN_EMAIL, '/', ADMIN_PASSWORD);

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
