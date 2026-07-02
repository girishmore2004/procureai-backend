const { Notification, AuditLog, User } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { paginate, paginatedResponse, okResponse } = require('../utils/helpers');

// NOTIFICATIONS
exports.listNotifications = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const result = await Notification.findAndCountAll({
    where: { company_id: req.companyId, user_id: req.user.id },
    limit, offset, order: [['created_at', 'DESC']],
  });
  paginatedResponse(res, result, { page, perPage });
});

exports.markRead = asyncHandler(async (req, res) => {
  await Notification.update({ status: 'read' }, { where: { id: req.params.id, user_id: req.user.id } });
  okResponse(res, { message: 'Marked as read' });
});

// AUDIT LOGS
exports.listAuditLogs = asyncHandler(async (req, res) => {
  const { page, perPage, limit, offset } = paginate(req.query);
  const where = { company_id: req.companyId };
  if (req.query.entity_type) where.entity_type = req.query.entity_type;
  if (req.query.entity_id) where.entity_id = req.query.entity_id;
  if (req.query.user_id) where.user_id = req.query.user_id;
  if (req.query.action) where.action = req.query.action;
  const result = await AuditLog.findAndCountAll({
    where, limit, offset,
    include: [{ model: User, attributes: ['id', 'name', 'email'] }],
    order: [['created_at', 'DESC']],
  });
  paginatedResponse(res, result, { page, perPage });
});
