const { Invoice, InvoiceItem, PurchaseOrder, PoItem, GoodsReceipt, GoodsReceiptItem } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse } = require('../utils/helpers');
const { audit } = require('../middleware/audit');
const { extractInvoice } = require('../services/aiService');

exports.upload = asyncHandler(async (req, res) => {
  const { purchase_order_id, vendor_id } = req.body;
  if (!req.file) return errorResponse(res, 'VALIDATION_ERROR', 'Invoice file required');
  if (!vendor_id) return errorResponse(res, 'VALIDATION_ERROR', 'vendor_id required');

  // Both purchase_order_id and vendor_id come from the client — without this
  // check, a user could attach their invoice to another company's PO/vendor
  // record, and every subsequent invoice.getOne()/match() call would then
  // expose that other company's PO totals, items, and vendor details.
  const { Vendor } = require('../models');
  const vendor = await Vendor.findOne({ where: { id: vendor_id, company_id: req.companyId } });
  if (!vendor) return errorResponse(res, 'NOT_FOUND', 'Vendor not found', 404);
  if (purchase_order_id) {
    const po = await PurchaseOrder.findOne({ where: { id: purchase_order_id, company_id: req.companyId } });
    if (!po) return errorResponse(res, 'NOT_FOUND', 'Purchase order not found', 404);
  }

  const invoice = await Invoice.create({
    company_id: req.companyId, purchase_order_id, vendor_id,
    file_url: req.file.location || req.file.path || req.file.originalname,
    match_status: 'pending', payment_status: 'unpaid',
  });
  // Extract synchronously (not via background queue) - avoids the uploaded file
  // being wiped by a service redeploy/restart before a queued job gets to read it.
  try {
    await extractInvoice(invoice.id, req.file.location || req.file.path, req.file.mimetype, req.file.originalname);
    await invoice.reload();
  } catch (e) {
    console.error('[Invoice extraction] failed:', e.message);
  }
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'invoice.uploaded', entityType: 'Invoice', entityId: invoice.id, ip: req.ip });
  okResponse(res, invoice, 201);
});

exports.getOne = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [{ model: InvoiceItem, as: 'items' }, PurchaseOrder] });
  if (!invoice) return errorResponse(res, 'NOT_FOUND', 'Invoice not found', 404);
  okResponse(res, invoice);
});

exports.list = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId };
  if (req.query.match_status) where.match_status = req.query.match_status;
  if (req.query.vendor_id) where.vendor_id = req.query.vendor_id;
  const result = await Invoice.findAndCountAll({ where, limit, offset, order: [['created_at', 'DESC']] });
  paginatedResponse(res, result, { page, perPage });
});

exports.match = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [{ model: InvoiceItem, as: 'items' }] });
  if (!invoice) return errorResponse(res, 'NOT_FOUND', 'Invoice not found', 404);
  if (!invoice.purchase_order_id) { await invoice.update({ match_status: 'mismatched', mismatch_reason: 'No PO linked' }); return okResponse(res, { match_status: 'mismatched', mismatches: ['No PO linked'] }); }
  const po = await PurchaseOrder.findOne({ where: { id: invoice.purchase_order_id, company_id: req.companyId }, include: [{ model: PoItem, as: 'items' }] });
  if (!po) { await invoice.update({ match_status: 'mismatched', mismatch_reason: 'Linked PO not found' }); return okResponse(res, { match_status: 'mismatched', mismatches: ['Linked PO not found'] }); }
  const grn = await GoodsReceipt.findOne({ where: { purchase_order_id: po.id }, include: [{ model: GoodsReceiptItem, as: 'items' }] });

  const mismatches = [];

  // Price match (2-way)
  const invoiceTotal = parseFloat(invoice.total_amount) || 0;
  const poTotal = parseFloat(po.total_amount) || 0;
  if (Math.abs(invoiceTotal - poTotal) > 1) mismatches.push(`Total amount mismatch: Invoice ₹${invoiceTotal} vs PO ₹${poTotal}`);

  // Quantity match (3-way with GRN)
  if (grn) {
    for (const ii of invoice.items) {
      const poItem = po.items.find((p) => p.id === ii.po_item_id);
      if (!poItem) {
        // AI extraction couldn't confidently link this line to a PO item — flag it
        // for manual review instead of silently skipping the quantity check.
        mismatches.push(`"${ii.item_name_raw}" on the invoice could not be matched to a PO line item — please verify manually`);
        continue;
      }
      const invoiceQty = parseFloat(ii.quantity) || 0;
      const grni = grn.items?.find((g) => g.po_item_id === poItem.id);
      const receivedQty = parseFloat(grni?.quantity_received) || 0;
      if (Math.abs(invoiceQty - receivedQty) > 0.001) mismatches.push(`Qty mismatch for "${ii.item_name_raw}": Invoice ${invoiceQty} vs GRN ${receivedQty}`);
    }
  }

  const matchType = grn ? '3-way' : '2-way';
  const matchStatus = mismatches.length ? 'mismatched' : 'matched';
  await invoice.update({ match_status: matchStatus, match_type: matchType, mismatch_reason: mismatches.join('; ') || null });

  // Auto-notify vendor on mismatch
  if (matchStatus === 'mismatched') {
    try {
      const { Vendor: VendorModel } = require('../models');
      const invoiceVendor = await VendorModel.findByPk(invoice.vendor_id);
      if (invoiceVendor?.email) {
        const { sendMail, notifyUser } = require('../services/notificationService');
        const mismatchDetails = mismatches.join('\n• ');
        await sendMail({
          to: invoiceVendor.email,
          subject: `Invoice mismatch — action required`,
          html: `<p>Dear ${invoiceVendor.contact_person || invoiceVendor.name},</p>
                 <p>Your invoice could not be matched against the purchase order.</p>
                 <p><strong>Issues found:</strong></p>
                 <ul>${mismatches.map((m) => `<li>${m}</li>`).join('')}</ul>
                 <p>Please contact the buyer or log in to your <a href="${process.env.APP_URL}/vendor-portal/orders">vendor portal</a> to view details and raise a message.</p>`,
        }).catch(console.error);
        // Also post a system message on the PO thread
        const { Message } = require('../models');
        if (invoice.purchase_order_id) {
          await Message.create({
            company_id: invoice.company_id,
            purchase_order_id: invoice.purchase_order_id,
            sender_type: 'vendor',
            sender_id: invoice.vendor_id,
            sender_name: invoiceVendor.name,
            body: `⚠️ Invoice mismatch detected:\n• ${mismatchDetails}\nPlease review and resolve.`,
            is_system: true,
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[Mismatch notify] failed:', e.message);
    }
  }
  await audit({ companyId: req.companyId, userId: req.user.id, action: `invoice.${matchStatus}`, entityType: 'Invoice', entityId: invoice.id, ip: req.ip });
  okResponse(res, { match_status: matchStatus, match_type: matchType, mismatches });
});

exports.approve = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!invoice) return errorResponse(res, 'NOT_FOUND', 'Invoice not found', 404);
  if (invoice.match_status === 'mismatched') return errorResponse(res, 'INVALID_STATE', 'Cannot approve mismatched invoice', 409);
  await invoice.update({ match_status: 'approved', finance_approved_by: req.user.id });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'invoice.approved', entityType: 'Invoice', entityId: invoice.id, ip: req.ip });
  okResponse(res, { message: 'Invoice approved for payment' });
});

exports.updateItem = asyncHandler(async (req, res) => {
  // Previously this only checked invoice_id, not company_id — any authenticated
  // user could edit another company's invoice line items by guessing the IDs.
  const invoice = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!invoice) return errorResponse(res, 'NOT_FOUND', 'Invoice not found', 404);
  const item = await InvoiceItem.findOne({ where: { id: req.params.item_id, invoice_id: req.params.id } });
  if (!item) return errorResponse(res, 'NOT_FOUND', 'Invoice item not found', 404);
  ['item_name_raw', 'quantity', 'unit_price', 'total_price'].forEach((f) => { if (req.body[f] !== undefined) item[f] = req.body[f]; });
  item.confidence_score = 1.0;
  await item.save();
  okResponse(res, item);
});
