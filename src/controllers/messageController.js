// src/controllers/messageController.js
const { Message, User, Vendor, PurchaseOrder, Invoice } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { okResponse, errorResponse } = require('../utils/helpers');
const { audit } = require('../middleware/audit');

// ── GET /purchase-orders/:id/messages  (company-user) ───────────────
exports.listForPO = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!po) return errorResponse(res, 'NOT_FOUND', 'PO not found', 404);
  const messages = await Message.findAll({
    where: { purchase_order_id: po.id },
    order: [['created_at', 'ASC']],
  });
  okResponse(res, messages);
});

// ── POST /purchase-orders/:id/messages  (company-user sends) ────────
exports.sendOnPO = asyncHandler(async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return errorResponse(res, 'VALIDATION_ERROR', 'Message body required');
  const po = await PurchaseOrder.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!po) return errorResponse(res, 'NOT_FOUND', 'PO not found', 404);
  const msg = await Message.create({
    company_id: req.companyId,
    purchase_order_id: po.id,
    sender_type: 'company_user',
    sender_id: req.user.id,
    sender_name: req.user.name,
    body: body.trim(),
  });
  // Notify vendor if they have a portal account
  const vendor = await Vendor.findByPk(po.vendor_id);
  if (vendor?.email && vendor.portal_status === 'active') {
    const { sendMail } = require('../services/notificationService');
    await sendMail({
      to: vendor.email,
      subject: `New message on PO ${po.po_number}`,
      html: `<p>You have a new message regarding <strong>${po.po_number}</strong>:</p>
             <blockquote style="border-left:3px solid #2563eb;padding-left:12px;color:#374151">${body}</blockquote>
             <p>Log in to your <a href="${process.env.APP_URL}/vendor-portal/orders">vendor portal</a> to reply.</p>`,
    }).catch(() => {});
  }
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'message.sent_on_po', entityType: 'PurchaseOrder', entityId: po.id, ip: req.ip });
  okResponse(res, msg, 201);
});

// ── GET /invoices/:id/messages  (company-user) ───────────────────────
exports.listForInvoice = asyncHandler(async (req, res) => {
  const inv = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!inv) return errorResponse(res, 'NOT_FOUND', 'Invoice not found', 404);
  const messages = await Message.findAll({
    where: { invoice_id: inv.id },
    order: [['created_at', 'ASC']],
  });
  okResponse(res, messages);
});

// ── POST /invoices/:id/messages  (company-user sends) ────────────────
exports.sendOnInvoice = asyncHandler(async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return errorResponse(res, 'VALIDATION_ERROR', 'Message body required');
  const inv = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!inv) return errorResponse(res, 'NOT_FOUND', 'Invoice not found', 404);
  const msg = await Message.create({
    company_id: req.companyId,
    invoice_id: inv.id,
    sender_type: 'company_user',
    sender_id: req.user.id,
    sender_name: req.user.name,
    body: body.trim(),
  });
  const vendor = await Vendor.findByPk(inv.vendor_id);
  if (vendor?.email && vendor.portal_status === 'active') {
    const { sendMail } = require('../services/notificationService');
    await sendMail({
      to: vendor.email,
      subject: `Message regarding invoice ${inv.invoice_number || inv.id.slice(-6)}`,
      html: `<p>You have a message regarding your invoice:</p>
             <blockquote style="border-left:3px solid #2563eb;padding-left:12px;color:#374151">${body}</blockquote>
             <p>Log in to your <a href="${process.env.APP_URL}/vendor-portal/orders">vendor portal</a> to reply.</p>`,
    }).catch(() => {});
  }
  okResponse(res, msg, 201);
});

// ── Vendor-side: list messages on a PO (via vendorAuth) ──────────────
exports.vendorListForPO = asyncHandler(async (req, res) => {
  // req.vendorId set by verifyVendorToken
  const po = await PurchaseOrder.findOne({
    where: { id: req.params.id, vendor_id: req.vendorId },
  });
  if (!po) return errorResponse(res, 'NOT_FOUND', 'PO not found', 404);
  const messages = await Message.findAll({
    where: { purchase_order_id: po.id },
    order: [['created_at', 'ASC']],
  });
  okResponse(res, messages);
});

// ── Vendor-side: reply on a PO (via vendorAuth) ──────────────────────
exports.vendorReplyOnPO = asyncHandler(async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return errorResponse(res, 'VALIDATION_ERROR', 'Message body required');
  const po = await PurchaseOrder.findOne({
    where: { id: req.params.id, vendor_id: req.vendorId },
  });
  if (!po) return errorResponse(res, 'NOT_FOUND', 'PO not found', 404);
  const msg = await Message.create({
    company_id: po.company_id,
    purchase_order_id: po.id,
    sender_type: 'vendor',
    sender_id: req.vendorId,
    sender_name: req.vendor.contact_person || req.vendor.name,
    body: body.trim(),
  });
  // Notify the company (in-app notification)
  const { notifyUser } = require('../services/notificationService');
  await notifyUser({
    companyId: po.company_id,
    userId: po.created_by,
    type: 'vendor_message',
    channel: 'in_app',
    payload: {
      title: `New message from ${req.vendor.name}`,
      message: body.trim().slice(0, 120),
      entityType: 'PurchaseOrder',
      entityId: po.id,
    },
  }).catch(() => {});
  okResponse(res, msg, 201);
});
