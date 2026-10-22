require('dotenv').config();
const { S3Client, HeadBucketCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

async function test(label, config) {
  const s3 = new S3Client(config);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
    const list = await s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, MaxKeys: 3 }));
    console.log(`${label}: OK (${list.KeyCount ?? 0} objects listed)`);
  } catch (err) {
    console.log(`${label}: FAIL`);
    console.log('  name:', err.name);
    console.log('  code:', err.Code || err.code);
    console.log('  message:', err.message);
    if (err.$metadata) console.log('  httpStatus:', err.$metadata.httpStatusCode);
  }
}

(async () => {
  const creds = {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  };
  const region = process.env.S3_REGION || 'eu-north-1';

  await test('custom-endpoint', { region, endpoint: process.env.S3_ENDPOINT, credentials: creds });
  await test('aws-region-only', { region, credentials: creds });
})();
