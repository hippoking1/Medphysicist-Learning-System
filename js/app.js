/**
 * 醫學物理師考照自學系統 - 各頁面控制器與互動邏輯 (js/app.js)
 */

let lastDashboardData = null;
let lastExamRadarRates = null;

/**
 * 主題切換時即時重繪畫面上的 Canvas 圖表
 */
function redrawActiveCharts() {
  if (currentRouteHash === 'dashboard' && lastDashboardData) {
    Charts.drawDonut('canvas-progress-donut', lastDashboardData.overallProgressPercent);
    Charts.drawLine('canvas-study-line', lastDashboardData.weeklyDailyMinutes);
  } else if (currentRouteHash === 'exam' && lastExamRadarRates) {
    const resultView = document.getElementById('exam-result-view');
    if (resultView && resultView.style.display !== 'none') {
      Charts.drawRadar('canvas-exam-radar', lastExamRadarRates);
    }
  }
}

/**
 * 共用輔助：將任一題目一鍵轉存為 SM-2 知識卡片 (消除重複邏輯)
 */
async function convertQuestionToFlashcard(q) {
  const front = `${q.questionText}\n\n(選項參考：A. ${q.optionA} / B. ${q.optionB} / C. ${q.optionC} / D. ${q.optionD})`;
  const back = `正確答案：${q.correctAnswer}\n\n${q.explanation || '無詳細解析'}${q.sourceRef ? `\n\n參考依據：${q.sourceRef}` : ''}`;
  await DB.addManualReviewCard(q.moduleId || 'M1', q.unitId || '', front, back);
  showToast('已將題目與詳解轉入 SM-2 知識卡佇列', 'success');
}

// ==========================================
// 1. 儀表板頁面 (Dashboard)
// ==========================================
async function loadDashboardPage() {
  const data = await DB.getDashboardData();
  if (currentRouteHash !== 'dashboard') return;
  lastDashboardData = data;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setText('dash-progress-percent', data.overallProgressPercent);
  setText('dash-completed-units', data.completedUnits);
  setText('dash-total-units', data.totalUnits);
  setText('dash-hours', data.totalHours.toFixed(1));
  setText('dash-today-mins', data.todayMinutes || 0);
  setText('dash-daily-goal', data.dailyGoalMinutes);
  setText('dash-streak', data.streak);
  setText('dash-streak-sub', `近 7 日累計 ${data.weeklyTotalMinutes || 0} min`);
  setText('dash-due-cards', data.dueReviewCardsCount);
  setText('dash-total-cards', data.totalReviewCardsCount || 0);
  setText('btn-due-count', data.dueReviewCardsCount);
  setText('dash-countdown', data.daysRemaining);

  Charts.drawDonut('canvas-progress-donut', data.overallProgressPercent);
  Charts.drawLine('canvas-study-line', data.weeklyDailyMinutes);

  const dashModuleList = document.getElementById('dash-module-list');
  if (dashModuleList) {
    dashModuleList.innerHTML = '';
    for (const mId in data.moduleProgress) {
      const mod = data.moduleProgress[mId];
      const modRow = document.createElement('div');
      modRow.style.display = 'flex';
      modRow.style.flexDirection = 'column';
      modRow.style.gap = '4px';

      modRow.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 13px;">
          <span style="font-weight: 500;"><span class="mono-num" style="color: var(--text-muted);">${mId}</span> ${mod.name}</span>
          <span class="mono-num" style="color: var(--text-muted); font-size: 12px;">${mod.completed}/${mod.total} (${mod.percent}%)</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${mod.percent}%;"></div>
        </div>
      `;
      dashModuleList.appendChild(modRow);
    }
  }

  try {
    const progressList = await DB.getProgress();
    const recUnit = progressList.find((p) => p.status === 'not_started' || p.status === 'in_progress');
    const recCardBody = document.getElementById('dash-rec-card-body');
    const recTitle = document.getElementById('dash-rec-title');
    const recLit = document.getElementById('dash-rec-lit');
    const recDesc = document.getElementById('dash-rec-desc');

    if (recUnit) {
      if (recTitle) recTitle.innerText = `[${recUnit.moduleId}] ${recUnit.unitName}`;
      if (recLit) recLit.innerText = recUnit.literature;
      if (recDesc) {
        recDesc.innerHTML = `第 ${recUnit.plannedWeek} 週進度 · 範疇：${recUnit.chapters}（預估 ${recUnit.estimatedMinutes} 分鐘）。點擊前往該單元。`;
      }
      if (recCardBody) {
        recCardBody.classList.add('rec-card-clickable');
        recCardBody.onclick = () => {
          window.pendingSyllabusScrollTarget = recUnit.unitId;
          window.location.hash = '#syllabus';
        };
      }
    } else {
      if (recTitle) recTitle.innerText = '全部 37 單元已完成';
      if (recLit) recLit.innerText = '—';
      if (recDesc) recDesc.innerText = '課綱單元已全部標記完成，建議集中於模擬測驗、SM-2 記憶卡與口試模擬強化實戰。';
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
  activeWorkspaceUnitId = null;
  const tabsContainer = document.getElementById('syllabus-module-tabs');

  if (tabsContainer) {
    const tabs = tabsContainer.querySelectorAll('.tab-btn');
    tabs.forEach((tab) => {
      tab.onclick = () => {
        tabs.forEach((t) => {
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

  if (window.pendingSyllabusScrollTarget) {
    const targetUnitId = window.pendingSyllabusScrollTarget;
    window.pendingSyllabusScrollTarget = null;
    setTimeout(() => {
      const el = document.getElementById(`unit-card-${targetUnitId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('unit-highlight');
        setTimeout(() => el.classList.remove('unit-highlight'), 4000);
      }
    }, 180);
  }
}

async function renderSyllabusList() {
  const container = document.getElementById('syllabus-list');
  if (!container) return;

  const progressList = await DB.getProgress();
  if (currentRouteHash !== 'syllabus') return;

  const filtered =
    currentSyllabusFilterMod === 'ALL'
      ? progressList
      : progressList.filter((u) => u.moduleId === currentSyllabusFilterMod);

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML =
      '<div class="surface-card" style="text-align: center; color: var(--text-dark); padding: 32px;">此模組目前無單元資料</div>';
    return;
  }

  const statusMap = {
    not_started: { label: '未開始', class: 'badge-todo' },
    in_progress: { label: '進行中', class: 'badge-progress' },
    completed: { label: '已完成', class: 'badge-completed' },
    review: { label: '需複習', class: 'badge-review' }
  };

  filtered.forEach((unit) => {
    const card = document.createElement('div');
    card.className = 'surface-card unit-card';
    card.id = `unit-card-${unit.unitId}`;

    const st = statusMap[unit.status] || statusMap.not_started;
    const hasDiagram = typeof Diagrams !== 'undefined' && Diagrams.UNIT_DIAGRAMS[unit.unitId];
    const hasGuide = !!(unit.studyGuide && unit.studyGuide.trim());

    card.innerHTML = `
      <div class="unit-card-row">
        <div class="unit-card-info">
          <div class="unit-meta-row">
            <span class="badge ${st.class}">${st.label}</span>
            ${hasGuide ? '<span class="badge badge-progress">已存講義</span>' : ''}
            <span class="mono-num" style="font-size: 12px; color: var(--text-muted); font-weight: 500;">${unit.unitId}</span>
            <span style="font-size: 12px; color: var(--text-muted);">${unit.moduleName}</span>
            <span class="mono-num" style="font-size: 12px; color: var(--text-dark);">W${unit.plannedWeek} · 累計 ${unit.totalMinutes || 0} min</span>
          </div>
          <h3 style="font-size: 16px; font-weight: 600; color: var(--text-main); margin-bottom: 6px;">${unit.unitName}</h3>
          <div style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 4px;">
            <span style="color: var(--accent); font-weight: 500;">文獻：</span>${unit.literature}
          </div>
          <div style="font-size: 12.5px; color: var(--text-dark);">
            <span>範疇：</span>${unit.chapters}
          </div>
          ${unit.notes ? `<div class="unit-notes-box"><strong>筆記：</strong>${unit.notes}</div>` : ''}
        </div>

        <div class="unit-actions">
          <button class="btn btn-primary btn-sm btn-unit-study" title="開啟站內共讀工作台（講義 + 原文 PDF + 測驗）">
            <span class="material-icons-round">menu_book</span>
            <span>進入研讀</span>
          </button>
          ${hasDiagram ? `
            <button class="btn btn-secondary btn-sm btn-unit-diagram" title="檢視標準醫學物理圖解">
              <span class="material-icons-round" style="color: var(--accent);">insights</span>
              <span>圖解</span>
            </button>
          ` : ''}
          <button class="btn btn-secondary btn-sm btn-unit-progress" title="更新進度與筆記">
            <span class="material-icons-round">edit_note</span>
            <span>進度</span>
          </button>
          <button class="btn btn-secondary btn-sm btn-unit-timer" title="啟動學習計時器">
            <span class="material-icons-round">timer</span>
            <span>計時</span>
          </button>
        </div>
      </div>
    `;

    card.querySelector('.btn-unit-study').onclick = () => openUnitStudyWorkspace(unit.unitId);
    if (hasDiagram) {
      card.querySelector('.btn-unit-diagram').onclick = () => openDiagramModal(unit.unitId, unit.unitName);
    }
    card.querySelector('.btn-unit-progress').onclick = () => openProgressModal(unit.unitId, unit.status, unit.notes);
    card.querySelector('.btn-unit-timer').onclick = () => StudyTimer.start(unit.unitId, unit.unitName);

    container.appendChild(card);
  });
}

// ==========================================
// 2B. 一站式單元共讀工作台 (In-App Unit Study Workspace)
// ==========================================
let activeWorkspaceUnitId = null;
let workspaceLastTutorReplyHtml = '';
let workspaceSelectedText = '';

async function openUnitStudyWorkspace(unitId) {
  const listView = document.getElementById('syllabus-list-view');
  const wsView = document.getElementById('syllabus-workspace-view');
  if (!listView || !wsView) return;

  const progressList = await DB.getProgress();
  let unit = progressList.find((u) => u.unitId === unitId);
  if (!unit) return;

  activeWorkspaceUnitId = unitId;
  listView.style.display = 'none';
  wsView.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 1. 頂部工具列資訊與操作
  document.getElementById('ws-unit-badge').innerText = unit.unitId;
  document.getElementById('ws-unit-title').innerText = unit.unitName;
  document.getElementById('ws-unit-lit').innerText = unit.literature;
  document.getElementById('ws-unit-chapters').innerText = unit.chapters;

  const statusSelect = document.getElementById('ws-status-select');
  statusSelect.value = unit.status || 'not_started';
  statusSelect.onchange = async () => {
    await DB.updateProgress(unit.unitId, statusSelect.value, 0, document.getElementById('ws-notes-textarea').value);
    showToast('學習狀態已更新', 'success');
  };

  document.getElementById('btn-ws-back').onclick = () => closeUnitStudyWorkspace();
  document.getElementById('btn-ws-timer').onclick = () => StudyTimer.start(unit.unitId, unit.unitName);
  document.getElementById('btn-ws-nlm').onclick = () => openNotebookLMModal(unit.unitId);

  const wsGrid = document.getElementById('ws-grid');
  const btnLayout = document.getElementById('btn-ws-layout');
  const layoutLabel = document.getElementById('ws-layout-label');
  btnLayout.onclick = () => {
    const isFocus = wsGrid.classList.toggle('focus-mode');
    layoutLabel.innerText = isFocus ? '專注單欄' : '雙欄對照';
  };

  const btnDiagrams = document.getElementById('btn-ws-diagrams');
  const hasDiagram = typeof Diagrams !== 'undefined' && Diagrams.UNIT_DIAGRAMS[unit.unitId];
  btnDiagrams.style.display = hasDiagram ? 'inline-flex' : 'none';
  if (hasDiagram) {
    btnDiagrams.onclick = () => openDiagramModal(unit.unitId, unit.unitName);
  }

  // 2. 左欄講義渲染與編輯
  const guideContent = document.getElementById('ws-guide-content');
  const guideMeta = document.getElementById('ws-guide-meta');
  const editorBox = document.getElementById('ws-guide-editor-box');
  const editorText = document.getElementById('ws-guide-editor-text');

  const renderGuideUI = (u) => {
    editorBox.style.display = 'none';
    if (u.studyGuide && u.studyGuide.trim()) {
      guideMeta.innerText = u.studyGuideSource ? `來源：${u.studyGuideSource}` : '已儲存講義';
      guideContent.innerHTML = u.studyGuide;
      renderMath(guideContent);
    } else {
      guideMeta.innerText = '尚未建立講義';
      guideContent.innerHTML = `
        <div class="sub-card" style="text-align: center; padding: 32px 16px;">
          <div style="font-weight: 600; font-size: 15px; margin-bottom: 6px;">尚未建立本單元考點講義</div>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
            點擊右上角「AI 精讀生成講義」，系統將自動讀取右側對應文獻 PDF（≤12MB）與課綱範疇整理重點，並永久儲存供日後秒開複習。
          </p>
        </div>
      `;
    }
  };
  renderGuideUI(unit);

  const btnGenGuide = document.getElementById('btn-ws-gen-guide');
  btnGenGuide.onclick = async () => {
    btnGenGuide.disabled = true;
    const orig = btnGenGuide.innerHTML;
    btnGenGuide.innerHTML = '<span class="material-icons-round">hourglass_top</span><span>精讀生成中...</span>';
    try {
      showToast('正在載入文獻並由 Gemini 生成結構化講義（約需 20–60 秒）', 'info');
      const res = await GeminiService.generateUnitStudyGuideAI(unit, true);
      const sourceText = res.usedPdfFilename
        ? `Gemini PDF 原文精讀 (${res.usedPdfFilename})`
        : 'Gemini 課綱範疇整理';
      await DB.saveUnitStudyGuide(unit.unitId, res.html, sourceText);
      unit.studyGuide = res.html;
      unit.studyGuideSource = sourceText;
      renderGuideUI(unit);
      showToast('講義生成並儲存完成', 'success');
    } catch (e) {
      showToast('生成失敗：' + e.message, 'error');
    } finally {
      btnGenGuide.disabled = false;
      btnGenGuide.innerHTML = orig;
    }
  };

  document.getElementById('btn-ws-edit-guide').onclick = () => {
    editorText.value = unit.studyGuide || '';
    editorBox.style.display = editorBox.style.display === 'none' ? 'block' : 'none';
  };
  document.getElementById('btn-ws-cancel-edit').onclick = () => {
    editorBox.style.display = 'none';
  };
  document.getElementById('btn-ws-save-edit').onclick = async () => {
    const val = editorText.value.trim();
    await DB.saveUnitStudyGuide(unit.unitId, val, '手動編輯 / 匯入');
    unit.studyGuide = val;
    unit.studyGuideSource = '手動編輯 / 匯入';
    renderGuideUI(unit);
    showToast('講義內容已儲存', 'success');
  };

  // 3. 反白文字快捷轉閃卡 / 加入筆記
  const selBar = document.getElementById('ws-selection-bar');
  const selPreview = document.getElementById('ws-selection-preview');
  const checkSelection = () => {
    const sel = window.getSelection();
    const txt = sel ? sel.toString().trim() : '';
    if (txt && txt.length >= 4 && guideContent.contains(sel.anchorNode)) {
      workspaceSelectedText = txt;
      selPreview.innerText = txt;
      selBar.style.display = 'flex';
    } else {
      selBar.style.display = 'none';
    }
  };
  guideContent.onmouseup = checkSelection;
  guideContent.ontouchend = checkSelection;

  const switchWsTab = (tabKey) => {
    document.querySelectorAll('.workspace-tab-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-ws-tab') === tabKey);
    });
    document.getElementById('ws-tab-pdf').style.display = tabKey === 'pdf' ? 'block' : 'none';
    document.getElementById('ws-tab-notes').style.display = tabKey === 'notes' ? 'block' : 'none';
    document.getElementById('ws-tab-quiz').style.display = tabKey === 'quiz' ? 'block' : 'none';
  };

  document.getElementById('btn-ws-sel-card').onclick = () => {
    if (!workspaceSelectedText) return;
    switchWsTab('notes');
    document.getElementById('ws-card-back').value = workspaceSelectedText;
    const frontInput = document.getElementById('ws-card-front');
    if (!frontInput.value.trim()) {
      frontInput.value = `[${unit.unitId}] `;
    }
    frontInput.focus();
    selBar.style.display = 'none';
    showToast('已帶入右側閃卡背面，請補上提問後儲存', 'info');
  };

  document.getElementById('btn-ws-sel-note').onclick = async () => {
    if (!workspaceSelectedText) return;
    const notesEl = document.getElementById('ws-notes-textarea');
    notesEl.value = notesEl.value.trim()
      ? `${notesEl.value.trim()}\n- ${workspaceSelectedText}`
      : `- ${workspaceSelectedText}`;
    await DB.updateProgress(unit.unitId, statusSelect.value, 0, notesEl.value);
    unit.notes = notesEl.value;
    selBar.style.display = 'none';
    showToast('已加入本單元研讀筆記並自動儲存', 'success');
  };

  // 4. 單元 AI 助教追問
  const tutorInput = document.getElementById('ws-tutor-input');
  const btnAskTutor = document.getElementById('btn-ws-ask-tutor');
  const tutorReplyBox = document.getElementById('ws-tutor-reply-box');
  const tutorReplyContent = document.getElementById('ws-tutor-reply-content');

  tutorReplyBox.style.display = 'none';
  btnAskTutor.onclick = async () => {
    const q = tutorInput.value.trim();
    if (!q) {
      showToast('請輸入追問問題', 'warning');
      return;
    }
    btnAskTutor.disabled = true;
    try {
      showToast('AI 助教思考中', 'info');
      const answerHtml = await GeminiService.askUnitTutorAI(unit, unit.studyGuide, q);
      workspaceLastTutorReplyHtml = `<h4>追問：${q}</h4>${answerHtml}`;
      tutorReplyContent.innerHTML = answerHtml;
      tutorReplyBox.style.display = 'block';
      renderMath(tutorReplyContent);
    } catch (e) {
      showToast('追問失敗：' + e.message, 'error');
    } finally {
      btnAskTutor.disabled = false;
    }
  };

  document.getElementById('btn-ws-append-tutor').onclick = async () => {
    if (!workspaceLastTutorReplyHtml) return;
    const updated = `${unit.studyGuide || ''}\n<hr style="border-color: var(--border-color); margin: 16px 0;">\n${workspaceLastTutorReplyHtml}`;
    await DB.saveUnitStudyGuide(unit.unitId, updated, unit.studyGuideSource || 'AI 講義 + 助教補充');
    unit.studyGuide = updated;
    renderGuideUI(unit);
    showToast('已併入單元講義並存檔', 'success');
  };

  document.getElementById('btn-ws-tutor-card').onclick = async () => {
    const q = tutorInput.value.trim() || `[${unit.unitId}] 追問筆記`;
    if (!tutorReplyContent.innerText.trim()) return;
    await DB.addManualReviewCard(unit.moduleId, unit.unitId, q, tutorReplyContent.innerHTML);
    showToast('已將助教解答轉入 SM-2 知識卡', 'success');
  };

  // 5. 右欄 Tab 1: 原文 PDF 檢視器
  const pdfFiles = GeminiService.getUnitPdfFiles(unit.literature);
  const pdfSelect = document.getElementById('ws-pdf-select');
  const pdfFrame = document.getElementById('ws-pdf-frame');
  const pdfNewTab = document.getElementById('ws-pdf-newtab');
  const pdfEmpty = document.getElementById('ws-pdf-empty');

  pdfSelect.innerHTML = '';
  if (pdfFiles.length > 0) {
    pdfSelect.style.display = 'block';
    pdfNewTab.style.display = 'inline-flex';
    pdfFrame.style.display = 'block';
    pdfEmpty.style.display = 'none';

    pdfFiles.forEach((f) => pdfSelect.add(new Option(f.name, f.url)));
    const loadPdfUrl = (url) => {
      pdfFrame.src = url;
      pdfNewTab.href = url;
    };
    pdfSelect.onchange = () => loadPdfUrl(pdfSelect.value);
    loadPdfUrl(pdfFiles[0].url);
  } else {
    pdfSelect.style.display = 'none';
    pdfNewTab.style.display = 'none';
    pdfFrame.style.display = 'none';
    pdfFrame.src = 'about:blank';
    pdfEmpty.style.display = 'block';
  }

  // 6. 右欄 Tab 2: 筆記與快速製卡
  const notesTextarea = document.getElementById('ws-notes-textarea');
  notesTextarea.value = unit.notes || '';
  document.getElementById('btn-ws-save-notes').onclick = async () => {
    await DB.updateProgress(unit.unitId, statusSelect.value, 0, notesTextarea.value);
    unit.notes = notesTextarea.value;
    showToast('單元筆記已儲存', 'success');
  };

  document.getElementById('btn-ws-save-card').onclick = async () => {
    const f = document.getElementById('ws-card-front').value.trim();
    const b = document.getElementById('ws-card-back').value.trim();
    if (!f || !b) {
      showToast('請填寫卡片正面與背面', 'warning');
      return;
    }
    await DB.addManualReviewCard(unit.moduleId, unit.unitId, f, b);
    document.getElementById('ws-card-front').value = '';
    document.getElementById('ws-card-back').value = '';
    showToast('已加入 SM-2 知識卡佇列', 'success');
  };

  // 7. 右欄 Tab 3: 同屏隨堂測驗
  const wsQuizBody = document.getElementById('ws-quiz-body');
  const wsQuizSubmit = document.getElementById('btn-ws-submit-quiz');
  let quizLoaded = false;

  const loadWsQuiz = async () => {
    quizLoaded = true;
    await loadQuizIntoContainer(unit.unitId, unit.moduleId, unit.topicId, wsQuizBody, wsQuizSubmit);
  };
  document.getElementById('btn-ws-load-quiz').onclick = loadWsQuiz;

  document.querySelectorAll('.workspace-tab-btn').forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.getAttribute('data-ws-tab');
      switchWsTab(tab);
      if (tab === 'quiz' && !quizLoaded) {
        loadWsQuiz();
      }
    };
  });

  switchWsTab(pdfFiles.length > 0 ? 'pdf' : 'notes');
}

function closeUnitStudyWorkspace() {
  activeWorkspaceUnitId = null;
  const listView = document.getElementById('syllabus-list-view');
  const wsView = document.getElementById('syllabus-workspace-view');
  const pdfFrame = document.getElementById('ws-pdf-frame');
  if (pdfFrame) pdfFrame.src = 'about:blank';
  if (wsView) wsView.style.display = 'none';
  if (listView) listView.style.display = 'block';
  renderSyllabusList();
}

// 標準物理圖解彈窗
function openDiagramModal(unitId, unitName) {
  const dialog = document.getElementById('diagram-modal');
  const titleEl = document.getElementById('diagram-modal-title');
  const bodyEl = document.getElementById('diagram-modal-body');
  if (!dialog || !bodyEl) return;

  const list = (typeof Diagrams !== 'undefined' && Diagrams.UNIT_DIAGRAMS[unitId]) || [];
  if (titleEl) titleEl.innerText = `[${unitId}] ${unitName} — 標準物理圖解`;

  bodyEl.innerHTML = '';
  list.forEach((item) => {
    const block = document.createElement('div');
    block.className = 'mp-diagram-block';
    block.innerHTML = `
      <div class="mp-diagram-title">${item.title}</div>
      <div class="mp-diagram">${Diagrams.renderSpec(item.spec)}</div>
      <div class="mp-diagram-caption">${item.caption}</div>
    `;
    bodyEl.appendChild(block);
  });

  if (dialog.showModal) dialog.showModal();
}

function closeDiagramModal() {
  const dialog = document.getElementById('diagram-modal');
  if (dialog && dialog.close) dialog.close();
}

// 彈窗操作：更新進度 Modal (同時支援手動修改與 StudyTimer 結束自動帶入時數)
function openProgressModal(unitId, status, notes, prefillMinutes = 0, onSavedCallback = null) {
  const dialog = document.getElementById('progress-modal');
  const titleEl = document.getElementById('progress-modal-title');
  if (titleEl) {
    titleEl.innerText = prefillMinutes > 0 ? `結束計時 — 儲存 [${unitId}] 學習紀錄` : `更新學習進度 — ${unitId}`;
  }
  document.getElementById('modal-unit-id').value = unitId;
  document.getElementById('modal-status').value = status || 'not_started';
  document.getElementById('modal-add-minutes').value = String(prefillMinutes || 0);
  document.getElementById('modal-notes').value = notes || '';

  const btnSubmit = document.getElementById('btn-submit-modal');
  btnSubmit.onclick = async () => {
    btnSubmit.disabled = true;
    try {
      const s = document.getElementById('modal-status').value;
      const m = document.getElementById('modal-add-minutes').value;
      const n = document.getElementById('modal-notes').value;
      await DB.updateProgress(unitId, s, m, n);
      showToast('單元進度已儲存', 'success');
      closeProgressModal();
      if (typeof onSavedCallback === 'function') onSavedCallback();
      if (currentRouteHash === 'syllabus') {
        if (activeWorkspaceUnitId === unitId) {
          const wsStatus = document.getElementById('ws-status-select');
          const wsNotes = document.getElementById('ws-notes-textarea');
          if (wsStatus) wsStatus.value = s;
          if (wsNotes) wsNotes.value = n;
        } else {
          renderSyllabusList();
        }
      } else if (currentRouteHash === 'dashboard') {
        loadDashboardPage();
      }
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
      showToast('請貼上文獻重點內容', 'warning');
      return;
    }
    btn.disabled = true;
    try {
      showToast('Gemini 正在提煉雙面複習卡片', 'info');
      const cards = await GeminiService.generateFlashcardsAI(moduleId, unitId, text);
      showToast(`已生成 ${cards.length} 張知識卡片`, 'success');
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
  const unit = syllabus.find((u) => u.unitId === unitId);
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
    navigator.clipboard
      .writeText(promptEl.value)
      .then(() => showToast('提示詞已複製至剪貼簿', 'success'))
      .catch(() => {
        promptEl.select();
        document.execCommand('copy');
        showToast('提示詞已複製', 'success');
      });
  }
}

// 共用隨堂測驗渲染與評分器 (Modal 與共讀工作台共用)
async function loadQuizIntoContainer(unitId, moduleId, topicId, body, btnSubmit) {
  body.innerHTML = '<div class="loader-container"><div class="spinner"></div><div class="loading-text">載入或生成題目中</div></div>';
  if (btnSubmit) btnSubmit.style.display = 'none';

  try {
    const questions = await DB.getUnitQuiz(unitId, moduleId, topicId);
    if (!questions || questions.length === 0) {
      body.innerHTML = '<div style="text-align: center; color: var(--text-dark); padding: 24px;">此單元目前無可用題目，請先至 AI 練習題庫生成。</div>';
      return;
    }

    body.innerHTML = '';
    questions.forEach((q, idx) => {
      const qDiv = document.createElement('div');
      qDiv.className = 'sub-card';
      qDiv.style.marginBottom = '16px';

      qDiv.innerHTML = `
        <div style="font-weight: 600; color: var(--accent); margin-bottom: 8px;" class="mono-num">第 ${idx + 1} 題</div>
        <div class="markdown-view" style="font-size: 14px; margin-bottom: 12px;">${q.questionText}</div>
        <div class="quiz-options" data-qid="${q.questionId}">
          ${['A', 'B', 'C', 'D']
            .map(
              (opt) => `
            <div class="quiz-option" data-opt="${opt}" onclick="selectQuizOption(this)">
              <div class="option-letter">${opt}</div>
              <div>${q['option' + opt]}</div>
            </div>
          `
            )
            .join('')}
        </div>
        <div class="quiz-explanation sub-card" style="display: none; margin-top: 10px; border-left: 2px solid var(--accent);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: 600; color: var(--success);">正確答案：${q.correctAnswer}</span>
            <button class="btn btn-secondary btn-sm btn-quiz-to-card">
              <span class="material-icons-round">style</span>
              <span>轉為閃卡</span>
            </button>
          </div>
          <div class="markdown-view" style="color: var(--text-muted); font-size: 13px;">${q.explanation || '無詳細解析'}</div>
        </div>
      `;

      qDiv.querySelector('.btn-quiz-to-card').onclick = () => convertQuestionToFlashcard(q);
      body.appendChild(qDiv);
    });

    renderMath(body);

    if (btnSubmit) {
      btnSubmit.style.display = 'inline-flex';
      btnSubmit.onclick = () => {
        let correctCount = 0;
        questions.forEach((q) => {
          const optContainer = body.querySelector(`.quiz-options[data-qid="${q.questionId}"]`);
          if (!optContainer) return;
          const selected = optContainer.querySelector('.quiz-option.selected');
          const chosenOpt = selected ? selected.getAttribute('data-opt') : null;
          const isCorrect = chosenOpt && chosenOpt.toUpperCase() === q.correctAnswer.toUpperCase();
          if (isCorrect) correctCount++;

          optContainer.querySelectorAll('.quiz-option').forEach((op) => {
            const o = op.getAttribute('data-opt');
            if (o.toUpperCase() === q.correctAnswer.toUpperCase()) op.classList.add('correct');
            else if (op === selected) op.classList.add('wrong');
          });

          const exp = optContainer.nextElementSibling;
          if (exp) exp.style.display = 'block';
        });

        btnSubmit.style.display = 'none';
        showToast(`測驗完成：答對 ${correctCount} / ${questions.length} 題`, correctCount === questions.length ? 'success' : 'info');
        renderMath(body);
      };
    }
  } catch (e) {
    body.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 24px;">載入失敗: ${e.message}</div>`;
  }
}

// 彈窗操作：隨堂測驗 Modal
async function openUnitQuizModal(unitId, moduleId, topicId) {
  const dialog = document.getElementById('unit-quiz-modal');
  const body = document.getElementById('quiz-modal-body');
  const title = document.getElementById('quiz-modal-title');
  const btnSubmit = document.getElementById('btn-submit-unit-quiz');
  if (title) title.innerText = `隨堂測驗 — ${unitId}`;
  if (dialog && dialog.showModal) dialog.showModal();
  await loadQuizIntoContainer(unitId, moduleId, topicId, body, btnSubmit);
}

function closeUnitQuizModal() {
  const dialog = document.getElementById('unit-quiz-modal');
  if (dialog && dialog.close) dialog.close();
}

function selectQuizOption(el) {
  const parent = el.closest('.quiz-options');
  if (!parent) return;
  parent.querySelectorAll('.quiz-option').forEach((o) => o.classList.remove('selected'));
  el.classList.add('selected');
}

// ==========================================
// 3. AI 練習題庫頁面 (Practice: 預設互動盲測模式 + 展開詳解模式)
// ==========================================
let practiceViewMode = 'quiz'; // 'quiz' | 'review'

async function loadPracticePage() {
  const syllabus = await DB.getSyllabus();

  bindModuleTopicSelectors('practice-mod-select', 'practice-topic-select', syllabus);
  bindModuleUnitSelectors('practice-mod-select', 'practice-topic-select', 'practice-unit-select', syllabus, {
    allUnitOption: '全部小單元 (全主題出題)',
    allUnitValue: ''
  });

  const modSelect = document.getElementById('practice-mod-select');
  const topicSelect = document.getElementById('practice-topic-select');
  if (modSelect) modSelect.addEventListener('change', () => loadPracticeQuestionsList());
  if (topicSelect) topicSelect.addEventListener('change', () => loadPracticeQuestionsList());

  const btnToggleMode = document.getElementById('btn-toggle-practice-mode');
  const modeLabel = document.getElementById('practice-mode-label');
  if (btnToggleMode) {
    const syncModeLabel = () => {
      const icon = btnToggleMode.querySelector('.material-icons-round');
      if (practiceViewMode === 'quiz') {
        if (modeLabel) modeLabel.innerText = '互動盲測模式';
        if (icon) icon.innerText = 'visibility_off';
      } else {
        if (modeLabel) modeLabel.innerText = '展開詳解模式';
        if (icon) icon.innerText = 'visibility';
      }
    };
    syncModeLabel();
    btnToggleMode.onclick = () => {
      practiceViewMode = practiceViewMode === 'quiz' ? 'review' : 'quiz';
      syncModeLabel();
      loadPracticeQuestionsList();
    };
  }

  const btnGen = document.getElementById('btn-generate-qs');
  if (btnGen) {
    btnGen.onclick = async () => {
      const mId = document.getElementById('practice-mod-select').value;
      const tId = document.getElementById('practice-topic-select').value;
      const uId = document.getElementById('practice-unit-select').value;
      const diff = document.getElementById('practice-diff-select').value;
      const cnt = document.getElementById('practice-count-select').value;

      btnGen.disabled = true;
      const origHtml = btnGen.innerHTML;
      btnGen.innerHTML = '<span class="material-icons-round">hourglass_top</span><span>Gemini 出題中...</span>';
      try {
        showToast('Gemini AI 正在生成題目（約需 15–60 秒）', 'info');
        const qs = await GeminiService.generateAIQuestions(mId, tId, cnt, diff, uId);
        showToast(`成功生成 ${qs.length} 道題目`, 'success');
        loadPracticeQuestionsList();
      } catch (e) {
        showToast('出題失敗：' + e.message, 'error');
      } finally {
        btnGen.disabled = false;
        btnGen.innerHTML = origHtml;
      }
    };
  }

  const filterSelect = document.getElementById('filter-verified-select');
  if (filterSelect) {
    filterSelect.onchange = () => loadPracticeQuestionsList();
  }

  loadPracticeQuestionsList();
}

async function loadPracticeQuestionsList() {
  const container = document.getElementById('questions-list-container');
  const countSpan = document.getElementById('practice-qs-count');
  if (!container) return;

  const mId = document.getElementById('practice-mod-select')?.value;
  const tId = document.getElementById('practice-topic-select')?.value;
  const filterVal = document.getElementById('filter-verified-select')?.value || 'all';

  container.innerHTML = '<div class="loader-container"><div class="spinner"></div><div class="loading-text">載入題庫中</div></div>';

  try {
    let questions = await DB.getQuestions(mId, tId);
    if (currentRouteHash !== 'practice') return;

    if (filterVal === 'unverified') questions = questions.filter((q) => !q.verified);
    else if (filterVal === 'verified') questions = questions.filter((q) => q.verified);

    if (countSpan) countSpan.innerText = questions.length;
    container.innerHTML = '';

    if (questions.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-dark); padding: 32px;">此分類目前無題目，可使用左側 Gemini 出題或手動新增。</div>';
      return;
    }

    questions.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = 'sub-card';

      const isReviewMode = practiceViewMode === 'review';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; gap: 8px; flex-wrap: wrap;">
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <span class="badge ${q.verified ? 'badge-completed' : 'badge-review'}">${q.verified ? '已核可' : '待審查'}</span>
            <span class="mono-num" style="font-weight: 600; color: var(--accent);">第 ${idx + 1} 題</span>
            <span class="mono-num" style="font-size: 12px; color: var(--text-dark);">難度 ${q.difficulty} · ${q.sourceRef || q.moduleId}</span>
          </div>
          <div style="display: flex; gap: 6px;">
            ${!q.verified ? `
              <button class="btn btn-secondary btn-sm btn-verify-q">
                <span class="material-icons-round" style="color: var(--success);">check</span>
                <span>核可</span>
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm btn-q-to-card" title="轉為 SM-2 知識卡">
              <span class="material-icons-round">style</span>
              <span>轉閃卡</span>
            </button>
            <button class="btn btn-danger btn-sm btn-delete-q" title="刪除題目">
              <span class="material-icons-round">delete</span>
            </button>
          </div>
        </div>

        <div class="markdown-view" style="font-size: 14.5px; font-weight: 500; margin-bottom: 12px;">${q.questionText}</div>

        <div class="q-options-grid">
          ${['A', 'B', 'C', 'D']
            .map(
              (opt) => `
            <div class="quiz-option practice-opt ${isReviewMode && opt === q.correctAnswer ? 'correct' : ''}" data-opt="${opt}" style="padding: 8px 12px; font-size: 13.5px;">
              <div class="option-letter">${opt}</div>
              <div>${q['option' + opt]}</div>
            </div>
          `
            )
            .join('')}
        </div>

        <div class="practice-exp-box" style="display: ${isReviewMode ? 'block' : 'none'}; margin-top: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-left: 2px solid var(--accent); border-radius: 8px; padding: 12px; font-size: 13px;">
          <div style="font-weight: 600; color: var(--success); margin-bottom: 4px;">正確解答：${q.correctAnswer}</div>
          <div class="markdown-view" style="color: var(--text-muted);">${q.explanation || '無詳細解析'}</div>
        </div>
      `;

      // 互動盲測點擊判讀
      const optEls = card.querySelectorAll('.practice-opt');
      const expBox = card.querySelector('.practice-exp-box');
      if (!isReviewMode) {
        optEls.forEach((opEl) => {
          opEl.onclick = () => {
            if (card.dataset.answered === 'true') return;
            card.dataset.answered = 'true';
            const chosen = opEl.getAttribute('data-opt');
            const correct = String(q.correctAnswer).toUpperCase();
            optEls.forEach((item) => {
              const code = item.getAttribute('data-opt').toUpperCase();
              if (code === correct) item.classList.add('correct');
              else if (item === opEl && chosen !== correct) item.classList.add('wrong');
            });
            if (expBox) expBox.style.display = 'block';
            renderMath(expBox);
          };
        });
      }

      const btnVerify = card.querySelector('.btn-verify-q');
      if (btnVerify) btnVerify.onclick = () => verifyPracticeQuestion(q.questionId);
      card.querySelector('.btn-q-to-card').onclick = () => convertQuestionToFlashcard(q);
      card.querySelector('.btn-delete-q').onclick = () => deletePracticeQuestion(q.questionId);

      container.appendChild(card);
    });

    renderMath(container);
  } catch (e) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 24px;">載入失敗: ${e.message}</div>`;
  }
}

async function verifyPracticeQuestion(qId) {
  await DB.verifyQuestion(qId);
  showToast('題目已核可', 'success');
  loadPracticeQuestionsList();
}

async function deletePracticeQuestion(qId) {
  if (!confirm('確定要刪除此題目嗎？')) return;
  await DB.deleteQuestion(qId);
  showToast('題目已刪除', 'info');
  loadPracticeQuestionsList();
}

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
        showToast('請完整填寫題目與選項', 'warning');
        return;
      }

      btnSave.disabled = true;
      try {
        await DB.addManualQuestion(qObj);
        showToast('題目已建立', 'success');
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
let activeExamTimer = null;
let activeExamQuestions = [];
let activeUserAnswers = [];
let activeExamIndex = 0;

async function loadExamPage() {
  const examTypeSelect = document.getElementById('exam-type-select');
  const examModGroup = document.getElementById('exam-mod-group');
  const examModSelect = document.getElementById('exam-mod-select');

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
        showToast('正在組卷中', 'info');
        const qs = await DB.generateExam(type, mId);
        startActiveExam(type, qs, mId);
      } catch (e) {
        showToast('開啟測驗失敗：' + e.message, 'error');
      } finally {
        btnStart.disabled = false;
      }
    };
  }

  loadExamHistory();
}

async function loadExamHistory() {
  const tbody = document.getElementById('exam-history-tbody');
  if (!tbody) return;

  const results = await DB.getExamResults();
  tbody.innerHTML = '';

  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-dark);">尚無測驗記錄</td></tr>';
    return;
  }

  results.forEach((r) => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    const typeLabel = r.examType === 'full' ? '全範圍' : `模組 ${r.moduleId || ''}`;
    const minutes = Math.floor(r.timeSpent / 60);
    const secs = r.timeSpent % 60;

    tr.innerHTML = `
      <td class="mono-num">${r.date}</td>
      <td><span class="badge ${r.examType === 'full' ? 'badge-progress' : 'badge-todo'}">${typeLabel}</span></td>
      <td class="mono-num">${r.correctCount} / ${r.totalQuestions}</td>
      <td class="mono-num" style="font-weight: 600; color: ${r.score >= 60 ? 'var(--success)' : 'var(--danger)'};">${r.score} 分</td>
      <td class="mono-num">${minutes}m ${String(secs).padStart(2, '0')}s</td>
    `;
    tr.onclick = () => renderExamResultView(r);
    tbody.appendChild(tr);
  });
}

function startActiveExam(type, questions, moduleId) {
  if (activeExamTimer) activeExamTimer.stop();
  activeExamQuestions = questions;
  activeUserAnswers = questions.map((q) => ({ questionId: q.questionId, selectedOption: null }));
  activeExamIndex = 0;

  document.getElementById('exam-setup-view').style.display = 'none';
  document.getElementById('exam-active-view').style.display = 'grid';
  document.getElementById('exam-result-view').style.display = 'none';

  const duration = type === 'full' ? 3600 : 1800;

  activeExamTimer = new ExamTimer(
    duration,
    (remaining) => {
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      const timerEl = document.getElementById('active-exam-timer');
      if (timerEl) {
        timerEl.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    },
    () => {
      showToast('測驗時間結束，自動交卷中', 'warning');
      submitActiveExam(type, moduleId);
    }
  );

  activeExamTimer.start();
  renderExamNavGrid();
  renderActiveExamQuestion(0);

  document.getElementById('btn-exam-prev').onclick = () => {
    if (activeExamIndex > 0) renderActiveExamQuestion(activeExamIndex - 1);
  };
  document.getElementById('btn-exam-next').onclick = () => {
    if (activeExamIndex < activeExamQuestions.length - 1) renderActiveExamQuestion(activeExamIndex + 1);
  };
  document.getElementById('btn-submit-exam').onclick = () => {
    const uncompleted = activeUserAnswers.filter((a) => !a.selectedOption).length;
    const msg = uncompleted > 0 ? `尚有 ${uncompleted} 題未作答，確定要交卷嗎？` : '確定要交卷評分嗎？';
    if (confirm(msg)) submitActiveExam(type, moduleId);
  };
}

function renderExamNavGrid() {
  const grid = document.getElementById('exam-nav-grid');
  const completedSpan = document.getElementById('exam-nav-completed');
  const totalSpan = document.getElementById('exam-nav-total');
  if (!grid) return;

  grid.innerHTML = '';
  const completedCount = activeUserAnswers.filter((a) => !!a.selectedOption).length;
  if (completedSpan) completedSpan.innerText = completedCount;
  if (totalSpan) totalSpan.innerText = activeExamQuestions.length;

  activeExamQuestions.forEach((q, idx) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-sm mono-num';
    btn.style.padding = '0';
    btn.style.minWidth = '0';
    btn.innerText = idx + 1;

    const isAnswered = !!activeUserAnswers[idx].selectedOption;
    if (idx === activeExamIndex) {
      btn.style.borderColor = 'var(--accent)';
      btn.style.background = 'var(--accent-subtle)';
      btn.style.color = 'var(--accent)';
    } else if (isAnswered) {
      btn.style.borderColor = 'var(--border-strong)';
      btn.style.background = 'var(--bg-raised)';
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
  const qTextEl = document.getElementById('active-q-text');
  qTextEl.innerHTML = q.questionText;

  const optionsContainer = document.getElementById('active-q-options');
  optionsContainer.innerHTML = '';

  const userChoice = activeUserAnswers[idx].selectedOption;

  ['A', 'B', 'C', 'D'].forEach((opt) => {
    const optDiv = document.createElement('div');
    optDiv.className = `quiz-option ${userChoice === opt ? 'selected' : ''}`;
    optDiv.innerHTML = `
      <div class="option-letter">${opt}</div>
      <div>${q['option' + opt]}</div>
    `;
    optDiv.onclick = () => {
      activeUserAnswers[idx].selectedOption = opt;
      renderActiveExamQuestion(idx);
      renderExamNavGrid();
    };
    optionsContainer.appendChild(optDiv);
  });

  document.getElementById('btn-exam-prev').disabled = idx === 0;
  document.getElementById('btn-exam-next').disabled = idx === activeExamQuestions.length - 1;

  renderExamNavGrid();
  renderMath(document.getElementById('exam-active-view'));
}

async function submitActiveExam(type, moduleId) {
  if (activeExamTimer) activeExamTimer.stop();

  showToast('正在評分並分析弱點', 'info');
  try {
    const timeSpent = activeExamTimer ? activeExamTimer.elapsed : 0;
    const result = await DB.submitExam(type, activeUserAnswers, timeSpent, moduleId);
    renderExamResultView(result);
    loadExamHistory();
  } catch (e) {
    showToast('交卷失敗：' + e.message, 'error');
  }
}

function renderExamResultView(result) {
  document.getElementById('exam-setup-view').style.display = 'none';
  document.getElementById('exam-active-view').style.display = 'none';
  document.getElementById('exam-result-view').style.display = 'block';

  document.getElementById('res-score').innerText = result.score;
  document.getElementById('res-correct').innerText = result.correctCount;
  document.getElementById('res-total').innerText = result.totalQuestions;
  document.getElementById('res-time').innerText = `${Math.floor(result.timeSpent / 60)}m ${result.timeSpent % 60}s`;

  const moduleRates = {};
  for (const mId in result.moduleBreakdown) {
    moduleRates[mId] = result.moduleBreakdown[mId].rate;
  }
  lastExamRadarRates = moduleRates;
  Charts.drawRadar('canvas-exam-radar', moduleRates);

  const errorList = document.getElementById('exam-error-list');
  if (errorList) {
    errorList.innerHTML = '';
    if (!result.details || result.details.length === 0) {
      errorList.innerHTML = '<div style="text-align: center; color: var(--text-dark); padding: 24px;">此筆歷史測驗建立於 v3.0 之前，未保存逐題作答明細。</div>';
    } else {
      result.details.forEach((det, i) => {
        const item = document.createElement('div');
        item.className = 'sub-card';
        item.style.borderLeft = `2px solid ${det.isCorrect ? 'var(--success)' : 'var(--danger)'}`;

        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; flex-wrap: wrap;">
            <span class="mono-num" style="font-weight: 600; color: ${det.isCorrect ? 'var(--success)' : 'var(--danger)'};">
              第 ${i + 1} 題 — ${det.isCorrect ? '答對' : '答錯'}
            </span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="mono-num" style="font-size: 12px; color: var(--text-dark);">${det.moduleId} · ${det.sourceRef || ''}</span>
              <button class="btn btn-secondary btn-sm btn-exam-to-card">
                <span class="material-icons-round">style</span>
                <span>轉閃卡</span>
              </button>
            </div>
          </div>
          <div class="markdown-view" style="font-size: 14px; margin-bottom: 8px;">${det.questionText}</div>
          <div class="mono-num" style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 8px;">
            作答：<strong>${det.userAnswer || '未選'}</strong> · 正解：<strong style="color: var(--success);">${det.correctAnswer}</strong>
          </div>
          <div style="background: var(--bg-secondary); padding: 10px 12px; border-radius: 6px; font-size: 13px;" class="markdown-view">
            <strong style="color: var(--accent);">解析：</strong>${det.explanation || '無'}
          </div>
        `;
        item.querySelector('.btn-exam-to-card').onclick = () => convertQuestionToFlashcard(det);
        errorList.appendChild(item);
      });
    }
  }

  renderMath(document.getElementById('exam-result-view'));
}

// ==========================================
// 5. 知識卡片複習頁面 (Review / SM-2 + 鍵盤快捷鍵)
// ==========================================
let activeReviewCards = [];
let currentCardIndex = 0;

if (!window._reviewKeyListenerBound) {
  window._reviewKeyListenerBound = true;
  document.addEventListener('keydown', (e) => {
    if (currentRouteHash !== 'review') return;
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (activeReviewCards.length === 0 || currentCardIndex >= activeReviewCards.length) return;

    const flipper = document.getElementById('review-card-flipper');
    if (!flipper) return;

    if (e.code === 'Space') {
      e.preventDefault();
      flipper.click();
    } else if (['0', '1', '2', '3', '4', '5'].includes(e.key) && flipper.classList.contains('flipped')) {
      e.preventDefault();
      const btn = document.querySelector(`.rating-btn[data-score="${e.key}"]`);
      if (btn) btn.click();
    }
  });
}

async function loadReviewPage() {
  const syllabus = await DB.getSyllabus();

  bindModuleUnitSelectors('review-filter-mod', null, 'review-filter-unit', syllabus, {
    allUnitOption: '全部單元',
    allUnitValue: 'ALL'
  });

  const modSelect = document.getElementById('review-filter-mod');
  if (modSelect) {
    modSelect.innerHTML = '';
    modSelect.add(new Option('全部模組', 'ALL'));
    for (const mId in MODULE_NAMES) {
      modSelect.add(new Option(`[${mId}] ${MODULE_NAMES[mId]}`, mId));
    }
  }

  bindModuleUnitSelectors('card-add-mod', null, 'card-add-unit', syllabus);
  const cardAddMod = document.getElementById('card-add-mod');
  if (cardAddMod) {
    cardAddMod.innerHTML = '';
    for (const mId in MODULE_NAMES) {
      cardAddMod.add(new Option(`[${mId}] ${MODULE_NAMES[mId]}`, mId));
    }
  }

  if (modSelect) modSelect.onchange = () => loadActiveReviewQueue();
  const unitSelect = document.getElementById('review-filter-unit');
  if (unitSelect) unitSelect.onchange = () => loadActiveReviewQueue();

  const flipper = document.getElementById('review-card-flipper');
  const ratingActions = document.getElementById('review-rating-actions');
  if (flipper) {
    flipper.onclick = () => {
      flipper.classList.toggle('flipped');
      if (ratingActions) {
        ratingActions.style.display = flipper.classList.contains('flipped') ? 'flex' : 'none';
      }
      renderMath(flipper);
    };
  }

  document.querySelectorAll('.rating-btn').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const score = Number(btn.getAttribute('data-score'));
      const card = activeReviewCards[currentCardIndex];
      if (!card) return;

      try {
        await DB.submitReviewCardScore(card.cardId, score);
        showToast(`已提交評分 (${score}分)`, 'success');
        currentCardIndex++;
        renderCurrentReviewCard();
      } catch (err) {
        showToast('評分提交失敗: ' + err.message, 'error');
      }
    };
  });

  const btnDeleteCard = document.getElementById('btn-delete-review-card');
  if (btnDeleteCard) {
    btnDeleteCard.onclick = async (e) => {
      e.stopPropagation();
      const card = activeReviewCards[currentCardIndex];
      if (!card || !confirm('確定要永久刪除此知識卡嗎？')) return;
      await DB.deleteReviewCard(card.cardId);
      activeReviewCards.splice(currentCardIndex, 1);
      showToast('已刪除知識卡片', 'info');
      renderCurrentReviewCard();
    };
  }

  const btnSaveCard = document.getElementById('btn-save-card');
  if (btnSaveCard) {
    btnSaveCard.onclick = async () => {
      const m = document.getElementById('card-add-mod').value;
      const u = document.getElementById('card-add-unit').value;
      const f = document.getElementById('card-add-front').value;
      const b = document.getElementById('card-add-back').value;

      if (!f || !b) {
        showToast('請完整填寫卡片正面與背面內容', 'warning');
        return;
      }

      btnSaveCard.disabled = true;
      try {
        await DB.addManualReviewCard(m, u, f, b);
        showToast('知識卡片已儲存', 'success');
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

  activeReviewCards = dueCards.filter((c) => {
    const matchM = mFilter === 'ALL' || c.moduleId === mFilter;
    const matchU = uFilter === 'ALL' || !uFilter || c.unitId === uFilter;
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

  document.getElementById('review-card-mod-front').innerText = card.unitId || card.moduleId;
  document.getElementById('review-card-mod-back').innerText = card.unitId || card.moduleId;
  document.getElementById('review-card-front-text').innerHTML = card.front;
  document.getElementById('review-card-back-text').innerHTML = card.back;

  renderMath(flipper);
}

// ==========================================
// 6. 口試模擬問答頁面 (Oral Simulator)
// ==========================================
let currentOralQuestion = null;
let currentOralReportRecord = null;

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
        showToast('Gemini 考官正在擬定題目', 'info');
        currentOralQuestion = await GeminiService.generateOralQuestionAI(mId, qType);

        document.getElementById('oral-setup-box').style.display = 'none';
        document.getElementById('oral-active-box').style.display = 'flex';
        document.getElementById('oral-report-box').style.display = 'none';

        document.getElementById('active-oral-question').innerHTML = currentOralQuestion.question;
        document.getElementById('oral-user-answer').value = '';
        renderMath(document.getElementById('oral-active-box'));
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
        showToast('請先輸入您的回答內容', 'warning');
        return;
      }

      btnSubmit.disabled = true;
      try {
        showToast('Gemini 口試委員正在進行四維度評分', 'info');
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
        showOralPracticeReport(practiceRecord);
        loadOralHistory();
      } catch (e) {
        showToast('評分失敗：' + e.message, 'error');
      } finally {
        btnSubmit.disabled = false;
      }
    };
  }

  const btnOralToCard = document.getElementById('btn-oral-to-card');
  if (btnOralToCard) {
    btnOralToCard.onclick = async () => {
      if (!currentOralReportRecord) return;
      const missing = (currentOralReportRecord.aiFeedback && currentOralReportRecord.aiFeedback.missingPoints) || [];
      const backText =
        (missing.length > 0 ? `【缺漏重點】\n- ${missing.join('\n- ')}\n\n` : '') +
        `【參考解答】\n${currentOralReportRecord.referenceAnswer || ''}`;
      await DB.addManualReviewCard(
        currentOralReportRecord.moduleId || 'M1',
        '',
        `[口試] ${currentOralReportRecord.question}`,
        backText
      );
      showToast('已將口試缺漏與參考解答轉入 SM-2 知識卡', 'success');
    };
  }

  loadOralHistory();
}

function showOralSetup() {
  document.getElementById('oral-setup-box').style.display = 'flex';
  document.getElementById('oral-active-box').style.display = 'none';
  document.getElementById('oral-report-box').style.display = 'none';
}

function showOralPracticeReport(p) {
  let evalRes = p.aiFeedback;
  if (typeof evalRes === 'string') {
    try {
      evalRes = JSON.parse(evalRes);
    } catch (e) {
      evalRes = { feedback: p.aiFeedback };
    }
  }
  evalRes = evalRes || {};
  currentOralReportRecord = { ...p, aiFeedback: evalRes };

  document.getElementById('oral-setup-box').style.display = 'none';
  document.getElementById('oral-active-box').style.display = 'none';
  document.getElementById('oral-report-box').style.display = 'flex';

  document.getElementById('oral-report-question').innerHTML = p.question;
  document.getElementById('oral-report-user-answer').innerText = p.userAnswer;
  document.getElementById('oral-res-score').innerText = p.aiScore || evalRes.score || 0;
  document.getElementById('oral-score-comp').innerText = evalRes.completeness !== undefined ? evalRes.completeness : '--';
  document.getElementById('oral-score-acc').innerText = evalRes.accuracy !== undefined ? evalRes.accuracy : '--';
  document.getElementById('oral-score-log').innerText = evalRes.logic !== undefined ? evalRes.logic : '--';
  document.getElementById('oral-score-dep').innerText = evalRes.depth !== undefined ? evalRes.depth : '--';
  document.getElementById('oral-report-feedback').innerHTML = evalRes.feedback || '無詳細評語';
  document.getElementById('oral-report-ref-answer').innerHTML = p.referenceAnswer || '無標準答案';

  const missingUl = document.getElementById('oral-report-missing-list');
  if (missingUl) {
    missingUl.innerHTML = '';
    const missing = evalRes.missingPoints || [];
    if (Array.isArray(missing) && missing.length > 0) {
      missing.forEach((pt) => {
        const li = document.createElement('li');
        li.innerText = pt;
        missingUl.appendChild(li);
      });
    } else {
      missingUl.innerHTML = '<li style="color: var(--success);">無重大缺漏觀念</li>';
    }
  }

  renderMath(document.getElementById('oral-report-box'));
}

async function loadOralHistory() {
  const container = document.getElementById('oral-history-list');
  if (!container) return;

  const practices = await DB.getOralPractices();
  container.innerHTML = '';

  if (practices.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-dark); padding: 24px;">尚無口試紀錄</div>';
    return;
  }

  practices.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'sub-card rec-card-clickable';
    card.style.padding = '10px 12px';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">
        <span class="mono-num" style="color: var(--accent);">[${p.moduleId}] ${p.date}</span>
        <span class="mono-num" style="font-weight: 600; color: ${p.aiScore >= 70 ? 'var(--success)' : 'var(--warning)'};">${p.aiScore} 分</span>
      </div>
      <div style="font-size: 13px; font-weight: 500; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.question}</div>
    `;

    card.onclick = () => showOralPracticeReport(p);
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
    syllabus.forEach((u) => {
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
        showToast('心得筆記不可為空', 'warning');
        return;
      }

      btnSave.disabled = true;
      try {
        await DB.addManualStudyLog(u, m, n);
        showToast('研讀日誌已儲存', 'success');
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

  container.innerHTML = '<div class="loader-container"><div class="spinner"></div><div class="loading-text">載入日誌中</div></div>';

  try {
    const logs = await DB.getStudyLogs();
    if (currentRouteHash !== 'journal') return;

    container.innerHTML = '';

    if (logs.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-dark); padding: 32px;">目前尚無研讀日誌，可啟動計時或於右側手動補登。</div>';
      return;
    }

    logs.forEach((log) => {
      const card = document.createElement('div');
      card.className = 'sub-card';
      const unitText = log.unitId === 'General' ? '通用研讀' : `單元 ${log.unitId}`;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-bottom: 6px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">
          <span class="mono-num" style="color: var(--accent);">${log.date}</span>
          <span class="mono-num">${unitText} · ${log.minutes} min</span>
        </div>
        <div style="font-size: 13.5px; color: var(--text-main); white-space: pre-wrap;" class="markdown-view">${log.journalEntry}</div>
      `;
      container.appendChild(card);
    });

    renderMath(container);
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 24px;">載入失敗: ${err.message}</div>`;
  }
}

// ==========================================
// 8. 系統設定與 Firebase 資料庫搬移 (Settings)
// ==========================================
async function loadSettingsPage() {
  const examDateInput = document.getElementById('input-exam-date');
  const startDateInput = document.getElementById('input-start-date');
  const dailyGoalInput = document.getElementById('input-daily-goal');
  const notebookUrlInput = document.getElementById('input-notebook-url');
  const apiKeyInput = document.getElementById('input-api-key');
  const modelSelect = document.getElementById('select-model');

  const fbPasteInput = document.getElementById('input-fb-paste');
  const fbApiKeyInput = document.getElementById('input-fb-api-key');
  const fbProjectIdInput = document.getElementById('input-fb-project-id');
  const fbStatusSpan = document.getElementById('fb-connection-status');

  async function updateModelOptions(currentKey, preferredModel, notify = false) {
    const hintEl = document.getElementById('model-status-hint');
    const btnSync = document.getElementById('btn-refresh-models');
    if (hintEl) hintEl.innerText = '正在查詢 Google API 最新模型...';
    if (btnSync) btnSync.disabled = true;

    try {
      const topModels = await GeminiService.fetchTopModels(currentKey);
      const targetModel = preferredModel || modelSelect.value || 'gemini-2.5-flash';

      modelSelect.innerHTML = '';
      let isTargetFound = false;

      topModels.forEach((m) => {
        const opt = new Option(m.name, m.id);
        if (m.id === targetModel) {
          opt.selected = true;
          isTargetFound = true;
        }
        modelSelect.add(opt);
      });

      if (!isTargetFound && targetModel) {
        const customOpt = new Option(`${targetModel} (目前設定)`, targetModel);
        customOpt.selected = true;
        modelSelect.add(customOpt, 0);
      }

      if (hintEl) {
        hintEl.innerText =
          currentKey && currentKey.trim()
            ? '已依據 Google API 即時更新前 5 款適用模型'
            : '已載入預設模型清單；填入 API Key 後可點選即時同步';
      }
      if (notify) showToast('已同步最新模型清單', 'success');
    } catch (err) {
      if (hintEl) hintEl.innerText = '載入模型清單失敗，已保留預設清單';
    } finally {
      if (btnSync) btnSync.disabled = false;
    }
  }

  async function refreshFirebaseStatusAndStats() {
    const probe = await verifyFirebaseConnection();
    if (fbStatusSpan) {
      if (probe.connected) {
        fbStatusSpan.innerText = probe.mode === 'offline-cache' ? '離線快取中' : `已連線 (${probe.projectId})`;
        fbStatusSpan.className = 'badge badge-completed';
      } else if (probe.mode === 'error') {
        fbStatusSpan.innerText = '連線失敗';
        fbStatusSpan.className = 'badge badge-review';
        fbStatusSpan.title = probe.reason || '';
      } else {
        fbStatusSpan.innerText = '本機模式 (LocalStorage)';
        fbStatusSpan.className = 'badge badge-todo';
      }
    }

    const statsGrid = document.getElementById('fb-stats-grid');
    if (statsGrid) {
      const stats = await DB.getStorageStats();
      const labels = {
        progress: '進度紀錄',
        questions: '練習題庫',
        reviewCards: 'SM-2 卡片',
        examResults: '模擬考',
        oralPractices: '口試紀錄',
        studyLogs: '學習日誌'
      };
      statsGrid.innerHTML = Object.keys(labels)
        .map((k) => {
          const lVal = stats.local[k] || 0;
          const cVal = stats.cloud ? stats.cloud[k] : '—';
          return `
            <div class="sync-stat-item">
              <div class="sync-stat-label">${labels[k]}</div>
              <div class="sync-stat-val">本機 ${lVal} / 雲端 ${cVal}</div>
            </div>
          `;
        })
        .join('');
    }
  }

  try {
    examDateInput.value = (await DB.getConfig('examDate')) || '2027-10-01';
    startDateInput.value = (await DB.getConfig('startDate')) || new Date().toISOString().split('T')[0];
    dailyGoalInput.value = (await DB.getConfig('dailyGoalMinutes')) || '45';
    notebookUrlInput.value = (await DB.getConfig('notebookLmUrl')) || '';

    const savedApiKey = (await DB.getConfig('geminiApiKey')) || '';
    const savedModel = (await DB.getConfig('geminiModel')) || 'gemini-2.5-flash';
    apiKeyInput.value = savedApiKey;

    await updateModelOptions(savedApiKey, savedModel, false);

    const btnRefresh = document.getElementById('btn-refresh-models');
    if (btnRefresh) {
      btnRefresh.onclick = async () => updateModelOptions(apiKeyInput.value.trim(), modelSelect.value, true);
    }

    apiKeyInput.addEventListener('change', () => {
      if (apiKeyInput.value.trim()) updateModelOptions(apiKeyInput.value.trim(), modelSelect.value, false);
    });

    const activeFb = getActiveFirebaseConfig();
    if (fbApiKeyInput) fbApiKeyInput.value = activeFb.apiKey || '';
    if (fbProjectIdInput) fbProjectIdInput.value = activeFb.projectId || '';
    await refreshFirebaseStatusAndStats();
  } catch (e) {
    showToast('讀取設定檔失敗', 'error');
  }

  // 智慧解析整段 firebaseConfig 貼上
  if (fbPasteInput) {
    fbPasteInput.addEventListener('input', () => {
      const parsed = parseFirebaseConfigInput(fbPasteInput.value);
      if (parsed) {
        fbProjectIdInput.value = parsed.projectId;
        fbApiKeyInput.value = parsed.apiKey;
        showToast(`已自動擷取專案 ${parsed.projectId} 配置`, 'success');
      }
    });
  }

  document.getElementById('btn-save-params').onclick = async () => {
    const btn = document.getElementById('btn-save-params');
    btn.disabled = true;
    try {
      await DB.saveConfig('examDate', examDateInput.value);
      await DB.saveConfig('startDate', startDateInput.value);
      await DB.saveConfig('dailyGoalMinutes', dailyGoalInput.value);
      await DB.saveConfig('notebookLmUrl', notebookUrlInput.value);
      showToast('學習參數已儲存', 'success');
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  document.getElementById('btn-save-ai').onclick = async () => {
    const btn = document.getElementById('btn-save-ai');
    btn.disabled = true;
    try {
      await DB.saveConfig('geminiApiKey', apiKeyInput.value.trim());
      await DB.saveConfig('geminiModel', modelSelect.value);
      showToast('Gemini AI 設定已儲存', 'success');
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

  // 儲存並驗證 Firebase 連線
  const btnSaveFb = document.getElementById('btn-save-fb');
  if (btnSaveFb) {
    btnSaveFb.onclick = async () => {
      const parsed = fbPasteInput ? parseFirebaseConfigInput(fbPasteInput.value) : null;
      const projectId = (parsed && parsed.projectId) || fbProjectIdInput.value.trim();
      const apiKey = (parsed && parsed.apiKey) || fbApiKeyInput.value.trim();

      if (!projectId || !apiKey) {
        showToast('請填入 Project ID 與 Web API Key', 'warning');
        return;
      }

      const fbConfig = parsed || {
        apiKey,
        projectId,
        authDomain: `${projectId}.firebaseapp.com`,
        storageBucket: `${projectId}.appspot.com`
      };

      saveCustomFirebaseConfig(fbConfig);
      showToast('正在驗證 Firebase 連線與初始化', 'info');
      setTimeout(() => location.reload(), 600);
    };
  }

  const btnClearFb = document.getElementById('btn-clear-fb');
  if (btnClearFb) {
    btnClearFb.onclick = () => {
      if (!confirm('確定要清除 Firebase 設定並切換回純本機模式嗎？')) return;
      saveCustomFirebaseConfig(null);
      location.reload();
    };
  }

  // 本機資料一鍵推送至 Firebase
  const btnPushLocal = document.getElementById('btn-push-local-fb');
  if (btnPushLocal) {
    btnPushLocal.onclick = async () => {
      if (!confirm('確定要將目前本機 LocalStorage 的所有進度、題庫與卡片推送至 Firebase Firestore 嗎？')) return;
      btnPushLocal.disabled = true;
      try {
        showToast('正在批次推送本機資料至 Firebase', 'info');
        const res = await DB.pushLocalToFirebase();
        showToast(`推送成功：題庫 ${res.counts.questions} 題、卡片 ${res.counts.reviewCards} 張`, 'success');
        await refreshFirebaseStatusAndStats();
      } catch (e) {
        showToast('推送失敗：' + e.message, 'error');
      } finally {
        btnPushLocal.disabled = false;
      }
    };
  }

  // 從 Firebase 下載覆蓋本機快取
  const btnPullCloud = document.getElementById('btn-pull-fb-local');
  if (btnPullCloud) {
    btnPullCloud.onclick = async () => {
      btnPullCloud.disabled = true;
      try {
        showToast('正在從 Firebase 下載最新資料', 'info');
        const res = await DB.pullFirebaseToLocal();
        showToast(`下載完成：題庫 ${res.counts.questions} 題、卡片 ${res.counts.reviewCards} 張`, 'success');
        await refreshFirebaseStatusAndStats();
      } catch (e) {
        showToast('下載失敗：' + e.message, 'error');
      } finally {
        btnPullCloud.disabled = false;
      }
    };
  }

  // 舊版 Google Sheet 免後端直連搬移至 Firebase
  const btnMigrateSheet = document.getElementById('btn-migrate-gsheet');
  if (btnMigrateSheet) {
    btnMigrateSheet.onclick = async () => {
      const sheetInput = document.getElementById('input-gsheet-id')?.value.trim();
      if (!sheetInput) {
        showToast('請輸入 Google Sheet ID 或網址', 'warning');
        return;
      }
      btnMigrateSheet.disabled = true;
      try {
        showToast('正在從 Google Sheet 讀取並寫入 Firebase', 'info');
        const res = await DB.migrateFromGoogleSheet(sheetInput);
        showToast(
          `搬移成功：題庫 ${res.counts.questions} 題、閃卡 ${res.counts.reviewCards} 張、日誌 ${res.counts.studyLogs} 筆`,
          'success'
        );
        await refreshFirebaseStatusAndStats();
      } catch (e) {
        showToast('搬移失敗：' + e.message, 'error');
      } finally {
        btnMigrateSheet.disabled = false;
      }
    };
  }

  document.getElementById('btn-init-db').onclick = async () => {
    if (!confirm('確定要初始化 / 修復 37 單元課綱結構嗎？既有學習進度不會被清除。')) return;
    const btn = document.getElementById('btn-init-db');
    btn.disabled = true;
    try {
      showToast('正在修復課綱結構', 'info');
      const res = await DB.init(true);
      showToast(res.message, 'success');
    } catch (e) {
      showToast('初始化失敗：' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };

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
        showToast('備份檔案已下載', 'success');
      } catch (e) {
        showToast('匯出失敗：' + e.message, 'error');
      }
    };
  }

  const fileInput = document.getElementById('input-import-backup');
  if (fileInput) {
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          showToast('正在還原資料庫備份', 'info');
          const res = await DB.importAllDataJSON(evt.target.result);
          showToast(res.message, 'success');
          setTimeout(() => location.reload(), 1200);
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
      reader.readAsText(file);
    };
  }
}
