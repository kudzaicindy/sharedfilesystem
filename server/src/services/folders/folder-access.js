const Folder = require('../../models/Folder');

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 };

function roleAtLeast(role, minimum) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minimum] || 0);
}

/**
 * Effective role for a folder: explicit membership on this folder,
 * otherwise inherited from the nearest ancestor (Drive-style cascade).
 */
async function getEffectiveFolderRole(folderId, userId) {
  if (!folderId || !userId) return null;

  let currentId = folderId;
  const seen = new Set();

  while (currentId) {
    const key = String(currentId);
    if (seen.has(key)) break;
    seen.add(key);

    const folder = await Folder.findById(currentId).lean();
    if (!folder || folder.isDeleted) return null;

    if (folder.owner && String(folder.owner) === String(userId)) {
      return 'owner';
    }

    const member = (folder.members || []).find(
      m => String(m.user) === String(userId),
    );
    if (member?.role) return member.role;

    currentId = folder.parent || null;
  }

  return null;
}

async function assertFolderRole(folderId, userId, minimumRole = 'viewer') {
  const folder = await Folder.findById(folderId);
  if (!folder || folder.isDeleted) {
    throw Object.assign(new Error('Folder not found'), { status: 404 });
  }

  const role = await getEffectiveFolderRole(folderId, userId);
  if (!role || !roleAtLeast(role, minimumRole)) {
    throw Object.assign(new Error('Insufficient permissions'), { status: 403 });
  }

  return { folder, role };
}

/** Direct access seeds + all descendant folders (inherited visibility). */
async function listAccessibleFolders(userId) {
  const direct = await Folder.find({
    isDeleted: { $ne: true },
    $or: [{ owner: userId }, { 'members.user': userId }],
  }).lean();

  const byId = new Map(direct.map(f => [String(f._id), f]));
  let frontier = direct.map(f => f._id);

  while (frontier.length) {
    const children = await Folder.find({
      parent: { $in: frontier },
      isDeleted: { $ne: true },
    }).lean();
    frontier = [];
    for (const child of children) {
      const id = String(child._id);
      if (!byId.has(id)) {
        byId.set(id, child);
        frontier.push(child._id);
      }
    }
  }

  return [...byId.values()];
}

async function collectDescendantFolderIds(rootId) {
  const ids = [];
  let frontier = [rootId];
  while (frontier.length) {
    const children = await Folder.find({
      parent: { $in: frontier },
      isDeleted: { $ne: true },
    }).select('_id').lean();
    frontier = children.map(c => c._id);
    ids.push(...frontier);
  }
  return ids;
}

async function wouldCreateCycle(folderId, newParentId) {
  if (!newParentId) return false;
  if (String(folderId) === String(newParentId)) return true;
  let currentId = newParentId;
  const seen = new Set();
  while (currentId) {
    const key = String(currentId);
    if (key === String(folderId)) return true;
    if (seen.has(key)) break;
    seen.add(key);
    const f = await Folder.findById(currentId).select('parent').lean();
    if (!f) break;
    currentId = f.parent;
  }
  return false;
}

module.exports = {
  ROLE_RANK,
  roleAtLeast,
  getEffectiveFolderRole,
  assertFolderRole,
  listAccessibleFolders,
  collectDescendantFolderIds,
  wouldCreateCycle,
};
