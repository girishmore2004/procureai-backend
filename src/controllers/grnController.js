const { GoodsReceipt, GoodsReceiptItem, PurchaseOrder, PoItem, Inventory, Vendor } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse } = require('../utils/helpers');
const { audit } = require('../middleware/audit');

exports.list = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId };
  if (req.query.status) where.status = req.query.status;
  if (req.query.purchase_order_id) where.purchase_order_id = req.query.purchase_order_id;
  const result = await GoodsReceipt.findAndCountAll({
    where, limit, offset,
    include: [{ model: PurchaseOrder, include: [Vendor] }, { model: GoodsReceiptItem, as: 'items' }],
    order: [['created_at', 'DESC']],
  });
  paginatedResponse(res, result, { page, perPage });
});

exports.create = asyncHandler(async (req, res) => {
  const { purchase_order_id, received_date, notes, items } = req.body;
  if (!purchase_order_id || !items?.length)
    return errorResponse(res, 'VALIDATION_ERROR', 'purchase_order_id and items required');
  const po = await PurchaseOrder.findOne({ where: { id: purchase_order_id, company_id: req.companyId } });
  if (!po) return errorResponse(res, 'NOT_FOUND', 'PO not found', 404);
  const grn = await GoodsReceipt.create({
    company_id: req.companyId, purchase_order_id, received_by: req.user.id,
    received_date: received_date || new Date(), notes, status: 'pending_inspection',
  });
  await GoodsReceiptItem.bulkCreate(items.map((i) => ({
    goods_receipt_id: grn.id, po_item_id: i.po_item_id,
    quantity_received: i.quantity_received, quantity_damaged: i.quantity_damaged || 0,
    quantity_shortage: i.quantity_shortage || 0, photo_urls: i.photo_urls || [], inspection_status: 'pending',
  })));
  for (const i of items) {
    await PoItem.increment('received_quantity', { by: parseFloat(i.quantity_received) || 0, where: { id: i.po_item_id } });
  }
  const poItems = await PoItem.findAll({ where: { purchase_order_id } });
  const allReceived = poItems.every((pi) => parseFloat(pi.received_quantity) >= parseFloat(pi.quantity));
  await po.update({ status: allReceived ? 'received' : 'partially_received' });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'grn.created', entityType: 'GoodsReceipt', entityId: grn.id, ip: req.ip });
  okResponse(res, grn, 201);
});

exports.getOne = asyncHandler(async (req, res) => {
  const grn = await GoodsReceipt.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [{ model: GoodsReceiptItem, as: 'items' }, { model: PurchaseOrder, include: [Vendor] }],
  });
  if (!grn) return errorResponse(res, 'NOT_FOUND', 'GRN not found', 404);
  okResponse(res, grn);
});

exports.inspect = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  if (!['accepted', 'rejected', 'partial'].includes(status))
    return errorResponse(res, 'VALIDATION_ERROR', 'status must be accepted/rejected/partial');
  const grn = await GoodsReceipt.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [{ model: GoodsReceiptItem, as: 'items' }],
  });
  if (!grn) return errorResponse(res, 'NOT_FOUND', 'GRN not found', 404);
  await grn.update({ status, notes: notes || grn.notes });
  if (['accepted', 'partial'].includes(status)) {
    for (const gri of grn.items) {
      const poItem = await PoItem.findByPk(gri.po_item_id);
      if (poItem?.item_id) {
        const goodQty = parseFloat(gri.quantity_received) - parseFloat(gri.quantity_damaged || 0);
        if (goodQty > 0) {
          await Inventory.increment('current_stock', { by: goodQty, where: { item_id: poItem.item_id, company_id: req.companyId } });
          await Inventory.update({ last_updated_at: new Date() }, { where: { item_id: poItem.item_id, company_id: req.companyId } });
        }
      }
    }
  }
  await audit({ companyId: req.companyId, userId: req.user.id, action: `grn.${status}`, entityType: 'GoodsReceipt', entityId: grn.id, ip: req.ip });
  okResponse(res, { message: `GRN ${status}` });
});
