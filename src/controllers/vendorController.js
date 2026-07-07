const { Op } = require('sequelize');
const XLSX = require('xlsx');
const { Vendor, VendorDocument, VendorScore, PurchaseOrder } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse, generateCode, normalizeImportRow } = require('../utils/helpers');
const { audit } = require('../middleware/audit');
const sequelize = require('../config/db');

exports.list = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId, deleted_at: null };
  if (req.query.status) where.status = req.query.status;
  if (req.query.preferred) where.preferred = req.query.preferred === 'true';
  if (req.query.category) where.categories = { [Op.contains]: [req.query.category] };
  if (req.query.search) where.name = { [Op.iLike]: `%${req.query.search}%` };
  const result = await Vendor.findAndCountAll({ where, limit, offset, order: [['name', 'ASC']] });
  paginatedResponse(res, result, { page, perPage });
});

exports.create = asyncHandler(async (req, res) => {
  const { generateTempPassword } = require('../utils/helpers');
  const bcrypt = require('bcryptjs');
  const { sendVendorInviteEmail } = require('../services/notificationService');

  const { name, email, phone, whatsapp_number, contact_person, address, gstin, legal_name, categories, payment_terms, lead_time_days, moq, preferred, notes } = req.body;
  if (!name) return errorResponse(res, 'VALIDATION_ERROR', 'Vendor name required');

  // Normalize email so it always matches the lowercase lookup used at vendor-portal login
  const normalizedEmail = email ? email.trim().toLowerCase() : email;

  if (normalizedEmail) {
    const existingEmail = await Vendor.findOne({ where: { email: normalizedEmail, deleted_at: null } });
    if (existingEmail) return errorResponse(res, 'DUPLICATE', 'A vendor with this email already exists', 409);
  }
  if (gstin) {
    const existingGstin = await Vendor.findOne({ where: { company_id: req.companyId, gstin, deleted_at: null } });
    if (existingGstin) return errorResponse(res, 'DUPLICATE', 'A vendor with this GSTIN already exists', 409);
  }

  const vendor_code = await generateCode(Vendor, 'VEN', 'vendor_code', req.companyId);

  // Set up the vendor portal temp password BEFORE creating the row, so the
  // record is created with password_hash already populated in one shot —
  // no dangling work left to run after the HTTP response has been sent.
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const vendor = await Vendor.create({
    company_id: req.companyId, name, email: normalizedEmail, phone, whatsapp_number,
    contact_person, address, gstin, legal_name, categories, payment_terms,
    lead_time_days, moq, preferred, notes, vendor_code,
    password_hash: passwordHash, portal_status: 'invited', portal_invited_at: new Date(),
  });

  await audit({ companyId: req.companyId, userId: req.user.id, action: 'vendor.created', entityType: 'Vendor', entityId: vendor.id, after: vendor.toJSON(), ip: req.ip });

  // Send invite email — best-effort, must not block or fail the create response
  if (normalizedEmail) {
    const portalUrl = `${process.env.APP_URL || process.env.FRONTEND_URL}/vendor-portal/login`;
    sendVendorInviteEmail({ vendor, tempPassword, portalUrl }).catch((e) =>
      console.warn('[Vendor Invite Email] failed:', e.message)
    );
  }

  okResponse(res, vendor, 201);
});

exports.importCsv = asyncHandler(async (req, res) => {
  const { generateTempPassword } = require('../utils/helpers');
  const bcrypt = require('bcryptjs');
  const { sendVendorInviteEmail } = require('../services/notificationService');

  if (!req.file) return errorResponse(res, 'VALIDATION_ERROR', 'CSV/Excel file required');
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (!rawRows.length) return errorResponse(res, 'VALIDATION_ERROR', 'The sheet has no data rows (check that row 1 has headers and row 2+ has data)');

  const results = { created: 0, total: rawRows.length, errors: [] };
  for (let i = 0; i < rawRows.length; i++) {
    // Headers like "Vendor Name" / "GST No" / "Mobile" etc. are matched to our
    // fields automatically — see normalizeImportRow in utils/helpers.js
    const row = normalizeImportRow(rawRows[i]);
    if (!row.name) {
      results.errors.push({ row: i + 2, message: `name is required (columns found: ${Object.keys(rawRows[i]).join(', ')})` });
      continue;
    }
    try {
      const vendor_code = await generateCode(Vendor, 'VEN', 'vendor_code', req.companyId);
      // Generate a vendor-portal temp password and invite, same as the manual
      // create() flow — without this, imported vendors had no password_hash and
      // could never log in to the vendor portal, with no way to recover.
      const normalizedEmail = row.email ? String(row.email).trim().toLowerCase() : row.email;
      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const vendor = await Vendor.create({
        company_id: req.companyId, name: row.name, email: normalizedEmail, phone: row.phone,
        whatsapp_number: row.whatsapp_number, contact_person: row.contact_person,
        gstin: row.gstin, payment_terms: row.payment_terms,
        lead_time_days: row.lead_time_days ? Number(row.lead_time_days) : null,
        vendor_code,
        password_hash: passwordHash, portal_status: 'invited', portal_invited_at: new Date(),
      });
      if (normalizedEmail) {
        const portalUrl = `${process.env.APP_URL || process.env.FRONTEND_URL}/vendor-portal/login`;
        sendVendorInviteEmail({ vendor, tempPassword, portalUrl }).catch((e) =>
          console.warn('[Vendor Invite Email] failed:', e.message)
        );
      }
      results.created++;
    } catch (e) { results.errors.push({ row: i + 2, message: e.message }); }
  }
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'vendor.imported', entityType: 'Vendor', entityId: null, after: { created: results.created, total: results.total }, ip: req.ip });
  okResponse(res, results);
});

exports.getOne = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [VendorDocument, VendorScore],
  });
  if (!vendor) return errorResponse(res, 'NOT_FOUND', 'Vendor not found', 404);
  // Recent POs
  const recentPOs = await PurchaseOrder.findAll({ where: { vendor_id: vendor.id, company_id: req.companyId }, limit: 10, order: [['created_at', 'DESC']] });
  okResponse(res, { ...vendor.toJSON(), recent_orders: recentPOs });
});

exports.update = asyncHandler(async (req, res) => {
  const { Op } = require('sequelize');
  const vendor = await Vendor.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!vendor) return errorResponse(res, 'NOT_FOUND', 'Vendor not found', 404);
  const before = vendor.toJSON();

  if (req.body.email !== undefined) {
    const normalizedEmail = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
    if (normalizedEmail && normalizedEmail !== vendor.email) {
      const existingEmail = await Vendor.findOne({ where: { email: normalizedEmail, deleted_at: null, id: { [Op.ne]: vendor.id } } });
      if (existingEmail) return errorResponse(res, 'DUPLICATE', 'A vendor with this email already exists', 409);
    }
    req.body.email = normalizedEmail;
  }
  if (req.body.gstin && req.body.gstin !== vendor.gstin) {
    const existingGstin = await Vendor.findOne({ where: { company_id: req.companyId, gstin: req.body.gstin, deleted_at: null, id: { [Op.ne]: vendor.id } } });
    if (existingGstin) return errorResponse(res, 'DUPLICATE', 'A vendor with this GSTIN already exists', 409);
  }

  const allowed = ['name', 'legal_name', 'contact_person', 'email', 'phone', 'whatsapp_number', 'address', 'gstin', 'categories', 'payment_terms', 'lead_time_days', 'moq', 'preferred', 'notes', 'status'];
  allowed.forEach((f) => { if (req.body[f] !== undefined) vendor[f] = req.body[f]; });
  await vendor.save();
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'vendor.updated', entityType: 'Vendor', entityId: vendor.id, before, after: vendor.toJSON(), ip: req.ip });
  okResponse(res, vendor);
});

exports.remove = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!vendor) return errorResponse(res, 'NOT_FOUND', 'Vendor not found', 404);
  await vendor.update({ deleted_at: new Date(), status: 'archived' });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'vendor.archived', entityType: 'Vendor', entityId: vendor.id, ip: req.ip });
  okResponse(res, { message: 'Vendor archived' });
});

exports.getScores = asyncHandler(async (req, res) => {
  const scores = await VendorScore.findAll({ where: { vendor_id: req.params.id, company_id: req.companyId }, order: [['period', 'DESC']], limit: 12 });
  okResponse(res, scores);
});

exports.uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) return errorResponse(res, 'VALIDATION_ERROR', 'File required');
  const doc = await VendorDocument.create({ vendor_id: req.params.id, type: req.body.type || 'other', file_url: req.file.path || req.file.location || req.file.originalname, uploaded_by: req.user.id });
  okResponse(res, doc, 201);
});

exports.compare = asyncHandler(async (req, res) => {
  const ids = (req.query.ids || '').split(',').filter(Boolean);
  if (ids.length < 2) return errorResponse(res, 'VALIDATION_ERROR', 'Provide at least 2 vendor ids');
  const vendors = await Vendor.findAll({ where: { id: ids, company_id: req.companyId }, include: [VendorScore] });
  okResponse(res, vendors);
});
