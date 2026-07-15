const bcrypt = require('bcryptjs');
const { Company, User, Role, Permission, RolePermission } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { okResponse, errorResponse } = require('../utils/helpers');
const { audit } = require('../middleware/audit');
const { SYSTEM_PERMISSIONS, SYSTEM_ROLES } = require('../utils/systemRoles');

exports.signup = asyncHandler(async (req, res) => {
  const { company_name, industry, gstin, admin_name, admin_email, admin_password, admin_phone } = req.body;
  if (!company_name || !admin_email || !admin_password)
    return errorResponse(res, 'VALIDATION_ERROR', 'company_name, admin_email and admin_password required');

  const existing = await User.findOne({ where: { email: admin_email.toLowerCase() } });
  if (existing) return errorResponse(res, 'DUPLICATE', 'Email already registered', 409);

  const company = await Company.create({ name: company_name, gstin, industry });

  // Make sure the permission catalog actually exists. Previously this relied
  // on `npm run seed` having been run at least once against this database —
  // on a fresh production DB that was never seeded, Permission.findAll()
  // returned an empty list and the founding admin's role got created with
  // ZERO permissions, locking them out of their own company. findOrCreate
  // here makes signup self-sufficient regardless of seed state.
  const permMap = {};
  for (const p of SYSTEM_PERMISSIONS) {
    const [perm] = await Permission.findOrCreate({ where: { code: p.code }, defaults: p });
    permMap[p.code] = perm;
  }

  // Create the full starter role set for this company — not just a single
  // "Company Admin" role. Previously there was no way for a real company to
  // create additional roles (no POST /roles existed), so segregation of
  // duties (Requester vs Approver vs Finance vs Warehouse) was impossible
  // to configure outside the hardcoded Demo Company. These roles now exist
  // immediately; the admin can also create further custom roles via
  // POST /roles and edit any role's permissions via PATCH /roles/:id/permissions.
  const roleMap = {};
  for (const r of SYSTEM_ROLES) {
    const role = await Role.create({ company_id: company.id, name: r.name, is_system: true });
    const rows = r.permissions.filter((code) => permMap[code]).map((code) => ({ role_id: role.id, permission_id: permMap[code].id }));
    if (rows.length) await RolePermission.bulkCreate(rows);
    roleMap[r.name] = role;
  }
  const adminRole = roleMap['Company Admin'];

  const hash = await bcrypt.hash(admin_password, 10);
  const user = await User.create({
    company_id: company.id,
    role_id: adminRole.id,
    name: admin_name || admin_email,
    email: admin_email.toLowerCase(),
    phone: admin_phone,
    password_hash: hash,
    status: 'active',
  });

  await audit({ companyId: company.id, userId: user.id, action: 'company.created', entityType: 'Company', entityId: company.id, after: company.toJSON(), ip: req.ip });

  okResponse(res, { company: { id: company.id, name: company.name }, message: 'Company created — please login' }, 201);
});

// ── PUBLIC: search companies by name (vendor self-signup "find your buyer") ──
// Deliberately returns only id + name — nothing else about the company is exposed.
exports.searchPublic = asyncHandler(async (req, res) => {
  const { Op } = require('sequelize');
  const q = (req.query.q || '').trim();
  if (q.length < 2) return okResponse(res, []);
  const companies = await Company.findAll({
    where: { name: { [Op.iLike]: `%${q}%` }, status: 'active' },
    attributes: ['id', 'name'],
    limit: 10,
    order: [['name', 'ASC']],
  });
  okResponse(res, companies);
});

exports.getMyCompany = asyncHandler(async (req, res) => {
  const company = await Company.findByPk(req.companyId);
  okResponse(res, company);
});

exports.updateMyCompany = asyncHandler(async (req, res) => {
  const company = await Company.findByPk(req.companyId);
  const before = company.toJSON();
  const allowed = ['name', 'legal_name', 'gstin', 'pan', 'address', 'logo_url', 'industry', 'approval_thresholds', 'settings', 'currency', 'timezone'];
  allowed.forEach((f) => { if (req.body[f] !== undefined) company[f] = req.body[f]; });
  await company.save();
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'company.updated', entityType: 'Company', entityId: company.id, before, after: company.toJSON(), ip: req.ip });
  okResponse(res, company);
});
