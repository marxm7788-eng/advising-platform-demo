/* خدمات الطلاب والخريجين — مطابقة لبوابة خدمات الطلاب والخريجين (كلية العلوم):
   تقديم طلب، متابعة طلب برقم الطلب + كود المتابعة، وإدارة الطلبات. التخزين داخل المتصفح. */
(function () {
  'use strict';

  const KEY = 'fos_v2_ss_requests_v2';
  try { localStorage.removeItem('fos_v2_ss_requests'); localStorage.removeItem('fos_v2_ss_seeded'); } catch (_) {}

  const SERVICES = ['شهادة قيد', 'بيان حالة', 'شهادة تخرج', 'بيان درجات', 'إفادة أو شهادة باللغة العربية', 'إفادة أو شهادة باللغة الإنجليزية', 'طلب الكود الجامعي', 'خدمة أخرى', 'طلب سحب الملف', 'طلب إصدار قيد', 'شهادة حسن سير وسلوك', 'إفادة بالدراسة باللغة الإنجليزية', 'سحب ملف طالب حالي', 'سحب ملف خريج'];
  const LEVELS = ['المستوى الأول', 'المستوى الثاني', 'المستوى الثالث', 'المستوى الرابع'];
  const STATUS = { new: ['جديد', 'badge-blue'], review: ['قيد المراجعة', 'badge-teal'], done: ['تم التنفيذ', 'badge-green'], rejected: ['مرفوض', 'badge-red'] };
  const SCALE = ['راضٍ تمامًا', 'راضٍ إلى حد ما', 'غير راضٍ'];
  const QUESTIONS = ['مدى الاستفادة من مشروع التخرج في مجال عملك', 'مدى ارتباط دراستك بالوظيفة التي حصلت عليها', 'مدى احتياجك للالتحاق بالدراسات العليا', 'مدى تواكب البرامج الدراسية مع احتياجات سوق العمل', 'مدى احتياجك لدورات تدريبية للتأهيل للوظيفة المناسبة', 'مدى توافر وظائف في مجال التخصص', 'مدى سهولة حصولك على وظيفة في مجال تخصصك', 'مدى ملاءمة مستوى مهاراتك العامة والتكنولوجية لسوق العمل', 'مدى تواصلك مع وحدة الخريجين بالكلية', 'هل لديك الرغبة في المشاركة لتقديم خدمات للخريجين الجدد والقدامى', 'هل ترغب في تفعيل يوم الخريجين وملتقى التوظيف بصفة منتظمة كل عام', 'مدى تناسب آليات تواصل الكلية مع الخريجين (وسائل التواصل الاجتماعي — بريد — ...)'];
  const STAFF = ['affairs', 'vice', 'dean', 'manager', 'admin'];

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const user = () => (window.App && App.getCurrentUser && App.getCurrentUser()) || null;
  const toast = (m, t) => { const el = document.getElementById('toast'); if (!el) return; el.textContent = m; el.className = 'toast show' + (t === 'err' ? ' err' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 3200); };
  const fmt = iso => { try { return new Date(iso).toLocaleString('ar-EG-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; } };
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { toast('تعذر الحفظ — مساحة المتصفح ممتلئة', 'err'); } };
  const digits = n => String(Math.floor(Math.random() * Math.pow(10, n))).padStart(n, '0');
  const badge = s => { const x = STATUS[s] || STATUS.new; return `<span class="badge ${x[1]}">${x[0]}</span>`; };
  const root = id => document.getElementById('ss-root-' + id);

  let draft = null;      // بيانات الطلب أثناء فتح الاستبيان
  let survey = null;     // الاستبيان المحفوظ للطلب الحالي
  let open = null;       // طلب مفتوح في الإدارة
  let filt = { q: '', status: '' };

  /* ---------- تقديم طلب ---------- */
  function field(label, req, inner, hint) { return `<div class="form-group"><label>${label}${req ? ' <span style="color:var(--danger)">*</span>' : ''}</label>${inner}${hint ? `<div class="text-xs text-muted mt-1">${hint}</div>` : ''}</div>`; }
  function renderNew() {
    const el = root('ss-new'); if (!el) return;
    const u = user() || {}; const stu = u.role === 'student';
    const d = draft || { kind: '', level: '', hours: stu ? (u.completedHours || '') : '', name: stu ? (u.name || '') : '', program: stu ? (u.program || '') : '', no: stu ? (u.code || '') : '', phone: stu ? (u.phone || '') : '', email: '', year: '', services: [], details: '' };
    const grad = d.kind === 'graduate';
    el.innerHTML = `<div class="card"><div class="card-header"><div class="fw-extrabold">تقديم طلب جديد</div></div><div class="card-body">
      <form id="ss-form" onsubmit="StudentServices.submit(event)" novalidate>
        <div class="grid-2">
          ${field('الاسم رباعي', true, `<input class="form-control" name="name" value="${esc(d.name)}" placeholder="اكتب الاسم بالكامل">`)}
          ${field('صفة مقدم الطلب', true, `<select class="form-control" name="kind" onchange="StudentServices.kindChange(this.value)"><option value="">اختر</option><option value="student" ${d.kind === 'student' ? 'selected' : ''}>طالب حالي</option><option value="graduate" ${grad ? 'selected' : ''}>خريج</option></select>`)}
          ${field('المستوى الدراسي', false, `<select class="form-control" name="level"><option value="">اختر المستوى</option>${LEVELS.map(l => `<option ${d.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
          ${field('الساعات المجتازة', true, `<input class="form-control" name="hours" type="number" min="0" value="${esc(d.hours)}" placeholder="اكتب عدد الساعات التي اجتزتها">`, 'الساعات المجتازة بنجاح حتى الآن.')}
          ${field('اسم البرنامج', true, `<input class="form-control" name="program" value="${esc(d.program)}" placeholder="اكتب اسم البرنامج">`)}
          ${field('الرقم الجامعي / رقم الجلوس', false, `<input class="form-control" name="no" inputmode="numeric" value="${esc(d.no)}">`)}
          ${field('رقم الهاتف', true, `<input class="form-control" name="phone" type="tel" dir="ltr" style="text-align:right" value="${esc(d.phone)}" placeholder="01xxxxxxxxx">`)}
          ${field('البريد الإلكتروني', false, `<input class="form-control" name="email" type="email" dir="ltr" style="text-align:right" value="${esc(d.email)}" placeholder="name@example.com">`)}
          ${field('سنة التخرج (اختياري)', false, `<input class="form-control" name="year" type="number" value="${esc(d.year)}" placeholder="مثال: 2024">`)}
        </div>
        <div class="form-group"><label>الخدمات المطلوبة <span style="color:var(--danger)">*</span></label>
          <div class="text-xs text-muted mb-2">يمكنك اختيار أكثر من خدمة في طلب واحد، برقم طلب وكود متابعة واحد.</div>
          <div class="ss-services">${SERVICES.map((s, i) => `<label class="ss-service"><input type="checkbox" name="service" value="${esc(s)}" ${d.services.includes(s) ? 'checked' : ''}><span>${s}</span></label>`).join('')}</div></div>
        ${field('تفاصيل الطلب', false, `<textarea class="form-control" name="details" rows="4" placeholder="اكتب أي تفاصيل إضافية لازمة لتنفيذ الطلب">${esc(d.details)}</textarea>`)}
        ${grad ? `<div class="alert alert-info flex items-center justify-between gap-3" style="flex-wrap:wrap"><div><b>استبيان الخريجين مطلوب قبل إرسال الطلب</b><div class="text-xs">${survey ? 'تم حفظ الاستبيان — يمكنك إرسال الطلب.' : 'الاستبيان مطلوب لجميع خدمات الخريجين. بعد حفظه ستعود لنفس الطلب لإرساله.'}</div></div><button type="button" class="btn btn-outline btn-sm" onclick="StudentServices.openSurvey()">${survey ? 'تعديل استبيان الخريجين' : 'فتح استبيان الخريجين'}</button></div>` : ''}
        <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> إرسال الطلب</button>
      </form></div></div>`;
  }
  function collect() {
    const f = document.getElementById('ss-form'); if (!f) return draft;
    const g = n => String((f.querySelector(`[name="${n}"]`) || {}).value || '').trim();
    return { kind: g('kind'), level: g('level'), hours: g('hours'), name: g('name'), program: g('program'), no: g('no'), phone: g('phone'), email: g('email'), year: g('year'), details: g('details'), services: [...f.querySelectorAll('[name=service]:checked')].map(x => x.value) };
  }
  function kindChange() { draft = collect(); renderNew(); }
  function submit(ev) {
    ev.preventDefault(); draft = collect(); const d = draft;
    const bad = (m, n) => { toast(m, 'err'); const el = document.querySelector(`#ss-form [name="${n}"]`); if (el) el.focus(); };
    if (d.name.split(/\s+/).filter(Boolean).length < 3) return bad('اكتب الاسم رباعي', 'name');
    if (!d.kind) return bad('اختر صفة مقدم الطلب', 'kind');
    if (d.hours === '' || Number(d.hours) < 0) return bad('اكتب عدد الساعات المجتازة', 'hours');
    if (!d.program) return bad('اكتب اسم البرنامج', 'program');
    if (!/^01[0-9]{9}$/.test(d.phone)) return bad('رقم الهاتف 11 رقمًا ويبدأ بـ 01', 'phone');
    if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) return bad('البريد الإلكتروني غير صحيح', 'email');
    if (!d.services.length) return toast('اختر خدمة واحدة على الأقل', 'err');
    if (d.kind === 'graduate' && !survey) return toast('استبيان الخريجين مطلوب قبل إرسال الطلب', 'err');
    const list = read(); let id; do { id = 'SCI-' + new Date().getFullYear() + '-' + digits(6); } while (list.some(r => r.id === id));
    const now = new Date().toISOString();
    const r = Object.assign({}, d, { id, code: digits(6), survey: d.kind === 'graduate' ? survey : null, status: 'new', reply: '', createdAt: now, updatedAt: now, createdBy: (user() || {}).username || '' });
    list.unshift(r); write(list); draft = null; survey = null;
    try { const users = JSON.parse(localStorage.getItem('fos_v2_users') || '[]'); users.filter(u => STAFF.includes(u.role)).forEach(u => App.notifyUser(u.username, `طلب جديد ${r.id} — ${r.name}`, { title: 'طلب خدمة طلابية', type: 'info', link: 'ss-desk' })); } catch (_) {}
    root('ss-new').innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:2rem 1rem"><div class="fw-extrabold mb-1" style="font-size:1.1rem"><i class="fas fa-circle-check" style="color:var(--success)"></i> تم إرسال الطلب</div><p class="text-muted text-sm">احتفظ برقم الطلب وكود المتابعة لعرض الحالة ورد شئون الطلاب.</p>
      <div class="grid-2" style="max-width:420px;margin:1rem auto"><div class="card"><div class="card-body"><div class="text-xs text-muted">رقم الطلب</div><div class="fw-extrabold" dir="ltr">${r.id}</div></div></div><div class="card"><div class="card-body"><div class="text-xs text-muted">كود المتابعة</div><div class="fw-extrabold" dir="ltr">${r.code}</div></div></div></div>
      <div class="flex gap-2 justify-center flex-wrap"><button class="btn btn-primary" onclick="StudentServices.openTrack('${r.id}','${r.code}')">متابعة الطلب</button><button class="btn btn-outline" onclick="StudentServices.renderNew()">تقديم طلب جديد</button></div></div></div>`;
  }

  /* ---------- استبيان الخريجين ---------- */
  function openSurvey() {
    draft = collect(); const d = draft; const s = survey || { answers: [], notes: [] };
    const el = root('ss-new');
    const inp = (n, label, req, val, type) => field(label, req, `<input class="form-control" name="${n}" type="${type || 'text'}" value="${esc(val || '')}">`);
    el.innerHTML = `<div class="card"><div class="card-header"><div><div class="fw-extrabold">استبيان لقياس مدى رضا خريجي كلية العلوم — جامعة سوهاج</div><div class="text-xs text-muted">الخطوة المطلوبة لخدمات الخريجين</div></div></div><div class="card-body">
      <p class="text-sm"><b>عزيزي الخريج</b><br>حرصًا من كلية العلوم — جامعة سوهاج على مشاركتكم في التطوير المستمر الذي تسعى إليه الكلية، فقد صُمم هذا الاستبيان لقياس مدى رضاكم عن العملية التعليمية بالكلية ومدى الاستفادة من الدراسة في سوق العمل.</p>
      <p class="text-sm text-muted">أكمل الاستبيان، ثم اضغط «حفظ والعودة إلى الطلب». بيانات طلبك وخدماتك محفوظة أثناء تعبئته.</p>
      <form id="ss-survey" onsubmit="StudentServices.saveSurvey(event)" novalidate>
        <div class="fw-bold mb-2">بيانات الخريج</div>
        <div class="grid-2">${inp('sname', 'الاسم بالكامل', true, s.name || d.name)}${inp('sphone', 'رقم الهاتف الشخصي', true, s.phone || d.phone, 'tel')}${inp('semail', 'البريد الإلكتروني', false, s.email || d.email, 'email')}${inp('syear', 'سنة التخرج', true, s.year || d.year, 'number')}${inp('sprog', 'القسم / التخصص أو البرنامج', true, s.program || d.program)}${inp('swork', 'اسم جهة العمل (مؤسسة / شركة) — اختياري', false, s.work)}${inp('sworkphone', 'تليفون العمل — اختياري', false, s.workPhone, 'tel')}
          ${field('قطاع العمل — اختياري', false, `<select class="form-control" name="ssector"><option value="">اختر</option>${['عام', 'خاص', 'لا أعمل حاليًا'].map(x => `<option ${s.sector === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}</div>
        <div class="alert alert-info mt-3">نرجو التفضل باختيار الإجابة التي تمثل رأيكم — الإجابة عن البنود الاثني عشر مطلوبة. بيانات العمل والاقتراحات اختيارية.</div>
        ${QUESTIONS.map((q, i) => `<div class="ss-q"><div class="fw-bold text-sm mb-2"><span class="ss-qn">${i + 1}</span> ${q}</div><div class="ss-scale">${SCALE.map(o => `<label><input type="radio" name="q${i}" value="${o}" ${s.answers[i] === o ? 'checked' : ''}><span>${o}</span></label>`).join('')}</div></div>`).join('')}
        ${field('الدورات التي تقترحها لتأهيل الخريجين لسوق العمل — اختياري', false, `<textarea class="form-control" name="n0" rows="2">${esc((s.notes || [])[0] || '')}</textarea>`)}
        ${field('البرامج والمقررات الدراسية التي تقترحها لتناسب توجهات سوق العمل حاليًا — اختياري', false, `<textarea class="form-control" name="n1" rows="2">${esc((s.notes || [])[1] || '')}</textarea>`)}
        ${field('ملاحظات أخرى ومقترحات لرفع كفاءة خريج كلية العلوم في سوق العمل — اختياري', false, `<textarea class="form-control" name="n2" rows="2">${esc((s.notes || [])[2] || '')}</textarea>`)}
        <p class="text-center fw-bold">نشكركم على حسن تعاونكم</p>
        <div class="flex gap-2 flex-wrap"><button class="btn btn-primary" type="submit">حفظ والعودة إلى الطلب</button><button class="btn btn-outline" type="button" onclick="StudentServices.renderNew()">العودة للطلب دون حفظ الاستبيان</button></div>
      </form></div></div>`;
    window.scrollTo && el.scrollIntoView({ block: 'start' });
  }
  function saveSurvey(ev) {
    ev.preventDefault(); const f = ev.target; const g = n => String((f.querySelector(`[name="${n}"]`) || {}).value || '').trim();
    if (!g('sname') || !g('sphone') || !g('syear') || !g('sprog')) return toast('أكمل بيانات الخريج المطلوبة', 'err');
    const answers = QUESTIONS.map((_, i) => (f.querySelector(`[name="q${i}"]:checked`) || {}).value || '');
    if (answers.some(a => !a)) return toast('الإجابة عن البنود الاثني عشر مطلوبة', 'err');
    survey = { name: g('sname'), phone: g('sphone'), email: g('semail'), year: g('syear'), program: g('sprog'), work: g('swork'), workPhone: g('sworkphone'), sector: g('ssector'), answers, notes: [g('n0'), g('n1'), g('n2')], at: new Date().toISOString() };
    if (draft && !draft.year) draft.year = survey.year;
    toast('تم حفظ الاستبيان'); renderNew();
  }

  /* ---------- متابعة طلب ---------- */
  function renderTrack(id, code) {
    const el = root('ss-track'); if (!el) return;
    el.innerHTML = `<div class="card"><div class="card-header"><div class="fw-extrabold">متابعة حالة الطلب</div></div><div class="card-body">
      <p class="text-sm text-muted">أدخل رقم الطلب وكود المتابعة اللذين حصلت عليهما عند إرسال الطلب لعرض الحالة ورد شئون الطلاب.</p>
      <form onsubmit="StudentServices.lookup(event)" class="grid-2" style="align-items:end">
        ${field('رقم الطلب', true, `<input class="form-control" id="ss-t-id" dir="ltr" style="text-align:right" placeholder="SCI-2026-XXXXXX" value="${esc(id || '')}">`)}
        ${field('كود المتابعة', true, `<input class="form-control" id="ss-t-code" dir="ltr" style="text-align:right" inputmode="numeric" placeholder="6 أرقام" value="${esc(code || '')}">`)}
        <div class="form-group"><button class="btn btn-primary" type="submit">عرض الحالة والرد</button></div></form></div></div><div id="ss-track-result">${id && code ? result(id, code) : ''}</div>`;
  }
  function result(id, code) {
    const r = read().find(x => x.id.toLowerCase() === String(id).trim().toLowerCase() && x.code === String(code).trim());
    if (!r) return `<div class="card mt-3"><div class="card-body"><div class="empty"><i class="fas fa-circle-question"></i>لم يتم العثور على طلب بهذه البيانات. تأكد من رقم الطلب وكود المتابعة.</div></div></div>`;
    return `<div class="card mt-3"><div class="card-header flex items-center justify-between"><div><div class="text-xs text-muted">رقم الطلب</div><div class="fw-extrabold" dir="ltr">${esc(r.id)}</div></div>${badge(r.status)}</div><div class="card-body">
      <div class="grid-2 text-sm"><div><span class="text-muted">مقدم الطلب:</span> <b>${esc(r.name)}</b></div><div><span class="text-muted">الصفة:</span> <b>${r.kind === 'graduate' ? 'خريج' : 'طالب حالي'}</b></div><div><span class="text-muted">تاريخ التقديم:</span> <b>${fmt(r.createdAt)}</b></div><div><span class="text-muted">آخر تحديث:</span> <b>${fmt(r.updatedAt)}</b></div></div>
      <div class="mt-3"><div class="text-muted text-sm mb-1">الخدمات المطلوبة</div><div>${r.services.map(s => `<span class="badge badge-gray" style="margin:0 0 .3rem .3rem">${esc(s)}</span>`).join('')}</div></div>
      <div class="mt-3"><div class="text-muted text-sm mb-1">رد شئون الطلاب</div>${r.reply ? `<div class="alert alert-success">${esc(r.reply)}</div>` : '<div class="alert alert-info">لم يصل رد بعد. سيظهر هنا عند مراجعة الطلب.</div>'}</div></div></div>`;
  }
  function lookup(ev) { ev.preventDefault(); document.getElementById('ss-track-result').innerHTML = result(document.getElementById('ss-t-id').value, document.getElementById('ss-t-code').value); }
  function openTrack(id, code) { if (window.App) App.navigate('ss-track'); renderTrack(id, code); }

  /* ---------- إدارة الطلبات ---------- */
  function renderDesk() {
    const el = root('ss-desk'); if (!el) return;
    if (open) return renderOne(open);
    const q = filt.q.trim().toLowerCase();
    const rows = read().filter(r => (!filt.status || r.status === filt.status) && (!q || [r.id, r.name, r.no, r.phone].some(v => String(v || '').toLowerCase().includes(q))));
    el.innerHTML = `<div class="flex gap-2 mb-3 flex-wrap"><input class="form-control" style="flex:1;min-width:220px" placeholder="ابحث بالاسم أو رقم الطلب أو الهاتف" value="${esc(filt.q)}" oninput="StudentServices.setF('q',this.value)"><select class="form-control" style="width:auto" onchange="StudentServices.setF('status',this.value,true)"><option value="">كل الحالات</option>${Object.keys(STATUS).map(k => `<option value="${k}" ${filt.status === k ? 'selected' : ''}>${STATUS[k][0]}</option>`).join('')}</select></div>
      <div class="card"><div class="card-body" id="ss-desk-list">${tableHTML(rows)}</div></div>`;
  }
  function tableHTML(rows) {
    if (!rows.length) return '<div class="empty"><i class="fas fa-inbox"></i>لا توجد طلبات</div>';
    return `<div class="table-wrap"><table class="data"><thead><tr><th>رقم الطلب</th><th>مقدم الطلب</th><th>الصفة</th><th>الخدمات</th><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>${rows.map(r => `<tr style="cursor:pointer" onclick="StudentServices.openOne('${esc(r.id)}')"><td dir="ltr"><b>${esc(r.id)}</b></td><td>${esc(r.name)}</td><td>${r.kind === 'graduate' ? 'خريج' : 'طالب حالي'}</td><td>${esc(r.services.join('، '))}</td><td>${fmt(r.createdAt)}</td><td>${badge(r.status)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function setF(k, v, full) {
    filt[k] = v;
    if (full) return renderDesk();
    const q = filt.q.trim().toLowerCase();
    document.getElementById('ss-desk-list').innerHTML = tableHTML(read().filter(r => (!filt.status || r.status === filt.status) && (!q || [r.id, r.name, r.no, r.phone].some(x => String(x || '').toLowerCase().includes(q)))));
  }
  function openOne(id) { open = id; renderDesk(); }
  function renderOne(id) {
    const r = read().find(x => x.id === id); const el = root('ss-desk');
    if (!r) { open = null; return renderDesk(); }
    const kv = (a, b) => `<div><span class="text-muted">${a}:</span> <b>${esc(b || '—')}</b></div>`;
    el.innerHTML = `<button class="btn btn-sm btn-outline mb-3" onclick="StudentServices.back()"><i class="fas fa-arrow-right"></i> رجوع</button>
      <div class="card"><div class="card-header flex items-center justify-between"><div><div class="text-xs text-muted">رقم الطلب</div><div class="fw-extrabold" dir="ltr">${esc(r.id)}</div></div>${badge(r.status)}</div><div class="card-body">
        <div class="grid-2 text-sm">${kv('الاسم', r.name)}${kv('الصفة', r.kind === 'graduate' ? 'خريج' : 'طالب حالي')}${kv('المستوى الدراسي', r.level)}${kv('الساعات المجتازة', r.hours)}${kv('البرنامج', r.program)}${kv('الرقم الجامعي / رقم الجلوس', r.no)}${kv('الهاتف', r.phone)}${kv('البريد الإلكتروني', r.email)}${kv('سنة التخرج', r.year)}${kv('كود المتابعة', r.code)}${kv('تاريخ التقديم', fmt(r.createdAt))}</div>
        <div class="mt-3"><div class="text-muted text-sm mb-1">الخدمات المطلوبة</div>${r.services.map(s => `<span class="badge badge-gray" style="margin:0 0 .3rem .3rem">${esc(s)}</span>`).join('')}</div>
        ${r.details ? `<div class="mt-3"><div class="text-muted text-sm mb-1">تفاصيل الطلب</div><div class="text-sm">${esc(r.details)}</div></div>` : ''}
        ${r.survey ? `<div class="mt-3"><div class="text-muted text-sm mb-1">استبيان الخريجين</div><div class="alert alert-success">تم تعبئة الاستبيان (${r.survey.answers.length} بنود)${r.survey.work ? ' — جهة العمل: ' + esc(r.survey.work) : ''}</div></div>` : ''}
      </div></div>
      <div class="card mt-3"><div class="card-header"><div class="fw-extrabold">الحالة والرد</div></div><div class="card-body">
        ${field('الحالة', false, `<select class="form-control" id="ss-st">${Object.keys(STATUS).map(k => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${STATUS[k][0]}</option>`).join('')}</select>`)}
        ${field('رد شئون الطلاب (يظهر لمقدم الطلب عند المتابعة)', false, `<textarea class="form-control" id="ss-reply" rows="3">${esc(r.reply)}</textarea>`)}
        <button class="btn btn-primary" onclick="StudentServices.save('${esc(r.id)}')">حفظ</button></div></div>`;
  }
  function save(id) {
    const list = read(); const r = list.find(x => x.id === id); if (!r) return;
    const st = document.getElementById('ss-st').value, reply = document.getElementById('ss-reply').value.trim();
    if (st === 'rejected' && !reply) return toast('اكتب سبب الرفض في الرد', 'err');
    r.status = st; r.reply = reply; r.updatedAt = new Date().toISOString(); write(list);
    try { if (r.no && window.App) App.notifyUser(r.no, `تحديث على طلبك ${r.id}: ${STATUS[st][0]}${reply ? ' — ' + reply : ''}`, { title: 'طلب خدمة طلابية', type: st === 'rejected' ? 'error' : 'info', link: 'ss-track' }); } catch (_) {}
    toast('تم الحفظ'); renderOne(id);
  }
  function back() { open = null; renderDesk(); }

  function renderApp(page) { if (page === 'ss-new') renderNew(); else if (page === 'ss-track') renderTrack(); else if (page === 'ss-desk') { open = null; renderDesk(); } }
  window.StudentServices = { renderApp, renderNew, kindChange, submit, openSurvey, saveSurvey, lookup, openTrack, setF, openOne, back, save };
})();
