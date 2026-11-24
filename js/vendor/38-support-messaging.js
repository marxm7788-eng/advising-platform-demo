(function () {
  'use strict';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const root = (id) => document.getElementById(id);
  const api = () => window.DB && window.DB.isOnline && window.DB.isOnline();
  let selectedCase = null;
  let selectedConversation = null;

  async function renderSupport() {
    const host = root('support-cases-root');
    if (!host) return;
    if (!api()) { host.innerHTML = '<div class="alert alert-warn">وحدة دعم المتعثرين تحتاج اتصال الخادم المركزي. لم يتم تحميل بيانات محلية بديلة.</div>'; return; }
    host.innerHTML = '<div class="card"><div class="card-body">جاري تحميل حالات المتابعة...</div></div>';
    try {
      const [summary, cases, advisors] = await Promise.all([DB.getSupportSummary(), DB.listSupportCases(), DB.listAdvisors()]);
      host.innerHTML = `<section class="integration-panel">
        <div class="integration-heading"><div><span class="text-xs text-muted">مصدر مركزي · صلاحيات الخادم</span><h2>دعم الطلاب المتعثرين</h2><p>تظهر الحالات ذات المعدل المسجل الأقل من 2.00 فقط. المعدل المفقود لا يصنف تلقائيًا.</p></div><button class="btn btn-primary" type="button" onclick="SupportMessaging.refreshSupport()"><i class="fas fa-rotate"></i> تحديث الحالات</button></div>
        <div class="stats-grid integration-stats"><div class="card"><div class="card-body"><small>إجمالي الحالات</small><strong>${esc(summary.total || 0)}</strong></div></div><div class="card"><div class="card-body"><small>جديدة</small><strong>${esc(summary.new || 0)}</strong></div></div><div class="card"><div class="card-body"><small>قيد المتابعة</small><strong>${esc(summary.in_progress || 0)}</strong></div></div><div class="card"><div class="card-body"><small>أقل من 1.50</small><strong>${esc(summary.below_1_5 || 0)}</strong></div></div></div>
        <div class="integration-table-wrap"><table class="data"><thead><tr><th>الطالب</th><th>المعدل</th><th>الحالة</th><th>المرشد</th><th>إجراء</th></tr></thead><tbody>${cases.length ? cases.map((c) => `<tr><td><b>${esc(c.name)}</b><small class="block text-muted">${esc(c.student_number)} · ${esc(c.program || 'البرنامج غير محدد')}</small></td><td>${Number(c.trigger_gpa).toFixed(2)}</td><td><span class="badge">${esc(c.status)}</span></td><td>${esc(c.advisor_username || 'غير مسند')}</td><td><button class="btn btn-sm btn-outline" type="button" onclick="SupportMessaging.openCase(${Number(c.id)})">فتح المتابعة</button></td></tr>`).join('') : '<tr><td colspan="5">لا توجد حالات متاحة ضمن نطاق صلاحيتك.</td></tr>'}</tbody></table></div>
        <div id="support-case-detail"></div>
      </section>`;
      window.__supportAdvisors = advisors;
      window.__supportCases = cases;
    } catch (error) { host.innerHTML = `<div class="alert alert-danger">تعذر تحميل وحدة الدعم: ${esc(error.message)}</div>`; }
  }

  async function openCase(id) {
    const item = (window.__supportCases || []).find((c) => Number(c.id) === Number(id));
    if (!item) return;
    selectedCase = item;
    const box = root('support-case-detail');
    if (!box) return;
    let plans = [];
    try { plans = (await window.DB.listSupportPlans(id)) || []; } catch (_) {}
    box.innerHTML = `<div class="integration-detail"><div class="integration-heading"><div><h3>${esc(item.name)} · ${esc(item.student_number)}</h3><p>المعدل: <b>${Number(item.trigger_gpa).toFixed(2)}</b> · أول ظهور: ${esc(item.first_seen_at || '—')}</p></div><button class="btn btn-ghost" onclick="SupportMessaging.closeCase()">إغلاق</button></div>
      <div class="grid-3"><label class="form-group">الحالة<select id="support-status" class="form-control"><option ${item.status==='new'?'selected':''} value="new">جديدة</option><option ${item.status==='reviewed'?'selected':''} value="reviewed">تمت المراجعة</option><option ${item.status==='in_progress'?'selected':''} value="in_progress">قيد المتابعة</option><option ${item.status==='needs_follow_up'?'selected':''} value="needs_follow_up">تحتاج متابعة</option><option ${item.status==='closed'?'selected':''} value="closed">مغلقة</option></select></label><label class="form-group">إسناد المرشد<select id="support-advisor" class="form-control"><option value="">بدون إسناد</option>${(window.__supportAdvisors || []).map(a => `<option value="${a.id}" ${Number(a.id)===Number(item.assigned_advisor_id)?'selected':''}>${esc(a.username)}</option>`).join('')}</select></label><label class="form-group">ملاحظات<textarea id="support-notes" class="form-control" rows="2">${esc(item.notes || '')}</textarea></label></div>
      <div class="flex gap-2"><button class="btn btn-primary" onclick="SupportMessaging.saveCase()">حفظ الحالة</button><button class="btn btn-outline" onclick="SupportMessaging.newPlan()">إضافة خطة متابعة</button></div>
      <div class="mt-3"><h4>خطط المتابعة</h4>${plans.length ? plans.map(p => `<div class="support-plan"><b>${esc(p.goals)}</b><small>المالك: ${esc(p.owner_username || '—')} · الحالة: ${esc(p.status)}</small></div>`).join('') : '<p class="text-muted">لا توجد خطط محفوظة لهذه الحالة.</p>'}</div></div>`;
  }

  async function saveCase() {
    if (!selectedCase) return;
    const status = root('support-status')?.value;
    const notes = root('support-notes')?.value || '';
    const advisorId = root('support-advisor')?.value;
    try {
      await DB.updateSupportCase(selectedCase.id, { status, notes });
      if (advisorId) await DB.assignSupportCase(selectedCase.id, Number(advisorId));
      await renderSupport();
    } catch (error) { alert(error.message); }
  }

  async function newPlan() {
    if (!selectedCase) return;
    const goals = prompt('اكتب هدف خطة المتابعة القابل للقياس:');
    if (!goals || !goals.trim()) return;
    try { await DB.createSupportPlan(selectedCase.id, { goals: goals.trim() }); await openCase(selectedCase.id); } catch (error) { alert(error.message); }
  }

  async function renderConversations() {
    const host = root('conversations-root');
    if (!host) return;
    if (!api()) { host.innerHTML = '<div class="alert alert-warn">الدردشة متاحة فقط عبر الخادم المركزي، ولا تحفظ الرسائل محليًا.</div>'; return; }
    try {
      const conversations = await DB.listConversations();
      const current = window.App?.getCurrentUser?.();
      const startButton = current?.role === 'student' ? '<button class="btn btn-primary" type="button" onclick="SupportMessaging.startConversation()">بدء محادثة</button>' : '';
      host.innerHTML = `<section class="integration-panel"><div class="integration-heading"><div><span class="text-xs text-muted">رسائل محفوظة مركزيًا</span><h2>المحادثات</h2><p>الوصول والكتابة محكومان بالمشاركين على الخادم.</p></div>${startButton}</div><div class="conversation-layout"><div class="conversation-list">${conversations.length ? conversations.map(c => `<button class="conversation-item" onclick="SupportMessaging.openConversation(${Number(c.id)})"><b>${esc(c.subject)}</b><small>${esc(c.last_message || 'لا توجد رسائل')} · غير مقروء: ${esc(c.unread_count || 0)}</small></button>`).join('') : '<p class="text-muted">لا توجد محادثات في نطاق حسابك.</p>'}</div><div id="conversation-detail" class="conversation-detail"><p class="text-muted">اختر محادثة لعرض الرسائل.</p></div></div></section>`;
      window.__conversations = conversations;
    } catch (error) { host.innerHTML = `<div class="alert alert-danger">تعذر تحميل المحادثات: ${esc(error.message)}</div>`; }
  }

  async function openConversation(id) {
    selectedConversation = id;
    const item = (window.__conversations || []).find((c) => Number(c.id) === Number(id));
    const messages = await DB.listMessages(id);
    const box = root('conversation-detail');
    if (!box) return;
    box.innerHTML = `<h3>${esc(item?.subject || 'محادثة')}</h3><div class="message-list">${messages.length ? messages.map(m => `<div class="message-bubble"><small>${esc(m.sender_username)} · ${esc(m.sent_at)}</small><p>${esc(m.body)}</p></div>`).join('') : '<p class="text-muted">لا توجد رسائل.</p>'}</div><form onsubmit="return SupportMessaging.send(event)"><textarea id="conversation-message" class="form-control" required maxlength="10000" placeholder="اكتب رسالة..." rows="3"></textarea><button class="btn btn-primary mt-2" type="submit">إرسال</button></form>`;
  }

  async function send(event) { event.preventDefault(); const body = root('conversation-message')?.value.trim(); if (!body || !selectedConversation) return false; try { await DB.sendMessage(selectedConversation, body); await openConversation(selectedConversation); } catch (error) { alert(error.message); } return false; }
  async function startConversation() {
    try {
      const advisor = await DB.getMyAdvisor();
      if (!advisor) throw new Error('لا يوجد مرشد مسند إليك حاليًا.');
      const subject = prompt('موضوع المحادثة:');
      if (!subject || !subject.trim()) return;
      await DB.createConversation({ subject: subject.trim(), conversation_type: 'student_advisor', participant_ids: [advisor.id] });
      await renderConversations();
    } catch (error) { alert(error.message); }
  }
  async function refreshSupport() { try { await DB.refreshSupportCases(); await renderSupport(); } catch (error) { alert(error.message); } }
  function closeCase() { const box = root('support-case-detail'); if (box) box.innerHTML = ''; selectedCase = null; }
  window.SupportMessaging = { renderSupport, openCase, saveCase, newPlan, refreshSupport, closeCase, renderConversations, openConversation, send, startConversation };
})();
