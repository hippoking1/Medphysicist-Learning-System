# 醫學物理師考照自學系統 — 系統架構與設計文件 (System Reference v3.5)

本文件紀錄 **v3.5** 在 `/rightproblem-coach`、`/unslop` 與 `/ponytail` 審核後之身分認證、資安零金鑰架構與互動模擬實驗室設計。

---

## 1. 技術棧與核心架構

- **託管與部署注入**：GitHub Pages 搭配 `.github/workflows/deploy.yml`，於建置期自 GitHub Repository Secret (`FIREBASE_CONFIG`) 注入 `DEFAULT_FIREBASE_CONFIG`，確保 Git 原始碼零憑證。
- **認證與資料庫隔離**：Firebase Authentication (Google OAuth Sign-in) 搭配 Cloud Firestore `/users/{uid}/...` 個人隔離空間與 `firestore.rules` 伺服器端強制校驗；未登入時自動降級至 `localStorage` (`mp_*`)，切換帳號時自動隔離/清理快取。
- **Gemini AI 雙軌授權引擎**：
  1. 優先採用 Google OAuth Access Token (`generative-language` scope，僅存 `sessionStorage`)。
  2. 支援透過 Web Credential Management API (`PasswordCredential` + `<form autocomplete>`) 綁定 Google Email 自動帶入 API Key 至本機 `sessionStorage`，**絕不寫入 Firestore、LocalStorage 或 JSON 備份檔**。
- **互動式醫學物理實驗室 (`js/diagrams.js`)**：採用單一事件委派引擎驅動全 16 種臨床與放射物理模擬器，支援即時參數滑桿、模式切換、`getScreenCTM()` 游標十字探針讀數與組件點擊檢視。

---

## 2. 模組職責

- `firebase.json` & `firestore.rules`：宣告式 Firestore 安全規則，鎖定 `request.auth.uid == userId`、伺服器端禁止於 `config/settings` 寫入 `geminiApiKey`，並支援原擁有者讀取遷移 v3.0 頂層集合。
- `index.html`：SPA 入口、Firebase Auth/Firestore Compat SDK、側邊欄 Google 帳號卡與系統設定雙軌授權介面。
- `css/style.css`：Ink Dark (`#0d1017`) 與 Warm Paper (`#f7f4ee`) 雙主題設計系統、4px 網格與 `.mp-lab` 實驗室讀數列樣式。
- `js/firebase-config.js`：`signInWithGoogle`、`authorizeGeminiOAuth`、`signOutGoogle`、`waitForInitialAuth`、`onAuthChanged` 及伺服器實測探針。
- `js/db.js`：`/users/{uid}` 雙模 DAO、v3.0 舊版頂層資料自動上雲遷移、`FieldValue.delete()` 歷史明文金鑰自動銷毀、`PasswordCredential` 本機存取與全 10 模組模擬考組卷。
- `js/gemini.js`：`_fetchWithAuth` 雙軌認證（OAuth Bearer Token + Session API Key 自動降級容錯）與 45–150 秒 `AbortController` 超時防護。
- `js/diagrams.js`：16 座互動式醫學物理模擬實驗室 (`_LAB_BUILDERS`)、0-Token NotebookLM 公式保護型 Markdown 解析器與舊式 SVG 色階正規化。
- `js/charts.js`：動態讀取 CSS 變數繪製圓環進度圖、7 日學習折線圖與 M1~M10 10 軸雷達圖。
- `js/timer.js`：基於 `Date.now()` 時間戳差值與 `sessionStorage` 之防背景節流計時器。
- `js/app.js` & `js/router.js`：8 大頁面控制器、`syncAuthUI` 狀態同步、Auth 切換自動重整視圖與題庫/閃卡閉環。
