const { Bill, BillItem, Item, Inventory } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse, generateCode } = require('../utils/helpers');
const { audit } = require('../middleware/audit');
const sequelize = require('../config/db');

// ── GET /billing ──────────────────────────────────────────────────────
exports.list = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId };
  const result = await Bill.findAndCountAll({
    where, limit, offset,
    include: [{ model: BillItem, as: 'items' }],
    order: [['created_at', 'DESC']],
  });
  paginatedResponse(res, result, { page, perPage });
});

exports.getOne = asyncHandler(async (req, res) => {
  const bill = await Bill.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [{ model: BillItem, as: 'items' }] });
  if (!bill) return errorResponse(res, 'NOT_FOUND', 'Bill not found', 404);
  okResponse(res, bill);
});

// ── POST /billing ─────────────────────────────────────────────────────
// Sells item-master items to a customer, reducing inventory for each line.
// Uses the item master as the source of truth (item_id required, not
// freetext) so stock stays consistent with GRN receipts.
exports.create = asyncHandler(async (req, res) => {
  const { customer_name, customer_contact, items } = req.body;
  if (!customer_name || !items?.length)
    return errorResponse(res, 'VALIDATION_ERROR', 'customer_name and items required');

  // Validate every line has enough stock before committing any of them.
  const stockChecks = [];
  for (const line of items) {
    if (!line.item_id || !line.quantity) return errorResponse(res, 'VALIDATION_ERROR', 'Each item requires item_id and quantity');
    const item = await Item.findOne({ where: { id: line.item_id, company_id: req.companyId, deleted_at: null } });
    if (!item) return errorResponse(res, 'NOT_FOUND', `Item ${line.item_id} not found`, 404);
    const inv = await Inventory.findOne({ where: { item_id: item.id, company_id: req.companyId } });
    const available = parseFloat(inv?.current_stock || 0);
    if (available < parseFloat(line.quantity)) {
      return errorResponse(res, 'INSUFFICIENT_STOCK', `Insufficient stock for "${item.name}" — available ${available}, requested ${line.quantity}`, 409);
    }
    stockChecks.push({ item, line });
  }

  const bill_number = await generateCode(Bill, 'BILL', 'bill_number', req.companyId);
  const total_amount = stockChecks.reduce((sum, { line }) => sum + (parseFloat(line.quantity) * parseFloat(line.unit_price || 0)), 0);

  const result = await sequelize.transaction(async (t) => {
    const bill = await Bill.create({
      company_id: req.companyId, bill_number, customer_name, customer_contact,
      total_amount, status: 'issued', created_by: req.user.id,
    }, { transaction: t });

    await BillItem.bulkCreate(stockChecks.map(({ item, line }) => ({
      bill_id: bill.id, item_id: item.id, item_name: item.name,
      quantity: line.quantity, unit_price: line.unit_price || 0,
      total_price: parseFloat(line.quantity) * parseFloat(line.unit_price || 0),
    })), { transaction: t });

    for (const { item, line } of stockChecks) {
      await Inventory.decrement('current_stock', { by: parseFloat(line.quantity), where: { item_id: item.id, company_id: req.companyId }, transaction: t });
      await Inventory.update({ last_updated_at: new Date() }, { where: { item_id: item.id, company_id: req.companyId }, transaction: t });
    }
    return bill;
  });

  await audit({ companyId: req.companyId, userId: req.user.id, action: 'bill.created', entityType: 'Bill', entityId: result.id, after: { bill_number, total_amount }, ip: req.ip });
  const bill = await Bill.findByPk(result.id, { include: [{ model: BillItem, as: 'items' }] });
  okResponse(res, bill, 201);
});
