(function () {
  'use strict';
  const KEY = 'fos_v2_faculty_members';
  const SOURCE = 'data/43-faculty-members.json';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  const write = rows => localStorage.setItem(KEY, JSON.stringify(rows));
  const norm = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  const identity = r => `${norm(r.department)}|${norm(r.name)}`.toLocaleLowerCase('ar');
  let sourceRows = [];
  let pending = null;
  let filter = { q: '', department: 'all', status: 'all', advisor: 'all' };

  async function ensureSeed() {
    if (window.FOS_BACKEND_URL && window.DB?.isOnline?.()) {
      try {
        const remote = await DB.listFaculty();
        return remote.map(r => ({ ...r, id: r.id, department: r.department, accountUsername: r.account_username, accountStatus: r.account_username ? 'active' : 'no_account', advisorActive: !!r.account_username }));
      } catch (_) { return []; }
    }
    const current = read();
    if (current.length) return current;
    try {
      const res = await fetch(SOURCE);
      const json = await res.json();
      const rows = (json.members || []).map(r => ({ ...r, accountStatus: 'no_account', advisorActive: false, updatedAt: new Date().toISOString() }));
      write(rows); return rows;
    } catch (_) {
      const embedded = Array.isArray(window.FOS_FACULTY_MEMBERS) ? window.FOS_FACULTY_MEMBERS : [];
      const rows = embedded.map(r => ({ ...r, accountStatus: 'no_account', advisorActive: false, updatedAt: new Date().toISOString() }));
      if (rows.length) write(rows);
      return rows;
    }
  }
  function departments(rows) { return [...new Set(rows.map(r => r.department).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ar')); }
  function matches(r) {
    const q = filter.q.toLocaleLowerCase('ar');
    return (!q || [r.name,r.department,r.email,r.jobTitle].join(' ').toLocaleLowerCase('ar').includes(q)) &&
      (filter.department === 'all' || r.department === filter.department) &&
      (filter.status === 'all' || (r.accountStatus || 'no_account') === filter.status) &&
      (filter.advisor === 'all' || String(!!r.advisorActive) === filter.advisor);
  }
  const statusLabel = s => ({ no_account:'لا يوجد حساب', invited:'دعوة مرسلة', active:'حساب نشط', disabled:'حساب معطل' }[s] || 'لا يوجد حساب');
  function render(root, rows) {
    const shown = rows.filter(matches);
    const opts = departments(rows).map(d => `<option value="${esc(d)}" ${filter.department===d?'selected':''}>${esc(d)}</option>`).join('');
    root.innerHTML = `<div class="faculty-shell"><header class="faculty-hero"><div><span class="faculty-kicker">إدارة البيانات الوظيفية</span><h1>أعضاء هيئة التدريس</h1><p>سجل محلي قابل للمراجعة مستورد من ملف الكلية، مع فصل سجل العضو عن حساب الدخول والتكليف بالإرشاد.</p></div><i class="fas fa-users-gear"></i></header>
      <div class="faculty-notice"><i class="fas fa-circle-info"></i><span>هذه النسخة تعمل محليًا على هذا المتصفح. لا تنشئ حسابات دخول ولا تمنح صلاحيات خادمية تلقائيًا.</span></div>
      <section class="faculty-stats"><div><b>${rows.length}</b><span>إجمالي الأعضاء</span></div><div><b>${departments(rows).length}</b><span>الأقسام</span></div><div><b>${rows.filter(r=>r.advisorActive).length}</b><span>مكلفون بالإرشاد</span></div><div><b>${rows.filter(r=>(r.accountStatus||'no_account')==='active').length}</b><span>حسابات نشطة</span></div></section>
      <div class="faculty-toolbar"><input id="faculty-search" class="form-control" placeholder="بحث بالاسم أو القسم أو البريد" value="${esc(filter.q)}"><select id="faculty-dept" class="form-control"><option value="all">كل الأقسام</option>${opts}</select><select id="faculty-status" class="form-control"><option value="all">كل حالات الحساب</option>${[['no_account','لا يوجد حساب'],['invited','دعوة مرسلة'],['active','حساب نشط'],['disabled','حساب معطل']].map(([v,l])=>`<option value="${v}" ${filter.status===v?'selected':''}>${l}</option>`).join('')}</select><select id="faculty-advisor" class="form-control"><option value="all">كل حالات الإرشاد</option><option value="true" ${filter.advisor==='true'?'selected':''}>مكلف بالإرشاد</option><option value="false" ${filter.advisor==='false'?'selected':''}>غير مكلف</option></select><button class="btn btn-primary" id="faculty-import"><i class="fas fa-file-import"></i> استيراد Excel</button><input id="faculty-file" type="file" accept=".xlsx,.xls,.csv" hidden></div>
      <div class="faculty-result-bar"><b>عرض ${shown.length} من ${rows.length}</b><span>تحديث البيانات لا يحذف الحسابات أو التكليفات الموجودة.</span></div>
      <div class="faculty-table table-wrap"><table class="data"><thead><tr><th>#</th><th>الاسم</th><th>القسم</th><th>حالة الحساب</th><th>الإرشاد</th><th>إجراء</th></tr></thead><tbody>${shown.length ? shown.map((r,i)=>`<tr><td>${i+1}</td><td><b>${esc(r.name)}</b><small class="block text-muted">${esc(r.email||'لا يوجد بريد مؤسسي')}</small></td><td>${esc(r.department)}</td><td><span class="faculty-badge status-${esc(r.accountStatus||'no_account')}">${statusLabel(r.accountStatus)}</span></td><td>${r.advisorActive ? '<span class="faculty-badge advisor-on">مكلف</span>' : '<span class="text-muted">غير مكلف</span>'}</td><td><button class="btn btn-sm btn-outline" data-faculty-id="${esc(identity(r))}">تفاصيل</button></td></tr>`).join('') : '<tr><td colspan="6" class="text-center">لا توجد سجلات مطابقة</td></tr>'}</tbody></table></div><div id="faculty-detail"></div><div id="faculty-preview"></div></div>`;
    ['faculty-search','faculty-dept','faculty-status','faculty-advisor'].forEach(id => document.getElementById(id)?.addEventListener(id==='faculty-search'?'input':'change', e => { filter[id==='faculty-search'?'q':id.replace('faculty-','')] = e.target.value; render(root, read()); }));
    document.getElementById('faculty-import')?.addEventListener('click', () => document.getElementById('faculty-file')?.click());
    document.getElementById('faculty-file')?.addEventListener('change', handleFile);
    root.querySelectorAll('[data-faculty-id]').forEach(b => b.addEventListener('click', () => showDetail(root, read().find(r => identity(r) === b.dataset.facultyId))));
  }
  function showDetail(root, member) {
    if (!member) return;
    const detail = document.getElementById('faculty-detail');
    detail.innerHTML = `<section class="faculty-detail-card"><div><h2>${esc(member.name)}</h2><p>${esc(member.department)} · ${member.accountUsername ? `اسم الدخول: ${esc(member.accountUsername)}` : 'لا يوجد حساب دخول'}</p></div><div class="faculty-detail-grid"><label>البريد المؤسسي<input class="form-control" id="faculty-email" value="${esc(member.email||'')}"></label><label>المسمى الوظيفي<input class="form-control" id="faculty-title" value="${esc(member.jobTitle||'')}"></label><label>حالة الحساب<select class="form-control" id="faculty-account"><option value="no_account">لا يوجد حساب</option><option value="invited">دعوة مرسلة</option><option value="active">حساب نشط</option><option value="disabled">حساب معطل</option></select></label><label class="faculty-check"><input type="checkbox" id="faculty-advisor-check" ${member.advisorActive?'checked':''}> مكلف حاليًا بالإرشاد الأكاديمي</label></div>${member.accountUsername ? '' : '<div class="faculty-account-create"><label>كلمة المرور الأولية للحساب<input class="form-control" id="faculty-initial-password" type="password" minlength="4" placeholder="يحددها مدير النظام"></label><button class="btn btn-teal" id="faculty-create-account"><i class="fas fa-user-plus"></i> إنشاء حساب مرشد</button><small>لا تُحفظ كلمة المرور في سجل العضو، ولا تظهر بعد الإنشاء.</small></div>'}<div class="faculty-detail-actions"><button class="btn btn-primary" id="faculty-save">حفظ التعديلات</button><button class="btn btn-outline" id="faculty-close">إغلاق</button></div></section>`;
    document.getElementById('faculty-account').value = member.accountStatus || 'no_account';
    document.getElementById('faculty-close').onclick = () => { detail.innerHTML=''; };
    document.getElementById('faculty-create-account')?.addEventListener('click', () => createAccount(member, root));
    document.getElementById('faculty-save').onclick = () => { const rows=read(), i=rows.findIndex(r=>identity(r)===identity(member)); if(i<0)return; rows[i]={...rows[i],email:norm(document.getElementById('faculty-email').value),jobTitle:norm(document.getElementById('faculty-title').value),accountStatus:document.getElementById('faculty-account').value,advisorActive:document.getElementById('faculty-advisor-check').checked,updatedAt:new Date().toISOString()}; write(rows); render(root,rows); window.App?.toast?.('تم حفظ بيانات العضو محليًا'); };
  }
  async function createAccount(member, root) {
    if (window.App?.getCurrentUser?.()?.role !== 'admin') return alert('إنشاء الحساب متاح لمدير النظام فقط.');
    const password = document.getElementById('faculty-initial-password')?.value || '';
    if (password.length < (window.FOS_BACKEND_URL ? 10 : 4)) return alert(window.FOS_BACKEND_URL ? 'اكتب كلمة مرور قوية من 10 أحرف على الأقل.' : 'اكتب كلمة مرور أولية من 4 أحرف على الأقل.');
    if (window.FOS_BACKEND_URL) {
      try {
        const result = await DB.createFacultyAccount(member.id, password, `advisor_${member.id}`);
        alert(`تم إنشاء الحساب المركزي بنجاح.\nاسم المستخدم: ${result.user.username}`);
        render(root, await ensureSeed());
      } catch (error) { alert(error.message || 'تعذر إنشاء الحساب المركزي'); }
      return;
    }
    const usersKey = 'fos_v2_users';
    let users=[]; try { users=JSON.parse(localStorage.getItem(usersKey)||'[]'); } catch (_) {}
    const current = read(), i=current.findIndex(r => identity(r)===identity(member)); if(i<0)return;
    const username = `fac-${String(i+1).padStart(3,'0')}`;
    if (users.some(u=>String(u.username)===username)) return alert('يوجد حساب بهذا المعرف بالفعل.');
    users.push({username,password,role:'advisor',name:member.name,full_name:member.name,dept:member.department,facultyMemberId:member.id,email:member.email||'',is_active:true,createdAt:new Date().toISOString()});
    localStorage.setItem(usersKey,JSON.stringify(users));
    current[i]={...current[i],accountUsername:username,accountStatus:'active',advisorActive:true,updatedAt:new Date().toISOString()}; write(current);
    alert(`تم إنشاء الحساب بنجاح.\nاسم المستخدم: ${username}\nاحتفظ بكلمة المرور التي حددها المدير.`);
    render(root,current);
  }
  async function handleFile(e) {
    const file=e.target.files?.[0]; if(!file)return;
    try { const data=await file.arrayBuffer(); const wb=window.XLSX.read(data,{type:'array'}); const rows=[]; wb.SheetNames.forEach(name=>{ let department='غير محدد'; window.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:''}).forEach(row=>{ const a=norm(row[0]), b=norm(row[1]); if(!b && a && /قسم/.test(a)){ department=a; return; } if(b && !/^الاسم$/i.test(b) && !/كلية العلوم/.test(b)) rows.push({name:b,department}); }); }); pending=rows; showPreview(rows); } catch(err) { alert('تعذر قراءة ملف Excel: '+err.message); }
    e.target.value='';
  }
  function showPreview(rows) { const el=document.getElementById('faculty-preview'); if(!el)return; const current=read(); const existing=new Set(current.map(identity)); const unique=[]; const seen=new Set(); rows.forEach(r=>{const x={...r,id:`import-${norm(r.department)}|${norm(r.name)}`};if(!seen.has(identity(x))){seen.add(identity(x));unique.push(x);}}); const added=unique.filter(r=>!existing.has(identity(r))).length; el.innerHTML=`<section class="faculty-preview-card"><h2>معاينة الاستيراد</h2><p>السجلات المقروءة: <b>${unique.length}</b> · الجديدة: <b>${added}</b> · الموجودة التي ستُحدّث دون حذف: <b>${unique.length-added}</b></p><div class="table-wrap"><table class="data"><thead><tr><th>الاسم</th><th>القسم</th></tr></thead><tbody>${unique.slice(0,12).map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.department)}</td></tr>`).join('')}</tbody></table></div><div class="faculty-detail-actions"><button class="btn btn-primary" id="faculty-confirm-import">اعتماد الاستيراد</button><button class="btn btn-outline" id="faculty-cancel-import">إلغاء</button></div></section>`; document.getElementById('faculty-confirm-import').onclick=()=>commitImport(unique);document.getElementById('faculty-cancel-import').onclick=()=>{pending=null;el.innerHTML='';}; }
  function commitImport(rows) { const current=read(), map=new Map(current.map(r=>[identity(r),r])); rows.forEach(r=>{const old=map.get(identity(r));map.set(identity(r),{...(old||{}),...r,id:old?.id||r.id,accountStatus:old?.accountStatus||'no_account',advisorActive:old?.advisorActive||false,updatedAt:new Date().toISOString()});});write([...map.values()]);pending=null;document.getElementById('faculty-preview').innerHTML='<div class="faculty-success">تم اعتماد الاستيراد دون تكرار أو حذف للتكليفات والحسابات المرتبطة.</div>'; const root=document.getElementById('faculty-management-root');render(root,read()); }
  async function renderPage() { const root=document.getElementById('faculty-management-root'); if(!root)return; const rows=await ensureSeed(); render(root,rows); }
  window.FacultyManagement={render:renderPage, importRows:commitImport};
})();
