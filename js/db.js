/**
 * 醫學物理師考照自學系統 - 資料存取層 (Data Access Object - js/db.js)
 * v4.0 架構：
 * - Google Auth UID 隔離之 Cloud Firestore (/users/{uid}/...) + LocalStorage 雙模運作
 * - Read-Through / Write-Through 記憶體快取 (`_cache`) 與平行預載 (`preloadAll`)，切頁 0 網路讀取延遲
 * - 徹底禁止將 geminiApiKey 寫入 Firestore、LocalStorage 或備份檔案
 */

const LEGACY_GSHEET_ID = '';
const SESSION_GEMINI_KEY = 'mp_session_gemini_key';
const USER_COLLECTIONS = [
  'syllabus',
  'progress',
  'questions',
  'reviewCards',
  'examResults',
  'oralPractices',
  'studyLogs'
];

const DB = {
  _sessionGeminiKey: '',
  _cache: new Map(),
  _initInFlight: null,
  _preloadInFlight: null,

  _isCloudReady() {
    return Boolean(
      typeof dbInstance !== 'undefined' &&
      dbInstance &&
      typeof isFirebaseConnected !== 'undefined' &&
      isFirebaseConnected &&
      typeof currentUser !== 'undefined' &&
      currentUser &&
      currentUser.uid
    );
  },

  _col(name) {
    if (!dbInstance || !currentUser || !currentUser.uid) {
      throw new Error('尚未登入 Google 帳號或未連線至 Firestore');
    }
    return dbInstance.collection('users').doc(currentUser.uid).collection(name);
  },

  _stripSecrets(cfg) {
    if (!cfg || typeof cfg !== 'object') return { ...DEFAULT_CONFIGS };
    const clean = { ...cfg };
    delete clean.geminiApiKey;
    return clean;
  },

  _purgeLocalStoredApiKey() {
    try {
      const local = this._getLocal('config');
      if (local && typeof local === 'object' && 'geminiApiKey' in local) {
        delete local.geminiApiKey;
        this._setLocal('config', local);
      }
    } catch (e) {}
  },

  invalidateCache(key = null) {
    if (key) {
      this._cache.delete(key);
    } else {
      this._cache.clear();
    }
  },

  isCacheWarm() {
    return this._cache.has('syllabus') && this._cache.has('progress') && this._cache.has('config');
  },

  clearLocalUserCache() {
    ['config', ...USER_COLLECTIONS].forEach((k) => {
      try {
        localStorage.removeItem(`mp_${k}`);
      } catch (e) {}
    });
    localStorage.removeItem('mp_last_uid');
    this._cache.clear();
    this._sessionGeminiKey = '';
  },

  // ==========================================
  // 統一 Read-Through / Write-Through 快取核心 (Ponytail 單一資料源)
  // ==========================================
  async _getColCached(colName) {
    if (this._cache.has(colName)) {
      return this._cache.get(colName);
    }

    let list = null;
    if (this._isCloudReady()) {
      try {
        const snap = await this._col(colName).get();
        list = [];
        snap.forEach((doc) => {
          list.push(colName === 'progress' ? { unitId: doc.id, ...doc.data() } : doc.data());
        });
        this._setLocal(colName, list);
      } catch (e) {
        console.warn(`[DB] 讀取 Firestore ${colName} 失敗，使用 LocalStorage:`, e);
      }
    }

    if (!list) {
      list = this._getLocal(colName) || [];
    }

    this._cache.set(colName, list);
    return list;
  },

  async _upsertDoc(colName, idKey, docObj, merge = false) {
    const id = String(docObj[idKey]);
    if (this._isCloudReady()) {
      try {
        await this._col(colName).doc(id).set(docObj, merge ? { merge: true } : undefined);
      } catch (e) {
        console.warn(`[DB] 寫入 Firestore ${colName}/${id} 失敗:`, e);
      }
    }

    const base = this._cache.has(colName) ? [...this._cache.get(colName)] : [...(this._getLocal(colName) || [])];
    const idx = base.findIndex((item) => String(item[idKey]) === id);
    if (idx >= 0) base[idx] = merge ? { ...base[idx], ...docObj } : docObj;
    else base.push(docObj);

    this._cache.set(colName, base);
    this._setLocal(colName, base);
    return docObj;
  },

  async _deleteDoc(colName, idKey, id) {
    const targetId = String(id);
    if (this._isCloudReady()) {
      try {
        await this._col(colName).doc(targetId).delete();
      } catch (e) {
        console.warn(`[DB] 刪除 Firestore ${colName}/${targetId} 失敗:`, e);
      }
    }

    const base = this._cache.has(colName) ? this._cache.get(colName) : (this._getLocal(colName) || []);
    const next = base.filter((item) => String(item[idKey]) !== targetId);
    this._cache.set(colName, next);
    this._setLocal(colName, next);
    return true;
  },

  async preloadAll() {
    if (this.isCacheWarm()) return true;
    if (this._preloadInFlight) return await this._preloadInFlight;

    const task = Promise.all([
      this.getAllConfig(),
      this.getSyllabus(),
      this._getColCached('progress'),
      this._getColCached('studyLogs'),
      this._getColCached('reviewCards'),
      this._getColCached('examResults')
    ]).then(() => true);

    this._preloadInFlight = task;
    try {
      return await task;
    } finally {
      if (this._preloadInFlight === task) this._preloadInFlight = null;
    }
  },

  // ==========================================
  // Gemini API Key 本機 Session 與 Google 密碼管理員連動 (不寫入資料庫)
  // ==========================================
  getGeminiKey() {
    if (this._sessionGeminiKey) return this._sessionGeminiKey;
    try {
      const val = sessionStorage.getItem(SESSION_GEMINI_KEY) || '';
      this._sessionGeminiKey = val;
      return val;
    } catch (e) {
      return '';
    }
  },

  saveGeminiKey(key) {
    const cleaned = (key || '').trim();
    this._sessionGeminiKey = cleaned;
    try {
      if (cleaned) sessionStorage.setItem(SESSION_GEMINI_KEY, cleaned);
      else sessionStorage.removeItem(SESSION_GEMINI_KEY);
    } catch (e) {}
    return cleaned;
  },

  async saveCredentialToBrowser(email, apiKey) {
    const key = (apiKey || '').trim();
    const id = (email || '').trim();
    if (!id || !key) return false;
    if (
      typeof window.PasswordCredential === 'undefined' ||
      !navigator.credentials ||
      typeof navigator.credentials.store !== 'function'
    ) {
      return false;
    }
    try {
      const cred = new window.PasswordCredential({
        id,
        password: key,
        name: '醫學物理師考照 - Gemini API Key'
      });
      await navigator.credentials.store(cred);
      return true;
    } catch (e) {
      console.warn('[Auth] 無法寫入瀏覽器密碼管理員:', e.message || e);
      return false;
    }
  },

  async trySilentBrowserAutofill(interactive = false) {
    if (this.getGeminiKey()) return true;
    if (
      typeof window.PasswordCredential === 'undefined' ||
      !navigator.credentials ||
      typeof navigator.credentials.get !== 'function'
    ) {
      return false;
    }
    try {
      const cred = await navigator.credentials.get({
        password: true,
        mediation: interactive ? 'optional' : 'silent'
      });
      if (cred && cred.password) {
        if (currentUser && currentUser.email && cred.id && cred.id !== currentUser.email) {
          return false;
        }
        this.saveGeminiKey(cred.password);
        return true;
      }
    } catch (e) {}
    return false;
  },

  async _purgeCloudApiKeyField() {
    if (!this._isCloudReady()) return;
    try {
      const settingsRef = this._col('config').doc('settings');
      const doc = await settingsRef.get();
      if (doc.exists && doc.data() && 'geminiApiKey' in doc.data()) {
        await settingsRef.update({
          geminiApiKey: firebase.firestore.FieldValue.delete()
        });
      }
    } catch (e) {}
  },

  async _migrateLegacyTopLevelToUser() {
    if (!dbInstance || !currentUser || !currentUser.uid) return false;
    try {
      const [cfgDoc, sylSnap, progSnap, qSnap, cardSnap, examSnap, oralSnap, logSnap] =
        await Promise.all([
          dbInstance.collection('config').doc('settings').get(),
          dbInstance.collection('syllabus').get(),
          dbInstance.collection('progress').get(),
          dbInstance.collection('questions').get(),
          dbInstance.collection('reviewCards').get(),
          dbInstance.collection('examResults').get(),
          dbInstance.collection('oralPractices').get(),
          dbInstance.collection('studyLogs').get()
        ]);

      const readList = (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push(d.data()));
        return arr;
      };

      const progress = readList(progSnap);
      const questions = readList(qSnap);
      const reviewCards = readList(cardSnap);
      const examResults = readList(examSnap);
      const oralPractices = readList(oralSnap);
      const studyLogs = readList(logSnap);
      const syllabus = readList(sylSnap);

      const hasLegacyData =
        progress.length > 0 ||
        questions.length > 0 ||
        reviewCards.length > 0 ||
        examResults.length > 0 ||
        oralPractices.length > 0 ||
        studyLogs.length > 0;

      if (cfgDoc.exists && cfgDoc.data() && 'geminiApiKey' in cfgDoc.data()) {
        try {
          await dbInstance.collection('config').doc('settings').update({
            geminiApiKey: firebase.firestore.FieldValue.delete()
          });
        } catch (err) {}
      }

      if (!hasLegacyData) return false;

      const dataset = {
        config: this._stripSecrets(cfgDoc.exists ? cfgDoc.data() : DEFAULT_CONFIGS),
        syllabus: syllabus.length > 0 ? syllabus : DEFAULT_SYLLABUS,
        progress,
        questions,
        reviewCards,
        examResults,
        oralPractices,
        studyLogs
      };

      await this.syncToFirestore(dataset);
      return true;
    } catch (e) {
      return false;
    }
  },

  // ==========================================
  // 資料庫初始化與跨裝置同步
  // ==========================================
  async init(forceSeeding = false) {
    if (!forceSeeding && this._initInFlight) {
      return await this._initInFlight;
    }
    const task = this._runInit(forceSeeding);
    if (!forceSeeding) this._initInFlight = task;
    try {
      return await task;
    } finally {
      if (this._initInFlight === task) this._initInFlight = null;
    }
  },

  async _runInit(forceSeeding = false) {
    this._purgeLocalStoredApiKey();
    this.invalidateCache();
    const db = initFirebaseApp();
    await waitForInitialAuth();

    if (currentUser && currentUser.uid) {
      const lastUid = localStorage.getItem('mp_last_uid');
      if (lastUid && lastUid !== currentUser.uid) {
        this.clearLocalUserCache();
      }
      localStorage.setItem('mp_last_uid', currentUser.uid);
    }

    if (db && currentUser) {
      try {
        const probe = await verifyFirebaseConnection();
        if (probe.connected) {
          await this._purgeCloudApiKeyField();
          const syllabusSnap = await this._col('syllabus').get();

          if (syllabusSnap.empty && !forceSeeding) {
            const migratedLegacy = await this._migrateLegacyTopLevelToUser();
            if (migratedLegacy) {
              await this.trySilentBrowserAutofill(false);
              await this.preloadAll();
              return { success: true, message: '已將雲端舊版資料安全遷移至個人 Google 帳號空間並移除明文金鑰' };
            }

            if (this._hasLocalUserData()) {
              await this.pushLocalToFirebase();
              await this.trySilentBrowserAutofill(false);
              await this.preloadAll();
              return { success: true, message: '已將本機學習資料同步至個人 Google 雲端空間' };
            }

            const batch = dbInstance.batch();
            DEFAULT_SYLLABUS.forEach((unit) => {
              batch.set(this._col('syllabus').doc(unit.unitId), unit);
            });
            batch.set(this._col('config').doc('settings'), this._stripSecrets(DEFAULT_CONFIGS), { merge: true });
            await batch.commit();
          } else if (forceSeeding) {
            const batch = dbInstance.batch();
            DEFAULT_SYLLABUS.forEach((unit) => {
              batch.set(this._col('syllabus').doc(unit.unitId), unit);
            });
            batch.set(this._col('config').doc('settings'), this._stripSecrets(DEFAULT_CONFIGS), { merge: true });
            await batch.commit();
          } else if (!this._hasLocalUserData()) {
            await this.pullFirebaseToLocal();
          } else {
            const list = [];
            syllabusSnap.forEach((doc) => list.push(doc.data()));
            if (list.length > 0) {
              this._cache.set('syllabus', list.toSorted((a, b) => Number(a.orderIndex) - Number(b.orderIndex)));
            }
          }

          await this.trySilentBrowserAutofill(false);
          await this.preloadAll();
          return { success: true, message: 'Google 帳號雲端空間連線成功' };
        }
      } catch (err) {
        console.error('[DB] Firestore 初始化失敗，降級至 LocalStorage:', err);
      }
    }

    const localSyllabus = this._getLocal('syllabus');
    if (!localSyllabus || localSyllabus.length === 0 || forceSeeding) {
      this._setLocal('syllabus', DEFAULT_SYLLABUS);
      if (!this._getLocal('config')) {
        this._setLocal('config', this._stripSecrets(DEFAULT_CONFIGS));
      }
    }
    await this.preloadAll();
    return {
      success: true,
      message: currentUser ? '本機離線快取模式' : '未登入 Google 帳號，目前使用本機暫存模式'
    };
  },

  _hasLocalUserData() {
    const keys = ['progress', 'questions', 'reviewCards', 'examResults', 'oralPractices', 'studyLogs'];
    return keys.some((k) => {
      const val = this._getLocal(k);
      return Array.isArray(val) && val.length > 0;
    });
  },

  // ==========================================
  // Config 設定存取 (嚴格攔截 geminiApiKey + 記憶體快取)
  // ==========================================
  async getAllConfig() {
    if (this._cache.has('config')) {
      return { ...this._cache.get('config') };
    }
    let cfg = null;
    if (this._isCloudReady()) {
      try {
        const doc = await this._col('config').doc('settings').get();
        if (doc.exists) {
          cfg = this._stripSecrets({ ...DEFAULT_CONFIGS, ...doc.data() });
          this._setLocal('config', cfg);
        }
      } catch (e) {}
    }
    if (!cfg) {
      cfg = this._stripSecrets({ ...DEFAULT_CONFIGS, ...(this._getLocal('config') || {}) });
    }
    this._cache.set('config', cfg);
    return { ...cfg };
  },

  async getConfig(key) {
    if (key === 'geminiApiKey') return this.getGeminiKey();
    const all = await this.getAllConfig();
    return all[key] !== undefined ? all[key] : (DEFAULT_CONFIGS[key] || '');
  },

  async saveConfig(key, value) {
    if (key === 'geminiApiKey') {
      this.saveGeminiKey(value);
      return true;
    }

    const cur = await this.getAllConfig();
    const updated = this._stripSecrets({ ...cur, [key]: value });
    this._cache.set('config', updated);
    this._setLocal('config', updated);

    if (this._isCloudReady()) {
      try {
        await this._col('config').doc('settings').set({ [key]: value }, { merge: true });
      } catch (e) {
        console.warn(`[DB] 寫入 Firestore Config 失敗 (${key}):`, e);
      }
    }
    return true;
  },

  async saveConfigs(partialObj) {
    const cleanPatch = this._stripSecrets(partialObj);
    const cur = await this.getAllConfig();
    const updated = this._stripSecrets({ ...cur, ...cleanPatch });
    this._cache.set('config', updated);
    this._setLocal('config', updated);

    if (this._isCloudReady()) {
      try {
        await this._col('config').doc('settings').set(cleanPatch, { merge: true });
      } catch (e) {
        console.warn('[DB] 批次寫入 Firestore Config 失敗:', e);
      }
    }
    return true;
  },

  // ==========================================
  // 課綱 (Syllabus) & 學習進度 (Progress)
  // ==========================================
  async getSyllabus() {
    const list = await this._getColCached('syllabus');
    if (!list || list.length === 0) {
      const sorted = DEFAULT_SYLLABUS.toSorted((a, b) => Number(a.orderIndex) - Number(b.orderIndex));
      this._cache.set('syllabus', sorted);
      this._setLocal('syllabus', sorted);
      return sorted;
    }
    return list.toSorted((a, b) => Number(a.orderIndex) - Number(b.orderIndex));
  },

  async getRawProgressRecords() {
    return await this._getColCached('progress');
  },

  async getProgress() {
    const [syllabus, rawList] = await Promise.all([this.getSyllabus(), this.getRawProgressRecords()]);
    const progressMap = new Map();
    rawList.forEach((p) => progressMap.set(p.unitId, p));

    return syllabus.map((unit) => {
      const prog = progressMap.get(unit.unitId) || {};
      return {
        ...unit,
        status: prog.status || 'not_started',
        startDate: prog.startDate || '',
        completeDate: prog.completeDate || '',
        totalMinutes: Number(prog.totalMinutes || 0),
        notes: prog.notes || '',
        studyGuide: prog.studyGuide || '',
        studyGuideSource: prog.studyGuideSource || ''
      };
    });
  },

  async updateProgress(unitId, status, minutes, notes) {
    const today = new Date().toISOString().split('T')[0];
    const addMinutes = Number(minutes || 0);

    const allProgress = await this.getProgress();
    const existing = allProgress.find((p) => p.unitId === unitId);

    const currentTotal = existing ? Number(existing.totalMinutes || 0) : 0;
    let newTotalMinutes = currentTotal + addMinutes;
    let startDate = existing ? existing.startDate : '';
    let completeDate = existing ? existing.completeDate : '';

    if (status === 'in_progress') {
      startDate = startDate || today;
    } else if (status === 'completed') {
      startDate = startDate || today;
      completeDate = today;
    } else if (status === 'not_started') {
      startDate = '';
      completeDate = '';
      newTotalMinutes = 0;
    }

    const dataToSave = {
      unitId,
      status,
      startDate,
      completeDate,
      totalMinutes: newTotalMinutes,
      notes: notes !== undefined ? notes : (existing ? existing.notes : ''),
      studyGuide: existing ? (existing.studyGuide || '') : '',
      studyGuideSource: existing ? (existing.studyGuideSource || '') : '',
      updatedAt: new Date().toISOString()
    };

    await this._upsertDoc('progress', 'unitId', dataToSave, true);

    if (addMinutes > 0) {
      await this.addManualStudyLog(unitId, addMinutes, `學習單元：${unitId}（累計 ${addMinutes} 分鐘）`);
    }

    return { success: true, data: dataToSave };
  },

  async saveUnitStudyGuide(unitId, studyGuide, studyGuideSource = '') {
    const allProgress = await this.getProgress();
    const existing = allProgress.find((p) => p.unitId === unitId);
    const dataToSave = {
      unitId,
      status: existing ? existing.status : 'not_started',
      startDate: existing ? existing.startDate : '',
      completeDate: existing ? existing.completeDate : '',
      totalMinutes: existing ? Number(existing.totalMinutes || 0) : 0,
      notes: existing ? (existing.notes || '') : '',
      studyGuide: studyGuide || '',
      studyGuideSource: studyGuideSource || '',
      updatedAt: new Date().toISOString()
    };

    await this._upsertDoc('progress', 'unitId', dataToSave, true);
    return { success: true, data: dataToSave };
  },

  // ==========================================
  // 練習題庫 (Questions)
  // ==========================================
  async getQuestions(moduleId, topicId) {
    const allQs = await this._getColCached('questions');
    if (!moduleId && !topicId) return [...allQs];

    const targetMod = moduleId ? String(moduleId).trim().toUpperCase() : '';
    const targetTopic = topicId ? String(topicId).trim().toUpperCase() : '';

    return allQs.filter((q) => {
      const qMod = q.moduleId ? String(q.moduleId).trim().toUpperCase() : '';
      const qTopic = q.topicId ? String(q.topicId).trim().toUpperCase() : '';
      return (!targetMod || qMod === targetMod) && (!targetTopic || qTopic === targetTopic);
    });
  },

  async addManualQuestion(questionObj) {
    const newQ = {
      questionId: crypto.randomUUID(),
      moduleId: questionObj.moduleId,
      topicId: questionObj.topicId,
      unitId: questionObj.unitId || '',
      difficulty: Number(questionObj.difficulty || 1),
      questionText: questionObj.questionText,
      optionA: questionObj.optionA,
      optionB: questionObj.optionB,
      optionC: questionObj.optionC,
      optionD: questionObj.optionD,
      correctAnswer: questionObj.correctAnswer,
      explanation: questionObj.explanation || '',
      sourceRef: questionObj.sourceRef || '',
      source: 'manual',
      verified: true,
      createdAt: new Date().toISOString().split('T')[0]
    };
    return await this._upsertDoc('questions', 'questionId', newQ);
  },

  async insertQuestions(questionsArray) {
    if (!questionsArray || questionsArray.length === 0) return true;
    if (this._isCloudReady()) {
      try {
        await this._batchWriteCollection('questions', questionsArray, 'questionId');
      } catch (e) {
        console.warn('[DB] 批次寫入 Firestore Questions 失敗:', e);
      }
    }
    const existing = await this._getColCached('questions');
    const next = [...existing, ...questionsArray];
    this._cache.set('questions', next);
    this._setLocal('questions', next);
    return true;
  },

  async verifyQuestion(questionId) {
    const list = await this._getColCached('questions');
    const target = list.find((item) => item.questionId === questionId);
    if (!target) return false;
    await this._upsertDoc('questions', 'questionId', { ...target, verified: true }, true);
    return true;
  },

  async deleteQuestion(questionId) {
    return await this._deleteDoc('questions', 'questionId', questionId);
  },

  async getUnitQuiz(unitId, moduleId, topicId) {
    let allQs = await this.getQuestions();
    let list = allQs.filter((q) => q.unitId === unitId);

    if (list.length < 3) {
      try {
        const generated = await GeminiService.generateAIQuestions(moduleId, topicId, 3, 2, unitId);
        if (generated && generated.length > 0) {
          allQs = await this.getQuestions();
          list = allQs.filter((q) => q.unitId === unitId);
        }
      } catch (e) {
        console.warn('[DB] 隨堂測驗自動動態補題失敗:', e);
      }
    }

    const shuffled = this._shuffle(list);
    const count = Math.min(Math.max(list.length, 3), 5);
    return shuffled.slice(0, count);
  },

  // ==========================================
  // 模擬測驗 (Exam Center - 涵蓋完整 M1~M10)
  // ==========================================
  async generateExam(examType, moduleId) {
    const allQuestions = await this.getQuestions();
    if (allQuestions.length === 0) {
      throw new Error('題庫中目前沒有題目，請先至「AI 練習題庫」生成或手動建立題目。');
    }

    let examQuestions = [];
    if (examType === 'module') {
      if (!moduleId) throw new Error('模組測驗必須指定模組 ID');
      const moduleQs = allQuestions.filter((q) => q.moduleId === moduleId);
      if (moduleQs.length === 0) {
        throw new Error(`模組 ${moduleId} 中無可用題目，請先生成該模組的練習題。`);
      }
      examQuestions = this._shuffle(moduleQs).slice(0, Math.min(20, moduleQs.length));
    } else {
      const modules = typeof MODULE_NAMES !== 'undefined'
        ? Object.keys(MODULE_NAMES)
        : ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];
      const targetPerMod = Math.ceil(80 / modules.length);

      modules.forEach((mod) => {
        const modQs = allQuestions.filter((q) => q.moduleId === mod);
        if (modQs.length > 0) {
          examQuestions = examQuestions.concat(this._shuffle(modQs).slice(0, Math.min(targetPerMod, modQs.length)));
        }
      });

      if (examQuestions.length < 80) {
        const selectedIds = new Set(examQuestions.map((q) => q.questionId));
        const remaining = allQuestions.filter((q) => !selectedIds.has(q.questionId));
        const needed = Math.min(80 - examQuestions.length, remaining.length);
        if (needed > 0) {
          examQuestions = examQuestions.concat(this._shuffle(remaining).slice(0, needed));
        }
      }

      examQuestions = this._shuffle(examQuestions).slice(0, 80);
    }

    return examQuestions.map((q) => ({
      questionId: q.questionId,
      moduleId: q.moduleId,
      topicId: q.topicId,
      unitId: q.unitId || '',
      difficulty: q.difficulty,
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      sourceRef: q.sourceRef
    }));
  },

  async submitExam(examType, userAnswers, timeSpent, moduleId) {
    const allQuestions = await this.getQuestions();
    const qMap = new Map(allQuestions.map((q) => [q.questionId, q]));

    let correctCount = 0;
    const totalQuestions = userAnswers.length;
    const detailedResults = [];
    const moduleCorrectMap = {};
    const moduleTotalMap = {};

    userAnswers.forEach((ua) => {
      const q = qMap.get(ua.questionId);
      if (!q) return;

      const isCorrect = Boolean(
        ua.selectedOption &&
        String(ua.selectedOption).toUpperCase() === String(q.correctAnswer).toUpperCase()
      );
      if (isCorrect) correctCount++;

      moduleTotalMap[q.moduleId] = (moduleTotalMap[q.moduleId] || 0) + 1;
      if (isCorrect) moduleCorrectMap[q.moduleId] = (moduleCorrectMap[q.moduleId] || 0) + 1;

      detailedResults.push({
        questionId: q.questionId,
        unitId: q.unitId || '',
        questionText: q.questionText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        userAnswer: ua.selectedOption,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
        sourceRef: q.sourceRef,
        moduleId: q.moduleId
      });
    });

    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const moduleBreakdown = {};
    for (const mId in moduleTotalMap) {
      moduleBreakdown[mId] = {
        total: moduleTotalMap[mId],
        correct: moduleCorrectMap[mId] || 0,
        rate: Math.round(((moduleCorrectMap[mId] || 0) / moduleTotalMap[mId]) * 100)
      };
    }

    const examRecord = {
      examId: crypto.randomUUID(),
      examType,
      moduleId: moduleId || '',
      date: new Date().toISOString().split('T')[0],
      totalQuestions,
      correctCount,
      score,
      timeSpent: Number(timeSpent),
      moduleBreakdown,
      details: detailedResults,
      createdAt: new Date().toISOString()
    };

    await this._upsertDoc('examResults', 'examId', examRecord);
    return examRecord;
  },

  async getExamResults() {
    const data = await this._getColCached('examResults');
    return data
      .map((row) => ({
        ...row,
        score: Number(row.score || 0),
        totalQuestions: Number(row.totalQuestions || 0),
        correctCount: Number(row.correctCount || 0),
        timeSpent: Number(row.timeSpent || 0),
        moduleBreakdown:
          typeof row.moduleBreakdown === 'string'
            ? JSON.parse(row.moduleBreakdown || '{}')
            : (row.moduleBreakdown || {}),
        details: Array.isArray(row.details) ? row.details : []
      }))
      .toSorted((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  },

  // ==========================================
  // 知識卡片 (Review Cards / SM-2)
  // ==========================================
  async getReviewCards() {
    const cards = await this._getColCached('reviewCards');
    const fallbackDate = new Date().toISOString().split('T')[0];
    return cards.map((c) => ({
      ...c,
      interval: Number(c.interval || 1),
      easeFactor: Number(c.easeFactor || 2.5),
      repetitions: Number(c.repetitions || 0),
      nextReviewDate: c.nextReviewDate || fallbackDate
    }));
  },

  async getDueReviewCards() {
    const todayStr = new Date().toISOString().split('T')[0];
    const cards = await this.getReviewCards();
    return cards.filter((c) => !c.nextReviewDate || c.nextReviewDate <= todayStr);
  },

  async addManualReviewCard(moduleId, unitId, front, back) {
    const card = {
      cardId: crypto.randomUUID(),
      moduleId,
      unitId: unitId || '',
      front,
      back,
      interval: 1,
      easeFactor: 2.5,
      nextReviewDate: new Date().toISOString().split('T')[0],
      repetitions: 0,
      updatedAt: new Date().toISOString()
    };
    return await this._upsertDoc('reviewCards', 'cardId', card);
  },

  async insertReviewCards(cardsArray) {
    if (!cardsArray || cardsArray.length === 0) return true;
    if (this._isCloudReady()) {
      try {
        await this._batchWriteCollection('reviewCards', cardsArray, 'cardId');
      } catch (e) {
        console.warn('[DB] 批次寫入 Firestore ReviewCards 失敗:', e);
      }
    }
    const existing = await this._getColCached('reviewCards');
    const next = [...existing, ...cardsArray];
    this._cache.set('reviewCards', next);
    this._setLocal('reviewCards', next);
    return true;
  },

  async deleteReviewCard(cardId) {
    return await this._deleteDoc('reviewCards', 'cardId', cardId);
  },

  computeSM2Next(card, score) {
    const s = Number(score);
    if (!Number.isFinite(s) || s < 0 || s > 5) {
      throw new Error('評分必須在 0 到 5 之間');
    }

    let repetitions = Number(card.repetitions || 0);
    let interval = Number(card.interval || 1);
    let easeFactor = Number(card.easeFactor || 2.5);

    if (s >= 3) {
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      repetitions++;
    } else {
      repetitions = 0;
      interval = 1;
    }

    easeFactor = easeFactor + (0.1 - (5 - s) * (0.08 + (5 - s) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    return {
      interval,
      easeFactor: Math.round(easeFactor * 100) / 100,
      repetitions,
      nextReviewDate: nextDate.toISOString().split('T')[0],
      updatedAt: new Date().toISOString()
    };
  },

  async submitReviewCardScore(cardId, score) {
    const cards = await this.getReviewCards();
    const card = cards.find((c) => c.cardId === cardId);
    if (!card) throw new Error('找不到指定的知識卡片: ' + cardId);

    const updatedData = this.computeSM2Next(card, score);
    await this._upsertDoc('reviewCards', 'cardId', { ...card, ...updatedData }, true);
    return { success: true, data: updatedData };
  },

  // ==========================================
  // 口試模擬 (Oral Practice) & 學習日誌 (Study Logs)
  // ==========================================
  async getOralPractices() {
    const data = await this._getColCached('oralPractices');
    return data
      .map((row) => ({
        ...row,
        aiScore: Number(row.aiScore || 0),
        aiFeedback:
          typeof row.aiFeedback === 'string'
            ? (() => { try { return JSON.parse(row.aiFeedback); } catch (e) { return { feedback: row.aiFeedback }; } })()
            : (row.aiFeedback || {})
      }))
      .toSorted((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  },

  async saveOralPractice(record) {
    return await this._upsertDoc('oralPractices', 'practiceId', record);
  },

  async getStudyLogs() {
    const data = await this._getColCached('studyLogs');
    return data
      .map((row) => ({
        ...row,
        minutes: Number(row.minutes || 0),
        date: row.date || ''
      }))
      .toSorted((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  },

  async addManualStudyLog(unitId, minutes, journalEntry) {
    const record = {
      logId: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      unitId: unitId || 'General',
      minutes: Number(minutes || 0),
      journalEntry: journalEntry || '',
      createdAt: new Date().toISOString()
    };
    return await this._upsertDoc('studyLogs', 'logId', record);
  },

  // ==========================================
  // 儀表板數據整合 (全平行讀取，零重複查詢)
  // ==========================================
  async getDashboardData() {
    const [progressList, logs, examResults, allCards, cfg] = await Promise.all([
      this.getProgress(),
      this.getStudyLogs(),
      this.getExamResults(),
      this.getReviewCards(),
      this.getAllConfig()
    ]);

    const todayStr = new Date().toISOString().split('T')[0];
    const dueCards = allCards.filter((c) => !c.nextReviewDate || c.nextReviewDate <= todayStr);

    const examDateStr = cfg.examDate || '2027-10-01';
    const dailyGoal = Number(cfg.dailyGoalMinutes || 45);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const examDate = new Date(examDateStr);
    examDate.setHours(0, 0, 0, 0);
    const daysRemaining = Math.max(0, Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 3600 * 24)));

    const statusCounts = { completed: 0, in_progress: 0, review: 0, not_started: 0 };
    progressList.forEach((p) => {
      const s = p.status in statusCounts ? p.status : 'not_started';
      statusCounts[s]++;
    });

    const totalUnits = progressList.length;
    const completedUnits = statusCounts.completed;
    const overallProgressPercent = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

    // 優先續讀進行中單元，其次需複習，再來下一個未開始單元
    const nextUnit =
      progressList.find((p) => p.status === 'in_progress') ||
      progressList.find((p) => p.status === 'review') ||
      progressList.find((p) => p.status === 'not_started') ||
      null;

    const moduleProgress = {};
    const modules = typeof MODULE_NAMES !== 'undefined'
      ? Object.keys(MODULE_NAMES)
      : ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];
    modules.forEach((mId) => {
      const modUnits = progressList.filter((p) => p.moduleId === mId);
      const modCompleted = modUnits.filter((p) => p.status === 'completed').length;
      moduleProgress[mId] = {
        name: MODULE_NAMES[mId] || mId,
        total: modUnits.length,
        completed: modCompleted,
        percent: modUnits.length > 0 ? Math.round((modCompleted / modUnits.length) * 100) : 0
      };
    });

    let totalMinutes = 0;
    let todayMinutes = 0;
    const minutesByDate = new Map();
    logs.forEach((log) => {
      totalMinutes += log.minutes;
      if (log.date === todayStr) todayMinutes += log.minutes;
      if (log.date) minutesByDate.set(log.date, (minutesByDate.get(log.date) || 0) + log.minutes);
    });

    let streak = 0;
    const checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);
    const todayDateStr = checkDate.toISOString().split('T')[0];
    const yesterday = new Date(checkDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (minutesByDate.has(todayDateStr) || minutesByDate.has(yesterdayStr)) {
      const cursor = minutesByDate.has(todayDateStr) ? checkDate : yesterday;
      while (minutesByDate.has(cursor.toISOString().split('T')[0])) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    const weeklyDailyMinutes = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      weeklyDailyMinutes.push({ date: dateStr.substring(5), minutes: minutesByDate.get(dateStr) || 0 });
    }

    const weeklyTotalMinutes = weeklyDailyMinutes.reduce((acc, d) => acc + d.minutes, 0);
    const recentExams = examResults.slice(0, 5);
    const averageExamScore =
      recentExams.length > 0
        ? Math.round(recentExams.reduce((acc, r) => acc + r.score, 0) / recentExams.length)
        : 0;

    // 彙整近 5 次模擬考各模組答對率，供儀表板顯示弱點排行
    const modAcc = {};
    recentExams.forEach((ex) => {
      const mb = ex.moduleBreakdown || {};
      Object.keys(mb).forEach((mId) => {
        if (!modAcc[mId]) modAcc[mId] = { correct: 0, total: 0 };
        modAcc[mId].correct += Number(mb[mId].correct || 0);
        modAcc[mId].total += Number(mb[mId].total || 0);
      });
    });
    const weakModules = Object.entries(modAcc)
      .filter(([, v]) => v.total > 0)
      .map(([mId, v]) => ({
        moduleId: mId,
        name: (typeof MODULE_NAMES !== 'undefined' && MODULE_NAMES[mId]) || mId,
        rate: Math.round((v.correct / v.total) * 100),
        total: v.total
      }))
      .toSorted((a, b) => a.rate - b.rate)
      .slice(0, 4);

    return {
      daysRemaining,
      overallProgressPercent,
      completedUnits,
      totalUnits,
      inProgressUnits: statusCounts.in_progress,
      statusCounts,
      nextUnit,
      weakModules,
      moduleProgress,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      todayMinutes,
      weeklyTotalMinutes,
      streak,
      weeklyDailyMinutes,
      averageExamScore,
      recentExamCount: recentExams.length,
      dueReviewCardsCount: dueCards.length,
      totalReviewCardsCount: allCards.length,
      dailyGoalMinutes: dailyGoal
    };
  },

  // ==========================================
  // Firebase 資料庫搬移引擎
  // ==========================================
  async _batchWriteCollection(colName, items, idKey) {
    if (!dbInstance || !currentUser || !items || items.length === 0) return 0;
    const chunks = this._chunkArray(items, 400);
    for (const chunk of chunks) {
      const batch = dbInstance.batch();
      chunk.forEach((item) => {
        const id = String(item[idKey] || crypto.randomUUID());
        const ref = this._col(colName).doc(id);
        batch.set(ref, item, { merge: true });
      });
      await batch.commit();
    }
    return items.length;
  },

  _normalizeDataset(raw) {
    const normalized = {
      config: this._stripSecrets(DEFAULT_CONFIGS),
      syllabus: DEFAULT_SYLLABUS,
      progress: [],
      questions: [],
      reviewCards: [],
      examResults: [],
      oralPractices: [],
      studyLogs: []
    };

    if (Array.isArray(raw.config)) {
      const cfg = { ...DEFAULT_CONFIGS };
      raw.config.forEach((row) => {
        if (row.key && row.key !== 'geminiApiKey') {
          cfg[row.key] = row.value !== undefined ? String(row.value) : '';
        }
      });
      normalized.config = this._stripSecrets(cfg);
    } else if (raw.config && typeof raw.config === 'object') {
      normalized.config = this._stripSecrets({ ...DEFAULT_CONFIGS, ...raw.config });
    }

    if (Array.isArray(raw.syllabus) && raw.syllabus.length > 0) {
      normalized.syllabus = raw.syllabus.map((u, idx) => ({
        ...u,
        plannedWeek: Number(u.plannedWeek || idx + 1),
        estimatedMinutes: Number(u.estimatedMinutes || 180),
        orderIndex: Number(u.orderIndex || idx + 1)
      }));
    }

    if (Array.isArray(raw.progress)) {
      normalized.progress = raw.progress
        .filter((p) => p.unitId)
        .map((p) => ({
          unitId: String(p.unitId),
          status: p.status || 'not_started',
          startDate: p.startDate || '',
          completeDate: p.completeDate || '',
          totalMinutes: Number(p.totalMinutes || 0),
          notes: p.notes || '',
          studyGuide: p.studyGuide || '',
          studyGuideSource: p.studyGuideSource || '',
          updatedAt: p.updatedAt || new Date().toISOString()
        }));
    }

    if (Array.isArray(raw.questions)) {
      normalized.questions = raw.questions.map((q) => ({
        ...q,
        questionId: String(q.questionId || crypto.randomUUID()),
        difficulty: Number(q.difficulty || 2),
        verified: q.verified === true || String(q.verified).toUpperCase() === 'TRUE'
      }));
    }

    if (Array.isArray(raw.reviewCards)) {
      normalized.reviewCards = raw.reviewCards.map((c) => ({
        ...c,
        cardId: String(c.cardId || crypto.randomUUID()),
        interval: Number(c.interval || 1),
        easeFactor: Number(c.easeFactor || 2.5),
        repetitions: Number(c.repetitions || 0),
        nextReviewDate: c.nextReviewDate || new Date().toISOString().split('T')[0]
      }));
    }

    if (Array.isArray(raw.examResults)) {
      normalized.examResults = raw.examResults.map((r) => ({
        ...r,
        examId: String(r.examId || crypto.randomUUID()),
        totalQuestions: Number(r.totalQuestions || 0),
        correctCount: Number(r.correctCount || 0),
        score: Number(r.score || 0),
        timeSpent: Number(r.timeSpent || 0),
        moduleBreakdown:
          typeof r.moduleBreakdown === 'string'
            ? JSON.parse(r.moduleBreakdown || '{}')
            : (r.moduleBreakdown || {})
      }));
    }

    if (Array.isArray(raw.oralPractices)) {
      normalized.oralPractices = raw.oralPractices.map((o) => ({
        ...o,
        practiceId: String(o.practiceId || crypto.randomUUID()),
        aiScore: Number(o.aiScore || 0),
        aiFeedback:
          typeof o.aiFeedback === 'string'
            ? (() => { try { return JSON.parse(o.aiFeedback); } catch (e) { return { feedback: o.aiFeedback }; } })()
            : (o.aiFeedback || {})
      }));
    }

    if (Array.isArray(raw.studyLogs)) {
      normalized.studyLogs = raw.studyLogs.map((l) => ({
        ...l,
        logId: String(l.logId || crypto.randomUUID()),
        minutes: Number(l.minutes || 0),
        date: l.date || new Date().toISOString().split('T')[0],
        unitId: l.unitId || 'General',
        journalEntry: l.journalEntry || ''
      }));
    }

    return normalized;
  },

  async syncToFirestore(rawData) {
    const data = this._normalizeDataset(rawData);
    const cleanConfig = this._stripSecrets(data.config);

    this._cache.set('config', cleanConfig);
    this._setLocal('config', cleanConfig);
    USER_COLLECTIONS.forEach((k) => {
      this._cache.set(k, data[k]);
      this._setLocal(k, data[k]);
    });

    if (!this._isCloudReady()) {
      throw new Error('尚未登入 Google 帳號或尚未連線至 Firestore，僅儲存於本機');
    }

    await this._col('config').doc('settings').set(cleanConfig, { merge: true });
    await this._purgeCloudApiKeyField();
    await Promise.all([
      this._batchWriteCollection('syllabus', data.syllabus, 'unitId'),
      this._batchWriteCollection('progress', data.progress, 'unitId'),
      this._batchWriteCollection('questions', data.questions, 'questionId'),
      this._batchWriteCollection('reviewCards', data.reviewCards, 'cardId'),
      this._batchWriteCollection('examResults', data.examResults, 'examId'),
      this._batchWriteCollection('oralPractices', data.oralPractices, 'practiceId'),
      this._batchWriteCollection('studyLogs', data.studyLogs, 'logId')
    ]);

    return {
      syllabus: data.syllabus.length,
      progress: data.progress.length,
      questions: data.questions.length,
      reviewCards: data.reviewCards.length,
      examResults: data.examResults.length,
      oralPractices: data.oralPractices.length,
      studyLogs: data.studyLogs.length
    };
  },

  async pushLocalToFirebase() {
    const probe = await verifyFirebaseConnection();
    if (!probe.connected) {
      throw new Error(probe.reason || '無法連線至 Firebase Firestore');
    }

    const localData = {
      config: this._stripSecrets(this._getLocal('config') || DEFAULT_CONFIGS),
      syllabus: this._getLocal('syllabus') || DEFAULT_SYLLABUS,
      progress: this._getLocal('progress') || [],
      questions: this._getLocal('questions') || [],
      reviewCards: this._getLocal('reviewCards') || [],
      examResults: this._getLocal('examResults') || [],
      oralPractices: this._getLocal('oralPractices') || [],
      studyLogs: this._getLocal('studyLogs') || []
    };

    const counts = await this.syncToFirestore(localData);
    return { success: true, counts };
  },

  async pullFirebaseToLocal() {
    const probe = await verifyFirebaseConnection();
    if (!probe.connected || !this._isCloudReady()) {
      throw new Error(probe.reason || '無法連線至 Firebase Firestore');
    }

    const fetchCol = async (name) => {
      const snap = await this._col(name).get();
      const arr = [];
      snap.forEach((doc) => arr.push(name === 'progress' ? { unitId: doc.id, ...doc.data() } : doc.data()));
      return arr;
    };

    const [configDoc, ...colLists] = await Promise.all([
      this._col('config').doc('settings').get(),
      ...USER_COLLECTIONS.map((c) => fetchCol(c))
    ]);

    const config = this._stripSecrets(
      configDoc.exists ? { ...DEFAULT_CONFIGS, ...configDoc.data() } : DEFAULT_CONFIGS
    );
    this._cache.set('config', config);
    this._setLocal('config', config);

    const counts = {};
    USER_COLLECTIONS.forEach((col, i) => {
      const list = colLists[i];
      if (col !== 'syllabus' || list.length > 0) {
        this._cache.set(col, list);
        this._setLocal(col, list);
      }
      counts[col] = list.length;
    });

    return { success: true, counts };
  },

  async migrateFromGoogleSheet(sheetIdOrUrl) {
    const raw = (sheetIdOrUrl || LEGACY_GSHEET_ID).trim();
    const idMatch = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = idMatch ? idMatch[1] : raw;
    if (!sheetId) throw new Error('請輸入有效的 Google Sheet ID 或試算表網址');

    const probe = await verifyFirebaseConnection();
    if (!probe.connected) {
      throw new Error('請先登入 Google 帳號並完成 Firebase 連線設定：' + (probe.reason || ''));
    }

    const sheetsMap = {
      Syllabus: 'syllabus',
      Progress: 'progress',
      Questions: 'questions',
      StudyLog: 'studyLogs',
      ReviewCards: 'reviewCards',
      ExamResults: 'examResults',
      OralPractice: 'oralPractices',
      Config: 'config'
    };

    const fetchSheetRows = async (sheetName) => {
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`無法讀取工作表 ${sheetName} (HTTP ${res.status})`);
      const text = await res.text();
      const jsonMatch = text.match(/setResponse\(([\s\S]*)\);?$/);
      if (!jsonMatch) {
        throw new Error(`試算表 ${sheetName} 未開放檢視權限（請暫時設為「知道連結的任何人可檢視」）`);
      }
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.status === 'error') return [];
      const cols = (parsed.table.cols || []).map((c) => (c.label || c.id || '').trim());
      const rows = parsed.table.rows || [];
      return rows.map((r) => {
        const obj = {};
        (r.c || []).forEach((cell, idx) => {
          const key = cols[idx];
          if (!key) return;
          let val = cell ? (cell.f !== undefined && cell.v instanceof Object ? cell.f : cell.v) : '';
          if (typeof val === 'string' && val.startsWith('Date(')) {
            const nums = val.match(/\d+/g);
            if (nums && nums.length >= 3) {
              val = `${nums[0]}-${String(Number(nums[1]) + 1).padStart(2, '0')}-${String(nums[2]).padStart(2, '0')}`;
            }
          }
          obj[key] = val === null || val === undefined ? '' : val;
        });
        return obj;
      });
    };

    const entries = Object.entries(sheetsMap);
    const results = await Promise.all(entries.map(([sheetName]) => fetchSheetRows(sheetName)));
    const dataset = {};
    entries.forEach(([, targetKey], idx) => {
      dataset[targetKey] = results[idx];
    });

    const counts = await this.syncToFirestore(dataset);
    return { success: true, counts };
  },

  async getStorageStats() {
    const cols = ['progress', 'questions', 'reviewCards', 'examResults', 'oralPractices', 'studyLogs'];
    const local = {};
    cols.forEach((c) => {
      local[c] = (this._getLocal(c) || []).length;
    });

    let cloud = null;
    if (this._isCloudReady()) {
      try {
        const counts = await Promise.all(
          cols.map(async (c) => {
            const ref = this._col(c);
            if (typeof ref.count === 'function') {
              const agg = await ref.count().get();
              return agg.data().count;
            }
            const snap = await ref.get();
            return snap.size;
          })
        );
        cloud = {};
        cols.forEach((c, i) => {
          cloud[c] = counts[i];
        });
      } catch (e) {
        cloud = null;
      }
    }

    return { local, cloud };
  },

  async exportAllDataJSON() {
    const [config, syllabus, progress, questions, reviewCards, examResults, oralPractices, studyLogs] =
      await Promise.all([
        this.getAllConfig(),
        this.getSyllabus(),
        this.getRawProgressRecords(),
        this.getQuestions(),
        this.getReviewCards(),
        this.getExamResults(),
        this.getOralPractices(),
        this.getStudyLogs()
      ]);

    return JSON.stringify(
      {
        version: '4.0',
        exportedAt: new Date().toISOString(),
        config: this._stripSecrets(config),
        syllabus,
        progress,
        questions,
        reviewCards,
        examResults,
        oralPractices,
        studyLogs
      },
      null,
      2
    );
  },

  async importAllDataJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.syllabus || !Array.isArray(data.syllabus)) {
        throw new Error('備份檔案格式不正確 (找不到 syllabus 資料)');
      }

      if (this._isCloudReady()) {
        const counts = await this.syncToFirestore(data);
        return { success: true, message: `已完整還原並同步至個人雲端空間 (${counts.questions} 題庫 / ${counts.reviewCards} 閃卡)` };
      }
      const normalized = this._normalizeDataset(data);
      const cleanCfg = this._stripSecrets(normalized.config);
      this._cache.set('config', cleanCfg);
      this._setLocal('config', cleanCfg);
      USER_COLLECTIONS.forEach((k) => {
        this._cache.set(k, normalized[k]);
        this._setLocal(k, normalized[k]);
      });
      return { success: true, message: '資料庫已成功還原至本機儲存（不含任何 API Key）' };
    } catch (e) {
      throw new Error('還原失敗: ' + e.message, { cause: e });
    }
  },

  _getLocal(key) {
    try {
      const v = localStorage.getItem(`mp_${key}`);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  },

  _setLocal(key, val) {
    try {
      localStorage.setItem(`mp_${key}`, JSON.stringify(val));
    } catch (e) {
      console.warn(`[DB] 寫入 LocalStorage 失敗 (mp_${key}):`, e);
    }
  },

  _shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  _chunkArray(arr, size) {
    const res = [];
    for (let i = 0; i < arr.length; i += size) {
      res.push(arr.slice(i, i + size));
    }
    return res;
  }
};
