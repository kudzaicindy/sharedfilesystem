const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { claimPendingInvitesForUser } = require('../folders/folder.service');

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

async function register({ name, email, password }) {
  const existing = await User.findOne({ email });
  if (existing) throw Object.assign(new Error('Email already in use'), { status: 409 });
  const user = await User.create({ name, email, password });
  try {
    await claimPendingInvitesForUser(user);
  } catch {
    // don't block registration if invite claim fails
  }
  return { user, token: signToken(user._id) };
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }
  try {
    await claimPendingInvitesForUser(user);
  } catch {
    // ignore
  }
  return { user, token: signToken(user._id) };
}

module.exports = { register, login };
