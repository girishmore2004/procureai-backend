const { Approval, PurchaseRequest, PurchaseOrder, User } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse, errorResponse } = require('../utils/helpers');
const { audit } = require('../middleware/audit');
const { processApprovalAction } = require('../services/approvalService');

exports.getPending = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const result = await Approval.findAndCountAll({ where: { approver_id: req.user.id, status: 'pending', company_id: req.companyId }, limit, offset, order: [['created_at', 'ASC']] });
  paginatedResponse(res, result, { page, perPage });
});

exports.act = asyncHandler(async (req, res) => {
  const { decision, comments } = req.body;
  if (!['approved', 'rejected', 'request_changes'].includes(decision))
    return errorResponse(res, 'VALIDATION_ERROR', 'decision must be approved/rejected/request_changes');
  if (decision === 'rejected' && !comments)
    return errorResponse(res, 'VALIDATION_ERROR', 'comments required when rejecting');
  await processApprovalAction(req.params.id, decision, comments, req.user.id, req.companyId);
  await audit({ companyId: req.companyId, userId: req.user.id, action: `approval.${decision}`, entityType: 'Approval', entityId: req.params.id, after: { decision, comments }, ip: req.ip });
  okResponse(res, { message: `Approval ${decision}` });
});

exports.getHistory = asyncHandler(async (req, res) => {
  const approvals = await Approval.findAll({
    where: { approvable_type: req.params.type, approvable_id: req.params.entityId, company_id: req.companyId },
    include: [{ model: User, as: 'Approver', foreignKey: 'approver_id', attributes: ['id', 'name', 'email'] }],
    order: [['level', 'ASC']],
  });
  okResponse(res, approvals);
});
