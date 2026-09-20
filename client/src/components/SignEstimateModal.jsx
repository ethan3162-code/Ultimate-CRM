import { useState } from 'react';
import { api } from '../api';
import SignaturePad from './SignaturePad';

// In-person signing (Sept 2026) — the same "type your name, draw a signature" flow the public
// /approve/:token page collects, but reachable right from inside the app: whoever's logged in
// hands their phone/tablet to the customer standing next to them, so a signature doesn't require
// texting or emailing a link and waiting for the customer to open it on their own device. A
// second tab lets the logged-in side sign as the company itself — this just (re)saves the
// company's on-file stamp (Contracts → company signature), the same image that already appears
// alongside the customer's signature on every estimate/invoice, rather than a per-document field.
export default function SignEstimateModal({ estimate, defaultCustomerName, onClose, onSigned }) {
  const [party, setParty] = useState('client');

  const [customerName, setCustomerName] = useState(defaultCustomerName || '');
  const [customerSig, setCustomerSig] = useState(null);
  const [signingClient, setSigningClient] = useState(false);
  const [clientError, setClientError] = useState(null);

  const [companySig, setCompanySig] = useState(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyError, setCompanyError] = useState(null);
  const [companySaved, setCompanySaved] = useState(false);

  async function submitClient(e) {
    e.preventDefault();
    if (!customerName.trim()) return;
    setSigningClient(true);
    setClientError(null);
    try {
      const updated = await api.signEstimateInPerson(estimate.id, {
        signed_name: customerName.trim(),
        signature_data_url: customerSig,
      });
      onSigned(updated);
      onClose();
    } catch (err) {
      setClientError(err.message);
    }
    setSigningClient(false);
  }

  async function submitCompany(e) {
    e.preventDefault();
    setSavingCompany(true);
    setCompanyError(null);
    try {
      await api.saveCompanySignature(companySig);
      setCompanySaved(true);
    } catch (err) {
      setCompanyError(err.message);
    }
    setSavingCompany(false);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card wide">
        <h3>Sign {estimate.number}</h3>
        <p className="sub">Capture a signature right here — hand this screen to the customer, or sign as the company yourself.</p>

        <div className="method-toggle">
          <button type="button" className={party === 'client' ? 'active' : ''} onClick={() => setParty('client')}>Client</button>
          <button type="button" className={party === 'contractor' ? 'active' : ''} onClick={() => setParty('contractor')}>Contractor (company)</button>
        </div>

        {party === 'client' ? (
          <form onSubmit={submitClient} className="stack" style={{ gap: 12 }}>
            <div className="field">
              <label>Customer's full name</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Type their name" required />
            </div>
            <div className="field">
              <label>Signature</label>
              <SignaturePad onChange={setCustomerSig} />
            </div>
            {clientError && <p className="sub" style={{ color: 'var(--red)' }}>{clientError}</p>}
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button type="button" className="btn subtle" onClick={onClose} disabled={signingClient}>Cancel</button>
              <button type="submit" className="btn primary" disabled={signingClient || !customerName.trim()}>
                {signingClient ? 'Saving…' : 'Save signature'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitCompany} className="stack" style={{ gap: 12 }}>
            <p className="sub" style={{ margin: '-6px 0 0' }}>
              This replaces your company's saved stamp — it'll appear on every estimate and invoice from here on, not just this one.
            </p>
            <div className="field">
              <label>Company signature / stamp</label>
              <SignaturePad onChange={setCompanySig} />
            </div>
            {companyError && <p className="sub" style={{ color: 'var(--red)' }}>{companyError}</p>}
            {companySaved && <p className="sub" style={{ color: 'var(--accent-ink)' }}>✓ Saved — your company stamp is updated.</p>}
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button type="button" className="btn subtle" onClick={onClose} disabled={savingCompany}>Close</button>
              <button type="submit" className="btn primary" disabled={savingCompany || !companySig}>
                {savingCompany ? 'Saving…' : 'Save company signature'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
