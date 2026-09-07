const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Document = require('../../models/Document');
const User = require('../../models/User');
const {
  downloadDocument,
  updateDocumentFromBuffer,
  beginLocalEdit,
  endLocalEdit,
} = require('../documents/document.service');
const { assertFolderRole } = require('../folders/folder-access');

/** Short-lived WebDAV tickets (Office drops ?query= auth on LOCK/PUT). */
const tickets = new Map();
const locks = new Map();
const TICKET_TTL_MS = 8 * 60 * 60 * 1000;

function createWebDavTicket({ userId, docId }) {
  const ticketId = crypto.randomBytes(16).toString('hex');
  tickets.set(ticketId, {
    userId: String(userId),
    docId: String(docId),
    expiresAt: Date.now() + TICKET_TTL_MS,
  });
  return ticketId;
}

function getTicket(ticketId) {
  if (!ticketId) return null;
  const t = tickets.get(ticketId);
  if (!t) return null;
  if (t.expiresAt < Date.now()) {
    tickets.delete(ticketId);
    return null;
  }
  return t;
}

async function assertDocAccess(docId, userId, minimumRole = 'viewer') {
  const doc = await Document.findById(docId);
  if (!doc || doc.isDeleted) throw Object.assign(new Error('Document not found'), { status: 404 });
  await assertFolderRole(doc.folder, userId, minimumRole);
  return doc;
}

function serverBase(req) {
  const env = (process.env.SERVER_PUBLIC_URL || '').replace(/\/$/, '');
  if (env) return env;
  const host = req.get('host') || 'localhost:5000';
  return `${req.protocol || 'http'}://${host}`;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeFilename(name) {
  const raw = String(name || 'document.docx').trim() || 'document.docx';
  return raw.replace(/[/\\?%*:|"<>]/g, '_');
}

function davHeaders(res) {
  res.set({
    DAV: '1,2',
    'MS-Author-Via': 'DAV',
    Allow: 'OPTIONS,GET,HEAD,PUT,DELETE,PROPFIND,PROPPATCH,LOCK,UNLOCK',
    'Accept-Ranges': 'bytes',
    'Public': 'OPTIONS,GET,HEAD,PUT,DELETE,PROPFIND,PROPPATCH,LOCK,UNLOCK',
  });
}

async function resolveUser(req) {
  const ticketId = req.params?.ticket;
  if (ticketId) {
    const ticket = getTicket(ticketId);
    if (!ticket) {
      const err = new Error('Edit session expired. Open the file again from Alamait.');
      err.status = 401;
      throw err;
    }
    if (req.params.docId && String(req.params.docId) !== ticket.docId) {
      const err = new Error('Ticket does not match document');
      err.status = 403;
      throw err;
    }
    const user = await User.findById(ticket.userId);
    if (!user) {
      const err = new Error('User not found');
      err.status = 401;
      throw err;
    }
    return { user, ticketId, docId: ticket.docId };
  }

  let token = null;
  if (typeof req.query?.token === 'string' && req.query.token) token = req.query.token;
  const header = req.headers.authorization || '';
  if (!token && header.startsWith('Bearer ')) token = header.slice(7).trim();
  if (!token && header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      token = idx >= 0 ? (decoded.slice(idx + 1) || decoded.slice(0, idx)) : decoded;
    } catch {
      token = null;
    }
  }
  if (!token) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    const err = new Error('Invalid or expired token');
    err.status = 401;
    throw err;
  }
  const user = await User.findById(decoded.id);
  if (!user) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }
  return { user, ticketId: null, docId: req.params?.docId };
}

function getLock(docId) {
  const lock = locks.get(String(docId));
  if (!lock) return null;
  if (lock.expiresAt && lock.expiresAt < Date.now()) {
    locks.delete(String(docId));
    return null;
  }
  return lock;
}

function setLock(docId, userId) {
  const token = `opaquelocktoken:${docId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const lock = {
    token,
    userId: String(userId),
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  locks.set(String(docId), lock);
  return lock;
}

function filePropXml({ href, displayName, contentLength, contentType, lastModified, lock }) {
  const lm = lastModified ? new Date(lastModified).toUTCString() : new Date().toUTCString();
  const lockXml = lock
    ? `<D:lockdiscovery>
        <D:activelock>
          <D:locktype><D:write/></D:locktype>
          <D:lockscope><D:exclusive/></D:lockscope>
          <D:depth>0</D:depth>
          <D:timeout>Second-3600</D:timeout>
          <D:locktoken><D:href>${escapeXml(lock.token)}</D:href></D:locktoken>
        </D:activelock>
      </D:lockdiscovery>`
    : `<D:lockdiscovery/>`;

  return `<D:response>
    <D:href>${escapeXml(href)}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(displayName)}</D:displayname>
        <D:resourcetype/>
        <D:getcontentlength>${Number(contentLength) || 0}</D:getcontentlength>
        <D:getcontenttype>${escapeXml(contentType || 'application/octet-stream')}</D:getcontenttype>
        <D:getlastmodified>${lm}</D:getlastmodified>
        <D:supportedlock>
          <D:lockentry>
            <D:lockscope><D:exclusive/></D:lockscope>
            <D:locktype><D:write/></D:locktype>
          </D:lockentry>
        </D:supportedlock>
        ${lockXml}
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
}

function collectionPropXml({ href, displayName }) {
  return `<D:response>
    <D:href>${escapeXml(href.endsWith('/') ? href : `${href}/`)}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(displayName)}</D:displayname>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:getlastmodified>${new Date().toUTCString()}</D:getlastmodified>
        <D:supportedlock>
          <D:lockentry>
            <D:lockscope><D:exclusive/></D:lockscope>
            <D:locktype><D:write/></D:locktype>
          </D:lockentry>
        </D:supportedlock>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
}

function wrapMulti(body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${body}
</D:multistatus>`;
}

function lockDiscoveryXml({ href, lock }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>0</D:depth>
      <D:owner><D:href>alamait</D:href></D:owner>
      <D:timeout>Second-3600</D:timeout>
      <D:locktoken><D:href>${escapeXml(lock.token)}</D:href></D:locktoken>
      <D:lockroot><D:href>${escapeXml(href)}</D:href></D:lockroot>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`;
}

function buildFileHandlers() {
  return {
    async options(req, res) {
      davHeaders(res);
      res.sendStatus(200);
    },

    async propfind(req, res) {
      const { user } = await resolveUser(req);
      const docId = req.params.docId;
      const doc = await assertDocAccess(docId, user._id, 'viewer');
      const href = `${serverBase(req)}${req.originalUrl.split('?')[0]}`;
      davHeaders(res);
      res.status(207).type('application/xml; charset=utf-8').send(
        wrapMulti(filePropXml({
          href,
          displayName: doc.name,
          contentLength: doc.size,
          contentType: doc.mimeType,
          lastModified: doc.updatedAt,
          lock: getLock(docId),
        })),
      );
    },

    async get(req, res) {
      const { user } = await resolveUser(req);
      const docId = req.params.docId;
      const { stream, doc } = await downloadDocument({ docId, user, req });
      davHeaders(res);
      res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${safeFilename(doc.name).replace(/"/g, '')}"`,
      );
      if (doc.size) res.setHeader('Content-Length', String(doc.size));
      stream.pipe(res);
    },

    async head(req, res) {
      const { user } = await resolveUser(req);
      const docId = req.params.docId;
      const doc = await assertDocAccess(docId, user._id, 'viewer');
      davHeaders(res);
      res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
      if (doc.size) res.setHeader('Content-Length', String(doc.size));
      res.setHeader('Last-Modified', new Date(doc.updatedAt).toUTCString());
      res.sendStatus(200);
    },

    async put(req, res) {
      const { user } = await resolveUser(req);
      const docId = req.params.docId;
      const doc = await assertDocAccess(docId, user._id, 'editor');

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) {
        res.status(400).type('text/plain').send('Empty body');
        return;
      }

      console.log(`[webdav] PUT ${docId} (${buffer.length} bytes) by ${user.email}`);
      await updateDocumentFromBuffer({
        docId,
        buffer,
        originalName: doc.name,
        mimeType: doc.mimeType || 'application/octet-stream',
        user,
        comment: 'Saved from desktop Word/Excel',
        req,
      });

      await endLocalEdit({ docId, user }).catch(() => {});
      davHeaders(res);
      res.sendStatus(204);
    },

    async lock(req, res) {
      const { user } = await resolveUser(req);
      const docId = req.params.docId;
      await assertDocAccess(docId, user._id, 'editor');

      try {
        for await (const _chunk of req) { /* drain */ }
      } catch { /* ignore */ }

      const existing = getLock(docId);
      if (existing && existing.userId !== String(user._id)) {
        res.status(423).type('application/xml')
          .send('<?xml version="1.0"?><D:error xmlns:D="DAV:"><D:lock-token-submitted/></D:error>');
        return;
      }

      const lock = existing && existing.userId === String(user._id)
        ? existing
        : setLock(docId, user._id);

      console.log(`[webdav] LOCK ${docId} by ${user.email}`);
      await beginLocalEdit({ docId, user, req }).catch(() => {});
      const href = `${serverBase(req)}${req.originalUrl.split('?')[0]}`;
      davHeaders(res);
      res.status(200)
        .set({
          'Lock-Token': `<${lock.token}>`,
          'Content-Type': 'application/xml; charset=utf-8',
        })
        .send(lockDiscoveryXml({ href, lock }));
    },

    async unlock(req, res) {
      const { user } = await resolveUser(req);
      const docId = req.params.docId;
      const supplied = String(req.headers['lock-token'] || '').replace(/[<>]/g, '');
      const existing = getLock(docId);
      if (existing && supplied && existing.token !== supplied && existing.userId !== String(user._id)) {
        return res.sendStatus(403);
      }
      locks.delete(String(docId));
      console.log(`[webdav] UNLOCK ${docId}`);
      await endLocalEdit({ docId, user }).catch(() => {});
      davHeaders(res);
      res.sendStatus(204);
    },

    async proppatch(req, res) {
      // Office sometimes sends PROPPATCH; acknowledge without storing props
      try {
        for await (const _chunk of req) { /* drain */ }
      } catch { /* ignore */ }
      const href = `${serverBase(req)}${req.originalUrl.split('?')[0]}`;
      davHeaders(res);
      res.status(207).type('application/xml; charset=utf-8').send(wrapMulti(`
        <D:response>
          <D:href>${escapeXml(href)}</D:href>
          <D:propstat>
            <D:prop/>
            <D:status>HTTP/1.1 200 OK</D:status>
          </D:propstat>
        </D:response>`));
    },
  };
}

/** Parent folders — Word HEADs these; 405 made it open read-only / save to PC. */
function buildDocFolderHandlers() {
  return {
    async options(req, res) {
      davHeaders(res);
      res.sendStatus(200);
    },

    async head(req, res) {
      await resolveUser(req);
      davHeaders(res);
      res.sendStatus(200);
    },

    async get(req, res) {
      await resolveUser(req);
      davHeaders(res);
      res.status(200).type('text/plain').send('Alamait WebDAV folder');
    },

    async propfind(req, res) {
      const { user, docId } = await resolveUser(req);
      const id = req.params.docId || docId;
      const doc = await assertDocAccess(id, user._id, 'viewer');
      const base = serverBase(req);
      const folderHref = `${base}/webdav/t/${req.params.ticket}/d/${id}/`;
      const fileHref = `${folderHref}${encodeURIComponent(safeFilename(doc.name))}`;
      const depth = String(req.headers.depth || '1');

      let body = collectionPropXml({ href: folderHref, displayName: id });
      if (depth !== '0') {
        body += filePropXml({
          href: fileHref,
          displayName: doc.name,
          contentLength: doc.size,
          contentType: doc.mimeType,
          lastModified: doc.updatedAt,
          lock: getLock(id),
        });
      }

      davHeaders(res);
      res.status(207).type('application/xml; charset=utf-8').send(wrapMulti(body));
    },
  };
}

function buildTicketRootHandlers() {
  return {
    async options(req, res) {
      davHeaders(res);
      res.sendStatus(200);
    },
    async head(req, res) {
      await resolveUser(req);
      davHeaders(res);
      res.sendStatus(200);
    },
    async get(req, res) {
      await resolveUser(req);
      davHeaders(res);
      res.status(200).type('text/plain').send('Alamait WebDAV');
    },
    async propfind(req, res) {
      const { docId } = await resolveUser(req);
      const base = serverBase(req);
      const rootHref = `${base}/webdav/t/${req.params.ticket}/`;
      const folderHref = `${rootHref}d/${docId}/`;
      const depth = String(req.headers.depth || '1');

      let body = collectionPropXml({ href: rootHref, displayName: 'ticket' });
      if (depth !== '0' && docId) {
        body += collectionPropXml({ href: folderHref, displayName: String(docId) });
      }
      davHeaders(res);
      res.status(207).type('application/xml; charset=utf-8').send(wrapMulti(body));
    },
  };
}

module.exports = {
  createWebDavTicket,
  getTicket,
  safeFilename,
  serverBase,
  buildFileHandlers,
  buildDocFolderHandlers,
  buildTicketRootHandlers,
  davHeaders,
};
