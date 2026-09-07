const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in server/.env');
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 12_000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host} / db=${conn.connection.name}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed.');
    const tlsHint = /certificate|CERT|SSL|TLS/i.test(String(err.message || err.cause || ''));
    if (tlsHint || process.versions.node?.startsWith('24')) {
      console.error('   Node TLS tip: start with  node --use-system-ca  (already set in npm scripts).');
    }
    console.error('   Also check Atlas Network Access if needed: https://www.mongodb.com/docs/atlas/security-whitelist/');
    console.error(`   Details: ${err.message}`);
    throw err;
  }
}

module.exports = { connectDB };
