// require('dotenv').config();
// const bcrypt = require('bcryptjs');
// const { sequelize, Company, Role, Permission, RolePermission, User } = require('../models');

// const SYSTEM_PERMISSIONS = [
//   // Users
//   { code: 'users.view', description: 'View users' },
//   { code: 'users.create', description: 'Create users' },
//   { code: 'users.edit', description: 'Edit users' },
//   { code: 'users.delete', description: 'Delete users' },
//   // Vendors
//   { code: 'vendors.view', description: 'View vendors' },
//   { code: 'vendors.create', description: 'Create vendors' },
//   { code: 'vendors.edit', description: 'Edit vendors' },
//   { code: 'vendors.delete', description: 'Archive vendors' },
//   // Items
//   { code: 'items.view', description: 'View items' },
//   { code: 'items.create', description: 'Create items' },
//   { code: 'items.edit', description: 'Edit items' },
//   { code: 'items.delete', description: 'Archive items' },
//   // Purchase Requests
//   { code: 'pr.view', description: 'View purchase requests' },
//   { code: 'pr.create', description: 'Create purchase requests' },
//   { code: 'pr.edit', description: 'Edit purchase requests' },
//   { code: 'pr.approve', description: 'Approve purchase requests' },
//   // RFQs
//   { code: 'rfq.view', description: 'View RFQs' },
//   { code: 'rfq.create', description: 'Create RFQs' },
//   { code: 'rfq.send', description: 'Send RFQs to vendors' },
//   // Quotes
//   { code: 'quotes.view', description: 'View quotes' },
//   { code: 'quotes.review', description: 'Review AI-extracted quotes' },
//   // Purchase Orders
//   { code: 'po.view', description: 'View POs' },
//   { code: 'po.create', description: 'Create POs' },
//   { code: 'po.send', description: 'Send POs to vendors' },
//   { code: 'po.approve', description: 'Approve POs' },
//   // GRN
//   { code: 'grn.view', description: 'View GRNs' },
//   { code: 'grn.create', description: 'Create GRNs' },
//   // Invoices
//   { code: 'invoices.view', description: 'View invoices' },
//   { code: 'invoices.create', description: 'Upload invoices' },
//   { code: 'invoices.approve', description: 'Approve invoices (Finance)' },
//   // Analytics
//   { code: 'analytics.view', description: 'View analytics' },
//   // Audit
//   { code: 'audit.view', description: 'View audit logs' },
//   // Settings
//   { code: 'settings.view', description: 'View settings' },
//   { code: 'settings.edit', description: 'Edit settings' },
// ];

// const SYSTEM_ROLES = [
//   {
//     name: 'Super Admin',
//     permissions: SYSTEM_PERMISSIONS.map((p) => p.code),
//   },
//   {
//     name: 'Company Admin',
//     permissions: SYSTEM_PERMISSIONS.map((p) => p.code),
//   },
//   {
//     name: 'Procurement Manager',
//     permissions: [
//       'vendors.view', 'vendors.create', 'vendors.edit',
//       'items.view', 'items.create', 'items.edit',
//       'pr.view', 'pr.create', 'pr.edit', 'pr.approve',
//       'rfq.view', 'rfq.create', 'rfq.send',
//       'quotes.view', 'quotes.review',
//       'po.view', 'po.create', 'po.send', 'po.approve',
//       'grn.view', 'invoices.view', 'analytics.view',
//     ],
//   },
//   {
//     name: 'Procurement Executive',
//     permissions: [
//       'vendors.view', 'items.view',
//       'pr.view', 'pr.create',
//       'rfq.view', 'rfq.create',
//       'quotes.view', 'quotes.review',
//       'po.view', 'po.create',
//       'grn.view',
//     ],
//   },
//   {
//     name: 'Requester',
//     permissions: ['pr.view', 'pr.create', 'items.view'],
//   },
//   {
//     name: 'Approver',
//     permissions: ['pr.view', 'pr.approve', 'po.view', 'po.approve', 'analytics.view'],
//   },
//   {
//     name: 'Finance',
//     permissions: ['invoices.view', 'invoices.create', 'invoices.approve', 'po.view', 'analytics.view'],
//   },
//   {
//     name: 'Warehouse',
//     permissions: ['grn.view', 'grn.create', 'po.view', 'items.view'],
//   },
// ];

// async function seed() {
//   try {
//     await sequelize.authenticate();
//     await sequelize.sync({ alter: true });

//     // Create permissions
//     const permMap = {};
//     for (const p of SYSTEM_PERMISSIONS) {
//       const [perm] = await Permission.findOrCreate({ where: { code: p.code }, defaults: p });
//       permMap[p.code] = perm;
//     }

//     // Create demo company
//     const [company] = await Company.findOrCreate({
//       where: { name: 'Demo Company' },
//       defaults: {
//         legal_name: 'Demo Company Pvt Ltd',
//         gstin: '27AAPFD1234F1Z5',
//         industry: 'Manufacturing',
//         plan: 'pro',
//       },
//     });

//     // Create system roles (linked to demo company)
//     const roleMap = {};
//     for (const r of SYSTEM_ROLES) {
//       const [role] = await Role.findOrCreate({
//         where: { name: r.name, company_id: company.id },
//         defaults: { name: r.name, company_id: company.id, is_system: true },
//       });
//       // Assign permissions
//       await RolePermission.destroy({ where: { role_id: role.id } });
//       for (const code of r.permissions) {
//         if (permMap[code]) {
//           await RolePermission.findOrCreate({
//             where: { role_id: role.id, permission_id: permMap[code].id },
//           });
//         }
//       }
//       roleMap[r.name] = role;
//     }

//     // Create super admin user
//     const hash = await bcrypt.hash('Admin@123', 10);
//     const [admin] = await User.findOrCreate({
//       where: { email: 'admin@demo.com' },
//       defaults: {
//         company_id: company.id,
//         role_id: roleMap['Company Admin'].id,
//         name: 'Demo Admin',
//         email: 'admin@demo.com',
//         password_hash: hash,
//         status: 'active',
//       },
//     });

//     console.log('Seed complete');
//     console.log(`Company: ${company.name} (${company.id})`);
//     console.log(`Admin: admin@demo.com / Admin@123`);
//     process.exit(0);
//   } catch (err) {
//     console.error('Seed failed:', err);
//     process.exit(1);
//   }
// }

// seed();









require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, Company, Role, Permission, RolePermission, User } = require('../models');

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

const SYSTEM_ROLES = [
  {
    name: 'Super Admin',
    permissions: SYSTEM_PERMISSIONS.map((p) => p.code),
  },
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

async function seed() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });

    // Create permissions
    const permMap = {};
    for (const p of SYSTEM_PERMISSIONS) {
      const [perm] = await Permission.findOrCreate({ where: { code: p.code }, defaults: p });
      permMap[p.code] = perm;
    }

    // Create demo company
    const [company] = await Company.findOrCreate({
      where: { name: 'Demo Company' },
      defaults: {
        legal_name: 'Demo Company Pvt Ltd',
        gstin: '27AAPFD1234F1Z5',
        industry: 'Manufacturing',
        plan: 'pro',
      },
    });

    // Create system roles (linked to demo company)
    const roleMap = {};
    for (const r of SYSTEM_ROLES) {
      const [role] = await Role.findOrCreate({
        where: { name: r.name, company_id: company.id },
        defaults: { name: r.name, company_id: company.id, is_system: true },
      });
      // Assign permissions
      await RolePermission.destroy({ where: { role_id: role.id } });
      for (const code of r.permissions) {
        if (permMap[code]) {
          await RolePermission.findOrCreate({
            where: { role_id: role.id, permission_id: permMap[code].id },
          });
        }
      }
      roleMap[r.name] = role;
    }

    // Create super admin user
    const hash = await bcrypt.hash('Admin@123', 10);
    const [admin] = await User.findOrCreate({
      where: { email: 'admin@demo.com' },
      defaults: {
        company_id: company.id,
        role_id: roleMap['Company Admin'].id,
        name: 'Demo Admin',
        email: 'admin@demo.com',
        password_hash: hash,
        status: 'active',
      },
    });

    console.log('Seed complete');
    console.log(`Company: ${company.name} (${company.id})`);
    console.log(`Admin: admin@demo.com / Admin@123`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
