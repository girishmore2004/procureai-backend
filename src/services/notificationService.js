const nodemailer = require('nodemailer');
const { Notification } = require('../models');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT) || 587,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const sendMail = async ({ to, subject, html, attachments = [] }) => {
  if (!process.env.SMTP_USER) { console.log(`[Email Mock] To: ${to} | Subject: ${subject}`); return; }
  await transporter.sendMail({ from: process.env.EMAIL_FROM || 'noreply@procureai.app', to, subject, html, attachments });
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
