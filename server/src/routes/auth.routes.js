const router = require('express').Router();
const { register, login } = require('../services/auth/auth.service');

router.post('/register', async (req, res, next) => {
  try {
    const { user, token } = await register(req.body);
    res.status(201).json({ user, token });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { user, token } = await login(req.body);
    res.json({ user, token });
  } catch (err) { next(err); }
});

module.exports = router;
