# 醫學物理師考照自學系統 — 系統架構與設計文件 (System Reference v3.0)

本文件紀錄 **v3.0** 在 `/rightproblem-coach`、`/unslop` 與 `/ponytail` 審核後之架構設計、確定性繪圖引擎、Firebase 搬移機制與互動閉環。

---

## 1. 技術棧與檔案職責

- **託管平台**：GitHub Pages（零編譯純靜態 HTML5 / CSS3 / Vanilla JS SPA）。
- **資料庫**：Firebase Cloud Firestore（搭配 `enablePersistence` 離線快取），未配置時無縫降級至 `localStorage` (`mp_*`)。
- **AI 引擎**：前端直連 Google Gemini REST API (`gemini-2.5-flash` 等)，具備 45 秒 `AbortController` 超時防護與 `repairJsonBackslashes` LaTeX 容錯修復。
- **排版與公式**：`Inter` + `Noto Sans TC` + `JetBrains Mono` (`tabular-nums`)、MathJax 3 LaTeX 渲染。

### 模組職責
- `index.html`：SPA 入口、雙主題前導腳本、8 大頁面 `<template>` 與 6 組原生 `<dialog>`。
- `css/style.css`：Ink Dark (`#0d1017`) 與 Warm Paper (`#f7f4ee`) 雙主題設計系統，採 4px 網格與平面實色階層。
- `js/firebase-config.js`：`parseFirebaseConfigInput` 整段貼上拆解與 `verifyFirebaseConnection` 伺服器實測探針。
- `js/db.js`：Firestore/LocalStorage 雙模 DAO、`syncToFirestore` 400 筆分批寫入引擎、`pushLocalToFirebase`、`pullFirebaseToLocal`、`migrateFromGoogleSheet`、全 10 模組模擬考組卷與歷史明細儲存。
- `js/diagrams.js`：確定性醫學物理繪圖引擎，包含 `PhysicsPlotter` (200 點公式取樣曲線) 與 `ClinicalBlueprints` (工程級幾何藍圖) 及舊式 SVG 色彩正規化。
- `js/charts.js`：動態讀取 CSS 變數繪製圓環進度圖、7 日學習折線圖與 **M1~M10 10 軸雷達圖**。
- `js/timer.js`：基於 `Date.now()` 時間戳差值與 `sessionStorage` 之防背景節流計時器。
- `js/app.js` & `js/router.js`：8 大頁面控制器、題庫互動盲測與一鍵轉 SM-2 閃卡閉環。
