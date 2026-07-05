const nodemailer = require('nodemailer');
const { Notification } = require('../models');

// IMPORTANT: email sending is a no-op mock whenever SMTP_USER is not set in the
// environment. On Render, set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and
// EMAIL_FROM in the service's Environment tab, then redeploy. Without those,
// every "email sent" action in the app will silently do nothing but log to
// the Render console — this is the #1 cause of "email isn't working anywhere".
const emailConfigured = !!process.env.SMTP_USER;

const transporter = emailConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: parseInt(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

// Verify the SMTP connection once at boot so misconfiguration shows up loudly
// in the Render logs immediately, instead of being discovered later per-request.
if (transporter) {
  transporter.verify()
    .then(() => console.log('[Email] SMTP connection verified — email sending is ACTIVE'))
    .catch((e) => console.error('[Email] SMTP verification FAILED — emails will not send:', e.message));
} else {
  console.warn('[Email] SMTP_USER not set — email sending is in MOCK mode (nothing will actually be sent). Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/EMAIL_FROM env vars to enable.');
}

const sendMail = async ({ to, subject, html, attachments = [] }) => {
  if (!to) { console.error(`[Email] Skipped "${subject}" — no recipient address`); return { sent: false, reason: 'no_recipient' }; }
  if (!emailConfigured) {
    console.log(`[Email Mock] To: ${to} | Subject: ${subject}`);
    return { sent: false, reason: 'smtp_not_configured' };
  }
  try {
    await transporter.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to, subject, html, attachments });
    return { sent: true };
  } catch (e) {
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, e.message);
    return { sent: false, reason: e.message };
  }
};

exports.sendRfqEmail = async ({ vendor, rfq, items, uploadLink, isReminder = false }) => {
  const subject = isReminder ? `[Reminder] Quote Request ${rfq.rfq_number}` : `Quote Request: ${rfq.rfq_number}`;
  const itemRows = items.map((i) => `<tr><td>${i.item_name_freetext || i.Item?.name || 'Item'}</td><td>${i.quantity}</td><td>${i.notes || ''}</td></tr>`).join('');
  const html = `
    <h2>${isReminder ? '⏰ Reminder: ' : ''}Quote Requested — ${rfq.rfq_number}</h2>
    <p>Dear ${vendor.contact_person || vendor.name},</p>
    <p>We request a quotation for the following items. Deadline: <strong>${new Date(rfq.deadline).toLocaleDateString('en-IN')}</strong></p>
    <table border="1" cellpadding="6" style="border-collapse:collapse">
      <tr><th>Item</th><th>Qty</th><th>Notes</th></tr>${itemRows}
    </table>
    ${rfq.terms ? `<p><strong>Terms:</strong> ${rfq.terms}</p>` : ''}
    <p><a href="${uploadLink}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:16px">Submit Your Quote</a></p>
    <p style="color:#666;font-size:12px">This link is unique to your company. Do not share it.</p>
  `;
  await sendMail({ to: vendor.email, subject, html });
};

exports.sendPoEmail = async ({ vendor, po, pdfPath }) => {
  const html = `
    <h2>Purchase Order: ${po.po_number}</h2>
    <p>Dear ${vendor.contact_person || vendor.name},</p>
    <p>Please find the Purchase Order attached. Kindly confirm receipt and expected delivery date.</p>
    <p><strong>Total Amount:</strong> ₹${po.total_amount}</p>
    <p><strong>Expected Delivery:</strong> ${po.expected_delivery_date || 'As discussed'}</p>
  `;
  await sendMail({
    to: vendor.email, subject: `Purchase Order ${po.po_number}`, html,
    attachments: pdfPath ? [{ filename: `PO-${po.po_number}.pdf`, path: pdfPath }] : [],
  });
};

// ADD this function to notificationService.js:
exports.sendVendorInviteEmail = async ({ vendor, tempPassword, portalUrl }) => {
  return sendMail({
    to: vendor.email,
    subject: 'You have been added as a vendor on ProcureAI',
    html: `
      <h2>Welcome to ProcureAI Vendor Portal</h2>
      <p>Dear ${vendor.contact_person || vendor.name},</p>
      <p>You have been added as a vendor. You can now log in to manage your profile and product catalog.</p>
      <p><strong>Login URL:</strong> <a href="${portalUrl}">${portalUrl}</a></p>
      <p><strong>Email:</strong> ${vendor.email}</p>
      <p><strong>Temporary Password:</strong> <code>${tempPassword}</code></p>
      <p>Please log in and change your password on first use.</p>
      <p style="color:#666;font-size:12px">This invite was sent by your buyer. Do not share your credentials.</p>
    `,
  });
};


// Sent when a new user account is created, so they actually receive their
// login credentials instead of the password only existing in the database.
exports.sendUserInviteEmail = async ({ user, tempPassword, loginUrl }) => {
  const html = `
    <h2>Welcome to ProcureAI</h2>
    <p>Hi ${user.name},</p>
    <p>An account has been created for you. Use the credentials below to log in:</p>
    <table cellpadding="8" style="border-collapse:collapse">
      <tr><td><strong>Email:</strong></td><td>${user.email}</td></tr>
      <tr><td><strong>Temporary Password:</strong></td><td style="font-family:monospace;font-size:16px">${tempPassword}</td></tr>
    </table>
    <p><a href="${loginUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px">Log In</a></p>
    <p style="color:#666;font-size:12px">For security, please change this password after your first login.</p>
  `;
  return sendMail({ to: user.email, subject: 'Your ProcureAI account is ready', html });
};

// Sent on "forgot password" — actually delivers the reset link instead of only
// logging the token to the server console.
exports.sendPasswordResetEmail = async ({ user, resetUrl }) => {
  const html = `
    <h2>Reset your ProcureAI password</h2>
    <p>Hi ${user.name},</p>
    <p>We received a request to reset your password. Click below to choose a new one (link expires in 15 minutes):</p>
    <p><a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:12px">Reset Password</a></p>
    <p style="color:#666;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
  `;
  return sendMail({ to: user.email, subject: 'Reset your ProcureAI password', html });
};

exports.notifyUser = async ({ companyId, userId, vendorId, type, channel = 'in_app', payload }) => {
  await Notification.create({ company_id: companyId, user_id: userId, vendor_id: vendorId, type, channel, payload, status: 'queued' });
  if (channel === 'email' && userId) {
    const { User } = require('../models');
    const user = await User.findByPk(userId);
    if (user?.email) {
      await sendMail({ to: user.email, subject: payload?.title || 'ProcureAI Notification', html: `<p>${payload?.message || JSON.stringify(payload)}</p>` }).catch(console.error);
      await Notification.update({ status: 'sent', sent_at: new Date() }, { where: { user_id: userId, type, status: 'queued' } });
    }
  }
};
