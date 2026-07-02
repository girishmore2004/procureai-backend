const { Approval, Company, User, Role, Notification } = require('../models');
const { notifyUser } = require('./notificationService');

/**
 * Reads company approval_thresholds config and creates Approval rows.
 * Threshold example: [{amount: 10000, levels: 1, approver_role: "Approver"}, {amount: 100000, levels: 2, approver_role: "Approver"}]
 */
async function triggerApprovalFlow(approvableType, entity, companyId, requester) {
  const company = await Company.findByPk(companyId);
  const thresholds = company?.approval_thresholds || [];
  const amount = parseFloat(entity.total_estimated_amount || entity.total_amount || 0);

  // Find applicable threshold
  let levels = 1;
  for (const t of thresholds) {
    if (amount >= parseFloat(t.amount)) levels = t.levels;
  }

  // Find approvers (users with pr.approve or po.approve permissions)
  const approvers = await User.findAll({
    where: { company_id: companyId, status: 'active', deleted_at: null },
    include: [{
      model: Role,
      required: true,
      include: [{
        association: 'Permissions',
        where: { code: approvableType === 'purchase_request' ? 'pr.approve' : 'po.approve' },
        required: true,
      }],
    }],
    limit: levels,
  });

  const approvalRows = approvers.map((approver, idx) => ({
    company_id: companyId,
    approvable_type: approvableType,
    approvable_id: entity.id,
    level: idx + 1,
    approver_id: approver.id,
    status: idx === 0 ? 'pending' : 'waiting', // Only level 1 is active initially
  }));

  if (approvalRows.length === 0) {
    // No approvers configured — auto-approve
    await entity.update({ status: 'approved' });
    return;
  }

  await Approval.bulkCreate(approvalRows);

  // Notify level-1 approver
  if (approvers[0]) {
    await notifyUser({
      companyId,
      userId: approvers[0].id,
      type: 'approval_pending',
      channel: 'in_app',
      payload: {
        title: 'Approval Required',
        message: `${approvableType === 'purchase_request' ? 'Purchase Request' : 'Purchase Order'} from ${requester.name} needs your approval`,
        entityType: approvableType,
        entityId: entity.id,
        amount,
      },
    });
  }
}

/**
 * Called when an approver acts on an approval
 */
async function processApprovalAction(approvalId, decision, comments, actorId, companyId) {
  const approval = await Approval.findOne({ where: { id: approvalId, company_id: companyId, approver_id: actorId } });
  if (!approval) throw Object.assign(new Error('Approval not found'), { status: 404 });
  if (approval.status !== 'pending') throw Object.assign(new Error('Approval already acted on'), { status: 409 });

  await approval.update({ status: decision, comments, acted_at: new Date() });

  // Find the parent entity
  const ModelMap = { purchase_request: require('../models').PurchaseRequest, purchase_order: require('../models').PurchaseOrder };
  const ParentModel = ModelMap[approval.approvable_type];
  if (!ParentModel) return;
  const entity = await ParentModel.findByPk(approval.approvable_id);
  if (!entity) return;

  if (decision === 'rejected') {
    await entity.update({ status: 'rejected' });
    return;
  }

  if (decision === 'approved') {
    // Check if there are more levels
    const nextLevel = await Approval.findOne({
      where: { approvable_type: approval.approvable_type, approvable_id: approval.approvable_id, level: approval.level + 1 },
    });
    if (nextLevel) {
      await nextLevel.update({ status: 'pending' });
      await notifyUser({ companyId, userId: nextLevel.approver_id, type: 'approval_pending', channel: 'in_app', payload: { title: 'Approval Required', entityType: approval.approvable_type, entityId: approval.approvable_id } });
    } else {
      // All levels approved
      const newStatus = approval.approvable_type === 'purchase_request' ? 'approved' : 'approved';
      await entity.update({ status: newStatus });
    }
  }
}

module.exports = { triggerApprovalFlow, processApprovalAction };
