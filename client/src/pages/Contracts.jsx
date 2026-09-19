import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { usePermission } from '../auth';

const BLANK_CLAUSE = () => ({ heading: '', body: '' });
const BLANK_FORM = () => ({ name: '', heading: 'AGREEMENT & LIMITED WARRANTY', intro: '', clauses: [BLANK_CLAUSE()] });

function formFromContract(c) {
  return {
    name: c.name, heading: c.heading || '', intro: c.intro || '',
    clauses: c.clauses && c.clauses.length ? c.clauses.map(([heading, body]) => ({ heading, body })) : [BLANK_CLAUSE()],
  };
}

// The Terms & Conditions / Agreement text attached to the bottom of a signed estimate (and
// carried onto its invoice) — a small CRUD library (Sept 2026) so this is real, editable content
// the business controls, instead of fixed text in a file. One contract can be flagged the default
// for Residential jobs and one for Commercial; an estimate with no contract of its own picks up
// whichever is currently flagged default for its customer type (see helpers.js's
// getContractForEstimate) — editing a default contract's text changes every estimate that relies
// on that default, past and future, which is the point: it's the business's live contract, not a
// frozen snapshot. The company signature/stamp image lives here too since it's the other half of
// what prints at the bottom of that same document, right next to the customer's own signature.
export default function Contracts() {
  const { canEdit } = usePermission('contracts');
  const [contracts, setContracts] = useState(null);
  const [editingId, setEditingId] = useState(null); // 'new' | contract id | null
  const [form, setForm] = useState(BLANK_FORM());
  const [saving, setSaving] = useState(false);

  const [signature, setSignature] = useState(null); // { data_url } | null while loading
  const [signatureBusy, setSignatureBusy] = useState(false);
  const fileInputRef = useRef(null);

  function load() {
    api.contracts().then(setContracts);
  }
  useEffect(() => {
    load();
    api.companySignature().then(setSignature);
  }, []);

  function startNew() {
    setForm(BLANK_FORM());
    setEditingId('new');
  }
  function startEdit(c) {
    setForm(formFromContract(c));
    setEditingId(c.id);
  }
  function cancelEdit() {
    setEditingId(null);
    setForm(BLANK_FORM());
  }

  function updateClause(i, field, value) {
    setForm((f) => ({ ...f, clauses: f.clauses.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)) }));
  }
  function addClause() {
    setForm((f) => ({ ...f, clauses: [...f.clauses, BLANK_CLAUSE()] }));
  }
  function removeClause(i) {
    setForm((f) => ({ ...f, clauses: f.clauses.filter((_, idx) => idx !== i) }));
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      heading: form.heading.trim(),
      intro: form.intro,
      clauses: form.clauses.map((c) => [c.heading.trim(), c.body.trim()]).filter((c) => c[0] || c[1]),
    };
    try {
      if (editingId === 'new') await api.createContract(payload);
      else await api.updateContract(editingId, payload);
      cancelEdit();
      load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id, customerType) {
    await api.setContractDefault(id, customerType).catch((err) => window.alert(err.message));
    load();
  }

  async function remove(c) {
    if (!window.confirm(`Delete "${c.name}"? This can't be undone.`)) return;
    await api.deleteContract(c.id).catch((err) => window.alert(err.message));
    load();
  }

  function onPickSignatureFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setSignatureBusy(true);
      try {
        const saved = await api.saveCompanySignature(reader.result);
        setSignature(saved);
      } catch (err) {
        window.alert(err.message);
      } finally {
        setSignatureBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  }

  async function removeSignature() {
    if (!window.confirm('Remove the saved signature/stamp image? Uploading a new one always replaces the old one anyway — this just clears it.')) return;
    setSignatureBusy(true);
    try {
      const saved = await api.saveCompanySignature('');
      setSignature(saved);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSignatureBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Contracts</h1>
          <p className="sub">The Terms &amp; Conditions / Agreement text that prints at the bottom of a signed estimate (and its invoice), and the signature that represents your side of it.</p>
        </div>
        {canEdit && editingId === null && <button className="btn primary" onClick={startNew}>+ New contract</button>}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Company signature / stamp</h2>
        <p className="sub" style={{ margin: '-4px 0 14px' }}>
          Shown next to the customer's own signature at the bottom of every signed estimate and invoice, both dated the day the customer signed. Uploading a new image always replaces whatever was saved before — there's no history kept of old ones.
        </p>
        {!signature ? (
          <div className="loading">Loading…</div>
        ) : (
          <div className="row" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, background: 'var(--paper-raised)', minWidth: 160, minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {signature.data_url ? (
                <img src={signature.data_url} alt="Company signature" style={{ maxWidth: 200, maxHeight: 70 }} />
              ) : (
                <span className="sub" style={{ margin: 0 }}>No signature/stamp uploaded yet.</span>
              )}
            </div>
            {canEdit && (
              <div className="row" style={{ gap: 8 }}>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickSignatureFile} style={{ display: 'none' }} id="sig-upload" />
                <button type="button" className="btn sm" disabled={signatureBusy} onClick={() => fileInputRef.current?.click()}>
                  {signatureBusy ? 'Saving…' : signature.data_url ? 'Replace image' : 'Upload image'}
                </button>
                {signature.data_url && <button type="button" className="btn sm subtle" disabled={signatureBusy} onClick={removeSignature}>Remove</button>}
              </div>
            )}
          </div>
        )}
      </div>

      {canEdit && editingId !== null && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2 style={{ marginTop: 0 }}>{editingId === 'new' ? 'New contract' : 'Edit contract'}</h2>
          <form onSubmit={save}>
            <div className="field" style={{ marginBottom: 10, maxWidth: 420 }}>
              <label>Name <span className="muted" style={{ fontWeight: 400 }}>— for your own reference, not shown to the customer</span></label>
              <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Commercial Agreement" required />
            </div>
            <div className="field" style={{ marginBottom: 10, maxWidth: 420 }}>
              <label>Heading</label>
              <input type="text" value={form.heading} onChange={(e) => setForm((f) => ({ ...f, heading: e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Intro paragraph</label>
              <textarea rows={3} value={form.intro} onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))} />
            </div>

            <label style={{ display: 'block', marginBottom: 6 }}>Clauses</label>
            <div className="stack" style={{ gap: 10, marginBottom: 10 }}>
              {form.clauses.map((c, i) => (
                <div key={i} className="card" style={{ background: 'var(--paper-raised)' }}>
                  <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                    <input
                      type="text" placeholder={`${i + 1}. Clause heading`} value={c.heading}
                      onChange={(e) => updateClause(i, 'heading', e.target.value)} style={{ flex: 1 }}
                    />
                    <button type="button" className="btn sm subtle" onClick={() => removeClause(i)}>Remove</button>
                  </div>
                  <textarea rows={3} placeholder="Clause text" value={c.body} onChange={(e) => updateClause(i, 'body', e.target.value)} />
                </div>
              ))}
            </div>
            <button type="button" className="btn sm" onClick={addClause} style={{ marginBottom: 14 }}>+ Add clause</button>

            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary sm" type="submit" disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save contract'}</button>
              <button type="button" className="btn subtle sm" onClick={cancelEdit}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {contracts === null ? (
        <div className="loading">Loading…</div>
      ) : contracts.length === 0 ? (
        <div className="empty">No contracts yet — create one above.</div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {contracts.map((c) => (
            <div key={c.id} className="card">
              <div className="row between">
                <div>
                  <span className="link-strong">{c.name}</span>
                  {c.is_default_residential && <span className="pill green" style={{ marginLeft: 8 }}>Default · Residential</span>}
                  {c.is_default_commercial && <span className="pill blue" style={{ marginLeft: 8 }}>Default · Commercial</span>}
                </div>
              </div>
              <p className="sub" style={{ margin: '4px 0 10px' }}>{c.heading}{c.clauses.length ? ` — ${c.clauses.length} clause${c.clauses.length === 1 ? '' : 's'}` : ''}</p>
              {canEdit && (
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn sm" onClick={() => startEdit(c)}>Edit</button>
                  {!c.is_default_residential && <button className="btn sm" onClick={() => setDefault(c.id, 'Residential')}>Make default for Residential</button>}
                  {!c.is_default_commercial && <button className="btn sm" onClick={() => setDefault(c.id, 'Commercial')}>Make default for Commercial</button>}
                  {!c.is_default_residential && !c.is_default_commercial && (
                    <button className="btn sm subtle" onClick={() => remove(c)}>Delete</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

