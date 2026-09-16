# Ultimate CRM — Phase 1 + 2 + 3 Prototype

A working slice of the "Ultimate CRM" spec: one data graph covering contacts,
companies, deal pipeline, and field jobs with estimates → invoices → payments —
the Joist-style billing flow no sales-only CRM ships with — plus a Monday/HubSpot-style
"when → then" automation engine and Joist-style deposit billing (Phase 2), and
now a service/ticketing desk with SLA timers, a deterministic "needs attention"
risk feed, and a smart-draft writing assistant (Phase 3).

Stack: **React (Vite) + Node/Express + SQLite** (via `better-sqlite3`). No external
services, no API keys, runs entirely on your machine.

## What's included

- **Dashboard** — open pipeline value (weighted + unweighted), unpaid/overdue
  invoice totals, jobs in motion, pipeline-by-stage bars, recent activity feed.
- **Pipeline** — drag-and-drop Kanban board across 6 stages (New → Qualified →
  Proposal → Negotiation → Won/Lost), deal detail page with a note timeline.
- **Companies / Contacts** — full CRUD, with a contact detail page that pulls
  together every deal, job, and activity tied to that person on one timeline
  (the "one data graph" idea from the spec, made concrete).
- **Jobs & billing** — create a job, build an estimate with line items and tax,
  convert it to an invoice in one click, record partial/full payments, watch
  invoice status move from draft → sent → partial → paid/overdue automatically.
- **Deposits (Phase 2)** — request a deposit invoice for a percentage of any
  estimate, separate from the final invoice — Joist-style payment schedules.
- **Simulated card capture (Phase 2)** — "Charge / record payment" opens a
  card-entry modal (card / ACH / cash / check) with a simulated processing
  delay, so payment collection feels real without touching an actual payment
  network or requiring any API keys.
- **Automations (Phase 2)** — a no-code "when → then" rule builder: trigger on
  a deal reaching a stage, an invoice going overdue, an invoice being paid in
  full, or a job being marked completed; act by logging a note, sending a
  simulated email/SMS, creating a follow-up job, or moving a deal's stage.
  Every firing is recorded in an automation log and — because actions write
  into the same `activities` table as everything else — also shows up right
  in the contact/job/deal timeline it was about. Overdue invoices are checked
  every 60 seconds by the server so reminder automations fire on their own.
- **Service & tickets (Phase 3)** — support tickets linked to the same
  contact/company/job record as everything else, with priority-based SLA
  timers (urgent 4h, high 24h, medium 72h, low 168h) computed automatically
  on creation and re-computed if priority changes. A background check (same
  60-second loop as invoices) flags SLA breaches and logs them as automation
  activity. Resolving a ticket captures a 1–5 customer satisfaction score;
  a seeded automation flags low scores for personal follow-up.
- **Needs-attention insights (Phase 3)** — a dashboard panel driven by
  `GET /api/insights`: stalled deals (open, no activity in 5+ days), overdue
  invoices, SLA-breached tickets, and jobs past their scheduled date — each
  a plain, auditable SQL rule rather than an ML "risk score", so it's clear
  exactly why something surfaced.
- **Smart draft assistant (Phase 3)** — a "Draft reply/follow-up/recap"
  button on tickets and deals that composes an editable email from that
  record's own data (stage, contact, recent notes, ticket priority). This
  is template-based text generation, not a live LLM call — there's a code
  comment in `server/src/aiDraft.js` explaining the design and where a real
  model API would be wired in later. Edited drafts are logged to the
  timeline as sent with one click.

Seeded with realistic demo data (6 companies, 8 contacts, 8 deals across every
stage, 5 field jobs in various states of estimate/invoice/payment, 4 support
tickets, and 7 starter automations) so the app is useful the moment it starts,
not an empty shell.

## Run it

Requires Node 18+.

```bash
cd server
npm install
npm start
```

Open **http://localhost:4000** — the server serves the pre-built frontend
directly, so that's the only command you need.

The SQLite database (`server/data.sqlite`) ships pre-seeded. To reset it to
the original demo data at any point:

```bash
cd server
npm run seed
```

### Developing the frontend

If you want to change the UI and see it hot-reload:

```bash
cd client
npm install
npm run dev
```

This runs Vite's dev server on **http://localhost:5173** and proxies `/api`
calls to the Express server on port 4000 (start that separately with
`cd server && npm start`). When you're done, `npm run build` in `client/`
regenerates `client/dist`, which the Express server serves in production.

## Project structure

```
ultimate-crm/
├── server/
│   ├── src/
│   │   ├── db.js          # SQLite schema (companies, contacts, deals, jobs,
│   │   │                     estimates, invoices, payments, activities, tickets, automations)
│   │   ├── seed.js         # demo data
│   │   ├── helpers.js      # totals/balance calculations shared by routes
│   │   ├── automationEngine.js  # "when → then" trigger matching + dedupe
│   │   ├── insights.js     # deterministic "needs attention" rules
│   │   ├── aiDraft.js      # template-based smart draft generator
│   │   ├── routes/         # companies, contacts, deals, jobs, dashboard,
│   │   │                     tickets, automations, insights, ai
│   │   └── index.js        # Express app + static file serving + periodic checks
│   └── data.sqlite         # the database file (seeded)
└── client/
    ├── src/
    │   ├── pages/           # Dashboard, Pipeline, Companies, Contacts, Jobs,
    │   │                       Tickets, detail pages, Automations
    │   ├── components/       # Layout (sidebar nav), LineItemEditor, AiDraftModal
    │   ├── api.js            # fetch wrapper for the REST API
    │   └── styles.css        # design tokens (color/type) shared across the app
    └── dist/                 # pre-built production bundle
```

## What's deliberately not in this prototype

This is Phase 1 + 2 + 3 of the roadmap in the spec doc — the core relationship
graph, field ops/billing, deposits, the automation engine, ticketing/SLAs,
the needs-attention insights feed, and the smart-draft assistant. Not yet
built: marketing automation as a standalone module (email sequences,
landing pages), a real LLM-backed copilot (the current draft assistant is
deterministic templates, by design — see `server/src/aiDraft.js`),
auth/multi-tenancy, and real payment processing (card charges are simulated
— no Stripe/processor is wired up, on purpose, since this environment can't
hold real API keys). Cloud hosting is also intentionally deferred until
the feature set is further along. See the spec doc for the full phased
build-out.
