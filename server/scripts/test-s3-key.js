require('dotenv').config();
const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const {
  buildS3ClientConfig,
  isAwsQuarantinedKeyError,
  storageAccessDeniedMessage,
} = require('../src/utils/storage');

const testKey =
  process.argv[2] || '6a6b33d0c188c4b4e75576e0/fa55c4a9-5a36-4865-926a-f9290d083f87.xlsx';

const s3 = new S3Client(buildS3ClientConfig());
let failed = false;

function fail(label, err) {
  failed = true;
  console.error(`${label}:`, err.name || 'Error', err.$metadata?.httpStatusCode || '', err.message);
  if (isAwsQuarantinedKeyError(err)) {
    console.error('');
    console.error(storageAccessDeniedMessage(err));
  }
}

(async () => {
  if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID) {
    console.error('Missing S3_BUCKET or S3_ACCESS_KEY_ID in server/.env');
    process.exit(1);
  }

  try {
    const list = await s3.send(
      new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, MaxKeys: 5 }),
    );
    console.log('ListObjects OK:', list.KeyCount ?? 0, 'objects (showing up to 5)');
    list.Contents?.forEach((o) => console.log(' -', o.Key));
  } catch (e) {
    fail('ListObjects FAIL', e);
  }

  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: testKey }),
    );
    console.log('GetObject OK:', testKey, 'size', obj.ContentLength);
  } catch (e) {
    fail('GetObject FAIL', e);
  }

  if (failed) {
    console.error('');
    console.error('Fix S3 in server/.env and Render, then re-run this script until both checks pass.');
    process.exit(1);
  }
  console.log('');
  console.log('S3 credentials OK — OnlyOffice downloads should work for files in this bucket.');
})();
