// const { v4: uuidv4 } = require('uuid');
// const { Op } = require('sequelize');
// const { Rfq, RfqVendor, Vendor, PurchaseRequest, PurchaseRequestItem, Quote, Item } = require('../models');
// const { asyncHandler } = require('../middleware/errorHandler');
// const { paginate, paginatedResponse, okResponse, errorResponse, generateCode } = require('../utils/helpers');
// const { audit } = require('../middleware/audit');
// const { sendRfqEmail, notifyUser } = require('../services/notificationService');
// const { saveBufferToDisk } = require('../middleware/upload');

// exports.list = asyncHandler(async (req, res) => {
//   const { page, perPage, limit, offset } = paginate(req.query);
//   const where = { company_id: req.companyId };
//   if (req.query.status) where.status = req.query.status;
//   const result = await Rfq.findAndCountAll({ where, limit, offset, include: [{ model: RfqVendor, as: 'rfqVendors', include: [Vendor, { model: Quote, separate: true, where: { status: { [Op.ne]: 'superseded' } }, required: false, order: [['created_at', 'DESC']] }] }], order: [['created_at', 'DESC']] });
//   paginatedResponse(res, result, { page, perPage });
// });

// exports.create = asyncHandler(async (req, res) => {
//   const { purchase_request_id, vendor_ids, deadline, delivery_location, terms, special_instructions } = req.body;
//   if (!purchase_request_id || !vendor_ids?.length)
//     return errorResponse(res, 'VALIDATION_ERROR', 'purchase_request_id and vendor_ids required');
//   const pr = await PurchaseRequest.findOne({ where: { id: purchase_request_id, company_id: req.companyId } });
//   if (!pr) return errorResponse(res, 'NOT_FOUND', 'Purchase Request not found', 404);
//   if (pr.status !== 'approved') return errorResponse(res, 'INVALID_STATE', 'PR must be approved before creating RFQ', 409);

//   // vendor_ids come straight from the client — without this check a buyer
//   // could add another buyer's *private* invited vendor (company_id set to
//   // someone else) to their own RFQ just by guessing an id. Public
//   // self-registered vendors (company_id: null) and this buyer's own vendors
//   // are both fair game; anything else is rejected.
//   const validVendors = await Vendor.findAll({
//     where: { id: vendor_ids, [Op.or]: [{ company_id: null }, { company_id: req.companyId }], deleted_at: null },
//     attributes: ['id'],
//   });
//   const validIds = new Set(validVendors.map((v) => v.id));
//   const usableVendorIds = [...new Set(vendor_ids)].filter((vid) => validIds.has(vid));
//   if (!usableVendorIds.length) return errorResponse(res, 'VALIDATION_ERROR', 'None of the selected vendors are available to this company');

//   const rfq_number = await generateCode(Rfq, 'RFQ', 'rfq_number', req.companyId);
//   const rfq = await Rfq.create({ company_id: req.companyId, purchase_request_id, created_by: req.user.id, deadline, delivery_location, terms, special_instructions, rfq_number, status: 'draft' });
//   await RfqVendor.bulkCreate(usableVendorIds.map((vid) => ({ rfq_id: rfq.id, vendor_id: vid, access_token: uuidv4(), status: 'pending' })));
//   await pr.update({ status: 'converted_to_rfq' });
//   await audit({ companyId: req.companyId, userId: req.user.id, action: 'rfq.created', entityType: 'Rfq', entityId: rfq.id, after: { rfq_number }, ip: req.ip });
//   okResponse(res, rfq, 201);
// });

// exports.getOne = asyncHandler(async (req, res) => {
//   const rfq = await Rfq.findOne({
//     where: { id: req.params.id, company_id: req.companyId },
//     include: [{ model: RfqVendor, as: 'rfqVendors', include: [Vendor, { model: Quote, separate: true, order: [['created_at', 'DESC']] }] }, { model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items', include: [Item] }] }],
//   });
//   if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);
//   okResponse(res, rfq);
// });

// exports.addVendors = asyncHandler(async (req, res) => {
//   const { vendor_ids } = req.body;
//   if (!vendor_ids?.length) return errorResponse(res, 'VALIDATION_ERROR', 'vendor_ids required');
//   const rfq = await Rfq.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [{ model: RfqVendor, as: 'rfqVendors' }, { model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items' }] }] });
//   if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);
//   const existingIds = new Set(rfq.rfqVendors.map((rv) => rv.vendor_id));

//   // Same ownership check as rfqController.create — only public (company_id:
//   // null) or this buyer's own vendors may be attached to the RFQ.
//   const validVendors = await Vendor.findAll({
//     where: { id: vendor_ids, [Op.or]: [{ company_id: null }, { company_id: req.companyId }], deleted_at: null },
//     attributes: ['id'],
//   });
//   const validIds = new Set(validVendors.map((v) => v.id));

//   const newVendorIds = [...new Set(vendor_ids)].filter((vid) => !existingIds.has(vid) && validIds.has(vid));
//   if (!newVendorIds.length) return errorResponse(res, 'VALIDATION_ERROR', 'Selected vendor(s) are already on this RFQ or not available to this company');
//   const created = await RfqVendor.bulkCreate(newVendorIds.map((vid) => ({ rfq_id: rfq.id, vendor_id: vid, access_token: uuidv4(), status: 'pending' })), { returning: true });
//   const results = [];
//   if (rfq.status === 'sent') {
//     const newRows = await RfqVendor.findAll({ where: { id: created.map((c) => c.id) }, include: [Vendor] });
//     for (const rv of newRows) {
//       const uploadLink = `${process.env.APP_URL}/vendor/quote/${rv.access_token}`;
//       try { await sendRfqEmail({ vendor: rv.Vendor, rfq, items: rfq.PurchaseRequest?.items || [], uploadLink }); await rv.update({ sent_at: new Date(), status: 'sent', channel: 'email' }); results.push({ vendor_id: rv.vendor_id, status: 'sent' }); }
//       catch (e) { results.push({ vendor_id: rv.vendor_id, status: 'failed', error: e.message }); }
//     }
//   }
//   await audit({ companyId: req.companyId, userId: req.user.id, action: 'rfq.vendors_added', entityType: 'Rfq', entityId: rfq.id, after: { vendor_ids: newVendorIds }, ip: req.ip });
//   okResponse(res, { added: newVendorIds.length, results }, 201);
// });

// exports.send = asyncHandler(async (req, res) => {
//   const rfq = await Rfq.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [{ model: RfqVendor, as: 'rfqVendors', include: [Vendor] }, { model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items' }] }] });
//   if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);
//   const results = [];
//   for (const rv of rfq.rfqVendors) {
//     const uploadLink = `${process.env.APP_URL}/vendor/quote/${rv.access_token}`;
//     try { await sendRfqEmail({ vendor: rv.Vendor, rfq, items: rfq.PurchaseRequest?.items || [], uploadLink }); await rv.update({ sent_at: new Date(), status: 'sent', channel: 'email' }); results.push({ vendor_id: rv.vendor_id, status: 'sent' }); }
//     catch (e) { results.push({ vendor_id: rv.vendor_id, status: 'failed', error: e.message }); }
//   }
//   await rfq.update({ status: 'sent' });
//   await audit({ companyId: req.companyId, userId: req.user.id, action: 'rfq.sent', entityType: 'Rfq', entityId: rfq.id, ip: req.ip });
//   okResponse(res, { message: 'RFQ sent', results });
// });

// exports.remind = asyncHandler(async (req, res) => {
//   const rfq = await Rfq.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [{ model: RfqVendor, as: 'rfqVendors', include: [Vendor] }] });
//   if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);
//   const pending = rfq.rfqVendors.filter((rv) => rv.status === 'pending' || rv.status === 'sent');
//   for (const rv of pending) {
//     const uploadLink = `${process.env.APP_URL}/vendor/quote/${rv.access_token}`;
//     await sendRfqEmail({ vendor: rv.Vendor, rfq, items: [], uploadLink, isReminder: true }).catch(console.error);
//   }
//   okResponse(res, { reminded: pending.length });
// });

// exports.getQuotes = asyncHandler(async (req, res) => {
//   const { QuoteItem } = require('../models');
//   const rfq = await Rfq.findOne({ where: { id: req.params.id, company_id: req.companyId } });
//   if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);
//   const quotes = await Quote.findAll({ where: { company_id: req.companyId, status: { [Op.ne]: 'superseded' } }, include: [{ model: RfqVendor, where: { rfq_id: rfq.id } }, { model: QuoteItem, as: 'items' }, Vendor] });
//   okResponse(res, quotes);
// });

// // ── Public: vendor views RFQ details via token ────────────────────────────
// exports.publicGetRfq = asyncHandler(async (req, res) => {
//   const rv = await RfqVendor.findOne({
//     where: { access_token: req.params.token },
//     include: [Vendor, { model: Rfq, include: [{ model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items', include: [Item] }] }] }],
//   });
//   if (!rv) return errorResponse(res, 'NOT_FOUND', 'Invalid or expired link', 404);
//   await rv.update({ opened_at: rv.opened_at || new Date(), status: ['pending', 'sent'].includes(rv.status) ? 'opened' : rv.status });
//   okResponse(res, { vendor: rv.Vendor, rfq: rv.Rfq });
// });

// // ── Public: validate file extraction BEFORE submission (no DB write) ──────
// // Vendor uploads → we OCR + LLM extract → return items for preview → vendor confirms
// exports.publicValidateQuote = asyncHandler(async (req, res) => {
//   const rv = await RfqVendor.findOne({ where: { access_token: req.params.token } });
//   if (!rv) return errorResponse(res, 'NOT_FOUND', 'Invalid link', 404);
//   if (!req.file || !req.file.buffer) return errorResponse(res, 'VALIDATION_ERROR', 'File required');
//   const { validateQuoteFile } = require('../services/aiService');
//   try {
//     const result = await validateQuoteFile(req.file.buffer, req.file.mimetype, req.file.originalname);
//     okResponse(res, result);
//   } catch (err) {
//     // Return structured error so frontend can switch to manual mode gracefully
//     okResponse(res, { success: false, error: err.message, items: [], confidence_overall: 0 });
//   }
// });

// // ── Public: vendor submits confirmed quote ────────────────────────────────
// exports.publicSubmitQuote = asyncHandler(async (req, res) => {
//   const rv = await RfqVendor.findOne({ where: { access_token: req.params.token }, include: [Rfq] });
//   if (!rv) return errorResponse(res, 'NOT_FOUND', 'Invalid link', 404);
//   const { payment_terms, delivery_time_days, validity_date } = req.body;

//   let items = [];
//   if (req.body.items) {
//     try { items = JSON.parse(req.body.items); } catch { return errorResponse(res, 'VALIDATION_ERROR', 'Invalid items format', 422); }
//   }

//   // Supersede previous active quote from same vendor on same RFQ
//   await Quote.update({ status: 'superseded' }, { where: { rfq_vendor_id: rv.id, status: 'submitted' } });

//   const file = req.file; // .buffer available (memory storage via vendorUpload)

//   // Persist the vendor's uploaded bytes to disk (same location invoice uploads
//   // already use) instead of only holding them in memory for the extraction
//   // pass. Without this, the original file was discarded right after upload —
//   // there was no way to preview it or re-extract it later.
//   let savedFile = null;
//   if (file && file.buffer) {
//     try {
//       savedFile = saveBufferToDisk(file.buffer, file.originalname);
//     } catch (e) {
//       console.error('[Quote file save] failed:', e.message);
//     }
//   }

//   const quote = await Quote.create({
//     rfq_vendor_id: rv.id, vendor_id: rv.vendor_id, company_id: rv.Rfq?.company_id,
//     source_file_url: savedFile ? savedFile.url : null,
//     source_type: file ? file.mimetype : 'manual',
//     extraction_status: file ? 'pending' : 'done',
//     payment_terms, delivery_time_days, validity_date, status: 'submitted',
//   });

//   await rv.update({ responded_at: new Date(), status: 'responded' });

//   if (file && file.buffer) {
//     // Process from buffer synchronously — no disk path, no ENOENT
//     const { extractQuoteFromFile } = require('../services/aiService');
//     try {
//       await extractQuoteFromFile(quote.id, file.buffer, file.mimetype, file.originalname);
//     } catch (e) {
//       console.error('[Quote extraction] failed:', e.message);
//     }
//   } else if (items?.length) {
//     const { QuoteItem } = require('../models');
//     await QuoteItem.bulkCreate(items.map((i) => ({
//       quote_id: quote.id,
//       item_name_raw: i.item_name_raw || i.item_name || 'Unknown',
//       item_code_raw: i.item_code_raw || null,
//       quantity: parseFloat(i.quantity) || 0,
//       unit_price: parseFloat(i.unit_price) || 0,
//       total_price: parseFloat(i.total_price) || (parseFloat(i.quantity || 0) * parseFloat(i.unit_price || 0)),
//       tax: parseFloat(i.tax) || 0,
//       freight: parseFloat(i.freight) || 0,
//       discount: parseFloat(i.discount) || 0,
//       confidence_score: 1.0,
//     })));
//     const total = items.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
//     await quote.update({ total_amount: total, extraction_status: 'done' });
//   }

//   await quote.reload();
//   okResponse(res, { message: 'Quote submitted', quote_id: quote.id, extraction_status: quote.extraction_status }, 201);
// });






const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { Rfq, RfqVendor, Vendor, PurchaseRequest, PurchaseRequestItem, Quote, Item } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse, generateCode } = require('../utils/helpers');
const { audit } = require('../middleware/audit');
const { sendRfqEmail, notifyUser } = require('../services/notificationService');
const { saveBufferToDisk } = require('../middleware/upload');

exports.list = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId };
  if (req.query.status) where.status = req.query.status;
  const result = await Rfq.findAndCountAll({ where, limit, offset, include: [{ model: RfqVendor, as: 'rfqVendors', include: [Vendor, { model: Quote, separate: true, where: { status: { [Op.ne]: 'superseded' } }, required: false, order: [['created_at', 'DESC']] }] }], order: [['created_at', 'DESC']] });
  paginatedResponse(res, result, { page, perPage });
});

exports.create = asyncHandler(async (req, res) => {
  const { purchase_request_id, vendor_ids, deadline, delivery_location, terms, special_instructions } = req.body;
  if (!purchase_request_id || !vendor_ids?.length)
    return errorResponse(res, 'VALIDATION_ERROR', 'purchase_request_id and vendor_ids required');
  const pr = await PurchaseRequest.findOne({ where: { id: purchase_request_id, company_id: req.companyId } });
  if (!pr) return errorResponse(res, 'NOT_FOUND', 'Purchase Request not found', 404);
  if (pr.status !== 'approved') return errorResponse(res, 'INVALID_STATE', 'PR must be approved before creating RFQ', 409);

  // vendor_ids come straight from the client — without this check a buyer
  // could add another buyer's *private* invited vendor (company_id set to
  // someone else) to their own RFQ just by guessing an id. Public
  // self-registered vendors (company_id: null) and this buyer's own vendors
  // are both fair game; anything else is rejected.
  const validVendors = await Vendor.findAll({
    where: { id: vendor_ids, [Op.or]: [{ company_id: null }, { company_id: req.companyId }], deleted_at: null },
    attributes: ['id'],
  });
  const validIds = new Set(validVendors.map((v) => v.id));
  const usableVendorIds = [...new Set(vendor_ids)].filter((vid) => validIds.has(vid));
  if (!usableVendorIds.length) return errorResponse(res, 'VALIDATION_ERROR', 'None of the selected vendors are available to this company');

  const rfq_number = await generateCode(Rfq, 'RFQ', 'rfq_number', req.companyId);
  const rfq = await Rfq.create({ company_id: req.companyId, purchase_request_id, created_by: req.user.id, deadline, delivery_location, terms, special_instructions, rfq_number, status: 'draft' });
  await RfqVendor.bulkCreate(usableVendorIds.map((vid) => ({ rfq_id: rfq.id, vendor_id: vid, access_token: uuidv4(), status: 'pending' })));
  await pr.update({ status: 'converted_to_rfq' });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'rfq.created', entityType: 'Rfq', entityId: rfq.id, after: { rfq_number }, ip: req.ip });
  okResponse(res, rfq, 201);
});

exports.getOne = asyncHandler(async (req, res) => {
  const rfq = await Rfq.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [{ model: RfqVendor, as: 'rfqVendors', include: [Vendor, { model: Quote, separate: true, order: [['created_at', 'DESC']] }] }, { model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items', include: [Item] }] }],
  });
  if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);
  okResponse(res, rfq);
});

exports.addVendors = asyncHandler(async (req, res) => {
  const { vendor_ids } = req.body;
  if (!vendor_ids?.length) return errorResponse(res, 'VALIDATION_ERROR', 'vendor_ids required');
  const rfq = await Rfq.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [{ model: RfqVendor, as: 'rfqVendors' }, { model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items' }] }] });
  if (!rfq) return errorResponse(res, 'NOT_FOUND', 'RFQ not found', 404);
  const existingIds = new Set(rfq.rfqVendors.map((rv) => rv.vendor_id));

  // Same ownership check as rfqController.create — only public (company_id:
  // null) or this buyer's own vendors may be attached to the RFQ.
  const validVendors = await Vendor.findAll({
    where: { id: vendor_ids, [Op.or]: [{ company_id: null }, { company_id: req.companyId }], deleted_at: null },
    attributes: ['id'],
  });
  const validIds = new Set(validVendors.map((v) => v.id));

  const newVendorIds = [...new Set(vendor_ids)].filter((vid) => !existingIds.has(vid) && validIds.has(vid));
  if (!newVendorIds.length) return errorResponse(res, 'VALIDATION_ERROR', 'Selected vendor(s) are already on this RFQ or not available to this company');
  const created = await RfqVendor.bulkCreate(newVendorIds.map((vid) => ({ rfq_id: rfq.id, vendor_id: vid, access_token: uuidv4(), status: 'pending' })), { returning: true });
  const results = [];
  if (rfq.status === 'sent') {
    const newRows = await RfqVendor.findAll({ where: { id: created.map((c) => c.id) }, include: [Vendor] });
    for (const rv of newRows) {
      const uploadLink = `${process.env.APP_URL}/vendor/quote/${rv.access_token}`;
      try { await sendRfqEmail({ vendor: rv.Vendor, rfq, items: rfq.PurchaseRequest?.items || [], uploadLink }); await rv.update({ sent_at: new Date(), status: 'sent', channel: 'email' }); results.push({ vendor_id: rv.vendor_id, status: 'sent' }); }
      catch (e) { results.push({ vendor_id: rv.vendor_id, status: 'failed', error: e.message }); }
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
    try { await sendRfqEmail({ vendor: rv.Vendor, rfq, items: rfq.PurchaseRequest?.items || [], uploadLink }); await rv.update({ sent_at: new Date(), status: 'sent', channel: 'email' }); results.push({ vendor_id: rv.vendor_id, status: 'sent' }); }
    catch (e) { results.push({ vendor_id: rv.vendor_id, status: 'failed', error: e.message }); }
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
  const quotes = await Quote.findAll({ where: { company_id: req.companyId, status: { [Op.ne]: 'superseded' } }, include: [{ model: RfqVendor, where: { rfq_id: rfq.id } }, { model: QuoteItem, as: 'items' }, Vendor] });
  okResponse(res, quotes);
});

// ── Public: vendor views RFQ details via token ────────────────────────────
exports.publicGetRfq = asyncHandler(async (req, res) => {
  const rv = await RfqVendor.findOne({
    where: { access_token: req.params.token },
    include: [Vendor, { model: Rfq, include: [{ model: PurchaseRequest, include: [{ model: PurchaseRequestItem, as: 'items', include: [Item] }] }] }],
  });
  if (!rv) return errorResponse(res, 'NOT_FOUND', 'Invalid or expired link', 404);
  await rv.update({ opened_at: rv.opened_at || new Date(), status: ['pending', 'sent'].includes(rv.status) ? 'opened' : rv.status });
  okResponse(res, { vendor: rv.Vendor, rfq: rv.Rfq });
});

// ── Public: validate file extraction BEFORE submission (no DB write) ──────
// Vendor uploads → we OCR + LLM extract → return items for preview → vendor confirms
exports.publicValidateQuote = asyncHandler(async (req, res) => {
  const rv = await RfqVendor.findOne({ where: { access_token: req.params.token } });
  if (!rv) return errorResponse(res, 'NOT_FOUND', 'Invalid link', 404);
  if (!req.file || !req.file.buffer) return errorResponse(res, 'VALIDATION_ERROR', 'File required');
  const { validateQuoteFile } = require('../services/aiService');
  try {
    const result = await validateQuoteFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    okResponse(res, result);
  } catch (err) {
    // Return structured error so frontend can switch to manual mode gracefully
    okResponse(res, { success: false, error: err.message, items: [], confidence_overall: 0 });
  }
});

// ── Public: vendor submits confirmed quote ────────────────────────────────
exports.publicSubmitQuote = asyncHandler(async (req, res) => {
  const rv = await RfqVendor.findOne({ where: { access_token: req.params.token }, include: [Rfq] });
  if (!rv) return errorResponse(res, 'NOT_FOUND', 'Invalid link', 404);
  const { payment_terms, delivery_time_days, validity_date } = req.body;

  let items = [];
  if (req.body.items) {
    try { items = JSON.parse(req.body.items); } catch { return errorResponse(res, 'VALIDATION_ERROR', 'Invalid items format', 422); }
  }

  // Supersede previous active quote from same vendor on same RFQ
  await Quote.update({ status: 'superseded' }, { where: { rfq_vendor_id: rv.id, status: 'submitted' } });

  const file = req.file; // .buffer available (memory storage via vendorUpload)

  // Persist the vendor's uploaded bytes to disk (same location invoice uploads
  // already use) instead of only holding them in memory for the extraction
  // pass. Without this, the original file was discarded right after upload —
  // there was no way to preview it or re-extract it later.
  let savedFile = null;
  if (file && file.buffer) {
    try {
      savedFile = saveBufferToDisk(file.buffer, file.originalname);
    } catch (e) {
      console.error('[Quote file save] failed:', e.message);
    }
  }

  const quote = await Quote.create({
    rfq_vendor_id: rv.id, vendor_id: rv.vendor_id, company_id: rv.Rfq?.company_id,
    source_file_url: savedFile ? savedFile.url : null,
    source_type: file ? file.mimetype : 'manual',
    extraction_status: file ? 'pending' : 'done',
    payment_terms, delivery_time_days, validity_date, status: 'submitted',
  });

  await rv.update({ responded_at: new Date(), status: 'responded' });

  if (file && file.buffer) {
    // Process from buffer synchronously — no disk path, no ENOENT
    const { extractQuoteFromFile } = require('../services/aiService');
    try {
      await extractQuoteFromFile(quote.id, file.buffer, file.mimetype, file.originalname);
    } catch (e) {
      console.error('[Quote extraction] failed:', e.message);
    }
  } else if (items?.length) {
    const { QuoteItem } = require('../models');
    await QuoteItem.bulkCreate(items.map((i) => ({
      quote_id: quote.id,
      purchase_request_item_id: i.purchase_request_item_id || null,
      item_name_raw: i.item_name_raw || i.item_name || 'Unknown',
      item_code_raw: i.item_code_raw || null,
      quantity: parseFloat(i.quantity) || 0,
      unit_price: parseFloat(i.unit_price) || 0,
      total_price: parseFloat(i.total_price) || (parseFloat(i.quantity || 0) * parseFloat(i.unit_price || 0)),
      tax: parseFloat(i.tax) || 0,
      freight: parseFloat(i.freight) || 0,
      discount: parseFloat(i.discount) || 0,
      warranty: i.warranty || null,
      availability: i.availability || null,
      notes: i.notes || null,
      confidence_score: 1.0,
    })));
    const total = items.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
    await quote.update({ total_amount: total, extraction_status: 'done' });
  }

  await quote.reload();
  okResponse(res, { message: 'Quote submitted', quote_id: quote.id, extraction_status: quote.extraction_status }, 201);
});
