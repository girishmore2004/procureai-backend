// const { DataTypes } = require('sequelize');
// const sequelize = require('../config/db');

// const UUID_PK = {
//   id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
// };

// const Company = sequelize.define('Company', {
//   ...UUID_PK,
//   name: { type: DataTypes.STRING, allowNull: false },
//   legal_name: DataTypes.STRING,
//   gstin: DataTypes.STRING,
//   pan: DataTypes.STRING,
//   address: DataTypes.JSONB,
//   currency: { type: DataTypes.STRING, defaultValue: 'INR' },
//   timezone: { type: DataTypes.STRING, defaultValue: 'Asia/Kolkata' },
//   logo_url: DataTypes.STRING,
//   industry: DataTypes.STRING,
//   approval_thresholds: { type: DataTypes.JSONB, defaultValue: [] },
//   settings: { type: DataTypes.JSONB, defaultValue: {} },
//   plan: { type: DataTypes.STRING, defaultValue: 'starter' },
//   status: { type: DataTypes.STRING, defaultValue: 'active' },
// }, { tableName: 'companies' });

// const Role = sequelize.define('Role', {
//   ...UUID_PK,
//   company_id: DataTypes.UUID,
//   name: { type: DataTypes.STRING, allowNull: false },
//   is_system: { type: DataTypes.BOOLEAN, defaultValue: false },
// }, { tableName: 'roles' });

// const Permission = sequelize.define('Permission', {
//   ...UUID_PK,
//   code: { type: DataTypes.STRING, unique: true, allowNull: false },
//   description: DataTypes.STRING,
// }, { tableName: 'permissions', timestamps: false });

// const RolePermission = sequelize.define('RolePermission', {
//   role_id: { type: DataTypes.UUID, primaryKey: true },
//   permission_id: { type: DataTypes.UUID, primaryKey: true },
// }, { tableName: 'role_permissions', timestamps: false });

// const User = sequelize.define('User', {
//   ...UUID_PK,
//   company_id: { type: DataTypes.UUID, allowNull: false },
//   role_id: { type: DataTypes.UUID, allowNull: false },
//   name: { type: DataTypes.STRING, allowNull: false },
//   email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
//   phone: DataTypes.STRING,
//   whatsapp_number: DataTypes.STRING,
//   department: DataTypes.STRING,
//   branch: DataTypes.STRING,
//   reporting_manager_id: DataTypes.UUID,
//   password_hash: DataTypes.STRING,
//   // In the Vendor model definition, add after password_hash:
//   portal_status: { type: DataTypes.STRING, defaultValue: 'invited' }, // invited|active|disabled
//   portal_invited_at: DataTypes.DATE,
//   mfa_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
//   status: { type: DataTypes.STRING, defaultValue: 'active' },
//   last_login_at: DataTypes.DATE,
//   deleted_at: DataTypes.DATE,
//   // Cross-company read-only access flag (see middleware/auth.js requirePlatformAdmin
//   // and controllers/platformController.js). Not a Role/Permission — those are all
//   // scoped to a single company_id by design, so this is deliberately a separate,
//   // manually-granted flag rather than something that goes through the normal
//   // per-company role system. Defaults false; nobody gets this by accident.
//   is_platform_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
// }, { tableName: 'users' });

// const Vendor = sequelize.define('Vendor', {
//   ...UUID_PK,
//   // Nullable: a vendor can now self-register a portal account with no buyer
//   // attached (company_id: null). Buyer-invited vendors (vendorController.create)
//   // still set this to the inviting buyer's company id, so that flow is unchanged.
//   // Vendor discovery (vendorDiscoveryController) treats company_id: null rows as
//   // publicly matchable by any buyer, and company_id: <buyer> rows as that buyer's
//   // private/invited list only.
//   company_id: { type: DataTypes.UUID, allowNull: true },
//   name: { type: DataTypes.STRING, allowNull: false },
//   legal_name: DataTypes.STRING,
//   vendor_code: DataTypes.STRING,
//   contact_person: DataTypes.STRING,
//   phone: DataTypes.STRING,
//   // Vendor-portal login looks vendors up by email alone (no company_id in the
//   // WHERE clause, since the portal login form has no notion of "which buyer"
//   // before authenticating), so two vendor rows sharing an email would make
//   // login non-deterministic. Unique + validated the same way User.email is.
//   email: { type: DataTypes.STRING, unique: true, validate: { isEmail: true } },
//   whatsapp_number: DataTypes.STRING,
//   address: DataTypes.JSONB,
//   gstin: DataTypes.STRING,
//   categories: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
//   payment_terms: DataTypes.STRING,
//   lead_time_days: DataTypes.INTEGER,
//   moq: DataTypes.DECIMAL,
//   preferred: { type: DataTypes.BOOLEAN, defaultValue: false },
//   rating: DataTypes.DECIMAL(3, 2),
//   notes: DataTypes.TEXT,
//   status: { type: DataTypes.STRING, defaultValue: 'active' },
//   deleted_at: DataTypes.DATE,
//   password_hash:      DataTypes.STRING,
//   portal_status:      { type: DataTypes.STRING, defaultValue: 'invited' }, // invited|active|disabled
//   portal_invited_at:  DataTypes.DATE,
// }, { tableName: 'vendors' });

// const VendorDocument = sequelize.define('VendorDocument', {
//   ...UUID_PK,
//   vendor_id: { type: DataTypes.UUID, allowNull: false },
//   type: DataTypes.STRING,
//   file_url: DataTypes.STRING,
//   uploaded_by: DataTypes.UUID,
// }, { tableName: 'vendor_documents' });

// // ADD this after the VendorDocument model definition (around line 60):

// const VendorCatalogItem = sequelize.define('VendorCatalogItem', {
//   ...UUID_PK,
//   vendor_id:      { type: DataTypes.UUID, allowNull: false },
//   // Nullable to match Vendor.company_id: a self-registered vendor's catalog
//   // items have company_id: null and are matchable by any buyer via vendor
//   // discovery; a buyer-invited vendor's catalog items keep that buyer's id.
//   company_id:     { type: DataTypes.UUID, allowNull: true },
//   name:           { type: DataTypes.STRING, allowNull: false },
//   category:       { type: DataTypes.STRING, allowNull: false },
//   unit:           DataTypes.STRING,
//   price:          DataTypes.DECIMAL(14, 2),
//   min_order_qty:  { type: DataTypes.DECIMAL, defaultValue: 1 },
//   lead_time_days: DataTypes.INTEGER,
//   description:    DataTypes.TEXT,
//   is_active:      { type: DataTypes.BOOLEAN, defaultValue: true },
// }, { tableName: 'vendor_catalog_items' });

// // Thread-per-PO messaging between company users and vendors
// const Message = sequelize.define('Message', {
//   ...UUID_PK,
//   company_id:     { type: DataTypes.UUID, allowNull: false },
//   // either purchase_order_id or invoice_id (one must be set)
//   purchase_order_id: DataTypes.UUID,
//   invoice_id:     DataTypes.UUID,
//   sender_type:    { type: DataTypes.STRING, allowNull: false }, // 'company_user' | 'vendor'
//   sender_id:      { type: DataTypes.UUID, allowNull: false },   // User.id or Vendor.id
//   sender_name:    DataTypes.STRING,                             // denorm for display
//   body:           { type: DataTypes.TEXT, allowNull: false },
//   is_system:      { type: DataTypes.BOOLEAN, defaultValue: false }, // auto-generated (mismatch alerts)
// }, { tableName: 'messages', updatedAt: false });

// const Item = sequelize.define('Item', {
//   ...UUID_PK,
//   company_id: { type: DataTypes.UUID, allowNull: false },
//   name: { type: DataTypes.STRING, allowNull: false },
//   item_code: DataTypes.STRING,
//   sku: DataTypes.STRING,
//   category: DataTypes.STRING,
//   subcategory: DataTypes.STRING,
//   description: DataTypes.TEXT,
//   unit: DataTypes.STRING,
//   brand: DataTypes.STRING,
//   specification: DataTypes.JSONB,
//   hsn_sac: DataTypes.STRING,
//   tax_rate: DataTypes.DECIMAL(5, 2),
//   preferred_vendor_id: DataTypes.UUID,
//   reorder_level: DataTypes.DECIMAL,
//   safety_stock: DataTypes.DECIMAL,
//   max_stock: DataTypes.DECIMAL,
//   avg_usage_per_month: DataTypes.DECIMAL,
//   last_purchase_price: DataTypes.DECIMAL,
//   lead_time_days: DataTypes.INTEGER,
//   status: { type: DataTypes.STRING, defaultValue: 'active' },
//   deleted_at: DataTypes.DATE,
// }, { tableName: 'items' });

// const PurchaseRequest = sequelize.define('PurchaseRequest', {
//   ...UUID_PK,
//   company_id: { type: DataTypes.UUID, allowNull: false },
//   requested_by: { type: DataTypes.UUID, allowNull: false },
//   department: DataTypes.STRING,
//   branch: DataTypes.STRING,
//   required_date: DataTypes.DATEONLY,
//   priority: { type: DataTypes.STRING, defaultValue: 'medium' },
//   notes: DataTypes.TEXT,
//   status: { type: DataTypes.STRING, defaultValue: 'draft' },
//   total_estimated_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
//   pr_number: DataTypes.STRING,
// }, { tableName: 'purchase_requests' });

// const PurchaseRequestItem = sequelize.define('PurchaseRequestItem', {
//   ...UUID_PK,
//   purchase_request_id: { type: DataTypes.UUID, allowNull: false },
//   item_id: DataTypes.UUID,
//   item_name_freetext: DataTypes.STRING,
//   quantity: { type: DataTypes.DECIMAL, allowNull: false },
//   estimated_unit_price: DataTypes.DECIMAL(14, 2),
//   budget_amount: DataTypes.DECIMAL(14, 2),
//   notes: DataTypes.TEXT,
// }, { tableName: 'purchase_request_items' });

// const Rfq = sequelize.define('Rfq', {
//   ...UUID_PK,
//   company_id: { type: DataTypes.UUID, allowNull: false },
//   purchase_request_id: { type: DataTypes.UUID, allowNull: false },
//   created_by: DataTypes.UUID,
//   deadline: DataTypes.DATE,
//   delivery_location: DataTypes.STRING,
//   terms: DataTypes.TEXT,
//   special_instructions: DataTypes.TEXT,
//   status: { type: DataTypes.STRING, defaultValue: 'draft' },
//   rfq_number: DataTypes.STRING,
// }, { tableName: 'rfqs' });

// const RfqVendor = sequelize.define('RfqVendor', {
//   ...UUID_PK,
//   rfq_id: { type: DataTypes.UUID, allowNull: false },
//   vendor_id: { type: DataTypes.UUID, allowNull: false },
//   channel: DataTypes.STRING,
//   sent_at: DataTypes.DATE,
//   opened_at: DataTypes.DATE,
//   responded_at: DataTypes.DATE,
//   status: { type: DataTypes.STRING, defaultValue: 'pending' },
//   access_token: { type: DataTypes.STRING, unique: true },
// }, { tableName: 'rfq_vendors' });

// const Quote = sequelize.define('Quote', {
//   ...UUID_PK,
//   rfq_vendor_id: { type: DataTypes.UUID, allowNull: false },
//   vendor_id: { type: DataTypes.UUID, allowNull: false },
//   company_id: { type: DataTypes.UUID, allowNull: false },
//   source_file_url: DataTypes.STRING,
//   source_type: DataTypes.STRING,
//   extraction_status: { type: DataTypes.STRING, defaultValue: 'pending' },
//   extraction_note: DataTypes.TEXT,
//   payment_terms: DataTypes.STRING,
//   delivery_time_days: DataTypes.INTEGER,
//   validity_date: DataTypes.DATEONLY,
//   total_amount: DataTypes.DECIMAL(14, 2),
//   ai_recommended: { type: DataTypes.BOOLEAN, defaultValue: false },
//   ai_confidence: DataTypes.DECIMAL(4, 3),
//   status: { type: DataTypes.STRING, defaultValue: 'submitted' },
// }, { tableName: 'quotes' });

// const QuoteItem = sequelize.define('QuoteItem', {
//   ...UUID_PK,
//   quote_id: { type: DataTypes.UUID, allowNull: false },
//   purchase_request_item_id: DataTypes.UUID,
//   item_name_raw: DataTypes.STRING,
//   item_code_raw: DataTypes.STRING,
//   quantity: DataTypes.DECIMAL,
//   unit_price: DataTypes.DECIMAL(14, 2),
//   total_price: DataTypes.DECIMAL(14, 2),
//   tax: DataTypes.DECIMAL(14, 2),
//   freight: DataTypes.DECIMAL(14, 2),
//   discount: DataTypes.DECIMAL(14, 2),
//   warranty: DataTypes.STRING,
//   availability: DataTypes.STRING,
//   notes: DataTypes.TEXT,
//   confidence_score: DataTypes.DECIMAL(4, 3),
// }, { tableName: 'quote_items' });

// const AiExtraction = sequelize.define('AiExtraction', {
//   ...UUID_PK,
//   company_id: DataTypes.UUID,
//   source_table: DataTypes.STRING,
//   source_id: DataTypes.UUID,
//   raw_text: DataTypes.TEXT,
//   structured_json: DataTypes.JSONB,
//   model_used: DataTypes.STRING,
//   confidence_overall: DataTypes.DECIMAL(4, 3),
//   reviewed_by: DataTypes.UUID,
//   reviewed_at: DataTypes.DATE,
// }, { tableName: 'ai_extractions' });

// const AiRecommendation = sequelize.define('AiRecommendation', {
//   ...UUID_PK,
//   company_id: DataTypes.UUID,
//   rfq_id: DataTypes.UUID,
//   recommended_quote_id: DataTypes.UUID,
//   reasoning_text: DataTypes.TEXT,
//   score_breakdown: DataTypes.JSONB,
//   savings_estimate: DataTypes.DECIMAL(14, 2),
//   confidence: DataTypes.DECIMAL(4, 3),
//   overridden_by: DataTypes.UUID,
// }, { tableName: 'ai_recommendations' });

// const Approval = sequelize.define('Approval', {
//   ...UUID_PK,
//   company_id: DataTypes.UUID,
//   approvable_type: DataTypes.STRING,
//   approvable_id: DataTypes.UUID,
//   level: { type: DataTypes.INTEGER, defaultValue: 1 },
//   approver_id: DataTypes.UUID,
//   status: { type: DataTypes.STRING, defaultValue: 'pending' },
//   comments: DataTypes.TEXT,
//   acted_at: DataTypes.DATE,
// }, { tableName: 'approvals' });

// const PurchaseOrder = sequelize.define('PurchaseOrder', {
//   ...UUID_PK,
//   company_id: { type: DataTypes.UUID, allowNull: false },
//   rfq_id: DataTypes.UUID,
//   quote_id: DataTypes.UUID,
//   vendor_id: { type: DataTypes.UUID, allowNull: false },
//   po_number: DataTypes.STRING,
//   status: { type: DataTypes.STRING, defaultValue: 'draft' },
//   total_amount: DataTypes.DECIMAL(14, 2),
//   delivery_location: DataTypes.STRING,
//   expected_delivery_date: DataTypes.DATEONLY,
//   pdf_url: DataTypes.STRING,
//   created_by: DataTypes.UUID,
// }, { tableName: 'purchase_orders' });

// const PoItem = sequelize.define('PoItem', {
//   ...UUID_PK,
//   purchase_order_id: { type: DataTypes.UUID, allowNull: false },
//   item_id: DataTypes.UUID,
//   item_name: DataTypes.STRING,
//   quantity: DataTypes.DECIMAL,
//   unit_price: DataTypes.DECIMAL(14, 2),
//   total_price: DataTypes.DECIMAL(14, 2),
//   received_quantity: { type: DataTypes.DECIMAL, defaultValue: 0 },
//   // Carried over from the selected QuoteItem when the PO is created, so invoice
//   // 3-way matching has something real to compare tax/freight/discount against
//   // instead of always showing "N/A".
//   tax: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
//   freight: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
//   discount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
// }, { tableName: 'po_items' });

// const GoodsReceipt = sequelize.define('GoodsReceipt', {
//   ...UUID_PK,
//   company_id: DataTypes.UUID,
//   purchase_order_id: { type: DataTypes.UUID, allowNull: false },
//   received_by: DataTypes.UUID,
//   received_date: DataTypes.DATEONLY,
//   status: { type: DataTypes.STRING, defaultValue: 'pending_inspection' },
//   notes: DataTypes.TEXT,
// }, { tableName: 'goods_receipts' });

// const GoodsReceiptItem = sequelize.define('GoodsReceiptItem', {
//   ...UUID_PK,
//   goods_receipt_id: { type: DataTypes.UUID, allowNull: false },
//   po_item_id: { type: DataTypes.UUID, allowNull: false },
//   quantity_received: DataTypes.DECIMAL,
//   quantity_damaged: { type: DataTypes.DECIMAL, defaultValue: 0 },
//   quantity_shortage: { type: DataTypes.DECIMAL, defaultValue: 0 },
//   photo_urls: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
//   inspection_status: DataTypes.STRING,
// }, { tableName: 'goods_receipt_items' });

// const Invoice = sequelize.define('Invoice', {
//   ...UUID_PK,
//   company_id: { type: DataTypes.UUID, allowNull: false },
//   purchase_order_id: DataTypes.UUID,
//   vendor_id: { type: DataTypes.UUID, allowNull: false },
//   invoice_number: DataTypes.STRING,
//   invoice_date: DataTypes.DATEONLY,
//   file_url: DataTypes.STRING,
//   total_amount: DataTypes.DECIMAL(14, 2),
//   match_status: { type: DataTypes.STRING, defaultValue: 'pending' },
//   match_type: DataTypes.STRING,
//   mismatch_reason: DataTypes.TEXT,
//   finance_approved_by: DataTypes.UUID,
//   payment_status: { type: DataTypes.STRING, defaultValue: 'unpaid' },
//   // Set when payment_status transitions to 'paid' via invoiceController.markPaid.
//   // Previously there was no code path that ever set payment_status to 'paid',
//   // so an invoice-to-payment cycle time could never be computed.
//   paid_at: DataTypes.DATE,
//   paid_by: DataTypes.UUID,
// }, { tableName: 'invoices' });

// const InvoiceItem = sequelize.define('InvoiceItem', {
//   ...UUID_PK,
//   invoice_id: { type: DataTypes.UUID, allowNull: false },
//   po_item_id: DataTypes.UUID,
//   item_name_raw: DataTypes.STRING,
//   quantity: DataTypes.DECIMAL,
//   unit_price: DataTypes.DECIMAL(14, 2),
//   total_price: DataTypes.DECIMAL(14, 2),
//   // Populated by aiService.extractInvoice's LLM extraction (defaults to 0 when
//   // the invoice text doesn't mention them) so 3-way matching can flag real
//   // tax/freight/discount deltas against the linked PO line, not just totals.
//   tax: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
//   freight: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
//   discount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
//   confidence_score: DataTypes.DECIMAL(4, 3),
// }, { tableName: 'invoice_items' });

// const VendorScore = sequelize.define('VendorScore', {
//   ...UUID_PK,
//   vendor_id: { type: DataTypes.UUID, allowNull: false },
//   company_id: DataTypes.UUID,
//   period: DataTypes.DATEONLY,
//   price_competitiveness: DataTypes.DECIMAL(4, 2),
//   delivery_reliability: DataTypes.DECIMAL(4, 2),
//   response_time_score: DataTypes.DECIMAL(4, 2),
//   quality_score: DataTypes.DECIMAL(4, 2),
//   overall_score: DataTypes.DECIMAL(4, 2),
// }, { tableName: 'vendor_scores' });

// const Inventory = sequelize.define('Inventory', {
//   ...UUID_PK,
//   company_id: DataTypes.UUID,
//   item_id: { type: DataTypes.UUID, allowNull: false },
//   current_stock: { type: DataTypes.DECIMAL, defaultValue: 0 },
//   last_updated_at: DataTypes.DATE,
// }, { tableName: 'inventory' });

// const ReorderRule = sequelize.define('ReorderRule', {
//   ...UUID_PK,
//   item_id: { type: DataTypes.UUID, allowNull: false, unique: true },
//   reorder_point: DataTypes.DECIMAL,
//   reorder_quantity: DataTypes.DECIMAL,
//   auto_alert: { type: DataTypes.BOOLEAN, defaultValue: true },
// }, { tableName: 'reorder_rules' });

// const Notification = sequelize.define('Notification', {
//   ...UUID_PK,
//   company_id: DataTypes.UUID,
//   user_id: DataTypes.UUID,
//   vendor_id: DataTypes.UUID,
//   channel: DataTypes.STRING,
//   type: DataTypes.STRING,
//   payload: DataTypes.JSONB,
//   status: { type: DataTypes.STRING, defaultValue: 'queued' },
//   sent_at: DataTypes.DATE,
// }, { tableName: 'notifications' });

// const Attachment = sequelize.define('Attachment', {
//   ...UUID_PK,
//   company_id: DataTypes.UUID,
//   attachable_type: DataTypes.STRING,
//   attachable_id: DataTypes.UUID,
//   file_url: DataTypes.STRING,
//   file_type: DataTypes.STRING,
//   uploaded_by: DataTypes.UUID,
// }, { tableName: 'attachments' });

// const AuditLog = sequelize.define('AuditLog', {
//   ...UUID_PK,
//   company_id: DataTypes.UUID,
//   user_id: DataTypes.UUID,
//   action: { type: DataTypes.STRING, allowNull: false },
//   entity_type: DataTypes.STRING,
//   entity_id: DataTypes.UUID,
//   before_value: DataTypes.JSONB,
//   after_value: DataTypes.JSONB,
//   ip_address: DataTypes.STRING,
// }, { tableName: 'audit_logs', updatedAt: false });

// const Setting = sequelize.define('Setting', {
//   ...UUID_PK,
//   company_id: DataTypes.UUID,
//   key: DataTypes.STRING,
//   value: DataTypes.JSONB,
// }, { tableName: 'settings' });

// // ---- Associations ----
// Company.hasMany(User, { foreignKey: 'company_id' });
// User.belongsTo(Company, { foreignKey: 'company_id' });
// Role.hasMany(User, { foreignKey: 'role_id' });
// User.belongsTo(Role, { foreignKey: 'role_id' });
// Role.belongsToMany(Permission, { through: RolePermission, foreignKey: 'role_id' });
// Permission.belongsToMany(Role, { through: RolePermission, foreignKey: 'permission_id' });

// Vendor.hasMany(VendorDocument, { foreignKey: 'vendor_id' });
// Vendor.hasMany(PurchaseOrder, { foreignKey: 'vendor_id' });
// Vendor.hasMany(VendorScore, { foreignKey: 'vendor_id' });

// Vendor.hasMany(VendorCatalogItem, { foreignKey: 'vendor_id', as: 'catalogItems' });
// VendorCatalogItem.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'Vendor' });

// PurchaseOrder.hasMany(Message, { foreignKey: 'purchase_order_id', as: 'messages' });
// Message.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' });
// Invoice.hasMany(Message, { foreignKey: 'invoice_id', as: 'messages' });
// Message.belongsTo(Invoice, { foreignKey: 'invoice_id' });

// PurchaseRequest.hasMany(PurchaseRequestItem, { foreignKey: 'purchase_request_id', as: 'items' });
// PurchaseRequestItem.belongsTo(PurchaseRequest, { foreignKey: 'purchase_request_id' });
// PurchaseRequestItem.belongsTo(Item, { foreignKey: 'item_id' });
// PurchaseRequest.belongsTo(User, { as: 'Requester', foreignKey: 'requested_by' });

// PurchaseRequest.hasMany(Rfq, { foreignKey: 'purchase_request_id' });
// Rfq.belongsTo(PurchaseRequest, { foreignKey: 'purchase_request_id' });

// Rfq.hasMany(RfqVendor, { foreignKey: 'rfq_id', as: 'rfqVendors' });
// RfqVendor.belongsTo(Rfq, { foreignKey: 'rfq_id' });
// RfqVendor.belongsTo(Vendor, { foreignKey: 'vendor_id' });

// RfqVendor.hasMany(Quote, { foreignKey: 'rfq_vendor_id' });
// Quote.belongsTo(RfqVendor, { foreignKey: 'rfq_vendor_id' });
// Quote.belongsTo(Vendor, { foreignKey: 'vendor_id' });
// Quote.hasMany(QuoteItem, { foreignKey: 'quote_id', as: 'items' });
// QuoteItem.belongsTo(Quote, { foreignKey: 'quote_id' });

// // AiExtraction is polymorphic (source_table + source_id instead of a real FK), so these
// // associations use constraints:false + a scope on source_table, the same pattern already
// // used for Approval above. Without this, quoteController.getOne's `include: [{ model:
// // AiExtraction, ... }]` throws "AiExtraction is not associated to Quote!" (Sequelize
// // requires an association to exist for any include), which 500s GET /quotes/:id and makes
// // the Quote Detail / "View Quote" page render as empty/not-found on the frontend.
// Quote.hasMany(AiExtraction, { foreignKey: 'source_id', constraints: false, scope: { source_table: 'quote' } });
// AiExtraction.belongsTo(Quote, { foreignKey: 'source_id', constraints: false });
// Invoice.hasMany(AiExtraction, { foreignKey: 'source_id', constraints: false, scope: { source_table: 'invoice' } });
// AiExtraction.belongsTo(Invoice, { foreignKey: 'source_id', constraints: false });

// PurchaseOrder.hasMany(PoItem, { foreignKey: 'purchase_order_id', as: 'items' });
// PoItem.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' });
// PurchaseOrder.belongsTo(Vendor, { foreignKey: 'vendor_id' });

// PurchaseOrder.hasMany(GoodsReceipt, { foreignKey: 'purchase_order_id' });
// GoodsReceipt.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' });
// GoodsReceipt.hasMany(GoodsReceiptItem, { foreignKey: 'goods_receipt_id', as: 'items' });
// GoodsReceiptItem.belongsTo(PoItem, { foreignKey: 'po_item_id' });

// PurchaseOrder.hasMany(Invoice, { foreignKey: 'purchase_order_id' });
// Invoice.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' });
// Invoice.belongsTo(Vendor, { foreignKey: 'vendor_id' });
// Invoice.hasMany(InvoiceItem, { foreignKey: 'invoice_id', as: 'items' });
// InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoice_id' });

// Item.hasOne(Inventory, { foreignKey: 'item_id' });
// Item.hasOne(ReorderRule, { foreignKey: 'item_id' });
// ReorderRule.belongsTo(Item, { foreignKey: 'item_id' });
// Item.belongsTo(Vendor, { as: 'PreferredVendor', foreignKey: 'preferred_vendor_id' });
// PurchaseRequest.hasMany(Approval, { foreignKey: 'approvable_id', constraints: false, scope: { approvable_type: 'purchase_request' } });
// Approval.belongsTo(PurchaseRequest, { foreignKey: 'approvable_id', constraints: false });

// PurchaseOrder.hasMany(Approval, { foreignKey: 'approvable_id', constraints: false, scope: { approvable_type: 'purchase_order' } });
// Approval.belongsTo(PurchaseOrder, { foreignKey: 'approvable_id', constraints: false });

// User.hasMany(Approval, { foreignKey: 'approver_id', constraints: false });
// Approval.belongsTo(User, { as: 'Approver', foreignKey: 'approver_id', constraints: false });



// module.exports = {
//   sequelize,
//   Company, Role, Permission, RolePermission, User,
//   Vendor, VendorDocument, Item,
//   PurchaseRequest, PurchaseRequestItem,
//   Rfq, RfqVendor, Quote, QuoteItem,
//   AiExtraction, AiRecommendation,
//   Approval, PurchaseOrder, PoItem,
//   GoodsReceipt, GoodsReceiptItem,
//   Invoice, InvoiceItem,
//   VendorScore, Inventory, ReorderRule,
//   Notification, Attachment, AuditLog, Setting,VendorCatalogItem,Message,
// };




const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const UUID_PK = {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
};

const Company = sequelize.define('Company', {
  ...UUID_PK,
  name: { type: DataTypes.STRING, allowNull: false },
  legal_name: DataTypes.STRING,
  gstin: DataTypes.STRING,
  pan: DataTypes.STRING,
  address: DataTypes.JSONB,
  currency: { type: DataTypes.STRING, defaultValue: 'INR' },
  timezone: { type: DataTypes.STRING, defaultValue: 'Asia/Kolkata' },
  logo_url: DataTypes.STRING,
  industry: DataTypes.STRING,
  approval_thresholds: { type: DataTypes.JSONB, defaultValue: [] },
  settings: { type: DataTypes.JSONB, defaultValue: {} },
  plan: { type: DataTypes.STRING, defaultValue: 'starter' },
  status: { type: DataTypes.STRING, defaultValue: 'active' },
}, { tableName: 'companies' });

const Role = sequelize.define('Role', {
  ...UUID_PK,
  company_id: DataTypes.UUID,
  name: { type: DataTypes.STRING, allowNull: false },
  is_system: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'roles' });

const Permission = sequelize.define('Permission', {
  ...UUID_PK,
  code: { type: DataTypes.STRING, unique: true, allowNull: false },
  description: DataTypes.STRING,
}, { tableName: 'permissions', timestamps: false });

const RolePermission = sequelize.define('RolePermission', {
  role_id: { type: DataTypes.UUID, primaryKey: true },
  permission_id: { type: DataTypes.UUID, primaryKey: true },
}, { tableName: 'role_permissions', timestamps: false });

const User = sequelize.define('User', {
  ...UUID_PK,
  company_id: { type: DataTypes.UUID, allowNull: false },
  role_id: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  phone: DataTypes.STRING,
  whatsapp_number: DataTypes.STRING,
  department: DataTypes.STRING,
  branch: DataTypes.STRING,
  reporting_manager_id: DataTypes.UUID,
  password_hash: DataTypes.STRING,
  // In the Vendor model definition, add after password_hash:
  portal_status: { type: DataTypes.STRING, defaultValue: 'invited' }, // invited|active|disabled
  portal_invited_at: DataTypes.DATE,
  mfa_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  status: { type: DataTypes.STRING, defaultValue: 'active' },
  last_login_at: DataTypes.DATE,
  deleted_at: DataTypes.DATE,
  // Cross-company read-only access flag (see middleware/auth.js requirePlatformAdmin
  // and controllers/platformController.js). Not a Role/Permission — those are all
  // scoped to a single company_id by design, so this is deliberately a separate,
  // manually-granted flag rather than something that goes through the normal
  // per-company role system. Defaults false; nobody gets this by accident.
  is_platform_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'users' });

const Vendor = sequelize.define('Vendor', {
  ...UUID_PK,
  // Nullable: a vendor can now self-register a portal account with no buyer
  // attached (company_id: null). Buyer-invited vendors (vendorController.create)
  // still set this to the inviting buyer's company id, so that flow is unchanged.
  // Vendor discovery (vendorDiscoveryController) treats company_id: null rows as
  // publicly matchable by any buyer, and company_id: <buyer> rows as that buyer's
  // private/invited list only.
  company_id: { type: DataTypes.UUID, allowNull: true },
  name: { type: DataTypes.STRING, allowNull: false },
  legal_name: DataTypes.STRING,
  vendor_code: DataTypes.STRING,
  contact_person: DataTypes.STRING,
  phone: DataTypes.STRING,
  // Vendor-portal login looks vendors up by email alone (no company_id in the
  // WHERE clause, since the portal login form has no notion of "which buyer"
  // before authenticating), so two vendor rows sharing an email would make
  // login non-deterministic. Unique + validated the same way User.email is.
  email: { type: DataTypes.STRING, unique: true, validate: { isEmail: true } },
  whatsapp_number: DataTypes.STRING,
  address: DataTypes.JSONB,
  gstin: DataTypes.STRING,
  categories: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
  payment_terms: DataTypes.STRING,
  lead_time_days: DataTypes.INTEGER,
  moq: DataTypes.DECIMAL,
  preferred: { type: DataTypes.BOOLEAN, defaultValue: false },
  rating: DataTypes.DECIMAL(3, 2),
  notes: DataTypes.TEXT,
  status: { type: DataTypes.STRING, defaultValue: 'active' },
  deleted_at: DataTypes.DATE,
  password_hash:      DataTypes.STRING,
  portal_status:      { type: DataTypes.STRING, defaultValue: 'invited' }, // invited|active|disabled
  portal_invited_at:  DataTypes.DATE,
  // Minimum fields needed to execute a payment (bank transfer/NEFT/RTGS or UPI).
  // Nullable — vendors can operate without these until a payment actually needs them.
  bank_account_number: DataTypes.STRING,
  bank_ifsc:           DataTypes.STRING,
  bank_name:           DataTypes.STRING,
  upi_id:              DataTypes.STRING,
}, { tableName: 'vendors' });

const VendorDocument = sequelize.define('VendorDocument', {
  ...UUID_PK,
  vendor_id: { type: DataTypes.UUID, allowNull: false },
  type: DataTypes.STRING,
  file_url: DataTypes.STRING,
  uploaded_by: DataTypes.UUID,
}, { tableName: 'vendor_documents' });

// ADD this after the VendorDocument model definition (around line 60):

const VendorCatalogItem = sequelize.define('VendorCatalogItem', {
  ...UUID_PK,
  vendor_id:      { type: DataTypes.UUID, allowNull: false },
  // Nullable to match Vendor.company_id: a self-registered vendor's catalog
  // items have company_id: null and are matchable by any buyer via vendor
  // discovery; a buyer-invited vendor's catalog items keep that buyer's id.
  company_id:     { type: DataTypes.UUID, allowNull: true },
  name:           { type: DataTypes.STRING, allowNull: false },
  category:       { type: DataTypes.STRING, allowNull: false },
  unit:           DataTypes.STRING,
  price:          DataTypes.DECIMAL(14, 2),
  min_order_qty:  { type: DataTypes.DECIMAL, defaultValue: 1 },
  lead_time_days: DataTypes.INTEGER,
  description:    DataTypes.TEXT,
  is_active:      { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'vendor_catalog_items' });

// Thread-per-PO messaging between company users and vendors
const Message = sequelize.define('Message', {
  ...UUID_PK,
  company_id:     { type: DataTypes.UUID, allowNull: false },
  // either purchase_order_id or invoice_id (one must be set)
  purchase_order_id: DataTypes.UUID,
  invoice_id:     DataTypes.UUID,
  sender_type:    { type: DataTypes.STRING, allowNull: false }, // 'company_user' | 'vendor'
  sender_id:      { type: DataTypes.UUID, allowNull: false },   // User.id or Vendor.id
  sender_name:    DataTypes.STRING,                             // denorm for display
  body:           { type: DataTypes.TEXT, allowNull: false },
  is_system:      { type: DataTypes.BOOLEAN, defaultValue: false }, // auto-generated (mismatch alerts)
}, { tableName: 'messages', updatedAt: false });

const Item = sequelize.define('Item', {
  ...UUID_PK,
  company_id: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  item_code: DataTypes.STRING,
  sku: DataTypes.STRING,
  category: DataTypes.STRING,
  subcategory: DataTypes.STRING,
  description: DataTypes.TEXT,
  unit: DataTypes.STRING,
  brand: DataTypes.STRING,
  specification: DataTypes.JSONB,
  hsn_sac: DataTypes.STRING,
  tax_rate: DataTypes.DECIMAL(5, 2),
  preferred_vendor_id: DataTypes.UUID,
  reorder_level: DataTypes.DECIMAL,
  safety_stock: DataTypes.DECIMAL,
  max_stock: DataTypes.DECIMAL,
  avg_usage_per_month: DataTypes.DECIMAL,
  last_purchase_price: DataTypes.DECIMAL,
  lead_time_days: DataTypes.INTEGER,
  status: { type: DataTypes.STRING, defaultValue: 'active' },
  deleted_at: DataTypes.DATE,
}, { tableName: 'items' });

const PurchaseRequest = sequelize.define('PurchaseRequest', {
  ...UUID_PK,
  company_id: { type: DataTypes.UUID, allowNull: false },
  requested_by: { type: DataTypes.UUID, allowNull: false },
  department: DataTypes.STRING,
  branch: DataTypes.STRING,
  required_date: DataTypes.DATEONLY,
  priority: { type: DataTypes.STRING, defaultValue: 'medium' },
  notes: DataTypes.TEXT,
  status: { type: DataTypes.STRING, defaultValue: 'draft' },
  total_estimated_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
  pr_number: DataTypes.STRING,
}, { tableName: 'purchase_requests' });

const PurchaseRequestItem = sequelize.define('PurchaseRequestItem', {
  ...UUID_PK,
  purchase_request_id: { type: DataTypes.UUID, allowNull: false },
  item_id: DataTypes.UUID,
  item_name_freetext: DataTypes.STRING,
  quantity: { type: DataTypes.DECIMAL, allowNull: false },
  estimated_unit_price: DataTypes.DECIMAL(14, 2),
  budget_amount: DataTypes.DECIMAL(14, 2),
  notes: DataTypes.TEXT,
}, { tableName: 'purchase_request_items' });

const Rfq = sequelize.define('Rfq', {
  ...UUID_PK,
  company_id: { type: DataTypes.UUID, allowNull: false },
  purchase_request_id: { type: DataTypes.UUID, allowNull: false },
  created_by: DataTypes.UUID,
  deadline: DataTypes.DATE,
  delivery_location: DataTypes.STRING,
  terms: DataTypes.TEXT,
  special_instructions: DataTypes.TEXT,
  status: { type: DataTypes.STRING, defaultValue: 'draft' },
  rfq_number: DataTypes.STRING,
}, { tableName: 'rfqs' });

const RfqVendor = sequelize.define('RfqVendor', {
  ...UUID_PK,
  rfq_id: { type: DataTypes.UUID, allowNull: false },
  vendor_id: { type: DataTypes.UUID, allowNull: false },
  channel: DataTypes.STRING,
  sent_at: DataTypes.DATE,
  opened_at: DataTypes.DATE,
  responded_at: DataTypes.DATE,
  status: { type: DataTypes.STRING, defaultValue: 'pending' },
  access_token: { type: DataTypes.STRING, unique: true },
}, { tableName: 'rfq_vendors' });

const Quote = sequelize.define('Quote', {
  ...UUID_PK,
  rfq_vendor_id: { type: DataTypes.UUID, allowNull: false },
  vendor_id: { type: DataTypes.UUID, allowNull: false },
  company_id: { type: DataTypes.UUID, allowNull: false },
  source_file_url: DataTypes.STRING,
  source_type: DataTypes.STRING,
  extraction_status: { type: DataTypes.STRING, defaultValue: 'pending' },
  extraction_note: DataTypes.TEXT,
  payment_terms: DataTypes.STRING,
  delivery_time_days: DataTypes.INTEGER,
  validity_date: DataTypes.DATEONLY,
  total_amount: DataTypes.DECIMAL(14, 2),
  ai_recommended: { type: DataTypes.BOOLEAN, defaultValue: false },
  ai_confidence: DataTypes.DECIMAL(4, 3),
  status: { type: DataTypes.STRING, defaultValue: 'submitted' },
}, { tableName: 'quotes' });

const QuoteItem = sequelize.define('QuoteItem', {
  ...UUID_PK,
  quote_id: { type: DataTypes.UUID, allowNull: false },
  purchase_request_item_id: DataTypes.UUID,
  item_name_raw: DataTypes.STRING,
  item_code_raw: DataTypes.STRING,
  quantity: DataTypes.DECIMAL,
  unit_price: DataTypes.DECIMAL(14, 2),
  total_price: DataTypes.DECIMAL(14, 2),
  tax: DataTypes.DECIMAL(14, 2),
  freight: DataTypes.DECIMAL(14, 2),
  discount: DataTypes.DECIMAL(14, 2),
  warranty: DataTypes.STRING,
  availability: DataTypes.STRING,
  notes: DataTypes.TEXT,
  confidence_score: DataTypes.DECIMAL(4, 3),
}, { tableName: 'quote_items' });

const AiExtraction = sequelize.define('AiExtraction', {
  ...UUID_PK,
  company_id: DataTypes.UUID,
  source_table: DataTypes.STRING,
  source_id: DataTypes.UUID,
  raw_text: DataTypes.TEXT,
  structured_json: DataTypes.JSONB,
  model_used: DataTypes.STRING,
  confidence_overall: DataTypes.DECIMAL(4, 3),
  reviewed_by: DataTypes.UUID,
  reviewed_at: DataTypes.DATE,
}, { tableName: 'ai_extractions' });

const AiRecommendation = sequelize.define('AiRecommendation', {
  ...UUID_PK,
  company_id: DataTypes.UUID,
  rfq_id: DataTypes.UUID,
  recommended_quote_id: DataTypes.UUID,
  reasoning_text: DataTypes.TEXT,
  score_breakdown: DataTypes.JSONB,
  savings_estimate: DataTypes.DECIMAL(14, 2),
  confidence: DataTypes.DECIMAL(4, 3),
  overridden_by: DataTypes.UUID,
}, { tableName: 'ai_recommendations' });

const Approval = sequelize.define('Approval', {
  ...UUID_PK,
  company_id: DataTypes.UUID,
  approvable_type: DataTypes.STRING,
  approvable_id: DataTypes.UUID,
  level: { type: DataTypes.INTEGER, defaultValue: 1 },
  approver_id: DataTypes.UUID,
  status: { type: DataTypes.STRING, defaultValue: 'pending' },
  comments: DataTypes.TEXT,
  acted_at: DataTypes.DATE,
}, { tableName: 'approvals' });

const PurchaseOrder = sequelize.define('PurchaseOrder', {
  ...UUID_PK,
  company_id: { type: DataTypes.UUID, allowNull: false },
  rfq_id: DataTypes.UUID,
  quote_id: DataTypes.UUID,
  vendor_id: { type: DataTypes.UUID, allowNull: false },
  po_number: DataTypes.STRING,
  status: { type: DataTypes.STRING, defaultValue: 'draft' },
  total_amount: DataTypes.DECIMAL(14, 2),
  delivery_location: DataTypes.STRING,
  expected_delivery_date: DataTypes.DATEONLY,
  pdf_url: DataTypes.STRING,
  created_by: DataTypes.UUID,
}, { tableName: 'purchase_orders' });

const PoItem = sequelize.define('PoItem', {
  ...UUID_PK,
  purchase_order_id: { type: DataTypes.UUID, allowNull: false },
  item_id: DataTypes.UUID,
  item_name: DataTypes.STRING,
  quantity: DataTypes.DECIMAL,
  unit_price: DataTypes.DECIMAL(14, 2),
  total_price: DataTypes.DECIMAL(14, 2),
  received_quantity: { type: DataTypes.DECIMAL, defaultValue: 0 },
  // Carried over from the selected QuoteItem when the PO is created, so invoice
  // 3-way matching has something real to compare tax/freight/discount against
  // instead of always showing "N/A".
  tax: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
  freight: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
  discount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
}, { tableName: 'po_items' });

const GoodsReceipt = sequelize.define('GoodsReceipt', {
  ...UUID_PK,
  company_id: DataTypes.UUID,
  purchase_order_id: { type: DataTypes.UUID, allowNull: false },
  received_by: DataTypes.UUID,
  received_date: DataTypes.DATEONLY,
  status: { type: DataTypes.STRING, defaultValue: 'pending_inspection' },
  notes: DataTypes.TEXT,
}, { tableName: 'goods_receipts' });

const GoodsReceiptItem = sequelize.define('GoodsReceiptItem', {
  ...UUID_PK,
  goods_receipt_id: { type: DataTypes.UUID, allowNull: false },
  po_item_id: { type: DataTypes.UUID, allowNull: false },
  quantity_received: DataTypes.DECIMAL,
  quantity_damaged: { type: DataTypes.DECIMAL, defaultValue: 0 },
  quantity_shortage: { type: DataTypes.DECIMAL, defaultValue: 0 },
  photo_urls: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
  inspection_status: DataTypes.STRING,
}, { tableName: 'goods_receipt_items' });

const Invoice = sequelize.define('Invoice', {
  ...UUID_PK,
  company_id: { type: DataTypes.UUID, allowNull: false },
  purchase_order_id: DataTypes.UUID,
  vendor_id: { type: DataTypes.UUID, allowNull: false },
  invoice_number: DataTypes.STRING,
  invoice_date: DataTypes.DATEONLY,
  file_url: DataTypes.STRING,
  total_amount: DataTypes.DECIMAL(14, 2),
  match_status: { type: DataTypes.STRING, defaultValue: 'pending' },
  match_type: DataTypes.STRING,
  mismatch_reason: DataTypes.TEXT,
  finance_approved_by: DataTypes.UUID,
  payment_status: { type: DataTypes.STRING, defaultValue: 'unpaid' },
  // Set when payment_status transitions to 'paid' via invoiceController.markPaid.
  // Previously there was no code path that ever set payment_status to 'paid',
  // so an invoice-to-payment cycle time could never be computed.
  paid_at: DataTypes.DATE,
  paid_by: DataTypes.UUID,
}, { tableName: 'invoices' });

const InvoiceItem = sequelize.define('InvoiceItem', {
  ...UUID_PK,
  invoice_id: { type: DataTypes.UUID, allowNull: false },
  po_item_id: DataTypes.UUID,
  item_name_raw: DataTypes.STRING,
  quantity: DataTypes.DECIMAL,
  unit_price: DataTypes.DECIMAL(14, 2),
  total_price: DataTypes.DECIMAL(14, 2),
  // Populated by aiService.extractInvoice's LLM extraction (defaults to 0 when
  // the invoice text doesn't mention them) so 3-way matching can flag real
  // tax/freight/discount deltas against the linked PO line, not just totals.
  tax: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
  freight: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
  discount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
  confidence_score: DataTypes.DECIMAL(4, 3),
}, { tableName: 'invoice_items' });

const VendorScore = sequelize.define('VendorScore', {
  ...UUID_PK,
  vendor_id: { type: DataTypes.UUID, allowNull: false },
  company_id: DataTypes.UUID,
  period: DataTypes.DATEONLY,
  price_competitiveness: DataTypes.DECIMAL(4, 2),
  delivery_reliability: DataTypes.DECIMAL(4, 2),
  response_time_score: DataTypes.DECIMAL(4, 2),
  quality_score: DataTypes.DECIMAL(4, 2),
  overall_score: DataTypes.DECIMAL(4, 2),
}, { tableName: 'vendor_scores' });

const Inventory = sequelize.define('Inventory', {
  ...UUID_PK,
  company_id: DataTypes.UUID,
  item_id: { type: DataTypes.UUID, allowNull: false },
  current_stock: { type: DataTypes.DECIMAL, defaultValue: 0 },
  last_updated_at: DataTypes.DATE,
}, { tableName: 'inventory' });

const ReorderRule = sequelize.define('ReorderRule', {
  ...UUID_PK,
  item_id: { type: DataTypes.UUID, allowNull: false, unique: true },
  reorder_point: DataTypes.DECIMAL,
  reorder_quantity: DataTypes.DECIMAL,
  auto_alert: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'reorder_rules' });

const Notification = sequelize.define('Notification', {
  ...UUID_PK,
  company_id: DataTypes.UUID,
  user_id: DataTypes.UUID,
  vendor_id: DataTypes.UUID,
  channel: DataTypes.STRING,
  type: DataTypes.STRING,
  payload: DataTypes.JSONB,
  status: { type: DataTypes.STRING, defaultValue: 'queued' },
  sent_at: DataTypes.DATE,
}, { tableName: 'notifications' });

const Attachment = sequelize.define('Attachment', {
  ...UUID_PK,
  company_id: DataTypes.UUID,
  attachable_type: DataTypes.STRING,
  attachable_id: DataTypes.UUID,
  file_url: DataTypes.STRING,
  file_type: DataTypes.STRING,
  uploaded_by: DataTypes.UUID,
}, { tableName: 'attachments' });

const AuditLog = sequelize.define('AuditLog', {
  ...UUID_PK,
  company_id: DataTypes.UUID,
  user_id: DataTypes.UUID,
  action: { type: DataTypes.STRING, allowNull: false },
  entity_type: DataTypes.STRING,
  entity_id: DataTypes.UUID,
  before_value: DataTypes.JSONB,
  after_value: DataTypes.JSONB,
  ip_address: DataTypes.STRING,
}, { tableName: 'audit_logs', updatedAt: false });

const Setting = sequelize.define('Setting', {
  ...UUID_PK,
  company_id: DataTypes.UUID,
  key: DataTypes.STRING,
  value: DataTypes.JSONB,
}, { tableName: 'settings' });

// Payment queue: PO approved -> goods received -> invoice uploaded -> matched
// -> approved -> payment QUEUED (this row created) -> EXECUTED (reference
// generated) -> vendor CONFIRMED -> order closed (see paymentController.js).
const Payment = sequelize.define('Payment', {
  ...UUID_PK,
  company_id: { type: DataTypes.UUID, allowNull: false },
  invoice_id: { type: DataTypes.UUID, allowNull: false },
  purchase_order_id: DataTypes.UUID,
  vendor_id: { type: DataTypes.UUID, allowNull: false },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  method: { type: DataTypes.STRING, defaultValue: 'bank_transfer' }, // bank_transfer|neft|rtgs|upi|ach|cheque|card
  status: { type: DataTypes.STRING, defaultValue: 'queued' }, // queued|executed|confirmed|failed
  reference_number: DataTypes.STRING, // UTR-like value, generated on execute
  notes: DataTypes.TEXT,
  queued_by: DataTypes.UUID,
  executed_by: DataTypes.UUID,
  executed_at: DataTypes.DATE,
  confirmed_at: DataTypes.DATE,
}, { tableName: 'payments' });

// Billing: selling item-master items to a customer. Reduces inventory
// (mirrors GRN increasing it). Smallest possible addition — no separate
// customer master, just a name/contact on the bill itself.
const Bill = sequelize.define('Bill', {
  ...UUID_PK,
  company_id: { type: DataTypes.UUID, allowNull: false },
  bill_number: DataTypes.STRING,
  customer_name: { type: DataTypes.STRING, allowNull: false },
  customer_contact: DataTypes.STRING,
  total_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
  status: { type: DataTypes.STRING, defaultValue: 'issued' },
  created_by: DataTypes.UUID,
}, { tableName: 'bills' });

const BillItem = sequelize.define('BillItem', {
  ...UUID_PK,
  bill_id: { type: DataTypes.UUID, allowNull: false },
  item_id: { type: DataTypes.UUID, allowNull: false },
  item_name: DataTypes.STRING,
  quantity: { type: DataTypes.DECIMAL, allowNull: false },
  unit_price: DataTypes.DECIMAL(14, 2),
  total_price: DataTypes.DECIMAL(14, 2),
}, { tableName: 'bill_items' });

// ---- Associations ----
Company.hasMany(User, { foreignKey: 'company_id' });
User.belongsTo(Company, { foreignKey: 'company_id' });
Role.hasMany(User, { foreignKey: 'role_id' });
User.belongsTo(Role, { foreignKey: 'role_id' });
Role.belongsToMany(Permission, { through: RolePermission, foreignKey: 'role_id' });
Permission.belongsToMany(Role, { through: RolePermission, foreignKey: 'permission_id' });

Vendor.hasMany(VendorDocument, { foreignKey: 'vendor_id' });
Vendor.hasMany(PurchaseOrder, { foreignKey: 'vendor_id' });
Vendor.hasMany(VendorScore, { foreignKey: 'vendor_id' });

Vendor.hasMany(VendorCatalogItem, { foreignKey: 'vendor_id', as: 'catalogItems' });
VendorCatalogItem.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'Vendor' });

PurchaseOrder.hasMany(Message, { foreignKey: 'purchase_order_id', as: 'messages' });
Message.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' });
Invoice.hasMany(Message, { foreignKey: 'invoice_id', as: 'messages' });
Message.belongsTo(Invoice, { foreignKey: 'invoice_id' });

PurchaseRequest.hasMany(PurchaseRequestItem, { foreignKey: 'purchase_request_id', as: 'items' });
PurchaseRequestItem.belongsTo(PurchaseRequest, { foreignKey: 'purchase_request_id' });
PurchaseRequestItem.belongsTo(Item, { foreignKey: 'item_id' });
PurchaseRequest.belongsTo(User, { as: 'Requester', foreignKey: 'requested_by' });

PurchaseRequest.hasMany(Rfq, { foreignKey: 'purchase_request_id' });
Rfq.belongsTo(PurchaseRequest, { foreignKey: 'purchase_request_id' });

Rfq.hasMany(RfqVendor, { foreignKey: 'rfq_id', as: 'rfqVendors' });
RfqVendor.belongsTo(Rfq, { foreignKey: 'rfq_id' });
RfqVendor.belongsTo(Vendor, { foreignKey: 'vendor_id' });

RfqVendor.hasMany(Quote, { foreignKey: 'rfq_vendor_id' });
Quote.belongsTo(RfqVendor, { foreignKey: 'rfq_vendor_id' });
Quote.belongsTo(Vendor, { foreignKey: 'vendor_id' });
Quote.hasMany(QuoteItem, { foreignKey: 'quote_id', as: 'items' });
QuoteItem.belongsTo(Quote, { foreignKey: 'quote_id' });

// AiExtraction is polymorphic (source_table + source_id instead of a real FK), so these
// associations use constraints:false + a scope on source_table, the same pattern already
// used for Approval above. Without this, quoteController.getOne's `include: [{ model:
// AiExtraction, ... }]` throws "AiExtraction is not associated to Quote!" (Sequelize
// requires an association to exist for any include), which 500s GET /quotes/:id and makes
// the Quote Detail / "View Quote" page render as empty/not-found on the frontend.
Quote.hasMany(AiExtraction, { foreignKey: 'source_id', constraints: false, scope: { source_table: 'quote' } });
AiExtraction.belongsTo(Quote, { foreignKey: 'source_id', constraints: false });
Invoice.hasMany(AiExtraction, { foreignKey: 'source_id', constraints: false, scope: { source_table: 'invoice' } });
AiExtraction.belongsTo(Invoice, { foreignKey: 'source_id', constraints: false });

PurchaseOrder.hasMany(PoItem, { foreignKey: 'purchase_order_id', as: 'items' });
PoItem.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' });
PurchaseOrder.belongsTo(Vendor, { foreignKey: 'vendor_id' });

PurchaseOrder.hasMany(GoodsReceipt, { foreignKey: 'purchase_order_id' });
GoodsReceipt.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' });
GoodsReceipt.hasMany(GoodsReceiptItem, { foreignKey: 'goods_receipt_id', as: 'items' });
GoodsReceiptItem.belongsTo(PoItem, { foreignKey: 'po_item_id' });

PurchaseOrder.hasMany(Invoice, { foreignKey: 'purchase_order_id' });
Invoice.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' });
Invoice.belongsTo(Vendor, { foreignKey: 'vendor_id' });
Invoice.hasMany(InvoiceItem, { foreignKey: 'invoice_id', as: 'items' });
InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoice_id' });

Item.hasOne(Inventory, { foreignKey: 'item_id' });
Item.hasOne(ReorderRule, { foreignKey: 'item_id' });
ReorderRule.belongsTo(Item, { foreignKey: 'item_id' });
Item.belongsTo(Vendor, { as: 'PreferredVendor', foreignKey: 'preferred_vendor_id' });
PurchaseRequest.hasMany(Approval, { foreignKey: 'approvable_id', constraints: false, scope: { approvable_type: 'purchase_request' } });
Approval.belongsTo(PurchaseRequest, { foreignKey: 'approvable_id', constraints: false });

PurchaseOrder.hasMany(Approval, { foreignKey: 'approvable_id', constraints: false, scope: { approvable_type: 'purchase_order' } });
Approval.belongsTo(PurchaseOrder, { foreignKey: 'approvable_id', constraints: false });

User.hasMany(Approval, { foreignKey: 'approver_id', constraints: false });
Approval.belongsTo(User, { as: 'Approver', foreignKey: 'approver_id', constraints: false });

Invoice.hasMany(Payment, { foreignKey: 'invoice_id' });
Payment.belongsTo(Invoice, { foreignKey: 'invoice_id' });
Payment.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' });
Payment.belongsTo(Vendor, { foreignKey: 'vendor_id' });
Vendor.hasMany(Payment, { foreignKey: 'vendor_id' });

Bill.hasMany(BillItem, { foreignKey: 'bill_id', as: 'items' });
BillItem.belongsTo(Bill, { foreignKey: 'bill_id' });
BillItem.belongsTo(Item, { foreignKey: 'item_id' });

module.exports = {
  sequelize,
  Company, Role, Permission, RolePermission, User,
  Vendor, VendorDocument, Item,
  PurchaseRequest, PurchaseRequestItem,
  Rfq, RfqVendor, Quote, QuoteItem,
  AiExtraction, AiRecommendation,
  Approval, PurchaseOrder, PoItem,
  GoodsReceipt, GoodsReceiptItem,
  Invoice, InvoiceItem,
  VendorScore, Inventory, ReorderRule,
  Notification, Attachment, AuditLog, Setting,VendorCatalogItem,Message,
  Payment, Bill, BillItem,
};
