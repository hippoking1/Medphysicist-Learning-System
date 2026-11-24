# 醫學物理師考照自學系統 (ROC Medical Physicist Study WebApp)

> **v4.0 架構**：基於 **GitHub Pages（白名單乾淨發佈 + Secret 注入）+ Firebase Auth / Firestore（UID 與集合白名單隔離 + 記憶體快取層）+ 雙軌 Header Gemini 授權 + SafeHTML 防線 + GSAP 互動與 16 座物理模擬實驗室** 打造。

---

## v4.0 核心升級亮點

1. **零延遲記憶體快取層與無閃爍切頁 (`js/db.js`, `js/router.js`)**：
   - 新增 Read-Through / Write-Through 記憶體快取 (`DB._cache`) 與 `preloadAll()` 平行預載，將首次載入後切頁的 Firestore 讀取次數降至 **0 次**（切頁無轉圈白閃、大幅節省 Firestore 讀寫配額），設定頁筆數統計優先採用 `count()` 聚合查詢。
2. **全方位效率工作流（全局檢索 / 模擬考斷點續計 / 首屏焦點工作台）**：
   - **全局命令面板 (`Ctrl+K` / `/`)**：任意頁面即時檢索 37 個單元、16 座物理模擬實驗室與 8 大分頁，一鍵直達共讀工作台或展開互動模擬器。
   - **首屏今日研讀焦點卡**：儀表板頂部直接優先帶出進行中／需複習／下一順位單元，一鍵開啟共讀工作台並計時；搭配 37 單元四態堆疊條、近 5 次模考弱點模組排行與含每日目標參考虛線之 7 日研讀折線圖。
   - **模擬測驗防丟失與鍵盤流**：80 題／20 題模擬測驗全面持久化至 `sessionStorage`，意外重整或切頁返回可無損接續剩餘時間、已選答案與待查標記；支援鍵盤 `1–4` / `A–D` 選答、`←/→` 切題與 `F` 標記待查。
   - **課綱即時檢索與狀態篩選**：支援關鍵字與 4 種學習狀態即時篩選。
3. **縱深資安防護 (`SafeHTML` + Header 認證 + 白名單部署)**：
   - **白名單 DOM 淨化器 (`SafeHTML`)**：所有外部剪貼簿（NotebookLM）、AI 回傳 HTML、題庫、閃卡與口試回饋皆經過 `DOMParser` 惰性解析與白名單節點重建，徹底封閉 Stored / DOM XSS 風險並保留 LaTeX 與 `.mp-diagram` 實驗室。
   - **API Key 改走 HTTP Header**：Gemini 請求改以 `x-goog-api-key` 標頭傳遞金鑰，不再出現於 URL Query；維持「資料庫零金鑰」原則，並移除程式碼內硬編碼試算表 ID。
   - **Firestore 規則與部署隔離**：`firestore.rules` 鎖定 `request.auth.uid == userId`、強制 8 大集合白名單並禁止寫入 `geminiApiKey`；GitHub Actions 僅將正式靜態資源打包至 `_site/` 發佈，不再公開暴露規則檔、測試檔與開發文件，且已移除退役之 `gas-project/` 舊版目錄。
4. **現代 Web 標準與 GSAP 精準動態互動**：
   - **原生 Web Platform API**：同步 `<meta name="color-scheme">` 與多分頁主題事件、標準 `scrollbar-color` / `scrollbar-width`、`<dialog closedby="any">` 背景點擊關閉與 `@starting-style` 過渡、Top-Layer `popover="manual"` 全局 Toast（不再被彈窗遮擋），以及視窗外清單 `content-visibility: auto` 延遲渲染。
   - **臨床字體與 GSAP 實戰互動**：改用非阻塞載入 `IBM Plex Sans` + `Noto Sans TC` + `JetBrains Mono`；整合 GSAP `Draggable`（浮動計時器可於視窗內自由拖曳避讓並記憶位置）、`Flip`（課綱篩選與共讀工作台「雙欄 ↔ 專注單欄」平滑過渡）與 `ScrollToPlugin`，並透過 `gsap.matchMedia()` 完整尊重 `prefers-reduced-motion`（離線時 100% 無痛降級）。
5. **16 座互動式醫學物理模擬實驗室 (`js/diagrams.js`)**：
   - 支援滑桿調參、滑鼠／觸控游標十字探針讀數與機件點擊拆解，涵蓋 PDD、FF/FFF 離軸剖面、幾何半影、相鄰照野 Gap、TG-51 / TRS-398、組織不均勻界面、光子交互作用 $(Z, h\nu)$、HVL/TVL、母子核衰變淘洗、TG-43、LQ 存活曲線、TCP/NTCP、直線加速器機頭、IMRT Gamma Index、CTDI 假體與 DICOM-RT 臨床流程。

---

## GitHub Repo Secret 單一設定說明（跨裝置免重填 Firebase Key）

線上版 GitHub Pages 透過 `.github/workflows/deploy.yml` 於建置期自單一 Repository Secret 自動注入 `js/firebase-config.js`，並僅將執行期靜態檔案打包至 `_site/` 發佈：

1. 前往 [Firebase Console](https://console.firebase.google.com/) → 目標專案 → **專案設定 (Project Settings) → 一般 (General) → 您的應用程式 (Web `</>`)**，複製整段 `firebaseConfig`。
2. 前往您的 GitHub Repository → **Settings → Secrets and variables → Actions** → **New repository secret**：
   - **Name**：`FIREBASE_CONFIG`
   - **Secret**：貼上 `firebaseConfig` 物件或 JSON。
3. 推送至 `main` 分支（或手動觸發 Actions **Deploy to GitHub Pages**），即可完成自動注入與乾淨發佈。

---

## Firebase Authentication 與 Firestore Rules 部署指南

### 1. 啟用 Google 登入與授權網域（一次性設定）
1. 進入 Firebase Console → **Build → Authentication → Sign-in method**，啟用 **Google** 供應商。
2. 於 **Settings → Authorized domains** 確認已加入 GitHub Pages 網域（`<username>.github.io`；本機 `localhost` 預設已含）。

### 2. 部署安全規則 (`firestore.rules`)
本專案內建 `firebase.json` 與嚴格隔離之 `firestore.rules`（強制 `request.auth.uid == userId`、8 大集合白名單且禁止寫入 `geminiApiKey`）：

```bash
firebase deploy --only firestore:rules --project <YOUR_FIREBASE_PROJECT_ID>
```

---

## Gemini AI 雙軌授權使用方式

1. **方式一｜Google 密碼管理員綁定帶入（推薦日常使用）**：
   - 登入 Google 帳號後前往 **「系統設定 → Google 帳號與 Gemini 授權」** 貼上 [Google AI Studio](https://aistudio.google.com/) API Key 並儲存。
   - 金鑰僅存於 `sessionStorage` 並以 `x-goog-api-key` Header 傳送，同時透過瀏覽器 Credential API 綁定 Google Email 跨裝置自動帶入。
2. **方式二｜Google OAuth 2.0 直連授權**：
   - 若 GCP 專案已啟用 **Generative Language API**，點擊 **「OAuth 直連授權」** 即可免 API Key 使用短期 OAuth Bearer Token 呼叫 Gemini。

---

## 本機自動化自檢

```bash
node tests/self-check.mjs
```

---

## 專案目錄結構

```
/
├── index.html                   # SPA 骨架、color-scheme 同步、Top-Layer Dialog/Toast 與 Ctrl+K 面板
├── firebase.json                # Firebase Firestore Rules 部署設定
├── firestore.rules              # UID 隔離、8 集合白名單與禁止明文 API Key 之安全規則
├── .github/workflows/deploy.yml # Secret 自動注入與 _site/ 白名單乾淨打包發佈
├── .gitignore                   # 排除金鑰、憑證、備份 JSON 與暫存檔
├── .nojekyll                    # 確保 GitHub Pages 正確提供靜態資源
├── README.md                    # 系統說明、部署與自檢指南
├── system_reference.md          # v4.0 系統架構與設計文件
├── tests/
│   └── self-check.mjs           # 零相依自動化自檢 (SafeHTML XSS、Markdown/LaTeX、SM-2 與靜態斷言)
├── css/
│   └── style.css                # Ink Dark / Warm Paper 雙主題、標準捲軸、Top-Layer 過渡與 4px 網格
└── js/
    ├── syllabus-data.js         # 10 大領域 37 單元課綱與無金鑰預設參數
    ├── firebase-config.js       # Google Auth 登入、OAuth Token 與 Firestore 連線探針
    ├── db.js                    # Read/Write-Through 記憶體快取 DAO、UID 隔離與平行預載
    ├── diagrams.js              # SafeHTML 淨化器、16 座互動物理模擬實驗室與 Markdown 解析器
    ├── gemini.js                # 雙軌授權 (OAuth / x-goog-api-key Header) Gemini REST 客戶端
    ├── charts.js                # 雙主題 HTML5 Canvas 折線圖（含目標虛線）與 10 軸雷達圖
    ├── timer.js                 # Date.now() 防背景節流學習計時器與可斷點續計之 ExamTimer
    ├── app.js                   # 8 大頁面控制器、Ctrl+K 命令面板、模擬考持久化與鍵盤流
    └── router.js                # 無閃爍 SPA 路由器、GSAP Motion 適配層與共用選單連動
```
