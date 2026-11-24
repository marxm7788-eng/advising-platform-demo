/**
 * Static catalogs — NOT business data
 * Roles live in LocalStore as editable records (except admin is_system)
 */
window.FOS_CATALOG = {
  pages: [
    { id: 'student-dashboard', label: 'الرئيسية (طالب)', group: 'طالب', permission: null },
    { id: 'student-profile', label: 'بياناتي', group: 'عام', permission: null },
    { id: 'study-plan', label: 'الخطط الدراسية', group: 'عام', permission: 'academic.view' },
    { id: 'gpa-calc', label: 'حاسبة المعدل', group: 'طالب', permission: null },
    { id: 'forms-list', label: 'النماذج', group: 'طالب', permission: 'forms.view' },
    { id: 'form-fill', label: 'تعبئة نموذج', group: 'طالب', permission: 'applications.create' },
    { id: 'my-requests', label: 'طلباتي', group: 'طالب', permission: 'applications.view' },
    { id: 'request-detail', label: 'تفاصيل طلب', group: 'عام', permission: 'applications.view' },
    { id: 'services', label: 'خدمات إلكترونية', group: 'طالب', permission: null },
    { id: 'notifications', label: 'الإشعارات', group: 'عام', permission: 'notifications.view' },
    { id: 'staff-inbox', label: 'صندوق الطلبات', group: 'موظف', permission: 'applications.review' },
    { id: 'students-search', label: 'البحث عن طالب', group: 'موظف', permission: 'students.search' },
    { id: 'students-mgmt', label: 'إدارة الطلاب', group: 'إدارة', permission: 'students.view' },
    { id: 'dean-dashboard', label: 'لوحة عامة', group: 'إدارة', permission: 'reports.view' },
    { id: 'periods', label: 'الفترات', group: 'إدارة', permission: 'periods.manage' },
    { id: 'assignments', label: 'إسناد المرشدين', group: 'إدارة', permission: 'assignments.view' },
    { id: 'users-mgmt', label: 'المستخدمون', group: 'إدارة', permission: 'users.view' },
    { id: 'roles-mgmt', label: 'الأدوار والصلاحيات', group: 'إدارة', permission: 'roles.view' },
    { id: 'imports', label: 'رفع البيانات الأكاديمية', group: 'إدارة', permission: 'users.create' },
    { id: 'export-print', label: 'تصدير وطباعة', group: 'موظف', permission: 'reports.export' },
    { id: 'audit-logs', label: 'سجل التدقيق', group: 'إدارة', permission: 'audit_logs.view' }
  ],

  permissionGroups: [
    { id: 'students', label: 'الطلاب', perms: [
      { code: 'students.view', label: 'عرض' },
      { code: 'students.create', label: 'إنشاء' },
      { code: 'students.edit', label: 'تعديل' },
      { code: 'students.search', label: 'بحث' }
    ]},
    { id: 'applications', label: 'الطلبات', perms: [
      { code: 'applications.view', label: 'عرض' },
      { code: 'applications.create', label: 'تقديم' },
      { code: 'applications.review', label: 'مراجعة' },
      { code: 'applications.approve', label: 'اعتماد' },
      { code: 'applications.reject', label: 'رفض' },
      { code: 'applications.execute', label: 'تنفيذ' }
    ]},
    { id: 'forms', label: 'النماذج', perms: [
      { code: 'forms.view', label: 'عرض' },
      { code: 'forms.edit', label: 'تعديل' },
      { code: 'periods.manage', label: 'الفترات' }
    ]},
    { id: 'workflow', label: 'المسارات', perms: [
      { code: 'workflows.view', label: 'عرض' },
      { code: 'workflows.edit', label: 'تعديل' }
    ]},
    { id: 'assignments', label: 'الإسناد', perms: [
      { code: 'assignments.view', label: 'عرض' },
      { code: 'assignments.create', label: 'إنشاء' },
      { code: 'assignments.edit', label: 'تعديل' }
    ]},
    { id: 'users', label: 'المستخدمون', perms: [
      { code: 'users.view', label: 'عرض' },
      { code: 'users.create', label: 'إنشاء' },
      { code: 'users.edit', label: 'تعديل' },
      { code: 'users.disable', label: 'تعطيل' }
    ]},
    { id: 'roles', label: 'الأدوار', perms: [
      { code: 'roles.view', label: 'عرض' },
      { code: 'roles.create', label: 'إنشاء' },
      { code: 'roles.edit', label: 'تعديل' },
      { code: 'roles.delete', label: 'حذف' }
    ]},
    { id: 'academic', label: 'أكاديمي', perms: [
      { code: 'academic.view', label: 'عرض' },
      { code: 'academic.edit', label: 'تعديل' }
    ]},
    { id: 'reports', label: 'تقارير', perms: [
      { code: 'reports.view', label: 'عرض' },
      { code: 'reports.export', label: 'تصدير' }
    ]},
    { id: 'notifications', label: 'إشعارات', perms: [
      { code: 'notifications.view', label: 'عرض' },
      { code: 'notifications.send', label: 'إرسال' }
    ]},
    { id: 'content', label: 'محتوى', perms: [
      { code: 'content.view', label: 'عرض' },
      { code: 'content.edit', label: 'تعديل' }
    ]},
    { id: 'system', label: 'نظام', perms: [
      { code: 'audit_logs.view', label: 'سجل التدقيق' }
    ]}
  ],

  /** Demo role seeds — loaded into LocalStore once; only admin is_system */
  demoRoleSeeds: [
    { code: 'admin', name_ar: 'مدير النظام', is_system: true, is_active: true, permissions: ['*'], pages: null },
    { code: 'student', name_ar: 'طالب', is_system: false, is_active: true,
      permissions: ['applications.create','applications.view','forms.view','academic.view','notifications.view'],
      pages: ['student-dashboard','student-profile','study-plan','gpa-calc','forms-list','my-requests','services','settings','notifications'] },
    { code: 'advisor', name_ar: 'مرشد أكاديمي', is_system: false, is_active: true,
      permissions: ['students.view','students.search','applications.view','applications.review','applications.approve','applications.reject','assignments.view','notifications.view'],
      pages: ['staff-inbox','students-search','settings','notifications'] },
    { code: 'coordinator', name_ar: 'منسق', is_system: false, is_active: true,
      permissions: ['students.view','applications.view','applications.review','applications.approve','applications.reject','notifications.view'],
      pages: ['staff-inbox','students-search','settings','notifications'] },
    { code: 'manager', name_ar: 'مدير الوحدة', is_system: false, is_active: true,
      permissions: ['students.view','applications.view','applications.approve','applications.reject','periods.manage','notifications.view'],
      pages: ['staff-inbox','periods','settings','notifications'] },
    { code: 'affairs', name_ar: 'شؤون الطلاب', is_system: false, is_active: true,
      permissions: ['students.view','applications.view','applications.execute','reports.export','notifications.view'],
      pages: ['staff-inbox','export-print','settings','notifications'] },
    { code: 'dean', name_ar: 'عميد', is_system: false, is_active: true,
      permissions: ['students.view','applications.view','reports.view','content.view','notifications.view'],
      pages: ['dean-dashboard','students-search','settings','notifications'] },
    { code: 'vice', name_ar: 'وكيل', is_system: false, is_active: true,
      permissions: ['students.view','applications.view','applications.approve','reports.view','notifications.view'],
      pages: ['staff-inbox','dean-dashboard','settings','notifications'] }
  ]
};

/* توافق مؤقت مع كود قديم يقرأ FOS_RBAC */
window.FOS_RBAC = {
  pages: window.FOS_CATALOG.pages,
  actions: window.FOS_CATALOG.permissionGroups.reduce(function (acc, g) {
    return acc.concat(g.perms.map(function (p) { return { id: p.code, label: p.label }; }));
  }, []),
  defaultRoles: window.FOS_CATALOG.demoRoleSeeds.map(function (r) {
    return {
      id: r.code,
      nameAr: r.name_ar,
      system: !!r.is_system,
      color: '#64748b',
      pages: r.pages || [],
      actions: (r.permissions || []).reduce(function (o, c) { o[c] = true; return o; }, {})
    };
  })
};
