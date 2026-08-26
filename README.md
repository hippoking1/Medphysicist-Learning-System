# 醫學物理師考照自學系統 (ROC Medical Physicist Study WebApp)

> **v2.5 架構**：基於 **GitHub Pages (純靜態 SPA) + Firebase (Cloud Firestore) + Google Gemini REST API** 打造之全方位醫學物理師考照自學與模擬系統。

---

## 🌟 核心功能一覽

1. **學習課綱與進度規劃 (37 單元)**：
   - 涵蓋 10 大學術領域（M1 基礎物理 ~ M10 電腦概論），完整收錄 AAPM TG-51/TG-142/TRS-398 等權威文獻與章節細目。
   - 支援狀態管理（未開始、進行中、已完成、需複習）與自訂讀書筆記。
2. **NotebookLM 專屬提示詞**：
   - 一鍵針對單元生成深度學習 Prompt，配合 Google NotebookLM 與文獻 PDF 快速整理考點與公式。
3. **單元隨堂測驗 (Unit Quiz)**：
   - 針對單元進行 3~5 題隨堂測驗，題庫不足時由 Gemini AI 即時動態生成補齊。
4. **AI 練習題庫 (Practice Bank)**：
   - 支援難度 1~3、AI 自動出題、手動錄題、題目審核與刪除。支援 LaTeX 公式與 SVG 向量圖適配。
5. **模擬測驗中心 (Exam Center)**：
   - 支援全範圍模擬考（80題/60分鐘）與單模組驗收測驗（20題/30分鐘）。
   - 具備全真倒數計時、題號快速跳轉、交卷評分與 7 軸模組弱點雷達圖分析。
6. **SM-2 知識卡複習 (Spaced Repetition)**：
   - 採用 SuperMemo-2 演算法，根據 0~5 分回憶品質自動排程下一次複習間隔。
   - 支援 3D 翻轉卡片、AI 快速提煉文獻卡片、單元層級篩選。
7. **口試模擬問答 (Oral Simulator)**：
   - 5 大口試題型，由 Gemini 考官出題。
   - 提交回答後，AI 從「完整度、正確性、邏輯、深度」四維度評分並指出缺漏要點。
8. **學習日誌與懸浮計時器**：
   - 全域懸浮學習計時器、手動補登日誌、連續學習天數 (Streak) 統計。
9. **學習儀表板 (Dashboard)**：
   - 考照倒數計時、整體進度圓環圖、近 7 日學習時數折線圖、模組進度條與今日推薦單元。
10. **資料庫完整備份與還原 (JSON Backup & Restore)**：
    - 一鍵將全部課綱、進度、題庫、知識卡片、測驗與口試紀錄匯出為 JSON，或隨時匯入還原。

---

## 🚀 部署至 GitHub Pages 教學

本系統為純靜態單頁面應用程式 (SPA)，完全無須 Node.js 編譯步驟，開箱即用：

1. **推送代碼至 GitHub 倉庫**：
   ```bash
   git add .
   git commit -m "Deploy Medical Physicist Study System v2.5"
   git push origin main
   ```
2. **開啟 GitHub Pages**：
   - 進入您的 GitHub Repository 頁面。
   - 點擊 **Settings** -> 左側選單 **Pages**。
   - 在 **Build and deployment** 下方的 **Branch** 選擇 `main` 分支與根目錄 `/ (root)`。
   - 點擊 **Save**。數十秒後即可獲得專屬網址（例如：`https://<username>.github.io/<repo>/`）。

---

## ☁️ Firebase Cloud Firestore 資料庫設定

系統自帶 **LocalStorage 離線模式** 與 **Firebase Cloud Firestore 雲端同步模式**。若需跨設備同步資料：

### 步驟 1：建立 Firebase 免費專案
1. 前往 [Firebase Console](https://console.firebase.google.com/) 並登入 Google 帳號。
2. 點擊 **「新增專案」**（例如命名為 `medical-physicist-study`），停用 Google Analytics（選用）後完成建立。

### 步驟 2：啟用 Cloud Firestore
1. 在 Firebase 控制台左側選單點擊 **Build (建構)** -> **Firestore Database**。
2. 點擊 **「建立資料庫」**，位置選擇亞洲（如 `asia-east1` 台灣或 `asia-northeast1` 東京）。
3. 安全性規則可先選擇 **「以測試模式啟動」**（稍後可設定為自訂規則）。

### 步驟 3：設定 Firestore 安全性規則 (Security Rules)
在 Firestore 控制台的 **「規則 (Rules)」** 標籤中填入以下內容並點擊 **發布 (Publish)**：
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

### 步驟 4：獲取 Web 連線配置並填入系統
1. 進入 Firebase **專案設定 (Project Settings)** -> **一般 (General)** -> 下拉至「您的應用程式」。
2. 點擊 **Web 圖示 (`</>`)** 註冊應用程式。
3. 取得 `projectId` 與 `apiKey`。
4. 打開您的 GitHub Pages 網頁，點選左側 **「系統設定」** -> 在 **Firebase Cloud Firestore 設定** 中填入 `Project ID` 與 `Web API Key`，點擊儲存即可！

---

## 🔑 Gemini AI 金鑰設定

1. 前往 [Google AI Studio](https://aistudio.google.com/) 取得免費的 **Gemini API Key**。
2. 打開網頁左側 **「系統設定」**。
3. 填入 API Key 並選擇推薦模型（預設為最新高速精準的 `gemini-2.5-flash`）。
4. 點擊「儲存 AI 連線設定」即可暢享 AI 出題、口試模擬與閃卡提煉功能！

---

## 📂 專案目錄結構

```
/
├── index.html                   # 主 SPA 骨架、頁面樣板與原生 dialog 彈窗
├── .nojekyll                    # 確保 GitHub Pages 支援所有靜態檔案
├── README.md                    # 本安裝與使用指南
├── system_reference.md          # 系統架構與技術參考手冊
├── css/
│   └── style.css                # 深色玻璃擬態 (Dark Glassmorphism) 響應式樣式表
└── js/
    ├── syllabus-data.js         # 10 大領域 37 單元種子資料
    ├── firebase-config.js       # Firebase 初始化與自訂配置管理
    ├── db.js                    # Firestore DAO、自癒種子與 JSON 匯入匯出
    ├── gemini.js                # 前端直連 Gemini REST API 與 LaTeX/SVG 容錯修復
    ├── charts.js                # HTML5 Canvas 進度圓環、折線圖、雷達圖引擎
    ├── timer.js                 # 學習懸浮計時器與模擬考倒數計時器
    ├── app.js                   # 8 大頁面控制器邏輯
    └── router.js                # SPA Hash 路由器與通用選單連動工具
```
