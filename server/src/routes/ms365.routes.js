const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { authenticate } = require('../middleware/authenticate');
const User = require('../models/User');
const {
  status,
  authUrl,
  linkAccount,
  linkStatus,
  startEditSession,
  pullEdits,
} = require('../services/ms365/ms365.service');

router.get('/status', authenticate, async (req, res, next) => {
  try {
    const link = await linkStatus(req.user);
    res.json({ ...status(), ...link });
  } catch (err) { next(err); }
});

router.get('/connect', authenticate, (req, res, next) => {
  try {
    const state = jwt.sign(
      { id: req.user._id, purpose: 'ms365-link' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' },
    );
    res.json({ url: authUrl(state) });
  } catch (err) { next(err); }
});

router.get('/callback', async (req, res, next) => {
  try {
    const { code, state, error, error_description: errorDescription } = req.query;
    const client = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    if (error) {
      return res.redirect(`${client}/ms365/link?error=${encodeURIComponent(errorDescription || error)}`);
    }
    if (!code || !state) {
      return res.redirect(`${client}/ms365/link?error=${encodeURIComponent('Missing code')}`);
    }
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    if (decoded.purpose !== 'ms365-link') {
      return res.redirect(`${client}/ms365/link?error=${encodeURIComponent('Invalid state')}`);
    }
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.redirect(`${client}/ms365/link?error=${encodeURIComponent('User not found')}`);
    }
    await linkAccount({ user, code });
    return res.redirect(`${client}/ms365/link?ok=1`);
  } catch (err) {
    const client = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    return res.redirect(`${client}/ms365/link?error=${encodeURIComponent(err.message || 'Link failed')}`);
  }
});

router.post('/edit/:docId', authenticate, async (req, res, next) => {
  try {
    const session = await startEditSession({
      docId: req.params.docId,
      user: req.user,
      req,
    });
    res.json(session);
  } catch (err) { next(err); }
});

router.post('/sync/:docId', authenticate, async (req, res, next) => {
  try {
    const result = await pullEdits({
      docId: req.params.docId,
      driveItemId: req.body.driveItemId,
      user: req.user,
      req,
    });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
