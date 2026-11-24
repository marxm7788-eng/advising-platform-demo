/**
 * Admin Center — Roles, Users, Excel Import/Export
 * Access: admin only (role + permissions)
 */
(function () {
  'use strict';

  const PERMISSION_CATALOG = [
    { module: 'students', label: 'الطلاب', perms: [
      ['students.view', 'عرض'], ['students.create', 'إنشاء'], ['students.edit', 'تعديل'], ['students.search', 'بحث']
    ]},
    { module: 'applications', label: 'الطلبات', perms: [
      ['applications.view', 'عرض'], ['applications.create', 'تقديم'], ['applications.review', 'مراجعة'],
      ['applications.approve', 'اعتماد'], ['applications.reject', 'رفض'], ['applications.execute', 'تنفيذ']
    ]},
    { module: 'assignments', label: 'الإسناد', perms: [
      ['assignments.view', 'عرض'], ['assignments.create', 'إنشاء'], ['assignments.edit', 'تعديل']
    ]},
    { module: 'users', label: 'المستخدمون', perms: [
      ['users.view', 'عرض'], ['users.create', 'إنشاء'], ['users.edit', 'تعديل'], ['users.disable', 'تعطيل']
    ]},
    { module: 'roles', label: 'الأدوار', perms: [
      ['roles.view', 'عرض'], ['roles.create', 'إنشاء'], ['roles.edit', 'تعديل'], ['roles.delete', 'حذف']
    ]},
    { module: 'forms', label: 'النماذج', perms: [
      ['forms.view', 'عرض'], ['forms.create', 'إنشاء'], ['forms.edit', 'تعديل'], ['forms.delete', 'حذف'], ['periods.manage', 'الفترات']
    ]},
    { module: 'workflows', label: 'مسارات الاعتماد', perms: [
      ['workflows.view', 'عرض'], ['workflows.create', 'إنشاء'], ['workflows.edit', 'تعديل']
    ]},
    { module: 'reports', label: 'التقارير', perms: [
      ['reports.view', 'عرض'], ['reports.export', 'تصدير']
    ]},
    { module: 'notifications', label: 'الإشعارات', perms: [
      ['notifications.view', 'عرض'], ['notifications.send', 'إرسال']
    ]},
    { module: 'academic', label: 'البيانات الأكاديمية', perms: [
      ['academic.view', 'عرض'], ['academic.edit', 'تعديل']
    ]},
    { module: 'content', label: 'المحتوى', perms: [
      ['content.view', 'عرض'], ['content.edit', 'تعديل']
    ]},
    { module: 'audit', label: 'التدقيق', perms: [
      ['audit_logs.view', 'عرض السجل']
    ]}
  ];

  const SCOPE_OPTIONS = [
    { value: 'college', label: 'الكلية بالكامل' },
    { value: 'department', label: 'قسم محدد' },
    { value: 'program', label: 'برنامج محدد' },
    { value: 'assigned_students', label: 'الطلاب المسندون فقط' },
    { value: 'self', label: 'الذات فقط' }
  ];

  const EXAMPLE_ROLES = [
    { code: 'advisor', name_ar: 'مرشد أكاديمي', hint: 'مثال' },
    { code: 'coordinator', name_ar: 'منسق إرشاد', hint: 'مثال' },
    { code: 'affairs', name_ar: 'شؤون الطلاب', hint: 'مثال' },
    { code: 'dean', name_ar: 'عميد الكلية', hint: 'مثال' },
    { code: 'vice', name_ar: 'وكيل الكلية', hint: 'مثال' },
    { code: 'manager', name_ar: 'مدير وحدة الإرشاد', hint: 'مثال' }
  ];

  let _importState = { type: null, rows: [], report: null };

  function esc(s) {
    return (window.DB && DB.escapeHtml) ? DB.escapeHtml(s) : String(s == null ? '' : s);
  }

  function isAdminUser(u) {
    if (!u) return false;
    if (u.role === 'admin') return true;
    if ((u.permissions || []).indexOf('*') >= 0) return true;
    return (u.roles || []).some(function (r) { return r.code === 'admin' && r.isSystem; });
  }

  function requireAdmin() {
    const u = window.App && App.getCurrentUser ? App.getCurrentUser() : null;
    // fallback: global from app IIFE is not exposed — use window.__fosUser set by app
    const cu = window.__fosCurrentUser || u;
    if (!isAdminUser(cu) && !(cu && cu.role === 'admin')) {
      return false;
    }
    return true;
  }

  function getCU() {
    return window.__fosCurrentUser || null;
  }

  // ---------- Roles ----------
  async function fetchRoles() {
    const client = DB.getClient && DB.getClient();
    if (client && DB.isOnline()) {
      const { data, error } = await client.from('roles').select('*').order('name_ar');
      if (!error && data) return data;
    }
    // fallback local RBAC seed
    const local = (window.FOS_RBAC && FOS_RBAC.defaultRoles) ? FOS_RBAC.defaultRoles : [];
    return local.map(function (r) {
      return { id: r.id, code: r.id, name_ar: r.nameAr, is_system: !!r.system, color: r.color, _local: true, _actions: r.actions };
    });
  }

  async function fetchRolePermissions(roleId) {
    const client = DB.getClient && DB.getClient();
    if (!client || !DB.isOnline()) return [];
    const { data } = await client.from('role_permissions').select('permission_id, permissions(code)').eq('role_id', roleId);
    return (data || []).map(function (x) { return x.permissions && x.permissions.code; }).filter(Boolean);
  }

  async function fetchUsersForRole(roleCode) {
    const client = DB.getClient && DB.getClient();
    if (!client || !DB.isOnline()) return [];
    const { data: role } = await client.from('roles').select('id').eq('code', roleCode).maybeSingle();
    if (!role) return [];
    const { data } = await client.from('user_roles').select('user_id, profiles(full_name, username, email, is_active)').eq('role_id', role.id);
    return data || [];
  }

  async function renderRolesMgmt() {
    const root = document.getElementById('admin-roles-root');
    if (!root) return;
    if (!requireAdmin() && !(getCU() && getCU().role === 'admin')) {
      root.innerHTML = '<div class="alert alert-warn">هذه الصفحة للمدير فقط</div>';
      return;
    }
    root.innerHTML = '<div class="empty">جاري التحميل...</div>';
    const roles = await fetchRoles();
    let html = `
      <div class="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div>
          <div class="fw-extrabold">إدارة الأدوار والصلاحيات</div>
          <div class="text-xs text-muted">الدور النظامي الوحيد: <b>admin</b> — باقي الأدوار ينشئها المدير</div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" onclick="AdminCenter.openRoleEditor(null)">
          <i class="fas fa-plus"></i> دور جديد
        </button>
      </div>
      <div class="alert alert-info text-sm mb-3">
        أمثلة شائعة (ليست مدمجة): ${EXAMPLE_ROLES.map(function (e) { return esc(e.name_ar); }).join(' · ')}
      </div>
      <div class="grid-3" id="roles-cards">`;

    roles.forEach(function (r) {
      const sys = r.is_system || r.code === 'admin';
      html += `<div class="card" style="border-top:3px solid ${esc(r.color || '#64748b')}">
        <div class="card-body">
          <div class="flex justify-between items-start mb-2">
            <div>
              <div class="fw-extrabold">${esc(r.name_ar || r.nameAr)}</div>
              <div class="text-xs text-muted">الكود: <code>${esc(r.code)}</code>
                ${sys ? ' · <span class="badge badge-red">نظامي</span>' : ''}</div>
            </div>
          </div>
          <div class="flex gap-2 flex-wrap mt-2">
            <button type="button" class="btn btn-sm btn-outline" onclick="AdminCenter.openRoleEditor('${esc(r.id)}')"><i class="fas fa-edit"></i> تعديل</button>
            <button type="button" class="btn btn-sm btn-outline" onclick="AdminCenter.viewRoleUsers('${esc(r.code)}')"><i class="fas fa-users"></i> المستخدمون</button>
            ${!sys ? `<button type="button" class="btn btn-sm btn-danger" onclick="AdminCenter.deleteRole('${esc(r.id)}','${esc(r.code)}')"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        </div>
      </div>`;
    });
    html += '</div><div id="role-editor-panel" class="hidden mt-3"></div><div id="role-users-panel" class="mt-3"></div>';
    root.innerHTML = html;
  }

  async function openRoleEditor(roleId) {
    const panel = document.getElementById('role-editor-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    let role = null;
    let selected = [];
    if (roleId) {
      const roles = await fetchRoles();
      role = roles.find(function (r) { return String(r.id) === String(roleId) || r.code === roleId; });
      selected = await fetchRolePermissions(role && role.id);
      if (role && role._actions) {
        selected = Object.keys(role._actions).filter(function (k) { return role._actions[k]; });
      }
    }
    const isSys = role && (role.is_system || role.code === 'admin');

    let permHtml = '';
    PERMISSION_CATALOG.forEach(function (cat) {
      permHtml += `<div class="perm-group mb-3">
        <div class="fw-bold text-sm mb-1">${esc(cat.label)}</div>
        <div class="perm-grid">`;
      cat.perms.forEach(function (p) {
        const code = p[0], lab = p[1];
        const checked = selected.indexOf(code) >= 0 ? 'checked' : '';
        permHtml += `<label class="perm-item"><input type="checkbox" class="re-perm" value="${esc(code)}" ${checked} ${isSys && role && role.code === 'admin' ? '' : ''}/> <span>${esc(lab)}</span> <code class="text-xs">${esc(code)}</code></label>`;
      });
      permHtml += '</div></div>';
    });

    panel.innerHTML = `
      <div class="card"><div class="card-body">
        <div class="fw-extrabold mb-3">${role ? 'تعديل الدور' : 'إنشاء دور جديد'}</div>
        <div class="grid-3 mb-3">
          <div class="form-group"><label>الكود (إنجليزي)</label>
            <input class="form-control" id="re-code" value="${esc(role && role.code || '')}" ${role ? 'readonly' : ''} placeholder="advisor" pattern="[a-z][a-z0-9_]*"/></div>
          <div class="form-group"><label>الاسم بالعربية</label>
            <input class="form-control" id="re-name" value="${esc(role && (role.name_ar || role.nameAr) || '')}"/></div>
          <div class="form-group"><label>اللون</label>
            <input class="form-control" id="re-color" type="color" value="${esc(role && role.color || '#64748b')}"/></div>
        </div>
        <div class="fw-bold mb-2">الصلاحيات</div>
        ${permHtml}
        <div class="flex gap-2 mt-3">
          <button type="button" class="btn btn-primary" onclick="AdminCenter.saveRole('${esc(role && role.id || '')}')"><i class="fas fa-save"></i> حفظ</button>
          <button type="button" class="btn btn-outline" onclick="document.getElementById('role-editor-panel').classList.add('hidden')">إلغاء</button>
        </div>
      </div></div>`;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function saveRole(roleId) {
    const code = (document.getElementById('re-code') && document.getElementById('re-code').value || '').trim().toLowerCase();
    const nameAr = (document.getElementById('re-name') && document.getElementById('re-name').value || '').trim();
    const color = (document.getElementById('re-color') && document.getElementById('re-color').value) || '#64748b';
    if (!/^[a-z][a-z0-9_]*$/.test(code)) return toast('كود الدور: أحرف إنجليزية صغيرة وأرقام _ فقط', 'err');
    if (!nameAr) return toast('الاسم مطلوب', 'err');
    if (code === 'admin' && !roleId) return toast('لا يمكن إنشاء دور admin إضافي', 'err');

    const perms = Array.prototype.map.call(document.querySelectorAll('.re-perm:checked'), function (el) { return el.value; });
    const client = DB.getClient && DB.getClient();

    if (client && DB.isOnline()) {
      let rid = roleId;
      if (!rid) {
        const { data, error } = await client.from('roles').insert({
          code: code, name_ar: nameAr, color: color, is_system: false
        }).select('id').single();
        if (error) return toast(error.message, 'err');
        rid = data.id;
      } else {
        const { error } = await client.from('roles').update({
          name_ar: nameAr, color: color, updated_at: new Date().toISOString()
        }).eq('id', rid);
        if (error) return toast(error.message, 'err');
      }
      // sync permissions
      await client.from('role_permissions').delete().eq('role_id', rid);
      if (perms.length) {
        const { data: allP } = await client.from('permissions').select('id, code').in('code', perms);
        const rows = (allP || []).map(function (p) { return { role_id: rid, permission_id: p.id }; });
        if (rows.length) await client.from('role_permissions').insert(rows);
      }
      if (DB.audit) await DB.audit(roleId ? 'UPDATE_FORM' : 'CREATE_USER', 'roles', rid, { code: code, perms: perms.length });
      toast('تم حفظ الدور');
      document.getElementById('role-editor-panel').classList.add('hidden');
      renderRolesMgmt();
      return;
    }

    // local fallback
    const roles = (typeof load === 'function') ? null : null;
    toast('حُفظ محلياً إن وُجدت واجهة قديمة — يُفضّل Supabase', 'err');
  }

  async function deleteRole(roleId, code) {
    if (code === 'admin') return toast('لا يمكن حذف دور المدير', 'err');
    if (!confirm('حذف الدور «' + code + '»؟ لن يُحذف إن كان مرتبطاً بمستخدمين.')) return;
    const client = DB.getClient && DB.getClient();
    if (client && DB.isOnline()) {
      const { data: ur } = await client.from('user_roles').select('id').eq('role_id', roleId).limit(1);
      if (ur && ur.length) return toast('لا يمكن الحذف: يوجد مستخدمون مرتبطون', 'err');
      const { error } = await client.from('roles').delete().eq('id', roleId).eq('is_system', false);
      if (error) return toast(error.message, 'err');
      toast('تم الحذف');
      renderRolesMgmt();
    }
  }

  async function viewRoleUsers(code) {
    const panel = document.getElementById('role-users-panel');
    if (!panel) return;
    const users = await fetchUsersForRole(code);
    panel.innerHTML = `<div class="card"><div class="card-body">
      <div class="fw-bold mb-2">مستخدمو دور: ${esc(code)}</div>
      ${users.length ? `<table class="data"><thead><tr><th>الاسم</th><th>المستخدم</th><th>البريد</th><th>الحالة</th></tr></thead><tbody>
        ${users.map(function (u) {
          const p = u.profiles || {};
          return `<tr><td>${esc(p.full_name)}</td><td>${esc(p.username)}</td><td>${esc(p.email)}</td>
            <td>${p.is_active !== false ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-red">معطّل</span>'}</td></tr>`;
        }).join('')}
      </tbody></table>` : '<div class="text-muted">لا يوجد مستخدمون</div>'}
    </div></div>`;
  }

  // ---------- Users ----------
  async function fetchProfilesList() {
    const client = DB.getClient && DB.getClient();
    if (!client || !DB.isOnline()) return [];
    const { data: profiles } = await client.from('profiles').select('*').order('full_name').limit(500);
    const { data: urs } = await client.from('user_roles').select('user_id, scope_type, scope_id, roles(code, name_ar)');
    const { data: students } = await client.from('students').select('profile_id, student_code, program_id, department_id');
    const byUser = {};
    (urs || []).forEach(function (ur) {
      if (!byUser[ur.user_id]) byUser[ur.user_id] = [];
      byUser[ur.user_id].push(ur);
    });
    const stBy = {};
    (students || []).forEach(function (s) { stBy[s.profile_id] = s; });
    return (profiles || []).map(function (p) {
      const roles = byUser[p.id] || [];
      const st = stBy[p.id];
      return {
        id: p.id,
        name: p.full_name,
        username: p.username,
        email: p.email,
        phone: p.phone,
        is_active: p.is_active !== false,
        is_student: p.is_student,
        roles: roles,
        roleLabel: roles.map(function (r) { return r.roles && r.roles.name_ar; }).filter(Boolean).join(', ') || '—',
        scope: roles[0] ? roles[0].scope_type : '—',
        code: st ? st.student_code : null
      };
    });
  }

  async function renderUsersMgmt() {
    const root = document.getElementById('admin-users-root');
    if (!root) return;
    if (!requireAdmin() && !(getCU() && getCU().role === 'admin')) {
      root.innerHTML = '<div class="alert alert-warn">هذه الصفحة للمدير فقط</div>';
      return;
    }
    root.innerHTML = '<div class="empty">جاري التحميل...</div>';
    const users = await fetchProfilesList();
    const roles = await fetchRoles();
    const roleOpts = roles.filter(function (r) { return r.code !== 'admin'; })
      .map(function (r) { return `<option value="${esc(r.code)}">${esc(r.name_ar || r.nameAr)}</option>`; }).join('');

    const q = (document.getElementById('um-search') && document.getElementById('um-search').value || '').trim().toLowerCase();
    const fRole = (document.getElementById('um-filter-role') && document.getElementById('um-filter-role').value) || '';
    const fStatus = (document.getElementById('um-filter-status') && document.getElementById('um-filter-status').value) || '';

    let filtered = users;
    if (q) {
      filtered = filtered.filter(function (u) {
        return (u.name || '').toLowerCase().indexOf(q) >= 0 ||
          (u.username || '').toLowerCase().indexOf(q) >= 0 ||
          (u.email || '').toLowerCase().indexOf(q) >= 0 ||
          (u.code || '').indexOf(q) >= 0;
      });
    }
    if (fRole) {
      filtered = filtered.filter(function (u) {
        return (u.roles || []).some(function (r) { return r.roles && r.roles.code === fRole; });
      });
    }
    if (fStatus === 'active') filtered = filtered.filter(function (u) { return u.is_active; });
    if (fStatus === 'disabled') filtered = filtered.filter(function (u) { return !u.is_active; });

    root.innerHTML = `
      <div class="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div>
          <div class="fw-extrabold">إدارة المستخدمين</div>
          <div class="text-xs text-muted">إنشاء الموظفين عبر Supabase Auth — بدون تخزين كلمات مرور في profiles</div>
        </div>
      </div>

      <div class="card mb-3"><div class="card-body">
        <div class="fw-bold mb-2"><i class="fas fa-user-plus"></i> إنشاء حساب موظف</div>
        <div class="grid-3">
          <div class="form-group"><label>الاسم بالكامل</label><input class="form-control" id="nu-name"/></div>
          <div class="form-group"><label>البريد الإلكتروني</label><input class="form-control" id="nu-email" type="email"/></div>
          <div class="form-group"><label>اسم المستخدم</label><input class="form-control" id="nu-user" placeholder="بالإنجليزية"/></div>
          <div class="form-group"><label>الهاتف</label><input class="form-control" id="nu-phone"/></div>
          <div class="form-group"><label>كلمة مرور مؤقتة</label><input class="form-control" id="nu-pass" type="password" autocomplete="new-password"/></div>
          <div class="form-group"><label>الدور</label><select class="form-control" id="nu-role">${roleOpts}</select></div>
          <div class="form-group"><label>النطاق</label>
            <select class="form-control" id="nu-scope">
              ${SCOPE_OPTIONS.map(function (s) { return `<option value="${s.value}">${s.label}</option>`; }).join('')}
            </select>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-sm mt-2" onclick="AdminCenter.createStaff()"><i class="fas fa-plus"></i> إنشاء الموظف</button>
      </div></div>

      <div class="card mb-3"><div class="card-body">
        <div class="grid-3">
          <div class="form-group"><label>بحث</label><input class="form-control" id="um-search" placeholder="اسم، بريد، كود..." oninput="AdminCenter.renderUsersMgmt()"/></div>
          <div class="form-group"><label>الدور</label>
            <select class="form-control" id="um-filter-role" onchange="AdminCenter.renderUsersMgmt()">
              <option value="">الكل</option>${roleOpts}
            </select>
          </div>
          <div class="form-group"><label>الحالة</label>
            <select class="form-control" id="um-filter-status" onchange="AdminCenter.renderUsersMgmt()">
              <option value="">الكل</option>
              <option value="active">نشط</option>
              <option value="disabled">معطّل</option>
            </select>
          </div>
        </div>
      </div></div>

      <div class="card"><div class="card-body table-wrap">
        <table class="data">
          <thead><tr>
            <th>الاسم</th><th>المستخدم</th><th>البريد</th><th>الأدوار</th><th>النطاق</th><th>الحالة</th><th></th>
          </tr></thead>
          <tbody>
            ${filtered.map(function (u) {
              return `<tr>
                <td>${esc(u.name)}</td>
                <td>${esc(u.username)}${u.code ? ' <span class="text-xs text-muted">(' + esc(u.code) + ')</span>' : ''}</td>
                <td class="text-xs">${esc(u.email || '—')}</td>
                <td><span class="badge badge-blue">${esc(u.roleLabel)}</span></td>
                <td class="text-xs">${esc(u.scope)}</td>
                <td>${u.is_active ? '<span class="badge badge-green">نشط</span>' : '<span class="badge badge-red">معطّل</span>'}</td>
                <td>
                  <button type="button" class="btn btn-sm btn-outline" title="تعطيل/تفعيل"
                    onclick="AdminCenter.toggleUser('${esc(u.id)}', ${u.is_active ? 'false' : 'true'})">
                    <i class="fas fa-user-slash"></i>
                  </button>
                </td>
              </tr>`;
            }).join('') || '<tr><td colspan="7" class="text-muted">لا يوجد مستخدمون</td></tr>'}
          </tbody>
        </table>
        <div class="text-xs text-muted mt-2">${filtered.length} / ${users.length} مستخدم</div>
      </div></div>`;
  }

  async function createStaff() {
    const name = (document.getElementById('nu-name') && document.getElementById('nu-name').value || '').trim();
    const email = (document.getElementById('nu-email') && document.getElementById('nu-email').value || '').trim();
    const username = (document.getElementById('nu-user') && document.getElementById('nu-user').value || '').trim();
    const password = (document.getElementById('nu-pass') && document.getElementById('nu-pass').value) || '';
    const role = document.getElementById('nu-role') && document.getElementById('nu-role').value;
    const scope = document.getElementById('nu-scope') && document.getElementById('nu-scope').value;
    if (!DB || !DB.createStaffAccount) return toast('طبقة Auth غير متاحة', 'err');
    const res = await DB.createStaffAccount({
      name: name, email: email, username: username, password: password,
      roleCode: role, scopeType: scope || 'college'
    });
    if (!res.ok) return toast(res.error || 'فشل الإنشاء', 'err');
    toast('تم إنشاء حساب الموظف');
    renderUsersMgmt();
  }

  async function toggleUser(userId, active) {
    const client = DB.getClient && DB.getClient();
    if (!client) return;
    const { error } = await client.from('profiles').update({ is_active: active === true || active === 'true' }).eq('id', userId);
    if (error) return toast(error.message, 'err');
    if (DB.audit) await DB.audit('DISABLE_USER', 'profiles', userId, { is_active: active });
    toast(active === true || active === 'true' ? 'تم التفعيل' : 'تم التعطيل');
    renderUsersMgmt();
  }

  // ---------- Excel Import Center ----------
  const TEMPLATES = {
    students: {
      title: 'الطلاب',
      columns: ['student_code', 'full_name', 'email', 'phone', 'program_code', 'level_code', 'department_code', 'is_active'],
      sample: [
        ['2024001', 'أحمد محمد علي', 'ahmed@example.com', '01012345678', 'prog_chem', 'L1', 'chem', 'true'],
        ['2024002', 'سارة محمود', 'sara@example.com', '01098765432', 'prog_phys', 'L2', 'phys', 'true']
      ]
    },
    staff: {
      title: 'حسابات الموظفين',
      columns: ['full_name', 'email', 'phone', 'employee_code', 'role', 'department', 'program', 'scope', 'is_active'],
      sample: [
        ['د. ولاء عادل', 'walaa@sohag.edu.eg', '01011112222', 'EMP001', 'advisor', 'chem', '', 'assigned_students', 'true'],
        ['أ. صفاء فتحي', 'safaa@sohag.edu.eg', '01033334444', 'EMP002', 'affairs', '', '', 'college', 'true']
      ]
    },
    assignments: {
      title: 'إسناد المرشدين',
      columns: ['student_code', 'advisor_email', 'advisor_code', 'department', 'program'],
      sample: [
        ['2024001', 'walaa@sohag.edu.eg', 'EMP001', 'chem', 'prog_chem'],
        ['2024002', 'walaa@sohag.edu.eg', 'EMP001', 'phys', 'prog_phys']
      ]
    }
  };

  function renderImportsCenter() {
    const root = document.getElementById('admin-imports-root');
    if (!root) return;
    if (!requireAdmin() && !(getCU() && getCU().role === 'admin')) {
      root.innerHTML = '<div class="alert alert-warn">مركز الاستيراد للمدير فقط</div>';
      return;
    }

    root.innerHTML = `
      <div class="mb-3">
        <div class="fw-extrabold">مركز الاستيراد والتصدير</div>
        <div class="text-xs text-muted">قوالب Excel → تحقق → معاينة → تأكيد → نتائج. لا يُستورد شيء قبل التأكيد.</div>
      </div>

      <div class="grid-3 mb-3">
        ${Object.keys(TEMPLATES).map(function (key) {
          const t = TEMPLATES[key];
          return `<div class="card import-type-card" data-type="${key}">
            <div class="card-body">
              <div class="fw-extrabold mb-1">${esc(t.title)}</div>
              <div class="text-xs text-muted mb-2">${t.columns.length} أعمدة</div>
              <button type="button" class="btn btn-sm btn-outline" onclick="AdminCenter.downloadTemplate('${key}')">
                <i class="fas fa-download"></i> تحميل القالب
              </button>
              <button type="button" class="btn btn-sm btn-primary mt-1" onclick="AdminCenter.selectImportType('${key}')">
                <i class="fas fa-file-import"></i> استيراد
              </button>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div id="import-workspace" class="hidden">
        <div class="card mb-3"><div class="card-body">
          <div class="fw-bold mb-2" id="import-ws-title">الاستيراد</div>
          <div id="import-dropzone" class="import-dropzone">
            <i class="fas fa-cloud-upload-alt fa-2x mb-2"></i>
            <div>اسحب ملف Excel هنا أو</div>
            <label class="btn btn-sm btn-teal mt-2" style="cursor:pointer">
              اختر ملفاً
              <input type="file" id="import-file" accept=".xlsx,.xls,.csv" hidden onchange="AdminCenter.onFileSelected(event)"/>
            </label>
            <div class="text-xs text-muted mt-2">xlsx / csv — أقصى 5MB</div>
          </div>
        </div></div>
        <div id="import-validation" class="hidden"></div>
        <div id="import-preview" class="hidden"></div>
        <div id="import-actions" class="hidden flex gap-2 mb-3"></div>
        <div id="import-results" class="hidden"></div>
      </div>`;

    const dz = document.getElementById('import-dropzone');
    if (dz) {
      dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('dragover'); });
      dz.addEventListener('dragleave', function () { dz.classList.remove('dragover'); });
      dz.addEventListener('drop', function (e) {
        e.preventDefault();
        dz.classList.remove('dragover');
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleFile(f);
      });
    }
  }

  function selectImportType(type) {
    _importState = { type: type, rows: [], report: null };
    const ws = document.getElementById('import-workspace');
    if (ws) ws.classList.remove('hidden');
    const title = document.getElementById('import-ws-title');
    if (title) title.textContent = 'استيراد: ' + (TEMPLATES[type] && TEMPLATES[type].title);
    ['import-validation', 'import-preview', 'import-actions', 'import-results'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
    });
  }

  function downloadTemplate(type) {
    const t = TEMPLATES[type];
    if (!t || typeof XLSX === 'undefined') {
      // CSV fallback
      const lines = [t.columns.join(',')].concat(t.sample.map(function (r) { return r.join(','); }));
      const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'template_' + type + '.csv';
      a.click();
      return;
    }
    const wb = XLSX.utils.book_new();
    const data = [t.columns].concat(t.sample);
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, t.title);
    XLSX.writeFile(wb, 'template_' + type + '.xlsx');
  }

  function onFileSelected(ev) {
    const f = ev.target.files && ev.target.files[0];
    if (f) handleFile(f);
  }

  function handleFile(file) {
    if (file.size > 5 * 1024 * 1024) return toast('الملف أكبر من 5MB', 'err');
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        let rows = [];
        if (String(file.name).toLowerCase().endsWith('.csv')) {
          const text = e.target.result;
          rows = parseCsv(text);
        } else if (typeof XLSX !== 'undefined') {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        } else {
          return toast('مكتبة Excel غير محمّلة — استخدم CSV', 'err');
        }
        _importState.rows = rows;
        _importState.fileName = file.name;
        validateAndPreview();
      } catch (err) {
        console.error(err);
        toast('فشل قراءة الملف', 'err');
      }
    };
    if (String(file.name).toLowerCase().endsWith('.csv')) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  function parseCsv(text) {
    const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const headers = lines[0].split(',').map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (line) {
      const cols = line.split(',');
      const o = {};
      headers.forEach(function (h, i) { o[h] = (cols[i] || '').trim(); });
      return o;
    });
  }

  function validateAndPreview() {
    const type = _importState.type;
    const t = TEMPLATES[type];
    const rows = _importState.rows || [];
    const report = { valid: [], warnings: [], errors: [], duplicates: [] };
    const seen = {};

    rows.forEach(function (row, idx) {
      const line = idx + 2;
      const issues = [];
      if (type === 'students') {
        if (!/^\d{4,15}$/.test(String(row.student_code || '').trim())) issues.push('كود طالب غير صالح');
        if (!(row.full_name || '').trim()) issues.push('الاسم مطلوب');
        const key = String(row.student_code || '');
        if (key && seen[key]) report.duplicates.push({ line: line, key: key });
        seen[key] = true;
      } else if (type === 'staff') {
        if (!(row.full_name || '').trim()) issues.push('الاسم مطلوب');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email || ''))) issues.push('بريد غير صالح');
        if (!(row.role || '').trim()) issues.push('الدور مطلوب');
        if (String(row.role).trim() === 'admin') issues.push('لا يُسمح باستيراد دور admin');
        const key = String(row.email || '').toLowerCase();
        if (key && seen[key]) report.duplicates.push({ line: line, key: key });
        seen[key] = true;
      } else if (type === 'assignments') {
        if (!/^\d{4,15}$/.test(String(row.student_code || '').trim())) issues.push('كود طالب غير صالح');
        if (!(row.advisor_email || row.advisor_code || '').toString().trim()) issues.push('معرف المرشد مطلوب');
        const key = String(row.student_code || '');
        if (key && seen[key]) report.duplicates.push({ line: line, key: key });
        seen[key] = true;
      }
      if (issues.length) report.errors.push({ line: line, row: row, messages: issues });
      else report.valid.push({ line: line, row: row });
    });

    _importState.report = report;

    const valEl = document.getElementById('import-validation');
    valEl.classList.remove('hidden');
    valEl.innerHTML = `
      <div class="grid-3 mb-3">
        <div class="sp-stat"><div class="n" style="color:var(--success)">${report.valid.length}</div><div class="l">صفوف صالحة</div></div>
        <div class="sp-stat"><div class="n" style="color:var(--warning)">${report.warnings.length}</div><div class="l">تحذيرات</div></div>
        <div class="sp-stat"><div class="n" style="color:var(--danger)">${report.errors.length + report.duplicates.length}</div><div class="l">أخطاء / تكرار</div></div>
      </div>
      ${report.errors.length ? `<div class="alert alert-danger text-sm"><b>أخطاء:</b><ul>${report.errors.slice(0, 20).map(function (e) {
        return `<li>سطر ${e.line}: ${esc(e.messages.join('؛ '))}</li>`;
      }).join('')}</ul></div>` : ''}
      ${report.duplicates.length ? `<div class="alert alert-warn text-sm"><b>تكرار:</b> ${report.duplicates.map(function (d) {
        return 'سطر ' + d.line + ' (' + esc(d.key) + ')';
      }).join('، ')}</div>` : ''}`;

    const prev = document.getElementById('import-preview');
    prev.classList.remove('hidden');
    const cols = t.columns;
    prev.innerHTML = `<div class="card"><div class="card-body table-wrap" style="max-height:320px;overflow:auto">
      <table class="data"><thead><tr>${cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('')}</tr></thead>
      <tbody>${report.valid.slice(0, 50).map(function (v) {
        return '<tr>' + cols.map(function (c) { return '<td>' + esc(v.row[c]) + '</td>'; }).join('') + '</tr>';
      }).join('')}</tbody></table>
      <div class="text-xs text-muted mt-1">عرض أول 50 صفاً صالحاً</div>
    </div></div>`;

    const actions = document.getElementById('import-actions');
    actions.classList.remove('hidden');
    actions.innerHTML = `
      <button type="button" class="btn btn-primary" ${report.valid.length ? '' : 'disabled'}
        onclick="AdminCenter.confirmImport()"><i class="fas fa-check"></i> تأكيد الاستيراد (${report.valid.length})</button>
      <button type="button" class="btn btn-outline" onclick="AdminCenter.downloadErrorReport()"><i class="fas fa-file-csv"></i> تقرير الأخطاء</button>
      <button type="button" class="btn btn-outline" onclick="AdminCenter.renderImportsCenter()">إلغاء</button>`;
  }

  function downloadErrorReport() {
    const report = _importState.report;
    if (!report) return;
    const lines = ['line,type,message'];
    report.errors.forEach(function (e) {
      lines.push([e.line, 'error', '"' + e.messages.join('; ') + '"'].join(','));
    });
    report.duplicates.forEach(function (d) {
      lines.push([d.line, 'duplicate', d.key].join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'import_errors.csv';
    a.click();
  }

  async function confirmImport() {
    const report = _importState.report;
    const type = _importState.type;
    if (!report || !report.valid.length) return toast('لا توجد صفوف صالحة', 'err');
    if (!confirm('تأكيد استيراد ' + report.valid.length + ' صفاً؟\nالصفوف الخاطئة لن تُستورد.')) return;

    const resultsEl = document.getElementById('import-results');
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = '<div class="empty"><i class="fas fa-spinner fa-spin"></i> جاري الاستيراد...</div>';

    let ok = 0, fail = 0;
    const failures = [];

    if (type === 'staff') {
      for (let i = 0; i < report.valid.length; i++) {
        const row = report.valid[i].row;
        const res = await DB.createStaffAccount({
          name: row.full_name,
          email: row.email,
          username: row.employee_code || String(row.email).split('@')[0],
          password: 'ChangeMe_' + Math.random().toString(36).slice(2, 8),
          roleCode: String(row.role).trim(),
          scopeType: row.scope || 'college'
        });
        if (res.ok) ok++;
        else { fail++; failures.push({ line: report.valid[i].line, error: res.error }); }
      }
    } else if (type === 'assignments') {
      const client = DB.getClient && DB.getClient();
      for (let i = 0; i < report.valid.length; i++) {
        const row = report.valid[i].row;
        try {
          const { data: st } = await client.from('students').select('id').eq('student_code', String(row.student_code).trim()).maybeSingle();
          if (!st) throw new Error('طالب غير موجود');
          let advisorId = null;
          if (row.advisor_email) {
            const { data: pr } = await client.from('profiles').select('id').eq('email', String(row.advisor_email).trim()).maybeSingle();
            advisorId = pr && pr.id;
          }
          if (!advisorId && row.advisor_code) {
            const { data: pr } = await client.from('profiles').select('id').eq('username', String(row.advisor_code).trim()).maybeSingle();
            advisorId = pr && pr.id;
          }
          if (!advisorId) throw new Error('مرشد غير موجود');
          const res = await DB.assignAdvisor(st.id, advisorId);
          if (!res.ok) throw new Error(res.error || 'فشل الإسناد');
          ok++;
        } catch (err) {
          fail++;
          failures.push({ line: report.valid[i].line, error: err.message || String(err) });
        }
      }
    } else if (type === 'students') {
      // Students require Auth signup per row — same as staff pattern with student flag
      failures.push({ line: 0, error: 'استيراد الطلاب الجماعي يتطلب Edge Function بصلاحية service role في الإنتاج. حالياً سجّل الطلاب عبر صفحة التسجيل أو أنشئهم فردياً.' });
      fail = report.valid.length;
    }

    if (DB.audit) {
      await DB.audit('IMPORT_DATA', 'imports', _importState.fileName || type, {
        type: type,
        valid: report.valid.length,
        success: ok,
        failed: fail,
        file: _importState.fileName
      });
    }

    resultsEl.innerHTML = `
      <div class="card"><div class="card-body">
        <div class="fw-extrabold mb-2">نتيجة الاستيراد</div>
        <div class="grid-3 mb-2">
          <div class="sp-stat"><div class="n" style="color:var(--success)">${ok}</div><div class="l">نجاح</div></div>
          <div class="sp-stat"><div class="n" style="color:var(--danger)">${fail}</div><div class="l">فشل</div></div>
          <div class="sp-stat"><div class="n">${report.valid.length}</div><div class="l">محاولة</div></div>
        </div>
        ${failures.length ? `<div class="alert alert-danger text-sm"><ul>${failures.slice(0, 30).map(function (f) {
          return `<li>سطر ${f.line}: ${esc(f.error)}</li>`;
        }).join('')}</ul></div>` : '<div class="alert alert-success">اكتمل بدون أخطاء تشغيل</div>'}
        <p class="text-xs text-muted">الاستيراد جزئي للصفوف الناجحة فقط — الصفوف الفاشلة لم تُكتب. يمكن إعادة المحاولة بعد تصحيح الملف.</p>
      </div></div>`;
  }

  window.AdminCenter = {
    renderRolesMgmt: renderRolesMgmt,
    openRoleEditor: openRoleEditor,
    saveRole: saveRole,
    deleteRole: deleteRole,
    viewRoleUsers: viewRoleUsers,
    renderUsersMgmt: renderUsersMgmt,
    createStaff: createStaff,
    toggleUser: toggleUser,
    renderImportsCenter: renderImportsCenter,
    selectImportType: selectImportType,
    downloadTemplate: downloadTemplate,
    onFileSelected: onFileSelected,
    confirmImport: confirmImport,
    downloadErrorReport: downloadErrorReport,
    PERMISSION_CATALOG: PERMISSION_CATALOG
  };
})();
