const { Inventory, ReorderRule, Item, VendorScore, PurchaseOrder, PoItem, Quote, RfqVendor } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { okResponse, errorResponse } = require('../utils/helpers');
const { Op } = require('sequelize');
const sequelize = require('../config/db');

// INVENTORY
exports.getInventory = asyncHandler(async (req, res) => {
  const rows = await Inventory.findAll({
    where: { company_id: req.companyId },
    include: [{ model: Item, where: { deleted_at: null, status: 'active' }, include: [ReorderRule] }],
    order: [[Item, 'name', 'ASC']],
  });
  const enriched = rows.map((inv) => {
    const rule = inv.Item?.ReorderRule;
    const stock = parseFloat(inv.current_stock);
    const reorder = rule ? parseFloat(rule.reorder_point) : null;
    let stockStatus = 'ok';
    if (reorder !== null) {
      if (stock <= 0) stockStatus = 'stockout';
      else if (stock <= reorder) stockStatus = 'reorder_now';
      else if (stock <= reorder * 1.25) stockStatus = 'low';
    }
    return { ...inv.toJSON(), stock_status: stockStatus };
  });
  okResponse(res, enriched);
});

exports.getReorderAlerts = asyncHandler(async (req, res) => {
  const rules = await ReorderRule.findAll({
    include: [{ model: Item, where: { company_id: req.companyId, deleted_at: null }, include: [Inventory] }],
  });
  const alerts = rules.filter((r) => {
    const stock = parseFloat(r.Item?.Inventory?.current_stock || 0);
    return stock <= parseFloat(r.reorder_point || 0);
  }).map((r) => ({
    item_id: r.item_id,
    item_name: r.Item?.name,
    item_code: r.Item?.item_code,
    current_stock: r.Item?.Inventory?.current_stock,
    reorder_point: r.reorder_point,
    reorder_quantity: r.reorder_quantity,
    unit: r.Item?.unit,
    days_until_stockout: r.Item?.avg_usage_per_month ? Math.floor(parseFloat(r.Item.Inventory?.current_stock || 0) / (parseFloat(r.Item.avg_usage_per_month) / 30)) : null,
  }));
  okResponse(res, alerts);
});

exports.updateReorderRule = asyncHandler(async (req, res) => {
  const { reorder_point, reorder_quantity, auto_alert } = req.body;
  const item = await Item.findOne({ where: { id: req.params.item_id, company_id: req.companyId } });
  if (!item) return errorResponse(res, 'NOT_FOUND', 'Item not found', 404);
  const [rule] = await ReorderRule.findOrCreate({ where: { item_id: item.id }, defaults: { reorder_point: 0, reorder_quantity: 1 } });
  if (reorder_point !== undefined) rule.reorder_point = reorder_point;
  if (reorder_quantity !== undefined) rule.reorder_quantity = reorder_quantity;
  if (auto_alert !== undefined) rule.auto_alert = auto_alert;
  await rule.save();
  okResponse(res, rule);
});

// VENDOR SCORING - computed from transaction history
exports.computeVendorScores = asyncHandler(async (req, res) => {
  const vendors = await require('../models').Vendor.findAll({ where: { company_id: req.companyId, status: 'active' } });
  const period = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const results = [];
  for (const vendor of vendors) {
    // Price competitiveness: avg (lowest quote / vendor quote) across RFQs
    const pos = await PurchaseOrder.findAll({ where: { vendor_id: vendor.id, company_id: req.companyId } });
    const deliveryScore = pos.length > 0 ? Math.min(10, pos.filter((p) => p.status === 'received').length / pos.length * 10) : 5;
    // Response time: avg time from rfq_sent to quote_responded
    const rvRows = await RfqVendor.findAll({ where: { vendor_id: vendor.id, status: 'responded' } });
    let responseScore = 5;
    if (rvRows.length) {
      const avgHours = rvRows.reduce((s, r) => {
        if (r.sent_at && r.responded_at) return s + (new Date(r.responded_at) - new Date(r.sent_at)) / 3600000;
        return s;
      }, 0) / rvRows.length;
      responseScore = avgHours < 24 ? 10 : avgHours < 48 ? 7 : avgHours < 96 ? 4 : 2;
    }
    const overall = (deliveryScore * 0.4 + responseScore * 0.3 + 5 * 0.3); // price component defaults to 5 without more data
    const [score] = await VendorScore.findOrCreate({ where: { vendor_id: vendor.id, company_id: req.companyId, period }, defaults: { delivery_reliability: deliveryScore, response_time_score: responseScore, quality_score: 5, price_competitiveness: 5, overall_score: overall } });
    await score.update({ delivery_reliability: deliveryScore, response_time_score: responseScore, overall_score: overall });
    await vendor.update({ rating: overall });
    results.push({ vendor_id: vendor.id, name: vendor.name, overall_score: overall });
  }
  okResponse(res, results);
});
