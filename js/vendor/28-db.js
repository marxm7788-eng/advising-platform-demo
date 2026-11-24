/**
 * طبقة البيانات — Supabase
 * تستبدل localStorage عند توفر الاتصال
 */
(function () {
  'use strict';

  let client = null;
  let online = false;
  const LOCAL_ONLY_BUNDLE = true;

  function init() {
    if (LOCAL_ONLY_BUNDLE || window.FOS_MODE === 'local') {
      client = null;
      online = false;
      return false;
    }
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      console.warn('Supabase SDK أو الإعدادات غير متوفرة — الوضع المحلي');
      return false;
    }
    if (window.FOS_MODE === 'local') {
      console.info('FOS_MODE=local — التشغيل محلي بدون Supabase');
      return false;
    }
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    online = true;
    return true;
  }

  async function login(username, password) {
    if (!online) return null;
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .or(`username.eq.${username},student_code.eq.${username}`)
      .eq('password_hash', password)
      .eq('is_active', true)
      .maybeSingle();
    if (error) { console.error(error); return null; }
    if (!data) return null;
    return mapProfile(data);
  }

  async function registerStudent(payload) {
    if (!online) return { ok: false, error: 'offline' };
    const row = {
      username: payload.code,
      password_hash: payload.password,
      full_name: payload.name,
      role: 'student',
      student_code: payload.code,
      level: payload.level,
      program_id: payload.program,
      dept_id: payload.dept || null,
      phone: payload.phone || null,
      completed_hours: payload.completedHours || 0,
      is_active: true
    };
    const { data, error } = await client.from('profiles').insert(row).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, user: mapProfile(data) };
  }

  function mapProfile(p) {
    /* لا نُرجع كلمة المرور أبداً إلى الواجهة */
    return {
      username: p.username,
      name: p.full_name,
      role: p.role,
      code: p.student_code,
      level: p.level,
      program: p.program_id,
      dept: p.dept_id,
      phone: p.phone,
      email: p.email,
      advisor: p.advisor_username || null,
      gpa: p.gpa == null || p.gpa === '' ? null : Number(p.gpa),
      is_active: p.is_active !== false,
      completedHours: p.completed_hours || 0,
      totalHours: p.total_hours || 140,
      grades: []
    };
  }

  /** التحقق من كلمة المرور دون إرجاعها */
  async function verifyPassword(username, password) {
    if (!online || !client) return false;
    try {
      const { data, error } = await client
        .from('profiles')
        .select('id')
        .or(`username.eq.${username},student_code.eq.${username}`)
        .eq('password_hash', password)
        .eq('is_active', true)
        .maybeSingle();
      if (error) return false;
      return !!data;
    } catch (e) {
      return false;
    }
  }

  async function createUser(payload) {
    if (!online) return { ok: false, error: 'offline' };
    const row = {
      username: payload.username,
      password_hash: payload.password,
      full_name: payload.name,
      role: payload.role || 'student',
      student_code: payload.code || (payload.role === 'student' ? payload.username : null),
      level: payload.level || null,
      program_id: payload.program || null,
      dept_id: payload.dept || null,
      phone: payload.phone || null,
      is_active: true
    };
    const { data, error } = await client.from('profiles').insert(row).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, user: mapProfile(data) };
  }

  async function loadGrades(studentCode) {
    if (!online || !studentCode) return [];
    const { data } = await client.from('student_grades').select('*').eq('student_code', studentCode);
    return (data || []).map(g => ({ code: g.course_code, grade: g.grade, hours: g.hours }));
  }

  async function listApplications(filters = {}) {
    if (!online) return [];
    let q = client.from('applications').select('*').order('created_at', { ascending: false });
    if (filters.studentCode) q = q.eq('student_code', filters.studentCode);
    if (filters.advisor) q = q.eq('advisor_username', filters.advisor);
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return (data || []).map(mapApp);
  }

  function mapApp(r) {
    return {
      id: r.id,
      type: r.form_type,
      formTitle: r.form_title,
      studentName: r.student_name,
      studentCode: r.student_code,
      level: r.level,
      program: r.program,
      year: r.academic_year,
      semester: r.semester,
      courses: r.courses || [],
      studentNotes: r.student_notes,
      academicRequest: (r.request_metadata && r.request_metadata.academicRequest) || null,
      declarationAccepted: !!(r.request_metadata && r.request_metadata.declarationAccepted),
      transcript: r.transcript_path ? { name: r.transcript_name, data: r.transcript_path, type: 'remote' } : null,
      status: r.status,
      currentStep: r.current_step,
      advisorUsername: r.advisor_username,
      createdAt: r.created_at,
      updatedAt: r.updated_at || r.created_at,
      history: [],
      talent: (r.request_metadata && r.request_metadata.talent) || null
    };
  }

  async function loadHistory(appId) {
    if (!online) return [];
    const { data } = await client
      .from('application_history')
      .select('*')
      .eq('application_id', appId)
      .order('created_at', { ascending: true });
    return (data || []).map(h => ({
      step: h.step_key,
      by: h.actor_name,
      role: h.actor_role,
      action: h.action,
      note: h.note,
      at: h.created_at
    }));
  }

  async function createApplication(req) {
    if (!online) return { ok: false };
    const row = {
      id: req.id,
      form_type: req.type,
      form_title: req.formTitle,
      student_name: req.studentName,
      student_code: req.studentCode,
      level: req.level,
      program: req.program,
      academic_year: req.year,
      semester: req.semester,
      courses: req.courses || [],
      student_notes: req.studentNotes || '',
      phone: req.phone || null,
      completed_hours: Number.isFinite(Number(req.completedHours)) ? Number(req.completedHours) : null,
      registered_hours: Number.isFinite(Number(req.registeredHours)) ? Number(req.registeredHours) : null,
      request_metadata: {
        declarationAccepted: !!req.declarationAccepted,
        dropCourses: req.dropCourses || [],
        addCourses: req.addCourses || [],
        academicRequest: req.academicRequest || null,
        talent: req.talent || null
      },
      transcript_path: req.transcript?.data || null,
      transcript_name: req.transcript?.name || null,
      status: req.status || 'pending_advisor',
      current_step: req.currentStep || 0,
      advisor_username: req.advisorUsername
    };
    const { error } = await client.from('applications').insert(row);
    if (error) return { ok: false, error: error.message };
    await client.from('application_history').insert({
      application_id: req.id,
      step_key: 'submit',
      actor_name: req.studentName,
      actor_role: 'student',
      action: 'submit',
      note: req.studentNotes || ''
    });
    return { ok: true };
  }

  async function updateApplication(id, patch, historyEntry) {
    if (!online) return { ok: false };
    const row = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.currentStep !== undefined) row.current_step = patch.currentStep;
    if (patch.requestMetadata !== undefined) row.request_metadata = patch.requestMetadata;
    row.updated_at = new Date().toISOString();
    const { error } = await client.from('applications').update(row).eq('id', id);
    if (error) return { ok: false, error: error.message };
    if (historyEntry) {
      await client.from('application_history').insert({
        application_id: id,
        step_key: historyEntry.step,
        actor_name: historyEntry.by,
        actor_role: historyEntry.role,
        action: historyEntry.action,
        note: historyEntry.note || ''
      });
    }
    return { ok: true };
  }

  async function getPeriods() {
    if (!online) return null;
    const { data } = await client.from('periods').select('*');
    if (!data) return null;
    const o = {};
    data.forEach(p => { o[p.form_id] = p.is_open; });
    return o;
  }

  async function setPeriod(formId, isOpen) {
    if (!online) return;
    await client.from('periods').upsert({ form_id: formId, is_open: isOpen, updated_at: new Date().toISOString() });
  }

  async function getAssignments() {
    if (!online) return {};
    const { data } = await client.from('advisor_assignments').select('*');
    const o = {};
    (data || []).forEach(a => { o[a.student_code] = a.advisor_username; });
    return o;
  }

  async function setAssignment(studentCode, advisorUsername) {
    if (!online) return { ok: false, error: 'قاعدة البيانات غير متصلة.' };
    const code = String(studentCode), advisor = String(advisorUsername);
    const { data: student, error: studentError } = await client.from('profiles').select('student_code,advisor_username')
      .eq('student_code', code).eq('role', 'student').maybeSingle();
    if (studentError) return { ok: false, error: studentError.message };
    if (!student) return { ok: false, error: 'لم يُعثر على ملف الطالب لتحديث الإسناد.' };
    const { data: advisorProfile, error: advisorError } = await client.from('profiles').select('username')
      .eq('username', advisor).eq('role', 'advisor').eq('is_active', true).maybeSingle();
    if (advisorError) return { ok: false, error: advisorError.message };
    if (!advisorProfile) return { ok: false, error: 'حساب المرشد غير موجود أو غير مفعّل.' };
    const { data: oldAssignment, error: readAssignmentError } = await client.from('advisor_assignments')
      .select('student_code,advisor_username').eq('student_code', code).maybeSingle();
    if (readAssignmentError) return { ok: false, error: readAssignmentError.message };
    const { error: assignError } = await client.from('advisor_assignments').upsert(
      { student_code: code, advisor_username: advisor }, { onConflict: 'student_code' }
    );
    if (assignError) return { ok: false, error: assignError.message };
    const { data, error } = await client.from('profiles').update({ advisor_username: advisor })
      .eq('student_code', code).eq('role', 'student').select('student_code').maybeSingle();
    if (!error && data) return { ok: true };
    let rollbackError = null;
    if (oldAssignment) {
      const rollback = await client.from('advisor_assignments').upsert(oldAssignment, { onConflict: 'student_code' });
      rollbackError = rollback.error;
    } else {
      const rollback = await client.from('advisor_assignments').delete().eq('student_code', code);
      rollbackError = rollback.error;
    }
    const message = error ? error.message : 'لم يُعثر على ملف الطالب لتحديث الإسناد.';
    return { ok: false, error: rollbackError ? message + ' كما تعذر التراجع عن التحديث الجزئي: ' + rollbackError.message : message };
  }
  async function updateStudentAcademic(studentCode, patch) {
    if (!online) return { ok: false, error: 'قاعدة البيانات غير متصلة.' };
    const row = { gpa: patch.gpa == null ? null : Number(patch.gpa) };
    if (patch.program !== undefined) row.program_id = patch.program || null;
    if (patch.dept !== undefined) row.dept_id = patch.dept || null;
    const { data, error } = await client.from('profiles').update(row).eq('student_code', String(studentCode))
      .eq('role', 'student').select('student_code').maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'لم يُعثر على ملف الطالب لتحديثه.' };
    return { ok: true };
  }
  async function updateStudentImport(studentCode, data) {
    if (!online) return { ok: false, error: 'قاعدة البيانات غير متصلة.' };
    const row = {};
    const map = {
      name: 'full_name', level: 'level', program: 'program_id', dept: 'dept_id',
      phone: 'phone', gpa: 'gpa', completedHours: 'completed_hours',
      advisor: 'advisor_username'
    };
    Object.keys(map).forEach(key => {
      if (data[key] !== undefined && String(data[key]).trim() !== '') row[map[key]] = data[key];
    });
    const { data: updated, error } = await client.from('profiles').update(row)
      .eq('student_code', String(studentCode)).eq('role', 'student').select('student_code').maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: 'لم يُعثر على ملف الطالب لتحديثه.' };
    return { ok: true };
  }

  async function listStudents() {
    if (!online) return [];
    const { data } = await client.from('profiles').select('*').eq('role', 'student').order('full_name');
    return (data || []).map(mapProfile);
  }

  async function listUsers() {
    if (!online) return [];
    const { data } = await client.from('profiles').select('*').order('role');
    return (data || []).map(mapProfile);
  }

  async function pushNotification(to, message) {
    if (!online || !to) return;
    await client.from('notifications').insert({ to_username: to, message });
  }

  async function listNotifications(username) {
    if (!online) return [];
    const { data } = await client
      .from('notifications')
      .select('*')
      .eq('to_username', username)
      .order('created_at', { ascending: false })
      .limit(50);
    return (data || []).map(n => ({
      id: n.id, to: n.to_username, text: n.message, read: n.is_read, at: n.created_at
    }));
  }

  async function markNotificationsRead(username) {
    if (!online) return;
    await client.from('notifications').update({ is_read: true }).eq('to_username', username).eq('is_read', false);
  }

  async function getSiteContent() {
    if (!online) return null;
    const { data } = await client.from('site_content').select('*');
    if (!data) return null;
    const o = {};
    data.forEach(r => { o[r.key] = r.value; });
    return o;
  }

  async function saveSiteContent(obj) {
    if (!online) return;
    const rows = Object.entries(obj).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
    await client.from('site_content').upsert(rows);
  }

  async function changePassword(username, newPass) {
    if (!online) return { ok: false };
    const { error } = await client.from('profiles').update({ password_hash: newPass }).eq('username', username);
    return { ok: !error, error: error?.message };
  }

  window.DB = {
    init, isOnline: () => online,
    login, registerStudent, loadGrades, verifyPassword, createUser,
    listApplications, loadHistory, createApplication, updateApplication,
    getPeriods, setPeriod, getAssignments, setAssignment, updateStudentAcademic, updateStudentImport,
    listStudents, listUsers,
    pushNotification, listNotifications, markNotificationsRead,
    getSiteContent, saveSiteContent, changePassword
  };
})();
