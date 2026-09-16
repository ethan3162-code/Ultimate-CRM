const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  dashboard: () => request('/dashboard'),

  companies: () => request('/companies'),
  company: (id) => request(`/companies/${id}`),
  createCompany: (data) => request('/companies', { method: 'POST', body: JSON.stringify(data) }),

  contacts: () => request('/contacts'),
  contact: (id) => request(`/contacts/${id}`),
  createContact: (data) => request('/contacts', { method: 'POST', body: JSON.stringify(data) }),

  deals: () => request('/deals'),
  deal: (id) => request(`/deals/${id}`),
  createDeal: (data) => request('/deals', { method: 'POST', body: JSON.stringify(data) }),
  updateDeal: (id, data) => request(`/deals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  jobs: () => request('/jobs'),
  job: (id) => request(`/jobs/${id}`),
  createJob: (data) => request('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id, data) => request(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  createEstimate: (jobId, data) => request(`/jobs/${jobId}/estimates`, { method: 'POST', body: JSON.stringify(data) }),
  convertEstimate: (estimateId) => request(`/jobs/estimates/${estimateId}/convert`, { method: 'POST' }),
  requestDeposit: (estimateId, data) => request(`/jobs/estimates/${estimateId}/deposit`, { method: 'POST', body: JSON.stringify(data) }),
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
  aiDraft: (kind, id) => request('/ai/draft', { method: 'POST', body: JSON.stringify({ kind, id }) }),

  appointments: () => request('/appointments'),
  createAppointment: (data) => request('/appointments', { method: 'POST', body: JSON.stringify(data) }),
  updateAppointment: (id, data) => request(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAppointment: (id) => request(`/appointments/${id}`, { method: 'DELETE' }),

  googleStatus: () => request('/auth/google/status'),
  googleDisconnect: () => request('/auth/google/disconnect', { method: 'POST' }),
};
