const bcrypt = require('bcryptjs');
const { Company, User, Role, Permission, RolePermission } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { okResponse, errorResponse } = require('../utils/helpers');
const { audit } = require('../middleware/audit');

exports.signup = asyncHandler(async (req, res) => {
  const { company_name, industry, gstin, admin_name, admin_email, admin_password } = req.body;
  if (!company_name || !admin_email || !admin_password)
    return errorResponse(res, 'VALIDATION_ERROR', 'company_name, admin_email and admin_password required');

  const existing = await User.findOne({ where: { email: admin_email.toLowerCase() } });
  if (existing) return errorResponse(res, 'DUPLICATE', 'Email already registered', 409);

  const company = await Company.create({ name: company_name, gstin, industry });

  // Auto-create Company Admin role for this company
  const allPerms = await Permission.findAll();
  const adminRole = await Role.create({ company_id: company.id, name: 'Company Admin', is_system: true });
  await RolePermission.bulkCreate(allPerms.map((p) => ({ role_id: adminRole.id, permission_id: p.id })));

  const hash = await bcrypt.hash(admin_password, 10);
  const user = await User.create({
    company_id: company.id,
    role_id: adminRole.id,
    name: admin_name || admin_email,
    email: admin_email.toLowerCase(),
    password_hash: hash,
    status: 'active',
  });

  await audit({ companyId: company.id, userId: user.id, action: 'company.created', entityType: 'Company', entityId: company.id, after: company.toJSON(), ip: req.ip });

  okResponse(res, { company: { id: company.id, name: company.name }, message: 'Company created — please login' }, 201);
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
