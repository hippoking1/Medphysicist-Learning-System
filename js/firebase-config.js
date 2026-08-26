/**
 * 醫學物理師考照自學系統 - Firebase 初始化與配置 (firebase-config.js)
 * 支援由使用者在前端「系統設定」動態配置 Firebase 專案，
 * 並在未配置時自動降級至 LocalStorage 模擬持久化模式，確保開箱即用。
 */

// 預設 Firebase 設定（可替換為您的正式專案設定）
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

let dbInstance = null;
let isFirebaseConnected = false;

/**
 * 取得當前使用的 Firebase 配置
 */
function getActiveFirebaseConfig() {
  try {
    const saved = localStorage.getItem('mp_custom_firebase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.projectId && parsed.apiKey) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('讀取自訂 Firebase 配置失敗，採用預設值', e);
  }
  return DEFAULT_FIREBASE_CONFIG;
}

/**
 * 儲存自訂 Firebase 配置
 */
function saveCustomFirebaseConfig(configObj) {
  if (!configObj || !configObj.projectId) {
    localStorage.removeItem('mp_custom_firebase_config');
    return false;
  }
  localStorage.setItem('mp_custom_firebase_config', JSON.stringify(configObj));
  return true;
}

/**
 * 初始化 Firebase 與 Firestore 連線
 */
function initFirebaseApp() {
  const config = getActiveFirebaseConfig();
  
  if (typeof firebase === 'undefined') {
    console.warn('[Firebase] Firebase SDK 尚未載入，使用 LocalStorage 離線模式。');
    isFirebaseConnected = false;
    return null;
  }

  // 若尚未設定有效 Project ID，使用 LocalStorage 離線模式
  if (!config.projectId || !config.apiKey) {
    console.info('[Firebase] 未偵測到 Firebase Project ID / API Key，系統將使用瀏覽器本機 LocalStorage 運行。');
    isFirebaseConnected = false;
    return null;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }
    const db = firebase.firestore();
    
    // 啟用 Firestore 離線持久化快取 (IndexedDB)
    try {
      db.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('[Firestore] 多個分頁同時開啟，離線快取僅在首個分頁啟用');
        } else if (err.code === 'unimplemented') {
          console.warn('[Firestore] 瀏覽器不支援 IndexedDB 離線持久化');
        }
      });
    } catch(e) {}

    dbInstance = db;
    isFirebaseConnected = true;
    console.log('[Firebase] 成功連接至 Firestore 專案:', config.projectId);
    return db;
  } catch (err) {
    console.error('[Firebase] 初始化失敗:', err);
    isFirebaseConnected = false;
    return null;
  }
}
