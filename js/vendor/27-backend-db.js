(function () {
  'use strict';
  if (!window.FOS_BACKEND_URL) return;
  const base = window.FOS_BACKEND_URL.replace(/\/$/, '');
  const tokenKey = 'fos_server_token';
  const request = async (path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    const token = localStorage.getItem(tokenKey);
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };
  window.FOS_API = { request };
  window.DB = {
    init: () => true,
    isOnline: () => true,
    escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); },
    async login(username, password) {
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      localStorage.setItem(tokenKey, data.token);
      return data.user;
    },
    async registerStudent(payload) {
      const data = await request('/auth/register-student', { method: 'POST', body: JSON.stringify(payload) });
      localStorage.setItem(tokenKey, data.token);
      return { ok: true, user: data.user };
    },
    async verifyPassword(_username, password) {
      try { return !!(await request('/auth/verify-password', { method: 'POST', body: JSON.stringify({ password }) })).valid; } catch (_) { return false; }
    },
    async changePassword(_username, currentPassword, newPassword) {
      return request('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
    },
    async listUsers() { return (await request('/users')).users || []; },
    async createUser(payload) { return request('/users', { method: 'POST', body: JSON.stringify(payload) }); },
    async createStaffAccount(payload) { return this.createUser(payload); },
    async importStudents(rows, sourceName) { return request('/imports/students', { method: 'POST', body: JSON.stringify({ rows, source_name: sourceName }) }); },
    async importGrades(studentCode, rows, sourceName) { return request('/imports/grades', { method: 'POST', body: JSON.stringify({ student_code: String(studentCode), rows, source_name: sourceName }) }); },
    async listFormTypes() { return (await request('/forms')).forms || []; },
    async listFormFields(formId) { return (await request(`/forms/${encodeURIComponent(formId)}/fields`)).fields || []; },
    async getPeriods() { return (await request('/periods')).periods || {}; },
    async setPeriod(formId, isOpen) { return request(`/periods/${encodeURIComponent(formId)}`, { method: 'PATCH', body: JSON.stringify({ is_open: !!isOpen }) }); },
    async listFaculty() { return (await request('/faculty')).faculty || []; },
    async createFacultyAccount(id, password, username) { return request(`/faculty/${id}/account`, { method: 'POST', body: JSON.stringify({ password, username }) }); },
    async listDepartments() { return (await request('/departments')).departments || []; },
    async listStudents(filters = {}) {
      const rows = (await request('/students?' + new URLSearchParams(filters))).students || [];
      return rows.map(s => ({ ...s, id: s.id, name: s.name, full_name: s.name, code: s.student_number, username: s.student_number, student_code: s.student_number, program: s.program, gpa: s.gpa == null ? null : Number(s.gpa), completedHours: s.completed_hours ?? 0 }));
    },
    async listAssignments() { return (await request('/assignments')).assignments || []; },
    async listAdvisors() { return (await request('/advisors')).advisors || []; },
    async getMyAdvisor() { return (await request('/my-advisor')).advisor || null; },
    async setAssignment(studentId, advisorId, notes) {
      const body = { notes };
      if (/^\d+$/.test(String(studentId))) { body.student_id = Number(studentId); body.student_code = String(studentId); } else body.student_code = String(studentId);
      if (/^\d+$/.test(String(advisorId))) body.advisor_id = Number(advisorId); else body.advisor_username = String(advisorId);
      return request('/assignments', { method: 'POST', body: JSON.stringify(body) });
    },
    async assignAdvisor(studentId, advisorId, notes) { return this.setAssignment(studentId, advisorId, notes); },
    async loadGrades(studentCode) { return (await request(`/students/${encodeURIComponent(studentCode)}/grades`)).grades || []; },
    async updateStudentAcademic(code, patch) { return request(`/students/${encodeURIComponent(code)}/academic`, { method: 'PATCH', body: JSON.stringify(patch) }); },
    async updateStudentImport(code, data) { const result = await this.importStudents([{ ...data, code }], 'student-import'); return { ...result, ok: Number(result.updated || 0) === 1, error: result.rejected?.[0]?.errors?.join('؛ ') || null }; },
    async listApplications(filters = {}) {
      const query = new URLSearchParams();
      if (filters.studentCode) query.set('studentCode', filters.studentCode);
      if (filters.status) query.set('status', filters.status);
      const rows = (await request('/applications?' + query.toString())).applications || [];
      return rows.map(mapApplication);
    },
    async listMyApplications() { return this.listApplications({}); },
    async listStaffInboxApps() { return this.listApplications({}); },
    async getApplicationDetail(id) {
      const data = await request(`/applications/${encodeURIComponent(id)}`);
      return { ...mapApplication(data.application), history: (data.history || []).map(mapHistory) };
    },
    async loadHistory(id) {
      const data = await request(`/applications/${encodeURIComponent(id)}`);
      return (data.history || []).map(mapHistory);
    },
    async createApplication(req) {
      const data = await request('/applications', { method: 'POST', body: JSON.stringify(req) });
      return { ok: true, application_id: data.application_id, application: data.application };
    },
    async submitApplication(formCode, data, hasTranscript) {
      return this.createApplication({ type: formCode, formTitle: data.formTitle || formCode, ...data, hasTranscript });
    },
    async uploadTranscript(applicationId, file) {
      const form = new FormData(); form.append('file', file, file.name);
      return request(`/applications/${encodeURIComponent(applicationId)}/transcript`, { method: 'POST', body: form });
    },
    async updateApplication(id, patch, historyEntry) {
      return request(`/applications/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, note: historyEntry?.note, action: historyEntry?.action }) });
    },
    async transitionApplication(id, action, note) {
      const statusMap = { approve: 'executed', execute: 'executed', reject: 'rejected', cancel: 'cancelled', next: 'pending_coordinator' };
      return this.updateApplication(id, { status: statusMap[action] || action }, { note, action });
    },
    async listNotifications() { return (await request('/notifications')).notifications || []; },
    async markNotificationsRead(id) { return request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }); },
    async pushNotification(targetUsername, body, metadata = {}) { return request('/notifications', { method: 'POST', body: JSON.stringify({ target_username: targetUsername, body, title: metadata.title || 'تنبيه جديد', entity_type: metadata.entity_type || null, entity_id: metadata.entity_id || null }) }); },
    async refreshSupportCases() { return request('/support/refresh', { method: 'POST' }); },
    async getSupportSummary() { return (await request('/support/summary')).summary || {}; },
    async listSupportCases(filters = {}) { return (await request('/support/cases?' + new URLSearchParams(filters))).cases || []; },
    async updateSupportCase(id, patch) { return request(`/support/cases/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }); },
    async assignSupportCase(id, advisorId) { return request(`/support/cases/${encodeURIComponent(id)}/assign`, { method: 'POST', body: JSON.stringify({ advisor_id: advisorId }) }); },
    async createSupportPlan(caseId, plan) { return request(`/support/cases/${encodeURIComponent(caseId)}/plans`, { method: 'POST', body: JSON.stringify(plan) }); },
    async listSupportPlans(caseId) { return (await request(`/support/cases/${encodeURIComponent(caseId)}/plans`)).plans || []; },
    async createSupportAction(planId, action) { return request(`/support/plans/${encodeURIComponent(planId)}/actions`, { method: 'POST', body: JSON.stringify(action) }); },
    async listConversations() { return (await request('/conversations')).conversations || []; },
    async createConversation(data) { return request('/conversations', { method: 'POST', body: JSON.stringify(data) }); },
    async listMessages(id) { return (await request(`/conversations/${encodeURIComponent(id)}/messages`)).messages || []; },
    async sendMessage(id, body) { return request(`/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ body }) }); }
  };
  function mapApplication(r) {
    const metadata = r.request_metadata || {};
    return { id: r.id, type: r.form_type, formTitle: r.form_title, studentName: r.student_name, studentCode: r.student_code,
      level: r.level, program: r.program, year: r.academic_year, semester: r.semester, courses: r.courses || [],
      studentNotes: r.student_notes, academicRequest: metadata.academicRequest || null, declarationAccepted: !!metadata.declarationAccepted,
      transcript: r.transcript_path ? { name: r.transcript_name, data: r.transcript_path, type: 'remote' } : null,
      status: r.status, currentStep: r.current_step, advisorUsername: r.advisor_username, createdAt: r.created_at, updatedAt: r.updated_at, history: [], talent: metadata.talent || null };
  }
  function mapHistory(h) { return { step: h.step_key || h.action, by: h.actor_username || h.actor_name, role: h.actor_role, action: h.action, note: h.note, at: h.created_at }; }
})();
