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

const uploadDir = '/tmp/procureai-uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`),
});

// Internal uploads — disk
const upload = multer({ storage: diskStorage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

// Vendor quote uploads — ALWAYS memory buffer, never disk
// Fixes ENOENT on Render: file bytes in req.file.buffer, no /tmp path needed
const vendorUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// CSV import — memory
const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/plain',
    ].includes(file.mimetype);
    ok ? cb(null, true) : cb(new Error('CSV/Excel only'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = { upload, vendorUpload, csvUpload };
