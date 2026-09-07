const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { extractFileTokenFromOnlyOfficeJwt } = require('../utils/onlyoffice-tokens');

const userCache = new Map(); // id -> { user, at }
const USER_TTL_MS = 60_000;

async function getCachedUser(userId) {
  const id = String(userId);
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.user;
  const user = await User.findById(id).select('name email role').lean();
  if (!user) return null;
  // Keep a lean object that still looks like a mongoose user for callers
  const shaped = { ...user, _id: user._id };
  userCache.set(id, { user: shaped, at: Date.now() });
  return shaped;
}

async function userFromDecoded(decoded, req) {
  if (decoded.purpose === 'oo-file') {
    if (req.params?.docId && String(decoded.docId) !== String(req.params.docId)) {
      throw new Error('Token does not match document');
    }
    const user = await getCachedUser(decoded.userId);
    if (!user) throw new Error('User not found');
    req.authPurpose = 'oo-file';
    return user;
  }

  const user = await User.findById(decoded.id);
  if (!user) throw new Error('User not found');
  req.authPurpose = 'session';
  return user;
}

function collectCandidateTokens(req) {
  const candidates = [];
  const add = (t) => {
    if (typeof t === 'string' && t.length > 0 && !candidates.includes(t)) {
      candidates.push(t);
    }
  };

  add(req.query.token);

  const header = req.headers.authorization || req.headers.Authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const bearer = header.slice('Bearer '.length).trim();
    add(bearer);
    add(extractFileTokenFromOnlyOfficeJwt(bearer));
  }

  return candidates;
}

async function authenticate(req, res, next) {
  const candidates = collectCandidateTokens(req);
  if (!candidates.length) {
    return res.status(401).json({ message: 'No token provided' });
  }

  let lastError = null;
  for (const token of candidates) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await userFromDecoded(decoded, req);
      return next();
    } catch (err) {
      lastError = err;
    }
  }

  const message =
    lastError?.message === 'Token does not match document'
      ? lastError.message
      : 'Invalid or expired token';
  return res.status(401).json({ message });
}

module.exports = { authenticate };
