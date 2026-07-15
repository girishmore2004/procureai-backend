// Single source of truth for the permission catalog and the default
// (starter) role set every company gets. Previously this list only lived
// inside config/seed.js and only ever ran for the hardcoded "Demo Company" —
// a real company created via POST /companies got exactly one role
// ("Company Admin", every permission) with no way to create additional
// roles, which made segregation of duties (Requester vs Approver vs
// Finance vs Warehouse) impossible to configure for any real tenant.
//
// companyController.signup now uses this module to (a) make sure every
// permission code actually exists in the DB even on a brand-new database
// that was never `npm run seed`-ed, and (b) create the full starter role
// set for the new company, not just a single admin role.

const SYSTEM_PERMISSIONS = [
  // Users
  { code: 'users.view', description: 'View users' },
  { code: 'users.create', description: 'Create users' },
  { code: 'users.edit', description: 'Edit users' },
  { code: 'users.delete', description: 'Delete users' },
  // Vendors
  { code: 'vendors.view', description: 'View vendors' },
  { code: 'vendors.create', description: 'Create vendors' },
  { code: 'vendors.edit', description: 'Edit vendors' },
  { code: 'vendors.delete', description: 'Archive vendors' },
  // Items
  { code: 'items.view', description: 'View items' },
  { code: 'items.create', description: 'Create items' },
  { code: 'items.edit', description: 'Edit items' },
  { code: 'items.delete', description: 'Archive items' },
  // Purchase Requests
  { code: 'pr.view', description: 'View purchase requests' },
  { code: 'pr.create', description: 'Create purchase requests' },
  { code: 'pr.edit', description: 'Edit purchase requests' },
  { code: 'pr.approve', description: 'Approve purchase requests' },
  // RFQs
  { code: 'rfq.view', description: 'View RFQs' },
  { code: 'rfq.create', description: 'Create RFQs' },
  { code: 'rfq.send', description: 'Send RFQs to vendors' },
  // Quotes
  { code: 'quotes.view', description: 'View quotes' },
  { code: 'quotes.review', description: 'Review AI-extracted quotes' },
  // Purchase Orders
  { code: 'po.view', description: 'View POs' },
  { code: 'po.create', description: 'Create POs' },
  { code: 'po.send', description: 'Send POs to vendors' },
  { code: 'po.approve', description: 'Approve POs' },
  // GRN
  { code: 'grn.view', description: 'View GRNs' },
  { code: 'grn.create', description: 'Create GRNs' },
  // Invoices
  { code: 'invoices.view', description: 'View invoices' },
  { code: 'invoices.create', description: 'Upload invoices' },
  { code: 'invoices.approve', description: 'Approve invoices (Finance)' },
  // Payments
  { code: 'payments.view', description: 'View payment queue' },
  { code: 'payments.approve', description: 'Queue and execute payments (Finance)' },
  // Billing
  { code: 'billing.view', description: 'View bills' },
  { code: 'billing.create', description: 'Create bills (sell items, reduce inventory)' },
  // Analytics
  { code: 'analytics.view', description: 'View analytics' },
  // Audit
  { code: 'audit.view', description: 'View audit logs' },
  // Settings
  { code: 'settings.view', description: 'View settings' },
  { code: 'settings.edit', description: 'Edit settings' },
];

// Starter roles created automatically for every new company on signup.
// "Company Admin" (all permissions) is the one the signing-up user gets so
// they're never locked out; the rest exist immediately so the admin can
// invite teammates into a properly segregated role from day one instead of
// everyone being forced into Company Admin.
const SYSTEM_ROLES = [
  {
    name: 'Company Admin',
    permissions: SYSTEM_PERMISSIONS.map((p) => p.code),
  },
  {
    name: 'Procurement Manager',
    permissions: [
      'vendors.view', 'vendors.create', 'vendors.edit',
      'items.view', 'items.create', 'items.edit',
      'pr.view', 'pr.create', 'pr.edit', 'pr.approve',
      'rfq.view', 'rfq.create', 'rfq.send',
      'quotes.view', 'quotes.review',
      'po.view', 'po.create', 'po.send', 'po.approve',
      'grn.view', 'invoices.view', 'analytics.view', 'payments.view', 'billing.view', 'billing.create',
    ],
  },
  {
    name: 'Procurement Executive',
    permissions: [
      'vendors.view', 'items.view',
      'pr.view', 'pr.create',
      'rfq.view', 'rfq.create',
      'quotes.view', 'quotes.review',
      'po.view', 'po.create',
      'grn.view',
    ],
  },
  {
    name: 'Requester',
    permissions: ['pr.view', 'pr.create', 'items.view'],
  },
  {
    name: 'Approver',
    permissions: ['pr.view', 'pr.approve', 'po.view', 'po.approve', 'analytics.view'],
  },
  {
    name: 'Finance',
    permissions: ['invoices.view', 'invoices.create', 'invoices.approve', 'po.view', 'analytics.view', 'payments.view', 'payments.approve', 'billing.view'],
  },
  {
    name: 'Warehouse',
    permissions: ['grn.view', 'grn.create', 'po.view', 'items.view', 'billing.view', 'billing.create'],
  },
];

module.exports = { SYSTEM_PERMISSIONS, SYSTEM_ROLES };
