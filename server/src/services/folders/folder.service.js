const Folder = require('../../models/Folder');
const Document = require('../../models/Document');
const { logEvent } = require('../audit/audit.service');
const {
  assertFolderRole,
  listAccessibleFolders,
  collectDescendantFolderIds,
  wouldCreateCycle,
  roleAtLeast,
} = require('./folder-access');

async function createFolder({ name, parentId = null, user, description, req }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw Object.assign(new Error('Folder name is required'), { status: 400 });

  if (parentId) {
    await assertFolderRole(parentId, user._id, 'editor');
  }

  const folder = await Folder.create({
    name: trimmed,
    parent: parentId || null,
    owner: user._id,
    members: [{ user: user._id, role: 'owner' }],
    description,
  });

  await logEvent({
    user,
    action: 'uploaded',
    resourceType: 'folder',
    resourceId: folder._id,
    resourceName: folder.name,
    folderId: folder._id,
    req,
  });

  return folder;
}

function clientBaseUrl() {
  return (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function buildInviteUrl(token) {
  return `${clientBaseUrl()}/invite/${token}`;
}

function newInviteToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(24).toString('hex');
}

async function shareFolder({ folderId, targetUserId, email, role = 'viewer', user, req }) {
  const User = require('../../models/User');
  const { sendFolderInviteEmail } = require('../email/email.service');
  const { folder } = await assertFolderRole(folderId, user._id, 'owner');

  if (!['viewer', 'editor'].includes(role)) {
    throw Object.assign(new Error('Role must be viewer or editor'), { status: 400 });
  }

  const normalizedEmail = email ? String(email).toLowerCase().trim() : null;

  let targetId = targetUserId;
  let target = null;
  if (!targetId && normalizedEmail) {
    if (normalizedEmail === user.email?.toLowerCase()) {
      throw Object.assign(new Error('You cannot invite yourself'), { status: 400 });
    }
    target = await User.findOne({ email: normalizedEmail });
    if (target) targetId = target._id;
  }

  // Existing user → add as member immediately, email a link to open the folder
  if (targetId) {
    if (String(targetId) === String(user._id)) {
      throw Object.assign(new Error('You cannot invite yourself'), { status: 400 });
    }
    const existing = folder.members.find(m => m.user.equals(targetId));
    if (existing) {
      existing.role = role;
    } else {
      folder.members.push({ user: targetId, role });
    }

    const inviteEmail = (normalizedEmail || target?.email || '').toLowerCase();
    if (inviteEmail) {
      folder.pendingInvites = (folder.pendingInvites || []).filter((p) => p.email !== inviteEmail);
    }
    await folder.save();

    const openUrl = `${clientBaseUrl()}/files`;
    let emailSent = false;
    let emailError = null;
    if (inviteEmail) {
      try {
        await sendFolderInviteEmail({
          to: inviteEmail,
          inviterName: user.name || user.email,
          folderName: folder.name,
          role,
          inviteUrl: openUrl,
        });
        emailSent = true;
      } catch (err) {
        emailError = err.message || 'Failed to send invite email';
        console.error('Invite email failed:', emailError);
      }
    }

    await logEvent({
      user,
      action: 'shared',
      resourceType: 'folder',
      resourceId: folder._id,
      resourceName: folder.name,
      folderId: folder._id,
      metadata: {
        sharedWith: targetId,
        role,
        email: inviteEmail || null,
        status: 'accepted',
        emailSent,
        emailError,
        inheritsToChildren: true,
      },
      req,
    });

    return {
      folder,
      inviteStatus: 'accepted',
      inviteUrl: openUrl,
      emailSent,
      emailError,
      message: emailSent
        ? `Invite email sent to ${inviteEmail}. They already have ${role} access.`
        : emailError
          ? `Access granted, but email could not be sent (${emailError}).`
          : `${target?.name || inviteEmail || 'User'} now has ${role} access.`,
    };
  }

  // No account yet → pending invite by email + send invite link
  if (!normalizedEmail) {
    throw Object.assign(new Error('Email is required to invite someone new'), { status: 400 });
  }

  folder.pendingInvites = folder.pendingInvites || [];
  const inviteToken = newInviteToken();
  const existingPending = folder.pendingInvites.find((p) => p.email === normalizedEmail);
  if (existingPending) {
    existingPending.role = role;
    existingPending.token = inviteToken;
    existingPending.invitedBy = user._id;
    existingPending.invitedAt = new Date();
    existingPending.emailSentAt = undefined;
  } else {
    folder.pendingInvites.push({
      email: normalizedEmail,
      role,
      token: inviteToken,
      invitedBy: user._id,
      invitedAt: new Date(),
    });
  }

  const inviteUrl = buildInviteUrl(inviteToken);
  await folder.save();

  let emailSent = false;
  let emailError = null;
  try {
    await sendFolderInviteEmail({
      to: normalizedEmail,
      inviterName: user.name || user.email,
      folderName: folder.name,
      role,
      inviteUrl,
    });
    const pending = folder.pendingInvites.find((p) => p.token === inviteToken);
    if (pending) pending.emailSentAt = new Date();
    await folder.save();
    emailSent = true;
  } catch (err) {
    emailError = err.message || 'Failed to send invite email';
    console.error('Invite email failed:', emailError);
  }

  await logEvent({
    user,
    action: 'shared',
    resourceType: 'folder',
    resourceId: folder._id,
    resourceName: folder.name,
    folderId: folder._id,
    metadata: {
      role,
      email: normalizedEmail,
      status: 'pending',
      emailSent,
      emailError,
      inheritsToChildren: true,
    },
    req,
  });

  return {
    folder,
    inviteStatus: 'pending',
    inviteUrl,
    emailSent,
    emailError,
    message: emailSent
      ? `Invite email sent to ${normalizedEmail}.`
      : `Invite saved, but email could not be sent (${emailError}). Share this link: ${inviteUrl}`,
  };
}

/** When a user registers/logs in, convert pending folder invites into memberships. */
async function claimPendingInvitesForUser(userDoc) {
  if (!userDoc?.email || !userDoc?._id) return 0;
  const email = String(userDoc.email).toLowerCase().trim();
  const folders = await Folder.find({
    isDeleted: { $ne: true },
    'pendingInvites.email': email,
  });

  let claimed = 0;
  for (const folder of folders) {
    const pending = (folder.pendingInvites || []).filter((p) => p.email === email);
    if (!pending.length) continue;

    const role = pending.reduce((best, p) => {
      if (p.role === 'editor') return 'editor';
      return best || p.role || 'viewer';
    }, null) || 'viewer';

    const already = folder.members.find((m) => m.user.equals(userDoc._id));
    if (already) {
      if (role === 'editor' && already.role === 'viewer') already.role = 'editor';
    } else {
      folder.members.push({ user: userDoc._id, role });
    }

    folder.pendingInvites = (folder.pendingInvites || []).filter((p) => p.email !== email);
    await folder.save();
    claimed += 1;
  }
  return claimed;
}

async function getInviteByToken(token) {
  if (!token) throw Object.assign(new Error('Invite token required'), { status: 400 });
  const folder = await Folder.findOne({
    isDeleted: { $ne: true },
    'pendingInvites.token': token,
  }).populate('owner', 'name email');

  if (!folder) throw Object.assign(new Error('Invite not found or already used'), { status: 404 });

  const invite = folder.pendingInvites.find((p) => p.token === token);
  if (!invite) throw Object.assign(new Error('Invite not found or already used'), { status: 404 });

  const User = require('../../models/User');
  const inviter = invite.invitedBy
    ? await User.findById(invite.invitedBy).select('name email').lean()
    : null;

  return {
    folderId: folder._id,
    folderName: folder.name,
    email: invite.email,
    role: invite.role,
    invitedAt: invite.invitedAt,
    inviterName: inviter?.name || folder.owner?.name || 'Someone',
    ownerName: folder.owner?.name,
  };
}

async function acceptInviteByToken({ token, user, req }) {
  if (!token) throw Object.assign(new Error('Invite token required'), { status: 400 });
  const folder = await Folder.findOne({
    isDeleted: { $ne: true },
    'pendingInvites.token': token,
  });
  if (!folder) throw Object.assign(new Error('Invite not found or already used'), { status: 404 });

  const invite = folder.pendingInvites.find((p) => p.token === token);
  if (!invite) throw Object.assign(new Error('Invite not found or already used'), { status: 404 });

  const userEmail = String(user.email || '').toLowerCase().trim();
  if (invite.email !== userEmail) {
    throw Object.assign(
      new Error(`This invite was sent to ${invite.email}. Sign in with that email to accept.`),
      { status: 403 },
    );
  }

  const already = folder.members.find((m) => m.user.equals(user._id));
  if (already) {
    if (invite.role === 'editor' && already.role === 'viewer') already.role = 'editor';
  } else {
    folder.members.push({ user: user._id, role: invite.role });
  }

  folder.pendingInvites = folder.pendingInvites.filter((p) => p.token !== token);
  await folder.save();

  await logEvent({
    user,
    action: 'shared',
    resourceType: 'folder',
    resourceId: folder._id,
    resourceName: folder.name,
    folderId: folder._id,
    metadata: { status: 'accepted_via_link', role: invite.role, email: invite.email },
    req,
  });

  return { folder, role: invite.role };
}

async function renameFolder({ folderId, name, user, req }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw Object.assign(new Error('Folder name is required'), { status: 400 });

  const { folder } = await assertFolderRole(folderId, user._id, 'editor');
  const prevName = folder.name;
  folder.name = trimmed;
  await folder.save();

  await logEvent({
    user,
    action: 'renamed',
    resourceType: 'folder',
    resourceId: folder._id,
    resourceName: folder.name,
    folderId: folder._id,
    metadata: { from: prevName, to: trimmed },
    req,
  });

  return folder;
}

async function moveFolder({ folderId, parentId = null, user, req }) {
  const { folder } = await assertFolderRole(folderId, user._id, 'editor');

  const nextParent = parentId || null;
  if (nextParent) {
    await assertFolderRole(nextParent, user._id, 'editor');
    if (await wouldCreateCycle(folderId, nextParent)) {
      throw Object.assign(new Error('Cannot move a folder into itself or its subfolder'), { status: 400 });
    }
  }

  const prevParent = folder.parent;
  folder.parent = nextParent;
  await folder.save();

  await logEvent({
    user,
    action: 'moved',
    resourceType: 'folder',
    resourceId: folder._id,
    resourceName: folder.name,
    folderId: folder._id,
    metadata: {
      fromParent: prevParent,
      toParent: nextParent,
    },
    req,
  });

  return folder;
}

async function deleteFolder({ folderId, user, req }) {
  const { folder } = await assertFolderRole(folderId, user._id, 'owner');

  const descendantIds = await collectDescendantFolderIds(folder._id);
  const allFolderIds = [folder._id, ...descendantIds];
  const now = new Date();

  await Folder.updateMany(
    { _id: { $in: allFolderIds }, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: now } },
  );

  await Document.updateMany(
    { folder: { $in: allFolderIds }, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: now } },
  );

  await logEvent({
    user,
    action: 'deleted',
    resourceType: 'folder',
    resourceId: folder._id,
    resourceName: folder.name,
    folderId: folder._id,
    metadata: {
      descendantFolders: descendantIds.length,
      cascaded: true,
    },
    req,
  });

  return { message: 'Folder moved to trash', folderId: folder._id };
}

async function getFolderTree(userId) {
  return listAccessibleFolders(userId);
}

async function getSharedFolders(userId) {
  return Folder.find({
    isDeleted: { $ne: true },
    'members.user': userId,
    owner: { $ne: userId },
  })
    .populate('owner', 'name email')
    .sort({ updatedAt: -1 })
    .lean();
}

async function getFoldersSharedByMe(userId) {
  return Folder.find({
    isDeleted: { $ne: true },
    owner: userId,
    members: { $elemMatch: { user: { $ne: userId } } },
  })
    .populate('members.user', 'name email')
    .sort({ updatedAt: -1 })
    .lean();
}

module.exports = {
  createFolder,
  shareFolder,
  claimPendingInvitesForUser,
  getInviteByToken,
  acceptInviteByToken,
  renameFolder,
  moveFolder,
  deleteFolder,
  getFolderTree,
  getSharedFolders,
  getFoldersSharedByMe,
  roleAtLeast,
};
