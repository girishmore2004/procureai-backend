const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args)).catch(() => global.fetch(...args));

/**
 * WhatsApp notification via WhatsApp Cloud API (Meta) or Gupshup.
 * Set WHATSAPP_API_URL and WHATSAPP_API_TOKEN in .env.
 * Supports both providers:
 *   Meta Cloud API: https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages
 *   Gupshup: https://api.gupshup.io/sm/api/v1/msg
 */

const sendWhatsApp = async ({ to, message, templateName, params }) => {
  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;

  if (!url || !token) {
    console.log(`[WhatsApp Mock] To: ${to} | Message: ${message || templateName}`);
    return { success: true, mock: true };
  }

  // Normalise phone number — ensure +91xxxxxxxxxx format
  const phone = to?.replace(/\D/g, '');
  const e164 = phone?.startsWith('91') ? `+${phone}` : `+91${phone}`;

  // Detect provider by URL
  const isGupshup = url.includes('gupshup');

  try {
    let body, headers;

    if (isGupshup) {
      // Gupshup free-text message
      body = new URLSearchParams({
        channel: 'whatsapp',
        source: process.env.WHATSAPP_FROM || '917834811114',
        destination: e164.replace('+', ''),
        message: JSON.stringify({ type: 'text', text: message }),
        'src.name': process.env.WHATSAPP_APP_NAME || 'ProcureAI',
      });
      headers = { 'Content-Type': 'application/x-www-form-urlencoded', apikey: token };
    } else {
      // Meta WhatsApp Cloud API
      if (templateName) {
        body = JSON.stringify({
          messaging_product: 'whatsapp',
          to: e164.replace('+', ''),
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: params?.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }] : [],
          },
        });
      } else {
        body = JSON.stringify({
          messaging_product: 'whatsapp',
          to: e164.replace('+', ''),
          type: 'text',
          text: { body: message },
        });
      }
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    }

    const res = await fetch(url, { method: 'POST', headers, body: body.toString() });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    return { success: true, data };
  } catch (err) {
    console.error('[WhatsApp] Send failed:', err.message);
    return { success: false, error: err.message };
  }
};

// Specific message templates
const whatsapp = {
  sendRfqNotification: (vendor, rfq, uploadLink) =>
    sendWhatsApp({
      to: vendor.whatsapp_number || vendor.phone,
      message: `*Quote Request from ProcureAI*\n\nDear ${vendor.contact_person || vendor.name},\n\nYou have received RFQ *${rfq.rfq_number}*.\nDeadline: ${rfq.deadline ? new Date(rfq.deadline).toLocaleDateString('en-IN') : 'ASAP'}\n\nSubmit your quote here:\n${uploadLink}\n\n_This link is unique to your company._`,
    }),

  sendRfqReminder: (vendor, rfq, uploadLink) =>
    sendWhatsApp({
      to: vendor.whatsapp_number || vendor.phone,
      message: `⏰ *Reminder: Quote Due Soon*\n\nRFQ *${rfq.rfq_number}* deadline is approaching.\nPlease submit your quote:\n${uploadLink}`,
    }),

  sendPoNotification: (vendor, po) =>
    sendWhatsApp({
      to: vendor.whatsapp_number || vendor.phone,
      message: `*Purchase Order Received*\n\nDear ${vendor.contact_person || vendor.name},\n\nPO *${po.po_number}* has been issued.\nAmount: ₹${Number(po.total_amount).toLocaleString('en-IN')}\nExpected Delivery: ${po.expected_delivery_date || 'TBD'}\n\nPlease check your email for the PO document.`,
    }),

  sendApprovalAlert: (user, entityType, entityId, amount) =>
    sendWhatsApp({
      to: user.whatsapp_number || user.phone,
      message: `🔔 *Approval Required*\n\nHi ${user.name},\n\n${entityType} (₹${Number(amount).toLocaleString('en-IN')}) is pending your approval.\nPlease log in to ProcureAI to review.`,
    }),

  sendReorderAlert: (user, item, stock) =>
    sendWhatsApp({
      to: user.whatsapp_number || user.phone,
      message: `⚠️ *Reorder Alert*\n\n*${item.name}* stock is low!\nCurrent Stock: ${stock} ${item.unit}\nReorder Point: ${item.reorder_level} ${item.unit}\n\nPlease create a purchase request.`,
    }),
};

module.exports = { sendWhatsApp, whatsapp };
