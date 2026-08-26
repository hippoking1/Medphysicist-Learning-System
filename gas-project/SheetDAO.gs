/**
 * Sheets 資料存取層 (Data Access Object)
 */

const SHEETS_CONFIG = {
  Syllabus: ['moduleId', 'moduleName', 'topicId', 'topicName', 'unitId', 'unitName', 'literature', 'chapters', 'plannedWeek', 'estimatedMinutes', 'orderIndex'],
  Progress: ['unitId', 'status', 'startDate', 'completeDate', 'totalMinutes', 'notes'],
  Questions: ['questionId', 'moduleId', 'topicId', 'unitId', 'difficulty', 'questionText', 'optionA', 'optionB', 'optionC', 'optionD', 'correctAnswer', 'explanation', 'sourceRef', 'source', 'verified', 'createdAt'],
  StudyLog: ['date', 'unitId', 'minutes', 'journalEntry'],
  ReviewCards: ['cardId', 'moduleId', 'unitId', 'front', 'back', 'interval', 'easeFactor', 'nextReviewDate', 'repetitions'],
  ExamResults: ['examId', 'examType', 'date', 'totalQuestions', 'correctCount', 'score', 'timeSpent', 'moduleBreakdown'],
  OralPractice: ['practiceId', 'moduleId', 'questionType', 'question', 'userAnswer', 'aiScore', 'aiFeedback', 'referenceAnswer', 'date'],
  Config: ['key', 'value']
};

/**
 * 取得試算表物件
 */
function getSpreadsheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {
    // 容器無效，改以 Script Properties 中記錄的 ID 開啟
  }
  const propId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (propId) {
    return SpreadsheetApp.openById(propId);
  }
  throw new Error('未設定有效的 Google Sheet 試算表。請確認專案是否綁定試算表，或設定 SPREADSHEET_ID 屬性。');
}

/**
 * 初始化所有 Sheets 與資料表欄位
 */
function initializeSheets() {
  const ss = getSpreadsheet();
  for (const sheetName in SHEETS_CONFIG) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    const headers = SHEETS_CONFIG[sheetName];
    // 如果是空的，寫入 Header
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    } else {
      // 確保 header 符合定義 (擴充或維持)
      const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const newHeaders = [...existingHeaders];
      let changed = false;
      headers.forEach(h => {
        if (!newHeaders.includes(h)) {
          newHeaders.push(h);
          changed = true;
        }
      });
      if (changed) {
        sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
      }
    }
  }
  
  // 寫入預設 Config
  const configs = [
    { key: 'examDate', value: '2027-10-01' },
    { key: 'startDate', value: formatDate(new Date()) },
    { key: 'dailyGoalMinutes', value: '45' },
    { key: 'geminiApiKey', value: '' },
    { key: 'geminiModel', value: 'gemini-2.0-flash' }
  ];
  configs.forEach(c => {
    if (!getConfig(c.key)) {
      saveConfig(c.key, c.value);
    }
  });

  // 強制重新載入最新的課綱資料以補齊/重整課綱
  initializeSyllabusData();

  return { success: true, message: '試算表初始化完成' };
}

/**
 * 取得指定 Sheet 的所有資料，回傳物件陣列
 */
function getTableData(sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return [];
  
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0];
  const results = [];
  
  for (let i = 1; i < values.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      // 移除隱藏字元（如 BOM）並去除首尾空格
      const headerKey = String(headers[j]).replace(/[^\x20-\x7E]/g, "").trim();
      if (headerKey) {
        let val = values[i][j];
        if (val instanceof Date) {
          val = formatDate(val); // 避免 Date 物件導致 google.script.run 序列化失敗
        }
        row[headerKey] = val;
      }
    }
    results.push(row);
  }
  return results;
}

/**
 * 寫入一筆新資料到指定 Sheet
 */
function insertRow(sheetName, dataObj) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('找不到工作表: ' + sheetName);
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowValue = headers.map(h => dataObj[h] !== undefined ? dataObj[h] : '');
  sheet.appendRow(rowValue);
  return true;
}

/**
 * 批次寫入新資料到指定 Sheet
 */
function insertRows(sheetName, dataObjArray) {
  if (!dataObjArray || dataObjArray.length === 0) return true;
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('找不到工作表: ' + sheetName);
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = dataObjArray.map(obj => {
    return headers.map(h => obj[h] !== undefined ? obj[h] : '');
  });
  
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, values.length, headers.length).setValues(values);
  return true;
}

/**
 * 更新指定 Sheet 中符合 key = val 的第一筆資料
 */
function updateRow(sheetName, keyCol, keyVal, updatedDataObj) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('找不到工作表: ' + sheetName);
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const keyIndex = headers.indexOf(keyCol);
  if (keyIndex === -1) throw new Error(`找不到關鍵欄位: ${keyCol}`);
  
  const keyValues = sheet.getRange(1, keyIndex + 1, lastRow, 1).getValues();
  let rowIndex = -1;
  for (let i = 1; i < keyValues.length; i++) {
    if (String(keyValues[i][0]) === String(keyVal)) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return false; // 找不到匹配項目
  
  // 逐一更新有提供的屬性
  const range = sheet.getRange(rowIndex, 1, 1, headers.length);
  const currentValues = range.getValues()[0];
  const newValues = currentValues.map((val, idx) => {
    const headerName = headers[idx];
    return updatedDataObj[headerName] !== undefined ? updatedDataObj[headerName] : val;
  });
  
  range.setValues([newValues]);
  return true;
}

/**
 * 刪除指定 Sheet 中符合 key = val 的資料
 */
function deleteRow(sheetName, keyCol, keyVal) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('找不到工作表: ' + sheetName);
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const keyIndex = headers.indexOf(keyCol);
  if (keyIndex === -1) throw new Error(`找不到關鍵欄位: ${keyCol}`);
  
  const keyValues = sheet.getRange(1, keyIndex + 1, lastRow, 1).getValues();
  // 從後面往前刪除，避免索引偏移
  let deletedCount = 0;
  for (let i = keyValues.length - 1; i >= 1; i--) {
    if (String(keyValues[i][0]) === String(keyVal)) {
      sheet.deleteRow(i + 1);
      deletedCount++;
    }
  }
  return deletedCount > 0;
}

/**
 * 讀取 Config 設定值
 */
function getConfig(key) {
  const configs = getTableData('Config');
  const found = configs.find(c => c.key === key);
  return found ? found.value : '';
}

/**
 * 寫入/更新 Config 設定值
 */
function saveConfig(key, value) {
  const success = updateRow('Config', 'key', key, { key: key, value: String(value) });
  if (!success) {
    insertRow('Config', { key: key, value: String(value) });
  }
  return true;
}
