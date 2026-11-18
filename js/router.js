/**
 * 醫學物理師考照自學系統 - SPA Hash 路由器與通用選單連動 (js/router.js)
 */

const Routes = {
  'dashboard': { template: 'template-dashboard', loader: 'loadDashboardPage' },
  'syllabus': { template: 'template-syllabus', loader: 'loadSyllabusPage' },
  'practice': { template: 'template-practice', loader: 'loadPracticePage' },
  'exam': { template: 'template-exam', loader: 'loadExamPage' },
  'review': { template: 'template-review', loader: 'loadReviewPage' },
  'oral': { template: 'template-oral', loader: 'loadOralPage' },
  'journal': { template: 'template-journal', loader: 'loadJournalPage' },
  'settings': { template: 'template-settings', loader: 'loadSettingsPage' }
};

let currentRouteHash = 'dashboard';

async function router() {
  const hash = window.location.hash.substring(1) || 'dashboard';
  currentRouteHash = hash;
  const route = Routes[hash] || Routes['dashboard'];

  // 1. 更新側邊欄 Active 狀態
  const navItems = document.querySelectorAll('.nav-menu .nav-item');
  navItems.forEach(item => {
    if (item.getAttribute('data-page') === hash) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // 2. 顯示讀取中動畫
  const appView = document.getElementById('app-view');
  if (!appView) return;

  appView.innerHTML = `
    <div class="loader-container">
      <div class="spinner"></div>
      <div class="loading-text">正在載入資料...</div>
    </div>
  `;

  // 3. 克隆對應樣板並渲染
  try {
    const template = document.getElementById(route.template);
    if (!template) {
      appView.innerHTML = `<div class="glass-card"><h3>頁面建構中</h3><p>頁面模板 ${route.template} 遺失。</p></div>`;
      return;
    }
    appView.innerHTML = '';
    appView.appendChild(template.content.cloneNode(true));

    // 4. 執行對應頁面的資料載入與邏輯綁定 (Ponytail Audit: 移除不必要的 setTimeout)
    const loaderFunc = window[route.loader];
    if (loaderFunc && typeof loaderFunc === 'function') {
      await loaderFunc();
    } else {
      console.warn(`未找到頁面載入器: ${route.loader}`);
    }

    // 5. 重新進行公式排版
    renderMath();
  } catch (err) {
    console.error('[Router Error]', err);
    appView.innerHTML = `
      <div class="glass-card" style="border-color: var(--danger);">
        <h3 style="color: var(--danger);">資料載入失敗</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary" onclick="router()" style="margin-top: 1rem;">重新嘗試</button>
      </div>
    `;
  }
}

// 監聽路由變化與網頁初始化
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await DB.init();
  } catch (e) {
    console.warn('DB 初始失敗:', e);
  }

  if (typeof syncAuthUI === 'function') {
    syncAuthUI();
  }

  if (typeof onAuthChanged === 'function') {
    onAuthChanged(async (user) => {
      try {
        await DB.init();
      } catch (e) {
        console.warn('Auth 切換後 DB 同步失敗:', e);
      }
      if (typeof syncAuthUI === 'function') syncAuthUI();
      router();
      if (user) {
        showToast(`已登入 Google 帳號：${user.email}`, 'success');
      }
    });
  }

  if (!window.location.hash) {
    window.location.hash = '#dashboard';
  } else {
    router();
  }
});

// ==========================================
// Ponytail Audit：通用課綱選單連動工具
// ==========================================

/**
 * 綁定模組與主題下拉選單
 */
function bindModuleTopicSelectors(modSelectId, topicSelectId, syllabus, options = {}) {
  const modSelect = document.getElementById(modSelectId);
  const topicSelect = document.getElementById(topicSelectId);
  if (!modSelect || !topicSelect) return;

  // 若模組選單尚未有任何選項，自動填入模組清單
  if (modSelect.options.length === 0) {
    if (options.allModOption) {
      modSelect.add(new Option(options.allModOption, 'ALL'));
    }
    const modules = [];
    const added = new Set();
    syllabus.forEach(u => {
      if (!added.has(u.moduleId)) {
        modules.push({ id: u.moduleId, name: u.moduleName });
        added.add(u.moduleId);
      }
    });
    if (typeof MODULE_NAMES !== 'undefined') {
      for (const mId in MODULE_NAMES) {
        if (!added.has(mId)) {
          modules.push({ id: mId, name: MODULE_NAMES[mId] });
          added.add(mId);
        }
      }
    }
    modules.forEach(m => {
      modSelect.add(new Option(`[${m.id}] ${m.name}`, m.id));
    });
  }

  const updateTopics = () => {
    const mId = modSelect.value;
    topicSelect.innerHTML = '';

    if (options.allTopicOption) {
      topicSelect.add(new Option(options.allTopicOption, 'ALL'));
    }

    const topics = [];
    const added = new Set();

    syllabus.forEach(u => {
      if ((mId === 'ALL' || u.moduleId === mId) && !added.has(u.topicId)) {
        topics.push({ id: u.topicId, name: u.topicName });
        added.add(u.topicId);
      }
    });

    topics.forEach(t => {
      topicSelect.add(new Option(`[${t.id}] ${t.name}`, t.id));
    });
  };

  modSelect.addEventListener('change', updateTopics);
  updateTopics();
}

/**
 * 綁定模組與單元下拉選單
 */
function bindModuleUnitSelectors(modSelectId, topicSelectId, unitSelectId, syllabus, options = {}) {
  const modSelect = document.getElementById(modSelectId);
  const topicSelect = topicSelectId ? document.getElementById(topicSelectId) : null;
  const unitSelect = document.getElementById(unitSelectId);
  if (!modSelect || !unitSelect) return;

  // 若模組選單尚未有任何選項，自動填入模組清單
  if (modSelect.options.length === 0) {
    if (options.allModOption) {
      modSelect.add(new Option(options.allModOption, 'ALL'));
    }
    const modules = [];
    const added = new Set();
    syllabus.forEach(u => {
      if (!added.has(u.moduleId)) {
        modules.push({ id: u.moduleId, name: u.moduleName });
        added.add(u.moduleId);
      }
    });
    if (typeof MODULE_NAMES !== 'undefined') {
      for (const mId in MODULE_NAMES) {
        if (!added.has(mId)) {
          modules.push({ id: mId, name: MODULE_NAMES[mId] });
          added.add(mId);
        }
      }
    }
    modules.forEach(m => {
      modSelect.add(new Option(`[${m.id}] ${m.name}`, m.id));
    });
  }

  const updateUnits = () => {
    const mId = modSelect.value;
    const tId = topicSelect ? topicSelect.value : null;
    unitSelect.innerHTML = '';

    if (options.allUnitOption) {
      unitSelect.add(new Option(options.allUnitOption, options.allUnitValue || ''));
    }

    const seenUnits = new Set();
    syllabus.forEach(u => {
      const matchMod = (mId === 'ALL' || u.moduleId === mId);
      const matchTopic = (!tId || tId === 'ALL' || u.topicId === tId);
      if (matchMod && matchTopic && !seenUnits.has(u.unitId)) {
        seenUnits.add(u.unitId);
        unitSelect.add(new Option(`[${u.unitId}] ${u.unitName}`, u.unitId));
      }
    });
  };

  modSelect.addEventListener('change', updateUnits);
  if (topicSelect) {
    topicSelect.addEventListener('change', updateUnits);
  }
  updateUnits();
}
