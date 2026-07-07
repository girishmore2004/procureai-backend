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
// Unlike vendorController.create (a buyer inviting a vendor with a temp
// password), this is the vendor registering themselves against a buyer
// company they've chosen (see companyApi/public companies search on the
// signup page). The vendor sets their own password and is active immediately
// — there's no separate buyer approval step in the current data model, so
// buyers review/manage the vendor from the Vendors page same as any other row.
exports.signup = asyncHandler(async (req, res) => {
  const { company_id, name, email, password, phone, contact_person, gstin, categories } = req.body;

  if (!company_id || !name || !email || !password)
    return errorResponse(res, 'VALIDATION_ERROR', 'company_id, name, email and password are required');
  if (password.length < 8)
    return errorResponse(res, 'VALIDATION_ERROR', 'Password must be at least 8 characters');

  const { Company } = require('../models');
  const company = await Company.findOne({ where: { id: company_id, status: 'active' } });
  if (!company) return errorResponse(res, 'NOT_FOUND', 'Selected company not found', 404);

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await Vendor.findOne({ where: { email: normalizedEmail, deleted_at: null } });
  if (existing) return errorResponse(res, 'DUPLICATE', 'An account with this email already exists — try logging in instead', 409);

  const vendor_code = await generateCode(Vendor, 'VEN', 'vendor_code', company_id);
  const passwordHash = await bcrypt.hash(password, 10);

  const vendor = await Vendor.create({
    company_id, name, email: normalizedEmail, phone, contact_person, gstin,
    categories: categories || [], vendor_code,
    password_hash: passwordHash, portal_status: 'active', portal_invited_at: new Date(),
  });

  await audit({ companyId: company_id, userId: null, action: 'vendor.self_registered', entityType: 'Vendor', entityId: vendor.id, after: vendor.toJSON(), ip: req.ip });

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
  });
});

// ── PATCH /vendor-portal/me ──────────────────────────────────────────
exports.updateMe = asyncHandler(async (req, res) => {
  const allowed = [
    'name', 'legal_name', 'contact_person', 'phone', 'whatsapp_number',
    'address', 'gstin', 'payment_terms', 'lead_time_days', 'moq',
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
  okResponse(res, { message: 'Profile updated' });
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
