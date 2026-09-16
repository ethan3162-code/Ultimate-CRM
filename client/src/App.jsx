import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
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

export default function App() {
  return (
    <Routes>
      <Route path="/approve/:token" element={<EstimateApproval />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/pipeline/:id" element={<DealDetail />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/:id" element={<ContactDetail />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/automations" element={<Automations />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/materials" element={<Materials />} />
        <Route path="/items" element={<Items />} />
        <Route path="/integrations" element={<Integrations />} />
      </Route>
    </Routes>
  );
}
