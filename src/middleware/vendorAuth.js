// src/middleware/vendorAuth.js
const jwt = require('jsonwebtoken');
const { Vendor } = require('../models');

/**
 * Verifies a vendor-portal JWT (signed with JWT_VENDOR_SECRET).
 * Populates req.vendor and req.vendorId.
 * Completely separate from company-user auth — vendors only touch their own records.
 */
const verifyVendorToken = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer '))
    return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Vendor authorization required' } });

  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_VENDOR_SECRET || process.env.JWT_ACCESS_SECRET + '_vendor');
    if (payload.type !== 'vendor')
      return res.status(401).json({ error: { code: 'WRONG_TOKEN_TYPE', message: 'Not a vendor token' } });

    const vendor = await Vendor.findOne({
      where: { id: payload.vendorId, portal_status: 'active' },
    });
    if (!vendor)
      return res.status(401).json({ error: { code: 'VENDOR_NOT_FOUND', message: 'Invalid token or account disabled' } });

    req.vendor = vendor;
    req.vendorId = vendor.id;
    req.companyId = vendor.company_id; // for queries that scope to company
    next();
  } catch {
    return res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Vendor token expired or invalid' } });
  }
};

module.exports = { verifyVendorToken };
