/**
 * 載入指定 HTML 檔案的內容（用於 GAS 樣板 include）
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 產生 UUID v4
 */
function generateUUID() {
  return Utilities.getUuid();
}

/**
 * 格式化日期為 YYYY-MM-DD
 */
function formatDate(date) {
  if (!date) return '';
  if (typeof date === 'string') return date.split('T')[0];
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const month = '' + (d.getMonth() + 1);
  const day = '' + d.getDate();
  const year = d.getFullYear();
  return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
}

/**
 * 將日誌寫入 Google Sheets 中的 Logs 工作表 (若工作表不存在會自動建立)
 */
function logToSheet(tag, message) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    let sheet = ss.getSheetByName('Logs');
    if (!sheet) {
      sheet = ss.insertSheet('Logs');
      sheet.appendRow(['Timestamp', 'Tag', 'Message']);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), tag, String(message)]);
  } catch(e) {
    // 靜態忽略，以防干擾正常邏輯
  }
}
