// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const helmet = require('helmet');
// const morgan = require('morgan');
// const rateLimit = require('express-rate-limit');
// const path = require('path');

// const { sequelize } = require('./models');
// const routes = require('./routes');
// const { errorHandler, notFound } = require('./middleware/errorHandler');

// const app = express();
// const PORT = process.env.PORT || 4000;

// // ── Trust proxy ──────────────────────────────────────────────────────
// // Render (and any other reverse-proxy host) sits in front of this app and sets
// // X-Forwarded-For/X-Forwarded-Proto. Without `trust proxy` set, Express ignores
// // those headers, so:
// //   1. express-rate-limit throws "ValidationError: The 'X-Forwarded-For' header
// //      is set but the Express 'trust proxy' setting is false" on every request,
// //      and (worse) falls back to keying rate limits off the proxy's own IP —
// //      meaning every user behind Render shares one rate-limit bucket.
// //   2. req.ip / req.secure are wrong, which breaks IP-based audit logging and
// //      any secure-cookie/HTTPS checks.
// // Render's docs recommend trusting exactly 1 hop (their load balancer). We only
// // enable this in production so local dev (no proxy in front of it) doesn't
// // silently start trusting a spoofable X-Forwarded-For header.
// if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY) {
//   const configured = process.env.TRUST_PROXY;
//   app.set('trust proxy', configured ? (Number.isNaN(Number(configured)) ? configured : Number(configured)) : 1);
// }

// // ── Security middleware ─────────────────────────────────────────────
// app.use(helmet());
// app.use(cors({
//   origin: process.env.APP_URL || 'http://localhost:5173',
//   credentials: true,
// }));

// // ── Rate limiting ───────────────────────────────────────────────────
// app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } } }));
// app.use('/api/v1/public', rateLimit({ windowMs: 60 * 60 * 1000, max: 100 }));
// app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 300 }));

// // ── Body parsing ────────────────────────────────────────────────────
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// app.use(morgan('dev'));

// // ── Static file serving (temp PDFs for MVP) ─────────────────────────
// app.use('/files', express.static('/tmp'));

// // ── API routes ──────────────────────────────────────────────────────
// app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));
// app.use('/api/v1', routes);

// // ── 404 + error handler ─────────────────────────────────────────────
// app.use(notFound);
// app.use(errorHandler);

// // ── DB connect + start ──────────────────────────────────────────────
// const start = async () => {
//   try {
//     await sequelize.authenticate();
//     console.log('✅ Database connected');

//     // Render's free tier has no Shell access to run `npm run migrate` manually,
//     // so schema changes must apply themselves on every boot. alter:true only
//     // adds/modifies columns to match the models — it does not drop data.
//     await sequelize.sync({ alter: true });
//     console.log('✅ Models synced');

//     // NOTE: src/jobs/queues.js (BullMQ extraction queue/worker) is intentionally
//     // NOT started here. Nothing in the codebase calls extractionQueue.add() —
//     // invoice and quote extraction both run synchronously from their controllers
//     // (see invoiceController.upload, rfqController.publicSubmitQuote,
//     // quoteController.reprocess). Starting the worker was dead weight: an idle
//     // Redis connection for a queue that never receives jobs. The file is left in
//     // place in case background processing is wired up for real in the future.

//     // Start scheduled cron jobs (reorder alerts, vendor scoring, RFQ reminders)
//     const { startCronJobs } = require('./jobs/cron');
//     startCronJobs();

//     app.listen(PORT, () => console.log(`🚀 ProcureAI API running on port ${PORT}`));
//   } catch (err) {
//     console.error('❌ Startup failed:', err);
//     process.exit(1);
//   }
// };

// start();

// module.exports = app;





require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { sequelize } = require('./models');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Trust proxy ──────────────────────────────────────────────────────
// Render (and any other reverse-proxy host) sits in front of this app and sets
// X-Forwarded-For/X-Forwarded-Proto. Without `trust proxy` set, Express ignores
// those headers, so:
//   1. express-rate-limit throws "ValidationError: The 'X-Forwarded-For' header
//      is set but the Express 'trust proxy' setting is false" on every request,
//      and (worse) falls back to keying rate limits off the proxy's own IP —
//      meaning every user behind Render shares one rate-limit bucket.
//   2. req.ip / req.secure are wrong, which breaks IP-based audit logging and
//      any secure-cookie/HTTPS checks.
// Render's docs recommend trusting exactly 1 hop (their load balancer). We only
// enable this in production so local dev (no proxy in front of it) doesn't
// silently start trusting a spoofable X-Forwarded-For header.
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY) {
  const configured = process.env.TRUST_PROXY;
  app.set('trust proxy', configured ? (Number.isNaN(Number(configured)) ? configured : Number(configured)) : 1);
}

// ── Security middleware ─────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:5173',
  credentials: true,
}));

// ── Rate limiting ───────────────────────────────────────────────────
app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } } }));
app.use('/api/v1/public', rateLimit({ windowMs: 60 * 60 * 1000, max: 100 }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 300 }));

// ── Body parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// ── Static file serving (temp PDFs for MVP) ─────────────────────────
app.use('/files', express.static('/tmp'));

// ── API routes ──────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));
app.use('/api/v1', routes);

// ── 404 + error handler ─────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── DB connect + start ──────────────────────────────────────────────
const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Render's free tier has no Shell access to run `npm run migrate` manually,
    // so schema changes must apply themselves on every boot. alter:true only
    // adds/modifies columns to match the models — it does not drop data.
    await sequelize.sync({ alter: true });
    console.log('✅ Models synced');

    // ── Backfill new permission codes for EXISTING companies ────────────
    // seed.js only ever touches the one demo company — real companies are
    // created through companyController.signup, which grants brand-new
    // companies every permission that exists in the DB *at signup time*.
    // Companies created before payments.*/billing.* existed never got those
    // permission rows created, or granted to their roles, so every request
    // to /payments or /billing 403'd for them even as an admin. This runs on
    // every boot, is idempotent (findOrCreate + skip-if-already-granted), and
    // only adds permissions — it never removes one a role already has.
    try {
      const { Permission, Role, RolePermission } = require('./models');
      const NEW_PERMISSIONS = [
        { code: 'payments.view', description: 'View payment queue' },
        { code: 'payments.approve', description: 'Queue and execute payments (Finance)' },
        { code: 'billing.view', description: 'View bills' },
        { code: 'billing.create', description: 'Create bills (sell items, reduce inventory)' },
      ];
      const permMap = {};
      for (const p of NEW_PERMISSIONS) {
        const [perm] = await Permission.findOrCreate({ where: { code: p.code }, defaults: p });
        permMap[p.code] = perm;
      }
      // Role name -> which of the new codes it should have. Company Admin gets
      // everything (mirrors signup granting all permissions to that role).
      const ROLE_GRANTS = {
        'Company Admin': Object.keys(permMap),
        'Super Admin': Object.keys(permMap),
        'Finance': ['payments.view', 'payments.approve', 'billing.view'],
        'Procurement Manager': ['payments.view', 'billing.view', 'billing.create'],
        'Warehouse': ['billing.view', 'billing.create'],
      };
      const roles = await Role.findAll({ where: { name: Object.keys(ROLE_GRANTS) } });
      for (const role of roles) {
        for (const code of ROLE_GRANTS[role.name] || []) {
          await RolePermission.findOrCreate({ where: { role_id: role.id, permission_id: permMap[code].id } });
        }
      }
      console.log('✅ Payment/Billing permissions backfilled for existing companies');
    } catch (e) {
      console.error('⚠️  Permission backfill failed (non-fatal):', e.message);
    }

    // NOTE: src/jobs/queues.js (BullMQ extraction queue/worker) is intentionally
    // NOT started here. Nothing in the codebase calls extractionQueue.add() —
    // invoice and quote extraction both run synchronously from their controllers
    // (see invoiceController.upload, rfqController.publicSubmitQuote,
    // quoteController.reprocess). Starting the worker was dead weight: an idle
    // Redis connection for a queue that never receives jobs. The file is left in
    // place in case background processing is wired up for real in the future.

    // Start scheduled cron jobs (reorder alerts, vendor scoring, RFQ reminders)
    const { startCronJobs } = require('./jobs/cron');
    startCronJobs();

    app.listen(PORT, () => console.log(`🚀 ProcureAI API running on port ${PORT}`));
  } catch (err) {
    console.error('❌ Startup failed:', err);
    process.exit(1);
  }
};

start();

module.exports = app;
