/**
 * 醫學物理師考照自學系統 - 各頁面控制器與互動邏輯 (js/app.js)
 */

// ==========================================
// 1. 儀表板頁面 (Dashboard)
// ==========================================
async function loadDashboardPage() {
  const dashProgressPercent = document.getElementById('dash-progress-percent');
  const dashCompletedUnits = document.getElementById('dash-completed-units');
  const dashTotalUnits = document.getElementById('dash-total-units');
  const dashHours = document.getElementById('dash-hours');
  const dashDailyGoal = document.getElementById('dash-daily-goal');
  const dashStreak = document.getElementById('dash-streak');
  const dashStreakSub = document.getElementById('dash-streak-sub');
  const dashDueCards = document.getElementById('dash-due-cards');
  const btnDueCount = document.getElementById('btn-due-count');
  const dashCountdown = document.getElementById('dash-countdown');
  const dashModuleList = document.getElementById('dash-module-list');

  const data = await DB.getDashboardData();
  if (currentRouteHash !== 'dashboard') return;

  if (dashProgressPercent) dashProgressPercent.innerText = data.overallProgressPercent;
  if (dashCompletedUnits) dashCompletedUnits.innerText = data.completedUnits;
  if (dashTotalUnits) dashTotalUnits.innerText = data.totalUnits;
  if (dashHours) dashHours.innerText = data.totalHours.toFixed(1);
  if (dashDailyGoal) dashDailyGoal.innerText = data.dailyGoalMinutes;
  if (dashStreak) dashStreak.innerText = data.streak;
  if (dashDueCards) dashDueCards.innerText = data.dueReviewCardsCount;
  if (btnDueCount) btnDueCount.innerText = data.dueReviewCardsCount;
  if (dashCountdown) dashCountdown.innerText = data.daysRemaining;

  if (dashStreakSub) {
    dashStreakSub.innerText = data.streak > 0
      ? `太棒了！已連續學習 ${data.streak} 天`
      : '今天還沒開始學習喔！';
  }

  // 繪製圖表
  Charts.drawDonut('canvas-progress-donut', data.overallProgressPercent);
  Charts.drawLine('canvas-study-line', data.weeklyDailyMinutes);

  // 動態渲染各模組進度條
  if (dashModuleList) {
    dashModuleList.innerHTML = '';
    for (const mId in data.moduleProgress) {
      const mod = data.moduleProgress[mId];
      const modRow = document.createElement('div');
      modRow.style.display = 'flex';
      modRow.style.flexDirection = 'column';
      modRow.style.gap = '0.25rem';

      modRow.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
          <span style="font-weight: 600;">[${mId}] ${mod.name}</span>
          <span style="color: var(--text-muted); font-weight: 500;">${mod.completed} / ${mod.total} 單元 (${mod.percent}%)</span>
        </div>
        <div class="progress-bar-container" style="height: 6px;">
          <div class="progress-bar-fill" style="width: ${mod.percent}%;"></div>
        </div>
      `;
      dashModuleList.appendChild(modRow);
    }
  }

  // 今日推薦單元
  try {
    const progressList = await DB.getProgress();
    const recUnit = progressList.find(p => p.status === 'not_started' || p.status === 'in_progress');
    const recCardBody = document.getElementById('dash-rec-card-body');
    const recTitle = document.getElementById('dash-rec-title');
    const recLit = document.getElementById('dash-rec-lit');
    const recDesc = document.getElementById('dash-rec-desc');

    if (recUnit) {
      if (recTitle) recTitle.innerText = `[${recUnit.moduleId}] ${recUnit.unitName}`;
      if (recLit) recLit.innerText = recUnit.literature;
      if (recDesc) {
        recDesc.innerHTML = `此單元規劃在第 ${recUnit.plannedWeek} 週研讀，指定章節為「${recUnit.chapters}」，建議研讀 ${recUnit.estimatedMinutes} 分鐘。<b style="color: var(--secondary);">點擊此卡片可直接前往該單元之課綱。</b>`;
      }
      if (recCardBody) {
        recCardBody.classList.add('rec-card-clickable');
        recCardBody.onclick = () => {
          window.pendingSyllabusScrollTarget = recUnit.unitId;
          window.location.hash = '#syllabus';
        };
      }
    } else {
      if (recTitle) recTitle.innerText = '🎉 恭喜！您已讀完所有單元';
      if (recLit) recLit.innerText = '無';
      if (recDesc) recDesc.innerText = '您已完成所有規定單元！建議進入練習題庫與口試模擬強化實戰力。';
      if (recCardBody) {
        recCardBody.classList.remove('rec-card-clickable');
        recCardBody.onclick = null;
      }
    }
  } catch (e) {}
}

// ==========================================
// 2. 課綱與進度頁面 (Syllabus)
// ==========================================
let currentSyllabusFilterMod = 'ALL';

async function loadSyllabusPage() {
  const container = document.getElementById('syllabus-list');
  const tabsContainer = document.getElementById('syllabus-module-tabs');

  // 綁定模組切換 Tab
  if (tabsContainer) {
    const tabs = tabsContainer.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.onclick = () => {
        tabs.forEach(t => {
          t.classList.remove('active', 'btn-primary');
          t.classList.add('btn-secondary');
        });
        tab.classList.add('active', 'btn-primary');
        tab.classList.remove('btn-secondary');
        currentSyllabusFilterMod = tab.getAttribute('data-mod');
        renderSyllabusList();
      };
    });
  }

  await renderSyllabusList();

  // 若有自 Dashboard 帶入的跳轉單元，進行平滑滾動與高亮
  if (window.pendingSyllabusScrollTarget) {
    const targetUnitId = window.pendingSyllabusScrollTarget;
    window.pendingSyllabusScrollTarget = null;
    setTimeout(() => {
      const el = document.getElementById(`unit-card-${targetUnitId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('unit-highlight');
        setTimeout(() => el.classList.remove('unit-highlight'), 4500);
      }
    }, 200);
  }
}

async function renderSyllabusList() {
  const container = document.getElementById('syllabus-list');
  if (!container) return;

  const progressList = await DB.getProgress();
  if (currentRouteHash !== 'syllabus') return;

  const filtered = currentSyllabusFilterMod === 'ALL'
    ? progressList
    : progressList.filter(u => u.moduleId === currentSyllabusFilterMod);

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = '<div class="glass-card" style="text-align: center; color: var(--text-dark); padding: 3rem;">此模組目前無單元資料。</div>';
    return;
  }

  const statusMap = {
    'not_started': { label: '未開始', class: 'badge-todo' },
    'in_progress': { label: '進行中', class: 'badge-progress' },
    'completed': { label: '已完成', class: 'badge-completed' },
    'review': { label: '需複習', class: 'badge-review' }
  };

  filtered.forEach(unit => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.id = `unit-card-${unit.unitId}`;
    card.style.padding = '1.25rem 1.5rem';

    const st = statusMap[unit.status] || statusMap['not_started'];

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 250px;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <span class="badge ${st.class}">${st.label}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">[${unit.unitId}] ${unit.moduleName}</span>
            <span style="font-size: 0.75rem; color: var(--text-dark);">第 ${unit.plannedWeek} 週</span>
          </div>
          <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.4rem;">${unit.unitName}</h3>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">
            <span style="color: var(--secondary); font-weight: 600;">指定文獻：</span>${unit.literature}
          </div>
          <div style="font-size: 0.8rem; color: var(--text-dark);">
            <span style="font-weight: 600;">章節範疇：</span>${unit.chapters}
          </div>
          ${unit.notes ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: #a0a5c1; background: rgba(0,0,0,0.25); padding: 0.5rem 0.75rem; border-radius: 6px; border-left: 3px solid var(--primary);"><span style="font-weight: 600; color: var(--primary);">研讀筆記：</span>${unit.notes}</div>` : ''}
        </div>

        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn btn-secondary" onclick="openNotebookLMModal('${unit.unitId}')" title="產生 NotebookLM AI 提示詞" style="padding: 0.5rem 0.75rem; font-size: 0.8rem;">
            <span class="material-icons-round" style="font-size: 1rem; color: var(--secondary);">auto_awesome</span>
            <span>NotebookLM</span>
          </button>
          <button class="btn btn-secondary" onclick="openUnitQuizModal('${unit.unitId}', '${unit.moduleId}', '${unit.topicId}')" title="單元隨堂測驗" style="padding: 0.5rem 0.75rem; font-size: 0.8rem;">
            <span class="material-icons-round" style="font-size: 1rem; color: var(--info);">quiz</span>
            <span>隨堂測驗</span>
          </button>
          <button class="btn btn-secondary" onclick="openAICardModal('${unit.moduleId}', '${unit.unitId}')" title="AI 產生複習卡" style="padding: 0.5rem 0.75rem; font-size: 0.8rem;">
            <span class="material-icons-round" style="font-size: 1rem; color: var(--warning);">bolt</span>
            <span>生卡</span>
          </button>
          <button class="btn btn-secondary" onclick="openProgressModal('${unit.unitId}', '${unit.status}', '${(unit.notes || '').replace(/'/g, "\\'")}')" title="更新筆記與進度" style="padding: 0.5rem 0.75rem; font-size: 0.8rem;">
            <span class="material-icons-round" style="font-size: 1rem;">edit_note</span>
            <span>進度</span>
          </button>
          <button class="btn btn-primary" onclick="StudyTimer.start('${unit.unitId}', '${unit.unitName.replace(/'/g, "\\'")}')" style="padding: 0.5rem 0.75rem; font-size: 0.8rem;">
            <span class="material-icons-round" style="font-size: 1rem;">timer</span>
            <span>計時研讀</span>
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// 彈窗操作：更新進度 Modal (原生 <dialog>)
function openProgressModal(unitId, status, notes) {
  const dialog = document.getElementById('progress-modal');
  document.getElementById('modal-unit-id').value = unitId;
  document.getElementById('modal-status').value = status || 'not_started';
  document.getElementById('modal-add-minutes').value = '0';
  document.getElementById('modal-notes').value = notes || '';

  const btnSubmit = document.getElementById('btn-submit-modal');
  btnSubmit.onclick = async () => {
    btnSubmit.disabled = true;
    try {
      const s = document.getElementById('modal-status').value;
      const m = document.getElementById('modal-add-minutes').value;
      const n = document.getElementById('modal-notes').value;
      await DB.updateProgress(unitId, s, m, n);
      showToast('單元進度已更新！', 'success');
      closeProgressModal();
      renderSyllabusList();
    } catch (e) {
      showToast('更新失敗：' + e.message, 'error');
    } finally {
      btnSubmit.disabled = false;
    }
  };

  if (dialog && dialog.showModal) dialog.showModal();
}

function closeProgressModal() {
  const dialog = document.getElementById('progress-modal');
  if (dialog && dialog.close) dialog.close();
}

// 彈窗操作：AI 生卡 Modal
function openAICardModal(moduleId, unitId) {
  const dialog = document.getElementById('ai-card-modal');
  document.getElementById('ai-modal-mod-id').value = moduleId;
  document.getElementById('ai-modal-unit-id').value = unitId || '';
  document.getElementById('ai-card-text').value = '';

  const btn = document.getElementById('btn-submit-ai-card');
  btn.onclick = async () => {
    const text = document.getElementById('ai-card-text').value;
    if (!text || text.trim() === '') {
      showToast('請貼上文獻重點內容！', 'warning');
      return;
    }
    btn.disabled = true;
    try {
      showToast('Gemini 正在提煉雙面複習卡片...', 'info');
      const cards = await GeminiService.generateFlashcardsAI(moduleId, unitId, text);
      showToast(`成功生成 ${cards.length} 張知識卡片！`, 'success');
      closeAICardModal();
    } catch (e) {
      showToast('生成失敗：' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  if (dialog && dialog.showModal) dialog.showModal();
}

function closeAICardModal() {
  const dialog = document.getElementById('ai-card-modal');
  if (dialog && dialog.close) dialog.close();
}

// 彈窗操作：NotebookLM 提示詞 Modal
async function openNotebookLMModal(unitId) {
  const dialog = document.getElementById('notebooklm-modal');
  const syllabus = await DB.getSyllabus();
  const unit = syllabus.find(u => u.unitId === unitId);
  if (!unit) return;

  const titleEl = document.getElementById('notebooklm-modal-title');
  const promptEl = document.getElementById('notebooklm-prompt-text');
  const openLink = document.getElementById('btn-open-notebooklm');

  if (titleEl) titleEl.innerText = `NotebookLM 提示詞 — [${unit.unitId}] ${unit.unitName}`;

  const promptText = `請扮演資深醫學物理考照教授，根據我所上傳的文獻檔案《${unit.literature}》，針對【${unit.unitName}】單元進行深度重點整理：

【學習範疇】：${unit.chapters}

請為我詳細條列並輸出：
1. 核心物理觀念與定義（重要名詞解釋）
2. 所有關鍵計算公式（請使用標準 LaTeX 格式表示，如 \\(D_{w,Q} = M \\cdot N_{D,w}^{Q_0} \\cdot k_Q\\)），並逐一說明各參數物理意義與典型數值
3. 指引中的品管標準容許差值 (Tolerances)、量測頻率與實驗配置
4. 臨床常考之陷阱題與口試重點

請使用繁體中文，格式清晰排版。`;

  if (promptEl) promptEl.value = promptText;

  const customUrl = await DB.getConfig('notebookLmUrl');
  if (openLink) openLink.href = customUrl || 'https://notebooklm.google.com';

  if (dialog && dialog.showModal) dialog.showModal();
}

function closeNotebookLMModal() {
  const dialog = document.getElementById('notebooklm-modal');
  if (dialog && dialog.close) dialog.close();
}

function copyNotebookLMPrompt() {
  const promptEl = document.getElementById('notebooklm-prompt-text');
  if (promptEl) {
    navigator.clipboard.writeText(promptEl.value).then(() => {
      showToast('提示詞已複製至剪貼簿！', 'success');
    }).catch(() => {
      promptEl.select();
      document.execCommand('copy');
      showToast('提示詞已複製！', 'success');
    });
  }
}

// 彈窗操作：隨堂測驗 Modal
async function openUnitQuizModal(unitId, moduleId, topicId) {
  const dialog = document.getElementById('unit-quiz-modal');
  const body = document.getElementById('quiz-modal-body');
  const title = document.getElementById('quiz-modal-title');
  if (title) title.innerText = `隨堂測驗 — ${unitId}`;

  body.innerHTML = '<div class="loader-container"><div class="spinner"></div><div class="loading-text">載入/生成隨堂題目中...</div></div>';
  if (dialog && dialog.showModal) dialog.showModal();

  try {
    const questions = await DB.getUnitQuiz(unitId, moduleId, topicId);
    if (!questions || questions.length === 0) {
      body.innerHTML = '<div style="text-align: center; color: var(--text-dark); padding: 2rem;">此單元目前無可用題目，請先至題庫生成。</div>';
      return;
    }

    body.innerHTML = '';
    questions.forEach((q, idx) => {
      const qDiv = document.createElement('div');
      qDiv.style.marginBottom = '1.5rem';
      qDiv.style.padding = '1rem';
      qDiv.style.background = 'rgba(255,255,255,0.02)';
      qDiv.style.borderRadius = '10px';
      qDiv.style.border = '1px solid var(--border-color)';

      qDiv.innerHTML = `
        <div style="font-weight: 700; color: var(--secondary); margin-bottom: 0.5rem;">第 ${idx + 1} 題</div>
        <div class="markdown-view" style="font-size: 0.95rem; margin-bottom: 1rem;">${q.questionText}</div>
        <div class="quiz-options" data-qid="${q.questionId}">
          ${['A', 'B', 'C', 'D'].map(opt => `
            <div class="quiz-option" data-opt="${opt}" onclick="selectQuizOption(this)">
              <div class="option-letter">${opt}</div>
              <div>${q['option' + opt]}</div>
            </div>
          `).join('')}
        </div>
        <div class="quiz-explanation" style="display: none; margin-top: 0.75rem; padding: 0.75rem; background: rgba(0,0,0,0.3); border-radius: 8px; font-size: 0.85rem; border-left: 3px solid var(--info);">
          <div style="font-weight: 700; color: var(--success); margin-bottom: 0.25rem;">正確答案：${q.correctAnswer}</div>
          <div class="markdown-view" style="color: var(--text-muted);">${q.explanation || '無詳細解析'}</div>
        </div>
      `;
      body.appendChild(qDiv);
    });

    renderMath();

    const btnSubmit = document.getElementById('btn-submit-unit-quiz');
    if (btnSubmit) {
      btnSubmit.style.display = 'inline-flex';
      btnSubmit.onclick = () => {
        let correctCount = 0;
        questions.forEach(q => {
          const optContainer = body.querySelector(`.quiz-options[data-qid="${q.questionId}"]`);
          if (!optContainer) return;
          const selected = optContainer.querySelector('.quiz-option.selected');
          const chosenOpt = selected ? selected.getAttribute('data-opt') : null;
          const isCorrect = chosenOpt && chosenOpt.toUpperCase() === q.correctAnswer.toUpperCase();
          if (isCorrect) correctCount++;

          // 標示顏色
          optContainer.querySelectorAll('.quiz-option').forEach(op => {
            const o = op.getAttribute('data-opt');
            if (o.toUpperCase() === q.correctAnswer.toUpperCase()) {
              op.classList.add('correct');
            } else if (op === selected) {
              op.classList.add('wrong');
            }
          });

          // 顯示解析
          const exp = optContainer.nextElementSibling;
          if (exp) exp.style.display = 'block';
        });

        btnSubmit.style.display = 'none';
        showToast(`測驗完成！答對 ${correctCount} / ${questions.length} 題`, correctCount === questions.length ? 'success' : 'info');
        renderMath();
      };
    }
  } catch (e) {
    body.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 2rem;">載入失敗: ${e.message}</div>`;
  }
}

function closeUnitQuizModal() {
  const dialog = document.getElementById('unit-quiz-modal');
  if (dialog && dialog.close) dialog.close();
}

function selectQuizOption(el) {
  const parent = el.closest('.quiz-options');
  if (!parent) return;
  parent.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

// ==========================================
// 3. AI 練習題庫頁面 (Practice)
// ==========================================
async function loadPracticePage() {
  const syllabus = await DB.getSyllabus();

  // 模組與主題、單元選單連動
  bindModuleTopicSelectors('practice-mod-select', 'practice-topic-select', syllabus);
  bindModuleUnitSelectors('practice-mod-select', 'practice-topic-select', 'practice-unit-select', syllabus, {
    allUnitOption: '全部小單元 (全主題出題)',
    allUnitValue: ''
  });

  const btnGen = document.getElementById('btn-generate-qs');
  if (btnGen) {
    btnGen.onclick = async () => {
      const mId = document.getElementById('practice-mod-select').value;
      const tId = document.getElementById('practice-topic-select').value;
      const uId = document.getElementById('practice-unit-select').value;
      const diff = document.getElementById('practice-diff-select').value;
      const cnt = document.getElementById('practice-count-select').value;

      btnGen.disabled = true;
      try {
        showToast('Gemini AI 正在研讀文獻並出題中...', 'info');
        const qs = await GeminiService.generateAIQuestions(mId, tId, cnt, diff, uId);
        showToast(`成功生成 ${qs.length} 道高水準練習題！`, 'success');
        loadPracticeQuestionsList();
      } catch (e) {
        showToast('出題失敗：' + e.message, 'error');
      } finally {
        btnGen.disabled = false;
      }
    };
  }

  // 篩選器切換
  const filterSelect = document.getElementById('filter-verified-select');
  if (filterSelect) {
    filterSelect.onchange = () => loadPracticeQuestionsList();
  }

  // 載入題庫清單
  loadPracticeQuestionsList();
}

async function loadPracticeQuestionsList() {
  const container = document.getElementById('questions-list-container');
  const countSpan = document.getElementById('practice-qs-count');
  if (!container) return;

  const mId = document.getElementById('practice-mod-select')?.value;
  const tId = document.getElementById('practice-topic-select')?.value;
  const filterVal = document.getElementById('filter-verified-select')?.value || 'all';

  container.innerHTML = '<div class="loader-container"><div class="spinner"></div><div class="loading-text">載入題庫中...</div></div>';

  try {
    let questions = await DB.getQuestions(mId, tId);
    if (currentRouteHash !== 'practice') return;

    if (filterVal === 'unverified') questions = questions.filter(q => !q.verified);
    else if (filterVal === 'verified') questions = questions.filter(q => q.verified);

    if (countSpan) countSpan.innerText = questions.length;
    container.innerHTML = '';

    if (questions.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-dark); padding: 3rem;">此分類下目前無題目。點選左側「使用 Gemini 出題」自動產生題目！</div>';
      return;
    }

    questions.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = 'glass-card';
      card.style.background = 'rgba(255, 255, 255, 0.015)';
      card.style.border = '1px solid var(--border-color)';
      card.style.padding = '1.25rem';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem;">
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <span class="badge ${q.verified ? 'badge-completed' : 'badge-review'}">${q.verified ? '已核可' : 'AI 待審查'}</span>
            <span style="font-weight: 700; color: var(--secondary);">第 ${idx + 1} 題</span>
            <span style="font-size: 0.75rem; color: var(--text-dark);">難度 ${q.difficulty} | ${q.sourceRef || q.moduleId}</span>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            ${!q.verified ? `
              <button class="btn btn-secondary" onclick="verifyPracticeQuestion('${q.questionId}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                <span class="material-icons-round" style="font-size: 0.9rem; color: var(--success);">check</span> 核可
              </button>
            ` : ''}
            <button class="btn btn-danger" onclick="deletePracticeQuestion('${q.questionId}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
              <span class="material-icons-round" style="font-size: 0.9rem;">delete</span>
            </button>
          </div>
        </div>

        <div class="markdown-view" style="font-size: 1rem; font-weight: 500; margin-bottom: 1rem;">${q.questionText}</div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1rem;">
          <div style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 0.85rem; border-left: 2px solid var(--border-color);"><span style="font-weight: 700; color: var(--secondary);">A.</span> ${q.optionA}</div>
          <div style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 0.85rem; border-left: 2px solid var(--border-color);"><span style="font-weight: 700; color: var(--secondary);">B.</span> ${q.optionB}</div>
          <div style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 0.85rem; border-left: 2px solid var(--border-color);"><span style="font-weight: 700; color: var(--secondary);">C.</span> ${q.optionC}</div>
          <div style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 0.85rem; border-left: 2px solid var(--border-color);"><span style="font-weight: 700; color: var(--secondary);">D.</span> ${q.optionD}</div>
        </div>

        <div style="background: rgba(0, 242, 254, 0.03); border: 1px solid rgba(0, 242, 254, 0.15); border-radius: 8px; padding: 0.75rem; font-size: 0.85rem;">
          <div style="font-weight: 700; color: var(--success); margin-bottom: 0.25rem;">正確解答：${q.correctAnswer}</div>
          <div class="markdown-view" style="color: var(--text-muted);">${q.explanation || '無詳細解析'}</div>
        </div>
      `;
      container.appendChild(card);
    });

    renderMath();
  } catch (e) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 2rem;">載入失敗: ${e.message}</div>`;
  }
}

async function verifyPracticeQuestion(qId) {
  await DB.verifyQuestion(qId);
  showToast('題目已核可！', 'success');
  loadPracticeQuestionsList();
}

async function deletePracticeQuestion(qId) {
  if (!confirm('確定要刪除此題目嗎？')) return;
  await DB.deleteQuestion(qId);
  showToast('題目已刪除', 'info');
  loadPracticeQuestionsList();
}

// 手動新增題目 Modal
async function openAddQuestionModal() {
  const dialog = document.getElementById('add-q-modal');
  const syllabus = await DB.getSyllabus();

  bindModuleTopicSelectors('manual-q-mod', 'manual-q-topic', syllabus);
  bindModuleUnitSelectors('manual-q-mod', 'manual-q-topic', 'manual-q-unit', syllabus, {
    allUnitOption: '一般題目 (無指定單元)',
    allUnitValue: ''
  });

  const btnSave = document.getElementById('btn-save-manual-q');
  if (btnSave) {
    btnSave.onclick = async () => {
      const qObj = {
        moduleId: document.getElementById('manual-q-mod').value,
        topicId: document.getElementById('manual-q-topic').value,
        unitId: document.getElementById('manual-q-unit').value,
        difficulty: document.getElementById('manual-q-diff').value,
        questionText: document.getElementById('manual-q-text').value,
        optionA: document.getElementById('manual-q-optA').value,
        optionB: document.getElementById('manual-q-optB').value,
        optionC: document.getElementById('manual-q-optC').value,
        optionD: document.getElementById('manual-q-optD').value,
        correctAnswer: document.getElementById('manual-q-ans').value,
        explanation: document.getElementById('manual-q-exp').value,
        sourceRef: document.getElementById('manual-q-ref').value
      };

      if (!qObj.questionText || !qObj.optionA || !qObj.optionB) {
        showToast('請完整填寫題目與選項！', 'warning');
        return;
      }

      btnSave.disabled = true;
      try {
        await DB.addManualQuestion(qObj);
        showToast('題目已成功建立！', 'success');
        closeAddQuestionModal();
        loadPracticeQuestionsList();
      } catch (e) {
        showToast('儲存失敗：' + e.message, 'error');
      } finally {
        btnSave.disabled = false;
      }
    };
  }

  if (dialog && dialog.showModal) dialog.showModal();
}

function closeAddQuestionModal() {
  const dialog = document.getElementById('add-q-modal');
  if (dialog && dialog.close) dialog.close();
}

// ==========================================
// 4. 模擬測驗中心 (Exam Center)
// ==========================================
let activeExam = null;
let activeExamTimer = null;
let activeExamQuestions = [];
let activeUserAnswers = [];
let activeExamIndex = 0;

async function loadExamPage() {
  const examTypeSelect = document.getElementById('exam-type-select');
  const examModGroup = document.getElementById('exam-mod-group');
  const examModSelect = document.getElementById('exam-mod-select');

  // 初始化模組下拉選單
  if (examModSelect) {
    examModSelect.innerHTML = '';
    for (const mId in MODULE_NAMES) {
      examModSelect.add(new Option(`[${mId}] ${MODULE_NAMES[mId]}`, mId));
    }
  }

  if (examTypeSelect) {
    examTypeSelect.onchange = () => {
      if (examModGroup) {
        examModGroup.style.display = examTypeSelect.value === 'module' ? 'block' : 'none';
      }
    };
  }

  const btnStart = document.getElementById('btn-start-exam');
  if (btnStart) {
    btnStart.onclick = async () => {
      const type = examTypeSelect ? examTypeSelect.value : 'full';
      const mId = type === 'module' ? (examModSelect ? examModSelect.value : 'M1') : null;

      btnStart.disabled = true;
      try {
        showToast('正在組卷中...', 'info');
        const qs = await DB.generateExam(type, mId);
        startActiveExam(type, qs, mId);
      } catch (e) {
        showToast('開啟測驗失敗：' + e.message, 'error');
      } finally {
        btnStart.disabled = false;
      }
    };
  }

  // 載入歷史成績
  loadExamHistory();
}

async function loadExamHistory() {
  const tbody = document.getElementById('exam-history-tbody');
  if (!tbody) return;

  const results = await DB.getExamResults();
  tbody.innerHTML = '';

  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-dark);">無測驗記錄</td></tr>';
    return;
  }

  results.forEach(r => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    const typeLabel = r.examType === 'full' ? '全範圍 (80題)' : '模組驗收';
    const minutes = Math.floor(r.timeSpent / 60);
    const secs = r.timeSpent % 60;

    tr.innerHTML = `
      <td style="padding: 0.75rem 0.25rem;">${r.date}</td>
      <td style="padding: 0.75rem 0.25rem;"><span class="badge ${r.examType === 'full' ? 'badge-progress' : 'badge-todo'}">${typeLabel}</span></td>
      <td style="padding: 0.75rem 0.25rem;">${r.correctCount} / ${r.totalQuestions}</td>
      <td style="padding: 0.75rem 0.25rem; font-weight: 700; color: ${r.score >= 60 ? 'var(--success)' : 'var(--danger)'};">${r.score} 分</td>
      <td style="padding: 0.75rem 0.25rem; font-family: monospace;">${minutes}分${secs}秒</td>
    `;
    tbody.appendChild(tr);
  });
}

function startActiveExam(type, questions, moduleId) {
  activeExamQuestions = questions;
  activeUserAnswers = questions.map(q => ({ questionId: q.questionId, selectedOption: null }));
  activeExamIndex = 0;

  document.getElementById('exam-setup-view').style.display = 'none';
  document.getElementById('exam-active-view').style.display = 'grid';
  document.getElementById('exam-result-view').style.display = 'none';

  // 測驗總時長：全範圍 60 分鐘 (3600秒)，單模組 30 分鐘 (1800秒)
  const duration = type === 'full' ? 3600 : 1800;

  activeExamTimer = new ExamTimer(duration, (remaining) => {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const timerEl = document.getElementById('active-exam-timer');
    if (timerEl) {
      timerEl.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }, () => {
    showToast('測驗時間到！自動為您交卷...', 'warning');
    submitActiveExam(type, moduleId);
  });

  activeExamTimer.start();
  renderExamNavGrid();
  renderActiveExamQuestion(0);

  // 綁定上一題、下一題、提前交卷
  document.getElementById('btn-exam-prev').onclick = () => {
    if (activeExamIndex > 0) renderActiveExamQuestion(activeExamIndex - 1);
  };
  document.getElementById('btn-exam-next').onclick = () => {
    if (activeExamIndex < activeExamQuestions.length - 1) renderActiveExamQuestion(activeExamIndex + 1);
  };
  document.getElementById('btn-submit-exam').onclick = () => {
    const uncompleted = activeUserAnswers.filter(a => !a.selectedOption).length;
    let msg = '確定要提早交卷嗎？';
    if (uncompleted > 0) {
      msg = `您尚有 ${uncompleted} 題未作答！確定要提前交卷嗎？`;
    }
    if (confirm(msg)) {
      submitActiveExam(type, moduleId);
    }
  };
}

function renderExamNavGrid() {
  const grid = document.getElementById('exam-nav-grid');
  const completedSpan = document.getElementById('exam-nav-completed');
  const totalSpan = document.getElementById('exam-nav-total');
  if (!grid) return;

  grid.innerHTML = '';
  const completedCount = activeUserAnswers.filter(a => !!a.selectedOption).length;
  if (completedSpan) completedSpan.innerText = completedCount;
  if (totalSpan) totalSpan.innerText = activeExamQuestions.length;

  activeExamQuestions.forEach((q, idx) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.style.padding = '0.35rem 0.2rem';
    btn.style.fontSize = '0.8rem';
    btn.style.borderRadius = '6px';
    btn.style.minWidth = '0';
    btn.innerText = idx + 1;

    const isAnswered = !!activeUserAnswers[idx].selectedOption;
    if (idx === activeExamIndex) {
      btn.style.borderColor = 'var(--secondary)';
      btn.style.background = 'rgba(0, 242, 254, 0.2)';
    } else if (isAnswered) {
      btn.style.borderColor = 'var(--primary)';
      btn.style.background = 'rgba(138, 43, 226, 0.25)';
    }

    btn.onclick = () => renderActiveExamQuestion(idx);
    grid.appendChild(btn);
  });
}

function renderActiveExamQuestion(idx) {
  activeExamIndex = idx;
  const q = activeExamQuestions[idx];
  if (!q) return;

  document.getElementById('active-q-index').innerText = idx + 1;
  document.getElementById('active-q-diff').innerText = q.difficulty;
  document.getElementById('active-q-text').innerHTML = q.questionText;

  const optionsContainer = document.getElementById('active-q-options');
  optionsContainer.innerHTML = '';

  const userChoice = activeUserAnswers[idx].selectedOption;

  ['A', 'B', 'C', 'D'].forEach(opt => {
    const optDiv = document.createElement('div');
    optDiv.className = `quiz-option ${userChoice === opt ? 'selected' : ''}`;
    optDiv.innerHTML = `
      <div class="option-letter">${opt}</div>
      <div style="font-size: 0.95rem;">${q['option' + opt]}</div>
    `;
    optDiv.onclick = () => {
      activeUserAnswers[idx].selectedOption = opt;
      renderActiveExamQuestion(idx);
      renderExamNavGrid();
    };
    optionsContainer.appendChild(optDiv);
  });

  // 控制上一題 / 下一題按鈕狀態
  document.getElementById('btn-exam-prev').disabled = (idx === 0);
  document.getElementById('btn-exam-next').disabled = (idx === activeExamQuestions.length - 1);

  renderExamNavGrid();
  renderMath();
}

async function submitActiveExam(type, moduleId) {
  if (activeExamTimer) {
    activeExamTimer.stop();
  }

  showToast('正在評分並分析弱點...', 'info');
  try {
    const timeSpent = activeExamTimer ? activeExamTimer.elapsed : 0;
    const result = await DB.submitExam(type, activeUserAnswers, timeSpent, moduleId);

    // 顯示結果視圖
    document.getElementById('exam-active-view').style.display = 'none';
    document.getElementById('exam-result-view').style.display = 'block';

    document.getElementById('res-score').innerText = result.score;
    document.getElementById('res-correct').innerText = result.correctCount;
    document.getElementById('res-total').innerText = result.totalQuestions;
    document.getElementById('res-time').innerText = `${Math.floor(timeSpent / 60)} 分 ${timeSpent % 60} 秒`;

    // 繪製雷達圖
    const moduleRates = {};
    for (const mId in result.moduleBreakdown) {
      moduleRates[mId] = result.moduleBreakdown[mId].rate;
    }
    Charts.drawRadar('canvas-exam-radar', moduleRates);

    // 錯題與詳解檢討清單
    const errorList = document.getElementById('exam-error-list');
    if (errorList) {
      errorList.innerHTML = '';
      result.details.forEach((det, i) => {
        const item = document.createElement('div');
        item.className = 'glass-card';
        item.style.background = 'rgba(255, 255, 255, 0.015)';
        item.style.border = `1px solid ${det.isCorrect ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.2)'}`;
        item.style.padding = '1.25rem';

        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="font-weight: 700; color: ${det.isCorrect ? 'var(--success)' : 'var(--danger)'};">第 ${i + 1} 題 — ${det.isCorrect ? '答對' : '答錯'}</span>
            <span style="font-size: 0.75rem; color: var(--text-dark);">模組 [${det.moduleId}] | ${det.sourceRef || ''}</span>
          </div>
          <div class="markdown-view" style="font-size: 0.95rem; margin-bottom: 0.75rem;">${det.questionText}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">您的回答：<b>${det.userAnswer || '未作答'}</b> | 正確解答：<b style="color: var(--success);">${det.correctAnswer}</b></div>
          <div style="background: rgba(0,0,0,0.25); padding: 0.75rem; border-radius: 8px; font-size: 0.85rem; border-left: 3px solid var(--primary);" class="markdown-view">
            <span style="font-weight: 600; color: var(--primary);">詳解解析：</span>${det.explanation || '無'}
          </div>
        `;
        errorList.appendChild(item);
      });
    }

    renderMath();
    loadExamHistory();
  } catch (e) {
    showToast('交卷失敗：' + e.message, 'error');
  }
}

// ==========================================
// 5. 知識卡片複習頁面 (Review / SM-2)
// ==========================================
let activeReviewCards = [];
let currentCardIndex = 0;

async function loadReviewPage() {
  const syllabus = await DB.getSyllabus();

  bindModuleUnitSelectors('review-filter-mod', null, 'review-filter-unit', syllabus, {
    allUnitOption: '全部單元',
    allUnitValue: 'ALL'
  });

  // 模組下拉選單加入 ALL 選項
  const modSelect = document.getElementById('review-filter-mod');
  if (modSelect) {
    modSelect.innerHTML = '';
    modSelect.add(new Option('全部模組', 'ALL'));
    for (const mId in MODULE_NAMES) {
      modSelect.add(new Option(`[${mId}] ${MODULE_NAMES[mId]}`, mId));
    }
  }

  // 綁定自建卡片選單
  bindModuleUnitSelectors('card-add-mod', null, 'card-add-unit', syllabus);
  const cardAddMod = document.getElementById('card-add-mod');
  if (cardAddMod) {
    cardAddMod.innerHTML = '';
    for (const mId in MODULE_NAMES) {
      cardAddMod.add(new Option(`[${mId}] ${MODULE_NAMES[mId]}`, mId));
    }
  }

  // 篩選切換
  if (modSelect) modSelect.onchange = () => loadActiveReviewQueue();
  const unitSelect = document.getElementById('review-filter-unit');
  if (unitSelect) unitSelect.onchange = () => loadActiveReviewQueue();

  // 卡片翻面事件
  const flipper = document.getElementById('review-card-flipper');
  const ratingActions = document.getElementById('review-rating-actions');
  if (flipper) {
    flipper.onclick = () => {
      flipper.classList.toggle('flipped');
      if (ratingActions) {
        ratingActions.style.display = flipper.classList.contains('flipped') ? 'flex' : 'none';
      }
      renderMath();
    };
  }

  // 評分按鈕 (0-5分)
  document.querySelectorAll('.rating-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const score = Number(btn.getAttribute('data-score'));
      const card = activeReviewCards[currentCardIndex];
      if (!card) return;

      try {
        await DB.submitReviewCardScore(card.cardId, score);
        showToast(`評分已提交 (${score}分)！下一次複習已排程。`, 'success');
        currentCardIndex++;
        renderCurrentReviewCard();
      } catch (err) {
        showToast('評分提交失敗: ' + err.message, 'error');
      }
    };
  });

  // 儲存手動自建卡片
  const btnSaveCard = document.getElementById('btn-save-card');
  if (btnSaveCard) {
    btnSaveCard.onclick = async () => {
      const m = document.getElementById('card-add-mod').value;
      const u = document.getElementById('card-add-unit').value;
      const f = document.getElementById('card-add-front').value;
      const b = document.getElementById('card-add-back').value;

      if (!f || !b) {
        showToast('請完整填寫卡片正面與背面內容！', 'warning');
        return;
      }

      btnSaveCard.disabled = true;
      try {
        await DB.addManualReviewCard(m, u, f, b);
        showToast('知識卡片已成功儲存！', 'success');
        document.getElementById('card-add-front').value = '';
        document.getElementById('card-add-back').value = '';
        loadActiveReviewQueue();
      } catch (err) {
        showToast('新增卡片失敗: ' + err.message, 'error');
      } finally {
        btnSaveCard.disabled = false;
      }
    };
  }

  loadActiveReviewQueue();
}

async function loadActiveReviewQueue() {
  const mFilter = document.getElementById('review-filter-mod')?.value || 'ALL';
  const uFilter = document.getElementById('review-filter-unit')?.value || 'ALL';

  const dueCards = await DB.getDueReviewCards();
  if (currentRouteHash !== 'review') return;

  activeReviewCards = dueCards.filter(c => {
    const matchM = (mFilter === 'ALL' || c.moduleId === mFilter);
    const matchU = (uFilter === 'ALL' || !uFilter || c.unitId === uFilter);
    return matchM && matchU;
  });

  currentCardIndex = 0;
  renderCurrentReviewCard();
}

function renderCurrentReviewCard() {
  const activeBox = document.getElementById('review-active-box');
  const emptyBox = document.getElementById('review-empty-box');
  const curSpan = document.getElementById('review-card-current');
  const totalSpan = document.getElementById('review-card-total');
  const flipper = document.getElementById('review-card-flipper');
  const ratingActions = document.getElementById('review-rating-actions');

  if (currentCardIndex >= activeReviewCards.length) {
    if (activeBox) activeBox.style.display = 'none';
    if (emptyBox) emptyBox.style.display = 'flex';
    return;
  }

  if (emptyBox) emptyBox.style.display = 'none';
  if (activeBox) activeBox.style.display = 'flex';

  if (flipper) flipper.classList.remove('flipped');
  if (ratingActions) ratingActions.style.display = 'none';

  const card = activeReviewCards[currentCardIndex];
  if (curSpan) curSpan.innerText = currentCardIndex + 1;
  if (totalSpan) totalSpan.innerText = activeReviewCards.length;

  document.getElementById('review-card-mod-front').innerText = card.moduleId;
  document.getElementById('review-card-mod-back').innerText = card.moduleId;
  document.getElementById('review-card-front-text').innerHTML = card.front;
  document.getElementById('review-card-back-text').innerHTML = card.back;

  renderMath();
}

// ==========================================
// 6. 口試模擬問答頁面 (Oral Simulator)
// ==========================================
let currentOralQuestion = null;

async function loadOralPage() {
  const modSelect = document.getElementById('oral-mod-select');
  if (modSelect) {
    modSelect.innerHTML = '';
    for (const mId in MODULE_NAMES) {
      modSelect.add(new Option(`[${mId}] ${MODULE_NAMES[mId]}`, mId));
    }
  }

  const btnStart = document.getElementById('btn-start-oral');
  if (btnStart) {
    btnStart.onclick = async () => {
      const mId = modSelect.value;
      const qType = document.getElementById('oral-type-select').value;

      btnStart.disabled = true;
      try {
        showToast('Gemini 考官正在擬定題目...', 'info');
        currentOralQuestion = await GeminiService.generateOralQuestionAI(mId, qType);
        
        document.getElementById('oral-setup-box').style.display = 'none';
        document.getElementById('oral-active-box').style.display = 'flex';
        document.getElementById('oral-report-box').style.display = 'none';

        document.getElementById('active-oral-question').innerHTML = currentOralQuestion.question;
        document.getElementById('oral-user-answer').value = '';
        renderMath();
      } catch (e) {
        showToast('出題失敗：' + e.message, 'error');
      } finally {
        btnStart.disabled = false;
      }
    };
  }

  const btnSubmit = document.getElementById('btn-submit-oral');
  if (btnSubmit) {
    btnSubmit.onclick = async () => {
      const ans = document.getElementById('oral-user-answer').value;
      if (!ans || ans.trim() === '') {
        showToast('請先輸入您的回答內容！', 'warning');
        return;
      }

      btnSubmit.disabled = true;
      try {
        showToast('Gemini 口試委員正在進行四維度評分...', 'info');
        const qType = document.getElementById('oral-type-select').value;
        const evalRes = await GeminiService.gradeOralAnswerAI(
          currentOralQuestion.question,
          qType,
          currentOralQuestion.referenceAnswer,
          ans
        );

        const practiceRecord = {
          practiceId: crypto.randomUUID(),
          moduleId: currentOralQuestion.moduleId,
          questionType: qType,
          question: currentOralQuestion.question,
          userAnswer: ans,
          aiScore: Number(evalRes.score || 0),
          aiFeedback: evalRes,
          referenceAnswer: currentOralQuestion.referenceAnswer,
          date: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString()
        };

        await DB.saveOralPractice(practiceRecord);

        // 渲染診斷報告
        document.getElementById('oral-active-box').style.display = 'none';
        document.getElementById('oral-report-box').style.display = 'flex';

        document.getElementById('oral-report-question').innerHTML = currentOralQuestion.question;
        document.getElementById('oral-report-user-answer').innerText = ans;
        document.getElementById('oral-res-score').innerText = evalRes.score;
        document.getElementById('oral-score-comp').innerText = evalRes.completeness;
        document.getElementById('oral-score-acc').innerText = evalRes.accuracy;
        document.getElementById('oral-score-log').innerText = evalRes.logic;
        document.getElementById('oral-score-dep').innerText = evalRes.depth;
        document.getElementById('oral-report-feedback').innerHTML = evalRes.feedback;
        document.getElementById('oral-report-ref-answer').innerHTML = currentOralQuestion.referenceAnswer;

        const missingUl = document.getElementById('oral-report-missing-list');
        if (missingUl) {
          missingUl.innerHTML = '';
          (evalRes.missingPoints || []).forEach(p => {
            const li = document.createElement('li');
            li.innerText = p;
            missingUl.appendChild(li);
          });
        }

        renderMath();
        loadOralHistory();
      } catch (e) {
        showToast('評分失敗：' + e.message, 'error');
      } finally {
        btnSubmit.disabled = false;
      }
    };
  }

  loadOralHistory();
}

function showOralSetup() {
  document.getElementById('oral-setup-box').style.display = 'flex';
  document.getElementById('oral-active-box').style.display = 'none';
  document.getElementById('oral-report-box').style.display = 'none';
}

async function loadOralHistory() {
  const container = document.getElementById('oral-history-list');
  if (!container) return;

  const practices = await DB.getOralPractices();
  container.innerHTML = '';

  if (practices.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-dark); padding: 2rem;">尚無口試紀錄</div>';
    return;
  }

  practices.forEach(p => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.style.background = 'rgba(255,255,255,0.015)';
    card.style.border = '1px solid var(--border-color)';
    card.style.padding = '0.85rem';
    card.style.minWidth = '0';
    card.style.overflow = 'hidden';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">
        <span style="font-weight: 600; color: var(--secondary);">[${p.moduleId}] ${p.date}</span>
        <span style="font-weight: 700; color: ${p.aiScore >= 70 ? 'var(--success)' : 'var(--warning)'};">${p.aiScore} 分</span>
      </div>
      <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.question}</div>
    `;
    container.appendChild(card);
  });
}

// ==========================================
// 7. 學習日誌頁面 (Journal)
// ==========================================
async function loadJournalPage() {
  const syllabus = await DB.getSyllabus();
  const unitSelect = document.getElementById('journal-add-unit');
  if (unitSelect) {
    unitSelect.innerHTML = '';
    unitSelect.add(new Option('一般通用研讀 (General Study)', 'General'));
    syllabus.forEach(u => {
      unitSelect.add(new Option(`[${u.unitId}] ${u.unitName}`, u.unitId));
    });
  }

  const btnSave = document.getElementById('btn-save-journal');
  if (btnSave) {
    btnSave.onclick = async () => {
      const u = unitSelect.value;
      const m = document.getElementById('journal-add-minutes').value;
      const n = document.getElementById('journal-add-notes').value;

      if (!n || n.trim() === '') {
        showToast('心得筆記不可為空！', 'warning');
        return;
      }

      btnSave.disabled = true;
      try {
        await DB.addManualStudyLog(u, m, n);
        showToast('研讀日誌已成功儲存！', 'success');
        document.getElementById('journal-add-notes').value = '';
        loadJournalList();
      } catch (err) {
        showToast('儲存失敗：' + err.message, 'error');
      } finally {
        btnSave.disabled = false;
      }
    };
  }

  loadJournalList();
}

async function loadJournalList() {
  const container = document.getElementById('journal-list-container');
  if (!container) return;

  container.innerHTML = '<div class="loader-container"><div class="spinner"></div><div class="loading-text">載入日誌中...</div></div>';

  try {
    const logs = await DB.getStudyLogs();
    if (currentRouteHash !== 'journal') return;

    container.innerHTML = '';

    if (logs.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-dark); padding: 3rem;">目前尚無研讀日誌。請開始計時學習或在右側手動補登！</div>';
      return;
    }

    logs.forEach(log => {
      const card = document.createElement('div');
      card.className = 'glass-card';
      card.style.background = 'rgba(255,255,255,0.01)';
      card.style.border = '1px solid var(--border-color)';
      card.style.padding = '1.25rem';

      const unitText = log.unitId === 'General' ? '通用研讀' : `單元 ${log.unitId}`;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 0.25rem;">
          <span style="font-weight: 600; color: var(--secondary);">${log.date}</span>
          <span>${unitText} | 研讀了 <span style="color: var(--secondary); font-weight: bold;">${log.minutes}</span> 分鐘</span>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6; white-space: pre-wrap;" class="markdown-view">${log.journalEntry}</div>
      `;
      container.appendChild(card);
    });

    renderMath();
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 2rem;">載入失敗: ${err.message}</div>`;
  }
}

// ==========================================
// 8. 系統設定與備份管理 (Settings)
// ==========================================
async function loadSettingsPage() {
  const examDateInput = document.getElementById('input-exam-date');
  const startDateInput = document.getElementById('input-start-date');
  const dailyGoalInput = document.getElementById('input-daily-goal');
  const notebookUrlInput = document.getElementById('input-notebook-url');
  const apiKeyInput = document.getElementById('input-api-key');
  const modelSelect = document.getElementById('select-model');

  // Firebase 設定欄位
  const fbApiKeyInput = document.getElementById('input-fb-api-key');
  const fbProjectIdInput = document.getElementById('input-fb-project-id');
  const fbStatusSpan = document.getElementById('fb-connection-status');

  try {
    examDateInput.value = (await DB.getConfig('examDate')) || '2027-10-01';
    startDateInput.value = (await DB.getConfig('startDate')) || new Date().toISOString().split('T')[0];
    dailyGoalInput.value = (await DB.getConfig('dailyGoalMinutes')) || '45';
    notebookUrlInput.value = (await DB.getConfig('notebookLmUrl')) || '';
    apiKeyInput.value = (await DB.getConfig('geminiApiKey')) || '';
    modelSelect.value = (await DB.getConfig('geminiModel')) || 'gemini-2.5-flash';

    const activeFb = getActiveFirebaseConfig();
    if (fbApiKeyInput) fbApiKeyInput.value = activeFb.apiKey || '';
    if (fbProjectIdInput) fbProjectIdInput.value = activeFb.projectId || '';

    if (fbStatusSpan) {
      if (isFirebaseConnected) {
        fbStatusSpan.innerText = '已連接至 Cloud Firestore';
        fbStatusSpan.className = 'badge badge-completed';
      } else {
        fbStatusSpan.innerText = '使用瀏覽器本機儲存 (LocalStorage)';
        fbStatusSpan.className = 'badge badge-review';
      }
    }
  } catch (e) {
    showToast('讀取設定檔失敗', 'error');
  }

  // 儲存學習參數
  document.getElementById('btn-save-params').onclick = async () => {
    const btn = document.getElementById('btn-save-params');
    btn.disabled = true;
    try {
      await DB.saveConfig('examDate', examDateInput.value);
      await DB.saveConfig('startDate', startDateInput.value);
      await DB.saveConfig('dailyGoalMinutes', dailyGoalInput.value);
      await DB.saveConfig('notebookLmUrl', notebookUrlInput.value);
      showToast('備考學習參數已儲存！', 'success');
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  // 儲存 Gemini API 金鑰
  document.getElementById('btn-save-ai').onclick = async () => {
    const btn = document.getElementById('btn-save-ai');
    btn.disabled = true;
    try {
      await DB.saveConfig('geminiApiKey', apiKeyInput.value.trim());
      await DB.saveConfig('geminiModel', modelSelect.value);
      showToast('Gemini AI 連線設定已儲存！', 'success');
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  // 儲存 Firebase 連線設定
  const btnSaveFb = document.getElementById('btn-save-fb');
  if (btnSaveFb) {
    btnSaveFb.onclick = () => {
      const fbConfig = {
        apiKey: fbApiKeyInput.value.trim(),
        projectId: fbProjectIdInput.value.trim(),
        authDomain: `${fbProjectIdInput.value.trim()}.firebaseapp.com`,
        storageBucket: `${fbProjectIdInput.value.trim()}.appspot.com`
      };
      saveCustomFirebaseConfig(fbConfig);
      showToast('Firebase 設定已儲存，正在重新連線...', 'info');
      setTimeout(() => location.reload(), 1000);
    };
  }

  // 資料庫自癒初始化
  document.getElementById('btn-init-db').onclick = async () => {
    if (!confirm('您確定要初始化/修復資料庫結構嗎？\n此動作會為您補齊 10 大領域、37 個學習單元課綱。(已建立的自建進度不會被清除)')) return;
    const btn = document.getElementById('btn-init-db');
    btn.disabled = true;
    try {
      showToast('正在初始化資料庫...', 'info');
      const res = await DB.init(true);
      showToast(res.message, 'success');
    } catch (e) {
      showToast('初始化失敗：' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  // 匯出完整 JSON 備份
  const btnExport = document.getElementById('btn-export-backup');
  if (btnExport) {
    btnExport.onclick = async () => {
      try {
        const jsonStr = await DB.exportAllDataJSON();
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `medical_physicist_study_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('備份檔案已成功下載！', 'success');
      } catch (e) {
        showToast('匯出備份失敗：' + e.message, 'error');
      }
    };
  }

  // 還原 JSON 備份
  const fileInput = document.getElementById('input-import-backup');
  if (fileInput) {
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          showToast('正在還原資料庫備份...', 'info');
          const res = await DB.importAllDataJSON(evt.target.result);
          showToast(res.message, 'success');
          setTimeout(() => location.reload(), 1500);
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
      reader.readAsText(file);
    };
  }
}
