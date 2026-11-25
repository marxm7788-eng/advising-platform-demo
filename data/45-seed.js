/**
 * Faculty of Science — Sohag University
 * Official structure & forms derived from college website extraction (Oct 2026)
 * Source: sci.sohag-univ.edu.eg — وحدة الإرشاد الأكاديمي والخدمات الطلابية + شؤون الطلاب
 */
window.FOS_SEED = {
  faculty: {
    nameAr: 'كلية العلوم',
    nameEn: 'Faculty of Science',
    universityAr: 'جامعة سوهاج',
    universityEn: 'Sohag University',
    established: 1975,
    unitAr: 'وحدة الإرشاد الأكاديمي والخدمات الطلابية',
    address: 'كلية العلوم جامعة سوهاج – مدينة ناصر',
    phone: '0020934570000',
    email: 'dean@science.sohag.edu.eg',
    zadUrl: 'http://zadsci.sohag-univ.edu.eg/Zad.aspx'
  },

  org: {
    dean: 'أ.د. حازم محمود علي المشنب',
    vice: 'أ.د. مصطفى جمال الدين طه رضوان',
    unitManager: 'أ.م.د. صفا محمد محمود',
    unitTeam: [
      { name: 'د. ولاء مجدي عبد السميع', dept: 'علم الحيوان' },
      { name: 'د. أحمد رشدي ثابت', dept: 'علم الحيوان' },
      { name: 'د. هيثم بكري مهني', dept: 'الرياضيات' },
      { name: 'د. ولاء عادل الحامدي', dept: 'الكيمياء' },
      { name: 'د. أماني حامد محمد', dept: 'الكيمياء' },
      { name: 'د. حسام الدين عادل جابر', dept: 'الجيولوجيا' },
      { name: 'د. ياسمين علي طايع', dept: 'الفيزياء' },
      { name: 'م.م. رندا عادل فتحي', dept: 'النبات والميكروبيولوجي' },
      { name: 'م. عبد الباسط محمد أحمد', dept: 'الكيمياء' },
      { name: 'م. طه عدنان أبو الوفا', dept: 'علم الحيوان' },
      { name: 'م. سيف الدين عصمت أحمد', dept: 'الجيولوجيا' }
    ],
    coordinators: [
      { dept: 'math', name: 'أ.م.د. حسين عبد الصابور أحمد' },
      { dept: 'phys', name: 'أ.م.د. محمد حماد محمد فاوى' },
      { dept: 'chem', name: 'أ.م.د. إيمان عبد الله' },
      { dept: 'bot', name: 'أ.م.د. مروة عبد الكريم' },
      { dept: 'zoo', name: 'د. أمال مختار' },
      { dept: 'geo', name: 'أ.د. محمد عاطف السيد' }
    ],
    adminStaff: [
      { role: 'ممثل شئون الطلاب', name: 'أ. صفاء فتحي مرسي' },
      { role: 'ممثل رعاية الشباب', name: 'أ. مبارك صبري' },
      { role: 'ممثل وحدة ضمان الجودة', name: 'أ. رندا عبد الحميد' },
      { role: 'ممثل وحدة الخدمات الإلكترونية', name: 'م. مي محمود صالح' },
      { role: 'سكرتارية الوحدة', name: 'أ. دانية مصطفى كامل' }
    ]
  },

  departments: [
    { id: 'math', nameAr: 'الرياضيات', nameEn: 'Mathematics', section: 'physical' },
    { id: 'phys', nameAr: 'الفيزياء', nameEn: 'Physics', section: 'physical' },
    { id: 'chem', nameAr: 'الكيمياء', nameEn: 'Chemistry', section: 'physical' },
    { id: 'zoo', nameAr: 'علم الحيوان', nameEn: 'Zoology', section: 'biological' },
    { id: 'bot', nameAr: 'النبات والميكروبيولوجي', nameEn: 'Botany & Microbiology', section: 'biological' },
    { id: 'geo', nameAr: 'الجيولوجيا', nameEn: 'Geology', section: 'geological' }
  ],

  sections: [
    { id: 'biological', nameAr: 'قسم العلوم البيولوجية' },
    { id: 'physical', nameAr: 'قسم العلوم الفيزيائية' },
    { id: 'geological', nameAr: 'قسم العلوم الجيولوجية' }
  ],

  programs: [
    /* برامج عامة — القسم الفيزيائي */
    { id: 'برنامج الرياضيات', dept: 'math', nameAr: 'برنامج الرياضيات', type: 'general', section: 'physical' },
    { id: 'برنامج الفيزياء', dept: 'phys', nameAr: 'برنامج الفيزياء', type: 'general', section: 'physical' },
    { id: 'برنامج الكيمياء', dept: 'chem', nameAr: 'برنامج الكيمياء', type: 'general', section: 'physical' },
    /* برامج عامة — القسم البيولوجي */
    { id: 'برنامج الميكروبيولوجي والكيمياء', dept: 'bot', nameAr: 'برنامج الميكروبيولوجي والكيمياء', type: 'general', section: 'biological' },
    { id: 'برنامج النبات والكيمياء', dept: 'bot', nameAr: 'برنامج النبات والكيمياء', type: 'general', section: 'biological' },
    { id: 'برنامج علم الحيوان والكيمياء', dept: 'zoo', nameAr: 'برنامج علم الحيوان والكيمياء', type: 'general', section: 'biological' },
    /* برامج عامة — القسم الجيولوجي */
    { id: 'برنامج الجيولوجيا', dept: 'geo', nameAr: 'برنامج الجيولوجيا', type: 'general', section: 'geological' },
    { id: 'برنامج الجيولوجيا والكيمياء', dept: 'geo', nameAr: 'برنامج الجيولوجيا والكيمياء', type: 'general', section: 'geological' },
    { id: 'برنامج الجيوفيزياء', dept: 'geo', nameAr: 'برنامج الجيوفيزياء', type: 'general', section: 'geological' },
    /* برامج خاصة */
    { id: 'برنامج الكيمياء الحيوية', dept: 'chem', nameAr: 'برنامج الكيمياء الحيوية', type: 'special', section: 'special' },
    { id: 'برنامج الجيولوجيا الهندسية ومواد البناء', dept: 'geo', nameAr: 'برنامج الجيولوجيا الهندسية ومواد البناء', type: 'special', section: 'special' },
    { id: 'برنامج الفيزياء الحيوية الطبية', dept: 'phys', nameAr: 'برنامج الفيزياء الحيوية الطبية', type: 'special', section: 'special' },
    { id: 'برنامج البيولوجيا الجزيئية والطفيليات', dept: 'zoo', nameAr: 'برنامج البيولوجيا الجزيئية والطفيليات', type: 'special', section: 'special' },
    { id: 'برنامج التكنولوجيا الحيوية الجزيئية', dept: 'bot', nameAr: 'برنامج التكنولوجيا الحيوية الجزيئية', type: 'special', section: 'special' },
    { id: 'برنامج الإحصاء الرياضي والبرمجة', dept: 'math', nameAr: 'برنامج الإحصاء الرياضي والبرمجة', type: 'special', section: 'special' }
  ],

  levels: ['المستوى الأول', 'المستوى الثاني', 'المستوى الثالث', 'المستوى الرابع'],

  /* GPA < 2 = متعثر (official definition from college bylaws) */
  atRiskGPA: 2.0,

  gradeScale: [
    { letter: 'A+', min: 95, points: 4.000 },
    { letter: 'A', min: 90, points: 3.667 },
    { letter: 'B+', min: 85, points: 3.333 },
    { letter: 'B', min: 80, points: 3.000 },
    { letter: 'C+', min: 75, points: 2.667 },
    { letter: 'C', min: 70, points: 2.333 },
    { letter: 'D', min: 60, points: 2.000 },
    { letter: 'F', min: 1, points: 0.000 },
    { letter: 'رل', min: 0, points: 0.000 }
  ],

  courses: [], /* المقررات من study-plans.js الرسمية */

  /**
   * Official forms from وحدة الإرشاد + شؤون الطلاب
   * category: advising | affairs | exams
   */
  formTypes: [
    { id: 'adddrop', nameAr: 'حذف وإضافة مقررات', category: 'advising', desc: 'حتى نهاية الأسبوع الرابع (أو الثاني صيفي)', icon: 'fa-exchange-alt', color: '#059669', needsCourses: true, needsTranscript: true },
    { id: 'concurrent', nameAr: 'تسجيل المقررات الدراسية المتزامنة', category: 'advising', desc: 'بعد التسجيل على المنصة الإلكترونية', icon: 'fa-link', color: '#7c3aed', needsCourses: true, needsTranscript: false },
    { id: 'increase', nameAr: 'زيادة العبء الدراسي', category: 'advising', desc: 'وفق ضوابط المعدل والساعات ومتطلبات التخرج', icon: 'fa-plus-circle', color: '#2563eb', needsCourses: true, needsTranscript: false },
    { id: 'gpa', nameAr: 'تحسين المعدل الأكاديمي', category: 'advising', desc: 'إعادة تسجيل مقررات وفق ضوابط تحسين المعدل', icon: 'fa-chart-line', color: '#0d9488', needsCourses: true, needsTranscript: false }
  ],

  workflow: [
    { key: 'advisor', role: 'advisor', label: 'المرشد الأكاديمي' },
    { key: 'coordinator', role: 'coordinator', label: 'منسق الإرشاد بالقسم' },
    { key: 'manager', role: 'manager', label: 'مدير وحدة الإرشاد' },
    { key: 'vice', role: 'vice', label: 'وكيل الكلية' },
    { key: 'dean', role: 'dean', label: 'العميد' }
  ],

  services: [
    { id: 'zad', title: 'منصة زاد', desc: 'التسجيل الإلكتروني وسداد الرسوم والتشعيب', url: 'http://zadsci.sohag-univ.edu.eg/Zad.aspx', icon: 'fa-laptop' },
    { id: 'guides', title: 'دليل الطالب', desc: 'دليل الطالب 2023/2024 ودليل الإجراءات', icon: 'fa-book' },
    { id: 'office_hours', title: 'الساعات المكتبية', desc: 'مواعيد المرشدين الأكاديميين', icon: 'fa-clock' },
    { id: 'at_risk', title: 'رعاية المتعثرين', desc: 'آليات متابعة الطلاب ذوي المعدل أقل من 2', icon: 'fa-hands-helping' },
    { id: 'special_needs', title: 'ذوو الاحتياجات الخاصة', desc: 'خدمات دعم الطلاب من ذوي الإعاقة', icon: 'fa-wheelchair' },
    { id: 'union', title: 'اتحاد الطلاب', desc: 'الأنشطة الطلابية ورعاية الشباب', icon: 'fa-users' }
  ],

  /* حسابات الدخول لا تُوضع هنا لأسباب أمنية.
     في الوضع المحلي فقط يُنشأ حساب admin عبر ensureSeed في app.js
     أما الإنتاج فيعتمد على Supabase Auth / جدول profiles */
  users: [],

  assignments: { '2023001': 'advisor1', '2023002': 'advisor2' },

  periods: Object.fromEntries(['adddrop','concurrent','increase','gpa'].map(k => [k, true])),

  announcements: [
    { id: 1, title: 'فتح باب التسجيل للفصل الدراسي', date: '2025-09-01', body: 'يبدأ التسجيل الإلكتروني عبر منصة زاد. راجع مرشدك الأكاديمي قبل التسجيل.' },
    { id: 2, title: 'آخر موعد لحذف وإضافة المقررات', date: '2025-10-01', body: 'ينتهي الأسبوع الرابع وفق لائحة الساعات المعتمدة.' },
    { id: 3, title: 'تعريف الطالب المتعثر', date: '2025-09-15', body: 'الطالب المتعثر: معدله التراكمي أقل من 2، أو رسوب بمقرر فأكثر. تواصل مع وحدة الإرشاد.' }
  ],

  siteContent: {
    heroTitle: 'وحدة الإرشاد الأكاديمي والخدمات الطلابية',
    heroSubtitle: 'كلية العلوم — جامعة سوهاج',
    heroDesc: 'الذراع الداعمة لمسيرتكم العلمية — شركاء نجاحكم خطوة بخطوة',
    portalTitle: 'المنصة الرقمية لكلية العلوم',
    portalSub: 'جامعة سوهاج',
    portalDesc: 'خدمات إلكترونية للإرشاد الأكاديمي وشؤون الطلاب'
  }
};
