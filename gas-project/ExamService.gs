/**
 * 模擬測驗服務 (ExamService)
 */

/**
 * 產生測驗卷
 * @param {string} examType 'module' 或 'full'
 * @param {string} moduleId 模組 ID (若為 'module' 測驗則必填)
 */
function generateExam(examType, moduleId) {
  const allQuestions = getTableData('Questions');
  
  if (allQuestions.length === 0) {
    throw new Error('題庫中目前沒有題目，請先至「練習題庫」功能，使用 AI 產生題目或手動建立。');
  }
  
  let examQuestions = [];
  
  if (examType === 'module') {
    if (!moduleId) throw new Error('模組測驗必須指定模組 ID');
    const moduleQs = allQuestions.filter(q => q.moduleId === moduleId);
    if (moduleQs.length === 0) {
      throw new Error(`模組 ${moduleId} 中無可用題目。請先生成該模組的練習題。`);
    }
    // 隨機抽 20 題，若少於 20 題則全出
    const limit = Math.min(20, moduleQs.length);
    examQuestions = shuffleArray(moduleQs).slice(0, limit);
  } else {
    // 全範圍模擬考 (80 題)
    // 盡量從 7 個模組平均分配抽題
    const modules = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'];
    const targetPerModule = Math.ceil(80 / modules.length); // 約每模組 11-12 題
    
    modules.forEach(mod => {
      const modQs = allQuestions.filter(q => q.moduleId === mod);
      if (modQs.length > 0) {
        const limit = Math.min(targetPerModule, modQs.length);
        const selected = shuffleArray(modQs).slice(0, limit);
        examQuestions = examQuestions.concat(selected);
      }
    });
    
    // 如果總題數不足 80 題，且全題庫還有剩餘，補足至 80 題 (或題庫最大上限)
    if (examQuestions.length < 80) {
      const selectedIds = new Set(examQuestions.map(q => q.questionId));
      const remainingQs = allQuestions.filter(q => !selectedIds.has(q.questionId));
      const needed = Math.min(80 - examQuestions.length, remainingQs.length);
      if (needed > 0) {
        const extra = shuffleArray(remainingQs).slice(0, needed);
        examQuestions = examQuestions.concat(extra);
      }
    }
    
    // 隨機打亂最終題目順序
    examQuestions = shuffleArray(examQuestions);
    // 限制為最大 80 題
    examQuestions = examQuestions.slice(0, 80);
  }
  
  // 移除正確答案與解析，以防前端作弊 (僅回傳題目與選項)
  return examQuestions.map(q => {
    return {
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
    };
  });
}

/**
 * 提交測驗交卷並計算分數、記錄結果
 * @param {string} examType 'module' 或 'full'
 * @param {Array} userAnswers 前端回傳的答案陣列: [{questionId: '...', selectedOption: 'A'}, ...]
 * @param {number} timeSpent 測驗花費秒數
 * @param {string} moduleId 模組 ID
 */
function submitExam(examType, userAnswers, timeSpent, moduleId) {
  const allQuestions = getTableData('Questions');
  const qMap = {};
  allQuestions.forEach(q => {
    qMap[q.questionId] = q;
  });
  
  let correctCount = 0;
  const totalQuestions = userAnswers.length;
  const detailedResults = [];
  
  // 模組正確率統計
  const moduleCorrectMap = {};
  const moduleTotalMap = {};
  
  userAnswers.forEach(ua => {
    const q = qMap[ua.questionId];
    if (!q) return;
    
    const isCorrect = String(ua.selectedOption).toUpperCase() === String(q.correctAnswer).toUpperCase();
    if (isCorrect) correctCount++;
    
    // 統計模組正確率
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
  
  // 計算 moduleBreakdown JSON
  const moduleBreakdown = {};
  for (const modId in moduleTotalMap) {
    moduleBreakdown[modId] = {
      total: moduleTotalMap[modId],
      correct: moduleCorrectMap[modId] || 0,
      rate: Math.round(((moduleCorrectMap[modId] || 0) / moduleTotalMap[modId]) * 100)
    };
  }
  
  const examId = generateUUID();
  const examRecord = {
    examId: examId,
    examType: examType,
    date: formatDate(new Date()),
    totalQuestions: totalQuestions,
    correctCount: correctCount,
    score: score,
    timeSpent: timeSpent,
    moduleBreakdown: JSON.stringify(moduleBreakdown)
  };
  
  insertRow('ExamResults', examRecord);
  
  return {
    examId: examId,
    score: score,
    correctCount: correctCount,
    totalQuestions: totalQuestions,
    timeSpent: timeSpent,
    moduleBreakdown: moduleBreakdown,
    details: detailedResults
  };
}

/**
 * 取得歷次測驗結果
 */
function getExamResults() {
  const data = getTableData('ExamResults');
  return data.map(row => {
    let breakdown = {};
    try {
      breakdown = JSON.parse(row.moduleBreakdown);
    } catch(e) {}
    return {
      ...row,
      date: row.date,
      score: Number(row.score),
      totalQuestions: Number(row.totalQuestions),
      correctCount: Number(row.correctCount),
      timeSpent: Number(row.timeSpent),
      moduleBreakdown: breakdown
    };
  }).sort((a, b) => new Date(b.date) - new Date(a.date)); // 由新到舊
}

/**
 * 隨機打亂陣列
 */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
