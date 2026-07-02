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
    // In dev, sync gently. In prod, use explicit migrations.
    if (process.env.NODE_ENV !== 'production') {
      await sequelize.sync({ alter: true });
      console.log('✅ Models synced');
    }
    // Start background job workers (BullMQ)
    require('./jobs/queues');
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
