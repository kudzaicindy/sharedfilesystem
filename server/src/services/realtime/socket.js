const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { getAllowedOrigins } = require('../../config/cors');
const { getRedis } = require('../../config/redis');
const { YSocketIO } = require('y-socket.io/dist/server');

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: getAllowedOrigins(), credentials: true },
  });

  // Yjs collab (no-auth prototype): handled on namespaces like "/yjs|<room>"
  const ysocketio = new YSocketIO(io, {
    gcEnabled: true,
    // levelPersistenceDir: './.yjs-leveldb', // enable later if you want server-side persistence
  });
  ysocketio.initialize();

  // Auth middleware for sockets
  io.use((socket, next) => {
    // Allow unauthenticated Yjs collaboration namespaces (e.g. /yjs|my-doc-id)
    if (socket?.nsp?.name?.startsWith('/yjs|')) return next();

    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = String(socket.user.id);
    const userName = socket.user.name || 'User';
    socket.data.docRooms = socket.data.docRooms || new Set();

    async function broadcastPresence(docId) {
      const redis = getRedis();
      const raw = await redis.hGetAll(`presence:${docId}`);
      const users = Object.values(raw).map(v => JSON.parse(v));
      io.to(`doc:${docId}`).emit('presence:update', users);
    }

    socket.on('join:document', async (payload) => {
      const docId = typeof payload === 'string' ? payload : payload?.docId;
      if (!docId) return;
      const displayName = (typeof payload === 'object' && payload?.name) || userName;
      socket.data.docRooms.add(String(docId));
      socket.join(`doc:${docId}`);
      const redis = getRedis();
      await redis.hSet(
        `presence:${docId}`,
        userId,
        JSON.stringify({ userId, name: displayName, joinedAt: Date.now() }),
      );
      await broadcastPresence(docId);
    });

    socket.on('leave:document', async (payload) => {
      const docId = typeof payload === 'string' ? payload : payload?.docId;
      if (!docId) return;
      socket.data.docRooms.delete(String(docId));
      socket.leave(`doc:${docId}`);
      const redis = getRedis();
      await redis.hDel(`presence:${docId}`, userId);
      await broadcastPresence(docId);
    });

    socket.on('disconnect', async () => {
      const redis = getRedis();
      for (const docId of socket.data.docRooms) {
        await redis.hDel(`presence:${docId}`, userId);
        await broadcastPresence(docId);
      }
      socket.data.docRooms.clear();
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket not initialized');
  return io;
}

module.exports = { initSocket, getIO };
