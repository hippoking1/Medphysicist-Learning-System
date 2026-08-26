/**
 * 學習進度追蹤服務 (ProgressService)
 */

/**
 * 取得所有單元的學習進度（合併課綱與進度資料）
 */
function getProgress() {
  const syllabus = getSyllabus();
  const progressList = getTableData('Progress');
  
  // 建立進度 Map
  const progressMap = {};
  progressList.forEach(p => {
    progressMap[p.unitId] = p;
  });
  
  // 合併
  return syllabus.map(unit => {
    const prog = progressMap[unit.unitId] || {};
    return {
      ...unit,
      status: prog.status || 'not_started',
      startDate: prog.startDate ? formatDate(prog.startDate) : '',
      completeDate: prog.completeDate ? formatDate(prog.completeDate) : '',
      totalMinutes: Number(prog.totalMinutes || 0),
      notes: prog.notes || ''
    };
  });
}

/**
 * 更新單元學習進度
 */
function updateProgress(unitId, status, minutes, notes) {
  const progressList = getTableData('Progress');
  const existing = progressList.find(p => p.unitId === unitId);
  
  const today = formatDate(new Date());
  
  let dataToSave = {
    unitId: unitId,
    status: status,
    notes: notes !== undefined ? notes : (existing ? existing.notes : '')
  };
  
  // 計算累計時間
  let additionalMinutes = Number(minutes || 0);
  let currentTotalMinutes = existing ? Number(existing.totalMinutes || 0) : 0;
  dataToSave.totalMinutes = currentTotalMinutes + additionalMinutes;
  
  if (status === 'in_progress') {
    dataToSave.startDate = existing && existing.startDate ? formatDate(existing.startDate) : today;
  } else if (status === 'completed') {
    dataToSave.startDate = existing && existing.startDate ? formatDate(existing.startDate) : today;
    dataToSave.completeDate = today;
  } else if (status === 'not_started') {
    dataToSave.startDate = '';
    dataToSave.completeDate = '';
    dataToSave.totalMinutes = 0;
  }
  
  let success = false;
  if (existing) {
    success = updateRow('Progress', 'unitId', unitId, dataToSave);
  } else {
    success = insertRow('Progress', dataToSave);
  }
  
  // 如果有新增時間，同時寫入 StudyLog 學習日誌
  if (additionalMinutes > 0) {
    insertRow('StudyLog', {
      date: today,
      unitId: unitId,
      minutes: additionalMinutes,
      journalEntry: `學習單元：${unitId}。新增時數。`
    });
  }
  
  return { success: success, data: dataToSave };
}
