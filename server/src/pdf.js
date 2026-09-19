// Invoice PDF generation (Sept 2026) — the customer-facing invoice already has a branded web
// page (see routes/public.js + client's InvoiceView.jsx); this builds an actual PDF of the same
// document, reflecting whatever payment status the invoice is at right now, so it can be emailed
// as an attachment or downloaded from the Project page. Built with pdfkit (pure-JS, no native
// Chromium dependency) rather than a headless-browser print, which would be a much heavier thing
// to run on a small Render web service.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { getCompanyProfile } = require('./companyProfile');
const { getEstimatePaymentSchedule, getContractForEstimate, getJobCustomerType } = require('./helpers');
const { getSetting } = require('./settings');

// Same square logo mark the customer-facing web pages use (see client/public/logo-mark.png) —
// pulled from the client's own source folder rather than its built dist/ output, so this doesn't
// depend on a build having run yet. Missing/unreadable is handled gracefully (falls back to a
// text-only header) rather than failing the whole PDF over a logo file.
const LOGO_PATH = path.join(__dirname, '..', '..', 'client', 'public', 'logo-mark.png');
function logoBuffer() {
  try {
    return fs.readFileSync(LOGO_PATH);
  } catch {
    return null;
  }
}

// Decodes a "data:image/png;base64,...." string (the shape both the customer's drawn e-signature
// and the uploaded company stamp are stored as — see estimates.signature_data_url and the
// company_signature_data_url setting) into a Buffer pdfkit's doc.image() can draw. Returns null
// for anything missing or malformed, so a document without a signature on file just skips it.
function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64');
  } catch {
    return null;
  }
}

// Two-column signature block matching the user's reference "Agreement & Limited Warranty"
// document exactly: an image (or blank space if none on file) over a signature line, "Signed on:
// DATE" underneath, then the printed party name. Both sides share the same date — the day the
// customer signed — since the company's stamp represents standing authorization applied at the
// moment the agreement was executed, not a separately-dated event.
function drawSignatureBlock(doc, { fullWidth, leftImage, leftLabel, rightImage, rightLabel, date }) {
  const colGap = 30;
  const colW = (fullWidth - colGap) / 2;
  const imgH = 46;
  if (doc.y > doc.page.height - doc.page.margins.bottom - (imgH + 60)) doc.addPage();
  const topY = doc.y;
  const leftX = doc.page.margins.left;
  const rightX = doc.page.margins.left + colW + colGap;

  if (leftImage) { try { doc.image(leftImage, leftX, topY, { fit: [colW, imgH] }); } catch { /* corrupt image data — leave the line blank */ } }
  if (rightImage) { try { doc.image(rightImage, rightX, topY, { fit: [colW, imgH] }); } catch { /* corrupt image data — leave the line blank */ } }

  const lineY = topY + imgH + 6;
  doc.moveTo(leftX, lineY).lineTo(leftX + colW, lineY).strokeColor(LINE).stroke();
  doc.moveTo(rightX, lineY).lineTo(rightX + colW, lineY).strokeColor(LINE).stroke();

  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text(`Signed on: ${date}`, leftX, lineY + 6, { width: colW })
    .text(leftLabel || '', leftX, doc.y, { width: colW });
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text(`Signed on: ${date}`, rightX, lineY + 6, { width: colW })
    .text(rightLabel || '', rightX, doc.y, { width: colW });
  doc.y = Math.max(doc.y, lineY + 40);
}

function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) return String(s).slice(0, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const INK = '#1f2a24';
const MUTED = '#767A6E';
const LINE = '#DBD7C9';

// Shared line-items table for both documents — respects the same three Display Options toggles
// (show_rate / show_qty / show_item_total) the customer-facing web pages honor, so a PDF download
// always matches whatever that document is currently configured to show. Falsy/undefined on any
// flag defaults to shown, matching the DB column defaults (existing documents keep looking the
// same as before these toggles existed).
function drawItemsTable(doc, items, doc_) {
  const showQty = doc_.show_qty === undefined || !!doc_.show_qty;
  const showRate = doc_.show_rate === undefined || !!doc_.show_rate;
  const showAmt = doc_.show_item_total === undefined || !!doc_.show_item_total;

  const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const optionalWidth = (showQty ? 0.12 : 0) + (showRate ? 0.18 : 0) + (showAmt ? 0.18 : 0);
  const cols = {
    desc: fullWidth * (1 - optionalWidth),
    qty: fullWidth * 0.12,
    price: fullWidth * 0.18,
    amt: fullWidth * 0.18,
  };

  let x = doc.page.margins.left;
  const headerY = doc.y;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
  doc.text('DESCRIPTION', x, headerY, { width: cols.desc }); x += cols.desc;
  if (showQty) { doc.text('QTY', x, headerY, { width: cols.qty, align: 'right' }); x += cols.qty; }
  if (showRate) { doc.text('UNIT PRICE', x, headerY, { width: cols.price, align: 'right' }); x += cols.price; }
  if (showAmt) doc.text('AMOUNT', x, headerY, { width: cols.amt, align: 'right' });
  doc.moveDown(0.6);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(LINE).stroke();
  doc.moveDown(0.4);

  for (const it of items) {
    const rowY = doc.y;
    x = doc.page.margins.left;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK);
    doc.text(it.description, x, rowY, { width: cols.desc }); const descBottom = doc.y;
    x += cols.desc;
    doc.font('Helvetica').fontSize(9.5).fillColor(INK);
    if (showQty) { doc.text(String(it.qty), x, rowY, { width: cols.qty, align: 'right' }); x += cols.qty; }
    if (showRate) { doc.text(money(it.unit_price), x, rowY, { width: cols.price, align: 'right' }); x += cols.price; }
    if (showAmt) doc.text(money(it.qty * it.unit_price), x, rowY, { width: cols.amt, align: 'right' });
    doc.y = Math.max(descBottom, doc.y);
    // The item's own longer scope-of-work text (see db.js's estimate_items.notes) — a separate
    // block under the name/price row, not squeezed into the same line, so a multi-paragraph
    // writeup (blank-line-separated, from a Joist-style catalog import) reads the way it was
    // written. pdfkit's .text() already renders embedded \n / \n\n as line breaks / paragraph
    // gaps, so the stored text doesn't need any reformatting here.
    if (it.notes && it.notes.trim()) {
      doc.moveDown(0.15);
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(it.notes.trim(), doc.page.margins.left, doc.y, { width: fullWidth });
    }
    doc.y += 4;
    if (doc.y > doc.page.height - doc.page.margins.bottom - 160) doc.addPage();
  }
}

/** Builds the invoice PDF and returns it as a Buffer (awaits the stream close event — pdfkit
    writes asynchronously even though document construction itself is synchronous). `invoice` is
    a getInvoiceFull() result; `job`/`customer` are the same plain lookups routes/public.js already
    does for the web view, passed in so this module doesn't need its own DB access. */
function buildInvoicePdf({ invoice, job, customer, sourceEstimate }) {
  return new Promise((resolve, reject) => {
    const company = getCompanyProfile();
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // --- Header: centered title, company block left / bill-to block right ---
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text('INVOICE', { align: 'center' });
    doc.moveDown(0.8);

    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
    const topY = doc.y;
    const logo = logoBuffer();
    const logoSize = 34;
    const textX = doc.page.margins.left + (logo ? logoSize + 10 : 0);
    if (logo) doc.image(logo, doc.page.margins.left, topY, { width: logoSize, height: logoSize });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(company.name, textX, topY, { width: colWidth - 10 - (logo ? logoSize + 10 : 0) });
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
      .text(company.address_line1, textX, doc.y, { width: colWidth - 10 - (logo ? logoSize + 10 : 0) })
      .text(company.city_state_zip)
      .text(company.phone)
      .text(company.email)
      .text(company.website);
    const leftBottomY = Math.max(doc.y, topY + logoSize);

    const rightX = doc.page.margins.left + colWidth + 10;
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('BILL TO', rightX, topY, { width: colWidth - 10, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(customer?.name || '—', rightX, doc.y, { width: colWidth - 10, align: 'right' });
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
    if (customer?.address) doc.text(customer.address, rightX, doc.y, { width: colWidth - 10, align: 'right' });
    if (customer?.phone) doc.text(customer.phone, rightX, doc.y, { width: colWidth - 10, align: 'right' });
    if (customer?.email) doc.text(customer.email, rightX, doc.y, { width: colWidth - 10, align: 'right' });
    const rightBottomY = doc.y;

    doc.y = Math.max(leftBottomY, rightBottomY) + 12;
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
    const metaY = doc.y;
    doc.text(`Invoice #  ${invoice.number}`, doc.page.margins.left, metaY, { width: colWidth, align: 'left' });
    let metaRight = `Date  ${fmtDate(invoice.created_at)}`;
    if (invoice.due_date) metaRight += `    Due  ${fmtDate(invoice.due_date)}`;
    doc.text(metaRight, rightX, metaY, { width: colWidth - 10, align: 'right' });
    doc.moveDown(1);

    if (job?.title || job?.address) {
      doc.font('Helvetica').fontSize(9.5).fillColor(INK)
        .text(`${job?.title || ''}${job?.address ? ` — ${job.address}` : ''}`, doc.page.margins.left);
      doc.moveDown(0.6);
    }

    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(LINE).stroke();
    doc.moveDown(0.8);

    // --- Line items table ---
    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    drawItemsTable(doc, invoice.items, invoice);
    doc.moveDown(0.4);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(LINE).stroke();
    doc.moveDown(0.6);

    // --- Totals ---
    const totalsRow = (label, amount, opts = {}) => {
      const y = doc.y;
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 11 : 9.5).fillColor(opts.bold ? INK : MUTED);
      doc.text(label, doc.page.margins.left, y, { width: fullWidth - 110, align: 'right' });
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(INK);
      doc.text(money(amount), doc.page.margins.left + fullWidth - 110, y, { width: 110, align: 'right' });
      doc.moveDown(0.35);
    };
    totalsRow('Subtotal', invoice.subtotal);
    totalsRow('Tax', invoice.tax);
    totalsRow('Total', invoice.total, { bold: true });
    if (invoice.amount_paid > 0) totalsRow('Paid so far', invoice.amount_paid);
    totalsRow('Balance due', invoice.balance, { bold: true });

    // --- Payment history ---
    if (invoice.payments && invoice.payments.length > 0) {
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Payment history', doc.page.margins.left);
      doc.moveDown(0.3);
      for (const p of invoice.payments) {
        doc.font('Helvetica').fontSize(9).fillColor(MUTED)
          .text(`${fmtDate(p.paid_at)}   ${p.method || ''}`, doc.page.margins.left, doc.y, { continued: true, width: fullWidth - 90 })
          .text(money(p.amount), { align: 'right' });
        doc.moveDown(0.25);
      }
    }

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(
      invoice.balance > 0
        ? 'Questions about this invoice? Reply to the email it came with, or contact us directly.'
        : 'Paid in full — thank you for your business!',
      doc.page.margins.left, doc.y, { width: fullWidth }
    );

    // --- Agreement & Terms & Conditions carried over from the signed estimate this invoice was
    // generated from (see routes/jobs.js's /invoices/:invoiceId/pdf and /send, which pass the
    // linked estimate row as sourceEstimate) — the invoice is issued under that same executed
    // agreement, so it shows the identical contract text and signature block, not a fresh unsigned
    // one. A standalone invoice with no linked estimate (sourceEstimate null) just skips this
    // section entirely — there's no underlying signed agreement to reproduce.
    if (sourceEstimate) {
      const customerType = job ? getJobCustomerType(job) : 'Residential';
      const contract = getContractForEstimate(sourceEstimate, customerType);
      if (contract && contract.clauses && contract.clauses.length) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(contract.heading || 'AGREEMENT & LIMITED WARRANTY', { width: fullWidth });
        doc.moveDown(0.5);
        if (contract.intro) {
          doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(contract.intro, doc.page.margins.left, doc.y, { width: fullWidth });
          doc.moveDown(0.6);
        }
        doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('TERMS AND CONDITIONS', doc.page.margins.left, doc.y, { width: fullWidth });
        doc.moveDown(0.5);
        for (const [heading, body] of contract.clauses) {
          if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage();
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(heading, doc.page.margins.left, doc.y, { width: fullWidth });
          doc.moveDown(0.2);
          doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(body, doc.page.margins.left, doc.y, { width: fullWidth });
          doc.moveDown(0.6);
        }
        if (sourceEstimate.signed_at) {
          doc.moveDown(0.6);
          drawSignatureBlock(doc, {
            fullWidth,
            leftImage: dataUrlToBuffer(getSetting('company_signature_data_url')),
            leftLabel: company.name,
            rightImage: dataUrlToBuffer(sourceEstimate.signature_data_url),
            rightLabel: sourceEstimate.signed_name,
            date: fmtDate(sourceEstimate.signed_at),
          });
        }
      }
    }

    doc.end();
  });
}

/** Builds the estimate PDF and returns it as a Buffer — the same document the customer-facing
    /approve/:token page shows (header, Prepared For block, line items honoring the Display
    Options toggles, payment schedule, Terms & Conditions, and signature status), just as a
    downloadable/emailable file. `estimate` is a getEstimateFull() result; `party` is the
    {title, address, contact, company, customerType} shape routes/public.js's resolveEstimateParty
    already produces, passed in so this module doesn't need its own DB access. */
function buildEstimatePdf({ estimate, party }) {
  return new Promise((resolve, reject) => {
    const company = getCompanyProfile();
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contact = party?.contact;
    const custName = contact ? `${contact.first_name} ${contact.last_name}` : (party?.company?.name || null);
    const custAddress = (contact && contact.address) || (party?.company && party.company.address) || party?.address || null;

    // --- Header: centered title, company block left / prepared-for block right ---
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text('ESTIMATE', { align: 'center' });
    doc.moveDown(0.8);

    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
    const topY = doc.y;
    const logo = logoBuffer();
    const logoSize = 34;
    const textX = doc.page.margins.left + (logo ? logoSize + 10 : 0);
    if (logo) doc.image(logo, doc.page.margins.left, topY, { width: logoSize, height: logoSize });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(company.name, textX, topY, { width: colWidth - 10 - (logo ? logoSize + 10 : 0) });
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
      .text(company.address_line1, textX, doc.y, { width: colWidth - 10 - (logo ? logoSize + 10 : 0) })
      .text(company.city_state_zip)
      .text(company.phone)
      .text(company.email)
      .text(company.website);
    const leftBottomY = Math.max(doc.y, topY + logoSize);

    const rightX = doc.page.margins.left + colWidth + 10;
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('PREPARED FOR', rightX, topY, { width: colWidth - 10, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(custName || '—', rightX, doc.y, { width: colWidth - 10, align: 'right' });
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
    if (custAddress) doc.text(custAddress, rightX, doc.y, { width: colWidth - 10, align: 'right' });
    if (contact?.phone) doc.text(contact.phone, rightX, doc.y, { width: colWidth - 10, align: 'right' });
    if (contact?.email) doc.text(contact.email, rightX, doc.y, { width: colWidth - 10, align: 'right' });
    const rightBottomY = doc.y;

    doc.y = Math.max(leftBottomY, rightBottomY) + 12;
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
    const metaY = doc.y;
    doc.text(`Estimate #  ${estimate.number}`, doc.page.margins.left, metaY, { width: colWidth, align: 'left' });
    doc.text(`Date  ${fmtDate(estimate.created_at)}`, rightX, metaY, { width: colWidth - 10, align: 'right' });
    doc.moveDown(1);

    if (party?.title || party?.address) {
      doc.font('Helvetica').fontSize(9.5).fillColor(INK)
        .text(`${party?.title || ''}${party?.address ? ` — ${party.address}` : ''}`, doc.page.margins.left);
      doc.moveDown(0.6);
    }

    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(LINE).stroke();
    doc.moveDown(0.8);

    // --- Line items table ---
    drawItemsTable(doc, estimate.items, estimate);
    doc.moveDown(0.4);
    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(LINE).stroke();
    doc.moveDown(0.6);

    // --- Totals ---
    const totalsRow = (label, amount, opts = {}) => {
      const y = doc.y;
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 11 : 9.5).fillColor(opts.bold ? INK : MUTED);
      doc.text(label, doc.page.margins.left, y, { width: fullWidth - 110, align: 'right' });
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(INK);
      doc.text(money(amount), doc.page.margins.left + fullWidth - 110, y, { width: 110, align: 'right' });
      doc.moveDown(0.35);
    };
    totalsRow('Subtotal', estimate.subtotal);
    totalsRow('Tax', estimate.tax);
    totalsRow('Total', estimate.total, { bold: true });

    // --- Payment schedule (only worth a table when there's more than just "balance on completion") ---
    const schedule = getEstimatePaymentSchedule(estimate);
    if (schedule.length > 1) {
      // A bold summary line right under the total — the amount due right now (the schedule's
      // first row: a straight deposit, or a custom schedule's first milestone), before the full
      // itemized breakdown below.
      totalsRow('Deposit Due', schedule[0].amount, { bold: true });
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Payment Schedule', doc.page.margins.left);
      doc.moveDown(0.3);
      for (const s of schedule) {
        doc.font('Helvetica').fontSize(9).fillColor(MUTED)
          .text(s.note ? `${s.label} — ${s.note}` : s.label, doc.page.margins.left, doc.y, { continued: true, width: fullWidth - 90 })
          .text(money(s.amount), { align: 'right' });
        doc.moveDown(0.25);
      }
    }

    // --- Signature status (unsigned only — a signed estimate gets the full signature block
    // below, at the end of the Agreement, instead of a one-line status here) ---
    if (!estimate.signed_at) {
      doc.moveDown(0.8);
      doc.font('Helvetica').fontSize(9).fillColor(MUTED)
        .text('This estimate has not been signed yet.', doc.page.margins.left, doc.y, { width: fullWidth });
    }

    // --- Agreement & Terms & Conditions, from the Contracts library (see helpers.js's
    // getContractForEstimate) — heading, intro paragraph, "TERMS AND CONDITIONS" sub-heading,
    // numbered clauses, then (once signed) a two-column signature block: the company's stamp on
    // the left, the customer's actual drawn signature on the right, both dated the day they
    // signed — matching the user's reference document exactly. ---
    const contract = getContractForEstimate(estimate, party?.customerType);
    if (contract && contract.clauses && contract.clauses.length) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(contract.heading || 'AGREEMENT & LIMITED WARRANTY', { width: fullWidth });
      doc.moveDown(0.5);
      if (contract.intro) {
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(contract.intro, doc.page.margins.left, doc.y, { width: fullWidth });
        doc.moveDown(0.6);
      }
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('TERMS AND CONDITIONS', doc.page.margins.left, doc.y, { width: fullWidth });
      doc.moveDown(0.5);
      for (const [heading, body] of contract.clauses) {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(heading, doc.page.margins.left, doc.y, { width: fullWidth });
        doc.moveDown(0.2);
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(body, doc.page.margins.left, doc.y, { width: fullWidth });
        doc.moveDown(0.6);
      }

      if (estimate.signed_at) {
        doc.moveDown(0.6);
        drawSignatureBlock(doc, {
          fullWidth,
          leftImage: dataUrlToBuffer(getSetting('company_signature_data_url')),
          leftLabel: company.name,
          rightImage: dataUrlToBuffer(estimate.signature_data_url),
          rightLabel: estimate.signed_name,
          date: fmtDate(estimate.signed_at),
        });
      }
    }

    doc.end();
  });
}

module.exports = { buildInvoicePdf, buildEstimatePdf };

