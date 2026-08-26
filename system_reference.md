# 醫學物理師考照自學系統 — 系統架構與關鍵設計文件 (System Reference)

本文件整理了「醫學物理師考照自學系統」在 **v2.5 架構 (GitHub Pages + Firebase + Gemini REST API)** 下的架構設計、核心流程、關鍵優化與 Ponytail Audit 簡約化紀錄。主要作為後續維護與 AI 代理 (Agent) 讀取之上下文。

---

## 1. 系統技術棧與架構

本系統採用 **無伺服器 (Serverless) 純靜態 SPA 結構**：
- **託管平台 (Hosting)**：GitHub Pages，純靜態 HTML5 / CSS3 / Vanilla JS 部署，具備全球 CDN 快取、HTTPS 與零運維成本。
- **資料庫 (Database)**：**Firebase Cloud Firestore**（NoSQL 集合與文件結構），搭配 IndexedDB 本地離線持久化快取 (`enablePersistence`)。在未設定 Firebase 時自動無縫降級至 LocalStorage 離線模式。
- **AI 引擎**：前端直連 **Google Gemini REST API** (`gemini-2.5-flash` / `gemini-2.0-flash`)，支援 AbortController 逾時防護、LaTeX 雙反斜線自動容錯修復與 SVG 向量圖防重疊渲染。
- **前端介面 (UI/UX)**：採用 Vanilla CSS 設計的深色擬玻感 (Dark Glassmorphism) 介面，搭配 HTML5 原生 `<dialog>` 彈窗、MathJax 3 LaTeX 公式渲染與 Canvas 輕量圖表引擎。

### 專案檔案清單與職責
- **index.html**：SPA 進入點，包含導覽列、懸浮計時器、Toast、8 大頁面 `<template>` 與 5 組原生 `<dialog>`。
- **css/style.css**：全站深色擬玻感樣式表，支援響應式佈局 (含手機端專屬覆寫)、MathJax 與 SVG 容器適配。
- **js/syllabus-data.js**：10 大模組 (M1~M10)、37 個學習單元與指定文獻章節之常數種子資料。
- **js/firebase-config.js**：Firebase Web SDK 初始化、Firestore 連線管理與前端自訂配置儲存。
- **js/db.js**：Firestore DAO 資料存取層，處理所有集合的 CRUD、SM-2 演算法、資料庫自癒種子注入與完整 JSON 備份/還原。
- **js/gemini.js**：Gemini REST API 呼叫層，處理四選一出題、口試四維度評分、SM-2 閃卡提煉、單元重點整理與 LaTeX 跳脫修復。
- **js/charts.js**：HTML5 Canvas 圖表引擎，繪製圓環進度圖 (Donut)、7 日學習折線圖 (Line) 與 7 軸模組弱點雷達圖 (Radar)。
- **js/timer.js**：全域懸浮學習計時器 (StudyTimer) 與模擬測驗倒數計時器 (ExamTimer)。
- **js/router.js**：Hash-based SPA 路由器與通用課綱選單連動工具 (`bindModuleTopicSelectors`, `bindModuleUnitSelectors`)。
- **js/app.js**：8 大頁面控制器邏輯 (Dashboard, Syllabus, Practice, Exam, Review, Oral, Journal, Settings)。

---

## 2. Ponytail Audit 簡約化與關鍵設計優化

依據 **Ponytail 決策階梯 (Decision Ladder)**，系統完成了以下深度審核與優化：

### 2.1 剔除 GAS 專屬中介層與 Date 序列化陷阱
- **改善**：拔除原 GAS 架構下的 `google.script.run` 轉發層與 30+ 個 `api*()` 樣板函式。全面移除為防 Date 序列化崩潰而設置的 `val instanceof Date` 補丁，改為標準 ISO 8601 日期字串。

### 2.2 原生 Web API 取代第三方/自製邏輯
- **UUID**：全面採用瀏覽器原生安全隨機 API `crypto.randomUUID()`，刪除自製隨機正則函式。
- **彈窗 Modal**：所有彈窗重構為 HTML5 原生 `<dialog>`，利用 `.showModal()`、`.close()` 與 CSS `::backdrop` 擬玻感背景，天然具備 `Esc` 鍵關閉與焦點鎖定 (Focus Trap) 特性。
- **HTTP 通訊**：採用原生 `fetch()` 直連 Gemini API，並掛載 `AbortController` 進行 45 秒超時防護。

### 2.3 消除重複代碼：配置驅動的通用選單工具
- **改善**：在 `js/router.js` 中封裝 `bindModuleTopicSelectors` 與 `bindModuleUnitSelectors`，消除題庫頁面與卡片複習頁面重複編寫 50+ 行選單連動 DOM 操作的冗餘。

### 2.4 零設定自癒與資料庫完整 JSON 備份
- **自癒種子 (Self-Healing)**：首次載入系統或點擊修復時，系統自動偵測 Firestore / LocalStorage 是否有課綱資料，若無則自動注入 37 個單元的完整課綱、指定文獻與預設設定。
- **資料庫備份與還原**：在「系統設定」支援一鍵完整匯出所有進度、題庫、卡片、測驗與口試紀錄為單一 JSON 檔案，並支援一鍵還原，徹底解決數據丟失風險。

---

## 3. 核心演算法與 AI Prompt 設計

### 3.1 知識卡間隔重複 (SuperMemo-2 / SM-2 演算法)
實作於 [js/db.js](file:///d:/Code/Antigravity/物理師考照/js/db.js)：
- 評分分數 `score` 為 0-5。
- 若 `score >= 3`（答對）：
  - 第一次複習 (`repetitions = 0`)：間隔 `I = 1` 天。
  - 第二次複習 (`repetitions = 1`)：間隔 `I = 6` 天。
  - 大於兩次 (`repetitions > 1`)：間隔 `I = Math.round(上一次間隔 * EF)`。
  - 更新容易度因子：`EF = EF + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02))`，下限為 `1.3`。
- 若 `score < 3`（答錯）：
  - `repetitions = 0`，`I = 1`（明天立刻重新複習），維持當前 `EF`。

### 3.2 AI 口試四維度評分 (Gemini Service)
實作於 [js/gemini.js](file:///d:/Code/Antigravity/物理師考照/js/gemini.js)：
1. **完整度 (completeness, 25分)**：是否涵蓋標準答案核心要點與關鍵字。
2. **正確性 (accuracy, 25分)**：物理觀念、公式及臨床步驟是否正確無誤。
3. **邏輯性 (logic, 25分)**：論述先後順序與因果邏輯是否合理。
4. **深度 (depth, 25分)**：對 AAPM TG 報告等國際指引之了解深度。
輸出詳細回饋、缺失概念列表 (Missing Points) 與標準高分解答。

### 3.3 LaTeX 轉義容錯與 SVG 向量圖防重疊
- 在 `GeminiService.repairJsonBackslashes()` 中，自動將非 JSON 合法跳脫的單反斜線（如 `\lambda`）修復為雙反斜線（`\\lambda`），避免 `JSON.parse` 崩潰。
- 在出題 Prompt 中強制規範 SVG 的寬度為 100%、高對比線條，且文字 `<text>` 與圖形線條保持至少 15~20px 偏移距離，防止文字重疊。

---

## 4. 資料庫結構 (Firestore Collections)

1. `syllabus`：37 個學習單元（文件 ID 為 `U1.1.1` 等）。
2. `progress`：學習狀態、開始/完成日期、累計分鐘、研讀筆記。
3. `questions`：練習題目（包含選項、正解、詳解、文獻來源、核可狀態）。
4. `reviewCards`：SM-2 閃卡（正反面、間隔天數、容易度因子、下次複習日期、重複次數）。
5. `examResults`：模擬考成績、花費秒數、模組正確率分佈 JSON。
6. `oralPractices`：口試模擬紀錄（題目、考生作答、AI 四維度評分、缺失點、參考答案）。
7. `studyLogs`：學習日誌（日期、單元、研讀時數、心得筆記）。
8. `config`：系統設定文件（考試日期、每日目標、NotebookLM 網址、Gemini API Key、模型）。
