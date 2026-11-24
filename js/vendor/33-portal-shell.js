/* Shared portal shell: accessible navigation, live Gregorian clock, theme and truthful storage status. */
(function () {
  'use strict';

  const THEME_KEY = 'fos_ui_theme_v1';
  let clockTimer = null;
  let initialized = false;
  const byId = id => document.getElementById(id);
  const isMobile = () => !!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);

  function updateMenuLabel(expanded) {
    const menu = byId('menu-btn');
    if (!menu) return;
    menu.setAttribute('aria-expanded', String(expanded));
    menu.setAttribute('aria-label', expanded ? 'طي قائمة التنقل' : 'فتح قائمة التنقل');
    menu.title = expanded ? 'طي قائمة التنقل' : 'فتح قائمة التنقل';
  }

  function closeSidebar() {
    const sidebar = byId('sidebar');
    const shell = document.querySelector('.app-shell');
    const backdrop = byId('sidebar-backdrop');
    if (isMobile()) {
      sidebar?.classList.remove('open');
      if (backdrop) backdrop.hidden = true;
      updateMenuLabel(false);
    } else if (shell?.classList.contains('sidebar-collapsed')) {
      updateMenuLabel(false);
    } else {
      updateMenuLabel(true);
    }
  }

  function toggleSidebar() {
    const sidebar = byId('sidebar');
    const shell = document.querySelector('.app-shell');
    const backdrop = byId('sidebar-backdrop');
    if (!sidebar || !shell) return;
    if (isMobile()) {
      const opened = sidebar.classList.toggle('open');
      if (backdrop) backdrop.hidden = !opened;
      updateMenuLabel(opened);
    } else {
      const collapsed = shell.classList.toggle('sidebar-collapsed');
      updateMenuLabel(!collapsed);
    }
  }

  function onNavigate(viewId) {
    const pages = (window.FOS_RBAC && window.FOS_RBAC.pages) || [];
    const page = pages.find(item => item.id === viewId);
    const title = page?.label || (window.App && App.getViewTitle(viewId)) || 'مساحة العمل';
    const heading = byId('topbar-title');
    if (heading) heading.textContent = title;
    const nav = byId('sidebar-nav');
    nav?.querySelectorAll('.nav-item').forEach(item => item.setAttribute('aria-current', item.dataset.view === viewId ? 'page' : 'false'));
    if (isMobile()) closeSidebar();
  }

  function updateEnvironment() {
    if (!window.App || typeof App.getEnvironmentStatus !== 'function') return;
    if (window.FOS_SHOW_ENVIRONMENT_STATUS === false) {
      ['app-environment-notice', 'landing-environment-notice', 'auth-environment-notice', 'app-environment-pill'].forEach(id => {
        const el = byId(id);
        if (el) el.hidden = true;
      });
      return;
    }
    const status = App.getEnvironmentStatus();
    const text = status.isLocal
      ? 'نسخة على هذا الجهاز فقط — لا يوجد تزامن مع الطلاب أو العميد؛ استخدم بيانات اختبار حتى تفعيل الخادم الرسمي.'
      : status.isOnline
        ? 'الاتصال بالخادم نشط — يلزم اعتماد المصادقة والصلاحيات قبل استخدام بيانات رسمية.'
        : 'الخادم غير متصل — لا توجد مزامنة سحابية للبيانات حاليًا.';
    ['app-environment-notice', 'landing-environment-notice', 'auth-environment-notice'].forEach(id => {
      const el = byId(id);
      if (!el) return;
      el.textContent = text;
      el.dataset.mode = status.isLocal ? 'local' : status.isOnline ? 'online' : 'offline';
      el.hidden = false;
    });
    const pill = byId('app-environment-pill');
    if (pill) {
      pill.textContent = status.isLocal ? 'نسخة محلية' : status.isOnline ? 'متصل' : 'غير متصل';
      pill.dataset.mode = status.isLocal ? 'local' : status.isOnline ? 'online' : 'offline';
      pill.title = text;
    }
  }

  function updateClock() {
    const dateEl = byId('portal-clock-date');
    const timeEl = byId('portal-clock-time');
    if (!dateEl || !timeEl) return;
    const now = new Date();
    try {
      const fullDate = new Intl.DateTimeFormat('ar-EG-u-ca-gregory', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo'
      }).format(now);
      const compactDate = new Intl.DateTimeFormat('ar-EG-u-ca-gregory', {
        day: 'numeric', month: 'short', timeZone: 'Africa/Cairo'
      }).format(now);
      const compact = window.matchMedia && window.matchMedia('(max-width: 560px)').matches;
      dateEl.textContent = compact ? compactDate : fullDate;
      dateEl.title = fullDate;
      dateEl.setAttribute('aria-label', `التاريخ ${fullDate}`);
      timeEl.textContent = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Africa/Cairo'
      }).format(now);
    } catch (_) {
      dateEl.textContent = now.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' });
      timeEl.textContent = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Africa/Cairo' });
    }
    timeEl.dateTime = now.toISOString();
  }

  function applyTheme(theme, persist) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    if (persist) {
      try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    }
    const buttons = document.querySelectorAll('#theme-toggle, #theme-toggle-app');
    if (buttons.length) {
      const dark = next === 'dark';
      const label = dark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن';
      buttons.forEach(button => {
        const icon = button.querySelector('i');
        if (icon) {
          icon.className = `fas ${dark ? 'fa-sun' : 'fa-moon'} theme-toggle-icon`;
          icon.classList.remove('theme-icon-enter');
          void icon.offsetWidth;
          icon.classList.add('theme-icon-enter');
        }
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(dark));
        button.title = label;
        const text = button.querySelector('.sr-only');
        if (text) text.textContent = label;
      });
    }
  }

  function initTheme() {
    let saved = '';
    try { saved = localStorage.getItem(THEME_KEY) || ''; } catch (_) {}
    applyTheme(saved === 'dark' ? 'dark' : 'light', false);
    document.querySelectorAll('#theme-toggle, #theme-toggle-app').forEach(button => {
      button.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark', true);
      });
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    const menu = byId('menu-btn');
    menu?.addEventListener('click', toggleSidebar);
    byId('sidebar-backdrop')?.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && isMobile()) closeSidebar();
    });
    window.addEventListener('resize', () => {
      const sidebar = byId('sidebar');
      const shell = document.querySelector('.app-shell');
      const backdrop = byId('sidebar-backdrop');
      if (!isMobile()) {
        sidebar?.classList.remove('open');
        shell?.classList.remove('sidebar-collapsed');
        if (backdrop) backdrop.hidden = true;
        updateMenuLabel(true);
      } else {
        shell?.classList.remove('sidebar-collapsed');
        sidebar?.classList.remove('open');
        if (backdrop) backdrop.hidden = true;
        updateMenuLabel(false);
      }
    });
    initTheme();
    updateMenuLabel(!isMobile());
    updateClock();
    if (!clockTimer) clockTimer = window.setInterval(updateClock, 1000);
    const syncAppState = () => {
      if (!window.App) return false;
      updateEnvironment();
      onNavigate(App.getCurrentView() || (App.getCurrentUser() ? App.defaultView() : ''));
      return true;
    };
    if (!syncAppState()) window.setTimeout(syncAppState, 0);
  }

  window.PortalShell = { init, onNavigate, updateEnvironment, updateClock, applyTheme, toggleSidebar, closeSidebar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
