require('dotenv').config();
const { sequelize } = require('../models');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('DB connected');
    await sequelize.sync({ alter: true });
    console.log('All tables synced');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
