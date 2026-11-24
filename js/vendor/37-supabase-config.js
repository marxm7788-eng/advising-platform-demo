/* إعداد هذه الحزمة: تشغيل محلي بالكامل على جهاز واحد. لا يوجد اتصال سحابي مفعّل. */
window.FOS_MODE = window.FOS_BACKEND_URL ? 'server' : 'local';
window.FOS_LOCAL_ONLY_BUNDLE = !window.FOS_BACKEND_URL;
/* معاينة واجهة نظيفة فقط؛ لا يغيّر التخزين أو المصادقة أو حالة الاتصال. */
window.FOS_SHOW_ENVIRONMENT_STATUS = false;
window.SUPABASE_URL = '';
window.SUPABASE_ANON_KEY = '';
