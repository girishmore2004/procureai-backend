const crypto = require('crypto');
const { Payment, Invoice, PurchaseOrder, Vendor } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse, generateCode } = require('../utils/helpers');
const { audit } = require('../middleware/audit');

const VALID_METHODS = ['bank_transfer', 'neft', 'rtgs', 'upi', 'ach', 'cheque', 'card'];

// Generates a UTR-like reference: PAY-YYYYMMDD-XXXXXXXX
const generateReference = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `UTR${date}${rand}`;
};

// ── GET /payments ─────────────────────────────────────────────────────
exports.list = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId };
  if (req.query.status) where.status = req.query.status;
  if (req.query.vendor_id) where.vendor_id = req.query.vendor_id;
  const result = await Payment.findAndCountAll({
    where, limit, offset,
    include: [Vendor, { model: Invoice }, { model: PurchaseOrder }],
    order: [['created_at', 'DESC']],
  });
  paginatedResponse(res, result, { page, perPage });
});

exports.getOne = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [Vendor, { model: Invoice }, { model: PurchaseOrder }],
  });
  if (!payment) return errorResponse(res, 'NOT_FOUND', 'Payment not found', 404);
  okResponse(res, payment);
});

// ── POST /invoices/:id/queue-payment ─────────────────────────────────
// Sequence enforced: invoice must be match-approved and not already queued/paid.
exports.queue = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!invoice) return errorResponse(res, 'NOT_FOUND', 'Invoice not found', 404);
  if (invoice.match_status !== 'approved') {
    return errorResponse(res, 'INVALID_STATE', 'Invoice must be approved for payment before it can be queued', 409);
  }
  if (invoice.payment_status !== 'unpaid') {
    return errorResponse(res, 'INVALID_STATE', 'Invoice already has a payment queued or paid', 409);
  }
  const { method, notes } = req.body;
  if (method && !VALID_METHODS.includes(method)) {
    return errorResponse(res, 'VALIDATION_ERROR', `method must be one of ${VALID_METHODS.join(', ')}`);
  }
  const payment = await Payment.create({
    company_id: req.companyId,
    invoice_id: invoice.id,
    purchase_order_id: invoice.purchase_order_id,
    vendor_id: invoice.vendor_id,
    amount: invoice.total_amount,
    method: method || 'bank_transfer',
    status: 'queued',
    notes,
    queued_by: req.user.id,
  });
  await invoice.update({ payment_status: 'payment_queued' });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'payment.queued', entityType: 'Payment', entityId: payment.id, ip: req.ip });
  okResponse(res, payment, 201);
});

// ── POST /payments/:id/execute ───────────────────────────────────────
// Finance actually sends the money. Generates a reference/UTR-like value
// and marks the invoice paid. Order stays open until the vendor confirms.
exports.execute = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [Invoice] });
  if (!payment) return errorResponse(res, 'NOT_FOUND', 'Payment not found', 404);
  if (payment.status !== 'queued') {
    return errorResponse(res, 'INVALID_STATE', 'Only queued payments can be executed', 409);
  }
  const { method, reference_number } = req.body;
  if (method && !VALID_METHODS.includes(method)) {
    return errorResponse(res, 'VALIDATION_ERROR', `method must be one of ${VALID_METHODS.join(', ')}`);
  }
  const reference = reference_number || generateReference();
  await payment.update({
    status: 'executed',
    method: method || payment.method,
    reference_number: reference,
    executed_by: req.user.id,
    executed_at: new Date(),
  });
  if (payment.Invoice) {
    await payment.Invoice.update({ payment_status: 'paid', paid_at: new Date(), paid_by: req.user.id });
  }
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'payment.executed', entityType: 'Payment', entityId: payment.id, after: { reference_number: reference }, ip: req.ip });
  okResponse(res, { message: 'Payment executed', reference_number: reference, status: 'executed' });
});
