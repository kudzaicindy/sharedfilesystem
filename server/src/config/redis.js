const { createClient } = require('redis');

let client;

function createMemoryClient() {
  const stores = new Map();

  return {
    async connect() {},
    on() {},
    async hSet(key, field, value) {
      if (!stores.has(key)) stores.set(key, new Map());
      stores.get(key).set(field, value);
    },
    async hGetAll(key) {
      const hash = stores.get(key);
      if (!hash) return {};
      return Object.fromEntries(hash);
    },
    async hDel(key, field) {
      stores.get(key)?.delete(field);
    },
  };
}

async function connectRedis() {
  if (process.env.REDIS_URL === 'memory') {
    client = createMemoryClient();
    console.log('⚠️  Using in-memory store (REDIS_URL=memory)');
    return;
  }

  const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: false,
    },
  });

  try {
    await redisClient.connect();
    redisClient.on('error', err => console.error('Redis error:', err));
    client = redisClient;
    console.log('✅ Redis connected');
  } catch {
    try {
      redisClient.removeAllListeners();
      await redisClient.disconnect();
    } catch {
      // ignore cleanup errors
    }
    client = createMemoryClient();
    console.log('⚠️  Redis unavailable — using in-memory store (fine for local dev)');
    console.log('   To use Redis: install Memurai or run redis-server, then restart');
  }
}

function getRedis() {
  if (!client) throw new Error('Redis not connected');
  return client;
}

module.exports = { connectRedis, getRedis };
