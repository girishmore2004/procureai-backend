const { Company, Setting } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { okResponse, errorResponse } = require('../utils/helpers');
const { audit } = require('../middleware/audit');

exports.getSettings = asyncHandler(async (req, res) => {
  const company = await Company.findByPk(req.companyId);
  const rows = await Setting.findAll({ where: { company_id: req.companyId } });
  const settings = {};
  rows.forEach((r) => { settings[r.key] = r.value; });
  okResponse(res, {
    company: {
      name: company.name,
      legal_name: company.legal_name,
      gstin: company.gstin,
      pan: company.pan,
      currency: company.currency,
      timezone: company.timezone,
      industry: company.industry,
      logo_url: company.logo_url,
      approval_thresholds: company.approval_thresholds || [],
    },
    settings,
  });
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const { company: companyData, ...rest } = req.body;

  // Update company fields if provided
  if (companyData) {
    const company = await Company.findByPk(req.companyId);
    const before = company.toJSON();
    const allowed = ['name', 'legal_name', 'gstin', 'pan', 'currency', 'timezone', 'industry', 'logo_url', 'approval_thresholds'];
    allowed.forEach((f) => { if (companyData[f] !== undefined) company[f] = companyData[f]; });
    await company.save();
    await audit({ companyId: req.companyId, userId: req.user.id, action: 'settings.company_updated', entityType: 'Company', entityId: company.id, before, after: company.toJSON(), ip: req.ip });
  }

  // Update key-value settings
  for (const [key, value] of Object.entries(rest)) {
    await Setting.upsert({ company_id: req.companyId, key, value });
  }

  await audit({ companyId: req.companyId, userId: req.user.id, action: 'settings.updated', entityType: 'Setting', ip: req.ip });
  okResponse(res, { message: 'Settings saved' });
});

exports.updateApprovalThresholds = asyncHandler(async (req, res) => {
  const { thresholds } = req.body;
  if (!Array.isArray(thresholds)) return errorResponse(res, 'VALIDATION_ERROR', 'thresholds must be an array');
  const company = await Company.findByPk(req.companyId);
  await company.update({ approval_thresholds: thresholds });
  await audit({ companyId: req.companyId, userId: req.user.id, action: 'settings.thresholds_updated', entityType: 'Company', entityId: company.id, after: { thresholds }, ip: req.ip });
  okResponse(res, { message: 'Approval thresholds updated', thresholds });
});
