import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Messages from './pages/Messages';
import Conversations from './pages/Conversations';
import Leads from './pages/Leads';
import Pipeline from './pages/Pipeline';
import DealDetail from './pages/DealDetail';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Automations from './pages/Automations';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Calendar from './pages/Calendar';
import Schedule from './pages/Schedule';
import Materials from './pages/Materials';
import Items from './pages/Items';
import Integrations from './pages/Integrations';
import EstimateApproval from './pages/EstimateApproval';
import InvoiceView from './pages/InvoiceView';
import Users from './pages/Users';
import Login from './pages/Login';
import { AuthProvider, useAuth, Protected } from './auth';

function AuthedApp() {
  const { user, loading, logout } = useAuth();

  // A session that expired or was logged out elsewhere (see api.js) — drop back to the login
  // screen instead of leaving every action on the page silently failing.
  useEffect(() => {
    const onExpired = () => logout();
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [logout]);

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <Routes>
      <Route path="/approve/:token" element={<EstimateApproval />} />
      <Route path="/invoice/:token" element={<InvoiceView />} />
      {!user ? (
        <Route path="*" element={<Login />} />
      ) : (
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/dashboard" element={<Protected page="dashboard"><Dashboard /></Protected>} />
          <Route path="/leads" element={<Protected page="leads"><Leads /></Protected>} />
          <Route path="/pipeline" element={<Protected page="pipeline"><Pipeline /></Protected>} />
          <Route path="/pipeline/:id" element={<Protected page="pipeline"><DealDetail /></Protected>} />
          <Route path="/companies" element={<Protected page="companies"><Companies /></Protected>} />
          <Route path="/companies/:id" element={<Protected page="companies"><CompanyDetail /></Protected>} />
          <Route path="/contacts" element={<Protected page="contacts"><Contacts /></Protected>} />
          <Route path="/contacts/:id" element={<Protected page="contacts"><ContactDetail /></Protected>} />
          <Route path="/conversations" element={<Protected page="contacts"><Conversations /></Protected>} />
          <Route path="/conversations/:contactId" element={<Protected page="contacts"><Conversations /></Protected>} />
          <Route path="/jobs" element={<Protected page="jobs"><Jobs /></Protected>} />
          <Route path="/jobs/:id" element={<Protected page="jobs"><JobDetail /></Protected>} />
          <Route path="/automations" element={<Protected page="automations"><Automations /></Protected>} />
          <Route path="/tickets" element={<Protected page="tickets"><Tickets /></Protected>} />
          <Route path="/tickets/:id" element={<Protected page="tickets"><TicketDetail /></Protected>} />
          <Route path="/calendar" element={<Protected page="calendar"><Calendar /></Protected>} />
          <Route path="/schedule" element={<Protected page="schedule"><Schedule /></Protected>} />
          <Route path="/materials" element={<Protected page="materials"><Materials /></Protected>} />
          <Route path="/items" element={<Protected page="items"><Items /></Protected>} />
          <Route path="/integrations" element={<Protected page="integrations"><Integrations /></Protected>} />
          <Route path="/users" element={<Protected page="users"><Users /></Protected>} />
        </Route>
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthedApp />
    </AuthProvider>
  );
}
