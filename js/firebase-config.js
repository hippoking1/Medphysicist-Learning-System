/**
 * 醫學物理師考照自學系統 - Firebase 初始化與配置 (firebase-config.js)
 * 支援整段 firebaseConfig 智慧貼上、真實雲端連線探針與 LocalStorage 自動降級
 */

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

let dbInstance = null;
let isFirebaseConnected = false;
let firebaseConnectionError = '';

/**
 * 解析使用者貼上的整段 firebaseConfig JS 物件或 JSON 字串
 */
function parseFirebaseConfigInput(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();
  const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const extracted = {};
  let foundCount = 0;

  keys.forEach((key) => {
    const regex = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`);
    const match = text.match(regex);
    if (match && match[1]) {
      extracted[key] = match[1].trim();
      foundCount++;
    }
  });

  if (foundCount >= 2 && extracted.projectId && extracted.apiKey) {
    return {
      ...DEFAULT_FIREBASE_CONFIG,
      ...extracted,
      authDomain: extracted.authDomain || `${extracted.projectId}.firebaseapp.com`,
      storageBucket: extracted.storageBucket || `${extracted.projectId}.appspot.com`
    };
  }
  return null;
}

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
  if (!configObj || !configObj.projectId || !configObj.apiKey) {
    localStorage.removeItem('mp_custom_firebase_config');
    return false;
  }
  localStorage.setItem('mp_custom_firebase_config', JSON.stringify(configObj));
  return true;
}

/**
 * 初始化 Firebase SDK 與 Firestore 實例
 */
function initFirebaseApp() {
  const config = getActiveFirebaseConfig();
  firebaseConnectionError = '';

  if (typeof firebase === 'undefined') {
    isFirebaseConnected = false;
    firebaseConnectionError = 'Firebase SDK 尚未載入';
    return null;
  }

  if (!config.projectId || !config.apiKey) {
    isFirebaseConnected = false;
    return null;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }
    const db = firebase.firestore();

    try {
      db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn('[Firestore] 多分頁開啟中，離線快取僅於首個分頁啟用');
        }
      });
    } catch (e) {}

    dbInstance = db;
    isFirebaseConnected = true;
    return db;
  } catch (err) {
    console.error('[Firebase] 初始化失敗:', err);
    isFirebaseConnected = false;
    firebaseConnectionError = err.message || '初始化失敗';
    return null;
  }
}

/**
 * 主動對 Firestore Server 發起真實連線探針（檢查 Project ID 與 Security Rules）
 */
async function verifyFirebaseConnection() {
  const config = getActiveFirebaseConfig();
  if (!config.projectId || !config.apiKey) {
    isFirebaseConnected = false;
    firebaseConnectionError = '未設定 Firebase Project ID / API Key';
    return { connected: false, mode: 'local', reason: firebaseConnectionError };
  }

  if (!dbInstance) {
    initFirebaseApp();
  }
  if (!dbInstance) {
    return { connected: false, mode: 'local', reason: firebaseConnectionError || 'Firestore 初始化失敗' };
  }

  try {
    await dbInstance.collection('config').doc('settings').get({ source: 'server' });
    isFirebaseConnected = true;
    firebaseConnectionError = '';
    return { connected: true, mode: 'cloud', projectId: config.projectId };
  } catch (err) {
    // 若為 offline 錯誤但本地已有設定，允許走 Firestore 離線快取；若是權限拒絕則明確回報
    if (err.code === 'permission-denied') {
      isFirebaseConnected = false;
      firebaseConnectionError = 'Firestore 安全性規則拒絕存取 (permission-denied)，請檢查 Rules';
      return { connected: false, mode: 'error', reason: firebaseConnectionError };
    }
    if (err.code === 'unavailable') {
      isFirebaseConnected = true;
      firebaseConnectionError = '目前處於離線快取模式';
      return { connected: true, mode: 'offline-cache', projectId: config.projectId, reason: firebaseConnectionError };
    }
    isFirebaseConnected = false;
    firebaseConnectionError = err.message || String(err);
    return { connected: false, mode: 'error', reason: firebaseConnectionError };
  }
}
