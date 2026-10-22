require('dotenv').config();
const jwt = require('jsonwebtoken');
const { execSync } = require('child_process');

const docId = process.argv[2] || '6a9eb00df23ce4ccbc9654c1';
const userId = process.argv[3] || '6a6b3331f5946b07eca10189';

const token = jwt.sign(
  { purpose: 'oo-file', docId, userId },
  process.env.JWT_SECRET,
  { expiresIn: '24h' },
);

const localUrl = `http://localhost:5000/api/documents/${docId}/download?token=${encodeURIComponent(token)}`;
const dockerUrl = `http://host.docker.internal:5000/api/documents/${docId}/download?token=${encodeURIComponent(token)}`;

(async () => {
  const r = await fetch(localUrl);
  console.log('Host download:', r.status, r.statusText);
  if (!r.ok) console.log(await r.text());

  try {
    const out = execSync(
      `docker exec alamait-onlyoffice wget -qS -O /dev/null "${dockerUrl}" 2>&1`,
      { encoding: 'utf8' },
    );
    console.log('Docker download:', out.trim() || 'OK');
  } catch (e) {
    console.log('Docker download failed:', e.stdout || e.message);
  }
})();
