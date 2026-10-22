require('dotenv').config();
const fs = require('fs');
const http = require('http');
const app = require('./app');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { initSocket } = require('./services/realtime/socket');
const { getUploadDir, probeS3Access } = require('./utils/storage');

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  await connectRedis();

  const storageType = process.env.STORAGE_TYPE || 'local';
  if (storageType === 'local') {
    fs.mkdirSync(getUploadDir(), { recursive: true });
    console.log(`📁 Storage: local (${getUploadDir()})`);
  } else {
    console.log(`📁 Storage: ${storageType} (bucket ${process.env.S3_BUCKET || '?'})`);
    const s3Probe = await probeS3Access();
    if (!s3Probe.ok) {
      console.error('❌ S3 not usable:', s3Probe.message);
      console.error('   Run: npm run check:s3');
    }
  }

  const server = http.createServer(app);
  initSocket(server);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use by another app.`);
      console.error('   Stop that process, or set PORT=5001 in server/.env and update the client API URL.');
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
