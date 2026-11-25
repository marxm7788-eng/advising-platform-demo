/* أعضاء هيئة التدريس (مصدر موحد) + النسخ الاحتياطي الكامل + دعم الموهوبين + الإشعارات */
(function () {
  'use strict';
  const X = window.AdvExt; if (!X) return;
  const { get, set, esc, me, pageHead, fmtDT, toast } = X;
  const FKEY = 'fos_v2_faculty_members';
  const DEGREES = ['معيد', 'مدرس مساعد', 'مدرس', 'أستاذ مساعد', 'أستاذ دكتور'];
  const UNIT_ROLES = { '': 'عضو هيئة تدريس', manager: 'مدير وحدة الإرشاد', coordinator: 'منسق الإرشاد بالقسم', team: 'عضو في فريق الوحدة' };
  const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const readF = () => { try { return JSON.parse(localStorage.getItem(FKEY) || '[]'); } catch (_) { return []; } };
  const writeF = rows => localStorage.setItem(FKEY, JSON.stringify(rows));
  const TITLE_RE = /^\s*(أ\.?\s*م\.?\s*د\.?|أ\.?\s*د\.?|م\.?\s*م\.?|د\.?|م\.?|أ\.?)\s*/;
  const bare = n => String(n || '').replace(TITLE_RE, '').replace(/\s+/g, ' ').trim();
  function detectDegree(name) {
    const n = String(name || '').trim();
    if (/^أ\.?\s*م\.?\s*د/.test(n)) return 'أستاذ مساعد';
    if (/^أ\.?\s*د/.test(n)) return 'أستاذ دكتور';
    if (/^م\.?\s*م/.test(n)) return 'مدرس مساعد';
    if (/^د\./.test(n) || /^د\s/.test(n)) return 'مدرس';
    if (/^م\./.test(n)) return 'معيد';
    return '';
  }
  const PREFIX = { 'أستاذ دكتور': 'أ.د.', 'أستاذ مساعد': 'أ.م.د.', 'مدرس': 'د.', 'مدرس مساعد': 'م.م.', 'معيد': 'م.' };
  const displayName = m => (PREFIX[m.degree] ? PREFIX[m.degree] + ' ' : '') + bare(m.name);
  const fid = () => 'fm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  let ready = false;

  async function ensureFaculty() {
    let rows = readF();
    if (!rows.length) {
      try { const j = await (await fetch('data/43-faculty-members.json')).json(); rows = (j.members || []); } catch (_) { rows = Array.isArray(window.FOS_FACULTY_MEMBERS) ? window.FOS_FACULTY_MEMBERS.slice() : []; }
      rows = rows.map(r => ({ ...r, accountStatus: 'no_account', advisorActive: false }));
    }
    let ch = false;
    rows.forEach(r => { if (!r.id) { r.id = fid(); ch = true; } if (r.degree == null) { r.degree = detectDegree(r.name); ch = true; } if (!r.officeHours) { r.officeHours = []; ch = true; } if (r.unitRole == null) { r.unitRole = ''; ch = true; } });
    // دمج فريق الوحدة والمنسقين من بيانات الكلية (مرة واحدة)
    if (!get('faculty_org_merged', false) && window.FOS_SEED) {
      const O = FOS_SEED.org || {}; const find = n => rows.find(r => bare(r.name) === bare(n));
      const merge = (name, role, dept) => { let m = find(name); if (!m) { m = { id: fid(), name, department: dept || '', degree: detectDegree(name), officeHours: [], accountStatus: 'no_account', advisorActive: false }; rows.push(m); } if (!m.unitRole) m.unitRole = role; if (!m.degree) m.degree = detectDegree(name); if (role === 'coordinator' && dept) m.deptKey = dept; };
      if (O.unitManager) merge(O.unitManager, 'manager');
      (O.unitTeam || []).forEach(t => merge(t.name, 'team', t.dept));
      (O.coordinators || []).forEach(c => { const d = (FOS_SEED.departments || []).find(x => x.id === c.dept); merge(c.name, 'coordinator', d ? d.nameAr : c.dept); const m = find(c.name); if (m) { m.unitRole = 'coordinator'; m.deptKey = c.dept; } });
      set('faculty_org_merged', true); ch = true;
    }
    if (ch || !readF().length) writeF(rows);
    ready = true;
    return rows;
  }

  const fstate = { q: '', dept: 'all', degree: 'all', role: 'all', sel: null };
  async function renderFaculty() {
    const v = document.getElementById('view-faculty-management');
    const rows = await ensureFaculty();
    const depts = [...new Set(rows.map(r => r.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
    const q = fstate.q.trim().toLocaleLowerCase('ar');
    const shown = rows.filter(r => (fstate.dept === 'all' || r.department === fstate.dept) && (fstate.degree === 'all' || r.degree === fstate.degree) && (fstate.role === 'all' || (r.unitRole || '') === fstate.role) && (!q || [r.name, r.department, r.email, r.phone].join(' ').toLocaleLowerCase('ar').includes(q)));
    const sel = rows.find(r => r.id === fstate.sel);
    const isAdmin = me().role === 'admin';
    v.innerHTML = pageHead('fa-users-gear', 'أعضاء هيئة التدريس', 'المصدر الوحيد لبيانات الأعضاء: أي تعديل هنا يظهر في كل أجزاء المنصة (منسقو الأقسام، الساعات المكتبية، حسابات المرشدين)', isAdmin ? '<button class="btn btn-primary btn-sm" onclick="AdvFaculty.addNew()"><i class="fas fa-user-plus"></i> إضافة عضو</button>' : '') + `
      <div class="adx-mini-stats mb-3"><div><b>${rows.length}</b><span>إجمالي الأعضاء</span></div>${DEGREES.slice().reverse().map(d => `<div><b>${rows.filter(r => r.degree === d).length}</b><span>${d}</span></div>`).join('')}</div>
      <div class="adx-filters"><input type="search" class="form-control" id="fm-q" placeholder="بحث بالاسم أو القسم أو البريد" value="${esc(fstate.q)}">
        <select class="form-control" id="fm-dept"><option value="all">كل الأقسام</option>${depts.map(d => `<option ${fstate.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
        <select class="form-control" id="fm-degree"><option value="all">كل الدرجات العلمية</option>${DEGREES.slice().reverse().map(d => `<option ${fstate.degree === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
        <select class="form-control" id="fm-role"><option value="all">كل الأدوار بالوحدة</option>${Object.entries(UNIT_ROLES).map(([k, l]) => `<option value="${k}" ${fstate.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${sel ? facultyEditor(sel, isAdmin) : ''}
      <div class="card"><div class="card-body table-wrap"><div class="text-xs text-muted mb-2">عرض ${shown.length} من ${rows.length}</div><table class="data"><thead><tr><th>الاسم</th><th>الدرجة العلمية</th><th>القسم</th><th>دور بالوحدة</th><th>الساعات المكتبية</th><th>الحساب</th></tr></thead><tbody>
      ${shown.slice(0, 150).map(r => `<tr class="adx-row" onclick="AdvFaculty.select('${esc(r.id)}')"><td><b>${esc(displayName(r))}</b></td><td>${r.degree ? `<span class="badge badge-blue">${esc(r.degree)}</span>` : '<span class="text-muted">غير محددة</span>'}</td><td>${esc(r.department || '—')}</td><td>${r.unitRole ? `<span class="badge badge-green">${UNIT_ROLES[r.unitRole]}</span>` : '—'}</td><td class="text-xs">${hoursText(r) || '—'}</td><td>${r.accountUsername ? '<span class="badge badge-green">مرشد نشط</span>' : '<span class="badge">بدون حساب</span>'}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    [['fm-q', 'q', 'input'], ['fm-dept', 'dept', 'change'], ['fm-degree', 'degree', 'change'], ['fm-role', 'role', 'change']].forEach(([id, k, ev]) => { const el = document.getElementById(id); el && el.addEventListener(ev, () => { fstate[k] = el.value; renderFaculty().then(() => { if (ev === 'input') { const n = document.getElementById(id); n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }); });
  }
  const hoursText = m => (m.officeHours || []).map(h => `${esc(h.day)} ${esc(h.from)}-${esc(h.to)}${h.place ? ' (' + esc(h.place) + ')' : ''}`).join('، ');
  function facultyEditor(m, isAdmin) {
    const dis = isAdmin ? '' : 'disabled';
    return `<div class="card mb-3"><div class="card-header flex items-center justify-between"><div class="fw-extrabold">${esc(displayName(m))}</div><button class="btn btn-sm btn-ghost" onclick="AdvFaculty.select(null)">إغلاق</button></div><div class="card-body">
      <div class="grid-3">
        <div class="form-group"><label>الاسم</label><input class="form-control" id="fe-name" value="${esc(bare(m.name))}" ${dis}></div>
        <div class="form-group"><label>الدرجة العلمية</label><select class="form-control" id="fe-degree" ${dis}><option value="">غير محددة</option>${DEGREES.map(d => `<option ${m.degree === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="form-group"><label>القسم</label><input class="form-control" id="fe-dept" value="${esc(m.department || '')}" ${dis}></div>
        <div class="form-group"><label>البريد</label><input class="form-control" id="fe-email" value="${esc(m.email || '')}" ${dis}></div>
        <div class="form-group"><label>الهاتف</label><input class="form-control" id="fe-phone" value="${esc(m.phone || '')}" ${dis}></div>
        <div class="form-group"><label>الدور بوحدة الإرشاد</label><select class="form-control" id="fe-role" ${dis}>${Object.entries(UNIT_ROLES).map(([k, l]) => `<option value="${k}" ${(m.unitRole || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="form-group"><label>وسائل التواصل (واتساب / رابط)</label><input class="form-control" id="fe-contact" value="${esc(m.contact || '')}" placeholder="يضيفها العضو لاحقًا" ${dis}></div>
      </div>
      <div class="fw-bold mb-2">الساعات المكتبية</div><div id="fe-hours">${(m.officeHours || []).map(hourRow).join('')}</div>
      ${isAdmin ? `<button class="btn btn-outline btn-sm mb-3" onclick="AdvFaculty.addHour()"><i class="fas fa-plus"></i> إضافة موعد</button><div class="flex gap-2 flex-wrap"><button class="btn btn-primary btn-sm" onclick="AdvFaculty.save()">حفظ البيانات</button>${m.accountUsername ? '' : `<button class="btn btn-outline btn-sm" onclick="AdvFaculty.makeAccount()"><i class="fas fa-user-plus"></i> إنشاء حساب مرشد</button>`}<button class="btn btn-danger btn-sm" onclick="AdvFaculty.remove()">حذف العضو</button></div>` : ''}
    </div></div>`;
  }
  const hourRow = h => `<div class="adx-hour"><select class="form-control fh-day">${DAYS.map(d => `<option ${h.day === d ? 'selected' : ''}>${d}</option>`).join('')}</select><input type="time" class="form-control fh-from" value="${esc(h.from || '10:00')}"><input type="time" class="form-control fh-to" value="${esc(h.to || '12:00')}"><input class="form-control fh-place" placeholder="المكان" value="${esc(h.place || '')}"><button class="btn btn-sm btn-ghost" onclick="this.parentNode.remove()"><i class="fas fa-trash"></i></button></div>`;
  function select(id) { fstate.sel = id; renderFaculty(); }
  function addHour() { document.getElementById('fe-hours').insertAdjacentHTML('beforeend', hourRow({})); }
  function addNew() { const rows = readF(); const m = { id: fid(), name: 'عضو جديد', department: '', degree: 'مدرس', officeHours: [], unitRole: '', accountStatus: 'no_account', advisorActive: false }; rows.unshift(m); writeF(rows); fstate.sel = m.id; renderFaculty(); }
  function save() {
    const rows = readF(); const m = rows.find(r => r.id === fstate.sel); if (!m) return;
    m.name = document.getElementById('fe-name').value.trim() || m.name; m.degree = document.getElementById('fe-degree').value; m.department = document.getElementById('fe-dept').value.trim();
    m.email = document.getElementById('fe-email').value.trim(); m.phone = document.getElementById('fe-phone').value.trim(); m.unitRole = document.getElementById('fe-role').value; m.contact = document.getElementById('fe-contact').value.trim();
    m.officeHours = [...document.querySelectorAll('#fe-hours .adx-hour')].map(r => ({ day: r.querySelector('.fh-day').value, from: r.querySelector('.fh-from').value, to: r.querySelector('.fh-to').value, place: r.querySelector('.fh-place').value.trim() })).filter(h => h.from && h.to);
    m.updatedAt = new Date().toISOString(); writeF(rows);
    const users = get('users', []); let uc = false;
    users.forEach(u => { if (u.facultyMemberId === m.id) { u.name = displayName(m); u.full_name = u.name; u.dept = m.department; u.email = m.email; u.phone = m.phone || u.phone; uc = true; } });
    if (uc) set('users', users);
    toast('تم حفظ بيانات العضو وتحديثها في كل المنصة'); renderFaculty();
  }
  function remove() {
    if (!confirm('حذف هذا العضو من القائمة؟')) return;
    writeF(readF().filter(r => r.id !== fstate.sel)); fstate.sel = null; renderFaculty();
  }
  function makeAccount() {
    const pw = prompt('اكتب كلمة المرور الأولية للمرشد (4 أحرف على الأقل)'); if (!pw) return; if (pw.length < 4) return toast('كلمة المرور قصيرة', 'err');
    const rows = readF(); const m = rows.find(r => r.id === fstate.sel); const users = get('users', []);
    const username = 'fac-' + String(rows.indexOf(m) + 1).padStart(3, '0');
    if (users.some(u => u.username === username)) return toast('يوجد حساب بهذا المعرف', 'err');
    users.push({ username, password: pw, role: 'advisor', name: displayName(m), full_name: displayName(m), dept: m.department, facultyMemberId: m.id, email: m.email || '', phone: m.phone || '', is_active: true, createdAt: new Date().toISOString() });
    set('users', users); m.accountUsername = username; m.accountStatus = 'active'; m.advisorActive = true; writeF(rows);
    toast('تم إنشاء الحساب: ' + username); renderFaculty();
  }
  function coordinatorsHtml() {
    const rows = readF().filter(r => r.unitRole === 'coordinator');
    if (!rows.length) return '<div class="text-muted text-sm">لا يوجد منسقون مسجلون</div>';
    const mgr = readF().filter(r => r.unitRole === 'manager');
    return mgr.map(m => `<div class="list-item" style="cursor:default"><div><b>${esc(displayName(m))}</b><div class="text-xs text-muted">مدير وحدة الإرشاد الأكاديمي${m.contact ? ' · ' + esc(m.contact) : ''}</div></div></div>`).join('') +
      rows.map(c => { const d = ((window.FOS_SEED && FOS_SEED.departments) || []).find(x => x.id === c.deptKey); return `<div class="list-item" style="cursor:default"><div><b>${esc(displayName(c))}</b><div class="text-xs text-muted">${esc(d ? d.nameAr : c.department || '')}${c.contact ? ' · ' + esc(c.contact) : ''}${c.phone ? ' · ' + esc(c.phone) : ''}</div></div></div>`; }).join('');
  }
  function showOfficeHours() {
    ensureFaculty().then(rows => {
      const withH = rows.filter(r => (r.officeHours || []).length);
      const bd = document.createElement('div'); bd.className = 'adx-overlay'; bd.onclick = e => { if (e.target === bd) bd.remove(); };
      bd.innerHTML = `<div class="adx-dialog card"><div class="card-header flex items-center justify-between"><div class="fw-extrabold">الساعات المكتبية لأعضاء هيئة التدريس</div><button class="btn btn-sm btn-ghost" onclick="this.closest('.adx-overlay').remove()"><i class="fas fa-times"></i></button></div><div class="card-body">
        <input type="search" class="form-control mb-3" id="oh-q" placeholder="ابحث بالاسم أو القسم">
        <div id="oh-list">${ohList(withH, '')}</div></div></div>`;
      document.body.appendChild(bd);
      bd.querySelector('#oh-q').addEventListener('input', e => { bd.querySelector('#oh-list').innerHTML = ohList(withH, e.target.value); });
    });
  }
  const ohList = (rows, q) => { q = q.trim().toLocaleLowerCase('ar'); const r = rows.filter(m => !q || [m.name, m.department].join(' ').toLocaleLowerCase('ar').includes(q)); return r.length ? r.map(m => `<div class="list-item" style="cursor:default"><div><b>${esc(displayName(m))}</b><div class="text-xs text-muted">${esc(m.department || '')}</div></div><div class="text-sm">${hoursText(m)}</div></div>`).join('') : '<div class="empty"><i class="fas fa-clock"></i>لم تُسجل ساعات مكتبية بعد. يضيفها مدير النظام من صفحة أعضاء هيئة التدريس.</div>'; };

  /* ========== النسخ الاحتياطي الكامل ========== */
  const DBN = 'fos-portal-attachments', STN = 'files';
  const isData = k => /^(fos_|fos-)/i.test(String(k || ''));
  const isSession = k => /(^|[-_])(session|auth|token)([-_.]|$)/i.test(String(k || '')) || /supabase/i.test(String(k || ''));
  const openDb = () => new Promise((res, rej) => { if (!('indexedDB' in window)) return rej(new Error('no idb')); const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STN)) r.result.createObjectStore(STN); }; r.onerror = () => rej(r.error); r.onsuccess = () => res(r.result); });
  async function readAtt() { try { const db = await openDb(); return await new Promise((res, rej) => { const rows = []; const tx = db.transaction(STN, 'readonly'); const rq = tx.objectStore(STN).openCursor(); rq.onsuccess = () => { const c = rq.result; if (!c) return; rows.push({ key: c.key, value: c.value }); c.continue(); }; tx.oncomplete = () => { db.close(); res(rows); }; tx.onerror = () => { db.close(); rej(tx.error); }; }); } catch (_) { return []; } }
  async function writeAtt(rows) { try { const db = await openDb(); await new Promise((res, rej) => { const tx = db.transaction(STN, 'readwrite'); const st = tx.objectStore(STN); st.clear(); rows.forEach(r => st.put(r.value, r.key)); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => { db.close(); rej(tx.error); }; }); } catch (e) { if (rows.length) throw e; } }
  const p2 = n => String(n).padStart(2, '0');
  function defaultBackupName() {
    const c = get('terms', null) || { current: { year: '2026/2027', term: 'first' } };
    const T = { first: 'الترم-الأول', second: 'الترم-الثاني', summer: 'فصل-الصيف' };
    const d = new Date();
    return `نسخة-المنصة-${c.current.year.replace('/', '-')}-${T[c.current.term] || c.current.term}-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}-${p2(d.getMinutes())}`;
  }
  let pendingRestore = null;
  function renderBackup() {
    const v = document.getElementById('view-local-backup');
    v.innerHTML = pageHead('fa-box-archive', 'نسخ البيانات واستعادتها', 'نسخة كاملة لكل بيانات المنصة في ملف واحد، وترفع الملف فتُستعاد كل البيانات') + `
      <div class="grid-2">
        <div class="card"><div class="card-header"><div class="fw-extrabold"><i class="fas fa-download"></i> إنشاء نسخة كاملة</div></div><div class="card-body">
          <div class="text-sm text-muted mb-3">تشمل المستخدمين والطلبات والترمات والفترات وأعضاء هيئة التدريس والرسائل والإشعارات والمرفقات وكل الإعدادات.</div>
          <div class="form-group"><label>اسم الملف</label><input class="form-control" id="bk-name" value="${esc(defaultBackupName())}"></div>
          <button class="btn btn-primary" id="bk-go" onclick="AdvBackup.exportAll()"><i class="fas fa-file-export"></i> إنشاء النسخة وتنزيلها</button></div></div>
        <div class="card"><div class="card-header"><div class="fw-extrabold"><i class="fas fa-upload"></i> استعادة نسخة</div></div><div class="card-body">
          <div class="alert alert-warn mb-3"><i class="fas fa-triangle-exclamation"></i> الاستعادة تستبدل كل بيانات المنصة الحالية بما في النسخة.</div>
          <div class="form-group"><label>ملف النسخة</label><input type="file" class="form-control" id="bk-file" accept=".json,application/json" onchange="AdvBackup.pick(event)"></div>
          <div id="bk-preview" class="text-sm mb-3"></div>
          <button class="btn btn-danger" id="bk-restore" disabled onclick="AdvBackup.restore()"><i class="fas fa-rotate-left"></i> استعادة كل البيانات</button></div></div>
      </div><div id="bk-status" class="mt-3"></div>`;
  }
  const status = (m, k) => { const el = document.getElementById('bk-status'); if (el) el.innerHTML = `<div class="alert alert-${k === 'err' ? 'danger' : k === 'ok' ? 'success' : 'info'}">${esc(m)}</div>`; };
  async function exportAll() {
    const btn = document.getElementById('bk-go'); btn.disabled = true; status('جارٍ تجهيز النسخة…');
    try {
      const entries = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (isData(k) && !isSession(k)) entries.push([k, localStorage.getItem(k)]); }
      const att = await readAtt();
      const t = get('terms', null);
      const payload = { format: 'fos-portal-backup', version: 2, application: 'Faculty of Science Portal — Sohag University', createdAt: new Date().toISOString(), term: t ? t.current : null, localStorage: entries, attachments: att };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json;charset=utf-8' });
      let name = (document.getElementById('bk-name').value.trim() || defaultBackupName()).replace(/[\\/:*?"<>|]/g, '-');
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      status(`تم إنشاء النسخة: ${entries.length} سجل بيانات و${att.length} مرفق (${(blob.size / 1024).toFixed(0)} ك.ب).`, 'ok');
    } catch (e) { status(e.message || 'تعذر إنشاء النسخة', 'err'); } finally { btn.disabled = false; }
  }
  async function pick(ev) {
    const f = ev.target.files && ev.target.files[0]; pendingRestore = null; document.getElementById('bk-restore').disabled = true; if (!f) return;
    try {
      const p = JSON.parse(await f.text());
      if (p.format !== 'fos-portal-backup' || !Array.isArray(p.localStorage)) throw new Error('هذا الملف ليس نسخة صالحة من المنصة');
      if (p.localStorage.some(e => !Array.isArray(e) || typeof e[0] !== 'string' || !isData(e[0]))) throw new Error('الملف يحتوي على سجلات غير صالحة');
      pendingRestore = p;
      const users = (() => { try { return JSON.parse((p.localStorage.find(e => e[0] === 'fos_v2_users') || [0, '[]'])[1]).length; } catch (_) { return 0; } })();
      document.getElementById('bk-preview').innerHTML = `<div class="alert alert-info">نسخة سليمة بتاريخ <b>${esc(fmtDT(p.createdAt))}</b>${p.term ? ' · ' + esc(X.termLabel(p.term.year + '|' + p.term.term)) : ''}<br>${p.localStorage.length} سجل بيانات · ${(p.attachments || []).length} مرفق · ${users} مستخدم</div>`;
      document.getElementById('bk-restore').disabled = false;
    } catch (e) { document.getElementById('bk-preview').innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; }
  }
  async function restore() {
    if (!pendingRestore || !confirm('سيتم استبدال كل بيانات المنصة الحالية بالنسخة المختارة. متابعة؟')) return;
    const old = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (isData(k)) old.push([k, localStorage.getItem(k)]); }
    const oldAtt = await readAtt();
    try {
      old.forEach(([k]) => localStorage.removeItem(k));
      pendingRestore.localStorage.forEach(([k, v]) => localStorage.setItem(k, v));
      await writeAtt(pendingRestore.attachments || []);
      status('اكتملت الاستعادة. سيُعاد فتح المنصة الآن.', 'ok'); setTimeout(() => location.reload(), 1000);
    } catch (e) {
      try { old.forEach(([k, v]) => localStorage.setItem(k, v)); await writeAtt(oldAtt); } catch (_) {}
      status('تعذرت الاستعادة وأُعيدت البيانات السابقة: ' + (e.message || ''), 'err');
    }
  }

  /* ========== الإشعارات ========== */
  const nState = { f: 'all' };
  function myNotifs() { const u = me(); const keys = [String(u.username), String(u.code || '')].filter(Boolean); return (get('notifications', []) || []).filter(n => keys.includes(String(n.to))); }
  function renderNotifs() {
    const v = document.getElementById('view-notifications');
    const u = me();
    if (!document.getElementById('adx-tone')) {
      const hint = document.getElementById('notif-sound-hint');
      const box = document.createElement('div'); box.id = 'adx-tone'; box.className = 'adx-tone card mb-3';
      box.innerHTML = `<div class="card-body flex items-center gap-2 flex-wrap"><b><i class="fas fa-music"></i> نغمة الإشعار</b><select class="form-control" id="tone-sel" style="width:auto"><option value="chime">رنين هادئ</option><option value="bell">جرس</option><option value="drop">قطرة</option><option value="soft">نغمة ناعمة</option></select><button class="btn btn-sm btn-outline" onclick="AdvNotif.test()"><i class="fas fa-play"></i> جرّب</button></div>`;
      hint.parentNode.insertBefore(box, hint);
      const sel = box.querySelector('select'); sel.value = get('notification-tone', 'chime');
      sel.addEventListener('change', () => { set('notification-tone', sel.value); App.playNotifSound(true); });
    }
    App.renderNotifications();
    const list = myNotifs().filter(n => nState.f === 'all' || !n.read);
    const box = document.getElementById('notif-list');
    const ico = t => t === 'success' ? ['ok', 'fa-check-circle'] : t === 'error' ? ['err', 'fa-times-circle'] : t === 'warn' ? ['warn', 'fa-exclamation-triangle'] : ['', 'fa-info-circle'];
    box.innerHTML = `<div class="adx-tabs mb-3"><button class="btn btn-sm ${nState.f === 'all' ? 'btn-primary' : 'btn-outline'}" onclick="AdvNotif.filter('all')">الكل (${myNotifs().length})</button><button class="btn btn-sm ${nState.f === 'unread' ? 'btn-primary' : 'btn-outline'}" onclick="AdvNotif.filter('unread')">غير المقروءة (${myNotifs().filter(n => !n.read).length})</button><button class="btn btn-sm btn-ghost" onclick="AdvNotif.clearRead()"><i class="fas fa-trash"></i> حذف المقروء</button></div>` +
      (list.length ? list.map(n => { const [c, i] = ico(n.type); return `<div class="notif-item ${n.read ? '' : 'unread'}" style="cursor:pointer" onclick="AdvNotif.open('${esc(n.id)}')"><div class="n-ico ${c}"><i class="fas ${i}"></i></div><div style="flex:1"><div class="n-text">${n.title && n.title !== 'إشعار جديد' ? '<b>' + esc(n.title) + ':</b> ' : ''}${esc(n.text)}</div><div class="n-time">${esc(fmtDT(n.at))}</div></div>${n.read ? '' : '<span class="adx-dot"></span>'}</div>`; }).join('') : '<div class="empty-state"><i class="fas fa-bell-slash"></i>لا توجد إشعارات</div>');
  }
  const AdvNotif = {
    test() { App.playNotifSound(true); },
    filter(f) { nState.f = f; renderNotifs(); },
    open(id) { const all = get('notifications', []); const n = all.find(x => x.id === id); if (!n) return; n.read = true; set('notifications', all); App.updateNotifBadge(); if (n.link && n.link !== 'notifications') App.navigate(n.link); else renderNotifs(); },
    clearRead() { const u = me(); const keys = [String(u.username), String(u.code || '')]; set('notifications', (get('notifications', []) || []).filter(n => !(keys.includes(String(n.to)) && n.read))); App.updateNotifBadge(); renderNotifs(); }
  };

  /* ========== دعم الموهوبين: توضيح وقيمة وإضافات ========== */
  const TOPPS = ['دورة تدريبية', 'ورشة عمل', 'مسابقة', 'فرصة تدريب', 'معرض أو فعالية'];
  const IDEA_ST = { new: ['جديدة', 'amber'], review: ['قيد التقييم', 'blue'], accepted: ['مقبولة', 'green'], declined: ['غير مناسبة حاليًا', 'gray'] };
  function talentIntro() {
    const fields = ['البحث العلمي', 'المشروعات البحثية', 'الابتكار والاختراع', 'البرمجة وتطوير التطبيقات', 'الذكاء الاصطناعي', 'التكنولوجيا والمهارات الرقمية', 'الرسم والفنون التشكيلية', 'الأعمال اليدوية والخزف'];
    return `<div class="adx-talent" id="adx-talent-intro">
      <div class="card mb-3"><div class="card-body"><div class="fw-extrabold mb-2"><i class="fas fa-circle-question"></i> ما هو برنامج دعم الموهوبين؟</div>
        <p class="mb-2">برنامج تابع لوحدة الإرشاد الأكاديمي والخدمات الطلابية بكلية العلوم، يكتشف الطلاب أصحاب المواهب العلمية والتقنية والفنية، ويقدم لهم رعاية وتدريبًا وإشرافًا حتى تتحول موهبتهم إلى إنجاز يظهر في سجلهم الجامعي.</p></div></div>
      <div class="grid-3 mb-3">
        <div class="card"><div class="card-body"><div class="fw-extrabold mb-1"><i class="fas fa-bullseye" style="color:var(--teal)"></i> دوره في الكلية</div><ul class="adx-list"><li>اكتشاف الموهوبين مبكرًا بدل ضياعهم وسط الأعداد الكبيرة</li><li>ربط كل موهوب بمرشد ومشرف يتابع تطوره</li><li>تمثيل الكلية في المسابقات والمعارض والمؤتمرات الطلابية</li></ul></div></div>
        <div class="card"><div class="card-body"><div class="fw-extrabold mb-1"><i class="fas fa-gem" style="color:var(--teal)"></i> ماذا تكسب منه؟</div><ul class="adx-list"><li>دورات وورش مجانية في مجال موهبتك</li><li>إشراف أكاديمي وبحثي على فكرتك أو مشروعك</li><li>فرص مسابقات وتدريب، وإثبات رسمي للمشاركة في ملفك</li></ul></div></div>
        <div class="card"><div class="card-body"><div class="fw-extrabold mb-1"><i class="fas fa-route" style="color:var(--teal)"></i> خطوات الاستفادة</div><ol class="adx-list"><li>سجّل بياناتك ومجال موهبتك</li><li>مراجعة الطلب من وحدة الإرشاد</li><li>استكمال البيانات أو مقابلة تقييم</li><li>القبول وبدء خطة الرعاية</li><li>المشاركة في الفرص المنشورة</li></ol></div></div>
      </div>
      <div class="card mb-3"><div class="card-body"><div class="fw-extrabold mb-2">مجالات الموهبة المقبولة</div><div class="adx-chips">${fields.map(f => `<span class="adx-chip">${f}</span>`).join('')}<span class="adx-chip">مجال آخر تحدده بنفسك</span></div></div></div>
    </div>`;
  }
  function oppsHtml(canEdit) {
    const opps = (get('talent_opps', []) || []).sort((a, b) => new Date(b.at) - new Date(a.at));
    return `<div class="card mb-3" id="adx-opps"><div class="card-header"><div class="fw-extrabold"><i class="fas fa-calendar-check"></i> الأنشطة والفرص المتاحة</div></div><div class="card-body">
      ${canEdit ? `<div class="grid-3 mb-3"><div class="form-group"><label>العنوان</label><input class="form-control" id="to-title"></div><div class="form-group"><label>النوع</label><select class="form-control" id="to-type">${TOPPS.map(t => `<option>${t}</option>`).join('')}</select></div><div class="form-group"><label>الموعد</label><input class="form-control" id="to-date" type="date"></div></div><div class="form-group"><label>التفاصيل</label><textarea class="form-control" id="to-desc" rows="2"></textarea></div><button class="btn btn-primary btn-sm mb-3" onclick="AdvTalent.addOpp()"><i class="fas fa-bullhorn"></i> نشر للطلاب</button>` : ''}
      ${opps.length ? opps.map(o => `<div class="adx-line"><span><span class="badge badge-blue">${esc(o.type)}</span> <b>${esc(o.title)}</b>${o.date ? ` <span class="text-xs text-muted">${esc(X.fmtDate(o.date))}</span>` : ''}<div class="text-sm text-muted">${esc(o.desc || '')}</div></span>${canEdit ? `<button class="btn btn-sm btn-ghost" onclick="AdvTalent.delOpp('${esc(o.id)}')"><i class="fas fa-trash"></i></button>` : ''}</div>`).join('') : '<div class="text-muted text-sm">لا توجد فرص منشورة حاليًا. ستظهر هنا فور نشرها من إدارة البرنامج.</div>'}</div></div>`;
  }
  function ideasStudent() {
    const u = me(); const code = u.code || u.username;
    const mine = (get('talent_ideas', []) || []).filter(i => i.studentCode === code).sort((a, b) => new Date(b.at) - new Date(a.at));
    return `<div class="card mb-3" id="adx-ideas"><div class="card-header"><div class="fw-extrabold"><i class="fas fa-lightbulb"></i> بنك الأفكار والمشروعات</div></div><div class="card-body">
      <div class="text-sm text-muted mb-3">شارك فكرة أو مشروعًا في مجال موهبتك. تُقيّمها إدارة البرنامج وترد عليك برأيها وما يمكن تقديمه من دعم.</div>
      <div class="form-group"><label>عنوان الفكرة</label><input class="form-control" id="ti-title" maxlength="100"></div><div class="form-group"><label>وصف مختصر</label><textarea class="form-control" id="ti-desc" rows="3" placeholder="ما الفكرة؟ وما المشكلة التي تحلها؟ وما الدعم الذي تحتاجه؟"></textarea></div>
      <button class="btn btn-primary btn-sm" onclick="AdvTalent.sendIdea()"><i class="fas fa-paper-plane"></i> إرسال الفكرة</button>
      ${mine.length ? '<div class="mt-3">' + mine.map(i => `<div class="adx-note"><div class="flex justify-between"><b>${esc(i.title)}</b><span class="badge badge-${IDEA_ST[i.status][1] === 'gray' ? '' : IDEA_ST[i.status][1]}">${IDEA_ST[i.status][0]}</span></div><div class="text-sm">${esc(i.desc)}</div>${i.feedback ? `<div class="alert alert-info mt-2"><b>رد الإدارة:</b> ${esc(i.feedback)}</div>` : ''}</div>`).join('') + '</div>' : ''}</div></div>`;
  }
  function adminTalentExtra() {
    const ideas = (get('talent_ideas', []) || []).sort((a, b) => new Date(b.at) - new Date(a.at));
    const apps = get('talent_applications', []) || [];
    return `<div id="adx-talent-admin">
      <div class="adx-mini-stats mb-3 mt-3"><div><b>${apps.length}</b><span>تسجيلات الطلاب</span></div><div><b>${apps.filter(a => a.status === 'accepted').length}</b><span>مقبولون</span></div><div><b>${ideas.length}</b><span>أفكار مقدمة</span></div><div><b>${(get('talent_opps', []) || []).length}</b><span>فرص منشورة</span></div></div>
      ${oppsHtml(true)}
      <div class="card mb-3"><div class="card-header"><div class="fw-extrabold"><i class="fas fa-lightbulb"></i> الأفكار والمشروعات المقدمة</div></div><div class="card-body">${ideas.length ? ideas.map(i => `<div class="adx-note"><div class="flex justify-between flex-wrap gap-2"><span><b>${esc(i.title)}</b> <span class="text-xs text-muted">${esc(i.studentName)} · ${esc(i.studentCode)} · ${esc(fmtDT(i.at))}</span></span>
        <select class="form-control" style="width:auto" onchange="AdvTalent.ideaStatus('${esc(i.id)}',this.value)">${Object.entries(IDEA_ST).map(([k, [l]]) => `<option value="${k}" ${i.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="text-sm">${esc(i.desc)}</div>
        <div class="flex gap-2 mt-2"><input class="form-control" id="if-${esc(i.id)}" placeholder="رد أو ملاحظة للطالب" value="${esc(i.feedback || '')}"><button class="btn btn-sm btn-primary" onclick="AdvTalent.ideaReply('${esc(i.id)}')">حفظ الرد</button></div></div>`).join('') : '<div class="text-muted text-sm">لا توجد أفكار بعد</div>'}</div></div></div>`;
  }
  const AdvTalent = {
    addOpp() { const t = document.getElementById('to-title').value.trim(); if (!t) return toast('اكتب عنوان الفرصة', 'err'); const o = get('talent_opps', []); o.unshift({ id: 'TO-' + Date.now().toString(36), title: t, type: document.getElementById('to-type').value, date: document.getElementById('to-date').value, desc: document.getElementById('to-desc').value.trim(), at: new Date().toISOString() }); set('talent_opps', o); (get('users', []) || []).filter(u => u.role === 'student').forEach(u => App.notifyUser(u.code || u.username, 'فرصة جديدة في برنامج دعم الموهوبين: ' + t, { title: 'دعم الموهوبين', type: 'info', link: 'talent-program' })); toast('تم النشر'); App.navigate(App.getCurrentView()); },
    delOpp(id) { set('talent_opps', (get('talent_opps', []) || []).filter(o => o.id !== id)); App.navigate(App.getCurrentView()); },
    sendIdea() { const t = document.getElementById('ti-title').value.trim(), d = document.getElementById('ti-desc').value.trim(); if (!t || d.length < 10) return toast('اكتب عنوانًا ووصفًا لا يقل عن 10 أحرف', 'err'); const u = me(); const l = get('talent_ideas', []); l.unshift({ id: 'TI-' + Date.now().toString(36), studentCode: u.code || u.username, studentName: u.name, title: t, desc: d, status: 'new', at: new Date().toISOString() }); set('talent_ideas', l); toast('تم إرسال فكرتك'); App.navigate('talent-program'); },
    ideaStatus(id, st) { const l = get('talent_ideas', []); const i = l.find(x => x.id === id); if (!i) return; i.status = st; set('talent_ideas', l); App.notifyUser(i.studentCode, `تحديث فكرتك (${i.title}): ${IDEA_ST[st][0]}`, { title: 'دعم الموهوبين', type: 'info', link: 'talent-program' }); toast('تم التحديث'); },
    ideaReply(id) { const l = get('talent_ideas', []); const i = l.find(x => x.id === id); if (!i) return; i.feedback = document.getElementById('if-' + id).value.trim(); set('talent_ideas', l); App.notifyUser(i.studentCode, `رد على فكرتك (${i.title})`, { title: 'دعم الموهوبين', type: 'info', link: 'talent-program' }); toast('تم حفظ الرد'); }
  };
  function wrapTalent() {
    const T = window.TalentProgram; if (!T || T._adx) return; T._adx = true;
    const rs = T.renderStudent, ra = T.renderAdmin;
    T.renderStudent = async function () {
      const r = await rs.apply(this, arguments);
      const root = document.getElementById('talent-program-root'); if (!root) return r;
      if (me().role === 'student') {
        const shell = root.querySelector('.talent-shell');
        root.querySelector('#adx-talent-intro')?.remove(); root.querySelector('#adx-opps')?.remove(); root.querySelector('#adx-ideas')?.remove();
        const wrap = document.createElement('div'); wrap.innerHTML = oppsHtml(false) + ideasStudent();
        if (shell) shell.insertAdjacentHTML('afterend', talentIntro());
        root.appendChild(wrap);
        const dis = root.querySelector('.talent-action[disabled]'); if (dis) { dis.disabled = false; dis.removeAttribute('title'); dis.onclick = () => document.getElementById('adx-ideas').scrollIntoView({ behavior: 'smooth' }); dis.querySelector('small') && (dis.querySelector('small').textContent = 'شارك فكرتك وسيقيّمها فريق البرنامج'); }
      } else if (me().role === 'admin') { root.querySelector('#adx-talent-admin')?.remove(); root.insertAdjacentHTML('beforeend', adminTalentExtra()); }
      return r;
    };
    T.renderAdmin = async function () {
      const r = await ra.apply(this, arguments);
      const root = document.getElementById('talent-admin-root'); if (root) { root.querySelector('#adx-talent-admin')?.remove(); root.insertAdjacentHTML('beforeend', adminTalentExtra()); }
      return r;
    };
  }

  /* ========== ربط ========== */
  wrapTalent();
  ensureFaculty().catch(() => {});
  Object.assign(X.renderers, { 'faculty-management': renderFaculty, 'local-backup': renderBackup, notifications: renderNotifs });
  window.AdvFaculty = { all: readF, select, addHour, addNew, save, remove, makeAccount, coordinatorsHtml, showOfficeHours, displayName, degrees: DEGREES };
  window.AdvBackup = { exportAll, pick, restore };
  window.AdvNotif = AdvNotif;
  window.AdvTalent = AdvTalent;
})();
