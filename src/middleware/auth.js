const jwt = require('jsonwebtoken');
const { User, Role, Permission, RolePermission } = require('../models');

const verifyToken = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Authorization required' } });
  }
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findOne({
      where: { id: payload.userId, status: 'active' },
      include: [{ model: Role, include: [{ model: Permission, through: { attributes: [] } }] }],
    });
    if (!user) return res.status(401).json({ error: { code: 'USER_NOT_FOUND', message: 'Invalid token' } });
    req.user = user;
    req.companyId = user.company_id;
    next();
  } catch (err) {
    return res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Token expired or invalid' } });
  }
};

const requirePermission = (...codes) => (req, res, next) => {
  const userPerms = req.user?.Role?.Permissions?.map((p) => p.code) || [];
  const hasAll = codes.every((c) => userPerms.includes(c));
  if (!hasAll) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Missing permission: ${codes.join(', ')}` } });
  }
  next();
};

const requireAnyPermission = (...codes) => (req, res, next) => {
  const userPerms = req.user?.Role?.Permissions?.map((p) => p.code) || [];
  const hasAny = codes.some((c) => userPerms.includes(c));
  if (!hasAny) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Missing permission: one of ${codes.join(', ')}` } });
  }
  next();
};

// Not a company permission — every Role/Permission in this app is scoped to
// a single company_id, so there's no clean way to express "sees every
// company" through that system without breaking tenant isolation. This is a
// flag directly on the user row instead (see models/index.js User.is_platform_admin),
// checked fresh from the DB on every request (verifyToken re-fetches the
// user each time), so revoking it takes effect immediately without a
// re-login. The user still belongs to their normal company and keeps their
// normal role/permissions — this only additionally unlocks /platform/*.
const requirePlatformAdmin = (req, res, next) => {
  if (!req.user?.is_platform_admin) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Platform-admin access required' } });
  }
  next();
};

module.exports = { verifyToken, requirePermission, requireAnyPermission, requirePlatformAdmin };
