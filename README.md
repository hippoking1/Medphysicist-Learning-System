# 醫學物理師考照自學系統 (ROC Medical Physicist Study WebApp)

> **v3.5 架構**：基於 **GitHub Pages (GitHub Actions Secret 注入) + Firebase Authentication (Google 登入) + Cloud Firestore (UID 隔離) + 雙軌 Gemini 授權 + 16 座互動物理模擬實驗室** 打造。

---

## v3.5 核心升級亮點

1. **Google 帳號單一登入與個人雲端資料隔離 (`/users/{uid}/...`)**：
   - 新裝置開啟網頁免再手動貼上 `firebaseConfig` 與重複設定，點擊「Google 帳號登入」即可自動載入個人 37 單元學習進度、筆記、AI 題庫、SM-2 記憶卡與模擬考紀錄。
   - Firestore Security Rules (`firestore.rules`) 強制鎖定僅登入本人 UID 可讀寫自己的雲端資料；系統登入後亦會自動將 v3.0 舊版頂層集合無痛遷移至個人專屬空間並清除歷史明文金鑰。
2. **零資料庫・零程式碼金鑰保護 + Gemini 雙軌授權**：
   - **徹底拔除資料庫明文金鑰**：程式碼、Git 歷史、Firestore `config/settings` 與 JSON 備份檔**全面禁止儲存 `geminiApiKey`**（由 `db.js` 與 `firestore.rules` 雙重強制攔截）。
   - **軌道 A｜Google OAuth 免金鑰直連**：支援申請 `https://www.googleapis.com/auth/generative-language` OAuth 權限，Access Token 僅暫存於瀏覽器 `sessionStorage`。
   - **軌道 B｜Google 密碼管理員綁定帶入**：將 Gemini API Key 與當前 Google 帳號 Email 綁定 (`PasswordCredential` + 標準表單自動填入)，僅存本機 `sessionStorage`；換裝置登入 Chrome / Edge 後可自動帶入。
3. **16 座互動式醫學物理模擬實驗室 (`js/diagrams.js`)**：
   - 支援滑桿調參、滑鼠/觸控游標十字探針讀數與機件點擊拆解：
     - **劑量與射束模擬**：PDD 深度探針與電子能量 ($R_p \approx E/2$)、FF/FFF 離軸剖面平坦度、幾何半影動態射線交會、相鄰照野 Gap 熱點/冷點視覺化、TG-51 / TRS-398 溫壓修正 $P_{TP}$ 與 $P_{\text{eff}}$ 偏移、組織不均勻電子失衡模擬。
     - **物理與治療模擬**：光子交互作用 $(Z, h\nu)$ 相圖探針、HVL/TVL 窄寬射束衰減、母子核衰變平衡與 $^{99\text{m}}\text{Tc}$ 24h 淘洗、TG-43 線射源極座標 $G_L(r,\theta)$、LQ 細胞存活 BED/EQD₂、TCP/NTCP 治療視窗與缺氧 OER。
     - **臨床 QA 與資訊流**：直線加速器機頭 (FF/FFF/Electron) 聯鎖互動剖面、IMRT Gamma Index 二維誤差判定儀、CTDIw/CTDIvol/DLP 假體實驗室、DICOM-RT 臨床物件檢視器。
4. **雙主題臨床工作台 (`Ink Dark` / `Warm Paper Light`) 與 0-Token NotebookLM 匯入**：
   - 保留完整 37 單元共讀工作台、29 份內建 PDF 檢視、0-Token NotebookLM Markdown 排版引擎、M1~M10 模擬測驗 10 軸雷達圖與鍵盤流 SM-2 記憶卡。

---

## GitHub Repo Secret 單一設定說明（跨裝置免重填 Firebase Key）

為確保公開儲存庫不包含任何實質 Firebase 設定，線上版 GitHub Pages 透過 `.github/workflows/deploy.yml` 於建置階段讀取單一 Repository Secret 自動注入 `js/firebase-config.js`：

1. 前往 [Firebase Console](https://console.firebase.google.com/) → 目標專案 → **專案設定 (Project Settings) → 一般 (General) → 您的應用程式 (Web `</>`)**，複製整段 `firebaseConfig` 物件（或 JSON）。
2. 前往您的 GitHub Repository → 點擊上方 **Settings** → 左側選單 **Secrets and variables → Actions**。
3. 點擊 **New repository secret**：
   - **Name**：`FIREBASE_CONFIG`（必須完全一致）
   - **Secret**：直接貼上剛複製的整段 `firebaseConfig`（例如 `const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", ... };` 或純 JSON 皆可，工作流會自動解析）。
4. 點擊 **Add secret**。之後每次推送至 `main` 分支（或手動觸發 Actions **Deploy to GitHub Pages**），系統即自動將配置編譯進靜態頁面，您的原始碼依然保持乾淨空白佔位符。

> **提醒**：若為本機 `localhost` 測試且尚未設定注入，系統仍保留 **系統設定 → 進階設定：本機開發自訂覆蓋** 供本地貼上測試。

---

## Firebase Authentication 與 Firestore Rules 部署指南

### 1. 啟用 Google 登入與授權網域（一次性設定）
1. 進入 Firebase Console → **Build → Authentication → Get started**。
2. 在 **Sign-in method** 啟用 **Google** 登入供應商，設定專案支援電子郵件後儲存。
3. 切換至 **Settings → Authorized domains**，確認已加入您的 GitHub Pages 網域（例如 `<username>.github.io`；本機測試用 `localhost` 與 `127.0.0.1` 預設已包含）。

### 2. 部署安全規則 (`firestore.rules`)
本專案已內建 `firebase.json` 與嚴格隔離之 `firestore.rules`（強制要求 `request.auth.uid == userId` 且伺服器端禁止在 `config/settings` 寫入 `geminiApiKey`）：

```bash
firebase deploy --only firestore:rules --project <YOUR_FIREBASE_PROJECT_ID>
```

---

## Gemini AI 雙軌授權使用方式

1. **方式一｜Google 密碼管理員綁定帶入（推薦日常使用，享 AI Studio 免費額度）**：
   - 於本系統登入 Google 帳號後，前往 **「系統設定 → Google 帳號與 Gemini 授權」**，貼上您的 [Google AI Studio](https://aistudio.google.com/) API Key 並點擊儲存。
   - 金鑰僅存於當前分頁 `sessionStorage` 並同時透過瀏覽器 Credential API 綁定您的 Google Email；日後於其他同步 Chrome / Edge 裝置開啟網頁時，點選「從 Google 密碼管理員帶入」或自動填入即可免查金鑰使用。
2. **方式二｜Google OAuth 2.0 直連授權**：
   - 若您的 Firebase 所屬 GCP 專案已啟用 **Generative Language API** 且 OAuth 同意畫面已授權使用者，點擊 **「OAuth 直連授權」** 即可直接使用短期 Google OAuth Token 呼叫 Gemini（完全無須輸入 API Key）。

---

## 專案目錄結構

```
/
├── index.html                   # SPA 骨架、Firebase Auth SDK、雙主題與 8 頁 Templates
├── firebase.json                # Firebase Firestore Rules 部署設定
├── firestore.rules              # UID 隔離與禁止明文 API Key 之資料庫安全規則
├── .github/workflows/deploy.yml # GitHub Actions Secret (FIREBASE_CONFIG) 自動注入與部署
├── .gitignore                   # 排除金鑰、憑證、備份 JSON 與系統暫存檔
├── .nojekyll                    # 確保 GitHub Pages 正確提供靜態資源
├── README.md                    # 系統說明、GitHub Secret 與 Firebase 設定指南
├── system_reference.md          # 系統架構與設計文件
├── css/
│   └── style.css                # Ink Dark / Warm Paper 雙主題與 .mp-lab 實驗室樣式表
└── js/
    ├── syllabus-data.js         # 10 大領域 37 單元課綱與無金鑰預設參數
    ├── firebase-config.js       # Google Auth 登入、OAuth Token 與 Firestore 連線探針
    ├── db.js                    # UID 隔離 Firestore DAO、舊版自動遷移與零金鑰防線
    ├── diagrams.js              # 16 座互動式醫學物理模擬實驗室與 Markdown 解析器
    ├── gemini.js                # 雙軌授權 (OAuth / Session Key) Gemini REST API 客戶端
    ├── charts.js                # 雙主題 HTML5 Canvas 圓環、折線與 10 軸雷達圖
    ├── timer.js                 # Date.now() 防背景節流計時器與 sessionStorage 持久化
    ├── app.js                   # 8 大頁面控制器、帳號同步 UI 與學習閉環邏輯
    └── router.js                # SPA Hash 路由器、Auth 狀態監聽連動與選單工具
```
