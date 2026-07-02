const { Op } = require('sequelize');
const { PurchaseRequest, PurchaseRequestItem, Item, User, Approval, Company } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse, generateCode } = require('../utils/helpers');
const { audit } = require('../middleware/audit');
const { triggerApprovalFlow } = require('../services/approvalService');

exports.list = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId };
  // Requesters see only their own PRs unless they have broader view permission
  const perms = req.user.Role?.Permissions?.map((p) => p.code) || [];
  if (!perms.includes('pr.approve') && !perms.includes('rfq.create')) {
    where.requested_by = req.user.id;
  }
  if (req.query.status) where.status = req.query.status;
  if (req.query.department) where.department = req.query.department;
  if (req.query.priority) where.priority = req.query.priority;
  const result = await PurchaseRequest.findAndCountAll({
    where, limit, offset,
    include: [{ model: User, as: 'Requester', foreignKey: 'requested_by', attributes: ['id', 'name', 'email'] }, { model: PurchaseRequestItem, as: 'items' }],
    order: [['created_at', 'DESC']],
  });
  paginatedResponse(res, result, { page, perPage });
});

exports.create = asyncHandler(async (req, res) => {
  const { department, branch, required_date, priority, notes, items } = req.body;
  if (!items || !items.length) return errorResponse(res, 'VALIDATION_ERROR', 'At least one item required');
  const pr_number = await generateCode(PurchaseRequest, 'PR', 'pr_number', req.companyId);
  const total = items.reduce((s, i) => s + ((i.quantity || 0) * (i.estimated_unit_price || 0)), 0);
  const pr = await PurchaseRequest.create({ company_id: req.companyId, requested_by: req.user.id, department, branch, required_date, priority: priority || 'medium', notes, pr_number, total_estimated_amount: total, status: 'draft' });
  await PurchaseRequestItem.bulkCreate(items.map((i) => ({ purchase_request_id: pr.id, item_id: i.item_id || null, item_name_freetext: i.item_name_freetext, quantity: i.quantity, estimated_unit_price: i.estimated_unit_price, budget_amount: (i.quantity || 0) * (i.estimated_unit_price || 0), notes: i.notes })));
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'pr.created', entityType: 'PurchaseRequest', entityId: pr.id, after: { pr_number, total }, ip: req.ip });
  okResponse(res, pr, 201);
});

exports.getOne = asyncHandler(async (req, res) => {
  const pr = await PurchaseRequest.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [
      { model: PurchaseRequestItem, as: 'items', include: [Item] },
      { model: User, as: 'Requester', foreignKey: 'requested_by', attributes: ['id', 'name', 'email'] },
      { model: Approval, where: { approvable_type: 'purchase_request' }, required: false },
    ],
  });
  if (!pr) return errorResponse(res, 'NOT_FOUND', 'Purchase Request not found', 404);
  okResponse(res, pr);
});

exports.update = asyncHandler(async (req, res) => {
  const pr = await PurchaseRequest.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!pr) return errorResponse(res, 'NOT_FOUND', 'Purchase Request not found', 404);
  if (pr.status !== 'draft') return errorResponse(res, 'INVALID_STATE', 'Can only edit draft requests', 409);
  const before = pr.toJSON();
  const allowed = ['department', 'branch', 'required_date', 'priority', 'notes'];
  allowed.forEach((f) => { if (req.body[f] !== undefined) pr[f] = req.body[f]; });
  await pr.save();
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'pr.updated', entityType: 'PurchaseRequest', entityId: pr.id, before, after: pr.toJSON(), ip: req.ip });
  okResponse(res, pr);
});

exports.submit = asyncHandler(async (req, res) => {
  const pr = await PurchaseRequest.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [{ model: PurchaseRequestItem, as: 'items' }] });
  if (!pr) return errorResponse(res, 'NOT_FOUND', 'Purchase Request not found', 404);
  if (pr.status !== 'draft') return errorResponse(res, 'INVALID_STATE', 'Only draft PRs can be submitted', 409);
  await pr.update({ status: 'pending_approval' });
  await triggerApprovalFlow('purchase_request', pr, req.companyId, req.user);
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'pr.submitted', entityType: 'PurchaseRequest', entityId: pr.id, ip: req.ip });
  okResponse(res, { message: 'Purchase request submitted for approval' });
});

exports.cancel = asyncHandler(async (req, res) => {
  const pr = await PurchaseRequest.findOne({ where: { id: req.params.id, company_id: req.companyId, requested_by: req.user.id } });
  if (!pr) return errorResponse(res, 'NOT_FOUND', 'Purchase Request not found', 404);
  if (['approved', 'converted_to_rfq', 'closed'].includes(pr.status))
    return errorResponse(res, 'INVALID_STATE', 'Cannot cancel a PR in this state', 409);
  await pr.update({ status: 'closed' });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'pr.cancelled', entityType: 'PurchaseRequest', entityId: pr.id, ip: req.ip });
  okResponse(res, { message: 'Purchase request cancelled' });
});
