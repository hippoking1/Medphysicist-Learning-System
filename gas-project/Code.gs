/**
 * 醫學物理師考照自學系統 (ROC Medical Physicist Study WebApp)
 * 主進入點與 API 轉發路由 (Code.gs)
 */

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');
  return template.evaluate()
    .setTitle('醫學物理師自學系統')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ==========================================
// API 路由轉發 (給 google.script.run 呼叫)
// ==========================================

function apiInitializeSheets() {
  return initializeSheets();
}

function apiGetConfig(key) {
  return getConfig(key);
}

function apiSaveConfig(key, value) {
  return saveConfig(key, value);
}

function apiGetSyllabus() {
  return getSyllabus();
}

function apiGetProgress() {
  return getProgress();
}

function apiUpdateProgress(unitId, status, minutes, notes) {
  return updateProgress(unitId, status, minutes, notes);
}

function apiGetQuestions(moduleId, topicId) {
  return getQuestions(moduleId, topicId);
}

function apiAddManualQuestion(questionObj) {
  return addManualQuestion(questionObj);
}

function apiVerifyQuestion(questionId) {
  return verifyQuestion(questionId);
}

function apiDeleteQuestion(questionId) {
  return deleteQuestion(questionId);
}

function apiGenerateAIQuestions(moduleId, topicId, count, difficulty, unitId) {
  return generateAIQuestions(moduleId, topicId, count, difficulty, unitId);
}

function apiGenerateExam(examType, moduleId) {
  return generateExam(examType, moduleId);
}

function apiSubmitExam(examType, userAnswers, timeSpent, moduleId) {
  return submitExam(examType, userAnswers, timeSpent, moduleId);
}

function apiGetExamResults() {
  return getExamResults();
}

function apiGetReviewCards() {
  return getReviewCards();
}

function apiGetDueReviewCards() {
  return getDueReviewCards();
}

function apiAddManualReviewCard(moduleId, unitId, front, back) {
  return addManualReviewCard(moduleId, unitId, front, back);
}

function apiDeleteReviewCard(cardId) {
  return deleteReviewCard(cardId);
}

function apiSubmitReviewCardScore(cardId, score) {
  return submitReviewCardScore(cardId, score);
}

function apiGenerateFlashcardsAI(moduleId, unitId, textContent) {
  return generateFlashcardsAI(moduleId, unitId, textContent);
}

function apiGetOralPractices() {
  return getOralPractices();
}

function apiGetNewOralQuestion(moduleId, questionType) {
  return getNewOralQuestion(moduleId, questionType);
}

function apiSubmitOralAnswer(moduleId, questionType, question, referenceAnswer, userAnswer) {
  return submitOralAnswer(moduleId, questionType, question, referenceAnswer, userAnswer);
}

function apiGetStudyLogs() {
  return getStudyLogs();
}

function apiAddManualStudyLog(unitId, minutes, journalEntry) {
  return addManualStudyLog(unitId, minutes, journalEntry);
}

function apiGetDashboardData() {
  return getDashboardData();
}

function apiGenerateUnitSummary(unitId) {
  return generateUnitSummaryAI(unitId);
}

function apiGetUnitQuiz(unitId, moduleId, topicId) {
  return getUnitQuiz(unitId, moduleId, topicId);
}
