const { v4: uuidv4 } = require('uuid');

// Generate sequential human-readable codes per company
// Simple approach: count existing rows + prefix
const generateCode = async (Model, prefix, field, companyId) => {
  const count = await Model.count({ where: { company_id: companyId } });
  return `${prefix}-${String(count + 1).padStart(5, '0')}`;
};

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

module.exports = { generateCode, paginate, paginatedResponse, okResponse, errorResponse };
