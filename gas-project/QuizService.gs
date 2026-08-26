/**
 * 練習題庫服務 (QuizService)
 */

/**
 * 取得特定模組/主題下的所有練習題
 */
function getQuestions(moduleId, topicId) {
  const allQs = getTableData('Questions');
  Logger.log('[getQuestions] 請求參數 - moduleId: ' + moduleId + ', topicId: ' + topicId);
  Logger.log('[getQuestions] 從試算表讀取到的總題數: ' + allQs.length);
  
  if (allQs.length > 0) {
    Logger.log('[getQuestions] 範例資料欄位 key: ' + Object.keys(allQs[0]).join(', '));
    Logger.log('[getQuestions] 第一題對比值 - q.moduleId: "' + allQs[0].moduleId + '", q.topicId: "' + allQs[0].topicId + '"');
  }
  
  const filtered = allQs.filter(q => {
    const qMod = q.moduleId ? String(q.moduleId).trim().toUpperCase() : '';
    const qTopic = q.topicId ? String(q.topicId).trim().toUpperCase() : '';
    const targetMod = moduleId ? String(moduleId).trim().toUpperCase() : '';
    const targetTopic = topicId ? String(topicId).trim().toUpperCase() : '';
    
    const matchMod = !moduleId || qMod === targetMod;
    const matchTopic = !topicId || qTopic === targetTopic;
    return matchMod && matchTopic;
  });
  
  Logger.log('[getQuestions] 篩選後符合的題數: ' + filtered.length);
  return filtered;
}

/**
 * 手動新增單選題
 */
function addManualQuestion(questionObj) {
  const qId = generateUUID();
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
    createdAt: formatDate(new Date())
  };
  
  insertRow('Questions', newQ);
  return newQ;
}

/**
 * 驗證（核可）AI 生成的題目
 */
function verifyQuestion(questionId) {
  return updateRow('Questions', 'questionId', questionId, { verified: true });
}

/**
 * 刪除題目
 */
function deleteQuestion(questionId) {
  return deleteRow('Questions', 'questionId', questionId);
}

/**
 * 取得特定單元小節隨堂測驗題目（3-5題，隨機挑選，若不足則自動呼叫 AI 生成）
 */
function getUnitQuiz(unitId, moduleId, topicId) {
  // 自動自癒：若資料庫表頭尚未建立 unitId 欄位，自動執行 initializeSheets() 進行補齊
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Questions');
    if (sheet) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      if (headers.indexOf('unitId') === -1) {
        Logger.log('[getUnitQuiz] 檢測到 Questions 表缺乏 unitId 欄位，啟動自癒修復表頭...');
        initializeSheets();
      }
    }
  } catch(e) {
    Logger.log('[getUnitQuiz] 表頭自癒檢測出錯: ' + e.message);
  }

  // 優先以 unitId 篩選題庫中的題目
  const allQs = getTableData('Questions');
  let list = allQs.filter(q => q.unitId === unitId);
  
  // 自癒功能：如果該單元下的題庫題目小於 3 題，自動呼叫 Gemini 針對該單元當場多生 3 題
  if (list.length < 3) {
    try {
      generateAIQuestions(moduleId, topicId, 3, 2, unitId); // 傳入 unitId 限制精準範圍
      // 重新讀取該單元的題目
      const updatedQs = getTableData('Questions');
      list = updatedQs.filter(q => q.unitId === unitId);
    } catch(e) {
      Logger.log("隨堂測驗動態出題失敗: " + e.message);
    }
  }
  
  // 隨機排序並挑選 3-5 題（若總題數不夠 3 題，有多少取多少）
  const shuffled = list.sort(() => 0.5 - Math.random());
  const count = Math.min(Math.max(list.length, 3), 5);
  return shuffled.slice(0, count);
}
