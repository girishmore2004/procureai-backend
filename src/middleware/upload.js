const multer = require('multer');
const path = require('path');
const fs = require('fs');

const allowedMimes = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel', 'text/csv', 'text/plain',
];

const fileFilter = (req, file, cb) => {
  if (allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
};

// S3 (or any S3-compatible provider — R2, MinIO, DigitalOcean Spaces, etc.) is used when
// configured, because local disk on most hosts (Render free tier included, per the note
// already in .env.example) is ephemeral: it can be wiped between the moment a vendor
// uploads a quote and the moment someone clicks "Re-extract" later, which is exactly what
// was producing "ENOENT: no such file or directory" on quotes that had extracted fine
// moments earlier. Falls back to local disk (previous behavior, unchanged) when no S3
// credentials are set, so local/dev setups keep working exactly as before.
const s3Configured = !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);

let storage;
if (s3Configured) {
  const { S3Client } = require('@aws-sdk/client-s3');
  const multerS3 = require('multer-s3');
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const isAwsEndpoint = !endpoint || /amazonaws\.com/i.test(endpoint);
  const s3 = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint,
    forcePathStyle: !isAwsEndpoint, // needed for most non-AWS S3-compatible endpoints
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
  });
  storage = multerS3({
    s3,
    bucket: process.env.S3_BUCKET,
    key: (req, file, cb) => cb(null, `uploads/${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`),
  });
} else {
  console.warn('[upload] S3 not configured — falling back to local /tmp disk storage. ' +
    'Uploaded files (and AI re-extraction of them) will not survive a server restart/redeploy. ' +
    'Set S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY (and S3_ENDPOINT/S3_REGION if needed) to fix this.');
  const uploadDir = '/tmp/procureai-uploads';
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`),
  });
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

const csvUpload = multer({ storage: multer.memoryStorage(), fileFilter: (req, file, cb) => ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(file.mimetype) ? cb(null, true) : cb(new Error('CSV/Excel only')), limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = { upload, csvUpload };
