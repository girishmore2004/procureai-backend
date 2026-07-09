// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const { User, Role, Permission } = require('../models');
// const { asyncHandler } = require('../middleware/errorHandler');
// const { okResponse, errorResponse } = require('../utils/helpers');
// const notificationService = require('../services/notificationService');

// const signAccess = (userId) =>
//   jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' });

// const signRefresh = (userId) =>
//   jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });

// exports.login = asyncHandler(async (req, res) => {
//   const { email, password } = req.body;
//   if (!email || !password)
//     return errorResponse(res, 'VALIDATION_ERROR', 'Email and password required');

//   const user = await User.findOne({
//     where: { email: email.toLowerCase().trim() },
//     include: [{ model: Role, include: [{ model: Permission, through: { attributes: [] } }] }],
//   });

//   if (!user || !(await bcrypt.compare(password, user.password_hash)))
//     return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });

//   if (user.status !== 'active')
//     return res.status(423).json({ error: { code: 'ACCOUNT_DISABLED', message: 'Account disabled — contact admin' } });

//   await user.update({ last_login_at: new Date() });

//   const access_token = signAccess(user.id);
//   const refresh_token = signRefresh(user.id);

//   const userData = {
//     id: user.id,
//     name: user.name,
//     email: user.email,
//     company_id: user.company_id,
//     role: user.Role?.name,
//     permissions: user.Role?.Permissions?.map((p) => p.code) || [],
//     department: user.department,
//     is_platform_admin: !!user.is_platform_admin,
//   };

//   okResponse(res, { access_token, refresh_token, user: userData });
// });

// exports.refresh = asyncHandler(async (req, res) => {
//   const { refresh_token } = req.body;
//   if (!refresh_token)
//     return errorResponse(res, 'VALIDATION_ERROR', 'Refresh token required');
//   try {
//     const payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
//     const user = await User.findByPk(payload.userId);
//     if (!user || user.status !== 'active')
//       return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } });
//     okResponse(res, { access_token: signAccess(user.id) });
//   } catch {
//     return res.status(401).json({ error: { code: 'TOKEN_EXPIRED', message: 'Refresh token expired' } });
//   }
// });

// exports.forgotPassword = asyncHandler(async (req, res) => {
//   const { email } = req.body;
//   const user = await User.findOne({ where: { email: email?.toLowerCase() } });
//   // Always return OK to prevent email enumeration
//   if (user) {
//     const token = jwt.sign({ userId: user.id }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
//     const frontendUrl = process.env.FRONTEND_URL || 'https://procureai-frontend-two.vercel.app';
//     const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
//     const result = await notificationService.sendPasswordResetEmail({ user, resetUrl });
//     if (!result.sent) console.warn(`Password reset email not sent for ${email} (${result.reason}). Reset URL: ${resetUrl}`);
//   }
//   okResponse(res, { message: 'If that email exists, a reset link has been sent' });
// });

// exports.resetPassword = asyncHandler(async (req, res) => {
//   const { token, new_password } = req.body;
//   if (!token || !new_password)
//     return errorResponse(res, 'VALIDATION_ERROR', 'Token and new password required');
//   try {
//     const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
//     const hash = await bcrypt.hash(new_password, 10);
//     await User.update({ password_hash: hash }, { where: { id: payload.userId } });
//     okResponse(res, { message: 'Password updated' });
//   } catch {
//     return res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Invalid or expired token' } });
//   }
// });

// exports.logout = asyncHandler(async (req, res) => {
//   // Stateless JWT — client discards token. For refresh token blacklisting, use Redis in prod.
//   okResponse(res, { message: 'Logged out' });
// });





const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Role, Permission } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { okResponse, errorResponse } = require('../utils/helpers');
const notificationService = require('../services/notificationService');

const signAccess = (userId) =>
  jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' });

const signRefresh = (userId) =>
  jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return errorResponse(res, 'VALIDATION_ERROR', 'Email and password required');

  const user = await User.findOne({
    where: { email: email.toLowerCase().trim() },
    include: [{ model: Role, include: [{ model: Permission, through: { attributes: [] } }] }],
  });

  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });

  if (user.status !== 'active')
    return res.status(423).json({ error: { code: 'ACCOUNT_DISABLED', message: 'Account disabled — contact admin' } });

  // Computed BEFORE the update below overwrites it — used by the frontend to
  // route a brand-new admin to Settings (company profile + permissions)
  // instead of straight to the dashboard on their very first login.
  const first_login = !user.last_login_at;

  await user.update({ last_login_at: new Date() });

  const access_token = signAccess(user.id);
  const refresh_token = signRefresh(user.id);

  const userData = {
    id: user.id,
    name: user.name,
    email: user.email,
    company_id: user.company_id,
    role: user.Role?.name,
    permissions: user.Role?.Permissions?.map((p) => p.code) || [],
    department: user.department,
    is_platform_admin: !!user.is_platform_admin,
  };

  okResponse(res, { access_token, refresh_token, user: userData, first_login });
});

exports.refresh = asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token)
    return errorResponse(res, 'VALIDATION_ERROR', 'Refresh token required');
  try {
    const payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findByPk(payload.userId);
    if (!user || user.status !== 'active')
      return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' } });
    okResponse(res, { access_token: signAccess(user.id) });
  } catch {
    return res.status(401).json({ error: { code: 'TOKEN_EXPIRED', message: 'Refresh token expired' } });
  }
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ where: { email: email?.toLowerCase() } });
  // Always return OK to prevent email enumeration
  if (user) {
    const token = jwt.sign({ userId: user.id }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
    const frontendUrl = process.env.FRONTEND_URL || 'https://procureai-frontend-two.vercel.app';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const result = await notificationService.sendPasswordResetEmail({ user, resetUrl });
    if (!result.sent) console.warn(`Password reset email not sent for ${email} (${result.reason}). Reset URL: ${resetUrl}`);
  }
  okResponse(res, { message: 'If that email exists, a reset link has been sent' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password)
    return errorResponse(res, 'VALIDATION_ERROR', 'Token and new password required');
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const hash = await bcrypt.hash(new_password, 10);
    await User.update({ password_hash: hash }, { where: { id: payload.userId } });
    okResponse(res, { message: 'Password updated' });
  } catch {
    return res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Invalid or expired token' } });
  }
});

exports.logout = asyncHandler(async (req, res) => {
  // Stateless JWT — client discards token. For refresh token blacklisting, use Redis in prod.
  okResponse(res, { message: 'Logged out' });
});
