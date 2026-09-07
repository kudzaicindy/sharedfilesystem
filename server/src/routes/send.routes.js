const router = require('express').Router();
const { authenticate } = require('../middleware/authenticate');
const {
  sendDocument,
  listSentByUser,
  getSendById,
  trackOpen,
} = require('../services/send/send.service');

router.use(authenticate);

router.get('/sent', async (req, res, next) => {
  try {
    const sends = await listSentByUser(req.user._id);
    res.json(sends);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const send = await sendDocument({ ...req.body, user: req.user, req });
    res.status(201).json(send);
  } catch (err) { next(err); }
});

router.post('/track/open', async (req, res, next) => {
  try {
    await trackOpen({ documentId: req.body.documentId, user: req.user, req });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:sendId', async (req, res, next) => {
  try {
    const send = await getSendById(req.params.sendId, req.user._id);
    res.json(send);
  } catch (err) { next(err); }
});

module.exports = router;
