// // const Tesseract = require('tesseract.js');
// // const fs = require('fs');
// // const path = require('path');
// // const { AiExtraction, AiRecommendation, Quote, QuoteItem, VendorScore, Vendor } = require('../models');

// // // Hybrid extraction: when imageBase64 is supplied, the prompt is sent
// // // alongside the actual page image (not just the OCR'd text) using the
// // // model's vision input. This is what lets extraction hold up on messy
// // // scans, skewed photos, low-contrast faxes, and handwriting that Tesseract
// // // mangles into garbled text — the model can look at the picture itself
// // // instead of trusting OCR's guess. OCR text is still generated first and
// // // included in the prompt as a second reference source (see
// // // extractQuoteFromFile/extractInvoice), so the model effectively
// // // cross-checks one against the other. gpt-4o-mini (the default model) has
// // // native vision support, so no model change is required for this to work —
// // // it only activates when an image is actually passed in.
// // const callLLM = async (prompt, { maxTokens = 8000, retries = 2, imageBase64 = null, imageMimeType = null } = {}) => {
// //   const apiKey = process.env.LLM_API_KEY;
// //   const model = process.env.LLM_MODEL || 'gpt-4o-mini';
// //   // Defaults to OpenAI's own endpoint, but any OpenAI-compatible provider
// //   // works by just setting LLM_API_BASE_URL — e.g. Google Gemini's free-tier
// //   // compatibility endpoint (https://generativelanguage.googleapis.com/v1beta/openai),
// //   // which supports the same chat/completions shape including vision and
// //   // JSON response format, no code change required to switch.
// //   const baseUrl = (process.env.LLM_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
// //   if (!apiKey) {
// //     console.warn('LLM_API_KEY not set — returning mock extraction');
// //     return { content: JSON.stringify({ items: [], vendor_name: '', payment_terms: '', delivery_time_days: 7, confidence_overall: 0 }), mock: true };
// //   }

// //   const content = imageBase64
// //     ? [
// //         { type: 'text', text: prompt },
// //         { type: 'image_url', image_url: { url: `data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}`, detail: 'high' } },
// //       ]
// //     : prompt;

// //   let lastErr;
// //   for (let attempt = 0; attempt <= retries; attempt++) {
// //     let res;
// //     try {
// //       res = await fetch(`${baseUrl}/chat/completions`, {
// //         method: 'POST',
// //         headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
// //         body: JSON.stringify({
// //           model,
// //           temperature: 0,
// //           max_tokens: maxTokens, // without this a long multi-item quote can get cut off mid-JSON and fail to parse
// //           messages: [{ role: 'user', content }],
// //           response_format: { type: 'json_object' },
// //         }),
// //       });
// //     } catch (networkErr) {
// //       // fetch() itself threw (DNS hiccup, connection reset, timeout) — transient, worth a retry.
// //       lastErr = new Error(`LLM API network error: ${networkErr.message}`);
// //       if (attempt < retries) { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); continue; }
// //       throw lastErr;
// //     }

// //     if (!res.ok) {
// //       const body = await res.text().catch(() => '');
// //       // insufficient_quota specifically means the account has no billing/credits
// //       // configured — retrying will never succeed, so fail fast with a clear
// //       // message instead of burning 2 more attempts and 1-1.5s of retry delay
// //       // on every single extraction until someone fixes the account.
// //       const isQuotaError = res.status === 429 && /insufficient_quota/i.test(body);
// //       // Providers (Gemini especially) deprecate/retire specific model names every
// //       // few months — a 404 "model ... is no longer available" is a config problem
// //       // (wrong/stale LLM_MODEL), not a transient failure, and won't fix itself.
// //       const isModelGoneError = res.status === 404 && /no longer available|not found|does not exist/i.test(body);
// //       lastErr = new Error(
// //         isQuotaError
// //           ? `LLM API account has no billing/credits configured (insufficient_quota) — this will not succeed on retry. Add billing at your provider's dashboard, or switch LLM_API_BASE_URL/LLM_API_KEY/LLM_MODEL to a provider with a free tier (e.g. Google Gemini).`
// //           : isModelGoneError
// //           ? `LLM_MODEL "${model}" is not available on this provider/account (HTTP 404) — model names get deprecated/retired frequently, especially on Gemini's free tier. Check your provider's current model list and update LLM_MODEL. Raw error: ${body.slice(0, 300)}`
// //           : `LLM API error: ${res.status}${body ? ` — ${body.slice(0, 300)}` : ''}`
// //       );
// //       // 429 (genuine rate limiting, not quota) and 5xx (provider having issues) are
// //       // transient and worth retrying. insufficient_quota, a gone/renamed model, and
// //       // anything else (401 bad key, 400 bad request, etc.) will not succeed on retry.
// //       if (res.status === 429 && !isQuotaError && attempt < retries) { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); continue; }
// //       if (res.status >= 500 && attempt < retries) { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); continue; }
// //       throw lastErr;
// //     }

// //     const data = await res.json();
// //     const choice = data.choices[0];
// //     if (choice.finish_reason === 'length') {
// //       console.warn('LLM response was truncated (hit max_tokens) — extraction may be incomplete');
// //     }
// //     return { content: choice.message.content, mock: false, truncated: choice.finish_reason === 'length' };
// //   }
// //   throw lastErr;
// // };

// // // Best-effort recovery for LLM responses that aren't clean JSON (e.g. wrapped in
// // // markdown fences, or with stray text before/after). Returns null if unrecoverable.
// // function tryParseJson(raw) {
// //   try { return JSON.parse(raw); } catch {}
// //   const stripped = raw.replace(/```json|```/g, '').trim();
// //   try { return JSON.parse(stripped); } catch {}
// //   const start = stripped.indexOf('{');
// //   const end = stripped.lastIndexOf('}');
// //   if (start !== -1 && end !== -1 && end > start) {
// //     try { return JSON.parse(stripped.slice(start, end + 1)); } catch {}
// //   }
// //   return null;
// // }

// // const EXTRACTION_PROMPT = (rawText, hasImage) => `
// // You are a procurement data extraction assistant.
// // Extract structured data from this vendor quote document.
// // ${hasImage
// //   ? 'You have BOTH the OCR-extracted text below AND the original document image attached. The OCR text can contain errors (misread digits, merged columns, garbled handwriting) — use the image as the primary source of truth and only fall back to the OCR text where the image is unreadable. Pay special attention to tabular line-item layouts and any handwritten quantities, prices, or annotations.'
// //   : 'Only OCR-extracted text is available for this file (no image was provided).'}
// // Look specifically for: item table rows (name, quantity, unit price, line total), tax/GST, freight/shipping, discounts, payment terms, delivery/lead time, quote validity date, any reference/quotation number, and vendor identification details. Numbers may use Indian numbering (₹, lakhs/commas) — normalize to plain numbers.
// // Return ONLY valid JSON with this exact shape:
// // {
// //   "vendor_name": "string",
// //   "payment_terms": "string",
// //   "delivery_time_days": number or null,
// //   "validity_date": "YYYY-MM-DD or null",
// //   "items": [
// //     {
// //       "item_name_raw": "string",
// //       "item_code_raw": "string or null",
// //       "quantity": number,
// //       "unit_price": number,
// //       "total_price": number,
// //       "tax": number or 0,
// //       "freight": number or 0,
// //       "discount": number or 0,
// //       "warranty": "string or null",
// //       "availability": "string or null",
// //       "confidence_score": 0.0 to 1.0
// //     }
// //   ],
// //   "confidence_overall": 0.0 to 1.0,
// //   "notes": "any other relevant info — include any reference/quotation number and vendor contact details found here since there is no dedicated field for them"
// // }
// // If a field is unclear (including because handwriting or scan quality made it illegible) set it to null and lower confidence_score — never guess a number you cannot actually read.
// // OCR text:
// // ---
// // ${rawText}
// // ---
// // `;

// // // Loads the uploaded file's bytes regardless of where it lives: a local disk path (dev /
// // // no-S3 fallback) or an https:// URL (S3 / S3-compatible storage). Using a buffer
// // // throughout means the same extraction code works for both storage backends.
// // async function loadFileBuffer(filePathOrUrl) {
// //   if (/^https?:\/\//i.test(filePathOrUrl)) {
// //     const res = await fetch(filePathOrUrl);
// //     if (!res.ok) throw new Error(`Could not download the source file from storage (HTTP ${res.status}). It may have been removed.`);
// //     return Buffer.from(await res.arrayBuffer());
// //   }
// //   // Quotes and invoices now store their servable URL (e.g. "/files/procureai-uploads/xyz.pdf"),
// //   // the path our own server exposes via `app.use('/files', express.static('/tmp'))`.
// //   // Resolve that back to the real on-disk path before reading it directly —
// //   // re-extraction/re-processing doesn't go through HTTP.
// //   let diskPath = filePathOrUrl;
// //   if (filePathOrUrl.startsWith('/files/')) {
// //     diskPath = path.join('/tmp', filePathOrUrl.slice('/files/'.length));
// //   }
// //   try {
// //     return fs.readFileSync(diskPath);
// //   } catch (e) {
// //     if (e.code === 'ENOENT') {
// //       // The file lived only on local disk and is gone — most likely a server restart/redeploy
// //       // wiped it (local disk here is ephemeral). Re-extract cannot recover this; the caller
// //       // needs a fresh file. Give an actionable message instead of a raw stack-style error.
// //       throw new Error('The originally uploaded file is no longer available on the server (it may have been lost in a restart). Please ask the vendor to resubmit the quote file, or enter the values manually below.');
// //     }
// //     throw e;
// //   }
// // }

// // // Runs OCR with a page-segmentation mode tuned for line-item documents
// // // (PSM 6 — "assume a single uniform block of text", which handles
// // // tables/columns of items noticeably better than Tesseract's PSM 3 default
// // // meant for general mixed-layout pages). If that first pass comes back
// // // mostly empty (a photographed/skewed/low-contrast page can confuse PSM 6),
// // // it retries once with PSM 3 before giving up — a cheap way to meaningfully
// // // improve success rate on messy real-world scans without adding a new
// // // dependency. Handwriting recognition is a genuine limitation of Tesseract
// // // (an LSTM engine trained overwhelmingly on printed text) — the two-pass OCR
// // // here is combined with sending the raw image itself to the vision-capable
// // // LLM (see callLLM's imageBase64 option) as the actual mechanism that lets
// // // handwritten/messy documents extract at all, since the model can read the
// // // picture directly instead of relying solely on Tesseract's text guess.
// // async function runOcr(buffer) {
// //   const tryPsm = async (psm) => {
// //     const worker = await Tesseract.createWorker('eng', undefined, { logger: () => {} });
// //     try {
// //       await worker.setParameters({ tessedit_pageseg_mode: psm });
// //       const { data: { text } } = await worker.recognize(buffer);
// //       return text || '';
// //     } finally {
// //       await worker.terminate();
// //     }
// //   };

// //   try {
// //     const first = await tryPsm('6');
// //     if (first && first.trim().length > 20) return first;
// //     const second = await tryPsm('3');
// //     return (second && second.trim().length > (first || '').trim().length) ? second : first;
// //   } catch (e) {
// //     console.warn('[OCR] recognition failed:', e.message);
// //     return '';
// //   }
// // }

// // // Extracts the embedded text layer from a PDF using pdfjs-dist — NOT OCR.
// // // This only works for PDFs that have real text content (the overwhelming
// // // majority of vendor quotes/invoices: anything from accounting software,
// // // Word/Excel/Google Docs exports, or a quotation template). For a genuinely
// // // scanned/photographed PDF with no text layer, this correctly returns an
// // // empty string rather than attempting anything risky — see the comment on
// // // extractTextFromBuffer's PDF branch for why we do not fall back to OCR here.
// // async function extractPdfText(buffer) {
// //   // pdfjs-dist v4 ships ESM-only; dynamic import() is the standard, fully
// //   // supported way to load an ESM package from CommonJS in Node 20.
// //   const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
// //   const doc = await pdfjsLib.getDocument({
// //     data: new Uint8Array(buffer),
// //     // Disable everything that isn't needed for plain text extraction —
// //     // keeps this to a small, predictable code path with no rendering,
// //     // no font-fetching, no canvas involvement at all.
// //     useSystemFonts: false,
// //     disableFontFace: true,
// //     isEvalSupported: false,
// //     // pdfjs logs its own warnings straight to console (missing standard font
// //     // files, DOMMatrix/Path2D polyfill notices) even though none of that
// //     // affects text extraction — verbosity: 0 silences those without touching
// //     // our own error handling/logging above.
// //     verbosity: 0,
// //   }).promise;

// //   let text = '';
// //   const maxPages = Math.min(doc.numPages, 30); // sane cap for a quote/invoice document
// //   for (let i = 1; i <= maxPages; i++) {
// //     const page = await doc.getPage(i);
// //     const content = await page.getTextContent();
// //     text += content.items.map((it) => it.str).join(' ') + '\n';
// //   }
// //   return text;
// // }

// // // Reads text from a Buffer — never touches disk, works for all file types
// // async function extractTextFromBuffer(buffer, mimetype, originalname) {
// //   const ext = path.extname(originalname || '').toLowerCase();

// //   if (['image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/bmp', 'image/gif'].includes(mimetype) ||
// //       ['.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.gif'].includes(ext)) {
// //     return await runOcr(buffer);
// //   }

// //   if (mimetype === 'application/pdf' || ext === '.pdf') {
// //     // IMPORTANT: PDFs must NEVER be passed to Tesseract/runOcr. Tesseract's
// //     // underlying image library (Leptonica) cannot decode the PDF container
// //     // format at all, and critically, when that decode fails it does not
// //     // reliably surface as a catchable promise rejection — it has crashed
// //     // the entire Node process in production (every user, not just this
// //     // request) rather than failing just this one upload. There is no
// //     // try/catch that can safely guard against that failure mode, so the
// //     // only safe fix is to never make that call in the first place.
// //     try {
// //       const text = await extractPdfText(buffer);
// //       if (text && text.trim().length > 20) return text;
// //       // Text layer was empty/near-empty — this is very likely a scanned or
// //       // photographed PDF with no real text content. We deliberately do NOT
// //       // attempt OCR on it (see above). Surfacing this clearly to the vendor/
// //       // buyer as "please re-upload as a photo" is far better than a silent
// //       // near-empty extraction or, worse, a server crash.
// //       return '';
// //     } catch (e) {
// //       console.warn('[PDF] text-layer extraction failed:', e.message);
// //       return '';
// //     }
// //   }

// //   if (['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
// //        'application/vnd.ms-excel'].includes(mimetype) ||
// //       ['.xlsx', '.xls'].includes(ext)) {
// //     const XLSX = require('xlsx');
// //     let wb;
// //     try {
// //       wb = XLSX.read(buffer, { type: 'buffer' }); // reads from buffer, no disk path
// //     } catch (e) {
// //       throw new Error(`Could not read Excel file — may be corrupted or password-protected (${e.message})`);
// //     }
// //     if (!wb.SheetNames.length) throw new Error('Excel file has no sheets.');
// //     return wb.SheetNames.map((n) => {
// //       const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false });
// //       return `Sheet: ${n}\n` +
// //         csv.split('\n').filter((l) => l.replace(/,/g, '').trim().length > 0).join('\n');
// //     }).join('\n\n');
// //   }

// //   if (['text/csv', 'text/plain'].includes(mimetype) || ['.csv', '.txt'].includes(ext)) {
// //     return buffer.toString('utf8');
// //   }

// //   const fallback = buffer.toString('utf8');
// //   if (fallback.trim().length > 5) return fallback;
// //   throw new Error('Cannot extract text from this file type. Upload PDF, image, Excel, or CSV.');
// // }

// // async function extractQuoteFromFile(quoteId, fileSource, mimetypeHint, originalNameHint) {
// //   const quote = await Quote.findByPk(quoteId);
// //   if (!quote) throw new Error('Quote not found');
// //   await quote.update({ extraction_status: 'processing' });
// //   try {
// //     let buffer;
// //     let mimetype = mimetypeHint || '';
// //     let originalname = originalNameHint || quote.source_file_url || 'file';
// //     if (Buffer.isBuffer(fileSource)) {
// //       buffer = fileSource;
// //     } else {
// //       // Fallback for re-extract from old URL/path
// //       buffer = await loadFileBuffer(fileSource);
// //       if (!mimetype) {
// //         const ext = path.extname((fileSource || '').split('?')[0]).toLowerCase();
// //         const m = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
// //           '.png': 'image/png', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
// //           '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv' };
// //         mimetype = m[ext] || '';
// //       }
// //     }
// //     const isImage = /^image\//.test(mimetype);
// //     const rawText = await extractTextFromBuffer(buffer, mimetype, originalname);
// //     // For images, an unreadable OCR pass isn't fatal — the LLM can still read
// //     // the picture directly (hybrid path below), so only bail out here for
// //     // non-image files where there's no image fallback to lean on.
// //     if (!isImage && (!rawText || !rawText.trim())) {
// //       // Nothing readable came out of the file itself (corrupt/blank/unsupported format) —
// //       // there's no point calling the LLM on empty input.
// //       await quote.update({ extraction_status: 'needs_review', extraction_note: 'Could not read any text from this file. If this is a scanned or photographed PDF (no selectable text), please upload it as a JPG/PNG photo instead — PDF image-scanning is not supported, only PDFs with real embedded text. Otherwise, enter the quote manually below.' });
// //       return null;
// //     }

// //     const { content: llmResponse, mock, truncated } = await callLLM(
// //       EXTRACTION_PROMPT(rawText || '(OCR produced no readable text — read directly from the attached image)', isImage),
// //       isImage ? { imageBase64: buffer.toString('base64'), imageMimeType: mimetype } : {}
// //     );
// //     const structured = tryParseJson(llmResponse);

// //     if (!structured) {
// //       // Keep the raw response for debugging instead of losing it - this is the difference
// //       // between "silently 0 items" and being able to see exactly what the LLM returned.
// //       await AiExtraction.create({
// //         company_id: quote.company_id, source_table: 'quote', source_id: quote.id,
// //         raw_text: rawText, structured_json: { raw_llm_response: llmResponse },
// //         model_used: process.env.LLM_MODEL || 'gpt-4o-mini', confidence_overall: 0,
// //       });
// //       await quote.update({ extraction_status: 'failed', extraction_note: 'AI response could not be parsed as JSON. Click Re-extract, or enter the quote manually.' });
// //       return null;
// //     }

// //     // No LLM_API_KEY configured — make this visible on the quote instead of looking like
// //     // a successful extraction that just happened to find zero items.
// //     if (mock) {
// //       await quote.update({ extraction_status: 'needs_review', extraction_note: 'AI extraction is not configured (LLM_API_KEY missing) — please enter this quote\'s items manually.' });
// //       return structured;
// //     }

// //     // Store extraction record
// //     await AiExtraction.create({
// //       company_id: quote.company_id,
// //       source_table: 'quote',
// //       source_id: quote.id,
// //       raw_text: rawText,
// //       structured_json: structured,
// //       model_used: process.env.LLM_MODEL || 'gpt-4o-mini',
// //       confidence_overall: structured.confidence_overall || 0,
// //     });

// //     // Create QuoteItems from extraction
// //     if (structured.items?.length) {
// //       await QuoteItem.bulkCreate(structured.items.map((i) => ({
// //         quote_id: quote.id,
// //         item_name_raw: i.item_name_raw,
// //         item_code_raw: i.item_code_raw,
// //         quantity: i.quantity || 0,
// //         unit_price: i.unit_price || 0,
// //         total_price: i.total_price || (i.quantity * i.unit_price) || 0,
// //         tax: i.tax || 0,
// //         freight: i.freight || 0,
// //         discount: i.discount || 0,
// //         warranty: i.warranty,
// //         availability: i.availability,
// //         notes: i.notes,
// //         confidence_score: i.confidence_score || 0.5,
// //       })));
// //     }

// //     const total = (structured.items || []).reduce((s, i) => s + (i.total_price || 0), 0);
// //     const needsReview = (structured.confidence_overall || 0) < 0.75 || !structured.items?.length || truncated;
// //     let note = null;
// //     if (truncated) note = 'AI response was cut off before finishing (too many items for one pass) — some items may be missing. Click Re-extract or add missing rows manually.';
// //     else if (!structured.items?.length) note = 'AI could not find any line items in this file. Please check the file or enter items manually.';

// //     await quote.update({
// //       payment_terms: structured.payment_terms || quote.payment_terms,
// //       delivery_time_days: structured.delivery_time_days || quote.delivery_time_days,
// //       validity_date: structured.validity_date || quote.validity_date,
// //       total_amount: total,
// //       ai_confidence: structured.confidence_overall,
// //       extraction_status: needsReview ? 'needs_review' : 'done',
// //       extraction_note: note,
// //     });

// //     return structured;
// //   } catch (err) {
// //     await quote.update({ extraction_status: 'failed', extraction_note: err.message });
// //     throw err;
// //   }
// // }

// // async function generateRecommendation(rfqId, companyId) {
// //   const quotes = await Quote.findAll({
// //     where: { company_id: companyId, extraction_status: 'done', status: 'submitted' },
// //     include: [
// //       { model: require('../models').RfqVendor, where: { rfq_id: rfqId } },
// //       { model: QuoteItem, as: 'items' },
// //       { model: Vendor },
// //     ],
// //   });

// //   if (!quotes.length) throw Object.assign(new Error('No processed quotes found'), { status: 400 });

// //   // Score each quote: price (40%), delivery (25%), vendor score (25%), payment terms (10%)
// //   const maxPrice = Math.max(...quotes.map((q) => parseFloat(q.total_amount) || Infinity));
// //   const maxDelivery = Math.max(...quotes.map((q) => q.delivery_time_days || 30));

// //   const scored = await Promise.all(quotes.map(async (q) => {
// //     const vendorScore = await VendorScore.findOne({ where: { vendor_id: q.vendor_id, company_id: companyId }, order: [['period', 'DESC']] });
// //     const priceScore = maxPrice > 0 ? (1 - parseFloat(q.total_amount) / maxPrice) : 0.5;
// //     const deliveryScore = maxDelivery > 0 ? (1 - (q.delivery_time_days || 14) / maxDelivery) : 0.5;
// //     const reliabilityScore = vendorScore ? parseFloat(vendorScore.overall_score) / 10 : 0.5;
// //     const paymentScore = q.payment_terms?.toLowerCase().includes('30') ? 1 : 0.5;
// //     const total = (priceScore * 0.4) + (deliveryScore * 0.25) + (reliabilityScore * 0.25) + (paymentScore * 0.1);
// //     return { quote: q, total, priceScore, deliveryScore, reliabilityScore, paymentScore };
// //   }));

// //   scored.sort((a, b) => b.total - a.total);
// //   const best = scored[0];
// //   const lowestPrice = Math.min(...quotes.map((q) => parseFloat(q.total_amount) || Infinity));
// //   const savingsVsAvg = (quotes.reduce((s, q) => s + parseFloat(q.total_amount || 0), 0) / quotes.length) - parseFloat(best.quote.total_amount);

// //   const reasoningPrompt = `
// // You are a procurement AI advisor. Explain in 2-3 plain English sentences why this vendor was recommended.
// // Data: Vendor "${best.quote.Vendor?.name}", price ₹${best.quote.total_amount}, delivery in ${best.quote.delivery_time_days} days,
// // payment terms "${best.quote.payment_terms}", reliability score ${best.reliabilityScore.toFixed(2)}/1.0.
// // Compared to ${quotes.length} other quotes. Be specific and concise. No marketing language.
// // `;
// //   let reasoning = '';
// //   try { reasoning = (await callLLM(reasoningPrompt, { maxTokens: 400 })).content; } catch { reasoning = `${best.quote.Vendor?.name} offers the best combination of competitive pricing and reliable delivery.`; }

// //   // Mark recommended
// //   await Quote.update({ ai_recommended: false }, { where: { company_id: companyId } });
// //   await best.quote.update({ ai_recommended: true, ai_confidence: best.total });

// //   const rec = await AiRecommendation.create({
// //     company_id: companyId,
// //     rfq_id: rfqId,
// //     recommended_quote_id: best.quote.id,
// //     reasoning_text: typeof reasoning === 'string' ? reasoning.replace(/```json|```/g, '').trim() : reasoning,
// //     score_breakdown: { price: best.priceScore, delivery: best.deliveryScore, reliability: best.reliabilityScore, payment: best.paymentScore },
// //     savings_estimate: savingsVsAvg > 0 ? savingsVsAvg : 0,
// //     confidence: best.total,
// //   });

// //   return rec;
// // }

// // // Normalize an item name for fuzzy matching: lowercase, strip punctuation/units noise, collapse whitespace.
// // function normalizeItemName(name) {
// //   return (name || '')
// //     .toLowerCase()
// //     .replace(/[^a-z0-9]+/g, ' ')
// //     .trim();
// // }

// // // Best-effort link between an AI-extracted invoice line and the PO's line items.
// // // Exact normalized match first, then containment either direction, else null (unmatched).
// // function matchPoItem(rawName, poItems) {
// //   const target = normalizeItemName(rawName);
// //   if (!target) return null;
// //   let best = null;
// //   for (const poItem of poItems) {
// //     const candidate = normalizeItemName(poItem.item_name);
// //     if (!candidate) continue;
// //     if (candidate === target) return poItem; // exact match — stop immediately
// //     if (!best && (candidate.includes(target) || target.includes(candidate))) best = poItem;
// //   }
// //   return best;
// // }

// // async function extractInvoice(invoiceId, filePath, mimetype, originalname) {
// //   const { Invoice, InvoiceItem, PoItem } = require('../models');
// //   const invoice = await Invoice.findByPk(invoiceId);
// //   if (!invoice) throw new Error('Invoice not found');

// //   const buffer = await loadFileBuffer(filePath);
// //   const isImage = /^image\//.test(mimetype || '');
// //   const rawText = await extractTextFromBuffer(buffer, mimetype, originalname || filePath);
// //   // Same reasoning as extractQuoteFromFile: for images the LLM's vision pass
// //   // can still succeed even when OCR text comes back empty/garbled, so only
// //   // treat "no readable text" as fatal when there's no image to fall back to.
// //   if (!isImage && (!rawText || rawText.trim().length < 10)) {
// //     throw new Error('Could not read any text from this invoice file. If this is a scanned or photographed PDF, please upload it as a JPG/PNG photo instead — PDF image-scanning is not supported, only PDFs with real embedded text. Otherwise, enter the values manually.');
// //   }

// //   const prompt = `Extract invoice data from this document.
// // ${isImage
// //   ? 'Both OCR text (below) and the original invoice image are attached. Treat the image as the primary source of truth — OCR text can misread digits, merge table columns, or mangle handwritten entries — and only rely on the OCR text where the image itself is unreadable.'
// //   : 'Only OCR-extracted text is available (no image was provided).'}
// // Look for the item table (name, quantity, unit price, line total), tax/GST, freight/shipping, discounts, the invoice number, invoice date, vendor name, and any PO/reference number mentioned. Numbers may use Indian numbering (₹, lakhs/commas) — normalize to plain numbers.
// // Return ONLY valid JSON: { vendor_name, invoice_number, invoice_date (YYYY-MM-DD), total_amount, items: [{item_name_raw, quantity, unit_price, total_price, tax, freight, discount, confidence_score}], confidence_overall }.
// // Set tax, freight, and discount to 0 if the document doesn't mention them for a line. If a value is illegible (including due to handwriting or scan quality), set it to null rather than guessing, and lower confidence_score.
// // OCR text:
// // ${rawText || '(OCR produced no readable text — read directly from the attached image)'}`;
// //   const { content, mock } = await callLLM(
// //     prompt,
// //     isImage ? { imageBase64: buffer.toString('base64'), imageMimeType: mimetype } : {}
// //   );
// //   const structured = tryParseJson(content);
// //   if (!structured) {
// //     await invoice.update({ mismatch_reason: 'AI response could not be parsed as JSON — please review this invoice manually.' });
// //     throw new Error('AI response could not be parsed as JSON');
// //   }

// //   // No LLM_API_KEY configured — make this visible instead of silently showing ₹0/no items
// //   if (mock) {
// //     await invoice.update({ mismatch_reason: 'AI extraction is not configured (LLM_API_KEY missing) — please enter this invoice\'s values manually.' });
// //     return structured;
// //   }
// //   await AiExtraction.create({ company_id: invoice.company_id, source_table: 'invoice', source_id: invoice.id, raw_text: rawText, structured_json: structured, model_used: process.env.LLM_MODEL || 'gpt-4o-mini', confidence_overall: structured.confidence_overall });

// //   if (structured.items?.length) {
// //     // Pull the PO's line items (if this invoice is linked to a PO) so we can attach
// //     // po_item_id to each extracted line — required for 3-way quantity matching to work at all.
// //     const poItems = invoice.purchase_order_id
// //       ? await PoItem.findAll({ where: { purchase_order_id: invoice.purchase_order_id } })
// //       : [];

// //     await InvoiceItem.bulkCreate(structured.items.map((i) => {
// //       const matched = poItems.length ? matchPoItem(i.item_name_raw, poItems) : null;
// //       return {
// //         invoice_id: invoice.id,
// //         po_item_id: matched ? matched.id : null,
// //         item_name_raw: i.item_name_raw,
// //         quantity: i.quantity,
// //         unit_price: i.unit_price,
// //         total_price: i.total_price,
// //         tax: i.tax || 0,
// //         freight: i.freight || 0,
// //         discount: i.discount || 0,
// //         confidence_score: i.confidence_score,
// //       };
// //     }));
// //   }
// //   // The LLM's top-level total_amount is sometimes missing/unreliable even when it
// //   // correctly extracted line items (multi-page invoices, odd layouts). Fall back to
// //   // summing the extracted item totals — same approach already used for quotes —
// //   // instead of falling back to invoice.total_amount, which is never set at upload
// //   // time and so previously left the invoice showing ₹0.
// //   const itemsTotal = (structured.items || []).reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
// //   const resolvedTotal = parseFloat(structured.total_amount) || itemsTotal || parseFloat(invoice.total_amount) || 0;
// //   await invoice.update({ invoice_number: structured.invoice_number || invoice.invoice_number, invoice_date: structured.invoice_date || invoice.invoice_date, total_amount: resolvedTotal });
// //   return structured;
// // }

// // // Pre-validation: extract from buffer WITHOUT writing to DB.
// // // Vendor uploads file → we extract → return items for frontend preview → vendor confirms → submit.
// // async function validateQuoteFile(buffer, mimetype, originalname) {
// //   const isImage = /^image\//.test(mimetype || '');
// //   const rawText = await extractTextFromBuffer(buffer, mimetype, originalname);
// //   if (!isImage && (!rawText || rawText.trim().length < 10)) {
// //     throw new Error('Could not read any text from this file. If this is a scanned or photographed PDF, please upload it as a JPG/PNG photo instead — PDF image-scanning is not supported, only PDFs with real embedded text. Otherwise, enter manually.');
// //   }
// //   const { content, mock, truncated } = await callLLM(
// //     EXTRACTION_PROMPT(rawText || '(OCR produced no readable text — read directly from the attached image)', isImage),
// //     { maxTokens: 8000, ...(isImage ? { imageBase64: buffer.toString('base64'), imageMimeType: mimetype } : {}) }
// //   );
// //   const structured = tryParseJson(content);
// //   if (!structured) throw new Error('AI could not parse the file contents. Please enter your quote manually.');
// //   return {
// //     success: true,
// //     vendor_name: structured.vendor_name || null,
// //     payment_terms: structured.payment_terms || null,
// //     delivery_time_days: structured.delivery_time_days || null,
// //     validity_date: structured.validity_date || null,
// //     confidence_overall: structured.confidence_overall || 0,
// //     items: (structured.items || []).map((i) => ({
// //       item_name_raw: i.item_name_raw || '',
// //       item_code_raw: i.item_code_raw || '',
// //       quantity: i.quantity || 0,
// //       unit_price: i.unit_price || 0,
// //       total_price: i.total_price || ((i.quantity || 0) * (i.unit_price || 0)),
// //       tax: i.tax || 0,
// //       freight: i.freight || 0,
// //       discount: i.discount || 0,
// //       warranty: i.warranty || '',
// //       confidence_score: i.confidence_score || 0.5,
// //     })),
// //     notes: structured.notes || null,
// //     mock,
// //     truncated,
// //   };
// // }
// // // Diff a vendor's quoted line items against what the buyer's purchase request
// // // actually asked for. Reuses the same name-normalization/fuzzy-match approach
// // // already used for invoice-to-PO line matching (normalizeItemName/matchPoItem).
// // // requestedItems is PurchaseRequestItem rows (optionally with an included Item).
// // function compareQuoteToRequestedItems(quoteItems = [], requestedItems = []) {
// //   const requested = requestedItems.map((ri) => ({
// //     id: ri.id,
// //     name: ri.Item?.name || ri.item_name_freetext || 'Unknown item',
// //     quantity: parseFloat(ri.quantity) || 0,
// //     estimated_unit_price: ri.estimated_unit_price != null ? parseFloat(ri.estimated_unit_price) : null,
// //   }));

// //   const usedQuoteItemIds = new Set();
// //   const comparisons = requested.map((req) => {
// //     const target = normalizeItemName(req.name);
// //     let matched = null;
// //     for (const qi of quoteItems) {
// //       if (usedQuoteItemIds.has(qi.id)) continue;
// //       const candidate = normalizeItemName(qi.item_name_raw);
// //       if (!candidate) continue;
// //       if (candidate === target) { matched = qi; break; }
// //       if (!matched && (candidate.includes(target) || target.includes(candidate))) matched = qi;
// //     }

// //     if (!matched) {
// //       return {
// //         item_name: req.name, requested_quantity: req.quantity, quoted_quantity: null,
// //         unit_price: null, total_price: null, estimated_unit_price: req.estimated_unit_price,
// //         status: 'not_quoted',
// //       };
// //     }

// //     usedQuoteItemIds.add(matched.id);
// //     const quotedQty = parseFloat(matched.quantity) || 0;
// //     const unitPrice = parseFloat(matched.unit_price) || 0;
// //     const qtyMismatch = Math.abs(quotedQty - req.quantity) > 0.001;
// //     // Flag if the vendor's unit price is more than 15% away from the buyer's own estimate.
// //     const priceMismatch = req.estimated_unit_price != null && req.estimated_unit_price > 0 &&
// //       Math.abs(unitPrice - req.estimated_unit_price) / req.estimated_unit_price > 0.15;

// //     let status = 'matched';
// //     if (qtyMismatch && priceMismatch) status = 'quantity_and_price_mismatch';
// //     else if (qtyMismatch) status = 'quantity_mismatch';
// //     else if (priceMismatch) status = 'price_mismatch';

// //     return {
// //       item_name: req.name, requested_quantity: req.quantity, quoted_quantity: quotedQty,
// //       unit_price: unitPrice, total_price: parseFloat(matched.total_price) || 0,
// //       estimated_unit_price: req.estimated_unit_price, status,
// //     };
// //   });

// //   // Anything the vendor quoted that the buyer never asked for.
// //   for (const qi of quoteItems) {
// //     if (usedQuoteItemIds.has(qi.id)) continue;
// //     comparisons.push({
// //       item_name: qi.item_name_raw, requested_quantity: null, quoted_quantity: parseFloat(qi.quantity) || 0,
// //       unit_price: parseFloat(qi.unit_price) || 0, total_price: parseFloat(qi.total_price) || 0,
// //       estimated_unit_price: null, status: 'not_requested',
// //     });
// //   }

// //   return comparisons;
// // }

// // module.exports = { extractQuoteFromFile, validateQuoteFile, generateRecommendation, extractInvoice, compareQuoteToRequestedItems };











// const Tesseract = require('tesseract.js');
// const fs = require('fs');
// const path = require('path');
// const { AiExtraction, AiRecommendation, Quote, QuoteItem, VendorScore, Vendor } = require('../models');

// // Hybrid extraction: when imageBase64 is supplied, the prompt is sent
// // alongside the actual page image (not just the OCR'd text) using the
// // model's vision input. This is what lets extraction hold up on messy
// // scans, skewed photos, low-contrast faxes, and handwriting that Tesseract
// // mangles into garbled text — the model can look at the picture itself
// // instead of trusting OCR's guess. OCR text is still generated first and
// // included in the prompt as a second reference source (see
// // extractQuoteFromFile/extractInvoice), so the model effectively
// // cross-checks one against the other. gpt-4o-mini (the default model) has
// // native vision support, so no model change is required for this to work —
// // it only activates when an image is actually passed in.
// const callLLM = async (prompt, { maxTokens = 8000, retries = 2, imageBase64 = null, imageMimeType = null } = {}) => {
//   const apiKey = process.env.LLM_API_KEY;
//   const model = process.env.LLM_MODEL || 'gpt-4o-mini';
//   // Defaults to OpenAI's own endpoint, but any OpenAI-compatible provider
//   // works by just setting LLM_API_BASE_URL — e.g. Google Gemini's free-tier
//   // compatibility endpoint (https://generativelanguage.googleapis.com/v1beta/openai),
//   // which supports the same chat/completions shape including vision and
//   // JSON response format, no code change required to switch.
//   const baseUrl = (process.env.LLM_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
//   if (!apiKey) {
//     console.warn('LLM_API_KEY not set — returning mock extraction');
//     return { content: JSON.stringify({ items: [], vendor_name: '', payment_terms: '', delivery_time_days: 7, confidence_overall: 0 }), mock: true };
//   }

//   const content = imageBase64
//     ? [
//         { type: 'text', text: prompt },
//         { type: 'image_url', image_url: { url: `data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}`, detail: 'high' } },
//       ]
//     : prompt;

//   let lastErr;
//   for (let attempt = 0; attempt <= retries; attempt++) {
//     let res;
//     try {
//       res = await fetch(`${baseUrl}/chat/completions`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
//         body: JSON.stringify({
//           model,
//           temperature: 0,
//           max_tokens: maxTokens, // without this a long multi-item quote can get cut off mid-JSON and fail to parse
//           messages: [{ role: 'user', content }],
//           response_format: { type: 'json_object' },
//         }),
//       });
//     } catch (networkErr) {
//       // fetch() itself threw (DNS hiccup, connection reset, timeout) — transient, worth a retry.
//       lastErr = new Error(`LLM API network error: ${networkErr.message}`);
//       if (attempt < retries) { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); continue; }
//       throw lastErr;
//     }

//     if (!res.ok) {
//       const body = await res.text().catch(() => '');
//       // insufficient_quota specifically means the account has no billing/credits
//       // configured — retrying will never succeed, so fail fast with a clear
//       // message instead of burning 2 more attempts and 1-1.5s of retry delay
//       // on every single extraction until someone fixes the account.
//       const isQuotaError = res.status === 429 && /insufficient_quota/i.test(body);
//       // Providers (Gemini especially) deprecate/retire specific model names every
//       // few months — a 404 "model ... is no longer available" is a config problem
//       // (wrong/stale LLM_MODEL), not a transient failure, and won't fix itself.
//       const isModelGoneError = res.status === 404 && /no longer available|not found|does not exist/i.test(body);
//       lastErr = new Error(
//         isQuotaError
//           ? `LLM API account has no billing/credits configured (insufficient_quota) — this will not succeed on retry. Add billing at your provider's dashboard, or switch LLM_API_BASE_URL/LLM_API_KEY/LLM_MODEL to a provider with a free tier (e.g. Google Gemini).`
//           : isModelGoneError
//           ? `LLM_MODEL "${model}" is not available on this provider/account (HTTP 404) — model names get deprecated/retired frequently, especially on Gemini's free tier. Check your provider's current model list and update LLM_MODEL. Raw error: ${body.slice(0, 300)}`
//           : `LLM API error: ${res.status}${body ? ` — ${body.slice(0, 300)}` : ''}`
//       );
//       // 429 (genuine rate limiting, not quota) and 5xx (provider having issues) are
//       // transient and worth retrying. insufficient_quota, a gone/renamed model, and
//       // anything else (401 bad key, 400 bad request, etc.) will not succeed on retry.
//       if (res.status === 429 && !isQuotaError && attempt < retries) { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); continue; }
//       if (res.status >= 500 && attempt < retries) { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); continue; }
//       throw lastErr;
//     }

//     const data = await res.json();
//     const choice = data.choices[0];
//     if (choice.finish_reason === 'length') {
//       console.warn('LLM response was truncated (hit max_tokens) — extraction may be incomplete');
//     }
//     return { content: choice.message.content, mock: false, truncated: choice.finish_reason === 'length' };
//   }
//   throw lastErr;
// };

// // Best-effort recovery for LLM responses that aren't clean JSON (e.g. wrapped in
// // markdown fences, or with stray text before/after). Returns null if unrecoverable.
// function tryParseJson(raw) {
//   try { return JSON.parse(raw); } catch {}
//   const stripped = raw.replace(/```json|```/g, '').trim();
//   try { return JSON.parse(stripped); } catch {}
//   const start = stripped.indexOf('{');
//   const end = stripped.lastIndexOf('}');
//   if (start !== -1 && end !== -1 && end > start) {
//     try { return JSON.parse(stripped.slice(start, end + 1)); } catch {}
//   }
//   return null;
// }

// // Shared helper for every call site that hits an unparseable LLM response.
// // Logs the raw text (truncated to a sane length so logs don't explode on huge
// // responses) along with context about which extraction path and file this was,
// // so a failure is debuggable from the server logs instead of a black box.
// function logUnparseableResponse(context, rawResponse, { truncated = false, mock = false } = {}) {
//   const preview = typeof rawResponse === 'string' ? rawResponse.slice(0, 4000) : String(rawResponse);
//   console.error(
//     `[${context}] Unparseable LLM response (truncated=${truncated}, mock=${mock}). Raw response follows:\n${preview}`
//   );
// }

// const EXTRACTION_PROMPT = (rawText, hasImage) => `
// You are a procurement data extraction assistant.
// Extract structured data from this vendor quote document.
// ${hasImage
//   ? 'You have BOTH the OCR-extracted text below AND the original document image attached. The OCR text can contain errors (misread digits, merged columns, garbled handwriting) — use the image as the primary source of truth and only fall back to the OCR text where the image is unreadable. Pay special attention to tabular line-item layouts and any handwritten quantities, prices, or annotations.'
//   : 'Only OCR-extracted text is available for this file (no image was provided).'}
// Look specifically for: item table rows (name, quantity, unit price, line total), tax/GST, freight/shipping, discounts, payment terms, delivery/lead time, quote validity date, any reference/quotation number, and vendor identification details. Numbers may use Indian numbering (₹, lakhs/commas) — normalize to plain numbers.
// Return ONLY valid JSON with this exact shape:
// {
//   "vendor_name": "string",
//   "payment_terms": "string",
//   "delivery_time_days": number or null,
//   "validity_date": "YYYY-MM-DD or null",
//   "items": [
//     {
//       "item_name_raw": "string",
//       "item_code_raw": "string or null",
//       "quantity": number,
//       "unit_price": number,
//       "total_price": number,
//       "tax": number or 0,
//       "freight": number or 0,
//       "discount": number or 0,
//       "warranty": "string or null",
//       "availability": "string or null",
//       "confidence_score": 0.0 to 1.0
//     }
//   ],
//   "confidence_overall": 0.0 to 1.0,
//   "notes": "any other relevant info — include any reference/quotation number and vendor contact details found here since there is no dedicated field for them"
// }
// If a field is unclear (including because handwriting or scan quality made it illegible) set it to null and lower confidence_score — never guess a number you cannot actually read.
// OCR text:
// ---
// ${rawText}
// ---
// `;

// // Loads the uploaded file's bytes regardless of where it lives: a local disk path (dev /
// // no-S3 fallback) or an https:// URL (S3 / S3-compatible storage). Using a buffer
// // throughout means the same extraction code works for both storage backends.
// async function loadFileBuffer(filePathOrUrl) {
//   if (/^https?:\/\//i.test(filePathOrUrl)) {
//     const res = await fetch(filePathOrUrl);
//     if (!res.ok) throw new Error(`Could not download the source file from storage (HTTP ${res.status}). It may have been removed.`);
//     return Buffer.from(await res.arrayBuffer());
//   }
//   // Quotes and invoices now store their servable URL (e.g. "/files/procureai-uploads/xyz.pdf"),
//   // the path our own server exposes via `app.use('/files', express.static('/tmp'))`.
//   // Resolve that back to the real on-disk path before reading it directly —
//   // re-extraction/re-processing doesn't go through HTTP.
//   let diskPath = filePathOrUrl;
//   if (filePathOrUrl.startsWith('/files/')) {
//     diskPath = path.join('/tmp', filePathOrUrl.slice('/files/'.length));
//   }
//   try {
//     return fs.readFileSync(diskPath);
//   } catch (e) {
//     if (e.code === 'ENOENT') {
//       // The file lived only on local disk and is gone — most likely a server restart/redeploy
//       // wiped it (local disk here is ephemeral). Re-extract cannot recover this; the caller
//       // needs a fresh file. Give an actionable message instead of a raw stack-style error.
//       throw new Error('The originally uploaded file is no longer available on the server (it may have been lost in a restart). Please ask the vendor to resubmit the quote file, or enter the values manually below.');
//     }
//     throw e;
//   }
// }

// // Runs OCR with a page-segmentation mode tuned for line-item documents
// // (PSM 6 — "assume a single uniform block of text", which handles
// // tables/columns of items noticeably better than Tesseract's PSM 3 default
// // meant for general mixed-layout pages). If that first pass comes back
// // mostly empty (a photographed/skewed/low-contrast page can confuse PSM 6),
// // it retries once with PSM 3 before giving up — a cheap way to meaningfully
// // improve success rate on messy real-world scans without adding a new
// // dependency. Handwriting recognition is a genuine limitation of Tesseract
// // (an LSTM engine trained overwhelmingly on printed text) — the two-pass OCR
// // here is combined with sending the raw image itself to the vision-capable
// // LLM (see callLLM's imageBase64 option) as the actual mechanism that lets
// // handwritten/messy documents extract at all, since the model can read the
// // picture directly instead of relying solely on Tesseract's text guess.
// async function runOcr(buffer) {
//   const tryPsm = async (psm) => {
//     const worker = await Tesseract.createWorker('eng', undefined, { logger: () => {} });
//     try {
//       await worker.setParameters({ tessedit_pageseg_mode: psm });
//       const { data: { text } } = await worker.recognize(buffer);
//       return text || '';
//     } finally {
//       await worker.terminate();
//     }
//   };

//   try {
//     const first = await tryPsm('6');
//     if (first && first.trim().length > 20) return first;
//     const second = await tryPsm('3');
//     return (second && second.trim().length > (first || '').trim().length) ? second : first;
//   } catch (e) {
//     console.warn('[OCR] recognition failed:', e.message);
//     return '';
//   }
// }

// // Extracts the embedded text layer from a PDF using pdfjs-dist — NOT OCR.
// // This only works for PDFs that have real text content (the overwhelming
// // majority of vendor quotes/invoices: anything from accounting software,
// // Word/Excel/Google Docs exports, or a quotation template). For a genuinely
// // scanned/photographed PDF with no text layer, this correctly returns an
// // empty string rather than attempting anything risky — see the comment on
// // extractTextFromBuffer's PDF branch for why we do not fall back to OCR here.
// async function extractPdfText(buffer) {
//   // pdfjs-dist v4 ships ESM-only; dynamic import() is the standard, fully
//   // supported way to load an ESM package from CommonJS in Node 20.
//   const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
//   const doc = await pdfjsLib.getDocument({
//     data: new Uint8Array(buffer),
//     // Disable everything that isn't needed for plain text extraction —
//     // keeps this to a small, predictable code path with no rendering,
//     // no font-fetching, no canvas involvement at all.
//     useSystemFonts: false,
//     disableFontFace: true,
//     isEvalSupported: false,
//     // pdfjs logs its own warnings straight to console (missing standard font
//     // files, DOMMatrix/Path2D polyfill notices) even though none of that
//     // affects text extraction — verbosity: 0 silences those without touching
//     // our own error handling/logging above.
//     verbosity: 0,
//   }).promise;

//   let text = '';
//   const maxPages = Math.min(doc.numPages, 30); // sane cap for a quote/invoice document
//   for (let i = 1; i <= maxPages; i++) {
//     const page = await doc.getPage(i);
//     const content = await page.getTextContent();
//     text += content.items.map((it) => it.str).join(' ') + '\n';
//   }
//   return text;
// }

// // Reads text from a Buffer — never touches disk, works for all file types
// async function extractTextFromBuffer(buffer, mimetype, originalname) {
//   const ext = path.extname(originalname || '').toLowerCase();

//   if (['image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/bmp', 'image/gif'].includes(mimetype) ||
//       ['.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.gif'].includes(ext)) {
//     return await runOcr(buffer);
//   }

//   if (mimetype === 'application/pdf' || ext === '.pdf') {
//     // IMPORTANT: PDFs must NEVER be passed to Tesseract/runOcr. Tesseract's
//     // underlying image library (Leptonica) cannot decode the PDF container
//     // format at all, and critically, when that decode fails it does not
//     // reliably surface as a catchable promise rejection — it has crashed
//     // the entire Node process in production (every user, not just this
//     // request) rather than failing just this one upload. There is no
//     // try/catch that can safely guard against that failure mode, so the
//     // only safe fix is to never make that call in the first place.
//     try {
//       const text = await extractPdfText(buffer);
//       if (text && text.trim().length > 20) return text;
//       // Text layer was empty/near-empty — this is very likely a scanned or
//       // photographed PDF with no real text content. We deliberately do NOT
//       // attempt OCR on it (see above). Surfacing this clearly to the vendor/
//       // buyer as "please re-upload as a photo" is far better than a silent
//       // near-empty extraction or, worse, a server crash.
//       return '';
//     } catch (e) {
//       console.warn('[PDF] text-layer extraction failed:', e.message);
//       return '';
//     }
//   }

//   if (['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
//        'application/vnd.ms-excel'].includes(mimetype) ||
//       ['.xlsx', '.xls'].includes(ext)) {
//     const XLSX = require('xlsx');
//     let wb;
//     try {
//       wb = XLSX.read(buffer, { type: 'buffer' }); // reads from buffer, no disk path
//     } catch (e) {
//       throw new Error(`Could not read Excel file — may be corrupted or password-protected (${e.message})`);
//     }
//     if (!wb.SheetNames.length) throw new Error('Excel file has no sheets.');
//     return wb.SheetNames.map((n) => {
//       const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false });
//       return `Sheet: ${n}\n` +
//         csv.split('\n').filter((l) => l.replace(/,/g, '').trim().length > 0).join('\n');
//     }).join('\n\n');
//   }

//   if (['text/csv', 'text/plain'].includes(mimetype) || ['.csv', '.txt'].includes(ext)) {
//     return buffer.toString('utf8');
//   }

//   const fallback = buffer.toString('utf8');
//   if (fallback.trim().length > 5) return fallback;
//   throw new Error('Cannot extract text from this file type. Upload PDF, image, Excel, or CSV.');
// }

// async function extractQuoteFromFile(quoteId, fileSource, mimetypeHint, originalNameHint) {
//   const quote = await Quote.findByPk(quoteId);
//   if (!quote) throw new Error('Quote not found');
//   await quote.update({ extraction_status: 'processing' });
//   try {
//     let buffer;
//     let mimetype = mimetypeHint || '';
//     let originalname = originalNameHint || quote.source_file_url || 'file';
//     if (Buffer.isBuffer(fileSource)) {
//       buffer = fileSource;
//     } else {
//       // Fallback for re-extract from old URL/path
//       buffer = await loadFileBuffer(fileSource);
//       if (!mimetype) {
//         const ext = path.extname((fileSource || '').split('?')[0]).toLowerCase();
//         const m = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
//           '.png': 'image/png', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
//           '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv' };
//         mimetype = m[ext] || '';
//       }
//     }
//     const isImage = /^image\//.test(mimetype);
//     const rawText = await extractTextFromBuffer(buffer, mimetype, originalname);
//     // For images, an unreadable OCR pass isn't fatal — the LLM can still read
//     // the picture directly (hybrid path below), so only bail out here for
//     // non-image files where there's no image fallback to lean on.
//     if (!isImage && (!rawText || !rawText.trim())) {
//       // Nothing readable came out of the file itself (corrupt/blank/unsupported format) —
//       // there's no point calling the LLM on empty input.
//       await quote.update({ extraction_status: 'needs_review', extraction_note: 'Could not read any text from this file. If this is a scanned or photographed PDF (no selectable text), please upload it as a JPG/PNG photo instead — PDF image-scanning is not supported, only PDFs with real embedded text. Otherwise, enter the quote manually below.' });
//       return null;
//     }

//     const { content: llmResponse, mock, truncated } = await callLLM(
//       EXTRACTION_PROMPT(rawText || '(OCR produced no readable text — read directly from the attached image)', isImage),
//       isImage ? { imageBase64: buffer.toString('base64'), imageMimeType: mimetype } : {}
//     );
//     const structured = tryParseJson(llmResponse);

//     if (!structured) {
//       logUnparseableResponse('extractQuoteFromFile', llmResponse, { truncated, mock });
//       // Keep the raw response for debugging instead of losing it - this is the difference
//       // between "silently 0 items" and being able to see exactly what the LLM returned.
//       await AiExtraction.create({
//         company_id: quote.company_id, source_table: 'quote', source_id: quote.id,
//         raw_text: rawText, structured_json: { raw_llm_response: llmResponse },
//         model_used: process.env.LLM_MODEL || 'gpt-4o-mini', confidence_overall: 0,
//       });
//       await quote.update({
//         extraction_status: 'failed',
//         extraction_note: truncated
//           ? 'AI response was cut off before finishing (too many items for one pass) and could not be parsed. Click Re-extract, or enter the quote manually.'
//           : 'AI response could not be parsed as JSON. Click Re-extract, or enter the quote manually.',
//       });
//       return null;
//     }

//     // No LLM_API_KEY configured — make this visible on the quote instead of looking like
//     // a successful extraction that just happened to find zero items.
//     if (mock) {
//       await quote.update({ extraction_status: 'needs_review', extraction_note: 'AI extraction is not configured (LLM_API_KEY missing) — please enter this quote\'s items manually.' });
//       return structured;
//     }

//     // Store extraction record
//     await AiExtraction.create({
//       company_id: quote.company_id,
//       source_table: 'quote',
//       source_id: quote.id,
//       raw_text: rawText,
//       structured_json: structured,
//       model_used: process.env.LLM_MODEL || 'gpt-4o-mini',
//       confidence_overall: structured.confidence_overall || 0,
//     });

//     // Create QuoteItems from extraction
//     if (structured.items?.length) {
//       await QuoteItem.bulkCreate(structured.items.map((i) => ({
//         quote_id: quote.id,
//         item_name_raw: i.item_name_raw,
//         item_code_raw: i.item_code_raw,
//         quantity: i.quantity || 0,
//         unit_price: i.unit_price || 0,
//         total_price: i.total_price || (i.quantity * i.unit_price) || 0,
//         tax: i.tax || 0,
//         freight: i.freight || 0,
//         discount: i.discount || 0,
//         warranty: i.warranty,
//         availability: i.availability,
//         notes: i.notes,
//         confidence_score: i.confidence_score || 0.5,
//       })));
//     }

//     const total = (structured.items || []).reduce((s, i) => s + (i.total_price || 0), 0);
//     const needsReview = (structured.confidence_overall || 0) < 0.75 || !structured.items?.length || truncated;
//     let note = null;
//     if (truncated) note = 'AI response was cut off before finishing (too many items for one pass) — some items may be missing. Click Re-extract or add missing rows manually.';
//     else if (!structured.items?.length) note = 'AI could not find any line items in this file. Please check the file or enter items manually.';

//     await quote.update({
//       payment_terms: structured.payment_terms || quote.payment_terms,
//       delivery_time_days: structured.delivery_time_days || quote.delivery_time_days,
//       validity_date: structured.validity_date || quote.validity_date,
//       total_amount: total,
//       ai_confidence: structured.confidence_overall,
//       extraction_status: needsReview ? 'needs_review' : 'done',
//       extraction_note: note,
//     });

//     return structured;
//   } catch (err) {
//     await quote.update({ extraction_status: 'failed', extraction_note: err.message });
//     throw err;
//   }
// }

// async function generateRecommendation(rfqId, companyId) {
//   const quotes = await Quote.findAll({
//     where: { company_id: companyId, extraction_status: 'done', status: 'submitted' },
//     include: [
//       { model: require('../models').RfqVendor, where: { rfq_id: rfqId } },
//       { model: QuoteItem, as: 'items' },
//       { model: Vendor },
//     ],
//   });

//   if (!quotes.length) throw Object.assign(new Error('No processed quotes found'), { status: 400 });

//   // Score each quote: price (40%), delivery (25%), vendor score (25%), payment terms (10%)
//   const maxPrice = Math.max(...quotes.map((q) => parseFloat(q.total_amount) || Infinity));
//   const maxDelivery = Math.max(...quotes.map((q) => q.delivery_time_days || 30));

//   const scored = await Promise.all(quotes.map(async (q) => {
//     const vendorScore = await VendorScore.findOne({ where: { vendor_id: q.vendor_id, company_id: companyId }, order: [['period', 'DESC']] });
//     const priceScore = maxPrice > 0 ? (1 - parseFloat(q.total_amount) / maxPrice) : 0.5;
//     const deliveryScore = maxDelivery > 0 ? (1 - (q.delivery_time_days || 14) / maxDelivery) : 0.5;
//     const reliabilityScore = vendorScore ? parseFloat(vendorScore.overall_score) / 10 : 0.5;
//     const paymentScore = q.payment_terms?.toLowerCase().includes('30') ? 1 : 0.5;
//     const total = (priceScore * 0.4) + (deliveryScore * 0.25) + (reliabilityScore * 0.25) + (paymentScore * 0.1);
//     return { quote: q, total, priceScore, deliveryScore, reliabilityScore, paymentScore };
//   }));

//   scored.sort((a, b) => b.total - a.total);
//   const best = scored[0];
//   const lowestPrice = Math.min(...quotes.map((q) => parseFloat(q.total_amount) || Infinity));
//   const savingsVsAvg = (quotes.reduce((s, q) => s + parseFloat(q.total_amount || 0), 0) / quotes.length) - parseFloat(best.quote.total_amount);

//   const reasoningPrompt = `
// You are a procurement AI advisor. Explain in 2-3 plain English sentences why this vendor was recommended.
// Data: Vendor "${best.quote.Vendor?.name}", price ₹${best.quote.total_amount}, delivery in ${best.quote.delivery_time_days} days,
// payment terms "${best.quote.payment_terms}", reliability score ${best.reliabilityScore.toFixed(2)}/1.0.
// Compared to ${quotes.length} other quotes. Be specific and concise. No marketing language.
// `;
//   let reasoning = '';
//   try { reasoning = (await callLLM(reasoningPrompt, { maxTokens: 400 })).content; } catch { reasoning = `${best.quote.Vendor?.name} offers the best combination of competitive pricing and reliable delivery.`; }

//   // Mark recommended
//   await Quote.update({ ai_recommended: false }, { where: { company_id: companyId } });
//   await best.quote.update({ ai_recommended: true, ai_confidence: best.total });

//   const rec = await AiRecommendation.create({
//     company_id: companyId,
//     rfq_id: rfqId,
//     recommended_quote_id: best.quote.id,
//     reasoning_text: typeof reasoning === 'string' ? reasoning.replace(/```json|```/g, '').trim() : reasoning,
//     score_breakdown: { price: best.priceScore, delivery: best.deliveryScore, reliability: best.reliabilityScore, payment: best.paymentScore },
//     savings_estimate: savingsVsAvg > 0 ? savingsVsAvg : 0,
//     confidence: best.total,
//   });

//   return rec;
// }

// // Normalize an item name for fuzzy matching: lowercase, strip punctuation/units noise, collapse whitespace.
// function normalizeItemName(name) {
//   return (name || '')
//     .toLowerCase()
//     .replace(/[^a-z0-9]+/g, ' ')
//     .trim();
// }

// // Best-effort link between an AI-extracted invoice line and the PO's line items.
// // Exact normalized match first, then containment either direction, else null (unmatched).
// function matchPoItem(rawName, poItems) {
//   const target = normalizeItemName(rawName);
//   if (!target) return null;
//   let best = null;
//   for (const poItem of poItems) {
//     const candidate = normalizeItemName(poItem.item_name);
//     if (!candidate) continue;
//     if (candidate === target) return poItem; // exact match — stop immediately
//     if (!best && (candidate.includes(target) || target.includes(candidate))) best = poItem;
//   }
//   return best;
// }

// async function extractInvoice(invoiceId, filePath, mimetype, originalname) {
//   const { Invoice, InvoiceItem, PoItem } = require('../models');
//   const invoice = await Invoice.findByPk(invoiceId);
//   if (!invoice) throw new Error('Invoice not found');

//   const buffer = await loadFileBuffer(filePath);
//   const isImage = /^image\//.test(mimetype || '');
//   const rawText = await extractTextFromBuffer(buffer, mimetype, originalname || filePath);
//   // Same reasoning as extractQuoteFromFile: for images the LLM's vision pass
//   // can still succeed even when OCR text comes back empty/garbled, so only
//   // treat "no readable text" as fatal when there's no image to fall back to.
//   if (!isImage && (!rawText || rawText.trim().length < 10)) {
//     throw new Error('Could not read any text from this invoice file. If this is a scanned or photographed PDF, please upload it as a JPG/PNG photo instead — PDF image-scanning is not supported, only PDFs with real embedded text. Otherwise, enter the values manually.');
//   }

//   const prompt = `Extract invoice data from this document.
// ${isImage
//   ? 'Both OCR text (below) and the original invoice image are attached. Treat the image as the primary source of truth — OCR text can misread digits, merge table columns, or mangle handwritten entries — and only rely on the OCR text where the image itself is unreadable.'
//   : 'Only OCR-extracted text is available (no image was provided).'}
// Look for the item table (name, quantity, unit price, line total), tax/GST, freight/shipping, discounts, the invoice number, invoice date, vendor name, and any PO/reference number mentioned. Numbers may use Indian numbering (₹, lakhs/commas) — normalize to plain numbers.
// Return ONLY valid JSON: { vendor_name, invoice_number, invoice_date (YYYY-MM-DD), total_amount, items: [{item_name_raw, quantity, unit_price, total_price, tax, freight, discount, confidence_score}], confidence_overall }.
// Set tax, freight, and discount to 0 if the document doesn't mention them for a line. If a value is illegible (including due to handwriting or scan quality), set it to null rather than guessing, and lower confidence_score.
// OCR text:
// ${rawText || '(OCR produced no readable text — read directly from the attached image)'}`;
//   const { content, mock, truncated } = await callLLM(
//     prompt,
//     isImage ? { imageBase64: buffer.toString('base64'), imageMimeType: mimetype } : {}
//   );
//   const structured = tryParseJson(content);
//   if (!structured) {
//     logUnparseableResponse('extractInvoice', content, { truncated, mock });
//     await invoice.update({
//       mismatch_reason: truncated
//         ? 'AI response was cut off before finishing (invoice may have too many line items for one pass) and could not be parsed — please review this invoice manually.'
//         : 'AI response could not be parsed as JSON — please review this invoice manually.',
//     });
//     throw new Error('AI response could not be parsed as JSON');
//   }

//   // No LLM_API_KEY configured — make this visible instead of silently showing ₹0/no items
//   if (mock) {
//     await invoice.update({ mismatch_reason: 'AI extraction is not configured (LLM_API_KEY missing) — please enter this invoice\'s values manually.' });
//     return structured;
//   }
//   await AiExtraction.create({ company_id: invoice.company_id, source_table: 'invoice', source_id: invoice.id, raw_text: rawText, structured_json: structured, model_used: process.env.LLM_MODEL || 'gpt-4o-mini', confidence_overall: structured.confidence_overall });

//   if (structured.items?.length) {
//     // Pull the PO's line items (if this invoice is linked to a PO) so we can attach
//     // po_item_id to each extracted line — required for 3-way quantity matching to work at all.
//     const poItems = invoice.purchase_order_id
//       ? await PoItem.findAll({ where: { purchase_order_id: invoice.purchase_order_id } })
//       : [];

//     await InvoiceItem.bulkCreate(structured.items.map((i) => {
//       const matched = poItems.length ? matchPoItem(i.item_name_raw, poItems) : null;
//       return {
//         invoice_id: invoice.id,
//         po_item_id: matched ? matched.id : null,
//         item_name_raw: i.item_name_raw,
//         quantity: i.quantity,
//         unit_price: i.unit_price,
//         total_price: i.total_price,
//         tax: i.tax || 0,
//         freight: i.freight || 0,
//         discount: i.discount || 0,
//         confidence_score: i.confidence_score,
//       };
//     }));
//   }
//   // The LLM's top-level total_amount is sometimes missing/unreliable even when it
//   // correctly extracted line items (multi-page invoices, odd layouts). Fall back to
//   // summing the extracted item totals — same approach already used for quotes —
//   // instead of falling back to invoice.total_amount, which is never set at upload
//   // time and so previously left the invoice showing ₹0.
//   const itemsTotal = (structured.items || []).reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
//   const resolvedTotal = parseFloat(structured.total_amount) || itemsTotal || parseFloat(invoice.total_amount) || 0;
//   await invoice.update({ invoice_number: structured.invoice_number || invoice.invoice_number, invoice_date: structured.invoice_date || invoice.invoice_date, total_amount: resolvedTotal });
//   return structured;
// }

// // Pre-validation: extract from buffer WITHOUT writing to DB.
// // Vendor uploads file → we extract → return items for frontend preview → vendor confirms → submit.
// async function validateQuoteFile(buffer, mimetype, originalname) {
//   const isImage = /^image\//.test(mimetype || '');
//   const rawText = await extractTextFromBuffer(buffer, mimetype, originalname);
//   if (!isImage && (!rawText || rawText.trim().length < 10)) {
//     throw new Error('Could not read any text from this file. If this is a scanned or photographed PDF, please upload it as a JPG/PNG photo instead — PDF image-scanning is not supported, only PDFs with real embedded text. Otherwise, enter manually.');
//   }
//   const { content, mock, truncated } = await callLLM(
//     EXTRACTION_PROMPT(rawText || '(OCR produced no readable text — read directly from the attached image)', isImage),
//     { maxTokens: 8000, ...(isImage ? { imageBase64: buffer.toString('base64'), imageMimeType: mimetype } : {}) }
//   );
//   const structured = tryParseJson(content);
//   if (!structured) {
//     // This is the exact spot that was previously throwing with no visibility into why.
//     // Now the raw LLM response is logged server-side, and the message tells the user
//     // (and you, reading the logs) whether it was a truncation or a genuine parse failure.
//     logUnparseableResponse('validateQuoteFile', content, { truncated, mock });
//     throw new Error(
//       truncated
//         ? 'AI response was cut off before finishing (this file may have too many line items for one pass). Please try again, or enter your quote manually.'
//         : 'AI could not parse the file contents. Please enter your quote manually.'
//     );
//   }
//   return {
//     success: true,
//     vendor_name: structured.vendor_name || null,
//     payment_terms: structured.payment_terms || null,
//     delivery_time_days: structured.delivery_time_days || null,
//     validity_date: structured.validity_date || null,
//     confidence_overall: structured.confidence_overall || 0,
//     items: (structured.items || []).map((i) => ({
//       item_name_raw: i.item_name_raw || '',
//       item_code_raw: i.item_code_raw || '',
//       quantity: i.quantity || 0,
//       unit_price: i.unit_price || 0,
//       total_price: i.total_price || ((i.quantity || 0) * (i.unit_price || 0)),
//       tax: i.tax || 0,
//       freight: i.freight || 0,
//       discount: i.discount || 0,
//       warranty: i.warranty || '',
//       confidence_score: i.confidence_score || 0.5,
//     })),
//     notes: structured.notes || null,
//     mock,
//     truncated,
//   };
// }
// // Diff a vendor's quoted line items against what the buyer's purchase request
// // actually asked for. Reuses the same name-normalization/fuzzy-match approach
// // already used for invoice-to-PO line matching (normalizeItemName/matchPoItem).
// // requestedItems is PurchaseRequestItem rows (optionally with an included Item).
// function compareQuoteToRequestedItems(quoteItems = [], requestedItems = []) {
//   const requested = requestedItems.map((ri) => ({
//     id: ri.id,
//     name: ri.Item?.name || ri.item_name_freetext || 'Unknown item',
//     quantity: parseFloat(ri.quantity) || 0,
//     estimated_unit_price: ri.estimated_unit_price != null ? parseFloat(ri.estimated_unit_price) : null,
//   }));

//   const usedQuoteItemIds = new Set();
//   const comparisons = requested.map((req) => {
//     const target = normalizeItemName(req.name);
//     let matched = null;
//     for (const qi of quoteItems) {
//       if (usedQuoteItemIds.has(qi.id)) continue;
//       const candidate = normalizeItemName(qi.item_name_raw);
//       if (!candidate) continue;
//       if (candidate === target) { matched = qi; break; }
//       if (!matched && (candidate.includes(target) || target.includes(candidate))) matched = qi;
//     }

//     if (!matched) {
//       return {
//         item_name: req.name, requested_quantity: req.quantity, quoted_quantity: null,
//         unit_price: null, total_price: null, estimated_unit_price: req.estimated_unit_price,
//         status: 'not_quoted',
//       };
//     }

//     usedQuoteItemIds.add(matched.id);
//     const quotedQty = parseFloat(matched.quantity) || 0;
//     const unitPrice = parseFloat(matched.unit_price) || 0;
//     const qtyMismatch = Math.abs(quotedQty - req.quantity) > 0.001;
//     // Flag if the vendor's unit price is more than 15% away from the buyer's own estimate.
//     const priceMismatch = req.estimated_unit_price != null && req.estimated_unit_price > 0 &&
//       Math.abs(unitPrice - req.estimated_unit_price) / req.estimated_unit_price > 0.15;

//     let status = 'matched';
//     if (qtyMismatch && priceMismatch) status = 'quantity_and_price_mismatch';
//     else if (qtyMismatch) status = 'quantity_mismatch';
//     else if (priceMismatch) status = 'price_mismatch';

//     return {
//       item_name: req.name, requested_quantity: req.quantity, quoted_quantity: quotedQty,
//       unit_price: unitPrice, total_price: parseFloat(matched.total_price) || 0,
//       estimated_unit_price: req.estimated_unit_price, status,
//     };
//   });

//   // Anything the vendor quoted that the buyer never asked for.
//   for (const qi of quoteItems) {
//     if (usedQuoteItemIds.has(qi.id)) continue;
//     comparisons.push({
//       item_name: qi.item_name_raw, requested_quantity: null, quoted_quantity: parseFloat(qi.quantity) || 0,
//       unit_price: parseFloat(qi.unit_price) || 0, total_price: parseFloat(qi.total_price) || 0,
//       estimated_unit_price: null, status: 'not_requested',
//     });
//   }

//   return comparisons;
// }

// module.exports = { extractQuoteFromFile, validateQuoteFile, generateRecommendation, extractInvoice, compareQuoteToRequestedItems };









const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const { AiExtraction, AiRecommendation, Quote, QuoteItem, VendorScore, Vendor } = require('../models');

// Hybrid extraction: when imageBase64 is supplied, the prompt is sent
// alongside the actual page image (not just the OCR'd text) using the
// model's vision input. This is what lets extraction hold up on messy
// scans, skewed photos, low-contrast faxes, and handwriting that Tesseract
// mangles into garbled text — the model can look at the picture itself
// instead of trusting OCR's guess. OCR text is still generated first and
// included in the prompt as a second reference source (see
// extractQuoteFromFile/extractInvoice), so the model effectively
// cross-checks one against the other. gpt-4o-mini (the default model) has
// native vision support, so no model change is required for this to work —
// it only activates when an image is actually passed in.
const callLLM = async (prompt, { maxTokens = 8000, retries = 2, imageBase64 = null, imageMimeType = null } = {}) => {
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  // Defaults to OpenAI's own endpoint, but any OpenAI-compatible provider
  // works by just setting LLM_API_BASE_URL — e.g. Google Gemini's free-tier
  // compatibility endpoint (https://generativelanguage.googleapis.com/v1beta/openai),
  // which supports the same chat/completions shape including vision and
  // JSON response format, no code change required to switch.
  const baseUrl = (process.env.LLM_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (!apiKey) {
    console.warn('LLM_API_KEY not set — returning mock extraction');
    return { content: JSON.stringify({ items: [], vendor_name: '', payment_terms: '', delivery_time_days: 7, confidence_overall: 0 }), mock: true };
  }

  const content = imageBase64
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}`, detail: 'high' } },
      ]
    : prompt;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: maxTokens, // without this a long multi-item quote can get cut off mid-JSON and fail to parse
          messages: [{ role: 'user', content }],
          response_format: { type: 'json_object' },
        }),
      });
    } catch (networkErr) {
      // fetch() itself threw (DNS hiccup, connection reset, timeout) — transient, worth a retry.
      lastErr = new Error(`LLM API network error: ${networkErr.message}`);
      if (attempt < retries) { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); continue; }
      throw lastErr;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // insufficient_quota specifically means the account has no billing/credits
      // configured — retrying will never succeed, so fail fast with a clear
      // message instead of burning 2 more attempts and 1-1.5s of retry delay
      // on every single extraction until someone fixes the account.
      const isQuotaError = res.status === 429 && /insufficient_quota/i.test(body);
      // Providers (Gemini especially) deprecate/retire specific model names every
      // few months — a 404 "model ... is no longer available" is a config problem
      // (wrong/stale LLM_MODEL), not a transient failure, and won't fix itself.
      const isModelGoneError = res.status === 404 && /no longer available|not found|does not exist/i.test(body);
      lastErr = new Error(
        isQuotaError
          ? `LLM API account has no billing/credits configured (insufficient_quota) — this will not succeed on retry. Add billing at your provider's dashboard, or switch LLM_API_BASE_URL/LLM_API_KEY/LLM_MODEL to a provider with a free tier (e.g. Google Gemini).`
          : isModelGoneError
          ? `LLM_MODEL "${model}" is not available on this provider/account (HTTP 404) — model names get deprecated/retired frequently, especially on Gemini's free tier. Check your provider's current model list and update LLM_MODEL. Raw error: ${body.slice(0, 300)}`
          : `LLM API error: ${res.status}${body ? ` — ${body.slice(0, 300)}` : ''}`
      );
      // 429 (genuine rate limiting, not quota) and 5xx (provider having issues) are
      // transient and worth retrying. insufficient_quota, a gone/renamed model, and
      // anything else (401 bad key, 400 bad request, etc.) will not succeed on retry.
      if (res.status === 429 && !isQuotaError && attempt < retries) { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); continue; }
      if (res.status >= 500 && attempt < retries) { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); continue; }
      throw lastErr;
    }

    const data = await res.json();
    const choice = data.choices[0];
    if (choice.finish_reason === 'length') {
      console.warn('LLM response was truncated (hit max_tokens) — extraction may be incomplete');
    }
    return { content: choice.message.content, mock: false, truncated: choice.finish_reason === 'length' };
  }
  throw lastErr;
};

// Best-effort recovery for LLM responses that aren't clean JSON (e.g. wrapped in
// markdown fences, or with stray text before/after). Returns null if unrecoverable.
function tryParseJson(raw) {
  try { return JSON.parse(raw); } catch {}
  const stripped = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(stripped.slice(start, end + 1)); } catch {}
  }
  return null;
}

// Shared helper for every call site that hits an unparseable LLM response.
// Logs the raw text (truncated to a sane length so logs don't explode on huge
// responses) along with context about which extraction path and file this was,
// so a failure is debuggable from the server logs instead of a black box.
function logUnparseableResponse(context, rawResponse, { truncated = false, mock = false } = {}) {
  const preview = typeof rawResponse === 'string' ? rawResponse.slice(0, 4000) : String(rawResponse);
  console.error(
    `[${context}] Unparseable LLM response (truncated=${truncated}, mock=${mock}). Raw response follows:\n${preview}`
  );
}

const EXTRACTION_PROMPT = (rawText, hasImage) => `
You are a procurement data extraction assistant.
Extract structured data from this vendor quote document.
${hasImage
  ? 'You have BOTH the OCR-extracted text below AND the original document image attached. The OCR text can contain errors (misread digits, merged columns, garbled handwriting) — use the image as the primary source of truth and only fall back to the OCR text where the image is unreadable. Pay special attention to tabular line-item layouts and any handwritten quantities, prices, or annotations.'
  : 'Only OCR-extracted text is available for this file (no image was provided).'}
Look specifically for: item table rows (name, quantity, unit price, line total), tax/GST, freight/shipping, discounts, payment terms, delivery/lead time, quote validity date, any reference/quotation number, and vendor identification details. Numbers may use Indian numbering (₹, lakhs/commas) — normalize to plain numbers.
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
  "notes": "any other relevant info — include any reference/quotation number and vendor contact details found here since there is no dedicated field for them"
}
If a field is unclear (including because handwriting or scan quality made it illegible) set it to null and lower confidence_score — never guess a number you cannot actually read.
OCR text:
---
${rawText}
---
`;

// Loads the uploaded file's bytes regardless of where it lives: a local disk path (dev /
// no-S3 fallback) or an https:// URL (S3 / S3-compatible storage). Using a buffer
// throughout means the same extraction code works for both storage backends.
async function loadFileBuffer(filePathOrUrl) {
  if (/^https?:\/\//i.test(filePathOrUrl)) {
    const res = await fetch(filePathOrUrl);
    if (!res.ok) throw new Error(`Could not download the source file from storage (HTTP ${res.status}). It may have been removed.`);
    return Buffer.from(await res.arrayBuffer());
  }
  // Quotes and invoices now store their servable URL (e.g. "/files/procureai-uploads/xyz.pdf"),
  // the path our own server exposes via `app.use('/files', express.static('/tmp'))`.
  // Resolve that back to the real on-disk path before reading it directly —
  // re-extraction/re-processing doesn't go through HTTP.
  let diskPath = filePathOrUrl;
  if (filePathOrUrl.startsWith('/files/')) {
    diskPath = path.join('/tmp', filePathOrUrl.slice('/files/'.length));
  }
  try {
    return fs.readFileSync(diskPath);
  } catch (e) {
    if (e.code === 'ENOENT') {
      // The file lived only on local disk and is gone — most likely a server restart/redeploy
      // wiped it (local disk here is ephemeral). Re-extract cannot recover this; the caller
      // needs a fresh file. Give an actionable message instead of a raw stack-style error.
      throw new Error('The originally uploaded file is no longer available on the server (it may have been lost in a restart). Please ask the vendor to resubmit the quote file, or enter the values manually below.');
    }
    throw e;
  }
}

// Runs OCR with a page-segmentation mode tuned for line-item documents
// (PSM 6 — "assume a single uniform block of text", which handles
// tables/columns of items noticeably better than Tesseract's PSM 3 default
// meant for general mixed-layout pages). If that first pass comes back
// mostly empty (a photographed/skewed/low-contrast page can confuse PSM 6),
// it retries once with PSM 3 before giving up — a cheap way to meaningfully
// improve success rate on messy real-world scans without adding a new
// dependency. Handwriting recognition is a genuine limitation of Tesseract
// (an LSTM engine trained overwhelmingly on printed text) — the two-pass OCR
// here is combined with sending the raw image itself to the vision-capable
// LLM (see callLLM's imageBase64 option) as the actual mechanism that lets
// handwritten/messy documents extract at all, since the model can read the
// picture directly instead of relying solely on Tesseract's text guess.
async function runOcr(buffer) {
  const tryPsm = async (psm) => {
    const worker = await Tesseract.createWorker('eng', undefined, { logger: () => {} });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      const { data: { text } } = await worker.recognize(buffer);
      return text || '';
    } finally {
      await worker.terminate();
    }
  };

  try {
    const first = await tryPsm('6');
    if (first && first.trim().length > 20) return first;
    const second = await tryPsm('3');
    return (second && second.trim().length > (first || '').trim().length) ? second : first;
  } catch (e) {
    console.warn('[OCR] recognition failed:', e.message);
    return '';
  }
}

// Extracts the embedded text layer from a PDF using pdfjs-dist — NOT OCR.
// This only works for PDFs that have real text content (the overwhelming
// majority of vendor quotes/invoices: anything from accounting software,
// Word/Excel/Google Docs exports, or a quotation template). For a genuinely
// scanned/photographed PDF with no text layer, this correctly returns an
// empty string rather than attempting anything risky — see the comment on
// extractTextFromBuffer's PDF branch for why we do not fall back to OCR here.
async function extractPdfText(buffer) {
  // pdfjs-dist v4 ships ESM-only; dynamic import() is the standard, fully
  // supported way to load an ESM package from CommonJS in Node 20.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    // Disable everything that isn't needed for plain text extraction —
    // keeps this to a small, predictable code path with no rendering,
    // no font-fetching, no canvas involvement at all.
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
    // pdfjs logs its own warnings straight to console (missing standard font
    // files, DOMMatrix/Path2D polyfill notices) even though none of that
    // affects text extraction — verbosity: 0 silences those without touching
    // our own error handling/logging above.
    verbosity: 0,
  }).promise;

  let text = '';
  const maxPages = Math.min(doc.numPages, 30); // sane cap for a quote/invoice document
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(' ') + '\n';
  }
  return text;
}

// Reads text from a Buffer — never touches disk, works for all file types
async function extractTextFromBuffer(buffer, mimetype, originalname) {
  const ext = path.extname(originalname || '').toLowerCase();

  if (['image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/bmp', 'image/gif'].includes(mimetype) ||
      ['.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.gif'].includes(ext)) {
    return await runOcr(buffer);
  }

  if (mimetype === 'application/pdf' || ext === '.pdf') {
    // IMPORTANT: PDFs must NEVER be passed to Tesseract/runOcr. Tesseract's
    // underlying image library (Leptonica) cannot decode the PDF container
    // format at all, and critically, when that decode fails it does not
    // reliably surface as a catchable promise rejection — it has crashed
    // the entire Node process in production (every user, not just this
    // request) rather than failing just this one upload. There is no
    // try/catch that can safely guard against that failure mode, so the
    // only safe fix is to never make that call in the first place.
    try {
      const text = await extractPdfText(buffer);
      if (text && text.trim().length > 20) return text;
      // Text layer was empty/near-empty — this is very likely a scanned or
      // photographed PDF with no real text content. We deliberately do NOT
      // attempt OCR on it (see above). Surfacing this clearly to the vendor/
      // buyer as "please re-upload as a photo" is far better than a silent
      // near-empty extraction or, worse, a server crash.
      return '';
    } catch (e) {
      console.warn('[PDF] text-layer extraction failed:', e.message);
      return '';
    }
  }

  if (['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-excel'].includes(mimetype) ||
      ['.xlsx', '.xls'].includes(ext)) {
    const XLSX = require('xlsx');
    let wb;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' }); // reads from buffer, no disk path
    } catch (e) {
      throw new Error(`Could not read Excel file — may be corrupted or password-protected (${e.message})`);
    }
    if (!wb.SheetNames.length) throw new Error('Excel file has no sheets.');
    return wb.SheetNames.map((n) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false });
      return `Sheet: ${n}\n` +
        csv.split('\n').filter((l) => l.replace(/,/g, '').trim().length > 0).join('\n');
    }).join('\n\n');
  }

  if (['text/csv', 'text/plain'].includes(mimetype) || ['.csv', '.txt'].includes(ext)) {
    return buffer.toString('utf8');
  }

  const fallback = buffer.toString('utf8');
  if (fallback.trim().length > 5) return fallback;
  throw new Error('Cannot extract text from this file type. Upload PDF, image, Excel, or CSV.');
}

async function extractQuoteFromFile(quoteId, fileSource, mimetypeHint, originalNameHint) {
  const quote = await Quote.findByPk(quoteId);
  if (!quote) throw new Error('Quote not found');
  await quote.update({ extraction_status: 'processing' });
  try {
    let buffer;
    let mimetype = mimetypeHint || '';
    let originalname = originalNameHint || quote.source_file_url || 'file';
    if (Buffer.isBuffer(fileSource)) {
      buffer = fileSource;
    } else {
      // Fallback for re-extract from old URL/path
      buffer = await loadFileBuffer(fileSource);
      if (!mimetype) {
        const ext = path.extname((fileSource || '').split('?')[0]).toLowerCase();
        const m = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.png': 'image/png', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv' };
        mimetype = m[ext] || '';
      }
    }
    const isImage = /^image\//.test(mimetype);
    const rawText = await extractTextFromBuffer(buffer, mimetype, originalname);
    // For images, an unreadable OCR pass isn't fatal — the LLM can still read
    // the picture directly (hybrid path below), so only bail out here for
    // non-image files where there's no image fallback to lean on.
    if (!isImage && (!rawText || !rawText.trim())) {
      // Nothing readable came out of the file itself (corrupt/blank/unsupported format) —
      // there's no point calling the LLM on empty input.
      await quote.update({ extraction_status: 'needs_review', extraction_note: 'Could not read any text from this file. If this is a scanned or photographed PDF (no selectable text), please upload it as a JPG/PNG photo instead — PDF image-scanning is not supported, only PDFs with real embedded text. Otherwise, enter the quote manually below.' });
      return null;
    }

    const { content: llmResponse, mock, truncated } = await callLLM(
      EXTRACTION_PROMPT(rawText || '(OCR produced no readable text — read directly from the attached image)', isImage),
      isImage ? { imageBase64: buffer.toString('base64'), imageMimeType: mimetype } : {}
    );
    const structured = tryParseJson(llmResponse);

    if (!structured) {
      logUnparseableResponse('extractQuoteFromFile', llmResponse, { truncated, mock });
      // Keep the raw response for debugging instead of losing it - this is the difference
      // between "silently 0 items" and being able to see exactly what the LLM returned.
      await AiExtraction.create({
        company_id: quote.company_id, source_table: 'quote', source_id: quote.id,
        raw_text: rawText, structured_json: { raw_llm_response: llmResponse },
        model_used: process.env.LLM_MODEL || 'gpt-4o-mini', confidence_overall: 0,
      });
      await quote.update({
        extraction_status: 'failed',
        extraction_note: truncated
          ? 'AI response was cut off before finishing (too many items for one pass) and could not be parsed. Click Re-extract, or enter the quote manually.'
          : 'AI response could not be parsed as JSON. Click Re-extract, or enter the quote manually.',
      });
      return null;
    }

    // No LLM_API_KEY configured — make this visible on the quote instead of looking like
    // a successful extraction that just happened to find zero items.
    if (mock) {
      await quote.update({ extraction_status: 'needs_review', extraction_note: 'AI extraction is not configured (LLM_API_KEY missing) — please enter this quote\'s items manually.' });
      return structured;
    }

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
    const needsReview = (structured.confidence_overall || 0) < 0.75 || !structured.items?.length || truncated;
    let note = null;
    if (truncated) note = 'AI response was cut off before finishing (too many items for one pass) — some items may be missing. Click Re-extract or add missing rows manually.';
    else if (!structured.items?.length) note = 'AI could not find any line items in this file. Please check the file or enter items manually.';

    await quote.update({
      payment_terms: structured.payment_terms || quote.payment_terms,
      delivery_time_days: structured.delivery_time_days || quote.delivery_time_days,
      validity_date: structured.validity_date || quote.validity_date,
      total_amount: total,
      ai_confidence: structured.confidence_overall,
      extraction_status: needsReview ? 'needs_review' : 'done',
      extraction_note: note,
    });

    return structured;
  } catch (err) {
    await quote.update({ extraction_status: 'failed', extraction_note: err.message });
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
  try { reasoning = (await callLLM(reasoningPrompt, { maxTokens: 400 })).content; } catch { reasoning = `${best.quote.Vendor?.name} offers the best combination of competitive pricing and reliable delivery.`; }

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

async function extractInvoice(invoiceId, filePath, mimetype, originalname) {
  const { Invoice, InvoiceItem, PoItem } = require('../models');
  const invoice = await Invoice.findByPk(invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  const buffer = await loadFileBuffer(filePath);
  const isImage = /^image\//.test(mimetype || '');
  const rawText = await extractTextFromBuffer(buffer, mimetype, originalname || filePath);
  // Same reasoning as extractQuoteFromFile: for images the LLM's vision pass
  // can still succeed even when OCR text comes back empty/garbled, so only
  // treat "no readable text" as fatal when there's no image to fall back to.
  if (!isImage && (!rawText || rawText.trim().length < 10)) {
    throw new Error('Could not read any text from this invoice file. If this is a scanned or photographed PDF, please upload it as a JPG/PNG photo instead — PDF image-scanning is not supported, only PDFs with real embedded text. Otherwise, enter the values manually.');
  }

  const prompt = `Extract invoice data from this document.
${isImage
  ? 'Both OCR text (below) and the original invoice image are attached. Treat the image as the primary source of truth — OCR text can misread digits, merge table columns, or mangle handwritten entries — and only rely on the OCR text where the image itself is unreadable.'
  : 'Only OCR-extracted text is available (no image was provided).'}
Look for the item table (name, quantity, unit price, line total), tax/GST, freight/shipping, discounts, the invoice number, invoice date, vendor name, and any PO/reference number mentioned. Numbers may use Indian numbering (₹, lakhs/commas) — normalize to plain numbers.
Return ONLY valid JSON: { vendor_name, invoice_number, invoice_date (YYYY-MM-DD), total_amount, items: [{item_name_raw, quantity, unit_price, total_price, tax, freight, discount, confidence_score}], confidence_overall }.
Set tax, freight, and discount to 0 if the document doesn't mention them for a line. If a value is illegible (including due to handwriting or scan quality), set it to null rather than guessing, and lower confidence_score.
OCR text:
${rawText || '(OCR produced no readable text — read directly from the attached image)'}`;
  const { content, mock, truncated } = await callLLM(
    prompt,
    isImage ? { imageBase64: buffer.toString('base64'), imageMimeType: mimetype } : {}
  );
  const structured = tryParseJson(content);
  if (!structured) {
    logUnparseableResponse('extractInvoice', content, { truncated, mock });
    await invoice.update({
      mismatch_reason: truncated
        ? 'AI response was cut off before finishing (invoice may have too many line items for one pass) and could not be parsed — please review this invoice manually.'
        : 'AI response could not be parsed as JSON — please review this invoice manually.',
    });
    throw new Error('AI response could not be parsed as JSON');
  }

  // No LLM_API_KEY configured — make this visible instead of silently showing ₹0/no items
  if (mock) {
    await invoice.update({ mismatch_reason: 'AI extraction is not configured (LLM_API_KEY missing) — please enter this invoice\'s values manually.' });
    return structured;
  }
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
        tax: i.tax || 0,
        freight: i.freight || 0,
        discount: i.discount || 0,
        confidence_score: i.confidence_score,
      };
    }));
  }
  // The LLM's top-level total_amount is sometimes missing/unreliable even when it
  // correctly extracted line items (multi-page invoices, odd layouts). Fall back to
  // summing the extracted item totals — same approach already used for quotes —
  // instead of falling back to invoice.total_amount, which is never set at upload
  // time and so previously left the invoice showing ₹0.
  const itemsTotal = (structured.items || []).reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
  const resolvedTotal = parseFloat(structured.total_amount) || itemsTotal || parseFloat(invoice.total_amount) || 0;
  await invoice.update({ invoice_number: structured.invoice_number || invoice.invoice_number, invoice_date: structured.invoice_date || invoice.invoice_date, total_amount: resolvedTotal });
  return structured;
}

// Pre-validation: extract from buffer WITHOUT writing to DB.
// Vendor uploads file → we extract → return items for frontend preview → vendor confirms → submit.
async function validateQuoteFile(buffer, mimetype, originalname) {
  const isImage = /^image\//.test(mimetype || '');
  const rawText = await extractTextFromBuffer(buffer, mimetype, originalname);
  if (!isImage && (!rawText || rawText.trim().length < 10)) {
    throw new Error('Could not read any text from this file. If this is a scanned or photographed PDF, please upload it as a JPG/PNG photo instead — PDF image-scanning is not supported, only PDFs with real embedded text. Otherwise, enter manually.');
  }
  const { content, mock, truncated } = await callLLM(
    EXTRACTION_PROMPT(rawText || '(OCR produced no readable text — read directly from the attached image)', isImage),
    {
      // Messy/handwritten images need a bigger token budget than clean typed
      // documents: vision models (especially "thinking" models on providers
      // like Gemini via the OpenAI-compat endpoint) spend hidden reasoning
      // tokens working out ambiguous handwriting before ever emitting the
      // JSON, and those reasoning tokens count against max_tokens. A small
      // 3-item quote can legitimately get truncated at 8000 if the image is
      // hard to read, even though the final JSON itself is short.
      maxTokens: isImage ? 16000 : 8000,
      ...(isImage ? { imageBase64: buffer.toString('base64'), imageMimeType: mimetype } : {}),
    }
  );
  const structured = tryParseJson(content);
  if (!structured) {
    // This is the exact spot that was previously throwing with no visibility into why.
    // Now the raw LLM response is logged server-side, and the message tells the user
    // (and you, reading the logs) whether it was a truncation or a genuine parse failure.
    logUnparseableResponse('validateQuoteFile', content, { truncated, mock });
    throw new Error(
      truncated
        ? 'AI response was cut off before finishing (this file may have too many line items for one pass). Please try again, or enter your quote manually.'
        : 'AI could not parse the file contents. Please enter your quote manually.'
    );
  }
  return {
    success: true,
    vendor_name: structured.vendor_name || null,
    payment_terms: structured.payment_terms || null,
    delivery_time_days: structured.delivery_time_days || null,
    validity_date: structured.validity_date || null,
    confidence_overall: structured.confidence_overall || 0,
    items: (structured.items || []).map((i) => ({
      item_name_raw: i.item_name_raw || '',
      item_code_raw: i.item_code_raw || '',
      quantity: i.quantity || 0,
      unit_price: i.unit_price || 0,
      total_price: i.total_price || ((i.quantity || 0) * (i.unit_price || 0)),
      tax: i.tax || 0,
      freight: i.freight || 0,
      discount: i.discount || 0,
      warranty: i.warranty || '',
      confidence_score: i.confidence_score || 0.5,
    })),
    notes: structured.notes || null,
    mock,
    truncated,
  };
}
// Diff a vendor's quoted line items against what the buyer's purchase request
// actually asked for. Reuses the same name-normalization/fuzzy-match approach
// already used for invoice-to-PO line matching (normalizeItemName/matchPoItem).
// requestedItems is PurchaseRequestItem rows (optionally with an included Item).
function compareQuoteToRequestedItems(quoteItems = [], requestedItems = []) {
  const requested = requestedItems.map((ri) => ({
    id: ri.id,
    name: ri.Item?.name || ri.item_name_freetext || 'Unknown item',
    quantity: parseFloat(ri.quantity) || 0,
    estimated_unit_price: ri.estimated_unit_price != null ? parseFloat(ri.estimated_unit_price) : null,
  }));

  const usedQuoteItemIds = new Set();
  const comparisons = requested.map((req) => {
    const target = normalizeItemName(req.name);
    let matched = null;
    for (const qi of quoteItems) {
      if (usedQuoteItemIds.has(qi.id)) continue;
      const candidate = normalizeItemName(qi.item_name_raw);
      if (!candidate) continue;
      if (candidate === target) { matched = qi; break; }
      if (!matched && (candidate.includes(target) || target.includes(candidate))) matched = qi;
    }

    if (!matched) {
      return {
        item_name: req.name, requested_quantity: req.quantity, quoted_quantity: null,
        unit_price: null, total_price: null, estimated_unit_price: req.estimated_unit_price,
        status: 'not_quoted',
      };
    }

    usedQuoteItemIds.add(matched.id);
    const quotedQty = parseFloat(matched.quantity) || 0;
    const unitPrice = parseFloat(matched.unit_price) || 0;
    const qtyMismatch = Math.abs(quotedQty - req.quantity) > 0.001;
    // Flag if the vendor's unit price is more than 15% away from the buyer's own estimate.
    const priceMismatch = req.estimated_unit_price != null && req.estimated_unit_price > 0 &&
      Math.abs(unitPrice - req.estimated_unit_price) / req.estimated_unit_price > 0.15;

    let status = 'matched';
    if (qtyMismatch && priceMismatch) status = 'quantity_and_price_mismatch';
    else if (qtyMismatch) status = 'quantity_mismatch';
    else if (priceMismatch) status = 'price_mismatch';

    return {
      item_name: req.name, requested_quantity: req.quantity, quoted_quantity: quotedQty,
      unit_price: unitPrice, total_price: parseFloat(matched.total_price) || 0,
      estimated_unit_price: req.estimated_unit_price, status,
    };
  });

  // Anything the vendor quoted that the buyer never asked for.
  for (const qi of quoteItems) {
    if (usedQuoteItemIds.has(qi.id)) continue;
    comparisons.push({
      item_name: qi.item_name_raw, requested_quantity: null, quoted_quantity: parseFloat(qi.quantity) || 0,
      unit_price: parseFloat(qi.unit_price) || 0, total_price: parseFloat(qi.total_price) || 0,
      estimated_unit_price: null, status: 'not_requested',
    });
  }

  return comparisons;
}

module.exports = { extractQuoteFromFile, validateQuoteFile, generateRecommendation, extractInvoice, compareQuoteToRequestedItems };
