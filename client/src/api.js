const BASE = '/api';

// Server-stored usernames are always lowercase (see server/src/routes/session.js and
// server/src/routes/users.js — a login is normalized to lowercase on creation, and re-lowercased
// again at sign-in, so sign-in stays case-insensitive), but every place the app *shows* one to a
// person reads better with a capital first letter (Sept 2026). Rather than touching every render
// site across the app individually (the sidebar, Users & permissions, every "assigned to"/"owner"
// picker, chat, estimate-approval notices, and so on), this recursively capitalizes the first
// letter of any string found under a key named `username` or ending in `_username`
// (owner_username, created_by_username, updated_by_username, approved_by_username,
// assigned_username, reported_by_username, ...) on every API response, right where every one of
// them already passes through on its way back to a caller. Purely a display transform — no route
// in this app accepts a username on update (only at creation, where it's normalized back to
// lowercase), so nothing here can ever drift the stored value.
function capitalizeUsernames(value) {
  if (Array.isArray(value)) {
    for (const item of value) capitalizeUsernames(item);
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const v = value[key];
      if (typeof v === 'string' && v && (key === 'username' || key.endsWith('_username'))) {
        value[key] = v.charAt(0).toUpperCase() + v.slice(1);
      } else if (v && typeof v === 'object') {
        capitalizeUsernames(v);
      }
    }
  }
  return value;
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // A session that's expired or been logged out elsewhere — tell the app to show the login
    // screen again, rather than leaving every call on the page silently failing.
    if (res.status === 401 && path !== '/session/login' && path !== '/session/me') {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    // A permission the signed-in role just doesn't have — not every caller has its own error
    // handling, so surface it here as a safety net rather than an action silently doing nothing.
    if (res.status === 403) {
      window.alert(body.error || "Your role doesn't have permission to do that.");
    }
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return capitalizeUsernames(await res.json());
}

export const api = {
  login: (username, password) => request('/session/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/session/logout', { method: 'POST' }),
  me: () => request('/session/me'),

  users: () => request('/users'),
  createUser: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  updateUserPermissions: (id, permissions) => request(`/users/${id}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissions }) }),
  updateUserSections: (id, sections) => request(`/users/${id}/sections`, { method: 'PATCH', body: JSON.stringify({ sections }) }),
  updateUserRoles: (id, role_ids) => request(`/users/${id}/roles`, { method: 'PATCH', body: JSON.stringify({ role_ids }) }),
  // Lightweight, non-admin directory of active logins — used to populate "Owner" dropdowns on
  // Contacts/Leads/Opportunities (unlike api.users(), any signed-in role can call this).
  usersDirectory: () => request('/directory/users'),
  pendingEstimateApprovals: () => request('/directory/pending-approvals'),
  myPendingEstimates: () => request('/directory/my-pending-estimates'),

  // Internal team chat.
  chatChannels: () => request('/chat/channels'),
  createChatChannel: (data) => request('/chat/channels', { method: 'POST', body: JSON.stringify(data) }),
  chatMessages: (channelId) => request(`/chat/channels/${channelId}/messages`),
  sendChatMessage: (channelId, body) => request(`/chat/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  updateChatChannel: (channelId, data) => request(`/chat/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  leaveChatChannel: (channelId) => request(`/chat/channels/${channelId}/leave`, { method: 'POST' }),

  // Reusable, stackable permission-template "Roles" — admin only.
  roles: () => request('/roles'),
  createRole: (data) => request('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id, data) => request(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRole: (id) => request(`/roles/${id}`, { method: 'DELETE' }),

  dashboard: () => request('/dashboard'),

  companies: () => request('/companies'),
  company: (id) => request(`/companies/${id}`),
  createCompany: (data) => request('/companies', { method: 'POST', body: JSON.stringify(data) }),

  contacts: () => request('/contacts'),
  contact: (id) => request(`/contacts/${id}`),
  createContact: (data) => request('/contacts', { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (id, data) => request(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deals: () => request('/deals'),
  deal: (id) => request(`/deals/${id}`),
  createDeal: (data) => request('/deals', { method: 'POST', body: JSON.stringify(data) }),
  updateDeal: (id, data) => request(`/deals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addDealNote: (id, note) => request(`/deals/${id}/activities`, { method: 'POST', body: JSON.stringify({ note, type: 'note' }) }),

  jobs: () => request('/jobs'),
  transactions: () => request('/transactions'),
  job: (id) => request(`/jobs/${id}`),
  createJob: (data) => request('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id, data) => request(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addJobNote: (id, note) => request(`/jobs/${id}/activities`, { method: 'POST', body: JSON.stringify({ note, type: 'note' }) }),

  addAttendance: (jobId, data) => request(`/jobs/${jobId}/attendance`, { method: 'POST', body: JSON.stringify(data) }),
  deleteAttendance: (attendanceId) => request(`/jobs/attendance/${attendanceId}`, { method: 'DELETE' }),

  employees: () => request('/employees'),
  employee: (id) => request(`/employees/${id}`),
  createEmployee: (data) => request('/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id, data) => request(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEmployee: (id) => request(`/employees/${id}`, { method: 'DELETE' }),
  addEmployeeDocument: (id, data) => request(`/employees/${id}/documents`, { method: 'POST', body: JSON.stringify(data) }),
  deleteEmployeeDocument: (docId) => request(`/employees/documents/${docId}`, { method: 'DELETE' }),

  subcontractors: () => request('/subcontractors'),
  subcontractor: (id) => request(`/subcontractors/${id}`),
  createSubcontractor: (data) => request('/subcontractors', { method: 'POST', body: JSON.stringify(data) }),
  updateSubcontractor: (id, data) => request(`/subcontractors/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSubcontractor: (id) => request(`/subcontractors/${id}`, { method: 'DELETE' }),
  addSubcontractorDocument: (id, data) => request(`/subcontractors/${id}/documents`, { method: 'POST', body: JSON.stringify(data) }),
  updateSubcontractorDocument: (docId, data) => request(`/subcontractors/documents/${docId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSubcontractorDocument: (docId) => request(`/subcontractors/documents/${docId}`, { method: 'DELETE' }),
  sendRenewalRequest: (docId) => request(`/subcontractors/documents/${docId}/send-renewal-request`, { method: 'POST' }),
  renewalTemplate: () => request('/subcontractors/renewal-template'),
  updateRenewalTemplate: (data) => request('/subcontractors/renewal-template', { method: 'PUT', body: JSON.stringify(data) }),

  vehicles: () => request('/vehicles'),
  vehicle: (id) => request(`/vehicles/${id}`),
  createVehicle: (data) => request('/vehicles', { method: 'POST', body: JSON.stringify(data) }),
  updateVehicle: (id, data) => request(`/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteVehicle: (id) => request(`/vehicles/${id}`, { method: 'DELETE' }),
  addVehicleDocument: (id, data) => request(`/vehicles/${id}/documents`, { method: 'POST', body: JSON.stringify(data) }),
  updateVehicleDocument: (docId, data) => request(`/vehicles/documents/${docId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteVehicleDocument: (docId) => request(`/vehicles/documents/${docId}`, { method: 'DELETE' }),
  addVehicleMaintenance: (id, data) => request(`/vehicles/${id}/maintenance`, { method: 'POST', body: JSON.stringify(data) }),
  deleteVehicleMaintenance: (entryId) => request(`/vehicles/maintenance/${entryId}`, { method: 'DELETE' }),
  fleetLocations: () => request('/vehicles/locations/latest'),
  reportVehicleLocation: (id, data) => request(`/vehicles/${id}/location`, { method: 'POST', body: JSON.stringify(data) }),

  estimates: () => request('/estimates'),
  createEstimateForDeal: (data) => request('/estimates', { method: 'POST', body: JSON.stringify(data) }),
  createEstimate: (jobId, data) => request(`/jobs/${jobId}/estimates`, { method: 'POST', body: JSON.stringify(data) }),
  convertEstimate: (estimateId) => request(`/jobs/estimates/${estimateId}/convert`, { method: 'POST' }),
  requestDeposit: (estimateId, data) => request(`/jobs/estimates/${estimateId}/deposit`, { method: 'POST', body: JSON.stringify(data) }),
  requestEstimateApproval: (estimateId) => request(`/jobs/estimates/${estimateId}/request-approval`, { method: 'POST' }),
  approveEstimate: (estimateId) => request(`/jobs/estimates/${estimateId}/approve`, { method: 'POST' }),
  rejectEstimate: (estimateId, data) => request(`/jobs/estimates/${estimateId}/reject`, { method: 'POST', body: JSON.stringify(data || {}) }),
  sendEstimate: (estimateId, method) => request(`/jobs/estimates/${estimateId}/send`, { method: 'POST', body: JSON.stringify({ method }) }),
  signEstimateInPerson: (estimateId, data) => request(`/jobs/estimates/${estimateId}/sign`, { method: 'POST', body: JSON.stringify(data) }),
  reopenEstimate: (estimateId) => request(`/jobs/estimates/${estimateId}/reopen`, { method: 'POST' }),
  clearEstimateSignature: (estimateId) => request(`/jobs/estimates/${estimateId}/clear-signature`, { method: 'POST' }),
  updateEstimate: (estimateId, data) => request(`/jobs/estimates/${estimateId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  duplicateEstimate: (estimateId) => request(`/jobs/estimates/${estimateId}/duplicate`, { method: 'POST' }),
  deleteEstimate: (estimateId) => request(`/jobs/estimates/${estimateId}`, { method: 'DELETE' }),
  estimatePdfUrl: (estimateId) => `/api/jobs/estimates/${estimateId}/pdf`,
  declineEstimate: (token, data) => request(`/public/estimates/${token}/decline`, { method: 'POST', body: JSON.stringify(data || {}) }),

  contracts: () => request('/contracts'),
  createContract: (data) => request('/contracts', { method: 'POST', body: JSON.stringify(data) }),
  updateContract: (id, data) => request(`/contracts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  setContractDefault: (id, customerType) => request(`/contracts/${id}/set-default`, { method: 'POST', body: JSON.stringify({ customer_type: customerType }) }),
  deleteContract: (id) => request(`/contracts/${id}`, { method: 'DELETE' }),
  companySignature: () => request('/contracts/company-signature'),
  saveCompanySignature: (dataUrl) => request('/contracts/company-signature', { method: 'PUT', body: JSON.stringify({ data_url: dataUrl }) }),

  createInvoice: (jobId, data) => request(`/jobs/${jobId}/invoices`, { method: 'POST', body: JSON.stringify(data) }),
  recordPayment: (invoiceId, data) => request(`/jobs/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  sendInvoice: (invoiceId, method) => request(`/jobs/invoices/${invoiceId}/send`, { method: 'POST', body: JSON.stringify({ method }) }),
  invoicePdfUrl: (invoiceId) => `/api/jobs/invoices/${invoiceId}/pdf`,

  automations: () => request('/automations'),
  automationRuns: () => request('/automations/runs'),
  createAutomation: (data) => request('/automations', { method: 'POST', body: JSON.stringify(data) }),
  updateAutomation: (id, data) => request(`/automations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAutomation: (id) => request(`/automations/${id}`, { method: 'DELETE' }),
  automationCampaignGate: () => request('/automations/campaign-gate'),

  campaigns: () => request('/campaigns'),
  campaignCompanyName: () => request('/campaigns/company-name'),
  campaignTemplates: () => request('/campaigns/templates'),
  campaignSteps: (campaignId) => request(`/campaigns/${campaignId}/steps`),
  createCampaign: (data) => request('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  updateCampaign: (id, data) => request(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCampaign: (id) => request(`/campaigns/${id}`, { method: 'DELETE' }),
  campaignEnrollments: (campaignId) => request(`/campaigns/${campaignId}/enrollments`),
  contactCampaignEnrollments: (contactId) => request(`/campaigns/contact/${contactId}`),
  enrollInCampaign: (campaignId, contactId) => request(`/campaigns/${campaignId}/enroll`, { method: 'POST', body: JSON.stringify({ contact_id: contactId }) }),
  removeCampaignEnrollment: (enrollmentId) => request(`/campaigns/enrollments/${enrollmentId}`, { method: 'DELETE' }),

  tickets: () => request('/tickets'),
  ticket: (id) => request(`/tickets/${id}`),
  createTicket: (data) => request('/tickets', { method: 'POST', body: JSON.stringify(data) }),
  updateTicket: (id, data) => request(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addTicketNote: (id, note) => request(`/tickets/${id}/activities`, { method: 'POST', body: JSON.stringify({ note }) }),

  search: (q) => request(`/search?q=${encodeURIComponent(q)}`),

  insights: () => request('/insights'),
  reports: () => request('/reports'),
  // Fixed "built-in" reports (Sept 2026) — the old Dashboard reports-grid, now its own set of
  // clickable report pages under /reports/system/:key. See customReports below for the separate,
  // freely-editable report builder.
  builtinReports: () => request('/builtin-reports'),
  builtinReport: (key) => request(`/builtin-reports/${key}`),
  commissionPayouts: (period, anchor) => request(`/commissions?period=${period}&anchor=${anchor}`),
  aiDraft: (kind, id) => request('/ai/draft', { method: 'POST', body: JSON.stringify({ kind, id }) }),

  appointments: () => request('/appointments'),
  createAppointment: (data) => request('/appointments', { method: 'POST', body: JSON.stringify(data) }),
  updateAppointment: (id, data) => request(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAppointment: (id) => request(`/appointments/${id}`, { method: 'DELETE' }),

  googleStatus: () => request('/auth/google/status'),
  googleDisconnect: () => request('/auth/google/disconnect', { method: 'POST' }),
  // The signed-in user's OWN Google Calendar connection (per-user sync) — separate from the
  // shared company one above. Connecting is a redirect (window.location.href = '/api/auth/google/me'),
  // not a fetch, same as the company flow.
  googleMeStatus: () => request('/auth/google/me/status'),
  googleMeDisconnect: () => request('/auth/google/me/disconnect', { method: 'POST' }),

  catalogItems: () => request('/catalog-items'),
  createCatalogItem: (data) => request('/catalog-items', { method: 'POST', body: JSON.stringify(data) }),
  updateCatalogItem: (id, data) => request(`/catalog-items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCatalogItem: (id) => request(`/catalog-items/${id}`, { method: 'DELETE' }),
  bulkImportCatalogItems: (items, materialKey) => request('/catalog-items/bulk', { method: 'POST', body: JSON.stringify({ items, material_key: materialKey || null }) }),

  webhookInfo: () => request('/integrations/webhook'),
  regenerateWebhook: () => request('/integrations/webhook/regenerate', { method: 'POST' }),
  emailStatus: () => request('/integrations/email'),
  sendTestEmail: (to) => request('/integrations/email/test', { method: 'POST', body: JSON.stringify({ to }) }),
  smsStatus: () => request('/integrations/sms'),
  sendTestSms: (to) => request('/integrations/sms/test', { method: 'POST', body: JSON.stringify({ to }) }),
  answerForceStatus: () => request('/integrations/answerforce'),
  pollAnswerForceNow: () => request('/integrations/answerforce/poll', { method: 'POST' }),
  backfillAnswerForce: (since) => request('/integrations/answerforce/backfill', { method: 'POST', body: JSON.stringify({ since }) }),

  // Customer texting (Hatch-style unified inbox).
  customerConversations: () => request('/customer-messages/conversations'),
  customerMessageableContacts: () => request('/customer-messages/contacts'),
  customerThread: (contactId) => request(`/customer-messages/contact/${contactId}`),
  sendCustomerMessage: (contactId, body) => request(`/customer-messages/contact/${contactId}`, { method: 'POST', body: JSON.stringify({ body }) }),
  logInboundCustomerMessage: (contactId, body) => request(`/customer-messages/contact/${contactId}/log-inbound`, { method: 'POST', body: JSON.stringify({ body }) }),

  tasks: (params) => request(`/tasks${params ? `?${new URLSearchParams(params)}` : ''}`),
  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  addJobPhoto: (jobId, data) => request(`/jobs/${jobId}/photos`, { method: 'POST', body: JSON.stringify(data) }),
  deleteJobPhoto: (photoId) => request(`/jobs/photos/${photoId}`, { method: 'DELETE' }),

  addJobExpense: (jobId, data) => request(`/jobs/${jobId}/expenses`, { method: 'POST', body: JSON.stringify(data) }),
  deleteJobExpense: (expenseId) => request(`/jobs/expenses/${expenseId}`, { method: 'DELETE' }),

  publicEstimate: (token) => request(`/public/estimates/${token}`),
  signEstimate: (token, data) => request(`/public/estimates/${token}/sign`, { method: 'POST', body: JSON.stringify(data) }),
  publicInvoice: (token) => request(`/public/invoices/${token}`),

  // Custom report builder (Sept 2026) — distinct from `reports` above, which is the fixed
  // rollup baked into the Dashboard. These are user-created, freely editable report definitions.
  customReports: (limit) => request(`/custom-reports${limit ? `?limit=${limit}` : ''}`),
  customReportMeta: () => request('/custom-reports/meta'),
  createCustomReport: (data) => request('/custom-reports', { method: 'POST', body: JSON.stringify(data || {}) }),
  customReport: (id) => request(`/custom-reports/${id}`),
  updateCustomReport: (id, data) => request(`/custom-reports/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCustomReport: (id) => request(`/custom-reports/${id}`, { method: 'DELETE' }),
  customReportData: (id) => request(`/custom-reports/${id}/data`),

  // Home page weather panel (Sept 2026) — location is either 'nyc' or 'long_island'.
  weather: (location) => request(`/weather?location=${location}`),
};
