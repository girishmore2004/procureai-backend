const { Queue, Worker } = require('bullmq');
const { extractQuoteFromFile, extractInvoice } = require('../services/aiService');

// const connection = { host: (process.env.REDIS_URL || 'redis://localhost:6379').replace('redis://', '').split(':')[0], port: parseInt((process.env.REDIS_URL || 'redis://localhost:6379').split(':')[2]) || 6379 };
const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
  tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
};
const extractionQueue = new Queue('extraction', { connection });

// Worker processes extraction jobs
const extractionWorker = new Worker('extraction', async (job) => {
  const { name, data } = job;
  console.log(`[Job] Processing ${name}`, data);
  if (name === 'extract-quote') {
    await extractQuoteFromFile(data.quoteId, data.filePath);
  } else if (name === 'extract-invoice') {
    await extractInvoice(data.invoiceId, data.filePath);
  }
}, { connection, concurrency: 3 });

extractionWorker.on('completed', (job) => console.log(`[Job] ${job.name} completed`));
extractionWorker.on('failed', (job, err) => console.error(`[Job] ${job?.name} failed:`, err.message));

module.exports = { extractionQueue };
