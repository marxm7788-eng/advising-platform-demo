/**
 * Faculty of Science Digital Platform — Sohag University
 * Core application (offline-capable demo with localStorage persistence)
 */
(function () {
  'use strict';

  // This handover bundle is local-only; never switch to a remote data source.
  window.FOS_MODE = window.FOS_BACKEND_URL ? 'server' : 'local';

  const S = window.FOS_SEED;
  const K = (k) => 'fos_v2_' + k;
  let _gpaState = { section: '', program: '', terms: [] };
  let _gpaMode = '';
  let _gpaImport = null;
  const GPA_SECTIONS = [
    { id: 'biological', label: 'شعبة العلوم البيولوجية' },
    { id: 'physical', label: 'شعبة العلوم الفيزيائية' },
    { id: 'geological', label: 'شعبة العلوم الجيولوجية' },
    { id: 'special', label: 'البرامج الخاصة' }
  ];
  const load = (k, d) => { try { const v = localStorage.getItem(K(k)); return v ? JSON.parse(v) : d; } catch { return d; } };
  const save = (k, v) => {
    try { localStorage.setItem(K(k), JSON.stringify(v)); }
    catch (err) {
      // Requests may contain large base64 attachments. Keep metadata in localStorage only.
      if (k === 'requests' && Array.isArray(v)) {
        const compact = v.map(r => {
          const copy = Object.assign({}, r);
          if (copy.transcript && copy.transcript.data) {
            copy.transcript = { name: copy.transcript.name || 'السجل الدراسي', type: copy.transcript.type || 'application/octet-stream', storedSeparately: true };
          }
          return copy;
        });
        try { localStorage.setItem(K(k), JSON.stringify(compact)); return; }
        catch (retryErr) { console.error('تعذر حفظ الطلبات محليًا بسبب امتلاء مساحة المتصفح', retryErr); throw retryErr; }
      }
      throw err;
    }
  };

  // Large files belong in IndexedDB, not localStorage (which has a small quota).
  function storeLocalAttachment(id, dataUrl) {
    return new Promise((resolve, reject) => {
      try {
        if (!('indexedDB' in window)) return reject(new Error('المتصفح لا يدعم التخزين المحلي للمرفقات'));
        const request = indexedDB.open('fos-portal-attachments', 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files'); };
        request.onerror = () => reject(request.error || new Error('تعذر فتح مخزن المرفقات'));
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put(dataUrl, id);
          tx.oncomplete = () => { db.close(); resolve(true); };
          tx.onerror = () => { db.close(); reject(tx.error || new Error('تعذر حفظ المرفق')); };
        };
      } catch (e) { reject(e); }
    });
  }
  /** لا تحفظ كلمة المرور في الجلسة أو في كائن المستخدم المعروض */
  function stripSecrets(user) {
    if (!user || typeof user !== 'object') return user;
    const u = Object.assign({}, user);
    delete u.password;
    delete u.password_hash;
    return u;
  }
  function saveSession(user) {
    const safe = stripSecrets(user);
    save('session', safe);
    return safe;
  }

  /* ===== RBAC Engine ===== */
  function loadRoles() {
    const saved = load('roles', null);
    if (saved && Array.isArray(saved) && saved.length) {
      let changed = false;
      saved.forEach(role => {
        if (!Array.isArray(role.pages)) return;
        const cleaned = role.pages.filter(id => !['academic-structure','admin-settings','settings'].includes(id));
        if (role.id === 'admin' && !cleaned.includes('imports')) cleaned.push('imports');
        if (role.id === 'admin' && !cleaned.includes('local-backup')) cleaned.push('local-backup');
        if (role.id === 'student' && !cleaned.includes('student-voice')) cleaned.push('student-voice');
        if (role.id === 'admin' && !cleaned.includes('voice-admin')) cleaned.push('voice-admin');
        if (role.id === 'dean' && !cleaned.includes('voice-dean')) cleaned.push('voice-dean');
        if (cleaned.length !== role.pages.length || cleaned.some((id, i) => id !== role.pages[i])) { role.pages = cleaned; changed = true; }
      });
      if (changed) save('roles', saved);
      return saved;
    }
    const defs = (window.FOS_RBAC && FOS_RBAC.defaultRoles) ? JSON.parse(JSON.stringify(FOS_RBAC.defaultRoles)) : [];
    save('roles', defs);
    return defs;
  }
  function saveRoles(roles) { save('roles', roles); }

  function getRole(roleId) {
    return loadRoles().find(r => r.id === roleId) || null;
  }

  function roleName(roleId) {
    const r = getRole(roleId);
    return r ? r.nameAr : (roleId || '—');
  }

  /** ROLES map for backward compatibility */
  function ROLES_MAP() {
    const m = {};
    loadRoles().forEach(r => { m[r.id] = r.nameAr; });
    return m;
  }
  // Proxy-like access: ROLES[x] via getter object rebuilt each time
  let ROLES = new Proxy({}, {
    get(_t, prop) {
      if (prop === Symbol.toStringTag) return 'Object';
      const r = getRole(prop);
      return r ? r.nameAr : prop;
    },
    ownKeys() { return loadRoles().map(r => r.id); },
    getOwnPropertyDescriptor() { return { enumerable: true, configurable: true }; }
  });

  function can(actionId) {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    const role = getRole(currentUser.role);
    if (!role || !role.actions) return false;
    return !!role.actions[actionId];
  }

  function canPage(pageId) {
    if (!currentUser) return false;
    if (pageId === 'academic-structure' || pageId === 'admin-settings') return false;
    if (pageId === 'voice-dean') return currentUser.role === 'dean' || currentUser.role === 'admin';
    if (pageId === 'voice-admin') return currentUser.role === 'admin';
    if (pageId === 'student-voice') return currentUser.role === 'student' || currentUser.role === 'admin';
    if (pageId === 'imports' || pageId === 'transcripts') return currentUser.role === 'admin';
    if (pageId === 'ss-new' || pageId === 'ss-track') return true;
    if (pageId === 'ss-desk') return ['affairs','vice','dean','manager','admin'].includes(currentUser.role);
    if (pageId === 'talent-admin') return currentUser.role === 'admin';
    if (pageId === 'faculty-management') return currentUser.role === 'admin';
    if (pageId === 'talent-program') return currentUser.role === 'student' || currentUser.role === 'admin';
    if (pageId === 'local-backup') return currentUser.role === 'admin';
    if (pageId === 'settings') return false;
    if (pageId === 'student-profile' || pageId === 'notifications') return true;
    if (currentUser.role === 'admin') return true;
    const role = getRole(currentUser.role);
    if (!role) return false;
    return (role.pages || []).includes(pageId);
  }

  function getNavigationPages() {
    const pages = (window.FOS_RBAC && FOS_RBAC.pages) || [];
    const items = pages.filter(page => canPage(page.id)).map(page => ({ id: page.id, title: viewTitle(page.id), group: page.group }));
    if (canPage('admin-dashboard')) items.unshift({ id: 'admin-dashboard', title: viewTitle('admin-dashboard'), group: 'إدارة' });
    return items;
  }

  function getEnvironmentStatus() {
    const isOnline = !!(window.DB && typeof DB.isOnline === 'function' && DB.isOnline());
    const isLocal = window.FOS_MODE === 'local';
    return { isOnline, isLocal, mode: isLocal ? 'local' : isOnline ? 'online' : 'offline' };
  }

  function ensureRolesInited() {
    loadRoles(); // forces seed if missing
  }


  let currentUser = null;
  let currentView = null;
  let currentFormType = null;
  let transcriptData = null;
  let addDropTranscriptData = [];
  let detailBack = null;

  

  function getDemoUsers() {
    return [{ username: 'admin', password: 'admin123', role: 'admin', name: 'مدير النظام' }];
  }

  function ensureLocalDemoUsers() {
    try {
      // حساب عرض واحد فقط. احذف أسماء حسابات العرض القديمة المعروفة، مع إبقاء بقية بيانات المنصة كما هي.
      let users = load('users', []);
      if (!Array.isArray(users)) users = [];
      const retiredDemoNames = new Set(['advisor', 'affairs', 'dean', '2023001']);
      users = users.filter(u => !retiredDemoNames.has(String(u.username || '').toLowerCase()) && !retiredDemoNames.has(String(u.code || '').toLowerCase()));
      const demo = getDemoUsers()[0];
      const admin = users.find(u => String(u.username || '').toLowerCase() === 'admin');
      if (admin) {
        admin.role = 'admin';
        admin.name = admin.name || demo.name;
        if (!admin.password) admin.password = demo.password;
      } else users.unshift(Object.assign({}, demo));
      save('users', users);
    } catch (e) {
      console.error('ensureLocalDemoUsers', e);
    }
  }

  function initDB() {
    if (!load('inited')) {
      /* لا نستورد حسابات/كلمات مرور من seed.js — أمان */
      save('users', []);
      save('assignments', S.assignments || {});
      save('periods', S.periods || []);
      save('requests', []);
      save('notifications', []);
      save('siteContent', S.siteContent || {});
      save('inited', true);
      if (window.FOS_MODE === 'local') ensureLocalDemoUsers();
      ensureRolesInited();
    }
    /* يضمن الحساب التجريبي الوحيد في النسخة المحلية. */
    try {
      const online = window.DB && typeof DB.isOnline === 'function' && DB.isOnline();
      if (!online && window.FOS_MODE === 'local') ensureLocalDemoUsers();
    } catch (e) { /* ignore */ }
  }

  function toast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast ' + type + ' show';
    setTimeout(() => el.classList.remove('show'), 3200);
  }

  function setAuthLoading(active, mode = 'login') {
    const overlay = document.getElementById('auth-loading-overlay');
    const title = document.getElementById('auth-loading-title');
    const copy = document.getElementById('auth-loading-copy');
    if (!overlay) return;
    if (title) title.textContent = mode === 'logout' ? 'جاري تسجيل الخروج' : 'جاري تسجيل الدخول';
    if (copy) copy.textContent = mode === 'logout' ? 'يتم إنهاء الجلسة بأمان...' : 'يتم التحقق من بياناتك، يرجى الانتظار...';
    overlay.hidden = !active;
    document.body.classList.toggle('auth-loading-open', active);
  }

  function setButtonLoading(button, active, label) {
    if (!button) return;
    if (active) {
      button.dataset.loadingLabel = button.innerHTML;
      button.disabled = true;
      button.classList.add('is-loading');
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + label;
    } else {
      button.disabled = false;
      button.classList.remove('is-loading');
      if (button.dataset.loadingLabel) button.innerHTML = button.dataset.loadingLabel;
    }
  }

  // ===== GPA Engine =====
  function letterPoints(letter) {
    const g = S.gradeScale.find(x => x.letter === letter);
    return g ? g.points : 0;
  }
  function calcGPA(grades) {
    if (!grades || !grades.length) return { gpa: 0, hours: 0, points: 0, earnedHours: 0, excludedHours: 0, failedHours: 0 };
    let pts = 0, hrs = 0, earned = 0, exclHrs = 0, failedHrs = 0;
    grades.forEach(g => {
      const h = Number(g.hours) || 0;
      if (h <= 0) return;
      const code = String(g.code || '').trim().toUpperCase();
      const failed = g.grade === 'F' || g.grade === 'رل';
      if (code === 'UR001' || code === 'UR002') { exclHrs += h; if (!failed) earned += h; return; }
      if (!S.gradeScale.some(x => x.letter === g.grade)) return;
      pts += letterPoints(g.grade) * h;
      hrs += h;
      if (failed) failedHrs += h; else earned += h;
    });
    return { gpa: hrs ? Math.round((pts / hrs) * 1000) / 1000 : 0, hours: hrs, points: pts, earnedHours: earned, excludedHours: exclHrs, failedHours: failedHrs };
  }

  // ===== Auth =====
  
  function onRegDeptChange() {
    const sec = document.getElementById('reg-dept')?.value;
    const sel = document.getElementById('reg-program');
    if (!sel) return;
    sel.innerHTML = '<option value="">— اختر البرنامج —</option>';
    if (!sec) return;
    // من الخطط الرسمية أولاً
    const SP = window.FOS_STUDY_PLANS;
    if (SP && SP.programs) {
      const names = Object.keys(SP.programs).filter(n => SP.programs[n].section === sec)
        .sort((a,b) => a.localeCompare(b, 'ar'));
      names.forEach(n => {
        const o = document.createElement('option');
        o.value = n; o.textContent = SP.programs[n].name || n;
        sel.appendChild(o);
      });
      return;
    }
    const list = (S.programs || []).filter(p => p.section === sec || (sec === 'special' && p.type === 'special'));
    list.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.nameAr;
      sel.appendChild(o);
    });
  }

  function resetAuthForms() {
    const lf = document.getElementById('login-form'); if (lf) lf.reset();
    const rf = document.getElementById('register-form'); if (rf) rf.reset();
    const bar = document.getElementById('password-strength-bar'); if (bar) { bar.style.width = '0%'; bar.style.background = '#cbd5e1'; }
    const st = document.getElementById('password-strength-text'); if (st) st.textContent = '';
    const sp = document.getElementById('password-strength-percent'); if (sp) sp.textContent = '';
    const hint = document.getElementById('password-match-text'); if (hint) { hint.textContent = ''; hint.className = 'password-match-text'; }
    const conf = document.getElementById('reg-password-confirm'); if (conf) { conf.classList.remove('is-match', 'is-mismatch'); conf.setCustomValidity(''); }
  }

    function showHome() {
    const home = document.getElementById('lp-home');
    const auth = document.getElementById('lp-auth');
    if (home) home.classList.remove('hidden');
    if (auth) auth.classList.add('hidden');
    resetAuthForms();
    try { history.replaceState(null, '', location.pathname + location.search); } catch(e) {}
  }

  function showAuth(tab) {
    const home = document.getElementById('lp-home');
    const auth = document.getElementById('lp-auth');
    if (home) home.classList.add('hidden');
    if (auth) auth.classList.remove('hidden');
    resetAuthForms();
    if (tab === 'register') switchTab('register');
    else switchTab('login');
    setTimeout(() => {
      const el = document.getElementById(tab === 'register' ? 'reg-name' : 'login-user');
      if (el) el.focus();
    }, 200);
  }

  function updateLocalDemoUI() {
    const localOnly = window.FOS_MODE === 'local';
    ['landing-register-btn', 'tab-register'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });
    const note = document.getElementById('local-demo-note');
    if (note) note.classList.add('hidden');
  }

  function switchTab(tab) {
    const login = document.getElementById('login-form');
    const reg = document.getElementById('register-form');
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    const note = document.getElementById('local-demo-note');
    if (note) note.classList.toggle('hidden', window.FOS_MODE !== 'local' || tab !== 'register' || window.FOS_SHOW_ENVIRONMENT_STATUS === false);
    if (tab === 'register') {
      login.classList.add('hidden');
      reg.classList.remove('hidden');
      reg.style.animation = 'cardIn .4s ease';
    } else {
      reg.classList.add('hidden');
      login.classList.remove('hidden');
      login.style.animation = 'cardIn .4s ease';
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value;
    if (!u || !p) return toast('أدخل اسم المستخدم وكلمة المرور', 'err');
    const button = document.querySelector('#login-form button[type="submit"]');
    setAuthLoading(true, 'login');
    setButtonLoading(button, true, 'جاري التحقق');
    await new Promise(resolve => window.setTimeout(resolve, 180));
    let user = null;
    try {
      if (window.FOS_MODE === 'local') {
        ensureLocalDemoUsers();
        const users = load('users', []);
        user = users.find(function (x) {
          return String(x.username || '').toLowerCase() === u.toLowerCase() && String(x.password) === String(p) && x.is_active !== false;
        }) || null;
      } else {
        if (!(window.DB && DB.isOnline && DB.isOnline())) {
          toast('تعذر الاتصال بخدمة تسجيل الدخول. لم يتم استخدام حساب محلي بديل.', 'err');
        } else {
          user = await DB.login(u, p);
          if (user && user.role === 'student') user.grades = await DB.loadGrades(user.code || user.username);
        }
      }
    } catch (err) { console.warn(err); }
    if (!user) {
      toast('بيانات الدخول غير صحيحة، راجع الكود وكلمة المرور', 'err');
      setAuthLoading(false, 'login');
      setButtonLoading(button, false);
      return;
    }
    currentUser = saveSession(user);
    setAuthLoading(false, 'login');
    setButtonLoading(button, false);
    toast('تم تسجيل الدخول');
    showGreeting('hi', (currentUser && (currentUser.name || currentUser.full_name || currentUser.username)) || '');
    window.setTimeout(enterApp, 650);
  }


  function updatePasswordStrength() {
    const input = document.getElementById('reg-password');
    const bar = document.getElementById('password-strength-bar');
    const text = document.getElementById('password-strength-text');
    const percent = document.getElementById('password-strength-percent');
    if (!input || !bar || !text || !percent) return;
    const value = input.value;
    let score = 0;
    if (value.length >= 6) score++;
    if (value.length >= 10) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    const levels = [
      { label: 'ضعيفة جدًا', width: '12%', color: '#ef4444' },
      { label: 'ضعيفة', width: '28%', color: '#f97316' },
      { label: 'متوسطة', width: '52%', color: '#eab308' },
      { label: 'جيدة', width: '76%', color: '#14b8a6' },
      { label: 'قوية', width: '100%', color: '#059669' }
    ];
    if (!value) { bar.style.width = '0%'; text.textContent = ''; percent.textContent = ''; bar.style.background = '#cbd5e1'; return; }
    const level = levels[Math.min(score, 4)];
    bar.style.width = level.width; bar.style.background = level.color;
    text.textContent = level.label; percent.textContent = level.width;
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (window.FOS_MODE === 'local') return toast('إنشاء حسابات الطلاب يتطلب تفعيل المصادقة الرسمية؛ حساب العرض المحلي مخصص لمدير النظام فقط.', 'err');
    const name = document.getElementById('reg-name').value.trim();
    const code = document.getElementById('reg-code').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-password-confirm')?.value || '';
    const level = 'المستوى الأول';
    const hours = 0;
    const phone = (document.getElementById('reg-phone')?.value || '').trim();
    const deptSection = '';
    const program = null;
    if (password !== confirmPassword) {
      document.getElementById('reg-password-confirm')?.setCustomValidity('كلمتا المرور غير متطابقتين');
      document.getElementById('reg-password-confirm')?.reportValidity();
      return toast('كلمتا المرور غير متطابقتين', 'err');
    }
    if (!/^\d{4,}$/.test(code)) return toast('كود الطالب يجب أن يكون أرقاماً (4 على الأقل)', 'err');
    if (!/^01[0-9]{9}$/.test(phone)) return toast('رقم الهاتف يجب أن يكون 11 رقماً ويبدأ بـ 01', 'err');
    if (!name) return toast('أدخل الاسم رباعي', 'err');
    const prog = null;
    if (window.FOS_MODE !== 'local' && !(window.DB && DB.isOnline && DB.isOnline())) return toast('خدمة التسجيل غير متاحة الآن. لم يتم حفظ بياناتك محليًا.', 'err');
    if (window.FOS_MODE !== 'local' && window.DB && DB.isOnline()) {
      const res = await DB.registerStudent({ name, code, password, level, program, dept: prog ? prog.dept : deptSection, phone, completedHours: hours });
      if (!res.ok) return toast(res.error || 'فشل التسجيل — ربما الكود مستخدم', 'err');
      currentUser = saveSession(res.user);
      toast('تم إنشاء الحساب على السحابة');
      enterApp();
      return;
    }
    const users = load('users', []);
    if (users.some(x => x.code === code || x.username === code)) return toast('كود الطالب مسجل مسبقاً', 'err');
    const nu = {
      username: code, password, role: 'student', name, code, level, program,
      dept: null,
      phone, advisor: load('assignments', {})[code] || null,
      gpa: 0, completedHours: hours, totalHours: 140, grades: []
    };
    users.push(nu);
    save('users', users);
    /* كلمة المرور تبقى في قائمة users المحلية للتحقق فقط — ليست في الجلسة */
    currentUser = saveSession(nu);
    toast('تم إنشاء الحساب بنجاح');
    enterApp();
  }

  function showGreeting(kind, name, done) {
    const old = document.getElementById('greet-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'greet-overlay';
    ov.className = 'greet-overlay';
    ov.setAttribute('role', 'status');
    ov.innerHTML = '<div class="greet-box"><div class="greet-brand"><img class="greet-logo" src="assets/13-university-logo.png" alt="" /><div class="greet-brand-titles"><div class="greet-brand-title">المنصة الرقمية لكلية العلوم</div><div class="greet-brand-sub">جامعة سوهاج</div></div><img class="greet-logo" src="assets/8-faculty-logo.png" alt="" /></div><div class="greet-word">' + (kind === 'bye' ? 'وداعاً' : 'أهلاً') + '</div>' + (name ? '<div class="greet-name">' + arEsc(name) + '</div>' : '') + '</div>';
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    window.setTimeout(() => {
      ov.classList.remove('show');
      window.setTimeout(() => ov.remove(), 400);
      if (typeof done === 'function') done();
    }, kind === 'bye' ? 1500 : 1800);
  }

  let logoutReturnFocus = null;

  function logout() {
    const dialog = document.getElementById('logout-confirm');
    if (!dialog) return confirmLogout();
    logoutReturnFocus = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('logout-confirm-open');
    window.setTimeout(() => document.getElementById('cancel-logout')?.focus(), 0);
  }

  function cancelLogout() {
    const dialog = document.getElementById('logout-confirm');
    if (dialog) dialog.hidden = true;
    document.body.classList.remove('logout-confirm-open');
    const restore = logoutReturnFocus;
    logoutReturnFocus = null;
    restore?.focus?.();
  }

  function confirmLogout() {
    const dialog = document.getElementById('logout-confirm');
    if (dialog) dialog.hidden = true;
    document.body.classList.remove('logout-confirm-open');
    logoutReturnFocus = null;
    const button = document.getElementById('confirm-logout');
    setAuthLoading(true, 'logout');
    setButtonLoading(button, true, 'جاري الخروج');
    window.setTimeout(() => {
      const byeName = (currentUser && (currentUser.name || currentUser.full_name || currentUser.username)) || '';
      currentUser = null;
      localStorage.removeItem(K('session'));
      document.getElementById('app').classList.remove('admin-mode');
      document.getElementById('app').classList.add('hidden');
      document.getElementById('landing').classList.remove('hidden');
      document.getElementById('sidebar')?.classList.remove('open');
      renderLanding();
      showHome();
      window.PortalShell?.updateEnvironment();
      setButtonLoading(button, false);
      setAuthLoading(false, 'logout');
      showGreeting('bye', byeName);
    }, 480);
  }

  function enterApp() {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    // Admin-only presentation layer: visual changes are scoped and do not alter other roles.
    document.getElementById('app').classList.toggle('admin-mode', !!currentUser && currentUser.role === 'admin');
    document.getElementById('user-chip-name').textContent = currentUser.name || currentUser.full_name || currentUser.username || 'حساب المستخدم';
    document.getElementById('user-chip-role').textContent = roleName(currentUser.role);
    const avatar = document.getElementById('user-chip-avatar');
    if (avatar) avatar.textContent = String(currentUser.name || currentUser.full_name || currentUser.username || 'م').trim().slice(0, 1) || 'م';
    buildSidebar();
    updateNotifBadge();
    const home = defaultView();
    navigate(home);
    window.PortalShell?.updateEnvironment();
    // طلب إذن الإشعارات مرة واحدة بهدوء (لا يُزعج إن رُفض)
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        setTimeout(() => {
          // لا نفتح نافذة الإذن تلقائياً بدون تفاعل — نعرض تلميحاً فقط
          if (myNotifs().filter(n => !n.read).length)
            toast('لديك إشعارات جديدة — يمكنك تفعيل إشعارات الجهاز من صفحة الإشعارات');
        }, 1500);
      }
    } catch (e) {}
  }

  function defaultView() {
    if (!currentUser) return 'student-dashboard';
    const preferred = {
      student: 'student-dashboard',
      advisor: 'staff-inbox',
      coordinator: 'staff-inbox',
      manager: 'staff-inbox',
      vice: 'staff-inbox',
      affairs: 'staff-inbox',
      dean: 'dean-dashboard',
      admin: 'admin-dashboard'
    };
    const pick = preferred[currentUser.role] || 'student-dashboard';
    if (canPage(pick)) return pick;
    const role = getRole(currentUser.role);
    const pages = (role && role.pages) || [];
    return pages[0] || 'student-profile';
  }

  // ===== Navigation =====
  function buildSidebar() {
    const nav = document.getElementById('sidebar-nav');
    if (nav) nav.classList.toggle('student-nav-polish', !!currentUser && currentUser.role === 'student');
    const catalog = [
      { section: 'الرئيسية' },
      { id: 'admin-dashboard', icon: 'fa-th-large', label: 'مركز مدير النظام' },
      { id: 'student-dashboard', icon: 'fa-home', label: 'القائمة الرئيسية' },
      { id: 'study-plan', icon: 'fa-sitemap', label: 'الخطط الدراسية' },
      { id: 'gpa-calc', icon: 'fa-calculator', label: 'حاسبة المعدل' },
      { id: 'talent-program', icon: 'fa-star', label: 'برنامج دعم الموهوبين' },
      { section: 'الخدمات' },
      { id: 'forms-list', icon: 'fa-file-alt', label: 'النماذج والطلبات' },
      { id: 'my-requests', icon: 'fa-list-check', label: 'طلباتي' },
      { id: 'services', icon: 'fa-th-large', label: 'خدمات إلكترونية' },
      { id: 'student-voice', icon: 'fa-comment-dots', label: 'صوت الطالب' },
      { id: 'conversations', icon: 'fa-comments', label: 'المحادثات' },
      { section: 'خدمات الطلاب والخريجين' },
      { id: 'ss-new', icon: 'fa-file-circle-plus', label: 'تقديم طلب' },
      { id: 'ss-track', icon: 'fa-location-dot', label: 'متابعة طلب' },
      { id: 'ss-desk', icon: 'fa-inbox', label: 'إدارة الطلبات' },
      { section: 'العمل' },
      { id: 'staff-inbox', icon: 'fa-inbox', label: 'صندوق الطلبات' },
      { id: 'students-search', icon: 'fa-search', label: 'البحث عن طالب' },
      { id: 'export-print', icon: 'fa-print', label: 'تصدير وطباعة' },
      { section: 'الإدارة' },
      { id: 'dean-dashboard', icon: 'fa-chart-pie', label: 'لوحة العميد' },
      { id: 'support-cases', icon: 'fa-heart-pulse', label: 'دعم المتعثرين' },
      { id: 'voice-dean', icon: 'fa-ear-listen', label: 'استمع للطلاب' },
      { id: 'students-mgmt', icon: 'fa-users', label: 'الطلاب' },
      { id: 'periods', icon: 'fa-calendar-alt', label: 'الفترات الأكاديمية' },
      { id: 'assignments', icon: 'fa-user-tie', label: 'إسناد المرشدين' },
      { id: 'users-mgmt', icon: 'fa-user-shield', label: 'المستخدمون' },
      { id: 'imports', icon: 'fa-file-import', label: 'رفع البيانات الأكاديمية' },
      { id: 'talent-admin', icon: 'fa-star', label: 'إدارة دعم الموهوبين' },
      { id: 'faculty-management', icon: 'fa-users-gear', label: 'أعضاء هيئة التدريس' },
      { id: 'local-backup', icon: 'fa-box-archive', label: 'نسخ البيانات واستعادتها' },
      { id: 'voice-admin', icon: 'fa-chart-bar', label: 'إدارة صوت الطالب' },
      { id: 'roles-mgmt', icon: 'fa-user-lock', label: 'الأدوار والصلاحيات' },
    ];

    const activeView = currentView || defaultView();
    const groups = [];
    let currentGroup = null;
    catalog.forEach(it => {
      if (it.section) { currentGroup = { title: it.section, items: [] }; groups.push(currentGroup); return; }
      if (!canPage(it.id)) return;
      if (!currentGroup) { currentGroup = { title: 'عام', items: [] }; groups.push(currentGroup); }
      currentGroup.items.push(it);
    });
    const html = groups.filter(g => g.items.length).map(g => {
      const open = g.items.some(it => it.id === activeView);
      return `<div class="nav-group${open ? ' expanded' : ''}">
        <button type="button" class="nav-group-toggle" aria-expanded="${open}" onclick="App.toggleNavGroup(this)">
          <span class="nav-group-title">${g.title}</span><span class="nav-group-count">${g.items.length}</span><i class="fas fa-chevron-down nav-group-chevron"></i>
        </button>
        <div class="nav-group-items">${g.items.map(it => `<button class="nav-item" data-view="${it.id}" onclick="App.navigate('${it.id}')">
        <i class="fas ${it.icon}"></i> ${it.label}
      </button>`).join('')}</div>
      </div>`;
    }).join('');
    nav.innerHTML = html || '<div class="text-muted text-xs p-3">لا توجد صفحات متاحة لهذا الدور</div>';
  }

  function toggleNavGroup(btn) {
    const group = btn && btn.closest ? btn.closest('.nav-group') : null;
    if (!group) return;
    const nav = group.parentElement;
    const willOpen = !group.classList.contains('expanded');
    nav.querySelectorAll('.nav-group.expanded').forEach(g => {
      g.classList.remove('expanded');
      const t = g.querySelector('.nav-group-toggle');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
    if (willOpen) {
      group.classList.add('expanded');
      btn.setAttribute('aria-expanded', 'true');
    }
  }

  function expandNavGroupFor(viewId) {
    const item = document.querySelector('.nav-item[data-view="' + viewId + '"]');
    const group = item && item.closest ? item.closest('.nav-group') : null;
    if (!group || group.classList.contains('expanded')) return;
    toggleNavGroup(group.querySelector('.nav-group-toggle'));
  }

  function navigate(viewId, push=true) {
    if (viewId === 'academic-structure' || viewId === 'admin-settings') viewId = currentUser && currentUser.role === 'admin' ? 'admin-dashboard' : defaultView();
    if (viewId === 'settings') viewId = 'student-profile';
    const isDetail = viewId === 'request-detail' && currentUser && (canPage('my-requests') || canPage('staff-inbox') || canPage('dean-dashboard'));
    const isFormFill = viewId === 'form-fill' && currentUser && currentUser.role === 'student' && canPage('forms-list');
    if (!currentUser || (!isDetail && !isFormFill && !canPage(viewId))) viewId = defaultView();
    if (!document.getElementById('view-' + viewId)) viewId = defaultView();
    currentView = viewId;
    if (push) {
      try { history.pushState({ view: viewId }, '', '#' + viewId); } catch(e) {}
    }
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === viewId);
    });
    expandNavGroupFor(viewId);
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById('view-' + viewId);
    if (el) el.classList.remove('hidden');
    document.getElementById('topbar-title').textContent = viewTitle(viewId);
    window.PortalShell?.onNavigate(viewId);
    if (viewId === 'student-dashboard' && currentUser && currentUser.role !== 'student') {
      const fixHomeTitle = () => { const tt = document.getElementById('topbar-title'); if (tt && currentView === 'student-dashboard') tt.textContent = 'القائمة الرئيسية'; };
      fixHomeTitle(); window.setTimeout(fixHomeTitle, 0);
    }
    const renderers = {
      'admin-dashboard': renderAdminDashboard,
      'imports': () => window.StudentDataCenter && StudentDataCenter.renderImportsCenter(),
      'transcripts': () => window.TranscriptImportCenter && TranscriptImportCenter.render(),
      'ss-new': () => window.StudentServices && StudentServices.renderApp('ss-new'),
      'ss-track': () => window.StudentServices && StudentServices.renderApp('ss-track'),
      'ss-desk': () => window.StudentServices && StudentServices.renderApp('ss-desk'),
      'talent-program': () => window.TalentProgram && TalentProgram.renderStudent(),
      'talent-admin': () => window.TalentProgram && TalentProgram.renderAdmin(),
      'faculty-management': () => window.FacultyManagement && FacultyManagement.render(),
      'local-backup': () => window.LocalBackup && LocalBackup.render(),
      'student-dashboard': renderStudentDashboard,
      'student-profile': renderStudentProfile,
      'study-plan': renderStudyPlan,
      'gpa-calc': renderGPACalc,
      'forms-list': renderFormsList,
      'form-fill': () => {},
      'my-requests': renderMyRequests,
      'request-detail': () => {},
      'notifications': renderNotifications,
      'services': renderServices,
      'staff-inbox': renderStaffInbox,
      'dean-dashboard': renderDeanDashboard,
      'students-mgmt': renderStudentsMgmt,
      'students-search': renderStudentsSearch,
      'periods': renderPeriods,
      'assignments': renderAssignments,
      'users-mgmt': renderUsersMgmt,
      'roles-mgmt': renderRolesMgmt,
      'export-print': renderExportPrint,
      'student-voice': () => window.StudentVoice && StudentVoice.renderStudent(),
      'support-cases': () => window.SupportMessaging && SupportMessaging.renderSupport(),
      'conversations': () => window.SupportMessaging && SupportMessaging.renderConversations(),
      'voice-dean': () => window.StudentVoiceDirect && StudentVoiceDirect.renderDean(),
      'voice-admin': () => window.StudentVoice && StudentVoice.renderAdmin()
    };
    if (renderers[viewId]) {
      try {
        const result = renderers[viewId]();
        if (result && typeof result.catch === 'function') result.catch(err => {
          console.error('تعذر تحميل الصفحة:', viewId, err);
          toast('تعذر تحميل هذه الشاشة الآن. أعد المحاولة أو تحقق من اتصال البيانات.', 'err');
        });
      } catch (err) {
        console.error('تعذر تحميل الصفحة:', viewId, err);
        toast('حدث خطأ أثناء فتح الشاشة. أعد المحاولة.', 'err');
      }
    }
  }

  function viewTitle(id) {
    const t = {
      'admin-dashboard': 'مركز مدير النظام', 'student-dashboard': 'القائمة الرئيسية', 'student-profile': 'بياناتي',
      'study-plan': 'الخطط الدراسية', 'gpa-calc': 'حاسبة المعدل',
      'forms-list': 'النماذج والطلبات', 'form-fill': 'تعبئة النموذج',
      'my-requests': 'طلباتي', 'request-detail': 'تفاصيل الطلب',
      'notifications': 'الإشعارات', 'services': 'خدمات إلكترونية',
      'staff-inbox': 'صندوق الطلبات', 'dean-dashboard': 'لوحة العميد',
      'students-mgmt': 'إدارة الطلاب', 'students-search': 'البحث عن طالب',
      'periods': 'الفترات الأكاديمية',
      'assignments': 'إسناد المرشدين', 'imports': 'رفع البيانات الأكاديمية',
      'transcripts': 'رفع السجلات الدراسية',
      'ss-new': 'تقديم طلب', 'ss-track': 'متابعة طلب', 'ss-desk': 'إدارة الطلبات',
      'talent-program': 'برنامج دعم الموهوبين', 'talent-admin': 'إدارة دعم الموهوبين',
      'local-backup': 'نسخ البيانات واستعادتها',
      'users-mgmt': 'المستخدمون', 'roles-mgmt': 'الأدوار والصلاحيات', 'export-print': 'تصدير وطباعة',
      'student-voice': 'صوت الطالب', 'voice-dean': 'استمع للطلاب', 'voice-admin': 'إدارة صوت الطالب'
      , 'support-cases': 'دعم الطلاب المتعثرين', 'conversations': 'المحادثات'
    };
    return t[id] || '';
  }

  // ===== System Administrator Hub =====
  function renderAdminDashboard() {
    const name = document.getElementById('admin-hub-name');
    if (name) name.textContent = (currentUser && (currentUser.name || currentUser.full_name)) || 'مدير النظام';
  }

  // ===== Student Dashboard =====
  async function renderStudentDashboard() {
    const u = currentUser;
    if (u && u.role && u.role !== 'student') return renderRoleHome(u);
    const prog = S.programs.find(p => p.id === u.program || p.nameAr === u.program);
    let reqs = load('requests', []).filter(r => r.studentCode === (u.code || u.username) || r.studentUsername === u.username);
    if (window.DB && DB.isOnline()) {
      reqs = await DB.listApplications({ studentCode: u.code || u.username });
    }
    const pending = reqs.filter(r => r.status !== 'executed' && r.status !== 'rejected' && r.status !== 'cancelled').length;
    const executed = reqs.filter(r => r.status === 'executed').length;
    const gpa = u.gpa != null ? Number(u.gpa).toFixed(2) : '—';
    const hours = u.completedHours != null ? u.completedHours : '—';
    const atRisk = u.gpa != null && Number(u.gpa) < 2.0;

    const w = document.getElementById('sd-welcome');
    if (w) w.textContent = 'مرحباً، ' + (u.name || u.username);
    const meta = document.getElementById('sd-meta');
    if (meta) {
      meta.innerHTML = [
        u.code || u.username ? '<span class="dash-meta-chip"><i class="fas fa-id-card"></i> كود الطالب: <b>' + arEsc(u.code || u.username) + '</b></span>' : '',
        prog ? '<span class="dash-meta-chip"><i class="fas fa-graduation-cap"></i> ' + arEsc(prog.nameAr) + '</span>' : u.program ? '<span class="dash-meta-chip"><i class="fas fa-graduation-cap"></i> ' + arEsc(u.program) + '</span>' : ''
      ].filter(Boolean).join('');
    }

    const stats = document.getElementById('sd-stats');
    if (stats) {
      stats.hidden = false;
      stats.innerHTML = [
        { icon: 'fa-file-lines', label: 'طلباتي', value: reqs.length, tone: 'navy' },
        { icon: 'fa-hourglass-half', label: 'قيد المتابعة', value: pending, tone: 'amber' },
        { icon: 'fa-circle-check', label: 'تم تنفيذها', value: executed, tone: 'green' },
        { icon: 'fa-chart-line', label: 'المعدل المسجل', value: gpa, tone: 'teal' },
        { icon: 'fa-book-open', label: 'الساعات المجتازة', value: hours, tone: 'blue' }
      ].map(item => `<div class="stat-card student-summary-card" style="--accent:var(--${item.tone === 'green' ? 'success' : item.tone === 'amber' ? 'warning' : item.tone === 'teal' ? 'teal' : item.tone === 'blue' ? 'blue' : 'navy'})"><span class="ico"><i class="fas ${item.icon}"></i></span><strong class="val">${arEsc(item.value)}</strong><span class="lbl">${item.label}</span></div>`).join('');
    }


    const adv = u.advisor ? load('users', []).find(x => x.username === u.advisor) : null;
    const advEl = document.getElementById('sd-advisor');
    if (advEl) {
      advEl.innerHTML = adv || u.advisor
        ? `<div class="card"><div class="card-body flex items-center gap-3">
            <div class="ico" style="width:44px;height:44px;border-radius:12px;background:#ecfeff;color:var(--teal);display:grid;place-items:center"><i class="fas fa-user-tie"></i></div>
            <div><div class="text-xs text-muted">المرشد الأكاديمي</div><div class="fw-bold">${arEsc(adv ? adv.name : u.advisor)}</div>
            <div class="text-xs text-muted">راجع المرشد قبل تقديم أي طلب</div></div>
          </div></div>`
        : `<div class="alert alert-warn"><i class="fas fa-info-circle"></i> لم يُسند مرشد أكاديمي بعد. تواصل مع منسق القسم.</div>`;
    }

    const actions = document.getElementById('sd-actions');
    if (actions) actions.innerHTML = `
      <div class="qa-tile" onclick="App.navigate('forms-list')"><span class="qa-icon"><i class="fas fa-file-circle-plus"></i></span><span>تقديم طلب</span><i class="fas fa-arrow-left qa-arrow"></i></div>
      <div class="qa-tile" onclick="App.navigate('study-plan')"><span class="qa-icon"><i class="fas fa-sitemap"></i></span><span>الخطط الدراسية</span><i class="fas fa-arrow-left qa-arrow"></i></div>
      <div class="qa-tile" onclick="App.navigate('gpa-calc')"><span class="qa-icon"><i class="fas fa-calculator"></i></span><span>حاسبة المعدل</span><i class="fas fa-arrow-left qa-arrow"></i></div>
      <div class="qa-tile" onclick="App.navigate('my-requests')"><span class="qa-icon"><i class="fas fa-list-check"></i></span><span>طلباتي</span><i class="fas fa-arrow-left qa-arrow"></i></div>
      <div class="qa-tile" onclick="App.navigate('student-profile')"><span class="qa-icon"><i class="fas fa-id-card"></i></span><span>بياناتي</span><i class="fas fa-arrow-left qa-arrow"></i></div>`;
  }

  async function renderRoleHome(u) {
    const reqs = load('requests', []);
    const pending = reqs.filter(r => r.status !== 'executed' && r.status !== 'rejected' && r.status !== 'cancelled').length;
    const executed = reqs.filter(r => r.status === 'executed').length;
    const students = load('users', []).filter(x => x.role === 'student');
    const myAdvisees = (u.role === 'advisor' || u.role === 'coordinator') ? students.filter(x => x.advisor === u.username).length : null;

    const w = document.getElementById('sd-welcome');
    if (w) w.textContent = 'مرحباً، ' + (u.name || u.full_name || u.username);
    const meta = document.getElementById('sd-meta');
    if (meta) {
      meta.innerHTML = [
        '<span class="dash-meta-chip"><i class="fas fa-user-shield"></i> ' + arEsc(roleName(u.role)) + '</span>',
        myAdvisees != null ? '<span class="dash-meta-chip"><i class="fas fa-users"></i> الطلاب المنسوبون: <b>' + myAdvisees + '</b></span>' : ''
      ].filter(Boolean).join('');
    }

    const stats = document.getElementById('sd-stats');
    if (stats) {
      stats.hidden = false;
      const cards = [
        { icon: 'fa-file-lines', label: 'إجمالي الطلبات', value: reqs.length, tone: 'navy' },
        { icon: 'fa-hourglass-half', label: 'قيد المتابعة', value: pending, tone: 'amber' },
        { icon: 'fa-circle-check', label: 'تم تنفيذها', value: executed, tone: 'green' },
        { icon: 'fa-user-graduate', label: 'الطلاب المسجلون', value: students.length, tone: 'teal' }
      ];
      if (myAdvisees != null) cards.push({ icon: 'fa-user-tie', label: 'الطلاب المنسوبون إليّ', value: myAdvisees, tone: 'blue' });
      stats.innerHTML = cards.map(item => `<div class="stat-card student-summary-card" style="--accent:var(--${item.tone === 'green' ? 'success' : item.tone === 'amber' ? 'warning' : item.tone === 'teal' ? 'teal' : item.tone === 'blue' ? 'blue' : 'navy'})"><span class="ico"><i class="fas ${item.icon}"></i></span><strong class="val">${arEsc(item.value)}</strong><span class="lbl">${item.label}</span></div>`).join('');
    }

    const advEl = document.getElementById('sd-advisor');
    if (advEl) advEl.innerHTML = '';

    const actions = document.getElementById('sd-actions');
    if (actions) {
      const tiles = [
        { id: 'staff-inbox', icon: 'fa-inbox', label: 'صندوق الطلبات' },
        { id: 'students-search', icon: 'fa-search', label: 'البحث عن طالب' },
        { id: 'dean-dashboard', icon: 'fa-chart-pie', label: 'لوحة العميد' },
        { id: 'students-mgmt', icon: 'fa-users', label: 'إدارة الطلاب' },
        { id: 'export-print', icon: 'fa-print', label: 'تصدير وطباعة' },
        { id: 'admin-dashboard', icon: 'fa-th-large', label: 'مركز مدير النظام' }
      ].filter(t => canPage(t.id));
      actions.innerHTML = tiles.map(t => `<div class="qa-tile" onclick="App.navigate('${t.id}')"><span class="qa-icon"><i class="fas ${t.icon}"></i></span><span>${t.label}</span><i class="fas fa-arrow-left qa-arrow"></i></div>`).join('');
    }
  }

function renderStudentProfile() {
    const u = currentUser || {};
    const body = document.getElementById('profile-body');
    if (!body) return;
    const profileFields = [
      ['الاسم', u.name || u.full_name || '—'],
      ['معرّف الحساب', u.code || u.student_code || u.username || '—'],
      ['الدور', roleName(u.role)]
    ];
    if (u.phone) profileFields.push(['رقم الهاتف', u.phone]);
    if (u.role === 'student') {
      if (u.program) profileFields.push(['البرنامج', u.program]);
      if (u.level) profileFields.push(['المستوى الدراسي', u.level]);
      if (u.dept) profileFields.push(['القسم', u.dept]);
    }
    body.innerHTML = `
      <div class="profile-page-head anim-fade-up">
        <div class="profile-page-icon"><i class="fas fa-user-circle"></i></div>
        <div><h2>بياناتي</h2><p>معلومات الحساب ووسائل تأمينه</p></div>
      </div>
      <div class="profile-info-grid anim-fade-up">
        ${profileFields.map(([label,value]) => `<div class="form-group"><label>${escapeProfileValue(label)}</label><input class="form-control" value="${escapeProfileValue(value)}" readonly></div>`).join('')}
      </div>
      <section class="profile-password-card anim-fade-up">
        <div class="profile-section-title"><span class="profile-section-icon"><i class="fas fa-shield-alt"></i></span><div><h3>تعديل كلمة المرور</h3><p>اكتب كلمة المرور الحالية، ثم اختر كلمة مرور جديدة قوية</p></div></div>
        <div class="profile-password-grid">
          <div class="form-group"><label for="pwd-cur">كلمة المرور الحالية</label><input type="password" class="form-control" id="pwd-cur" placeholder="أدخل كلمة المرور الحالية" autocomplete="current-password" required></div>
          <div class="form-group"><label for="pwd-new">كلمة المرور الجديدة</label><input type="password" class="form-control" id="pwd-new" placeholder="أنشئ كلمة مرور قوية" autocomplete="new-password" required minlength="4" aria-describedby="pwd-strength-text"></div>
          <div class="password-strength profile-password-strength"><div class="password-strength-track"><span id="pwd-strength-bar"></span></div><div class="password-strength-meta"><span id="pwd-strength-text">أدخل كلمة المرور لتقييم قوتها</span><span id="pwd-strength-percent">0%</span></div></div>
          <div class="form-group"><label for="pwd-conf">إعادة إدخال كلمة المرور الجديدة</label><input type="password" class="form-control" id="pwd-conf" placeholder="أعد إدخال كلمة المرور الجديدة" autocomplete="new-password" required><div id="pwd-match-text" class="password-match-text" aria-live="polite">أعد كتابة كلمة المرور للتأكيد</div></div>
        </div>
        <button type="button" class="btn btn-primary profile-save-password" onclick="App.changePassword()"><i class="fas fa-key"></i> حفظ كلمة المرور الجديدة</button>
      </section>`;
    const newPass = document.getElementById('pwd-new');
    const confirmPass = document.getElementById('pwd-conf');
    const updateStrength = () => {
      const value = newPass.value;
      const bar = document.getElementById('pwd-strength-bar');
      const text = document.getElementById('pwd-strength-text');
      const percent = document.getElementById('pwd-strength-percent');
      let score = 0;
      if (value.length >= 6) score++;
      if (value.length >= 10) score++;
      if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
      if (/\d/.test(value)) score++;
      if (/[^A-Za-z0-9]/.test(value)) score++;
      const levels = [{label:'ضعيفة جدًا',width:'12%',color:'#ef4444'},{label:'ضعيفة',width:'28%',color:'#f97316'},{label:'متوسطة',width:'52%',color:'#eab308'},{label:'جيدة',width:'76%',color:'#14b8a6'},{label:'قوية',width:'100%',color:'#059669'}];
      if (!value) { bar.style.width='0%'; bar.style.background='#cbd5e1'; text.textContent='أدخل كلمة المرور لتقييم قوتها'; percent.textContent='0%'; return; }
      const level = levels[Math.min(score,4)];
      bar.style.width=level.width; bar.style.background=level.color; text.textContent=level.label; percent.textContent=level.width;
    };
    const updateMatch = () => {
      const hint = document.getElementById('pwd-match-text');
      confirmPass.setCustomValidity('');
      confirmPass.classList.remove('is-match','is-mismatch');
      if (!confirmPass.value) { hint.textContent='أعد كتابة كلمة المرور للتأكيد'; hint.className='password-match-text'; }
      else if (newPass.value === confirmPass.value) { hint.textContent='كلمتا المرور متطابقتان'; hint.className='password-match-text is-match'; confirmPass.classList.add('is-match'); }
      else { hint.textContent='كلمتا المرور غير متطابقتين'; hint.className='password-match-text is-mismatch'; confirmPass.classList.add('is-mismatch'); }
    };
    newPass.addEventListener('input', () => { updateStrength(); updateMatch(); });
    confirmPass.addEventListener('input', updateMatch);
  }

  function escapeProfileValue(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  /* ===== Study Plans — Professional Academic Table ===== */
  let _spState = { section: '', program: '', level: '', term: '', type: '', hours: '', q: '' };
  let _spView = 'table';

  function spParseTerm(termKey) {
    const parts = String(termKey || '').split('-');
    const level = Number(parts[0]) || 0;
    const semester = Number(parts[1]) || 0;
    return { level, semester, termKey };
  }

  function spTypeLabel(t) {
    if (t === 'pass_fail') return { label: 'متطلب جامعة', cls: 'sp-type-uni' };
    if (t === 'optional' || t === 'elective') return { label: 'اختياري', cls: 'sp-type-opt' };
    if (t === 'graded' || t === 'core' || !t) return { label: 'أساسي', cls: 'sp-type-core' };
    return { label: t, cls: 'sp-type-pass' };
  }

  function spLevelLabel(n) {
    const map = { 1: 'المستوى الأول', 2: 'المستوى الثاني', 3: 'المستوى الثالث', 4: 'المستوى الرابع' };
    return map[n] || (n ? 'المستوى ' + n : '—');
  }

  function spSemLabel(n) {
    return n === 1 ? 'الفصل الأول' : n === 2 ? 'الفصل الثاني' : (n ? 'الفصل ' + n : '—');
  }

  /** فهرس شامل: كود → {code,name,hours,type,level,semester,termKey,program,prerequisites,opens} */
  function spBuildIndex() {
    const SP = window.FOS_STUDY_PLANS;
    if (!SP || !SP.programs) return {};
    if (SP._enrichedIndex) return SP._enrichedIndex;
    const idx = {};
    Object.keys(SP.programs).forEach(pname => {
      const prog = SP.programs[pname];
      Object.keys(prog.semesters || {}).forEach(termKey => {
        const { level, semester } = spParseTerm(termKey);
        (prog.semesters[termKey] || []).forEach(c => {
          const addOne = (course, isElective) => {
            if (!course || !course.code) return;
            const key = String(course.code).toUpperCase();
            if (!idx[key]) {
              idx[key] = {
                code: course.code,
                name: (course.name || '').trim(),
                hours: course.hours,
                type: isElective ? 'elective' : (course.type || 'graded'),
                level, semester, termKey,
                program: pname,
                section: prog.section,
                prerequisites: course.prerequisites || [],
                opens: course.opens || [],
                minHours: course.minHours || 0
              };
            }
          };
          if (c && c.type === 'elective_group') {
            (c.options || []).forEach(o => addOne(o, true));
          } else {
            addOne(c, false);
          }
        });
      });
    });
    // بناء علاقة عكسية: إذا B يتطلب A ولم يُدرج B في opens الخاصة بـ A
    Object.values(idx).forEach(c => {
      (c.prerequisites || []).forEach(pc => {
        const pk = String(pc).toUpperCase();
        if (idx[pk]) {
          if (!idx[pk].opens) idx[pk].opens = [];
          if (!idx[pk].opens.map(x => String(x).toUpperCase()).includes(c.code.toUpperCase())) {
            idx[pk].opens = idx[pk].opens.concat([c.code]);
          }
        }
      });
    });
    SP._enrichedIndex = idx; /* rebuilt from clean plans */
    return idx;
  }

  function spProgramCourseMap(programName) {
    const SP = window.FOS_STUDY_PLANS;
    const prog = programName && SP && SP.programs && SP.programs[programName];
    if (!prog) return null;
    const map = {};
    Object.keys(prog.semesters || {}).forEach(termKey => {
      const { level, semester } = spParseTerm(termKey);
      (prog.semesters[termKey] || []).forEach(entry => {
        const add = (course, isElective) => {
          if (!course || !course.code) return;
          const key = String(course.code).toUpperCase();
          if (!map[key]) map[key] = { ...course, code: course.code, name: (course.name || '').trim(), type: isElective ? 'elective' : (course.type || 'graded'), level, semester, termKey, program: programName, section: prog.section };
        };
        if (entry && entry.type === 'elective_group') (entry.options || []).forEach(c => add(c, true));
        else add(entry, false);
      });
    });
    // Build relations only inside this exact program; shared codes in other plans are ignored.
    Object.values(map).forEach(course => {
      course.prerequisites = (course.prerequisites || []).filter(code => map[String(code).toUpperCase()]);
      course.opens = (course.opens || []).filter(code => map[String(code).toUpperCase()]);
    });
    Object.values(map).forEach(course => {
      (course.prerequisites || []).forEach(code => {
        const prerequisite = map[String(code).toUpperCase()];
        if (prerequisite && !prerequisite.opens.some(x => String(x).toUpperCase() === course.code.toUpperCase())) prerequisite.opens.push(course.code);
      });
    });
    return map;
  }

  function spResolve(code, programName) {
    if (!code) return null;
    if (programName) {
      const local = spProgramCourseMap(programName);
      return local ? (local[String(code).trim().toUpperCase()] || null) : null;
    }
    const idx = spBuildIndex();
    return idx[String(code).trim().toUpperCase()] || null;
  }

  function spChip(code, kind, programName) {
    const c = spResolve(code, programName);
    const cls = kind === 'open' ? 'sp-chip-open' : 'sp-chip-prereq';
    const safeProgram = String(programName || '').replace(/'/g, "\\'");
    if (!c) return '';
    const arrow = kind === 'open' ? '<span class="sp-arrow">↙</span> ' : '';
    const safeResolvedCode = String(c.code).replace(/'/g, "\\'");
    const safeName = escapeProfileValue(c.name || c.code);
    return `<button type="button" class="sp-chip ${cls}" onclick="App.spShowCourse('${safeResolvedCode}', '${safeProgram}')" title="${safeName} — ${c.code}">
      <span class="sp-chip-name">${arrow}${safeName}</span>
      <span class="sp-chip-code">${c.code}</span>
    </button>`;
  }

  // Custom animated dropdowns for the study-plan filters. Native <select> popups
  // are OS-controlled, so use a fully styled listbox while keeping the original
  // selects as the single source of truth for existing filtering logic.
  function spEnhanceDropdowns() {
    const ids = ['sp-section', 'sp-program', 'sp-level', 'sp-term'];
    ids.forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      let wrap = select.closest('.sp-custom-select');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'sp-custom-select';
        wrap.dataset.selectId = id;
        select.parentNode.insertBefore(wrap, select);
        wrap.appendChild(select);
        select.classList.add('sp-custom-select-native');
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'sp-custom-select-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = '<span class="sp-custom-select-value"></span><span class="sp-custom-select-chevron" aria-hidden="true"></span>';
        const menu = document.createElement('div');
        menu.className = 'sp-custom-select-menu';
        menu.setAttribute('role', 'listbox');
        menu.hidden = true;
        wrap.appendChild(trigger);
        wrap.appendChild(menu);
        trigger.addEventListener('click', () => {
          const willOpen = menu.hidden;
          document.querySelectorAll('#study-plan-body .sp-custom-select.is-open').forEach(other => {
            if (other !== wrap) spCloseCustomDropdown(other);
          });
          if (willOpen) {
            spSyncCustomDropdown(wrap);
            menu.hidden = false;
            wrap.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
            const selected = menu.querySelector('[aria-selected="true"]');
            if (selected) selected.scrollIntoView({block:'nearest'});
          } else spCloseCustomDropdown(wrap);
        });
        trigger.addEventListener('keydown', event => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            menu.hidden = false;
            wrap.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
            const opts = [...menu.querySelectorAll('[role="option"]')];
            const selected = opts.findIndex(o => o.getAttribute('aria-selected') === 'true');
            (opts[Math.max(0,selected)] || opts[0])?.focus();
          }
        });
        menu.addEventListener('keydown', event => {
          const opts = [...menu.querySelectorAll('[role="option"]')];
          const i = opts.indexOf(document.activeElement);
          if (event.key === 'Escape') { event.preventDefault(); spCloseCustomDropdown(wrap); trigger.focus(); }
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next = (i + (event.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
            opts[next]?.focus();
          } else if (event.key === 'Home') { event.preventDefault(); opts[0]?.focus(); }
          else if (event.key === 'End') { event.preventDefault(); opts[opts.length-1]?.focus(); }
        });
      }
      spSyncCustomDropdown(wrap);
    });
    if (!window._spCustomDropdownOutside) {
      window._spCustomDropdownOutside = true;
      document.addEventListener('pointerdown', event => {
        if (!event.target.closest || !event.target.closest('#study-plan-body .sp-custom-select')) {
          document.querySelectorAll('#study-plan-body .sp-custom-select.is-open').forEach(spCloseCustomDropdown);
        }
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') document.querySelectorAll('#study-plan-body .sp-custom-select.is-open').forEach(spCloseCustomDropdown);
      });
    }
  }

  function spSyncCustomDropdown(wrap) {
    if (!wrap) return;
    const select = wrap.querySelector('select');
    const trigger = wrap.querySelector('.sp-custom-select-trigger');
    const value = wrap.querySelector('.sp-custom-select-value');
    const menu = wrap.querySelector('.sp-custom-select-menu');
    if (!select || !trigger || !value || !menu) return;
    const selectedOption = select.options[select.selectedIndex];
    value.textContent = selectedOption ? selectedOption.textContent.trim() : 'اختر';
    trigger.disabled = select.disabled;
    trigger.setAttribute('aria-label', selectedOption ? selectedOption.textContent.trim() : 'اختر قيمة');
    menu.innerHTML = '';
    [...select.options].forEach(option => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'sp-custom-select-option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', option.value === select.value ? 'true' : 'false');
      item.disabled = option.disabled;
      const label = document.createElement('span');
      label.textContent = option.textContent.trim();
      item.appendChild(label);
      if (option.value === select.value) {
        const check = document.createElement('span');
        check.className = 'sp-custom-select-check';
        check.textContent = '✓';
        check.setAttribute('aria-hidden', 'true');
        item.appendChild(check);
      }
      item.addEventListener('click', () => {
        select.value = option.value;
        spSyncCustomDropdown(wrap);
        spCloseCustomDropdown(wrap);
        const filterName = ({'sp-section':'section','sp-program':'program','sp-level':'level','sp-term':'term'})[select.id];
        if (filterName && window.App && typeof App.spOnFilter === 'function') App.spOnFilter(filterName);
        // Section changes repopulate the program select dynamically.
        spEnhanceDropdowns();
      });
      menu.appendChild(item);
    });
  }

  function spCloseCustomDropdown(wrap) {
    if (!wrap) return;
    const menu = wrap.querySelector('.sp-custom-select-menu');
    const trigger = wrap.querySelector('.sp-custom-select-trigger');
    if (menu) menu.hidden = true;
    wrap.classList.remove('is-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function renderStudyPlan() {
    const SP = window.FOS_STUDY_PLANS;
    const target = document.getElementById('study-plan-body');
    if (!target) return;
    if (!SP || !SP.programs) {
      target.innerHTML = '<div class="empty">بيانات الخطط غير محمّلة</div>';
      return;
    }
    spBuildIndex();
    const sections = [
      { id: 'biological', name: 'قسم العلوم البيولوجية' },
      { id: 'physical', name: 'قسم العلوم الفيزيائية' },
      { id: 'geological', name: 'قسم العلوم الجيولوجية' },
      { id: 'special', name: 'البرامج الخاصة' }
    ];
    target.innerHTML = `
      <div class="breadcrumb">
        <a href="#" onclick="App.navigate(App.defaultView ? App.defaultView() : 'student-dashboard');return false">الرئيسية</a>
        <span class="sep">/</span>
        <span>الخطط الدراسية</span>
      </div>
      <div class="page-header flex justify-between items-start flex-wrap gap-2">
        <div>
          <h1>الخطط الدراسية</h1>
          <p>استعرض الخطة الأكاديمية والمقررات والمتطلبات السابقة ومسار التقدم الدراسي</p>
        </div>
        <div class="sp-plan-actions">
          <a id="sp-download-pdf" class="sp-download-pdf is-disabled" href="#" aria-disabled="true" tabindex="-1" onclick="App.spDownloadPlanPDF();return false;"><i class="fas fa-file-pdf"></i> طباعة / حفظ PDF</a>
          <div class="sp-view-toggle">
            <button type="button" id="sp-view-table" class="active" onclick="App.spSetView('table')"><i class="fas fa-table"></i> جدول</button>
            <button type="button" id="sp-view-visual" onclick="App.spSetView('visual')"><i class="fas fa-th-large"></i> عرض الفصول</button>
          </div>
        </div>
      </div>
      <div class="sp-filters">
        <div class="sp-filters-head"><span class="sp-filters-title"><i class="fas fa-sliders"></i> تصفية الخطة</span><span class="sp-filters-hint">اختر القسم ثم البرنامج، ويمكنك تضييق النتائج بالمستوى والفصل ونوع المقرر والساعات أو البحث المباشر</span></div>
        <div class="grid-3 mb-2">
          <div class="form-group mb-0"><label>القسم / النوع</label>
            <select class="form-control" id="sp-section" onchange="App.spOnFilter('section')">
              <option value="">الكل</option>
              ${sections.map(s => `<option value="${s.id}" ${_spState.section===s.id?'selected':''}>${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group mb-0"><label>البرنامج</label>
            <select class="form-control" id="sp-program" onchange="App.spOnFilter('program')">
              <option value="">— اختر البرنامج —</option>
            </select>
          </div>
          <div class="form-group mb-0"><label>البحث باسم المقرر أو الكود</label>
            <input class="form-control" id="sp-search" placeholder="مثال: CHEM100 أو كيمياء..." value="${_spState.q||''}" oninput="App.spOnFilter('q')">
          </div>
        </div>
        <div class="grid-3">
          <div class="form-group mb-0"><label>المستوى الدراسي</label>
            <select class="form-control" id="sp-level" onchange="App.spOnFilter('level')">
              <option value="">كل المستويات</option>
              <option value="1">المستوى الأول</option>
              <option value="2">المستوى الثاني</option>
              <option value="3">المستوى الثالث</option>
              <option value="4">المستوى الرابع</option>
            </select>
          </div>
          <div class="form-group mb-0"><label>الفصل الدراسي</label>
            <select class="form-control" id="sp-term" onchange="App.spOnFilter('term')">
              <option value="">كل الفصول</option>
              <option value="1">الفصل الأول</option>
              <option value="2">الفصل الثاني</option>
            </select>
          </div>
          <div class="form-group mb-0"><label>نوع المقرر</label>
            <select class="form-control" id="sp-type" onchange="App.spOnFilter('type')">
              <option value="">الكل</option>
              <option value="required">إجباري</option>
              <option value="elective">اختياري</option>
            </select>
          </div>
        </div>
        <div class="grid-3 mt-2">
          <div class="form-group mb-0"><label>الساعات المعتمدة</label>
            <select class="form-control" id="sp-hours" onchange="App.spOnFilter('hours')">
              <option value="">الكل</option>
              <option value="1">ساعة واحدة</option>
              <option value="2">ساعتان</option>
              <option value="3">3 ساعات</option>
              <option value="4+">4 ساعات فأكثر</option>
            </select>
          </div>
          <div class="form-group mb-0"></div>
          <div class="form-group mb-0" style="display:flex;align-items:flex-end">
            <button type="button" class="btn btn-outline btn-sm" onclick="App.spResetFilters()"><i class="fas fa-undo"></i> إعادة ضبط الفلاتر</button>
          </div>
        </div>
      </div>
      <div class="sp-stats" id="sp-stats"></div>
      <div class="sp-table-wrap" id="sp-courses"></div>
      <div id="sp-detail-root"></div>`;
    // restore filter UI values & fill programs
    fillStudyPrograms(true);
    const lv = document.getElementById('sp-level');
    const tm = document.getElementById('sp-term');
    const ty = document.getElementById('sp-type');
    const hr = document.getElementById('sp-hours');
    if (lv) lv.value = _spState.level || '';
    if (tm) tm.value = _spState.term || '';
    if (ty) ty.value = _spState.type || '';
    if (hr) hr.value = _spState.hours || '';
    spEnhanceDropdowns();
    renderStudyCourses();
  }

  function fillStudyPrograms(keepSelection) {
    const SP = window.FOS_STUDY_PLANS;
    const sec = document.getElementById('sp-section')?.value || '';
    const sel = document.getElementById('sp-program');
    if (!sel || !SP) return;
    const prev = keepSelection ? (_spState.program || sel.value) : '';
    const names = Object.keys(SP.programs).filter(n => {
      if (!sec) return true;
      return SP.programs[n].section === sec;
    }).sort((a,b) => a.localeCompare(b, 'ar'));
    sel.innerHTML = '<option value="">— اختر البرنامج —</option>' +
      names.map(n => `<option value="${n.replace(/"/g,'&quot;')}">${SP.programs[n].name || n}</option>`).join('');
    if (prev && names.includes(prev)) sel.value = prev;
    else if (!keepSelection) _spState.program = '';
  }

  function spOnFilter(which) {
    if (which === 'section') {
      _spState.section = document.getElementById('sp-section').value;
      fillStudyPrograms(false);
      _spState.program = document.getElementById('sp-program').value;
      spEnhanceDropdowns();
    } else if (which === 'program') {
      _spState.program = document.getElementById('sp-program').value;
    } else if (which === 'level') {
      _spState.level = document.getElementById('sp-level').value;
    } else if (which === 'term') {
      _spState.term = document.getElementById('sp-term').value;
    } else if (which === 'type') {
      _spState.type = document.getElementById('sp-type').value;
    } else if (which === 'hours') {
      _spState.hours = document.getElementById('sp-hours').value;
    } else if (which === 'q') {
      _spState.q = document.getElementById('sp-search').value;
    }
    renderStudyCourses();
  }

  function spResetFilters() {
    _spState = { section: '', program: '', level: '', term: '', type: '', hours: '', q: '' };
    renderStudyPlan();
  }

  function spCollectCourses() {
    const SP = window.FOS_STUDY_PLANS;
    const pname = _spState.program || document.getElementById('sp-program')?.value || '';
    if (!pname || !SP || !SP.programs || !SP.programs[pname]) return [];
    const prog = SP.programs[pname];
    const scopedCourses = spProgramCourseMap(pname) || {};
    const levelF = _spState.level || document.getElementById('sp-level')?.value || '';
    const termF = _spState.term || document.getElementById('sp-term')?.value || '';
    const q = (_spState.q || document.getElementById('sp-search')?.value || '').trim().toLowerCase();
    const typeF = _spState.type || document.getElementById('sp-type')?.value || '';
    const hoursF = _spState.hours || document.getElementById('sp-hours')?.value || '';
    const hoursOk = h => {
      if (!hoursF) return true;
      const n = +h || 0;
      return hoursF === '4+' ? n >= 4 : n === +hoursF;
    };

    const items = [];
    const termKeys = Object.keys(prog.semesters || {}).sort((a, b) => {
      const pa = spParseTerm(a), pb = spParseTerm(b);
      return (pa.level - pb.level) || (pa.semester - pb.semester);
    });
    termKeys.forEach(termKey => {
      const { level, semester } = spParseTerm(termKey);
      if (levelF && String(level) !== String(levelF)) return;
      if (termF && String(semester) !== String(termF)) return;
      (prog.semesters[termKey] || []).forEach(c => {
        if (!c) return;
        if (c.type === 'elective_group') {
          if (typeF === 'required') return;
          const opts = (c.options || []).filter(o => {
            if (!hoursOk(o.hours)) return false;
            if (!q) return true;
            const hay = ((o.code || '') + ' ' + (o.name || '') + ' ' + (c.title || '')).toLowerCase();
            return hay.includes(q);
          });
          if ((q || hoursF) && !opts.length) return;
          items.push({
            kind: 'elective_group',
            title: c.title || 'مقرر اختياري',
            level, semester, termKey,
            options: opts.map(o => ({
              code: o.code,
              name: (o.name || '').trim(),
              hours: o.hours,
              type: 'elective',
              prerequisites: (o.prerequisites || []).filter(code => scopedCourses[String(code).toUpperCase()]),
              opens: (scopedCourses[String(o.code).toUpperCase()]?.opens || []).filter(code => scopedCourses[String(code).toUpperCase()]),
              minHours: o.minHours || 0,
              level, semester, termKey
            }))
          });
        } else {
          if (!c.code) return;
          if (typeF === 'elective' && c.type !== 'elective') return;
          if (!hoursOk(c.hours)) return;
          const name = (c.name || '').trim();
          if (q) {
            const hay = (c.code + ' ' + name).toLowerCase();
            if (!hay.includes(q)) return;
          }
          const enriched = scopedCourses[String(c.code).toUpperCase()];
          items.push({
            kind: 'course',
            code: c.code,
            name,
            hours: c.hours,
            type: c.type || 'graded',
            level, semester, termKey,
            prerequisites: (c.prerequisites || []).filter(code => scopedCourses[String(code).toUpperCase()]),
            opens: (enriched?.opens || []).filter(code => scopedCourses[String(code).toUpperCase()]),
            minHours: c.minHours || 0
          });
        }
      });
    });
    return items;
  }

  /** ساعات الفصل: المقررات الثابتة + مقرر واحد من كل مجموعة اختيارية */
  function spCalcHours(items) {
    let fixed = 0, electiveSlots = 0, courseCount = 0, electiveGroups = 0;
    items.forEach(it => {
      if (it.kind === 'elective_group') {
        electiveGroups++;
        const opts = it.options || [];
        if (opts.length) {
          electiveSlots += (+opts[0].hours || 0);
          courseCount += 1;
        }
      } else {
        fixed += (+it.hours || 0);
        courseCount += 1;
      }
    });
    return { totalHours: fixed + electiveSlots, courseCount, electiveGroups, fixedHours: fixed, electiveHours: electiveSlots };
  }

  function spDownloadPlanPDF(options = {}) {
    const SP = window.FOS_STUDY_PLANS;
    const pname = options.programName || document.getElementById('sp-program')?.value || _spState.program;
    const prog = pname && SP?.programs?.[pname];
    if (!prog) {
      if (typeof toast === 'function') toast('اختر البرنامج أولاً لإنشاء ملف PDF', 'err');
      return;
    }
    // Distinct, print-safe identity colors by academic section/program family.
    const programLabel = String(pname || '').toLowerCase();
    const sectionPalette = /جيولوج|مياه|مواد البناء|geolog|engineering geology|جيوفيز/.test(programLabel)
      ? { primary:'#7a3f12', secondary:'#a05f22', accent:'#d4922e', pale:'#fff7e8' }   // Geological — warm earth
      : /حيو|نبات|بيولوج|طفيليات|ميكروب|حيوان|جزيئ|تكنولوجيا حيوية|biolog|zoolog|botan|microbiolog|molecular|parasit/.test(programLabel)
        ? { primary:'#0f5c40', secondary:'#1a7a58', accent:'#22a87a', pale:'#e8f8f0' } // Biological — green
        : /كيمياء|chem/.test(programLabel) && !/حيو|بيو|bio/.test(programLabel)
          ? { primary:'#6b1f2a', secondary:'#8f2f3d', accent:'#c45a3a', pale:'#fdf0f0' } // Chemistry — deep red
          : /رياض|إحصاء|برمج|math|statistic|programming/.test(programLabel)
            ? { primary:'#1a3a6e', secondary:'#2a5a9a', accent:'#3a8fc4', pale:'#eaf3fc' } // Math/Stats — blue
            : /فيزياء|physic/.test(programLabel)
              ? { primary:'#1e3a5f', secondary:'#2d5a8a', accent:'#4a90c4', pale:'#eef5fb' } // Physics — steel blue
              : { primary:'#2c3e6b', secondary:'#3d5288', accent:'#b08d4a', pale:'#f7f3e8' }; // Default / special
    const sectionThemeStyle = `--pdf-primary:${sectionPalette.primary};--pdf-secondary:${sectionPalette.secondary};--pdf-accent:${sectionPalette.accent};--pdf-pale:${sectionPalette.pale}`;
    const courseMap = spProgramCourseMap(pname) || {};
    const semesterKeys = Object.keys(prog.semesters || {}).sort((a,b) => {
      const pa = spParseTerm(a), pb = spParseTerm(b);
      return (pa.level - pb.level) || (pa.semester - pb.semester);
    });
    const esc = value => escapeProfileValue(value == null ? '' : value);
    // Resolve relationships across every program so a prerequisite/opened course is never silently omitted.
    const allCourseMap = {};
    Object.values(SP.programs || {}).forEach(program => Object.values(program.semesters || {}).forEach(entries => (entries || []).forEach(entry => {
      const candidates = entry?.type === 'elective_group' ? (entry.options || []) : [entry];
      candidates.forEach(course => {
        const code = String(course?.code || '').toUpperCase();
        if (code && !allCourseMap[code]) allCourseMap[code] = course;
      });
    })));
    const courseNames = codes => (codes || []).map(code => {
      const key = String(code).toUpperCase();
      return courseMap[key] || allCourseMap[key] || { code: key, name: key };
    });
    // Inline optimized logos so html2canvas never sees a cross-origin/file-origin image.
    // This also works when the portal is being tested locally from file:// or localhost.
    const logoUniversity = 'data:image/png;base64,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';
    const logoFaculty = 'data:image/png;base64,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';
    // (sectionPalette + sectionThemeStyle already computed above from program name)
    const themeStyle = sectionThemeStyle;
    const planStats = semesterKeys.reduce((acc, key) => {
      const entries = prog.semesters[key] || [];
      entries.forEach(entry => {
        if (entry?.type === 'elective_group') {
          acc.courses++;
          acc.hours += Number(entry.options?.[0]?.hours) || 0;
        } else if (entry?.code) {
          acc.courses++;
          acc.hours += Number(entry.hours) || 0;
        }
      });
      return acc;
    }, {courses:0, hours:0});

    const coverPage = `<section class="sheet cover-sheet" style="${themeStyle}">
      <div class="cover-orbit cover-orbit-one"></div>
      <div class="cover-orbit cover-orbit-two"></div>
      <div class="cover-topline"><span>جامعة سوهاج</span><i></i><span>كلية العلوم</span></div>
      <div class="cover-logos">
        <div class="cover-logo-card"><img src="${logoUniversity}" alt="شعار جامعة سوهاج"><span>جامعة سوهاج</span></div>
        <div class="cover-logo-card"><img src="${logoFaculty}" alt="شعار كلية العلوم"><span>كلية العلوم</span></div>
      </div>
      <div class="cover-title">
        <div class="cover-kicker"><span class="cover-kicker-dot"></span> الدليل الأكاديمي للبرنامج</div>
        <h1>الخطة <em>الدراسية</em></h1>
        <div class="cover-title-rule"><span></span></div>
        <h2>${esc(prog.name || pname)}</h2>
        <p class="cover-description">مرجع المقررات الدراسية · المتطلبات السابقة · الساعات المعتمدة</p>
      </div>
      <div class="cover-metrics">
        <div><span>الفصول الدراسية</span><strong>${semesterKeys.length}</strong></div>
        <div><span>إجمالي المقررات</span><strong>${planStats.courses}</strong></div>
        <div><span>الساعات المعتمدة</span><strong>${planStats.hours}</strong></div>
      </div>
      <div class="cover-bottom">
        <span>كلية العلوم — جامعة سوهاج</span>
        <span class="cover-bottom-seal">ACADEMIC PLAN ✦</span>
      </div>
    </section>`;

    const pages = semesterKeys.map((termKey, pageIndex) => {
      const {level, semester} = spParseTerm(termKey);
      const source = prog.semesters[termKey] || [];
      const rows = [];
      let electiveGroupIndex = 0;
      // Display all elective options in the table, but count each elective_group as ONE course
      // and only its representative hours (first option) toward semester totals.
      let semesterCourseCount = 0;
      let semesterHours = 0;
      source.forEach(entry => {
        if (entry?.type === 'elective_group') {
          const groupIndex = electiveGroupIndex++;
          semesterCourseCount += 1;
          semesterHours += Number(entry.options?.[0]?.hours) || 0;
          (entry.options || []).forEach((course, optionIndex) => rows.push({
            ...course,
            type: 'elective',
            electiveGroup: entry.title || `المجموعة الاختيارية ${groupIndex + 1}`,
            electiveGroupIndex: groupIndex,
            electiveOptionIndex: optionIndex
          }));
        } else if (entry?.code) {
          rows.push(entry);
          semesterCourseCount += 1;
          semesterHours += Number(entry.hours) || 0;
        }
      });
      const totalHours = semesterHours;
      const hasElectives = rows.some(course => course.type === 'elective');
      const tableRows = rows.map((course, i) => {
        const code = String(course.code || '').toUpperCase();
        const enriched = courseMap[code] || course;
        const prereqs = courseNames(enriched.prerequisites || course.prerequisites);
        const opens = courseNames(enriched.opens || course.opens);
        const relation = list => list.length
          ? `<div class="relation-list">${list.map(c => `<span class="relation"><b>${esc(c.name || c.code)}</b><small dir="ltr">${esc(c.code)}</small></span>`).join('')}</div>`
          : '<span class="none">—</span>';
        const groupClass = course.type === 'elective' ? ` elective-row elective-group-${(course.electiveGroupIndex % 4) + 1}` : '';
        return `<tr class="${groupClass.trim()}">
          <td class="num">${i + 1}</td>
          <td class="code"><bdi>${esc(course.code)}</bdi></td>
          <td class="course-name">${esc(course.name || '')}${course.electiveGroup ? `<small class="group-tag"><b>اختياري</b><span>${esc(course.electiveGroup)}</span><em>اختيار واحد</em></small>` : ''}</td>
          <td class="hours">${esc(String(course.hours ?? '—'))}</td>
          <td class="prereq">${relation(prereqs)}</td>
          <td class="opens">${relation(opens)}</td>
        </tr>`;
      }).join('');

      return `<section class="sheet semester-sheet" style="${themeStyle}">
        <header class="brand-head">
          <div class="brand-logos">
            <img src="${logoUniversity}" alt="جامعة سوهاج">
            <img src="${logoFaculty}" alt="كلية العلوم">
          </div>
          <div class="brand-center">
            <span class="brand-uni">جامعة سوهاج · كلية العلوم</span>
            <strong>الخطة الدراسية</strong>
            <p>${esc(prog.name || pname)}</p>
          </div>
          <div class="brand-meta">
            <span>صفحة ${pageIndex + 1} / ${semesterKeys.length}</span>
          </div>
        </header>
        <div class="accent-rule"><span></span><span></span><span></span></div>
        <div class="term-banner">
          <div><span>المستوى الدراسي</span><strong>${esc(spLevelLabel(level))}</strong></div>
          <div><span>الفصل الدراسي</span><strong>${esc(spSemLabel(semester))}</strong></div>
          <div><span>عدد المقررات</span><strong>${semesterCourseCount}</strong></div>
          <div><span>إجمالي الساعات</span><strong>${totalHours}</strong></div>
        </div>
        ${hasElectives ? `<div class="elective-legend"><span class="legend-title"><i class="fas fa-layer-group"></i> المقررات الاختيارية</span><span class="legend-note">اختر مقررًا واحدًا من كل مجموعة</span><span class="legend-swatches"><i class="swatch s1"></i><i class="swatch s2"></i><i class="swatch s3"></i><i class="swatch s4"></i></span></div>` : ''}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="col-num">م</th>
                <th class="col-code">كود المقرر</th>
                <th class="col-name">اسم المقرر</th>
                <th class="col-hours">الساعات</th>
                <th class="col-prereq">المتطلبات السابقة</th>
                <th class="col-opens">يفتح المقررات</th>
              </tr>
            </thead>
            <tbody>${tableRows || '<tr><td colspan="6" class="empty">لا توجد مقررات مسجّلة لهذا الفصل</td></tr>'}</tbody>
          </table>
        </div>
        <footer class="page-footer">
          <span>كلية العلوم — جامعة سوهاج · الخطة الدراسية الرسمية</span>
          <span dir="ltr">${esc(prog.name || pname)} · L${level}-S${semester}</span>
        </footer>
      </section>`;
    }).join('');

    const documentHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>الخطة الدراسية — ${esc(prog.name || pname)}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm 7mm 9mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      font-family: 'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif;
      color: #1a2b3c;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #e8eef5;
    }

    .sheet {
      width: 100%;
      min-height: 277mm;
      background: #fff;
      padding: 6mm 6mm 8mm;
      position: relative;
      display: flex;
      flex-direction: column;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .sheet:last-child { page-break-after: auto; break-after: auto; }

    /* ── Cover ── */
    .cover-sheet {
      justify-content: flex-start;
      align-items: stretch;
      padding: 14mm 12mm 12mm;
      background:
        radial-gradient(circle at 90% 12%, var(--pdf-pale) 0%, transparent 38%),
        linear-gradient(160deg, #fff 0%, #fbfcfe 50%, var(--pdf-pale) 100%);
      isolation: isolate;
    }
    .cover-sheet:after {
      content: "";
      position: absolute;
      z-index: -1;
      inset: 5mm;
      border: 1.5px solid color-mix(in srgb, var(--pdf-primary) 28%, transparent);
      border-radius: 4mm;
      pointer-events: none;
    }
    .cover-orbit {
      position: absolute;
      z-index: -1;
      border: 1px solid color-mix(in srgb, var(--pdf-primary) 14%, transparent);
      border-radius: 50%;
      pointer-events: none;
    }
    .cover-orbit-one {
      width: 140mm; height: 140mm;
      right: -55mm; top: 30mm;
      box-shadow:
        0 0 0 10mm color-mix(in srgb, var(--pdf-primary) 4%, transparent),
        0 0 0 22mm color-mix(in srgb, var(--pdf-accent) 5%, transparent);
    }
    .cover-orbit-two {
      width: 80mm; height: 80mm;
      left: -35mm; bottom: -15mm;
      border-width: 2px;
      border-color: color-mix(in srgb, var(--pdf-accent) 30%, transparent);
    }
    .cover-topline {
      display: flex; align-items: center; justify-content: center; gap: 14px;
      color: var(--pdf-secondary); font-size: 12px; font-weight: 800; letter-spacing: 0.3px;
    }
    .cover-topline i {
      width: 42px; height: 2.5px; background: var(--pdf-accent); border-radius: 4px;
    }
    .cover-logos {
      display: flex; justify-content: center; align-items: center; gap: 18mm;
      margin: 14mm auto 8mm;
    }
    .cover-logo-card {
      width: 48mm; height: 36mm;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3mm;
      background: rgba(255,255,255,0.85);
      border: 1px solid #e0e8f0;
      border-radius: 5mm;
      box-shadow: 0 6px 20px rgba(18,40,68,0.06);
    }
    .cover-logo-card img { width: 20mm; height: 20mm; object-fit: contain; }
    .cover-logo-card span { font-size: 10px; font-weight: 800; color: #4a5d72; }
    .cover-title { text-align: center; margin: 6mm 0 8mm; }
    .cover-kicker {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 800; color: var(--pdf-secondary);
      letter-spacing: 0.4px; margin-bottom: 4mm;
    }
    .cover-kicker-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--pdf-accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--pdf-accent) 25%, transparent);
    }
    .cover-title h1 {
      margin: 0 0 3mm; font-size: 32px; font-weight: 900;
      color: var(--pdf-primary); line-height: 1.25;
    }
    .cover-title h1 em { font-style: normal; color: var(--pdf-accent); }
    .cover-title-rule {
      width: 48mm; height: 3px; margin: 0 auto 4mm;
      background: linear-gradient(90deg, var(--pdf-primary), var(--pdf-accent));
      border-radius: 3px;
    }
    .cover-title h2 {
      margin: 0 0 3mm; font-size: 18px; font-weight: 800;
      color: var(--pdf-secondary); line-height: 1.4;
    }
    .cover-description {
      margin: 0; font-size: 11px; color: #5a6d80; font-weight: 600;
    }
    .cover-metrics {
      display: flex; justify-content: center; gap: 5mm;
      margin: 8mm auto 0; flex-wrap: wrap;
    }
    .cover-metrics > div {
      width: 48mm; min-height: 28mm;
      text-align: center; padding: 5mm 3mm;
      background: #fff;
      border: 1px solid #e6e0d6;
      border-top: 3px solid var(--pdf-accent);
      border-radius: 3mm;
      box-shadow: 0 3px 12px rgba(20,40,65,0.04);
    }
    .cover-metrics span {
      display: block; font-size: 10px; font-weight: 700; color: #6a7b8c; margin-bottom: 2mm;
    }
    .cover-metrics strong {
      display: block; font-size: 26px; font-weight: 900; color: var(--pdf-primary);
    }
    .cover-bottom {
      margin-top: auto;
      display: flex; justify-content: space-between; align-items: center;
      padding-top: 5mm;
      border-top: 1px solid #e4ddd2;
      font-size: 10px; font-weight: 700; color: #5a6d80;
    }
    .cover-bottom-seal {
      color: var(--pdf-primary); letter-spacing: 0.5px;
    }

    /* ── Semester page header ── */
    .brand-head {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 4mm;
      margin-bottom: 3mm;
    }
    .brand-logos {
      display: flex; align-items: center; gap: 3mm;
    }
    .brand-logos img {
      width: 14mm; height: 14mm; object-fit: contain;
    }
    .brand-center { text-align: center; }
    .brand-uni {
      display: block; font-size: 9px; font-weight: 700;
      color: var(--pdf-secondary); letter-spacing: 0.2px;
    }
    .brand-center strong {
      display: block; font-size: 15px; font-weight: 900;
      color: var(--pdf-primary); line-height: 1.3; margin: 1px 0;
    }
    .brand-center p {
      margin: 0; font-size: 11px; font-weight: 700;
      color: var(--pdf-accent); line-height: 1.35;
    }
    .brand-meta {
      font-size: 9px; font-weight: 700; color: #6a7b8c;
      background: var(--pdf-pale);
      border: 1px solid color-mix(in srgb, var(--pdf-accent) 40%, #fff);
      border-radius: 5px; padding: 3px 8px;
    }
    .accent-rule {
      height: 3.5px; display: flex; border-radius: 4px; overflow: hidden;
      margin-bottom: 4mm;
    }
    .accent-rule span:nth-child(1) { width: 55%; background: var(--pdf-primary); }
    .accent-rule span:nth-child(2) { width: 28%; background: var(--pdf-accent); }
    .accent-rule span:nth-child(3) { width: 17%; background: var(--pdf-secondary); }

    /* ── Term banner ── */
    .term-banner {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 3mm;
      background: linear-gradient(110deg, var(--pdf-primary), var(--pdf-secondary));
      color: #fff;
      border-radius: 7px;
      padding: 7px 10px;
      margin-bottom: 4mm;
    }
    .term-banner div {
      display: flex; flex-direction: column; gap: 1px;
    }
    .term-banner span {
      font-size: 8.5px; font-weight: 600;
      color: rgba(255,255,255,0.78);
    }
    .term-banner strong {
      font-size: 12px; font-weight: 800; line-height: 1.3;
    }

    /* ── Table ── */
    .table-wrap {
      flex: 1;
      min-height: 0;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
      font-size: 10px;
      border: 1.5px solid color-mix(in srgb, var(--pdf-secondary) 55%, #94a3b8);
      border-radius: 8px;
      overflow: hidden;
    }
    thead { display: table-header-group; }
    thead th {
      background: linear-gradient(135deg, var(--pdf-primary), var(--pdf-secondary));
      color: #fff;
      font-weight: 800;
      font-size: 10px;
      padding: 8px 4px;
      text-align: center;
      line-height: 1.35;
      border-left: 1px solid rgba(255,255,255,0.2);
      border-bottom: 2.5px solid var(--pdf-accent);
    }
    thead th:first-child { border-left: 0; }
    tbody td {
      padding: 6px 4px;
      border-bottom: 1px solid #d5dde8;
      border-left: 1px solid #e4ebf2;
      text-align: center;
      vertical-align: middle;
      line-height: 1.4;
      overflow-wrap: anywhere;
      font-size: 10px;
    }
    tbody tr:nth-child(even) { background: color-mix(in srgb, var(--pdf-pale) 70%, #f4f7fb); }
    tbody tr:nth-child(odd) { background: #fff; }
    tbody tr:last-child td { border-bottom: 0; }
    tbody tr { break-inside: avoid; page-break-inside: avoid; }

    .col-num { width: 6%; }
    .col-code { width: 12%; }
    .col-name { width: 28%; }
    .col-hours { width: 8%; }
    .col-prereq { width: 23%; }
    .col-opens { width: 23%; }

    tbody td.num {
      font-size: 9px; font-weight: 700; color: #7a8797;
      background: color-mix(in srgb, var(--pdf-pale) 50%, #eef2f6);
    }
    tbody td.code {
      font-weight: 800; color: var(--pdf-primary);
      font-variant-numeric: tabular-nums;
      direction: ltr; unicode-bidi: isolate;
      letter-spacing: 0.2px;
    }
    tbody td.course-name {
      text-align: right; font-weight: 700; font-size: 10.5px;
      color: #1a2b3c;
    }
    tbody td.hours {
      font-weight: 900; color: var(--pdf-primary); font-size: 11px;
    }
    tbody td.empty {
      text-align: center; color: #8a9aab; font-weight: 600; padding: 12px;
    }

    .group-tag {
      display: flex; align-items: center; flex-wrap: wrap; gap: 3px;
      width: max-content; max-width: 100%; margin-top: 4px;
      padding: 3px 5px; border-radius: 6px;
      background: linear-gradient(100deg, #fffaf0, #fff4d9);
      color: #765014; border: 1px solid #edcf8a;
      box-shadow: 0 1px 2px rgba(118,80,20,.08); line-height: 1.2;
    }
    .group-tag b { padding: 2px 4px; border-radius: 4px; background: #d97706; color: #fff; font-size: 7px; font-weight: 900; }
    .group-tag span { font-size: 8px; font-weight: 850; }
    .group-tag em { padding: 1px 4px; border-radius: 999px; background: rgba(255,255,255,.82); color: #a16c19; font-size: 6.5px; font-style: normal; font-weight: 800; }
    .elective-legend { display: flex; align-items: center; gap: 7px; margin: 2.5mm 0 2mm; padding: 5px 8px; border: 1px solid #e8d6ae; border-right: 4px solid #d97706; border-radius: 7px; background: linear-gradient(100deg,#fffaf0,#fff 75%); color: #765014; }
    .legend-title { display: inline-flex; align-items: center; gap: 4px; font-size: 8.5px; font-weight: 900; }
    .legend-title i { color: #d97706; font-size: 9px; }
    .legend-note { color: #8b6a35; font-size: 7.5px; font-weight: 700; }
    .legend-swatches { display: inline-flex; gap: 3px; margin-right: auto; }
    .swatch { display: block; width: 10px; height: 10px; border-radius: 3px; border: 1px solid rgba(0,0,0,.08); }
    .swatch.s1 { background: #f6c453; } .swatch.s2 { background: #67b7df; } .swatch.s3 { background: #72c487; } .swatch.s4 { background: #bc83d5; }
    /* Elective groups */
    tbody tr.elective-row { background: color-mix(in srgb, var(--pdf-pale) 85%, #fff8e8); }
    tbody tr.elective-group-1 { background: #fff6e0; }
    tbody tr.elective-group-1 .course-name { border-right: 3px solid #d97706; }
    tbody tr.elective-group-2 { background: #e8f6ff; }
    tbody tr.elective-group-2 .course-name { border-right: 3px solid #0284c7; }
    tbody tr.elective-group-3 { background: #eef9f0; }
    tbody tr.elective-group-3 .course-name { border-right: 3px solid #16a34a; }
    tbody tr.elective-group-4 { background: #f8eef8; }
    tbody tr.elective-group-4 .course-name { border-right: 3px solid #9333ea; }

    .relation-list {
      display: flex; flex-direction: column; gap: 2px;
      align-items: stretch;
    }
    .relation {
      display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 4px;
      background: color-mix(in srgb, var(--pdf-pale) 60%, #f7f5f0);
      border: 1px solid color-mix(in srgb, var(--pdf-accent) 30%, #ebe4d8);
      border-right: 2.5px solid var(--pdf-accent);
      padding: 2px 4px;
      border-radius: 4px;
      line-height: 1.35;
      text-align: right;
    }
    .relation b {
      font-size: 9px; font-weight: 700; color: #203d59;
    }
    .relation small {
      font-size: 8px; font-weight: 700;
      background: #fff;
      border: 1px solid #dce5ee;
      border-radius: 3px;
      padding: 1px 3px;
      color: var(--pdf-primary);
      direction: ltr; unicode-bidi: isolate;
    }
    .none {
      color: #a0aec0; font-weight: 600; font-size: 11px;
    }

    .page-footer {
      margin-top: auto;
      padding-top: 3mm;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 8.5px; font-weight: 600; color: #7a8797;
      border-top: 1px solid #e2e8f0;
    }

    /* Screen preview */
    @media screen {
      body { padding: 16px; background: #e8eef5; }
      .sheet {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto 18px;
        box-shadow: 0 10px 28px rgba(20,40,65,0.12);
        border: 1px solid #dde3ea;
      }
      .cover-sheet { min-height: 297mm; }
    }

    @media print {
      body { background: #fff; }
      .sheet {
        width: 100%;
        min-height: 277mm;
        box-shadow: none;
        border: 0;
      }
      thead th {
        background: linear-gradient(135deg, var(--pdf-primary), var(--pdf-secondary)) !important;
        color: #fff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      tbody tr, tbody td, .relation, .group-tag, .elective-legend, .term-banner {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body style="${sectionThemeStyle}">
${coverPage}${pages}
<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},700);});</script>
</body>
</html>`;

    if (options.returnHtml) {
      // Remove the interactive print trigger when this document is being rendered for ZIP export.
      return documentHtml.replace(/<script>window\.addEventListener\('load',[\s\S]*?<\/script>/i, '');
    }
    const popup = window.open('', '_blank');
    if (!popup) {
      if (typeof toast === 'function') toast('اسمح بالنوافذ المنبثقة لإنشاء ملف PDF', 'err');
      return;
    }
    popup.document.open();
    popup.document.write(documentHtml);
    popup.document.close();
  }

  function renderStudyCourses() {
    const box = document.getElementById('sp-courses');
    const statsEl = document.getElementById('sp-stats');
    if (!box) return;
    const pname = document.getElementById('sp-program')?.value || _spState.program;
    const pdfLink = document.getElementById('sp-download-pdf');
    const hasProgram = !!(pname && window.FOS_STUDY_PLANS?.programs?.[pname]);
    if (pdfLink) {
      pdfLink.href = '#';
      pdfLink.classList.toggle('is-disabled', !hasProgram);
      pdfLink.setAttribute('aria-disabled', hasProgram ? 'false' : 'true');
      pdfLink.tabIndex = hasProgram ? 0 : -1;
      pdfLink.removeAttribute('download');
    }
    if (!pname) {
      box.innerHTML = '<div class="empty-state"><i class="fas fa-book-open"></i>اختر البرنامج لعرض الخطة الدراسية</div>';
      if (statsEl) statsEl.innerHTML = '';
      return;
    }
    const items = spCollectCourses();
    const calc = spCalcHours(items);
    const levels = new Set(items.map(c => c.level).filter(Boolean));

    if (statsEl) {
      statsEl.innerHTML = `
        <div class="sp-stat"><div class="n">${calc.courseCount}</div><div class="l">مقررات محتسبة</div></div>
        <div class="sp-stat"><div class="n">${calc.totalHours}</div><div class="l">ساعات محتسبة</div></div>
        <div class="sp-stat"><div class="n">${levels.size || 4}</div><div class="l">المستويات</div></div>
        <div class="sp-stat"><div class="n">${calc.electiveGroups}</div><div class="l">مجموعات اختيارية</div></div>
        <div class="sp-stat hint"><div class="n" style="font-size:.85rem;font-weight:700">ملاحظة</div><div class="l">يُحتسب مقرر واحد فقط من كل مجموعة اختيارية</div></div>`;
    }

    if (!items.length) {
      box.innerHTML = '<div class="empty-state">لا توجد مقررات مطابقة للفلاتر</div>';
      return;
    }

    if (_spView === 'graph') {
      spRenderPrerequisiteGraph(pname);
      return;
    }

    if (_spView === 'visual') {
      const flat = [];
      items.forEach(it => {
        if (it.kind === 'elective_group') {
          (it.options || []).forEach(o => flat.push({ ...o, type: 'elective', electiveTitle: it.title }));
        } else flat.push(it);
      });
      spRenderVisual(flat, pname);
      return;
    }

    const groups = {};
    const order = [];
    items.forEach(it => {
      const key = it.termKey || (it.level + '-' + it.semester);
      if (!groups[key]) {
        groups[key] = { level: it.level, semester: it.semester, termKey: key, items: [] };
        order.push(key);
      }
      groups[key].items.push(it);
    });

    let html = '<div class="sp-plan">';
    order.forEach(key => {
      const g = groups[key];
      const gCalc = spCalcHours(g.items);
      html += `<section class="sp-sem-block">
        <header class="sp-sem-head">
          <div class="sp-sem-title">
            <span class="sp-lvl">${spLevelLabel(g.level)}</span>
            <span class="sp-sem">${spSemLabel(g.semester)}</span>
          </div>
          <div class="sp-sem-meta">${gCalc.courseCount} مقرر محتسب · ${gCalc.totalHours} ساعة</div>
        </header>
        <div class="sp-sem-body">`;

      g.items.forEach(it => {
        if (it.kind === 'elective_group') {
          const optHours = (it.options[0] && it.options[0].hours) || 0;
          html += `<div class="sp-elective-frame">
            <div class="sp-elective-head">
              <div class="sp-elective-badge"><i class="fas fa-random"></i> مجموعة اختيارية</div>
              <div class="sp-elective-title">${it.title || 'مقرر اختياري'}</div>
              <div class="sp-elective-note">اختر مقرراً واحداً · يُحتسب ${optHours} ساعة في المجموع</div>
            </div>
            <div class="sp-elective-options">
              ${(it.options || []).map((o, oi) => {
                const safe = String(o.code).replace(/'/g, "\\'");
                const prereqHtml = (o.prerequisites && o.prerequisites.length)
                  ? o.prerequisites.map(code => spChip(code, 'prereq', pname)).join('')
                  : '<span class="sp-empty">—</span>';
                const opensHtml = (o.opens && o.opens.length)
                  ? o.opens.map(code => spChip(code, 'open', pname)).join('')
                  : '<span class="sp-empty">—</span>';
                return `<div class="sp-elective-opt">
                  <div class="sp-opt-top">
                    <span class="sp-opt-or">${oi === 0 ? 'خيار' : 'أو'}</span>
                    <button type="button" class="sp-code" onclick="App.spShowCourse('${safe}', '${pname}')">${o.code}</button>
                    <span class="sp-name" onclick="App.spShowCourse('${safe}', '${pname}')">${o.name}</span>
                    <span class="sp-hours">${o.hours} س</span>
                  </div>
                  <div class="sp-opt-rels">
                    <div><span class="sp-rel-label">متطلب:</span> ${prereqHtml}</div>
                    <div><span class="sp-rel-label">يفتح:</span> ${opensHtml}</div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
        } else {
          const safe = String(it.code).replace(/'/g, "\\'");
          const ty = spTypeLabel(it.type);
          const prereqHtml = (it.prerequisites && it.prerequisites.length)
            ? it.prerequisites.map(code => spChip(code, 'prereq', pname)).join('')
            : '<span class="sp-empty">—</span>';
          const opensHtml = (it.opens && it.opens.length)
            ? it.opens.map(code => spChip(code, 'open', pname)).join('')
            : '<span class="sp-empty">—</span>';
          const minH = it.minHours ? `<span class="sp-minh" title="حد أدنى للساعات">≥ ${it.minHours} ساعة</span>` : '';
          html += `<article class="sp-course-card" id="sp-row-${it.code}">
            <div class="sp-cc-main">
              <button type="button" class="sp-code" onclick="App.spShowCourse('${safe}', '${pname}')">${it.code}</button>
              <div class="sp-cc-info">
                <div class="sp-name" onclick="App.spShowCourse('${safe}', '${pname}')">${it.name}</div>
                <div class="sp-cc-tags">
                  <span class="badge ${ty.cls}">${ty.label}</span>
                  <span class="sp-hours-pill">${it.hours} ساعة</span>
                  ${minH}
                </div>
              </div>
            </div>
            <div class="sp-cc-rels">
              <div class="sp-rel-block">
                <div class="sp-rel-label"><i class="fas fa-arrow-right"></i> المتطلب السابق</div>
                <div class="sp-rel-chips">${prereqHtml}</div>
              </div>
              <div class="sp-rel-block">
                <div class="sp-rel-label"><i class="fas fa-arrow-left"></i> يفتح المقررات</div>
                <div class="sp-rel-chips">${opensHtml}</div>
              </div>
            </div>
          </article>`;
        }
      });

      html += `</div></section>`;
    });
    html += '</div>';
    box.innerHTML = html;
  }

  function spSetView(mode) {
    _spView = mode === 'visual' ? 'visual' : (mode === 'graph' ? 'graph' : 'table');
    const t = document.getElementById('sp-view-table');
    const v = document.getElementById('sp-view-visual');
    const g = document.getElementById('sp-view-graph');
    if (t) t.classList.toggle('active', _spView === 'table');
    if (v) v.classList.toggle('active', _spView === 'visual');
    if (g) g.classList.toggle('active', _spView === 'graph');
    renderStudyCourses();
  }

  function spRenderPrerequisiteGraph(programName) {
    const box = document.getElementById('sp-courses');
    const SP = window.FOS_STUDY_PLANS;
    const program = SP && SP.programs && SP.programs[programName];
    if (!box || !program) return;
    const courseMap = spProgramCourseMap(programName) || {};
    const termKeys = Object.keys(program.semesters || {}).sort((a,b) => {
      const A=spParseTerm(a), B=spParseTerm(b); return A.level-B.level || A.semester-B.semester;
    });
    const terms = termKeys.map(key => ({key, ...spParseTerm(key)}));
    const courses = [];
    termKeys.forEach(key => {
      const t = spParseTerm(key);
      (program.semesters[key] || []).forEach(entry => {
        const add = c => { if (c && c.code && courseMap[String(c.code).toUpperCase()]) courses.push({...courseMap[String(c.code).toUpperCase()], level:t.level, semester:t.semester, termKey:key}); };
        if (entry && entry.type === 'elective_group') (entry.options || []).forEach(add); else add(entry);
      });
    });
    const byTerm = {};
    courses.forEach(c => { (byTerm[c.termKey] ||= []).push(c); });
    const nodeId = code => 'spg-' + String(code).replace(/[^a-zA-Z0-9_-]/g,'_');
    box.innerHTML = `<div class="sp-graph-intro"><div><strong>خريطة ترابط مقررات البرنامج</strong><span>اتبع الأسهم من المقرر السابق إلى المقرر الذي يعتمد عليه. الخريطة تعرض مقررات هذا البرنامج فقط.</span></div><div class="sp-graph-legend"><span><i class="spg-dot prereq"></i> متطلب سابق</span><span><i class="spg-line"></i> مسار الاعتماد</span><button type="button" class="sp-graph-pdf" onclick="App.spDownloadGraphPDF()"><i class="fas fa-file-pdf"></i> تحميل الخريطة PDF</button></div></div><div class="sp-graph-scroll"><div class="sp-graph-canvas" id="sp-graph-canvas"><svg class="sp-graph-links" id="sp-graph-links" aria-hidden="true"></svg><div class="sp-graph-columns">${terms.map(t => `<section class="sp-graph-column" data-term="${t.key}"><header><span>${spLevelLabel(t.level)}</span><strong>${spSemLabel(t.semester)}</strong><small>${(byTerm[t.key]||[]).length} مقررات</small></header><div class="sp-graph-nodes">${(byTerm[t.key]||[]).map(c => `<button type="button" class="sp-graph-node" id="${nodeId(c.code)}" data-code="${escapeProfileValue(c.code)}" onclick="App.spShowCourse('${String(c.code).replace(/'/g,"\\'")}','${String(programName).replace(/'/g,"\\'")}')"><span class="spg-code">${escapeProfileValue(c.code)}</span><strong>${escapeProfileValue(c.name || c.code)}</strong><span class="spg-hours">${Number(c.hours)||0} ساعات معتمدة</span><span class="spg-rel-count">${(c.prerequisites||[]).filter(x=>courseMap[String(x).toUpperCase()]).length ? 'له متطلب سابق' : 'لا يوجد متطلب سابق'}</span></button>`).join('')}</div></section>`).join('')}</div></div></div><p class="sp-graph-footnote"><i class="fas fa-circle-info"></i> اضغط على أي مقرر لعرض تفاصيله وعلاقاته. المقررات الاختيارية تظهر كخيارات منفصلة.</p>`;
    const draw = () => {
      const canvas = document.getElementById('sp-graph-canvas');
      const svg = document.getElementById('sp-graph-links');
      if (!canvas || !svg) return;
      const width = canvas.scrollWidth, height = canvas.scrollHeight;
      svg.setAttribute('width', width); svg.setAttribute('height', height); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.innerHTML = '<defs><marker id="spg-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#0d9488"/></marker></defs>';
      const rect = canvas.getBoundingClientRect();
      courses.forEach(course => {
        const target = document.getElementById(nodeId(course.code));
        if (!target) return;
        (course.prerequisites || []).forEach(preCode => {
          const pre = courseMap[String(preCode).toUpperCase()];
          const source = document.getElementById(nodeId(preCode));
          if (!pre || !source || source === target) return;
          const a=source.getBoundingClientRect(), b=target.getBoundingClientRect();
          const sameColumn = source.closest('.sp-graph-column') === target.closest('.sp-graph-column');
          const x1=(sameColumn ? a.left-rect.left+a.width : a.right-rect.left), y1=a.top-rect.top+a.height/2;
          const x2=(sameColumn ? b.left-rect.left+a.width/2 : b.left-rect.left), y2=b.top-rect.top+b.height/2;
          const bend=Math.max(24,Math.abs(x2-x1)*.42);
          const path=document.createElementNS('http://www.w3.org/2000/svg','path');
          path.setAttribute('d', sameColumn ? `M ${x1} ${y1} C ${x1+36} ${y1}, ${x2+36} ${y2}, ${x2} ${y2}` : `M ${x1} ${y1} C ${x1+bend} ${y1}, ${x2-bend} ${y2}, ${x2} ${y2}`);
          path.setAttribute('class','spg-edge'); path.setAttribute('marker-end','url(#spg-arrow)');
          svg.appendChild(path);
        });
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(draw));
    if (window._spGraphResize) window.removeEventListener('resize', window._spGraphResize);
    window._spGraphResize = () => { if (_spView === 'graph') draw(); };
    window.addEventListener('resize', window._spGraphResize);
  }

  function spDownloadGraphPDF() {
    const SP = window.FOS_STUDY_PLANS;
    const pname = document.getElementById('sp-program')?.value || _spState.program;
    const prog = pname && SP?.programs?.[pname];
    if (!prog) { if (typeof toast === 'function') toast('اختر البرنامج أولاً لإنشاء الخريطة', 'err'); return; }

    const map = spProgramCourseMap(pname) || {};
    const keys = Object.keys(prog.semesters || {}).sort((a,b) => {
      const A=spParseTerm(a), B=spParseTerm(b);
      return A.level-B.level || A.semester-B.semester;
    });
    const terms = keys.map(key => ({key, ...spParseTerm(key), courses:[]}));
    terms.forEach(t => (prog.semesters[t.key] || []).forEach(entry => {
      const add = c => {
        const item = c && map[String(c.code || '').toUpperCase()];
        if (item && !t.courses.some(x => String(x.code).toUpperCase() === String(item.code).toUpperCase())) t.courses.push(item);
      };
      if (entry?.type === 'elective_group') (entry.options || []).forEach(add); else add(entry);
    }));
    const all = terms.flatMap(t => t.courses);
    if (!all.length) { if (typeof toast === 'function') toast('لا توجد مقررات لعرضها في الخريطة', 'err'); return; }

    const esc = value => escapeProfileValue(value == null ? '' : value);
    // A poster-sized single page preserves legible course labels instead of shrinking
    // the entire diagram into a standard A3 sheet.
    const colW = 258, nodeW = 224, nodeH = 64, top = 102, rowGap = 13, left = 24;
    const maxRows = Math.max(...terms.map(t => t.courses.length), 1);
    const width = left*2 + terms.length*colW;
    const height = top + maxRows*(nodeH+rowGap) + 28;
    const positions = {};
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" fill="#0f8b82"/></marker>
        <linearGradient id="topBand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#0f766e"/></linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="#f5f8fc"/>
      <rect x="0" y="0" width="${width}" height="8" fill="url(#topBand)"/>
      <text x="${width/2}" y="39" font-family="Cairo,Tahoma,sans-serif" font-size="24" font-weight="800" fill="#17365d" text-anchor="middle" direction="rtl">الخريطة التدفقية لمقررات البرنامج</text>
      <text x="${width/2}" y="65" font-family="Cairo,Tahoma,sans-serif" font-size="15" font-weight="700" fill="#52647a" text-anchor="middle" direction="rtl">${esc(prog.name || pname)}</text>
      <line x1="${width*0.25}" y1="80" x2="${width*0.75}" y2="80" stroke="#cbd8e5" stroke-width="1.5"/>`;

    // Semester columns with consistent alignment; every course is included.
    terms.forEach((t, ci) => {
      const x = left + ci*colW;
      const color = t.semester === 1 ? '#17365d' : '#0f766e';
      svg += `<rect x="${x}" y="87" width="${nodeW}" height="32" rx="7" fill="${color}"/>
        <text x="${x+nodeW/2}" y="100" font-family="Cairo,Tahoma,sans-serif" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle" direction="rtl">${esc(spLevelLabel(t.level))}</text>
        <text x="${x+nodeW/2}" y="112" font-family="Cairo,Tahoma,sans-serif" font-size="9" fill="#ffffff" text-anchor="middle" direction="rtl">${esc(spSemLabel(t.semester))} · ${t.courses.length} مقررات</text>`;
      t.courses.forEach((c, ri) => {
        const nx=x, ny=top+ri*(nodeH+rowGap);
        positions[String(c.code).toUpperCase()]={x:nx,y:ny,w:nodeW,h:nodeH};
      });
    });

    // Route arrows behind the course cards, from prerequisite to dependent course.
    const edges = [];
    all.forEach(c => (c.prerequisites || []).forEach(code => {
      const a=positions[String(code).toUpperCase()], b=positions[String(c.code).toUpperCase()];
      if (!a || !b || String(code).toUpperCase()===String(c.code).toUpperCase()) return;
      const ax=a.x+a.w, ay=a.y+a.h/2, bx=b.x, by=b.y+b.h/2;
      const sameCol=Math.abs(ax-bx)<2;
      let d;
      if (bx > ax + 8) {
        const mid=ax+(bx-ax)/2;
        d=`M ${ax} ${ay} C ${mid} ${ay}, ${mid} ${by}, ${bx} ${by}`;
      } else {
        // Backward / same-column prerequisite: route through a dedicated outer lane.
        const lane=Math.max(10, Math.min(ax,bx)-18-(edges.length%5)*5);
        d=`M ${ax} ${ay} C ${ax+18} ${ay}, ${lane} ${ay}, ${lane} ${(ay+by)/2} S ${bx-18} ${by}, ${bx} ${by}`;
      }
      edges.push(`<path d="${d}" fill="none" stroke="#0f8b82" stroke-width="1.7" stroke-opacity=".78" marker-end="url(#arrow)"/>`);
    }));
    svg += edges.join('');

    // Draw cards last so arrows never obscure course labels.
    terms.forEach((t, ci) => t.courses.forEach((c, ri) => {
      const n=positions[String(c.code).toUpperCase()];
      const title=String(c.name || c.code);
      const maxChars=31;
      const line1=title.length>maxChars ? title.slice(0,maxChars) : title;
      const line2=title.length>maxChars ? title.slice(maxChars, maxChars*2-1)+(title.length>maxChars*2-1?'…':'') : '';
      const accent=t.semester===1?'#2563eb':'#0f766e';
      svg += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" fill="#ffffff" stroke="#b8c9d9" stroke-width="1.2"/>
        <rect x="${n.x+n.w-5}" y="${n.y}" width="5" height="${n.h}" rx="2" fill="${accent}"/>
        <text x="${n.x+n.w-13}" y="${n.y+16}" font-family="Cairo,Tahoma,sans-serif" font-size="10" font-weight="800" fill="${accent}" text-anchor="end" direction="ltr">${esc(c.code)}</text>
        <text x="${n.x+n.w-13}" y="${n.y+34}" font-family="Cairo,Tahoma,sans-serif" font-size="10" font-weight="700" fill="#163047" text-anchor="end" direction="rtl">${esc(line1)}</text>
        ${line2 ? `<text x="${n.x+n.w-13}" y="${n.y+47}" font-family="Cairo,Tahoma,sans-serif" font-size="9" font-weight="600" fill="#163047" text-anchor="end" direction="rtl">${esc(line2)}</text>` : ''}
        <text x="${n.x+n.w-13}" y="${n.y+59}" font-family="Cairo,Tahoma,sans-serif" font-size="8" fill="#64748b" text-anchor="end" direction="rtl">${Number(c.hours)||0} ساعات معتمدة</text>`;
    }));
    svg += `<text x="${width/2}" y="${height-9}" font-family="Cairo,Tahoma,sans-serif" font-size="9" fill="#64748b" text-anchor="middle" direction="rtl">السهم يوضح الانتقال من المتطلب السابق إلى المقرر الذي يعتمد عليه · عدد المقررات: ${all.length}</text></svg>`;

    const popup=window.open('', '_blank');
    if (!popup) { if (typeof toast === 'function') toast('اسمح بالنوافذ المنبثقة لإنشاء ملف PDF', 'err'); return; }
    // Match the PDF page to the actual diagram dimensions so the browser prints one
    // readable landscape page rather than forcing the map into a tiny A3 viewport.
    const pageW=Math.ceil(width*25.4/96+12), pageH=Math.ceil(height*25.4/96+12);
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>خريطة مقررات ${esc(prog.name || pname)}</title><style>
      @page{size:${pageW}mm ${pageH}mm;margin:5mm}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;font-family:Cairo,Tahoma,sans-serif;color:#14253d;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{width:${width}px}
      svg{display:block;width:${width}px;height:${height}px;max-width:none}
      @media screen{body{padding:12px;width:max-content;background:#e9eef5}svg{box-shadow:0 4px 22px rgba(15,35,60,.16);background:#fff}}
    </style></head><body>${svg}<script>window.addEventListener('load',function(){document.fonts&&document.fonts.ready?document.fonts.ready.then(function(){setTimeout(function(){window.focus();window.print();},250)}):setTimeout(function(){window.focus();window.print();},700)});</script></body></html>`);
    popup.document.close();
  }

  function spRenderVisual(courses, programName) {
    const box = document.getElementById('sp-courses');
    if (!box) return;
    const byLevel = {};
    courses.forEach(c => {
      const L = c.level || 0;
      if (!byLevel[L]) byLevel[L] = { 1: [], 2: [] };
      byLevel[L][c.semester === 2 ? 2 : 1].push(c);
    });
    const levels = Object.keys(byLevel).map(Number).sort((a,b)=>a-b);
    if (!levels.length) {
      box.innerHTML = '<div class="empty-state"><i class="fas fa-book-open"></i>لا توجد مقررات</div>';
      return;
    }
    box.innerHTML = `<div class="sp-visual">` + levels.map(L => {
      const s1 = byLevel[L][1] || [];
      const s2 = byLevel[L][2] || [];
      const card = (c) => {
        const ty = spTypeLabel(c.type);
        const safe = String(c.code).replace(/'/g, "\\'");
        return `<div class="sp-course-card" onclick="App.spShowCourse('${safe}', '${programName}')">
          <div class="cc">${c.code}</div>
          <div class="cn">${c.name}</div>
          <div class="cm">${c.hours} ساعات · ${ty.label}</div>
        </div>`;
      };
      return `<div class="sp-level-block">
        <div class="sp-level-hd">${spLevelLabel(L)}</div>
        <div class="sp-sem-row">
          <div class="sp-sem-col"><div class="sp-sem-title">الفصل الأول</div>${s1.map(card).join('') || '<span class="sp-empty">—</span>'}</div>
          <div class="sp-sem-col"><div class="sp-sem-title">الفصل الثاني</div>${s2.map(card).join('') || '<span class="sp-empty">—</span>'}</div>
        </div>
      </div>`;
    }).join('') + `</div>`;
  }

  function spShowCourse(code, programName) {
    const c = spResolve(code, programName || _spState.program || document.getElementById('sp-program')?.value || '');
    const root = document.getElementById('sp-detail-root');
    if (!root) return;
    if (!c) {
      toast('المقرر غير موجود في الفهرس', 'err');
      return;
    }
    const ty = spTypeLabel(c.type);
    const prereqHtml = (c.prerequisites && c.prerequisites.length)
      ? c.prerequisites.map(x => spChip(x, 'prereq', c.program)).join('')
      : '<span class="sp-empty">—</span>';
    const opensHtml = (c.opens && c.opens.length)
      ? c.opens.map(x => spChip(x, 'open', c.program)).join('')
      : '<span class="sp-empty">—</span>';
    root.innerHTML = `
      <div class="sp-detail-overlay" onclick="if(event.target===this)App.spCloseDetail()">
        <div class="sp-detail-panel" role="dialog">
          <div class="hd">
            <div>
              <div style="font-family:ui-monospace,Menlo,monospace;font-size:.85rem;opacity:.85;margin-bottom:.25rem">${c.code}</div>
              <div style="font-size:1.15rem;font-weight:800">${c.name}</div>
            </div>
            <button type="button" class="btn btn-sm" style="background:rgba(255,255,255,.15);color:#fff;border:0" onclick="App.spCloseDetail()"><i class="fas fa-times"></i></button>
          </div>
          <div class="bd">
            <div class="grid-3 mb-3">
              <div><div class="text-xs text-muted mb-1">المستوى</div><span class="sp-lvl">${spLevelLabel(c.level)}</span></div>
              <div><div class="text-xs text-muted mb-1">الفصل</div><span class="sp-sem">${spSemLabel(c.semester)}</span></div>
              <div><div class="text-xs text-muted mb-1">الساعات</div><b style="font-size:1.1rem">${c.hours}</b></div>
              <div><div class="text-xs text-muted mb-1">النوع</div><span class="badge ${ty.cls}">${ty.label}</span></div>
              <div style="grid-column:span 2"><div class="text-xs text-muted mb-1">البرنامج</div><span class="text-sm">${c.program || '—'}</span></div>
            </div>
            <div class="mb-3">
              <div class="fw-bold text-sm mb-2"><i class="fas fa-arrow-right" style="color:#6366f1"></i> المتطلبات السابقة</div>
              <div>${prereqHtml}</div>
            </div>
            <div class="mb-3">
              <div class="fw-bold text-sm mb-2"><i class="fas fa-arrow-left" style="color:#14b8a6"></i> يفتح المقررات</div>
              <div>${opensHtml}</div>
            </div>
            <div class="mb-3">
              <div class="fw-bold text-sm mb-2"><i class="fas fa-project-diagram" style="color:var(--navy)"></i> المسار الأكاديمي</div>
              <div class="sp-path" id="sp-path-nodes"></div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" onclick="App.spCloseDetail()"><i class="fas fa-table"></i> العودة للجدول</button>
          </div>
        </div>
      </div>`;
    // highlight row if visible
    document.querySelectorAll('.sp-row-active').forEach(el => el.classList.remove('sp-row-active'));
    const row = document.getElementById('sp-row-' + c.code);
    if (row) row.classList.add('sp-row-active');
    // Build relation path: prereqs → current → opens (max 2 each side)
    const pathEl = document.getElementById('sp-path-nodes');
    if (pathEl) {
      const nodes = [];
      (c.prerequisites || []).slice(0, 3).forEach(code => {
        const p = spResolve(code, c.program);
        if (p) nodes.push({ ...p, kind: 'pre' });
      });
      nodes.push({ ...c, kind: 'current' });
      (c.opens || []).slice(0, 3).forEach(code => {
        const p = spResolve(code, c.program);
        if (p) nodes.push({ ...p, kind: 'open' });
      });
      pathEl.innerHTML = nodes.map((n, i) => {
        const safe = String(n.code).replace(/'/g, "\\'");
        const cls = n.kind === 'current' ? 'current' : '';
        const arrow = i < nodes.length - 1 ? '<div class="sp-path-arrow"><i class="fas fa-chevron-down"></i></div>' : '';
        return `<div class="sp-path-node ${cls}" onclick="App.spShowCourse('${safe}', '${c.program}')">
          <div class="pc">${n.code}</div>
          <div class="pn">${n.name}</div>
          <div class="text-xs text-muted">${spLevelLabel(n.level)} · ${spSemLabel(n.semester)}</div>
        </div>${arrow}`;
      }).join('');
    }
  }

  function spCloseDetail() {
    const root = document.getElementById('sp-detail-root');
    if (root) root.innerHTML = '';
  }

  function courseLabel(code) {
    const c = spResolve(code);
    return c ? c.name : (code || '—');
  }

  function formatCourseList(codes, limit) {
    const list = (codes || []).map(courseLabel).filter(Boolean);
    if (!list.length) return '—';
    if (limit && list.length > limit) return list.slice(0, limit).join(' · ') + ' …';
    return list.join(' · ');
  }

  function gpaEsc(value) { return escapeProfileValue(value == null ? '' : value); }
  function gpaProgramsForSection(section) {
    const plans = window.FOS_STUDY_PLANS?.programs || {};
    return Object.entries(plans).filter(([, p]) => p.section === section).map(([name, p]) => ({ id: name, name: name === 'برنامج البيولوجيا الجزيئية والطفيليات' ? 'برنامج البيولوجية الجزيئية والطفيليات' : (p.name || name) }));
  }
  const GPA_DEFAULT_YEARS = ['2020/2021','2021/2022','2022/2023','2023/2024','2024/2025','2025/2026','2026/2027'];
  function gpaAcademicYears() {
    const custom = load('gpaAcademicYears', []);
    return [...new Set([...GPA_DEFAULT_YEARS, ...(Array.isArray(custom) ? custom : [])])];
  }
  function gpaSaveAcademicYears(years) { save('gpaAcademicYears', years.filter(Boolean)); }
  function gpaAllCoursesForTerm(level, semester) {
    if (!_gpaState.program && Number(level) !== 1) return [];
    const plans = window.FOS_STUDY_PLANS?.programs || {};
    const key = `${level}-${semester}`;
    const seen = new Set(), courses = [];
    Object.values(plans).filter(p => p.section === _gpaState.section).forEach(plan => (plan.semesters?.[key] || []).forEach(entry => {
      const options = entry.type === 'elective_group' ? (entry.options || []) : [entry];
      options.forEach(course => { if (course?.code && !seen.has(course.code)) { seen.add(course.code); courses.push(course); } });
    }));
    return courses;
  }
  function gpaCoursesForSelection(level, semester) {
    if (_gpaState.program) {
      const plan = (window.FOS_STUDY_PLANS?.programs || {})[_gpaState.program];
      const seen = new Set(), courses = [];
      (plan?.semesters?.[`${level}-${semester}`] || []).forEach(entry => {
        const options = entry.type === 'elective_group' ? (entry.options || []) : [entry];
        options.forEach(course => { if (course?.code && !seen.has(course.code)) { seen.add(course.code); courses.push(course); } });
      });
      return courses;
    }
    return gpaAllCoursesForTerm(level, semester);
  }
  function gpaCurrentGrades() {
    return _gpaState.terms.flatMap(term => term.courses.map(course => ({ hours: course.hours, grade: course.grade, code: course.code })));
  }
  function gpaAdminYearsHtml() {
    const user = currentUser;
    if (!user || user.role !== 'admin') return '';
    return `<section class="gpa-admin-years"><div><span class="gpa-kicker">مدير النظام</span><h3>إدارة الأعوام الجامعية</h3><p>أضف عامًا جديدًا ليظهر في قائمة اختيار الفصل للطلاب.</p></div><div class="gpa-admin-year-form"><input id="gpa-new-year" class="form-control" placeholder="2027/2028" inputmode="numeric"><button type="button" class="btn btn-outline" onclick="App.gpaAddAcademicYear()"><i class="fas fa-plus"></i> إدراج عام جديد</button></div><div class="gpa-year-chips">${gpaAcademicYears().map(year => `<span>${gpaEsc(year)}${!GPA_DEFAULT_YEARS.includes(year) ? `<button type="button" title="حذف العام" onclick="App.gpaRemoveAcademicYear('${gpaEsc(year)}')">×</button>` : ''}</span>`).join('')}</div></section>`;
  }
  function renderGPACalc() {
    const root = document.getElementById('gpa-calc-root');
    if (!root) return;
    const programs = gpaProgramsForSection(_gpaState.section);
    const result = calcGPA(gpaCurrentGrades());
    const canAddTerm = !!_gpaState.section && (_gpaState.section !== 'special' || !!_gpaState.program);
    const hero = `<section class="gpa-hero"><div class="gpa-hero-icon"><i class="fas fa-calculator"></i></div><div><span class="gpa-kicker">أداة أكاديمية ذكية</span><h1>حاسبة المعدل</h1><p>اختر طريقة الإدخال: يدوياً مقرراً مقرر، أو برفع بيان الدرجات (Excel).</p></div><div class="gpa-result-orb"><strong>${result.gpa.toFixed(3)}</strong><span>المعدل المتوقع</span></div></section>`;
    const selectionCard = `<section class="gpa-selection-card"><div class="gpa-step"><span>1</span><div><b>حدد مسارك الدراسي</b><small>يُستخدم الاختيار لتصفية المقررات المناسبة لك</small></div></div><div class="gpa-select-grid"><label>الشعبة<select class="form-control" id="gpa-section-select" onchange="App.gpaSelectSection(this.value)"><option value="">— اختر الشعبة —</option>${GPA_SECTIONS.map(s => `<option value="${s.id}" ${_gpaState.section === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label><label>البرنامج<select class="form-control" id="gpa-program-select" ${_gpaState.section ? '' : 'disabled'} onchange="App.gpaSelectProgram(this.value)"><option value="">${_gpaState.section === 'special' ? '— اختر البرنامج الخاص —' : 'لم أشعب على برنامج بعد'}</option>${programs.map(p => `<option value="${gpaEsc(p.id)}" ${_gpaState.program === p.id ? 'selected' : ''}>${gpaEsc(p.name)}</option>`).join('')}</select></label></div>${_gpaState.section && !_gpaState.program ? `<div class="gpa-info-note"><i class="fas fa-circle-info"></i><span>سيتم عرض مقررات المستوى الأول من ${gpaEsc(GPA_SECTIONS.find(s => s.id === _gpaState.section)?.label)} فقط لأنك لم تتشعب على برنامج بعد.</span></div>` : ''}</section>`;
    const summaryStrip = `<section class="gpa-summary-strip"><div><span>الأعوام المضافة</span><strong>${_gpaState.terms.length}</strong></div><div><span>المقررات المحتسبة</span><strong>${gpaCurrentGrades().length}</strong></div><div><span>ساعات محسوبة في المعدل</span><strong>${result.hours}</strong></div><div><span>الساعات المجتازة</span><strong>${result.earnedHours}</strong></div><div class="gpa-summary-note"><i class="fas fa-lightbulb"></i><span>يمكن تسجيل مقرر من الفصل الأول في أي عام أو فصل تسجيل آخر</span></div></section>`;
    const termsSection = `<section class="gpa-terms-section"><div class="gpa-section-heading"><div><span class="gpa-kicker">2 · السجل الدراسي</span><h2>الأعوام الجامعية والمقررات</h2><p>${_gpaState.section ? 'أضف العام الجامعي الذي سُجلت فيه المقررات، ثم أضف كل مقرر بمستواه وفصله الأصلي.' : 'ابدأ باختيار الشعبة حتى تظهر لك أدوات إضافة الأعوام.'}</p></div><button type="button" class="btn btn-primary" ${canAddTerm ? '' : 'disabled'} onclick="App.gpaAddTerm()"><i class="fas fa-plus"></i> إضافة عام جامعي</button></div><div id="gpa-terms-list">${_gpaState.terms.length ? _gpaState.terms.map(gpaTermHtml).join('') : `<div class="gpa-empty"><i class="fas fa-calendar-days"></i><b>لا توجد أعوام مضافة بعد</b><span>${canAddTerm ? 'اضغط «إضافة عام جامعي» لبدء إدخال مقرراتك.' : 'اختر الشعبة والبرنامج أولًا.'}</span></div>`}</div></section>`;
    const scaleCard = `<section class="gpa-scale-card"><div><span class="gpa-kicker">مرجع سريع</span><h2>سلم التقديرات</h2><p class="gpa-scale-rules">المقرران UR001 وUR002 ساعات اجتياز فقط ولا يدخلان في المعدل · التقدير F أو «رل» يدخل المعدل بصفر نقاط × ساعات المقرر ويُحتسب ضمن الساعات المسجلة</p></div><div class="gpa-scale-pills">${S.gradeScale.map(g => `<span><b>${g.letter}</b><small>${g.points.toFixed(3)} نقطة</small></span>`).join('')}</div></section>`;
    let body;
    if (!_gpaMode) {
      body = gpaChooserHtml();
    } else if (_gpaMode === 'excel') {
      body = gpaModeBarHtml() + selectionCard + gpaExcelHtml();
    } else {
      body = gpaModeBarHtml() + selectionCard + gpaAdminYearsHtml() + summaryStrip + termsSection;
    }
    root.innerHTML = `<div class="gpa-modern-shell">${hero}${body}${scaleCard}</div>`;
  }
  function gpaChooserHtml() {
    return `<section class="gpa-chooser"><div class="gpa-chooser-head"><span class="gpa-kicker">الخطوة الأولى</span><h2>كيف تريد حساب معدلك؟</h2><p>اختر طريقة واحدة للبدء — يمكنك تغييرها في أي وقت.</p></div><div class="gpa-chooser-grid">
      <button type="button" class="gpa-chooser-card" onclick="App.gpaSetMode('manual')"><span class="gpa-chooser-icon"><i class="fas fa-keyboard"></i></span><b>إدخال يدوي</b><span>أضف أعوامك الجامعية ومقرراتك وتقديراتك بنفسك خطوة بخطوة، مع تصفية المقررات حسب شعبتك وبرنامجك.</span><em>ابدأ الإدخال <i class="fas fa-arrow-left"></i></em></button>
      <button type="button" class="gpa-chooser-card" onclick="App.gpaSetMode('excel')"><span class="gpa-chooser-icon gpa-chooser-icon-green"><i class="fas fa-file-excel"></i></span><b>رفع ملف Excel</b><span>ارفع بيان الدرجات الصادر من النظام ليُقرأ سجلّك تلقائياً: بياناتك، مقرراتك كل فصل، والمعدل المحسوب.</span><em>ارفع الملف <i class="fas fa-arrow-left"></i></em></button>
    </div></section>`;
  }
  function gpaModeBarHtml() {
    const isExcel = _gpaMode === 'excel';
    return `<section class="gpa-mode-bar"><div class="gpa-mode-current"><i class="fas ${isExcel ? 'fa-file-excel' : 'fa-keyboard'}"></i><span>طريقة الإدخال: <b>${isExcel ? 'رفع ملف Excel' : 'إدخال يدوي'}</b></span></div><button type="button" class="gpa-mode-switch" onclick="App.gpaSetMode('')"><i class="fas fa-arrow-right-arrow-left"></i> تغيير الطريقة</button></section>`;
  }
  function gpaTermHtml(term) {
    const registrationLabel = term.registrationSemester === 'summer' ? 'الصيفي' : term.registrationSemester === '2' ? 'الثاني' : 'الأول';
    const termRes = calcGPA(term.courses.map(c => ({ code: c.code, hours: c.hours, grade: c.grade })));
    const termGpaLabel = termRes.hours ? termRes.gpa.toFixed(3) : '—';
    return `<article class="gpa-term-card"><header><div class="gpa-term-number"><span>عام جامعي</span><b>${_gpaState.terms.indexOf(term) + 1}</b></div><div class="gpa-term-controls gpa-year-only"><label>العام الجامعي<select onchange="App.gpaTermChange('${term.id}','year',this.value)">${gpaAcademicYears().map(year => `<option value="${gpaEsc(year)}" ${term.year === year ? 'selected' : ''}>${gpaEsc(year)}</option>`).join('')}</select></label><label>فصل التسجيل<select onchange="App.gpaTermChange('${term.id}','registrationSemester',this.value)"><option value="1" ${term.registrationSemester === '1' ? 'selected' : ''}>الفصل الأول</option><option value="2" ${term.registrationSemester === '2' ? 'selected' : ''}>الفصل الثاني</option><option value="summer" ${term.registrationSemester === 'summer' ? 'selected' : ''}>الفصل الصيفي</option></select></label></div><div class="gpa-term-actions"><span>${registrationLabel} · ${term.courses.length} مقررات</span><span class="gpa-term-gpa">معدل العام: ${termGpaLabel}</span><button type="button" class="btn btn-sm btn-ghost" title="حذف العام" onclick="App.gpaRemoveTerm('${term.id}')"><i class="fas fa-trash"></i></button></div></header><div class="gpa-course-list">${term.courses.length ? term.courses.map(course => gpaCourseHtml(term, course)).join('') : '<div class="gpa-no-courses">لم تتم إضافة مقررات لهذا العام</div>'}</div><div class="gpa-course-add-panel"><b><i class="fas fa-plus-circle"></i> إضافة مقرر</b><span>اختر المستوى أولًا، ثم الفصل الأصلي للمقرر، وبعدها التقدير. يمكنك تسجيل مقرر الفصل الأول في فصل تسجيل ثانٍ أو صيفي.</span><div class="gpa-course-add-fields"><label>المستوى<select onchange="App.gpaDraftChange('${term.id}','level',this.value)">${[1,2,3,4].map(n => `<option value="${n}" ${String(term.draft.level) === String(n) ? 'selected' : ''}>المستوى ${['الأول','الثاني','الثالث','الرابع'][n-1]}</option>`).join('')}</select></label><label>الفصل الأصلي<select onchange="App.gpaDraftChange('${term.id}','semester',this.value)"><option value="1" ${term.draft.semester === '1' ? 'selected' : ''}>الفصل الأول</option><option value="2" ${term.draft.semester === '2' ? 'selected' : ''}>الفصل الثاني</option></select></label><label class="gpa-course-picker">المقرر<select onchange="App.gpaDraftChange('${term.id}','code',this.value)"><option value="">— اختر المقرر الهدف —</option>${gpaCoursesForSelection(term.draft.level,term.draft.semester).filter(c => !term.courses.some(x => x.code === c.code)).map(c => `<option value="${gpaEsc(c.code)}" ${term.draft.code === c.code ? 'selected' : ''}>${gpaEsc(c.code)} — ${gpaEsc(c.name)}</option>`).join('')}</select></label><label>التقدير<select onchange="App.gpaDraftChange('${term.id}','grade',this.value)">${S.gradeScale.map(g => `<option value="${g.letter}" ${term.draft.grade === g.letter ? 'selected' : ''}>${g.letter} · ${g.points.toFixed(3)}</option>`).join('')}</select></label><button type="button" class="btn btn-primary" ${term.draft.code ? '' : 'disabled'} onclick="App.gpaCommitCourse('${term.id}')"><i class="fas fa-check"></i> إضافة للمعدل</button></div></div></article>`;
  }
  function gpaCourseHtml(term, course) {
    const isUR = course.code === 'UR001' || course.code === 'UR002';
    const pts = letterPoints(course.grade);
    const isFail = !isUR && pts != null && Number(pts) === 0;
    const isUnknown = !S.gradeScale.some(x => x.letter === course.grade);
    const semLabel = course.semester === 'summer' ? 'الصيفي' : course.semester === '2' ? 'الثاني' : 'الأول';
    const flags = `${isUR ? '<span class="gpa-flag-ur">ساعات اجتياز فقط — لا تدخل المعدل</span>' : ''}${isFail ? '<span class="gpa-flag-fail">راسب — يحتسب بصفر نقاط في المعدل</span>' : ''}${isUnknown ? '<span class="gpa-flag-unknown">تقدير غير معروف بالسلم المعتمد — لن يُحتسب</span>' : ''}`;
    return `<div class="gpa-course-row"><div class="gpa-course-select"><i class="fas fa-book-open"></i><div><strong>${gpaEsc(course.code)} — ${gpaEsc(course.name)}</strong><small>المستوى ${course.level} · الفصل ${semLabel} · ${course.hours} ساعات</small>${flags ? `<div class="gpa-course-flags">${flags}</div>` : ''}</div></div><span class="gpa-course-hours">${course.hours} ساعات</span><span class="gpa-grade-badge${isFail ? ' gpa-grade-fail' : ''}">${gpaEsc(course.grade)} · ${pts != null ? Number(pts).toFixed(3) : '—'}</span><button type="button" class="gpa-delete-course" onclick="App.gpaRemoveCourse('${term.id}','${gpaEsc(course.id)}')"><i class="fas fa-xmark"></i></button></div>`;
  }
  function gpaSetMode(mode) {
    _gpaMode = (mode === 'manual' || mode === 'excel') ? mode : '';
    _gpaImport = null;
    renderGPACalc();
  }
  function gpaExcelHtml() {
    const imp = _gpaImport;
    let body;
    if (!imp) {
      body = `<div class="gpa-excel-drop">
        <label class="gpa-excel-dropzone" for="gpa-excel-file"><i class="fas fa-cloud-arrow-up"></i><b>اختر ملف بيان الدرجات</b><span>xlsx أو xls — البيان الصادر من النظام (rep_stud_degrees) ببيانات الطالب والفصول والمقررات</span></label>
        <input type="file" id="gpa-excel-file" accept=".xlsx,.xls" hidden onchange="App.gpaExcelPick(this)">
        ${_gpaState.section ? '' : '<div class="gpa-info-note"><i class="fas fa-circle-info"></i><span>اختر الشعبة والبرنامج من الأعلى أولاً لتظهر أسماء المقررات من بيانات المنصة حسب كود كل مقرر.</span></div>'}
        <div class="gpa-excel-note"><i class="fas fa-shield-halved"></i> يُعالج الملف محلياً في متصفحك فقط: لا يُحفظ في أي مكان، ولا يصل إلى بيانات أي طالب آخر، ولا يغيّر أي سجل رسمي. بعد المعاينة تقرر أنت اعتماده أو تجاهله.</div>
      </div>`;
    } else if (imp.error) {
      body = `<div class="alert alert-warn"><i class="fas fa-triangle-exclamation"></i> ${gpaEsc(imp.error)}</div>
        <div class="gpa-excel-actions"><button type="button" class="btn btn-outline" onclick="App.gpaExcelClear()"><i class="fas fa-undo"></i> اختيار ملف آخر</button></div>`;
    } else {
      const lookup = gpaCourseLookup();
      const calc = gpaSheetCalc(imp.courses);
      const counted = imp.courses.filter(c => ['passed','failed'].includes(c.status) && c.code !== 'UR001' && c.code !== 'UR002').length;
      const unknown = imp.courses.filter(c => c.status === 'unknown');
      const withdrawn = imp.courses.filter(c => c.status === 'withdrawn');
      const info = imp.info || {};
      const headCells = [['الطالب', info.name], ['كود الطالب', info.code], ['عام الالتحاق', info.enrollment], ['مستوى الدراسة', info.studyLevel], ['حالة القيد', info.status]]
        .filter(x => x[1]).map(x => `<div><span>${x[0]}</span><b>${gpaEsc(x[1])}</b></div>`).join('');
      const groups = [];
      imp.courses.forEach(c => {
        const key = (c.year || '') + '|' + (c.semesterLabel || '');
        let g = groups.find(x => x.key === key);
        if (!g) { g = { key, year: c.year, level: c.level, semesterLabel: c.semesterLabel, courses: [] }; groups.push(g); }
        g.courses.push(c);
      });
      const statusHtml = c => {
        if (c.status === 'passed') return '<span class="gpa-status-ok">ناجح</span>';
        if (c.status === 'failed') return '<span class="gpa-status-fail">راسب</span>';
        if (c.status === 'withdrawn') return '<span class="gpa-status-wd">منسحب</span>';
        if (c.status === 'unknown') return '<span class="gpa-status-fail">تقدير غير معروف</span>';
        return '<span class="gpa-status-unposted">غير مرصد</span>';
      };
      const blocks = groups.map(g => {
        const rows = g.courses.map((c, i) => {
          const plan = lookup[c.code];
          const name = plan ? plan.name : c.sheetName;
          const nameFlag = !plan && _gpaState.section ? ' <span class="gpa-flag-unknown">خارج خطة البرنامج</span>' : '';
          const urFlag = (c.code === 'UR001' || c.code === 'UR002') ? ' <span class="gpa-flag-ur">ساعات اجتياز فقط</span>' : '';
          return `<tr><td>${i + 1}</td><td>${gpaEsc(c.code)}</td><td>${gpaEsc(name)}${nameFlag}${urFlag}</td><td>${c.hours}</td><td>${c.score != null ? c.score : (c.status === 'unposted' ? '—' : gpaEsc(c.grade || '—'))}</td><td>${c.points != null ? Number(c.points).toFixed(3) : '—'}</td><td>${gpaEsc(c.grade || '—')}</td><td>${statusHtml(c)}</td></tr>`;
        }).join('');
        const title = [g.level, g.semesterLabel, g.year].filter(Boolean).map(gpaEsc).join(' · ');
        return `<div class="gpa-sem-block"><h3>${title || 'فصل دراسي'}</h3><div class="table-wrap"><table class="data"><thead><tr><th>م</th><th>كود المقرر</th><th>اسم المقرر</th><th>الساعات</th><th>الدرجة</th><th>النقاط</th><th>التقدير</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
      }).join('');
      const notes = [
        `<span><i class="fas fa-circle-info"></i> UR001 وUR002 يُحتسبان ساعات اجتياز فقط ولا يدخلان في المعدل.</span>`,
        `<span><i class="fas fa-circle-info"></i> المقرر الراسب (F / رل) يدخل المعدل بصفر نقاط × ساعاته.</span>`,
        imp.unposted && imp.unposted.length ? `<span><i class="fas fa-circle-info"></i> فصول بدون درجات مرصدة (الفصل الحالي) استُبعدت من الحساب: ${imp.unposted.map(u => gpaEsc([u.term, u.year].filter(Boolean).join(' · '))).join('، ')}.</span>` : '',
        withdrawn.length ? `<span><i class="fas fa-circle-info"></i> مقررات منسحبة استُبعدت من الحساب: ${withdrawn.map(c => gpaEsc(c.code)).join('، ')}.</span>` : '',
        unknown.length ? `<span class="gpa-flag-unknown"><i class="fas fa-triangle-exclamation"></i> تقديرات غير موجودة في السلم المعتمد لم تُحتسب: ${unknown.map(c => `${gpaEsc(c.code)} (${gpaEsc(c.grade)})`).join('، ')} — راجع شؤون الطلاب.</span>` : ''
      ].filter(Boolean).map(n => `<div class="gpa-excel-note">${n}</div>`).join('');
      body = `<div class="gpa-excel-preview">
        <div class="gpa-excel-file-chip"><i class="fas fa-file-excel"></i> ${gpaEsc(imp.fileName)} — ${imp.courses.length} مقرر في ${groups.length} فصل دراسي</div>
        ${headCells ? `<div class="gpa-sheet-head">${headCells}</div>` : ''}
        <div class="gpa-excel-result"><div><span>المعدل المتوقع</span><strong>${calc.gpa.toFixed(3)}</strong></div><div><span>ساعات محسوبة في المعدل</span><strong>${calc.hours}</strong></div><div><span>الساعات المجتازة</span><strong>${calc.earnedHours}</strong></div><div><span>مقررات محتسبة</span><strong>${counted}</strong></div></div>
        ${blocks}
        ${notes}
        <div class="gpa-excel-actions">
          <button type="button" class="btn btn-primary" onclick="App.gpaExcelApply()"><i class="fas fa-check"></i> اعتماد وإضافة للحاسبة</button>
          <button type="button" class="btn btn-outline" onclick="App.gpaExcelClear()"><i class="fas fa-xmark"></i> تجاهل الملف</button>
        </div>
      </div>`;
    }
    return `<section class="gpa-terms-section"><div class="gpa-section-heading"><div><span class="gpa-kicker">2 · الاستيراد</span><h2>رفع ملف السجل (Excel)</h2><p>ارفع بيان الدرجات الصادر من النظام ليُقرأ سجلّك ويُحسب المعدل بعد المعاينة.</p></div></div>${body}</section>`;
  }
  function gpaMapGrade(value) {
    const t = String(value == null ? '' : value).trim().toUpperCase();
    if (S.gradeScale.some(g => g.letter === t)) return t;
    const n = String(value == null ? '' : value).replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();
    if (/ممتاز|امتياز/.test(n)) return 'A+';
    if (/جيد جدا/.test(n)) return 'B+';
    if (/^جيد$|^جيده?$/.test(n)) return 'B';
    if (/مقبول/.test(n)) return 'C';
    if (/ضعيف/.test(n)) return 'D';
    if (/راسب|رسوب|سقط/.test(n)) return 'F';
    return null;
  }

  function gpaArDigits(value) {
    return String(value == null ? '' : value).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  }
  function gpaSheetNum(value) {
    const n = Number(gpaArDigits(value).replace(/[()]/g, '').replace(',', '.').trim());
    return Number.isFinite(n) ? n : null;
  }
  function gpaNormCode(value) {
    return gpaArDigits(value).replace(/\s+/g, '').toUpperCase();
  }
  function gpaCourseLookup() {
    const plans = window.FOS_STUDY_PLANS?.programs || {};
    const map = {};
    const order = [];
    if (_gpaState.program && plans[_gpaState.program]) order.push(_gpaState.program);
    Object.keys(plans).forEach(p => { if (!order.includes(p) && _gpaState.section && plans[p].section === _gpaState.section) order.push(p); });
    Object.keys(plans).forEach(p => { if (!order.includes(p)) order.push(p); });
    order.forEach(p => Object.keys(plans[p].semesters || {}).forEach(key => (plans[p].semesters[key] || []).forEach(c => {
      if (!map[c.code]) map[c.code] = { name: c.name, hours: c.hours, level: key.split('-')[0], semester: key.split('-')[1] };
    })));
    return map;
  }
  function gpaSheetCalc(courses) {
    let pts = 0, hrs = 0, earned = 0;
    courses.forEach(c => {
      if (c.status === 'unposted' || c.status === 'withdrawn' || c.status === 'unknown') return;
      if (c.code === 'UR001' || c.code === 'UR002') { if (c.status === 'passed') earned += c.hours; return; }
      const p = c.points != null ? c.points : (letterPoints(gpaMapGrade(c.grade) || c.grade) || 0);
      pts += p * c.hours; hrs += c.hours;
      if (c.status === 'passed') earned += c.hours;
    });
    return { gpa: hrs ? pts / hrs : 0, hours: hrs, earnedHours: earned };
  }
  function gpaParseStudentSheet(rows) {
    const T = v => String(v == null ? '' : v).trim();
    const info = {};
    const courses = [];
    const unposted = [];
    let curYear = '', curLevel = '', curSemLabel = '', curSemCourses = null, cols = null;
    const labelValue = (cells, re) => {
      for (let i = 0; i < cells.length; i++) {
        if (re.test(cells[i])) {
          for (let j = i - 1; j >= 0; j--) { const v = cells[j]; if (v && v !== ':' && v !== '—') return v; }
        }
      }
      return '';
    };
    const flushSem = () => {
      if (curSemCourses && curSemCourses.length && curSemCourses.every(c => c.status === 'unposted')) {
        unposted.push({ year: curYear, term: curSemLabel });
      }
      curSemCourses = null;
    };
    for (const raw of rows) {
      const cells = (raw || []).map(T);
      const joined = cells.join(' ');
      if (!joined.replace(/[:\s]/g, '')) continue;
      if (/عام الإلتحاق|عام الالتحاق/.test(joined)) {
        info.enrollment = gpaArDigits(labelValue(cells, /عام الإل?تحاق/));
        info.code = gpaArDigits(labelValue(cells, /كود الطالب/));
        info.name = labelValue(cells, /إسم الطالب|اسم الطالب/);
        continue;
      }
      if (/تاريخ الميلاد/.test(joined)) {
        info.birthDate = gpaArDigits(labelValue(cells, /تاريخ الميلاد/));
        info.birthPlace = labelValue(cells, /محل الميلاد/);
        info.nationality = labelValue(cells, /الجنسية/);
        continue;
      }
      if (/حالة القيد/.test(joined)) {
        info.studyLevel = labelValue(cells, /مستوى الدراسة/);
        info.status = labelValue(cells, /حالة القيد/);
        continue;
      }
      if (/العام الأكاديمي/.test(joined)) {
        flushSem();
        curYear = gpaArDigits(labelValue(cells, /العام الأكاديمي/)).replace(/[-–]/, '/');
        curLevel = labelValue(cells, /الفرقة/);
        curSemLabel = ''; cols = null;
        continue;
      }
      if (/الفصل الدراسي/.test(joined) && /المجموع/.test(joined)) {
        flushSem();
        curSemLabel = '';
        const li = cells.findIndex(c => c === 'الفصل الدراسي');
        if (li > 0) { for (let j = li - 1; j >= 0; j--) { const v = cells[j]; if (v && v !== ':' && v !== '—') { curSemLabel = v; break; } } }
        curSemCourses = []; cols = null;
        continue;
      }
      if (/كود المقرر/.test(joined) && (/إسم المقرر/.test(joined) || /اسم المقرر/.test(joined))) {
        cols = {};
        cells.forEach((c, i) => {
          if (/كود المقرر/.test(c)) cols.code = i;
          else if (/إسم المقرر|اسم المقرر/.test(c)) cols.name = i;
          else if (c === 'الساعات') cols.hours = i;
          else if (c === 'درجة') cols.score = i;
          else if (c === 'نقاط') cols.points = i;
          else if (c === 'تقدير') cols.grade = i;
          else if (c === 'ناجح') cols.pass = i;
        });
        continue;
      }
      if (cols && cols.code != null && cells[cols.code]) {
        const code = gpaNormCode(cells[cols.code]);
        if (!code || /كود/.test(code)) continue;
        const hours = gpaSheetNum(cells[cols.hours]);
        const scoreRaw = T(cells[cols.score]);
        const pointsRaw = T(cells[cols.points]);
        const grade = T(cells[cols.grade]);
        const passMark = T(cells[cols.pass]);
        let status;
        if (scoreRaw === '---' || grade === '---' || pointsRaw === '---') status = 'unposted';
        else if (/منسحب/.test(grade) || /منسحب/.test(scoreRaw)) status = 'withdrawn';
        else if (grade === 'رل' || grade === 'F' || passMark === 'X') status = 'failed';
        else status = 'passed';
        let points = null, score = null;
        if (status === 'passed') {
          points = gpaSheetNum(pointsRaw);
          score = gpaSheetNum(scoreRaw);
          if (gpaMapGrade(grade) == null) status = 'unknown';
        } else if (status === 'failed') {
          points = 0; score = 0;
        }
        const rec = { code, sheetName: T(cells[cols.name]), hours: hours || 0, score, points, grade, status, year: curYear, level: curLevel, semesterLabel: curSemLabel };
        courses.push(rec);
        if (curSemCourses) curSemCourses.push(rec);
      }
    }
    flushSem();
    if (!courses.length) return { error: 'لم يتم العثور على جدول مقررات في الملف. تأكد من رفع بيان الدرجات الصادر من النظام.' };
    return { info, courses, unposted };
  }
  function gpaExcelPick(input) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => { _gpaImport = { error: 'تعذر قراءة الملف، حاول مرة أخرى.' }; renderGPACalc(); };
    reader.onload = e => {
      try {
        if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('badext');
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const parsed = gpaParseStudentSheet(rows);
        _gpaImport = parsed.error ? { error: parsed.error } : { fileName: file.name, info: parsed.info, courses: parsed.courses, unposted: parsed.unposted };
      } catch (err) {
        _gpaImport = { error: 'صيغة الملف غير مدعومة. استخدم ملف بيان الدرجات بصيغة xlsx أو xls.' };
      }
      renderGPACalc();
    };
    reader.readAsArrayBuffer(file);
  }
  function gpaExcelApply() {
    const imp = _gpaImport;
    if (!imp || !imp.courses || !imp.courses.length) return;
    const lookup = gpaCourseLookup();
    const levelNum = label => {
      if (/الأول|الاول/.test(label)) return '1';
      if (/الثاني|الثانى/.test(label)) return '2';
      if (/الثالث/.test(label)) return '3';
      if (/الرابع/.test(label)) return '4';
      return '1';
    };
    const semKey = label => {
      if (/الصيف/.test(label)) return 'summer';
      if (/الثاني|الثانى/.test(label)) return '2';
      return '1';
    };
    const eligible = imp.courses.filter(c => ['passed', 'failed'].includes(c.status));
    if (!eligible.length) { if (typeof toast === 'function') toast('لا توجد مقررات مرصدة صالحة للإضافة', 'err'); return; }
    const groups = [];
    eligible.forEach(c => {
      const key = (c.year || '') + '|' + semKey(c.semesterLabel || '');
      let g = groups.find(x => x.key === key);
      if (!g) { g = { key, year: c.year, sem: semKey(c.semesterLabel || ''), courses: [] }; groups.push(g); }
      g.courses.push(c);
    });
    const knownYears = gpaAcademicYears();
    const latest = knownYears.at(-1);
    const extraYears = [];
    groups.forEach(g => {
      if (g.year && !gpaAcademicYears().includes(g.year)) { extraYears.push(g.year); knownYears.push(g.year); }
    });
    if (extraYears.length) gpaSaveAcademicYears(gpaAcademicYears().concat(extraYears));
    groups.forEach((g, gi) => {
      _gpaState.terms.push({
        id: 'term_imp_' + Date.now() + '_' + gi,
        year: g.year || latest,
        registrationSemester: g.sem,
        courses: g.courses.map((c, i) => {
          const plan = lookup[c.code];
          return {
            id: c.code + '_imp' + gi + '_' + i,
            code: c.code,
            name: plan ? plan.name : (c.sheetName || c.code),
            hours: c.hours,
            level: plan ? plan.level : levelNum(c.level || ''),
            semester: plan ? plan.semester : (g.sem === 'summer' ? 'summer' : g.sem),
            grade: c.status === 'failed' ? 'رل' : (gpaMapGrade(c.grade) || c.grade)
          };
        }),
        draft: { level: '1', semester: '1', code: '', grade: S.gradeScale[0].letter }
      });
    });
    _gpaImport = null;
    _gpaMode = 'manual';
    renderGPACalc();
    if (typeof toast === 'function') toast(`تم اعتماد الملف: ${eligible.length} مقرراً في ${groups.length} فصل دراسي`);
  }
  function gpaExcelClear() { _gpaImport = null; renderGPACalc(); }

  function gpaSelectSection(section) { _gpaState.section = section; _gpaState.program = ''; _gpaState.terms = []; renderGPACalc(); }
  function gpaSelectProgram(program) { _gpaState.program = program; _gpaState.terms = []; renderGPACalc(); }
  function gpaAddTerm() { if (!_gpaState.section || (_gpaState.section === 'special' && !_gpaState.program)) return; _gpaState.terms.push({ id: 'term_' + Date.now(), year: gpaAcademicYears().at(-1), registrationSemester: '1', courses: [], draft: { level: '1', semester: '1', code: '', grade: S.gradeScale[0].letter } }); renderGPACalc(); }
  function gpaRemoveTerm(id) { _gpaState.terms = _gpaState.terms.filter(t => t.id !== id); renderGPACalc(); }
  function gpaTermChange(id, key, value) { const term = _gpaState.terms.find(t => t.id === id); if (term) { term[key] = value; renderGPACalc(); } }
  function gpaDraftChange(id, key, value) { const term = _gpaState.terms.find(t => t.id === id); if (!term) return; term.draft[key] = value; if (key === 'level' || key === 'semester') term.draft.code = ''; renderGPACalc(); }
  function gpaCommitCourse(id) { const term = _gpaState.terms.find(t => t.id === id); if (!term || !term.draft.code) return; const c = gpaCoursesForSelection(term.draft.level, term.draft.semester).find(x => x.code === term.draft.code); if (!c) return; term.courses.push({ id: c.code + '_' + Date.now(), code: c.code, name: c.name, hours: Number(c.hours) || 0, level: term.draft.level, semester: term.draft.semester, grade: term.draft.grade }); term.draft = { ...term.draft, code: '' }; renderGPACalc(); }
  function gpaRemoveCourse(termId, courseId) { const term = _gpaState.terms.find(t => t.id === termId); if (term) { term.courses = term.courses.filter(c => c.id !== courseId); renderGPACalc(); } }
  function gpaAddAcademicYear() { if (!currentUser || currentUser.role !== 'admin') return; const input = document.getElementById('gpa-new-year'), year = String(input?.value || '').trim(); if (!/^20\d{2}\/20\d{2}$/.test(year)) return toast('اكتب العام بصيغة 2027/2028', 'err'); const years = gpaAcademicYears(); if (years.includes(year)) return toast('هذا العام موجود بالفعل', 'err'); years.push(year); gpaSaveAcademicYears(years); renderGPACalc(); toast('تم إدراج العام الجامعي'); }
  function gpaRemoveAcademicYear(year) { if (!currentUser || currentUser.role !== 'admin' || GPA_DEFAULT_YEARS.includes(year)) return; gpaSaveAcademicYears(gpaAcademicYears().filter(x => x !== year)); renderGPACalc(); }
  function addGPARow() { gpaAddTerm(); }
  function updateGPAPreview() { renderGPACalc(); }

  // ===== Forms =====
  async function renderFormsList() {
    let periods = S.periods;
    if (window.DB && DB.isOnline()) {
      const p = await DB.getPeriods();
      if (p) periods = p;
    } else periods = load('periods', S.periods);
    const groups = [
      { key: 'advising', title: 'نماذج وحدة الإرشاد الأكاديمي', items: S.formTypes.filter(f => f.category === 'advising') },
      { key: 'affairs', title: 'نماذج شؤون الطلاب', items: S.formTypes.filter(f => f.category === 'affairs') }
    ].filter(g => g.items.length);
    let html = `<div class="forms-hub-intro"><div class="forms-hub-icon"><i class="fas fa-file-signature"></i></div><div><div class="fw-extrabold">النماذج والطلبات الإلكترونية</div><div class="text-sm text-muted">اختر الجهة المختصة ثم افتح الاستمارة المطلوبة. إرسال الطلب لا يعني اعتماده أو تنفيذه.</div></div></div>`;
    groups.forEach((g, gi) => {
      const isAdvising = g.key === 'advising';
      html += `<section class="forms-category ${isAdvising ? 'forms-category-primary' : ''}" style="--category-delay:${gi * 90}ms">
        <button type="button" class="forms-category-toggle ${isAdvising ? 'is-open' : ''}" aria-expanded="${isAdvising ? 'true' : 'false'}" onclick="App.toggleFormsCategory('${g.key}',this)">
          <span class="forms-category-symbol"><i class="fas ${isAdvising ? 'fa-user-graduate' : 'fa-building-columns'}"></i></span>
          <span class="forms-category-copy"><strong>${g.title}</strong><small>${isAdvising ? 'استمارات الإرشاد الأكاديمي والخدمات الطلابية' : 'الطلبات والإجراءات الخاصة بشؤون الطلاب'}</small></span>
          <span class="forms-category-count">${g.items.length} نموذج</span><i class="fas fa-chevron-down forms-category-chevron"></i>
        </button>
        <div class="forms-category-content ${isAdvising ? '' : 'is-collapsed'}" id="forms-category-${g.key}">
          <div class="forms-cards-grid">`;
      html += g.items.map((f, fi) => {
        const open = periods[f.id] !== false;
        const isAddDrop = f.id === 'adddrop';
        return `<article class="card form-hub-card" style="--card-delay:${fi * 35}ms;--form-color:${f.color};${open ? '' : 'opacity:.55'}">
          <div class="card-body">
            <div class="form-hub-card-top"><span class="form-hub-icon"><i class="fas ${f.icon}"></i></span></div>
            <div class="fw-extrabold mb-1">${f.nameAr}</div>
            <div class="text-xs text-muted">${f.desc}</div>
            ${!open ? '<span class="badge badge-red mt-2">مغلق حالياً</span>' : ''}
            <button type="button" class="btn btn-primary btn-sm form-hub-action" ${open ? `onclick="App.openForm('${f.id}')"` : 'disabled'}>
              <i class="fas fa-pen"></i> فتح الاستمارة
            </button>
          </div>
        </article>`;
      }).join('');
      html += '</div></div></section>';
    });
    document.getElementById('forms-grid').innerHTML = html;
  }

  function toggleFormsCategory(key, button) {
    const content = document.getElementById('forms-category-' + key);
    if (!content) return;
    const opening = content.classList.contains('is-collapsed');
    content.classList.toggle('is-collapsed', !opening);
    button.setAttribute('aria-expanded', opening ? 'true' : 'false');
    button.classList.toggle('is-open', opening);
  }


  let addDropStep = 1;
  let addDropCourseCounter = 0;
  let addDropDraftKey = null;

  function addDropProgramCourses() {
    const SP = window.FOS_STUDY_PLANS;
    if (!SP || !SP.programs) return [];
    const prog = S.programs.find(p => p.id === currentUser.program);
    const programName = (prog && prog.nameAr) || currentUser.program || '';
    const program = SP.programs[programName] || SP.programs[Object.keys(SP.programs).find(n => n === programName || (SP.programs[n].name || n) === programName)];
    const source = program || null;
    const all = [];
    if (source && source.semesters) {
      Object.keys(source.semesters).forEach(semesterKey => {
        (source.semesters[semesterKey] || []).forEach(c => {
          if (c.type === 'elective_group') (c.options || []).forEach(o => all.push(Object.assign({ semester: semesterKey }, o)));
          else if (c && c.code) all.push(Object.assign({ semester: semesterKey }, c));
        });
      });
    }
    const unique = {};
    all.forEach(c => { if (c.code && !unique[c.code]) unique[c.code] = c; });
    return Object.keys(unique).map(k => unique[k]).sort((a,b) => String(a.code).localeCompare(String(b.code)));
  }

  function addDropCourseOptions(selected) {
    const courses = addDropProgramCourses();
    return `<option value="">ابحث واختر مقررًا من الخطة الدراسية</option>` + courses.map(c =>
      `<option value="${String(c.code).replace(/"/g,'&quot;')}" data-name="${String(c.name || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" data-hours="${Number(c.hours)||0}" data-prereq="${String((c.prerequisites || []).join('، ')).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" ${selected === c.code ? 'selected' : ''}>${c.code} — ${c.name} (${c.hours || '—'} س)</option>`
    ).join('') + `<option value="__manual__">المقرر غير موجود بالقائمة — إدخال يدوي</option>`;
  }

  function addDropRow(kind, existing) {
    const target = document.getElementById(kind === 'drop' ? 'ad-drop-rows' : 'ad-add-rows');
    if (!target) return;
    const id = ++addDropCourseCounter;
    const c = existing || {};
    const tr = document.createElement('tr');
    tr.className = 'ad-course-row';
    tr.dataset.kind = kind;
    tr.dataset.rowId = String(id);
    tr.innerHTML = `<td class="ad-row-number">${target.children.length + 1}</td>
      <td><input class="form-control ad-course-name" placeholder="اسم المقرر باللغة العربية" value="${String(c.name || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" required pattern="[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\sـًٌٍَُِّْٰٕٓٔ]+" title="اكتب اسم المقرر باللغة العربية فقط" aria-label="اسم المقرر باللغة العربية"></td>
      <td><input class="form-control ad-course-code" placeholder="مثال: CHEM101" value="${String(c.code || '').replace(/"/g,'&quot;')}" required pattern="(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]+" title="يجب أن يتكون الكود من حروف إنجليزية وأرقام" aria-label="كود المقرر"></td>
      <td><select class="form-control ad-course-hours" required aria-label="عدد الساعات"><option value="">اختر</option><option value="2" ${Number(c.hours)===2?'selected':''}>2</option><option value="3" ${Number(c.hours)===3?'selected':''}>3</option><option value="4" ${Number(c.hours)===4?'selected':''}>4</option></select></td>
      <td><input class="form-control ad-course-note" placeholder="ملاحظة اختيارية" value="${String(c.note || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" aria-label="ملاحظة اختيارية"></td>
      <td><button type="button" class="btn btn-ghost btn-sm ad-remove-row" title="إزالة المقرر" onclick="App.removeAddDropRow(this)"><i class="fas fa-trash-alt"></i></button></td>`;
    target.appendChild(tr);
    return tr;
  }

  function onAddDropCoursePick() { /* retained for compatibility with older cached views */ }

  function removeAddDropRow(button) {
    const row = button.closest('tr');
    if (!row) return;
    const tbody = row.parentElement;
    row.remove();
    Array.from(tbody.querySelectorAll('tr')).forEach((tr, i) => tr.querySelector('.ad-row-number').textContent = i + 1);
    updateAddDropSummary();
  }

  function collectAddDropRows(kind) {
    const tbody = document.getElementById(kind === 'drop' ? 'ad-drop-rows' : 'ad-add-rows');
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr')).map(row => ({
      action: kind,
      code: (row.querySelector('.ad-course-code')?.value || '').trim(),
      name: (row.querySelector('.ad-course-name')?.value || '').trim(),
      hours: Number(row.querySelector('.ad-course-hours')?.value || 0),
      prerequisites: '',
      note: (row.querySelector('.ad-course-note')?.value || '').trim()
    })).filter(c => c.code || c.name || c.hours);
  }

  function updateAddDropSummary() {
    const drops = collectAddDropRows('drop');
    const adds = collectAddDropRows('add');
    const dropHours = drops.reduce((n,c) => n + (c.hours || 0), 0);
    const addHours = adds.reduce((n,c) => n + (c.hours || 0), 0);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('ad-review-drop-count', drops.length); set('ad-review-add-count', adds.length);
    set('ad-review-drop-hours', dropHours); set('ad-review-add-hours', addHours);
    const studentReview = document.getElementById('ad-review-student-data');
    if (studentReview) {
      const esc = value => String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const val = id => document.getElementById(id)?.value || '—';
      const sec = document.getElementById('ad-section');
      const secLabel = sec?.selectedOptions?.[0]?.textContent || '—';
      const pr = document.getElementById('ad-program');
      const prLabel = pr?.selectedOptions?.[0]?.textContent || '—';
      studentReview.innerHTML = `<div class="ad-review-course"><span>الاسم</span><b>${esc((currentUser||{}).name||'—')}</b><span>الكود: ${esc((currentUser||{}).code||(currentUser||{}).username||'—')}</span></div><div class="ad-review-course"><span>المستوى</span><b>${esc(val('ad-level'))}</b><span>${esc(secLabel)} — ${esc(prLabel)}</span></div><div class="ad-review-course"><span>الفصل والعام</span><b>${esc(val('ad-semester'))}</b><span>${esc(val('ad-year'))}</span></div><div class="ad-review-course"><span>الساعات المجتازة</span><b>${esc(val('ad-completed-hours'))}</b><span>الساعات المسجلة: ${esc(val('ad-registered-hours'))}</span></div><div class="ad-review-course"><span>السجل الدراسي</span><b>${esc(addDropTranscriptData.length ? addDropTranscriptData.map(f => f.name).join('، ') : 'لم يتم رفع الملفات')}</b><span>${addDropTranscriptData.length} ملف مرفق · إلزامي</span></div><div class="ad-review-course"><span>ملاحظات الطالب</span><b>${esc(val('ad-student-notes') === '—' ? 'لا توجد' : val('ad-student-notes'))}</b><span></span></div>`;
    }
    const holder = document.getElementById('ad-review-course-list');
    if (holder) {
      const esc = value => String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const line = (c, label) => `<div class="ad-review-course"><span class="ad-review-action ${label === 'حذف' ? 'is-drop' : 'is-add'}">${label}</span><span><b>${esc(c.code || '—')}</b> · ${esc(c.name || '—')}</span><span>${c.hours || 0} ساعة${c.note ? ' — ' + esc(c.note) : ''}</span></div>`;
      holder.innerHTML = drops.map(c => line(c,'حذف')).join('') + adds.map(c => line(c,'إضافة')).join('') || '<div class="text-muted text-sm">لم تتم إضافة مقررات بعد.</div>';
    }
  }

  function addDropShowStep(step) {
    addDropStep = step;
    const root = document.getElementById('adddrop-wizard');
    if (!root) return;
    root.querySelectorAll('[data-ad-step]').forEach(el => el.classList.toggle('hidden', Number(el.dataset.adStep) !== step));
    root.querySelectorAll('[data-ad-progress]').forEach(el => {
      const n = Number(el.dataset.adProgress);
      el.classList.toggle('is-current', n === step);
      el.classList.toggle('is-complete', n < step);
    });
    const fill = root.querySelector('.ad-progress-fill');
    if (fill) fill.style.width = ((step - 1) / 3 * 100) + '%';
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (step === 4) updateAddDropSummary();
  }

  function addDropContinueFromInstructions() {
    const check = document.getElementById('ad-read-confirm');
    const btn = document.getElementById('ad-read-next');
    if (!check || !check.checked) {
      if (btn) btn.classList.add('ad-attention');
      return toast('يجب تأكيد قراءة التعليمات قبل تسجيل البيانات', 'err');
    }
    if (btn) btn.classList.remove('ad-attention');
    addDropShowStep(2);
  }

  function addDropBack(step) { addDropShowStep(step); }

  function addDropValidateData() {
    const form = document.getElementById('adddrop-data-form');
    if (!form) return false;
    const requiredIds = ['ad-level','ad-section','ad-program','ad-semester','ad-year','ad-completed-hours','ad-registered-hours'];
    for (const id of requiredIds) {
      const el = document.getElementById(id);
      if (el && !el.value) { el.reportValidity ? el.reportValidity() : null; toast('يرجى استكمال جميع البيانات الأكاديمية المطلوبة', 'err'); el.focus(); return false; }
    }
    if (!form.reportValidity()) return false;
    const section = document.getElementById('ad-section');
    const program = document.getElementById('ad-program');
    if (section && section.value === 'special' && (!program || !program.value)) { toast('اختر البرنامج الخاص', 'err'); return false; }
    addDropShowStep(3);
    return true;
  }

  function addDropValidateCourses() {
    const drops = collectAddDropRows('drop');
    const adds = collectAddDropRows('add');
    if (!drops.length && !adds.length) { toast('أضف مقررًا واحدًا على الأقل للحذف أو الإضافة', 'err'); return false; }
    if (!addDropTranscriptData.length) {
      toast('يجب رفع ملف واحد على الأقل للسجل الدراسي قبل الانتقال إلى مراجعة الطلب', 'err');
      const upload = document.getElementById('ad-transcript-input');
      if (upload) upload.focus();
      return false;
    }
    const rows = [...document.querySelectorAll('.ad-course-row')];
    for (const row of rows) {
      const name = row.querySelector('.ad-course-name');
      const code = row.querySelector('.ad-course-code');
      const hours = row.querySelector('.ad-course-hours');
      if (!name.value.trim() && !code.value.trim() && !hours.value) continue;
      if (!name.value.trim() || !/^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\sـًٌٍَُِّْٰٕٓٔ]+$/.test(name.value.trim())) { name.setCustomValidity('اكتب اسم المقرر باللغة العربية فقط'); name.reportValidity(); name.setCustomValidity(''); return false; }
      if (!/^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]+$/.test(code.value.trim())) { code.setCustomValidity('يجب أن يتكون الكود من حروف إنجليزية وأرقام'); code.reportValidity(); code.setCustomValidity(''); return false; }
      if (![2,3,4].includes(Number(hours.value))) { hours.setCustomValidity('عدد الساعات يجب أن يكون 2 أو 3 أو 4'); hours.reportValidity(); hours.setCustomValidity(''); return false; }
    }
    addDropShowStep(4);
    return true;
  }

  function updateAddDropPrograms() {
    const sectionEl = document.getElementById('ad-section');
    const programEl = document.getElementById('ad-program');
    if (!sectionEl || !programEl) return;
    const section = sectionEl.value;
    const programs = (S.programs || []).filter(p => section === 'special' ? p.type === 'special' : p.type !== 'special' && p.section === section);
    const noneLabel = section === 'special' ? 'اختر البرنامج الخاص' : 'اختر البرنامج';
    programEl.innerHTML = `<option value="">${noneLabel}</option>` + (section && section !== 'special' ? `<option value="__unbranched__">${section === 'biological' ? 'العلوم البيولوجية' : section === 'physical' ? 'العلوم الفيزيائية' : 'العلوم الجيولوجية'} — قسم عام</option>` : '') + programs.map(p => `<option value="${String(p.id).replace(/"/g,'&quot;')}">${p.nameAr}</option>`).join('');
    programEl.required = true;
    updateAddDropProgramVisibility();
  }

  function updateAddDropProgramVisibility() {
    const programEl = document.getElementById('ad-program');
    const group = document.getElementById('ad-program-group');
    if (!programEl || !group) return;
    // Once the student chooses the general section, the extra program field is no longer needed.
    group.classList.toggle('hidden', programEl.value === '__unbranched__');
  }

  function addDropValidateStudentData() {
    const form = document.getElementById('adddrop-data-form');
    if (!form || !form.reportValidity()) return false;
    const section = document.getElementById('ad-section');
    const program = document.getElementById('ad-program');
    if (!section.value || !program.value) { toast('اختر القسم أو الشعبة والبرنامج المناسب', 'err'); (section.value ? program : section).focus(); return false; }
    addDropShowStep(3);
    return true;
  }

  async function submitAddDrop(e) {
    e.preventDefault();
    const form = document.getElementById('adddrop-data-form');
    if (!form || !form.reportValidity()) { addDropShowStep(2); return; }
    const drops = collectAddDropRows('drop');
    const adds = collectAddDropRows('add');
    if (!addDropTranscriptData.length) { toast('يجب رفع ملف واحد على الأقل للسجل الدراسي قبل إرسال الطلب', 'err'); addDropShowStep(3); return; }
    if (!drops.length && !adds.length) { toast('أضف مقررًا واحدًا على الأقل للحذف أو الإضافة', 'err'); addDropShowStep(3); return; }
    const all = [...drops, ...adds];
    if (all.some(c => !c.code || !/(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]+/.test(c.code) || !c.name || !/^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\sـًٌٍَُِّْٰٕٓٔ]+$/.test(c.name) || ![2,3,4].includes(c.hours))) {
      toast('تأكد من أن اسم المقرر عربي والكود من حروف إنجليزية وأرقام والساعات 2 أو 3 أو 4', 'err'); addDropShowStep(3); return;
    }
    const cu = currentUser || {};
    const prog = S.programs.find(p => p.id === cu.program);
    const req = {
      id: 'REQ-' + Date.now(),
      type: 'adddrop',
      formTitle: 'استمارة طلب حذف أو إضافة مقرر / مقررات دراسية',
      studentName: cu.name || '',
      studentCode: cu.code || cu.username || '',
      level: document.getElementById('ad-level').value,
      section: document.getElementById('ad-section').value,
      sectionName: document.getElementById('ad-section').selectedOptions[0]?.textContent || '',
      program: document.getElementById('ad-program').value === '__unbranched__' ? document.getElementById('ad-program').selectedOptions[0].textContent : ((S.programs.find(p => p.id === document.getElementById('ad-program').value) || {}).nameAr || document.getElementById('ad-program').selectedOptions[0]?.textContent || ''),
      year: document.getElementById('ad-year').value,
      semester: document.getElementById('ad-semester').value,
      completedHours: Number(document.getElementById('ad-completed-hours').value || 0),
      registeredHours: Number(document.getElementById('ad-registered-hours').value || 0),
      phone: document.getElementById('ad-phone').value.trim(),
      courses: all,
      dropCourses: drops,
      addCourses: adds,
      studentNotes: document.getElementById('ad-student-notes').value.trim(),
      declarationAccepted: true,
      hasTranscript: true,
      transcripts: addDropTranscriptData,
      transcript: addDropTranscriptData[0] || null,
      createdAt: new Date().toISOString(),
      status: 'pending_advisor',
      currentStep: 0,
      history: [{ step: 'submit', by: cu.name || 'الطالب', role: 'student', action: 'submit', note: '', at: new Date().toISOString() }],
      advisorUsername: cu.advisor || load('assignments', {})[cu.code] || null
    };
    const btn = document.getElementById('ad-submit-final');
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
    try {
      if (window.DB && DB.isOnline()) {
        const res = await DB.createApplication(req);
        if (!res || !res.ok) { toast((res && res.error) || 'تعذر حفظ الطلب على الخادم', 'err'); return; }
        await notifyUser(req.advisorUsername, `طلب حذف أو إضافة مقررات جديد من ${req.studentName}: ${req.id}`, { title: 'طلب جديد', type: 'info' });
      } else {
        // Persist the actual attachment in IndexedDB and keep only its metadata in localStorage.
        if (Array.isArray(req.transcripts) && req.transcripts.length) {
          for (let i = 0; i < req.transcripts.length; i++) {
            const file = req.transcripts[i];
            if (file && file.data) await storeLocalAttachment(req.id + '-transcript-' + i, file.data);
          }
          req.transcripts = req.transcripts.map((file, i) => ({ name: file.name, type: file.type, storedSeparately: true, attachmentKey: req.id + '-transcript-' + i }));
          req.transcript = req.transcripts[0] || null;
        }
        const requests = load('requests', []);
        requests.unshift(req);
        save('requests', requests);
        await notifyUser(req.advisorUsername, `طلب حذف أو إضافة مقررات جديد من ${req.studentName}: ${req.id}`, { title: 'طلب جديد', type: 'info' });
      }
      try {
        const compactReq = Object.assign({}, req);
        if (Array.isArray(compactReq.transcripts)) compactReq.transcripts = compactReq.transcripts.map((file, i) => ({ name: file.name, type: file.type, storedSeparately: true, attachmentKey: req.id + '-transcript-' + i }));
        if (compactReq.transcript && compactReq.transcript.data) compactReq.transcript = { name: compactReq.transcript.name, type: compactReq.transcript.type, storedSeparately: true };
        localStorage.setItem('fos-adddrop-request-' + req.id, JSON.stringify(compactReq));
        localStorage.removeItem(addDropDraftKey);
      } catch (_) {}
      const root = document.getElementById('view-form-fill');
      root.innerHTML = `<div class="ad-success-card"><div class="ad-success-mark"><i class="fas fa-check"></i></div><div class="fw-extrabold">تم إرسال الطلب للمراجعة</div><p>تم تسجيل طلبك بنجاح. إرسال الطلب لا يعني الموافقة النهائية أو تنفيذ حذف / إضافة المقررات.</p><div class="ad-reference"><small>الرقم المرجعي للطلب</small><strong>${req.id}</strong></div><div class="flex gap-2 justify-center flex-wrap"><button type="button" class="btn btn-primary" onclick="App.navigate('my-requests')">متابعة طلباتي</button><button type="button" class="btn btn-outline" onclick="App.navigate('forms-list')">العودة للنماذج</button><button type="button" class="btn btn-outline" onclick="App.printAddDropRequest('${req.id}')"><i class="fas fa-print"></i> طباعة ملخص الطلب</button></div></div>`;
      toast('تم إرسال الطلب للمراجعة — ' + req.id);
    } catch (err) {
      console.error(err); toast(err.message || 'حدث خطأ أثناء إرسال الطلب', 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
    }
  }

  function printAddDropRequest(requestId) {
    let data = (load('requests', []) || []).find(r => r.id === requestId);
    if (!data) {
      try { data = JSON.parse(localStorage.getItem('fos-adddrop-request-' + requestId) || 'null'); } catch (_) {}
    }
    if (!data) return toast('لا تتوفر بيانات ملخص الطلب للطباعة على هذا الجهاز', 'err');
    const rows = (data.courses || []).map(c => `<tr><td>${c.action === 'drop' ? 'حذف' : 'إضافة'}</td><td>${c.code || ''}</td><td>${c.name || ''}</td><td>${c.hours || ''}</td><td>${c.prerequisites || ''}</td><td>${c.note || ''}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return toast('اسمح بفتح النوافذ المنبثقة للطباعة', 'err');
    w.document.write(`<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>طلب حذف أو إضافة مقررات</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#14283f}h1{font-size:22px}p{line-height:1.8}.meta{background:#f2f6f8;padding:12px;border-radius:8px}table{border-collapse:collapse;width:100%;margin-top:18px}th,td{border:1px solid #ccd5dd;padding:8px;text-align:right}th{background:#edf2f5}footer{margin-top:30px;color:#526170;font-size:12px}</style></head><body><h1>استمارة طلب حذف أو إضافة مقرر / مقررات دراسية</h1><p>كلية العلوم – جامعة سوهاج<br>وحدة الإرشاد الأكاديمي والخدمات الطلابية</p><div class="meta">رقم الطلب: ${data.id}<br>الطالب: ${data.studentName}<br>كود الطالب: ${data.studentCode}<br>البرنامج: ${data.program}<br>الفصل: ${data.semester} — العام الجامعي: ${data.year}<br>تاريخ التقديم: ${new Date(data.createdAt).toLocaleString('ar-EG')}</div><table><thead><tr><th>الإجراء</th><th>كود المقرر</th><th>اسم المقرر</th><th>الساعات</th><th>المتطلبات السابقة</th><th>الملاحظات</th></tr></thead><tbody>${rows}</tbody></table><p>حالة الطلب: ${data.status === 'pending_advisor' ? 'قيد مراجعة المرشد الأكاديمي' : data.status}</p><footer>هذا المستند ملخص لطلب إلكتروني ولا يُعد اعتمادًا نهائيًا أو إثباتًا لتنفيذ التعديل.</footer><script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  function renderAddDropWizard() {
    const root = document.getElementById('view-form-fill');
    const cu = currentUser || {};
    const prog = S.programs.find(p => p.id === cu.program);
    const programName = (prog && prog.nameAr) || cu.program || '';
    const currentYear = '2026-2027';
    addDropStep = 1; addDropCourseCounter = 0;
    addDropDraftKey = 'fos-adddrop-draft-' + (cu.code || cu.username || 'student');
    const safe = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const levels = (S.levels || ['المستوى الأول','المستوى الثاني','المستوى الثالث','المستوى الرابع']);
    const levelOptions = levels.map(l => `<option ${String(cu.level||'')===l?'selected':''}>${l}</option>`).join('');
    root.innerHTML = `
      <div id="adddrop-wizard" class="ad-wizard">
        <button type="button" class="btn btn-sm btn-outline mb-3" onclick="App.navigate('forms-list')"><i class="fas fa-arrow-right"></i> العودة للنماذج</button>
        <header class="ad-form-header"><div class="ad-header-mark"><i class="fas fa-file-signature"></i></div><div><span class="ad-eyebrow">وحدة الإرشاد الأكاديمي والخدمات الطلابية</span><h2>استمارة طلب حذف أو إضافة مقرر / مقررات دراسية</h2><p>كلية العلوم – جامعة سوهاج</p></div></header>
        <div class="ad-progress-shell"><div class="ad-progress-track"><span class="ad-progress-fill"></span></div><div class="ad-progress-steps ad-progress-four"><div data-ad-progress="1" class="is-current"><span>1</span><small>التعليمات والإقرار</small></div><div data-ad-progress="2"><span>2</span><small>بيانات الطالب</small></div><div data-ad-progress="3"><span>3</span><small>المقررات</small></div><div data-ad-progress="4"><span>4</span><small>مراجعة الطلب</small></div></div></div>
        <section data-ad-step="1" class="ad-step-panel">
          <div class="ad-section-title"><span class="ad-section-icon"><i class="fas fa-book-open"></i></span><div><h3>قبل البدء في تسجيل الطلب</h3><p>يرجى قراءة الضوابط التالية بعناية</p></div></div>
          <div class="ad-intro-note"><i class="fas fa-info-circle"></i><p>تتيح هذه الاستمارة للطالب تقديم طلب حذف مقرر دراسي أو أكثر، أو إضافة مقرر دراسي أو أكثر، وفقًا للضوابط واللوائح الأكاديمية المعمول بها بالكلية.</p></div>
          <div class="ad-rules-grid">
            <article class="ad-rule-card"><span>01</span><div><h4>ضوابط حذف وإضافة المقررات</h4><p>تخضع طلبات حذف وإضافة المقررات للمواعيد والحدود المقررة في لائحة الكلية والعبء الدراسي المسموح به.</p></div></article>
            <article class="ad-rule-card"><span>02</span><div><h4>ضرورة الرجوع إلى المرشد الأكاديمي</h4><p>يجب الرجوع إلى المرشد الأكاديمي والتأكد من استيفاء متطلبات الحذف أو الإضافة قبل تقديم الطلب.</p></div></article>
            <article class="ad-rule-card"><span>03</span><div><h4>مراجعة الطلب قبل إرساله</h4><p>تأكد من صحة البيانات وأسماء المقررات وأكوادها وعدد ساعاتها وحدد الإجراء المطلوب لكل مقرر.</p></div></article>
            <article class="ad-rule-card"><span>04</span><div><h4>اعتماد الطلب وتنفيذه</h4><p>إرسال الاستمارة لا يعني الموافقة النهائية أو تنفيذ التعديلات؛ إذ يخضع الطلب للمراجعة والاعتماد الرسمي.</p></div></article>
          </div>
          <div class="ad-warning-box"><i class="fas fa-exclamation-triangle"></i><div><strong>تنبيه إداري مهم</strong><p>تقديم الطلب إلكترونيًا لا يُعد دليلًا على اعتماده أو تنفيذه، ولا يغني عن استكمال الموافقات والإجراءات الرسمية بالكلية.</p></div></div>
          <label class="ad-declaration"><input id="ad-read-confirm" type="checkbox" onchange="document.getElementById('ad-read-next').disabled=!this.checked"><span>أقر بأنني قرأت التعليمات والضوابط الواردة أعلاه، وأتعهد بصحة البيانات التي سأقوم بتسجيلها.</span></label>
          <div class="ad-step-actions"><span class="text-xs text-muted">لن تظهر حقول البيانات قبل تأكيد القراءة.</span><button id="ad-read-next" type="button" class="btn btn-primary" disabled onclick="App.addDropContinueFromInstructions()">قرأت التعليمات — متابعة <i class="fas fa-arrow-left"></i></button></div>
        </section>
        <section data-ad-step="2" class="ad-step-panel hidden">
          <div class="ad-section-title"><span class="ad-section-icon"><i class="fas fa-user-edit"></i></span><div><h3>البيانات الشخصية والأكاديمية</h3><p>الاسم والكود ورقم الهاتف بيانات ثابتة، ويمكنك تحديث المستوى الدراسي والقسم أو الشعبة.</p></div></div>
          <form id="adddrop-data-form" onsubmit="return false">
            <div class="ad-data-grid">
              <div class="form-group"><label>الاسم الكامل للطالب</label><input class="form-control" value="${safe(cu.name)}" readonly aria-readonly="true"></div>
              <div class="form-group"><label>كود الطالب</label><input class="form-control" value="${safe(cu.code || cu.username)}" readonly aria-readonly="true"></div>
              <div class="form-group"><label for="ad-level">المستوى الدراسي <b>*</b></label><select class="form-control" id="ad-level" required><option value="">اختر المستوى</option>${levelOptions}</select></div>
              <div class="form-group"><label for="ad-section">القسم أو الشعبة <b>*</b></label><select class="form-control" id="ad-section" required onchange="App.updateAddDropPrograms()"><option value="">اختر القسم أو الشعبة</option><option value="biological">قسم العلوم البيولوجية</option><option value="physical">قسم العلوم الفيزيائية</option><option value="geological">قسم العلوم الجيولوجية</option><option value="special">البرامج الخاصة</option></select></div>
              <div class="form-group" id="ad-program-group"><label for="ad-program">البرنامج <b>*</b></label><select class="form-control" id="ad-program" required onchange="App.updateAddDropProgramVisibility()"><option value="">اختر القسم أولًا</option></select></div>
              <div class="form-group"><label for="ad-semester">الفصل الدراسي <b>*</b></label><select class="form-control" id="ad-semester" required><option value="">اختر الفصل</option><option>الفصل الأول</option><option>الفصل الثاني</option><option>الفصل الصيفي</option></select></div>
              <div class="form-group"><label for="ad-year">العام الجامعي <b>*</b></label><select class="form-control" id="ad-year" required><option value="2026-2027" selected>2026-2027</option></select></div>
              <div class="form-group"><label for="ad-completed-hours">الساعات المعتمدة التي اجتازها الطالب <b>*</b></label><input class="form-control" type="number" id="ad-completed-hours" min="0" step="1" value="" required></div>
              <div class="form-group"><label for="ad-phone">رقم الهاتف</label><input class="form-control" type="tel" id="ad-phone" value="${safe(cu.phone || cu.phone_number || '')}" readonly aria-readonly="true"></div>
              <div class="form-group"><label for="ad-registered-hours">عدد الساعات المسجلة على المنصة <b>*</b></label><input class="form-control" type="number" id="ad-registered-hours" min="0" step="1" value="" required></div>
            </div>
            <div class="ad-step-actions ad-step-actions-wrap"><button type="button" class="btn btn-outline" onclick="App.addDropBack(1)"><i class="fas fa-arrow-right"></i> العودة للتعليمات</button><button type="button" class="btn btn-primary" onclick="App.addDropValidateData()">متابعة إلى إضافة وحذف المقررات <i class="fas fa-arrow-left"></i></button></div>
          </form>
        </section>
        <section data-ad-step="3" class="ad-step-panel hidden">
          <div class="ad-section-title"><span class="ad-section-icon"><i class="fas fa-book"></i></span><div><h3>إضافة وحذف المقررات</h3><p>أدخل اسم المقرر بالعربية والكود بالحروف الإنجليزية والأرقام، وحدد عدد الساعات.</p></div></div>
          <div class="ad-course-section ad-drop-section"><div class="ad-course-heading"><div><span class="ad-course-heading-icon"><i class="fas fa-minus-circle"></i></span><div><h3>المقررات المطلوب حذفها</h3><p>الملاحظات اختيارية ويمكن إضافة أكثر من مقرر.</p></div></div><button type="button" class="btn btn-outline btn-sm" onclick="App.addAddDropRow('drop')"><i class="fas fa-plus"></i> إضافة مقرر للحذف</button></div>
            <div class="table-wrap ad-course-table-wrap"><table class="data ad-course-table"><thead><tr><th>#</th><th>اسم المقرر (عربي)</th><th>كود المقرر</th><th>الساعات</th><th>ملاحظة (اختياري)</th><th></th></tr></thead><tbody id="ad-drop-rows"></tbody></table></div>
          </div>
          <div class="ad-course-section ad-add-section"><div class="ad-course-heading"><div><span class="ad-course-heading-icon"><i class="fas fa-plus-circle"></i></span><div><h3>المقررات المطلوب إضافتها</h3><p>تُطبق الشروط نفسها على مقررات الإضافة.</p></div></div><button type="button" class="btn btn-outline btn-sm" onclick="App.addAddDropRow('add')"><i class="fas fa-plus"></i> إضافة مقرر للإضافة</button></div>
            <div class="table-wrap ad-course-table-wrap"><table class="data ad-course-table"><thead><tr><th>#</th><th>اسم المقرر (عربي)</th><th>كود المقرر</th><th>الساعات</th><th>ملاحظة (اختياري)</th><th></th></tr></thead><tbody id="ad-add-rows"></tbody></table></div>
          </div>
          <div class="ad-course-section ad-transcript-section"><div class="ad-course-heading"><div><span class="ad-course-heading-icon"><i class="fas fa-file-pdf"></i></span><div><h3>رفع السجل الدراسي <b>*</b></h3><p>رفع السجل الدراسي إلزامي لإكمال الطلب. الملفات المسموح بها PDF أو صور، بحد أقصى 5 ميجابايت.</p></div></div></div><div class="form-group"><label for="ad-transcript-input">ملفات السجل الدراسي</label><input class="form-control" type="file" id="ad-transcript-input" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" multiple required onchange="App.onAddDropTranscript(event)"><small class="text-muted">يمكنك اختيار عدة ملفات إذا كان السجل الدراسي مقسمًا إلى صور أو ملفات PDF. الصيغ المسموحة PDF وJPG وPNG، بحد أقصى 5 ميجابايت لكل ملف.</small><div id="ad-upload-status" class="text-muted mt-2" aria-live="polite">لم يتم رفع أي ملفات بعد.</div></div></div>
          <div class="form-group"><label for="ad-student-notes">ملاحظات الطالب (اختياري)</label><textarea class="form-control" id="ad-student-notes" rows="3" placeholder="يمكنك كتابة أي توضيحات أو أسباب إضافية للطلب"></textarea></div>
          <div class="ad-step-actions ad-step-actions-wrap"><button type="button" class="btn btn-outline" onclick="App.addDropBack(2)"><i class="fas fa-arrow-right"></i> العودة للبيانات</button><button type="button" class="btn btn-primary" onclick="App.addDropValidateCourses()">متابعة إلى مراجعة الطلب <i class="fas fa-arrow-left"></i></button></div>
        </section>
        <section data-ad-step="4" class="ad-step-panel hidden">
          <div class="ad-section-title"><span class="ad-section-icon"><i class="fas fa-clipboard-check"></i></span><div><h3>مراجعة الطلب قبل الإرسال</h3><p>راجع جميع البيانات قبل إرسال الطلب للمراجعة الإدارية.</p></div></div>
          <div id="ad-review-student-data" class="ad-review-list"></div>
          <div class="ad-review-stats"><div><small>مقررات الحذف</small><strong id="ad-review-drop-count">0</strong><span>إجمالي الساعات: <b id="ad-review-drop-hours">0</b></span></div><div><small>مقررات الإضافة</small><strong id="ad-review-add-count">0</strong><span>إجمالي الساعات: <b id="ad-review-add-hours">0</b></span></div></div>
          <div class="ad-review-list" id="ad-review-course-list"></div>
          <div class="ad-warning-box"><i class="fas fa-shield-alt"></i><div><strong>مراجعة نهائية</strong><p>الطلب يظل قيد المراجعة حتى استكمال الموافقات والإجراءات الرسمية.</p></div></div>
          <div class="ad-step-actions"><button type="button" class="btn btn-outline" onclick="App.addDropBack(3)"><i class="fas fa-arrow-right"></i> العودة للتعديل</button><button type="button" class="btn btn-primary" id="ad-submit-final" onclick="App.submitAddDrop(event)"><i class="fas fa-paper-plane"></i> إرسال الطلب للمراجعة</button></div>
        </section>
      </div>`;
    addDropRow('drop'); addDropRow('add');
    const knownProgram = prog && prog.type === 'special' ? 'special' : (prog && prog.section) || '';
    if (knownProgram) {
      document.getElementById('ad-section').value = knownProgram;
      updateAddDropPrograms();
      document.getElementById('ad-program').value = prog ? prog.id : '';
      updateAddDropProgramVisibility();
    }
    try {
      const draft = JSON.parse(localStorage.getItem(addDropDraftKey) || 'null');
      if (draft) {
        ['semester','year','completed-hours','registered-hours','student-notes'].forEach((id) => {
          const key = id === 'completed-hours' ? 'completedHours' : id === 'registered-hours' ? 'registeredHours' : id === 'student-notes' ? 'notes' : id;
          const el = document.getElementById('ad-' + id); if (el && draft[key] != null) el.value = draft[key];
        });
        if (draft.level) document.getElementById('ad-level').value = draft.level;
        if (draft.section) { document.getElementById('ad-section').value = draft.section; updateAddDropPrograms(); }
        if (draft.program) document.getElementById('ad-program').value = draft.program;
        updateAddDropProgramVisibility();
        document.getElementById('ad-drop-rows').innerHTML = ''; document.getElementById('ad-add-rows').innerHTML = '';
        (draft.drops || []).forEach(c => addDropRow('drop', c)); (draft.adds || []).forEach(c => addDropRow('add', c));
        if (draft.accepted) document.getElementById('ad-read-confirm').checked = true;
        document.getElementById('ad-read-next').disabled = !draft.accepted;
      }
    } catch (_) {}
  }

  function saveAddDropDraft() {
    const form = document.getElementById('adddrop-data-form');
    if (!form) return;
    const data = {
      accepted: !!(document.getElementById('ad-read-confirm') && document.getElementById('ad-read-confirm').checked),
      semester: document.getElementById('ad-semester')?.value || '',
      year: document.getElementById('ad-year')?.value || '',
      level: document.getElementById('ad-level')?.value || '', section: document.getElementById('ad-section')?.value || '', program: document.getElementById('ad-program')?.value || '',
      completedHours: document.getElementById('ad-completed-hours')?.value || '',
      registeredHours: document.getElementById('ad-registered-hours')?.value || '',
      phone: document.getElementById('ad-phone')?.value || '',
      notes: document.getElementById('ad-student-notes')?.value || '',
      drops: collectAddDropRows('drop'),
      adds: collectAddDropRows('add')
    };
    try { localStorage.setItem(addDropDraftKey, JSON.stringify(data)); toast('تم حفظ المسودة على هذا الجهاز'); } catch (_) { toast('تعذر حفظ المسودة في المتصفح', 'err'); }
  }

  function printAddDropCurrent() { window.print(); }



  // ===== Specialized academic request forms (shared workflow, form-specific rules) =====
  let academicRequestStep = 1;
  let academicRequestRows = [];
  let academicRequestCounter = 0;

  const academicRequestDefinitions = {
    concurrent: {
      title: 'تسجيل المقررات الدراسية المتزامنة', icon: 'fa-link', color: '#7c3aed',
      desc: 'طلب تسجيل المقررات المتزامنة بعد تسجيل المقررات على المنصة الإلكترونية.',
      intro: 'يُستخدم هذا النموذج لطلب تسجيل المقررات الدراسية المتزامنة بعد تسجيل المقررات على المنصة الإلكترونية، ويُستكمل بواسطة المرشد الأكاديمي المختص وفقًا للضوابط الأكاديمية والإجراءات الإدارية المعتمدة بالكلية',
      rules: [
        'يُستخدم النموذج لتسجيل المقررات المتزامنة بعد تسجيل المقررات على المنصة الإلكترونية.',
        'يجب مراجعة المرشد الأكاديمي المختص، ولا يُعتد بالطلب باعتباره تسجيلًا نهائيًا إلا بعد استكمال إجراءات المراجعة والاعتماد والتنفيذ الرسمية.',
        'يجب استكمال جميع البيانات المطلوبة والتحقق من صحة بيانات الطالب والمقررات. لن يُنظر في الطلب غير مكتمل البيانات.',
        'يجب مراجعة المتطلبات السابقة والتعارضات والتزامن وحالة الشعبة قبل اعتماد تسجيل المقرر.',
        'يجب توثيق تاريخ تنفيذ تسجيل المقررات فعليًا، باعتباره المرجع المعتمد لتحديد بداية الالتزام الأكاديمي بالمقررات المسجلة حديثًا، ولأغراض متابعة الحضور والغياب وفقًا للقواعد المنظمة.',
        'يجب على الطالب متابعة حالة الطلب والتأكد من ظهور المقررات المسجلة فعليًا في النظام الإلكتروني، والاحتفاظ بنسخة إلكترونية من الطلب ونتيجة التسجيل إن أتاح النظام ذلك.'
      ],
      warning: 'إرسال الطلب لا يعني تسجيل المقررات تلقائيًا. ولا يُعتد بتسجيل أي مقرر إلا بعد استكمال إجراءات المراجعة والاعتماد والتنفيذ وفقًا للمسار الإداري المعتمد بالكلية. وتظل مسؤولية التحقق من ظهور المقررات في السجل الأكاديمي قائمة على الطالب والجهات المختصة، كلٌّ في حدود اختصاصه.'
    },
    increase: {
      title: 'زيادة العبء الدراسي', icon: 'fa-plus-circle', color: '#2563eb',
      desc: 'طلب زيادة العبء الدراسي وفق الضوابط الأكاديمية وحالة الطالب.',
      intro: 'يتيح هذا النموذج تقديم طلب زيادة عدد الساعات المعتمدة المسجلة في الفصل الدراسي، وفق الضوابط الواردة في لائحة البرنامج الأكاديمي.',
      rules: [
        'للطالب المتفوق الذي تجاوز المستوى الأول ومعدله التراكمي لا يقل عن 3.667، يجوز طلب تسجيل ما يصل إلى 20 ساعة معتمدة في الفصل، وبحد أقصى أربع مرات خلال فترة الدراسة، وفق اللائحة.',
        'يجوز طلب زيادة العبء إلى 22 ساعة مرة واحدة للطالب الذي اجتاز 100 ساعة معتمدة، إذا كانت الزيادة لازمة لاستيفاء متطلبات التخرج، وبعد الاعتماد الرسمي المطلوب.',
        'يجب التحقق من المعدل والساعات المجتازة والعبء الحالي وسجل الاستفادة السابقة من مصدر أكاديمي موثوق.',
        'لا يعني استيفاء شرط واحد الموافقة التلقائية، ولا يسمح النموذج بتجاوز حدود الساعات أو الاعتمادات الرسمية.',
        'يجب إدخال المقررات المطلوب إضافتها ومراجعة إجمالي الساعات قبل إرسال الطلب.'
      ],
      warning: 'تقديم الطلب لا يعني الموافقة على زيادة العبء أو تسجيل المقررات. تخضع الأهلية والحدود والاستثناءات للمراجعة والاعتماد وفق اللائحة والإجراءات المعتمدة بالكلية.'
    },
    gpa: {
      title: 'تحسين المعدل الأكاديمي', icon: 'fa-chart-line', color: '#0d9488',
      desc: 'طلب إعادة تسجيل مقررات لتحسين المعدل وفق اللائحة الأكاديمية.',
      intro: 'يُستخدم هذا النموذج لطلب إعادة تسجيل مقررات بهدف تحسين المعدل الأكاديمي وفق الضوابط المحددة في اللائحة الأكاديمية ذات الصلة.',
      rules: [
        'وفق النص الوارد في الاستمارة، يخص الطلب الطالب الذي لا يحقق معدلًا تراكميًا قدره 2.00 أو أكثر عند إتمام متطلبات التخرج.',
        'يكون الحد الأقصى للمقررات المطلوب إعادة تسجيلها 12 ساعة معتمدة في الفصل الدراسي، وفق الضوابط الواردة في الاستمارة.',
        'يجب التحقق من المعدل وحالة استيفاء متطلبات التخرج من السجل الأكاديمي الموثوق متى كانت البيانات متاحة.',
        'تُطبق قواعد احتساب التقدير الأعلى للمقررات المعادة وفق اللائحة والنظام الأكاديمي المعتمد، ولا تتغير الدرجات أو المعدلات بمجرد تقديم الطلب.',
        'يخضع الطلب لمراجعة المرشد الأكاديمي والجهات المختصة، ويجب متابعة حالته حتى إتمام التسجيل رسميًا.'
      ],
      warning: 'تقديم الطلب لا يعني الموافقة على إعادة تسجيل المقررات، ولا يؤدي إلى تعديل الدرجات أو المعدل التراكمي. لا يتم التنفيذ إلا بعد استكمال المراجعة والاعتمادات الرسمية.'
    }
  };

  function arEsc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function academicRequestStudentData() {
    const u = currentUser || {};
    const p = (S.programs || []).find(x => x.id === u.program || x.nameAr === u.program);
    return {
      name: u.name || '', code: u.code || u.username || '', level: u.level || '',
      program: (p && p.nameAr) || u.program || u.programName || '',
      gpa: (u.gpa !== undefined && u.gpa !== null && u.gpa !== '') ? Number(u.gpa) : null,
      completedHours: (u.completedHours !== undefined && u.completedHours !== null && u.completedHours !== '') ? Number(u.completedHours) : null,
      registeredHours: (u.registeredHours !== undefined && u.registeredHours !== null && u.registeredHours !== '') ? Number(u.registeredHours) : null,
      phone: u.phone || u.phone_number || ''
    };
  }
  function renderAcademicRequestWizard(type) {
    const def = academicRequestDefinitions[type]; if (!def) return;
    currentFormType = type; academicRequestStep = 1; academicRequestRows = []; academicRequestCounter = 0;
    const d = academicRequestStudentData(); const root = document.getElementById('view-form-fill');
    const catalog = academicRequestCatalog(d.program);
    const catalogOptions = catalog.map(c => `<option value=\"${arEsc(c.name)}\" label=\"${arEsc(c.code)} — ${arEsc(c.name)} (${Number(c.hours)||0} س)\"></option><option value=\"${arEsc(c.code)}\" label=\"${arEsc(c.name)} — ${arEsc(c.code)} (${Number(c.hours)||0} س)\"></option>`).join('');
    const levelOpts = `<option value="">اختر المستوى الدراسي</option>` + (S.levels || ['المستوى الأول','المستوى الثاني','المستوى الثالث','المستوى الرابع']).map(x => `<option value="${arEsc(x)}" ${x===d.level?'selected':''}>${arEsc(x)}</option>`).join('');
    const year = '2026-2027';
    root.innerHTML = `<div id="academic-request-wizard" class="ad-wizard ar-request-wizard">
      <button type="button" class="btn btn-sm btn-outline mb-3" onclick="App.navigate('forms-list')"><i class="fas fa-arrow-right"></i> العودة للنماذج</button>
      <header class="ad-form-header"><div class="ad-header-mark"><i class="fas ${def.icon}"></i></div><div><span class="ad-eyebrow">وحدة الإرشاد الأكاديمي والخدمات الطلابية</span><h2>${def.title}</h2><p>كلية العلوم – جامعة سوهاج</p></div></header>
      <div class="ad-progress-shell"><div class="ad-progress-track"><span class="ad-progress-fill" id="ar-progress-fill"></span></div><div class="ad-progress-steps ad-progress-four"><div data-ar-progress="1" class="is-current"><span>1</span><small>التعليمات والإقرار</small></div><div data-ar-progress="2"><span>2</span><small>البيانات الأكاديمية</small></div><div data-ar-progress="3"><span>3</span><small>${type==='concurrent'?'المقررات المطلوبة':'تفاصيل الطلب'}</small></div><div data-ar-progress="4"><span>4</span><small>مراجعة الطلب</small></div></div></div>
      <section data-ar-step="1" class="ad-step-panel"><div class="ad-section-title"><span class="ad-section-icon"><i class="fas fa-book-open"></i></span><div><h3>${type==='concurrent'?'تعليمات وضوابط تسجيل المقررات المتزامنة':type==='increase'?'ضوابط زيادة العبء الدراسي':'ضوابط تحسين المعدل الأكاديمي'}</h3><p>يرجى قراءة التعليمات قبل استكمال الطلب</p></div></div>
        <div class="ad-intro-note"><i class="fas fa-info-circle"></i><p>${def.intro}</p></div>
        <div class="ad-rules-grid">${def.rules.map((r,i)=>`<article class="ad-rule-card"><span>${String(i+1).padStart(2,'0')}</span><div><h4>الضابط ${i+1}</h4><p>${r}</p></div></article>`).join('')}</div>
        <div class="ad-warning-box"><i class="fas fa-exclamation-triangle"></i><div><strong>تنبيه رسمي</strong><p>${def.warning}</p></div></div>
        <label class="ad-declaration"><input id="ar-read-confirm" type="checkbox" onchange="document.getElementById('ar-read-next').disabled=!this.checked"><span>أقر بأنني قرأت التعليمات والضوابط وفهمت أن تقديم الطلب لا يعني اعتماده أو تنفيذه تلقائيًا.</span></label>
        <div class="ad-step-actions"><span class="text-xs text-muted">يلزم تأكيد قراءة التعليمات للمتابعة.</span><button id="ar-read-next" type="button" class="btn btn-primary" disabled onclick="App.academicRequestContinue(2)">قرأت التعليمات — متابعة <i class="fas fa-arrow-left"></i></button></div>
      </section>
      <section data-ar-step="2" class="ad-step-panel hidden"><div class="ad-section-title"><span class="ad-section-icon"><i class="fas fa-user-graduate"></i></span><div><h3>البيانات الأكاديمية</h3><p>البيانات الرسمية المسترجعة من الحساب للقراءة فقط</p></div></div>
        <form id="ar-data-form" onsubmit="return false"><div class="ad-data-grid">
          <div class="form-group"><label>اسم الطالب</label><input class="form-control" value="${arEsc(d.name)}" readonly></div><div class="form-group"><label>كود الطالب</label><input class="form-control" value="${arEsc(d.code)}" readonly></div>
          <div class="form-group"><label>الشعبة أو البرنامج</label><input class="form-control" value="${arEsc(d.program || 'غير متاح في الحساب')}" readonly></div><div class="form-group"><label>المستوى الدراسي</label><select id="ar-level" class="form-control" required>${levelOpts}</select></div>
          <div class="form-group"><label>العام الجامعي</label><select id="ar-year" class="form-control" required><option selected>${year}</option></select></div><div class="form-group"><label>الفصل الدراسي</label><select id="ar-semester" class="form-control" required><option value="">اختر الفصل</option><option>الفصل الأول</option><option>الفصل الثاني</option><option>الفصل الصيفي</option></select></div>
          <div class="form-group"><label>المعدل التراكمي</label><input class="form-control" value="${d.gpa===null?'غير متاح':d.gpa.toFixed(2)}" readonly></div><div class="form-group"><label>الساعات المجتازة</label><input class="form-control" value="${d.completedHours===null?'غير متاح':d.completedHours}" readonly></div>
          <div class="form-group"><label>الساعات المسجلة على المنصة</label><input class="form-control" value="${d.registeredHours===null?'غير متاح':d.registeredHours}" readonly></div><div class="form-group"><label>رقم الهاتف المسجل</label><input class="form-control" value="${arEsc(d.phone || 'غير متاح')}" readonly></div>
        </div><div class="ad-warning-box"><i class="fas fa-info-circle"></i><div><strong>ملاحظة بشأن البيانات الأكاديمية</strong><p>${(d.gpa===null || d.completedHours===null || d.registeredHours===null) ? 'بعض البيانات الأكاديمية غير متاحة في الحساب الحالي. لن تُعتبر شروط الأهلية مستوفاة تلقائيًا؛ وستحتاج إلى تحقق الجهة الأكاديمية المختصة.' : 'تُعرض البيانات الأكاديمية من الحساب، وتخضع أهلية الطلب للمراجعة والتحقق من السجل الرسمي.'}</p></div></div>
        <div class="form-group mt-3"><label for="ar-student-notes">ملاحظات الطالب (اختياري)</label><textarea id="ar-student-notes" class="form-control" rows="3" placeholder="أضف توضيحًا يساعد في مراجعة الطلب"></textarea></div>
        <div class="ad-step-actions"><button type="button" class="btn btn-outline" onclick="App.academicRequestContinue(1)">السابق</button><button type="button" class="btn btn-primary" onclick="App.academicRequestContinue(3)">متابعة <i class="fas fa-arrow-left"></i></button></div></form>
      </section>
      <datalist id="ar-course-catalog">${catalogOptions}</datalist>
      <section data-ar-step="3" class="ad-step-panel hidden"><div class="ad-section-title"><span class="ad-section-icon"><i class="fas fa-book"></i></span><div><h3>${type==='concurrent'?'المقررات المطلوب تسجيلها':type==='increase'?'المقررات المطلوب إضافتها':'المقررات المطلوب تسجيلها لتحسين المعدل'}</h3><p>أضف المقررات المطلوبة وراجع الساعات قبل المتابعة</p></div></div>
        ${type==='increase'?`<div class="form-group mb-3"><label for="ar-increase-kind">نوع طلب زيادة العبء <b>*</b></label><select id="ar-increase-kind" class="form-control" required onchange="App.academicRequestUpdateTotals()"><option value="">اختر نوع الطلب</option><option value="merit">زيادة العبء للطالب المتفوق (حتى 20 ساعة)</option><option value="graduation">زيادة العبء لاستيفاء متطلبات التخرج (حتى 22 ساعة وبموافقة رسمية)</option></select><p class="text-xs text-muted mt-1">يجب التحقق من شروط الأهلية وسجل الاستفادة السابقة قبل الاعتماد.</p></div>`:''}
        <div class="table-responsive"><table class="data ar-request-table"><thead><tr><th>#</th><th>اسم المقرر</th><th>كود المقرر</th><th>الساعات</th>${type==='concurrent'?'<th>المتطلبات السابقة</th><th>مؤشرات المراجعة</th>':''}<th></th></tr></thead><tbody id="ar-course-rows"></tbody></table></div>
        <div class="flex gap-2 flex-wrap mt-3"><button type="button" class="btn btn-outline btn-sm" onclick="App.academicRequestAddRow()"><i class="fas fa-plus"></i> إضافة مقرر</button><span class="badge badge-blue" id="ar-total-hours">إجمالي الساعات: 0</span></div>
        ${type==='concurrent'?`<div class="ad-warning-box mt-3"><i class="fas fa-clipboard-check"></i><div><strong>حالات تتطلب المراجعة</strong><p>التعارض، والمتطلب السابق، والتزامن، والشعبة المغلقة ستظل «تحتاج إلى مراجعة» ما لم تتوفر بيانات أكاديمية موثوقة للتحقق منها. لا تمثل هذه المؤشرات اعتمادًا آليًا.</p></div></div>`:''}
        ${type==='gpa'?`<div class="ad-intro-note mt-3"><i class="fas fa-info-circle"></i><p>الحد الأقصى 12 ساعة معتمدة في الفصل وفق الضابط الوارد في الاستمارة. يجب التحقق من استيفاء متطلبات التخرج من السجل الأكاديمي.</p></div>`:''}
        <div class="ad-step-actions"><button type="button" class="btn btn-outline" onclick="App.academicRequestContinue(2)">السابق</button><button type="button" class="btn btn-primary" onclick="App.academicRequestContinue(4)">متابعة إلى مراجعة الطلب <i class="fas fa-arrow-left"></i></button></div>
      </section>
      <section data-ar-step="4" class="ad-step-panel hidden"><div class="ad-section-title"><span class="ad-section-icon"><i class="fas fa-clipboard-check"></i></span><div><h3>مراجعة الطلب قبل الإرسال</h3><p>تأكد من البيانات والمقررات قبل التقديم النهائي</p></div></div><div id="ar-review-summary" class="ad-review-summary"></div>
        <label class="ad-declaration mt-3"><input id="ar-final-confirm" type="checkbox"><span>أقر بصحة البيانات المدخلة، وأفهم أن الطلب سيخضع للمراجعة والاعتماد والتنفيذ وفق الإجراءات الرسمية.</span></label>
        <div class="ad-step-actions"><button type="button" class="btn btn-outline" onclick="App.academicRequestContinue(3)">العودة للتعديل</button><button id="ar-submit" type="button" class="btn btn-primary" onclick="App.academicRequestSubmit()"><i class="fas fa-paper-plane"></i> إرسال الطلب للمراجعة</button></div>
      </section></div>`;
    academicRequestAddRow();
  }

  function academicRequestCatalog(programName) {
    const SP=window.FOS_STUDY_PLANS; if(!SP||!SP.programs) return [];
    const name=String(programName||''); const program=SP.programs[name]||SP.programs[Object.keys(SP.programs).find(n=>n===name||(SP.programs[n].name||n)===name)];
    if(!program||!program.semesters)return [];
    const all=[];Object.keys(program.semesters).forEach(term=>(program.semesters[term]||[]).forEach(c=>{if(c.type==='elective_group')(c.options||[]).forEach(x=>all.push(x));else if(c&&c.code)all.push(c);}));
    const seen={};all.forEach(c=>{if(c.code&&!seen[c.code])seen[c.code]={code:c.code,name:c.name||c.code,hours:Number(c.hours)||0,prerequisites:c.prerequisites||[],opens:c.opens||[],semester:c.semester||''};});return Object.values(seen).sort((a,b)=>String(a.code).localeCompare(String(b.code)));
  }
  function academicRequestSyncCatalogRow(row) {
    const d=academicRequestStudentData(); const catalog=academicRequestCatalog(d.program); const key=String(row.code||row.name||'').trim().toLowerCase();
    const c=catalog.find(x=>String(x.code).toLowerCase()===key||String(x.name).toLowerCase()===key);
    if(!c)return;
    row.code=c.code;row.name=c.name;row.hours=c.hours||row.hours;row.prerequisites=(c.prerequisites||[]).join('، ');row.catalogVerified=true;
    const tr=document.querySelector(`#ar-course-rows tr[data-row-id="${row.id}"]`);if(tr){tr.querySelector('[data-field="name"]').value=row.name;tr.querySelector('[data-field="code"]').value=row.code;tr.querySelector('[data-field="hours"]').value=String(row.hours);const pr=tr.querySelector('[data-field="prerequisites"]');if(pr)pr.value=row.prerequisites;}
    academicRequestUpdateTotals();
  }
  function academicRequestShowStep(step) {
    const root=document.getElementById('academic-request-wizard'); if(!root) return;
    academicRequestStep=step; root.querySelectorAll('[data-ar-step]').forEach(el=>el.classList.toggle('hidden',Number(el.dataset.arStep)!==step));
    root.querySelectorAll('[data-ar-progress]').forEach(el=>{const n=Number(el.dataset.arProgress);el.classList.toggle('is-current',n===step);el.classList.toggle('is-complete',n<step);});
    const fill=document.getElementById('ar-progress-fill');if(fill)fill.style.width=((step-1)/3*100)+'%';
    if(step===4) academicRequestBuildReview(); root.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function academicRequestContinue(step) {
    const type=currentFormType;
    if(step===2 && !document.getElementById('ar-read-confirm')?.checked) return toast('يجب تأكيد قراءة التعليمات أولًا','err');
    if(step===3){const form=document.getElementById('ar-data-form');if(!form||!form.reportValidity())return; if(!document.getElementById('ar-semester')?.value)return toast('اختر الفصل الدراسي','err');}
    if(step===4){if(!academicRequestRows.length)return toast('أضف مقررًا واحدًا على الأقل','err');
      for(const r of academicRequestRows){if(!r.name.trim()||!r.code.trim()||![2,3,4].includes(Number(r.hours)))return toast('استكمل اسم المقرر وكوده وعدد ساعاته بشكل صحيح','err');}
      const codes=academicRequestRows.map(r=>r.code.trim().toLowerCase());if(new Set(codes).size!==codes.length)return toast('لا يمكن تكرار المقرر نفسه داخل الطلب','err');
      if(type==='gpa' && academicRequestRows.reduce((n,r)=>n+Number(r.hours),0)>12)return toast('لا يمكن أن يتجاوز مجموع ساعات التحسين 12 ساعة','err');if(type==='gpa'){const gpaData=academicRequestStudentData();if(gpaData.gpa!==null&&gpaData.gpa>=2)return toast('المعدل المسجل لا يحقق شرط أقل من 2.00 الوارد في ضابط تحسين المعدل عند التخرج','err');}
      if(type==='increase'){const kind=document.getElementById('ar-increase-kind')?.value;if(!kind)return toast('اختر نوع طلب زيادة العبء','err');const d=academicRequestStudentData();const selectedHours=academicRequestRows.reduce((n,r)=>n+Number(r.hours),0);const total=d.registeredHours===null?null:d.registeredHours+selectedHours;const max=kind==='merit'?20:22;if(total!==null&&total>max)return toast(`إجمالي الساعات (${total}) يتجاوز الحد المذكور (${max} ساعة). راجع العبء الحالي والمقررات.`,'err');if(kind==='merit' && d.gpa!==null && d.gpa<3.667)return toast('المعدل المسجل لا يحقق حد 3.667 الوارد لضابط الطالب المتفوق','err');if(kind==='merit' && /الأول/.test(d.level))return toast('ضابط الطالب المتفوق يشترط تجاوز المستوى الأول','err');if(kind==='graduation' && d.completedHours!==null && d.completedHours<100)return toast('ضابط استيفاء التخرج يشترط اجتياز 100 ساعة على الأقل','err');let previous=load('requests',[]);if(window.DB&&DB.isOnline()){try{previous=await DB.listApplications({studentCode:d.code});}catch(_){previous=[];}}const relevant=previous.filter(r=>r.type==='increase'&&r.status!=='rejected'&&r.status!=='cancelled');if(kind==='merit'&&relevant.filter(r=>(r.academicRequest&&r.academicRequest.kind==='merit')||/merit/.test(r.studentNotes||'')).length>=4)return toast('تم بلوغ الحد الأقصى لأربع مرات في طلبات زيادة العبء للمتفوق وفق البيانات المتاحة','err');if(kind==='graduation'&&relevant.some(r=>(r.academicRequest&&r.academicRequest.kind==='graduation')||/graduation/.test(r.studentNotes||'')))return toast('يظهر وجود طلب سابق لزيادة العبء بغرض التخرج؛ يلزم مراجعة السجل قبل تقديم طلب آخر','err');}
    }
    academicRequestShowStep(step);
  }
  function academicRequestAddRow() {
    const body=document.getElementById('ar-course-rows');if(!body)return;const n=++academicRequestCounter;const row={id:n,name:'',code:'',hours:'',prerequisites:'',checks:{conflict:'needs_review',prerequisite:'needs_review',concurrent:'needs_review',closed:'needs_review'}};academicRequestRows.push(row);
    const tr=document.createElement('tr');tr.dataset.rowId=String(n);tr.innerHTML=`<td>${academicRequestRows.length}</td><td><input class="form-control" data-field="name" list="ar-course-catalog" placeholder="ابحث باسم المقرر أو اختر من الخطة" value=""></td><td><input class="form-control" data-field="code" list="ar-course-catalog" placeholder="ابحث بالكود أو اختر من الخطة" value=""></td><td><select class="form-control" data-field="hours"><option value="" selected>اختر</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></td>${currentFormType==='concurrent'?`<td><input class="form-control" data-field="prerequisites" placeholder="اسم المقرر السابق"></td><td><div class="ar-check-badges"><span>تعارض: مراجعة</span><span>متطلب: مراجعة</span><span>تزامن: مراجعة</span><span>الشعبة: مراجعة</span></div></td>`:''}<td><button type="button" class="btn btn-ghost btn-sm" title="حذف المقرر" onclick="App.academicRequestRemoveRow(${n})"><i class="fas fa-times"></i></button></td>`;
    tr.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('input',()=>{row[el.dataset.field]=el.value;if(el.dataset.field==='name'||el.dataset.field==='code')academicRequestSyncCatalogRow(row);academicRequestUpdateTotals();}));tr.querySelectorAll('[data-field="hours"]').forEach(el=>el.addEventListener('change',()=>{row.hours=Number(el.value);academicRequestUpdateTotals();}));body.appendChild(tr);academicRequestUpdateTotals();
  }
  function academicRequestRemoveRow(id){academicRequestRows=academicRequestRows.filter(r=>r.id!==id);const tr=document.querySelector(`#ar-course-rows tr[data-row-id="${id}"]`);if(tr)tr.remove();document.querySelectorAll('#ar-course-rows tr').forEach((tr,i)=>tr.cells[0].textContent=String(i+1));academicRequestUpdateTotals();}
  function academicRequestUpdateTotals(){const total=academicRequestRows.reduce((n,r)=>n+Number(r.hours||0),0);const el=document.getElementById('ar-total-hours');if(el)el.textContent='إجمالي الساعات: '+total;}
  function academicRequestBuildReview(){const d=academicRequestStudentData();const def=academicRequestDefinitions[currentFormType];const total=academicRequestRows.reduce((n,r)=>n+Number(r.hours||0),0);const rows=academicRequestRows.map((r,i)=>`<tr><td>${i+1}</td><td>${arEsc(r.name)}</td><td>${arEsc(r.code)}</td><td>${r.hours}</td>${currentFormType==='concurrent'?`<td>${arEsc(r.prerequisites||'—')}</td><td>تحتاج إلى مراجعة</td>`:''}</tr>`).join('');const kind=document.getElementById('ar-increase-kind');const more=currentFormType==='increase'?`<p><b>نوع الزيادة:</b> ${arEsc(kind?.selectedOptions[0]?.textContent||'—')}</p>`:currentFormType==='gpa'?`<p><b>الحد الأقصى:</b> 12 ساعة معتمدة — <b>المختار:</b> ${total} ساعة</p>`:'';const box=document.getElementById('ar-review-summary');if(box)box.innerHTML=`<div class="ad-review-card"><h4>بيانات الطالب</h4><p><b>الاسم:</b> ${arEsc(d.name)}　 <b>الكود:</b> ${arEsc(d.code)}</p><p><b>المستوى:</b> ${arEsc(document.getElementById('ar-level')?.value)}　 <b>البرنامج:</b> ${arEsc(d.program||'غير متاح')}</p><p><b>العام:</b> ${arEsc(document.getElementById('ar-year')?.value)}　 <b>الفصل:</b> ${arEsc(document.getElementById('ar-semester')?.value)}</p>${more}<h4 class="mt-3">المقررات</h4><div class="table-responsive"><table class="data"><thead><tr><th>#</th><th>المقرر</th><th>الكود</th><th>الساعات</th>${currentFormType==='concurrent'?'<th>المتطلب السابق</th><th>الحالة</th>':''}</tr></thead><tbody>${rows}</tbody></table></div><p><b>إجمالي الساعات المختارة:</b> ${total}</p><p><b>ملاحظات الطالب:</b> ${arEsc(document.getElementById('ar-student-notes')?.value||'—')}</p><p class="text-muted text-xs">سيُرسل الطلب إلى مسار المراجعة الحالي. لم يتم تنفيذ التسجيل الأكاديمي بهذه الخطوة.</p></div>`;}
  async function academicRequestSubmit(){if(!currentUser||currentUser.role!=='student')return toast('لا تملك صلاحية تقديم هذا الطلب','err');if(!document.getElementById('ar-final-confirm')?.checked)return toast('يرجى تأكيد الإقرار قبل الإرسال','err');const btn=document.getElementById('ar-submit');if(btn){btn.disabled=true;btn.classList.add('is-loading');}const d=academicRequestStudentData();const def=academicRequestDefinitions[currentFormType];const now=new Date().toISOString();const kind=document.getElementById('ar-increase-kind')?.value||null;const total=academicRequestRows.reduce((n,r)=>n+Number(r.hours||0),0);const notes=(document.getElementById('ar-student-notes')?.value||'').trim();const courses=academicRequestRows.map(r=>({name:r.name.trim(),code:r.code.trim(),hours:Number(r.hours),prerequisites:r.prerequisites||'',action:'register',academicChecks:r.checks}));const req={id:'REQ-'+Date.now(),type:currentFormType,formTitle:def.title,studentName:d.name,studentCode:d.code,level:document.getElementById('ar-level').value,program:d.program,year:document.getElementById('ar-year').value,semester:document.getElementById('ar-semester').value,phone:d.phone,completedHours:d.completedHours,registeredHours:d.registeredHours,courses,studentNotes:[notes,`إجمالي الساعات المطلوبة: ${total}`,kind?`نوع زيادة العبء: ${kind}`:''].filter(Boolean).join('\n'),academicRequest:{kind,totalHours:total,gpa:d.gpa,completedHours:d.completedHours,registeredHours:d.registeredHours,eligibilityReview:(d.gpa===null||d.completedHours===null||d.registeredHours===null)?'needs_review':'review_required',prerequisitesReview:'needs_review',conflictReview:'needs_review',concurrencyReview:'needs_review',sectionStatusReview:'needs_review',studentDeclaration:true,submittedAt:now,advisorRecommendation:null,reviewNotes:[],executionDate:null},declarationAccepted:true,createdAt:now,status:'pending_advisor',currentStep:0,history:[{step:'submit',by:d.name||'الطالب',role:'student',action:'submit',note:notes,at:now}],advisorUsername:d.code?(currentUser.advisor||load('assignments',{})[d.code]||null):null};
    try{if(window.DB&&DB.isOnline()){const res=await DB.createApplication(req);if(!res||!res.ok)throw new Error(res?.error||'تعذر حفظ الطلب على الخادم');await notifyUser(req.advisorUsername,`طلب جديد: ${req.formTitle} — ${req.studentName}`,{title:'طلب أكاديمي جديد',type:'info'});}else{const requests=load('requests',[]);requests.unshift(req);save('requests',requests);await notifyUser(req.advisorUsername,`طلب جديد: ${req.formTitle} — ${req.studentName}`,{title:'طلب أكاديمي جديد',type:'info'});}const root=document.getElementById('view-form-fill');root.innerHTML=`<div class="ad-success-card"><div class="ad-success-mark"><i class="fas fa-check"></i></div><div class="fw-extrabold">تم إرسال الطلب للمراجعة</div><p>تم حفظ طلبك وإرساله إلى مسار المراجعة. لم يتم تسجيل المقررات أو تغيير العبء أو المعدل الأكاديمي تلقائيًا.</p><div class="ad-reference"><small>الرقم المرجعي للطلب</small><strong>${arEsc(req.id)}</strong></div><div class="flex gap-2 justify-center flex-wrap"><button type="button" class="btn btn-primary" onclick="App.navigate('my-requests')">متابعة طلباتي</button><button type="button" class="btn btn-outline" onclick="App.navigate('forms-list')">العودة للنماذج</button></div></div>`;toast('تم تقديم الطلب بنجاح — '+req.id);}catch(err){console.error(err);toast(err.message||'حدث خطأ أثناء حفظ الطلب','err');if(btn){btn.disabled=false;btn.classList.remove('is-loading');}}
  }

  function openForm(type) {
    currentFormType = type;
    transcriptData = null;
    addDropTranscriptData = [];
    if (type === 'adddrop') {
      navigate('form-fill');
      renderAddDropWizard();
      return;
    }
    if (academicRequestDefinitions[type]) { if (!currentUser || currentUser.role !== 'student') return toast('هذا النموذج مخصص لتقديم الطلبات من حساب الطالب','err'); navigate('form-fill'); renderAcademicRequestWizard(type); return; }
    const f = S.formTypes.find(x => x.id === type);
    document.getElementById('form-fill-title').textContent = f.nameAr;
    document.getElementById('form-fill-desc').textContent = f.desc;
    document.getElementById('ff-name').value = currentUser.name || '';
    document.getElementById('ff-code').value = currentUser.code || currentUser.username || '';
    document.getElementById('ff-level').value = currentUser.level || '';
    const prog = S.programs.find(p => p.id === currentUser.program);
    document.getElementById('ff-program').value = prog ? prog.nameAr : '';
    document.getElementById('courses-body').innerHTML = '';
    addCourseRow();
    document.getElementById('transcript-input').value = '';
    document.getElementById('upload-status').textContent = '';
    document.getElementById('ff-notes').value = '';
    const needT = f.needsTranscript !== false;
    const up = document.getElementById('upload-box');
    if (up) up.style.display = needT ? '' : 'none';
    const needC = f.needsCourses !== false;
    const cb = document.getElementById('courses-box');
    if (cb) cb.style.display = needC ? '' : 'none';
    const isAddDrop = f.id === 'adddrop';
    const dropB = document.getElementById('drop-courses-block');
    const addB = document.getElementById('add-courses-block');
    const genB = document.getElementById('generic-courses-block');
    if (dropB) dropB.style.display = isAddDrop ? '' : 'none';
    if (addB) addB.style.display = isAddDrop ? '' : 'none';
    if (genB) genB.classList.toggle('hidden', isAddDrop || !needC);
    ['drop-courses-body','add-courses-body','courses-body'].forEach(id => {
      const el = document.getElementById(id); if (el) el.innerHTML = '';
    });
    if (needC) {
      if (isAddDrop) { addCourseRow('drop'); addCourseRow('add'); }
      else addCourseRow('generic');
    }
    navigate('form-fill');
  }

  function addCourseRow(kind) {
    kind = kind || 'generic';
    const tr = document.createElement('tr');
    const nameAttr = kind === 'drop' ? 'dc' : (kind === 'add' ? 'ac' : 'cc');
    tr.className = 'course-row';
    tr.innerHTML = `<td><input class="form-control" name="${nameAttr}_code[]" style="padding:.4rem" placeholder="مثل CHEM101" pattern="[A-Za-z]{2,4}[0-9]{2,4}" title="حروف إنجليزية + أرقام"></td>
      <td><input class="form-control" name="${nameAttr}_name[]" style="padding:.4rem" placeholder="اسم عربي"></td>
      <td><select class="form-control" name="${nameAttr}_hours[]" style="padding:.4rem">
        <option value="2">2</option><option value="3" selected>3</option><option value="4">4</option>
      </select></td>
      <td><button type="button" class="btn btn-sm btn-ghost" onclick="this.closest('tr').remove()"><i class="fas fa-times" style="color:var(--danger)"></i></button></td>`;
    const target = kind === 'drop' ? 'drop-courses-body' : (kind === 'add' ? 'add-courses-body' : 'courses-body');
    document.getElementById(target).appendChild(tr);
  }

  function onAddDropTranscript(e) {
    const input = e && e.target;
    const files = Array.from(input && input.files || []);
    const status = document.getElementById('ad-upload-status');
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!files.length) { addDropTranscriptData = []; if (status) status.textContent = 'لم يتم رفع أي ملفات بعد.'; updateAddDropSummary(); return; }
    const invalid = files.find(file => {
      const extOk = /\.(pdf|png|jpe?g)$/i.test(file.name || '');
      return ((!allowed.includes(file.type) && !extOk) || file.size > 5 * 1024 * 1024);
    });
    if (invalid) {
      addDropTranscriptData = [];
      input.value = '';
      if (status) status.textContent = 'تعذر قبول الملفات. تأكد أن كل ملف PDF أو JPG أو PNG ولا يتجاوز 5 ميجابايت.';
      toast('كل ملف يجب أن يكون PDF أو JPG أو PNG وبحد أقصى 5 ميجابايت', 'err');
      updateAddDropSummary();
      return;
    }
    if (status) status.textContent = 'جارٍ قراءة ' + files.length + ' ملف/ملفات…';
    Promise.all(files.map(file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve({ name: file.name, type: file.type || 'application/octet-stream', data: ev.target.result, size: file.size });
      reader.onerror = () => reject(new Error(file.name));
      reader.readAsDataURL(file);
    }))).then(results => {
      addDropTranscriptData = results;
      if (status) status.textContent = '✓ تم إرفاق ' + results.length + ' ملف/ملفات: ' + results.map(f => f.name).join('، ');
      updateAddDropSummary();
    }).catch(err => {
      addDropTranscriptData = [];
      if (status) status.textContent = 'تعذرت قراءة أحد الملفات، حاول رفعها مرة أخرى.';
      toast('تعذرت قراءة أحد ملفات السجل الدراسي: ' + (err.message || ''), 'err');
      updateAddDropSummary();
    });
  }

  function onTranscript(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('الحد 5 ميجا', 'err'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = ev => {
      transcriptData = { name: file.name, type: file.type, data: ev.target.result };
      document.getElementById('upload-status').textContent = '✓ تم رفع: ' + file.name;
    };
    reader.readAsDataURL(file);
  }

  async function submitForm(e) {
    e.preventDefault();
    if (!currentFormType) return toast('اختر نوع النموذج أولاً', 'err');
    const fMeta = S.formTypes.find(x => x.id === currentFormType);
    if (fMeta && fMeta.needsTranscript !== false && !transcriptData) return toast('يجب رفع السجل الدراسي', 'err');
    const fd = new FormData(e.target);
    function collect(prefix, action) {
      const codes = fd.getAll(prefix + '_code[]');
      const names = fd.getAll(prefix + '_name[]');
      const hours = fd.getAll(prefix + '_hours[]');
      const out = [];
      for (let i = 0; i < codes.length; i++) {
        if (!(codes[i] || names[i])) continue;
        if (!/^[A-Za-z]{2,4}[0-9]{2,4}$/.test((codes[i]||'').trim())) {
          toast('كود مقرر غير صالح: ' + codes[i], 'err'); return null;
        }
        if (!['2','3','4'].includes(String(hours[i]))) {
          toast('ساعات المقرر يجب أن تكون 2 أو 3 أو 4', 'err'); return null;
        }
        out.push({ code: codes[i].trim(), name: names[i], hours: hours[i], action });
      }
      return out;
    }
    let courses = [];
    if (currentFormType === 'adddrop') {
      const d = collect('dc', 'drop'); if (d === null) return;
      const a = collect('ac', 'add'); if (a === null) return;
      courses = [...d, ...a];
      if (!courses.length) return toast('أدخل مقرراً واحداً على الأقل في الحذف أو الإضافة', 'err');
    } else {
      const g = collect('cc', 'generic'); if (g === null) return;
      courses = g;
    }
    const f = S.formTypes.find(x => x.id === currentFormType);
    const req = {
      id: 'REQ-' + Date.now(),
      type: currentFormType,
      formTitle: f.nameAr,
      studentName: fd.get('studentName'),
      studentCode: fd.get('studentCode'),
      level: fd.get('level'),
      program: fd.get('program'),
      year: fd.get('year'),
      semester: fd.get('semester'),
      courses,
      studentNotes: fd.get('studentNotes') || '',
      transcript: transcriptData,
      createdAt: new Date().toISOString(),
      status: 'pending_advisor',
      currentStep: 0,
      history: [{ step: 'submit', by: currentUser.name, role: 'student', action: 'submit', note: fd.get('studentNotes') || '', at: new Date().toISOString() }],
      advisorUsername: currentUser.advisor || load('assignments', {})[currentUser.code] || null
    };
    if (window.DB && DB.isOnline()) {
      const res = await DB.createApplication(req);
      if (!res.ok) return toast(res.error || 'فشل حفظ الطلب', 'err');
      await notifyUser(req.advisorUsername, `طلب جديد من ${req.studentName}: ${req.formTitle}`, { title: 'طلب جديد', type: 'info' });
    } else {
      const requests = load('requests', []);
      requests.unshift(req);
      save('requests', requests);
      await notifyUser(req.advisorUsername, `طلب جديد من ${req.studentName}: ${req.formTitle}`, { title: 'طلب جديد', type: 'info' });
    }
    toast('تم تقديم الطلب بنجاح — رقم المرجع: ' + req.id);
    navigate('my-requests');
  }

  /* ===== Notifications System ===== */
  let notifAudioContext = null;
  function isNotifSoundEnabled() { return load('notification-sound-enabled', false) === true; }
  function playNotifSound(force = false) {
    if (!force && !isNotifSoundEnabled()) return false;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      if (!notifAudioContext) notifAudioContext = new AudioContext();
      const ctx = notifAudioContext;
      const start = Math.max(ctx.currentTime, 0) + 0.01;
      if (ctx.state === 'suspended') ctx.resume();
      [[880, 0], [1174.66, 0.11]].forEach(([frequency, offset]) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start + offset);
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.24);
      });
      return true;
    } catch (error) { console.warn('تعذر تشغيل نغمة الإشعار', error); return false; }
  }
  function updateNotifSoundControl() {
    const enabled = isNotifSoundEnabled();
    const button = document.getElementById('notif-sound-toggle');
    const hint = document.getElementById('notif-sound-hint');
    if (button) {
      button.innerHTML = `<i class="fas ${enabled ? 'fa-volume-high' : 'fa-volume-xmark'}"></i> ${enabled ? 'كتم صوت التنبيه' : 'تفعيل صوت التنبيه'}`;
      button.classList.toggle('is-active', enabled);
      button.setAttribute('aria-pressed', String(enabled));
    }
    if (hint) hint.innerHTML = enabled
      ? '<i class="fas fa-volume-high"></i> صوت الإشعارات مفعّل. ستسمع نغمة عند وصول إشعار جديد.'
      : '<i class="fas fa-volume-xmark"></i> صوت الإشعارات مكتوم حاليًا. اضغط «تفعيل صوت التنبيه» ثم جرّب الصوت.';
  }
  function toggleNotifSound() {
    const next = !isNotifSoundEnabled();
    save('notification-sound-enabled', next);
    updateNotifSoundControl();
    if (next) {
      playNotifSound(true);
      toast('تم تفعيل صوت الإشعارات');
    } else toast('تم كتم صوت الإشعارات');
  }
  function testNotifSound() {
    if (!playNotifSound(true)) return toast('المتصفح لا يدعم تشغيل الصوت هنا', 'err');
    toast('تم تشغيل نغمة الاختبار');
  }
  function pushNotif(to, text, opts) {
    if (!to) return;
    opts = opts || {};
    const n = load('notifications', []);
    const item = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      to: String(to),
      text: text,
      title: opts.title || 'إشعار جديد',
      type: opts.type || 'info', // info | success | warn | error
      read: false,
      at: new Date().toISOString(),
      link: opts.link || null
    };
    n.unshift(item);
    // احتفظ بآخر 200 إشعار فقط
    save('notifications', n.slice(0, 200));
    updateNotifBadge();
    // إن كان المستلم هو المستخدم الحالي — أظهر إشعار المتصفح فوراً
    if (currentUser && (String(currentUser.username) === String(to) || String(currentUser.code || '') === String(to))) {
      playNotifSound();
      showBrowserNotification(item.title, item.text, item.type);
      toast(item.text, item.type === 'error' ? 'err' : item.type === 'success' ? 'ok' : undefined);
    }
  }

  async function notifyUser(to, text, opts) {
    opts = opts || {};
    pushNotif(to, text, opts);
    if (window.DB && DB.isOnline()) {
      try { await DB.pushNotification(to, text); } catch (e) { /* offline fallback already saved */ }
    }
  }

  function requestNotifPermission() {
    if (!('Notification' in window)) {
      toast('المتصفح لا يدعم إشعارات سطح المكتب', 'err');
      return Promise.resolve(false);
    }
    if (Notification.permission === 'granted') {
      toast('إشعارات الجهاز مفعّلة مسبقاً', 'ok');
      updateNotifPermHint();
      return Promise.resolve(true);
    }
    if (Notification.permission === 'denied') {
      toast('تم رفض الإذن سابقاً — فعّله من إعدادات المتصفح/الهاتف', 'err');
      updateNotifPermHint();
      return Promise.resolve(false);
    }
    return Notification.requestPermission().then(p => {
      if (p === 'granted') {
        toast('تم تفعيل إشعارات الجهاز', 'ok');
        showBrowserNotification('المنصة الرقمية لكلية العلوم', 'ستصلك تنبيهات عند تحديث طلباتك', 'success');
      } else {
        toast('لم يتم منح إذن الإشعارات', 'err');
      }
      updateNotifPermHint();
      return p === 'granted';
    });
  }

  function showBrowserNotification(title, body, type) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title || 'كلية العلوم', {
        body: body || '',
        icon: (location.origin + location.pathname.replace(/\/[^/]*$/, '/') + 'assets/11-icon-192.png'),
        badge: (location.origin + location.pathname.replace(/\/[^/]*$/, '/') + 'assets/10-favicon-32.png'),
        dir: 'rtl',
        lang: 'ar',
        tag: 'fos-' + (type || 'info') + '-' + Date.now(),
        requireInteraction: type === 'error' || type === 'warn'
      });
      n.onclick = () => { try { window.focus(); } catch(e) {} n.close(); };
      setTimeout(() => { try { n.close(); } catch(e) {} }, 8000);
    } catch (e) { /* ignore */ }
  }

  function myNotifs() {
    if (!currentUser) return [];
    const keys = [String(currentUser.username), String(currentUser.code || '')].filter(Boolean);
    return load('notifications', []).filter(n => keys.includes(String(n.to)));
  }

  function updateNotifBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const unread = myNotifs().filter(n => !n.read).length;
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function updateNotifPermHint() {
    const el = document.getElementById('notif-perm-hint');
    if (!el) return;
    if (!('Notification' in window)) {
      el.innerHTML = '<div class="alert alert-warn">المتصفح لا يدعم إشعارات الجهاز</div>';
      return;
    }
    const p = Notification.permission;
    if (p === 'granted') {
      el.innerHTML = '<div class="alert alert-info"><i class="fas fa-check-circle"></i> إشعارات الجهاز مفعّلة — ستصلك تنبيهات فورية عند تحديث الطلبات</div>';
    } else if (p === 'denied') {
      el.innerHTML = '<div class="alert alert-warn"><i class="fas fa-ban"></i> تم حظر الإشعارات. من إعدادات المتصفح/الهاتف اسمح بالإشعارات لهذا الموقع.</div>';
    } else {
      el.innerHTML = '<div class="alert alert-info"><i class="fas fa-bell"></i> لم تُفعّل إشعارات الجهاز بعد. اضغط «تفعيل إشعارات الجهاز» للسماح (سيظهر طلب إذن من المتصفح/الهاتف).</div>';
    }
  }

  function openNotifications() {
    navigate('notifications');
  }

  function markAllNotifsRead() {
    if (!currentUser) return;
    const keys = [String(currentUser.username), String(currentUser.code || '')].filter(Boolean);
    const all = load('notifications', []);
    all.forEach(n => { if (keys.includes(String(n.to))) n.read = true; });
    save('notifications', all);
    updateNotifBadge();
    renderNotifications();
    toast('تم تعيين الكل كمقروء');
  }


  function statusInfo(r) {
    if (r.status === 'rejected') return { label: 'مرفوض', cls: 'badge-red' };
    if (r.status === 'executed') return { label: 'تم التنفيذ', cls: 'badge-green' };
    const step = S.workflow[r.currentStep];
    return step ? { label: 'لدى: ' + step.label, cls: 'badge-blue' } : { label: 'قيد المعالجة', cls: 'badge-amber' };
  }

  function progressHTML(r) {
    const steps = [{ label: 'تقديم' }, ...S.workflow.map(w => ({ label: w.label }))];
    let h = '<div class="steps">';
    steps.forEach((s, i) => {
      let cls = 'pending';
      if (r.status === 'rejected') cls = i <= r.currentStep + 1 ? (i === r.currentStep + 1 ? 'rejected' : 'done') : 'pending';
      else if (r.status === 'executed') cls = 'done';
      else { if (i < r.currentStep + 1) cls = 'done'; else if (i === r.currentStep + 1) cls = 'current'; }
      if (i > 0) h += `<div class="step-line ${cls === 'done' || r.status === 'executed' ? 'done' : ''}"></div>`;
      h += `<div class="step"><div class="step-dot ${cls}">${cls === 'done' ? '✓' : cls === 'rejected' ? '✕' : i + 1}</div><div class="step-lbl">${s.label}</div></div>`;
    });
    return h + '</div>';
  }

  async function renderMyRequests() {
    const el = document.getElementById('my-requests-list');
    el.innerHTML = '<div class="empty">جاري التحميل...</div>';
    let list = [];
    if (window.DB && DB.isOnline()) {
      list = await DB.listApplications({ studentCode: currentUser.code || currentUser.username });
    } else {
      list = load('requests', []).filter(r => r.studentCode === (currentUser.code || currentUser.username));
    }
    if (!list.length) { el.innerHTML = '<div class="empty"><i class="fas fa-inbox"></i>لا توجد طلبات بعد</div>'; return; }
    el.innerHTML = list.map(r => {
      const st = statusInfo(r);
      return `<div class="list-item" onclick="App.viewRequest('${r.id}','my-requests')">
        <div><div class="fw-bold">${r.formTitle}</div>
        <div class="text-xs text-muted">${r.id} · ${new Date(r.createdAt).toLocaleString('ar-EG')}</div>
        ${progressHTML(r)}</div>
        <span class="badge ${st.cls}">${st.label}</span>
      </div>`;
    }).join('');
  }

  function canAction(r) {
    if (r.status === 'rejected' || r.status === 'executed') return false;
    const step = S.workflow[r.currentStep];
    if (!step) return false;
    if (currentUser.role === 'dean' || currentUser.role === 'admin') return true;
    if (step.role !== currentUser.role) return false;
    if (currentUser.role === 'advisor') return !r.advisorUsername || r.advisorUsername === currentUser.username;
    return true;
  }

  async function viewRequest(id, back) {
    detailBack = back || 'my-requests';
    let r = null;
    if (window.DB && DB.isOnline()) {
      const all = await DB.listApplications({});
      r = all.find(x => x.id === id);
      if (r) r.history = await DB.loadHistory(id);
    } else {
      r = load('requests', []).find(x => x.id === id);
    }
    if (!r) return toast('الطلب غير موجود', 'err');
    const st = statusInfo(r);
    const mayAct = canAction(r);
    let actions = '';
    if (mayAct) {
      actions = `<div class="mt-4" style="border-top:1px solid var(--gray-200);padding-top:1rem">
        <div class="fw-bold mb-2">اتخاذ قرار</div>
        <textarea id="action-note" class="form-control mb-2" rows="3" placeholder="التوصية أو سبب الرفض (مطلوب عند الرفض)"></textarea>
        <div class="flex gap-2">
          <button class="btn btn-success btn-sm" onclick="App.process('${r.id}','approve')"><i class="fas fa-check"></i> اعتماد</button>
          <button class="btn btn-danger btn-sm" onclick="App.process('${r.id}','reject')"><i class="fas fa-times"></i> رفض</button>
        </div>
      </div>`;
    }
    const history = (r.history || []).map(h => {
      const act = ({ submit: 'تقديم', approve: 'اعتماد', reject: 'رفض', execute: 'تنفيذ' })[h.action] || h.action;
      return `<div style="border-right:3px solid ${h.action === 'reject' ? 'var(--danger)' : h.action === 'approve' || h.action === 'execute' ? 'var(--success)' : 'var(--blue)'};padding:.5rem .85rem;margin-bottom:.5rem">
        <div class="fw-bold text-sm">${h.by} <span class="text-muted fw-normal">(${ROLES[h.role] || h.role})</span></div>
        <div class="text-xs text-muted">${new Date(h.at).toLocaleString('ar-EG')} — ${act}</div>
        ${h.note ? `<div class="text-sm mt-1" style="background:var(--gray-50);padding:.4rem .6rem;border-radius:6px">${h.note}</div>` : ''}
      </div>`;
    }).join('');

    let transcript = '';
    if (r.transcript) {
      if (r.transcript.type && r.transcript.type.startsWith('image/'))
        transcript = `<img src="${r.transcript.data}" style="max-height:200px;border-radius:8px;border:1px solid var(--gray-200);margin-top:.4rem">`;
      else
        transcript = `<a href="${r.transcript.data}" download="${r.transcript.name}" style="color:var(--blue)">تحميل: ${r.transcript.name}</a>`;
    }
    const courses = (r.courses || []).map(c => `<tr><td>${c.code || ''}</td><td>${c.name || ''}</td><td>${c.hours || ''}</td></tr>`).join('');

    document.getElementById('request-detail-body').innerHTML = `
      <div class="flex justify-between items-center flex-wrap gap-2 mb-3">
        <div><div class="h3">${r.formTitle}</div><div class="text-xs text-muted">${r.id} · ${new Date(r.createdAt).toLocaleString('ar-EG')}</div></div>
        <span class="badge ${st.cls}">${st.label}</span>
      </div>
      ${progressHTML(r)}
      <div class="grid-3 mt-3 text-sm">
        <div><span class="text-muted">الطالب:</span> <b>${r.studentName}</b></div>
        <div><span class="text-muted">الكود:</span> <b>${r.studentCode}</b></div>
        <div><span class="text-muted">المستوى:</span> <b>${r.level || '—'}</b></div>
        <div><span class="text-muted">البرنامج:</span> <b>${r.program || '—'}</b></div>
        <div><span class="text-muted">العام:</span> <b>${r.year || '—'}</b></div>
        <div><span class="text-muted">الفصل:</span> <b>${r.semester || '—'}</b></div>
      </div>
      ${r.studentNotes ? `<div class="alert alert-info mt-3">${arEsc(r.studentNotes).replace(/\n/g,'<br>')}</div>` : ''}
      ${r.academicRequest ? `<div class="card mt-3"><div class="card-body"><div class="fw-bold mb-2">تفاصيل الطلب الأكاديمي</div><div class="grid-3 text-sm"><div>المعدل المسجل: <b>${r.academicRequest.gpa == null ? 'غير متاح' : r.academicRequest.gpa}</b></div><div>الساعات المجتازة: <b>${r.academicRequest.completedHours == null ? 'غير متاح' : r.academicRequest.completedHours}</b></div><div>الساعات الحالية: <b>${r.academicRequest.registeredHours == null ? 'غير متاح' : r.academicRequest.registeredHours}</b></div><div>إجمالي الساعات المطلوبة: <b>${r.academicRequest.totalHours || 0}</b></div><div>تاريخ التنفيذ الفعلي: <b>${r.academicRequest.executionDate || 'لم ينفذ بعد'}</b></div><div>حالة التحقق الأكاديمي: <b>تحتاج إلى مراجعة</b></div></div></div></div>` : ''}
      <div class="mt-3"><div class="fw-bold mb-2">المقررات</div>
        <table class="data"><thead><tr><th>الكود</th><th>الاسم</th><th>الساعات</th></tr></thead>
        <tbody>${courses || '<tr><td colspan="3" class="text-muted" style="text-align:center">—</td></tr>'}</tbody></table>
      </div>
      <div class="mt-3"><div class="fw-bold mb-1">السجل الأكاديمي</div>${transcript || '<span class="text-muted text-sm">غير متوفر</span>'}</div>
      <div class="mt-3"><div class="fw-bold mb-2">سجل القرارات</div>${history}</div>
      ${actions}`;
    navigate('request-detail');
  }

  async function process(id, action) {
    if (action === 'approve' && !can('requests.approve')) return toast('ليس لديك صلاحية الاعتماد', 'err');
    if (action === 'reject' && !can('requests.reject')) return toast('ليس لديك صلاحية الرفض', 'err');
    if (action === 'delete' && !can('requests.delete')) return toast('ليس لديك صلاحية الحذف', 'err');
    const note = (document.getElementById('action-note')?.value || '').trim();
    if (action === 'reject' && !note) return toast('يجب كتابة سبب الرفض', 'err');
    let r = null;
    let requests = load('requests', []);
    let idx = -1;
    if (window.DB && DB.isOnline()) {
      const all = await DB.listApplications({});
      r = all.find(x => x.id === id);
      if (r) r.history = await DB.loadHistory(id) || [];
    } else {
      idx = requests.findIndex(x => x.id === id);
      if (idx < 0) return;
      r = requests[idx];
    }
    if (!r) return toast('الطلب غير موجود', 'err');
    const step = S.workflow[r.currentStep];
    if (!r.history) r.history = [];
    r.history.push({ step: step?.key, by: currentUser.name, role: currentUser.role, action, note, at: new Date().toISOString() });
    if (action === 'reject') {
      r.status = 'rejected';
      await notifyUser(r.studentCode, `تم رفض طلبك (${r.formTitle}): ${note}`, { title: 'رفض الطلب', type: 'error', link: 'my-requests' });
      if (r.studentUsername && r.studentUsername !== r.studentCode)
        await notifyUser(r.studentUsername, `تم رفض طلبك (${r.formTitle}): ${note}`, { title: 'رفض الطلب', type: 'error' });
    } else {
      if (step && step.role === 'affairs') {
        r.status = 'executed';
        r.history[r.history.length - 1].action = 'execute';
        await notifyUser(r.studentCode, `تم تنفيذ طلبك (${r.formTitle}) بنجاح على النظام الأكاديمي`, { title: 'تم التنفيذ', type: 'success', link: 'my-requests' });
        if (r.studentUsername && r.studentUsername !== r.studentCode)
          await notifyUser(r.studentUsername, `تم تنفيذ طلبك (${r.formTitle})`, { title: 'تم التنفيذ', type: 'success' });
      } else {
        r.currentStep += 1;
        r.status = r.currentStep >= S.workflow.length ? 'executed' : 'pending_' + S.workflow[r.currentStep].key;
        const roleLabel = roleName(currentUser.role);
        await notifyUser(r.studentCode, `تم اعتماد طلبك (${r.formTitle}) من ${roleLabel} — انتقل للمرحلة التالية`, { title: 'اعتماد الطلب', type: 'success', link: 'my-requests' });
        if (r.studentUsername && r.studentUsername !== r.studentCode)
          await notifyUser(r.studentUsername, `تم اعتماد طلبك من ${roleLabel}`, { title: 'اعتماد الطلب', type: 'success' });
        // إشعار للمرحلة التالية (إن أمكن)
        const next = S.workflow[r.currentStep];
        if (next && next.role === 'advisor' && r.advisorUsername)
          await notifyUser(r.advisorUsername, `طلب بانتظار مراجعتك: ${r.formTitle} — ${r.studentName}`, { title: 'طلب للمراجعة', type: 'info' });
      }
    }
    const histEntry = r.history[r.history.length - 1];
    if (window.DB && DB.isOnline()) {
      await DB.updateApplication(r.id, { status: r.status, currentStep: r.currentStep }, histEntry);
    } else {
      requests[idx] = r;
      save('requests', requests);
    }
    toast(action === 'reject' ? 'تم الرفض' : 'تم الاعتماد');
    navigate(detailBack || 'staff-inbox');
  }

  function goBackDetail() {
    navigate(detailBack || 'my-requests');
  }

  // ===== Staff =====
  async function renderStaffInbox() {
    const el = document.getElementById('staff-list');
    el.innerHTML = '<div class="empty">جاري التحميل...</div>';
    let list = [];
    if (window.DB && DB.isOnline()) list = await DB.listApplications({});
    else list = load('requests', []);
    const filter = document.getElementById('inbox-filter')?.value || 'pending';
    if (filter === 'pending') list = list.filter(canAction);
    else if (currentUser.role === 'advisor') list = list.filter(r => !r.advisorUsername || r.advisorUsername === currentUser.username);
    if (!list.length) { el.innerHTML = '<div class="empty"><i class="fas fa-check-circle"></i>لا توجد طلبات</div>'; return; }
    el.innerHTML = list.map(r => {
      const st = statusInfo(r);
      return `<div class="list-item" onclick="App.viewRequest('${r.id}','staff-inbox')">
        <div><div class="fw-bold">${r.formTitle}</div>
        <div class="text-sm">${r.studentName} — ${r.studentCode}</div>
        <div class="text-xs text-muted">${new Date(r.createdAt).toLocaleString('ar-EG')}</div>
        ${progressHTML(r)}</div>
        <span class="badge ${st.cls}">${st.label}</span>
      </div>`;
    }).join('');
  }

  // ===== Dean Command Center =====
  async function renderDeanDashboard() {
    const root = document.getElementById('view-dean-dashboard');
    if (!root) return;
    const keepSearch = document.getElementById('dean-search')?.value || '';
    const keepStatus = document.getElementById('dean-filter-status')?.value || 'open';
    const esc = arEsc;
    const nameEl = document.getElementById('dean-name');
    if (nameEl) nameEl.textContent = (currentUser && (currentUser.name || currentUser.full_name)) || S.org?.dean || 'عميد الكلية';
    const dateEl = document.getElementById('dean-today');
    if (dateEl) dateEl.textContent = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());

    const [reqs, students] = window.DB && DB.isOnline()
      ? await Promise.all([DB.listApplications({}), DB.listStudents()])
      : [load('requests', []), load('users', []).filter(u => u.role === 'student')];
    const requests = Array.isArray(reqs) ? reqs : [];
    const roster = Array.isArray(students) ? students : [];
    const pending = requests.filter(r => !['executed', 'rejected', 'cancelled'].includes(r.status));
    const awaitingDean = pending.filter(r => canAction(r));
    const executed = requests.filter(r => r.status === 'executed');
    const rejected = requests.filter(r => r.status === 'rejected');
    const averageAge = pending.length ? Math.round(pending.reduce((sum, r) => { const age = (Date.now() - new Date(r.createdAt || Date.now()).getTime()) / 86400000; return sum + (Number.isFinite(age) ? Math.max(0, age) : 0); }, 0) / pending.length) : 0;
    const academic = window.StudentDataCenter ? StudentDataCenter.renderDeanAcademic(roster) : { rows: roster, studentsCount: roster.length, atRisk: 0, recorded: 0, percent: 0 };
    const metrics = [
      { label: 'إجمالي الطلاب', value: academic.studentsCount, icon: 'fa-user-graduate', tone: 'navy', hint: 'وفق الفلاتر الأكاديمية', action: 'students-mgmt' },
      { label: 'الطلاب المتعثرون', value: academic.atRisk, icon: 'fa-heartbeat', tone: 'amber', hint: 'معدل أقل من 2.00', action: 'students-search' },
      { label: 'نسبة التعثر', value: academic.recorded ? `${academic.percent.toFixed(1)}%` : '—', icon: 'fa-chart-pie', tone: 'violet', hint: `من ${academic.recorded} معدلًا مسجلًا`, action: 'students-search' },
      { label: 'إجمالي الطلبات', value: requests.length, icon: 'fa-file-alt', tone: 'blue', hint: 'كل الطلبات المسجلة', action: 'staff-inbox' },
      { label: 'بانتظار إجراء العميد', value: awaitingDean.length, icon: 'fa-stamp', tone: 'amber', hint: 'طلبات وصلت إلى مرحلة الاعتماد', action: 'staff-inbox' },
      { label: 'طلبات قيد المتابعة', value: pending.length, icon: 'fa-hourglass-half', tone: 'teal', hint: 'ما زالت ضمن مسار الاعتماد', action: 'staff-inbox' },
      { label: 'تم تنفيذها', value: executed.length, icon: 'fa-circle-check', tone: 'green', hint: 'طلبات اكتمل مسارها', action: 'staff-inbox' },
      { label: 'متوسط عمر الطلب المفتوح', value: `${averageAge} يوم`, icon: 'fa-clock', tone: 'violet', hint: 'مؤشر زمني للطلبات المفتوحة', action: 'staff-inbox' }
    ];
    document.getElementById('dean-stats').innerHTML = metrics.map(m => `<button type="button" class="dean-metric ${m.tone}" onclick="App.navigate('${m.action}')"><span class="dean-metric-icon"><i class="fas ${m.icon}"></i></span><span class="dean-metric-label">${m.label}</span><strong>${m.value}</strong><small>${m.hint}</small></button>`).join('');

    const openByStage = S.workflow.map(step => ({...step, count: pending.filter(r => r.status === 'pending_' + step.key).length}));
    document.getElementById('dean-stage-list').innerHTML = openByStage.length ? openByStage.map((step, i) => {
      const pct = pending.length ? Math.round(step.count * 100 / pending.length) : 0;
      return `<button type="button" class="dean-stage-row" onclick="App.navigate('staff-inbox')"><span class="dean-stage-number">${String(i + 1).padStart(2, '0')}</span><span class="dean-stage-name">${esc(step.label)}</span><span class="dean-stage-track"><i style="width:${pct}%"></i></span><b>${step.count}</b></button>`;
    }).join('') : '<div class="dean-empty">لا توجد مراحل اعتماد مهيأة.</div>';

    const atRisk = academic.rows.filter(s => s.gpa !== null && s.gpa !== '' && Number.isFinite(Number(s.gpa)) && Number(s.gpa) >= 0 && Number(s.gpa) < 2).sort((a,b) => Number(a.gpa)-Number(b.gpa)).slice(0,5);
    document.getElementById('dean-risk-list').innerHTML = atRisk.length ? atRisk.map(s => `<button type="button" class="dean-risk-row" onclick="App.navigate('students-search')"><span class="dean-risk-avatar"><i class="fas fa-user"></i></span><span class="dean-risk-info"><b>${esc(s.name || s.full_name || 'طالب')}</b><small>كود ${esc(s.code || s.username || '—')} · ${esc(s.program || 'البرنامج غير محدد')}</small></span><span class="dean-gpa">${Number(s.gpa).toFixed(2)}<small>معدل</small></span></button>`).join('') : '<div class="dean-empty"><i class="fas fa-circle-check"></i><span>لا توجد حالات تعثر مسجلة حاليًا.</span></div>';

    const programCounts = new Map();
    requests.forEach(r => { const key = String(r.program || 'برنامج غير محدد'); programCounts.set(key, (programCounts.get(key) || 0) + 1); });
    const programs = [...programCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0,7);
    const maxProgram = Math.max(1, ...programs.map(x => x[1]));
    document.getElementById('dean-program-list').innerHTML = programs.length ? programs.map(([label,count]) => `<div class="dean-program-row"><span>${esc(label)}</span><span class="dean-program-track"><i style="width:${Math.max(5,Math.round(count*100/maxProgram))}%"></i></span><b>${count}</b></div>`).join('') : '<div class="dean-empty">ستظهر بيانات النشاط بعد تسجيل الطلبات.</div>';

    const searchEl = document.getElementById('dean-search');
    const filterEl = document.getElementById('dean-filter-status');
    if (searchEl && searchEl.value !== keepSearch) searchEl.value = keepSearch;
    if (filterEl && filterEl.value !== keepStatus) filterEl.value = keepStatus;
    const q = keepSearch.trim().toLocaleLowerCase('ar');
    let filtered = requests.filter(r => {
      const statusMatch = keepStatus === 'all' || (keepStatus === 'open' ? !['executed', 'rejected', 'cancelled'].includes(r.status) : r.status === keepStatus);
      const text = [r.studentName, r.studentCode, r.formTitle, r.id, r.program].join(' ').toLocaleLowerCase('ar');
      return statusMatch && (!q || text.includes(q));
    }).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 12);
    const listEl = document.getElementById('dean-request-list');
    listEl.innerHTML = filtered.length ? filtered.map(r => {
      const status = statusInfo(r);
      const stamp = r.createdAt && !Number.isNaN(new Date(r.createdAt).getTime()) ? new Date(r.createdAt).toLocaleDateString('ar-EG', { day:'numeric', month:'short', year:'numeric' }) : 'تاريخ غير محدد';
      const actionable = canAction(r);
      return `<button type="button" class="dean-request-row" onclick="App.viewRequest('${esc(r.id)}','dean-dashboard')"><span class="dean-request-mark ${r.status === 'rejected' ? 'rejected' : r.status === 'executed' ? 'complete' : ''}"><i class="fas ${r.status === 'rejected' ? 'fa-xmark' : r.status === 'executed' ? 'fa-check' : 'fa-file-lines'}"></i></span><span class="dean-request-main"><b>${esc(r.formTitle || 'طلب أكاديمي')}</b><small>${esc(r.studentName || 'طالب')} · ${esc(r.studentCode || '—')} · ${esc(r.program || '—')}</small><small>${esc(stamp)} · ${esc(r.id || '')}</small></span><span class="dean-request-status ${status.cls}">${esc(status.label)}</span>${actionable ? '<span class="dean-action-hint">يتطلب إجراء</span>' : ''}<i class="fas fa-chevron-left dean-request-arrow"></i></button>`;
    }).join('') : `<div class="dean-empty"><i class="fas fa-inbox"></i><span>${q ? 'لا توجد نتائج مطابقة للبحث.' : 'لا توجد طلبات في هذا التصنيف.'}</span></div>`;
    const oldStudents = document.getElementById('dean-students');
    if (oldStudents) oldStudents.innerHTML = '';
  }
  async function showStudentDetail(code) {
    let reqs = [], students = [];
    if (window.DB && DB.isOnline()) {
      [reqs, students] = await Promise.all([DB.listApplications({ studentCode: code }), DB.listStudents()]);
    } else {
      reqs = load('requests', []).filter(r => String(r.studentCode) === String(code));
      students = load('users', []).filter(u => u.role === 'student');
    }
    const stu = students.find(u => String(u.code || u.student_code || u.username) === String(code));
    document.getElementById('topbar-title').textContent = (stu ? (stu.name || stu.full_name) : code) + ' — الطلبات';
    const target = document.getElementById('dean-request-list') || document.getElementById('dean-students');
    if (target) target.innerHTML = `<button type="button" class="btn btn-sm btn-outline mb-3" onclick="App.navigate('dean-dashboard')"><i class="fas fa-arrow-right"></i> العودة إلى لوحة العميد</button>` + (reqs.length ? reqs.map(r => {
      const st = statusInfo(r);
      return `<button type="button" class="dean-request-row" onclick="App.viewRequest('${arEsc(r.id)}','dean-dashboard')"><span class="dean-request-mark"><i class="fas fa-file-lines"></i></span><span class="dean-request-main"><b>${arEsc(r.formTitle || 'طلب أكاديمي')}</b><small>${arEsc(r.id || '')} · ${r.createdAt ? new Date(r.createdAt).toLocaleString('ar-EG') : '—'}</small></span><span class="dean-request-status ${st.cls}">${arEsc(st.label)}</span></button>`;
    }).join('') : '<div class="dean-empty">لا توجد طلبات مسجلة لهذا الطالب.</div>');
  }
  async function renderStudentsMgmt() {
    let students = [];
    if (window.DB && DB.isOnline()) students = await DB.listStudents();
    else students = load('users', []).filter(u => u.role === 'student');
    document.getElementById('students-table').innerHTML = students.map(s => {
      const prog = S.programs.find(p => p.id === s.program);
      return `<tr>
        <td>${s.name}</td><td>${s.code || s.username}</td><td>${s.level || '—'}</td>
        <td>${prog ? prog.nameAr : '—'}</td><td>${s.gpa == null || String(s.gpa).trim() === '' ? 'غير مسجل' : Number(s.gpa).toFixed(2)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="text-muted" style="text-align:center">لا يوجد طلاب</td></tr>';
  }

  function renderStudentsSearch() {
    document.getElementById('search-results').innerHTML = '';
  }

  function doStudentSearch() {
    const q = document.getElementById('student-search-q').value.trim().toLowerCase();
    if (!q) return;
    const results = load('users', []).filter(u =>
      u.role === 'student' && (
        (u.name && u.name.includes(q)) ||
        (u.code && u.code.includes(q)) ||
        (u.username && u.username.includes(q))
      )
    );
    document.getElementById('search-results').innerHTML = results.length
      ? results.map(s => {
        const gpaInfo = s.grades ? calcGPA(s.grades) : { gpa: s.gpa || 0 };
        return `<div class="card mb-2"><div class="card-body">
          <div class="fw-bold">${s.name}</div>
          <div class="text-sm text-muted">${s.code || s.username} · ${s.level || ''} · معدل ${gpaInfo.gpa}</div>
        </div></div>`;
      }).join('')
      : '<div class="empty">لا نتائج</div>';
  }

  async function renderPeriods() {
    let periods = S.periods;
    if (window.DB && DB.isOnline()) {
      const p = await DB.getPeriods();
      if (p) periods = p;
    } else periods = load('periods', S.periods);
    document.getElementById('periods-list').innerHTML = S.formTypes.map(f => {
      const on = periods[f.id] !== false;
      return `<div class="list-item" style="cursor:default">
        <div class="fw-bold text-sm">${f.nameAr}</div>
        <button class="btn btn-sm ${on ? 'btn-success' : 'btn-danger'}" onclick="App.togglePeriod('${f.id}')">
          ${on ? 'مفتوح' : 'مغلق'}
        </button>
      </div>`;
    }).join('');
  }

  async function togglePeriod(id) {
    let periods = load('periods', S.periods);
    if (window.DB && DB.isOnline()) {
      const p = await DB.getPeriods();
      if (p) periods = p;
    }
    const next = periods[id] === false;
    if (window.DB && DB.isOnline()) await DB.setPeriod(id, next);
    periods[id] = next;
    save('periods', periods);
    toast(next ? 'تم فتح الفترة' : 'تم إغلاق الفترة');
    renderPeriods();
  }

  function renderAssignments() {
    const advisors = load('users', []).filter(u => u.role === 'advisor');
    document.getElementById('assign-adv').innerHTML = advisors.map(a =>
      `<option value="${a.username}">${a.name}</option>`
    ).join('');
    const assignments = load('assignments', {});
    const users = load('users', []);
    document.getElementById('assign-list').innerHTML = Object.keys(assignments).length
      ? Object.entries(assignments).map(([code, adv]) => {
        const a = users.find(u => u.username === adv);
        return `<div class="list-item" style="cursor:default"><span>طالب: <b>${code}</b></span><span class="text-sm">${a ? a.name : adv}</span></div>`;
      }).join('')
      : '<div class="text-muted text-sm">لا توجد إسنادات</div>';
  }

  async function assignOne() {
    const adv = document.getElementById('assign-adv').value;
    const code = document.getElementById('assign-code').value.trim();
    if (!code) return toast('أدخل كود الطالب', 'err');
    if (window.DB && DB.isOnline()) await DB.setAssignment(code, adv);
    const assignments = load('assignments', {});
    assignments[code] = adv;
    save('assignments', assignments);
    document.getElementById('assign-code').value = '';
    toast('تم الإسناد');
    renderAssignments();
  }

  function bulkAssign() {
    const text = document.getElementById('bulk-text').value.trim();
    if (!text) return toast('الصق البيانات', 'err');
    const assignments = load('assignments', {});
    const users = load('users', []);
    let n = 0;
    text.split(/\n/).forEach(line => {
      const parts = line.split(/[,;\t]/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        assignments[parts[0]] = parts[1];
        const stu = users.find(u => u.code === parts[0] || u.username === parts[0]);
        if (stu) stu.advisor = parts[1];
        n++;
      }
    });
    save('assignments', assignments);
    save('users', users);
    toast(`تم إسناد ${n} طالب`);
    renderAssignments();
  }

  async function renderUsersMgmt() {
    if (!can('users.manage') && currentUser.role !== 'admin') {
      const t = document.getElementById('users-table');
      if (t) t.innerHTML = '<tr><td colspan="5">ليس لديك صلاحية إدارة المستخدمين</td></tr>';
      return;
    }
    let users = [];
    try {
      if (window.DB && DB.isOnline()) users = await DB.listUsers();
      else users = load('users', []);
    } catch (e) { users = load('users', []); }
    const roleOpts = loadRoles().map(r => `<option value="${r.id}">${r.nameAr}</option>`).join('');
    const view = document.getElementById('view-users-mgmt');
    if (view && !document.getElementById('users-toolbar')) {
      const bar = document.createElement('div');
      bar.id = 'users-toolbar';
      bar.className = 'card mb-3';
      bar.innerHTML = `<div class="card-body">
        ${window.FOS_MODE === 'local' ? '<div class="alert alert-info mb-3"><i class="fas fa-info-circle"></i> يستطيع مدير النظام إنشاء حسابات محلية واستخدامها مباشرة لتسجيل الدخول من هذا الجهاز.</div>' : ''}
        <div class="users-create-heading"><div><div class="fw-bold">إنشاء حساب جديد</div><div class="text-xs text-muted">أدخل بيانات المستخدم وحدد دوره وكلمة المرور الخاصة به</div></div><span class="badge badge-teal"><i class="fas fa-user-plus"></i> مدير النظام</span></div>
        <div class="grid-3">
          <div class="form-group"><label for="nu-name">الاسم بالكامل</label><input class="form-control" id="nu-name" required placeholder="اسم المستخدم"></div>
          <div class="form-group"><label for="nu-user">اسم المستخدم</label><input class="form-control" id="nu-user" required autocomplete="off" placeholder="اسم الدخول"></div>
          <div class="form-group"><label for="nu-pass">كلمة المرور</label><input class="form-control" id="nu-pass" type="password" required minlength="4" autocomplete="new-password" placeholder="4 أحرف على الأقل"></div>
          <div class="form-group"><label for="nu-role">الدور</label><select class="form-control" id="nu-role">${roleOpts}</select></div>
          <div class="form-group"><label for="nu-code">الكود / المعرف الأكاديمي <span class="text-muted">(اختياري)</span></label><input class="form-control" id="nu-code" autocomplete="off" placeholder="للطالب عند الحاجة"></div>
          <div class="form-group"><label for="nu-phone">رقم الهاتف <span class="text-muted">(اختياري)</span></label><input class="form-control" id="nu-phone" type="tel" inputmode="tel" placeholder="01xxxxxxxxx"></div>
        </div>
        <button class="btn btn-primary btn-sm mt-2" type="button" onclick="App.createUser()"><i class="fas fa-user-plus"></i> إنشاء الحساب</button>
      </div>`;
      view.insertBefore(bar, view.firstChild);
    } else if (document.getElementById('nu-role')) {
      document.getElementById('nu-role').innerHTML = roleOpts;
    }
    const t = document.getElementById('users-table');
    if (t) t.innerHTML = users.map(u =>
      `<tr>
        <td>${u.name || '—'}</td>
        <td>${u.username}</td>
        <td><span class="badge badge-blue">${roleName(u.role)}</span></td>
        <td>${u.code || '—'}</td>
        <td>${u.phone || '—'}</td>
      </tr>`
    ).join('') || '<tr><td colspan="5" class="text-muted">لا يوجد مستخدمون</td></tr>';
  }

  async function createUser() {
    if (!can('users.manage') && currentUser.role !== 'admin') return toast('لا صلاحية', 'err');
    const name = (document.getElementById('nu-name')?.value || '').trim();
    const username = (document.getElementById('nu-user')?.value || '').trim();
    const password = document.getElementById('nu-pass')?.value || '';
    const role = document.getElementById('nu-role')?.value;
    const code = (document.getElementById('nu-code')?.value || '').trim();
    const phone = (document.getElementById('nu-phone')?.value || '').trim();
    if (!name || !username || !password || !role) return toast('أكمل الاسم واسم المستخدم وكلمة المرور والدور', 'err');
    if (password.length < 4) return toast('كلمة المرور يجب أن تكون 4 أحرف على الأقل', 'err');
    if (!/^[^\s]+$/.test(username)) return toast('اسم المستخدم لا يجب أن يحتوي على مسافات', 'err');
    if (window.DB && DB.isOnline()) {
      const res = await DB.createUser({ username, password, role, name, code: code || (role === 'student' ? username : undefined), phone });
      if (!res.ok) return toast(res.error || 'فشل الإنشاء على السحابة', 'err');
      toast('تم إنشاء المستخدم على السحابة');
      renderUsersMgmt();
      return;
    }
    const users = load('users', []);
    if (users.some(u => u.username === username)) return toast('اسم المستخدم موجود', 'err');
    users.push({ username, password, role, name, code: code || (role === 'student' ? username : undefined), phone, is_active: true, createdAt: new Date().toISOString() });
    save('users', users);
    toast('تم إنشاء المستخدم (محلي)');
    renderUsersMgmt();
  }

  function renderExportPrint() {
    const all = load('requests', []).filter(r => r.status !== 'rejected');
    document.getElementById('export-list').innerHTML = all.map(r => {
      const st = statusInfo(r);
      return `<label class="list-item" style="cursor:pointer">
        <div class="flex items-center gap-2">
          <input type="checkbox" class="exp-cb" value="${r.id}">
          <div><div class="fw-bold text-sm">${r.studentName} — ${r.formTitle}</div>
          <div class="text-xs text-muted">${r.studentCode}</div></div>
        </div>
        <span class="badge ${st.cls}">${st.label}</span>
      </label>`;
    }).join('') || '<div class="empty">لا طلبات</div>';
  }

  function exportPDF() {
    if (!can('export.pdf') && currentUser.role !== 'admin' && currentUser.role !== 'affairs') return toast('ليس لديك صلاحية التصدير', 'err');
    const ids = [...document.querySelectorAll('.exp-cb:checked')].map(c => c.value);
    if (!ids.length) return toast('اختر طلبات', 'err');
    const requests = load('requests', []).filter(r => ids.includes(r.id));
    const origin = location.origin + location.pathname.replace(/\/[^/]*$/, '/');
    const uniLogo = origin + 'assets/13-university-logo.png';
    const facLogo = origin + 'assets/8-faculty-logo.png';
    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const unit = (S.faculty && S.faculty.unitAr) || 'وحدة الإرشاد الأكاديمي والخدمات الطلابية';
    const uni = (S.faculty && S.faculty.universityAr) || 'جامعة سوهاج';
    const fac = (S.faculty && S.faculty.nameAr) || 'كلية العلوم';

    const statusAr = (st) => {
      const map = {
        pending_advisor: 'بانتظار المرشد', pending_coordinator: 'بانتظار المنسق',
        pending_manager: 'بانتظار مدير الوحدة', pending_vice: 'بانتظار الوكيل',
        pending_affairs: 'بانتظار شؤون الطلاب', executed: 'تم التنفيذ',
        approved: 'معتمد', rejected: 'مرفوض'
      };
      return map[st] || st || '—';
    };

    let body = '';
    requests.forEach((r, i) => {
      const courses = r.courses || [];
      const coursesAdd = courses.filter(c => !c.action || c.action === 'add' || c.action === 'تسجيل' || c.action === 'إضافة');
      const coursesDrop = courses.filter(c => c.action === 'drop' || c.action === 'حذف' || c.action === 'انسحاب');
      const otherCourses = courses.filter(c => !coursesAdd.includes(c) && !coursesDrop.includes(c));

      const row = (c) => `<tr>
        <td style="text-align:center;font-family:monospace;font-weight:700">${c.code || '—'}</td>
        <td>${c.name || '—'}</td>
        <td style="text-align:center">${c.hours != null ? c.hours : '—'}</td>
      </tr>`;

      let coursesHtml = '';
      if (coursesDrop.length) {
        coursesHtml += `<div class="sec-label">مقررات للحذف / الانسحاب</div>
          <table><thead><tr><th>كود المقرر</th><th>اسم المقرر</th><th>الساعات</th></tr></thead>
          <tbody>${coursesDrop.map(row).join('')}</tbody></table>`;
      }
      if (coursesAdd.length) {
        coursesHtml += `<div class="sec-label">مقررات للإضافة / التسجيل</div>
          <table><thead><tr><th>كود المقرر</th><th>اسم المقرر</th><th>الساعات</th></tr></thead>
          <tbody>${coursesAdd.map(row).join('')}</tbody></table>`;
      }
      if (otherCourses.length || (!coursesAdd.length && !coursesDrop.length)) {
        const list = otherCourses.length ? otherCourses : courses;
        coursesHtml += `<div class="sec-label">المقررات</div>
          <table><thead><tr><th>كود المقرر</th><th>اسم المقرر</th><th>الساعات</th></tr></thead>
          <tbody>${list.length ? list.map(row).join('') : '<tr><td colspan="3" style="text-align:center;color:#94a3b8">لا توجد مقررات مسجّلة في الطلب</td></tr>'}</tbody></table>`;
      }

      const notes = r.studentNotes || r.notes || '';
      const hist = (r.history || []).map(h =>
        `<div class="hist-line"><span class="hist-who">${h.by || ''} (${h.role || ''})</span>
         <span class="hist-act">${h.action === 'approve' ? 'اعتماد' : h.action === 'reject' ? 'رفض' : h.action === 'submit' ? 'تقديم' : h.action || ''}</span>
         <span class="hist-at">${h.at ? new Date(h.at).toLocaleString('ar-EG') : ''}</span>
         ${h.note ? `<div class="hist-note">${h.note}</div>` : ''}</div>`
      ).join('');

      body += `
      <section class="req">
        <div class="req-head">
          <div class="req-num">${i + 1}</div>
          <div class="req-title">${r.formTitle || 'طلب'}</div>
          <div class="req-status">${statusAr(r.status)}</div>
        </div>
        <div class="meta-grid">
          <div><span class="k">اسم الطالب</span><span class="v">${r.studentName || '—'}</span></div>
          <div><span class="k">كود الطالب</span><span class="v mono">${r.studentCode || '—'}</span></div>
          <div><span class="k">المستوى</span><span class="v">${r.level || '—'}</span></div>
          <div><span class="k">البرنامج</span><span class="v">${r.program || '—'}</span></div>
          <div><span class="k">العام الجامعي</span><span class="v">${r.year || '2026/2027'}</span></div>
          <div><span class="k">الفصل</span><span class="v">${r.semester || '—'}</span></div>
          <div><span class="k">تاريخ التقديم</span><span class="v">${r.createdAt ? new Date(r.createdAt).toLocaleString('ar-EG') : '—'}</span></div>
          <div><span class="k">رقم الطلب</span><span class="v mono">${r.id || '—'}</span></div>
        </div>
        ${notes ? `<div class="notes"><b>ملاحظات الطالب:</b> ${notes}</div>` : ''}
        ${coursesHtml}
        ${hist ? `<div class="sec-label">سجل الاعتمادات</div><div class="hist">${hist}</div>` : ''}
        <div class="sign-row">
          <div class="sign-box"><div class="sign-title">المرشد الأكاديمي</div><div class="sign-line"></div><div class="sign-sub">التوقيع / التاريخ</div></div>
          <div class="sign-box"><div class="sign-title">شؤون الطلاب</div><div class="sign-line"></div><div class="sign-sub">تم التنفيذ</div></div>
        </div>
      </section>`;
    });

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>طلبات للتنفيذ — شؤون الطلاب</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    direction: rtl; color: #0f172a; margin: 0; padding: 0;
    font-size: 12.5px; line-height: 1.5; background: #fff;
  }
  .sheet-header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 3px solid #0c1e36; padding-bottom: 12px; margin-bottom: 14px;
  }
  .sheet-header img { width: 68px; height: 68px; object-fit: contain; }
  .sheet-header .center { text-align: center; flex: 1; padding: 0 12px; }
  .sheet-header .uni { font-size: 15px; font-weight: 800; color: #0c1e36; margin: 0; }
  .sheet-header .fac { font-size: 13px; font-weight: 700; color: #0d9488; margin: 2px 0; }
  .sheet-header .unit { font-size: 11px; color: #475569; margin: 0; }
  .doc-title {
    text-align: center; background: #0c1e36; color: #fff;
    padding: 8px 12px; border-radius: 6px; font-size: 14px; font-weight: 800;
    margin-bottom: 8px; letter-spacing: .02em;
  }
  .doc-meta { text-align: center; font-size: 11px; color: #64748b; margin-bottom: 16px; }
  .req {
    border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px 14px;
    margin-bottom: 16px; page-break-inside: avoid; background: #fff;
  }
  .req-head {
    display: flex; align-items: center; gap: 10px;
    border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 10px;
  }
  .req-num {
    width: 28px; height: 28px; border-radius: 50%; background: #0c1e36; color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px;
  }
  .req-title { flex: 1; font-weight: 800; font-size: 13.5px; color: #0c1e36; }
  .req-status {
    background: #ecfeff; color: #0f766e; border: 1px solid #99f6e4;
    font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 999px;
  }
  .meta-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; margin-bottom: 10px;
  }
  .meta-grid .k { display: block; font-size: 10px; color: #94a3b8; font-weight: 600; }
  .meta-grid .v { font-weight: 700; color: #0f172a; font-size: 12px; }
  .meta-grid .mono { font-family: ui-monospace, Consolas, monospace; letter-spacing: .03em; }
  .notes {
    background: #f8fafc; border-right: 3px solid #0d9488; padding: 6px 10px;
    margin-bottom: 10px; font-size: 11.5px; border-radius: 0 4px 4px 0;
  }
  .sec-label {
    font-size: 11px; font-weight: 800; color: #0c1e36; margin: 10px 0 4px;
    padding-bottom: 2px; border-bottom: 1px dashed #cbd5e1;
  }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 11.5px; }
  th {
    background: #0c1e36; color: #fff; padding: 6px 8px; text-align: right; font-weight: 700;
  }
  td { border: 1px solid #e2e8f0; padding: 5px 8px; }
  tr:nth-child(even) td { background: #f8fafc; }
  .hist { font-size: 11px; }
  .hist-line { padding: 3px 0; border-bottom: 1px dotted #e2e8f0; }
  .hist-who { font-weight: 700; margin-left: 6px; }
  .hist-act { color: #0d9488; font-weight: 700; margin-left: 6px; }
  .hist-at { color: #94a3b8; font-size: 10px; }
  .hist-note { color: #475569; margin-top: 2px; padding-right: 8px; }
  .sign-row { display: flex; gap: 20px; margin-top: 16px; }
  .sign-box { flex: 1; text-align: center; }
  .sign-title { font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 28px; }
  .sign-line { border-bottom: 1px solid #94a3b8; margin: 0 12px 4px; }
  .sign-sub { font-size: 9px; color: #94a3b8; }
  .sheet-footer {
    margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0;
    text-align: center; font-size: 9.5px; color: #94a3b8;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .req { break-inside: avoid; }
  }
</style>
</head>
<body>
  <header class="sheet-header">
    <img src="${uniLogo}" alt="جامعة سوهاج" onerror="this.style.display='none'"/>
    <div class="center">
      <p class="uni">${uni}</p>
      <p class="fac">${fac}</p>
      <p class="unit">${unit}</p>
    </div>
    <img src="${facLogo}" alt="كلية العلوم" onerror="this.style.display='none'"/>
  </header>

  <div class="doc-title">طلبات للتنفيذ — إدارة شؤون الطلاب</div>
  <div class="doc-meta">تاريخ الطباعة: ${dateStr} — الساعة ${timeStr} · عدد الطلبات: ${requests.length}</div>

  ${body}

  <footer class="sheet-footer">
    نسخة معاينة داخلية مولّدة من المنصة — لا تُعد وثيقة معتمدة حتى إقرارها عبر القنوات الرسمية
  </footer>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) return toast('اسمح بالنوافذ المنبثقة للطباعة', 'err');
    w.document.write(html);
    w.document.close();
    // انتظر تحميل الشعارات ثم اطبع
    setTimeout(() => { try { w.focus(); w.print(); } catch(e) {} }, 600);
  }


    function renderServices() {
    const zad = (S.faculty && S.faculty.zadUrl) || 'http://zadsci.sohag-univ.edu.eg/Zad.aspx';
    document.getElementById('services-body').innerHTML = `
      <div class="grid-3">
        <a class="card" href="${zad}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
          <div class="card-body">
            <div class="fw-extrabold mb-1"><i class="fas fa-external-link-alt" style="color:var(--primary)"></i> منصة زاد</div>
            <div class="text-xs text-muted">التسجيل الأكاديمي الإلكتروني المعتمد</div>
          </div>
        </a>
        <div class="card" style="cursor:pointer" onclick="toast('سيتم رفع دليل الطالب (PDF) قريباً')">
          <div class="card-body">
            <div class="fw-extrabold mb-1"><i class="fas fa-book" style="color:var(--teal)"></i> دليل الطالب</div>
            <div class="text-xs text-muted">ملف PDF — يُضاف عند توفّره</div>
          </div>
        </div>
        <div class="card" style="cursor:pointer" onclick="toast('الساعات المكتبية: ارفع ملف Excel من لوحة الإدارة')">
          <div class="card-body">
            <div class="fw-extrabold mb-1"><i class="fas fa-clock" style="color:var(--navy)"></i> الساعات المكتبية</div>
            <div class="text-xs text-muted">جدول أعضاء هيئة التدريس</div>
          </div>
        </div>
        <div class="card" style="cursor:pointer" onclick="App.navigate('study-plan')">
          <div class="card-body">
            <div class="fw-extrabold mb-1"><i class="fas fa-sitemap" style="color:#7c3aed"></i> الخطط الدراسية</div>
            <div class="text-xs text-muted">الأقسام والبرامج والمقررات</div>
          </div>
        </div>
      </div>
      <div class="card mt-3"><div class="card-header"><span class="fw-bold">منسقو الإرشاد بالأقسام</span></div>
        <div class="card-body">
          ${(S.org.coordinators||[]).map(c => {
            const d = S.departments.find(x => x.id === c.dept);
            return `<div class="list-item" style="cursor:default"><div><b>${c.name}</b><div class="text-xs text-muted">${d?d.nameAr:c.dept}</div></div></div>`;
          }).join('')}
        </div>
      </div>`;
  }


  function renderNotifications() {
    updateNotifPermHint();
    updateNotifSoundControl();
    const list = myNotifs();
    const box = document.getElementById('notif-list');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i>لا توجد إشعارات حالياً</div>';
      return;
    }
    box.innerHTML = list.map(n => {
      const ico = n.type === 'success' ? 'ok' : n.type === 'error' ? 'err' : n.type === 'warn' ? 'warn' : '';
      const icon = n.type === 'success' ? 'fa-check-circle' : n.type === 'error' ? 'fa-times-circle' : n.type === 'warn' ? 'fa-exclamation-triangle' : 'fa-info-circle';
      return `<div class="notif-item ${n.read ? '' : 'unread'}">
        <div class="n-ico ${ico}"><i class="fas ${icon}"></i></div>
        <div style="flex:1">
          <div class="n-text">${n.title && n.title !== 'إشعار جديد' ? '<b>'+n.title+':</b> ' : ''}${n.text}</div>
          <div class="n-time">${n.at ? new Date(n.at).toLocaleString('ar-EG') : ''}</div>
        </div>
      </div>`;
    }).join('');
    // لا نعلّم الكل كمقروء تلقائياً — المستخدم يضغط الزر
    updateNotifBadge();
  }

  async function changePassword() {
    const cur = document.getElementById('pwd-cur').value;
    const nw = document.getElementById('pwd-new').value;
    const conf = document.getElementById('pwd-conf').value;
    if (!cur || !nw || !conf) return toast('أكمل جميع حقول كلمة المرور', 'err');
    if (nw.length < 4) return toast('كلمة المرور 4 أحرف على الأقل', 'err');
    if (nw !== conf) { document.getElementById('pwd-conf')?.setCustomValidity('كلمتا المرور غير متطابقتين'); document.getElementById('pwd-conf')?.reportValidity(); return toast('تأكيد كلمة المرور غير متطابق', 'err'); }
    document.getElementById('pwd-conf')?.setCustomValidity('');
    let okCur = false;
    if (window.DB && DB.isOnline()) {
      okCur = await DB.verifyPassword(currentUser.username, cur);
    } else {
      const users = load('users', []);
      const row = users.find(u => u.username === currentUser.username || u.code === currentUser.code);
      okCur = !!(row && row.password === cur);
    }
    if (!okCur) return toast('كلمة المرور الحالية خاطئة', 'err');
    if (window.DB && DB.isOnline()) {
      const res = await DB.changePassword(currentUser.username, nw);
      if (!res.ok) return toast(res.error || 'فشل التغيير', 'err');
    } else {
      const users = load('users', []);
      const idx = users.findIndex(u => u.username === currentUser.username || u.code === currentUser.code);
      if (idx < 0) return toast('المستخدم غير موجود محلياً', 'err');
      users[idx].password = nw;
      save('users', users);
    }
    /* لا نخزّن كلمة المرور في الجلسة */
    currentUser = saveSession(currentUser);
    toast('تم تغيير كلمة المرور');
    document.getElementById('pwd-cur').value = '';
    document.getElementById('pwd-new').value = '';
    document.getElementById('pwd-conf').value = '';
  }

  // ===== Landing =====
  function renderLanding() {
    const c = load('cms', {}) || {};
    const f = (S && S.faculty) || {};
    const set = (id, val) => { const el = document.getElementById(id); if (el && val != null && val !== '') el.textContent = val; };
    // العنوان الرئيسي مع تمييز «لكلية العلوم»
    const ht = document.getElementById('hero-title');
    if (ht) {
      if (c.heroTitle) {
        ht.textContent = c.heroTitle;
      } else {
        ht.innerHTML = 'المنصة الرقمية<br/><span class="accent">لكلية العلوم</span>';
      }
    }
    set('hero-sub', c.heroSubtitle || f.universityAr || 'جامعة سوهاج');
    set('hero-desc', c.heroDesc || 'خدمات إلكترونية للإرشاد الأكاديمي وشؤون الطلاب · خطط دراسية · نماذج أكاديمية · متابعة الطلبات في مكان واحد');
    set('portal-title', c.heroTitle || 'المنصة الرقمية لكلية العلوم');
    set('portal-sub', c.heroSubtitle || f.universityAr || 'جامعة سوهاج');
    set('portal-desc', c.heroDesc || 'بوابة موحدة للإرشاد والخدمات الطلابية');
    set('dean-name', (S.org && S.org.dean) || 'أ.د. حازم محمود علي المشنب');
  }

  // ===== Init =====
  if (window.DB) {
    const ok = DB.init();
    console.log(ok ? 'Supabase متصل' : 'وضع محلي/غير متصل');
  }
  initDB();
  if (window.FOS_MODE === 'local') ensureLocalDemoUsers();
  window.addEventListener('popstate', (e) => {
    const v = (e.state && e.state.view) || (location.hash || '').replace('#','');
    if (v && currentUser) navigate(v, false);
  });
  // خلفيات المباني بالتناوب
  (function campusSlide() {
    const bg = document.getElementById('hero-bg');
    if (!bg) return;
    let i = 1;
    const max = 4;
    setInterval(() => {
      i = i >= max ? 1 : i + 1;
      bg.style.opacity = '0';
      setTimeout(() => {
        bg.setAttribute('data-campus', String(i));
        bg.style.opacity = '1';
      }, 500);
    }, 9000);
  })();
  // ===== Roles Management UI =====
  function renderRolesMgmt() {
    if (!can('roles.manage') && currentUser.role !== 'admin') {
      document.getElementById('roles-list').innerHTML = '<div class="alert alert-warn">ليس لديك صلاحية إدارة الأدوار</div>';
      document.getElementById('role-editor').classList.add('hidden');
      return;
    }
    document.getElementById('role-editor').classList.add('hidden');
    const roles = loadRoles();
    const pagesCount = (window.FOS_RBAC && FOS_RBAC.pages) ? FOS_RBAC.pages.length : 0;
    document.getElementById('roles-list').innerHTML = `
      <div class="grid-3">
        ${roles.map(r => `
          <div class="card" style="border-top:3px solid ${r.color || 'var(--primary)'}">
            <div class="card-body">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <div class="fw-extrabold">${r.nameAr}</div>
                  <div class="text-xs text-muted">المعرّف: <code>${r.id}</code>${r.system ? ' · نظامي' : ''}</div>
                </div>
                <span class="badge" style="background:${r.color || '#64748b'}20;color:${r.color || '#64748b'}">${(r.pages||[]).length} صفحة</span>
              </div>
              <div class="text-xs text-muted mb-3">
                إجراءات مفعّلة: ${Object.values(r.actions||{}).filter(Boolean).length}
              </div>
              <div class="flex gap-2 flex-wrap">
                <button class="btn btn-sm btn-outline" onclick="App.openRoleEditor('${r.id}')"><i class="fas fa-edit"></i> تعديل</button>
                ${!r.system ? `<button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="App.deleteRole('${r.id}')"><i class="fas fa-trash"></i></button>` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>`;
  }

  function openRoleEditor(roleId) {
    const roles = loadRoles();
    const isNew = !roleId;
    const role = isNew
      ? { id: '', nameAr: '', system: false, color: '#475569', pages: [], actions: {} }
      : JSON.parse(JSON.stringify(roles.find(r => r.id === roleId) || {}));
    if (!isNew && !role.id) return toast('الدور غير موجود', 'err');

    const pages = (window.FOS_RBAC && FOS_RBAC.pages) || [];
    const actions = (window.FOS_RBAC && FOS_RBAC.actions) || [];
    const groups = {};
    pages.forEach(p => {
      if (!groups[p.group]) groups[p.group] = [];
      groups[p.group].push(p);
    });

    const ed = document.getElementById('role-editor');
    ed.classList.remove('hidden');
    ed.innerHTML = `
      <div class="card">
        <div class="card-header flex justify-between items-center">
          <span class="fw-bold">${isNew ? 'إنشاء دور جديد' : 'تعديل الدور: ' + role.nameAr}</span>
          <button class="btn btn-sm btn-ghost" onclick="document.getElementById('role-editor').classList.add('hidden')"><i class="fas fa-times"></i></button>
        </div>
        <div class="card-body">
          <div class="grid-3 mb-3">
            <div class="form-group">
              <label>اسم الدور (عربي) *</label>
              <input class="form-control" id="re-name" value="${role.nameAr || ''}" ${role.system && !isNew ? '' : ''}>
            </div>
            <div class="form-group">
              <label>المعرّف (إنجليزي) *</label>
              <input class="form-control" id="re-id" value="${role.id || ''}" ${role.system ? 'readonly' : ''} placeholder="مثال: lab_supervisor" pattern="[a-z0-9_]+">
            </div>
            <div class="form-group">
              <label>اللون</label>
              <input class="form-control" type="color" id="re-color" value="${role.color || '#475569'}" style="height:42px;padding:4px">
            </div>
          </div>

          <h4 class="h3 mb-2">الصفحات الظاهرة</h4>
          <p class="text-xs text-muted mb-2">إخفاء الصفحة = عدم ظهورها في القائمة ومنع فتحها</p>
          ${Object.keys(groups).map(g => `
            <div class="mb-3">
              <div class="fw-bold text-sm mb-1">${g}</div>
              <div class="grid-3">
                ${groups[g].map(pg => `
                  <label class="list-item" style="cursor:pointer;gap:8px">
                    <input type="checkbox" class="re-page" value="${pg.id}" ${(role.pages||[]).includes(pg.id)?'checked':''}>
                    <span class="text-sm">${pg.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          `).join('')}

          <h4 class="h3 mb-2 mt-3">صلاحيات الإجراءات</h4>
          <div class="grid-3 mb-3">
            ${actions.map(a => `
              <label class="list-item" style="cursor:pointer;gap:8px">
                <input type="checkbox" class="re-action" value="${a.id}" ${role.actions && role.actions[a.id] ? 'checked' : ''}>
                <span class="text-sm">${a.label}</span>
              </label>
            `).join('')}
          </div>

          <div class="flex gap-2">
            <button class="btn btn-primary" onclick="App.saveRoleEditor(${isNew?'true':'false'}, '${role.id || ''}')">
              <i class="fas fa-save"></i> حفظ
            </button>
            <button class="btn btn-outline" onclick="document.getElementById('role-editor').classList.add('hidden')">إلغاء</button>
          </div>
        </div>
      </div>`;
    ed.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function saveRoleEditor(isNew, oldId) {
    const nameAr = (document.getElementById('re-name').value || '').trim();
    let id = (document.getElementById('re-id').value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const color = document.getElementById('re-color').value;
    if (!nameAr || !id) return toast('الاسم والمعرّف مطلوبان', 'err');

    const pages = [...document.querySelectorAll('.re-page:checked')].map(el => el.value);
    const actions = {};
    (window.FOS_RBAC.actions || []).forEach(a => { actions[a.id] = false; });
    [...document.querySelectorAll('.re-action:checked')].forEach(el => { actions[el.value] = true; });

    const roles = loadRoles();
    if (isNew) {
      if (roles.some(r => r.id === id)) return toast('المعرّف مستخدم مسبقاً', 'err');
      roles.push({ id, nameAr, system: false, color, pages, actions });
    } else {
      const idx = roles.findIndex(r => r.id === oldId);
      if (idx < 0) return toast('الدور غير موجود', 'err');
      roles[idx] = {
        ...roles[idx],
        nameAr,
        id: roles[idx].system ? roles[idx].id : id,
        color,
        pages,
        actions
      };
    }
    saveRoles(roles);
    toast('تم حفظ الدور');
    renderRolesMgmt();
    if (currentUser) buildSidebar();
  }

  function deleteRole(roleId) {
    const roles = loadRoles();
    const role = roles.find(r => r.id === roleId);
    if (!role) return;
    if (role.system) return toast('لا يمكن حذف دور نظامي', 'err');
    const used = load('users', []).filter(u => u.role === roleId);
    if (used.length) return toast(`لا يمكن الحذف: ${used.length} مستخدم مرتبط بهذا الدور`, 'err');
    if (!confirm('حذف الدور «' + role.nameAr + '»؟')) return;
    saveRoles(roles.filter(r => r.id !== roleId));
    toast('تم الحذف');
    renderRolesMgmt();
  }


  async function getAcademicDataSnapshot() {
    if (window.DB && DB.isOnline()) {
      const [students, users, requests] = await Promise.all([DB.listStudents(), DB.listUsers(), DB.listApplications({})]);
      return { students: students || [], advisors: (users || []).filter(u => u.role === 'advisor' && u.is_active !== false), requests: requests || [] };
    }
    const users = load('users', []);
    return {
      students: users.filter(u => u.role === 'student'),
      advisors: users.filter(u => u.role === 'advisor' && u.is_active !== false),
      requests: load('requests', [])
    };
  }
  async function updateStudentAcademicData(code, patch) {
    if (!currentUser || currentUser.role !== 'admin') return { ok: false, error: 'هذه العملية متاحة لمدير النظام فقط.' };
    if (window.DB && DB.isOnline()) return DB.updateStudentAcademic(code, patch);
    const users = load('users', []);
    const student = users.find(u => u.role === 'student' && String(u.code || u.student_code || u.username) === String(code));
    if (!student) return { ok: false, error: 'الطالب غير موجود في المنصة.' };
    student.gpa = patch.gpa;
    if (patch.program !== undefined) student.program = patch.program;
    if (patch.dept !== undefined) student.dept = patch.dept;
    save('users', users);
    return { ok: true };
  }
  async function assignAdvisorAcademicData(code, username) {
    if (!currentUser || currentUser.role !== 'admin') return { ok: false, error: 'هذه العملية متاحة لمدير النظام فقط.' };
    if (window.DB && DB.isOnline()) return DB.setAssignment(code, username);
    const users = load('users', []);
    const student = users.find(u => u.role === 'student' && String(u.code || u.student_code || u.username) === String(code));
    const advisor = users.find(u => u.role === 'advisor' && String(u.username) === String(username) && u.is_active !== false);
    if (!student || !advisor) return { ok: false, error: 'الطالب أو حساب المرشد غير موجود.' };
    const assignments = load('assignments', {});
    assignments[code] = username;
    student.advisor = username;
    student.advisorUsername = username;
    save('assignments', assignments);
    save('users', users);
    return { ok: true };
  }
  async function updateStudentImportData(code, data) {
    if (!currentUser || currentUser.role !== 'admin') return { ok: false, error: 'هذه العملية متاحة لمدير النظام فقط.' };
    if (window.DB && DB.isOnline()) {
      if (typeof DB.updateStudentImport === 'function') return DB.updateStudentImport(code, data);
      return DB.updateStudentAcademic(code, { gpa: data.gpa, program: data.program, dept: data.dept });
    }
    const users = load('users', []);
    const student = users.find(u => u.role === 'student' && String(u.code || u.student_code || u.username) === String(code));
    if (!student) return { ok: false, error: 'الطالب غير موجود في المنصة.' };
    const fields = ['name','level','nationalId','completedHours','gpa','program','section','dept','academicYear','enrollmentYear','birthDate','enrollmentStatus','birthplace','nationality','advisor','advisorDept','gender','religion','mobile','phone','maritalStatus','address','studentStatus'];
    fields.forEach(key => { if (data[key] !== undefined && String(data[key]).trim() !== '') student[key] = data[key]; });
    student.updatedAt = new Date().toISOString();
    save('users', users);
    return { ok: true };
  }
  window.App = {
    showHome,
    showAuth,
    notifyUser,
    updateNotifBadge,
    markAllNotifsRead,
    openNotifications,
    requestNotifPermission,
    toggleNotifSound,
    testNotifSound,
    defaultView,
    spSetView,
    spDownloadPlanPDF,
    spDownloadGraphPDF,
    spCloseDetail,
    spShowCourse,
    spResetFilters,
    spOnFilter,
    createUser,
    renderRolesMgmt,
    canPage,
    can,
    deleteRole,
    saveRoleEditor,
    openRoleEditor,
    renderStudyCourses,
    fillStudyPrograms,
    onRegDeptChange,
    switchTab, handleLogin, handleRegister, logout, confirmLogout, cancelLogout, navigate, toggleNavGroup,
    openForm, addCourseRow, onTranscript, onAddDropTranscript, submitForm,
    academicRequestContinue, academicRequestAddRow, academicRequestRemoveRow, academicRequestUpdateTotals, academicRequestSubmit,
    toggleFormsCategory, addDropContinueFromInstructions, addDropBack,
    addAddDropRow: addDropRow, onAddDropCoursePick, removeAddDropRow,
    addDropValidateData, addDropValidateCourses, updateAddDropPrograms, submitAddDrop, saveAddDropDraft, printAddDropRequest, printAddDropCurrent,
    viewRequest, process, goBackDetail,
    addGPARow, updateGPAPreview, gpaSetMode, gpaExcelPick, gpaExcelApply, gpaExcelClear, gpaSelectSection, gpaSelectProgram, gpaAddTerm, gpaRemoveTerm, gpaTermChange, gpaDraftChange, gpaCommitCourse, gpaRemoveCourse, gpaAddAcademicYear, gpaRemoveAcademicYear,
    togglePeriod, assignOne, bulkAssign,
    changePassword, doStudentSearch, showStudentDetail, exportPDF,
    renderStaffInbox, renderDeanDashboard, getCurrentUser: () => currentUser,
    getCurrentView: () => currentView, getViewTitle: viewTitle, getRoleName: () => currentUser ? roleName(currentUser.role) : 'الرئيسية',
    getNavigationPages, getEnvironmentStatus,
    getAcademicDataSnapshot, updateStudentAcademicData, updateStudentImportData, assignAdvisorAcademicData
  };

  document.addEventListener('input', function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest('#adddrop-data-form')) {
      updateAddDropSummary();
      const form = document.getElementById('adddrop-data-form');
      if (form && addDropDraftKey) {
        try {
          const data = {
            accepted: !!(document.getElementById('ad-read-confirm') && document.getElementById('ad-read-confirm').checked),
            semester: document.getElementById('ad-semester')?.value || '',
            year: document.getElementById('ad-year')?.value || '',
            level: document.getElementById('ad-level')?.value || '', section: document.getElementById('ad-section')?.value || '', program: document.getElementById('ad-program')?.value || '',
            completedHours: document.getElementById('ad-completed-hours')?.value || '',
            registeredHours: document.getElementById('ad-registered-hours')?.value || '',
            phone: document.getElementById('ad-phone')?.value || '',
            notes: document.getElementById('ad-student-notes')?.value || '',
            drops: collectAddDropRows('drop'), adds: collectAddDropRows('add')
          };
          localStorage.setItem(addDropDraftKey, JSON.stringify(data));
        } catch (_) {}
      }
    }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest('#adddrop-data-form')) updateAddDropSummary();
  });

  updateLocalDemoUI();
  document.getElementById('login-form').onsubmit = handleLogin;
  document.getElementById('register-form').onsubmit = handleRegister;
  const regCodeInput = document.getElementById('reg-code');
  if (regCodeInput) regCodeInput.addEventListener('input', () => { regCodeInput.value = regCodeInput.value.replace(/\D/g, ''); });
  const loginCodeInput = document.getElementById('login-user');
  if (loginCodeInput) loginCodeInput.addEventListener('input', () => { if (/^\d/.test(loginCodeInput.value)) loginCodeInput.value = loginCodeInput.value.replace(/\D/g, ''); });
  const regPasswordInput = document.getElementById('reg-password');
  const regPasswordConfirm = document.getElementById('reg-password-confirm');
  function updatePasswordMatch() {
    if (!regPasswordInput || !regPasswordConfirm) return;
    const hint = document.getElementById('password-match-text');
    regPasswordConfirm.setCustomValidity('');
    if (!regPasswordConfirm.value) {
      hint.textContent = '';
      hint.className = 'password-match-text';
      regPasswordConfirm.classList.remove('is-match', 'is-mismatch');
    } else if (regPasswordInput.value === regPasswordConfirm.value) {
      hint.textContent = 'كلمتا المرور متطابقتان';
      hint.className = 'password-match-text is-match';
      regPasswordConfirm.classList.add('is-match');
      regPasswordConfirm.classList.remove('is-mismatch');
    } else {
      hint.textContent = 'كلمتا المرور غير متطابقتين';
      hint.className = 'password-match-text is-mismatch';
      regPasswordConfirm.classList.add('is-mismatch');
      regPasswordConfirm.classList.remove('is-match');
    }
  }
  if (regPasswordInput) regPasswordInput.addEventListener('input', () => { updatePasswordStrength(); updatePasswordMatch(); });
  if (regPasswordConfirm) regPasswordConfirm.addEventListener('input', updatePasswordMatch);
  document.getElementById('main-form').onsubmit = submitForm;
  document.getElementById('transcript-input').onchange = onTranscript;

  renderLanding();
  const session = load('session', null);
  if (session) {
    currentUser = saveSession(session); /* تنظيف كلمة المرور من جلسات قديمة */
    enterApp();
  }
  window.PortalShell?.init();
})();
