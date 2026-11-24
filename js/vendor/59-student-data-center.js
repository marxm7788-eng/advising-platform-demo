(function () {
  'use strict';
  const state = { type: null, report: null, fileName: '', dashboardRows: [], lastFilters: {} };
  const LEVELS = ['المستوى الأول', 'المستوى الثاني', 'المستوى الثالث', 'المستوى الرابع'];
  const COLORS = ['#176b87', '#168b85', '#5b77b7', '#d4a64b'];
  const norm = value => String(value == null ? '' : value).trim().toLocaleLowerCase('ar')
    .replace(/[\u064b-\u065f\u0670]/g, '').replace(/ـ/g, '').replace(/[أإآ]/g, 'ا')
    .replace(/[ى]/g, 'ي').replace(/[\s_\-]+/g, ' ');
  const labelNorm = value => norm(value).replace(/^(برنامج|قسم)\s*/, '').trim();
  function esc(value) {
    if (window.DB && DB.escapeHtml) return DB.escapeHtml(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }
  function arabicDigits(value) {
    return String(value == null ? '' : value).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٫،]/g, '.');
  }
  function seed() { return window.FOS_SEED || { programs: [], departments: [], levels: LEVELS }; }
  function studentCode(student) { return arabicDigits(student.code || student.student_code || student.username || '').trim(); }
  function studentName(student) { return student.name || student.full_name || 'طالب'; }
  function programMatch(value) {
    const needle = norm(value);
    if (!needle || needle.startsWith('قسم ')) return null;
    return (seed().programs || []).find(p => [p.id, p.nameAr, p.nameEn].some(v => norm(v) === needle)) || null;
  }
  function departmentMatch(value) {
    const needle = norm(value);
    if (!needle || needle.startsWith('برنامج ')) return null;
    return (seed().departments || []).find(d => [d.id, d.nameAr, d.nameEn, d.nameAr && 'قسم ' + d.nameAr].some(v => norm(v) === needle)) || null;
  }
  function academicGroup(student) {
    const p = programMatch(student.program || student.program_id);
    if (p) return { key: 'program:' + p.id, label: p.nameAr, type: 'program', id: p.id, dept: p.dept || student.dept || student.dept_id || '' };
    const d = departmentMatch(student.dept) || departmentMatch(student.dept_id) || departmentMatch(student.program) || departmentMatch(student.program_id);
    if (d) return { key: 'department:' + d.id, label: 'قسم ' + d.nameAr, type: 'department', id: d.id };
    const raw = String(student.program || student.program_id || student.dept || student.dept_id || '').trim();
    return raw ? { key: 'other:' + norm(raw), label: raw, type: 'other', id: raw } : { key: 'unassigned', label: 'غير محدد', type: 'other', id: '' };
  }
  function filterAcademicGroups(students) {
    const groups = new Map();
    (students || []).forEach(student => {
      const p = programMatch(student.program || student.program_id);
      const d = departmentMatch(student.dept) || departmentMatch(student.dept_id) || (p && departmentMatch(p.dept)) || departmentMatch(student.program) || departmentMatch(student.program_id);
      if (p) groups.set('program:' + p.id, { key: 'program:' + p.id, label: p.nameAr });
      if (d) groups.set('department:' + d.id, { key: 'department:' + d.id, label: 'قسم ' + d.nameAr });
      if (!p && !d) { const g = academicGroup(student); groups.set(g.key, { key: g.key, label: g.label }); }
    });
    return groups;
  }
  function matchesAcademicGroup(student, key) {
    if (key.startsWith('program:')) {
      const p = programMatch(student.program || student.program_id);
      return !!p && ('program:' + p.id) === key;
    }
    if (key.startsWith('department:')) {
      const p = programMatch(student.program || student.program_id);
      const d = departmentMatch(student.dept) || departmentMatch(student.dept_id) || departmentMatch(student.program) || departmentMatch(student.program_id);
      const departmentId = key.slice('department:'.length);
      return d ? d.id === departmentId : !!p && String(p.dept || '') === departmentId;
    }
    return academicGroup(student).key === key;
  }
  function levelIndex(value) {
    let text = arabicDigits(value).toLowerCase();
    if (/الأول|الاول|اول|first|level\s*1|\bl1\b/.test(text) || /(?:^|\D)1(?:\D|$)/.test(text)) return 0;
    if (/الثاني|الثان|second|level\s*2|\bl2\b/.test(text) || /(?:^|\D)2(?:\D|$)/.test(text)) return 1;
    if (/الثالث|الثال|third|level\s*3|\bl3\b/.test(text) || /(?:^|\D)3(?:\D|$)/.test(text)) return 2;
    if (/الرابع|الراب|fourth|level\s*4|\bl4\b/.test(text) || /(?:^|\D)4(?:\D|$)/.test(text)) return 3;
    return -1;
  }
  function validGpa(value) {
    if (value == null || String(value).trim() === '') return null;
    const n = Number(arabicDigits(value));
    return Number.isFinite(n) && n >= 0 && n <= 4 ? n : null;
  }
  function isGpaRecorded(value) {
    if (value == null || String(value).trim() === '') return false;
    const n = Number(arabicDigits(value));
    return Number.isFinite(n) && n >= 0 && n <= 4;
  }
  const STUDENT_COLUMNS = {
    name: ['الاسم','اسم الطالب','الاسم بالكامل','اسم الطالب بالكامل','full name','full_name','student name','student_name','name'],
    code: ['الكود','كود الطالب','رقم الطالب','كود','student code','student_code','student id','code'],
    level: ['المستوى','الفرقة','level','academic level','level name'],
    nationalId: ['الرقم القومي','الرقم القومى','الرقم الوطني','national id','national_id','nid'],
    completedHours: ['الساعات المجتازة','الساعات المنجزة','الساعات المكتسبة','completed hours','completed_hours','earned hours'],
    gpa: ['المعدل التراكمي','المعدل','gpa','cumulative gpa'],
    program: ['البرنامج','البرنامج الدراسي','program','program name','program_id'],
    section: ['الشعبة','الشعبه','section','class section'],
    dept: ['القسم','department','dept','department name','dept_id'],
    academicYear: ['العام الجامعي','العام الجامعى','العام الأكاديمي','العام الاكاديمي','academic year','academic_year','school year'],
    enrollmentYear: ['سنة الالتحاق','عام الالتحاق','enrollment year','enrollment_year','admission year'],
    birthDate: ['تاريخ الميلاد','تاريخ الميلاد','birth date','birth_date','date of birth','dob'],
    enrollmentStatus: ['حالة القيد','حاله القيد','قيد الطالب','enrollment status','enrollment_status'],
    birthplace: ['محل الميلاد','مكان الميلاد','birthplace','place of birth'],
    nationality: ['الجنسية','الجنسيه','nationality'],
    advisor: ['اسم المرشد الأكاديمي','اسم المرشد الاكاديمي','اسم المرشد','المرشد الأكاديمي','advisor name','advisor_name','advisor'],
    advisorDept: ['قسم المرشد الأكاديمي','قسم المرشد الاكاديمي','قسم المرشد','advisor department','advisor_dept'],
    gender: ['النوع','الجنس','gender','sex'],
    religion: ['الديانة','الديانه','religion'],
    mobile: ['الموبايل','الهاتف المحمول','رقم الموبايل','mobile','mobile phone','mobile_number'],
    phone: ['الهاتف','التليفون','رقم الهاتف','phone','telephone'],
    maritalStatus: ['الحالة الاجتماعية','الحاله الاجتماعيه','marital status','marital_status'],
    address: ['العنوان','address','home address'],
    studentStatus: ['حالة الطالب','حاله الطالب','مستجد/باقي','نوع الطالب','student status','student_status','freshman status']
  };
  function matchingHeaders(header, type) {
    const h = labelNorm(header);
    const aliases = type === 'students' ? STUDENT_COLUMNS : type === 'academic' ? {
      code: ['كود الطالب', 'رقم الطالب', 'الكود', 'student code', 'student_code', 'code'],
      group: ['البرنامج أو القسم', 'البرنامج او القسم', 'البرنامج', 'القسم', 'program or department', 'program', 'program_id', 'department', 'dept'],
      gpa: ['المعدل التراكمي', 'المعدل', 'gpa', 'cumulative gpa']
    } : {
      code: ['كود الطالب', 'رقم الطالب', 'الكود', 'student code', 'student_code', 'code'],
      advisor: ['اسم المرشد الأكاديمي', 'اسم المرشد', 'المرشد الأكاديمي', 'advisor name', 'advisor_name', 'advisor']
    };
    for (const [key, candidates] of Object.entries(aliases)) if (candidates.some(c => labelNorm(c) === h)) return key;
    return null;
  }
  function parseCsvGrid(text) {
    const rows = []; let row = [], value = '', quoted = false;
    text = String(text || '').replace(/^\ufeff/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (c === '"' && quoted && next === '"') { value += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === ',' && !quoted) { row.push(value); value = ''; }
      else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && next === '\n') i++;
        row.push(value); if (row.some(x => String(x).trim() !== '')) rows.push(row);
        row = []; value = '';
      } else value += c;
    }
    row.push(value); if (row.some(x => String(x).trim() !== '')) rows.push(row);
    return rows;
  }
  function rowsFromGrid(grid, type) {
    const needed = type === 'students' ? ['code', 'name'] : type === 'academic' ? ['code', 'group', 'gpa'] : ['code', 'advisor'];
    const headerIndex = grid.findIndex(row => {
      const found = new Set((row || []).map(h => matchingHeaders(h, type)).filter(Boolean));
      return needed.every(n => found.has(n));
    });
    if (headerIndex < 0) throw new Error(type === 'students'
      ? 'لم أجد العناوين الأساسية «الاسم» و«الكود» في الملف.'
      : type === 'academic' ? 'لم أجد عناوين «كود الطالب» و«البرنامج أو القسم» و«المعدل التراكمي».'
      : 'لم أجد عناوين «كود الطالب» و«اسم المرشد الأكاديمي».');
    const rawHeaders = grid[headerIndex] || [];
    const headers = rawHeaders.map(h => matchingHeaders(h, type));
    const parsed = grid.slice(headerIndex + 1).map((row, i) => {
      const result = { _line: headerIndex + i + 2 };
      headers.forEach((key, col) => { if (key) result[key] = row[col] == null ? '' : row[col]; });
      return result;
    }).filter(r => Object.keys(r).some(k => k !== '_line' && String(r[k]).trim() !== ''));
    parsed._meta = {
      recognized: rawHeaders.filter((h, i) => h && headers[i]).map((h, i) => `${h} ← ${headers[i]}`),
      unknown: rawHeaders.filter((h, i) => h && !headers[i])
    };
    return parsed;
  }
  async function parseFile(file, type) {
    if (file.size > 5 * 1024 * 1024) throw new Error('حجم الملف يتجاوز الحد المسموح (5 ميجابايت).');
    const isCsv = /\.csv$/i.test(file.name);
    if (isCsv) return rowsFromGrid(parseCsvGrid(await file.text()), type);
    if (!window.XLSX) throw new Error('قارئ Excel غير متاح. أعد رفع الملف بصيغة CSV أو تحقق من الاتصال بمكتبة Excel.');
    const book = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
    const sheet = book.Sheets[book.SheetNames[0]];
    if (!sheet) throw new Error('ملف Excel لا يحتوي على ورقة بيانات.');
    return rowsFromGrid(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }), type);
  }
  function findStudent(students, code) { return students.find(s => studentCode(s) === code); }
  function validateRows(rows, type, snapshot) {
    const valid = [], errors = [], seen = new Set(), students = snapshot.students || [], advisors = snapshot.advisors || [];
    rows.slice(0, 10000).forEach((raw, idx) => {
      const line = raw._line || idx + 2, issues = [], code = arabicDigits(raw.code).trim();
      if (!/^\d{4,15}$/.test(code)) issues.push('كود الطالب يجب أن يتكون من 4 إلى 15 رقمًا.');
      if (code && seen.has(code)) issues.push('كود الطالب مكرر داخل الملف.');
      if (code) seen.add(code);
      const student = findStudent(students, code);
      if (type !== 'students' && /^\d{4,15}$/.test(code) && !student) issues.push('هذا الطالب غير مسجل في المنصة؛ لم يتم إنشاء حساب دخول تلقائيًا.');
      if (type === 'students') {
        const name = String(raw.name || '').trim();
        if (!name) issues.push('اسم الطالب مطلوب.');
        const gpaText = String(raw.gpa == null ? '' : raw.gpa).trim();
        const gpa = gpaText === '' ? null : validGpa(gpaText);
        if (gpaText !== '' && gpa === null) issues.push('المعدل التراكمي يجب أن يكون رقمًا من 0 إلى 4.');
        const hoursText = String(raw.completedHours == null ? '' : raw.completedHours).trim();
        const completedHours = hoursText === '' ? null : Number(arabicDigits(hoursText));
        if (hoursText !== '' && (!Number.isFinite(completedHours) || completedHours < 0)) issues.push('الساعات المجتازة يجب أن تكون رقمًا موجبًا أو صفرًا.');
        if (!issues.length) valid.push({ line, row: { ...raw, code, name, gpa, completedHours } });
      } else if (type === 'academic') {
        const gpaText = String(raw.gpa == null ? '' : raw.gpa).trim();
        const gpa = gpaText === '' ? null : validGpa(gpaText);
        if (gpaText !== '' && gpa === null) issues.push('المعدل التراكمي يجب أن يكون رقمًا من 0 إلى 4.');
        const program = programMatch(raw.group), department = departmentMatch(raw.group);
        if (!String(raw.group || '').trim()) issues.push('البرنامج أو القسم مطلوب.');
        else if (!program && !department) issues.push('البرنامج/القسم غير مطابق للأسماء المعتمدة في المنصة.');
        if (!issues.length) valid.push({ line, row: { code, gpa, studentName: studentName(student), groupLabel: program ? program.nameAr : 'قسم ' + department.nameAr, groupType: program ? 'program' : 'department', groupId: program ? program.id : department.id, groupDept: program ? program.dept || '' : undefined } });
      } else {
        const name = String(raw.advisor || '').trim();
        if (!name) issues.push('اسم المرشد مطلوب.');
        const matches = name ? advisors.filter(a => labelNorm(studentName(a)) === labelNorm(name)) : [];
        if (name && matches.length === 0) issues.push('لم يُعثر على حساب مرشد مفعّل بهذا الاسم.');
        if (matches.length > 1) issues.push('اسم المرشد غير فريد؛ يلزم تمييز الحساب قبل الإسناد.');
        if (!issues.length) valid.push({ line, row: { code, studentName: studentName(student), advisorName: studentName(matches[0]), advisorUsername: matches[0].username || matches[0].code } });
      }
      if (issues.length) errors.push({ line, code, messages: issues });
    });
    if (rows.length > 10000) errors.push({ line: 10002, code: '', messages: ['تجاوز الملف الحد الأقصى البالغ 10,000 سطر؛ لم تتم معالجة السطور الزائدة.'] });
    return { valid, errors, total: rows.length };
  }
  function filteredStudents(students) {
    const program = document.getElementById('dean-academic-program')?.value || 'all';
    const level = document.getElementById('dean-academic-level')?.value || 'all';
    const gpaFilter = document.getElementById('dean-academic-gpa')?.value || 'all';
    const filters = { program, level, gpa: gpaFilter };
    const allGroups = filterAcademicGroups(students);
    const programSelect = document.getElementById('dean-academic-program');
    const levelSelect = document.getElementById('dean-academic-level');
    if (programSelect) {
      const old = filters.program;
      programSelect.innerHTML = '<option value="all">كل البرامج والأقسام</option>' + [...allGroups.values()].sort((a,b) => a.label.localeCompare(b.label,'ar')).map(g => `<option value="${esc(g.key)}">${esc(g.label)}</option>`).join('');
      programSelect.value = allGroups.has(old) ? old : 'all'; filters.program = programSelect.value;
    }
    if (levelSelect) {
      const old = filters.level;
      levelSelect.innerHTML = '<option value="all">كل المستويات</option>' + LEVELS.map((l,i) => `<option value="${i}">${l}</option>`).join('');
      levelSelect.value = ['0','1','2','3'].includes(old) ? old : 'all'; filters.level = levelSelect.value;
    }
    const output = students.filter(s => {
      const group = academicGroup(s), li = levelIndex(s.level);
      const gpa = isGpaRecorded(s.gpa) ? Number(arabicDigits(s.gpa)) : null;
      return (filters.program === 'all' || matchesAcademicGroup(s, filters.program))
        && (filters.level === 'all' || li === Number(filters.level))
        && (filters.gpa === 'all' || (filters.gpa === 'risk' && gpa !== null && gpa < 2) || (filters.gpa === 'safe' && gpa !== null && gpa >= 2) || (filters.gpa === 'missing' && gpa === null));
    });
    return { rows: output, filters, groups: allGroups };
  }
  function renderDeanAcademic(students) {
    const result = filteredStudents(students || []), rows = result.rows;
    let recorded = 0, atRisk = 0;
    rows.forEach(s => { if (isGpaRecorded(s.gpa)) { recorded++; if (Number(arabicDigits(s.gpa)) < 2) atRisk++; } });
    const percent = recorded ? atRisk * 100 / recorded : 0;
    const scope = document.getElementById('dean-academic-scope');
    if (scope) scope.textContent = `${rows.length.toLocaleString('ar-EG')} طالب ضمن الفلاتر · تُحسب نسبة التعثر من ${recorded.toLocaleString('ar-EG')} طالب بمعدل مسجل`;
    const grouped = new Map();
    rows.forEach(s => {
      const g = academicGroup(s);
      if (!grouped.has(g.key)) grouped.set(g.key, { ...g, levels: [0,0,0,0], total: 0, risk: 0, recorded: 0 });
      const row = grouped.get(g.key); row.total++;
      const li = levelIndex(s.level); if (li >= 0) row.levels[li]++;
      if (isGpaRecorded(s.gpa)) { row.recorded++; if (Number(arabicDigits(s.gpa)) < 2) row.risk++; }
    });
    const summaries = [...grouped.values()].sort((a,b) => b.total-a.total || a.label.localeCompare(b.label,'ar'));
    state.dashboardRows = rows.slice(); state.lastFilters = result.filters;
    const chart = document.getElementById('dean-academic-chart');
    if (chart) {
      const max = Math.max(1, ...summaries.map(g => g.total));
      chart.innerHTML = summaries.length ? `<div class="dean-academic-legend">${LEVELS.map((l,i) => `<span><i style="background:${COLORS[i]}"></i>${l}</span>`).join('')}</div>` + summaries.map(g => {
        const known = g.levels.reduce((a,b) => a+b,0), barWidth = Math.max(g.total ? 3 : 0, g.total * 100 / max);
        const segs = g.levels.map((n,i) => n ? `<i title="${LEVELS[i]}: ${n}" style="width:${known ? n*100/known : 0}%;background:${COLORS[i]}"></i>` : '').join('');
        return `<div class="dean-academic-chart-row"><span class="dean-academic-chart-label" title="${esc(g.label)}">${esc(g.label)}</span><span class="dean-academic-bar-track"><span class="dean-academic-bar" style="width:${barWidth}%">${segs}</span></span><b>${g.total}</b></div>`;
      }).join('') : '<div class="dean-empty">لا توجد بيانات مطابقة للفلاتر لعرضها.</div>';
    }
    const table = document.getElementById('dean-academic-table');
    if (table) table.innerHTML = summaries.length ? `<table class="data"><thead><tr><th>البرنامج / القسم</th>${LEVELS.map(l => `<th>${l}</th>`).join('')}<th>الإجمالي</th><th>المتعثرون</th><th>نسبة التعثر</th></tr></thead><tbody>${summaries.map(g => `<tr><td>${esc(g.label)}</td>${g.levels.map(n => `<td>${n}</td>`).join('')}<td><b>${g.total}</b></td><td>${g.risk}</td><td>${g.recorded ? (g.risk*100/g.recorded).toFixed(1)+'%' : '—'}</td></tr>`).join('')}</tbody><tfoot><tr><th>الإجمالي</th>${[0,1,2,3].map(i => `<th>${summaries.reduce((n,g)=>n+g.levels[i],0)}</th>`).join('')}<th>${rows.length}</th><th>${atRisk}</th><th>${recorded ? percent.toFixed(1)+'%' : '—'}</th></tr></tfoot></table>` : '<div class="dean-empty">لا توجد بيانات مطابقة للفلاتر لعرضها.</div>';
    return { rows, studentsCount: rows.length, atRisk, recorded, percent };
  }
  function csvCell(value) {
    let text = String(value == null ? '' : value);
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g,'""') + '"';
  }
  function exportDeanCSV() {
    if (!window.App || !App.canPage || !App.canPage('dean-dashboard')) { alert('تصدير هذا التقرير متاح لعمادة الكلية فقط.'); return; }
    const headers = ['كود الطالب','اسم الطالب','البرنامج أو القسم','المستوى','المعدل التراكمي','حالة المعدل'];
    const rows = state.dashboardRows.map(s => {
      const g = academicGroup(s), has = isGpaRecorded(s.gpa), gpa = has ? Number(arabicDigits(s.gpa)) : '';
      return [studentCode(s), studentName(s), g.label, s.level || '', gpa, has ? (gpa < 2 ? 'متعثر' : '2.00 فأعلى') : 'غير مسجل'];
    });
    const csv = '\ufeff' + [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'تقرير_البيانات_الأكاديمية_' + new Date().toISOString().slice(0,10) + '.csv'; link.click(); URL.revokeObjectURL(link.href);
  }
  function renderImportsCenter() {
    const root = document.getElementById('academic-import-root'); if (!root) return;
    const user = window.App && App.getCurrentUser ? App.getCurrentUser() : null;
    if (!user || user.role !== 'admin') { root.innerHTML = '<div class="alert alert-warn">مركز رفع البيانات الأكاديمية متاح لمدير النظام فقط.</div>'; return; }
    state.type = null; state.report = null; state.fileName = '';
    root.innerHTML = `<div class="academic-import-intro"><i class="fas fa-shield-check"></i><div><b>استيراد بيانات الطلاب الكاملة — إضافة أو تحديث السجلات</b><p>تتعرف المنصة تلقائيًا على أسماء الأعمدة العربية أو الإنجليزية، وتعرض المعاينة والأخطاء قبل الحفظ. يتم إنشاء السجل الأكاديمي فقط، ولا يتم إنشاء حساب دخول تلقائيًا.</p></div></div>
      <div class="academic-import-type-grid">
        <article class="academic-import-type"><span class="academic-import-icon"><i class="fas fa-user-graduate"></i></span><h2>بيانات الطلاب الكاملة</h2><p>الاسم والكود والبيانات الأكاديمية والشخصية وبيانات التواصل والمرشد الأكاديمي في ملف واحد.</p><a class="btn btn-sm btn-outline" href="templates/57-t-students-full.xlsx" download><i class="fas fa-download"></i> تنزيل نموذج Excel</a><button class="btn btn-sm btn-primary" type="button" onclick="StudentDataCenter.chooseType('students')"><i class="fas fa-upload"></i> رفع ملف الطلاب</button></article>
        <article class="academic-import-type"><span class="academic-import-icon teal"><i class="fas fa-user-tie"></i></span><h2>إسناد المرشدين</h2><p>إسناد كل طالب إلى حساب مرشد مفعّل وموجود في المنصة بالاسم المطابق.</p><a class="btn btn-sm btn-outline" href="templates/55-t-advising.xlsx" download><i class="fas fa-download"></i> تنزيل قالب Excel</a><button class="btn btn-sm btn-primary" type="button" onclick="StudentDataCenter.chooseType('advisors')"><i class="fas fa-upload"></i> رفع ملف الإسناد</button></article>
      </div><input type="file" id="academic-import-file" accept=".xlsx,.xls,.csv" hidden onchange="StudentDataCenter.onFileSelected(event)"><div id="academic-import-workspace"></div>`;
  }
  function chooseType(type) {
    if (!['students','advisors'].includes(type)) return;
    if (!window.App || !App.getCurrentUser || !App.getCurrentUser() || App.getCurrentUser().role !== 'admin') return;
    state.type = type; state.report = null;
    const file = document.getElementById('academic-import-file'); if (file) { file.value = ''; file.click(); }
  }
  async function onFileSelected(event) {
    const file = event.target.files && event.target.files[0]; if (!file || !state.type) return;
    const workspace = document.getElementById('academic-import-workspace');
    workspace.innerHTML = '<div class="academic-import-status"><i class="fas fa-spinner fa-spin"></i> جارٍ قراءة الملف والتحقق من البيانات...</div>';
    try {
      const [rawRows, snapshot] = await Promise.all([parseFile(file, state.type), App.getAcademicDataSnapshot()]);
      state.fileName = file.name; state.report = validateRows(rawRows, state.type, snapshot); state.report.meta = rawRows._meta || { recognized: [], unknown: [] }; state.type = state.type;
      state.report.snapshot = snapshot;
      renderReport();
    } catch (error) {
      workspace.innerHTML = `<div class="alert alert-danger">${esc(error.message || 'تعذر قراءة الملف.')}</div><button class="btn btn-outline btn-sm" type="button" onclick="StudentDataCenter.renderImportsCenter()">إلغاء والعودة</button>`;
    }
  }
  function renderReport() {
    const root = document.getElementById('academic-import-workspace'), report = state.report;
    if (!root || !report) return;
    const typeName = state.type === 'students' ? 'بيانات الطلاب الكاملة' : state.type === 'academic' ? 'بيانات الطلاب الأكاديمية' : 'إسناد المرشدين';
    const headers = state.type === 'students' ? ['الكود','الاسم','المستوى','البرنامج','القسم','المعدل','الساعات','المرشد','حالة الطالب'] : state.type === 'academic' ? ['كود الطالب','اسم الطالب','البرنامج / القسم','المعدل التراكمي'] : ['كود الطالب','اسم الطالب','المرشد الأكاديمي'];
    const validRows = report.valid.slice(0,50).map(item => state.type === 'students'
      ? [item.row.code,item.row.name,item.row.level||'—',item.row.program||'—',item.row.dept||'—',item.row.gpa == null ? 'غير مسجل' : item.row.gpa,item.row.completedHours == null ? 'غير مسجل' : item.row.completedHours,item.row.advisor||'—',item.row.studentStatus||'—']
      : state.type === 'academic' ? [item.row.code,item.row.studentName,item.row.groupLabel,item.row.gpa == null ? 'غير مسجل' : item.row.gpa.toFixed(2)]
      : [item.row.code,item.row.studentName,item.row.advisorName]);
    root.innerHTML = `<div class="academic-import-workspace card"><div class="card-body"><div class="academic-import-report-head"><div><span class="dean-section-kicker">نتيجة التحقق</span><h2>${typeName}</h2><small>${esc(state.fileName)} · ${report.total.toLocaleString('ar-EG')} سطر بيانات</small></div><button class="btn btn-outline btn-sm" type="button" onclick="StudentDataCenter.renderImportsCenter()">إلغاء</button></div>
      <div class="academic-import-counts"><div><b>${report.valid.length}</b><span>صالح للرفع</span></div><div><b>${report.errors.length}</b><span>أخطاء مستبعدة</span></div><div><b>${report.total}</b><span>إجمالي السطور</span></div></div>
      <div class="academic-import-mapping"><b><i class="fas fa-wand-magic-sparkles"></i> المطابقة التلقائية</b><span>تم التعرف على ${report.meta?.recognized?.length || 0} عمودًا${report.meta?.unknown?.length ? `، وتعذر فهم: ${report.meta.unknown.map(esc).join('، ')}` : ' دون أعمدة غير مفهومة.'}</span></div>
      ${report.errors.length ? `<div class="academic-import-errors"><b><i class="fas fa-triangle-exclamation"></i> الصفوف التي لن تُستورد</b><ul>${report.errors.slice(0,100).map(e => `<li>السطر ${e.line}${e.code ? ' · '+esc(e.code) : ''}: ${esc(e.messages.join(' '))}</li>`).join('')}</ul>${report.errors.length>100?`<small>عرض أول 100 خطأ.</small>`:''}</div>` : '<div class="alert alert-success">اجتازت كل الصفوف فحص البيانات.</div>'}
      ${report.valid.length ? `<div class="table-wrap academic-import-preview"><table class="data"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${validRows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><small>معاينة أول ${Math.min(50,report.valid.length)} صفًا صالحًا.</small></div>` : '<div class="academic-import-status">لا توجد صفوف صالحة للتأكيد.</div>'}
      <div class="academic-import-actions"><button class="btn btn-primary" type="button" ${report.valid.length?'':'disabled'} onclick="StudentDataCenter.confirmImport()"><i class="fas fa-check"></i> تأكيد استيراد ${report.valid.length.toLocaleString('ar-EG')} صفًا</button><span>لن تُحفظ الصفوف الخاطئة أو المكررة، ويمكن مراجعة الأعمدة المكتشفة قبل التأكيد.</span></div><div id="academic-import-results"></div></div></div>`;
  }
  async function confirmImport() {
    const user = App.getCurrentUser && App.getCurrentUser();
    if (!user || user.role !== 'admin' || !state.report || !state.report.valid.length) return;
    if (!window.confirm(`تأكيد تحديث ${state.report.valid.length} سجلًا؟\nتأكد من صحة المعاينة؛ لن تُنشأ حسابات جديدة.`)) return;
    const button = document.querySelector('#academic-import-workspace .academic-import-actions button'); if (button) button.disabled = true;
    const success = [], failures = [];
    if (state.type === 'students' && window.DB?.isOnline?.() && typeof DB.importStudents === 'function') {
      try {
        const result = await DB.importStudents(state.report.valid.map(item => ({ ...item.row, _line: item.line })), state.fileName);
        (result.rejected || []).forEach(item => failures.push({ line: item.line || '—', code: item.code || '—', error: (item.errors || []).join('؛ ') }));
        for (let i = 0; i < Number(result.updated || 0); i++) success.push(true);
      } catch (error) { failures.push({ line: '—', code: '—', error: error.message || String(error) }); }
      const target = document.getElementById('academic-import-results');
      if (target) target.innerHTML = `<div class="academic-import-result-summary"><div><b>${success.length}</b><span>تم تحديثها مركزيًا</span></div><div><b>${failures.length}</b><span>مرفوضة</span></div></div>${failures.length?`<div class="academic-import-errors"><b>تفاصيل الرفض</b><ul>${failures.slice(0,100).map(f=>`<li>السطر ${f.line} · ${esc(f.code)}: ${esc(f.error)}</li>`).join('')}</ul></div>`:'<div class="alert alert-success">اكتمل الاستيراد المركزي وحُفظت لقطات السجلات السابقة.</div>'}<p class="academic-import-note">لم تُنشأ حسابات دخول جديدة، ولم تُقبل السجلات غير الموجودة في السجل المركزي.</p><button class="btn btn-outline btn-sm" type="button" onclick="StudentDataCenter.renderImportsCenter()">استيراد ملف آخر</button>`;
      if (button) button.disabled = false;
      return;
    }
    for (const item of state.report.valid) {
      let result;
      try {
        if (state.type === 'students') {
          result = await App.updateStudentImportData(item.row.code, item.row);
        } else if (state.type === 'academic') {
          const patch = { gpa: item.row.gpa };
          if (item.row.groupType === 'program') { patch.program = item.row.groupId; patch.dept = item.row.groupDept || undefined; }
          else patch.dept = item.row.groupId;
          result = await App.updateStudentAcademicData(item.row.code, patch);
        } else result = await App.assignAdvisorAcademicData(item.row.code, item.row.advisorUsername);
        if (!result || !result.ok) throw new Error(result && result.error || 'تعذر حفظ السجل.');
        success.push(item);
      } catch (error) { failures.push({ line: item.line, code: item.row.code, error: error.message || String(error) }); }
    }
    const target = document.getElementById('academic-import-results');
    if (target) target.innerHTML = `<div class="academic-import-result-summary"><div><b>${success.length}</b><span>تم بنجاح</span></div><div><b>${failures.length}</b><span>تعذر حفظها</span></div></div>${failures.length?`<div class="academic-import-errors"><b>تفاصيل تعذر الحفظ</b><ul>${failures.slice(0,100).map(f=>`<li>السطر ${f.line} · ${esc(f.code)}: ${esc(f.error)}</li>`).join('')}</ul></div>`:'<div class="alert alert-success">اكتمل الاستيراد بنجاح.</div>'}<p class="academic-import-note">عولجت الصفوف على حدة؛ يمكنك تصحيح الصفوف الفاشلة وإعادة رفعها. الاستيراد يحدّث بيانات الطالب ولا ينشئ حساب دخول تلقائيًا.</p><button class="btn btn-outline btn-sm" type="button" onclick="StudentDataCenter.renderImportsCenter()">استيراد ملف آخر</button>`;
    if (button) button.disabled = false;
  }
  window.StudentDataCenter = { renderDeanAcademic, exportDeanCSV, renderImportsCenter, chooseType, onFileSelected, confirmImport };
})();
