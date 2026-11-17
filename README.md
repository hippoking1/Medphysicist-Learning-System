# 醫學物理師考照自學系統 (ROC Medical Physicist Study WebApp)

> **v3.0 架構**：基於 **GitHub Pages (純靜態 SPA) + Firebase Cloud Firestore + Google Gemini REST API** 打造，整合確定性醫學物理繪圖引擎 (`js/diagrams.js`)、深色臨床 / 淺色紙本雙主題與完整學習閉環。

---

## 核心功能與 v3.0 升級亮點

1. **雙主題臨床工作台 (`Ink Dark` / `Warm Paper Light`)**：
   - 預設採用低眩光深色臨床劑量儀面板 (`#0d1017`)，支援一鍵切換「淺色紙本閱讀模式 (`#f7f4ee`)」以利長時間公式與文獻研讀。
   - 採用 `Inter`、`Noto Sans TC` 與 `JetBrains Mono` (`tabular-nums`) 等寬數值排版。
2. **確定性醫學物理繪圖引擎 (`js/diagrams.js`)**：
   - **PhysicsPlotter**：依據真實物理公式取樣渲染高精度 SVG 曲線（光子/電子/質子 PDD 與 Bragg Peak/SOBP、FF vs. FFF 離軸剖面、LQ 細胞存活對數曲線、母子核衰變平衡、HVL 窄/寬射束衰減）。
   - **ClinicalBlueprints**：工程製圖級幾何藍圖（TG-51 / TRS-398 水假體校正配置、幾何半影相似三角形、相鄰照野發散銜接 Gap、TG-43 線射源極座標、組織不均勻界面、直線加速器機頭剖面）。
   - 課綱單元可直接點擊「標準圖解」檢視，AI 出題亦優先透過規格呼叫前端確定性繪圖。
3. **一站式單元共讀工作台與 0-Token NotebookLM 智慧匯入 (37 單元 / 29 份內建文獻 PDF)**：
   - 涵蓋 M1 基礎物理至 M10 計算機概論，點擊「進入研讀」於同畫面展開雙欄工作台。
   - **0-Token NotebookLM 一鍵貼上排版**：複製單元專屬 NotebookLM 提示詞（內含 `[[DIAGRAM:代碼]]` 圖表指令）至 NotebookLM 生成後，回系統點擊「貼上 NotebookLM 筆記」，內建公式保護型 Markdown 解析器會自動轉換標題、品管容許差表格、保留 LaTeX 下標公式，並自動渲染 **16 種標準醫學物理向量示意圖**（即使貼上未帶標記的舊筆記，亦會依單元與內文關鍵字自動補齊標準物理圖解）。
   - 亦支援由 Gemini 直讀 `考試範圍文獻資料/*.pdf`（≤12MB）生成講義、反白文字一鍵轉閃卡/筆記、AI 助教追問，以及右欄同屏對照原文 PDF 與隨堂測驗。
   - 懸浮計時器採用 `Date.now()` 時間戳差值與 `sessionStorage` 持久化，切換分頁或重新整理不會遺失時間；結束計時直接開啟進度視窗帶入累計分鐘。
4. **互動式練習與錯題轉卡閉環**：
   - **AI 練習題庫**：預設「互動盲測模式」（點擊選項作答後揭露詳解），支援一鍵切換「展開詳解模式」。
   - 題庫、隨堂測驗、模擬考檢討與口試缺漏關鍵概念，皆支援**一鍵轉入 SM-2 知識卡**。
5. **全 10 模組模擬測驗與 10 軸弱點雷達**：
   - 全範圍模擬考（M1~M10 平均抽題 80 題 / 60 分鐘）與單模組驗收（20 題 / 30 分鐘）。
   - 支援點擊歷次模擬考成績列回看當次 10 軸雷達圖與逐題詳解。
6. **SM-2 知識卡複習 (鍵盤流)**：
   - 支援 `Space` 翻面與數字鍵 `0`–`5` 快速評分排程，並支援刪除卡片。
7. **Firebase 雲端同步與舊資料無痛搬移**：
   - 支援貼上整段 `firebaseConfig` 自動解析、真實伺服器連線探針驗證、「本機 vs. 雲端」筆數對照。
   - 支援 **本機 `LocalStorage` 一鍵推上雲端**、**舊版 Google Sheets (`gas-project`) 免後端直連搬移**與 **JSON 完整匯出/還原**。

---

## 部署至 GitHub Pages

本系統為純靜態單頁面應用程式 (SPA)，無須 Node.js 建置步驟：

1. 確認 `.gitignore` 已排除 `.env`、金鑰與備份 JSON 檔，程式碼中不包含任何 API Key。
2. 推送程式碼至 GitHub `main` 分支，並在 Repository **Settings → Pages** 選擇 `main` / `/ (root)` 即可透過 GitHub Pages 使用。

---

## Firebase Cloud Firestore 連線與舊資料轉移指南

> **資安提醒**：Gemini API Key 與 Firebase 設定皆儲存於您個人的瀏覽器 `localStorage` 與您自己的 Firestore 中，**請勿將金鑰直接寫死並提交至公開 GitHub 倉庫**。

### 第一步：建立 Firebase 專案與 Firestore 資料庫
1. 前往 [Firebase Console](https://console.firebase.google.com/)，建立新專案（例如 `medical-physicist-study`）。
2. 左側選單進入 **Build → Firestore Database → 建立資料庫**。
3. 位置選擇 `asia-east1`（台灣）或 `asia-northeast1`（東京），先以測試模式建立。
4. 進入 **規則 (Rules)** 標籤，依個人使用需求設定存取權限並點擊 **發布 (Publish)**：
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
   *(若需更嚴格保護，可於 Firebase Authentication 開啟匿名或 Google 登入後改寫規則為 `request.auth != null`。)*

### 第二步：取得並填入前端連線配置
1. 進入 Firebase **專案設定 (Project Settings) → 一般 (General) → 您的應用程式 → 新增 Web 應用程式 (`</>`)**。
2. 複製頁面顯示的 `const firebaseConfig = { apiKey: "...", projectId: "...", ... };` 整段程式碼。
3. 開啟本系統左側 **「系統設定」→「Firebase Cloud Firestore 連線」**：
   - 將整段 `firebaseConfig` 直接貼入 **「快速貼上整段 firebaseConfig」** 框中，系統會自動拆解填入 `Project ID` 與 `Web API Key`。
   - 點擊 **「儲存並驗證連線」**，確認右上角徽章顯示 `已連線 (<projectId>)`。

### 第三步：舊資料搬移至 Firebase（依來源三選一）
- **情境 A｜已有本機瀏覽器進度 (`LocalStorage`)**：
  1. 首次連上空白 Firestore 時，系統會自動將本機既有進度、題庫與卡片推送上雲。
  2. 您也可隨時在設定頁檢視「本機 vs. 雲端」筆數對照，點擊 **「本機資料推送上雲」** 或 **「從雲端下載同步」**。
- **情境 B｜從舊版 Google Sheets (`gas-project`) 試算表搬移**：
  1. 開啟您的舊版 Google Sheet 試算表，點擊右上角 **共用 → 一般存取權**，暫時切換為 **「知道連結的任何人 → 檢視者」**。
  2. 在本系統 **「系統設定 → 舊資料搬移至 Firebase」** 中確認已帶入的試算表 ID（或貼上完整試算表網址）。
  3. 點擊 **「一鍵從 Google Sheet 搬移至 Firebase」**，系統會直接拉取 8 張工作表（`Syllabus`, `Progress`, `Questions`, `StudyLog`, `ReviewCards`, `ExamResults`, `OralPractice`, `Config`）並分批寫入 Firestore。
  4. **搬移完成後，請立即將 Google Sheet 共用權限改回「受限制（僅限自己）」**，確保個人學習資料與金鑰安全。
- **情境 C｜已有 JSON 備份檔案**：
  1. 在設定頁點擊 **「還原備份 (JSON)」** 選擇備份檔，系統會自動正規化資料並批次同步至 Firebase Firestore。

---

## Gemini AI 金鑰設定

1. 前往 [Google AI Studio](https://aistudio.google.com/) 取得 **Gemini API Key**。
2. 於系統 **「系統設定 → Gemini AI 連線設定」** 貼上金鑰並選擇模型（預設 `gemini-2.5-flash`），點擊儲存即可使用 AI 出題、閃卡提煉與口試評分。

---

## 專案目錄結構

```
/
├── index.html                   # 主 SPA 骨架、雙主題初始化、Templates 與原生 <dialog>
├── .gitignore                   # 排除金鑰、憑證、備份 JSON 與系統暫存檔
├── .nojekyll                    # 確保 GitHub Pages 正確提供靜態資源
├── README.md                    # 安裝、Firebase 搬移與使用指南
├── system_reference.md          # 系統架構與設計文件
├── css/
│   └── style.css                # Ink Dark / Warm Paper 雙主題臨床儀器樣式表
└── js/
    ├── syllabus-data.js         # 10 大領域 37 單元種子資料
    ├── firebase-config.js       # Firebase Config 智慧解析與真實連線探針
    ├── db.js                    # Firestore / LocalStorage 雙模 DAO 與三大搬移引擎
    ├── diagrams.js              # 確定性醫學物理曲線繪圖器與臨床幾何藍圖庫
    ├── gemini.js                # 前端直連 Gemini REST API 與圖表協議
    ├── charts.js                # 雙主題 HTML5 Canvas 圓環、折線與 10 軸雷達圖
    ├── timer.js                 # Date.now() 防背景節流計時器與 sessionStorage 持久化
    ├── app.js                   # 8 大頁面控制器與互動閉環邏輯
    └── router.js                # SPA Hash 路由器與通用選單連動工具
```
