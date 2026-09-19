// Shared Agreement & Terms + signature block for the customer-facing estimate and invoice pages
// (Sept 2026) — an invoice shows the identical contract/signature its source estimate carried
// (see routes/public.js's GET /invoices/:token), so both pages render this exactly the same way.

/** Two signature columns matching the printed Agreement's own layout: an image over a line, a
    "Signed on: DATE" caption, then the printed party name. An unfilled column (no image yet, e.g.
    no company stamp uploaded) just shows a blank line — never a placeholder graphic. */
export function SignatureBlock({ leftImage, leftLabel, rightImage, rightLabel, date }) {
  return (
    <div className="sign-row">
      <div className="sign-line">
        <div className="sign-img">{leftImage && <img src={leftImage} alt="Signature" />}</div>
        Signed on: {date}<br /><strong>{leftLabel}</strong>
      </div>
      <div className="sign-line">
        <div className="sign-img">{rightImage && <img src={rightImage} alt="Signature" />}</div>
        Signed on: {date}<br /><strong>{rightLabel}</strong>
      </div>
    </div>
  );
}

export function TermsBlock({ terms, signature }) {
  if (!terms) return null;
  return (
    <div className="doc-terms no-print-avoid-break">
      <h3>{terms.heading}</h3>
      {terms.intro && <p className="doc-terms-intro">{terms.intro}</p>}
      {terms.clauses.length > 0 && <div className="doc-terms-subhead">Terms and Conditions</div>}
      {terms.clauses.map(([title, body]) => (
        <p className="doc-clause" key={title}><strong>{title}</strong>{body}</p>
      ))}
      {signature?.date && (
        <SignatureBlock
          leftImage={signature.companyImage} leftLabel={signature.companyName}
          rightImage={signature.customerImage} rightLabel={signature.customerName}
          date={signature.date}
        />
      )}
    </div>
  );
}
