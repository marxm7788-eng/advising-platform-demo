/* FOS Portal — UI Enhancements (بدون تداخل مع App) */
(function () {
  'use strict';

  // 1) زرار العودة لأعلى الصفحة
  var btn = document.createElement('button');
  btn.id = 'fos-back-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'العودة لأعلى الصفحة');
  btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
  btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(btn); });
  window.addEventListener('scroll', function () {
    btn.classList.toggle('fos-show', window.scrollY > 350);
  }, { passive: true });

  // 2) ظهور البطاقات تدريجياً عند التمرير
  function attachReveals() {
    var targets = document.querySelectorAll('.card, .stat-card, .lp-svc, .academic-import-type');
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('fos-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    targets.forEach(function (t, i) {
      if (!t.classList.contains('fos-reveal')) {
        t.classList.add('fos-reveal');
        t.style.transitionDelay = (Math.min(i, 6) * 45) + 'ms';
        io.observe(t);
      }
    });
  }
  document.addEventListener('DOMContentLoaded', attachReveals);
  window.FOSReveals = attachReveals; // لو التطبيق بيبني المحتوى ديناميكياً

  // 3) عدّادات متحركة للأرقام في كروت الإحصائيات
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.stat-card').forEach(function (card) {
      card.querySelectorAll('div, span').forEach(function (n) {
        var txt = n.textContent.trim().replace(/,/g, '');
        if (/^\d{3,}$/.test(txt) && n.children.length === 0) {
          var target = parseInt(txt, 10);
          var io2 = new IntersectionObserver(function (en) {
            if (!en[0].isIntersecting) return;
            io2.disconnect();
            var start = null;
            function step(ts) {
              if (!start) start = ts;
              var p = Math.min((ts - start) / 900, 1);
              n.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString('en');
              if (p < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
          });
          io2.observe(n);
        }
      });
    });
  });
})();
