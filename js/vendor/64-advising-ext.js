/* وحدة الإرشاد الأكاديمي والخدمات الطلابية: الترمات، الفترات، صندوق الطلبات، لوحة العميد، البحث عن مستخدم، دعم المتعثرين، استمع للطلاب */
(function () {
  'use strict';
  const P = 'fos_v2_';
  const get = (k, d) => { try { const v = localStorage.getItem(P + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } };
  const set = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const me = () => (window.App && App.getCurrentUser && App.getCurrentUser()) || null;
  const toast = (m, t) => { try { App.toast(m, t); } catch (_) {} };
  const fmtDate = v => { try { return v ? new Date(v).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; } catch (_) { return '—'; } };
  const fmtDT = v => { try { return v ? new Date(v).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'; } catch (_) { return '—'; } };
  const isAdminLike = () => ['admin', 'dean'].includes(me() && me().role);
  const WF = () => (window.FOS_SEED && FOS_SEED.workflow) || [];
  const BADGE = { green: 'badge badge-green', red: 'badge badge-red', blue: 'badge badge-blue', amber: 'badge badge-amber', gray: 'badge' };
  const ROLE_LABEL = { student: 'طالب', advisor: 'مرشد أكاديمي', coordinator: 'منسق الإرشاد بالقسم', manager: 'مدير وحدة الإرشاد', vice: 'وكيل الكلية', affairs: 'شؤون الطلاب', dean: 'عميد الكلية', admin: 'مدير النظام' };
  const roleLabel = id => { try { return App.roleName(id); } catch (_) { return ROLE_LABEL[id] || id; } };

  function ensureView(id) {
    let v = document.getElementById('view-' + id);
    if (!v) {
      const ref = document.getElementById('view-students-mgmt');
      v = document.createElement('div');
      v.id = 'view-' + id; v.className = 'view hidden';
      ref.parentNode.appendChild(v);
    }
    return v;
  }
  function pageHead(icon, title, sub, actions) {
    return `<div class="adx-head"><div class="adx-head-ico"><i class="fas ${icon}"></i></div><div class="adx-head-txt"><div class="fw-extrabold">${title}</div><div class="text-xs text-muted">${sub || ''}</div></div>${actions ? `<div class="adx-head-act">${actions}</div>` : ''}</div>`;
  }

  /* ========== الترمات ========== */
  const TERMS = { first: 'الترم الأول', second: 'الترم الثاني', summer: 'فصل الصيف' };
  const TERM_ORDER = ['first', 'second', 'summer'];
  function termsState() {
    let t = get('terms', null);
    if (!t || !t.current) {
      t = { current: { year: '2026/2027', term: 'first', openedAt: new Date(0).toISOString(), openedBy: '' }, history: [] };
      set('terms', t);
    }
    return t;
  }
  const termKey = (y, t) => y + '|' + t;
  const termLabel = key => { const [y, t] = String(key || '').split('|'); return y && TERMS[t] ? `${TERMS[t]} ${y}` : '—'; };
  function currentTermKey() { const c = termsState().current; return termKey(c.year, c.term); }
  function nextTerm(c) {
    const i = TERM_ORDER.indexOf(c.term);
    if (i < TERM_ORDER.length - 1) return { year: c.year, term: TERM_ORDER[i + 1] };
    const [a, b] = c.year.split('/').map(Number);
    return { year: `${a + 1}/${b + 1}`, term: 'first' };
  }
  function allRequests() { return (get('requests', []) || []).concat((get('ss_requests_v2', []) || []).map(r => Object.assign({ _ss: true }, r))); }
  function stampTerms() {
    const cur = currentTermKey();
    const stamp = (k) => {
      let rows; try { rows = JSON.parse(localStorage.getItem(P + k) || 'null'); } catch (_) { rows = null; }
      if (!Array.isArray(rows)) return;
      let changed = false;
      rows.forEach(r => { if (r && !r.termKey) { r.termKey = cur; changed = true; } });
      if (changed) rawSet.call(localStorage, P + k, JSON.stringify(rows));
    };
    stamp('requests'); stamp('ss_requests_v2');
  }
  function knownTerms() {
    const t = termsState(); const keys = new Set([currentTermKey()]);
    t.history.forEach(h => keys.add(termKey(h.year, h.term)));
    allRequests().forEach(r => r.termKey && keys.add(r.termKey));
    return [...keys];
  }
  function termOptions(sel, withAll) {
    const cur = currentTermKey();
    let h = `<option value="current" ${sel === 'current' ? 'selected' : ''}>الترم الحالي (${esc(termLabel(cur))})</option>`;
    if (withAll !== false) h += `<option value="all" ${sel === 'all' ? 'selected' : ''}>كل الترمات</option>`;
    knownTerms().filter(k => k !== cur).sort().reverse().forEach(k => { h += `<option value="${esc(k)}" ${sel === k ? 'selected' : ''}>${esc(termLabel(k))} (أرشيف)</option>`; });
    return h;
  }
  const inTerm = (r, sel) => sel === 'all' || (sel === 'current' ? (r.termKey || currentTermKey()) === currentTermKey() : r.termKey === sel);

  function openTerm(year, term, carry) {
    if (!isAdminLike()) return toast('فتح الترم للعميد أو مدير النظام فقط', 'err');
    const t = termsState();
    const now = new Date().toISOString();
    const prev = t.current;
    if (prev.year === year && prev.term === term) return toast('هذا هو الترم الحالي بالفعل');
    t.history.push({ year: prev.year, term: prev.term, openedAt: prev.openedAt, closedAt: now });
    t.current = { year, term, openedAt: now, openedBy: me().name || me().username };
    set('terms', t);
    if (carry) {
      const nk = termKey(year, term), pk = termKey(prev.year, prev.term);
      ['requests', 'ss_requests_v2'].forEach(k => {
        const rows = get(k, []); let ch = false;
        rows.forEach(r => { if ((r.termKey || pk) === pk && !['executed', 'rejected', 'cancelled', 'done', 'closed'].includes(r.status) && !['تم التنفيذ', 'مرفوض'].includes(r.status)) { r.termKey = nk; ch = true; } });
        if (ch) set(k, rows);
      });
    }
    toast('تم فتح ' + termLabel(termKey(year, term)));
    renderTerms();
  }
  function renderTerms() {
    const v = ensureView('terms');
    const t = termsState(); const cur = t.current; const ck = currentTermKey();
    const nx = nextTerm(cur);
    const rows = allRequests();
    const keys = knownTerms().sort().reverse();
    const count = (k, f) => rows.filter(r => (r.termKey || ck) === k && (!f || f(r))).length;
    const isOpen = r => !['executed', 'rejected', 'cancelled', 'done', 'closed'].includes(r.status);
    const years = []; for (let y = 2024; y <= 2032; y++) years.push(`${y}/${y + 1}`);
    v.innerHTML = pageHead('fa-box-archive', 'الترمات والأرشيف', 'العميد يفتح الترم الحالي وينقل للترم التالي، وتظهر الطلبات المقدمة في ترمها', '') + `
      <div class="grid-2">
        <div class="card"><div class="card-header"><div class="fw-extrabold">الترم الحالي</div></div><div class="card-body">
          <div class="adx-term-now"><span class="badge badge-green">مفتوح</span><b>${esc(termLabel(ck))}</b></div>
          <div class="text-xs text-muted mb-3">فُتح في ${esc(fmtDT(cur.openedAt && new Date(cur.openedAt).getTime() > 1e10 ? cur.openedAt : ''))}${cur.openedBy ? ' بواسطة ' + esc(cur.openedBy) : ''}</div>
          <div class="adx-mini-stats"><div><b>${count(ck)}</b><span>إجمالي الطلبات</span></div><div><b>${count(ck, isOpen)}</b><span>مفتوحة</span></div><div><b>${count(ck, r => r.status === 'executed')}</b><span>معتمدة</span></div></div>
          ${isAdminLike() ? `<div class="alert alert-info mt-3"><i class="fas fa-forward"></i> الانتقال للترم التالي: <b>${esc(termLabel(termKey(nx.year, nx.term)))}</b>
            <label class="adx-check"><input type="checkbox" id="adx-carry" checked> ترحيل الطلبات المفتوحة إلى الترم الجديد</label>
            <button class="btn btn-primary btn-sm mt-2" onclick="AdvExt.moveNext()"><i class="fas fa-forward"></i> نقل إلى الترم التالي</button></div>` : '<div class="text-xs text-muted">نقل الترم من صلاحيات العميد.</div>'}
        </div></div>
        ${isAdminLike() ? `<div class="card"><div class="card-header"><div class="fw-extrabold">فتح ترم محدد أو الرجوع لترم سابق</div></div><div class="card-body">
          <div class="form-group"><label>العام الجامعي</label><select class="form-control" id="adx-ty">${years.map(y => `<option ${y === cur.year ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          <div class="form-group"><label>الترم</label><select class="form-control" id="adx-tt">${TERM_ORDER.map(k => `<option value="${k}" ${k === cur.term ? 'selected' : ''}>${TERMS[k]}</option>`).join('')}</select></div>
          <button class="btn btn-outline btn-sm" onclick="AdvExt.openChosen()"><i class="fas fa-door-open"></i> جعله الترم الحالي</button>
          <div class="text-xs text-muted mt-2">الطلبات تبقى في الترم الذي قُدّمت فيه ويمكن الرجوع إليها من الأرشيف.</div>
        </div></div>` : ''}
      </div>
      <div class="card mt-3"><div class="card-header"><div class="fw-extrabold">أرشيف الترمات</div></div><div class="card-body table-wrap"><table class="data"><thead><tr><th>الترم</th><th>الحالة</th><th>الطلبات</th><th>مفتوحة</th><th>معتمدة</th><th>مرفوضة</th><th></th></tr></thead><tbody>
        ${keys.map(k => `<tr><td><b>${esc(termLabel(k))}</b></td><td>${k === ck ? '<span class="badge badge-green">الحالي</span>' : '<span class="badge">أرشيف</span>'}</td><td>${count(k)}</td><td>${count(k, isOpen)}</td><td>${count(k, r => r.status === 'executed')}</td><td>${count(k, r => r.status === 'rejected')}</td><td><button class="btn btn-outline btn-sm" onclick="AdvExt.viewTerm('${esc(k)}')">عرض الطلبات</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
  }
  function moveNext() {
    const c = termsState().current; const n = nextTerm(c);
    if (!confirm(`نقل المنصة إلى ${termLabel(termKey(n.year, n.term))}؟ سيُحفظ ${termLabel(currentTermKey())} في الأرشيف.`)) return;
    openTerm(n.year, n.term, !!document.getElementById('adx-carry')?.checked);
  }
  function openChosen() {
    const y = document.getElementById('adx-ty').value, t = document.getElementById('adx-tt').value;
    if (!confirm(`جعل ${termLabel(termKey(y, t))} هو الترم الحالي؟`)) return;
    openTerm(y, t, false);
  }
  function viewTerm(k) { inboxState.term = k; inboxState.status = 'all'; App.navigate('staff-inbox'); }

  /* ========== الفترات الأكاديمية (فتح وغلق بوقت) ========== */
  function windows() { return get('period_windows', {}); }
  function periodState(id) {
    const man = (get('periods', (window.FOS_SEED && FOS_SEED.periods) || {}) || {})[id] !== false;
    const w = windows()[id] || {};
    const now = Date.now();
    const from = w.from ? new Date(w.from).getTime() : 0, until = w.until ? new Date(w.until).getTime() : 0;
    if (!man) return { open: false, label: 'مغلق', cls: 'red', note: w.from && from > now ? 'يفتح ' + fmtDT(w.from) : '' };
    if (from && now < from) return { open: false, label: 'مجدول', cls: 'amber', note: 'يفتح ' + fmtDT(w.from) };
    if (until && now >= until) return { open: false, label: 'انتهى', cls: 'red', note: 'أُغلق ' + fmtDT(w.until) };
    return { open: true, label: 'مفتوح', cls: 'green', note: until ? 'يغلق ' + fmtDT(w.until) : '' };
  }
  function periodOpen(id) { return periodState(id).open; }
  function periodItems() {
    const f = ((window.FOS_SEED && FOS_SEED.formTypes) || []).map(x => ({ id: x.id, name: x.nameAr, cat: x.category === 'advising' ? 'نماذج الإرشاد الأكاديمي' : 'نماذج شؤون الطلاب' }));
    f.push({ id: '_ss', name: 'خدمات الطلاب والخريجين', cat: 'خدمات الطلاب والخريجين' });
    f.push({ id: '_talent', name: 'التسجيل في برنامج دعم الموهوبين', cat: 'البرامج' });
    return f;
  }
  const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  function renderPeriods() {
    const v = document.getElementById('view-periods');
    const items = periodItems();
    const cats = [...new Set(items.map(i => i.cat))];
    const canEdit = ['admin', 'manager', 'dean'].includes(me().role);
    v.innerHTML = pageHead('fa-calendar-check', 'الفترات الأكاديمية', 'افتح أو أغلق التقديم يدويًا، أو حدد وقت فتح وإغلاق تلقائي حتى ساعة معينة', canEdit ? `<button class="btn btn-outline btn-sm" onclick="AdvExt.periodsAll(true)">فتح الكل</button> <button class="btn btn-outline btn-sm" onclick="AdvExt.periodsAll(false)">إغلاق الكل</button>` : '') +
      cats.map(cat => `<div class="card mb-3"><div class="card-header"><div class="fw-extrabold">${esc(cat)}</div></div><div class="card-body table-wrap"><table class="data adx-periods"><thead><tr><th>الخدمة</th><th>الحالة</th><th>يفتح في</th><th>يغلق في</th><th></th></tr></thead><tbody>
      ${items.filter(i => i.cat === cat).map(i => { const st = periodState(i.id); const w = windows()[i.id] || {}; const man = (get('periods', {}) || {})[i.id] !== false;
        return `<tr><td><b>${esc(i.name)}</b></td><td><span class="${BADGE[st.cls]}">${st.label}</span><div class="text-xs text-muted">${esc(st.note)}</div></td>
        <td><input type="datetime-local" class="form-control" id="pw-from-${i.id}" value="${toLocalInput(w.from)}" ${canEdit ? '' : 'disabled'}></td>
        <td><input type="datetime-local" class="form-control" id="pw-until-${i.id}" value="${toLocalInput(w.until)}" ${canEdit ? '' : 'disabled'}></td>
        <td class="adx-nowrap">${canEdit ? `<button class="btn btn-sm ${man ? 'btn-danger' : 'btn-success'}" onclick="AdvExt.periodToggle('${i.id}')">${man ? 'إغلاق' : 'فتح'}</button> <button class="btn btn-sm btn-primary" onclick="AdvExt.periodSave('${i.id}')">حفظ الوقت</button> <button class="btn btn-sm btn-outline" onclick="AdvExt.periodClear('${i.id}')">إلغاء الوقت</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div></div>`).join('');
  }
  function periodToggle(id) { const p = get('periods', {}) || {}; p[id] = p[id] === false; set('periods', p); toast(p[id] ? 'تم الفتح' : 'تم الإغلاق'); renderPeriods(); }
  function periodsAll(on) { const p = get('periods', {}) || {}; periodItems().forEach(i => p[i.id] = on); set('periods', p); renderPeriods(); }
  function periodSave(id) {
    const f = document.getElementById('pw-from-' + id).value, u = document.getElementById('pw-until-' + id).value;
    if (f && u && new Date(u) <= new Date(f)) return toast('وقت الإغلاق يجب أن يكون بعد وقت الفتح', 'err');
    const w = windows(); w[id] = { from: f ? new Date(f).toISOString() : '', until: u ? new Date(u).toISOString() : '' }; set('period_windows', w);
    const p = get('periods', {}) || {}; if (f && new Date(f) > new Date()) { p[id] = true; set('periods', p); }
    toast('تم حفظ وقت الفتح والإغلاق'); renderPeriods();
  }
  function periodClear(id) { const w = windows(); delete w[id]; set('period_windows', w); renderPeriods(); }

  /* ========== صندوق الطلبات ========== */
  const inboxState = { q: '', status: 'mine', term: 'current', form: 'all' };
  function stageOf(r) { return App.statusInfo(r); }
  function renderInbox() {
    const v = document.getElementById('view-staff-inbox');
    const mine = r => { try { return App.canAction(r); } catch (_) { return false; } };
    const reqs = (get('requests', []) || []).map(x => x);
    const forms = [...new Set(reqs.map(r => r.formTitle).filter(Boolean))];
    const q = inboxState.q.trim().toLocaleLowerCase('ar');
    let list = reqs.filter(r => inTerm(r, inboxState.term));
    if (me().role === 'advisor') list = list.filter(r => !r.advisorUsername || r.advisorUsername === me().username || true);
    const st = inboxState.status;
    const rows = list.filter(r => (st === 'all' || (st === 'mine' && mine(r)) || (st === 'open' && !['executed', 'rejected'].includes(r.status)) || (st === 'executed' && r.status === 'executed') || (st === 'rejected' && r.status === 'rejected'))
      && (inboxState.form === 'all' || r.formTitle === inboxState.form)
      && (!q || [r.studentName, r.studentCode, r.formTitle, r.id, r.program].join(' ').toLocaleLowerCase('ar').includes(q)))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const cnt = f => list.filter(f).length;
    v.innerHTML = pageHead('fa-inbox', 'صندوق الطلبات', 'الطلبات الواردة حسب مسار الاعتماد: مرشد ← منسق القسم ← مدير الوحدة ← وكيل الكلية ← العميد') + `
      <div class="adx-mini-stats mb-3"><div><b>${cnt(mine)}</b><span>بانتظار إجرائي</span></div><div><b>${cnt(r => !['executed', 'rejected'].includes(r.status))}</b><span>مفتوحة</span></div><div><b>${cnt(r => r.status === 'executed')}</b><span>معتمدة</span></div><div><b>${cnt(r => r.status === 'rejected')}</b><span>مرفوضة</span></div></div>
      <div class="adx-filters">
        <input type="search" class="form-control" id="ib-q" placeholder="بحث بالاسم أو الكود أو رقم الطلب" value="${esc(inboxState.q)}">
        <select class="form-control" id="ib-st"><option value="mine" ${st === 'mine' ? 'selected' : ''}>بانتظار إجرائي</option><option value="open" ${st === 'open' ? 'selected' : ''}>كل المفتوحة</option><option value="executed" ${st === 'executed' ? 'selected' : ''}>المعتمدة</option><option value="rejected" ${st === 'rejected' ? 'selected' : ''}>المرفوضة</option><option value="all" ${st === 'all' ? 'selected' : ''}>الكل</option></select>
        <select class="form-control" id="ib-term">${termOptions(inboxState.term)}</select>
        <select class="form-control" id="ib-form"><option value="all">كل النماذج</option>${forms.map(f => `<option ${inboxState.form === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
      </div>
      <div class="card"><div class="card-body table-wrap">${rows.length ? `<table class="data"><thead><tr><th>رقم الطلب</th><th>الطالب</th><th>النموذج</th><th>الترم</th><th>التاريخ</th><th>المرحلة</th></tr></thead><tbody>
      ${rows.map(r => { const s = stageOf(r); return `<tr class="adx-row" onclick="App.viewRequest('${esc(r.id)}','staff-inbox')"><td dir="ltr"><b>${esc(r.id)}</b></td><td>${esc(r.studentName)}<div class="text-xs text-muted">${esc(r.studentCode)}${r.program ? ' · ' + esc(r.program) : ''}</div></td><td>${esc(r.formTitle)}</td><td>${esc(termLabel(r.termKey || currentTermKey()))}</td><td>${esc(fmtDate(r.createdAt))}</td><td><span class="badge ${s.cls}">${esc(s.label)}</span>${r.skipped && r.skipped.length ? '<div class="text-xs text-muted">اعتماد من جهة أعلى</div>' : ''}</td></tr>`; }).join('')}
      </tbody></table>` : '<div class="empty"><i class="fas fa-inbox"></i>لا توجد طلبات بهذه الفلاتر</div>'}</div></div>`;
    const bind = (id, key, ev) => { const el = document.getElementById(id); if (el) el.addEventListener(ev || 'change', () => { inboxState[key] = el.value; renderInbox(); if (ev === 'input') { const n = document.getElementById(id); n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); };
    bind('ib-q', 'q', 'input'); bind('ib-st', 'status'); bind('ib-term', 'term'); bind('ib-form', 'form');
  }

  /* ========== البحث عن مستخدم ========== */
  const userState = { type: 'all', q: '', program: 'all', level: 'all' };
  function renderUserSearch() {
    const v = document.getElementById('view-students-search');
    const users = get('users', []) || [];
    const roles = (App.loadRoles && App.loadRoles()) || [];
    const q = userState.q.trim().toLocaleLowerCase('ar');
    const progs = [...new Set(users.map(u => u.program || u.dept).filter(Boolean))];
    const rows = users.filter(u => (userState.type === 'all' || u.role === userState.type)
      && (userState.program === 'all' || (u.program || u.dept) === userState.program)
      && (userState.level === 'all' || String(u.level) === userState.level)
      && (!q || [u.name, u.username, u.code, u.phone, u.email].join(' ').toLocaleLowerCase('ar').includes(q)));
    const isAdmin = me().role === 'admin';
    v.innerHTML = pageHead('fa-search', 'البحث عن مستخدم', 'ابحث بنوع المستخدم والفلاتر' + (isAdmin ? '، وغيّر دور وصلاحيات أي مستخدم' : '')) + `
      <div class="adx-filters">
        <select class="form-control" id="us-type"><option value="all">كل أنواع المستخدمين</option>${roles.map(r => `<option value="${esc(r.id)}" ${userState.type === r.id ? 'selected' : ''}>${esc(r.nameAr)}</option>`).join('')}</select>
        <input type="search" class="form-control" id="us-q" placeholder="الاسم أو الكود أو الهاتف" value="${esc(userState.q)}">
        <select class="form-control" id="us-prog"><option value="all">كل البرامج والأقسام</option>${progs.map(p => `<option value="${esc(p)}" ${userState.program === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <select class="form-control" id="us-level"><option value="all">كل المستويات</option>${['1', '2', '3', '4'].map(l => `<option value="${l}" ${userState.level === l ? 'selected' : ''}>المستوى ${l}</option>`).join('')}</select>
      </div>
      <div class="card"><div class="card-body table-wrap">${rows.length ? `<table class="data"><thead><tr><th>الاسم</th><th>اسم الدخول / الكود</th><th>النوع</th><th>البرنامج / القسم</th><th>الهاتف</th>${isAdmin ? '<th>تغيير الدور</th>' : ''}</tr></thead><tbody>
      ${rows.slice(0, 200).map(u => `<tr><td><b>${esc(u.name || '—')}</b></td><td dir="ltr">${esc(u.code || u.username)}</td><td><span class="badge badge-blue">${esc(roleLabel(u.role))}</span></td><td>${esc(u.program || u.dept || '—')}${u.level ? ' · م' + esc(u.level) : ''}</td><td dir="ltr">${esc(u.phone || '—')}</td>
      ${isAdmin ? `<td class="adx-nowrap"><select class="form-control" id="ur-${esc(u.username)}" style="width:auto;display:inline-block">${roles.map(r => `<option value="${esc(r.id)}" ${u.role === r.id ? 'selected' : ''}>${esc(r.nameAr)}</option>`).join('')}</select> <button class="btn btn-sm btn-primary" onclick="AdvExt.setRole('${esc(u.username)}')">حفظ</button></td>` : ''}</tr>`).join('')}
      </tbody></table><div class="text-xs text-muted mt-2">${rows.length} مستخدم${isAdmin ? ' · لتعديل صلاحيات الدور نفسه: <a href="#" onclick="App.navigate(\'roles-mgmt\');return false">الأدوار والصلاحيات</a>' : ''}</div>` : '<div class="empty"><i class="fas fa-users-slash"></i>لا يوجد مستخدمون بهذه الفلاتر</div>'}</div></div>`;
    [['us-type', 'type', 'change'], ['us-prog', 'program', 'change'], ['us-level', 'level', 'change'], ['us-q', 'q', 'input']].forEach(([id, k, ev]) => {
      const el = document.getElementById(id); if (!el) return;
      el.addEventListener(ev, () => { userState[k] = el.value; renderUserSearch(); if (ev === 'input') { const n = document.getElementById(id); n.focus(); n.setSelectionRange(n.value.length, n.value.length); } });
    });
  }
  function setRole(username) {
    if (me().role !== 'admin') return toast('لا صلاحية', 'err');
    const role = document.getElementById('ur-' + username).value;
    const users = get('users', []); const u = users.find(x => x.username === username); if (!u) return;
    if (u.username === me().username && role !== 'admin' && !confirm('ستفقد صلاحيات مدير النظام لهذا الحساب. متابعة؟')) return;
    u.role = role; set('users', users);
    App.notifyUser(u.username, 'تم تغيير دورك في المنصة إلى: ' + roleLabel(role), { title: 'تغيير الصلاحيات', type: 'info' });
    toast('تم تغيير دور ' + (u.name || username) + ' إلى ' + roleLabel(role));
    renderUserSearch();
  }
  function usersMgmtExtra() {
    const view = document.getElementById('view-users-mgmt');
    if (!view || document.getElementById('adx-users-tabs')) return;
    const bar = document.createElement('div'); bar.id = 'adx-users-tabs'; bar.className = 'adx-tabs mb-3';
    bar.innerHTML = `<button class="btn btn-primary btn-sm" disabled><i class="fas fa-users"></i> المستخدمون</button><button class="btn btn-outline btn-sm" onclick="App.navigate('roles-mgmt')"><i class="fas fa-user-lock"></i> الأدوار والصلاحيات</button><button class="btn btn-outline btn-sm" onclick="App.navigate('students-search')"><i class="fas fa-search"></i> البحث وتغيير الدور</button>`;
    view.insertBefore(bar, view.firstChild);
  }
  function rolesMgmtExtra() {
    const view = document.getElementById('view-roles-mgmt');
    if (!view || document.getElementById('adx-roles-tabs')) return;
    const bar = document.createElement('div'); bar.id = 'adx-roles-tabs'; bar.className = 'adx-tabs mb-3';
    bar.innerHTML = `<button class="btn btn-outline btn-sm" onclick="App.navigate('users-mgmt')"><i class="fas fa-users"></i> المستخدمون</button><button class="btn btn-primary btn-sm" disabled><i class="fas fa-user-lock"></i> الأدوار والصلاحيات</button>`;
    view.insertBefore(bar, view.firstChild);
  }

  /* ========== لوحة العميد ========== */
  const deanState = { term: 'current', program: 'all', status: 'all' };
  let lastRefresh = null;
  function renderDean() {
    const v = document.getElementById('view-dean-dashboard');
    if (!v) return;
    const users = get('users', []) || [];
    const students = users.filter(u => u.role === 'student');
    const allReq = (get('requests', []) || []);
    const reqs = allReq.filter(r => inTerm(r, deanState.term) && (deanState.program === 'all' || r.program === deanState.program));
    const ss = (get('ss_requests_v2', []) || []).filter(r => inTerm(r, deanState.term));
    const talent = get('talent_applications', []) || [];
    const cases = get('support_cases', []) || [];
    const msgs = get('listen_messages', []) || [];
    const open = reqs.filter(r => !['executed', 'rejected'].includes(r.status));
    const exec = reqs.filter(r => r.status === 'executed'), rej = reqs.filter(r => r.status === 'rejected');
    const atRisk = students.filter(s => s.gpa != null && s.gpa !== '' && Number(s.gpa) < 2);
    const avgAge = open.length ? Math.round(open.reduce((n, r) => n + Math.max(0, (Date.now() - new Date(r.createdAt || Date.now())) / 864e5), 0) / open.length) : 0;
    const progs = [...new Set(allReq.map(r => r.program).filter(Boolean))];
    const stageCounts = WF().map(w => ({ w, n: open.filter(r => r.status === 'pending_' + w.key).length }));
    const maxStage = Math.max(1, ...stageCounts.map(x => x.n));
    const byForm = {}; reqs.forEach(r => byForm[r.formTitle || 'أخرى'] = (byForm[r.formTitle || 'أخرى'] || 0) + 1);
    const forms = Object.entries(byForm).sort((a, b) => b[1] - a[1]).slice(0, 6); const maxForm = Math.max(1, ...forms.map(x => x[1]));
    const awaiting = open.filter(r => r.status === 'pending_dean');
    const metric = (icon, label, val, hint, tone, go) => `<button type="button" class="dean-metric ${tone}" ${go ? `onclick="${go}"` : ''}><span class="dean-metric-icon"><i class="fas ${icon}"></i></span><span class="dean-metric-label">${label}</span><strong>${val}</strong><small>${hint}</small></button>`;
    const st = deanState.status;
    const list = reqs.filter(r => st === 'all' || (st === 'open' && !['executed', 'rejected'].includes(r.status)) || r.status === st).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 8);
    lastRefresh = new Date();
    v.innerHTML = `<div class="adx-head"><div class="adx-head-ico"><i class="fas fa-chart-pie"></i></div><div class="adx-head-txt"><div class="fw-extrabold">لوحة العميد</div><div class="text-xs text-muted">${esc(termLabel(deanState.term === 'current' ? currentTermKey() : deanState.term))} · تتحدث الأرقام تلقائيًا عند أي تغيير <span class="adx-live"><i class="fas fa-circle"></i> مباشر ${lastRefresh.toLocaleTimeString('ar-EG')}</span></div></div></div>
      <div class="adx-filters">
        <select class="form-control" id="dn-term">${termOptions(deanState.term)}</select>
        <select class="form-control" id="dn-prog"><option value="all">كل البرامج والأقسام</option>${progs.map(p => `<option value="${esc(p)}" ${deanState.program === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <select class="form-control" id="dn-st"><option value="all">كل حالات الطلبات</option><option value="open" ${st === 'open' ? 'selected' : ''}>المفتوحة</option><option value="executed" ${st === 'executed' ? 'selected' : ''}>المعتمدة</option><option value="rejected" ${st === 'rejected' ? 'selected' : ''}>المرفوضة</option></select>
      </div>
      <div class="stats-grid dean-stats-grid">
        ${metric('fa-stamp', 'بانتظار اعتماد العميد', awaiting.length, 'طلبات وصلت لمرحلتك', 'amber', "App.navigate('staff-inbox')")}
        ${metric('fa-file-alt', 'طلبات الترم', reqs.length, `${open.length} مفتوح`, 'blue', "App.navigate('staff-inbox')")}
        ${metric('fa-circle-check', 'معتمدة', exec.length, `${rej.length} مرفوض`, 'green', "App.navigate('staff-inbox')")}
        ${metric('fa-clock', 'متوسط عمر الطلب المفتوح', avgAge + ' يوم', 'مؤشر سرعة الإنجاز', 'violet', '')}
        ${metric('fa-user-graduate', 'الطلاب', students.length, `${atRisk.length} متعثر (أقل من 2.00)`, 'navy', "App.navigate('students-mgmt')")}
        ${metric('fa-heart-pulse', 'حالات دعم المتعثرين', cases.filter(c => c.status !== 'closed').length, `${cases.length} إجمالي`, 'amber', "App.navigate('support-cases')")}
        ${metric('fa-ear-listen', 'رسائل الطلاب للعميد', msgs.filter(m => !m.reply).length, 'بدون رد', 'teal', "App.navigate('voice-dean')")}
        ${metric('fa-star', 'طلبات الموهوبين', talent.length, 'تسجيلات البرنامج', 'violet', "App.navigate('talent-admin')")}
        ${metric('fa-hand-holding-hand', 'طلبات الطلاب والخريجين', ss.length, `${ss.filter(r => r.status === 'new').length} جديد`, 'teal', "App.navigate('ss-desk')")}
      </div>
      <div class="grid-2 mt-3">
        <div class="card"><div class="card-header"><div class="fw-extrabold">الطلبات المفتوحة حسب مرحلة الاعتماد</div></div><div class="card-body">
          ${stageCounts.map((x, i) => `<div class="adx-bar"><span>${i + 1}. ${esc(x.w.label)}</span><div><i style="width:${Math.round(x.n * 100 / maxStage)}%"></i></div><b>${x.n}</b></div>`).join('')}
        </div></div>
        <div class="card"><div class="card-header"><div class="fw-extrabold">الطلبات حسب النموذج</div></div><div class="card-body">
          ${forms.length ? forms.map(([k, n]) => `<div class="adx-bar"><span>${esc(k)}</span><div><i style="width:${Math.round(n * 100 / maxForm)}%"></i></div><b>${n}</b></div>`).join('') : '<div class="text-muted text-sm">لا توجد طلبات في هذا الترم</div>'}
        </div></div>
      </div>
      <div class="card mt-3"><div class="card-header"><div class="fw-extrabold">آخر الطلبات</div></div><div class="card-body table-wrap">${list.length ? `<table class="data"><thead><tr><th>رقم الطلب</th><th>الطالب</th><th>النموذج</th><th>التاريخ</th><th>المرحلة</th></tr></thead><tbody>${list.map(r => { const s = App.statusInfo(r); return `<tr class="adx-row" onclick="App.viewRequest('${esc(r.id)}','dean-dashboard')"><td dir="ltr"><b>${esc(r.id)}</b></td><td>${esc(r.studentName)}</td><td>${esc(r.formTitle)}</td><td>${esc(fmtDate(r.createdAt))}</td><td><span class="badge ${s.cls}">${esc(s.label)}</span></td></tr>`; }).join('')}</tbody></table>` : '<div class="empty"><i class="fas fa-inbox"></i>لا توجد طلبات</div>'}</div></div>`;
    [['dn-term', 'term'], ['dn-prog', 'program'], ['dn-st', 'status']].forEach(([id, k]) => document.getElementById(id)?.addEventListener('change', e => { deanState[k] = e.target.value; renderDean(); }));
  }

  /* ========== دعم المتعثرين ========== */
  const CASE_ST = { new: ['جديدة', 'amber'], following: ['قيد المتابعة', 'blue'], improved: ['تحسن', 'green'], closed: ['مغلقة', 'gray'] };
  const caseState = { sel: null, q: '', st: 'all' };
  function renderSupport() {
    const v = document.getElementById('view-support-cases');
    const cases = get('support_cases', []) || [];
    const users = get('users', []) || [];
    const students = users.filter(u => u.role === 'student');
    const risk = students.filter(s => s.gpa != null && s.gpa !== '' && Number(s.gpa) < 2 && !cases.some(c => c.studentCode === (s.code || s.username) && c.status !== 'closed'));
    const q = caseState.q.trim().toLocaleLowerCase('ar');
    const rows = cases.filter(c => (caseState.st === 'all' || c.status === caseState.st) && (!q || [c.studentName, c.studentCode].join(' ').toLocaleLowerCase('ar').includes(q)));
    const sel = cases.find(c => c.id === caseState.sel);
    v.innerHTML = pageHead('fa-heart-pulse', 'دعم الطلاب المتعثرين', 'متابعة الطلاب ذوي المعدل أقل من 2.00 وخطة دعم لكل حالة') + `
      <div class="adx-mini-stats mb-3"><div><b>${cases.filter(c => c.status !== 'closed').length}</b><span>حالات مفتوحة</span></div><div><b>${cases.filter(c => c.status === 'improved').length}</b><span>تحسنت</span></div><div><b>${risk.length}</b><span>متعثرون بلا حالة</span></div><div><b>${cases.length}</b><span>الإجمالي</span></div></div>
      ${risk.length ? `<div class="card mb-3"><div class="card-header"><div class="fw-extrabold">طلاب متعثرون بحاجة لفتح حالة</div></div><div class="card-body">${risk.slice(0, 10).map(s => `<div class="adx-line"><span><b>${esc(s.name)}</b> <span class="text-xs text-muted">${esc(s.code || s.username)} · المعدل ${esc(Number(s.gpa).toFixed(2))}</span></span><button class="btn btn-sm btn-primary" onclick="AdvExt.caseOpenFor('${esc(s.username)}')">فتح حالة</button></div>`).join('')}</div></div>` : ''}
      <div class="card mb-3"><div class="card-header"><div class="fw-extrabold">فتح حالة جديدة</div></div><div class="card-body"><div class="grid-3">
        <div class="form-group"><label>الطالب (الكود)</label><input class="form-control" id="sc-code" list="sc-list" placeholder="اكتب الكود أو الاسم"><datalist id="sc-list">${students.map(s => `<option value="${esc(s.code || s.username)}">${esc(s.name)}</option>`).join('')}</datalist></div>
        <div class="form-group"><label>سبب المتابعة</label><input class="form-control" id="sc-reason" placeholder="مثال: معدل تراكمي أقل من 2.00"></div>
        <div class="form-group" style="align-self:end"><button class="btn btn-primary" onclick="AdvExt.caseCreate()"><i class="fas fa-plus"></i> فتح الحالة</button></div></div></div></div>
      <div class="adx-filters"><input type="search" class="form-control" id="sc-q" placeholder="بحث بالاسم أو الكود" value="${esc(caseState.q)}"><select class="form-control" id="sc-st"><option value="all">كل الحالات</option>${Object.entries(CASE_ST).map(([k, [l]]) => `<option value="${k}" ${caseState.st === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="card"><div class="card-body table-wrap">${rows.length ? `<table class="data"><thead><tr><th>الطالب</th><th>المعدل</th><th>السبب</th><th>المسؤول</th><th>الحالة</th></tr></thead><tbody>${rows.map(c => `<tr class="adx-row" onclick="AdvExt.caseSelect('${esc(c.id)}')"><td><b>${esc(c.studentName)}</b><div class="text-xs text-muted">${esc(c.studentCode)}</div></td><td>${c.gpa != null && c.gpa !== '' ? esc(Number(c.gpa).toFixed(2)) : '—'}</td><td>${esc(c.reason || '—')}</td><td>${esc(c.owner || '—')}</td><td><span class="${BADGE[CASE_ST[c.status][1]]}">${CASE_ST[c.status][0]}</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><i class="fas fa-heart-pulse"></i>لا توجد حالات بعد</div>'}</div></div>
      ${sel ? `<div class="card mt-3"><div class="card-header flex items-center justify-between"><div class="fw-extrabold">حالة ${esc(sel.studentName)}</div><button class="btn btn-sm btn-ghost" onclick="AdvExt.caseSelect(null)">إغلاق</button></div><div class="card-body">
        <div class="grid-2"><div class="form-group"><label>الحالة</label><select class="form-control" id="sc-newst">${Object.entries(CASE_ST).map(([k, [l]]) => `<option value="${k}" ${sel.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="form-group"><label>خطة الدعم</label><input class="form-control" id="sc-plan" value="${esc(sel.plan || '')}" placeholder="مثال: خفض العبء الدراسي وإعادة مقررين"></div></div>
        <div class="form-group"><label>إضافة ملاحظة متابعة</label><textarea class="form-control" id="sc-note" rows="2" placeholder="اكتب ما تم مع الطالب"></textarea></div>
        <button class="btn btn-primary btn-sm" onclick="AdvExt.caseSave()">حفظ</button>
        <div class="mt-3">${(sel.notes || []).slice().reverse().map(n => `<div class="adx-note"><b>${esc(n.by)}</b> <span class="text-xs text-muted">${esc(fmtDT(n.at))}</span><div>${esc(n.text)}</div></div>`).join('') || '<div class="text-muted text-sm">لا توجد ملاحظات بعد</div>'}</div></div></div>` : ''}`;
    document.getElementById('sc-q')?.addEventListener('input', e => { caseState.q = e.target.value; renderSupport(); const n = document.getElementById('sc-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    document.getElementById('sc-st')?.addEventListener('change', e => { caseState.st = e.target.value; renderSupport(); });
  }
  function caseNew(stu, reason) {
    const cases = get('support_cases', []);
    cases.unshift({ id: 'SC-' + Date.now().toString(36).toUpperCase(), studentCode: stu.code || stu.username, studentName: stu.name, gpa: stu.gpa, reason, status: 'new', owner: me().name || '', plan: '', notes: [{ by: me().name || '', at: new Date().toISOString(), text: 'فُتحت الحالة: ' + reason }], createdAt: new Date().toISOString() });
    set('support_cases', cases);
    App.notifyUser(stu.code || stu.username, 'تم فتح ملف متابعة أكاديمية لدعمك. سيتواصل معك المرشد الأكاديمي.', { title: 'دعم أكاديمي', type: 'info' });
    return cases[0];
  }
  function caseCreate() {
    const code = document.getElementById('sc-code').value.trim(); const reason = document.getElementById('sc-reason').value.trim();
    const stu = (get('users', []) || []).find(u => u.role === 'student' && (String(u.code) === code || u.username === code || u.name === code));
    if (!stu) return toast('الطالب غير موجود', 'err'); if (!reason) return toast('اكتب سبب المتابعة', 'err');
    caseState.sel = caseNew(stu, reason).id; toast('تم فتح الحالة'); renderSupport();
  }
  function caseOpenFor(username) { const stu = (get('users', []) || []).find(u => u.username === username); if (!stu) return; caseState.sel = caseNew(stu, 'معدل تراكمي أقل من 2.00').id; renderSupport(); }
  function caseSelect(id) { caseState.sel = id; renderSupport(); }
  function caseSave() {
    const cases = get('support_cases', []); const c = cases.find(x => x.id === caseState.sel); if (!c) return;
    c.status = document.getElementById('sc-newst').value; c.plan = document.getElementById('sc-plan').value.trim();
    const note = document.getElementById('sc-note').value.trim(); if (note) c.notes.push({ by: me().name || '', at: new Date().toISOString(), text: note });
    c.updatedAt = new Date().toISOString(); set('support_cases', cases); toast('تم الحفظ'); renderSupport();
  }

  /* ========== استمع للطلاب ========== */
  const listenState = { sel: null, q: '', st: 'all' };
  const LISTEN_TYPES = ['رأي أو اقتراح', 'شكوى', 'مشكلة أكاديمية', 'طلب لقاء مع العميد', 'شكر وتقدير'];
  function renderListen() {
    const v = document.getElementById('view-voice-dean');
    const u = me(); const msgs = get('listen_messages', []) || [];
    if (u.role === 'student') {
      const mine = msgs.filter(m => m.studentCode === (u.code || u.username)).sort((a, b) => new Date(b.at) - new Date(a.at));
      v.innerHTML = pageHead('fa-ear-listen', 'استمع للطلاب', 'رسالة مباشرة إلى عميد الكلية. العميد يقرأ الرسائل ويرد عليها من هنا') + `
        <div class="card mb-3"><div class="card-body"><div class="alert alert-info mb-3"><i class="fas fa-circle-info"></i> رسالتك تصل للعميد باسمك وكودك. اكتب بوضوح واذكر التفاصيل المهمة.</div>
          <div class="grid-2"><div class="form-group"><label>نوع الرسالة</label><select class="form-control" id="ls-type">${LISTEN_TYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
          <div class="form-group"><label>الموضوع</label><input class="form-control" id="ls-sub" maxlength="90" placeholder="عنوان مختصر"></div></div>
          <div class="form-group"><label>الرسالة</label><textarea class="form-control" id="ls-body" rows="5" maxlength="2000" placeholder="اكتب رسالتك للعميد"></textarea></div>
          <button class="btn btn-primary" onclick="AdvExt.listenSend()"><i class="fas fa-paper-plane"></i> إرسال إلى العميد</button></div></div>
        <div class="fw-extrabold mb-2">رسائلي</div>
        ${mine.length ? mine.map(m => `<div class="card mb-2"><div class="card-body"><div class="flex justify-between items-center flex-wrap gap-2"><b>${esc(m.subject)}</b><span class="${m.reply ? BADGE.green : BADGE.amber}">${m.reply ? 'تم الرد' : 'بانتظار الرد'}</span></div><div class="text-xs text-muted">${esc(m.type)} · ${esc(fmtDT(m.at))}</div><div class="mt-2">${esc(m.body).replace(/\n/g, '<br>')}</div>${m.reply ? `<div class="alert alert-info mt-2"><b>رد العميد:</b><br>${esc(m.reply).replace(/\n/g, '<br>')}<div class="text-xs text-muted mt-1">${esc(fmtDT(m.repliedAt))}</div></div>` : ''}</div></div>`).join('') : '<div class="empty"><i class="fas fa-envelope-open"></i>لم ترسل رسائل بعد</div>'}`;
      return;
    }
    const q = listenState.q.trim().toLocaleLowerCase('ar');
    const rows = msgs.filter(m => (listenState.st === 'all' || (listenState.st === 'new' ? !m.reply : !!m.reply)) && (!q || [m.studentName, m.studentCode, m.subject, m.body].join(' ').toLocaleLowerCase('ar').includes(q))).sort((a, b) => new Date(b.at) - new Date(a.at));
    const sel = msgs.find(m => m.id === listenState.sel);
    v.innerHTML = pageHead('fa-ear-listen', 'استمع للطلاب', 'رسائل الطلاب الموجهة للعميد') + `
      <div class="adx-mini-stats mb-3"><div><b>${msgs.length}</b><span>الرسائل</span></div><div><b>${msgs.filter(m => !m.reply).length}</b><span>بدون رد</span></div><div><b>${msgs.filter(m => m.reply).length}</b><span>تم الرد</span></div></div>
      <div class="adx-filters"><input type="search" class="form-control" id="ls-q" placeholder="بحث في الرسائل" value="${esc(listenState.q)}"><select class="form-control" id="ls-st"><option value="all">الكل</option><option value="new" ${listenState.st === 'new' ? 'selected' : ''}>بدون رد</option><option value="done" ${listenState.st === 'done' ? 'selected' : ''}>تم الرد</option></select></div>
      <div class="card"><div class="card-body table-wrap">${rows.length ? `<table class="data"><thead><tr><th>الطالب</th><th>الموضوع</th><th>النوع</th><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>${rows.map(m => `<tr class="adx-row" onclick="AdvExt.listenSelect('${esc(m.id)}')"><td><b>${esc(m.studentName)}</b><div class="text-xs text-muted">${esc(m.studentCode)}</div></td><td>${esc(m.subject)}</td><td>${esc(m.type)}</td><td>${esc(fmtDT(m.at))}</td><td><span class="${m.reply ? BADGE.green : BADGE.amber}">${m.reply ? 'تم الرد' : 'جديدة'}</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><i class="fas fa-envelope-open"></i>لا توجد رسائل</div>'}</div></div>
      ${sel ? `<div class="card mt-3"><div class="card-header flex items-center justify-between"><div class="fw-extrabold">${esc(sel.subject)}</div><button class="btn btn-sm btn-ghost" onclick="AdvExt.listenSelect(null)">إغلاق</button></div><div class="card-body"><div class="text-xs text-muted mb-2">${esc(sel.studentName)} · ${esc(sel.studentCode)} · ${esc(sel.type)} · ${esc(fmtDT(sel.at))}</div><div class="mb-3">${esc(sel.body).replace(/\n/g, '<br>')}</div>
        <div class="form-group"><label>رد العميد</label><textarea class="form-control" id="ls-reply" rows="3">${esc(sel.reply || '')}</textarea></div><button class="btn btn-primary btn-sm" onclick="AdvExt.listenReply()"><i class="fas fa-reply"></i> إرسال الرد للطالب</button></div></div>` : ''}`;
    document.getElementById('ls-q')?.addEventListener('input', e => { listenState.q = e.target.value; renderListen(); const n = document.getElementById('ls-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    document.getElementById('ls-st')?.addEventListener('change', e => { listenState.st = e.target.value; renderListen(); });
  }
  function listenSend() {
    const u = me(); const sub = document.getElementById('ls-sub').value.trim(), body = document.getElementById('ls-body').value.trim();
    if (!sub || body.length < 10) return toast('اكتب الموضوع ورسالة لا تقل عن 10 أحرف', 'err');
    const msgs = get('listen_messages', []);
    const m = { id: 'LM-' + Date.now().toString(36).toUpperCase(), studentCode: u.code || u.username, studentName: u.name, type: document.getElementById('ls-type').value, subject: sub, body, at: new Date().toISOString(), termKey: currentTermKey() };
    msgs.unshift(m); set('listen_messages', msgs);
    (get('users', []) || []).filter(x => x.role === 'dean' || x.role === 'admin').forEach(x => App.notifyUser(x.username, `رسالة جديدة من ${u.name}: ${sub}`, { title: 'استمع للطلاب', type: 'info', link: 'voice-dean' }));
    toast('تم إرسال رسالتك للعميد'); renderListen();
  }
  function listenSelect(id) { listenState.sel = id; renderListen(); }
  function listenReply() {
    const t = document.getElementById('ls-reply').value.trim(); if (!t) return toast('اكتب الرد', 'err');
    const msgs = get('listen_messages', []); const m = msgs.find(x => x.id === listenState.sel); if (!m) return;
    m.reply = t; m.repliedAt = new Date().toISOString(); m.repliedBy = me().name; set('listen_messages', msgs);
    App.notifyUser(m.studentCode, 'رد العميد على رسالتك: ' + m.subject, { title: 'رد العميد', type: 'success', link: 'voice-dean' });
    toast('تم إرسال الرد'); renderListen();
  }

  /* ========== تحديث مباشر وتخزين ========== */
  const rawSet = Storage.prototype.setItem;
  let pending = null;
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === localStorage && String(k).indexOf(P) === 0) {
      if (k === P + 'requests' || k === P + 'ss_requests_v2') { try { stampTerms(); } catch (_) {} }
      clearTimeout(pending); pending = setTimeout(() => { try { window.dispatchEvent(new Event('adv-data')); } catch (_) {} }, 120);
    }
  };
  window.addEventListener('storage', e => { if (e.key && e.key.indexOf(P) === 0) window.dispatchEvent(new Event('adv-data')); });
  const liveMap = { 'dean-dashboard': renderDean, 'staff-inbox': renderInbox, terms: renderTerms, 'support-cases': renderSupport, 'voice-dean': renderListen };
  window.addEventListener('adv-data', () => {
    try {
      const cv = window.App && App.getCurrentView && App.getCurrentView();
      const active = document.activeElement;
      if (active && /INPUT|TEXTAREA|SELECT/.test(active.tagName) && active.closest('.view')) return;
      if (cv && liveMap[cv]) liveMap[cv]();
    } catch (_) {}
  });
  setInterval(() => { try { if (App.getCurrentView() === 'dean-dashboard' && !document.hidden) { const a = document.activeElement; if (!(a && /INPUT|SELECT|TEXTAREA/.test(a.tagName))) renderDean(); } } catch (_) {} }, 15000);

  ensureViews();
  function ensureViews() { try { ensureView('terms'); } catch (_) {} }
  try { termsState(); stampTerms(); } catch (_) {}

  window.AdvExt = {
    renderers: {
      terms: renderTerms, periods: renderPeriods, 'staff-inbox': renderInbox, 'students-search': renderUserSearch, 'dean-dashboard': renderDean,
      'support-cases': renderSupport, 'voice-dean': renderListen,
      'users-mgmt': () => { Promise.resolve(App.renderUsersMgmt && App.renderUsersMgmt()).then(usersMgmtExtra); },
      'roles-mgmt': () => { App.renderRolesMgmt(); rolesMgmtExtra(); }
    },
    get, set, esc, me, ensureView, pageHead, fmtDate, fmtDT, toast, currentTermKey, termLabel, periodOpen,
    moveNext, openChosen, viewTerm, periodToggle, periodsAll, periodSave, periodClear, setRole,
    caseCreate, caseOpenFor, caseSelect, caseSave, listenSend, listenSelect, listenReply
  };
})();
