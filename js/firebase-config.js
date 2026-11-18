/**
 * 醫學物理師考照自學系統 - Firebase 初始化、Google Auth 認證與連線探針 (firebase-config.js)
 * 部署時由 GitHub Actions Secrets 注入 DEFAULT_FIREBASE_CONFIG，原始碼不含任何實質憑證
 */

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

const GEMINI_OAUTH_SCOPE = 'https://www.googleapis.com/auth/generative-language';
const OAUTH_TOKEN_KEY = 'mp_google_oauth_token';
const OAUTH_EXPIRES_KEY = 'mp_google_oauth_expires_at';
const OAUTH_SCOPE_FLAG = 'mp_oauth_gemini_requested';

let dbInstance = null;
let authInstance = null;
let currentUser = null;
let isFirebaseConnected = false;
let firebaseConnectionError = '';
let _authInitialized = false;
let _initialAuthPromise = null;
const _authListeners = new Set();

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

function isInjectedFirebaseConfig() {
  return Boolean(DEFAULT_FIREBASE_CONFIG.projectId && DEFAULT_FIREBASE_CONFIG.apiKey);
}

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

function saveCustomFirebaseConfig(configObj) {
  if (!configObj || !configObj.projectId || !configObj.apiKey) {
    localStorage.removeItem('mp_custom_firebase_config');
    return false;
  }
  localStorage.setItem('mp_custom_firebase_config', JSON.stringify(configObj));
  return true;
}

function _storeGoogleOAuthToken(accessToken) {
  if (!accessToken) return;
  try {
    sessionStorage.setItem(OAUTH_TOKEN_KEY, accessToken);
    // Google OAuth Access Token 效期約 60 分鐘，預留緩衝抓 50 分鐘
    sessionStorage.setItem(OAUTH_EXPIRES_KEY, String(Date.now() + 50 * 60 * 1000));
  } catch (e) {}
}

function getGoogleOAuthToken() {
  try {
    const token = sessionStorage.getItem(OAUTH_TOKEN_KEY) || '';
    const exp = Number(sessionStorage.getItem(OAUTH_EXPIRES_KEY) || 0);
    if (!token || (exp && Date.now() >= exp)) {
      clearGoogleOAuthToken();
      return '';
    }
    return token;
  } catch (e) {
    return '';
  }
}

function clearGoogleOAuthToken() {
  try {
    sessionStorage.removeItem(OAUTH_TOKEN_KEY);
    sessionStorage.removeItem(OAUTH_EXPIRES_KEY);
    sessionStorage.removeItem(OAUTH_SCOPE_FLAG);
  } catch (e) {}
}

function getCurrentUser() {
  return currentUser;
}

function onAuthChanged(listener) {
  if (typeof listener !== 'function') return () => {};
  _authListeners.add(listener);
  return () => _authListeners.delete(listener);
}

function _notifyAuthListeners(user) {
  _authListeners.forEach((fn) => {
    try {
      fn(user);
    } catch (e) {
      console.warn('[Auth] listener error:', e);
    }
  });
}

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

    if (typeof firebase.auth === 'function' && !authInstance) {
      authInstance = firebase.auth();
      _bindAuthLifecycle();
    }

    return db;
  } catch (err) {
    console.error('[Firebase] 初始化失敗:', err);
    isFirebaseConnected = false;
    firebaseConnectionError = err.message || '初始化失敗';
    return null;
  }
}

function _bindAuthLifecycle() {
  if (!authInstance || _authInitialized) return;
  _authInitialized = true;

  _initialAuthPromise = new Promise((resolve) => {
    let resolved = false;
    const finish = (user) => {
      if (!resolved) {
        resolved = true;
        resolve(user);
      }
    };

    const timer = setTimeout(() => finish(authInstance.currentUser || null), 2500);

    // 行動裝置瀏覽器經由 signInWithRedirect 返回時接收 OAuth Token
    authInstance
      .getRedirectResult()
      .then((res) => {
        if (res && res.credential && res.credential.accessToken) {
          if (sessionStorage.getItem(OAUTH_SCOPE_FLAG) === '1') {
            _storeGoogleOAuthToken(res.credential.accessToken);
            sessionStorage.removeItem(OAUTH_SCOPE_FLAG);
          }
        }
      })
      .catch((err) => {
        console.warn('[Auth] Redirect 結果處理異常:', err.message || err);
      });

    authInstance.onAuthStateChanged((user) => {
      clearTimeout(timer);
      const prevUid = currentUser ? currentUser.uid : null;
      const nextUid = user ? user.uid : null;
      currentUser = user || null;
      if (!currentUser) {
        isFirebaseConnected = false;
      }
      finish(currentUser);
      if (resolved && prevUid !== nextUid) {
        _notifyAuthListeners(currentUser);
      }
    });
  });
}

async function waitForInitialAuth() {
  if (!authInstance) {
    initFirebaseApp();
  }
  if (_initialAuthPromise) {
    return await _initialAuthPromise;
  }
  return currentUser;
}

function _buildGoogleProvider(requestGeminiScope = false) {
  const provider = new firebase.auth.GoogleAuthProvider();
  if (requestGeminiScope) {
    provider.addScope(GEMINI_OAUTH_SCOPE);
    provider.setCustomParameters({ prompt: 'consent select_account' });
  } else {
    provider.setCustomParameters({ prompt: 'select_account' });
  }
  return provider;
}

async function signInWithGoogle(options = {}) {
  const config = getActiveFirebaseConfig();
  if (!config.projectId || !config.apiKey) {
    throw new Error('尚未設定 Firebase 連線專案，請先設定 FIREBASE_CONFIG 或於系統設定輸入專案資料');
  }
  if (!authInstance) initFirebaseApp();
  if (!authInstance) {
    throw new Error('Firebase Authentication 模組未就緒');
  }

  const requestGeminiScope = Boolean(options.requestGeminiScope);
  const provider = _buildGoogleProvider(requestGeminiScope);

  try {
    const result = await authInstance.signInWithPopup(provider);
    currentUser = result.user || authInstance.currentUser;
    if (requestGeminiScope && result.credential && result.credential.accessToken) {
      _storeGoogleOAuthToken(result.credential.accessToken);
    }
    return { user: currentUser, hasOAuthToken: Boolean(getGoogleOAuthToken()) };
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      if (requestGeminiScope) sessionStorage.setItem(OAUTH_SCOPE_FLAG, '1');
      await authInstance.signInWithRedirect(provider);
      return { redirecting: true };
    }
    if (err.code === 'auth/unauthorized-domain') {
      throw new Error(`此網域 (${location.hostname}) 尚未加入 Firebase Console → Authentication → Authorized domains`);
    }
    if (err.code === 'auth/operation-not-allowed') {
      throw new Error('請先至 Firebase Console → Authentication → Sign-in method 啟用 Google 登入');
    }
    throw err;
  }
}

async function authorizeGeminiOAuth() {
  if (!authInstance) initFirebaseApp();
  if (!authInstance || !authInstance.currentUser) {
    return await signInWithGoogle({ requestGeminiScope: true });
  }

  const provider = _buildGoogleProvider(true);
  try {
    const result = await authInstance.currentUser.reauthenticateWithPopup(provider);
    if (result.credential && result.credential.accessToken) {
      _storeGoogleOAuthToken(result.credential.accessToken);
      return { success: true, token: result.credential.accessToken };
    }
    throw new Error('Google 未回傳 Gemini OAuth Access Token');
  } catch (err) {
    if (err.code === 'auth/popup-blocked') {
      sessionStorage.setItem(OAUTH_SCOPE_FLAG, '1');
      await authInstance.currentUser.reauthenticateWithRedirect(provider);
      return { redirecting: true };
    }
    throw err;
  }
}

async function signOutGoogle() {
  clearGoogleOAuthToken();
  try {
    sessionStorage.removeItem('mp_session_gemini_key');
  } catch (e) {}

  if (typeof DB !== 'undefined' && typeof DB.clearLocalUserCache === 'function') {
    DB.clearLocalUserCache();
  }

  isFirebaseConnected = false;
  currentUser = null;
  if (authInstance) {
    await authInstance.signOut();
  }
}

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

  await waitForInitialAuth();

  if (!currentUser) {
    isFirebaseConnected = false;
    firebaseConnectionError = '尚未登入 Google 帳號';
    return {
      connected: false,
      mode: 'auth-required',
      projectId: config.projectId,
      reason: '請先登入 Google 帳號以啟用個人雲端資料庫同步'
    };
  }

  try {
    await dbInstance
      .collection('users')
      .doc(currentUser.uid)
      .collection('config')
      .doc('settings')
      .get({ source: 'server' });
    isFirebaseConnected = true;
    firebaseConnectionError = '';
    return {
      connected: true,
      mode: 'cloud',
      projectId: config.projectId,
      uid: currentUser.uid,
      email: currentUser.email
    };
  } catch (err) {
    if (err.code === 'permission-denied') {
      isFirebaseConnected = false;
      firebaseConnectionError = 'Firestore 安全性規則拒絕存取 (permission-denied)，請確認已部署新版 firestore.rules';
      return { connected: false, mode: 'error', reason: firebaseConnectionError };
    }
    if (err.code === 'unavailable') {
      isFirebaseConnected = true;
      firebaseConnectionError = '目前處於離線快取模式';
      return {
        connected: true,
        mode: 'offline-cache',
        projectId: config.projectId,
        uid: currentUser.uid,
        reason: firebaseConnectionError
      };
    }
    isFirebaseConnected = false;
    firebaseConnectionError = err.message || String(err);
    return { connected: false, mode: 'error', reason: firebaseConnectionError };
  }
}
