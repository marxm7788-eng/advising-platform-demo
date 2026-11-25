/* مركز خدمات الطلاب والخريجين — كلية العلوم، جامعة سوهاج
   وحدة مستقلة: تقديم الطلبات (طالب / خريج)، متابعة الطلب بالرقم + الكود، مكتب الموظف، ومؤشرات الأداء.
   التخزين داخل المتصفح فقط (مثل بقية المنصة). */
(function () {
  'use strict';

  const KEY = 'fos_v2_ss_requests';
  const SEEDED = 'fos_v2_ss_seeded';
  const DAY = 86400000;

  const STATUS = {
    received:   { label: 'تم الاستلام',     tone: 'blue',   icon: 'fa-inbox' },
    review:     { label: 'قيد المراجعة',    tone: 'teal',   icon: 'fa-magnifying-glass' },
    processing: { label: 'جاري التجهيز',    tone: 'indigo', icon: 'fa-gears' },
    ready:      { label: 'جاهز للاستلام',   tone: 'green',  icon: 'fa-box-open' },
    delivered:  { label: 'تم التسليم',      tone: 'gray',   icon: 'fa-circle-check' },
    needs_info: { label: 'مطلوب استكمال',   tone: 'violet', icon: 'fa-circle-exclamation' },
    rejected:   { label: 'مرفوض',           tone: 'red',    icon: 'fa-circle-xmark' }
  };
  const FLOW = ['received', 'review', 'processing', 'ready', 'delivered'];
  const OPEN = ['received', 'review', 'processing', 'needs_info'];
  const SLA_DAYS = 5;

  const SERVICES = [
    { id: 'enrollment', title: 'شهادة قيد', icon: 'fa-id-card', cat: 'شهادات', who: ['student'], days: 2, lang: true,
      desc: 'إفادة رسمية بأنك مقيد بالكلية في العام الدراسي الحالي.', docs: ['صورة بطاقة الرقم القومي', 'إيصال سداد المصروفات'] },
    { id: 'status', title: 'بيان حالة', icon: 'fa-clipboard-check', cat: 'شهادات', who: ['student', 'graduate'], days: 3, lang: true,
      desc: 'بيان بالموقف الدراسي والعبء الأكاديمي وعدد الساعات المنجزة.', docs: ['صورة بطاقة الرقم القومي'] },
    { id: 'graduation', title: 'شهادة تخرج', icon: 'fa-graduation-cap', cat: 'شهادات', who: ['graduate'], days: 7, lang: true,
      desc: 'إفادة بالتخرج وتاريخ منح الدرجة والتقدير العام.', docs: ['صورة بطاقة الرقم القومي', 'صورة شخصية حديثة'] },
    { id: 'grades', title: 'كشف درجات', icon: 'fa-table-list', cat: 'كشوف', who: ['student', 'graduate'], days: 4, lang: true,
      desc: 'كشف تفصيلي بالمقررات والدرجات والمعدل التراكمي (عربي أو إنجليزي).', docs: ['صورة بطاقة الرقم القومي'] },
    { id: 'gpa', title: 'إفادة بالمعدل التراكمي', icon: 'fa-chart-line', cat: 'كشوف', who: ['student', 'graduate'], days: 2, lang: true,
      desc: 'إفادة مختصرة بالمعدل التراكمي والتقدير لتقديمها لجهة خارجية.', docs: ['صورة بطاقة الرقم القومي'] },
    { id: 'code', title: 'الكود الجامعي', icon: 'fa-hashtag', cat: 'بيانات', who: ['student', 'graduate'], days: 1, lang: false,
      desc: 'استخراج أو تأكيد الكود الجامعي أو رقم الجلوس.', docs: ['صورة بطاقة الرقم القومي'] },
    { id: 'military', title: 'إفادة موقف التجنيد', icon: 'fa-file-shield', cat: 'شهادات', who: ['student', 'graduate'], days: 3, lang: false,
      desc: 'إفادة بالموقف الدراسي لاستخدامها في إجراءات التجنيد (للذكور).', docs: ['صورة بطاقة الرقم القومي', 'صورة بطاقة الخدمة العسكرية إن وجدت'] },
    { id: 'withdraw', title: 'سحب ملف', icon: 'fa-folder-open', cat: 'ملفات', who: ['student', 'graduate'], days: 7, lang: false,
      desc: 'طلب سحب الملف الدراسي من الكلية بعد استيفاء إخلاء الطرف.', docs: ['صورة بطاقة الرقم القومي', 'إخلاء طرف من المكتبة والمعامل', 'إقرار بسحب الملف'] },
    { id: 'other', title: 'طلب آخر', icon: 'fa-pen-to-square', cat: 'أخرى', who: ['student', 'graduate'], days: 5, lang: false,
      desc: 'أي طلب إداري لا يندرج تحت الخدمات السابقة، اشرحه في الملاحظات.', docs: [] }
  ];
  const svc = id => SERVICES.find(s => s.id === id);
  const PURPOSES = ['جهة عمل', 'سفارة / قنصلية', 'التقديم لدراسات عليا', 'جهة حكومية', 'ملف شخصي', 'أخرى'];
  const LEVELS = [['1', 'المستوى الأول'], ['2', 'المستوى الثاني'], ['3', 'المستوى الثالث'], ['4', 'المستوى الرابع']];
  const LANG = { ar: 'عربي', en: 'إنجليزي', both: 'عربي + إنجليزي' };

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const user = () => (window.App && App.getCurrentUser && App.getCurrentUser()) || null;
  const STAFF_ROLES = ['affairs', 'vice', 'dean', 'manager', 'admin'];
  const isStaff = () => !!user() && STAFF_ROLES.includes(user().role);
  const toast = (m, t) => { const el = document.getElementById('toast'); if (!el) return; el.textContent = m; el.className = 'toast show' + (t === 'err' ? ' err' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 3200); };
  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString('ar-EG-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return ''; } };
  const fmtDT = iso => { try { return new Date(iso).toLocaleString('ar-EG-u-ca-gregory', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; } };
  const ageDays = r => Math.max(0, Math.floor(((r.status === 'delivered' || r.status === 'rejected' ? new Date(r.closedAt || r.updatedAt) : new Date()) - new Date(r.createdAt)) / DAY));
  const badge = s => { const st = STATUS[s] || STATUS.received; return `<span class="ss-badge ss-tone-${st.tone}"><i class="fas ${st.icon}"></i>${st.label}</span>`; };

  /* ---------- التخزين ---------- */
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } }
  function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { toast('تعذر الحفظ — مساحة المتصفح ممتلئة', 'err'); } }
  function nextId(list) {
    const y = new Date().getFullYear();
    const n = list.map(r => Number(String(r.id).split('-')[2]) || 0).reduce((a, b) => Math.max(a, b), 0) + 1;
    return `SV-${y}-${String(n).padStart(4, '0')}`;
  }
  function seedOnce() {
    try { if (localStorage.getItem(SEEDED)) return; } catch (_) { return; }
    if (read().length) { localStorage.setItem(SEEDED, '1'); return; }
    const now = Date.now();
    const mk = (i, name, code, type, level, program, svcs, status, ageD, lang, extra) => {
      const created = new Date(now - ageD * DAY - i * 3600000).toISOString();
      const hist = [{ status: 'received', at: created, by: 'النظام', note: 'تم استلام الطلب' }];
      const idx = FLOW.indexOf(status);
      for (let k = 1; k <= idx; k++) hist.push({ status: FLOW[k], at: new Date(new Date(created).getTime() + k * DAY * 0.8).toISOString(), by: 'شؤون الطلاب', note: '' });
      if (status === 'needs_info') hist.push({ status: 'needs_info', at: new Date(new Date(created).getTime() + DAY).toISOString(), by: 'شؤون الطلاب', note: 'برجاء إحضار صورة بطاقة الرقم القومي واضحة' });
      if (status === 'rejected') hist.push({ status: 'rejected', at: new Date(new Date(created).getTime() + DAY).toISOString(), by: 'شؤون الطلاب', note: 'بيانات الطلب غير مطابقة لسجل الكلية' });
      const last = hist[hist.length - 1];
      return Object.assign({ id: '', name, code, type, level, program, hours: type === 'student' ? 60 + i * 7 : 140, gradYear: type === 'graduate' ? String(2019 + (i % 6)) : '', phone: '01' + String(100000000 + i * 12345678).slice(0, 9), email: '', services: svcs, lang, purpose: PURPOSES[i % 5], notes: '', status, history: hist, createdAt: created, updatedAt: last.at, closedAt: ['delivered', 'rejected'].includes(status) ? last.at : '', assignee: i % 3 === 0 ? 'أ. صفاء فتحي مرسي' : '', demo: true }, extra || {});
    };
    const data = [
      mk(1, 'أحمد محمود علي حسن', '2301101', 'student', '3', 'برنامج الكيمياء', ['enrollment'], 'received', 0, 'ar'),
      mk(2, 'منى عبد الله إبراهيم سيد', '2201045', 'student', '4', 'برنامج الفيزياء', ['grades', 'gpa'], 'review', 1, 'en'),
      mk(3, 'يوسف خالد محمد عمر', '1901233', 'graduate', '4', 'برنامج الجيولوجيا', ['graduation', 'grades'], 'processing', 3, 'both'),
      mk(4, 'سارة أحمد عبد الرحمن', '2101378', 'student', '2', 'برنامج الرياضيات', ['status'], 'ready', 4, 'ar'),
      mk(5, 'محمد إبراهيم صالح', '1801090', 'graduate', '4', 'برنامج النبات والكيمياء', ['graduation'], 'delivered', 9, 'en'),
      mk(6, 'نورهان سعيد فتحي', '2301412', 'student', '1', 'برنامج علم الحيوان والكيمياء', ['code'], 'delivered', 6, 'ar'),
      mk(7, 'عمر حسام الدين طه', '2001567', 'student', '4', 'برنامج الجيوفيزياء', ['military'], 'needs_info', 2, 'ar'),
      mk(8, 'هبة الله مصطفى كامل', '1701822', 'graduate', '4', 'برنامج الكيمياء الحيوية', ['grades'], 'review', 6, 'en'),
      mk(9, 'إسلام جمال محمود', '2201990', 'student', '3', 'برنامج الإحصاء الرياضي والبرمجة', ['withdraw'], 'processing', 8, 'ar'),
      mk(10, 'آية رمضان عبد العزيز', '2102260', 'student', '2', 'برنامج الميكروبيولوجي والكيمياء', ['other'], 'rejected', 5, 'ar', { notes: 'طلب تغيير بيانات الميلاد' }),
      mk(11, 'كريم عادل أنور', '1601745', 'graduate', '4', 'برنامج الرياضيات', ['status', 'gpa'], 'ready', 2, 'both'),
      mk(12, 'ريم طارق أبو الوفا', '2302005', 'student', '1', 'برنامج الجيولوجيا والكيمياء', ['enrollment', 'code'], 'received', 0, 'ar')
    ];
    let list = [];
    data.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach(r => { r.id = nextId(list); list.push(r); });
    write(list);
    try { localStorage.setItem(SEEDED, '1'); } catch (_) {}
  }

  /* ---------- مكونات مشتركة ---------- */
  function hero(title, sub, icon, actions) {
    return `<header class="ss-hero"><div class="ss-hero-text"><span class="ss-kicker"><i class="fas ${icon}"></i> كلية العلوم · جامعة سوهاج</span><h1>${title}</h1><p>${sub}</p></div>${actions ? `<div class="ss-hero-actions">${actions}</div>` : ''}</header>`;
  }
  function stepper(r) {
    if (r.status === 'rejected' || r.status === 'needs_info') {
      const st = STATUS[r.status];
      return `<div class="ss-alert ss-tone-${st.tone}"><i class="fas ${st.icon}"></i><div><b>${st.label}</b><span>${esc(lastNote(r) || (r.status === 'rejected' ? 'تم رفض الطلب.' : 'برجاء استكمال المطلوب ثم مراجعة شؤون الطلاب.'))}</span></div></div>`;
    }
    const idx = FLOW.indexOf(r.status);
    return `<ol class="ss-steps">${FLOW.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}"><span class="ss-step-dot"><i class="fas ${i <= idx ? (i < idx ? 'fa-check' : STATUS[s].icon) : STATUS[s].icon}"></i></span><b>${STATUS[s].label}</b></li>`).join('')}</ol>`;
  }
  const lastNote = r => { const h = (r.history || []).slice().reverse().find(x => x.note); return h ? h.note : ''; };
  function timeline(r) {
    return `<ul class="ss-timeline">${(r.history || []).slice().reverse().map(h => `<li><span class="ss-tl-dot ss-tone-${(STATUS[h.status] || STATUS.received).tone}"></span><div><b>${(STATUS[h.status] || {}).label || h.status}</b><small>${fmtDT(h.at)} · ${esc(h.by || '')}</small>${h.note ? `<p>${esc(h.note)}</p>` : ''}</div></li>`).join('')}</ul>`;
  }
  function itemsText(r) { return (r.services || []).map(id => (svc(id) || { title: id }).title).join(' + '); }
  function receiptHTML(r) {
    const docs = [...new Set((r.services || []).flatMap(id => (svc(id) || { docs: [] }).docs))];
    const maxDays = Math.max(...(r.services || []).map(id => (svc(id) || { days: 3 }).days), 1);
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إيصال ${esc(r.id)}</title><style>
      body{font-family:Cairo,Tahoma,Arial,sans-serif;margin:0;padding:28px;color:#0f172a}
      .box{max-width:720px;margin:0 auto;border:2px solid #0c1e36;border-radius:16px;padding:26px}
      h1{margin:0 0 4px;font-size:20px;color:#0c1e36}.sub{color:#475569;font-size:13px;margin-bottom:18px}
      .no{display:flex;justify-content:space-between;align-items:center;background:#eff6ff;border-radius:12px;padding:14px 18px;margin-bottom:16px}
      .no b{font-size:24px;letter-spacing:1px;direction:ltr}table{width:100%;border-collapse:collapse;font-size:14px;margin-bottom:14px}
      td{padding:8px 6px;border-bottom:1px solid #e2e8f0}td:first-child{color:#64748b;width:34%}ul{margin:4px 0 0;padding-right:20px;font-size:13px}
      .foot{margin-top:18px;font-size:12px;color:#64748b;display:flex;justify-content:space-between}</style></head><body><div class="box">
      <h1>كلية العلوم — جامعة سوهاج</h1><div class="sub">إيصال استلام طلب خدمة طلابية</div>
      <div class="no"><span>رقم الطلب</span><b>${esc(r.id)}</b></div>
      <table><tr><td>الاسم</td><td>${esc(r.name)}</td></tr><tr><td>الكود الجامعي</td><td>${esc(r.code)}</td></tr>
      <tr><td>الصفة</td><td>${r.type === 'graduate' ? 'خريج' + (r.gradYear ? ' — ' + esc(r.gradYear) : '') : 'طالب حالي — المستوى ' + esc(r.level)}</td></tr>
      <tr><td>البرنامج</td><td>${esc(r.program)}</td></tr><tr><td>الخدمات المطلوبة</td><td>${esc(itemsText(r))}</td></tr>
      <tr><td>اللغة</td><td>${esc(LANG[r.lang] || '')}</td></tr><tr><td>تاريخ التقديم</td><td>${fmtDate(r.createdAt)}</td></tr>
      <tr><td>المدة المتوقعة</td><td>حتى ${maxDays} أيام عمل</td></tr></table>
      ${docs.length ? `<b style="font-size:13px">أحضر عند الاستلام:</b><ul>${docs.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
      <div class="foot"><span>تابع طلبك من المنصة بالرقم + الكود الجامعي</span><span>التوقيع: ................</span></div></div>
      <script>window.onload=function(){window.print()}<\/script></body></html>`;
  }
  function printReceipt(id) {
    const r = read().find(x => x.id === id); if (!r) return;
    const w = window.open('', '_blank'); if (!w) return toast('اسمح بالنوافذ المنبثقة للطباعة', 'err');
    w.document.write(receiptHTML(r)); w.document.close();
  }

  /* ---------- كتالوج الخدمات ---------- */
  function catalogHTML(ctx) {
    const cats = [...new Set(SERVICES.map(s => s.cat))];
    return cats.map(c => `<section class="ss-cat"><h3>${c}</h3><div class="ss-grid">${SERVICES.filter(s => s.cat === c).map(s => `
      <article class="ss-card">
        <span class="ss-card-ico"><i class="fas ${s.icon}"></i></span>
        <div class="ss-card-body"><h4>${s.title}</h4><p>${s.desc}</p>
          <div class="ss-meta"><span><i class="far fa-clock"></i> حتى ${s.days} ${s.days === 1 ? 'يوم' : 'أيام'} عمل</span><span><i class="fas fa-user-group"></i> ${s.who.length === 2 ? 'طالب وخريج' : s.who[0] === 'student' ? 'طالب' : 'خريج'}</span></div></div>
        <button type="button" class="ss-link" onclick="StudentServices.pick('${ctx}','${s.id}')">اطلب الخدمة <i class="fas fa-arrow-left"></i></button>
      </article>`).join('')}</div></section>`).join('');
  }

  /* ---------- نموذج الطلب ---------- */
  let formState = { type: 'student', picked: [] };
  function formHTML(ctx) {
    const u = (ctx !== 'public' && user() && user().role === 'student') ? user() : {};
    const programs = (window.FOS_SEED && FOS_SEED.programs) || [];
    formState.type = formState.type || 'student';
    const t = formState.type;
    const avail = SERVICES.filter(s => s.who.includes(t));
    formState.picked = formState.picked.filter(id => avail.some(s => s.id === id));
    const f = (id, label, input, cls) => `<label class="ss-field ${cls || ''}"><span>${label}</span>${input}</label>`;
    const val = (k) => esc(u[k] || '');
    return `<form class="ss-form" id="ss-form-${ctx}" onsubmit="StudentServices.submit(event,'${ctx}')" novalidate>
      <div class="ss-form-main">
        <div class="ss-panel">
          <div class="ss-panel-head"><span class="ss-num">1</span><div><h3>صفتك</h3><p>اختر صفتك لتظهر لك الخدمات المناسبة.</p></div></div>
          <div class="ss-seg" role="tablist">
            <button type="button" class="${t === 'student' ? 'on' : ''}" onclick="StudentServices.setType('${ctx}','student')"><i class="fas fa-user-graduate"></i> طالب حالي</button>
            <button type="button" class="${t === 'graduate' ? 'on' : ''}" onclick="StudentServices.setType('${ctx}','graduate')"><i class="fas fa-award"></i> خريج</button>
          </div>
        </div>
        <div class="ss-panel">
          <div class="ss-panel-head"><span class="ss-num">2</span><div><h3>بياناتك</h3><p>نفس البيانات المسجلة بالكلية لتسريع المراجعة.</p></div></div>
          <div class="ss-fields">
            ${f('name', 'الاسم رباعي', `<input class="form-control" name="name" value="${val('name')}" placeholder="الاسم كما في الكلية" required>`, 'span2')}
            ${f('code', 'الكود الجامعي / رقم الجلوس', `<input class="form-control" name="code" inputmode="numeric" value="${val('code')}" placeholder="مثال: 2301101" required>`)}
            ${f('program', 'البرنامج', `<select class="form-control" name="program" required><option value="">اختر البرنامج</option>${programs.map(p => `<option ${u.program === p.nameAr ? 'selected' : ''}>${esc(p.nameAr)}</option>`).join('')}</select>`)}
            ${t === 'student' ? f('level', 'المستوى', `<select class="form-control" name="level" required>${LEVELS.map(l => `<option value="${l[0]}" ${String(u.level) === l[0] ? 'selected' : ''}>${l[1]}</option>`).join('')}</select>`) + f('hours', 'الساعات المنجزة', `<input class="form-control" name="hours" type="number" min="0" max="200" value="${esc(u.completedHours || '')}" placeholder="عدد الساعات">`) : f('gradYear', 'سنة التخرج', `<input class="form-control" name="gradYear" inputmode="numeric" maxlength="4" placeholder="مثال: 2022" required>`)}
            ${f('phone', 'رقم الهاتف', `<input class="form-control" name="phone" inputmode="tel" dir="ltr" value="${val('phone')}" placeholder="01xxxxxxxxx" required>`)}
            ${f('email', 'البريد الإلكتروني (اختياري)', `<input class="form-control" name="email" type="email" dir="ltr" value="${val('email')}" placeholder="name@example.com">`)}
          </div>
        </div>
        <div class="ss-panel">
          <div class="ss-panel-head"><span class="ss-num">3</span><div><h3>الخدمات المطلوبة</h3><p>يمكنك اختيار أكثر من خدمة في طلب واحد.</p></div></div>
          <div class="ss-pick">${avail.map(s => `<button type="button" class="ss-pick-item ${formState.picked.includes(s.id) ? 'on' : ''}" onclick="StudentServices.toggle('${ctx}','${s.id}')"><span class="ss-pick-ico"><i class="fas ${s.icon}"></i></span><span class="ss-pick-t"><b>${s.title}</b><small>حتى ${s.days} ${s.days === 1 ? 'يوم' : 'أيام'} عمل</small></span><span class="ss-pick-check"><i class="fas fa-check"></i></span></button>`).join('')}</div>
          <div class="ss-fields ss-fields-tight">
            ${f('lang', 'لغة الشهادة', `<select class="form-control" name="lang"><option value="ar">عربي</option><option value="en">إنجليزي</option><option value="both">عربي + إنجليزي</option></select>`)}
            ${f('purpose', 'الجهة المطلوب لها', `<select class="form-control" name="purpose">${PURPOSES.map(p => `<option>${p}</option>`).join('')}</select>`)}
            ${f('notes', 'ملاحظات (اختياري)', `<textarea class="form-control" name="notes" rows="3" placeholder="أي تفاصيل تساعد في تنفيذ الطلب"></textarea>`, 'span2')}
          </div>
        </div>
      </div>
      <aside class="ss-summary" id="ss-summary-${ctx}">${summaryHTML()}</aside>
    </form>`;
  }
  function summaryHTML() {
    const picked = formState.picked.map(svc).filter(Boolean);
    const docs = [...new Set(picked.flatMap(s => s.docs))];
    const days = picked.length ? Math.max(...picked.map(s => s.days)) : 0;
    return `<div class="ss-sum-card"><h3><i class="fas fa-receipt"></i> ملخص الطلب</h3>
      ${picked.length ? `<ul class="ss-sum-list">${picked.map(s => `<li><i class="fas ${s.icon}"></i><span>${s.title}</span></li>`).join('')}</ul>
      <div class="ss-sum-row"><span>المدة المتوقعة</span><b>حتى ${days} ${days === 1 ? 'يوم' : 'أيام'} عمل</b></div>
      ${docs.length ? `<div class="ss-sum-docs"><b>أحضر عند الاستلام</b><ul>${docs.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}` : '<p class="ss-sum-empty">اختر خدمة واحدة على الأقل لتظهر تفاصيل الطلب هنا.</p>'}
      <button type="submit" class="btn btn-primary btn-block" ${picked.length ? '' : 'disabled'}><i class="fas fa-paper-plane"></i> إرسال الطلب</button>
      <small class="ss-sum-note">ستحصل على رقم طلب لمتابعته مع كودك الجامعي.</small></div>`;
  }
  function setType(ctx, t) { formState.type = t; formState.picked = []; renderInto(ctx, 'new'); }
  function toggle(ctx, id) {
    const i = formState.picked.indexOf(id); if (i >= 0) formState.picked.splice(i, 1); else formState.picked.push(id);
    const form = document.getElementById('ss-form-' + ctx); if (!form) return;
    form.querySelectorAll('.ss-pick-item').forEach(b => { const m = /'([a-z]+)'\)$/.exec(b.getAttribute('onclick')); if (m) b.classList.toggle('on', formState.picked.includes(m[1])); });
    document.getElementById('ss-summary-' + ctx).innerHTML = summaryHTML();
  }
  function pick(ctx, id) { formState.type = (svc(id).who.includes(formState.type) ? formState.type : svc(id).who[0]); formState.picked = [id]; if (ctx === 'public') renderInto(ctx, 'new'); else App.navigate('ss-new'); }

  function submit(ev, ctx) {
    ev.preventDefault();
    const fd = new FormData(ev.target); const g = k => String(fd.get(k) || '').trim();
    const t = formState.type;
    const err = (m, n) => { toast(m, 'err'); const el = ev.target.querySelector(`[name="${n}"]`); if (el) { el.focus(); el.classList.add('ss-invalid'); } };
    ev.target.querySelectorAll('.ss-invalid').forEach(e => e.classList.remove('ss-invalid'));
    if (g('name').split(/\s+/).length < 3) return err('اكتب الاسم ثلاثي على الأقل', 'name');
    if (!/^\d{4,}$/.test(g('code'))) return err('الكود الجامعي أرقام فقط (4 على الأقل)', 'code');
    if (!g('program')) return err('اختر البرنامج', 'program');
    if (t === 'graduate' && !/^(19|20)\d{2}$/.test(g('gradYear'))) return err('اكتب سنة التخرج بشكل صحيح', 'gradYear');
    if (!/^01[0-9]{9}$/.test(g('phone'))) return err('رقم الهاتف 11 رقمًا ويبدأ بـ 01', 'phone');
    if (g('email') && !/^\S+@\S+\.\S+$/.test(g('email'))) return err('البريد الإلكتروني غير صحيح', 'email');
    if (!formState.picked.length) return toast('اختر خدمة واحدة على الأقل', 'err');
    const list = read(); const now = new Date().toISOString();
    const r = { id: nextId(list), name: g('name'), code: g('code'), type: t, level: t === 'student' ? g('level') : '', program: g('program'), hours: g('hours'), gradYear: g('gradYear'), phone: g('phone'), email: g('email'), services: formState.picked.slice(), lang: g('lang') || 'ar', purpose: g('purpose'), notes: g('notes'), status: 'received', history: [{ status: 'received', at: now, by: 'مقدم الطلب', note: 'تم استلام الطلب' }], createdAt: now, updatedAt: now, closedAt: '', assignee: '', channel: ctx };
    list.unshift(r); write(list);
    try { if (window.App && App.notifyUser) staffNotify(r); } catch (_) {}
    formState = { type: formState.type, picked: [] };
    const root = rootFor(ctx);
    root.innerHTML = `<div class="ss-shell"><div class="ss-success"><span class="ss-success-mark"><i class="fas fa-check"></i></span><h2>تم استلام طلبك</h2><p>احتفظ برقم الطلب لمتابعته، ولا تحتاج للحضور قبل أن تصبح الحالة «جاهز للاستلام».</p>
      <div class="ss-refbox"><small>رقم الطلب</small><strong>${esc(r.id)}</strong><button type="button" class="ss-copy" onclick="StudentServices.copy('${esc(r.id)}')"><i class="far fa-copy"></i> نسخ</button></div>
      <div class="ss-success-actions"><button class="btn btn-primary" onclick="StudentServices.openTrack('${ctx}','${esc(r.id)}','${esc(r.code)}')"><i class="fas fa-location-dot"></i> متابعة الطلب</button><button class="btn btn-outline" onclick="StudentServices.print('${esc(r.id)}')"><i class="fas fa-print"></i> طباعة الإيصال</button><button class="btn btn-outline" onclick="StudentServices.go('${ctx}','new')">طلب جديد</button></div></div></div>`;
    window.scrollTo && root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function staffNotify(r) {
    const users = (() => { try { return JSON.parse(localStorage.getItem('fos_v2_users') || '[]'); } catch (_) { return []; } })();
    users.filter(u => u.role === 'affairs' || u.role === 'admin').forEach(u => App.notifyUser(u.username, `طلب خدمة جديد ${r.id} — ${r.name} (${itemsText(r)})`, { title: 'طلب خدمة طلابية', type: 'info', link: 'ss-desk' }));
  }
  function copy(t) { try { navigator.clipboard.writeText(t); toast('تم نسخ رقم الطلب'); } catch (_) { toast(t); } }

  /* ---------- المتابعة ---------- */
  function trackHTML(ctx, preId, preCode) {
    const u = user();
    const mine = (ctx !== 'public' && u && u.role === 'student') ? read().filter(r => String(r.code) === String(u.code || u.username)) : [];
    return `<div class="ss-track">
      <div class="ss-panel ss-track-search"><div class="ss-panel-head"><span class="ss-num"><i class="fas fa-magnifying-glass"></i></span><div><h3>تتبع طلبك</h3><p>اكتب رقم الطلب والكود الجامعي كما ظهرا في الإيصال.</p></div></div>
        <form class="ss-track-form" onsubmit="StudentServices.lookup(event,'${ctx}')"><input class="form-control" id="ss-t-id-${ctx}" dir="ltr" placeholder="SV-2026-0001" value="${esc(preId || '')}" required><input class="form-control" id="ss-t-code-${ctx}" inputmode="numeric" dir="ltr" placeholder="الكود الجامعي" value="${esc(preCode || '')}" required><button class="btn btn-primary"><i class="fas fa-search"></i> بحث</button></form></div>
      ${mine.length ? `<div class="ss-panel"><div class="ss-panel-head"><span class="ss-num"><i class="fas fa-list-check"></i></span><div><h3>طلباتي</h3><p>طلبات الخدمات المسجلة على كودك.</p></div></div><div class="ss-mine">${mine.map(r => `<button type="button" class="ss-mine-row" onclick="StudentServices.show('${ctx}','${esc(r.id)}')"><span><b>${esc(itemsText(r))}</b><small>${esc(r.id)} · ${fmtDate(r.createdAt)}</small></span>${badge(r.status)}</button>`).join('')}</div></div>` : ''}
      <div id="ss-track-result-${ctx}">${preId && preCode ? resultHTML(preId, preCode) : ''}</div></div>`;
  }
  function resultHTML(id, code) {
    const r = read().find(x => x.id.toLowerCase() === String(id).trim().toLowerCase() && String(x.code) === String(code).trim());
    if (!r) return `<div class="ss-empty"><i class="fas fa-circle-question"></i><b>لم نجد طلبًا بهذه البيانات</b><span>تأكد من رقم الطلب والكود الجامعي ثم حاول مرة أخرى.</span></div>`;
    return detailCard(r, false);
  }
  function detailCard(r, staff) {
    const st = STATUS[r.status];
    return `<div class="ss-panel ss-detail"><div class="ss-detail-head"><div><small>رقم الطلب</small><h3 dir="ltr">${esc(r.id)}</h3></div>${badge(r.status)}</div>
      ${stepper(r)}
      <div class="ss-kv"><div><small>مقدم الطلب</small><b>${esc(r.name)}</b></div><div><small>الصفة</small><b>${r.type === 'graduate' ? 'خريج' + (r.gradYear ? ' ' + esc(r.gradYear) : '') : 'طالب — مستوى ' + esc(r.level)}</b></div><div><small>البرنامج</small><b>${esc(r.program)}</b></div><div><small>الخدمات</small><b>${esc(itemsText(r))}</b></div><div><small>اللغة</small><b>${esc(LANG[r.lang] || '—')}</b></div><div><small>تاريخ التقديم</small><b>${fmtDate(r.createdAt)}</b></div></div>
      ${r.status === 'ready' ? `<div class="ss-alert ss-tone-green"><i class="fas fa-box-open"></i><div><b>طلبك جاهز</b><span>تفضل بالاستلام من مكتب شؤون الطلاب، ومعك إثبات الشخصية ورقم الطلب.</span></div></div>` : ''}
      <h4 class="ss-sub">سجل الطلب</h4>${timeline(r)}
      <div class="ss-detail-actions"><button class="btn btn-outline btn-sm" onclick="StudentServices.print('${esc(r.id)}')"><i class="fas fa-print"></i> طباعة الإيصال</button></div></div>`;
  }
  function lookup(ev, ctx) { ev.preventDefault(); const id = document.getElementById('ss-t-id-' + ctx).value, code = document.getElementById('ss-t-code-' + ctx).value; document.getElementById('ss-track-result-' + ctx).innerHTML = resultHTML(id, code); }
  function show(ctx, id) { const r = read().find(x => x.id === id); document.getElementById('ss-track-result-' + ctx).innerHTML = r ? detailCard(r, false) : ''; document.getElementById('ss-track-result-' + ctx).scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function openTrack(ctx, id, code) { rootFor(ctx).innerHTML = shellWrap(ctx, 'track', trackHTML(ctx, id, code)); }

  /* ---------- مكتب الموظف ---------- */
  let deskF = { q: '', status: '', service: '', type: '' };
  function filtered() {
    const q = deskF.q.trim().toLowerCase();
    return read().filter(r => (!deskF.status || (deskF.status === 'open' ? OPEN.includes(r.status) : r.status === deskF.status)) && (!deskF.service || r.services.includes(deskF.service)) && (!deskF.type || r.type === deskF.type) && (!q || [r.id, r.name, r.code, r.phone].some(v => String(v).toLowerCase().includes(q))));
  }
  function deskHTML() {
    const all = read();
    const count = s => all.filter(r => r.status === s).length;
    const chips = [['', 'الكل', all.length], ['open', 'المفتوحة', all.filter(r => OPEN.includes(r.status)).length], ['received', 'جديدة', count('received')], ['review', 'قيد المراجعة', count('review')], ['processing', 'جاري التجهيز', count('processing')], ['ready', 'جاهزة', count('ready')], ['needs_info', 'مطلوب استكمال', count('needs_info')], ['delivered', 'تم التسليم', count('delivered')]];
    const rows = filtered().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return `${hero('إدارة طلبات الخدمات', 'استلام الطلبات ومراجعتها وتحديث حالتها حتى التسليم، وكل تغيير يصل للطالب كإشعار.', 'fa-inbox', `<button class="ss-hero-btn" onclick="StudentServices.exportCsv()"><i class="fas fa-file-excel"></i> تصدير Excel</button>${user() && user().role === 'admin' ? `<button class="ss-hero-btn ghost" onclick="StudentServices.clearDemo()"><i class="fas fa-broom"></i> مسح الطلبات التجريبية</button>` : ''}`)}
      <div class="ss-panel ss-desk"><div class="ss-chips">${chips.map(c => `<button type="button" class="${deskF.status === c[0] ? 'on' : ''}" onclick="StudentServices.setF('status','${c[0]}')">${c[1]}<em>${c[2]}</em></button>`).join('')}</div>
      <div class="ss-filters"><label class="ss-search"><i class="fas fa-search"></i><input id="ss-q" value="${esc(deskF.q)}" placeholder="ابحث بالاسم أو الكود أو رقم الطلب أو الهاتف" oninput="StudentServices.setF('q',this.value,true)"></label>
        <select class="form-control" onchange="StudentServices.setF('service',this.value)"><option value="">كل الخدمات</option>${SERVICES.map(s => `<option value="${s.id}" ${deskF.service === s.id ? 'selected' : ''}>${s.title}</option>`).join('')}</select>
        <select class="form-control" onchange="StudentServices.setF('type',this.value)"><option value="">طالب وخريج</option><option value="student" ${deskF.type === 'student' ? 'selected' : ''}>طلاب</option><option value="graduate" ${deskF.type === 'graduate' ? 'selected' : ''}>خريجون</option></select></div>
      <div class="ss-table-wrap" id="ss-table-wrap">${tableHTML(rows)}</div></div>`;
  }
  function tableHTML(rows) {
    if (!rows.length) return `<div class="ss-empty"><i class="fas fa-inbox"></i><b>لا توجد طلبات مطابقة</b><span>غيّر الفلتر أو انتظر وصول طلبات جديدة.</span></div>`;
    return `<table class="ss-table"><thead><tr><th>رقم الطلب</th><th>مقدم الطلب</th><th>الصفة</th><th>الخدمات</th><th>العمر</th><th>الحالة</th><th></th></tr></thead><tbody>${rows.map(r => { const late = OPEN.includes(r.status) && ageDays(r) > SLA_DAYS; return `<tr onclick="StudentServices.openDesk('${esc(r.id)}')"><td dir="ltr"><b>${esc(r.id)}</b></td><td><b>${esc(r.name)}</b><small>${esc(r.code)} · ${esc(r.program)}</small></td><td>${r.type === 'graduate' ? 'خريج' : 'طالب'}</td><td>${esc(itemsText(r))}</td><td class="${late ? 'ss-late' : ''}">${ageDays(r)} ${ageDays(r) === 1 ? 'يوم' : 'أيام'}${late ? ' <i class="fas fa-triangle-exclamation" title="تجاوز المدة"></i>' : ''}</td><td>${badge(r.status)}</td><td><span class="ss-open-btn"><i class="fas fa-chevron-left"></i></span></td></tr>`; }).join('')}</tbody></table>`;
  }
  function setF(k, v, keepFocus) {
    deskF[k] = v;
    if (keepFocus) { const w = document.getElementById('ss-table-wrap'); if (w) w.innerHTML = tableHTML(filtered().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))); return; }
    const el = document.getElementById('ss-root-ss-desk'); if (el) el.innerHTML = `<div class="ss-shell">${deskHTML()}</div>`;
  }
  function staffNames() {
    const s = (window.FOS_SEED && FOS_SEED.org) || {};
    return [...(s.adminStaff || []).map(x => x.name), ...(s.unitTeam || []).slice(0, 4).map(x => x.name)];
  }
  function openDesk(id) {
    const r = read().find(x => x.id === id); if (!r) return;
    const m = document.createElement('div'); m.className = 'ss-modal'; m.id = 'ss-modal';
    const nexts = Object.keys(STATUS);
    m.innerHTML = `<div class="ss-modal-box" role="dialog" aria-modal="true"><button class="ss-modal-x" onclick="StudentServices.closeDesk()" aria-label="إغلاق"><i class="fas fa-xmark"></i></button>
      <div class="ss-modal-grid"><div>${detailCard(r, true).replace('ss-panel ss-detail', 'ss-detail-in')}</div>
      <div class="ss-act"><h4 class="ss-sub">إجراء الموظف</h4>
        <div class="ss-kv one"><div><small>الهاتف</small><b dir="ltr">${esc(r.phone)}</b></div>${r.email ? `<div><small>البريد</small><b dir="ltr">${esc(r.email)}</b></div>` : ''}<div><small>الجهة</small><b>${esc(r.purpose || '—')}</b></div>${r.notes ? `<div><small>ملاحظات مقدم الطلب</small><b>${esc(r.notes)}</b></div>` : ''}</div>
        <label class="ss-field"><span>تغيير الحالة</span><select class="form-control" id="ss-new-status">${nexts.map(s => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${STATUS[s].label}</option>`).join('')}</select></label>
        <label class="ss-field"><span>الموظف المسؤول</span><select class="form-control" id="ss-assignee"><option value="">غير مُسند</option>${staffNames().map(n => `<option ${n === r.assignee ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="ss-field"><span>ملاحظة تظهر للطالب</span><textarea class="form-control" id="ss-note" rows="3" placeholder="مثال: برجاء إحضار صورة البطاقة"></textarea></label>
        <div class="ss-act-btns"><button class="btn btn-primary" onclick="StudentServices.saveDesk('${esc(r.id)}')"><i class="fas fa-floppy-disk"></i> حفظ وإشعار الطالب</button></div></div></div></div>`;
    m.addEventListener('click', e => { if (e.target === m) closeDesk(); });
    document.body.appendChild(m);
  }
  function closeDesk() { const m = document.getElementById('ss-modal'); if (m) m.remove(); }
  function saveDesk(id) {
    const list = read(); const r = list.find(x => x.id === id); if (!r) return;
    const st = document.getElementById('ss-new-status').value, note = document.getElementById('ss-note').value.trim(), as = document.getElementById('ss-assignee').value;
    if ((st === 'rejected' || st === 'needs_info') && !note) return toast('اكتب ملاحظة توضح السبب للطالب', 'err');
    const now = new Date().toISOString(); const by = (user() && (user().name || 'الموظف')) || 'الموظف';
    const changed = st !== r.status || note || as !== r.assignee;
    if (!changed) return closeDesk();
    if (st !== r.status || note) r.history.push({ status: st, at: now, by, note });
    r.status = st; r.assignee = as; r.updatedAt = now; r.closedAt = ['delivered', 'rejected'].includes(st) ? now : '';
    write(list);
    try { if (window.App && App.notifyUser) App.notifyUser(r.code, `طلب الخدمة ${r.id}: ${STATUS[st].label}${note ? ' — ' + note : ''}`, { title: 'تحديث طلب خدمة', type: st === 'rejected' ? 'error' : st === 'ready' ? 'success' : 'info', link: 'ss-track' }); } catch (_) {}
    closeDesk(); toast('تم الحفظ وإشعار الطالب'); const el = document.getElementById('ss-root-ss-desk'); if (el) el.innerHTML = `<div class="ss-shell">${deskHTML()}</div>`;
  }
  function exportCsv() {
    const rows = [['رقم الطلب', 'الاسم', 'الكود', 'الصفة', 'المستوى', 'البرنامج', 'سنة التخرج', 'الهاتف', 'الخدمات', 'اللغة', 'الحالة', 'تاريخ التقديم', 'العمر بالأيام', 'المسؤول']];
    filtered().forEach(r => rows.push([r.id, r.name, r.code, r.type === 'graduate' ? 'خريج' : 'طالب', r.level, r.program, r.gradYear, r.phone, itemsText(r), LANG[r.lang] || '', STATUS[r.status].label, fmtDate(r.createdAt), ageDays(r), r.assignee]));
    const csv = '\ufeff' + rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"').join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'student-services-requests.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function clearDemo() { if (!confirm('سيتم حذف الطلبات التجريبية فقط وإبقاء الطلبات الحقيقية. متابعة؟')) return; write(read().filter(r => !r.demo)); setF('status', ''); }

  /* ---------- المؤشرات ---------- */
  function reportsHTML() {
    const all = read(); const open = all.filter(r => OPEN.includes(r.status)); const done = all.filter(r => r.status === 'delivered');
    const late = open.filter(r => ageDays(r) > SLA_DAYS);
    const avg = done.length ? (done.reduce((a, r) => a + ageDays(r), 0) / done.length).toFixed(1) : '—';
    const stat = (ico, lbl, val, tone) => `<div class="ss-stat ss-tone-${tone}"><span><i class="fas ${ico}"></i></span><div><b>${val}</b><small>${lbl}</small></div></div>`;
    const byS = SERVICES.map(s => [s, all.filter(r => r.services.includes(s.id)).length]).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...byS.map(x => x[1]));
    const stu = all.filter(r => r.type === 'student').length, gra = all.length - stu; const pct = all.length ? Math.round(stu / all.length * 100) : 0;
    const byStatus = Object.keys(STATUS).map(k => [k, all.filter(r => r.status === k).length]);
    return `${hero('مؤشرات خدمات الطلاب والخريجين', 'نظرة سريعة على حجم الطلبات وسرعة الإنجاز والخدمات الأكثر طلبًا.', 'fa-chart-pie', `<button class="ss-hero-btn" onclick="App.navigate('ss-desk')"><i class="fas fa-inbox"></i> فتح الطلبات</button>`)}
      <div class="ss-stats">${stat('fa-folder-open', 'إجمالي الطلبات', all.length, 'blue')}${stat('fa-hourglass-half', 'طلبات مفتوحة', open.length, 'teal')}${stat('fa-box-open', 'جاهزة للاستلام', all.filter(r => r.status === 'ready').length, 'green')}${stat('fa-stopwatch', 'متوسط زمن الإنجاز (يوم)', avg, 'indigo')}${stat('fa-triangle-exclamation', `متأخرة (أكثر من ${SLA_DAYS} أيام)`, late.length, late.length ? 'red' : 'gray')}</div>
      <div class="ss-rep-grid"><div class="ss-panel"><h3 class="ss-h3">الخدمات الأكثر طلبًا</h3><div class="ss-bars">${byS.map(([s, n]) => `<div class="ss-bar"><span><i class="fas ${s.icon}"></i> ${s.title}</span><div><i style="width:${Math.round(n / max * 100)}%"></i></div><b>${n}</b></div>`).join('')}</div></div>
        <div class="ss-panel"><h3 class="ss-h3">طلاب وخريجون</h3><div class="ss-donut-wrap"><div class="ss-donut" style="--p:${pct}"><b>${all.length}</b><small>طلب</small></div><ul class="ss-legend"><li><i class="a"></i>طلاب حاليون <b>${stu}</b></li><li><i class="b"></i>خريجون <b>${gra}</b></li></ul></div>
        <h3 class="ss-h3" style="margin-top:1.2rem">حسب الحالة</h3><div class="ss-status-list">${byStatus.map(([k, n]) => `<div><span>${badge(k)}</span><b>${n}</b></div>`).join('')}</div></div></div>`;
  }

  /* ---------- التركيب ---------- */
  const PAGES = { 'ss-center': 'center', 'ss-new': 'new', 'ss-track': 'track', 'ss-desk': 'desk', 'ss-reports': 'reports' };
  function rootFor(ctx) { return document.getElementById(ctx === 'public' ? 'ss-public-body' : 'ss-root-' + ctx); }
  function tabsHTML(ctx, active) {
    const t = [['center', 'خدماتنا', 'fa-table-cells-large'], ['new', 'تقديم طلب', 'fa-file-circle-plus'], ['track', 'متابعة طلب', 'fa-location-dot']];
    return `<nav class="ss-tabs">${t.map(x => `<button type="button" class="${active === x[0] ? 'on' : ''}" onclick="StudentServices.go('${ctx}','${x[0]}')"><i class="fas ${x[2]}"></i>${x[1]}</button>`).join('')}</nav>`;
  }
  function shellWrap(ctx, tab, body) {
    return `<div class="ss-shell">${ctx === 'public' ? '' : ''}${tab === 'center' ? hero('مركز خدمات الطلاب والخريجين', 'اطلب الشهادات والكشوف وسحب الملفات من مكان واحد، وتابع كل طلب خطوة بخطوة حتى الاستلام.', 'fa-hand-holding-hand', `<button class="ss-hero-btn" onclick="StudentServices.go('${ctx}','new')"><i class="fas fa-file-circle-plus"></i> تقديم طلب جديد</button><button class="ss-hero-btn ghost" onclick="StudentServices.go('${ctx}','track')"><i class="fas fa-location-dot"></i> متابعة طلب</button>`) : tab === 'new' ? hero('تقديم طلب خدمة', 'أكمل ثلاث خطوات سريعة وسيصلك رقم الطلب فورًا.', 'fa-file-circle-plus') : hero('متابعة طلب', 'اعرف مرحلة طلبك الآن ومتى يصبح جاهزًا للاستلام.', 'fa-location-dot')}${ctx === 'public' ? tabsHTML(ctx, tab) : ''}${body}</div>`;
  }
  function inner(ctx, tab) {
    if (tab === 'center') return `<div class="ss-flow"><div><i class="fas fa-pen"></i><b>قدّم</b><span>اختر الخدمة واملأ بياناتك</span></div><i class="fas fa-arrow-left ss-flow-arrow"></i><div><i class="fas fa-gears"></i><b>نراجع وننفذ</b><span>شؤون الطلاب تتابع طلبك</span></div><i class="fas fa-arrow-left ss-flow-arrow"></i><div><i class="fas fa-bell"></i><b>نبلغك</b><span>إشعار عند كل تحديث</span></div><i class="fas fa-arrow-left ss-flow-arrow"></i><div><i class="fas fa-box-open"></i><b>تستلم</b><span>من مكتب شؤون الطلاب</span></div></div>${catalogHTML(ctx)}`;
    if (tab === 'new') return formHTML(ctx);
    if (tab === 'track') return trackHTML(ctx);
    return '';
  }
  function renderInto(ctx, tab) {
    const root = rootFor(ctx); if (!root) return;
    if (tab === 'desk') { root.innerHTML = `<div class="ss-shell">${deskHTML()}</div>`; return; }
    if (tab === 'reports') { root.innerHTML = `<div class="ss-shell">${reportsHTML()}</div>`; return; }
    let body = inner(ctx, tab);
    root.innerHTML = shellWrap(ctx, tab, body);
  }
  function go(ctx, tab) { if (ctx !== 'public') { const pg = { center: 'ss-center', new: 'ss-new', track: 'ss-track' }[tab]; if (pg) return App.navigate(pg); } renderInto(ctx, tab); if (ctx === 'public') { const b = document.getElementById('ss-public'); if (b) b.scrollTop = 0; } }
  function renderApp(page) { seedOnce(); const tab = PAGES[page]; renderInto(page, tab === 'center' || tab === 'new' || tab === 'track' || tab === 'desk' || tab === 'reports' ? tab : 'center'); if (tab !== 'desk' && tab !== 'reports') rootFor(page).dataset.ctx = 'app'; }

  /* واجهة عامة بدون تسجيل دخول (للطالب/الخريج) */
  function openPublic(tab) {
    seedOnce();
    let o = document.getElementById('ss-public');
    if (!o) {
      o = document.createElement('div'); o.id = 'ss-public'; o.className = 'ss-public';
      o.innerHTML = `<div class="ss-public-bar"><button type="button" class="ss-public-back" onclick="StudentServices.closePublic()"><i class="fas fa-arrow-right"></i> العودة للرئيسية</button><div class="ss-public-brand"><img src="assets/8-faculty-logo.png" alt=""><span>خدمات الطلاب والخريجين</span><img src="assets/13-university-logo.png" alt=""></div><button type="button" class="theme-toggle-btn" onclick="document.getElementById('theme-toggle')&&document.getElementById('theme-toggle').click()" aria-label="تبديل الوضع"><i class="fas fa-circle-half-stroke"></i></button></div><div id="ss-public-body" class="ss-public-body"></div>`;
      document.body.appendChild(o);
    }
    o.classList.add('open'); document.documentElement.classList.add('ss-lock'); renderInto('public', tab || 'center'); o.scrollTop = 0;
  }
  function closePublic() { const o = document.getElementById('ss-public'); if (o) o.classList.remove('open'); document.documentElement.classList.remove('ss-lock'); }

  window.StudentServices = { renderApp, openPublic, closePublic, setType, toggle, pick, submit, copy, lookup, show, openTrack, go, print: printReceipt, setF, openDesk, closeDesk, saveDesk, exportCsv, clearDemo };
})();
