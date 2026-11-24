(function () {
  'use strict';

  const state = { fileName: '', report: null };
  const STORAGE_KEY = 'fos_v2_transcripts';

  const arabicDigits = value => String(value == null ? '' : value)
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٫،]/g, '.');
  const text = value => String(value == null ? '' : value).trim();
  const norm = value => text(value).toLocaleLowerCase('ar')
    .replace(/[\u064b-\u065f\u0670]/g, '').replace(/ـ/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/[\s_\-]+/g, ' ');
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const rowValues = row => (row || []).map(text);
  const nonEmpty = value => text(value) !== '' && text(value) !== ':';

  function getRowsFromFile(file) {
    return file.text ? file.text() : Promise.reject(new Error('تعذر قراءة الملف.'));
  }

  async function readWorkbook(file) {
    if (!file || file.size > 10 * 1024 * 1024) throw new Error('حجم ملف السجل يجب ألا يتجاوز 10 ميجابايت.');
    if (!window.XLSX) throw new Error('مكتبة قراءة Excel غير متاحة.');
    const book = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false, cellDates: false });
    const sheets = book.SheetNames || [];
    if (!sheets.length) throw new Error('ملف Excel لا يحتوي على أوراق.');
    const sheet = book.Sheets[sheets[0]];
    return { sheetName: sheets[0], rows: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) };
  }

  function cells(row) {
    return rowValues(row).map((value, index) => ({ value, index })).filter(item => nonEmpty(item.value));
  }

  function findCellIndex(row, matcher) {
    return cells(row).find(item => matcher(norm(item.value), item.value))?.index ?? -1;
  }

  function nearbyValue(row, labelMatcher) {
    const values = rowValues(row);
    const labelIndex = findCellIndex(row, labelMatcher);
    if (labelIndex < 0) return '';
    for (let i = labelIndex - 1; i >= 0; i--) if (nonEmpty(values[i])) return values[i];
    for (let i = labelIndex + 1; i < values.length; i++) if (nonEmpty(values[i])) return values[i];
    return '';
  }

  function yearValue(value) {
    const v = arabicDigits(value).replace(/[–—]/g, '-');
    const match = v.match(/20\d{2}\s*[-/]\s*20\d{2}/);
    return match ? match[0].replace(/\s+/g, '') : '';
  }

  function levelLabel(value) {
    const v = norm(arabicDigits(value));
    if (/الاول|الأول|اول|level 1|\b1\b/.test(v)) return 'المستوى الأول';
    if (/الثاني|الثان|level 2|\b2\b/.test(v)) return 'المستوى الثاني';
    if (/الثالث|الثال|level 3|\b3\b/.test(v)) return 'المستوى الثالث';
    if (/الرابع|الراب|level 4|\b4\b/.test(v)) return 'المستوى الرابع';
    return text(value);
  }

  function semesterLabel(value) {
    const v = norm(value);
    if (/صيف|summer/.test(v)) return 'الفصل الصيفي';
    if (/الثاني|الثان|second/.test(v)) return 'الفصل الثاني';
    if (/الاول|الأول|اول|first/.test(v)) return 'الفصل الأول';
    return text(value);
  }

  function isYearRow(row) {
    const values = rowValues(row);
    return values.some(v => /العام الأكاديمي|العام الاكاديمي/.test(norm(v)) && yearValue(values[values.indexOf(v) - 1] || v))
      || values.some(v => /العام الأكاديمي|العام الاكاديمي/.test(norm(v))) && values.some(v => yearValue(v));
  }

  function headerMap(row) {
    const map = {};
    rowValues(row).forEach((value, index) => {
      const v = norm(value);
      if (/^اسم المقرر|^اسم الماده|^إسم المقرر/.test(v) && !/التقدير/.test(v)) map.name = index;
      else if (/كود المقرر|كود الماده|رمز المقرر/.test(v)) map.code = index;
      else if (/الساعات|عدد الساعات/.test(v)) map.hours = index;
      else if (/^تقدير$|التقدير/.test(v)) map.grade = index;
      else if (/نقاط|النقاط/.test(v)) map.points = index;
      else if (/درجة/.test(v) && !/صغرى|عظمى/.test(v)) map.score = index;
      else if (/ناجح|حالة/.test(v)) map.status = index;
      else if (/التراكمي/.test(v)) map.cumulative = index;
    });
    return map;
  }

  function isCourseHeader(row) {
    const map = headerMap(row);
    return Number.isInteger(map.name) && Number.isInteger(map.code) && Number.isInteger(map.hours) && Number.isInteger(map.grade);
  }

  function findCourseHeader(rows, start) {
    for (let i = start; i < Math.min(rows.length, start + 8); i++) if (isCourseHeader(rows[i])) return i;
    return -1;
  }

  function parseStudentMeta(rows) {
    const meta = {};
    rows.slice(0, 30).forEach(row => {
      const set = (key, matcher) => { if (!meta[key]) meta[key] = nearbyValue(row, (v) => matcher.test(v)); };
      set('name', /اسم الطالب|الاسم/);
      set('code', /كود الطالب|رقم الطالب|الكود/);
      set('enrollmentYear', /عام الالتحاق|سنة الالتحاق/);
      set('nationality', /الجنسية/);
      set('birthDate', /تاريخ الميلاد/);
      set('birthplace', /محل الميلاد|مكان الميلاد/);
      set('status', /حالة القيد/);
      set('level', /مستوى الدراسة/);
      set('section', /القسم.?\/?.?الشعبة|القسم|الشعبة/);
    });
    meta.code = arabicDigits(meta.code).replace(/\D/g, '');
    return meta;
  }

  function parseReport(rows, sheetName, fileName) {
    const student = parseStudentMeta(rows);
    const years = [];
    let context = { year: '', level: '', section: '' };
    let currentSemester = '';
    let currentHeader = null;
    const courses = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const vals = rowValues(row);
      if (isYearRow(row)) {
        const year = vals.map(yearValue).find(Boolean) || '';
        const level = levelLabel(nearbyValue(row, v => /الفرقة|المستوى/.test(v)));
        const section = nearbyValue(row, v => /القسم.?\/?.?الشعبة|القسم|الشعبة/.test(v));
        context = { year, level, section };
        if (year && !years.some(y => y.year === year)) years.push({ year, level, section, semesters: [] });
        currentSemester = '';
        currentHeader = null;
        continue;
      }
      const semesterCell = vals.find(v => /الفصل الدراسي|الفصل الصيفى|الفصل الصيفي/.test(norm(v)));
      if (semesterCell) {
        currentSemester = semesterLabel(semesterCell);
        currentHeader = null;
        continue;
      }
      if (isCourseHeader(row)) {
        currentHeader = headerMap(row);
        continue;
      }
      if (!currentHeader || !context.year) continue;
      const code = text(row[currentHeader.code]);
      const name = text(row[currentHeader.name]);
      if (!code || !name || /كود المقرر|اسم المقرر/.test(norm(code + ' ' + name))) continue;
      if (isYearRow(row)) continue;
      const record = {
        id: `${context.year}|${currentSemester}|${code}|${courses.length}`,
        year: context.year,
        level: context.level,
        section: context.section,
        semester: currentSemester || 'غير محدد',
        code,
        name,
        hours: arabicDigits(row[currentHeader.hours]),
        grade: text(row[currentHeader.grade]),
        points: text(row[currentHeader.points]),
        score: text(row[currentHeader.score]),
        status: text(row[currentHeader.status])
      };
      if (!/^[-—]?$/.test(record.hours) || record.grade || record.points) courses.push(record);
    }

    // Preserve every source row: repeated course codes may represent real retakes.
    // Suspected technical duplicates are flagged for human review by the calculation layer.
    const calculation = window.AcademicCalculator
      ? window.AcademicCalculator.calculate(courses)
      : null;
    const summary = {
      totalHours: courses.reduce((sum, c) => sum + (Number(c.hours) || 0), 0),
      passed: calculation ? calculation.attempts.filter(c => c.passed === true).length : null,
      failed: calculation ? calculation.failed_attempts : null,
      gpa: null, cgpa: calculation?.cgpa ?? null,
      reviewRequired: !calculation || calculation.reviewRequired,
      calculation
    };
    return { fileName, sheetName, importedAt: new Date().toISOString(), student, years, courses, summary };
  }

  function loadRecords() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { return {}; } }
  function saveRecord(report) {
    const records = loadRecords();
    const key = report.student.code || `file:${report.fileName}`;
    const previous = records[key];
    const priorCourses = Array.isArray(previous?.courses) ? previous.courses : [];
    const merge = window.AcademicCalculator?.mergeAttempts;
    const courses = merge ? merge(priorCourses, report.courses || []) : [...priorCourses, ...(report.courses || [])];
    const calculation = window.AcademicCalculator?.calculate(courses) || null;
    const history = [...(previous?.importHistory || [])];
    if (previous?.importedAt) history.push({ fileName: previous.fileName, importedAt: previous.importedAt, attempts: priorCourses.length });
    records[key] = {
      ...previous, ...report, courses, importedAt: new Date().toISOString(), importHistory: history,
      summary: {
        ...(previous?.summary || {}), ...(report.summary || {}),
        totalHours: courses.reduce((sum, c) => sum + (Number(c.hours) || 0), 0),
        passed: calculation ? calculation.attempts.filter(c => c.passed === true).length : null,
        failed: calculation ? calculation.failed_attempts : null,
        gpa: null, cgpa: calculation?.cgpa ?? null,
        reviewRequired: !calculation || calculation.reviewRequired, calculation
      }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return { key, previousAttempts: priorCourses.length, savedAttempts: courses.length };
  }

  function render() {
    const root = document.getElementById('transcript-import-root');
    if (!root) return;
    const user = window.App?.getCurrentUser?.();
    if (!user || user.role !== 'admin') { root.innerHTML = '<div class="alert alert-warn">مركز رفع السجلات الدراسية متاح لمدير النظام فقط.</div>'; return; }
    state.report = null; state.fileName = '';
    root.innerHTML = `<div class="transcript-import-intro"><div class="transcript-import-icon"><i class="fas fa-file-invoice"></i></div><div><b>رفع سجل دراسي مستقل</b><p>هذه الشاشة مخصصة لملفات السجل التفصيلية مثل ملف Excel المرسل. لا تغيّر بيانات الطلاب الأساسية ولا تختلط معها.</p></div></div>
      <div class="transcript-import-steps"><span><b>1</b> اختر ملف السجل</span><span><b>2</b> راجع الطالب والمقررات</span><span><b>3</b> أكد الحفظ</span></div>
      <div class="transcript-upload-box"><i class="fas fa-file-excel"></i><h2>اختر ملف سجل دراسي</h2><p>يدعم ملفات XLS وXLSX، ويقرأ الأعوام والفصول والمقررات تلقائيًا.</p><input type="file" id="transcript-import-file" accept=".xls,.xlsx" onchange="TranscriptImportCenter.onFileSelected(event)"><small>الحد الأقصى 10 ميجابايت · ملف طالب واحد في كل مرة</small></div>
      <div id="transcript-import-workspace"></div>`;
  }

  async function onFileSelected(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const workspace = document.getElementById('transcript-import-workspace');
    workspace.innerHTML = '<div class="academic-import-status"><i class="fas fa-spinner fa-spin"></i> جارٍ تحليل السجل الدراسي...</div>';
    try {
      const workbook = await readWorkbook(file);
      state.fileName = file.name;
      state.report = parseReport(workbook.rows, workbook.sheetName, file.name);
      renderReport();
    } catch (error) {
      workspace.innerHTML = `<div class="alert alert-danger">${esc(error.message || 'تعذر تحليل ملف السجل.')}</div><button type="button" class="btn btn-outline btn-sm" onclick="TranscriptImportCenter.render()">اختيار ملف آخر</button>`;
    }
  }

  function renderReport() {
    const root = document.getElementById('transcript-import-workspace');
    const r = state.report; if (!root || !r) return;
    const meta = r.student;
    const courseRows = r.courses.slice(0, 100).map(c => `<tr><td>${esc(c.year)}</td><td>${esc(c.semester)}</td><td>${esc(c.level || '—')}</td><td><b>${esc(c.code)}</b><br><small>${esc(c.name)}</small></td><td>${esc(c.hours || '—')}</td><td><span class="transcript-grade">${esc(c.grade || '—')}</span></td><td>${esc(c.points || '—')}</td></tr>`).join('');
    root.innerHTML = `<section class="transcript-report card"><div class="card-body"><div class="academic-import-report-head"><div><span class="dean-section-kicker">معاينة قبل الحفظ</span><h2>السجل الدراسي المكتشف</h2><small>${esc(r.fileName)} · ${r.courses.length} مقررًا · ${r.years.length} أعوام</small></div><button type="button" class="btn btn-outline btn-sm" onclick="TranscriptImportCenter.render()">إلغاء</button></div>
      <div class="transcript-student-card"><div class="transcript-avatar"><i class="fas fa-user-graduate"></i></div><div><span>الطالب المكتشف</span><strong>${esc(meta.name || 'لم يتم التعرف على الاسم')}</strong><small>الكود: ${esc(meta.code || 'لم يتم التعرف على الكود')} · ${esc(meta.section || 'الشعبة غير محددة')}</small></div><div class="transcript-meta-state"><span>الحالة</span><b>${esc(meta.status || 'غير محددة')}</b></div></div>
      <div class="academic-import-counts transcript-counts"><div><b>${r.years.length}</b><span>أعوام دراسية</span></div><div><b>${r.courses.length}</b><span>محاولات مسجلة</span></div><div><b>${r.summary.calculation?.earned_credit_hours ?? '—'}</b><span>ساعات مجتازة مؤكدة</span></div><div><b>${r.summary.calculation?.failed_attempts ?? '—'}</b><span>محاولات رسوب مؤكدة</span></div></div>
      ${!meta.code ? '<div class="alert alert-danger">لم يتم التعرف على كود الطالب. لا يمكن الحفظ قبل مراجعة ملف السجل.</div>' : ''}
      ${r.summary.reviewRequired ? '<div class="alert alert-warn">تحتاج بعض البيانات إلى مراجعة بشرية؛ لن يُعرض معدل محسوب عند نقص نقاط التقدير أو الساعات أو حالة النجاح. تُحفظ كل المحاولات ولا تحذف الإعادات.</div>' : ''}${r.summary.calculation ? `<div class="academic-import-counts"><div><b>${r.summary.calculation.cgpa == null ? 'غير قابل للحساب' : r.summary.calculation.cgpa.toFixed(2)}</b><span>CGPA مؤقت من النقاط الموجودة</span></div><div><b>${r.summary.calculation.gpa_credit_hours}</b><span>ساعات المعدل</span></div><div><b>${r.summary.calculation.gpa_weighted_points.toFixed(2)}</b><span>النقاط الموزونة</span></div><div><b>${r.summary.calculation.duplicateAttempts.length}</b><span>صفوف متكررة للمراجعة</span></div></div>` : ''}${!r.courses.length ? '<div class="alert alert-warn">لم يتم العثور على صفوف مقررات بالشكل المتوقع في هذا الملف.</div>' : `<div class="table-wrap transcript-preview"><table class="data"><thead><tr><th>العام</th><th>الفصل</th><th>المستوى</th><th>المقرر</th><th>الساعات</th><th>التقدير</th><th>النقاط</th></tr></thead><tbody>${courseRows}</tbody></table>${r.courses.length > 100 ? '<small>تظهر أول 100 مقرر فقط في المعاينة، وسيتم حفظ الكل.</small>' : ''}</div>`}
      <div class="transcript-report-actions"><button type="button" class="btn btn-primary" ${meta.code && r.courses.length ? '' : 'disabled'} onclick="TranscriptImportCenter.confirmSave()"><i class="fas fa-database"></i> حفظ السجل بشكل مستقل</button><span>سيُحفظ السجل في مساحة السجلات الدراسية فقط، ولن يتم تعديل ملف بيانات الطالب الأساسي.</span></div><div id="transcript-import-result"></div></div></section>`;
  }

  async function confirmSave() {
    const r = state.report; if (!r || !r.student.code || !r.courses.length) return;
    if (!window.confirm(`حفظ ودمج محاولات السجل الدراسي للطالب ${r.student.code}؟\nلن تُحذف أي محاولة سابقة. يعاد تحليل المحاولات المكررة دون تكرار الاستيراد نفسه.`)) return;
    const result = document.getElementById('transcript-import-result');
    if (result) result.innerHTML = '<div class="alert alert-info">جارٍ حفظ المحاولات في السجل المركزي...</div>';
    try {
      if (window.DB?.isOnline?.() && typeof DB.importGrades === 'function') {
        const rows = r.courses.map((course, index) => ({ course_code: course.code, course_name: course.name, academic_year: course.year, semester: course.semester, hours: Number(course.hours) || null, grade: course.grade || null, points: course.points === '' ? null : Number(course.points), source_key: `${course.year}|${course.semester}|${course.code}|${index}` }));
        const central = await DB.importGrades(r.student.code, rows, r.fileName);
        if (result) result.innerHTML = `<div class="alert alert-success"><i class="fas fa-check-circle"></i> تم حفظ السجل مركزيًا للطالب <b>${esc(r.student.code)}</b>. أضيفت ${Number(central.inserted || 0)} محاولة، وتجاوز النظام ${Number(central.duplicate || 0)} محاولة مكررة، مع حفظ السجل التاريخي.</div>`;
      } else {
        const saved = saveRecord(r);
        if (result) result.innerHTML = `<div class="alert alert-success"><i class="fas fa-check-circle"></i> تم دمج السجل محليًا للطالب <b>${esc(saved.key)}</b>. هذا الوضع لا يزامن قاعدة البيانات المركزية.</div>`;
      }
    } catch (error) {
      if (result) result.innerHTML = `<div class="alert alert-danger">تعذر حفظ السجل: ${esc(error.message)}</div>`;
    }
  }

  window.TranscriptImportCenter = { render, onFileSelected, confirmSave };
})();
