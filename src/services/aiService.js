const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const { AiExtraction, AiRecommendation, Quote, QuoteItem, VendorScore, Vendor } = require('../models');

const callLLM = async (prompt) => {
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  if (!apiKey) {
    console.warn('LLM_API_KEY not set — returning mock extraction');
    return JSON.stringify({ items: [], vendor_name: '', payment_terms: '', delivery_time_days: 7, confidence: 0.5 });
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`LLM API error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
};

const EXTRACTION_PROMPT = (rawText) => `
You are a procurement data extraction assistant.
Extract structured data from the following vendor quote document text.
Return ONLY valid JSON with this exact shape:
{
  "vendor_name": "string",
  "payment_terms": "string",
  "delivery_time_days": number or null,
  "validity_date": "YYYY-MM-DD or null",
  "items": [
    {
      "item_name_raw": "string",
      "item_code_raw": "string or null",
      "quantity": number,
      "unit_price": number,
      "total_price": number,
      "tax": number or 0,
      "freight": number or 0,
      "discount": number or 0,
      "warranty": "string or null",
      "availability": "string or null",
      "confidence_score": 0.0 to 1.0
    }
  ],
  "confidence_overall": 0.0 to 1.0,
  "notes": "any other relevant info"
}
If a field is unclear set it to null and lower confidence_score.
Document text:
---
${rawText}
---
`;

async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // For PDFs, Tesseract can handle image-based PDFs; for pure-text PDFs use pdfkit or pdf-parse
  if (['.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.gif'].includes(ext)) {
    const { data: { text } } = await Tesseract.recognize(filePath, 'eng', { logger: () => {} });
    return text;
  }
  if (ext === '.pdf') {
    // Try Tesseract on PDF (works for image PDFs)
    try {
      const { data: { text } } = await Tesseract.recognize(filePath, 'eng', { logger: () => {} });
      return text;
    } catch (e) {
      return fs.readFileSync(filePath, 'utf8');
    }
  }
  if (['.txt', '.csv'].includes(ext)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  if (['.xlsx', '.xls'].includes(ext)) {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(filePath);
    return wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
  }
  return '';
}

async function extractQuoteFromFile(quoteId, filePath) {
  const quote = await Quote.findByPk(quoteId);
  if (!quote) throw new Error('Quote not found');
  await quote.update({ extraction_status: 'processing' });
  try {
    const rawText = await extractTextFromFile(filePath);
    const llmResponse = await callLLM(EXTRACTION_PROMPT(rawText));
    const structured = JSON.parse(llmResponse);

    // Store extraction record
    await AiExtraction.create({
      company_id: quote.company_id,
      source_table: 'quote',
      source_id: quote.id,
      raw_text: rawText,
      structured_json: structured,
      model_used: process.env.LLM_MODEL || 'gpt-4o-mini',
      confidence_overall: structured.confidence_overall || 0,
    });

    // Create QuoteItems from extraction
    if (structured.items?.length) {
      await QuoteItem.bulkCreate(structured.items.map((i) => ({
        quote_id: quote.id,
        item_name_raw: i.item_name_raw,
        item_code_raw: i.item_code_raw,
        quantity: i.quantity || 0,
        unit_price: i.unit_price || 0,
        total_price: i.total_price || (i.quantity * i.unit_price) || 0,
        tax: i.tax || 0,
        freight: i.freight || 0,
        discount: i.discount || 0,
        warranty: i.warranty,
        availability: i.availability,
        notes: i.notes,
        confidence_score: i.confidence_score || 0.5,
      })));
    }

    const total = (structured.items || []).reduce((s, i) => s + (i.total_price || 0), 0);
    const needsReview = (structured.confidence_overall || 0) < 0.75;

    await quote.update({
      payment_terms: structured.payment_terms || quote.payment_terms,
      delivery_time_days: structured.delivery_time_days || quote.delivery_time_days,
      validity_date: structured.validity_date || quote.validity_date,
      total_amount: total,
      ai_confidence: structured.confidence_overall,
      extraction_status: needsReview ? 'needs_review' : 'done',
    });

    return structured;
  } catch (err) {
    await quote.update({ extraction_status: 'failed' });
    throw err;
  }
}

async function generateRecommendation(rfqId, companyId) {
  const quotes = await Quote.findAll({
    where: { company_id: companyId, extraction_status: 'done', status: 'submitted' },
    include: [
      { model: require('../models').RfqVendor, where: { rfq_id: rfqId } },
      { model: QuoteItem, as: 'items' },
      { model: Vendor },
    ],
  });

  if (!quotes.length) throw Object.assign(new Error('No processed quotes found'), { status: 400 });

  // Score each quote: price (40%), delivery (25%), vendor score (25%), payment terms (10%)
  const maxPrice = Math.max(...quotes.map((q) => parseFloat(q.total_amount) || Infinity));
  const maxDelivery = Math.max(...quotes.map((q) => q.delivery_time_days || 30));

  const scored = await Promise.all(quotes.map(async (q) => {
    const vendorScore = await VendorScore.findOne({ where: { vendor_id: q.vendor_id, company_id: companyId }, order: [['period', 'DESC']] });
    const priceScore = maxPrice > 0 ? (1 - parseFloat(q.total_amount) / maxPrice) : 0.5;
    const deliveryScore = maxDelivery > 0 ? (1 - (q.delivery_time_days || 14) / maxDelivery) : 0.5;
    const reliabilityScore = vendorScore ? parseFloat(vendorScore.overall_score) / 10 : 0.5;
    const paymentScore = q.payment_terms?.toLowerCase().includes('30') ? 1 : 0.5;
    const total = (priceScore * 0.4) + (deliveryScore * 0.25) + (reliabilityScore * 0.25) + (paymentScore * 0.1);
    return { quote: q, total, priceScore, deliveryScore, reliabilityScore, paymentScore };
  }));

  scored.sort((a, b) => b.total - a.total);
  const best = scored[0];
  const lowestPrice = Math.min(...quotes.map((q) => parseFloat(q.total_amount) || Infinity));
  const savingsVsAvg = (quotes.reduce((s, q) => s + parseFloat(q.total_amount || 0), 0) / quotes.length) - parseFloat(best.quote.total_amount);

  const reasoningPrompt = `
You are a procurement AI advisor. Explain in 2-3 plain English sentences why this vendor was recommended.
Data: Vendor "${best.quote.Vendor?.name}", price ₹${best.quote.total_amount}, delivery in ${best.quote.delivery_time_days} days,
payment terms "${best.quote.payment_terms}", reliability score ${best.reliabilityScore.toFixed(2)}/1.0.
Compared to ${quotes.length} other quotes. Be specific and concise. No marketing language.
`;
  let reasoning = '';
  try { reasoning = await callLLM(reasoningPrompt); } catch { reasoning = `${best.quote.Vendor?.name} offers the best combination of competitive pricing and reliable delivery.`; }

  // Mark recommended
  await Quote.update({ ai_recommended: false }, { where: { company_id: companyId } });
  await best.quote.update({ ai_recommended: true, ai_confidence: best.total });

  const rec = await AiRecommendation.create({
    company_id: companyId,
    rfq_id: rfqId,
    recommended_quote_id: best.quote.id,
    reasoning_text: typeof reasoning === 'string' ? reasoning.replace(/```json|```/g, '').trim() : reasoning,
    score_breakdown: { price: best.priceScore, delivery: best.deliveryScore, reliability: best.reliabilityScore, payment: best.paymentScore },
    savings_estimate: savingsVsAvg > 0 ? savingsVsAvg : 0,
    confidence: best.total,
  });

  return rec;
}

// Normalize an item name for fuzzy matching: lowercase, strip punctuation/units noise, collapse whitespace.
function normalizeItemName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Best-effort link between an AI-extracted invoice line and the PO's line items.
// Exact normalized match first, then containment either direction, else null (unmatched).
function matchPoItem(rawName, poItems) {
  const target = normalizeItemName(rawName);
  if (!target) return null;
  let best = null;
  for (const poItem of poItems) {
    const candidate = normalizeItemName(poItem.item_name);
    if (!candidate) continue;
    if (candidate === target) return poItem; // exact match — stop immediately
    if (!best && (candidate.includes(target) || target.includes(candidate))) best = poItem;
  }
  return best;
}

async function extractInvoice(invoiceId, filePath) {
  const { Invoice, InvoiceItem, PoItem } = require('../models');
  const invoice = await Invoice.findByPk(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  const rawText = await extractTextFromFile(filePath);
  const prompt = `Extract invoice data from this text. Return JSON: { vendor_name, invoice_number, invoice_date (YYYY-MM-DD), total_amount, items: [{item_name_raw, quantity, unit_price, total_price, confidence_score}], confidence_overall }. Text:\n${rawText}`;
  const structured = JSON.parse(await callLLM(prompt));
  await AiExtraction.create({ company_id: invoice.company_id, source_table: 'invoice', source_id: invoice.id, raw_text: rawText, structured_json: structured, model_used: process.env.LLM_MODEL || 'gpt-4o-mini', confidence_overall: structured.confidence_overall });

  if (structured.items?.length) {
    // Pull the PO's line items (if this invoice is linked to a PO) so we can attach
    // po_item_id to each extracted line — required for 3-way quantity matching to work at all.
    const poItems = invoice.purchase_order_id
      ? await PoItem.findAll({ where: { purchase_order_id: invoice.purchase_order_id } })
      : [];

    await InvoiceItem.bulkCreate(structured.items.map((i) => {
      const matched = poItems.length ? matchPoItem(i.item_name_raw, poItems) : null;
      return {
        invoice_id: invoice.id,
        po_item_id: matched ? matched.id : null,
        item_name_raw: i.item_name_raw,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total_price: i.total_price,
        confidence_score: i.confidence_score,
      };
    }));
  }
  await invoice.update({ invoice_number: structured.invoice_number || invoice.invoice_number, invoice_date: structured.invoice_date || invoice.invoice_date, total_amount: structured.total_amount || invoice.total_amount });
  return structured;
}

module.exports = { extractQuoteFromFile, generateRecommendation, extractInvoice };
