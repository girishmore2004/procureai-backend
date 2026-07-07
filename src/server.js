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
