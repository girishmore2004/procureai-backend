const { Quote, QuoteItem, Vendor, AiRecommendation, RfqVendor, PurchaseOrder, PoItem, AiExtraction } = require('../models');
const { Op } = require('sequelize');
const { asyncHandler } = require('../middleware/errorHandler');
const { okResponse, errorResponse, generateCode } = require('../utils/helpers');
const { audit } = require('../middleware/audit');
const { generateRecommendation } = require('../services/aiService');

exports.getOne = asyncHandler(async (req, res) => {
  const quote = await Quote.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [
      { model: QuoteItem, as: 'items' },
      Vendor,
      { model: AiExtraction, where: { source_table: 'quote' }, required: false },
    ],
  });
  if (!quote) return errorResponse(res, 'NOT_FOUND', 'Quote not found', 404);
  okResponse(res, quote);
});

exports.reprocess = asyncHandler(async (req, res) => {
  const quote = await Quote.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!quote) return errorResponse(res, 'NOT_FOUND', 'Quote not found', 404);
  if (!quote.source_file_url || quote.source_file_url.startsWith('[buffer]')) {
    // File was processed from memory buffer — original bytes not stored on disk or S3.
    // Cannot re-extract without the file. Prompt user to enter manually.
    return errorResponse(res, 'INVALID_STATE',
      'The original file is no longer available for re-extraction (it was processed from memory). ' +
      'Please edit the line items manually below or ask the vendor to resubmit their quote.', 400);
  }
  await quote.update({ extraction_status: 'pending', extraction_note: null });
  const { extractQuoteFromFile } = require('../services/aiService');
  try {
    await extractQuoteFromFile(quote.id, quote.source_file_url);
  } catch (e) {
    console.error('[Quote reprocess] failed:', e.message);
  }
  await quote.reload();
  okResponse(res, {
    message: 'Reprocessing complete',
    extraction_status: quote.extraction_status,
    extraction_note: quote.extraction_note,
  });
});

exports.updateItem = asyncHandler(async (req, res) => {
  // Previously this only checked quote_id, not company_id — any authenticated
  // user could edit another company's quote line items (pricing data) by
  // guessing the IDs. This also underpinned deleteItem below.
  const quote = await Quote.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!quote) return errorResponse(res, 'NOT_FOUND', 'Quote not found', 404);
  const item = await QuoteItem.findOne({ where: { id: req.params.item_id, quote_id: req.params.id } });
  if (!item) return errorResponse(res, 'NOT_FOUND', 'Quote item not found', 404);
  const allowed = ['item_name_raw', 'quantity', 'unit_price', 'total_price', 'tax', 'freight', 'discount', 'warranty', 'availability', 'notes'];
  allowed.forEach((f) => { if (req.body[f] !== undefined) item[f] = req.body[f]; });
  item.confidence_score = 1.0;
  await item.save();
  const items = await QuoteItem.findAll({ where: { quote_id: req.params.id } });
  const total = items.reduce((s, i) => s + parseFloat(i.total_price || 0), 0);
  await Quote.update({ total_amount: total }, { where: { id: req.params.id, company_id: req.companyId } });
  okResponse(res, item);
});

exports.addItem = asyncHandler(async (req, res) => {
  const quote = await Quote.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!quote) return errorResponse(res, 'NOT_FOUND', 'Quote not found', 404);
  const { item_name_raw, quantity, unit_price, total_price, tax, freight } = req.body;
  if (!item_name_raw) return errorResponse(res, 'VALIDATION_ERROR', 'item_name_raw required');
  const item = await QuoteItem.create({
    quote_id: quote.id,
    item_name_raw,
    quantity: parseFloat(quantity) || 0,
    unit_price: parseFloat(unit_price) || 0,
    total_price: parseFloat(total_price) || (parseFloat(quantity || 0) * parseFloat(unit_price || 0)),
    tax: parseFloat(tax) || 0,
    freight: parseFloat(freight) || 0,
    confidence_score: 1.0,
  });
  const allItems = await QuoteItem.findAll({ where: { quote_id: quote.id } });
  const total = allItems.reduce((s, i) => s + parseFloat(i.total_price || 0), 0);
  await quote.update({ total_amount: total });
  okResponse(res, item, 201);
});

exports.deleteItem = asyncHandler(async (req, res) => {
  const quote = await Quote.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!quote) return errorResponse(res, 'NOT_FOUND', 'Quote not found', 404);
  const item = await QuoteItem.findOne({ where: { id: req.params.item_id, quote_id: req.params.id } });
  if (!item) return errorResponse(res, 'NOT_FOUND', 'Quote item not found', 404);
  await item.destroy();
  const allItems = await QuoteItem.findAll({ where: { quote_id: req.params.id } });
  const total = allItems.reduce((s, i) => s + parseFloat(i.total_price || 0), 0);
  await Quote.update({ total_amount: total }, { where: { id: req.params.id, company_id: req.companyId } });
  okResponse(res, { message: 'Item deleted' });
});

exports.reviewComplete = asyncHandler(async (req, res) => {
  const quote = await Quote.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!quote) return errorResponse(res, 'NOT_FOUND', 'Quote not found', 404);
  await quote.update({ extraction_status: 'done', extraction_note: null });
  await AiExtraction.update(
    { reviewed_by: req.user.id, reviewed_at: new Date() },
    { where: { source_table: 'quote', source_id: quote.id } }
  );
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'quote.reviewed', entityType: 'Quote', entityId: quote.id, ip: req.ip });
  okResponse(res, { message: 'Quote review complete' });
});

exports.getComparison = asyncHandler(async (req, res) => {
  const rfqId = req.params.id;

  const allQuotes = await Quote.findAll({
    where: { company_id: req.companyId, status: { [Op.notIn]: ['superseded', 'rejected'] } },
    include: [
      { model: RfqVendor, as: 'RfqVendor', where: { rfq_id: rfqId }, required: true },
      { model: QuoteItem, as: 'items' },
      { model: Vendor },
    ],
    order: [['created_at', 'DESC']],
  });

  // Deduplicate by vendor_id — same vendor may have submitted multiple quotes
  // (file upload + manual entry, or corrected submission).
  // Priority: done > needs_review > submitted/pending/processing > failed
  const STATUS_RANK = { done: 5, needs_review: 4, submitted: 3, pending: 2, processing: 2, failed: 1 };
  const vendorBestQuote = {};
  for (const q of allQuotes) {
    const existing = vendorBestQuote[q.vendor_id];
    const currentRank = STATUS_RANK[q.extraction_status] || 0;
    const existingRank = existing ? (STATUS_RANK[existing.extraction_status] || 0) : -1;
    if (!existing || currentRank > existingRank) {
      vendorBestQuote[q.vendor_id] = q;
    }
  }
  const quotes = Object.values(vendorBestQuote);

  // Track which vendors have failed quotes (for UI warning)
  const failedVendors = [];
  const seenVendors = {};
  for (const q of allQuotes) {
    if (!seenVendors[q.vendor_id]) seenVendors[q.vendor_id] = [];
    seenVendors[q.vendor_id].push(q.extraction_status);
  }
  for (const [vid, statuses] of Object.entries(seenVendors)) {
    if (statuses.includes('failed') && statuses.some((s) => s !== 'failed')) {
      // Has both failed and non-failed — already handled by dedup, no extra warning needed
    } else if (statuses.every((s) => s === 'failed')) {
      const failedQuote = allQuotes.find((q) => q.vendor_id === vid && q.extraction_status === 'failed');
      failedVendors.push({
        vendor_name: failedQuote?.Vendor?.name,
        extraction_note: failedQuote?.extraction_note,
      });
    }
  }

  const comparison = quotes.map((q) => ({
    quote_id: q.id,
    vendor: { id: q.Vendor?.id, name: q.Vendor?.name, rating: q.Vendor?.rating },
    total_amount: q.total_amount,
    landed_cost: (parseFloat(q.total_amount) || 0) +
      (q.items || []).reduce((s, i) => s + parseFloat(i.freight || 0) + parseFloat(i.tax || 0), 0),
    delivery_time_days: q.delivery_time_days,
    payment_terms: q.payment_terms,
    validity_date: q.validity_date,
    ai_recommended: q.ai_recommended,
    ai_confidence: q.ai_confidence,
    extraction_status: q.extraction_status,
    extraction_note: q.extraction_note,
    items: q.items,
  }));

  const recommendation = await AiRecommendation.findOne({
    where: { rfq_id: rfqId, company_id: req.companyId },
    order: [['created_at', 'DESC']],
  });

  okResponse(res, { quotes: comparison, recommendation, failed_vendors: failedVendors });
});

exports.recommend = asyncHandler(async (req, res) => {
  const rec = await generateRecommendation(req.params.id, req.companyId);
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'ai.recommendation_generated', entityType: 'Rfq', entityId: req.params.id, ip: req.ip });
  okResponse(res, rec);
});

exports.selectVendor = asyncHandler(async (req, res) => {
  const { quote_id, override_reason } = req.body;
  if (!quote_id) return errorResponse(res, 'VALIDATION_ERROR', 'quote_id required');
  const quote = await Quote.findOne({
    where: { id: quote_id, company_id: req.companyId },
    include: [{ model: QuoteItem, as: 'items' }, { model: RfqVendor, as: 'RfqVendor' }],
  });
  if (!quote) return errorResponse(res, 'NOT_FOUND', 'Quote not found', 404);

  const rv = await RfqVendor.findByPk(quote.rfq_vendor_id);
  if (rv) {
    const allRv = await RfqVendor.findAll({ where: { rfq_id: rv.rfq_id } });
    const allRvIds = allRv.map((r) => r.id);
    await Quote.update({ status: 'rejected' }, { where: { rfq_vendor_id: allRvIds, company_id: req.companyId } });
  }
  await quote.update({ status: 'selected' });

  if (override_reason) {
    const rec = await AiRecommendation.findOne({ where: { rfq_id: rv?.rfq_id, company_id: req.companyId }, order: [['created_at', 'DESC']] });
    if (rec && rec.recommended_quote_id !== quote_id) await rec.update({ overridden_by: req.user.id });
  }

  // Auto-create draft PO from selected quote
  let po = await PurchaseOrder.findOne({ where: { quote_id: quote.id, company_id: req.companyId } });
  if (!po) {
    const po_number = await generateCode(PurchaseOrder, 'PO', 'po_number', req.companyId);
    po = await PurchaseOrder.create({
      company_id: req.companyId, rfq_id: rv?.rfq_id, quote_id: quote.id,
      vendor_id: quote.vendor_id, po_number, status: 'draft',
      total_amount: quote.total_amount, created_by: req.user.id,
    });
    if (quote.items?.length) {
      await PoItem.bulkCreate(quote.items.map((qi) => ({
        purchase_order_id: po.id, item_id: qi.item_id || null,
        item_name: qi.item_name_raw, quantity: qi.quantity,
        unit_price: qi.unit_price, total_price: qi.total_price,
      })));
    }
    await audit({ companyId: req.companyId, userId: req.user.id, action: 'po.created', entityType: 'PurchaseOrder', entityId: po.id, after: { po_number, from_quote: quote.id }, ip: req.ip });
  }

  await audit({ companyId: req.companyId, userId: req.user.id, action: 'quote.vendor_selected', entityType: 'Quote', entityId: quote.id, after: { override_reason }, ip: req.ip });
  okResponse(res, { message: 'Vendor selected', quote_id, purchase_order_id: po.id, po_number: po.po_number });
});
