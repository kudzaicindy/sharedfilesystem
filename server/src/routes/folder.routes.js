const router = require('express').Router();
const { authenticate } = require('../middleware/authenticate');
const {
  createFolder,
  shareFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  getFolderTree,
  getSharedFolders,
  getFoldersSharedByMe,
  getInviteByToken,
  acceptInviteByToken,
} = require('../services/folders/folder.service');

// Public invite preview (no auth)
router.get('/invites/:token', async (req, res, next) => {
  try {
    const invite = await getInviteByToken(req.params.token);
    res.json(invite);
  } catch (err) { next(err); }
});

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const folders = await getFolderTree(req.user._id);
    res.json(folders);
  } catch (err) { next(err); }
});

router.get('/shared', async (req, res, next) => {
  try {
    const folders = await getSharedFolders(req.user._id);
    res.json(folders);
  } catch (err) { next(err); }
});

router.get('/shared-by-me', async (req, res, next) => {
  try {
    const folders = await getFoldersSharedByMe(req.user._id);
    res.json(folders);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const folder = await createFolder({
      name: req.body.name,
      parentId: req.body.parentId || req.body.parent || null,
      description: req.body.description,
      user: req.user,
      req,
    });
    res.status(201).json(folder);
  } catch (err) { next(err); }
});

router.patch('/:folderId', async (req, res, next) => {
  try {
    const folder = await renameFolder({
      folderId: req.params.folderId,
      name: req.body.name,
      user: req.user,
      req,
    });
    res.json(folder);
  } catch (err) { next(err); }
});

router.post('/:folderId/move', async (req, res, next) => {
  try {
    const folder = await moveFolder({
      folderId: req.params.folderId,
      parentId: req.body.parentId ?? null,
      user: req.user,
      req,
    });
    res.json(folder);
  } catch (err) { next(err); }
});

router.post('/:folderId/share', async (req, res, next) => {
  try {
    const result = await shareFolder({
      folderId: req.params.folderId,
      ...req.body,
      user: req.user,
      req,
    });
    res.json({
      ...(result.folder?.toObject ? result.folder.toObject() : result.folder),
      inviteStatus: result.inviteStatus,
      inviteUrl: result.inviteUrl,
      emailSent: result.emailSent,
      emailError: result.emailError || null,
      message: result.message,
    });
  } catch (err) { next(err); }
});

router.post('/invites/:token/accept', async (req, res, next) => {
  try {
    const result = await acceptInviteByToken({
      token: req.params.token,
      user: req.user,
      req,
    });
    res.json({
      folder: result.folder,
      role: result.role,
      message: `You now have ${result.role} access to “${result.folder.name}”.`,
    });
  } catch (err) { next(err); }
});

router.delete('/:folderId', async (req, res, next) => {
  try {
    const result = await deleteFolder({
      folderId: req.params.folderId,
      user: req.user,
      req,
    });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
