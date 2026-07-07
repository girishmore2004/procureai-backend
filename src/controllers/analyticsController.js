const sequelize = require('../config/db');
const { QueryTypes } = require('sequelize');
const { asyncHandler } = require('../middleware/errorHandler');
const { okResponse } = require('../utils/helpers');

exports.getSpend = asyncHandler(async (req, res) => {
  const { from, to, group_by = 'vendor' } = req.query;
  // from/to were previously interpolated directly into the SQL string (SQL injection).
  // Now passed as bound replacements like companyId already was.
  const dateFilter = from && to ? `AND po.created_at BETWEEN :from AND :to` : '';
  let query, label;
  if (group_by === 'vendor') {
    label = 'vendor_name'; query = `SELECT v.name AS vendor_name, SUM(po.total_amount) AS total_spend, COUNT(po.id) AS order_count FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id WHERE po.company_id = :companyId AND po.status NOT IN ('cancelled','draft') ${dateFilter} GROUP BY v.name ORDER BY total_spend DESC LIMIT 20`;
  } else {
    label = 'category'; query = `SELECT i.category, SUM(pi.total_price) AS total_spend FROM po_items pi JOIN purchase_orders po ON po.id = pi.purchase_order_id JOIN items i ON i.id = pi.item_id WHERE po.company_id = :companyId AND po.status NOT IN ('cancelled','draft') ${dateFilter} GROUP BY i.category ORDER BY total_spend DESC LIMIT 20`;
  }
  const rows = await sequelize.query(query, { replacements: { companyId: req.companyId, from, to }, type: QueryTypes.SELECT });
  okResponse(res, rows);
});

exports.getCycleTimes = asyncHandler(async (req, res) => {
  const rows = await sequelize.query(`
    SELECT 
      AVG(EXTRACT(EPOCH FROM (a.acted_at - pr.created_at))/3600) AS avg_pr_to_approval_hours,
      AVG(EXTRACT(EPOCH FROM (po.created_at - q.created_at))/3600) AS avg_quote_to_po_hours,
      COUNT(DISTINCT po.id) AS total_pos
    FROM purchase_orders po
    LEFT JOIN quotes q ON q.id = po.quote_id
    LEFT JOIN approvals a ON a.approvable_type='purchase_request' AND a.status='approved'
    LEFT JOIN purchase_requests pr ON pr.id = q.rfq_vendor_id
    WHERE po.company_id = :companyId
  `, { replacements: { companyId: req.companyId }, type: QueryTypes.SELECT });
  okResponse(res, rows[0] || {});
});

exports.getVendorPerformance = asyncHandler(async (req, res) => {
  const rows = await sequelize.query(`
    SELECT vs.period, v.name AS vendor_name, vs.overall_score, vs.delivery_reliability, vs.response_time_score, vs.price_competitiveness
    FROM vendor_scores vs JOIN vendors v ON v.id = vs.vendor_id
    WHERE vs.company_id = :companyId ORDER BY vs.period DESC, vs.overall_score DESC LIMIT 100
  `, { replacements: { companyId: req.companyId }, type: QueryTypes.SELECT });
  okResponse(res, rows);
});

exports.getSavings = asyncHandler(async (req, res) => {
  const rows = await sequelize.query(`
    SELECT SUM(ar.savings_estimate) AS total_savings, COUNT(ar.id) AS recommendation_count,
    COUNT(ar.overridden_by) AS override_count
    FROM ai_recommendations ar WHERE ar.company_id = :companyId
  `, { replacements: { companyId: req.companyId }, type: QueryTypes.SELECT });
  okResponse(res, rows[0] || { total_savings: 0 });
});

exports.getDashboardKpis = asyncHandler(async (req, res) => {
  // NOTE: with { type: QueryTypes.SELECT }, sequelize.query() returns the rows
  // array directly (not a [rows, metadata] tuple). `const [pr] = await ...`
  // was destructuring the first ROW OBJECT itself into `pr`, so `pr[0]` below
  // was always undefined and every KPI silently reported 0.
  const [pr] = await sequelize.query(`SELECT COUNT(*) AS open_requests FROM purchase_requests WHERE company_id=:c AND status='pending_approval'`, { replacements: { c: req.companyId }, type: QueryTypes.SELECT });
  const [ap] = await sequelize.query(`SELECT COUNT(*) AS pending_approvals FROM approvals WHERE company_id=:c AND status='pending'`, { replacements: { c: req.companyId }, type: QueryTypes.SELECT });
  const [rfq] = await sequelize.query(`SELECT COUNT(*) AS awaiting_quotes FROM rfq_vendors WHERE status IN ('sent','opened') AND rfq_id IN (SELECT id FROM rfqs WHERE company_id=:c)`, { replacements: { c: req.companyId }, type: QueryTypes.SELECT });
  const [inv] = await sequelize.query(`SELECT COUNT(*) AS reorder_alerts FROM reorder_rules rr JOIN items i ON i.id=rr.item_id JOIN inventory inv ON inv.item_id=i.id WHERE i.company_id=:c AND inv.current_stock <= rr.reorder_point`, { replacements: { c: req.companyId }, type: QueryTypes.SELECT });
  const [inv_mm] = await sequelize.query(`SELECT COUNT(*) AS invoice_mismatches FROM invoices WHERE company_id=:c AND match_status='mismatched'`, { replacements: { c: req.companyId }, type: QueryTypes.SELECT });
  okResponse(res, {
    open_requests: parseInt(pr?.open_requests || 0),
    pending_approvals: parseInt(ap?.pending_approvals || 0),
    awaiting_quotes: parseInt(rfq?.awaiting_quotes || 0),
    reorder_alerts: parseInt(inv?.reorder_alerts || 0),
    invoice_mismatches: parseInt(inv_mm?.invoice_mismatches || 0),
  });
});
