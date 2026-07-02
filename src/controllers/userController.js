const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Role, Permission } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse } = require('../utils/helpers');
const { audit } = require('../middleware/audit');

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

  const hash = await bcrypt.hash(password || 'Temp@1234', 10);
  const user = await User.create({
    company_id: req.companyId, name, email: email.toLowerCase(), role_id, department, branch,
    phone, whatsapp_number, reporting_manager_id, password_hash: hash, status: 'active',
  });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'user.created', entityType: 'User', entityId: user.id, after: { name, email, role_id }, ip: req.ip });
  // TODO: send invite email with temp password
  okResponse(res, user, 201);
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
  const roles = await Role.findAll({ where: { company_id: req.companyId }, include: [Permission] });
  okResponse(res, roles);
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
