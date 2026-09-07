const AuditLog = require('../../models/AuditLog');
const Folder = require('../../models/Folder');

async function logEvent({ user, action, resourceType, resourceId, resourceName, folderId, versionId, metadata, req, timestamp }) {
  // Some clients (especially document editors/viewers) may request the same file
  // multiple times in quick succession. De-dupe noisy "downloaded" events.
  const dedupeActions = ['downloaded', 'opened'];
  if (dedupeActions.includes(action)) {
    const windowMs = action === 'opened' ? 60_000 : 15_000;
    const last = await AuditLog.findOne({
      userId: user._id,
      action,
      resourceId,
    }).sort({ timestamp: -1 }).select('timestamp');

    if (last?.timestamp) {
      const deltaMs = Date.now() - new Date(last.timestamp).getTime();
      if (deltaMs >= 0 && deltaMs < windowMs) return;
    }
  }

  await AuditLog.create({
    userId:       user._id,
    userName:     user.name,
    userEmail:    user.email,
    action,
    resourceType,
    resourceId,
    resourceName,
    folderId,
    versionId,
    metadata,
    ipAddress:    req?.ip || req?.headers?.['x-forwarded-for'],
    timestamp:    timestamp ? new Date(timestamp) : new Date(),
  });
}

async function getResourceAudit(resourceId, { limit = 50, skip = 0 } = {}) {
  return AuditLog.find({ resourceId })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

async function getUserActivity(userId, { limit = 50, skip = 0 } = {}) {
  return AuditLog.find({ userId })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

async function getActivityFeed(userId, { limit = 50, skip = 0 } = {}) {
  const folders = await Folder.find({
    $or: [{ owner: userId }, { 'members.user': userId }],
  }).select('_id');
  const folderIds = folders.map(f => f._id);

  if (!folderIds.length) return [];

  return AuditLog.find({ folderId: { $in: folderIds } })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

async function getFolderAudit(folderId, { limit = 100, skip = 0 } = {}) {
  return AuditLog.find({ folderId })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

module.exports = { logEvent, getResourceAudit, getUserActivity, getActivityFeed, getFolderAudit };
