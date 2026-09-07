const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const TYPE = process.env.STORAGE_TYPE || 'local';

function assertS3Configured() {
  const missing = [];
  if (!process.env.S3_ENDPOINT) missing.push('S3_ENDPOINT');
  if (!process.env.S3_BUCKET) missing.push('S3_BUCKET');
  if (!process.env.S3_ACCESS_KEY_ID) missing.push('S3_ACCESS_KEY_ID');
  if (!process.env.S3_SECRET_ACCESS_KEY) missing.push('S3_SECRET_ACCESS_KEY');
  if (missing.length) {
    throw Object.assign(
      new Error(`Storage misconfigured: set ${missing.join(', ')} (STORAGE_TYPE=${TYPE})`),
      { status: 500 }
    );
  }
}

const s3 = TYPE !== 'local' ? new S3Client({
  region:   process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
}) : null;

function getUploadDir() {
  const dir = process.env.LOCAL_UPLOAD_DIR || './uploads';
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

function resolveLocalPath(key) {
  const uploadDir = path.resolve(getUploadDir());
  const normalizedKey = key.replace(/\\/g, '/');
  const filePath = path.resolve(uploadDir, normalizedKey);
  if (filePath !== uploadDir && !filePath.startsWith(uploadDir + path.sep)) {
    throw Object.assign(new Error('Invalid file path'), { status: 400 });
  }
  return filePath;
}

async function uploadFile({ buffer, originalName, mimeType, prefix = '' }) {
  const ext = path.extname(originalName);
  const safePrefix = prefix.replace(/\\/g, '/');
  const key = `${safePrefix}${uuidv4()}${ext}`.replace(/\\/g, '/');

  if (TYPE === 'local') {
    const filePath = resolveLocalPath(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return { key, url: `/uploads/${key.replace(/\\/g, '/')}` };
  }

  assertS3Configured();
  await s3.send(new PutObjectCommand({
    Bucket:      process.env.S3_BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimeType,
  }));

  const url = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${key}`;
  return { key, url };
}

async function deleteFile(key) {
  if (TYPE === 'local') {
    const filePath = resolveLocalPath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  assertS3Configured();
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
}

function getLocalReadStream(key) {
  const filePath = resolveLocalPath(key);
  if (!fs.existsSync(filePath)) {
    throw Object.assign(new Error('File not found on disk'), { status: 404 });
  }
  return fs.createReadStream(filePath);
}

async function getFileStream(key) {
  if (TYPE === 'local') {
    return getLocalReadStream(key);
  }

  assertS3Configured();
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
    }));
    return response.Body;
  } catch (err) {
    const code = err?.name || err?.Code || err?.code;
    if (code === 'NoSuchKey' || code === 'NotFound') {
      return getLocalReadStream(key);
    }
    throw err;
  }
}

/** Direct S3 URL for OnlyOffice (skips Node proxy). Null for local storage. */
async function getPresignedDownloadUrl(key, expiresInSeconds = 3600) {
  if (TYPE === 'local' || !key) return null;
  assertS3Configured();
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

function localFileExists(key) {
  if (TYPE !== 'local') return true;
  return fs.existsSync(resolveLocalPath(key));
}

module.exports = {
  uploadFile,
  deleteFile,
  getFileStream,
  getPresignedDownloadUrl,
  localFileExists,
  getUploadDir,
};
