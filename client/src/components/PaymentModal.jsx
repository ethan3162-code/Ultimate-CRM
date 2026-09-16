import { useState } from 'react';
import { money } from '../utils';

const METHODS = [
  { key: 'card', label: 'Card' },
  { key: 'ach', label: 'ACH' },
  { key: 'cash', label: 'Cash' },
  { key: 'check', label: 'Check' },
];

export default function PaymentModal({ invoice, onClose, onSubmit }) {
  const [method, setMethod] = useState('card');
  const [amount, setAmount] = useState(invoice.balance.toFixed(2));
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [processing, setProcessing] = useState(false);

  const last4 = cardNumber.replace(/\D/g, '').slice(-4);

  async function submit(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setProcessing(true);
    const reference = method === 'card' ? (last4 ? `card •••• ${last4}` : null)
      : method === 'check' ? (checkNumber ? `check #${checkNumber}` : null)
      : null;
    // simulate a processor round-trip — this is a prototype, no real payment network is called
    await new Promise((r) => setTimeout(r, 900));
    await onSubmit({ amount: Number(amount), method, reference });
    setProcessing(false);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !processing && onClose()}>
      <div className="modal-card">
        <h3>Charge {invoice.number}</h3>
        <p className="sub">Balance due {money(invoice.balance)} — simulated capture, no real payment network is contacted.</p>

        <div className="method-toggle">
          {METHODS.map((m) => (
            <button key={m.key} type="button" className={method === m.key ? 'active' : ''} onClick={() => setMethod(m.key)}>{m.label}</button>
          ))}
        </div>

        <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
          <div className="field">
            <label>Amount ($)</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>

          {method === 'card' && (
            <>
              <div className="card-visual">
                <div className="num">{cardNumber ? cardNumber.replace(/(.{4})/g, '$1 ').trim().padEnd(19, '•') : '•••• •••• •••• ••••'}</div>
                <div className="row" style={{ display: 'flex' }}><span>Card</span><span>{expiry || 'MM/YY'}</span></div>
              </div>
              <div className="field">
                <label>Card number</label>
                <input inputMode="numeric" maxLength={19} placeholder="4242 4242 4242 4242" value={cardNumber} onChange={(e) => setCardNumber(e.target.value.replace(/[^0-9 ]/g, ''))} required />
              </div>
              <div className="row" style={{ gap: 10 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Expiry</label>
                  <input placeholder="MM/YY" maxLength={5} value={expiry} onChange={(e) => setExpiry(e.target.value)} required />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>CVC</label>
                  <input inputMode="numeric" maxLength={4} placeholder="123" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))} required />
                </div>
              </div>
            </>
          )}

          {method === 'ach' && (
            <div className="field"><label>Bank account</label><input placeholder="Routing/account on file" disabled value="Linked account •••• 6721" /></div>
          )}

          {method === 'check' && (
            <div className="field"><label>Check number</label><input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="e.g. 1042" /></div>
          )}

          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn subtle" onClick={onClose} disabled={processing}>Cancel</button>
            <button type="submit" className="btn primary" disabled={processing}>
              {processing ? <><span className="spinner" /> Processing…</> : `Charge ${amount ? money(amount) : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
