const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = '/tmp/procureai-uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`),
});

const allowedMimes = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel', 'text/csv', 'text/plain',
];

const fileFilter = (req, file, cb) => {
  if (allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

const csvUpload = multer({ storage: multer.memoryStorage(), fileFilter: (req, file, cb) => ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(file.mimetype) ? cb(null, true) : cb(new Error('CSV/Excel only')), limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = { upload, csvUpload };
