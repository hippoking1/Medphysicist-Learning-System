/**
 * 醫學物理師考照自學系統 - 資料存取層 (Data Access Object - db.js)
 * 支援 Firebase Cloud Firestore 與 LocalStorage 雙模切換，以及本機/Google Sheet 一鍵搬移上雲
 */

const LEGACY_GSHEET_ID = '1-ATEDk8TtYZRA0gdOFfgzp5ZIYpYWzSRHvcE5eaYcnQ';

const DB = {
  /**
   * 初始化資料庫與自癒種子資料 (Self-Healing)
   * 若首次連上空白 Firestore 且本機已有學習紀錄，自動無痛將本機資料推送上雲
   */
  async init(forceSeeding = false) {
    const db = initFirebaseApp();

    if (db && isFirebaseConnected) {
      try {
        const probe = await verifyFirebaseConnection();
        if (probe.connected) {
          const syllabusSnap = await db.collection('syllabus').get();
          if (syllabusSnap.empty || forceSeeding) {
            // 檢查本機是否有既有使用者資料，若有則連同課綱一併上雲，避免切換雲端時「資料看似消失」
            const hasLocalUserData = this._hasLocalUserData();
            if (syllabusSnap.empty && hasLocalUserData && !forceSeeding) {
              console.log('[DB] 偵測到全新 Firestore 且本機已有學習紀錄，自動執行上雲遷移...');
              await this.pushLocalToFirebase();
              return { success: true, message: '已自動將本機資料同步遷移至 Firebase Firestore' };
            }

            const batch = db.batch();
            DEFAULT_SYLLABUS.forEach((unit) => {
              batch.set(db.collection('syllabus').doc(unit.unitId), unit);
            });
            batch.set(db.collection('config').doc('settings'), DEFAULT_CONFIGS, { merge: true });
            await batch.commit();
          }
          return { success: true, message: 'Firestore 資料庫連線成功' };
        }
      } catch (err) {
        console.error('[DB] Firestore 初始化失敗，降級至 LocalStorage:', err);
      }
    }

    // LocalStorage 降級模式
    const localSyllabus = this._getLocal('syllabus');
    if (!localSyllabus || localSyllabus.length === 0 || forceSeeding) {
      this._setLocal('syllabus', DEFAULT_SYLLABUS);
      if (!this._getLocal('config')) {
        this._setLocal('config', DEFAULT_CONFIGS);
      }
    }
    return { success: true, message: '本機資料庫初始化成功 (LocalStorage)' };
  },

  _hasLocalUserData() {
    const keys = ['progress', 'questions', 'reviewCards', 'examResults', 'oralPractices', 'studyLogs'];
    return keys.some((k) => {
      const val = this._getLocal(k);
      return Array.isArray(val) && val.length > 0;
    });
  },

  // ==========================================
  // Config 設定存取
  // ==========================================
  async getConfig(key) {
    if (dbInstance && isFirebaseConnected) {
      try {
        const doc = await dbInstance.collection('config').doc('settings').get();
        if (doc.exists && doc.data()[key] !== undefined) {
          return doc.data()[key];
        }
      } catch (e) {
        console.warn(`[DB] 讀取 Firestore Config 失敗 (${key}):`, e);
      }
    }
    const local = this._getLocal('config') || DEFAULT_CONFIGS;
    return local[key] !== undefined ? local[key] : (DEFAULT_CONFIGS[key] || '');
  },

  async getAllConfig() {
    if (dbInstance && isFirebaseConnected) {
      try {
        const doc = await dbInstance.collection('config').doc('settings').get();
        if (doc.exists) {
          return { ...DEFAULT_CONFIGS, ...doc.data() };
        }
      } catch (e) {}
    }
    return { ...DEFAULT_CONFIGS, ...(this._getLocal('config') || {}) };
  },

  async saveConfig(key, value) {
    const local = this._getLocal('config') || { ...DEFAULT_CONFIGS };
    local[key] = value;
    this._setLocal('config', local);

    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('config').doc('settings').set({ [key]: value }, { merge: true });
      } catch (e) {
        console.warn(`[DB] 寫入 Firestore Config 失敗 (${key}):`, e);
      }
    }
    return true;
  },

  // ==========================================
  // 課綱 (Syllabus)
  // ==========================================
  async getSyllabus() {
    if (dbInstance && isFirebaseConnected) {
      try {
        const snap = await dbInstance.collection('syllabus').get();
        if (!snap.empty) {
          const list = [];
          snap.forEach((doc) => list.push(doc.data()));
          return list.sort((a, b) => Number(a.orderIndex) - Number(b.orderIndex));
        }
      } catch (e) {
        console.warn('[DB] 讀取 Firestore Syllabus 失敗，使用 LocalStorage:', e);
      }
    }
    let local = this._getLocal('syllabus');
    if (!local || local.length === 0) {
      this._setLocal('syllabus', DEFAULT_SYLLABUS);
      local = DEFAULT_SYLLABUS;
    }
    return [...local].sort((a, b) => Number(a.orderIndex) - Number(b.orderIndex));
  },

  // ==========================================
  // 學習進度 (Progress)
  // ==========================================
  async getRawProgressRecords() {
    if (dbInstance && isFirebaseConnected) {
      try {
        const snap = await dbInstance.collection('progress').get();
        const records = [];
        snap.forEach((doc) => records.push({ unitId: doc.id, ...doc.data() }));
        return records;
      } catch (e) {
        console.warn('[DB] 讀取 Firestore Progress 失敗，使用 LocalStorage:', e);
      }
    }
    return this._getLocal('progress') || [];
  },

  async getProgress() {
    const syllabus = await this.getSyllabus();
    const rawList = await this.getRawProgressRecords();
    const progressMap = {};
    rawList.forEach((p) => {
      progressMap[p.unitId] = p;
    });

    return syllabus.map((unit) => {
      const prog = progressMap[unit.unitId] || {};
      return {
        ...unit,
        status: prog.status || 'not_started',
        startDate: prog.startDate || '',
        completeDate: prog.completeDate || '',
        totalMinutes: Number(prog.totalMinutes || 0),
        notes: prog.notes || ''
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
      updatedAt: new Date().toISOString()
    };

    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('progress').doc(unitId).set(dataToSave, { merge: true });
      } catch (e) {
        console.warn('[DB] 寫入 Firestore Progress 失敗:', e);
      }
    }

    const localProg = this._getLocal('progress') || [];
    const idx = localProg.findIndex((p) => p.unitId === unitId);
    if (idx >= 0) localProg[idx] = dataToSave;
    else localProg.push(dataToSave);
    this._setLocal('progress', localProg);

    if (addMinutes > 0) {
      await this.addManualStudyLog(unitId, addMinutes, `學習單元：${unitId}（累計 ${addMinutes} 分鐘）`);
    }

    return { success: true, data: dataToSave };
  },

  // ==========================================
  // 練習題庫 (Questions)
  // ==========================================
  async getQuestions(moduleId, topicId) {
    let allQs = [];
    if (dbInstance && isFirebaseConnected) {
      try {
        const snap = await dbInstance.collection('questions').get();
        snap.forEach((doc) => allQs.push(doc.data()));
      } catch (e) {
        console.warn('[DB] 讀取 Firestore Questions 失敗，使用 LocalStorage:', e);
        allQs = this._getLocal('questions') || [];
      }
    } else {
      allQs = this._getLocal('questions') || [];
    }

    return allQs.filter((q) => {
      const qMod = q.moduleId ? String(q.moduleId).trim().toUpperCase() : '';
      const qTopic = q.topicId ? String(q.topicId).trim().toUpperCase() : '';
      const targetMod = moduleId ? String(moduleId).trim().toUpperCase() : '';
      const targetTopic = topicId ? String(topicId).trim().toUpperCase() : '';

      const matchMod = !moduleId || qMod === targetMod;
      const matchTopic = !topicId || qTopic === targetTopic;
      return matchMod && matchTopic;
    });
  },

  async addManualQuestion(questionObj) {
    const qId = crypto.randomUUID();
    const newQ = {
      questionId: qId,
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

    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('questions').doc(qId).set(newQ);
      } catch (e) {
        console.warn('[DB] 寫入 Firestore Question 失敗:', e);
      }
    }

    const local = this._getLocal('questions') || [];
    local.push(newQ);
    this._setLocal('questions', local);
    return newQ;
  },

  async insertQuestions(questionsArray) {
    if (!questionsArray || questionsArray.length === 0) return true;

    if (dbInstance && isFirebaseConnected) {
      try {
        await this._batchWriteCollection('questions', questionsArray, 'questionId');
      } catch (e) {
        console.warn('[DB] 批次寫入 Firestore Questions 失敗:', e);
      }
    }

    const local = this._getLocal('questions') || [];
    questionsArray.forEach((q) => local.push(q));
    this._setLocal('questions', local);
    return true;
  },

  async verifyQuestion(questionId) {
    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('questions').doc(questionId).update({ verified: true });
      } catch (e) {
        console.warn('[DB] 更新 Firestore 題目驗證狀態失敗:', e);
      }
    }
    const local = this._getLocal('questions') || [];
    const q = local.find((item) => item.questionId === questionId);
    if (q) {
      q.verified = true;
      this._setLocal('questions', local);
    }
    return true;
  },

  async deleteQuestion(questionId) {
    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('questions').doc(questionId).delete();
      } catch (e) {
        console.warn('[DB] 刪除 Firestore Question 失敗:', e);
      }
    }
    let local = this._getLocal('questions') || [];
    local = local.filter((q) => q.questionId !== questionId);
    this._setLocal('questions', local);
    return true;
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
    const qMap = {};
    allQuestions.forEach((q) => {
      qMap[q.questionId] = q;
    });

    let correctCount = 0;
    const totalQuestions = userAnswers.length;
    const detailedResults = [];
    const moduleCorrectMap = {};
    const moduleTotalMap = {};

    userAnswers.forEach((ua) => {
      const q = qMap[ua.questionId];
      if (!q) return;

      const isCorrect = ua.selectedOption &&
        String(ua.selectedOption).toUpperCase() === String(q.correctAnswer).toUpperCase();
      if (isCorrect) correctCount++;

      moduleTotalMap[q.moduleId] = (moduleTotalMap[q.moduleId] || 0) + 1;
      if (isCorrect) {
        moduleCorrectMap[q.moduleId] = (moduleCorrectMap[q.moduleId] || 0) + 1;
      }

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

    const examId = crypto.randomUUID();
    const examRecord = {
      examId,
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

    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('examResults').doc(examId).set(examRecord);
      } catch (e) {
        console.warn('[DB] 儲存 Firestore 測驗結果失敗:', e);
      }
    }

    const localExams = this._getLocal('examResults') || [];
    localExams.push(examRecord);
    this._setLocal('examResults', localExams);

    return examRecord;
  },

  async getExamResults() {
    let data = [];
    if (dbInstance && isFirebaseConnected) {
      try {
        const snap = await dbInstance.collection('examResults').get();
        snap.forEach((doc) => data.push(doc.data()));
      } catch (e) {
        console.warn('[DB] 讀取 Firestore 測驗紀錄失敗，使用 LocalStorage:', e);
        data = this._getLocal('examResults') || [];
      }
    } else {
      data = this._getLocal('examResults') || [];
    }

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
      .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  },

  // ==========================================
  // 知識卡片 (Review Cards / SM-2)
  // ==========================================
  async getReviewCards() {
    let cards = [];
    if (dbInstance && isFirebaseConnected) {
      try {
        const snap = await dbInstance.collection('reviewCards').get();
        snap.forEach((doc) => cards.push(doc.data()));
      } catch (e) {
        console.warn('[DB] 讀取 Firestore ReviewCards 失敗，使用 LocalStorage:', e);
        cards = this._getLocal('reviewCards') || [];
      }
    } else {
      cards = this._getLocal('reviewCards') || [];
    }

    return cards.map((c) => ({
      ...c,
      interval: Number(c.interval || 1),
      easeFactor: Number(c.easeFactor || 2.5),
      repetitions: Number(c.repetitions || 0),
      nextReviewDate: c.nextReviewDate || new Date().toISOString().split('T')[0]
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

    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('reviewCards').doc(card.cardId).set(card);
      } catch (e) {
        console.warn('[DB] 寫入 Firestore ReviewCard 失敗:', e);
      }
    }

    const local = this._getLocal('reviewCards') || [];
    local.push(card);
    this._setLocal('reviewCards', local);
    return card;
  },

  async insertReviewCards(cardsArray) {
    if (!cardsArray || cardsArray.length === 0) return true;
    if (dbInstance && isFirebaseConnected) {
      try {
        await this._batchWriteCollection('reviewCards', cardsArray, 'cardId');
      } catch (e) {
        console.warn('[DB] 批次寫入 Firestore ReviewCards 失敗:', e);
      }
    }
    const local = this._getLocal('reviewCards') || [];
    cardsArray.forEach((c) => local.push(c));
    this._setLocal('reviewCards', local);
    return true;
  },

  async deleteReviewCard(cardId) {
    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('reviewCards').doc(cardId).delete();
      } catch (e) {
        console.warn('[DB] 刪除 Firestore ReviewCard 失敗:', e);
      }
    }
    let local = this._getLocal('reviewCards') || [];
    local = local.filter((c) => c.cardId !== cardId);
    this._setLocal('reviewCards', local);
    return true;
  },

  async submitReviewCardScore(cardId, score) {
    score = Number(score);
    if (score < 0 || score > 5) throw new Error('評分必須在 0 到 5 之間');

    const cards = await this.getReviewCards();
    const card = cards.find((c) => c.cardId === cardId);
    if (!card) throw new Error('找不到指定的知識卡片: ' + cardId);

    let repetitions = card.repetitions;
    let interval = card.interval;
    let easeFactor = card.easeFactor;

    if (score >= 3) {
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      repetitions++;
    } else {
      repetitions = 0;
      interval = 1;
    }

    easeFactor = easeFactor + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    const updatedData = {
      interval,
      easeFactor: Math.round(easeFactor * 100) / 100,
      repetitions,
      nextReviewDate: nextDate.toISOString().split('T')[0],
      updatedAt: new Date().toISOString()
    };

    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('reviewCards').doc(cardId).update(updatedData);
      } catch (e) {
        console.warn('[DB] 更新 Firestore ReviewCard SM-2 排程失敗:', e);
      }
    }

    const local = this._getLocal('reviewCards') || [];
    const cIdx = local.findIndex((c) => c.cardId === cardId);
    if (cIdx >= 0) {
      local[cIdx] = { ...local[cIdx], ...updatedData };
      this._setLocal('reviewCards', local);
    }

    return { success: true, data: updatedData };
  },

  // ==========================================
  // 口試模擬 (Oral Practice)
  // ==========================================
  async getOralPractices() {
    let data = [];
    if (dbInstance && isFirebaseConnected) {
      try {
        const snap = await dbInstance.collection('oralPractices').get();
        snap.forEach((doc) => data.push(doc.data()));
      } catch (e) {
        console.warn('[DB] 讀取 Firestore OralPractices 失敗，使用 LocalStorage:', e);
        data = this._getLocal('oralPractices') || [];
      }
    } else {
      data = this._getLocal('oralPractices') || [];
    }

    return data
      .map((row) => ({
        ...row,
        aiScore: Number(row.aiScore || 0),
        aiFeedback:
          typeof row.aiFeedback === 'string'
            ? JSON.parse(row.aiFeedback || '{}')
            : (row.aiFeedback || {})
      }))
      .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  },

  async saveOralPractice(record) {
    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('oralPractices').doc(record.practiceId).set(record);
      } catch (e) {
        console.warn('[DB] 儲存 Firestore OralPractice 失敗:', e);
      }
    }
    const local = this._getLocal('oralPractices') || [];
    local.push(record);
    this._setLocal('oralPractices', local);
    return record;
  },

  // ==========================================
  // 學習日誌 (Study Logs)
  // ==========================================
  async getStudyLogs() {
    let data = [];
    if (dbInstance && isFirebaseConnected) {
      try {
        const snap = await dbInstance.collection('studyLogs').get();
        snap.forEach((doc) => data.push(doc.data()));
      } catch (e) {
        console.warn('[DB] 讀取 Firestore StudyLogs 失敗，使用 LocalStorage:', e);
        data = this._getLocal('studyLogs') || [];
      }
    } else {
      data = this._getLocal('studyLogs') || [];
    }

    return data
      .map((row) => ({
        ...row,
        minutes: Number(row.minutes || 0),
        date: row.date || ''
      }))
      .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  },

  async addManualStudyLog(unitId, minutes, journalEntry) {
    const today = new Date().toISOString().split('T')[0];
    const logId = crypto.randomUUID();
    const record = {
      logId,
      date: today,
      unitId: unitId || 'General',
      minutes: Number(minutes || 0),
      journalEntry: journalEntry || '',
      createdAt: new Date().toISOString()
    };

    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('studyLogs').doc(logId).set(record);
      } catch (e) {
        console.warn('[DB] 儲存 Firestore StudyLog 失敗:', e);
      }
    }

    const local = this._getLocal('studyLogs') || [];
    local.push(record);
    this._setLocal('studyLogs', local);
    return record;
  },

  // ==========================================
  // 儀表板數據整合 (Dashboard Data)
  // ==========================================
  async getDashboardData() {
    const progressList = await this.getProgress();
    const logs = await this.getStudyLogs();
    const examResults = await this.getExamResults();
    const allCards = await this.getReviewCards();
    const todayStr = new Date().toISOString().split('T')[0];
    const dueCards = allCards.filter((c) => !c.nextReviewDate || c.nextReviewDate <= todayStr);

    const examDateStr = (await this.getConfig('examDate')) || '2027-10-01';
    const dailyGoal = Number((await this.getConfig('dailyGoalMinutes')) || 45);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const examDate = new Date(examDateStr);
    examDate.setHours(0, 0, 0, 0);
    const daysRemaining = Math.max(0, Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 3600 * 24)));

    const totalUnits = progressList.length;
    const completedUnits = progressList.filter((p) => p.status === 'completed').length;
    const inProgressUnits = progressList.filter((p) => p.status === 'in_progress').length;
    const overallProgressPercent = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

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
    logs.forEach((log) => {
      totalMinutes += log.minutes;
      if (log.date === todayStr) todayMinutes += log.minutes;
    });

    const uniqueDates = [...new Set(logs.map((l) => l.date))].sort((a, b) => new Date(b) - new Date(a));
    let streak = 0;
    const checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);
    const todayDateStr = checkDate.toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const hasToday = uniqueDates.includes(todayDateStr);
    const hasYesterday = uniqueDates.includes(yesterdayStr);

    if (hasToday || hasYesterday) {
      const currentCheck = hasToday ? checkDate : yesterday;
      while (true) {
        const currentStr = currentCheck.toISOString().split('T')[0];
        if (uniqueDates.includes(currentStr)) {
          streak++;
          currentCheck.setDate(currentCheck.getDate() - 1);
        } else {
          break;
        }
      }
    }

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
    }

    const weeklyDailyMinutes = last7Days.map((dateStr) => {
      const sum = logs.filter((l) => l.date === dateStr).reduce((acc, log) => acc + log.minutes, 0);
      return { date: dateStr.substring(5), minutes: sum };
    });

    const weeklyTotalMinutes = weeklyDailyMinutes.reduce((acc, d) => acc + d.minutes, 0);
    const recentExams = examResults.slice(0, 5);
    const averageExamScore =
      recentExams.length > 0
        ? Math.round(recentExams.reduce((acc, r) => acc + r.score, 0) / recentExams.length)
        : 0;

    return {
      daysRemaining,
      overallProgressPercent,
      completedUnits,
      totalUnits,
      inProgressUnits,
      moduleProgress,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      todayMinutes,
      weeklyTotalMinutes,
      streak,
      weeklyDailyMinutes,
      averageExamScore,
      dueReviewCardsCount: dueCards.length,
      totalReviewCardsCount: allCards.length,
      dailyGoalMinutes: dailyGoal
    };
  },

  // ==========================================
  // Firebase 資料庫搬移引擎 (Ponytail 共用批次寫入核心)
  // ==========================================
  async _batchWriteCollection(colName, items, idKey) {
    if (!dbInstance || !items || items.length === 0) return 0;
    const chunks = this._chunkArray(items, 400);
    for (const chunk of chunks) {
      const batch = dbInstance.batch();
      chunk.forEach((item) => {
        const id = String(item[idKey] || crypto.randomUUID());
        const ref = dbInstance.collection(colName).doc(id);
        batch.set(ref, item, { merge: true });
      });
      await batch.commit();
    }
    return items.length;
  },

  _normalizeDataset(raw) {
    const normalized = {
      config: DEFAULT_CONFIGS,
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
        if (row.key) cfg[row.key] = row.value !== undefined ? String(row.value) : '';
      });
      normalized.config = cfg;
    } else if (raw.config && typeof raw.config === 'object') {
      normalized.config = { ...DEFAULT_CONFIGS, ...raw.config };
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

    // 1. 先寫入 LocalStorage 保障即時可用
    this._setLocal('config', data.config);
    this._setLocal('syllabus', data.syllabus);
    this._setLocal('progress', data.progress);
    this._setLocal('questions', data.questions);
    this._setLocal('reviewCards', data.reviewCards);
    this._setLocal('examResults', data.examResults);
    this._setLocal('oralPractices', data.oralPractices);
    this._setLocal('studyLogs', data.studyLogs);

    if (!dbInstance || !isFirebaseConnected) {
      throw new Error('尚未連線至 Firebase Firestore，僅儲存於本機 LocalStorage');
    }

    await dbInstance.collection('config').doc('settings').set(data.config, { merge: true });
    await this._batchWriteCollection('syllabus', data.syllabus, 'unitId');
    await this._batchWriteCollection('progress', data.progress, 'unitId');
    await this._batchWriteCollection('questions', data.questions, 'questionId');
    await this._batchWriteCollection('reviewCards', data.reviewCards, 'cardId');
    await this._batchWriteCollection('examResults', data.examResults, 'examId');
    await this._batchWriteCollection('oralPractices', data.oralPractices, 'practiceId');
    await this._batchWriteCollection('studyLogs', data.studyLogs, 'logId');

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

  /**
   * 路徑 1：將本機 LocalStorage 所有資料推送至 Firebase
   */
  async pushLocalToFirebase() {
    const probe = await verifyFirebaseConnection();
    if (!probe.connected) {
      throw new Error(probe.reason || '無法連線至 Firebase Firestore');
    }

    const localData = {
      config: this._getLocal('config') || DEFAULT_CONFIGS,
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

  /**
   * 路徑 2：從 Firebase Firestore 下載最新資料至本機 LocalStorage
   */
  async pullFirebaseToLocal() {
    const probe = await verifyFirebaseConnection();
    if (!probe.connected || !dbInstance) {
      throw new Error(probe.reason || '無法連線至 Firebase Firestore');
    }

    const fetchCol = async (name) => {
      const snap = await dbInstance.collection(name).get();
      const arr = [];
      snap.forEach((doc) => arr.push(doc.data()));
      return arr;
    };

    const configDoc = await dbInstance.collection('config').doc('settings').get();
    const config = configDoc.exists ? { ...DEFAULT_CONFIGS, ...configDoc.data() } : DEFAULT_CONFIGS;

    const [syllabus, progress, questions, reviewCards, examResults, oralPractices, studyLogs] =
      await Promise.all([
        fetchCol('syllabus'),
        fetchCol('progress'),
        fetchCol('questions'),
        fetchCol('reviewCards'),
        fetchCol('examResults'),
        fetchCol('oralPractices'),
        fetchCol('studyLogs')
      ]);

    this._setLocal('config', config);
    if (syllabus.length > 0) this._setLocal('syllabus', syllabus);
    this._setLocal('progress', progress);
    this._setLocal('questions', questions);
    this._setLocal('reviewCards', reviewCards);
    this._setLocal('examResults', examResults);
    this._setLocal('oralPractices', oralPractices);
    this._setLocal('studyLogs', studyLogs);

    return {
      success: true,
      counts: {
        syllabus: syllabus.length,
        progress: progress.length,
        questions: questions.length,
        reviewCards: reviewCards.length,
        examResults: examResults.length,
        oralPractices: oralPractices.length,
        studyLogs: studyLogs.length
      }
    };
  },

  /**
   * 路徑 3：從舊版 Google Sheet 免後端直連遷移至 Firebase
   */
  async migrateFromGoogleSheet(sheetIdOrUrl) {
    const raw = (sheetIdOrUrl || LEGACY_GSHEET_ID).trim();
    const idMatch = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = idMatch ? idMatch[1] : raw;
    if (!sheetId) throw new Error('請輸入有效的 Google Sheet ID 或試算表網址');

    const probe = await verifyFirebaseConnection();
    if (!probe.connected) {
      throw new Error('請先完成 Firebase 連線設定，再執行試算表搬移：' + (probe.reason || ''));
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
      if (parsed.status === 'error') {
        return [];
      }
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
              const y = nums[0];
              const m = String(Number(nums[1]) + 1).padStart(2, '0');
              const d = String(nums[2]).padStart(2, '0');
              val = `${y}-${m}-${d}`;
            }
          }
          obj[key] = val === null || val === undefined ? '' : val;
        });
        return obj;
      });
    };

    const dataset = {};
    for (const [sheetName, targetKey] of Object.entries(sheetsMap)) {
      dataset[targetKey] = await fetchSheetRows(sheetName);
    }

    const counts = await this.syncToFirestore(dataset);
    return { success: true, counts };
  },

  /**
   * 取得本機 vs. Firebase 雲端筆數統計
   */
  async getStorageStats() {
    const local = {
      progress: (this._getLocal('progress') || []).length,
      questions: (this._getLocal('questions') || []).length,
      reviewCards: (this._getLocal('reviewCards') || []).length,
      examResults: (this._getLocal('examResults') || []).length,
      oralPractices: (this._getLocal('oralPractices') || []).length,
      studyLogs: (this._getLocal('studyLogs') || []).length
    };

    let cloud = null;
    if (dbInstance && isFirebaseConnected) {
      try {
        const cols = ['progress', 'questions', 'reviewCards', 'examResults', 'oralPractices', 'studyLogs'];
        const snaps = await Promise.all(cols.map((c) => dbInstance.collection(c).get()));
        cloud = {};
        cols.forEach((c, i) => {
          cloud[c] = snaps[i].size;
        });
      } catch (e) {
        cloud = null;
      }
    }

    return { local, cloud };
  },

  // ==========================================
  // 資料庫一鍵完整備份與還原 (JSON Export / Import)
  // ==========================================
  async exportAllDataJSON() {
    const backup = {
      version: '3.0',
      exportedAt: new Date().toISOString(),
      config: await this.getAllConfig(),
      syllabus: await this.getSyllabus(),
      progress: await this.getRawProgressRecords(),
      questions: await this.getQuestions(),
      reviewCards: await this.getReviewCards(),
      examResults: await this.getExamResults(),
      oralPractices: await this.getOralPractices(),
      studyLogs: await this.getStudyLogs()
    };
    return JSON.stringify(backup, null, 2);
  },

  async importAllDataJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.syllabus || !Array.isArray(data.syllabus)) {
        throw new Error('備份檔案格式不正確 (找不到 syllabus 資料)');
      }

      if (dbInstance && isFirebaseConnected) {
        const counts = await this.syncToFirestore(data);
        return { success: true, message: `已完整還原並同步至 Firebase (${counts.questions} 題庫 / ${counts.reviewCards} 閃卡)` };
      } else {
        const normalized = this._normalizeDataset(data);
        this._setLocal('config', normalized.config);
        this._setLocal('syllabus', normalized.syllabus);
        this._setLocal('progress', normalized.progress);
        this._setLocal('questions', normalized.questions);
        this._setLocal('reviewCards', normalized.reviewCards);
        this._setLocal('examResults', normalized.examResults);
        this._setLocal('oralPractices', normalized.oralPractices);
        this._setLocal('studyLogs', normalized.studyLogs);
        return { success: true, message: '資料庫已成功還原至本機儲存！' };
      }
    } catch (e) {
      throw new Error('還原失敗: ' + e.message);
    }
  },

  // ==========================================
  // 內部輔助方法 (Helpers)
  // ==========================================
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
