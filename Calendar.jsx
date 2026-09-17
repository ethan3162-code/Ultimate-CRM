import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import AppointmentModal from '../components/AppointmentModal';
import { usePermission } from '../auth';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ymd(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function Calendar() {
  const { canEdit } = usePermission('calendar');
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [modal, setModal] = useState(null); // { appointment?, defaultDate? } | null
  const [banner, setBanner] = useState(null);

  function load() {
    api.appointments().then(setData);
    api.googleStatus().then(setStatus);
  }
  useEffect(load, []);

  useEffect(() => {
    if (params.get('google_connected')) {
      setBanner({ kind: 'ok', text: 'Google Calendar connected — your events are now syncing both ways.' });
      params.delete('google_connected'); setParams(params, { replace: true });
    } else if (params.get('google_error')) {
      setBanner({ kind: 'err', text: `Google Calendar connection failed: ${params.get('google_error')}` });
      params.delete('google_error'); setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appts = data?.appointments || [];

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = first.getDay();
    const gridStart = new Date(first.getTime() - startOffset * 86400000);
    return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const a of appts) {
      const key = ymd(new Date(a.start_time));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    }
    return map;
  }, [appts]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return appts.filter((a) => new Date(a.end_time).getTime() >= now).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  }, [appts]);

  async function saveAppointment(payload) {
    if (modal.appointment && modal.appointment.id) {
      await api.updateAppointment(modal.appointment.id, payload);
    } else {
      await api.createAppointment(payload);
    }
    setModal(null);
    load();
  }

  async function deleteAppointment(appt) {
    await api.deleteAppointment(appt.id);
    setModal(null);
    load();
  }

  function connectGoogle() {
    window.location.href = '/api/auth/google';
  }
  async function disconnectGoogle() {
    await api.googleDisconnect();
    load();
  }

  const today = new Date();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Appointments</h1>
          <p className="sub">Every meeting, walkthrough, and site visit — synced both ways with Google Calendar when connected.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {canEdit && (status?.connected ? (
            <>
              <span className="pill green">Connected · {status.connectedEmail || 'Google'}</span>
              <button className="btn sm" onClick={disconnectGoogle}>Disconnect</button>
            </>
          ) : (
            <button className="btn primary sm" onClick={connectGoogle}>Connect Google Calendar</button>
          ))}
          {canEdit && <button className="btn primary sm" onClick={() => setModal({ defaultDate: ymd(new Date()) })}>+ New appointment</button>}
        </div>
      </div>

      {banner && (
        <div className={'card'} style={{ borderColor: banner.kind === 'ok' ? 'var(--green)' : 'var(--red)', marginBottom: 14 }}>
          <div className="row between">
            <span>{banner.text}</span>
            <button className="btn subtle sm" onClick={() => setBanner(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {status && !status.configured && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="empty">Google Calendar sync isn't configured yet on the server (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Appointments still work locally — ask an admin to add those environment variables to enable two-way sync.</div>
        </div>
      )}

      <div className="cal-toolbar">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
          <strong style={{ minWidth: 140, textAlign: 'center' }}>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
          <button className="btn sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
          <button className="btn sm" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}>Today</button>
        </div>
        <div className="method-toggle">
          <button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
          <button type="button" className={view === 'agenda' ? 'active' : ''} onClick={() => setView('agenda')}>Agenda</button>
        </div>
      </div>

      {!data ? <div className="loading">Loading…</div> : view === 'month' ? (
        <div className="cal-grid">
          {DOW.map((d) => <div className="cal-dow" key={d}>{d}</div>)}
          {cells.map((day, i) => {
            const key = ymd(day);
            const items = byDay.get(key) || [];
            const outside = day.getMonth() !== cursor.getMonth();
            const isToday = sameDay(day, today);
            return (
              <div key={i} className={'cal-cell' + (outside ? ' outside' : '') + (isToday ? ' today' : '')} onDoubleClick={() => canEdit && setModal({ defaultDate: key })}>
                <div className="daynum">{day.getDate()}</div>
                {items.slice(0, 3).map((a) => (
                  <div key={a.id} className={'cal-event' + (a.source === 'google' ? ' google' : '')} onClick={() => setModal({ appointment: a })} title={a.title}>
                    {a.title}
                  </div>
                ))}
                {items.length > 3 && <div className="cal-event" style={{ background: 'transparent', border: 'none', color: 'var(--muted)' }}>+{items.length - 3} more</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="agenda-list">
          {upcoming.length === 0 ? <div className="card"><div className="empty">No upcoming appointments. Create one to get started.</div></div> : upcoming.map((a) => (
            <div className="agenda-item" key={a.id} onClick={() => setModal({ appointment: a })} style={{ cursor: 'pointer' }}>
              <div>
                <div className="title">{a.title}{a.source === 'google' && <span className="pill amber" style={{ marginLeft: 8 }}>Google</span>}</div>
                <div className="meta">{a.location || 'No location'}{a.contact_name ? ` · ${a.contact_name}` : ''}{a.company_name ? ` · ${a.company_name}` : ''}{a.job_title ? ` · ${a.job_title}` : ''}</div>
              </div>
              <div className="when">
                {new Date(a.start_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}<br />
                {new Date(a.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – {new Date(a.end_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <AppointmentModal
          appointment={modal.appointment}
          defaultDate={modal.defaultDate}
          onClose={() => setModal(null)}
          onSubmit={saveAppointment}
          onDelete={deleteAppointment}
        />
      )}
    </>
  );
}
