const { AuditLog } = require('../models');

const audit = async ({ companyId, userId, action, entityType, entityId, before, after, ip }) => {
  try {
    await AuditLog.create({
      company_id: companyId,
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      before_value: before || null,
      after_value: after || null,
      ip_address: ip,
    });
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
};

module.exports = { audit };
