require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const Document = require('../src/models/Document');
const DocumentSend = require('../src/models/DocumentSend');
const AuditLog = require('../src/models/AuditLog');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'kcpemhiwa@gmail.com';
const RECIPIENT = process.env.SEED_RECIPIENT_EMAIL || 'colleague@example.com';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ email: ADMIN_EMAIL });
  if (!user) throw new Error(`User not found: ${ADMIN_EMAIL}`);

  const docs = await Document.find({
    'uploadedBy.user': user._id,
    isDeleted: false,
  }).sort({ createdAt: -1 });

  let created = 0;
  for (const doc of docs) {
    const existing = await DocumentSend.findOne({
      document: doc._id,
      sender: user._id,
      recipientEmail: RECIPIENT,
    });
    if (existing) {
      console.log('skip (already shared):', doc.name);
      continue;
    }

    const now = new Date();
    const send = await DocumentSend.create({
      document: doc._id,
      documentName: doc.name,
      folder: doc.folder,
      sender: user._id,
      senderName: user.name,
      recipientEmail: RECIPIENT,
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
      folderId: doc.folder,
      metadata: { via: 'share-to-db', recipientEmail: RECIPIENT, sendId: send._id },
      timestamp: now,
    });

    created += 1;
    console.log('shared to DB:', doc.name, '→', RECIPIENT, send._id.toString());
  }

  console.log('\nDone. New documentsends:', created);
  console.log('documentsends total:', await DocumentSend.countDocuments());
  console.log('auditlogs total:', await AuditLog.countDocuments());

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
