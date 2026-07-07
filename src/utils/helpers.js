const { v4: uuidv4 } = require('uuid');

// Generate sequential human-readable codes per company
// Simple approach: count existing rows + prefix
const generateCode = async (Model, prefix, field, companyId) => {
  const count = await Model.count({ where: { company_id: companyId } });
  return `${prefix}-${String(count + 1).padStart(5, '0')}`;
};
const generateTempPassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const symbols = '!@#$%';
  let pwd = '';
  for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  pwd += symbols[Math.floor(Math.random() * symbols.length)];
  return pwd;
};
// Maps common spreadsheet header variants to our internal field names, so CSV/Excel
// imports work with whatever headers a buyer's existing sheet happens to use
// (e.g. "Vendor Name", "GST No", "Mobile", "Item Name", "HSN Code", "Reorder Point").
// Returns a plain object with normalized keys; unrecognized columns are dropped.
const IMPORT_FIELD_ALIASES = {
  name: ['name', 'vendor name', 'vendor_name', 'item name', 'item_name', 'company name', 'title'],
  email: ['email', 'email address', 'email_address', 'e-mail'],
  phone: ['phone', 'mobile', 'phone number', 'phone_number', 'contact number', 'contact_number'],
  whatsapp_number: ['whatsapp', 'whatsapp number', 'whatsapp_number'],
  contact_person: ['contact person', 'contact_person', 'contact name', 'poc', 'point of contact'],
  gstin: ['gstin', 'gst no', 'gst_no', 'gst number', 'gst'],
  pan: ['pan', 'pan no', 'pan_no', 'pan number'],
  payment_terms: ['payment terms', 'payment_terms', 'terms'],
  lead_time_days: ['lead time', 'lead_time', 'lead time days', 'lead_time_days', 'lead time (days)'],
  category: ['category', 'item category'],
  unit: ['unit', 'uom', 'unit of measure'],
  hsn_sac: ['hsn', 'hsn code', 'hsn_code', 'hsn/sac', 'hsn_sac'],
  tax_rate: ['tax rate', 'tax_rate', 'gst rate', 'tax %', 'tax'],
  reorder_level: ['reorder point', 'reorder_point', 'reorder level', 'reorder_level'],
  opening_stock: ['opening stock', 'opening_stock', 'current stock', 'stock'],
};

const normalizeImportRow = (rawRow) => {
  const row = {};
  const rawKeysLower = Object.keys(rawRow).reduce((acc, k) => {
    acc[k.trim().toLowerCase()] = rawRow[k];
    return acc;
  }, {});
  for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (rawKeysLower[alias] !== undefined && rawKeysLower[alias] !== '') {
        row[field] = typeof rawKeysLower[alias] === 'string' ? rawKeysLower[alias].trim() : rawKeysLower[alias];
        break;
      }
    }
  }
  return row;
};

// ...added to module.exports
const paginate = (query = {}) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(query.per_page) || 20));
  return { limit: perPage, offset: (page - 1) * perPage, page, perPage };
};

const paginatedResponse = (res, { rows, count }, { page, perPage }) => {
  res.json({ data: rows, meta: { page, per_page: perPage, total: count } });
};

const okResponse = (res, data, status = 200) => res.status(status).json({ data });

const errorResponse = (res, code, message, status = 400) =>
  res.status(status).json({ error: { code, message } });

module.exports = {
  generateCode, paginate, paginatedResponse, okResponse, errorResponse,
  generateTempPassword, normalizeImportRow,
};
