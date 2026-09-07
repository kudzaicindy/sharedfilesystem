const Folder = require('../models/Folder');

// Checks that req.user has at least `minRole` on the folder
const ROLE_RANK = { viewer: 0, editor: 1, owner: 2 };

async function authorizeFolder(minRole) {
  return async (req, res, next) => {
    const folderId = req.params.folderId || req.body.folderId;
    const folder = await Folder.findById(folderId);
    if (!folder) return res.status(404).json({ message: 'Folder not found' });

    const isOwner = folder.owner.equals(req.user._id);
    if (isOwner) return next();

    const member = folder.members.find(m => m.user.equals(req.user._id));
    if (!member || ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    req.folder = folder;
    next();
  };
}

module.exports = { authorizeFolder };
