const router = require('express').Router();
const { verifyToken, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { upload, csvUpload } = require('../middleware/upload');

const auth = require('../controllers/authController');
const company = require('../controllers/companyController');
const users = require('../controllers/userController');
const vendors = require('../controllers/vendorController');
const items = require('../controllers/itemController');
const pr = require('../controllers/purchaseRequestController');
const rfq = require('../controllers/rfqController');
const quotes = require('../controllers/quoteController');
const approvals = require('../controllers/approvalController');
const po = require('../controllers/purchaseOrderController');
const grn = require('../controllers/grnController');
const invoices = require('../controllers/invoiceController');
const inventory = require('../controllers/inventoryController');
const analytics = require('../controllers/analyticsController');
const notif = require('../controllers/notificationController');
const settings = require('../controllers/settingsController');
const exports_ = require('../controllers/exportController');
const { verifyVendorToken } = require('../middleware/vendorAuth');
const vendorAuth = require('../controllers/vendorAuthController');
const vendorDiscovery = require('../controllers/vendorDiscoveryController');
const messages = require('../controllers/messageController');

// ── AUTH ──────────────────────────────────────────────────────────────
router.post('/auth/login', auth.login);
router.post('/auth/refresh', auth.refresh);
router.post('/auth/logout', auth.logout);
router.post('/auth/forgot-password', auth.forgotPassword);
router.post('/auth/reset-password', auth.resetPassword);

// ── COMPANY SIGNUP (public) ──────────────────────────────────────────
router.post('/companies', company.signup);

// ── PUBLIC VENDOR QUOTE ENDPOINTS (no auth - token-based) ─────────────
// Must stay ABOVE router.use(verifyToken) below, otherwise vendors
// (who never log in) get a 401 Unauthorized on these routes.
router.get('/public/rfq/:token', rfq.publicGetRfq);
router.post('/public/rfq/:token/quote', upload.single('file'), rfq.publicSubmitQuote);
// ── VENDOR PORTAL PUBLIC ──────────────────────────────────────────────
router.post('/vendor-portal/login', vendorAuth.login);
router.post('/vendor-portal/set-password', vendorAuth.setPassword);

// ── VENDOR PORTAL PROTECTED (vendor JWT) ─────────────────────────────
router.get('/vendor-portal/me',               verifyVendorToken, vendorAuth.getMe);
router.patch('/vendor-portal/me',             verifyVendorToken, vendorAuth.updateMe);
router.patch('/vendor-portal/change-password',verifyVendorToken, vendorAuth.changePassword);
router.get('/vendor-portal/catalog',          verifyVendorToken, vendorAuth.listCatalog);
router.post('/vendor-portal/catalog',         verifyVendorToken, vendorAuth.addCatalogItem);
router.patch('/vendor-portal/catalog/:id',    verifyVendorToken, vendorAuth.updateCatalogItem);
router.delete('/vendor-portal/catalog/:id',   verifyVendorToken, vendorAuth.deleteCatalogItem);
// Vendor sees their own POs and messages
router.get('/vendor-portal/orders',                        verifyVendorToken, vendorAuth.listMyOrders);
router.get('/vendor-portal/orders/:id/messages',           verifyVendorToken, messages.vendorListForPO);
router.post('/vendor-portal/orders/:id/messages',          verifyVendorToken, messages.vendorReplyOnPO);

// All routes below require authentication
router.use(verifyToken);

// ── VENDOR DISCOVERY ──────────────────────────────────────────────────
router.get('/vendor-discovery/search',            requirePermission('vendors.view'), vendorDiscovery.search);
router.get('/vendor-discovery/categories',        requirePermission('vendors.view'), vendorDiscovery.getCategories);
router.get('/vendor-discovery/match-item/:itemId',requirePermission('vendors.view'), vendorDiscovery.matchItem);

// ── MESSAGES (PO thread) ──────────────────────────────────────────────
router.get('/purchase-orders/:id/messages',  requirePermission('po.view'),    messages.listForPO);
router.post('/purchase-orders/:id/messages', requirePermission('po.create'),  messages.sendOnPO);
router.get('/invoices/:id/messages',         requirePermission('invoices.view'),   messages.listForInvoice);
router.post('/invoices/:id/messages',        requirePermission('invoices.create'), messages.sendOnInvoice);

// ── COMPANY ───────────────────────────────────────────────────────────
router.get('/companies/me', company.getMyCompany);
router.patch('/companies/me', requirePermission('settings.edit'), company.updateMyCompany);

// ── USERS ─────────────────────────────────────────────────────────────
router.get('/users', requirePermission('users.view'), users.list);
router.post('/users', requirePermission('users.create'), users.create);
router.get('/users/:id', requirePermission('users.view'), users.getOne);
router.patch('/users/:id', requirePermission('users.edit'), users.update);
router.delete('/users/:id', requirePermission('users.delete'), users.remove);
router.get('/roles', requirePermission('users.view'), users.listRoles);
router.patch('/roles/:id/permissions', requirePermission('settings.edit'), users.updateRolePermissions);

// ── VENDORS ───────────────────────────────────────────────────────────
router.get('/vendors/compare', requirePermission('vendors.view'), vendors.compare);
router.get('/vendors', requirePermission('vendors.view'), vendors.list);
router.post('/vendors', requirePermission('vendors.create'), vendors.create);
router.post('/vendors/import', requirePermission('vendors.create'), csvUpload.single('file'), vendors.importCsv);
router.get('/vendors/:id', requirePermission('vendors.view'), vendors.getOne);
router.patch('/vendors/:id', requirePermission('vendors.edit'), vendors.update);
router.delete('/vendors/:id', requirePermission('vendors.delete'), vendors.remove);
router.get('/vendors/:id/scores', requirePermission('vendors.view'), vendors.getScores);
router.post('/vendors/:id/documents', requirePermission('vendors.edit'), upload.single('file'), vendors.uploadDocument);

// ── ITEMS ─────────────────────────────────────────────────────────────
router.get('/items', requirePermission('items.view'), items.list);
router.post('/items', requirePermission('items.create'), items.create);
router.post('/items/import', requirePermission('items.create'), csvUpload.single('file'), items.importCsv);
router.get('/items/:id', requirePermission('items.view'), items.getOne);
router.patch('/items/:id', requirePermission('items.edit'), items.update);
router.delete('/items/:id', requirePermission('items.delete'), items.remove);

// ── PURCHASE REQUESTS ─────────────────────────────────────────────────
router.get('/purchase-requests', requirePermission('pr.view'), pr.list);
router.post('/purchase-requests', requirePermission('pr.create'), pr.create);
router.get('/purchase-requests/:id', requirePermission('pr.view'), pr.getOne);
router.patch('/purchase-requests/:id', requirePermission('pr.edit'), pr.update);
router.post('/purchase-requests/:id/submit', requirePermission('pr.create'), pr.submit);
router.post('/purchase-requests/:id/cancel', requirePermission('pr.create'), pr.cancel);

// ── RFQs ──────────────────────────────────────────────────────────────
router.get('/rfqs', requirePermission('rfq.view'), rfq.list);
router.post('/rfqs', requirePermission('rfq.create'), rfq.create);
router.get('/rfqs/:id', requirePermission('rfq.view'), rfq.getOne);
router.post('/rfqs/:id/send', requirePermission('rfq.send'), rfq.send);
router.post('/rfqs/:id/vendors', requirePermission('rfq.send'), rfq.addVendors);
router.post('/rfqs/:id/remind', requirePermission('rfq.send'), rfq.remind);
router.get('/rfqs/:id/quotes', requirePermission('quotes.view'), rfq.getQuotes);
router.get('/rfqs/:id/comparison', requirePermission('quotes.view'), quotes.getComparison);
router.post('/rfqs/:id/recommend', requirePermission('quotes.review'), quotes.recommend);
router.post('/rfqs/:id/select-vendor', requirePermission('quotes.review'), quotes.selectVendor);

// ── QUOTES ────────────────────────────────────────────────────────────
router.get('/quotes/:id', requirePermission('quotes.view'), quotes.getOne);
router.post('/quotes/:id/reprocess', requirePermission('quotes.review'), quotes.reprocess);
router.post('/quotes/:id/items', requirePermission('quotes.review'), quotes.addItem);
router.patch('/quotes/:id/items/:item_id', requirePermission('quotes.review'), quotes.updateItem);
router.delete('/quotes/:id/items/:item_id', requirePermission('quotes.review'), quotes.deleteItem);
router.post('/quotes/:id/review-complete', requirePermission('quotes.review'), quotes.reviewComplete);

// ── APPROVALS ─────────────────────────────────────────────────────────
const APPROVE_PERMS = ['pr.approve', 'po.approve', 'invoices.approve'];
router.get('/approvals/pending', requireAnyPermission(...APPROVE_PERMS), approvals.getPending);
router.post('/approvals/:id/act', requireAnyPermission(...APPROVE_PERMS), approvals.act);
router.get('/approvals/:type/:entityId/history', approvals.getHistory);

// ── PURCHASE ORDERS ───────────────────────────────────────────────────
router.get('/purchase-orders', requirePermission('po.view'), po.list);
router.post('/purchase-orders', requirePermission('po.create'), po.create);
router.get('/purchase-orders/:id', requirePermission('po.view'), po.getOne);
router.patch('/purchase-orders/:id', requirePermission('po.create'), po.update);
router.post('/purchase-orders/:id/send', requirePermission('po.send'), po.send);
router.get('/purchase-orders/:id/pdf', requirePermission('po.view'), po.downloadPdf);

// ── GOODS RECEIPTS ────────────────────────────────────────────────────
router.get('/goods-receipts', requirePermission('grn.view'), grn.list);
router.post('/goods-receipts', requirePermission('grn.create'), grn.create);
router.get('/goods-receipts/:id', requirePermission('grn.view'), grn.getOne);
router.patch('/goods-receipts/:id/inspect', requirePermission('grn.create'), grn.inspect);

// ── INVOICES ──────────────────────────────────────────────────────────
router.get('/invoices', requirePermission('invoices.view'), invoices.list);
router.post('/invoices', requirePermission('invoices.create'), upload.single('file'), invoices.upload);
router.get('/invoices/:id', requirePermission('invoices.view'), invoices.getOne);
router.post('/invoices/:id/match', requirePermission('invoices.view'), invoices.match);
router.post('/invoices/:id/approve', requirePermission('invoices.approve'), invoices.approve);
router.patch('/invoices/:id/items/:item_id', requirePermission('invoices.create'), invoices.updateItem);

// ── INVENTORY & REORDER ───────────────────────────────────────────────
router.get('/inventory', requirePermission('items.view'), inventory.getInventory);
router.get('/inventory/reorder-alerts', requirePermission('items.view'), inventory.getReorderAlerts);
router.patch('/reorder-rules/:item_id', requirePermission('items.edit'), inventory.updateReorderRule);
router.post('/vendor-scores/compute', requirePermission('analytics.view'), inventory.computeVendorScores);

// ── ANALYTICS ─────────────────────────────────────────────────────────
router.get('/analytics/dashboard', requirePermission('analytics.view'), analytics.getDashboardKpis);
router.get('/analytics/spend', requirePermission('analytics.view'), analytics.getSpend);
router.get('/analytics/cycle-times', requirePermission('analytics.view'), analytics.getCycleTimes);
router.get('/analytics/vendor-performance', requirePermission('analytics.view'), analytics.getVendorPerformance);
router.get('/analytics/savings', requirePermission('analytics.view'), analytics.getSavings);

// ── NOTIFICATIONS ─────────────────────────────────────────────────────
router.get('/notifications', notif.listNotifications);
router.patch('/notifications/:id/read', notif.markRead);

// ── AUDIT LOGS ────────────────────────────────────────────────────────
router.get('/audit-logs', requirePermission('audit.view'), notif.listAuditLogs);

// ── SETTINGS ──────────────────────────────────────────────────────────
router.get('/settings', requirePermission('settings.view'), settings.getSettings);
router.patch('/settings', requirePermission('settings.edit'), settings.updateSettings);
router.patch('/settings/approval-thresholds', requirePermission('settings.edit'), settings.updateApprovalThresholds);

// ── EXPORTS (Excel) ───────────────────────────────────────────────────
router.get('/export/comparison', requirePermission('quotes.view'), exports_.exportComparison);
router.get('/export/purchase-orders', requirePermission('po.view'), exports_.exportPurchaseOrders);
router.get('/export/vendors', requirePermission('vendors.view'), exports_.exportVendors);
router.get('/export/spend-report', requirePermission('analytics.view'), exports_.exportSpendReport);

module.exports = router;
