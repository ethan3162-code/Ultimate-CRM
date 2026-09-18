const BASE = '/api';

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
  return res.json();
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

  jobs: () => request('/jobs'),
  job: (id) => request(`/jobs/${id}`),
  createJob: (data) => request('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id, data) => request(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

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

  createEstimate: (jobId, data) => request(`/jobs/${jobId}/estimates`, { method: 'POST', body: JSON.stringify(data) }),
  convertEstimate: (estimateId) => request(`/jobs/estimates/${estimateId}/convert`, { method: 'POST' }),
  requestDeposit: (estimateId, data) => request(`/jobs/estimates/${estimateId}/deposit`, { method: 'POST', body: JSON.stringify(data) }),
  requestEstimateApproval: (estimateId) => request(`/jobs/estimates/${estimateId}/request-approval`, { method: 'POST' }),
  approveEstimate: (estimateId) => request(`/jobs/estimates/${estimateId}/approve`, { method: 'POST' }),
  rejectEstimate: (estimateId, data) => request(`/jobs/estimates/${estimateId}/reject`, { method: 'POST', body: JSON.stringify(data || {}) }),
  createInvoice: (jobId, data) => request(`/jobs/${jobId}/invoices`, { method: 'POST', body: JSON.stringify(data) }),
  recordPayment: (invoiceId, data) => request(`/jobs/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(data) }),

  automations: () => request('/automations'),
  automationRuns: () => request('/automations/runs'),
  createAutomation: (data) => request('/automations', { method: 'POST', body: JSON.stringify(data) }),
  updateAutomation: (id, data) => request(`/automations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAutomation: (id) => request(`/automations/${id}`, { method: 'DELETE' }),

  tickets: () => request('/tickets'),
  ticket: (id) => request(`/tickets/${id}`),
  createTicket: (data) => request('/tickets', { method: 'POST', body: JSON.stringify(data) }),
  updateTicket: (id, data) => request(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addTicketNote: (id, note) => request(`/tickets/${id}/activities`, { method: 'POST', body: JSON.stringify({ note }) }),

  insights: () => request('/insights'),
  reports: () => request('/reports'),
  aiDraft: (kind, id) => request('/ai/draft', { method: 'POST', body: JSON.stringify({ kind, id }) }),

  appointments: () => request('/appointments'),
  createAppointment: (data) => request('/appointments', { method: 'POST', body: JSON.stringify(data) }),
  updateAppointment: (id, data) => request(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAppointment: (id) => request(`/appointments/${id}`, { method: 'DELETE' }),

  googleStatus: () => request('/auth/google/status'),
  googleDisconnect: () => request('/auth/google/disconnect', { method: 'POST' }),

  catalogItems: () => request('/catalog-items'),
  createCatalogItem: (data) => request('/catalog-items', { method: 'POST', body: JSON.stringify(data) }),
  updateCatalogItem: (id, data) => request(`/catalog-items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCatalogItem: (id) => request(`/catalog-items/${id}`, { method: 'DELETE' }),

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
};
