import { useState } from 'react';

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AppointmentModal({ appointment, defaultDate, onClose, onSubmit, onDelete }) {
  const isEdit = Boolean(appointment && appointment.id && !String(appointment.id).startsWith('google-'));
  const isGoogleOnly = Boolean(appointment && String(appointment.id).startsWith('google-'));
  const [title, setTitle] = useState(appointment?.title || '');
  const [description, setDescription] = useState(appointment?.description || '');
  const [location, setLocation] = useState(appointment?.location || '');
  const [start, setStart] = useState(toLocalInput(appointment?.start_time) || (defaultDate ? `${defaultDate}T09:00` : ''));
  const [end, setEnd] = useState(toLocalInput(appointment?.end_time) || (defaultDate ? `${defaultDate}T10:00` : ''));
  const [status, setStatus] = useState(appointment?.status || 'scheduled');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !start || !end) return;
    setSaving(true);
    await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      status,
    });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal-card">
        <h3>{isEdit ? 'Edit appointment' : isGoogleOnly ? 'Google Calendar event' : 'New appointment'}</h3>
        {isGoogleOnly ? (
          <>
            <p className="sub">This event lives in Google Calendar. Edit it there — it'll sync back here automatically.</p>
            <div className="stack" style={{ gap: 10 }}>
              <div className="field"><label>Title</label><input value={title} disabled /></div>
              <div className="row" style={{ gap: 10 }}>
                <div className="field" style={{ flex: 1 }}><label>Starts</label><input value={start} disabled /></div>
                <div className="field" style={{ flex: 1 }}><label>Ends</label><input value={end} disabled /></div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn" onClick={onClose}>Close</button>
              </div>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
            <div className="field">
              <label>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Site walkthrough with client" required />
            </div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label>Starts</label>
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 160 }}>
                <label>Ends</label>
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label>Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Address or video link" />
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {isEdit && (
              <div className="field">
                <label>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            )}
            <div className="row" style={{ justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
              <div>
                {isEdit && onDelete && (
                  <button type="button" className="btn subtle" onClick={() => onDelete(appointment)} disabled={saving}>Delete</button>
                )}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn subtle" onClick={onClose} disabled={saving}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create appointment'}</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
