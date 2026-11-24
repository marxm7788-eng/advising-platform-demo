/*
 * Student Voice — local testing mode only.
 * No network/API calls. All surveys, catalog data, participation and answers stay in this browser's localStorage.
 * This is NOT a security boundary and must not be used for official/student-sensitive data.
 */
(function () {
  'use strict';
  const KEY = 'fos_voice_local_v1';
  const TYPES = [
    ['single','اختيار إجابة واحدة'],['multi','اختيار عدة إجابات'],['select','قائمة منسدلة'],['yesno','نعم أو لا'],
    ['rating','تقييم رقمي 1–5'],['likert','مقياس موافقة 1–5'],['stars','تقييم بالنجوم'],['short','نص قصير'],['long','نص طويل'],
    ['number','حقل رقمي'],['percent','نسبة مئوية'],['date','تاريخ'],['note','عنوان/وصف دون إجابة']
  ];
  let store = null, studentSurveyId = null, studentResponseId = null, adminTab = 'overview', editingSurveyId = null, newUnsavedSurvey = false, importPreview = null;
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'sv-' + Date.now().toString(36) + Math.random().toString(36).slice(2,9);
  const now = () => new Date().toISOString();
  const fmt = s => s ? new Date(s).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}) : '—';
  const current = () => (window.App && App.getCurrentUser && App.getCurrentUser()) || null;
  const currentCode = u => String(u?.code || u?.student_code || u?.username || '');
  const currentName = u => String(u?.name || u?.full_name || u?.username || 'طالب');

  function templateCourse() {
    const section='s-course', rating='s-rating', comments='s-comments';
    const qs=[];
    const add=(sectionId,label,type='rating',required=true,options=[])=>qs.push({id:uid(),sectionId,label,type,required,options,min:type==='percent'?0:1,max:type==='percent'?100:5,allowNA:false,help:''});
    add(section,'اسم المقرر','short'); add(section,'كود المقرر','short',false); add(section,'البرنامج','short',false);
    add(section,'المستوى الدراسي','short',false); add(section,'الفصل الدراسي والعام','short'); add(section,'عدد الساعات المعتمدة','number',false);
    add(section,'عضو هيئة التدريس','short',false); add(section,'المرشد الأكاديمي','short',false); add(section,'نوع اللقاء','select',false,['محاضرة','سكشن','معمل']); add(section,'تاريخ المحاضرة/السكشن','date',false);
    add(section,'انتظام تنفيذ المحاضرات','likert'); add(section,'عدد المحاضرات التي تم إلغاؤها','number',false); add(section,'هل تم تعويض المحاضرات الملغاة؟','yesno',false);
    add(section,'مدى فهم محتوى المقرر من 0 إلى 100','percent'); add(section,'هل تم الالتزام بموعد بدء المحاضرة؟','yesno',false);
    const items=[
      'أهداف المقرر واضحة ومعلنة','محتوى المقرر مرتبط بأهدافه','المحتوى محدث وملائم للتخصص','توزيع الموضوعات مناسب للوقت المتاح',
      'المراجع ومصادر التعلم مناسبة','المحاضرات منظمة وواضحة','عضو هيئة التدريس متمكن من المادة','يشرح الأفكار بطريقة تساعد على الفهم',
      'يشجع على المشاركة وطرح الأسئلة','يتعامل باحترام وعدالة','يراعي الفروق بين الطلاب','يلتزم بالخطة والجدول المعلن',
      'الأنشطة والسكاشن تدعم فهم المقرر','التكليفات مناسبة لمحتوى المقرر','أساليب التقييم معلنة وعادلة','التغذية الراجعة مفيدة وفي وقت مناسب',
      'المصادر الرقمية متاحة وسهلة الاستخدام','القاعات/المعامل مناسبة للتعلم','أوصي بالمقرر للطلاب في المستقبل'
    ];
    items.forEach(x=>add(rating,x,'likert'));
    add(comments,'ما أكثر ما ساعدك على التعلم في هذا المقرر؟','long',false);
    add(comments,'ما الصعوبات أو المقترحات التي ترى أنها تحسن المقرر؟','long',false);
    return {id:uid(),title:'قالب تقييم مقرر دراسي',description:'قالب قابل للتعديل لتقييم المقرر والمحاضرات والسكاشن وأعضاء هيئة التدريس.',instructions:'أجب بناءً على تجربتك الفعلية. استخدم «لا ينطبق» عند الحاجة.',type:'course',status:'draft',createdAt:now(),updatedAt:now(),startsAt:'',endsAt:'',anonymous:true,allowDraft:true,allowEdit:false,maxResponses:1,target:{all:true,programs:[],levels:[],departments:[]},sections:[{id:section,title:'بيانات المقرر واللقاء'},{id:rating,title:'تقييم عناصر المقرر (1 إلى 5)'},{id:comments,title:'الملاحظات والمقترحات'}],questions:qs,version:1,versions:[]};
  }
  function templateAdvising() {
    const section='s-advising', feedback='s-feedback', qs=[];
    const add=(sectionId,label,type='likert',required=true,options=[])=>qs.push({id:uid(),sectionId,label,type,required,options,min:1,max:5,allowNA:true,help:''});
    [
      'المرشد متاح عند الحاجة','المرشد يحدد مواعيد مناسبة للقاءات','المرشد يستمع إلى مشكلاتي باهتمام','المرشد يتعامل باحترام وموضوعية',
      'المرشد يشرح الخطة الدراسية بوضوح','المرشد يساعدني على اختيار المقررات المناسبة','المرشد يوضح المتطلبات السابقة للمقررات','المرشد يساعدني في وضع خطة للتخرج',
      'المرشد يوجهني إلى الخدمات والموارد المناسبة','المرشد يتابع تقدمي الدراسي','المرشد يحافظ على خصوصية ما أشاركه','أستطيع التواصل مع المرشد بسهولة',
      'الوقت المخصص للإرشاد كافٍ','أنا راضٍ عن جودة الإرشاد الأكاديمي'
    ].forEach(x=>add(section,x));
    add(feedback,'كيف تتواصل عادةً مع مرشدك؟','multi',false,['مقابلة شخصية','البريد الإلكتروني','الهاتف','منصة إلكترونية','أخرى']);
    add(feedback,'ما أبرز صعوبة واجهتك عند طلب الإرشاد؟','long',false);
    add(feedback,'ما المقترح الذي قد يحسن الإرشاد الأكاديمي؟','long',false);
    add(feedback,'هل ترغب في متابعة من إدارة الإرشاد؟','yesno',false);
    return {id:uid(),title:'قالب تقييم الإرشاد الأكاديمي',description:'استبيان لقياس تجربة الإرشاد الأكاديمي وتحديد فرص التحسين.',instructions:'أجب بصراحة عن تجربتك خلال الفصل. لا تذكر بيانات شخصية في التعليقات.',type:'advising',status:'draft',createdAt:now(),updatedAt:now(),startsAt:'',endsAt:'',anonymous:true,allowDraft:true,allowEdit:false,maxResponses:1,target:{all:true,programs:[],levels:[],departments:[]},sections:[{id:section,title:'تقييم تجربة الإرشاد (1 إلى 5)'},{id:feedback,title:'التواصل والمقترحات'}],questions:qs,version:1,versions:[]};
  }
  function templateForType(type) {
    if(type==='course') return templateCourse();
    if(type==='advising') return templateAdvising();
    const meta={lecture:['تقييم محاضرة/سكشن','lecture','بيانات اللقاء'],faculty:['تقييم عضو هيئة تدريس','faculty','التدريس والتفاعل'],program:['تقييم برنامج أكاديمي','program','تجربة البرنامج'],services:['تقييم المعامل والخدمات','services','الخدمات ومصادر التعلم'],general:['استبيان عام','general','أسئلة الاستبيان'],custom:['استبيان مخصص','custom','القسم الأول']}[type]||['استبيان مخصص','custom','القسم الأول'];
    const sec='sec-'+uid(),feedback='feedback-'+uid(),qs=[];
    const add=(sectionId,label,qtype='likert',required=true,options=[])=>qs.push({id:uid(),sectionId,label,type:qtype,required,options,min:qtype==='percent'?0:1,max:qtype==='percent'?100:5,allowNA:true,help:''});
    if(type==='lecture'){add(sec,'اسم المقرر','short');add(sec,'كود المقرر','short',false);add(sec,'عضو هيئة التدريس','short',false);add(sec,'نوع اللقاء','select',false,['محاضرة','سكشن','معمل']);add(sec,'تاريخ اللقاء','date',false);['اللقاء منظم وواضح','تم الالتزام بموعد اللقاء','أسهم اللقاء في فهم محتوى المقرر','أتاح اللقاء فرصة للأسئلة والمشاركة'].forEach(x=>add(sec,x));}
    else if(type==='faculty'){add(sec,'اسم المقرر','short',false);add(sec,'عضو هيئة التدريس','short');['التمكن من محتوى المقرر','وضوح الشرح وتنظيمه','التعامل باحترام وعدالة','تشجيع المشاركة والأسئلة','الالتزام بالساعات المعلنة','التغذية الراجعة مفيدة'].forEach(x=>add(sec,x));}
    else if(type==='program'){add(sec,'البرنامج الأكاديمي','short');add(sec,'المستوى الدراسي','short',false);['مخرجات البرنامج واضحة','المقررات مترابطة وتدعم المخرجات','توزيع العبء الدراسي مناسب','الإرشاد الأكاديمي يدعم مساري','مصادر التعلم كافية','أشعر بالاستعداد لسوق العمل/الدراسات العليا'].forEach(x=>add(sec,x));}
    else if(type==='services'){add(sec,'اسم المعمل أو الخدمة','short');add(sec,'القسم/الموقع','short',false);['المكان مناسب وآمن','الأجهزة/المصادر متاحة وتعمل','مواعيد الإتاحة مناسبة','الدعم عند الحاجة فعال','تعليمات الاستخدام واضحة'].forEach(x=>add(sec,x));}
    else {['ما مدى رضاك عن تجربتك؟','وضوح المعلومات والخطوات','سهولة الوصول للخدمة','سرعة الاستجابة','التعامل باحترام'].forEach(x=>add(sec,x));}
    add(feedback,'ما الجوانب الإيجابية؟','long',false);add(feedback,'ما أهم مقترح للتحسين؟','long',false);
    return {id:uid(),title:meta[0],description:'قالب أولي قابل للتعديل قبل النشر.',instructions:'أجب عن تجربتك الفعلية، وتجنب كتابة بيانات شخصية في التعليقات.',type:meta[1],status:'draft',createdAt:now(),updatedAt:now(),startsAt:'',endsAt:'',anonymous:true,allowDraft:true,allowEdit:false,maxResponses:1,target:{all:true,programs:[],levels:[],departments:[]},sections:[{id:sec,title:meta[2]},{id:feedback,title:'الملاحظات والمقترحات'}],questions:qs,version:1,versions:[]};
  }
  function readStore() {
    try { const x=JSON.parse(localStorage.getItem(KEY)||'null'); if (x && x.schema===1) return x; } catch(e) {}
    const s={schema:1,surveys:[],responses:[],participation:[],courses:[],instructors:[],audit:[],settings:{minAnonymousGroup:5,retentionMonths:24}};
    s.surveys=[templateCourse(),templateAdvising()];
    try { localStorage.setItem(KEY,JSON.stringify(s)); } catch(e) {}
    return s;
  }
  function save() { try { localStorage.setItem(KEY,JSON.stringify(store)); return true; } catch(e) { alert('تعذر الحفظ المحلي. قد تكون مساحة التخزين ممتلئة.'); return false; } }
  function log(action, detail) { store.audit.unshift({id:uid(),at:now(),actor:currentName(current()),action,detail:String(detail||'')}); store.audit=store.audit.slice(0,1500); save(); }
  function count(surveyId) { return store.responses.filter(r=>r.surveyId===surveyId && r.status==='submitted').length; }
  function participation(surveyId, code) { return store.participation.filter(p=>p.surveyId===surveyId&&p.userCode===code).length; }
  function derivedStatus(s) {
    const t=Date.now();
    if (s.status==='published' && s.startsAt && new Date(s.startsAt).getTime()>t) return 'scheduled';
    if (s.status==='published' && s.endsAt && new Date(s.endsAt).getTime()<t) return 'ended';
    return s.status;
  }
  const STATUS={draft:'مسودة',scheduled:'مجدول للنشر',published:'منشور ومتاح',paused:'متوقف مؤقتًا',closed:'مغلق',archived:'مؤرشف',ended:'انتهى الموعد'};
  function matchesTarget(u,t={all:true}) {
    if (t.all) return true;
    const value=(a,b)=>String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();
    const dept=u.dept||u.department||''; const program=u.program||u.programName||''; const level=u.level||'';
    return (!t.programs?.length||t.programs.some(x=>value(x,program))) && (!t.levels?.length||t.levels.some(x=>value(x,level))) && (!t.departments?.length||t.departments.some(x=>value(x,dept)));
  }
  function warning() { return '<div class="sv-local-warning" role="note"><i class="fas fa-exclamation-triangle"></i><div><b>وضع تجريبي محلي</b><span>البيانات محفوظة في هذا المتصفح فقط. ليست خدمة رسمية؛ لا تستخدم بيانات حقيقية. التخزين المحلي يمكن لمن يستخدم الجهاز أو أدوات المطور الوصول إليه، ولا يوفّر صلاحيات خادمية أو سرية/مجهولية حقيقية.</span></div></div>'; }
  function pageHead(title,sub) { return `<section class="sv-hero"><div><span class="sv-kicker"><i class="fas fa-comment-dots"></i> صوت الطالب · نسخة اختبار محلية</span><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="sv-hero-mark"><i class="fas fa-comment-alt"></i><b>رأيك يصنع فرقًا</b></div></section>${warning()}`; }
  function empty(msg) { return `<div class="sv-empty"><i class="far fa-comment-dots"></i><p>${esc(msg)}</p></div>`; }

  function renderStudent() {
    const root=$('#student-voice-root'); if(!root) return;
    const u=current(); if(!u || !['student','admin'].includes(u.role)){ root.innerHTML=warning()+empty('هذه الصفحة مخصصة للطلاب.'); return; }
    store=readStore();
    if(studentSurveyId) { renderStudentForm(root,studentSurveyId,studentResponseId); return; }
    const code=currentCode(u), visible=store.surveys.filter(s=>!['draft','archived'].includes(derivedStatus(s))&&matchesTarget(u,s.target));
    const cards=visible.map(s=>{
      const status=derivedStatus(s), parts=participation(s.id,code), latest=store.responses.find(r=>r.surveyId===s.id&&(r.respondentCode===code||r.draftOwnerCode===code)&&r.status==='draft');
      const ended=['closed','ended'].includes(status), unavailable=['paused','scheduled'].includes(status), sent=parts>=Number(s.maxResponses||1)&&!s.allowEdit;
      let action='عرض الاستبيان', act='open', disabled=false;
      if(latest){action='استكمل الاستبيان';act='resume';}
      else if(parts>0&&s.allowEdit&&!ended){action='تعديل المشاركة';act='edit-response';}
      else if(sent){action='تم الإرسال';act='status';disabled=true;}
      else if(parts>0){action='مشاركة أخرى';act='open';}
      else if(unavailable||ended){action=STATUS[status]||'غير متاح';act='status';disabled=true;}
      else if(parts>=Number(s.maxResponses||1)&&!s.allowEdit){action='تم استيفاء المشاركة';act='status';disabled=true;}
      const type=(s.type==='course'?'تقييم مقرر':s.type==='advising'?'إرشاد أكاديمي':s.type==='faculty'?'تقييم عضو هيئة تدريس':'استبيان عام');
      const resumeId=latest?.id||s.id;
      return `<article class="sv-survey-card"><div class="sv-card-top"><span class="sv-type">${esc(type)}</span><span class="sv-status sv-${esc(status)}">${esc(STATUS[status]||status)}</span></div><h2>${esc(s.title)}</h2><p>${esc(s.description||'')}</p><div class="sv-card-dates"><span><i class="far fa-calendar"></i> يبدأ: ${esc(fmt(s.startsAt))}</span><span><i class="far fa-clock"></i> يغلق: ${esc(fmt(s.endsAt))}</span></div><div class="sv-card-bottom"><span>${parts?'مشاركة سابقة محفوظة محليًا':'لم تشارك بعد'}</span><button class="btn btn-teal" data-action="${act}" data-id="${esc(resumeId)}" data-survey="${esc(s.id)}" ${disabled?'disabled':''}>${esc(action)} <i class="fas fa-arrow-left"></i></button></div></article>`;
    }).join('');
    root.innerHTML=pageHead('استبياناتك وآراؤك','شارك بتجربتك في المقررات والإرشاد والخدمات التعليمية. إجابات هذه النسخة تُحفظ محليًا للاختبار فقط.')+`<div class="sv-summary-row"><div><b>${visible.length}</b><span>استبيان موجّه إليك</span></div><div><b>${store.responses.filter(r=>r.respondentCode===code&&r.status==='submitted').length}</b><span>مشاركة مرسلة</span></div><div><b>${store.responses.filter(r=>r.respondentCode===code&&r.status==='draft').length}</b><span>مسودة محفوظة</span></div></div><div class="sv-survey-grid">${cards||empty('لا توجد استبيانات منشورة وموجهة إليك الآن.')}</div>`;
    root.onclick=ev=>{const b=ev.target.closest('[data-action]');if(!b)return;const s=store.surveys.find(x=>x.id===b.dataset.survey||x.id===b.dataset.id);if(!s)return;if(b.dataset.action==='open'){studentSurveyId=s.id;studentResponseId=null;renderStudent();}else if(b.dataset.action==='resume'){const r=store.responses.find(x=>x.id===b.dataset.id&&x.status==='draft');studentSurveyId=s.id;studentResponseId=r?.id||null;renderStudent();}else if(b.dataset.action==='edit-response'){const code=currentCode(current()),p=[...store.participation].reverse().find(x=>x.surveyId===s.id&&x.userCode===code),r=store.responses.find(x=>x.id===p?.responseId);studentSurveyId=s.id;studentResponseId=r?.id||null;renderStudent();}else if(b.dataset.action==='status'){alert('حالة المشاركة: '+(STATUS[derivedStatus(s)]||'متاحة'));}};
  }
  function questionControl(q,answer) {
    const id=esc(q.id), label=esc(q.label), req=q.required?' <em>* مطلوب</em>':' <small>اختياري</small>', help=q.help?`<small class="sv-help">${esc(q.help)}</small>`:'';
    const opts=(q.options||[]).map(x=>String(x));
    let c='';
    if(q.type==='note') return `<div class="sv-question sv-question-note"><b>${label}</b>${help}</div>`;
    if(q.type==='single'||q.type==='yesno'||q.type==='rating'||q.type==='likert'||q.type==='stars'){
      const values=q.type==='yesno'?['نعم','لا']:q.type==='rating'||q.type==='likert'||q.type==='stars'?['1','2','3','4','5']:opts;
      c=values.map(v=>`<label class="sv-choice ${q.type==='stars'?'sv-star':''}"><input type="radio" name="q-${id}" value="${esc(v)}" ${String(answer||'')===String(v)?'checked':''}><span>${q.type==='stars'?'★ '+esc(v):esc(v)}</span></label>`).join('');
    } else if(q.type==='multi'){
      c=opts.map(v=>`<label class="sv-choice"><input type="checkbox" name="q-${id}" value="${esc(v)}" ${(Array.isArray(answer)&&answer.includes(v))?'checked':''}><span>${esc(v)}</span></label>`).join('');
    } else if(q.type==='select'){
      c=`<select class="form-control sv-answer" data-qid="${id}" ${q.required?'required':''}><option value="">اختر…</option>${opts.map(v=>`<option ${String(answer||'')===v?'selected':''} value="${esc(v)}">${esc(v)}</option>`).join('')}${q.allowNA?'<option value="__na__">لا ينطبق</option>':''}</select>`;
    } else {
      const type=q.type==='short'?'text':q.type==='long'?'textarea':q.type==='date'?'date':q.type==='number'||q.type==='percent'?'number':'text';
      const attrs=`class="form-control sv-answer" data-qid="${id}" ${q.required?'required':''} ${q.type==='number'||q.type==='percent'?`min="${Number(q.min??(q.type==='percent'?0:0))}" max="${Number(q.max??(q.type==='percent'?100:9999))}" step="any"`:''}`;
      c=type==='textarea'?`<textarea ${attrs} rows="3">${esc(answer||'')}</textarea>`:`<input ${attrs} type="${type}" value="${esc(answer||'')}" placeholder="اكتب إجابتك هنا">`;
    }
    if(q.allowNA&&['single','multi','rating','likert','stars','yesno'].includes(q.type)) c+=`<label class="sv-choice sv-na"><input type="checkbox" data-qna="${id}" ${answer==='__na__'?'checked':''}><span>لا ينطبق</span></label>`;
    return `<fieldset class="sv-question" data-question="${id}" data-condition-question="${esc(q.showIf?.questionId||'')}" data-condition-value="${esc(q.showIf?.value||'')}"><legend>${label}${req}</legend>${help}<div class="sv-choices">${c}</div><small class="sv-error" data-error="${id}"></small></fieldset>`;
  }
  function renderStudentForm(root,surveyId,responseId) {
    const s=store.surveys.find(x=>x.id===surveyId); if(!s){studentSurveyId=null;return renderStudent();}
    const r=responseId?store.responses.find(x=>x.id===responseId):null, answers=r?.answers||{};
    const sections=(s.sections||[]).map(sec=>{
      const qs=(s.questions||[]).filter(q=>q.sectionId===sec.id).map(q=>questionControl(q,answers[q.id])).join('');
      return `<section class="sv-form-section"><div class="sv-section-title"><span>${esc(sec.title)}</span><small>${(s.questions||[]).filter(q=>q.sectionId===sec.id&&q.type!=='note').length} سؤال</small></div>${qs||empty('لا توجد أسئلة في هذا القسم.')}</section>`;
    }).join('');
    root.innerHTML=`<button class="btn btn-ghost mb-2" data-action="back"><i class="fas fa-arrow-right"></i> كل الاستبيانات</button>${pageHead(s.title,s.description||'')}${s.instructions?`<div class="sv-instructions"><b>تعليمات المشاركة</b><p>${esc(s.instructions)}</p></div>`:''}<div class="sv-progress"><span>تقدم الإجابة</span><div><i id="sv-progress-bar"></i></div><b id="sv-progress-text">0%</b></div><form id="sv-student-form" novalidate>${sections}<div class="sv-form-actions"><button type="button" class="btn btn-outline" data-action="save-draft" ${s.allowDraft?'':'disabled'}>حفظ كمسودة</button><button type="button" class="btn btn-ghost" data-action="cancel">إلغاء</button><button type="submit" class="btn btn-teal">${r?.status==='submitted'?'حفظ التعديلات':'إرسال الاستبيان'} <i class="fas fa-paper-plane"></i></button></div></form>`;
    const form=$('#sv-student-form');
    const syncConditions=()=>{const a=collectAnswers(form);$$('.sv-question[data-condition-question]',form).forEach(el=>{const parent=el.dataset.conditionQuestion;if(!parent){el.hidden=false;return;}const value=a[parent],expected=el.dataset.conditionValue;el.hidden=Array.isArray(value)?!value.includes(expected):String(value||'')!==expected;});updateProgress();};
    form.addEventListener('input',syncConditions); form.addEventListener('change',syncConditions); form.addEventListener('submit',ev=>{ev.preventDefault();submitStudent(s,r);}); syncConditions();
    root.onclick=ev=>{const b=ev.target.closest('[data-action]');if(!b)return;if(b.dataset.action==='back'||b.dataset.action==='cancel'){studentSurveyId=null;studentResponseId=null;renderStudent();}else if(b.dataset.action==='save-draft'){saveStudentDraft(s,r);}};
  }
  function collectAnswers(form) {
    const out={};
    for(const q of (store.surveys.find(x=>x.id===studentSurveyId)?.questions||[])){
      if(q.type==='note') continue;
      if($(`[data-qna="${q.id}"]`,form)?.checked){out[q.id]='__na__';continue;}
      const inputs=$$(`[name="q-${CSS.escape(q.id)}"]`,form);
      if(q.type==='multi') out[q.id]=inputs.filter(x=>x.checked).map(x=>x.value);
      else if(inputs.length&&inputs[0].type==='radio') out[q.id]=inputs.find(x=>x.checked)?.value||'';
      else out[q.id]=$(`[data-qid="${CSS.escape(q.id)}"]`,form)?.value||'';
    }
    return out;
  }
  function validateAnswers(s,answers) {
    const errors=[];
    for(const q of s.questions){
      if(q.showIf){const prev=answers[q.showIf.questionId],expected=String(q.showIf.value||'');if(Array.isArray(prev)?!prev.includes(expected):String(prev||'')!==expected)continue;}
      if(q.type==='note'||!q.required) continue;
      const v=answers[q.id]; if(v===''||v==null||(Array.isArray(v)&&!v.length)){errors.push(q.id);continue;}
      if(['number','percent'].includes(q.type)&&v!=='__na__'){const n=Number(v);if(!Number.isFinite(n)||n<Number(q.min??0)||n>Number(q.max??(q.type==='percent'?100:9999)))errors.push(q.id);}
    }
    return errors;
  }
  function updateProgress() {
    const form=$('#sv-student-form'); if(!form)return;
    const s=store.surveys.find(x=>x.id===studentSurveyId), answers=collectAnswers(form), qs=(s?.questions||[]).filter(q=>q.type!=='note');
    const done=qs.filter(q=>{const a=answers[q.id];return Array.isArray(a)?a.length>0:String(a||'').trim()!=='';}).length;
    const pct=qs.length?Math.round(done/qs.length*100):0; const bar=$('#sv-progress-bar'); if(bar)bar.style.width=pct+'%'; const t=$('#sv-progress-text');if(t)t.textContent=pct+'%';
  }
  function contextFrom(s,answers) {
    const byLabel={}; for(const q of s.questions) byLabel[q.label]=answers[q.id];
    return {course:byLabel['اسم المقرر']||byLabel['المقرر']||'',courseCode:byLabel['كود المقرر']||'',program:byLabel['البرنامج']||current()?.program||'',level:byLabel['المستوى الدراسي']||current()?.level||'',term:byLabel['الفصل الدراسي والعام']||'',instructor:byLabel['عضو هيئة التدريس']||'',date:byLabel['تاريخ المحاضرة/السكشن']||''};
  }
  function persistStudent(s,r,status,answers) {
    const u=current(),code=currentCode(u); const response=r||{id:uid(),surveyId:s.id,version:s.version,createdAt:now()};
    response.surveyId=s.id;response.version=s.version;response.status=status;response.answers=answers;response.context=contextFrom(s,answers);response.respondentCode=s.anonymous?null:code;response.draftOwnerCode=status==='draft'?code:null;response.updatedAt=now();
    if(status==='submitted'){response.submittedAt=now();delete response.draftOwnerCode;}
    const idx=store.responses.findIndex(x=>x.id===response.id); if(idx>=0)store.responses[idx]=response;else store.responses.unshift(response);
    let part=store.participation.find(x=>x.surveyId===s.id&&x.userCode===code&&x.responseId===response.id);
    if(status==='submitted'&&!part) store.participation.push({id:uid(),surveyId:s.id,userCode:code,responseId:response.id,submittedAt:response.submittedAt});
    if(!save()) return null; return response;
  }
  function saveStudentDraft(s,r) {
    if(!s.allowDraft){alert('حفظ المسودة غير مفعّل لهذا الاستبيان.');return;}
    const response=persistStudent(s,r,'draft',collectAnswers($('#sv-student-form')));if(!response)return;studentResponseId=response.id;alert('تم حفظ المسودة على هذا الجهاز.');renderStudent();
  }
  function submitStudent(s,r) {
    const form=$('#sv-student-form'), answers=collectAnswers(form), errors=validateAnswers(s,answers);
    $$('.sv-question',form).forEach(q=>q.classList.remove('sv-invalid'));
    errors.forEach(id=>{const box=$(`[data-question="${CSS.escape(id)}"]`,form);box?.classList.add('sv-invalid');const e=$(`[data-error="${CSS.escape(id)}"]`,form);if(e)e.textContent='هذا السؤال مطلوب أو أن القيمة خارج النطاق المسموح.';});
    if(errors.length){$(`[data-question="${CSS.escape(errors[0])}"]`,form)?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    const status=derivedStatus(s);if(status!=='published'){alert('هذا الاستبيان غير متاح للإرسال الآن.');return;}
    const code=currentCode(current()), prior=participation(s.id,code);
    if(!r&&prior>=Number(s.maxResponses||1)){alert('وصلت إلى الحد المسموح للمشاركة في هذا الاستبيان.');return;}
    if(prior&&s.anonymous) { /* separate local eligibility list; no student code in answer row */ }
    if(!confirm('سيُحفظ ردك في التخزين المحلي لهذا المتصفح فقط. هل تريد المتابعة؟')) return;
    const saved=persistStudent(s,r,'submitted',answers);if(!saved)return;log('إرسال استبيان',s.title);
    studentSurveyId=null;studentResponseId=null;alert('تم تسجيل المشاركة محليًا على هذا الجهاز. هذا تأكيد تخزين تجريبي، وليس حفظًا في قاعدة الجامعة.');renderStudent();
  }

  function renderAdmin() {
    const root=$('#student-voice-admin-root'); if(!root)return;
    const u=current(); if(!u||u.role!=='admin'){root.innerHTML=warning()+empty('هذه المساحة متاحة لمدير النظام في وضع الاختبار المحلي فقط.');return;}
    store=store||readStore();
    if(adminTab==='editor'){renderEditor(root);return;}
    root.innerHTML=pageHead('إدارة صوت الطالب','إدارة الاستبيانات المحلية والقوالب والنتائج والفهارس. لا توجد حماية خادمية في الوضع التجريبي.')+`<div class="sv-admin-tabs">${[['overview','نظرة عامة'],['surveys','الاستبيانات'],['results','النتائج والتحليل'],['catalog','المقررات والأعضاء'],['imports','استيراد الفهارس'],['settings','الخصوصية والاحتفاظ'],['audit','سجل العمليات']].map(([id,label])=>`<button class="${adminTab===id?'active':''}" data-tab="${id}">${esc(label)}</button>`).join('')}</div><div id="sv-admin-content">${adminContent()}</div>`;
    root.onclick=onAdminClick;
  }
  function adminContent() {
    if(adminTab==='overview') return adminOverview();
    if(adminTab==='surveys') return surveyTable();
    if(adminTab==='results') return resultsPage();
    if(adminTab==='catalog') return catalogPage();
    if(adminTab==='imports') return importPage();
    if(adminTab==='settings') return settingsPage();
    if(adminTab==='audit') return auditPage();
    return '';
  }
  function adminOverview() {
    const total=store.surveys.length,pub=store.surveys.filter(s=>derivedStatus(s)==='published').length,open=pub,closed=store.surveys.filter(s=>['closed','ended','archived'].includes(derivedStatus(s))).length,submitted=store.responses.filter(r=>r.status==='submitted');
    const recent=[...store.surveys].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,5);
    return `<div class="sv-metrics"><div><b>${total}</b><span>إجمالي الاستبيانات</span></div><div><b>${pub}</b><span>منشورة</span></div><div><b>${open}</b><span>مفتوحة الآن</span></div><div><b>${closed}</b><span>مغلقة/مؤرشفة</span></div><div><b>${submitted.length}</b><span>استجابات مكتملة</span></div><div><b>${store.responses.filter(r=>r.status==='draft').length}</b><span>مسودات طلاب</span></div></div><section class="sv-panel"><div class="sv-panel-head"><div><span class="sv-kicker">آخر نشاط</span><h2>الاستبيانات الأخيرة</h2></div><button class="btn btn-teal" data-action="new">إنشاء استبيان</button></div>${recent.length?`<div class="sv-table-wrap"><table class="sv-table"><thead><tr><th>الاستبيان</th><th>الحالة</th><th>الردود</th><th>آخر تعديل</th><th></th></tr></thead><tbody>${recent.map(s=>`<tr><td><b>${esc(s.title)}</b><small>${esc(s.description||'')}</small></td><td><span class="sv-status sv-${esc(derivedStatus(s))}">${esc(STATUS[derivedStatus(s)]||'')}</span></td><td>${count(s.id)}</td><td>${esc(fmt(s.updatedAt))}</td><td><button class="sv-link" data-action="edit" data-id="${esc(s.id)}">فتح</button></td></tr>`).join('')}</tbody></table></div>`:empty('لا توجد استبيانات بعد.')}</section><section class="sv-panel"><h2>ابدأ من قالب قابل للتعديل</h2><p class="sv-muted">كل اختيار يفتح محررًا، ولا ينشر تلقائيًا أو ينشئ ردودًا.</p><div class="sv-template-grid">${[['course','تقييم مقرر'],['lecture','محاضرة / سكشن'],['faculty','عضو هيئة تدريس'],['advising','إرشاد أكاديمي'],['program','برنامج أكاديمي'],['services','معامل وخدمات'],['general','استبيان عام'],['custom','استبيان مخصص']].map(([k,v])=>`<button class="btn btn-outline" data-action="create-template" data-template="${k}">${v}</button>`).join('')}</div></section>`;
  }
  function surveyTable() {
    return `<section class="sv-panel"><div class="sv-panel-head"><div><span class="sv-kicker">إدارة دورة الحياة</span><h2>كل الاستبيانات</h2></div><button class="btn btn-teal" data-action="new">+ استبيان جديد</button></div><div class="sv-template-grid compact">${[['course','تقييم مقرر'],['lecture','محاضرة'],['faculty','عضو هيئة تدريس'],['advising','إرشاد'],['program','برنامج'],['services','خدمات'],['general','عام'],['custom','مخصص']].map(([k,v])=>`<button class="btn btn-outline" data-action="create-template" data-template="${k}">${v}</button>`).join('')}</div><div class="sv-filter-row"><input class="form-control" id="sv-survey-search" placeholder="ابحث بالعنوان أو الوصف"><select class="form-control" id="sv-survey-filter"><option value="">كل الحالات</option>${Object.entries(STATUS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><div class="sv-table-wrap"><table class="sv-table"><thead><tr><th>اسم الاستبيان</th><th>النوع</th><th>الاستهداف</th><th>النافذة الزمنية</th><th>الردود</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${store.surveys.map(s=>`<tr data-survey-row="${esc(s.id)}"><td><b>${esc(s.title)}</b><small>${esc(s.description||'')}</small></td><td>${esc(s.type)}</td><td>${s.target?.all?'كل الطلاب':esc([...(s.target?.programs||[]),...(s.target?.levels||[])].join(' · ')||'محدد')}</td><td><small>يبدأ ${esc(fmt(s.startsAt))}<br>ينتهي ${esc(fmt(s.endsAt))}</small></td><td>${count(s.id)}</td><td><span class="sv-status sv-${esc(derivedStatus(s))}">${esc(STATUS[derivedStatus(s)]||'')}</span></td><td class="sv-actions"><button data-action="edit" data-id="${esc(s.id)}">تعديل</button><button data-action="results" data-id="${esc(s.id)}">النتائج</button><button data-action="clone" data-id="${esc(s.id)}">نسخ</button>${lifecycle(s)}<button class="danger" data-action="delete" data-id="${esc(s.id)}">حذف</button></td></tr>`).join('')}</tbody></table></div>${store.surveys.length?'':empty('لا توجد استبيانات بعد.')}</section>`;
  }
  function lifecycle(s) { const st=derivedStatus(s); if(st==='draft'||st==='paused')return `<button data-action="publish" data-id="${esc(s.id)}">${st==='paused'?'استئناف':'نشر'}</button>`;if(st==='published'||st==='scheduled')return `<button data-action="pause" data-id="${esc(s.id)}">إيقاف مؤقت</button><button data-action="close" data-id="${esc(s.id)}">إغلاق</button>`;if(st==='closed'||st==='ended')return `<button data-action="archive" data-id="${esc(s.id)}">أرشفة</button>`;return ''; }
  function adminOptions() {
    const users=(window.localStorage.getItem('fos_v2_users')||'');
    const demoUsers=(()=>{try{return JSON.parse(localStorage.getItem('fos_v2_users')||'[]');}catch(e){return [];}})();
    const all=demoUsers.length?demoUsers:(window.FOS_SEED?.users||[]);
    const programs=[...new Set(all.map(u=>u.program).filter(Boolean))],levels=[...new Set(all.map(u=>u.level).filter(Boolean))],depts=[...new Set(all.map(u=>u.dept||u.department).filter(Boolean))];
    return {programs,levels,depts};
  }
  function renderEditor(root) {
    const existing=store.surveys.find(s=>s.id===editingSurveyId), s=existing||{id:'',title:'',description:'',instructions:'',type:'general',status:'draft',startsAt:'',endsAt:'',anonymous:true,allowDraft:true,allowEdit:false,maxResponses:1,target:{all:true,programs:[],levels:[],departments:[]},sections:[{id:uid(),title:'القسم الأول'}],questions:[],version:1,versions:[]};
    const opts=adminOptions();
    root.innerHTML=pageHead(existing?'تعديل الاستبيان':'إنشاء استبيان','حرّر البيانات والأسئلة؛ تحفظ هذه النسخة داخل المتصفح فقط.')+`<div class="sv-editor-toolbar"><button class="btn btn-ghost" data-action="editor-back">رجوع</button><span class="sv-local-chip">إصدار ${Number(s.version||1)}</span><span class="sv-spacer"></span><button class="btn btn-outline" data-action="editor-preview">معاينة</button><button class="btn btn-outline" data-action="editor-save">حفظ كمسودة</button><button class="btn btn-teal" data-action="editor-publish">حفظ ونشر</button></div><form id="sv-editor-form"><section class="sv-panel"><h2>معلومات الاستبيان</h2><div class="sv-form-grid"><label>العنوان *<input class="form-control" name="title" required value="${esc(s.title)}"></label><label>النوع<select class="form-control" name="type">${[['general','عام'],['course','تقييم مقرر'],['lecture','تقييم محاضرة/سكشن'],['faculty','تقييم عضو هيئة تدريس'],['advising','إرشاد أكاديمي'],['program','تقييم برنامج'],['services','خدمات/معامل'],['custom','مخصص']].map(([k,v])=>`<option value="${k}" ${s.type===k?'selected':''}>${v}</option>`).join('')}</select></label><label class="sv-wide">وصف مختصر<textarea class="form-control" name="description" rows="2">${esc(s.description)}</textarea></label><label class="sv-wide">تعليمات للطالب<textarea class="form-control" name="instructions" rows="2">${esc(s.instructions)}</textarea></label><label>يبدأ في<input class="form-control" name="startsAt" type="datetime-local" value="${esc(s.startsAt?new Date(s.startsAt).toISOString().slice(0,16):'')}"></label><label>يغلق في<input class="form-control" name="endsAt" type="datetime-local" value="${esc(s.endsAt?new Date(s.endsAt).toISOString().slice(0,16):'')}"></label></div></section><section class="sv-panel"><div class="sv-panel-head"><div><h2>الفئة المستهدفة</h2><p class="sv-muted">مطابقة محلية مع بيانات الطالب المتاحة في هذا المتصفح.</p></div></div><label class="sv-check"><input name="targetAll" type="checkbox" ${s.target?.all?'checked':''}> كل الطلاب</label><div class="sv-form-grid"><label>البرنامج<select class="form-control" name="targetProgram"><option value="">كل البرامج</option>${opts.programs.map(x=>`<option ${s.target?.programs?.includes(x)?'selected':''}>${esc(x)}</option>`).join('')}</select></label><label>المستوى<select class="form-control" name="targetLevel"><option value="">كل المستويات</option>${opts.levels.map(x=>`<option ${s.target?.levels?.includes(x)?'selected':''}>${esc(x)}</option>`).join('')}</select></label><label>القسم<select class="form-control" name="targetDept"><option value="">كل الأقسام</option>${opts.depts.map(x=>`<option ${s.target?.departments?.includes(x)?'selected':''}>${esc(x)}</option>`).join('')}</select></label></div></section><section class="sv-panel"><h2>المشاركة والخصوصية المحلية</h2><div class="sv-check-grid"><label class="sv-check"><input name="anonymous" type="checkbox" ${s.anonymous?'checked':''}> إخفاء كود الطالب عن سجل الرد نفسه</label><label class="sv-check"><input name="allowDraft" type="checkbox" ${s.allowDraft?'checked':''}> السماح بحفظ المسودة</label><label class="sv-check"><input name="allowEdit" type="checkbox" ${s.allowEdit?'checked':''}> السماح بالتعديل بعد الإرسال</label></div><label>عدد المشاركات لكل طالب<input class="form-control sv-small-input" name="maxResponses" type="number" min="1" max="20" value="${Number(s.maxResponses||1)}"></label><p class="sv-local-warning sv-small-warning"><b>تنبيه خصوصية:</b> إخفاء الكود في صف الرد لا يحقق مجهولية حقيقية؛ قائمة منع التكرار منفصلة شكليًا فقط، والبيانات قابلة للفحص محليًا. لا تستخدم بيانات حقيقية.</p></section><section class="sv-panel"><div class="sv-panel-head"><div><h2>أقسام وأسئلة الاستبيان</h2><p class="sv-muted">أضف أنواعًا مختلفة، رتّبها وعدّلها أو احذفها. القالب لا يضيف ردودًا.</p></div><div class="sv-inline-actions"><button type="button" class="btn btn-outline" data-action="section-add">+ قسم</button><button type="button" class="btn btn-outline" data-action="question-add">+ سؤال</button></div></div><div id="sv-editor-sections">${renderQuestionEditor(s)}</div></section></form>`;
    root.onclick=onAdminClick;
  }
  function renderQuestionEditor(s) {
    return (s.sections||[]).map(sec=>`<div class="sv-editor-section" data-section="${esc(sec.id)}"><div class="sv-section-edit-head"><input class="form-control sv-section-name" value="${esc(sec.title)}"><button data-action="section-up" data-id="${esc(sec.id)}">↑</button><button data-action="section-down" data-id="${esc(sec.id)}">↓</button><button class="danger" data-action="section-delete" data-id="${esc(sec.id)}">حذف القسم</button></div>${(s.questions||[]).filter(q=>q.sectionId===sec.id).map(q=>renderQuestionEditorItem(q)).join('')}</div>`).join('')+(s.sections?.length?'':empty('أضف قسمًا لبدء بناء الاستبيان.'));
  }
  function renderQuestionEditorItem(q) {
    return `<article class="sv-question-edit" data-q="${esc(q.id)}"><div class="sv-question-edit-top"><strong>سؤال</strong><button type="button" data-action="q-up" data-id="${esc(q.id)}">↑</button><button type="button" data-action="q-down" data-id="${esc(q.id)}">↓</button><button type="button" data-action="q-duplicate" data-id="${esc(q.id)}">نسخ</button><button type="button" class="danger" data-action="q-delete" data-id="${esc(q.id)}">حذف</button></div><div class="sv-form-grid"><label class="sv-wide">نص السؤال<input class="form-control q-label" value="${esc(q.label)}"></label><label>النوع<select class="form-control q-type">${TYPES.map(([id,name])=>`<option value="${id}" ${q.type===id?'selected':''}>${esc(name)}</option>`).join('')}</select></label><label>القسم<select class="form-control q-section">${store.surveys.find(x=>x.id===editingSurveyId)?.sections?.map(s=>`<option value="${esc(s.id)}" ${q.sectionId===s.id?'selected':''}>${esc(s.title)}</option>`).join('')||''}</select></label><label class="sv-wide">مساعدة (اختياري)<input class="form-control q-help" value="${esc(q.help||'')}"></label><label class="sv-wide">الخيارات (خيار في كل سطر)<textarea class="form-control q-options" rows="2">${esc((q.options||[]).join('\n'))}</textarea></label><label>الحد الأدنى<input class="form-control q-min" type="number" value="${Number(q.min??0)}"></label><label>الحد الأقصى<input class="form-control q-max" type="number" value="${Number(q.max??100)}"></label><label class="sv-check"><input class="q-required" type="checkbox" ${q.required?'checked':''}> إلزامي</label><label class="sv-check"><input class="q-na" type="checkbox" ${q.allowNA?'checked':''}> يسمح بـ«لا ينطبق»</label><label>يظهر عند إجابة سؤال سابق<input class="form-control q-show-id" value="${esc(q.showIf?.questionId||'')}" placeholder="معرّف السؤال"></label><label>تساوي<input class="form-control q-show-value" value="${esc(q.showIf?.value||'')}"></label></div></article>`;
  }
  function readEditor() {
    const f=$('#sv-editor-form'); if(!f)return null;
    const old=store.surveys.find(x=>x.id===editingSurveyId);
    const sections=$$('.sv-editor-section',f).map(el=>({id:el.dataset.section,title:$('.sv-section-name',el).value.trim()||'قسم جديد'}));
    const questions=$$('.sv-question-edit',f).map(el=>{const o=$('.q-options',el).value.split('\n').map(x=>x.trim()).filter(Boolean);const showId=$('.q-show-id',el).value.trim();return {id:el.dataset.q,sectionId:$('.q-section',el).value,label:$('.q-label',el).value.trim(),type:$('.q-type',el).value,help:$('.q-help',el).value.trim(),options:o,required:$('.q-required',el).checked,allowNA:$('.q-na',el).checked,min:Number($('.q-min',el).value||0),max:Number($('.q-max',el).value||100),showIf:showId?{questionId:showId,value:$('.q-show-value',el).value}:null};});
    const val=n=>f.elements[n]?.value||''; const checked=n=>!!f.elements[n]?.checked;
    const targetAll=checked('targetAll'), program=val('targetProgram'),level=val('targetLevel'),dept=val('targetDept');
    return {...(old||{}),id:old?.id||uid(),title:val('title').trim(),description:val('description').trim(),instructions:val('instructions').trim(),type:val('type'),startsAt:val('startsAt')?new Date(val('startsAt')).toISOString():'',endsAt:val('endsAt')?new Date(val('endsAt')).toISOString():'',anonymous:checked('anonymous'),allowDraft:checked('allowDraft'),allowEdit:checked('allowEdit'),maxResponses:Math.max(1,Number(val('maxResponses')||1)),target:{all:targetAll,programs:program?[program]:[],levels:level?[level]:[],departments:dept?[dept]:[]},sections,questions,createdAt:old?.createdAt||now(),updatedAt:now(),version:old?.version||1,versions:old?.versions||[],status:old?.status||'draft'};
  }
  function commitEditor(publish) {
    const s=readEditor();if(!s)return;
    if(s.title.length<3){alert('اكتب عنوانًا واضحًا للاستبيان.');return;}
    if(s.endsAt&&s.startsAt&&new Date(s.endsAt)<=new Date(s.startsAt)){alert('موعد الإغلاق يجب أن يكون بعد موعد البدء.');return;}
    if(s.questions.some(q=>!q.label&&q.type!=='note')){alert('أكمل نص كل سؤال أو احذفه قبل الحفظ.');return;}
    if(s.questions.some(q=>['single','multi','select'].includes(q.type)&&!(q.options||[]).length)){alert('أضف خيار إجابة واحدًا على الأقل لكل سؤال اختياري.');return;}
    if(!s.target.all&&!s.target.programs.length&&!s.target.levels.length&&!s.target.departments.length){alert('اختر فئة مستهدفة أو فعّل خيار كل الطلاب.');return;}
    if(publish&&!s.questions.some(q=>q.type!=='note')){alert('أضف سؤالًا واحدًا على الأقل قبل النشر.');return;}
    const old=store.surveys.find(x=>x.id===s.id);
    if(old&&count(s.id)>0){const prev={version:old.version,snapshot:JSON.parse(JSON.stringify(old)),archivedAt:now()};s.versions=[...(old.versions||[]),prev];s.version=Number(old.version||1)+1;}
    delete s.__new;
    s.status=publish?'published':'draft';s.updatedAt=now();
    if(old)store.surveys=store.surveys.map(x=>x.id===s.id?s:x);else store.surveys.unshift(s);
    save();log(publish?'نشر استبيان':'حفظ مسودة استبيان',s.title);editingSurveyId=null;newUnsavedSurvey=false;adminTab='surveys';renderAdmin();
  }
  function onAdminClick(ev) {
    const tab=ev.target.closest('[data-tab]');if(tab){adminTab=tab.dataset.tab;editingSurveyId=null;renderAdmin();return;}
    const b=ev.target.closest('[data-action]');if(!b)return;if(b.closest('form'))ev.preventDefault();const a=b.dataset.action,id=b.dataset.id,s=store.surveys.find(x=>x.id===id);
    if(a==='new'||a==='create-template'){const draft=a==='create-template'?templateForType(b.dataset.template||'general'):{id:uid(),title:'',description:'',instructions:'',type:'general',status:'draft',createdAt:now(),updatedAt:now(),startsAt:'',endsAt:'',anonymous:true,allowDraft:true,allowEdit:false,maxResponses:1,target:{all:true,programs:[],levels:[],departments:[]},sections:[{id:uid(),title:'القسم الأول'}],questions:[],version:1,versions:[],__new:true};draft.__new=true;store.surveys.unshift(draft);editingSurveyId=draft.id;newUnsavedSurvey=true;adminTab='editor';renderAdmin();return;}
    if(a==='editor-back'){if(newUnsavedSurvey)store.surveys=store.surveys.filter(x=>x.id!==editingSurveyId);adminTab='surveys';editingSurveyId=null;newUnsavedSurvey=false;renderAdmin();return;}
    if(a==='editor-save'||a==='editor-publish'){commitEditor(a==='editor-publish');return;}
    if(a==='editor-preview'){const draft=readEditor();if(draft){studentSurveyId=draft.id;store.surveys=[draft,...store.surveys.filter(x=>x.id!==draft.id)];adminTab='preview';renderPreview(draft);}return;}
    if(a==='preview-back'){adminTab='editor';renderAdmin();return;}
    if(a==='question-add'){const f=$('#sv-editor-form');const s=readEditor();if(!s.sections.length){s.sections=[{id:uid(),title:'القسم الأول'}];}s.sections=sectionsFromEditor(f,s);const q={id:uid(),sectionId:s.sections[0].id,label:'سؤال جديد',type:'rating',required:true,options:[],min:1,max:5,allowNA:false,help:''};s.questions.push(q);store.surveys=store.surveys.filter(x=>x.id!==s.id);editingSurveyId=s.id;store.surveys.push(s);renderEditor($('#student-voice-admin-root'));return;}
    if(a==='section-add'){const s=readEditor();s.sections.push({id:uid(),title:'قسم جديد'});replaceTempEditor(s);return;}
    if(a.startsWith('q-')||a.startsWith('section-')){mutateEditor(a,id);return;}
    if(a==='edit'&&s){editingSurveyId=s.id;adminTab='editor';renderAdmin();return;}
    if(a==='clone'&&s){const n=JSON.parse(JSON.stringify(s));n.id=uid();n.title+=' — نسخة';n.status='draft';n.createdAt=now();n.updatedAt=now();n.version=1;n.versions=[];n.questions.forEach(q=>q.id=uid());n.sections.forEach(x=>{const old=x.id;x.id=uid();n.questions.filter(q=>q.sectionId===old).forEach(q=>q.sectionId=x.id);});store.surveys.unshift(n);save();log('نسخ استبيان',n.title);renderAdmin();return;}
    if(a==='publish'&&s){const qs=s.questions||[],target=s.target||{},invalid=s.title.trim().length<3||(s.startsAt&&s.endsAt&&new Date(s.endsAt)<=new Date(s.startsAt))||qs.some(q=>!q.label&&q.type!=='note')||qs.some(q=>['single','multi','select'].includes(q.type)&&!(q.options||[]).length)||(!target.all&&!(target.programs||[]).length&&!(target.levels||[]).length&&!(target.departments||[]).length)||!qs.some(q=>q.type!=='note');if(invalid){alert('لا يمكن نشر الاستبيان قبل اكتمال العنوان والأسئلة والفئة المستهدفة. افتح «تعديل» لاستكمال البيانات.');editingSurveyId=s.id;adminTab='editor';renderAdmin();return;}s.status='published';s.updatedAt=now();save();log('نشر/استئناف استبيان',s.title);renderAdmin();return;}
    if(a==='pause'&&s){s.status='paused';s.updatedAt=now();save();log('إيقاف استبيان مؤقتًا',s.title);renderAdmin();return;}
    if(a==='close'&&s){s.status='closed';s.updatedAt=now();save();log('إغلاق استبيان',s.title);renderAdmin();return;}
    if(a==='archive'&&s){s.status='archived';s.updatedAt=now();save();log('أرشفة استبيان',s.title);renderAdmin();return;}
    if(a==='delete'&&s){if(count(s.id)){alert('لا يمكن حذف استبيان له ردود؛ أرشفه للحفاظ على سجل المشاركات.');return;}if(confirm('حذف هذه المسودة نهائيًا من التخزين المحلي؟')){store.surveys=store.surveys.filter(x=>x.id!==s.id);save();log('حذف استبيان',s.title);renderAdmin();}return;}
    if(a==='results'&&s){adminTab='results';renderAdmin();setTimeout(()=>{const sel=$('#sv-result-survey');if(sel){sel.value=s.id;renderAdmin();}},0);return;}
    if(a==='export-csv'){exportResults('csv');return;} if(a==='export-xlsx'){exportResults('xlsx');return;}if(a==='print'){window.print();log('طباعة التقرير','نتائج صوت الطالب');return;}if(a==='png'){exportChartPng();return;}
    if(a==='import-template'){downloadTemplate(b.dataset.kind);return;}if(a==='import-confirm'){commitImport();return;}
    if(a==='save-settings'){const f=$('#sv-settings-form');store.settings.minAnonymousGroup=Math.max(1,Number(f.elements.minGroup.value||5));store.settings.retentionMonths=Math.max(1,Number(f.elements.retention.value||24));save();log('تعديل إعدادات الخصوصية','عتبة المجموعة/الاحتفاظ');alert('تم حفظ الإعدادات محليًا.');renderAdmin();return;}
  }
  function sectionsFromEditor(f,s){const current=$$('.sv-editor-section',f);s.sections=current.map(el=>({id:el.dataset.section,title:$('.sv-section-name',el).value.trim()||'قسم'}));return s.sections;}
  function replaceTempEditor(s){store.surveys=store.surveys.filter(x=>x.id!==s.id);store.surveys.push(s);editingSurveyId=s.id;renderEditor($('#student-voice-admin-root'));}
  function mutateEditor(action,id){
    const s=readEditor();if(!s)return;
    if(action.startsWith('q-')){const ix=s.questions.findIndex(q=>q.id===id);if(ix<0)return;if(action==='q-delete'){s.questions.splice(ix,1);}else if(action==='q-duplicate'){const q=JSON.parse(JSON.stringify(s.questions[ix]));q.id=uid();q.label+=' (نسخة)';s.questions.splice(ix+1,0,q);}else{const to=action==='q-up'?ix-1:ix+1;if(to>=0&&to<s.questions.length)[s.questions[ix],s.questions[to]]=[s.questions[to],s.questions[ix]];}}
    if(action.startsWith('section-')){const ix=s.sections.findIndex(x=>x.id===id);if(ix<0)return;if(action==='section-delete'){if(s.sections.length===1){alert('يجب الإبقاء على قسم واحد على الأقل.');return;}const removed=s.sections.splice(ix,1)[0];s.questions=s.questions.filter(q=>q.sectionId!==removed.id);}else{const to=action==='section-up'?ix-1:ix+1;if(to>=0&&to<s.sections.length)[s.sections[ix],s.sections[to]]=[s.sections[to],s.sections[ix]];}}
    replaceTempEditor(s);
  }
  function renderPreview(s) {
    const root=$('#student-voice-admin-root');root.innerHTML=pageHead('معاينة: '+s.title,'هذه معاينة محلية قبل الحفظ والنشر.')+`<button class="btn btn-outline" data-action="preview-back">عودة للمحرر</button><div class="sv-panel">${s.sections.map(sec=>`<h2>${esc(sec.title)}</h2>${s.questions.filter(q=>q.sectionId===sec.id).map(q=>questionControl(q,'')).join('')}`).join('')}</div>`;root.onclick=onAdminClick;
  }
  function resultsPage() {
    const chosen=$('#sv-result-survey')?.value||store.surveys.find(s=>s.status==='published')?.id||store.surveys[0]?.id||'';
    const s=store.surveys.find(x=>x.id===chosen); if(!s)return `<section class="sv-panel">${empty('أنشئ استبيانًا أولًا لتظهر النتائج.')}</section>`;
    let rows=store.responses.filter(r=>r.surveyId===s.id&&r.status==='submitted');
    const program=$('#sv-result-program')?.value||'',level=$('#sv-result-level')?.value||'',term=$('#sv-result-term')?.value||'';
    rows=rows.filter(r=>(!program||r.context?.program===program)&&(!level||r.context?.level===level)&&(!term||r.context?.term===term));
    const min=Number(store.settings.minAnonymousGroup||5),hidden=s.anonymous&&rows.length<min;
    const ratings=s.questions.filter(q=>['rating','likert','stars'].includes(q.type));
    const stats=ratings.map(q=>{const vals=rows.map(r=>Number(r.answers?.[q.id])).filter(n=>Number.isFinite(n)&&n>=1&&n<=5);const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;return {label:q.label,avg,n:vals.length};});
    const max=Math.max(5,...stats.map(x=>x.avg));
    const chart=hidden?`<div class="sv-suppressed">النتائج التفصيلية مخفية لأن العينة أقل من ${min} مشاركات. هذا الإجراء للعرض التجريبي فقط.</div>`:`<div class="sv-chart">${stats.map(x=>`<div class="sv-chart-row"><span title="${esc(x.label)}">${esc(x.label)}</span><div><i style="width:${Math.max(0,Math.min(100,x.avg/max*100))}%"></i></div><b>${x.n?x.avg.toFixed(2):'—'}</b></div>`).join('')||empty('لا توجد أسئلة تقييم رقمية.')}</div>`;
    const comments=s.questions.filter(q=>['short','long'].includes(q.type));
    const commentHtml=hidden?'':comments.map(q=>{const vals=rows.map(r=>r.answers?.[q.id]).filter(Boolean);return vals.length?`<details class="sv-comments"><summary>${esc(q.label)} (${vals.length})</summary><ul>${vals.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:''}).join('');
    const contextRows=hidden?'':rows.map(r=>`<tr><td>${esc(fmt(r.submittedAt))}</td><td>${s.anonymous?'مجهول محليًا':esc(r.respondentCode||'—')}</td><td>${esc(r.context?.program||'—')}</td><td>${esc(r.context?.level||'—')}</td><td>${esc(r.context?.course||'—')}</td><td>${esc(r.context?.instructor||'—')}</td><td><button data-action="response" data-id="${esc(r.id)}">تفاصيل</button></td></tr>`).join('');
    return `<section class="sv-panel"><div class="sv-panel-head"><div><span class="sv-kicker">تحليل الردود</span><h2>النتائج والاستجابات</h2></div><div class="sv-inline-actions"><button class="btn btn-outline" data-action="export-csv">CSV</button><button class="btn btn-outline" data-action="export-xlsx">Excel</button><button class="btn btn-outline" data-action="print">طباعة / PDF</button><button class="btn btn-outline" data-action="png">حفظ الرسم PNG</button></div></div><div class="sv-result-filters"><label>الاستبيان<select class="form-control" id="sv-result-survey">${store.surveys.map(x=>`<option value="${esc(x.id)}" ${x.id===s.id?'selected':''}>${esc(x.title)}</option>`).join('')}</select></label><label>البرنامج<input class="form-control" id="sv-result-program" value="${esc(program)}" placeholder="كل البرامج"></label><label>المستوى<input class="form-control" id="sv-result-level" value="${esc(level)}" placeholder="كل المستويات"></label><label>الفصل<input class="form-control" id="sv-result-term" value="${esc(term)}" placeholder="كل الفصول"></label><button class="btn btn-ghost" data-action="refresh-results">تطبيق</button></div><div class="sv-local-warning sv-small-warning"><b>خصوصية:</b> النتائج من بيانات المتصفح فقط. في الاستبيان المجهول لا يظهر كود الطالب في التقرير، لكن التخزين المحلي قابل للفحص؛ لا تستخدم ردودًا حقيقية.</div><div class="sv-result-metrics"><div><b>${rows.length}</b><span>استجابات مكتملة</span></div><div><b>${s.target?.all?'غير محدد محليًا':'فئات مستهدفة'}</b><span>نسبة المشاركة لا تحسب دون تعداد أهلية موثوق</span></div><div><b>${hidden?'مخفاة':stats.filter(x=>x.n).length}</b><span>مؤشرات متاحة</span></div></div><h3>متوسطات التقييم (من 5)</h3>${chart}${commentHtml?`<h3>الملاحظات النصية</h3>${commentHtml}`:''}<h3>سجل الاستجابات</h3><div class="sv-table-wrap"><table class="sv-table"><thead><tr><th>وقت الإرسال</th><th>المشارك</th><th>البرنامج</th><th>المستوى</th><th>المقرر</th><th>عضو هيئة التدريس</th><th></th></tr></thead><tbody>${contextRows||`<tr><td colspan="7">${hidden?'البيانات مخفية لخصوصية العينة.':'لا توجد استجابات بعد.'}</td></tr>`}</tbody></table></div></section>`;
  }
  function filteredResults() {
    const id=$('#sv-result-survey')?.value||store.surveys[0]?.id,program=$('#sv-result-program')?.value||'',level=$('#sv-result-level')?.value||'',term=$('#sv-result-term')?.value||'';return store.responses.filter(r=>r.surveyId===id&&r.status==='submitted'&&(!program||r.context?.program===program)&&(!level||r.context?.level===level)&&(!term||r.context?.term===term));
  }
  function exportResults(format) {
    const id=$('#sv-result-survey')?.value||store.surveys[0]?.id,s=store.surveys.find(x=>x.id===id),rows=filteredResults();if(!s||!rows.length){alert('لا توجد استجابات لتصديرها.');return;}if(s.anonymous&&rows.length<Number(store.settings.minAnonymousGroup||5)){alert('أُوقف التصدير لأن عينة الاستبيان المجهول أقل من الحد الأدنى لإظهار النتائج.');return;}
    const flat=rows.map(r=>{const obj={وقت_الإرسال:r.submittedAt,المقرر:r.context?.course,البرنامج:r.context?.program,المستوى:r.context?.level,الفصل:r.context?.term};if(!s.anonymous)obj.كود_الطالب=r.respondentCode;for(const q of s.questions)if(q.type!=='note')obj[q.label]=Array.isArray(r.answers[q.id])?r.answers[q.id].join('، '):r.answers[q.id]??'';return obj;});
    if(format==='xlsx'&&window.XLSX){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(flat),'الاستجابات');XLSX.writeFile(wb,'صوت-الطالب-نتائج.xlsx');}else{const keys=Object.keys(flat[0]),csv='\ufeff'+[keys.join(','),...flat.map(r=>keys.map(k=>'"'+String(r[k]??'').replace(/"/g,'""')+'"').join(','))].join('\r\n');downloadBlob(csv,'صوت-الطالب-نتائج.csv','text/csv;charset=utf-8');}
    log('تصدير نتائج',s.title+' · '+format);
  }
  function exportChartPng() {
    const svg=$('.sv-chart svg');
    const rows=$$('.sv-chart-row');if(!rows.length){alert('لا يوجد رسم متاح للتصدير.');return;}
    const width=1100,height=100+rows.length*46;const labels=rows.map((r,i)=>({label:r.children[0].textContent,avg:r.children[2].textContent,pct:parseFloat(r.children[1].firstElementChild.style.width)||0,i}));
    const safe=esc;let svgText=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="${width-30}" y="45" text-anchor="end" font-size="24" font-family="Arial" fill="#153451">نتائج تقييم صوت الطالب</text>`;
    labels.forEach(x=>{const y=85+x.i*46;svgText+=`<text x="${width-30}" y="${y+18}" text-anchor="end" font-size="14" font-family="Arial" fill="#34495e">${safe(x.label.slice(0,55))}</text><rect x="150" y="${y}" width="640" height="20" rx="10" fill="#edf2f5"/><rect x="150" y="${y}" width="${640*x.pct/100}" height="20" rx="10" fill="#168779"/><text x="120" y="${y+16}" font-size="14" font-family="Arial" fill="#153451">${safe(x.avg)}</text>`;});svgText+='</svg>';
    const blob=new Blob([svgText],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d').drawImage(img,0,0);c.toBlob(b=>{downloadBlob(b,'صوت-الطالب-رسم.png','image/png');URL.revokeObjectURL(url);});};img.onerror=()=>{URL.revokeObjectURL(url);alert('تعذر إنشاء الصورة.');};img.src=url;log('تصدير رسم PNG','نتائج صوت الطالب');
  }
  function catalogPage() {
    return `<section class="sv-panel"><div class="sv-panel-head"><div><span class="sv-kicker">فهارس محلية</span><h2>المقررات وأعضاء هيئة التدريس</h2></div><button class="btn btn-teal" data-tab="imports">استيراد/تحديث</button></div><div class="sv-catalog-grid"><div><h3>المقررات (${store.courses.length})</h3>${catalogTable(store.courses,['code','name','department','program','level','term','hours'])}</div><div><h3>أعضاء هيئة التدريس (${store.instructors.length})</h3>${catalogTable(store.instructors,['name','department','degree'])}</div></div><p class="sv-muted">هذه فهارس مستقلة للاختبار ولا تُغيّر بيانات الطلاب أو الفهرس الأكاديمي الأصلي.</p></section>`;
  }
  function catalogTable(items,fields){return items.length?`<div class="sv-table-wrap"><table class="sv-table"><thead><tr>${fields.map(f=>`<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${items.slice(0,80).map(x=>`<tr>${fields.map(f=>`<td>${esc(x[f]||'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:empty('لا توجد سجلات مستوردة بعد.')}
  function importPage() {
    return `<section class="sv-panel"><span class="sv-kicker">استيراد الأكاديميين والمقررات</span><h2>استيراد فهرس تجريبي</h2><p class="sv-muted">يدعم CSV وExcel. راجع المعاينة والأخطاء قبل الحفظ. الإضافة/التحديث لا تحذف القديم؛ الاستبدال يخص هذا الفهرس المحلي فقط وبعد تأكيد إضافي.</p><div class="sv-import-grid"><article><h3>أعضاء هيئة التدريس</h3><p>الاسم، القسم، الدرجة</p><button class="btn btn-ghost" data-action="import-template" data-kind="instructors">تنزيل قالب CSV</button></article><article><h3>المقررات</h3><p>الكود، الاسم، القسم، البرنامج، المستوى، الفصل، الساعات، العام</p><button class="btn btn-ghost" data-action="import-template" data-kind="courses">تنزيل قالب CSV</button></article></div><div class="sv-import-controls"><label>نوع الفهرس<select id="sv-import-kind" class="form-control"><option value="courses">المقررات</option><option value="instructors">أعضاء هيئة التدريس</option></select></label><label>طريقة التطبيق<select id="sv-import-mode" class="form-control"><option value="merge">إضافة أو تحديث حسب المفتاح</option><option value="replace">استبدال الفهرس المحلي المحدد (يتطلب تأكيدًا)</option></select></label><label>اختر ملفًا<input id="sv-import-file" class="form-control" type="file" accept=".csv,.xlsx,.xls"></label></div><div id="sv-import-preview">${importPreview?renderImportPreview():empty('اختر ملف CSV أو Excel لعرض المعاينة.')}</div></section>`;
  }
  function renderImportPreview(){if(!importPreview)return '';return `<h3>معاينة: ${importPreview.valid.length} صالح · ${importPreview.errors.length} مرفوض</h3><div class="sv-table-wrap"><table class="sv-table"><tbody>${importPreview.valid.slice(0,8).map(r=>`<tr>${Object.values(r).map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${importPreview.errors.length?`<ul class="sv-import-errors">${importPreview.errors.slice(0,15).map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`:''}<button class="btn btn-teal" data-action="import-confirm" ${importPreview.valid.length?'':'disabled'}>تأكيد الاستيراد (${importPreview.valid.length})</button>`;}
  function settingsPage(){return `<section class="sv-panel"><span class="sv-kicker">إعدادات محلية فقط</span><h2>الخصوصية والاحتفاظ</h2><div class="sv-local-warning"><b>هذا لا يطبق سياسة جامعية.</b> إعدادات الاحتفاظ لا تحذف تلقائيًا. لا تستخدم بيانات حقيقية؛ التخزين على جهاز واحد وغير محمي.</div><form id="sv-settings-form"><label>أقل حجم عينة لإظهار المؤشرات الرقمية <input class="form-control sv-small-input" name="minGroup" type="number" min="1" max="100" value="${Number(store.settings.minAnonymousGroup||5)}"></label><label>مدة الاحتفاظ المقترحة (شهرًا) <input class="form-control sv-small-input" name="retention" type="number" min="1" max="120" value="${Number(store.settings.retentionMonths||24)}"></label><button type="button" class="btn btn-teal" data-action="save-settings">حفظ إعدادات العرض المحلية</button></form></section>`;}
  function auditPage(){return `<section class="sv-panel"><div class="sv-panel-head"><div><span class="sv-kicker">تتبّع محلي</span><h2>سجل العمليات الإدارية</h2></div><span>${store.audit.length} عملية</span></div><div class="sv-table-wrap"><table class="sv-table"><thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>التفاصيل</th></tr></thead><tbody>${store.audit.slice(0,300).map(x=>`<tr><td>${esc(fmt(x.at))}</td><td>${esc(x.actor)}</td><td>${esc(x.action)}</td><td>${esc(x.detail)}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد عمليات مسجلة بعد.</td></tr>'}</tbody></table></div></section>`;}

  async function readImport(file) {
    if(!file||!window.XLSX){alert('قارئ Excel غير متاح. استخدم CSV.');return;}
    const kind=$('#sv-import-kind').value, wb=XLSX.read(await file.arrayBuffer(),{type:'array'}), ws=wb.Sheets[wb.SheetNames[0]], raw=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
    const map=kind==='courses'?{code:['كود المقرر','الكود','code'],name:['اسم المقرر','المقرر','name'],department:['القسم','department'],program:['البرنامج','program'],level:['المستوى','level'],term:['الفصل','الفصل الدراسي','term'],hours:['الساعات','الساعات المعتمدة','hours'],year:['العام','العام الدراسي','year']}:{name:['الاسم','اسم عضو هيئة التدريس','name'],department:['القسم','department'],degree:['الدرجة','الدرجة العلمية','degree']};
    const valid=[],errors=[];
    raw.forEach((row,i)=>{const norm={};for(const [field,aliases] of Object.entries(map)){const k=Object.keys(row).find(key=>aliases.some(a=>key.trim().toLowerCase()===a.toLowerCase()));norm[field]=k?String(row[k]).trim():'';}if(kind==='courses'&&(!norm.code||!norm.name)){errors.push(`صف ${i+2}: كود المقرر والاسم مطلوبان.`);return;}if(kind==='instructors'&&!norm.name){errors.push(`صف ${i+2}: الاسم مطلوب.`);return;}if(kind==='courses'&&norm.hours&&(!Number.isFinite(Number(norm.hours))||Number(norm.hours)<0)){errors.push(`صف ${i+2}: قيمة الساعات غير صحيحة.`);return;}valid.push(norm);});
    importPreview={kind,valid,errors,mode:$('#sv-import-mode').value};renderAdmin();
  }
  function commitImport(){if(!importPreview?.valid.length)return;const kind=importPreview.kind,field=kind==='courses'?'courses':'instructors',key=kind==='courses'?'code':'name';if(importPreview.mode==='replace'&&!confirm(`سيتم استبدال فهرس ${kind==='courses'?'المقررات':'الأعضاء'} المحلي فقط بعد معاينة ${importPreview.valid.length} صفًا. المتابعة؟`))return;
    let arr=importPreview.mode==='replace'?[]:[...store[field]],added=0,updated=0;for(const row of importPreview.valid){const ix=arr.findIndex(x=>String(x[key]).toLowerCase()===String(row[key]).toLowerCase());if(ix>=0){arr[ix]={...arr[ix],...row};updated++;}else{arr.push(row);added++;}}store[field]=arr;log('استيراد فهرس',`${kind}: أضيف ${added}، حُدّث ${updated}، رُفض ${importPreview.errors.length}`);alert(`اكتمل الاستيراد المحلي: أضيف ${added}، حُدّث ${updated}، رُفض ${importPreview.errors.length}.`);importPreview=null;adminTab='catalog';save();renderAdmin();}
  function downloadTemplate(kind){const data=kind==='courses'?[{'كود المقرر':'BIO101','اسم المقرر':'مقدمة في الأحياء','القسم':'الأحياء','البرنامج':'علوم الحياة','المستوى':'الأول','الفصل':'الأول','الساعات':3,'العام':'2026/2027'}]:[{'الاسم':'اسم عضو هيئة التدريس','القسم':'القسم','الدرجة':'أستاذ مساعد'}];const headers=Object.keys(data[0]),csv='\ufeff'+[headers.join(','),...data.map(r=>headers.map(h=>'"'+r[h]+'"').join(','))].join('\r\n');downloadBlob(csv,kind==='courses'?'قالب-المقررات.csv':'قالب-أعضاء-هيئة-التدريس.csv','text/csv;charset=utf-8');}
  function downloadBlob(content,name,type){const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

  function init(){store=readStore();const admin=$('#student-voice-admin-root');if(admin){admin.addEventListener('change',ev=>{if(ev.target.id==='sv-import-file')readImport(ev.target.files?.[0]);if(ev.target.matches('#sv-result-survey,#sv-result-program,#sv-result-level,#sv-result-term'))renderAdmin();});admin.addEventListener('input',ev=>{if(ev.target.id==='sv-survey-search'||ev.target.id==='sv-survey-filter'){const q=($('#sv-survey-search')?.value||'').toLowerCase(),f=$('#sv-survey-filter')?.value||'';$$('[data-survey-row]',admin).forEach(row=>{const s=store.surveys.find(x=>x.id===row.dataset.surveyRow);row.hidden=!!(q&&!(`${s.title} ${s.description}`.toLowerCase().includes(q)))||!!(f&&derivedStatus(s)!==f);});}});admin.addEventListener('submit',ev=>{if(ev.target.id==='sv-settings-form')ev.preventDefault();});}
    const stu=$('#student-voice-root');if(stu)stu.addEventListener('change',ev=>{if(ev.target.matches('[data-qna]')){const id=ev.target.dataset.qna;$$(`[name="q-${CSS.escape(id)}"]`,stu).forEach(x=>{x.checked=false;x.disabled=ev.target.checked;});}});
    window.addEventListener('storage',ev=>{if(ev.key===KEY){store=readStore();if(App.getCurrentView()==='student-voice')renderStudent();if(App.getCurrentView()==='voice-admin')renderAdmin();}});
  }
  window.StudentVoice={init,renderStudent,renderAdmin};
  init();
})();
