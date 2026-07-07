// src/controllers/vendorDiscoveryController.js
const { Op } = require('sequelize');
const { Vendor, VendorCatalogItem, VendorScore, Item } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { okResponse, errorResponse } = require('../utils/helpers');

// Safe fields exposed to buyers — NO password_hash, NO internal notes
const SAFE_VENDOR_ATTRS = [
  'id', 'name', 'contact_person', 'phone', 'whatsapp_number',
  'email', 'categories', 'payment_terms', 'lead_time_days',
  'moq', 'rating', 'preferred', 'status',
];

// GET /vendor-discovery/search
// Query params: category, q (material name), min_price, max_price, location
// Matches catalog items from self-registered (public, company_id: null) vendors
// — visible to every buyer — plus this buyer's own private/invited vendors.
exports.search = asyncHandler(async (req, res) => {
  const { category, q, min_price, max_price } = req.query;

  const catalogWhere = {
    [Op.or]: [{ company_id: null }, { company_id: req.companyId }],
    is_active: true,
  };
  if (category) catalogWhere.category = { [Op.iLike]: `%${category}%` };
  if (q) catalogWhere.name = { [Op.iLike]: `%${q}%` };
  if (min_price) catalogWhere.price = { ...(catalogWhere.price || {}), [Op.gte]: parseFloat(min_price) };
  if (max_price) catalogWhere.price = { ...(catalogWhere.price || {}), [Op.lte]: parseFloat(max_price) };

  const catalogItems = await VendorCatalogItem.findAll({
    where: catalogWhere,
    include: [{
      model: Vendor,
      as: 'Vendor',
      attributes: SAFE_VENDOR_ATTRS,
      where: { deleted_at: null, status: 'active' },
    }],
    order: [['price', 'ASC']],
    limit: 100,
  });

  // Group by vendor, attach their catalog items
  const vendorMap = {};
  for (const ci of catalogItems) {
    const vid = ci.vendor_id;
    if (!vendorMap[vid]) {
      vendorMap[vid] = {
        vendor: ci.Vendor.toJSON(),
        catalog_items: [],
      };
    }
    vendorMap[vid].catalog_items.push({
      id: ci.id,
      name: ci.name,
      category: ci.category,
      unit: ci.unit,
      price: ci.price,
      min_order_qty: ci.min_order_qty,
      lead_time_days: ci.lead_time_days,
      description: ci.description,
    });
  }

  okResponse(res, Object.values(vendorMap));
});

// GET /vendor-discovery/categories
// Returns all unique material categories available across the public
// self-registered vendor pool plus this buyer's own private/invited vendors.
exports.getCategories = asyncHandler(async (req, res) => {
  const rows = await VendorCatalogItem.findAll({
    where: { [Op.or]: [{ company_id: null }, { company_id: req.companyId }], is_active: true },
    attributes: ['category'],
    group: ['category'],
    order: [['category', 'ASC']],
  });
  okResponse(res, rows.map((r) => r.category));
});

// GET /vendor-discovery/match-item/:itemId
// Suggests vendors that supply materials similar to a given Item Master item,
// drawn from the public self-registered vendor pool plus this buyer's own
// private/invited vendors.
exports.matchItem = asyncHandler(async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.itemId, company_id: req.companyId } });
  if (!item) return errorResponse(res, 'NOT_FOUND', 'Item not found', 404);

  // Search catalog by item name or category
  const matches = await VendorCatalogItem.findAll({
    where: {
      [Op.and]: [
        { [Op.or]: [{ company_id: null }, { company_id: req.companyId }] },
        { is_active: true },
        { [Op.or]: [
          { name: { [Op.iLike]: `%${item.name}%` } },
          { category: { [Op.iLike]: `%${item.category || ''}%` } },
        ] },
      ],
    },
    include: [{
      model: Vendor,
      as: 'Vendor',
      attributes: SAFE_VENDOR_ATTRS,
      where: { deleted_at: null, status: 'active' },
    }],
    order: [['price', 'ASC']],
    limit: 20,
  });

  const vendorMap = {};
  for (const ci of matches) {
    const vid = ci.vendor_id;
    if (!vendorMap[vid]) {
      vendorMap[vid] = { vendor: ci.Vendor.toJSON(), matched_items: [] };
    }
    vendorMap[vid].matched_items.push({
      id: ci.id, name: ci.name, category: ci.category,
      unit: ci.unit, price: ci.price,
      min_order_qty: ci.min_order_qty, lead_time_days: ci.lead_time_days,
    });
  }

  okResponse(res, {
    item: { id: item.id, name: item.name, category: item.category, unit: item.unit },
    vendor_matches: Object.values(vendorMap),
  });
});
