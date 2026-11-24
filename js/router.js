/**
 * 醫學物理師考照自學系統 - SPA Hash 路由器、GSAP 動態適配層與選單連動 (js/router.js)
 */

const Motion = {
  _initialized: false,
  _timerDraggable: null,
  reducedMotion: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = Boolean(mq && mq.matches);

    if (typeof window.gsap === 'undefined') return;

    const plugins = [];
    if (typeof window.Flip !== 'undefined') plugins.push(window.Flip);
    if (typeof window.Draggable !== 'undefined') plugins.push(window.Draggable);
    if (typeof window.ScrollToPlugin !== 'undefined') plugins.push(window.ScrollToPlugin);
    if (plugins.length > 0) {
      window.gsap.registerPlugin(...plugins);
    }

    if (typeof window.gsap.matchMedia === 'function') {
      const mm = window.gsap.matchMedia();
      mm.add('(prefers-reduced-motion: reduce)', () => {
        this.reducedMotion = true;
        return () => {
          this.reducedMotion = false;
        };
      });
    }

    this.initFloatingTimerDrag();
  },

  initFloatingTimerDrag() {
    const timerEl = document.getElementById('floating-timer');
    if (!timerEl || typeof window.Draggable === 'undefined' || typeof window.gsap === 'undefined') return;
    if (this._timerDraggable) return;

    try {
      const saved = JSON.parse(sessionStorage.getItem('mp_timer_pos') || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        window.gsap.set(timerEl, { x: saved.x, y: saved.y });
      }
    } catch (e) {}

    const created = window.Draggable.create(timerEl, {
      type: 'x,y',
      bounds: window,
      edgeResistance: 0.85,
      dragClickables: false,
      onDragEnd() {
        try {
          sessionStorage.setItem('mp_timer_pos', JSON.stringify({ x: Math.round(this.x), y: Math.round(this.y) }));
        } catch (e) {}
      }
    });
    this._timerDraggable = created && created[0] ? created[0] : null;
  },

  enterView(container) {
    if (!container || this.reducedMotion || typeof window.gsap === 'undefined') return;
    window.gsap.fromTo(
      container,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.22, ease: 'power3.out', clearProps: 'transform,opacity', overwrite: 'auto' }
    );
  },

  flip(targets, mutateFn, opts = {}) {
    if (this.reducedMotion || typeof window.gsap === 'undefined' || typeof window.Flip === 'undefined') {
      mutateFn();
      return;
    }
    const state = window.Flip.getState(targets);
    mutateFn();
    window.Flip.from(state, {
      duration: 0.28,
      ease: 'power2.out',
      simple: true,
      prune: true,
      ...opts
    });
  },

  scrollTo(target, offsetY = 72) {
    if (!target) return;
    if (!this.reducedMotion && typeof window.gsap !== 'undefined' && typeof window.ScrollToPlugin !== 'undefined') {
      window.gsap.to(window, {
        duration: 0.42,
        ease: 'power2.out',
        scrollTo: { y: target, offsetY }
      });
      return;
    }
    if (typeof target === 'number') {
      window.scrollTo({ top: target, behavior: this.reducedMotion ? 'auto' : 'smooth' });
    } else if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: this.reducedMotion ? 'auto' : 'smooth', block: 'center' });
    }
  }
};

const Routes = {
  dashboard: { template: 'template-dashboard', loader: 'loadDashboardPage' },
  syllabus: { template: 'template-syllabus', loader: 'loadSyllabusPage' },
  practice: { template: 'template-practice', loader: 'loadPracticePage' },
  exam: { template: 'template-exam', loader: 'loadExamPage' },
  review: { template: 'template-review', loader: 'loadReviewPage' },
  oral: { template: 'template-oral', loader: 'loadOralPage' },
  journal: { template: 'template-journal', loader: 'loadJournalPage' },
  settings: { template: 'template-settings', loader: 'loadSettingsPage' }
};

let currentRouteHash = 'dashboard';

async function router() {
  const hash = window.location.hash.substring(1) || 'dashboard';
  currentRouteHash = hash;
  const route = Routes[hash] || Routes.dashboard;

  // 離開模擬測驗頁面時停止背景計時器物件（sessionStorage 仍保存開始時間供隨時無縫恢復）
  if (hash !== 'exam' && typeof activeExamTimer !== 'undefined' && activeExamTimer) {
    activeExamTimer.stop();
    activeExamTimer = null;
  }

  // 1. 更新側邊欄 Active 狀態
  document.querySelectorAll('.nav-menu .nav-item').forEach((item) => {
    item.classList.toggle('active', item.getAttribute('data-page') === hash);
  });

  const appView = document.getElementById('app-view');
  if (!appView) return;

  // 2. 僅在記憶體快取未預熱時顯示載入指示，避免暖快取切頁閃爍
  const isWarm = typeof DB !== 'undefined' && typeof DB.isCacheWarm === 'function' && DB.isCacheWarm();
  if (!isWarm) {
    appView.innerHTML = `
      <div class="loader-container">
        <div class="spinner"></div>
        <div class="loading-text">正在載入資料</div>
      </div>
    `;
  }

  // 3. 克隆對應樣板並渲染
  try {
    const template = document.getElementById(route.template);
    if (!template) {
      appView.innerHTML = `<div class="surface-card"><h3>頁面建構中</h3><p>頁面模板 ${route.template} 遺失。</p></div>`;
      return;
    }

    appView.replaceChildren(template.content.cloneNode(true));

    const loaderFunc = window[route.loader];
    if (loaderFunc && typeof loaderFunc === 'function') {
      await loaderFunc();
    } else {
      console.warn(`未找到頁面載入器: ${route.loader}`);
    }

    Motion.enterView(appView);
    renderMath();
  } catch (err) {
    console.error('[Router Error]', err);
    const errCard = document.createElement('div');
    errCard.className = 'surface-card';
    errCard.style.borderColor = 'var(--danger)';
    errCard.innerHTML = `
      <h3 style="color: var(--danger);">資料載入失敗</h3>
      <p class="router-err-msg"></p>
      <button class="btn btn-primary" onclick="router()" style="margin-top: 16px;">重新嘗試</button>
    `;
    errCard.querySelector('.router-err-msg').textContent = err.message || String(err);
    appView.replaceChildren(errCard);
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await DB.init();
  } catch (e) {
    console.warn('DB 初始失敗:', e);
  }

  if (typeof syncAuthUI === 'function') syncAuthUI();

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
// Ponytail：共用課綱選單連動工具
// ==========================================
function _ensureModuleOptions(modSelect, syllabus, options = {}) {
  if (!modSelect || modSelect.options.length > 0) return;
  if (options.allModOption) {
    modSelect.add(new Option(options.allModOption, 'ALL'));
  }
  const added = new Set();
  const modules = [];
  syllabus.forEach((u) => {
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
  modules.forEach((m) => modSelect.add(new Option(`[${m.id}] ${m.name}`, m.id)));
}

function bindModuleTopicSelectors(modSelectId, topicSelectId, syllabus, options = {}) {
  const modSelect = document.getElementById(modSelectId);
  const topicSelect = document.getElementById(topicSelectId);
  if (!modSelect || !topicSelect) return;

  _ensureModuleOptions(modSelect, syllabus, options);

  const updateTopics = () => {
    const mId = modSelect.value;
    topicSelect.replaceChildren();
    if (options.allTopicOption) {
      topicSelect.add(new Option(options.allTopicOption, 'ALL'));
    }
    const added = new Set();
    syllabus.forEach((u) => {
      if ((mId === 'ALL' || u.moduleId === mId) && !added.has(u.topicId)) {
        added.add(u.topicId);
        topicSelect.add(new Option(`[${u.topicId}] ${u.topicName}`, u.topicId));
      }
    });
  };

  modSelect.addEventListener('change', updateTopics);
  updateTopics();
}

function bindModuleUnitSelectors(modSelectId, topicSelectId, unitSelectId, syllabus, options = {}) {
  const modSelect = document.getElementById(modSelectId);
  const topicSelect = topicSelectId ? document.getElementById(topicSelectId) : null;
  const unitSelect = document.getElementById(unitSelectId);
  if (!modSelect || !unitSelect) return;

  _ensureModuleOptions(modSelect, syllabus, options);

  const updateUnits = () => {
    const mId = modSelect.value;
    const tId = topicSelect ? topicSelect.value : null;
    unitSelect.replaceChildren();
    if (options.allUnitOption) {
      unitSelect.add(new Option(options.allUnitOption, options.allUnitValue || ''));
    }
    const seen = new Set();
    syllabus.forEach((u) => {
      const matchMod = mId === 'ALL' || u.moduleId === mId;
      const matchTopic = !tId || tId === 'ALL' || u.topicId === tId;
      if (matchMod && matchTopic && !seen.has(u.unitId)) {
        seen.add(u.unitId);
        unitSelect.add(new Option(`[${u.unitId}] ${u.unitName}`, u.unitId));
      }
    });
  };

  modSelect.addEventListener('change', updateUnits);
  if (topicSelect) topicSelect.addEventListener('change', updateUnits);
  updateUnits();
}
