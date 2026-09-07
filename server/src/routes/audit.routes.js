const router = require('express').Router();
const { authenticate } = require('../middleware/authenticate');
const { getResourceAudit, getUserActivity, getActivityFeed, getFolderAudit } = require('../services/audit/audit.service');

router.use(authenticate);

// Audit trail for a specific document or folder
router.get('/resource/:resourceId', async (req, res, next) => {
  try {
    const logs = await getResourceAudit(req.params.resourceId, req.query);
    res.json(logs);
  } catch (err) { next(err); }
});

// All activity by the current user
router.get('/me', async (req, res, next) => {
  try {
    const logs = await getUserActivity(req.user._id, req.query);
    res.json(logs);
  } catch (err) { next(err); }
});

// Activity feed: events on folders/docs the user can access (owned or shared)
router.get('/feed', async (req, res, next) => {
  try {
    const logs = await getActivityFeed(req.user._id, req.query);
    res.json(logs);
  } catch (err) { next(err); }
});

// All activity in a folder (across all docs inside it)
router.get('/folder/:folderId', async (req, res, next) => {
  try {
    const logs = await getFolderAudit(req.params.folderId, req.query);
    res.json(logs);
  } catch (err) { next(err); }
});

module.exports = router;
