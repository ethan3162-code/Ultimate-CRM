import { useState } from 'react';

export default function AiDraftModal({ title, initialDraft, onClose, onLog }) {
  const [subject, setSubject] = useState(initialDraft.subject);
  const [body, setBody] = useState(initialDraft.body);
  const [logging, setLogging] = useState(false);

  async function handleLog() {
    setLogging(true);
    await onLog({ subject, body });
    setLogging(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 480 }}>
        <h3>{title}</h3>
        <p className="sub">Smart draft — composed from this record's own data (stage, contact, recent notes), not a live model call. Edit before logging it.</p>

        <div className="stack" style={{ gap: 10 }}>
          <div className="field">
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="field">
            <label>Body</label>
            <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button type="button" className="btn subtle" onClick={onClose} disabled={logging}>Cancel</button>
          <button type="button" className="btn primary" onClick={handleLog} disabled={logging}>
            {logging ? 'Logging…' : 'Log as sent'}
          </button>
        </div>
      </div>
    </div>
  );
}
