/* Student-to-Dean listening channel. Local demonstration only; no network delivery. */
(function () {
  'use strict';
  const KEY = 'fos_voice_dean_cases_v1';
  const STATUS = {
    received: ['وصلت للعميد', 'received'],
    reviewing: ['قيد المراجعة', 'reviewing'],
    referred: ['أُحيلت للجهة المختصة', 'referred'],
    resolved: ['تم الرد والمتابعة', 'resolved']
  };
  const CATEGORIES = {
    academic: 'المقررات والمحاضرات',
    advising: 'الإرشاد الأكاديمي',
    facilities: 'المعامل والقاعات',
    services: 'الخدمات الطلابية',
    idea: 'فكرة أو مقترح',
    other: 'موضوع آخر'
  };
  let mode = 'send';
  let ticket = '';
  let selectedCase = '';
  let deanQuery = '', deanFilter = '';
  const $ = (s, r=document) => r.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const me = () => window.App?.getCurrentUser?.() || null;
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2,10));
  const date = v => v ? new Date(v).toLocaleString('ar-EG', {dateStyle:'medium',timeStyle:'short'}) : '—';
  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (value && value.schema === 1 && Array.isArray(value.cases)) return value;
    } catch (_) {}
    return {schema:1,cases:[],audit:[]};
  };
  let state = read();
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { alert('تعذر حفظ الرسالة في هذا المتصفح. قد تكون مساحة التخزين ممتلئة.'); return false; }
  }
  function record(action, id, actor) {
    state.audit.unshift({id:uid(),action,caseId:id,actor,at:new Date().toISOString()});
    state.audit = state.audit.slice(0,1500);
  }
  function localNotice() {
    return `<div class="svd-local-alert" role="note"><i class="fas fa-laptop"></i><div><b>نسخة تجربة على هذا الجهاز فقط</b><span>الإرسال لا يصل إلى جهاز العميد ولا يزامن عبر الإنترنت؛ يظهر في لوحة العميد عند استخدام المتصفح نفسه. لا تكتب بيانات حساسة أو بلاغًا طارئًا هنا. قبل الاستخدام الفعلي يلزم ربط مركزي آمن واعتماد الكلية.</span></div></div>`;
  }
  function hero(eyebrow,title,body,icon='fa-ear-listen') {
    return `<header class="svd-hero"><div class="svd-hero-copy"><span class="svd-eyebrow"><i class="fas fa-comment-dots"></i> كلية العلوم · جامعة سوهاج</span><h1>${esc(title)}</h1><p>${esc(body)}</p><div class="svd-hero-meta"><span><i class="fas fa-user-shield"></i> مسار مخصص للطالب والعميد</span><span><i class="fas fa-route"></i> إرسال ← متابعة ← استجابة</span></div></div><div class="svd-hero-art" aria-hidden="true"><span class="svd-orbit svd-orbit-one"></span><span class="svd-orbit svd-orbit-two"></span><i class="fas ${icon}"></i><b>صوتك<br>مسموع</b></div></header>`;
  }
  function tabs(active) {
    return `<nav class="svd-tabs" aria-label="أقسام صوت الطالب"><button type="button" data-student-mode="send" class="${active==='send'?'active':''}"><i class="fas fa-paper-plane"></i> أرسل للعميد</button><button type="button" data-student-mode="track" class="${active==='track'?'active':''}"><i class="fas fa-route"></i> تابع رسالتك</button><button type="button" data-student-mode="surveys" class="${active==='surveys'?'active':''}"><i class="fas fa-clipboard-check"></i> الاستبيانات والتقييمات</button></nav>`;
  }
  function sendPage(root) {
    const user = me();
    root.innerHTML = `<div class="svd-page">${hero('تواصل مباشر','رأيك يصل إلى مكتب العميد','شاركنا تجربة أو ملاحظة أو مقترحًا. سيُسجّل له رقم متابعة حتى تعرف ما جرى بعد الإرسال.','fa-ear-listen')}${localNotice()}${tabs('send')}<div class="svd-two-column"><section class="svd-compose-card"><div class="svd-section-heading"><span class="svd-step">01</span><div><span class="svd-kicker">ابدأ هنا</span><h2>ما الذي تريد أن يصل للعميد؟</h2><p>اختر الموضوع واكتب وصفًا واضحًا ومحددًا. يمكنك إرسال الرأي باسمك أو دون إظهار هويتك.</p></div></div><form id="svd-message-form" class="svd-form"><div class="svd-form-row"><label>موضوع الرسالة <em>*</em><select name="category" required><option value="">اختر الموضوع</option>${Object.entries(CATEGORIES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>عنوان مختصر <em>*</em><input name="title" required maxlength="100" minlength="4" placeholder="مثال: اقتراح تحسين مواعيد المعمل"></label></div><label>اكتب رأيك أو الملاحظة <em>*</em><textarea name="body" required minlength="20" maxlength="2500" rows="7" placeholder="اشرح ما حدث أو الفكرة التي تقترحها، ومتى وأين تنطبق إن كان ذلك مفيدًا. تجنب أسماء أشخاص أو بيانات صحية أو معلومات حساسة."></textarea><small class="svd-help">من 20 إلى 2500 حرف. ركّز على التجربة أو الإجراء المطلوب تحسينه.</small></label><fieldset class="svd-identity"><legend>طريقة عرض هويتك</legend><label class="svd-radio"><input type="radio" name="identity" value="anonymous" checked><span><b>أرسلها دون إظهار اسمي</b><small>لن يظهر اسمك أو كودك في بطاقة الرسالة. هذه ميزة في نموذج التخزين المحلي وليست ضمان مجهولية أمنية.</small></span></label><label class="svd-radio"><input type="radio" name="identity" value="identified"><span><b>أرسلها باسمي</b><small>سيظهر للعميد اسم حسابك${user?.code?` (${esc(user.code)})`:''} لمساعدته على التواصل معك.</small></span></label></fieldset><label class="svd-consent"><input type="checkbox" name="ack" required><span>أفهم أن هذه نسخة اختبار محلية، وسأمتنع عن إدخال بيانات شخصية حساسة أو معلومات عن أطراف أخرى.</span></label><div class="svd-form-footer"><span><i class="fas fa-ticket-alt"></i> ستحصل على رقم مرجعي للمتابعة</span><button type="submit" class="btn btn-teal"><i class="fas fa-paper-plane"></i> أرسل رأيي للعميد</button></div></form></section><aside class="svd-side-rail"><section class="svd-side-card svd-process"><span class="svd-kicker">ماذا يحدث بعد الإرسال؟</span><h2>مسار واضح لرسالتك</h2><ol><li><b>تُسجّل</b><span>يظهر رقم مرجعي عند نجاح الحفظ.</span></li><li><b>يراجعها العميد</b><span>تظهر في صندوق «استمع للطلاب» وتُصنّف حسب الموضوع.</span></li><li><b>تتابع الإجراء</b><span>ترى حالة المراجعة والرد المنشور باستخدام رقمك.</span></li></ol></section><section class="svd-side-card"><span class="svd-side-icon"><i class="fas fa-heart"></i></span><h3>رأي مسؤول، تطوير أفضل</h3><p>صف التجربة بلغة موضوعية ومحترمة. لا تستخدم هذه القناة للطوارئ أو الشكاوى التي تتطلب سرية رسمية.</p></section><button class="svd-side-link" type="button" data-student-mode="track"><span><i class="fas fa-search"></i> أرسلت رسالة من قبل؟</span><b>تتبّعها برقمها <i class="fas fa-arrow-left"></i></b></button></aside></div></div>`;
  }
  function trackPage(root) {
    const last = ticket || (()=>{try{return sessionStorage.getItem('fos_voice_last_ticket')||''}catch(_){return ''}})();
    root.innerHTML = `<div class="svd-page">${hero('متابعة الطلب','رسالتك لها مسار واضح','أدخل الرقم المرجعي الذي ظهر لك عند الإرسال للاطلاع على الحالة وآخر رد من العميد.','fa-route')}${localNotice()}${tabs('track')}<section class="svd-track-panel"><div class="svd-track-intro"><span class="svd-track-icon"><i class="fas fa-ticket-alt"></i></span><div><h2>أدخل رقم المتابعة</h2><p>يبدأ الرقم عادةً بـ <b>SV-</b>. احتفظ به بعد إرسال الرسالة.</p></div></div><form id="svd-track-form" class="svd-track-form"><label for="svd-ticket-input">الرقم المرجعي</label><div><input id="svd-ticket-input" name="ticket" required value="${esc(last)}" placeholder="SV-2026-ABC123"><button class="btn btn-teal" type="submit">عرض الحالة <i class="fas fa-arrow-left"></i></button></div></form>${last?caseCard(state.cases.find(x=>x.ticket.toLowerCase()===last.toLowerCase()),true):`<div class="svd-empty-state"><i class="fas fa-inbox"></i><span>ستظهر تفاصيل الرسالة هنا بعد إدخال رقمها.</span></div>`}</section></div>`;
  }
  function caseCard(item, studentView) {
    if (!item) return `<div class="svd-empty-state"><i class="fas fa-search"></i><span>لم نعثر على رسالة بهذا الرقم في هذا المتصفح. راجع الرقم أو الجهاز الذي استخدمته للإرسال.</span></div>`;
    const st=STATUS[item.status]||STATUS.received;
    return `<article class="svd-case-card"><div class="svd-case-top"><span class="svd-ticket">${esc(item.ticket)}</span><span class="svd-status svd-status-${st[1]}"><i class="fas fa-circle" aria-hidden="true"></i>${st[0]}</span></div><div class="svd-case-meta"><span>${esc(CATEGORIES[item.category]||'موضوع آخر')}</span><span>${esc(date(item.createdAt))}</span></div><h3>${esc(item.title)}</h3><p class="svd-case-body">${esc(item.body)}</p>${!item.anonymous?`<div class="svd-identity-chip"><i class="fas fa-user"></i>${esc(item.studentName||'طالب')} · ${esc(item.studentCode||'')}</div>`:`<div class="svd-identity-chip"><i class="fas fa-user-secret"></i> أُرسلت دون إظهار الاسم في البطاقة</div>`}${item.deanReply?`<div class="svd-dean-reply"><b><i class="fas fa-comments"></i> رد العميد</b><p>${esc(item.deanReply)}</p><small>آخر تحديث: ${esc(date(item.updatedAt))}</small></div>`:studentView?`<div class="svd-awaiting"><i class="fas fa-hourglass-half"></i> لم يُسجّل رد بعد. ستظهر الإجابة هنا عند تحديث الحالة.</div>`:''}</article>`;
  }
  function renderStudent() {
    const root=$('#student-voice-root'); if(!root) return;
    const u=me(); if(!u||!['student','admin'].includes(u.role)){root.innerHTML=localNotice()+'<p class="svd-empty-state">هذه المساحة مخصصة للطلاب.</p>';return;}
    state=read();
    if(mode==='surveys') {
      window.__svOriginalStudentRender();
      if($('#sv-student-form',root)) {
        root.insertAdjacentHTML('afterbegin',`<div class="svd-survey-banner"><button type="button" data-student-mode="send"><i class="fas fa-arrow-right"></i> العودة إلى إرسال رأي للعميد</button><span>الاستبيانات والتقييمات</span></div>`);
      } else {
        const content=root.innerHTML;
        root.innerHTML=`<div class="svd-page">${hero('استبيانات الكلية','التقييمات والاستبيانات','شارك في تقييم المقررات والإرشاد والجوانب التعليمية. تختلف عن الرسالة المباشرة للعميد.')}${localNotice()}${tabs('surveys')}<div class="svd-surveys-wrap">${content}</div></div>`;
      }
      return;
    }
    if(mode==='track'){trackPage(root);return;}
    sendPage(root);
  }
  function deanInbox(root) {
    const active=state.cases.filter(x=>x.status!=='resolved').length;
    const byCategory=Object.keys(CATEGORIES).map(k=>[k,state.cases.filter(x=>x.category===k).length]).filter(x=>x[1]);
    const filtered=state.cases.filter(x=>{
      const search=`${x.ticket} ${x.title} ${x.body} ${CATEGORIES[x.category]||''} ${x.studentName||''}`.toLowerCase();
      return (!deanFilter||x.status===deanFilter)&&(!deanQuery||search.includes(deanQuery));
    });
    const selected=state.cases.find(x=>x.id===selectedCase);
    root.innerHTML=`<div class="svd-page svd-dean-page">${hero('مكتب العميد · صوت الطالب','استمع للطلاب','صندوق موحّد للرأي المباشر. راجع الرسالة، حدّث مسارها، واكتب ردًا واضحًا يراه الطالب برقم المتابعة.','fa-ear-listen')}${localNotice()}<div class="svd-dean-toolbar"><div><span class="svd-kicker">وحدة المتابعة</span><h2>الوارد من الطلاب</h2><p>الرسائل المحلية هنا لا تصل إلا على الجهاز/المتصفح نفسه.</p></div><button type="button" class="btn btn-outline" data-svd-refresh><i class="fas fa-sync-alt"></i> تحديث</button></div><div class="svd-dean-metrics"><article><span class="svd-metric-icon"><i class="fas fa-inbox"></i></span><b>${state.cases.length}</b><small>كل الرسائل</small></article><article><span class="svd-metric-icon amber"><i class="fas fa-bell"></i></span><b>${state.cases.filter(x=>x.status==='received').length}</b><small>وصلت حديثًا</small></article><article><span class="svd-metric-icon blue"><i class="fas fa-eye"></i></span><b>${state.cases.filter(x=>x.status==='reviewing'||x.status==='referred').length}</b><small>قيد المتابعة</small></article><article><span class="svd-metric-icon green"><i class="fas fa-check"></i></span><b>${state.cases.filter(x=>x.status==='resolved').length}</b><small>تم الرد</small></article></div><div class="svd-inbox-layout"><section class="svd-inbox-list"><div class="svd-list-heading"><div><h3>رسائل الطلاب</h3><span id="svd-visible-count">${filtered.length} من ${state.cases.length}</span></div><div class="svd-list-filters"><input id="svd-search" type="search" aria-label="ابحث في رسائل الطلاب" value="${esc(deanQuery)}" placeholder="ابحث في الرقم أو العنوان أو النص"><select id="svd-filter" aria-label="صفّ رسائل العميد حسب الحالة"><option value="" ${!deanFilter?'selected':''}>كل الحالات</option>${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${deanFilter===k?'selected':''}>${v[0]}</option>`).join('')}</select></div></div>${filtered.length?`<div class="svd-inbox-items">${filtered.map(x=>`<button class="svd-inbox-item ${x.id===selectedCase?'selected':''}" type="button" data-svd-case="${esc(x.id)}" data-status="${esc(x.status)}" data-search="${esc(`${x.ticket} ${x.title} ${x.body} ${CATEGORIES[x.category]||''} ${x.studentName||''}`.toLowerCase())}"><span class="svd-inbox-item-top"><b>${esc(x.ticket)}</b><span class="svd-status svd-status-${(STATUS[x.status]||STATUS.received)[1]}">${(STATUS[x.status]||STATUS.received)[0]}</span></span><strong>${esc(x.title)}</strong><span class="svd-inbox-item-bottom"><span>${esc(CATEGORIES[x.category]||'موضوع آخر')}</span><time>${esc(date(x.createdAt))}</time></span></button>`).join('')}</div>`:`<div class="svd-empty-state"><i class="fas fa-inbox"></i><span>${state.cases.length?'لا توجد رسائل تطابق التصفية.':'لا توجد رسائل جديدة حتى الآن.'}</span></div>`}<div id="svd-no-results" class="svd-empty-state" ${filtered.length?'hidden':''}><i class="fas fa-search"></i><span>لا توجد رسائل تطابق البحث أو الحالة المحددة.</span></div></section><section class="svd-inbox-detail">${selected?detailView(selected):`<div class="svd-detail-placeholder"><span><i class="fas fa-ear-listen"></i></span><h3>اختر رسالة لقراءتها</h3><p>ستظهر تفاصيلها هنا، وبجانبها مساحة لتحديث الحالة وإرسال رد للطالب.</p><div class="svd-category-strip">${byCategory.map(([k,n])=>`<span>${esc(CATEGORIES[k])}<b>${n}</b></span>`).join('')}</div></div>`}</section></div></div>`;
    bindDean(root);
  }
  function detailView(item) {
    const st=STATUS[item.status]||STATUS.received;
    return `<article class="svd-detail-card"><div class="svd-detail-header"><div><span class="svd-kicker">${esc(CATEGORIES[item.category]||'موضوع آخر')}</span><h2>${esc(item.title)}</h2></div><span class="svd-status svd-status-${st[1]}">${st[0]}</span></div><div class="svd-detail-meta"><span><i class="fas fa-ticket-alt"></i> ${esc(item.ticket)}</span><span><i class="far fa-calendar"></i> ${esc(date(item.createdAt))}</span><span><i class="fas fa-user"></i> ${item.anonymous?'دون اسم ظاهر':esc(`${item.studentName||'طالب'} · ${item.studentCode||''}`)}</span></div><div class="svd-message-content">${esc(item.body)}</div>${item.deanReply?`<div class="svd-prior-reply"><b>الرد المنشور سابقًا</b><p>${esc(item.deanReply)}</p><small>${esc(date(item.updatedAt))}</small></div>`:''}<form id="svd-dean-update" data-case-id="${esc(item.id)}" class="svd-update-form"><h3><i class="fas fa-clipboard-list"></i> متابعة الرسالة</h3><label>حالة المتابعة<select name="status">${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${item.status===k?'selected':''}>${v[0]}</option>`).join('')}</select></label><label>رد يظهر للطالب<textarea name="reply" rows="4" maxlength="2000" placeholder="اكتب ردًا موجزًا أو وضّح الخطوة التالية. عند الحل اذكر الإجراء أو جهة المتابعة.">${esc(item.deanReply||'')}</textarea></label><small class="svd-help">لا تضع ملاحظات داخلية أو بيانات شخصية في الرد المنشور. سيظهر للطالب عند إدخال الرقم المرجعي.</small><button type="submit" class="btn btn-teal"><i class="fas fa-save"></i> حفظ الحالة والرد</button></form></article>`;
  }
  function applyDeanFilters(root) {
    const q=deanQuery, f=deanFilter;
    const items=[...root.querySelectorAll('[data-svd-case]')];
    let visible=0;
    items.forEach(item=>{const match=(!f||item.dataset.status===f)&&(!q||(item.dataset.search||'').includes(q));item.hidden=!match;if(match)visible++;});
    const countNode=$('#svd-visible-count',root);if(countNode)countNode.textContent=`${visible} من ${items.length}`;
    const empty=$('#svd-no-results',root);if(empty)empty.hidden=visible>0;
  }
  function bindDean(root) {
    root.onclick=e=>{const b=e.target.closest('[data-svd-case],[data-svd-refresh]');if(!b)return;if(b.hasAttribute('data-svd-refresh')){state=read();deanInbox(root);return;}selectedCase=b.dataset.svdCase;deanInbox(root);};
    root.oninput=e=>{if(e.target.id==='svd-search'){deanQuery=e.target.value.trim().toLowerCase();applyDeanFilters(root);}};
    root.onchange=e=>{if(e.target.id==='svd-filter'){deanFilter=e.target.value;applyDeanFilters(root);}};
    root.onsubmit=e=>{if(e.target.id!=='svd-dean-update')return;e.preventDefault();const item=state.cases.find(x=>x.id===e.target.dataset.caseId);if(!item)return;const f=new FormData(e.target),next=String(f.get('status')||'received'),reply=String(f.get('reply')||'').trim();if(next==='resolved'&&reply.length<5){alert('اكتب للطالب ردًا أو خطوة متابعة واضحة قبل إغلاق الرسالة.');return;}item.status=next;item.deanReply=reply;item.updatedAt=new Date().toISOString();item.events=item.events||[];item.events.unshift({status:next,reply,at:item.updatedAt,actor:me()?.name||'عميد الكلية'});record('تحديث حالة ورسالة للطالب',item.ticket,me()?.name||'عميد الكلية');if(!persist())return;deanInbox(root);};
  }
  function submitMessage(form) {
    const data=new FormData(form),user=me(),anonymous=data.get('identity')!=='identified';
    const title=String(data.get('title')||'').trim(),body=String(data.get('body')||'').trim(),category=String(data.get('category')||'');
    if(title.length<4||body.length<20||!CATEGORIES[category]){alert('راجع الموضوع والعنوان واكتب تفاصيل لا تقل عن 20 حرفًا.');return;}
    const ticketId='SV-'+new Date().getFullYear()+'-'+uid().replace(/-/g,'').slice(0,12).toUpperCase();
    const item={id:uid(),ticket:ticketId,category,title,body,anonymous,studentName:anonymous?'':String(user?.name||user?.full_name||''),studentCode:anonymous?'':String(user?.code||user?.username||''),status:'received',deanReply:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),events:[{status:'received',at:new Date().toISOString(),actor:'الطالب'}]};
    state.cases.unshift(item);record('استلام رأي طالب',ticketId,'طالب');if(!persist())return;
    ticket=ticketId;try{sessionStorage.setItem('fos_voice_last_ticket',ticketId);}catch(_){}mode='confirmation';confirmation(rootOf(form),item);
  }
  function rootOf(el){return el.closest('#student-voice-root');}
  function confirmation(root,item) {
    root.innerHTML=`<div class="svd-page">${hero('تم حفظ الرسالة','شكرًا لأنك شاركتنا رأيك','سُجّلت رسالتك في هذه النسخة المحلية. احتفظ برقم المتابعة لمراجعة حالتها والرد عند توفره.','fa-check-circle')}${localNotice()}<section class="svd-confirm-card"><span class="svd-confirm-check"><i class="fas fa-check"></i></span><span class="svd-kicker">رقم المتابعة</span><strong class="svd-ticket-large">${esc(item.ticket)}</strong><p>انسخ الرقم واحتفظ به. يمكنك إدخاله لاحقًا في «تابع رسالتك» على هذا المتصفح.</p><div class="svd-confirm-actions"><button class="btn btn-teal" data-svd-copy="${esc(item.ticket)}"><i class="fas fa-copy"></i> نسخ الرقم</button><button class="btn btn-outline" data-student-mode="track"><i class="fas fa-route"></i> متابعة الحالة</button><button class="btn btn-ghost" data-student-mode="send">إرسال رأي آخر</button></div></section></div>`;
  }
  function renderDean() {
    const root=$('#student-voice-dean-root');if(!root)return;
    const u=me();if(!u||!['dean','admin'].includes(u.role)){root.innerHTML=`${localNotice()}<div class="svd-empty-state">هذه اللوحة متاحة للعميد ومدير النظام فقط.</div>`;return;}
    state=read();deanInbox(root);
  }
  function onStudentClick(e) {
    const tab=e.target.closest('[data-student-mode]');if(tab){mode=tab.dataset.studentMode;ticket='';renderStudent();return;}
    const copy=e.target.closest('[data-svd-copy]');if(copy){navigator.clipboard?.writeText(copy.dataset.svdCopy).then(()=>alert('تم نسخ الرقم المرجعي.')).catch(()=>alert('رقم المتابعة: '+copy.dataset.svdCopy));}
  }
  function bind() {
    const stu=$('#student-voice-root');if(stu){stu.addEventListener('click',onStudentClick);stu.addEventListener('submit',e=>{if(e.target.id==='svd-message-form'){e.preventDefault();submitMessage(e.target);}if(e.target.id==='svd-track-form'){e.preventDefault();const value=String(new FormData(e.target).get('ticket')||'').trim();ticket=value;try{sessionStorage.setItem('fos_voice_last_ticket',value);}catch(_){}renderStudent();}});}
    window.addEventListener('storage',e=>{if(e.key!==KEY)return;state=read();if(App?.getCurrentView?.()==='voice-dean')renderDean();if(App?.getCurrentView?.()==='student-voice'&&mode==='track')renderStudent();});
  }
  const existing=window.StudentVoice?.renderStudent?.bind(window.StudentVoice);
  if(existing){window.__svOriginalStudentRender=existing;window.StudentVoice.renderStudent=renderStudent;}
  window.StudentVoiceDirect={renderStudent,renderDean,readStore:read};
  bind();
})();
