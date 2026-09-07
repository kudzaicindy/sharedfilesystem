const nodemailer = require('nodemailer');

let transporterPromise = null;

function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_USER
    && process.env.SMTP_PASS,
  );
}

async function getTransporter() {
  if (!isEmailConfigured()) {
    throw Object.assign(
      new Error('Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env'),
      { status: 503, code: 'EMAIL_NOT_CONFIGURED' },
    );
  }

  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || 'false') === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      }),
    );
  }
  return transporterPromise;
}

function fromAddress() {
  return process.env.SMTP_FROM
    || process.env.EMAIL_FROM
    || `"Alamait" <${process.env.SMTP_USER}>`;
}

async function sendMail({ to, subject, text, html }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
  });
  return info;
}

async function sendFolderInviteEmail({
  to,
  inviterName,
  folderName,
  role,
  inviteUrl,
}) {
  const subject = `${inviterName} invited you to “${folderName}” on Alamait`;
  const text = [
    `${inviterName} invited you to the folder “${folderName}” as ${role}.`,
    '',
    `Open this link to accept:`,
    inviteUrl,
    '',
    'If you don’t have an Alamait account yet, you can create one from that page.',
  ].join('\n');

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
      <h2 style="margin:0 0 12px;color:#0b1f3a">You’re invited to Alamait</h2>
      <p style="margin:0 0 16px;line-height:1.5">
        <strong>${escapeHtml(inviterName)}</strong> invited you to the folder
        <strong>${escapeHtml(folderName)}</strong> as <strong>${escapeHtml(role)}</strong>.
      </p>
      <p style="margin:0 0 20px">
        <a href="${inviteUrl}"
           style="display:inline-block;background:#0b1f3a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
          Accept invite
        </a>
      </p>
      <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5">
        Or paste this link into your browser:<br/>
        <a href="${inviteUrl}" style="color:#7a1f2b;word-break:break-all">${inviteUrl}</a>
      </p>
    </div>
  `;

  return sendMail({ to, subject, text, html });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  isEmailConfigured,
  sendMail,
  sendFolderInviteEmail,
};
