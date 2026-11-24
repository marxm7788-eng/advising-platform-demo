/**
 * Forms, Applications & Workflow UI
 * Dynamic fields + server-side transitions via DB RPC
 */
(function () {
  'use strict';

  function esc(s) {
    return (window.DB && DB.escapeHtml) ? DB.escapeHtml(s) : String(s == null ? '' : s);
  }

  function statusBadge(st) {
    const map = {
      draft: 'badge',
      submitted: 'badge badge-blue',
      in_review: 'badge badge-blue',
      approved: 'badge badge-green',
      rejected: 'badge badge-red',
      executed: 'badge badge-green',
      cancelled: 'badge',
      returned: 'badge badge-warn'
    };
    const labels = {
      draft: 'مسودة', submitted: 'مقدَّم', in_review: 'قيد المراجعة',
      approved: 'معتمد', rejected: 'مرفوض', executed: 'تم التنفيذ',
      cancelled: 'ملغى', returned: 'مُعاد للتعديل'
    };
    return `<span class="${map[st] || 'badge'}">${labels[st] || esc(st)}</span>`;
  }

  async function renderFormsList() {
    const grid = document.getElementById('forms-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="empty">جاري التحميل...</div>';
    let forms = [];
    try {
      if (window.DB && DB.isOnline()) forms = await DB.listFormTypes();
    } catch (e) { console.error(e); }

    if (!forms.length && window.S && S.formTypes) {
      forms = S.formTypes.map(function (f) {
        return {
          code: f.id, name_ar: f.nameAr, description: f.desc, icon: f.icon,
          color: f.color, needs_courses: f.needsCourses, needs_transcript: f.needsTranscript,
          category: f.category, _local: true
        };
      });
    }

    if (!forms.length) {
      grid.innerHTML = '<div class="empty">لا نماذج مفعّلة</div>';
      return;
    }

    grid.innerHTML = forms.map(function (f) {
      const code = f.code || f.id;
      return `<div class="card form-card" style="border-top:3px solid ${esc(f.color || '#0d9488')}">
        <div class="card-body">
          <div class="flex gap-2 items-center mb-2">
            <i class="fas ${esc(f.icon || 'fa-file-alt')}" style="color:${esc(f.color || '#0d9488')}"></i>
            <div class="fw-extrabold">${esc(f.name_ar || f.nameAr)}</div>
          </div>
          <div class="text-sm text-muted mb-3">${esc(f.description || f.desc || '')}</div>
          <div class="text-xs text-muted mb-2">${f.needs_transcript || f.needsTranscript ? 'يتطلب سجل أكاديمي · ' : ''}${f.needs_courses || f.needsCourses ? 'مقررات' : ''}</div>
          <button type="button" class="btn btn-primary btn-sm" onclick="FormsWF.openForm('${esc(code)}')">
            <i class="fas fa-pen"></i> تقديم الطلب
          </button>
        </div>
      </div>`;
    }).join('');
  }

  let _currentFormCode = null;
  let _transcriptFile = null;

  async function openForm(code) {
    _currentFormCode = code;
    _transcriptFile = null;
    if (window.App && App.navigate) App.navigate('form-fill');

    const root = document.getElementById('view-form-fill');
    if (!root) return;
    root.innerHTML = '<div class="empty">جاري تحميل النموذج...</div>';

    let formMeta = null;
    let fields = [];
    if (window.DB && DB.isOnline()) {
      const all = await DB.listFormTypes();
      formMeta = all.find(function (f) { return f.code === code; });
      if (formMeta) fields = await DB.listFormFields(formMeta.id);
    }
    if (!formMeta && window.S && S.formTypes) {
      const f = S.formTypes.find(function (x) { return x.id === code; });
      if (f) formMeta = { code: f.id, name_ar: f.nameAr, description: f.desc, needs_transcript: f.needsTranscript, needs_courses: f.needsCourses };
    }
    if (!formMeta) {
      root.innerHTML = '<div class="alert alert-warn">النموذج غير موجود</div>';
      return;
    }

    // default fields if none in DB
    if (!fields.length) {
      fields = [
        { field_key: 'semester', label_ar: 'الفصل الدراسي', field_type: 'select', is_required: true, options_json: ['الفصل الأول', 'الفصل الثاني', 'صيفي'] },
        { field_key: 'reason', label_ar: 'سبب الطلب', field_type: 'textarea', is_required: true },
        { field_key: 'notes', label_ar: 'ملاحظات', field_type: 'textarea', is_required: false }
      ];
      if (formMeta.needs_courses) {
        fields.push({ field_key: 'courses', label_ar: 'المقررات (كود — مفصولة بفاصلة)', field_type: 'text', is_required: true });
      }
    }

    let fieldsHtml = fields.map(function (fld) {
      return renderField(fld);
    }).join('');

    root.innerHTML = `
      <div class="card"><div class="card-body">
        <button type="button" class="btn btn-sm btn-outline mb-3" onclick="App.navigate('forms-list')"><i class="fas fa-arrow-right"></i> رجوع</button>
        <div class="fw-extrabold mb-1">${esc(formMeta.name_ar)}</div>
        <div class="text-sm text-muted mb-3">${esc(formMeta.description || '')}</div>
        <form id="dyn-form" onsubmit="FormsWF.submitCurrent(event)">
          ${fieldsHtml}
          ${formMeta.needs_transcript !== false ? `
          <div class="form-group">
            <label>السجل الأكاديمي (PDF/صورة) ${formMeta.needs_transcript ? '*' : ''}</label>
            <input type="file" class="form-control" id="fw-transcript" accept=".pdf,image/*" onchange="FormsWF.onTranscript(event)"/>
            <div class="text-xs text-muted">مطلوب للتقديم على معظم نماذج الإرشاد</div>
          </div>` : ''}
          <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> إرسال الطلب</button>
        </form>
      </div></div>`;
  }

  function renderField(fld) {
    const req = fld.is_required ? 'required' : '';
    const id = 'ff-' + fld.field_key;
    let opts = fld.options_json;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts); } catch (e) { opts = []; }
    }
    if (!Array.isArray(opts)) opts = [];

    switch (fld.field_type) {
      case 'textarea':
        return `<div class="form-group"><label>${esc(fld.label_ar)}</label>
          <textarea class="form-control" id="${id}" data-key="${esc(fld.field_key)}" ${req} rows="3"></textarea></div>`;
      case 'number':
        return `<div class="form-group"><label>${esc(fld.label_ar)}</label>
          <input type="number" class="form-control" id="${id}" data-key="${esc(fld.field_key)}" ${req}/></div>`;
      case 'date':
        return `<div class="form-group"><label>${esc(fld.label_ar)}</label>
          <input type="date" class="form-control" id="${id}" data-key="${esc(fld.field_key)}" ${req}/></div>`;
      case 'select':
        return `<div class="form-group"><label>${esc(fld.label_ar)}</label>
          <select class="form-control" id="${id}" data-key="${esc(fld.field_key)}" ${req}>
            <option value="">— اختر —</option>
            ${opts.map(function (o) { return `<option value="${esc(o)}">${esc(o)}</option>`; }).join('')}
          </select></div>`;
      case 'checkbox':
        return `<div class="form-group"><label><input type="checkbox" id="${id}" data-key="${esc(fld.field_key)}"/> ${esc(fld.label_ar)}</label></div>`;
      case 'file':
        return `<div class="form-group"><label>${esc(fld.label_ar)}</label>
          <input type="file" class="form-control" id="${id}" data-key="${esc(fld.field_key)}" ${req}/></div>`;
      case 'course_selector':
        return `<div class="form-group"><label>${esc(fld.label_ar)}</label>
          <input class="form-control" id="${id}" data-key="${esc(fld.field_key)}" ${req} placeholder="مثل CHEM101, MATH201"/></div>`;
      default:
        return `<div class="form-group"><label>${esc(fld.label_ar)}</label>
          <input class="form-control" id="${id}" data-key="${esc(fld.field_key)}" ${req}/></div>`;
    }
  }

  function onTranscript(ev) {
    _transcriptFile = ev.target.files && ev.target.files[0] || null;
  }

  async function submitCurrent(e) {
    e.preventDefault();
    if (!window.DB || !DB.isOnline()) return toast('يتطلب الاتصال بالخادم', 'err');
    if (!_currentFormCode) return toast('لا يوجد نموذج', 'err');

    const data = {};
    document.querySelectorAll('#dyn-form [data-key]').forEach(function (el) {
      const key = el.getAttribute('data-key');
      if (el.type === 'checkbox') data[key] = el.checked;
      else data[key] = el.value;
    });

    const hasTranscript = !!_transcriptFile;
    const btn = e.target.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      let res;
      const cu = window.__fosCurrentUser;
      if (window.FOS_MODE === 'local' && window.LocalStore) {
        res = LocalStore.submitApplication(_currentFormCode, data, hasTranscript, cu);
      } else {
        res = await DB.submitApplication(_currentFormCode, data, hasTranscript);
        if (res.ok && _transcriptFile && res.application_id && DB.uploadTranscript) {
          const up = await DB.uploadTranscript(res.application_id, _transcriptFile);
          if (!up.ok) toast('تم إنشاء الطلب لكن فشل رفع المرفق: ' + (up.error || ''), 'err');
        }
      }
      if (!res.ok) return toast(res.error || 'فشل التقديم', 'err');
      toast('تم تقديم الطلب ' + (res.application_number || ''));
      if (window.App) App.navigate('my-requests');
    } catch (err) {
      console.error(err);
      toast(err.message || 'خطأ', 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function renderMyRequests() {
    const el = document.getElementById('my-requests-list') || document.getElementById('view-my-requests');
    if (!el) return;
    const host = document.getElementById('my-requests-list') || el;
    host.innerHTML = '<div class="empty">جاري التحميل...</div>';
    let apps = [];
    if (window.FOS_MODE === 'local' && window.LocalStore) {
      const cu = window.__fosCurrentUser;
      apps = LocalStore.listApplications({ studentId: cu && (cu.id || cu.code) });
    } else if (window.DB && DB.isOnline()) {
      apps = await DB.listMyApplications();
    } else {
      host.innerHTML = '<div class="alert alert-warn">عرض الطلبات غير متاح</div>';
      return;
    }
    if (!apps.length) {
      host.innerHTML = '<div class="empty">لا طلبات بعد</div>';
      return;
    }
    host.innerHTML = apps.map(function (a) {
      const num = a.application_number || a.public_code || a.id;
      const fname = (a.form_types && a.form_types.name_ar) || a.form_name || a.form_code;
      const step = a.workflow_steps && a.workflow_steps.name_ar;
      return `<div class="list-item" onclick="FormsWF.openDetail('${esc(a.id)}')">
        <div>
          <div class="fw-bold">${esc(fname || 'طلب')} · ${esc(num)}</div>
          <div class="text-xs text-muted">${step ? 'الخطوة: ' + esc(step) + ' · ' : ''}${new Date(a.created_at).toLocaleString('ar-EG')}</div>
        </div>
        ${statusBadge(a.status)}
      </div>`;
    }).join('');
  }

  async function renderStaffInbox() {
    const el = document.getElementById('staff-inbox-list') || document.getElementById('view-staff-inbox');
    if (!el) return;
    const host = document.getElementById('staff-inbox-list') || el;
    host.innerHTML = '<div class="empty">جاري التحميل...</div>';
    let apps = [];
    if (window.FOS_MODE === 'local' && window.LocalStore) {
      apps = LocalStore.listApplications({ inbox: true });
    } else if (window.DB && DB.isOnline()) {
      apps = await DB.listStaffInboxApps();
    } else {
      host.innerHTML = '<div class="alert alert-warn">صندوق الوارد غير متاح</div>';
      return;
    }
    if (!apps.length) {
      host.innerHTML = '<div class="empty">لا طلبات بانتظار الإجراء</div>';
      return;
    }
    host.innerHTML = apps.map(function (a) {
      const st = a.students || {};
      const pname = st.profiles && st.profiles.full_name;
      const num = a.application_number || a.public_code;
      const fname = (a.form_types && a.form_types.name_ar) || a.form_name || a.form_code;
      const step = a.workflow_steps && a.workflow_steps.name_ar;
      return `<div class="list-item" onclick="FormsWF.openDetail('${esc(a.id)}')">
        <div>
          <div class="fw-bold">${esc(pname || '—')} (${esc(st.student_code || '')})</div>
          <div class="text-sm">${esc(fname)} · ${esc(num)}</div>
          <div class="text-xs text-muted">${esc(step || '')}</div>
        </div>
        ${statusBadge(a.status)}
      </div>`;
    }).join('');
  }

  async function openDetail(appId) {
    if (window.App && App.navigate) App.navigate('request-detail');
    const root = document.getElementById('view-request-detail');
    if (!root) return;
    root.innerHTML = '<div class="empty">جاري التحميل...</div>';
    let detail = null;
    if (window.FOS_MODE === 'local' && window.LocalStore) {
      const loc = LocalStore.getApplication(appId);
      if (!loc) {
        root.innerHTML = '<div class="alert alert-warn">تعذر تحميل الطلب</div>';
        return;
      }
      const stepNames = ['مراجعة المرشد', 'مراجعة المنسق', 'مراجعة المدير', 'تنفيذ شؤون الطلاب'];
      detail = {
        app: Object.assign({}, loc, {
          form_types: { name_ar: loc.form_name || loc.form_code },
          students: { student_code: loc.student_code, profiles: { full_name: loc.student_name } },
          workflow_steps: loc.current_step_key ? { name_ar: stepNames[loc.current_step] || loc.current_step_key, sort_order: loc.current_step, allowed_actions: ['approve','reject','execute'] } : null
        }),
        history: (loc.history || []).map(function (h) {
          return { action: h.action, note: h.note, created_at: h.at, from_status: '', to_status: '', profiles: { full_name: h.actor } };
        }),
        steps: stepNames.map(function (n, i) {
          return { id: 's'+i, name_ar: n, sort_order: i, step_key: ['advisor_review','coordinator_review','manager_review','affairs_execute'][i] };
        }),
        fieldData: Object.keys(loc.data || {}).map(function (k) {
          return { field_key: k, value_json: { value: loc.data[k] } };
        }),
        attachments: []
      };
    } else {
      detail = await DB.getApplicationDetail(appId);
    }
    if (!detail || !detail.app) {
      root.innerHTML = '<div class="alert alert-warn">تعذر تحميل الطلب</div>';
      return;
    }
    const a = detail.app;
    const num = a.application_number || a.public_code;
    const fname = (a.form_types && a.form_types.name_ar) || a.form_name || a.form_code;
    const stName = a.students && a.students.profiles && a.students.profiles.full_name;
    const stCode = a.students && a.students.student_code;
    const curStep = a.workflow_steps;

    // timeline
    const steps = detail.steps || [];
    const curOrder = curStep ? curStep.sort_order : 999;
    const timeline = steps.map(function (s) {
      const done = s.sort_order < curOrder || a.status === 'executed' || a.status === 'approved';
      const active = curStep && s.id === curStep.id;
      return `<div class="wf-step ${done ? 'done' : ''} ${active ? 'active' : ''}">
        <div class="wf-dot"></div>
        <div class="wf-label">${esc(s.name_ar)}</div>
      </div>`;
    }).join('');

    const hist = (detail.history || []).map(function (h) {
      const actor = h.profiles && h.profiles.full_name;
      return `<div class="list-item">
        <div>
          <div class="text-sm"><b>${esc(h.action)}</b> — ${esc(actor || '')}</div>
          <div class="text-xs text-muted">${h.note ? esc(h.note) + ' · ' : ''}${h.created_at ? new Date(h.created_at).toLocaleString('ar-EG') : ''}</div>
        </div>
        <div class="text-xs">${esc(h.from_status || '')} → ${esc(h.to_status || '')}</div>
      </div>`;
    }).join('') || '<div class="text-muted text-sm">لا سجل</div>';

    const dataRows = (detail.fieldData || []).map(function (f) {
      const v = f.value_json && (f.value_json.value !== undefined ? f.value_json.value : f.value_json);
      return `<tr><td>${esc(f.field_key)}</td><td>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`;
    }).join('');

    const allowed = (curStep && curStep.allowed_actions) || ['approve', 'reject'];
    const isStudent = window.__fosCurrentUser && window.__fosCurrentUser.is_student;
    const closed = ['executed', 'rejected', 'cancelled'].indexOf(a.status) >= 0;

    let actionsHtml = '';
    if (!closed && !isStudent) {
      actionsHtml = `
        <div class="card mt-3"><div class="card-body">
          <div class="fw-bold mb-2">إجراء على الطلب</div>
          <div class="form-group"><label>ملاحظة</label><textarea class="form-control" id="proc-note" rows="2"></textarea></div>
          <div class="flex gap-2 flex-wrap">
            ${allowed.indexOf('approve') >= 0 ? `<button type="button" class="btn btn-primary btn-sm" onclick="FormsWF.act('${esc(a.id)}','approve')">اعتماد</button>` : ''}
            ${allowed.indexOf('reject') >= 0 ? `<button type="button" class="btn btn-danger btn-sm" onclick="FormsWF.act('${esc(a.id)}','reject')">رفض</button>` : ''}
            ${allowed.indexOf('return') >= 0 ? `<button type="button" class="btn btn-outline btn-sm" onclick="FormsWF.act('${esc(a.id)}','return')">إعادة للطالب</button>` : ''}
            ${allowed.indexOf('execute') >= 0 ? `<button type="button" class="btn btn-teal btn-sm" onclick="FormsWF.act('${esc(a.id)}','execute')">تم التنفيذ</button>` : ''}
          </div>
        </div></div>`;
    }

    root.innerHTML = `
      <button type="button" class="btn btn-sm btn-outline mb-3" onclick="App.navigate(window.__fosCurrentUser && window.__fosCurrentUser.is_student ? 'my-requests' : 'staff-inbox')">
        <i class="fas fa-arrow-right"></i> رجوع
      </button>
      <div class="card mb-3"><div class="card-body">
        <div class="flex justify-between flex-wrap gap-2">
          <div>
            <div class="fw-extrabold" style="font-size:1.15rem">${esc(fname || 'طلب')}</div>
            <div class="text-sm text-muted">رقم: <b>${esc(num)}</b></div>
            <div class="text-sm">الطالب: <b>${esc(stName || '')}</b> (${esc(stCode || '')})</div>
          </div>
          <div>${statusBadge(a.status)}</div>
        </div>
        <div class="text-xs text-muted mt-2">آخر تحديث: ${a.updated_at ? new Date(a.updated_at).toLocaleString('ar-EG') : '—'}</div>
      </div></div>

      <div class="card mb-3"><div class="card-body">
        <div class="fw-bold mb-2">مسار الاعتماد</div>
        <div class="wf-timeline">${timeline || '<span class="text-muted">لا خطوات مُعرّفة</span>'}</div>
        ${curStep ? `<div class="text-sm mt-2">الخطوة الحالية: <b>${esc(curStep.name_ar)}</b></div>` : ''}
      </div></div>

      <div class="card mb-3"><div class="card-body">
        <div class="fw-bold mb-2">بيانات الطلب</div>
        <div class="table-wrap"><table class="data"><thead><tr><th>الحقل</th><th>القيمة</th></tr></thead>
        <tbody>${dataRows || '<tr><td colspan="2" class="text-muted">—</td></tr>'}</tbody></table></div>
      </div></div>

      <div class="card mb-3"><div class="card-body">
        <div class="fw-bold mb-2">المرفقات</div>
        ${(detail.attachments || []).length ? detail.attachments.map(function (att) {
          return `<div class="text-sm">${esc(att.file_name || att.storage_path)}</div>`;
        }).join('') : '<div class="text-muted text-sm">لا مرفقات</div>'}
      </div></div>

      <div class="card mb-3"><div class="card-body">
        <div class="fw-bold mb-2">السجل</div>
        ${hist}
      </div></div>
      ${actionsHtml}`;
  }

  async function act(appId, action) {
    const note = (document.getElementById('proc-note') && document.getElementById('proc-note').value) || '';
    if ((action === 'reject' || action === 'return') && !note.trim()) {
      return toast('الملاحظة مطلوبة لهذا الإجراء', 'err');
    }
    let res;
    if (window.FOS_MODE === 'local' && window.LocalStore) {
      res = LocalStore.transitionApplication(appId, action, note, window.__fosCurrentUser);
    } else {
      res = await DB.transitionApplication(appId, action, note);
    }
    if (!res.ok) return toast(res.error || 'فشلت العملية', 'err');
    toast('تم: ' + action);
    openDetail(appId);
  }

  window.FormsWF = {
    renderFormsList: renderFormsList,
    openForm: openForm,
    onTranscript: onTranscript,
    submitCurrent: submitCurrent,
    renderMyRequests: renderMyRequests,
    renderStaffInbox: renderStaffInbox,
    openDetail: openDetail,
    act: act,
    statusBadge: statusBadge
  };
})();
