/**
 * RBAC — Roles & Permissions Catalog
 * Faculty of Science Digital Platform
 */
window.FOS_RBAC = {
  /* صفحات النظام */
  pages: [
    { id: 'student-dashboard', label: 'القائمة الرئيسية (طالب)', group: 'طالب' },
    { id: 'student-profile', label: 'بياناتي', group: 'عام' },
    { id: 'study-plan', label: 'الخطط الدراسية', group: 'طالب' },
    { id: 'gpa-calc', label: 'حاسبة المعدل', group: 'طالب' },
    { id: 'talent-program', label: 'برنامج دعم الموهوبين', group: 'طالب' },
    { id: 'forms-list', label: 'النماذج والطلبات', group: 'طالب' },
    { id: 'my-requests', label: 'طلباتي', group: 'طالب' },
    { id: 'services', label: 'خدمات إلكترونية', group: 'طالب' },
    { id: 'student-voice', label: 'صوت الطالب', group: 'طالب' },
    { id: 'conversations', label: 'المحادثات', group: 'عام' },
    { id: 'support-cases', label: 'دعم المتعثرين', group: 'إدارة' },
    { id: 'voice-dean', label: 'استمع للطلاب', group: 'إدارة' },
    { id: 'notifications', label: 'الإشعارات', group: 'عام' },
    { id: 'staff-inbox', label: 'صندوق الطلبات', group: 'موظف' },
    { id: 'students-search', label: 'البحث عن طالب', group: 'موظف' },
    { id: 'students-mgmt', label: 'إدارة الطلاب', group: 'إدارة' },
    { id: 'dean-dashboard', label: 'لوحة العميد', group: 'إدارة' },
    { id: 'periods', label: 'الفترات الأكاديمية', group: 'إدارة' },
    { id: 'assignments', label: 'إسناد المرشدين', group: 'إدارة' },
    { id: 'imports', label: 'رفع البيانات الأكاديمية', group: 'إدارة' },
    { id: 'local-backup', label: 'نسخ البيانات واستعادتها', group: 'إدارة' },
    { id: 'voice-admin', label: 'إدارة صوت الطالب', group: 'إدارة' },
    { id: 'users-mgmt', label: 'المستخدمون', group: 'إدارة' },
    { id: 'roles-mgmt', label: 'إدارة الأدوار', group: 'إدارة' },
    { id: 'talent-admin', label: 'إدارة دعم الموهوبين', group: 'إدارة' },
    { id: 'faculty-management', label: 'أعضاء هيئة التدريس', group: 'إدارة' },
    { id: 'export-print', label: 'تصدير وطباعة', group: 'موظف' }
  ],

  /* صلاحيات الإجراءات */
  actions: [
    { id: 'students.view', label: 'مشاهدة الطلاب' },
    { id: 'students.edit', label: 'تعديل بيانات الطلاب' },
    { id: 'students.create', label: 'إضافة طلاب' },
    { id: 'requests.view', label: 'مشاهدة الطلبات' },
    { id: 'requests.approve', label: 'اعتماد الطلبات' },
    { id: 'requests.reject', label: 'رفض الطلبات' },
    { id: 'requests.delete', label: 'حذف الطلبات' },
    { id: 'forms.submit', label: 'تقديم النماذج' },
    { id: 'export.pdf', label: 'تصدير PDF / طباعة' },
    { id: 'users.manage', label: 'إدارة المستخدمين' },
    { id: 'roles.manage', label: 'إدارة الأدوار والصلاحيات' },
    { id: 'periods.manage', label: 'فتح/إغلاق الفترات' },
    { id: 'assignments.manage', label: 'إسناد المرشدين' }
  ],

  /* أدوار افتراضية */
  defaultRoles: [
    {
      id: 'student',
      nameAr: 'طالب',
      system: true,
      color: '#0d9488',
      pages: ['student-dashboard','student-profile','study-plan','talent-program','forms-list','my-requests','services','student-voice','conversations','notifications'],
      actions: {
        'forms.submit': true, 'requests.view': true,
        'students.view': false, 'students.edit': false, 'students.create': false,
        'requests.approve': false, 'requests.reject': false, 'requests.delete': false,
        'export.pdf': false, 'users.manage': false, 'roles.manage': false,
        'periods.manage': false, 'assignments.manage': false
      }
    },
    {
      id: 'advisor',
      nameAr: 'مرشد أكاديمي',
      system: true,
      color: '#2563eb',
      pages: ['staff-inbox','students-search','support-cases','conversations','notifications'],
      actions: {
        'students.view': true, 'students.edit': false, 'students.create': false,
        'requests.view': true, 'requests.approve': true, 'requests.reject': true, 'requests.delete': false,
        'forms.submit': false, 'export.pdf': false,
        'users.manage': false, 'roles.manage': false,
        'periods.manage': false, 'assignments.manage': false
      }
    },
    {
      id: 'coordinator',
      nameAr: 'منسق الإرشاد بالقسم',
      system: true,
      color: '#7c3aed',
      pages: ['staff-inbox','students-search','support-cases','conversations','notifications'],
      actions: {
        'students.view': true, 'students.edit': false, 'students.create': false,
        'requests.view': true, 'requests.approve': true, 'requests.reject': true, 'requests.delete': false,
        'forms.submit': false, 'export.pdf': false,
        'users.manage': false, 'roles.manage': false,
        'periods.manage': false, 'assignments.manage': false
      }
    },
    {
      id: 'manager',
      nameAr: 'مدير وحدة الإرشاد',
      system: true,
      color: '#ea580c',
      pages: ['staff-inbox','students-search','students-mgmt','support-cases','conversations','periods','assignments','notifications'],
      actions: {
        'students.view': true, 'students.edit': true, 'students.create': false,
        'requests.view': true, 'requests.approve': true, 'requests.reject': true, 'requests.delete': false,
        'forms.submit': false, 'export.pdf': true,
        'users.manage': false, 'roles.manage': false,
        'periods.manage': true, 'assignments.manage': true
      }
    },
    {
      id: 'vice',
      nameAr: 'وكيل الكلية لشؤون التعليم والطلاب',
      system: true,
      color: '#be185d',
      pages: ['staff-inbox','students-search','students-mgmt','support-cases','conversations','dean-dashboard','periods','notifications'],
      actions: {
        'students.view': true, 'students.edit': true, 'students.create': false,
        'requests.view': true, 'requests.approve': true, 'requests.reject': true, 'requests.delete': false,
        'forms.submit': false, 'export.pdf': true,
        'users.manage': false, 'roles.manage': false,
        'periods.manage': true, 'assignments.manage': false
      }
    },
    {
      id: 'affairs',
      nameAr: 'شؤون الطلاب',
      system: true,
      color: '#0891b2',
      pages: ['staff-inbox','students-search','support-cases','conversations','export-print','notifications'],
      actions: {
        'students.view': true, 'students.edit': false, 'students.create': false,
        'requests.view': true, 'requests.approve': true, 'requests.reject': true, 'requests.delete': false,
        'forms.submit': false, 'export.pdf': true,
        'users.manage': false, 'roles.manage': false,
        'periods.manage': false, 'assignments.manage': false
      }
    },
    {
      id: 'dean',
      nameAr: 'عميد الكلية',
      system: true,
      color: '#0f172a',
      pages: ['dean-dashboard','staff-inbox','students-mgmt','students-search','support-cases','conversations','periods','assignments','voice-dean','notifications'],
      actions: {
        'students.view': true, 'students.edit': true, 'students.create': true,
        'requests.view': true, 'requests.approve': true, 'requests.reject': true, 'requests.delete': true,
        'forms.submit': false, 'export.pdf': true,
        'users.manage': false, 'roles.manage': false,
        'periods.manage': true, 'assignments.manage': true
      }
    },
    {
      id: 'admin',
      nameAr: 'مدير النظام',
      system: true,
      color: '#dc2626',
      pages: ['dean-dashboard','staff-inbox','students-mgmt','students-search','support-cases','conversations','periods','assignments','users-mgmt','roles-mgmt','imports','local-backup','talent-admin','faculty-management','talent-program','voice-dean','voice-admin','student-voice','export-print','study-plan', 'notifications'],
      actions: {
        'students.view': true, 'students.edit': true, 'students.create': true,
        'requests.view': true, 'requests.approve': true, 'requests.reject': true, 'requests.delete': true,
        'forms.submit': true, 'export.pdf': true,
        'users.manage': true, 'roles.manage': true,
        'periods.manage': true, 'assignments.manage': true
      }
    }
  ]
};
