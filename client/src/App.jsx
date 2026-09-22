import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import ReportDetail from './pages/ReportDetail';
import Messages from './pages/Messages';
import Conversations from './pages/Conversations';
import Leads from './pages/Leads';
import Pipeline from './pages/Pipeline';
import Kanban from './pages/Kanban';
import DealDetail from './pages/DealDetail';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Jobs from './pages/Jobs';
import Transactions from './pages/Transactions';
import JobDetail from './pages/JobDetail';
import Employees from './pages/Employees';
import EmployeeDetail from './pages/EmployeeDetail';
import Subcontractors from './pages/Subcontractors';
import SubcontractorDetail from './pages/SubcontractorDetail';
import Vehicles from './pages/Vehicles';
import VehicleDetail from './pages/VehicleDetail';
import VehicleMap from './pages/VehicleMap';
import Automations from './pages/Automations';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Calendar from './pages/Calendar';
import Schedule from './pages/Schedule';
import NeedsScheduling from './pages/NeedsScheduling';
import Materials from './pages/Materials';
import Items from './pages/Items';
import PriceBook from './pages/PriceBook';
import Integrations from './pages/Integrations';
import Estimates from './pages/Estimates';
import Contracts from './pages/Contracts';
import EstimateApprovals from './pages/EstimateApprovals';
import CommissionPayouts from './pages/CommissionPayouts';
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
          <Route path="/reports" element={<Protected page="reports"><Reports /></Protected>} />
          <Route path="/reports/:id" element={<Protected page="reports"><ReportDetail /></Protected>} />
          <Route path="/leads" element={<Protected page="leads"><Leads /></Protected>} />
          <Route path="/pipeline" element={<Protected page="pipeline"><Pipeline /></Protected>} />
          <Route path="/pipeline/:id" element={<Protected page="pipeline"><DealDetail /></Protected>} />
          <Route path="/kanban" element={<Protected page="pipeline"><Kanban /></Protected>} />
          <Route path="/estimates" element={<Protected page="estimates"><Estimates /></Protected>} />
          <Route path="/contracts" element={<Protected page="contracts"><Contracts /></Protected>} />
          <Route path="/estimate-approvals" element={<EstimateApprovals />} />
          <Route path="/commissions" element={<CommissionPayouts />} />
          <Route path="/companies" element={<Protected page="companies"><Companies /></Protected>} />
          <Route path="/companies/:id" element={<Protected page="companies"><CompanyDetail /></Protected>} />
          <Route path="/contacts" element={<Protected page="contacts"><Contacts /></Protected>} />
          <Route path="/contacts/:id" element={<Protected page="contacts"><ContactDetail /></Protected>} />
          <Route path="/conversations" element={<Protected page="contacts"><Conversations /></Protected>} />
          <Route path="/conversations/:contactId" element={<Protected page="contacts"><Conversations /></Protected>} />
          <Route path="/jobs" element={<Protected page="jobs"><Jobs /></Protected>} />
          <Route path="/jobs/:id" element={<Protected page="jobs"><JobDetail /></Protected>} />
          <Route path="/transactions" element={<Protected page="transactions"><Transactions /></Protected>} />
          <Route path="/employees" element={<Protected page="employees"><Employees /></Protected>} />
          <Route path="/employees/:id" element={<Protected page="employees"><EmployeeDetail /></Protected>} />
          <Route path="/subcontractors" element={<Protected page="subcontractors"><Subcontractors /></Protected>} />
          <Route path="/subcontractors/:id" element={<Protected page="subcontractors"><SubcontractorDetail /></Protected>} />
          <Route path="/vehicles" element={<Protected page="vehicles"><Vehicles /></Protected>} />
          <Route path="/vehicles/map" element={<Protected page="vehicles"><VehicleMap /></Protected>} />
          <Route path="/vehicles/:id" element={<Protected page="vehicles"><VehicleDetail /></Protected>} />
          <Route path="/automations" element={<Protected page="automations"><Automations /></Protected>} />
          <Route path="/tickets" element={<Protected page="tickets"><Tickets /></Protected>} />
          <Route path="/tickets/:id" element={<Protected page="tickets"><TicketDetail /></Protected>} />
          <Route path="/calendar" element={<Protected page="calendar"><Calendar /></Protected>} />
          <Route path="/schedule" element={<Protected page="schedule"><Schedule /></Protected>} />
          <Route path="/needs-scheduling" element={<Protected page="schedule"><NeedsScheduling /></Protected>} />
          <Route path="/materials" element={<Protected page="materials"><Materials /></Protected>} />
          <Route path="/items" element={<Protected page="items"><Items /></Protected>} />
          <Route path="/price-book" element={<Protected page="price_book"><PriceBook /></Protected>} />
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
