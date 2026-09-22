import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { money, shortDate, dateTime, isoDate, accountName, mapLinks } from '../utils';
import { CUSTOMER_TYPES } from '../constants';
import FilterBar from '../components/FilterBar';

const BLANK_FILTERS = { owner: '', customer_type: '', score: '' };
const SCORE_OPTIONS = ['Hot', 'Warm', 'Cool', 'Won', 'Lost'];

const STAGE_LABELS = { new: 'New', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const STAGE_TEXT = { new: 'muted', qualified: 'muted', proposal: 'amber', negotiation: 'amber', won: 'green', lost: 'red' };
const SCORE_ROW_CLASS = { Hot: 'row-hot', Warm: 'row-warm', Cool: '' };

export default function Pipeline() {
  const [allDeals, setAllDeals] = useState([]);
  const [filters, setFilters] = useState(BLANK_FILTERS);

  function load() {
    api.deals().then(setAllDeals);
  }
  useEffect(load, []);

  // Leads (stage 'new') live on their own page — this board is the qualified
  // pipeline onward, so filter them out everywhere below.
  const qualifiedDeals = useMemo(() => allDeals.filter((d) => d.stage !== 'new'), [allDeals]);

  // Owner list reflects who's actually assigned across today's opportunities, rather than a
  // fixed constant, same reasoning as the Leads page's owner filter.
  const ownerOptions = useMemo(() => (
    [...new Set(qualifiedDeals.map((d) => d.owner_username).filter(Boolean))].sort().map((o) => ({ value: o, label: o }))
  ), [qualifiedDeals]);

  const filterDefs = [
    { key: 'owner', label: 'Owner', options: ownerOptions },
    { key: 'customer_type', label: 'Customer type', options: CUSTOMER_TYPES.map((t) => ({ value: t, label: t })) },
    { key: 'score', label: 'Score', options: SCORE_OPTIONS.map((s) => ({ value: s, label: s })) },
  ].filter((f) => f.options.length > 0);

  // Applied here, once, so every view (Kanban/Table/Calendar) sees the same filtered set —
  // filtering this board narrows what's on it everywhere, not just one view of it.
  const deals = useMemo(() => qualifiedDeals.filter((d) => (
    (!filters.owner || d.owner_username === filters.owner) &&
    (!filters.customer_type || d.customer_type === filters.customer_type) &&
    (!filters.score || d.label === filters.score)
  )), [qualifiedDeals, filters]);
  const filtersActive = Object.values(filters).some(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Opportunities</h1>
          <p className="sub">
            Qualified deals only — an opportunity is created automatically once a lead gets an appointment scheduled, so there's
            no way to add one directly here. Scan everything below, or drag a card across the whole funnel on the <Link to="/kanban">Pipeline</Link> board.
            {' '}<Link to="/leads">New, unqualified leads live here →</Link>
          </p>
        </div>
      </div>

      {filterDefs.length > 0 && (
        <FilterBar
          filters={filterDefs} values={filters}
          onChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
          onClear={() => setFilters(BLANK_FILTERS)}
        />
      )}

      <div className="table-wrap">
        <table className="list deal-table">
          <thead>
            <tr>
              <th>Opportunity Name</th><th>Account Name</th><th>Stage</th><th>Created Date</th><th>Close Date</th>
              <th>Owner</th><th>Project Type</th><th>Amount</th>
              <th>Score</th><th>Phone</th><th>Address</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const links = deal.customer_address ? mapLinks(deal.customer_address) : null;
              const account = accountName(deal, deal.title);
              const oppName = `Opportunity - ${account} - ${isoDate(deal.created_at)}`;
              return (
                <tr key={deal.id} className={SCORE_ROW_CLASS[deal.label] || ''}>
                  <td className="title-cell"><Link to={`/pipeline/${deal.id}`} className="link-strong">{oppName}</Link></td>
                  <td className="muted">{account}</td>
                  <td><span className={'status-text ' + (STAGE_TEXT[deal.stage] || 'muted')}>{STAGE_LABELS[deal.stage]}</span></td>
                  <td className="muted">{dateTime(deal.created_at)}</td>
                  <td className="muted">{shortDate(deal.expected_close)}</td>
                  <td className="muted">{deal.owner_username || '—'}</td>
                  <td className="muted">{deal.customer_type || '—'}</td>
                  <td className="mono">{deal.value ? money(deal.value) : '—'}</td>
                  <td>{deal.label && <span className={'score-text ' + deal.label.toLowerCase()}>{deal.label} · {deal.score}</span>}</td>
                  <td className="muted">{deal.customer_phone || '—'}</td>
                  <td className="muted">
                    {links ? (
                      <a href={links.view} target="_blank" rel="noreferrer" className="map-link" title="View on Google Maps (satellite)">
                        📍 {deal.customer_address}
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
            {deals.length === 0 && <tr><td colSpan={11}><div className="empty">{filtersActive ? 'No opportunities match your filters.' : 'No deals yet.'}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
