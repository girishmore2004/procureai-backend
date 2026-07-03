const { v4: uuidv4 } = require('uuid');
const { Rfq, RfqVendor, Vendor, PurchaseRequest, PurchaseRequestItem, Quote } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse, generateCode } = require('../utils/helpers');
const { audit } = require('../middleware/audit');
// const { sendRfqEmail } = require('../services/emailService');
// const { notifyUser } = require('../services/notificationService');
const { sendRfqEmail, notifyUser } = require('../services/notificationService');
exports.list = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId };
  if (req.query.status) where.status = req.query.status;
  const result = await Rfq.findAndCountAll({ where, limit, offset, include: [{ model: RfqVendor, as: 'rfqVendors', include: [Vendor] }], order: [['created_at', 'DESC']] });
  paginatedResponse(res, result, { page, perPage });
});

exports.create = asyncHandler(async (req, res) => {
  const { purchase_request_id, vendor_ids, deadline, delivery_location, terms, special_instructions } = req.body;
  if (!purchase_request_id || !vendor_ids?.length)
    return errorResponse(res, 'VALIDATION_ERROR', 'purchase_request_id and vendor_ids required');
  const pr = await PurchaseRequest.findOne({ where: { id: purchase_request_id, company_id: req.companyId } });
  if (!pr) return errorResponse(res, 'NOT_FOUND', 'Purchase Request not found', 404);
  if (pr.status !== 'approved') return errorResponse(res, 'INVALID_STATE', 'PR must be approved before creating RFQ', 409);
  const rfq_number = await generateCode(Rfq, 'RFQ', 'rfq_number', req.companyId);
  const rfq = await Rfq.create({ company_id: req.companyId, purchase_request_id, created_by: req.user.id, deadline, delivery_location, terms, special_instructions, rfq_number, status: 'draft' });
  // Create rfq_vendor rows with unique access tokens
  await RfqVendor.bulkCreate(vendor_ids.map((vid) => ({ rfq_id: rfq.id, vendor_id: vid, access_token: uuidv4(), status: 'pending' })));
  await pr.update({ status: 'converted_to_rfq' });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'rfq.created', entityType: 'Rfq', entityId: rfq.id, after: { rfq_number }, ip: req.ip });
  okResponse(res, rfq, 201);
});

exports.getOne = asyncHandler(async (req, res) => {
  const rfq = await Rfq.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [{ model: RfqVendor, as: 'rfqVendors', include: [Vendor, Quote] }, { model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items' }] }],
  });
  if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);
  okResponse(res, rfq);
});

// Add one or more vendors to an RFQ that already exists — used when the buyer
// wants to bring in another vendor after the RFQ was created (and possibly
// already sent). Never touches vendors already on the RFQ, so their
// tokens/status/responses are left alone.
exports.addVendors = asyncHandler(async (req, res) => {
  const { vendor_ids } = req.body;
  if (!vendor_ids?.length) return errorResponse(res, 'VALIDATION_ERROR', 'vendor_ids required');

  const rfq = await Rfq.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [{ model: RfqVendor, as: 'rfqVendors' }, { model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items' }] }],
  });
  if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);

  const existingIds = new Set(rfq.rfqVendors.map((rv) => rv.vendor_id));
  const newVendorIds = [...new Set(vendor_ids)].filter((vid) => !existingIds.has(vid));
  if (!newVendorIds.length) return errorResponse(res, 'VALIDATION_ERROR', 'Selected vendor(s) are already on this RFQ');

  const created = await RfqVendor.bulkCreate(
    newVendorIds.map((vid) => ({ rfq_id: rfq.id, vendor_id: vid, access_token: uuidv4(), status: 'pending' })),
    { returning: true }
  );

  // If the RFQ already went out to the original vendors, email just the new
  // ones now instead of waiting for a "Send" action that only fires once.
  const results = [];
  if (rfq.status === 'sent') {
    const newRows = await RfqVendor.findAll({ where: { id: created.map((c) => c.id) }, include: [Vendor] });
    for (const rv of newRows) {
      const uploadLink = `${process.env.APP_URL}/vendor/quote/${rv.access_token}`;
      try {
        await sendRfqEmail({ vendor: rv.Vendor, rfq, items: rfq.PurchaseRequest?.items || [], uploadLink });
        await rv.update({ sent_at: new Date(), status: 'sent', channel: 'email' });
        results.push({ vendor_id: rv.vendor_id, status: 'sent' });
      } catch (e) {
        results.push({ vendor_id: rv.vendor_id, status: 'failed', error: e.message });
      }
    }
  }

  await audit({ companyId: req.companyId, userId: req.user.id, action: 'rfq.vendors_added', entityType: 'Rfq', entityId: rfq.id, after: { vendor_ids: newVendorIds }, ip: req.ip });
  okResponse(res, { added: newVendorIds.length, results }, 201);
});

exports.send = asyncHandler(async (req, res) => {
  const rfq = await Rfq.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [{ model: RfqVendor, as: 'rfqVendors', include: [Vendor] }, { model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items' }] }] });
  if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);
  const results = [];
  for (const rv of rfq.rfqVendors) {
    const uploadLink = `${process.env.APP_URL}/vendor/quote/${rv.access_token}`;
    try {
      await sendRfqEmail({ vendor: rv.Vendor, rfq, items: rfq.PurchaseRequest?.items || [], uploadLink });
      await rv.update({ sent_at: new Date(), status: 'sent', channel: 'email' });
      results.push({ vendor_id: rv.vendor_id, status: 'sent' });
    } catch (e) {
      results.push({ vendor_id: rv.vendor_id, status: 'failed', error: e.message });
    }
  }
  await rfq.update({ status: 'sent' });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'rfq.sent', entityType: 'Rfq', entityId: rfq.id, ip: req.ip });
  okResponse(res, { message: 'RFQ sent', results });
});

exports.remind = asyncHandler(async (req, res) => {
  const rfq = await Rfq.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [{ model: RfqVendor, as: 'rfqVendors', include: [Vendor] }] });
  if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);
  const pending = rfq.rfqVendors.filter((rv) => rv.status === 'pending' || rv.status === 'sent');
  for (const rv of pending) {
    const uploadLink = `${process.env.APP_URL}/vendor/quote/${rv.access_token}`;
    await sendRfqEmail({ vendor: rv.Vendor, rfq, items: [], uploadLink, isReminder: true }).catch(console.error);
  }
  okResponse(res, { reminded: pending.length });
});

exports.getQuotes = asyncHandler(async (req, res) => {
  const { QuoteItem } = require('../models');
  const rfq = await Rfq.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);
  const quotes = await Quote.findAll({ where: { company_id: req.companyId }, include: [{ model: RfqVendor, where: { rfq_id: rfq.id } }, { model: QuoteItem, as: 'items' }, Vendor] });
  okResponse(res, quotes);
});

// Public vendor-facing - get RFQ details via access token
exports.publicGetRfq = asyncHandler(async (req, res) => {
  const rv = await RfqVendor.findOne({ where: { access_token: req.params.token }, include: [Vendor, { model: Rfq, include: [{ model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items' }] }] }] });
  if (!rv) return errorResponse(res, 'NOT_FOUND', 'Invalid or expired link', 404);
  await rv.update({ opened_at: rv.opened_at || new Date(), status: rv.status === 'pending' || rv.status === 'sent' ? 'opened' : rv.status });
  okResponse(res, { vendor: rv.Vendor, rfq: rv.Rfq });
});

// Public vendor-facing - submit quote via access token
exports.publicSubmitQuote = asyncHandler(async (req, res) => {
  // Include Rfq so we can read company_id off it - without this include,
  // rv.Rfq is always undefined and Quote.create() below fails company_id
  // validation (422 Unprocessable Content).
  const rv = await RfqVendor.findOne({ where: { access_token: req.params.token }, include: [Rfq] });
  if (!rv) return errorResponse(res, 'NOT_FOUND', 'Invalid link', 404);
  const { payment_terms, delivery_time_days, validity_date } = req.body;
  const file = req.file;

  // items is sent as a JSON string inside multipart/form-data - parse it
  // back into an array. Guard against malformed/missing JSON.
  let items = [];
  if (req.body.items) {
    try {
      items = JSON.parse(req.body.items);
    } catch (e) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Invalid items format', 422);
    }
  }

  const quote = await Quote.create({
    rfq_vendor_id: rv.id, vendor_id: rv.vendor_id, company_id: rv.Rfq?.company_id,
    source_file_url: file ? (file.location || file.path || file.originalname) : null,
    source_type: file ? file.mimetype : 'manual',
    extraction_status: file ? 'pending' : 'done',
    payment_terms, delivery_time_days, validity_date, status: 'submitted',
  });
  await rv.update({ responded_at: new Date(), status: 'responded' });
  // Enqueue extraction job if file uploaded
  if (file) {
    const { extractionQueue } = require('../jobs/queues');
    await extractionQueue.add('extract-quote', { quoteId: quote.id, filePath: file.location || file.path });
  } else if (items?.length) {
    const { QuoteItem } = require('../models');
    await QuoteItem.bulkCreate(items.map((i) => ({ ...i, quote_id: quote.id, confidence_score: 1.0 })));
    const total = items.reduce((s, i) => s + (Number(i.total_price) || 0), 0);
    await quote.update({ total_amount: total, extraction_status: 'done' });
  }
  okResponse(res, { message: 'Quote submitted', quote_id: quote.id }, 201);
});
