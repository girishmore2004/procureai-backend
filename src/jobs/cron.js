/**
 * Scheduled jobs — run daily via setInterval (use node-cron in production for more control).
 * These run inside the backend process. For high-scale, move to a separate worker process.
 */

const { ReorderRule, Item, Inventory, User, Role, Permission, Company, Vendor } = require('../models');
const { notifyUser } = require('../services/notificationService');
const { whatsapp } = require('../services/whatsappService');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Reorder Alert Job ─────────────────────────────────────────────────────
async function runReorderAlerts() {
  console.log('[Cron] Running reorder alerts...');
  try {
    const rules = await ReorderRule.findAll({
      where: { auto_alert: true },
      include: [{ model: Item, where: { status: 'active', deleted_at: null }, include: [Inventory] }],
    });

    for (const rule of rules) {
      const item = rule.Item;
      if (!item) continue;
      const stock = parseFloat(item.Inventory?.current_stock || 0);
      const reorderPt = parseFloat(rule.reorder_point || 0);
      if (stock > reorderPt) continue;

      // Notify procurement managers in the company
      const managers = await User.findAll({
        where: { company_id: item.company_id, status: 'active', deleted_at: null },
        include: [{
          model: Role,
          required: true,
          include: [{ association: 'Permissions', where: { code: 'pr.create' }, required: true }],
        }],
      });

      for (const mgr of managers) {
        await notifyUser({
          companyId: item.company_id,
          userId: mgr.id,
          type: 'reorder_alert',
          channel: 'in_app',
          payload: {
            title: `Reorder Alert: ${item.name}`,
            message: `Stock is at ${stock} ${item.unit}, below reorder point of ${reorderPt}. Consider creating a purchase request.`,
            item_id: item.id,
            item_name: item.name,
            current_stock: stock,
            reorder_point: reorderPt,
          },
        });

        // WhatsApp if configured
        if (mgr.whatsapp_number) {
          await whatsapp.sendReorderAlert(mgr, item, stock).catch(console.error);
        }
      }
    }
    console.log('[Cron] Reorder alerts done');
  } catch (err) {
    console.error('[Cron] Reorder alert error:', err.message);
  }
}

// ── Vendor Score Computation (monthly) ──────────────────────────────────────
async function runVendorScoring() {
  console.log('[Cron] Running vendor score computation...');
  try {
    const { computeVendorScores } = require('../controllers/inventoryController');
    // Get all companies and run scoring
    const companies = await Company.findAll({ where: { status: 'active' } });
    for (const company of companies) {
      const fakeReq = { companyId: company.id };
      const fakeRes = { json: () => {}, status: () => ({ json: () => {} }) };
      await computeVendorScores(fakeReq, fakeRes, () => {});
    }
    console.log('[Cron] Vendor scoring done');
  } catch (err) {
    console.error('[Cron] Vendor scoring error:', err.message);
  }
}

// ── RFQ Deadline Reminder ─────────────────────────────────────────────────
async function runRfqReminders() {
  console.log('[Cron] Checking RFQ deadlines...');
  try {
    const { Rfq, RfqVendor, Vendor: VendorModel } = require('../models');
    const tomorrow = new Date(Date.now() + MS_PER_DAY);
    const rfqs = await Rfq.findAll({
      where: {
        status: 'sent',
        deadline: { [require('sequelize').Op.between]: [new Date(), tomorrow] },
      },
      include: [{
        model: RfqVendor,
        as: 'rfqVendors',
        where: { status: ['pending', 'sent', 'opened'] },
        include: [VendorModel],
      }],
    });

    for (const rfq of rfqs) {
      for (const rv of rfq.rfqVendors) {
        const uploadLink = `${process.env.APP_URL}/vendor/quote/${rv.access_token}`;
        if (rv.Vendor?.whatsapp_number) {
          await whatsapp.sendRfqReminder(rv.Vendor, rfq, uploadLink).catch(console.error);
        }
        // Also send email reminder
        const { sendRfqEmail } = require('../services/notificationService');
        await sendRfqEmail({ vendor: rv.Vendor, rfq, items: [], uploadLink, isReminder: true }).catch(console.error);
      }
    }
    console.log('[Cron] RFQ reminders done');
  } catch (err) {
    console.error('[Cron] RFQ reminder error:', err.message);
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────
function startCronJobs() {
  console.log('[Cron] Starting scheduled jobs...');

  // Reorder alerts: every 6 hours
  runReorderAlerts();
  setInterval(runReorderAlerts, 6 * 60 * 60 * 1000);

  // Vendor scoring: once daily at startup then every 24h
  runVendorScoring();
  setInterval(runVendorScoring, MS_PER_DAY);

  // RFQ deadline reminders: every 4 hours
  runRfqReminders();
  setInterval(runRfqReminders, 4 * 60 * 60 * 1000);
}

module.exports = { startCronJobs, runReorderAlerts, runVendorScoring, runRfqReminders };
