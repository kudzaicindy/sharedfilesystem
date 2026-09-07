const crypto = require('crypto');
const DocumentSend = require('../../models/DocumentSend');
const Document = require('../../models/Document');
const Folder = require('../../models/Folder');
const User = require('../../models/User');
const { shareFolder } = require('../folders/folder.service');
const { logEvent } = require('../audit/audit.service');

function clientIp(req) {
  return req?.ip || req?.headers?.['x-forwarded-for'];
}

async function assertCanSend(user, folder) {
  const isOwner = folder.owner.equals(user._id);
  if (isOwner) return;
  const member = folder.members.find(m => m.user.equals(user._id));
  if (!member || member.role === 'viewer') {
    throw Object.assign(new Error('Only folder owners and editors can send files'), { status: 403 });
  }
}

async function sendDocument({ documentId, recipientEmail, role = 'viewer', user, req }) {
  const doc = await Document.findById(documentId);
  if (!doc || doc.isDeleted) throw Object.assign(new Error('Document not found'), { status: 404 });

  const folder = await Folder.findById(doc.folder);
  if (!folder) throw Object.assign(new Error('Folder not found'), { status: 404 });

  await assertCanSend(user, folder);

  const email = recipientEmail.toLowerCase().trim();
  if (email === user.email.toLowerCase()) {
    throw Object.assign(new Error('You cannot send a file to yourself'), { status: 400 });
  }

  const recipient = await User.findOne({ email });

  if (recipient) {
    await shareFolder({
      folderId: folder._id,
      targetUserId: recipient._id,
      role,
      user,
      req,
    });
  }

  const now = new Date();
  const send = await DocumentSend.create({
    document: doc._id,
    documentName: doc.name,
    folder: doc.folder,
    sender: user._id,
    senderName: user.name,
    recipientEmail: email,
    recipient: recipient?._id,
    role,
    token: crypto.randomBytes(16).toString('hex'),
    status: 'sent',
    sentAt: now,
    events: [{
      type: 'sent',
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      timestamp: now,
      ipAddress: clientIp(req),
    }],
  });

  await logEvent({
    user,
    action: 'shared',
    resourceType: 'document',
    resourceId: doc._id,
    resourceName: doc.name,
    folderId: doc.folder,
    metadata: { sendId: send._id, recipientEmail: email, role, tracked: true },
    req,
  });

  return send.toObject();
}

async function listSentByUser(userId) {
  return DocumentSend.find({ sender: userId })
    .sort({ sentAt: -1 })
    .lean();
}

async function getSendById(sendId, userId) {
  const send = await DocumentSend.findById(sendId).lean();
  if (!send) throw Object.assign(new Error('Send record not found'), { status: 404 });
  if (!send.sender.equals(userId)) {
    throw Object.assign(new Error('Not authorized to view this send record'), { status: 403 });
  }
  return send;
}

async function trackOpen({ documentId, user, req }) {
  if (!user) return;

  const sends = await DocumentSend.find({
    document: documentId,
    $or: [
      { recipientEmail: user.email.toLowerCase() },
      { recipient: user._id },
    ],
  });

  const now = new Date();
  const ip = clientIp(req);

  for (const send of sends) {
    if (send.sender.equals(user._id)) continue;

    send.events.push({
      type: 'opened',
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      timestamp: now,
      ipAddress: ip,
    });
    if (!send.firstOpenedAt) send.firstOpenedAt = now;
    send.lastOpenedAt = now;
    if (send.status === 'sent') send.status = 'opened';
    await send.save();
  }

  // Also write to global audit trail (so "open" isn't logged as "download").
  try {
    const doc = await Document.findById(documentId).lean();
    if (doc && !doc.isDeleted) {
      await logEvent({
        user,
        action: 'opened',
        resourceType: 'document',
        resourceId: doc._id,
        resourceName: doc.name,
        folderId: doc.folder,
        metadata: { via: 'send-track' },
        req,
      });
    }
  } catch {
    // don't block tracking if audit fails
  }
}

async function trackEdit({ documentId, user, req }) {
  if (!user) return;

  const sends = await DocumentSend.find({
    document: documentId,
    role: 'editor',
    $or: [
      { recipientEmail: user.email.toLowerCase() },
      { recipient: user._id },
    ],
  });

  const now = new Date();
  const ip = clientIp(req);

  for (const send of sends) {
    if (send.sender.equals(user._id)) continue;

    send.events.push({
      type: 'edited',
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      timestamp: now,
      ipAddress: ip,
    });
    send.status = 'edited';
    send.editedAt = now;
    await send.save();
  }
}

module.exports = {
  sendDocument,
  listSentByUser,
  getSendById,
  trackOpen,
  trackEdit,
};
