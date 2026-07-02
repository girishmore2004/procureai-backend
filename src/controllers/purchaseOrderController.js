const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { PurchaseOrder, PoItem, Quote, QuoteItem, Vendor, Rfq, User } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse, generateCode } = require('../utils/helpers');
const { audit } = require('../middleware/audit');
const { sendPoEmail } = require('../services/emailService');
const { triggerApprovalFlow } = require('../services/approvalService');

exports.list = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId };
  if (req.query.status) where.status = req.query.status;
  if (req.query.vendor_id) where.vendor_id = req.query.vendor_id;
  const result = await PurchaseOrder.findAndCountAll({ where, limit, offset, include: [Vendor, { model: PoItem, as: 'items' }], order: [['created_at', 'DESC']] });
  paginatedResponse(res, result, { page, perPage });
});

exports.create = asyncHandler(async (req, res) => {
  const { quote_id, delivery_location, expected_delivery_date } = req.body;
  if (!quote_id) return errorResponse(res, 'VALIDATION_ERROR', 'quote_id required');
  const quote = await Quote.findOne({ where: { id: quote_id, company_id: req.companyId, status: 'selected' }, include: [{ model: QuoteItem, as: 'items' }] });
  if (!quote) return errorResponse(res, 'NOT_FOUND', 'Selected quote not found', 404);
  const rv = await require('../models').RfqVendor.findByPk(quote.rfq_vendor_id);
  const po_number = await generateCode(PurchaseOrder, 'PO', 'po_number', req.companyId);
  const po = await PurchaseOrder.create({
    company_id: req.companyId, rfq_id: rv?.rfq_id, quote_id: quote.id,
    vendor_id: quote.vendor_id, po_number, status: 'draft',
    total_amount: quote.total_amount, delivery_location, expected_delivery_date, created_by: req.user.id,
  });
  await PoItem.bulkCreate(quote.items.map((qi) => ({
    purchase_order_id: po.id, item_id: qi.item_id, item_name: qi.item_name_raw,
    quantity: qi.quantity, unit_price: qi.unit_price, total_price: qi.total_price,
  })));
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'po.created', entityType: 'PurchaseOrder', entityId: po.id, after: { po_number }, ip: req.ip });
  okResponse(res, po, 201);
});

exports.getOne = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [Vendor, { model: PoItem, as: 'items' }] });
  if (!po) return errorResponse(res, 'NOT_FOUND', 'PO not found', 404);
  okResponse(res, po);
});

exports.update = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!po) return errorResponse(res, 'NOT_FOUND', 'PO not found', 404);
  if (po.status !== 'draft') return errorResponse(res, 'INVALID_STATE', 'Only draft POs can be edited', 409);
  const before = po.toJSON();
  ['delivery_location', 'expected_delivery_date', 'total_amount'].forEach((f) => { if (req.body[f] !== undefined) po[f] = req.body[f]; });
  await po.save();
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'po.updated', entityType: 'PurchaseOrder', entityId: po.id, before, after: po.toJSON(), ip: req.ip });
  okResponse(res, po);
});

const generatePoPdf = async (po, vendor, items) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const outputPath = path.join('/tmp', `PO-${po.po_number}.pdf`);
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.fontSize(20).text('PURCHASE ORDER', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`PO Number: ${po.po_number}`);
    doc.text(`Date: ${new Date(po.created_at).toLocaleDateString('en-IN')}`);
    doc.text(`Vendor: ${vendor?.name || ''}`);
    doc.text(`Delivery Location: ${po.delivery_location || ''}`);
    doc.text(`Expected Delivery: ${po.expected_delivery_date || ''}`);
    doc.moveDown();
    doc.fontSize(14).text('Items:', { underline: true });
    doc.moveDown(0.5);
    items.forEach((item, i) => {
      doc.fontSize(11).text(`${i + 1}. ${item.item_name} | Qty: ${item.quantity} | Unit: ₹${item.unit_price} | Total: ₹${item.total_price}`);
    });
    doc.moveDown();
    doc.fontSize(13).text(`Total Amount: ₹${po.total_amount}`, { bold: true });
    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
};

exports.send = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [Vendor, { model: PoItem, as: 'items' }] });
  if (!po) return errorResponse(res, 'NOT_FOUND', 'PO not found', 404);
  if (!['draft', 'approved'].includes(po.status)) return errorResponse(res, 'INVALID_STATE', 'PO cannot be sent in this state', 409);
  const pdfPath = await generatePoPdf(po, po.Vendor, po.items);
  // In prod, upload pdfPath to S3 and store URL. For MVP, serve from /tmp.
  const pdfUrl = `/files/${path.basename(pdfPath)}`;
  await po.update({ status: 'sent', pdf_url: pdfUrl });
  if (po.Vendor?.email) {
    await sendPoEmail({ vendor: po.Vendor, po, pdfPath }).catch(console.error);
  }
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'po.sent', entityType: 'PurchaseOrder', entityId: po.id, ip: req.ip });
  okResponse(res, { message: 'PO sent', pdf_url: pdfUrl });
});

exports.downloadPdf = asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [Vendor, { model: PoItem, as: 'items' }] });
  if (!po) return errorResponse(res, 'NOT_FOUND', 'PO not found', 404);
  const pdfPath = await generatePoPdf(po, po.Vendor, po.items);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="PO-${po.po_number}.pdf"`);
  fs.createReadStream(pdfPath).pipe(res);
});
