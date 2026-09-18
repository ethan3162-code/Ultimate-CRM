import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { shortDate, fileToDataUrl } from '../utils';
import { usePermission } from '../auth';

const STATUS_PILL = { expired: 'red', expiring: 'amber', ok: 'green', none: '' };
const STATUS_LABEL = { expired: 'Expired', expiring: 'Expiring soon', ok: 'Current', none: 'No expiry set' };
const DOC_TYPES = ['Insurance', 'License', 'W9', 'Bond', 'Other'];

export default function SubcontractorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit } = usePermission('subcontractors');
  const [sub, setSub] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newDoc, setNewDoc] = useState({ doc_type: 'Insurance', expiry_date: '' });
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [sendingFor, setSendingFor] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [template, setTemplate] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  function load() {
    api.subcontractor(id).then((s) => {
      setSub(s);
      setForm({ name: s.name || '', trade: s.trade || '', contact_name: s.contact_name || '', phone: s.phone || '', email: s.email || '', notes: s.notes || '' });
    });
  }
  useEffect(load, [id]);
  useEffect(() => { api.renewalTemplate().then(setTemplate); }, []);

  async function saveInfo(e) {
    e.preventDefault();
    setSaving(true);
    await api.updateSubcontractor(id, form);
    setSaving(false);
    setEditing(false);
    load();
  }

  async function toggleActive() {
    await api.updateSubcontractor(id, { active: sub.active ? 0 : 1 });
    load();
  }

  async function removeSub() {
    if (!window.confirm(`Delete ${sub.name}? This can't be undone.`)) return;
    await api.deleteSubcontractor(id);
    navigate('/subcontractors');
  }

  async function uploadDoc(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingDoc(true);
    try {
      const data_url = await fileToDataUrl(file);
      await api.addSubcontractorDocument(id, { doc_type: newDoc.doc_type, expiry_date: newDoc.expiry_date || null, file_name: file.name, data_url });
      setNewDoc({ doc_type: 'Insurance', expiry_date: '' });
      load();
    } finally {
      setUploadingDoc(false);
    }
  }

  async function updateExpiry(docId, expiry_date) {
    await api.updateSubcontractorDocument(docId, { expiry_date: expiry_date || null });
    load();
  }

  async function removeDoc(docId) {
    await api.deleteSubcontractorDocument(docId);
    load();
  }

  async function sendRenewal(docId) {
    setSendingFor(docId);
    try {
      await api.sendRenewalRequest(docId);
      load();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSendingFor(null);
    }
  }

  async function saveTemplate(e) {
    e.preventDefault();
    setSavingTemplate(true);
    const updated = await api.updateRenewalTemplate(template);
    setTemplate(updated);
    setSavingTemplate(false);
    setEditingTemplate(false);
  }

  if (!sub) return <div className="loading">Loading…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/subcontractors">Subcontractors</Link> / {sub.name}</p>
          <h1>{sub.name} <span className={'pill ' + (sub.active ? 'green' : 'red')} style={{ marginLeft: 8, verticalAlign: 'middle' }}>{sub.active ? 'Active' : 'Inactive'}</span></h1>
          <p className="sub">{sub.trade || 'Subcontractor'}{sub.contact_name ? ` · ${sub.contact_name}` : ''}</p>
        </div>
        {canEdit && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={toggleActive}>{sub.active ? 'Mark inactive' : 'Mark active'}</button>
            <button className="btn sm subtle" onClick={removeSub}>Delete</button>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card section-card accent-blue">
            <div className="row between" style={{ marginBottom: editing ? 10 : 6 }}>
              <h2 className="section-label" style={{ margin: 0 }}>Company info</h2>
              {!editing && canEdit && <button className="btn sm subtle" onClick={() => setEditing(true)}>Edit</button>}
            </div>
            {editing ? (
              <form onSubmit={saveInfo} className="stack" style={{ gap: 10 }}>
                <div className="field"><label>Company name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="field"><label>Trade</label><input value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} /></div>
                <div className="field"><label>Contact name</label><input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
                <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="field"><label>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="btn sm subtle" type="button" onClick={() => { setEditing(false); load(); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row between"><span className="muted">Phone</span>{sub.phone ? <a href={`tel:${sub.phone}`}>{sub.phone}</a> : <span className="muted">—</span>}</div>
                <div className="row between"><span className="muted">Email</span>{sub.email ? <a href={`mailto:${sub.email}`}>{sub.email}</a> : <span className="muted">—</span>}</div>
                <div className="row between"><span className="muted">Trade</span><span>{sub.trade || '—'}</span></div>
                <div className="row between" style={{ alignItems: 'flex-start' }}><span className="muted">Notes</span><span style={{ textAlign: 'right' }}>{sub.notes || '—'}</span></div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <h2 style={{ marginBottom: 4 }}>Compliance documents</h2>
              <span className={'pill ' + STATUS_PILL[sub.compliance_status]}>{STATUS_LABEL[sub.compliance_status]}</span>
            </div>
            <p className="sub" style={{ margin: '4px 0 12px' }}>The office gets emailed automatically when a document is expired or expiring within 30 days. Sending a renewal request to the subcontractor itself is always a manual click below.</p>

            {canEdit && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14, borderBottom: '1px solid var(--line-soft)', paddingBottom: 14 }}>
                <select value={newDoc.doc_type} onChange={(e) => setNewDoc({ ...newDoc, doc_type: e.target.value })}>
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="date" value={newDoc.expiry_date} onChange={(e) => setNewDoc({ ...newDoc, expiry_date: e.target.value })} title="Expiry date" />
                <label className="btn sm" style={{ cursor: 'pointer' }}>
                  {uploadingDoc ? 'Uploading…' : '+ Add document'}
                  <input type="file" onChange={uploadDoc} disabled={uploadingDoc} style={{ display: 'none' }} />
                </label>
              </div>
            )}

            {sub.documents.length === 0 ? <div className="empty">No documents on file yet.</div> : (
              <div className="stack" style={{ gap: 8 }}>
                {sub.documents.map((d) => (
                  <div key={d.id} style={{ border: '1px solid var(--line-soft)', borderRadius: 9, padding: '10px 12px' }}>
                    <div className="row between">
                      <span className="row" style={{ gap: 6 }}>
                        {d.data_url ? <a href={d.data_url} target="_blank" rel="noreferrer" className="link-strong">{d.doc_type}</a> : <span className="link-strong">{d.doc_type}</span>}
                      </span>
                      <span className={'pill ' + STATUS_PILL[d.status]}>{STATUS_LABEL[d.status]}</span>
                    </div>
                    <div className="row between" style={{ marginTop: 6 }}>
                      <span className="muted" style={{ fontSize: 13 }}>Expires</span>
                      {canEdit ? (
                        <input type="date" value={d.expiry_date || ''} onChange={(e) => updateExpiry(d.id, e.target.value)} />
                      ) : (
                        <span>{d.expiry_date ? shortDate(d.expiry_date) : '—'}</span>
                      )}
                    </div>
                    {d.last_request_sent_at && (
                      <div className="sub" style={{ margin: '6px 0 0' }}>Renewal request last sent {shortDate(d.last_request_sent_at)}.</div>
                    )}
                    {canEdit && (
                      <div className="row" style={{ gap: 8, marginTop: 8 }}>
                        <button className="btn primary sm" onClick={() => sendRenewal(d.id)} disabled={sendingFor === d.id || !sub.email}>
                          {sendingFor === d.id ? 'Sending…' : 'Send renewal request'}
                        </button>
                        <button type="button" className="btn subtle sm" onClick={() => removeDoc(d.id)}>Delete</button>
                      </div>
                    )}
                    {canEdit && !sub.email && <p className="sub" style={{ margin: '6px 0 0', color: 'var(--red)' }}>Add an email above to send a renewal request.</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <h2 style={{ marginBottom: 4 }}>Renewal request email</h2>
              {!editingTemplate && canEdit && <button className="btn sm subtle" onClick={() => setEditingTemplate(true)}>Edit</button>}
            </div>
            <p className="sub" style={{ margin: '4px 0 10px' }}>
              Used for every subcontractor's "Send renewal request" button. Placeholders: <code>{'{contact_name}'}</code>, <code>{'{company_name}'}</code>, <code>{'{doc_type}'}</code>, <code>{'{expiry_date}'}</code>.
            </p>
            {template && (
              editingTemplate ? (
                <form onSubmit={saveTemplate} className="stack" style={{ gap: 10 }}>
                  <div className="field"><label>Subject</label><input value={template.subject} onChange={(e) => setTemplate({ ...template, subject: e.target.value })} /></div>
                  <div className="field"><label>Body</label><textarea rows={8} value={template.body} onChange={(e) => setTemplate({ ...template, body: e.target.value })} /></div>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn primary sm" type="submit" disabled={savingTemplate}>{savingTemplate ? 'Saving…' : 'Save'}</button>
                    <button className="btn sm subtle" type="button" onClick={() => { setEditingTemplate(false); api.renewalTemplate().then(setTemplate); }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  <div><span className="muted">Subject: </span>{template.subject}</div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }} className="muted">{template.body}</div>
                </div>
              )
            )}
          </div>

          <div className="card">
            <h2>Activity</h2>
            {sub.activities.length === 0 ? <div className="empty">Nothing logged yet.</div> : (
              <div className="timeline">
                {sub.activities.map((a) => (
                  <div className="timeline-item" key={a.id}>
                    <div className="when">{shortDate(a.created_at)}</div>
                    <div className="body"><span className="type-tag">{a.type.replace('_', ' ')}</span>{a.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
