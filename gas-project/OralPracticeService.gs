/**
 * 口試模擬練習服務 (OralPracticeService)
 */

/**
 * 取得口試歷史練習記錄
 */
function getOralPractices() {
  const data = getTableData('OralPractice');
  return data.map(row => {
    let feedback = {};
    try {
      feedback = JSON.parse(row.aiFeedback);
    } catch(e) {}
    return {
      ...row,
      aiScore: Number(row.aiScore),
      aiFeedback: feedback,
      date: formatDate(row.date)
    };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * 取得口試模擬題目 (串接 Gemini 生成)
 */
function getNewOralQuestion(moduleId, questionType) {
  const result = generateOralQuestionAI(moduleId, questionType);
  return {
    moduleId: moduleId,
    questionType: questionType,
    question: result.question,
    referenceAnswer: result.referenceAnswer
  };
}

/**
 * 提交口試答案，進行 AI 評估，並將練習記錄存檔
 */
function submitOralAnswer(moduleId, questionType, question, referenceAnswer, userAnswer) {
  if (!userAnswer || userAnswer.trim() === '') {
    throw new Error('回答內容不可為空');
  }
  
  // 呼叫 Gemini 評分
  const evaluation = gradeOralAnswerAI(question, questionType, referenceAnswer, userAnswer);
  
  const practiceId = generateUUID();
  const record = {
    practiceId: practiceId,
    moduleId: moduleId,
    questionType: questionType,
    question: question,
    userAnswer: userAnswer,
    aiScore: Number(evaluation.score || 0),
    aiFeedback: JSON.stringify(evaluation),
    referenceAnswer: referenceAnswer,
    date: formatDate(new Date())
  };
  
  insertRow('OralPractice', record);
  
  return {
    practiceId: practiceId,
    score: Number(evaluation.score || 0),
    completeness: Number(evaluation.completeness || 0),
    accuracy: Number(evaluation.accuracy || 0),
    logic: Number(evaluation.logic || 0),
    depth: Number(evaluation.depth || 0),
    feedback: evaluation.feedback || '',
    missingPoints: evaluation.missingPoints || [],
    referenceAnswer: referenceAnswer
  };
}
