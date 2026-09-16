import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate } from '../utils';

const STAGE_PILL = { new: '', qualified: '', proposal: 'amber', negotiation: 'amber', won: 'green', lost: 'red' };

export default function CompanyDetail() {
  const { id } = useParams();
  const [company, setCompany] = useState(null);

  useEffect(() => { api.company(id).then(setCompany); }, [id]);

  if (!company) return <div className="loading">Loading…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ margin: '0 0 4px' }}><Link to="/companies">Companies</Link> / {company.name}</p>
          <h1>{company.name}</h1>
          <p className="sub">{company.industry || 'No industry set'} · {company.address || 'No address on file'}</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <h2>Deals ({company.deals.length})</h2>
            {company.deals.length === 0 ? <div className="empty">No deals yet.</div> : (
              <table className="list">
                <thead><tr><th>Title</th><th>Stage</th><th>Value</th></tr></thead>
                <tbody>
                  {company.deals.map((d) => (
                    <tr key={d.id}>
                      <td><Link to={`/pipeline/${d.id}`}>{d.title}</Link></td>
                      <td><span className={'pill ' + (STAGE_PILL[d.stage] || '')}>{d.stage}</span></td>
                      <td className="mono">{money(d.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>Jobs ({company.jobs.length})</h2>
            {company.jobs.length === 0 ? <div className="empty">No field jobs yet.</div> : (
              <table className="list">
                <thead><tr><th>Job</th><th>Status</th><th>Scheduled</th></tr></thead>
                <tbody>
                  {company.jobs.map((j) => (
                    <tr key={j.id}>
                      <td><Link to={`/jobs/${j.id}`}>{j.title}</Link></td>
                      <td><span className="pill">{j.status.replace('_', ' ')}</span></td>
                      <td className="muted">{shortDate(j.scheduled_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Contacts</h2>
          {company.contacts.length === 0 ? <div className="empty">No contacts yet.</div> : (
            <div className="stack" style={{ gap: 10 }}>
              {company.contacts.map((c) => (
                <div key={c.id}>
                  <Link to={`/contacts/${c.id}`} className="link-strong">{c.first_name} {c.last_name}</Link>
                  <div className="muted" style={{ fontSize: 12.5 }}>{c.title || 'Contact'}{c.email ? ` · ${c.email}` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
