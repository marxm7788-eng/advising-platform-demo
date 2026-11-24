(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AcademicCalculator = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const norm = s => String(s ?? '').trim().toLocaleLowerCase('ar').replace(/[\u064b-\u065f\u0670]/g, '').replace(/ـ/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
  const normalizeCode = s => String(s ?? '').trim().toUpperCase().replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const numeric = v => { const raw = String(v ?? '').trim(); if (!raw) return null; const n = Number(raw.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  function isPassed(course) {
    const s = norm(course.status), g = norm(course.grade);
    if (/راسب|غير مجتاز|failed|(^|\s)f\+?(\s|$)|^ر$/.test(`${s} ${g}`)) return false;
    if (/ناجح|مجتاز|passed|نجاح/.test(s)) return true;
    if (/^a\+?$|^a-?$|^b\+?$|^b-?$|^c\+?$|^c-?$|^d\+?$|^d-?$/.test(g)) return true;
    return null;
  }
  function calculate(courses, options = {}) {
    // Permanent institutional rule: UR001 and UR002 never affect GPA/CGPA.
    const excludedCodes = new Set(['UR001', 'UR002', ...(options.excludedCourseCodes || []).map(normalizeCode)]);
    const attempts = courses.map((c, i) => {
      const hours = numeric(c.hours), points = numeric(c.points);
      const code = String(c.code || '').trim();
      const excluded = excludedCodes.has(normalizeCode(code));
      const passed = isPassed(c);
      const issues = [];
      if (hours === null || hours <= 0) issues.push('ساعات غير صالحة أو مفقودة');
      if (passed === null) issues.push('تعذر تحديد حالة النجاح من البيانات المتاحة');
      if (!excluded && points === null) issues.push('نقاط المقرر غير متاحة؛ لا يمكن حساب المعدل');
      if (points !== null && (points < 0 || points > 4)) issues.push('نقاط المقرر خارج النطاق 0–4');
      const pointsValid = excluded || (points !== null && points >= 0 && points <= 4);
      const valid = hours !== null && hours > 0 && pointsValid && passed !== null;
      const includeGpa = valid && !excluded;
      return { ...c, _index: i, parsedHours: hours, parsedPoints: points, passed, excluded, includeGpa, weightedPoints: includeGpa ? points * hours : null, issues };
    });
    const groups = new Map();
    attempts.forEach(a => { if (!a.code) return; const key = normalizeCode(a.code); const g = groups.get(key) || []; g.push(a); groups.set(key, g); });
    const duplicates = [...groups.values()].filter(g => g.length > 1).flatMap(g => g.map(a => ({ code: a.code, index: a._index, attempts: g.length })));
    const semesters = new Map();
    for (const a of attempts) {
      const key = `${a.year || ''}|${a.semester || 'غير محدد'}`;
      if (!semesters.has(key)) semesters.set(key, { year: a.year || '', semester: a.semester || 'غير محدد', points: 0, hours: 0, issues: 0, attempts: 0 });
      const s = semesters.get(key); s.attempts++; s.issues += a.issues.length;
      if (a.includeGpa) { s.points += a.weightedPoints; s.hours += a.parsedHours; }
    }
    let gpaWeightedPoints = 0, gpaCreditHours = 0, failedAttempts = 0, totalAttempts = attempts.length, excludedCourseHours = 0;
    const passedCourseHours = new Map();
    attempts.forEach(a => {
      if (a.passed === false) failedAttempts++;
      if (a.excluded && a.parsedHours !== null) excludedCourseHours += a.parsedHours;
      if (a.includeGpa) { gpaWeightedPoints += a.weightedPoints; gpaCreditHours += a.parsedHours; }
      if (a.passed === true && a.parsedHours !== null && a.code) { const key = normalizeCode(a.code); passedCourseHours.set(key, Math.max(passedCourseHours.get(key) || 0, a.parsedHours)); }
    });
    const semestersOut = [...semesters.values()].map(s => ({ ...s, gpa: s.hours > 0 ? s.points / s.hours : null }));
    let cumulativePoints = 0, cumulativeHours = 0;
    semestersOut.forEach(s => { cumulativePoints += s.points; cumulativeHours += s.hours; s.cgpa = cumulativeHours > 0 ? cumulativePoints / cumulativeHours : null; });
    return {
      attempts: attempts.map(({ _index, ...a }) => a), duplicateAttempts: duplicates,
      semesters: semestersOut, gpa_weighted_points: gpaWeightedPoints, gpa_credit_hours: gpaCreditHours,
      earned_credit_hours: [...passedCourseHours.values()].reduce((a, b) => a + b, 0), failed_attempts: failedAttempts,
      total_attempts: totalAttempts, excluded_course_hours: excludedCourseHours,
      cgpa: gpaCreditHours > 0 ? gpaWeightedPoints / gpaCreditHours : null,
      reviewRequired: attempts.some(a => a.issues.length) || duplicates.length > 0,
      rulesNote: 'المقرران UR001 وUR002 مستثنيان دائمًا من GPA وCGPA، بما في ذلك الأكواد المكتوبة بالأرقام العربية أو الفارسية. لا يخمّن المحرك تحويل الدرجات.'
    };
  }
  function mergeAttempts(previous = [], incoming = []) {
    const signature = c => JSON.stringify([
      String(c.year || ''), String(c.semester || ''), normalizeCode(c.code), norm(c.name),
      numeric(c.hours), norm(c.grade), numeric(c.points), numeric(c.score), norm(c.status)
    ]);
    const oldCounts = new Map();
    previous.forEach(c => { const k = signature(c); oldCounts.set(k, (oldCounts.get(k) || 0) + 1); });
    const inCounts = new Map();
    incoming.forEach(c => { const k = signature(c); inCounts.set(k, (inCounts.get(k) || 0) + 1); });
    const targetCounts = new Map([...oldCounts].map(([k, n]) => [k, Math.max(n, inCounts.get(k) || 0)]));
    for (const [k, n] of inCounts) if (!targetCounts.has(k)) targetCounts.set(k, n);
    const result = [];
    const emitted = new Map();
    for (const c of [...previous, ...incoming]) {
      const k = signature(c), used = emitted.get(k) || 0;
      if (used >= (targetCounts.get(k) || 0)) continue;
      emitted.set(k, used + 1); result.push(c);
    }
    return result;
  }
  return { calculate, isPassed, mergeAttempts };
});
