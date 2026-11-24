/**
 * Local Store — تشغيل كامل بدون Supabase
 * البيانات في localStorage تحت المفتاح fos_local_*
 * لاحقاً: عند تفعيل CLOUD = true يُستخدم db.js (Supabase)
 */
(function () {
  'use strict';

  const PREFIX = 'fos_local_';

  function read(key, def) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v ? JSON.parse(v) : def;
    } catch (e) { return def; }
  }
  function write(key, val) {
    localStorage.setItem(PREFIX + key, JSON.stringify(val));
  }

  function uid() {
    return 'loc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function ensureSeed() {
    if (read('seeded', false)) return;
    const roles = [
      { id: 'admin', code: 'admin', name_ar: 'مدير النظام', is_system: true, permissions: ['*'] },
      { id: 'advisor', code: 'advisor', name_ar: 'مرشد أكاديمي', is_system: false, permissions: ['students.view', 'applications.view', 'applications.approve', 'applications.reject', 'assignments.view'] },
      { id: 'coordinator', code: 'coordinator', name_ar: 'منسق', is_system: false, permissions: ['students.view', 'applications.view', 'applications.approve', 'applications.reject'] },
      { id: 'manager', code: 'manager', name_ar: 'مدير الوحدة', is_system: false, permissions: ['students.view', 'applications.view', 'applications.approve', 'applications.reject', 'periods.manage'] },
      { id: 'affairs', code: 'affairs', name_ar: 'شؤون الطلاب', is_system: false, permissions: ['students.view', 'applications.view', 'applications.execute', 'reports.export'] },
      { id: 'dean', code: 'dean', name_ar: 'عميد الكلية', is_system: false, permissions: ['students.view', 'applications.view', 'reports.view', 'content.view'] },
      { id: 'vice', code: 'vice', name_ar: 'وكيل الكلية', is_system: false, permissions: ['students.view', 'applications.view', 'applications.approve', 'reports.view'] },
      { id: 'student', code: 'student', name_ar: 'طالب', is_system: false, permissions: ['applications.create', 'applications.view', 'academic.view', 'forms.view'] }
    ];
    write('roles', roles);

    const users = [{
      id: 'u_admin', username: 'admin', password: 'admin123', name: 'مدير النظام',
      email: 'admin@local', role: 'admin', roles: [{ code: 'admin' }], permissions: ['*'],
      is_active: true, is_student: false
    }];
    write('users', users);
    write('assignments', {});
    write('applications', []);
    write('notifications', []);
    write('periods', {});
    write('seeded', true);
  }

  function publicUser(u) {
    if (!u) return null;
    const o = Object.assign({}, u);
    delete o.password;
    return o;
  }

  function login(identifier, password) {
    ensureSeed();
    const users = read('users', []);
    const id = String(identifier || '').trim();
    const u = users.find(function (x) {
      return (x.username === id || x.code === id || x.email === id) && x.password === password && x.is_active !== false;
    });
    if (!u) return { ok: false, error: 'بيانات الدخول غير صحيحة' };
    const safe = publicUser(u);
    write('session', { userId: u.id });
    return { ok: true, user: safe };
  }

  function registerStudent(payload) {
    ensureSeed();
    const users = read('users', []);
    const code = String(payload.code || '').trim();
    if (users.some(function (u) { return u.code === code || u.username === code; })) {
      return { ok: false, error: 'كود الطالب مسجّل مسبقاً' };
    }
    const nu = {
      id: uid(),
      username: code,
      password: payload.password,
      name: payload.name,
      email: code + '@local',
      phone: payload.phone || '',
      role: 'student',
      roles: [{ code: 'student' }],
      permissions: ['applications.create', 'applications.view', 'academic.view', 'forms.view'],
      is_active: true,
      is_student: true,
      code: code,
      level: payload.level || 'المستوى الأول',
      program: payload.program || '',
      dept: payload.dept || '',
      gpa: 0,
      completedHours: payload.completedHours || 0,
      totalHours: 140,
      advisorId: null,
      advisorName: null
    };
    users.push(nu);
    write('users', users);
    write('session', { userId: nu.id });
    return { ok: true, user: publicUser(nu) };
  }

  function loadSession() {
    ensureSeed();
    const s = read('session', null);
    if (!s || !s.userId) return null;
    const users = read('users', []);
    const u = users.find(function (x) { return x.id === s.userId; });
    if (!u || u.is_active === false) return null;
    return publicUser(u);
  }

  function logout() {
    try { localStorage.removeItem(PREFIX + 'session'); } catch (e) {}
  }

  function changePassword(userId, currentPassword, newPassword) {
    const users = read('users', []);
    const i = users.findIndex(function (x) { return x.id === userId; });
    if (i < 0) return { ok: false, error: 'مستخدم غير موجود' };
    if (users[i].password !== currentPassword) return { ok: false, error: 'كلمة المرور الحالية خاطئة' };
    users[i].password = newPassword;
    write('users', users);
    return { ok: true };
  }

  function listUsers() {
    return read('users', []).map(publicUser);
  }

  function createStaff(payload) {
    ensureSeed();
    const users = read('users', []);
    if (users.some(function (u) { return u.username === payload.username || u.email === payload.email; })) {
      return { ok: false, error: 'المستخدم موجود مسبقاً' };
    }
    const roleCode = payload.roleCode || 'advisor';
    const roles = read('roles', []);
    const role = roles.find(function (r) { return r.code === roleCode; });
    const nu = {
      id: uid(),
      username: payload.username,
      password: payload.password || '123456',
      name: payload.name,
      email: payload.email || (payload.username + '@local'),
      phone: payload.phone || '',
      role: roleCode,
      roles: [{ code: roleCode }],
      permissions: (role && role.permissions) || [],
      is_active: true,
      is_student: false
    };
    users.push(nu);
    write('users', users);
    return { ok: true, user: publicUser(nu) };
  }

  function submitApplication(formCode, data, hasTranscript, studentUser) {
    ensureSeed();
    if (!studentUser || !studentUser.is_student) return { ok: false, error: 'للطلاب فقط' };
    const apps = read('applications', []);
    const num = 'APP-L-' + Date.now().toString().slice(-8);
    const steps = ['advisor_review', 'coordinator_review', 'manager_review', 'affairs_execute'];
    const app = {
      id: uid(),
      application_number: num,
      public_code: num,
      form_code: formCode,
      form_name: formCode,
      student_id: studentUser.id,
      student_code: studentUser.code,
      student_name: studentUser.name,
      status: 'submitted',
      current_step: 0,
      current_step_key: steps[0],
      data: data || {},
      has_transcript: !!hasTranscript,
      history: [{ action: 'submit', actor: studentUser.name, at: new Date().toISOString(), note: null }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    apps.unshift(app);
    write('applications', apps);

    // notify advisor
    const notes = read('notifications', []);
    if (studentUser.advisorId) {
      notes.unshift({
        id: uid(), to: studentUser.advisorId, title: 'طلب جديد',
        message: 'طلب ' + num + ' من ' + studentUser.name,
        read: false, created_at: new Date().toISOString()
      });
    }
    notes.unshift({
      id: uid(), to: studentUser.id, title: 'تم تقديم الطلب',
      message: 'رقم الطلب ' + num, read: false, created_at: new Date().toISOString()
    });
    write('notifications', notes);
    return { ok: true, application_id: app.id, application_number: num };
  }

  function transitionApplication(appId, action, note, actor) {
    ensureSeed();
    const apps = read('applications', []);
    const i = apps.findIndex(function (a) { return a.id === appId; });
    if (i < 0) return { ok: false, error: 'الطلب غير موجود' };
    const app = apps[i];
    const steps = ['advisor_review', 'coordinator_review', 'manager_review', 'affairs_execute'];

    if (action === 'reject') {
      if (!note) return { ok: false, error: 'سبب الرفض مطلوب' };
      app.status = 'rejected';
      app.current_step_key = null;
    } else if (action === 'execute') {
      app.status = 'executed';
      app.current_step_key = null;
    } else if (action === 'approve') {
      const next = (app.current_step || 0) + 1;
      if (next >= steps.length) {
        app.status = 'approved';
        app.current_step_key = null;
      } else {
        app.status = 'in_review';
        app.current_step = next;
        app.current_step_key = steps[next];
      }
    } else if (action === 'return') {
      app.status = 'submitted';
      app.current_step = Math.max(0, (app.current_step || 0) - 1);
      app.current_step_key = steps[app.current_step];
    } else {
      return { ok: false, error: 'إجراء غير مدعوم' };
    }

    app.history = app.history || [];
    app.history.push({
      action: action,
      actor: actor && actor.name,
      at: new Date().toISOString(),
      note: note || null
    });
    app.updated_at = new Date().toISOString();
    apps[i] = app;
    write('applications', apps);

    const notes = read('notifications', []);
    notes.unshift({
      id: uid(), to: app.student_id, title: 'تحديث الطلب ' + app.application_number,
      message: 'تم: ' + action + (note ? ' — ' + note : ''),
      read: false, created_at: new Date().toISOString()
    });
    write('notifications', notes);
    return { ok: true, status: app.status };
  }

  function listApplications(filter) {
    ensureSeed();
    let apps = read('applications', []);
    if (filter && filter.studentId) {
      apps = apps.filter(function (a) { return a.student_id === filter.studentId || a.student_code === filter.studentId; });
    }
    if (filter && filter.inbox) {
      apps = apps.filter(function (a) { return a.status === 'submitted' || a.status === 'in_review'; });
    }
    return apps;
  }

  function getApplication(id) {
    return read('applications', []).find(function (a) { return a.id === id; }) || null;
  }

  function assignAdvisor(studentCode, advisorId) {
    ensureSeed();
    const users = read('users', []);
    const st = users.find(function (u) { return u.code === studentCode || u.username === studentCode; });
    const adv = users.find(function (u) { return u.id === advisorId || u.username === advisorId; });
    if (!st) return { ok: false, error: 'طالب غير موجود' };
    if (!adv) return { ok: false, error: 'مرشد غير موجود' };
    st.advisorId = adv.id;
    st.advisorName = adv.name;
    write('users', users);
    const asg = read('assignments', {});
    asg[st.code] = adv.id;
    write('assignments', asg);
    return { ok: true };
  }

  function notificationsFor(userId) {
    return read('notifications', []).filter(function (n) { return n.to === userId; });
  }

  function resetAll() {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf(PREFIX) === 0) localStorage.removeItem(k);
    });
    ensureSeed();
  }

  window.LocalStore = {
    ensureSeed: ensureSeed,
    login: login,
    registerStudent: registerStudent,
    loadSession: loadSession,
    logout: logout,
    changePassword: changePassword,
    listUsers: listUsers,
    createStaff: createStaff,
    submitApplication: submitApplication,
    transitionApplication: transitionApplication,
    listApplications: listApplications,
    getApplication: getApplication,
    assignAdvisor: assignAdvisor,
    notificationsFor: notificationsFor,
    resetAll: resetAll,
    read: read,
    write: write
  };
})();
