// // src/controllers/vendorAuthController.js
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const { Op } = require('sequelize');
// const { Vendor, VendorCatalogItem } = require('../models');
// const { asyncHandler } = require('../middleware/errorHandler');
// const { okResponse, errorResponse, generateCode } = require('../utils/helpers');
// const { audit } = require('../middleware/audit');

// const VENDOR_SECRET = () =>
//   process.env.JWT_VENDOR_SECRET || process.env.JWT_ACCESS_SECRET + '_vendor';

// const signVendorToken = (vendorId) =>
//   jwt.sign({ vendorId, type: 'vendor' }, VENDOR_SECRET(), { expiresIn: '7d' });

// // ── POST /vendor-portal/login ────────────────────────────────────────
// exports.login = asyncHandler(async (req, res) => {
//   const { email, password } = req.body;
//   if (!email || !password)
//     return errorResponse(res, 'VALIDATION_ERROR', 'Email and password required');

//   const vendor = await Vendor.findOne({ where: { email: email.trim().toLowerCase(), deleted_at: null } });
//   if (!vendor || !vendor.password_hash)
//     return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });

//   if (vendor.portal_status === 'disabled')
//     return res.status(423).json({ error: { code: 'ACCOUNT_DISABLED', message: 'Account disabled — contact your buyer' } });

//   const match = await bcrypt.compare(password, vendor.password_hash);
//   if (!match)
//     return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });

//   // First login — activate account
//   if (vendor.portal_status === 'invited') {
//     await vendor.update({ portal_status: 'active' });
//   }

//   const token = signVendorToken(vendor.id);
//   okResponse(res, {
//     token,
//     vendor: {
//       id: vendor.id,
//       name: vendor.name,
//       email: vendor.email,
//       contact_person: vendor.contact_person,
//       phone: vendor.phone,
//       company_id: vendor.company_id,
//       portal_status: vendor.portal_status,
//     },
//   });
// });

// // ── POST /vendor-portal/signup (self-service vendor registration) ──────
// // Vendor-first registration: the vendor creates their own portal account with
// // no buyer attached (company_id: null). There is no buyer company selection
// // at signup — that requirement has been removed entirely. A buyer later
// // discovers this vendor through vendor-discovery matching (item master /
// // category / capability), or the vendor can be separately invited by a
// // specific buyer via vendorController.create (which still sets company_id to
// // that buyer, unaffected by this change).
// exports.signup = asyncHandler(async (req, res) => {
//   const { name, email, password, phone, contact_person, gstin, categories } = req.body;

//   if (!name || !email || !password || !contact_person || !phone)
//     return errorResponse(res, 'VALIDATION_ERROR', 'name, email, password, contact_person and phone are required');
//   if (password.length < 8)
//     return errorResponse(res, 'VALIDATION_ERROR', 'Password must be at least 8 characters');

//   const normalizedEmail = email.trim().toLowerCase();
//   const existing = await Vendor.findOne({ where: { email: normalizedEmail, deleted_at: null } });
//   if (existing) return errorResponse(res, 'DUPLICATE', 'An account with this email already exists — try logging in instead', 409);

//   // vendor_code is generated per company_id; self-registered vendors have no
//   // company yet, so codes are counted among the null-company (public) pool.
//   const vendor_code = await generateCode(Vendor, 'VEN', 'vendor_code', null);
//   const passwordHash = await bcrypt.hash(password, 10);

//   const vendor = await Vendor.create({
//     company_id: null, name, email: normalizedEmail, phone, contact_person, gstin,
//     categories: categories || [], vendor_code,
//     password_hash: passwordHash, portal_status: 'active', portal_invited_at: new Date(),
//   });

//   await audit({ companyId: null, userId: null, action: 'vendor.self_registered', entityType: 'Vendor', entityId: vendor.id, after: vendor.toJSON(), ip: req.ip });

//   const token = signVendorToken(vendor.id);
//   okResponse(res, {
//     token,
//     vendor: {
//       id: vendor.id,
//       name: vendor.name,
//       email: vendor.email,
//       contact_person: vendor.contact_person,
//       phone: vendor.phone,
//       company_id: vendor.company_id,
//       portal_status: vendor.portal_status,
//     },
//   }, 201);
// });

// // ── POST /vendor-portal/set-password (first-login password setup) ──
// exports.setPassword = asyncHandler(async (req, res) => {
//   const { email, temp_password, new_password } = req.body;
//   if (!email || !temp_password || !new_password)
//     return errorResponse(res, 'VALIDATION_ERROR', 'email, temp_password and new_password required');
//   if (new_password.length < 8)
//     return errorResponse(res, 'VALIDATION_ERROR', 'New password must be at least 8 characters');

//   const vendor = await Vendor.findOne({ where: { email: email.trim().toLowerCase(), deleted_at: null } });
//   if (!vendor || !vendor.password_hash)
//     return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or temp password' } });

//   const match = await bcrypt.compare(temp_password, vendor.password_hash);
//   if (!match)
//     return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid temp password' } });

//   const hash = await bcrypt.hash(new_password, 10);
//   await vendor.update({ password_hash: hash, portal_status: 'active' });

//   const token = signVendorToken(vendor.id);
//   okResponse(res, { token, message: 'Password set — you are now logged in' });
// });

// // Fields required for a vendor profile to count as "complete" — used to drive
// // the profile-completion indicator on the vendor dashboard/profile page.
// const PROFILE_COMPLETION_FIELDS = [
//   'name', 'contact_person', 'phone', 'address', 'gstin', 'categories',
// ];

// function computeProfileCompleteness(vendor) {
//   const total = PROFILE_COMPLETION_FIELDS.length;
//   const filled = PROFILE_COMPLETION_FIELDS.filter((f) => {
//     const v = vendor[f];
//     if (Array.isArray(v)) return v.length > 0;
//     if (v && typeof v === 'object') return Object.keys(v).length > 0;
//     return v !== null && v !== undefined && v !== '';
//   }).length;
//   return Math.round((filled / total) * 100);
// }

// // ── GET /vendor-portal/me ────────────────────────────────────────────
// exports.getMe = asyncHandler(async (req, res) => {
//   okResponse(res, {
//     id: req.vendor.id,
//     name: req.vendor.name,
//     legal_name: req.vendor.legal_name,
//     contact_person: req.vendor.contact_person,
//     email: req.vendor.email,
//     phone: req.vendor.phone,
//     whatsapp_number: req.vendor.whatsapp_number,
//     address: req.vendor.address,
//     gstin: req.vendor.gstin,
//     categories: req.vendor.categories,
//     payment_terms: req.vendor.payment_terms,
//     lead_time_days: req.vendor.lead_time_days,
//     moq: req.vendor.moq,
//     rating: req.vendor.rating,
//     portal_status: req.vendor.portal_status,
//     company_id: req.vendor.company_id,
//     bank_account_number: req.vendor.bank_account_number,
//     bank_ifsc: req.vendor.bank_ifsc,
//     bank_name: req.vendor.bank_name,
//     upi_id: req.vendor.upi_id,
//     profile_completeness: computeProfileCompleteness(req.vendor),
//   });
// });

// // ── PATCH /vendor-portal/me ──────────────────────────────────────────
// exports.updateMe = asyncHandler(async (req, res) => {
//   const allowed = [
//     'name', 'legal_name', 'contact_person', 'phone', 'whatsapp_number',
//     'address', 'gstin', 'payment_terms', 'lead_time_days', 'moq', 'categories',
//     'bank_account_number', 'bank_ifsc', 'bank_name', 'upi_id',
//   ];
//   allowed.forEach((f) => { if (req.body[f] !== undefined) req.vendor[f] = req.body[f]; });
//   await req.vendor.save();
//   await audit({
//     companyId: req.vendor.company_id,
//     userId: null,
//     action: 'vendor.self_updated',
//     entityType: 'Vendor',
//     entityId: req.vendor.id,
//     ip: req.ip,
//   });
//   okResponse(res, { message: 'Profile updated', profile_completeness: computeProfileCompleteness(req.vendor) });
// });

// // ── PATCH /vendor-portal/change-password ────────────────────────────
// exports.changePassword = asyncHandler(async (req, res) => {
//   const { current_password, new_password } = req.body;
//   if (!current_password || !new_password)
//     return errorResponse(res, 'VALIDATION_ERROR', 'current_password and new_password required');
//   if (new_password.length < 8)
//     return errorResponse(res, 'VALIDATION_ERROR', 'New password must be at least 8 characters');

//   const match = await bcrypt.compare(current_password, req.vendor.password_hash);
//   if (!match)
//     return res.status(401).json({ error: { code: 'WRONG_PASSWORD', message: 'Current password is incorrect' } });

//   const hash = await bcrypt.hash(new_password, 10);
//   await req.vendor.update({ password_hash: hash });
//   okResponse(res, { message: 'Password changed' });
// });

// // ── DOCUMENTS (self-upload, mirrors vendorController.uploadDocument) ───

// // GET /vendor-portal/documents
// exports.listDocuments = asyncHandler(async (req, res) => {
//   const { VendorDocument } = require('../models');
//   const docs = await VendorDocument.findAll({
//     where: { vendor_id: req.vendorId },
//     order: [['created_at', 'DESC']],
//   });
//   okResponse(res, docs);
// });

// // POST /vendor-portal/documents
// exports.uploadDocument = asyncHandler(async (req, res) => {
//   const { VendorDocument } = require('../models');
//   if (!req.file) return errorResponse(res, 'VALIDATION_ERROR', 'File required');
//   const doc = await VendorDocument.create({
//     vendor_id: req.vendorId,
//     type: req.body.type || 'other',
//     file_url: req.file.path || req.file.location || req.file.originalname,
//     uploaded_by: null,
//   });
//   okResponse(res, doc, 201);
// });

// // ── CATALOG ──────────────────────────────────────────────────────────

// // GET /vendor-portal/catalog
// exports.listCatalog = asyncHandler(async (req, res) => {
//   const items = await VendorCatalogItem.findAll({
//     where: { vendor_id: req.vendorId },
//     order: [['created_at', 'DESC']],
//   });
//   okResponse(res, items);
// });

// // POST /vendor-portal/catalog
// exports.addCatalogItem = asyncHandler(async (req, res) => {
//   const { name, category, unit, price, min_order_qty, lead_time_days, description } = req.body;
//   if (!name || !category)
//     return errorResponse(res, 'VALIDATION_ERROR', 'name and category required');

//   const item = await VendorCatalogItem.create({
//     vendor_id: req.vendorId,
//     company_id: req.vendor.company_id,
//     name,
//     category,
//     unit,
//     price,
//     min_order_qty: min_order_qty || 1,
//     lead_time_days,
//     description,
//     is_active: true,
//   });
//   okResponse(res, item, 201);
// });

// // PATCH /vendor-portal/catalog/:id
// exports.updateCatalogItem = asyncHandler(async (req, res) => {
//   const item = await VendorCatalogItem.findOne({
//     where: { id: req.params.id, vendor_id: req.vendorId },
//   });
//   if (!item) return errorResponse(res, 'NOT_FOUND', 'Catalog item not found', 404);

//   const allowed = ['name', 'category', 'unit', 'price', 'min_order_qty', 'lead_time_days', 'description', 'is_active'];
//   allowed.forEach((f) => { if (req.body[f] !== undefined) item[f] = req.body[f]; });
//   await item.save();
//   okResponse(res, item);
// });

// // DELETE /vendor-portal/catalog/:id
// exports.deleteCatalogItem = asyncHandler(async (req, res) => {
//   const item = await VendorCatalogItem.findOne({
//     where: { id: req.params.id, vendor_id: req.vendorId },
//   });
//   if (!item) return errorResponse(res, 'NOT_FOUND', 'Catalog item not found', 404);
//   await item.destroy();
//   okResponse(res, { message: 'Catalog item removed' });
// });

// // ── GET /vendor-portal/orders ────────────────────────────────────────
// // Vendors see POs issued to them, with unread message count
// exports.listMyOrders = asyncHandler(async (req, res) => {
//   const { PurchaseOrder, PoItem, Message } = require('../models');
//   const orders = await PurchaseOrder.findAll({
//     where: { vendor_id: req.vendorId },
//     include: [{ model: PoItem, as: 'items' }],
//     order: [['created_at', 'DESC']],
//     limit: 50,
//   });
//   // Attach unread message count per PO
//   const enriched = await Promise.all(orders.map(async (po) => {
//     const msgCount = await Message.count({ where: { purchase_order_id: po.id } });
//     return { ...po.toJSON(), message_count: msgCount };
//   }));
//   okResponse(res, enriched);
// });

// // ── GET /vendor-portal/payments ──────────────────────────────────────
// // Vendor sees their own payment history (queued/executed/confirmed), so the
// // portal's "order, invoice, and payment history" requirement is satisfied
// // without duplicating vendor data anywhere.
// exports.listMyPayments = asyncHandler(async (req, res) => {
//   const { Payment, Invoice, PurchaseOrder } = require('../models');
//   const payments = await Payment.findAll({
//     where: { vendor_id: req.vendorId },
//     include: [{ model: Invoice }, { model: PurchaseOrder }],
//     order: [['created_at', 'DESC']],
//     limit: 50,
//   });
//   okResponse(res, payments);
// });

// // ── POST /vendor-portal/payments/:id/confirm ─────────────────────────
// // Vendor confirms receipt of an executed payment. This is the final step
// // of the payment sequence — the linked order is only closed here.
// exports.confirmPayment = asyncHandler(async (req, res) => {
//   const { Payment, PurchaseOrder } = require('../models');
//   const payment = await Payment.findOne({ where: { id: req.params.id, vendor_id: req.vendorId } });
//   if (!payment) return errorResponse(res, 'NOT_FOUND', 'Payment not found', 404);
//   if (payment.status !== 'executed') {
//     return errorResponse(res, 'INVALID_STATE', 'Only executed payments can be confirmed', 409);
//   }
//   await payment.update({ status: 'confirmed', confirmed_at: new Date() });
//   if (payment.purchase_order_id) {
//     await PurchaseOrder.update({ status: 'closed' }, { where: { id: payment.purchase_order_id } });
//   }
//   await audit({ companyId: payment.company_id, userId: null, action: 'payment.confirmed_by_vendor', entityType: 'Payment', entityId: payment.id, ip: req.ip });
//   okResponse(res, { message: 'Payment receipt confirmed — order closed' });
// });






// src/controllers/vendorAuthController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { Vendor, VendorCatalogItem } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { okResponse, errorResponse, generateCode } = require('../utils/helpers');
const { audit } = require('../middleware/audit');

const VENDOR_SECRET = () =>
  process.env.JWT_VENDOR_SECRET || process.env.JWT_ACCESS_SECRET + '_vendor';

const signVendorToken = (vendorId) =>
  jwt.sign({ vendorId, type: 'vendor' }, VENDOR_SECRET(), { expiresIn: '7d' });

// ── POST /vendor-portal/login ────────────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return errorResponse(res, 'VALIDATION_ERROR', 'Email and password required');

  const vendor = await Vendor.findOne({ where: { email: email.trim().toLowerCase(), deleted_at: null } });
  if (!vendor || !vendor.password_hash)
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });

  if (vendor.portal_status === 'disabled')
    return res.status(423).json({ error: { code: 'ACCOUNT_DISABLED', message: 'Account disabled — contact your buyer' } });

  const match = await bcrypt.compare(password, vendor.password_hash);
  if (!match)
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });

  // First login — activate account
  if (vendor.portal_status === 'invited') {
    await vendor.update({ portal_status: 'active' });
  }

  const token = signVendorToken(vendor.id);
  okResponse(res, {
    token,
    vendor: {
      id: vendor.id,
      name: vendor.name,
      email: vendor.email,
      contact_person: vendor.contact_person,
      phone: vendor.phone,
      company_id: vendor.company_id,
      portal_status: vendor.portal_status,
    },
  });
});

// ── POST /vendor-portal/signup (self-service vendor registration) ──────
// Vendor-first registration: the vendor creates their own portal account with
// no buyer attached (company_id: null). There is no buyer company selection
// at signup — that requirement has been removed entirely. A buyer later
// discovers this vendor through vendor-discovery matching (item master /
// category / capability), or the vendor can be separately invited by a
// specific buyer via vendorController.create (which still sets company_id to
// that buyer, unaffected by this change).
exports.signup = asyncHandler(async (req, res) => {
  const { name, email, password, phone, contact_person, gstin, categories } = req.body;

  if (!name || !email || !password || !contact_person || !phone)
    return errorResponse(res, 'VALIDATION_ERROR', 'name, email, password, contact_person and phone are required');
  if (password.length < 8)
    return errorResponse(res, 'VALIDATION_ERROR', 'Password must be at least 8 characters');

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await Vendor.findOne({ where: { email: normalizedEmail, deleted_at: null } });
  if (existing) return errorResponse(res, 'DUPLICATE', 'An account with this email already exists — try logging in instead', 409);

  // vendor_code is generated per company_id; self-registered vendors have no
  // company yet, so codes are counted among the null-company (public) pool.
  const vendor_code = await generateCode(Vendor, 'VEN', 'vendor_code', null);
  const passwordHash = await bcrypt.hash(password, 10);

  const vendor = await Vendor.create({
    company_id: null, name, email: normalizedEmail, phone, contact_person, gstin,
    categories: categories || [], vendor_code,
    password_hash: passwordHash, portal_status: 'active', portal_invited_at: new Date(),
  });

  await audit({ companyId: null, userId: null, action: 'vendor.self_registered', entityType: 'Vendor', entityId: vendor.id, after: vendor.toJSON(), ip: req.ip });

  const token = signVendorToken(vendor.id);
  okResponse(res, {
    token,
    vendor: {
      id: vendor.id,
      name: vendor.name,
      email: vendor.email,
      contact_person: vendor.contact_person,
      phone: vendor.phone,
      company_id: vendor.company_id,
      portal_status: vendor.portal_status,
    },
  }, 201);
});

// ── POST /vendor-portal/set-password (first-login password setup) ──
exports.setPassword = asyncHandler(async (req, res) => {
  const { email, temp_password, new_password } = req.body;
  if (!email || !temp_password || !new_password)
    return errorResponse(res, 'VALIDATION_ERROR', 'email, temp_password and new_password required');
  if (new_password.length < 8)
    return errorResponse(res, 'VALIDATION_ERROR', 'New password must be at least 8 characters');

  const vendor = await Vendor.findOne({ where: { email: email.trim().toLowerCase(), deleted_at: null } });
  if (!vendor || !vendor.password_hash)
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or temp password' } });

  const match = await bcrypt.compare(temp_password, vendor.password_hash);
  if (!match)
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid temp password' } });

  const hash = await bcrypt.hash(new_password, 10);
  await vendor.update({ password_hash: hash, portal_status: 'active' });

  const token = signVendorToken(vendor.id);
  okResponse(res, { token, message: 'Password set — you are now logged in' });
});

// Fields required for a vendor profile to count as "complete" — used to drive
// the profile-completion indicator on the vendor dashboard/profile page.
const PROFILE_COMPLETION_FIELDS = [
  'name', 'contact_person', 'phone', 'address', 'gstin', 'categories',
];

function computeProfileCompleteness(vendor) {
  const total = PROFILE_COMPLETION_FIELDS.length;
  const filled = PROFILE_COMPLETION_FIELDS.filter((f) => {
    const v = vendor[f];
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === 'object') return Object.keys(v).length > 0;
    return v !== null && v !== undefined && v !== '';
  }).length;
  return Math.round((filled / total) * 100);
}

// ── GET /vendor-portal/me ────────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  okResponse(res, {
    id: req.vendor.id,
    name: req.vendor.name,
    legal_name: req.vendor.legal_name,
    contact_person: req.vendor.contact_person,
    email: req.vendor.email,
    phone: req.vendor.phone,
    whatsapp_number: req.vendor.whatsapp_number,
    address: req.vendor.address,
    gstin: req.vendor.gstin,
    categories: req.vendor.categories,
    payment_terms: req.vendor.payment_terms,
    lead_time_days: req.vendor.lead_time_days,
    moq: req.vendor.moq,
    rating: req.vendor.rating,
    portal_status: req.vendor.portal_status,
    company_id: req.vendor.company_id,
    bank_account_number: req.vendor.bank_account_number,
    bank_ifsc: req.vendor.bank_ifsc,
    bank_name: req.vendor.bank_name,
    upi_id: req.vendor.upi_id,
    profile_completeness: computeProfileCompleteness(req.vendor),
  });
});

// ── PATCH /vendor-portal/me ──────────────────────────────────────────
exports.updateMe = asyncHandler(async (req, res) => {
  const allowed = [
    'name', 'legal_name', 'contact_person', 'phone', 'whatsapp_number',
    'address', 'gstin', 'payment_terms', 'lead_time_days', 'moq', 'categories',
    'bank_account_number', 'bank_ifsc', 'bank_name', 'upi_id',
  ];
  allowed.forEach((f) => { if (req.body[f] !== undefined) req.vendor[f] = req.body[f]; });
  await req.vendor.save();
  await audit({
    companyId: req.vendor.company_id,
    userId: null,
    action: 'vendor.self_updated',
    entityType: 'Vendor',
    entityId: req.vendor.id,
    ip: req.ip,
  });
  okResponse(res, { message: 'Profile updated', profile_completeness: computeProfileCompleteness(req.vendor) });
});

// ── PATCH /vendor-portal/change-password ────────────────────────────
exports.changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return errorResponse(res, 'VALIDATION_ERROR', 'current_password and new_password required');
  if (new_password.length < 8)
    return errorResponse(res, 'VALIDATION_ERROR', 'New password must be at least 8 characters');

  const match = await bcrypt.compare(current_password, req.vendor.password_hash);
  if (!match)
    return res.status(401).json({ error: { code: 'WRONG_PASSWORD', message: 'Current password is incorrect' } });

  const hash = await bcrypt.hash(new_password, 10);
  await req.vendor.update({ password_hash: hash });
  okResponse(res, { message: 'Password changed' });
});

// ── DOCUMENTS (self-upload, mirrors vendorController.uploadDocument) ───

// GET /vendor-portal/documents
exports.listDocuments = asyncHandler(async (req, res) => {
  const { VendorDocument } = require('../models');
  const docs = await VendorDocument.findAll({
    where: { vendor_id: req.vendorId },
    order: [['created_at', 'DESC']],
  });
  okResponse(res, docs);
});

// POST /vendor-portal/documents
exports.uploadDocument = asyncHandler(async (req, res) => {
  const { VendorDocument } = require('../models');
  if (!req.file) return errorResponse(res, 'VALIDATION_ERROR', 'File required');
  const doc = await VendorDocument.create({
    vendor_id: req.vendorId,
    type: req.body.type || 'other',
    file_url: req.file.path || req.file.location || req.file.originalname,
    uploaded_by: null,
  });
  okResponse(res, doc, 201);
});

// ── CATALOG ──────────────────────────────────────────────────────────

// GET /vendor-portal/catalog
exports.listCatalog = asyncHandler(async (req, res) => {
  const items = await VendorCatalogItem.findAll({
    where: { vendor_id: req.vendorId },
    order: [['created_at', 'DESC']],
  });
  okResponse(res, items);
});

// POST /vendor-portal/catalog
exports.addCatalogItem = asyncHandler(async (req, res) => {
  const { name, category, unit, price, min_order_qty, lead_time_days, description } = req.body;
  if (!name || !category)
    return errorResponse(res, 'VALIDATION_ERROR', 'name and category required');

  const item = await VendorCatalogItem.create({
    vendor_id: req.vendorId,
    company_id: req.vendor.company_id,
    name,
    category,
    unit,
    price,
    min_order_qty: min_order_qty || 1,
    lead_time_days,
    description,
    is_active: true,
  });
  okResponse(res, item, 201);
});

// PATCH /vendor-portal/catalog/:id
exports.updateCatalogItem = asyncHandler(async (req, res) => {
  const item = await VendorCatalogItem.findOne({
    where: { id: req.params.id, vendor_id: req.vendorId },
  });
  if (!item) return errorResponse(res, 'NOT_FOUND', 'Catalog item not found', 404);

  const allowed = ['name', 'category', 'unit', 'price', 'min_order_qty', 'lead_time_days', 'description', 'is_active'];
  allowed.forEach((f) => { if (req.body[f] !== undefined) item[f] = req.body[f]; });
  await item.save();
  okResponse(res, item);
});

// DELETE /vendor-portal/catalog/:id
exports.deleteCatalogItem = asyncHandler(async (req, res) => {
  const item = await VendorCatalogItem.findOne({
    where: { id: req.params.id, vendor_id: req.vendorId },
  });
  if (!item) return errorResponse(res, 'NOT_FOUND', 'Catalog item not found', 404);
  await item.destroy();
  okResponse(res, { message: 'Catalog item removed' });
});

// ── GET /vendor-portal/orders ────────────────────────────────────────
// Vendors see POs issued to them, with unread message count
exports.listMyOrders = asyncHandler(async (req, res) => {
  const { PurchaseOrder, PoItem, Message } = require('../models');
  const orders = await PurchaseOrder.findAll({
    where: { vendor_id: req.vendorId },
    include: [{ model: PoItem, as: 'items' }],
    order: [['created_at', 'DESC']],
    limit: 50,
  });
  // Attach unread message count per PO
  const enriched = await Promise.all(orders.map(async (po) => {
    const msgCount = await Message.count({ where: { purchase_order_id: po.id } });
    return { ...po.toJSON(), message_count: msgCount };
  }));
  okResponse(res, enriched);
});

// ── GET /vendor-portal/quote-requests ─────────────────────────────────
// Any RFQ this vendor has been sent, whether they got the link by email or
// are logging in via the portal. Previously an RFQ was only ever visible to
// a vendor through the emailed one-off link — a vendor with portal access
// (invited by the buyer, or self-registered) had no way to see "you have a
// quote to fill out" as a task inside the portal itself. Each item still
// links out to the same public token URL — this reuses the exact tested
// quote-submission flow rather than building a second, parallel one.
exports.listMyQuoteRequests = asyncHandler(async (req, res) => {
  const { RfqVendor, Rfq, PurchaseRequest, PurchaseRequestItem, Item } = require('../models');
  const rows = await RfqVendor.findAll({
    where: { vendor_id: req.vendorId },
    include: [{
      model: Rfq,
      include: [{ model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items', include: [Item] }] }],
    }],
    order: [['sent_at', 'DESC']],
    limit: 50,
  });
  const data = rows
    .filter((r) => r.Rfq) // guard against any orphaned row
    .map((r) => ({
      rfq_vendor_id: r.id,
      status: r.status, // pending | sent | responded
      sent_at: r.sent_at,
      responded_at: r.responded_at,
      access_token: r.access_token,
      rfq_number: r.Rfq.rfq_number,
      deadline: r.Rfq.deadline,
      delivery_location: r.Rfq.delivery_location,
      item_count: r.Rfq.PurchaseRequest?.items?.length || 0,
      item_summary: (r.Rfq.PurchaseRequest?.items || []).slice(0, 3).map((it) => it.Item?.name || it.item_name_freetext).filter(Boolean).join(', '),
    }));
  okResponse(res, data);
});

// ── GET /vendor-portal/payments ──────────────────────────────────────
// Vendor sees their own payment history (queued/executed/confirmed), so the
// portal's "order, invoice, and payment history" requirement is satisfied
// without duplicating vendor data anywhere.
exports.listMyPayments = asyncHandler(async (req, res) => {
  const { Payment, Invoice, PurchaseOrder } = require('../models');
  const payments = await Payment.findAll({
    where: { vendor_id: req.vendorId },
    include: [{ model: Invoice }, { model: PurchaseOrder }],
    order: [['created_at', 'DESC']],
    limit: 50,
  });
  okResponse(res, payments);
});

// ── POST /vendor-portal/payments/:id/confirm ─────────────────────────
// Vendor confirms receipt of an executed payment. This is the final step
// of the payment sequence — the linked order is only closed here.
exports.confirmPayment = asyncHandler(async (req, res) => {
  const { Payment, PurchaseOrder } = require('../models');
  const payment = await Payment.findOne({ where: { id: req.params.id, vendor_id: req.vendorId } });
  if (!payment) return errorResponse(res, 'NOT_FOUND', 'Payment not found', 404);
  if (payment.status !== 'executed') {
    return errorResponse(res, 'INVALID_STATE', 'Only executed payments can be confirmed', 409);
  }
  await payment.update({ status: 'confirmed', confirmed_at: new Date() });
  if (payment.purchase_order_id) {
    await PurchaseOrder.update({ status: 'closed' }, { where: { id: payment.purchase_order_id } });
  }
  await audit({ companyId: payment.company_id, userId: null, action: 'payment.confirmed_by_vendor', entityType: 'Payment', entityId: payment.id, ip: req.ip });
  okResponse(res, { message: 'Payment receipt confirmed — order closed' });
});
