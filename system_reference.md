# 醫學物理師考照自學系統 — 系統架構與設計文件 (System Reference v4.0)

本文件紀錄 **v4.0** 整合 `/rightproblem-coach`、`/security-audit`、`/modern-web-guidance`、`/ponytail`、`/unslop`、`/frontend-design-html` 與 `/gsap-plugins` 後之高效率快取架構、資安縱深防線與現代化前端設計。

---

## 1. 核心架構演進 (v3.5 → v4.0)

- **零延遲資料快取層 (`js/db.js`)**：將原本重複 8 次的 Firestore / LocalStorage 讀寫收斂為統一之 `_getColCached` / `_upsertDoc` / `_deleteDoc` Read/Write-Through 快取核心，搭配 `preloadAll()` 平行預載與 `count()` 聚合查詢；暖快取切頁為 0 網路延遲。
- **縱深資安防線 (`SafeHTML` + Header Auth + 白名單部署)**：
  - `SafeHTML` (`js/diagrams.js`) 透過 `DOMParser` 惰性解析與白名單節點重建，過濾剪貼簿筆記、AI 回傳 HTML、題庫與閃卡之危險標籤／事件／協議，防堵 Stored & DOM XSS。
  - `GeminiService` (`js/gemini.js`) 改以 `x-goog-api-key` HTTP Header 傳遞本機 Session API Key，杜絕 URL Query 外洩。
  - `firestore.rules` 增加 8 大合法集合白名單 `isAllowedCollection(col)`；`.github/workflows/deploy.yml` 改為 `_site/` 白名單打包，並移除已退役之 `gas-project/` 舊版目錄與硬編碼個人試算表 ID。
- **現代 Web Platform API (`index.html`, `css/style.css`)**：
  - `<meta name="color-scheme">` 與 CSS `color-scheme` + `storage` 多分頁主題同步。
  - 標準 `scrollbar-width` / `scrollbar-color` 搭配 `@supports not (scrollbar-color: auto)` WebKit 降級。
  - `<dialog closedby="any">` / `closedby="closerequest"` 與座標盒點擊降級、`@starting-style` + 獨立宣告 `transition-behavior: allow-discrete` Top-Layer 動畫。
  - `#toast` 升級為 `popover="manual"` Top-Layer 通知與 `aria-live="polite"`。
  - 長清單視窗外項目採用 `content-visibility: auto; contain-intrinsic-size: auto none auto 152px`。
- **GSAP 精準互動與備考效率閉環 (`js/router.js`, `js/app.js`, `js/timer.js`)**：
  - `Motion` 適配層註冊 `Flip`、`Draggable`、`ScrollToPlugin` 並以 `gsap.matchMedia()` 尊重 `prefers-reduced-motion`，離線環境自動無痛降級。
  - 新增全局 `Ctrl+K` / `/` 命令面板、儀表板首屏「今日研讀焦點英雄卡」+ 四態分佈 + 弱點模組排行、7 日目標參考虛線折線圖、課綱即時檢索、浮動計時器自由拖曳，以及模擬考 `sessionStorage` 斷點恢復 + 待查標記 + 鍵盤作答流。

---

## 2. 模組職責

- `firebase.json` & `firestore.rules`：宣告式 Firestore 安全規則，鎖定本人 UID、8 大集合白名單與伺服器端禁止寫入 `geminiApiKey`。
- `index.html`：SPA 入口、非阻塞 `IBM Plex Sans` + `Noto Sans TC` + `JetBrains Mono` 載入、`color-scheme` 防閃爍腳本、Top-Layer 彈窗／Toast 與 `Ctrl+K` 命令面板。
- `css/style.css`：Ink Dark (`#0d1017`) / Warm Paper (`#f7f4ee`) 雙主題、4px 網格系統、Top-Layer `@starting-style` 過渡、標準捲軸與 `content-visibility: auto`。
- `js/firebase-config.js`：`signInWithGoogle`、`authorizeGeminiOAuth`、`signOutGoogle`、`waitForInitialAuth`、`onAuthChanged` 及連線探針。
- `js/db.js`：Read/Write-Through 記憶體快取 DAO、UID 隔離、平行 `preloadAll()`、SM-2 演算法 (`computeSM2Next`) 與 JSON / Google Sheet 搬移工具。
- `js/diagrams.js`：`SafeHTML` 白名單淨化器、16 座互動式醫學物理模擬實驗室 (`_LAB_BUILDERS`) 與 0-Token NotebookLM 公式保護型 Markdown 解析器。
- `js/gemini.js`：雙軌認證（OAuth Bearer Token + `x-goog-api-key` Header）與 `AbortController` 超時防護。
- `js/charts.js`：雙主題 HTML5 Canvas 折線圖（含每日目標虛線）與 M1~M10 10 軸雷達圖。
- `js/timer.js`：基於 `Date.now()` 時間戳差值與 `sessionStorage` 之學習計時器與支援斷點續計之 `ExamTimer`。
- `js/app.js` & `js/router.js`：8 大頁面控制器、全局檢索面板、模擬考斷點持久化與鍵盤流、無閃爍路由器與 GSAP `Motion` 適配層。
- `tests/self-check.mjs`：零相依 Node 自動化自檢腳本，驗證 `SafeHTML`、Markdown/LaTeX、SM-2 與靜態資安斷言。
