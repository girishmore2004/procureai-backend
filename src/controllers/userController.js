const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Role, Permission } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse, generateTempPassword } = require('../utils/helpers');
const { audit } = require('../middleware/audit');
const notificationService = require('../services/notificationService');

exports.list = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId, deleted_at: null };
  if (req.query.role_id) where.role_id = req.query.role_id;
  if (req.query.department) where.department = req.query.department;
  if (req.query.status) where.status = req.query.status;
  const result = await User.findAndCountAll({ where, include: [Role], limit, offset, order: [['created_at', 'DESC']] });
  paginatedResponse(res, result, { page, perPage });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, email, role_id, department, branch, phone, whatsapp_number, reporting_manager_id, password } = req.body;
  if (!name || !email || !role_id)
    return errorResponse(res, 'VALIDATION_ERROR', 'name, email, role_id required');

  const role = await Role.findOne({ where: { id: role_id, company_id: req.companyId } });
  if (!role) return errorResponse(res, 'NOT_FOUND', 'Role not found', 404);

  // A random temp password is generated per-user (not derived from their email —
  // that was never actually implemented, only implied). It's emailed to them below;
  // if email isn't configured, it's returned in the response so an admin can share it.
  const tempPassword = password || generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, 10);
  const user = await User.create({
    company_id: req.companyId, name, email: email.toLowerCase(), role_id, department, branch,
    phone, whatsapp_number, reporting_manager_id, password_hash: hash, status: 'active',
  });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'user.created', entityType: 'User', entityId: user.id, after: { name, email, role_id }, ip: req.ip });

  const loginUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/login` : 'https://procureai-frontend-two.vercel.app/login';
  const emailResult = await notificationService.sendUserInviteEmail({ user, tempPassword, loginUrl });

  okResponse(res, {
    ...user.toJSON(),
    // Only surfaced to the admin creating the account, and only when email
    // didn't actually go out, so the credential isn't lost.
    temp_password: emailResult.sent ? undefined : tempPassword,
    invite_email_sent: emailResult.sent,
  }, 201);
});

exports.getOne = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [{ model: Role, include: [Permission] }] });
  if (!user) return errorResponse(res, 'NOT_FOUND', 'User not found', 404);
  okResponse(res, user);
});

exports.update = asyncHandler(async (req, res) => {
  const user = await User.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!user) return errorResponse(res, 'NOT_FOUND', 'User not found', 404);
  const before = user.toJSON();
  const allowed = ['name', 'role_id', 'department', 'branch', 'phone', 'whatsapp_number', 'reporting_manager_id', 'status'];
  allowed.forEach((f) => { if (req.body[f] !== undefined) user[f] = req.body[f]; });
  await user.save();
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'user.updated', entityType: 'User', entityId: user.id, before, after: user.toJSON(), ip: req.ip });
  okResponse(res, user);
});

exports.remove = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id)
    return errorResponse(res, 'FORBIDDEN', 'Cannot delete your own account', 403);
  const user = await User.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!user) return errorResponse(res, 'NOT_FOUND', 'User not found', 404);
  await user.update({ deleted_at: new Date(), status: 'disabled' });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'user.deleted', entityType: 'User', entityId: user.id, ip: req.ip });
  okResponse(res, { message: 'User archived' });
});

exports.listRoles = asyncHandler(async (req, res) => {
  const roles = await Role.findAll({ where: { company_id: req.companyId }, include: [Permission], order: [['created_at', 'ASC']] });
  okResponse(res, roles);
});

// GET /permissions — the full permission catalog, used by the role editor
// UI to render one checkbox per permission code. Not company-scoped:
// permissions are global definitions (code + description), same set every
// company draws from — only the Role <-> Permission mapping is per-company.
exports.listPermissions = asyncHandler(async (req, res) => {
  const permissions = await Permission.findAll({ order: [['code', 'ASC']] });
  okResponse(res, permissions);
});

// POST /roles — previously did not exist at all. A company could list its
// roles and edit an existing role's permissions, but had no way to create a
// new one, so real (non-seeded) companies were permanently stuck with
// whatever roles signup happened to create. Lets an admin build custom
// roles beyond the starter set, or recreate one they deleted.
exports.createRole = asyncHandler(async (req, res) => {
  const { name, permission_ids } = req.body;
  if (!name || !name.trim()) return errorResponse(res, 'VALIDATION_ERROR', 'Role name required');

  const existing = await Role.findOne({ where: { company_id: req.companyId, name: name.trim() } });
  if (existing) return errorResponse(res, 'DUPLICATE', 'A role with this name already exists', 409);

  const role = await Role.create({ company_id: req.companyId, name: name.trim(), is_system: false });

  if (Array.isArray(permission_ids) && permission_ids.length) {
    const { RolePermission } = require('../models');
    // Only permission ids that actually exist are attached — silently
    // ignoring unknown ids rather than 500ing keeps this robust against a
    // stale/edited client payload.
    const validPerms = await Permission.findAll({ where: { id: permission_ids } });
    await RolePermission.bulkCreate(validPerms.map((p) => ({ role_id: role.id, permission_id: p.id })));
  }

  await audit({ companyId: req.companyId, userId: req.user.id, action: 'role.created', entityType: 'Role', entityId: role.id, after: { name: role.name }, ip: req.ip });
  const full = await Role.findOne({ where: { id: role.id }, include: [Permission] });
  okResponse(res, full, 201);
});

// DELETE /roles/:id — blocked for system (starter) roles and for any role
// still assigned to a user, so deleting a role can never silently strand
// users with a dangling role_id or collapse the built-in segregation set.
exports.removeRole = asyncHandler(async (req, res) => {
  const role = await Role.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!role) return errorResponse(res, 'NOT_FOUND', 'Role not found', 404);
  if (role.is_system) return errorResponse(res, 'FORBIDDEN', 'Built-in system roles cannot be deleted', 403);
  const inUse = await User.count({ where: { role_id: role.id, deleted_at: null } });
  if (inUse > 0) return errorResponse(res, 'INVALID_STATE', `${inUse} user(s) still have this role — reassign them first`, 409);
  const { RolePermission } = require('../models');
  await RolePermission.destroy({ where: { role_id: role.id } });
  await role.destroy();
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'role.deleted', entityType: 'Role', entityId: role.id, ip: req.ip });
  okResponse(res, { message: 'Role deleted' });
});

exports.updateRolePermissions = asyncHandler(async (req, res) => {
  const { permission_ids } = req.body;
  const { RolePermission } = require('../models');
  const role = await Role.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!role) return errorResponse(res, 'NOT_FOUND', 'Role not found', 404);
  await RolePermission.destroy({ where: { role_id: role.id } });
  if (Array.isArray(permission_ids) && permission_ids.length) {
    await RolePermission.bulkCreate(permission_ids.map((pid) => ({ role_id: role.id, permission_id: pid })));
  }
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'role.permissions_updated', entityType: 'Role', entityId: role.id, after: { permission_ids }, ip: req.ip });
  okResponse(res, { message: 'Permissions updated' });
});
