const XLSX = require('xlsx');
const { asyncHandler } = require('../middleware/errorHandler');
const { errorResponse } = require('../utils/helpers');
const { PurchaseOrder, PoItem, Vendor, Quote, QuoteItem, RfqVendor } = require('../models');

const sendXlsx = (res, wb, filename) => {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

exports.exportComparison = asyncHandler(async (req, res) => {
  const { rfq_id } = req.query;
  if (!rfq_id) return errorResponse(res, 'VALIDATION_ERROR', 'rfq_id required');

  const quotes = await Quote.findAll({
    where: { company_id: req.companyId },
    include: [
      { model: RfqVendor, as: 'RfqVendor', where: { rfq_id }, required: true },
      { model: QuoteItem, as: 'items' },
      { model: Vendor },
    ],
  });

  const rows = quotes.flatMap((q) =>
    (q.items || []).map((it) => ({
      Vendor: q.Vendor?.name,
      'Item Name': it.item_name_raw,
      Quantity: it.quantity,
      'Unit Price (₹)': it.unit_price,
      'Total Price (₹)': it.total_price,
      'Tax (₹)': it.tax,
      'Freight (₹)': it.freight,
      'Delivery (days)': q.delivery_time_days,
      'Payment Terms': q.payment_terms,
      'AI Recommended': q.ai_recommended ? 'Yes' : 'No',
      'Confidence': q.ai_confidence ? `${(q.ai_confidence * 100).toFixed(0)}%` : '—',
    }))
  );

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Comparison');
  sendXlsx(res, wb, `Quote-Comparison-${rfq_id.slice(-6)}.xlsx`);
});

exports.exportPurchaseOrders = asyncHandler(async (req, res) => {
  const pos = await PurchaseOrder.findAll({
    where: { company_id: req.companyId },
    include: [Vendor, { model: PoItem, as: 'items' }],
    order: [['created_at', 'DESC']],
    limit: 500,
  });

  const rows = pos.flatMap((po) =>
    (po.items || [{ item_name: 'N/A', quantity: 0, unit_price: 0, total_price: 0 }]).map((it) => ({
      'PO Number': po.po_number,
      Vendor: po.Vendor?.name,
      'Item Name': it.item_name,
      Quantity: it.quantity,
      'Unit Price (₹)': it.unit_price,
      'Total Price (₹)': it.total_price,
      Status: po.status,
      'Expected Delivery': po.expected_delivery_date,
      'Created At': po.created_at?.toISOString().slice(0, 10),
    }))
  );

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Purchase Orders');
  sendXlsx(res, wb, 'Purchase-Orders.xlsx');
});

exports.exportVendors = asyncHandler(async (req, res) => {
  const vendors = await Vendor.findAll({ where: { company_id: req.companyId, deleted_at: null }, limit: 1000 });
  const rows = vendors.map((v) => ({
    'Vendor Code': v.vendor_code,
    Name: v.name,
    'Legal Name': v.legal_name,
    Email: v.email,
    Phone: v.phone,
    GSTIN: v.gstin,
    'Payment Terms': v.payment_terms,
    'Lead Time (days)': v.lead_time_days,
    Categories: v.categories?.join(', '),
    Rating: v.rating,
    Status: v.status,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vendors');
  sendXlsx(res, wb, 'Vendors.xlsx');
});

exports.exportSpendReport = asyncHandler(async (req, res) => {
  const sequelize = require('../config/db');
  const { QueryTypes } = require('sequelize');
  const rows = await sequelize.query(
    `SELECT v.name AS vendor_name, i.category, pi.item_name, SUM(pi.total_price) AS total_spend, COUNT(po.id) AS order_count
     FROM po_items pi
     JOIN purchase_orders po ON po.id = pi.purchase_order_id
     JOIN vendors v ON v.id = po.vendor_id
     LEFT JOIN items i ON i.id = pi.item_id
     WHERE po.company_id = :companyId AND po.status NOT IN ('cancelled','draft')
     GROUP BY v.name, i.category, pi.item_name
     ORDER BY total_spend DESC`,
    { replacements: { companyId: req.companyId }, type: QueryTypes.SELECT }
  );
  const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
    Vendor: r.vendor_name,
    Category: r.category || '—',
    Item: r.item_name,
    'Total Spend (₹)': parseFloat(r.total_spend || 0).toFixed(2),
    'Order Count': r.order_count,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Spend Report');
  sendXlsx(res, wb, 'Spend-Report.xlsx');
});
