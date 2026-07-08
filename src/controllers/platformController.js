const sequelize = require('../config/db');
const { QueryTypes } = require('sequelize');
const { asyncHandler } = require('../middleware/errorHandler');
const { okResponse } = require('../utils/helpers');

// Every query in this file is intentionally NOT scoped by company_id — this
// is the one controller in the app that's supposed to see across all
// companies. Access is gated at the route level by requirePlatformAdmin
// (see middleware/auth.js), which checks req.user.is_platform_admin.
// Same raw-SQL-with-bound-replacements style as analyticsController.js,
// just without a :companyId filter.

const toNum = (v) => (v === null || v === undefined ? 0 : Number(v));

exports.getOverview = asyncHandler(async (req, res) => {
  const [counts] = await sequelize.query(`
    SELECT
      (SELECT COUNT(*) FROM companies) AS total_buyers,
      (SELECT COUNT(*) FROM vendors) AS total_vendors,
      (SELECT COUNT(*) FROM vendors WHERE status = 'active') AS active_vendors,
      (SELECT COUNT(*) FROM vendors WHERE portal_status = 'invited') AS pending_vendor_onboarding,
      (SELECT COUNT(*) FROM rfqs) AS total_rfqs,
      (SELECT COUNT(*) FROM purchase_orders) AS total_purchase_orders,
      (SELECT COUNT(*) FROM goods_receipts) AS total_goods_receipts,
      (SELECT COUNT(*) FROM invoices) AS total_invoices,
      (SELECT COUNT(*) FROM approvals WHERE status = 'pending') AS pending_approvals,
      (SELECT COUNT(*) FROM ai_extractions WHERE source_table = 'invoice' AND reviewed_at IS NULL) AS invoices_flagged_ai_review
  `, { type: QueryTypes.SELECT });

  const [quoteExtractionRows, matchStatusRows, paymentStatusRows] = await Promise.all([
    sequelize.query(`SELECT extraction_status AS status, COUNT(*) AS count FROM quotes GROUP BY extraction_status`, { type: QueryTypes.SELECT }),
    sequelize.query(`SELECT match_status AS status, COUNT(*) AS count FROM invoices GROUP BY match_status`, { type: QueryTypes.SELECT }),
    sequelize.query(`SELECT payment_status AS status, COUNT(*) AS count FROM invoices GROUP BY payment_status`, { type: QueryTypes.SELECT }),
  ]);

  const toMap = (rows) => rows.reduce((acc, r) => { acc[r.status] = toNum(r.count); return acc; }, {});

  okResponse(res, {
    total_buyers: toNum(counts.total_buyers),
    total_vendors: toNum(counts.total_vendors),
    active_vendors: toNum(counts.active_vendors),
    pending_vendor_onboarding: toNum(counts.pending_vendor_onboarding),
    total_rfqs: toNum(counts.total_rfqs),
    total_purchase_orders: toNum(counts.total_purchase_orders),
    total_goods_receipts: toNum(counts.total_goods_receipts),
    total_invoices: toNum(counts.total_invoices),
    pending_approvals: toNum(counts.pending_approvals),
    invoices_flagged_ai_review: toNum(counts.invoices_flagged_ai_review),
    quote_extraction_status: toMap(quoteExtractionRows),
    invoice_match_status: toMap(matchStatusRows),
    invoice_payment_status: toMap(paymentStatusRows),
  });
});

exports.getApprovalBottlenecks = asyncHandler(async (req, res) => {
  const [overdue] = await sequelize.query(
    `SELECT COUNT(*) AS overdue_pending_count FROM approvals WHERE status = 'pending' AND created_at < NOW() - INTERVAL '48 hours'`,
    { type: QueryTypes.SELECT },
  );
  const [decided] = await sequelize.query(`
    SELECT
      AVG(EXTRACT(EPOCH FROM (acted_at - created_at)) / 3600) AS avg_decision_hours,
      COUNT(*) FILTER (WHERE acted_at >= NOW() - INTERVAL '90 days') AS decided_last_90_days
    FROM approvals WHERE acted_at IS NOT NULL
  `, { type: QueryTypes.SELECT });
  const breakdown = await sequelize.query(
    `SELECT approvable_type, status, COUNT(*) AS count FROM approvals GROUP BY approvable_type, status ORDER BY approvable_type, status`,
    { type: QueryTypes.SELECT },
  );

  okResponse(res, {
    overdue_pending_count: toNum(overdue.overdue_pending_count),
    avg_decision_hours: decided.avg_decision_hours !== null ? Number(decided.avg_decision_hours) : null,
    decided_last_90_days: toNum(decided.decided_last_90_days),
    breakdown: breakdown.map((r) => ({ ...r, count: toNum(r.count) })),
  });
});

exports.getUsageTrends = asyncHandler(async (req, res) => {
  const rows = await sequelize.query(`
    SELECT
      to_char(d, 'YYYY-MM-DD') AS date,
      COALESCE(r.cnt, 0) AS rfqs,
      COALESCE(po.cnt, 0) AS purchase_orders,
      COALESCE(inv.cnt, 0) AS invoices
    FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') d
    LEFT JOIN (SELECT created_at::date AS day, COUNT(*) AS cnt FROM rfqs WHERE created_at >= CURRENT_DATE - INTERVAL '29 days' GROUP BY day) r ON r.day = d::date
    LEFT JOIN (SELECT created_at::date AS day, COUNT(*) AS cnt FROM purchase_orders WHERE created_at >= CURRENT_DATE - INTERVAL '29 days' GROUP BY day) po ON po.day = d::date
    LEFT JOIN (SELECT created_at::date AS day, COUNT(*) AS cnt FROM invoices WHERE created_at >= CURRENT_DATE - INTERVAL '29 days' GROUP BY day) inv ON inv.day = d::date
    ORDER BY d
  `, { type: QueryTypes.SELECT });

  okResponse(res, rows.map((r) => ({ date: r.date, rfqs: toNum(r.rfqs), purchase_orders: toNum(r.purchase_orders), invoices: toNum(r.invoices) })));
});

exports.getTopEntities = asyncHandler(async (req, res) => {
  const [top_vendors, top_buyers, top_categories] = await Promise.all([
    sequelize.query(`
      SELECT v.id AS vendor_id, v.name AS vendor_name, SUM(po.total_amount) AS total_spend, COUNT(po.id) AS order_count
      FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
      WHERE po.status NOT IN ('cancelled', 'draft')
      GROUP BY v.id, v.name ORDER BY total_spend DESC LIMIT 10
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT c.id AS company_id, c.name AS company_name, SUM(po.total_amount) AS total_spend, COUNT(po.id) AS order_count
      FROM purchase_orders po JOIN companies c ON c.id = po.company_id
      WHERE po.status NOT IN ('cancelled', 'draft')
      GROUP BY c.id, c.name ORDER BY total_spend DESC LIMIT 10
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT i.category, SUM(pi.total_price) AS total_spend
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.purchase_order_id
      JOIN items i ON i.id = pi.item_id
      WHERE po.status NOT IN ('cancelled', 'draft') AND i.category IS NOT NULL
      GROUP BY i.category ORDER BY total_spend DESC LIMIT 10
    `, { type: QueryTypes.SELECT }),
  ]);

  okResponse(res, {
    top_vendors: top_vendors.map((r) => ({ ...r, total_spend: toNum(r.total_spend), order_count: toNum(r.order_count) })),
    top_buyers: top_buyers.map((r) => ({ ...r, total_spend: toNum(r.total_spend), order_count: toNum(r.order_count) })),
    top_categories: top_categories.map((r) => ({ ...r, total_spend: toNum(r.total_spend) })),
  });
});

exports.getAlerts = asyncHandler(async (req, res) => {
  const [overdue_approvals, mismatched_invoices, rejected_purchase_orders, quote_extraction_issues] = await Promise.all([
    sequelize.query(`
      SELECT a.id, c.name AS company_name, a.approvable_type, a.level, a.created_at
      FROM approvals a JOIN companies c ON c.id = a.company_id
      WHERE a.status = 'pending' AND a.created_at < NOW() - INTERVAL '48 hours'
      ORDER BY a.created_at ASC LIMIT 20
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT inv.id, c.name AS company_name, inv.invoice_number, inv.mismatch_reason
      FROM invoices inv JOIN companies c ON c.id = inv.company_id
      WHERE inv.match_status = 'mismatched'
      ORDER BY inv.created_at DESC LIMIT 20
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT po.id, c.name AS company_name, po.po_number, po.created_at
      FROM purchase_orders po JOIN companies c ON c.id = po.company_id
      WHERE po.status = 'rejected'
      ORDER BY po.created_at DESC LIMIT 20
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT q.id, c.name AS company_name, q.extraction_status, q.extraction_note
      FROM quotes q JOIN companies c ON c.id = q.company_id
      WHERE q.extraction_status IN ('failed', 'needs_review')
      ORDER BY q.created_at DESC LIMIT 20
    `, { type: QueryTypes.SELECT }),
  ]);

  okResponse(res, { overdue_approvals, mismatched_invoices, rejected_purchase_orders, quote_extraction_issues });
});
