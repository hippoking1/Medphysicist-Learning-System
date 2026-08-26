/**
 * 醫學物理師考照自學系統 - 資料存取層 (Data Access Object - db.js)
 * 支援 Firebase Cloud Firestore 與 LocalStorage 自動雙模切換
 */

const DB = {
  /**
   * 初始化資料庫與自癒種子資料 (Self-Healing)
   */
  async init(forceSeeding = false) {
    const db = initFirebaseApp();
    
    if (db && isFirebaseConnected) {
      try {
        const syllabusSnap = await db.collection('syllabus').get();
        if (syllabusSnap.empty || forceSeeding) {
          console.log('[DB] Firestore Syllabus 為空或收到強制初始化請求，開始注入 37 個單元種子資料...');
          const batch = db.batch();
          
          DEFAULT_SYLLABUS.forEach(unit => {
            const docRef = db.collection('syllabus').doc(unit.unitId);
            batch.set(docRef, unit);
          });
          
          // 預設 Config
          const configRef = db.collection('config').doc('settings');
          batch.set(configRef, DEFAULT_CONFIGS, { merge: true });
          
          await batch.commit();
          console.log('[DB] Firestore 種子資料寫入完成！');
        }
        return { success: true, message: 'Firestore 資料庫初始化成功' };
      } catch (err) {
        console.error('[DB] Firestore 初始化失敗，降級至 LocalStorage:', err);
      }
    }
    
    // LocalStorage 降級模式
    let localSyllabus = this._getLocal('syllabus');
    if (!localSyllabus || localSyllabus.length === 0 || forceSeeding) {
      this._setLocal('syllabus', DEFAULT_SYLLABUS);
      if (!this._getLocal('config')) {
        this._setLocal('config', DEFAULT_CONFIGS);
      }
    }
    return { success: true, message: '本機資料庫初始化成功 (LocalStorage)' };
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
        console.warn(`[DB] 讀取 Firestore Config 失敗 (${key})，使用 LocalStorage:`, e);
      }
    }
    const local = this._getLocal('config') || DEFAULT_CONFIGS;
    return local[key] !== undefined ? local[key] : (DEFAULT_CONFIGS[key] || '');
  },

  async saveConfig(key, value) {
    // 雙寫：優先寫入 LocalStorage 確保即時可用
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
          snap.forEach(doc => list.push(doc.data()));
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
  async getProgress() {
    const syllabus = await this.getSyllabus();
    let progressMap = {};

    if (dbInstance && isFirebaseConnected) {
      try {
        const snap = await dbInstance.collection('progress').get();
        snap.forEach(doc => {
          progressMap[doc.id] = doc.data();
        });
      } catch (e) {
        console.warn('[DB] 讀取 Firestore Progress 失敗，使用 LocalStorage:', e);
        const localProg = this._getLocal('progress') || [];
        localProg.forEach(p => { progressMap[p.unitId] = p; });
      }
    } else {
      const localProg = this._getLocal('progress') || [];
      localProg.forEach(p => { progressMap[p.unitId] = p; });
    }

    return syllabus.map(unit => {
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

    // 取得現有資料
    const allProgress = await this.getProgress();
    const existing = allProgress.find(p => p.unitId === unitId);
    
    let currentTotal = existing ? Number(existing.totalMinutes || 0) : 0;
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
      unitId: unitId,
      status: status,
      startDate: startDate,
      completeDate: completeDate,
      totalMinutes: newTotalMinutes,
      notes: notes !== undefined ? notes : (existing ? existing.notes : ''),
      updatedAt: new Date().toISOString()
    };

    // 1. 寫入 Progress
    if (dbInstance && isFirebaseConnected) {
      try {
        await dbInstance.collection('progress').doc(unitId).set(dataToSave, { merge: true });
      } catch (e) {
        console.warn('[DB] 寫入 Firestore Progress 失敗:', e);
      }
    }
    
    // 同步 LocalStorage
    let localProg = this._getLocal('progress') || [];
    const idx = localProg.findIndex(p => p.unitId === unitId);
    if (idx >= 0) localProg[idx] = dataToSave;
    else localProg.push(dataToSave);
    this._setLocal('progress', localProg);

    // 2. 若有新增時數，記錄於 StudyLog
    if (addMinutes > 0) {
      await this.addManualStudyLog(unitId, addMinutes, `學習單元：${unitId}。新增研讀時數。`);
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
        snap.forEach(doc => allQs.push(doc.data()));
      } catch (e) {
        console.warn('[DB] 讀取 Firestore Questions 失敗，使用 LocalStorage:', e);
        allQs = this._getLocal('questions') || [];
      }
    } else {
      allQs = this._getLocal('questions') || [];
    }

    return allQs.filter(q => {
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
        const batch = dbInstance.batch();
        questionsArray.forEach(q => {
          const ref = dbInstance.collection('questions').doc(q.questionId);
          batch.set(ref, q);
        });
        await batch.commit();
      } catch (e) {
        console.warn('[DB] 批次寫入 Firestore Questions 失敗:', e);
      }
    }

    const local = this._getLocal('questions') || [];
    questionsArray.forEach(q => local.push(q));
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
    const q = local.find(item => item.questionId === questionId);
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
    local = local.filter(q => q.questionId !== questionId);
    this._setLocal('questions', local);
    return true;
  },

  async getUnitQuiz(unitId, moduleId, topicId) {
    let allQs = await this.getQuestions();
    let list = allQs.filter(q => q.unitId === unitId);

    // 自癒出題：若該單元題目小於 3 題，自動呼叫 Gemini 生成 3 題
    if (list.length < 3) {
      try {
        const generated = await GeminiService.generateAIQuestions(moduleId, topicId, 3, 2, unitId);
        if (generated && generated.length > 0) {
          allQs = await this.getQuestions();
          list = allQs.filter(q => q.unitId === unitId);
        }
      } catch (e) {
        console.warn('[DB] 隨堂測驗自動動態補題失敗:', e);
      }
    }

    // 隨機打亂並取 3-5 題
    const shuffled = [...list].sort(() => 0.5 - Math.random());
    const count = Math.min(Math.max(list.length, 3), 5);
    return shuffled.slice(0, count);
  },

  // ==========================================
  // 模擬測驗 (Exam Center)
  // ==========================================
  async generateExam(examType, moduleId) {
    const allQuestions = await this.getQuestions();
    if (allQuestions.length === 0) {
      throw new Error('題庫中目前沒有題目，請先至「AI 練習題庫」功能，使用 AI 產生題目或手動建立。');
    }

    let examQuestions = [];

    if (examType === 'module') {
      if (!moduleId) throw new Error('模組測驗必須指定模組 ID');
      const moduleQs = allQuestions.filter(q => q.moduleId === moduleId);
      if (moduleQs.length === 0) {
        throw new Error(`模組 ${moduleId} 中無可用題目。請先生成該模組的練習題。`);
      }
      const limit = Math.min(20, moduleQs.length);
      examQuestions = this._shuffle(moduleQs).slice(0, limit);
    } else {
      // 全範圍模擬考 (80 題，自 M1~M7 平均抽題)
      const modules = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'];
      const targetPerMod = Math.ceil(80 / modules.length);

      modules.forEach(mod => {
        const modQs = allQuestions.filter(q => q.moduleId === mod);
        if (modQs.length > 0) {
          const limit = Math.min(targetPerMod, modQs.length);
          examQuestions = examQuestions.concat(this._shuffle(modQs).slice(0, limit));
        }
      });

      // 不足 80 題時，從全題庫補足
      if (examQuestions.length < 80) {
        const selectedIds = new Set(examQuestions.map(q => q.questionId));
        const remaining = allQuestions.filter(q => !selectedIds.has(q.questionId));
        const needed = Math.min(80 - examQuestions.length, remaining.length);
        if (needed > 0) {
          examQuestions = examQuestions.concat(this._shuffle(remaining).slice(0, needed));
        }
      }

      examQuestions = this._shuffle(examQuestions).slice(0, 80);
    }

    // 移除答案與解析，防止作弊
    return examQuestions.map(q => ({
      questionId: q.questionId,
      moduleId: q.moduleId,
      topicId: q.topicId,
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
    allQuestions.forEach(q => { qMap[q.questionId] = q; });

    let correctCount = 0;
    const totalQuestions = userAnswers.length;
    const detailedResults = [];
    const moduleCorrectMap = {};
    const moduleTotalMap = {};

    userAnswers.forEach(ua => {
      const q = qMap[ua.questionId];
      if (!q) return;

      const isCorrect = String(ua.selectedOption).toUpperCase() === String(q.correctAnswer).toUpperCase();
      if (isCorrect) correctCount++;

      moduleTotalMap[q.moduleId] = (moduleTotalMap[q.moduleId] || 0) + 1;
      if (isCorrect) {
        moduleCorrectMap[q.moduleId] = (moduleCorrectMap[q.moduleId] || 0) + 1;
      }

      detailedResults.push({
        questionId: q.questionId,
        questionText: q.questionText,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
        userAnswer: ua.selectedOption,
        correctAnswer: q.correctAnswer,
        isCorrect: isCorrect,
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
      examId: examId,
      examType: examType,
      date: new Date().toISOString().split('T')[0],
      totalQuestions: totalQuestions,
      correctCount: correctCount,
      score: score,
      timeSpent: Number(timeSpent),
      moduleBreakdown: moduleBreakdown,
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

    return {
      examId: examId,
      score: score,
      correctCount: correctCount,
      totalQuestions: totalQuestions,
      timeSpent: timeSpent,
      moduleBreakdown: moduleBreakdown,
      details: detailedResults
    };
  },

  async getExamResults() {
    let data = [];
    if (dbInstance && isFirebaseConnected) {
      try {
        const snap = await dbInstance.collection('examResults').get();
        snap.forEach(doc => data.push(doc.data()));
      } catch (e) {
        console.warn('[DB] 讀取 Firestore 測驗紀錄失敗，使用 LocalStorage:', e);
        data = this._getLocal('examResults') || [];
      }
    } else {
      data = this._getLocal('examResults') || [];
    }

    return data.map(row => ({
      ...row,
      score: Number(row.score || 0),
      totalQuestions: Number(row.totalQuestions || 0),
      correctCount: Number(row.correctCount || 0),
      timeSpent: Number(row.timeSpent || 0),
      moduleBreakdown: typeof row.moduleBreakdown === 'string' ? JSON.parse(row.moduleBreakdown) : (row.moduleBreakdown || {})
    })).sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  },

  // ==========================================
  // 知識卡片 (Review Cards / SM-2)
  // ==========================================
  async getReviewCards() {
    let cards = [];
    if (dbInstance && isFirebaseConnected) {
      try {
        const snap = await dbInstance.collection('reviewCards').get();
        snap.forEach(doc => cards.push(doc.data()));
      } catch (e) {
        console.warn('[DB] 讀取 Firestore ReviewCards 失敗，使用 LocalStorage:', e);
        cards = this._getLocal('reviewCards') || [];
      }
    } else {
      cards = this._getLocal('reviewCards') || [];
    }

    return cards.map(c => ({
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
    return cards.filter(c => !c.nextReviewDate || c.nextReviewDate <= todayStr);
  },

  async addManualReviewCard(moduleId, unitId, front, back) {
    const card = {
      cardId: crypto.randomUUID(),
      moduleId: moduleId,
      unitId: unitId || '',
      front: front,
      back: back,
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
        const batch = dbInstance.batch();
        cardsArray.forEach(c => {
          const ref = dbInstance.collection('reviewCards').doc(c.cardId);
          batch.set(ref, c);
        });
        await batch.commit();
      } catch (e) {
        console.warn('[DB] 批次寫入 Firestore ReviewCards 失敗:', e);
      }
    }
    const local = this._getLocal('reviewCards') || [];
    cardsArray.forEach(c => local.push(c));
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
    local = local.filter(c => c.cardId !== cardId);
    this._setLocal('reviewCards', local);
    return true;
  },

  async submitReviewCardScore(cardId, score) {
    score = Number(score);
    if (score < 0 || score > 5) throw new Error('評分必須在 0 到 5 之間');

    const cards = await this.getReviewCards();
    const card = cards.find(c => c.cardId === cardId);
    if (!card) throw new Error('找不到指定的知識卡片: ' + cardId);

    let repetitions = card.repetitions;
    let interval = card.interval;
    let easeFactor = card.easeFactor;

    // SuperMemo-2 (SM-2) 間隔重複核心排程演算法
    if (score >= 3) {
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }
      repetitions++;
    } else {
      repetitions = 0;
      interval = 1; // 答錯，明天立刻複習
    }

    easeFactor = easeFactor + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    const updatedData = {
      interval: interval,
      easeFactor: Math.round(easeFactor * 100) / 100,
      repetitions: repetitions,
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
    const cIdx = local.findIndex(c => c.cardId === cardId);
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
        snap.forEach(doc => data.push(doc.data()));
      } catch (e) {
        console.warn('[DB] 讀取 Firestore OralPractices 失敗，使用 LocalStorage:', e);
        data = this._getLocal('oralPractices') || [];
      }
    } else {
      data = this._getLocal('oralPractices') || [];
    }

    return data.map(row => ({
      ...row,
      aiScore: Number(row.aiScore || 0),
      aiFeedback: typeof row.aiFeedback === 'string' ? JSON.parse(row.aiFeedback) : (row.aiFeedback || {})
    })).sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
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
        snap.forEach(doc => data.push(doc.data()));
      } catch (e) {
        console.warn('[DB] 讀取 Firestore StudyLogs 失敗，使用 LocalStorage:', e);
        data = this._getLocal('studyLogs') || [];
      }
    } else {
      data = this._getLocal('studyLogs') || [];
    }

    return data.map(row => ({
      ...row,
      minutes: Number(row.minutes || 0),
      date: row.date || ''
    })).sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  },

  async addManualStudyLog(unitId, minutes, journalEntry) {
    const today = new Date().toISOString().split('T')[0];
    const logId = crypto.randomUUID();
    const record = {
      logId: logId,
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
    const dueCards = await this.getDueReviewCards();

    const examDateStr = (await this.getConfig('examDate')) || '2027-10-01';
    const dailyGoal = Number((await this.getConfig('dailyGoalMinutes')) || 45);

    // 1. 考試倒數天數
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const examDate = new Date(examDateStr);
    examDate.setHours(0, 0, 0, 0);
    const timeDiff = examDate.getTime() - today.getTime();
    const daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));

    // 2. 總體進度計算
    const totalUnits = progressList.length;
    const completedUnits = progressList.filter(p => p.status === 'completed').length;
    const inProgressUnits = progressList.filter(p => p.status === 'in_progress').length;
    const overallProgressPercent = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

    // 3. 模組細部進度
    const moduleProgress = {};
    const modules = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];
    modules.forEach(mId => {
      const modUnits = progressList.filter(p => p.moduleId === mId);
      const modCompleted = modUnits.filter(p => p.status === 'completed').length;
      moduleProgress[mId] = {
        name: MODULE_NAMES[mId] || mId,
        total: modUnits.length,
        completed: modCompleted,
        percent: modUnits.length > 0 ? Math.round((modCompleted / modUnits.length) * 100) : 0
      };
    });

    // 4. 累計時數與連續學習天數 (Streak)
    let totalMinutes = 0;
    logs.forEach(log => { totalMinutes += log.minutes; });

    const uniqueDates = [...new Set(logs.map(l => l.date))].sort((a, b) => new Date(b) - new Date(a));
    let streak = 0;
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    const todayStr = checkDate.toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const hasToday = uniqueDates.includes(todayStr);
    const hasYesterday = uniqueDates.includes(yesterdayStr);

    if (hasToday || hasYesterday) {
      let currentCheck = hasToday ? checkDate : yesterday;
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

    // 5. 過去 7 日每日學習時數
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
    }

    const weeklyDailyMinutes = last7Days.map(dateStr => {
      const sum = logs.filter(l => l.date === dateStr).reduce((acc, log) => acc + log.minutes, 0);
      return { date: dateStr.substring(5), minutes: sum };
    });

    // 6. 最近測驗平均成績
    const recentExams = examResults.slice(0, 5);
    const averageExamScore = recentExams.length > 0
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
      streak,
      weeklyDailyMinutes,
      averageExamScore,
      dueReviewCardsCount: dueCards.length,
      dailyGoalMinutes: dailyGoal
    };
  },

  // ==========================================
  // 資料庫一鍵完整備份與還原 (JSON Export / Import)
  // ==========================================
  async exportAllDataJSON() {
    const backup = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      config: (this._getLocal('config') || DEFAULT_CONFIGS),
      syllabus: await this.getSyllabus(),
      progress: this._getLocal('progress') || [],
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

      // 寫入 LocalStorage
      if (data.config) this._setLocal('config', data.config);
      if (data.syllabus) this._setLocal('syllabus', data.syllabus);
      if (data.progress) this._setLocal('progress', data.progress);
      if (data.questions) this._setLocal('questions', data.questions);
      if (data.reviewCards) this._setLocal('reviewCards', data.reviewCards);
      if (data.examResults) this._setLocal('examResults', data.examResults);
      if (data.oralPractices) this._setLocal('oralPractices', data.oralPractices);
      if (data.studyLogs) this._setLocal('studyLogs', data.studyLogs);

      // 若有連線 Firestore，批次同步寫入
      if (dbInstance && isFirebaseConnected) {
        console.log('[DB] 開始將還原資料同步至 Firestore...');
        if (data.config) await dbInstance.collection('config').doc('settings').set(data.config);
        
        // 分批寫入 questions / reviewCards / progress / syllabus
        const syncCollection = async (colName, items, idKey) => {
          if (!items || items.length === 0) return;
          const chunks = this._chunkArray(items, 400);
          for (const chunk of chunks) {
            const batch = dbInstance.batch();
            chunk.forEach(item => {
              const id = item[idKey] || crypto.randomUUID();
              const ref = dbInstance.collection(colName).doc(id);
              batch.set(ref, item);
            });
            await batch.commit();
          }
        };

        await syncCollection('syllabus', data.syllabus, 'unitId');
        await syncCollection('progress', data.progress || [], 'unitId');
        await syncCollection('questions', data.questions || [], 'questionId');
        await syncCollection('reviewCards', data.reviewCards || [], 'cardId');
        await syncCollection('examResults', data.examResults || [], 'examId');
        await syncCollection('oralPractices', data.oralPractices || [], 'practiceId');
        await syncCollection('studyLogs', data.studyLogs || [], 'logId');
      }

      return { success: true, message: '資料庫已成功完整還原！' };
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
