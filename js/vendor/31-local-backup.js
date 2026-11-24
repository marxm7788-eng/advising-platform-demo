(function () {
  'use strict';

  const FORMAT = 'fos-portal-encrypted-backup';
  const VERSION = 1;
  const DB_NAME = 'fos-portal-attachments';
  const STORE_NAME = 'files';
  const PBKDF2_ITERATIONS = 180000;
  const MAX_BACKUP_BYTES = 200 * 1024 * 1024;
  let pendingRestore = null;

  function isDataKey(key) {
    return /^(fos_|fos-)/i.test(String(key || ''));
  }

  function isSessionKey(key) {
    return /(^|[-_])(session|auth|token)([-_.]|$)/i.test(String(key || '')) || /supabase/i.test(String(key || ''));
  }

  function currentFosEntries(includeSession) {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!isDataKey(key) || (!includeSession && isSessionKey(key))) continue;
      entries.push([key, localStorage.getItem(key)]);
    }
    return entries.sort((a, b) => a[0].localeCompare(b[0]));
  }

  function openAttachmentDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('المتصفح لا يدعم قاعدة المرفقات المحلية.'));
      let request;
      try { request = indexedDB.open(DB_NAME, 1); }
      catch (error) { reject(error); return; }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onerror = () => reject(request.error || new Error('تعذر فتح مخزن المرفقات.'));
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function readAttachments() {
    const db = await openAttachmentDb();
    if (!db.objectStoreNames.contains(STORE_NAME)) { db.close(); return []; }
    return new Promise((resolve, reject) => {
      const rows = [];
      let tx;
      try {
        tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          rows.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        };
        request.onerror = () => reject(request.error || new Error('تعذر قراءة المرفقات.'));
        tx.oncomplete = () => { db.close(); resolve(rows); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('تعذر قراءة المرفقات.')); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('أُلغيت قراءة المرفقات.')); };
      } catch (error) { db.close(); reject(error); }
    });
  }

  async function writeAttachments(rows) {
    if (!rows.length && !('indexedDB' in window)) return;
    const db = await openAttachmentDb();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        rows.forEach(row => store.put(row.value, row.key));
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('تعذر استعادة المرفقات.')); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('أُلغيت استعادة المرفقات.')); };
      } catch (error) { db.close(); reject(error); }
    });
  }

  function toBase64(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
    }
    return btoa(binary);
  }

  function fromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function deriveKey(passphrase, salt) {
    if (!window.crypto || !crypto.subtle) throw new Error('التشفير الآمن غير متاح في هذا السياق. شغّل المنصة عبر ملف التشغيل المحلي المرفق.');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function root() { return document.getElementById('local-backup-root'); }
  function setStatus(message, kind) {
    const el = root()?.querySelector('#lb-status');
    if (!el) return;
    el.className = 'lb-status ' + (kind || 'info');
    el.textContent = message;
  }

  function render() {
    const host = root();
    if (!host) return;
    const user = window.App && App.getCurrentUser ? App.getCurrentUser() : null;
    if (!user || user.role !== 'admin') {
      host.innerHTML = '<div class="alert alert-warn">مركز النسخ المحلي متاح لمدير النظام فقط.</div>';
      return;
    }
    pendingRestore = null;
    host.innerHTML = `
      <section class="lb-shell">
        <header class="lb-heading"><span class="lb-mark"><i class="fas fa-box-archive" aria-hidden="true"></i></span><div><span class="lb-kicker">حفظ ونقل آمن</span><h1>نسخ البيانات المحلية واستعادتها</h1><p>انقل بيانات المنصة بين أجهزة الكلية بملف مشفّر، دون إرسالها إلى أي خدمة سحابية.</p></div></header>
        <div class="lb-important" role="note"><i class="fas fa-circle-info" aria-hidden="true"></i><div><b>تنبيه مهم قبل التسليم</b><p>البيانات تُحفظ في متصفح هذا الجهاز، وليس داخل ملفات الفلاشة تلقائيًا. أنشئ نسخة احتياطية مشفّرة، ثم انقل الملف الناتج إلى الفلاشة. الاستعادة على جهاز العميد تنسخ البيانات إلى متصفحه المحلي.</p></div></div>
        <div class="lb-grid">
          <article class="lb-card"><span class="lb-step">١</span><h2>إنشاء نسخة احتياطية مشفّرة</h2><p>تشمل سجلات المنصة ورسائل «صوت الطالب» والاستبيانات والمسودات والمرفقات المحلية. لا تتضمن جلسة الدخول الحالية.</p>
            <label for="lb-export-password">عبارة مرور النسخة</label><input id="lb-export-password" type="password" autocomplete="new-password" minlength="12" placeholder="١٢ حرفًا على الأقل">
            <label for="lb-export-confirm">تأكيد عبارة المرور</label><input id="lb-export-confirm" type="password" autocomplete="new-password" minlength="12" placeholder="أعد كتابة العبارة">
            <button type="button" class="btn btn-primary lb-action" id="lb-export"><i class="fas fa-lock" aria-hidden="true"></i> إنشاء ملف النسخة الاحتياطية</button>
          </article>
          <article class="lb-card"><span class="lb-step">٢</span><h2>استعادة نسخة على هذا الجهاز</h2><p>اختر ملف النسخة وأدخل عبارة المرور. ستُعرض معلوماتها أولًا، ثم تُستبدل البيانات المحلية بعد تأكيد صريح.</p>
            <label for="lb-restore-file">ملف النسخة المشفّر</label><input id="lb-restore-file" type="file" accept=".json,application/json">
            <label for="lb-restore-password">عبارة مرور النسخة</label><input id="lb-restore-password" type="password" autocomplete="current-password" placeholder="العبارة التي استُخدمت عند إنشاء الملف">
            <div id="lb-preview" class="lb-preview hidden" aria-live="polite"></div>
            <button type="button" class="btn btn-outline lb-action" id="lb-restore" disabled><i class="fas fa-rotate-left" aria-hidden="true"></i> استعادة النسخة بعد المراجعة</button>
          </article>
        </div>
        <div id="lb-status" class="lb-status info" role="status" aria-live="polite">تُحفظ النسخة في ملف مشفّر بكلمة مرور تختارها أنت. احتفظ بالعبارة في مكان آمن؛ لا يمكن استعادة الملف دونها.</div>
        <aside class="lb-caution"><b>حدود النسخة المحلية:</b> هذا إصدار تجريبي محلي، وليس قاعدة بيانات مؤسسية أو نظامًا متزامنًا بين الأجهزة. لا تستخدم بيانات طلاب حقيقية أو معلومات حساسة قبل اعتماد ضوابط أمن وخصوصية ومصادقة مناسبة من الجامعة. تشفير ملف النسخة لا يشفّر التخزين الجاري داخل المتصفح.</aside>
      </section>`;
    host.querySelector('#lb-export').addEventListener('click', exportBackup);
    host.querySelector('#lb-restore-file').addEventListener('change', prepareRestore);
    host.querySelector('#lb-restore').addEventListener('click', restoreBackup);
  }

  async function exportBackup() {
    const host = root();
    const password = host?.querySelector('#lb-export-password')?.value || '';
    const confirmation = host?.querySelector('#lb-export-confirm')?.value || '';
    if (password.length < 12) return setStatus('استخدم عبارة مرور من ١٢ حرفًا على الأقل.', 'error');
    if (password !== confirmation) return setStatus('عبارتا المرور غير متطابقتين.', 'error');
    const button = host.querySelector('#lb-export');
    button.disabled = true;
    setStatus('جارٍ تجهيز السجلات والمرفقات وتشفيرها… قد يستغرق ذلك بعض الوقت إذا كانت المرفقات كبيرة.', 'info');
    try {
      const localStorageEntries = currentFosEntries(false);
      const attachments = await readAttachments();
      const payload = {
        application: 'Faculty of Science Portal — Sohag University',
        payloadVersion: VERSION,
        createdAt: new Date().toISOString(),
        localStorage: localStorageEntries,
        attachments
      };
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(password, salt);
      const clear = new TextEncoder().encode(JSON.stringify(payload));
      if (clear.byteLength > MAX_BACKUP_BYTES) throw new Error('حجم البيانات يتجاوز حد الملف المحلي البالغ ٢٠٠ ميجابايت. قلّل المرفقات وأنشئ نسخًا أصغر.');
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, clear);
      const envelope = {
        format: FORMAT,
        version: VERSION,
        cipher: 'AES-GCM-256',
        kdf: 'PBKDF2-SHA-256',
        iterations: PBKDF2_ITERATIONS,
        salt: toBase64(salt),
        iv: toBase64(iv),
        ciphertext: toBase64(encrypted)
      };
      const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'نسخة-بوابة-كلية-العلوم-' + new Date().toISOString().slice(0, 10) + '.fosbackup.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      host.querySelector('#lb-export-password').value = '';
      host.querySelector('#lb-export-confirm').value = '';
      setStatus(`تم إنشاء ملف مشفّر يشمل ${localStorageEntries.length} سجل تخزين و${attachments.length} مرفقًا. انقل الملف الذي نُزّل إلى الفلاشة يدويًا.`, 'success');
    } catch (error) {
      console.error('local backup export failed', error);
      setStatus(error.message || 'تعذر إنشاء النسخة الاحتياطية.', 'error');
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  function validatePayload(payload) {
    if (!payload || payload.application !== 'Faculty of Science Portal — Sohag University' || payload.payloadVersion !== VERSION) {
      throw new Error('محتوى النسخة غير معروف أو إصدارها غير مدعوم.');
    }
    if (!Array.isArray(payload.localStorage) || !Array.isArray(payload.attachments)) throw new Error('بنية ملف النسخة غير مكتملة.');
    const seen = new Set();
    payload.localStorage.forEach(entry => {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string' || !isDataKey(entry[0]) || isSessionKey(entry[0])) {
        throw new Error('تحتوي النسخة على سجل غير صالح.');
      }
      if (seen.has(entry[0])) throw new Error('تحتوي النسخة على مفاتيح تخزين مكررة.');
      seen.add(entry[0]);
    });
    payload.attachments.forEach(item => {
      if (!item || !['string', 'number'].includes(typeof item.key) || typeof item.value !== 'string') throw new Error('تحتوي النسخة على مرفق غير صالح.');
    });
    return payload;
  }

  async function prepareRestore(event) {
    const file = event.target.files && event.target.files[0];
    const host = root();
    const button = host?.querySelector('#lb-restore');
    const preview = host?.querySelector('#lb-preview');
    pendingRestore = null;
    if (button) button.disabled = true;
    if (preview) { preview.textContent = ''; preview.classList.add('hidden'); }
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES * 1.5) return setStatus('حجم الملف أكبر من الحد المسموح (٣٠٠ ميجابايت).', 'error');
    const password = host.querySelector('#lb-restore-password').value;
    if (!password) return setStatus('أدخل عبارة المرور ثم اختر ملف النسخة مرة أخرى.', 'error');
    setStatus('جارٍ فك تشفير الملف والتحقق منه…', 'info');
    try {
      const envelope = JSON.parse(await file.text());
      if (envelope.format !== FORMAT || envelope.version !== VERSION || envelope.cipher !== 'AES-GCM-256' || envelope.kdf !== 'PBKDF2-SHA-256') {
        throw new Error('هذا الملف ليس نسخة صالحة من بوابة كلية العلوم أو أن إصداره غير مدعوم.');
      }
      if (Number(envelope.iterations) !== PBKDF2_ITERATIONS) throw new Error('إعدادات تشفير الملف غير مدعومة.');
      const key = await deriveKey(password, fromBase64(envelope.salt));
      let clear;
      try { clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.ciphertext)); }
      catch (_) { throw new Error('تعذر فتح النسخة. تحقق من عبارة المرور وسلامة الملف.'); }
      const payload = validatePayload(JSON.parse(new TextDecoder().decode(clear)));
      pendingRestore = payload;
      const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
      preview.textContent = `نسخة سليمة · ${new Date(payload.createdAt).toLocaleString('ar-EG')} · ${payload.localStorage.length.toLocaleString('ar-EG')} سجل تخزين · ${payload.attachments.length.toLocaleString('ar-EG')} مرفق · نحو ${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت. الاستعادة ستحذف بيانات المنصة الحالية من هذا المتصفح وتستبدلها بمحتوى النسخة.`;
      preview.classList.remove('hidden');
      button.disabled = false;
      setStatus('تم فك التشفير بنجاح. راجع ملخص النسخة ثم اضغط الاستعادة عند التأكد.', 'success');
    } catch (error) {
      console.warn('local backup restore validation failed', error);
      setStatus(error.message || 'تعذر قراءة النسخة الاحتياطية.', 'error');
    }
  }

  async function restoreBackup() {
    if (!pendingRestore) return setStatus('افحص ملف النسخة أولًا.', 'error');
    if (!window.confirm('سيتم استبدال بيانات المنصة المحلية الحالية بالنسخة المختارة، بما فيها الرسائل والاستبيانات والمرفقات. لن تُستعاد جلسة الدخول؛ ستحتاج إلى تسجيل الدخول مجددًا. هل تريد المتابعة؟')) return;
    const button = root()?.querySelector('#lb-restore');
    if (button) button.disabled = true;
    setStatus('جارٍ حفظ حالة التراجع ثم استعادة البيانات… لا تغلق الصفحة.', 'info');
    let oldStorage, oldAttachments;
    try {
      oldStorage = currentFosEntries(true);
      oldAttachments = await readAttachments();
      const allKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (isDataKey(key)) allKeys.push(key);
      }
      allKeys.forEach(key => localStorage.removeItem(key));
      pendingRestore.localStorage.forEach(([key, value]) => localStorage.setItem(key, value));
      await writeAttachments(pendingRestore.attachments);
      pendingRestore = null;
      setStatus('اكتملت الاستعادة. سيُعاد فتح المنصة؛ سجّل الدخول بحساب موجود في النسخة.', 'success');
      setTimeout(() => location.reload(), 1100);
    } catch (error) {
      console.error('local backup restore failed', error);
      try {
        const currentKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (isDataKey(key)) currentKeys.push(key);
        }
        currentKeys.forEach(key => localStorage.removeItem(key));
        (oldStorage || []).forEach(([key, value]) => localStorage.setItem(key, value));
        if (oldAttachments) await writeAttachments(oldAttachments);
      } catch (rollbackError) {
        console.error('local backup rollback failed', rollbackError);
        setStatus('تعذرت الاستعادة، كما تعذر التراجع التلقائي. لا تغلق المتصفح، واحتفظ بملف النسخة وأعد فتح المنصة قبل أي تغيير آخر.', 'error');
        return;
      }
      if (button) button.disabled = false;
      setStatus(error.message || 'تعذرت الاستعادة؛ أُعيدت البيانات السابقة تلقائيًا.', 'error');
    }
  }

  window.LocalBackup = { render };
})();
