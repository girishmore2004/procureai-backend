const { Op } = require('sequelize');
const XLSX = require('xlsx');
const { Item, Vendor, Inventory, ReorderRule } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse, generateCode } = require('../utils/helpers');
const { audit } = require('../middleware/audit');

exports.list = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId, deleted_at: null };
  if (req.query.category) where.category = req.query.category;
  if (req.query.status) where.status = req.query.status;
  if (req.query.search) where[Op.or] = [{ name: { [Op.iLike]: `%${req.query.search}%` } }, { item_code: { [Op.iLike]: `%${req.query.search}%` } }];
  const result = await Item.findAndCountAll({ where, include: [{ model: Vendor, as: 'PreferredVendor', foreignKey: 'preferred_vendor_id', required: false }], limit, offset, order: [['name', 'ASC']] });
  paginatedResponse(res, result, { page, perPage });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, category, subcategory, description, unit, brand, specification, hsn_sac, tax_rate, preferred_vendor_id, reorder_level, safety_stock, max_stock, avg_usage_per_month, lead_time_days } = req.body;
  if (!name) return errorResponse(res, 'VALIDATION_ERROR', 'Item name required');
  const item_code = await generateCode(Item, 'ITM', 'item_code', req.companyId);
  const item = await Item.create({ company_id: req.companyId, name, item_code, category, subcategory, description, unit, brand, specification, hsn_sac, tax_rate, preferred_vendor_id, reorder_level, safety_stock, max_stock, avg_usage_per_month, lead_time_days });
  // Auto-create inventory row
  await Inventory.findOrCreate({ where: { item_id: item.id, company_id: req.companyId }, defaults: { current_stock: 0 } });
  if (reorder_level) await ReorderRule.findOrCreate({ where: { item_id: item.id }, defaults: { reorder_point: reorder_level, reorder_quantity: avg_usage_per_month || 1 } });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'item.created', entityType: 'Item', entityId: item.id, after: item.toJSON(), ip: req.ip });
  okResponse(res, item, 201);
});

exports.importCsv = asyncHandler(async (req, res) => {
  if (!req.file) return errorResponse(res, 'VALIDATION_ERROR', 'File required');
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const results = { created: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name) { results.errors.push({ row: i + 2, message: 'name required' }); continue; }
    try {
      const item_code = await generateCode(Item, 'ITM', 'item_code', req.companyId);
      const item = await Item.create({ company_id: req.companyId, item_code, name: row.name, category: row.category, unit: row.unit, hsn_sac: row.hsn_sac, tax_rate: row.tax_rate, reorder_level: row.reorder_level });
      await Inventory.findOrCreate({ where: { item_id: item.id, company_id: req.companyId }, defaults: { current_stock: row.opening_stock || 0 } });
      results.created++;
    } catch (e) { results.errors.push({ row: i + 2, message: e.message }); }
  }
  okResponse(res, results);
});

exports.getOne = asyncHandler(async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [Inventory, ReorderRule] });
  if (!item) return errorResponse(res, 'NOT_FOUND', 'Item not found', 404);
  okResponse(res, item);
});

exports.update = asyncHandler(async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return errorResponse(res, 'NOT_FOUND', 'Item not found', 404);
  const before = item.toJSON();
  const allowed = ['name', 'category', 'subcategory', 'description', 'unit', 'brand', 'specification', 'hsn_sac', 'tax_rate', 'preferred_vendor_id', 'reorder_level', 'safety_stock', 'max_stock', 'avg_usage_per_month', 'lead_time_days', 'status'];
  allowed.forEach((f) => { if (req.body[f] !== undefined) item[f] = req.body[f]; });
  await item.save();
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'item.updated', entityType: 'Item', entityId: item.id, before, after: item.toJSON(), ip: req.ip });
  okResponse(res, item);
});

exports.remove = asyncHandler(async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return errorResponse(res, 'NOT_FOUND', 'Item not found', 404);
  await item.update({ deleted_at: new Date(), status: 'archived' });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'item.archived', entityType: 'Item', entityId: item.id, ip: req.ip });
  okResponse(res, { message: 'Item archived' });
});
