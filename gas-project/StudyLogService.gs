/**
 * 學習日誌與統計服務 (StudyLogService)
 */

/**
 * 取得所有學習日誌
 */
function getStudyLogs() {
  const data = getTableData('StudyLog');
  return data.map(row => {
    return {
      ...row,
      minutes: Number(row.minutes || 0),
      date: formatDate(row.date)
    };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * 手動新增學習日誌
 */
function addManualStudyLog(unitId, minutes, journalEntry) {
  const today = formatDate(new Date());
  const record = {
    date: today,
    unitId: unitId || 'General',
    minutes: Number(minutes),
    journalEntry: journalEntry
  };
  
  insertRow('StudyLog', record);
  return record;
}

/**
 * 取得儀表板綜合統計數據
 */
function getDashboardData() {
  const progressList = getProgress();
  const logs = getStudyLogs();
  const examResults = getExamResults();
  const dueCards = getDueReviewCards();
  
  const examDateStr = getConfig('examDate') || '2027-10-01';
  const startDateStr = getConfig('startDate') || formatDate(new Date());
  const dailyGoal = Number(getConfig('dailyGoalMinutes') || 45);
  
  // 1. 計算倒數天數
  const today = new Date();
  today.setHours(0,0,0,0);
  const examDate = new Date(examDateStr);
  examDate.setHours(0,0,0,0);
  const timeDiff = examDate.getTime() - today.getTime();
  const daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
  
  // 2. 計算總進度
  const totalUnits = progressList.length;
  const completedUnits = progressList.filter(p => p.status === 'completed').length;
  const inProgressUnits = progressList.filter(p => p.status === 'in_progress').length;
  const overallProgressPercent = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
  
  // 3. 計算模組細部進度
  const moduleProgress = {};
  const modules = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];
  const moduleNames = {
    M1: '基礎放射物理', M2: '臨床劑量學', M3: '治療計劃與射束', 
    M4: '特殊治療技術', M5: '品質保證', M6: '影像物理與QC', M7: '輻防安全',
    M8: '基礎醫學', M9: '放射生物學', M10: '計算機概論'
  };
  
  modules.forEach(mId => {
    const modUnits = progressList.filter(p => p.moduleId === mId);
    const modCompleted = modUnits.filter(p => p.status === 'completed').length;
    moduleProgress[mId] = {
      name: moduleNames[mId],
      total: modUnits.length,
      completed: modCompleted,
      percent: modUnits.length > 0 ? Math.round((modCompleted / modUnits.length) * 100) : 0
    };
  });
  
  // 4. 計算學習時數統計 (累計 & 連續天數)
  let totalMinutes = 0;
  logs.forEach(log => {
    totalMinutes += log.minutes;
  });
  
  // 計算連續學習天數 (Streak)
  const uniqueDates = [...new Set(logs.map(l => l.date))].sort((a,b) => new Date(b) - new Date(a));
  let streak = 0;
  let checkDate = new Date();
  checkDate.setHours(0,0,0,0);
  
  // 檢查今天是否有讀書，若無，從昨天開始算
  const todayStr = formatDate(checkDate);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);
  
  let hasToday = uniqueDates.includes(todayStr);
  let hasYesterday = uniqueDates.includes(yesterdayStr);
  
  if (hasToday || hasYesterday) {
    let currentCheck = hasToday ? checkDate : yesterday;
    while(true) {
      const currentCheckStr = formatDate(currentCheck);
      if (uniqueDates.includes(currentCheckStr)) {
        streak++;
        currentCheck.setDate(currentCheck.getDate() - 1);
      } else {
        break;
      }
    }
  }
  
  // 5. 本週每日學習時間 (過去 7 天)
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7Days.push(formatDate(d));
  }
  
  const weeklyDailyMinutes = last7Days.map(dateStr => {
    const dayLogs = logs.filter(l => l.date === dateStr);
    const sum = dayLogs.reduce((acc, log) => acc + log.minutes, 0);
    return { date: dateStr.substring(5), minutes: sum }; // 只取 MM-DD 顯示
  });
  
  // 6. 最近測驗平均成績
  const recentExams = examResults.slice(0, 5);
  const averageExamScore = recentExams.length > 0 
    ? Math.round(recentExams.reduce((acc, r) => acc + r.score, 0) / recentExams.length) 
    : 0;

  return {
    daysRemaining: daysRemaining,
    overallProgressPercent: overallProgressPercent,
    completedUnits: completedUnits,
    totalUnits: totalUnits,
    inProgressUnits: inProgressUnits,
    moduleProgress: moduleProgress,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    streak: streak,
    weeklyDailyMinutes: weeklyDailyMinutes,
    averageExamScore: averageExamScore,
    dueReviewCardsCount: dueCards.length,
    dailyGoalMinutes: dailyGoal
  };
}
