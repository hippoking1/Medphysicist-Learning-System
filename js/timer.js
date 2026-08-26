/**
 * 醫學物理師考照自學系統 - 計時器管理 (js/timer.js)
 * 包含學習懸浮計時器 (StudyTimer) 與模擬測驗倒數計時器 (ExamTimer)
 */

const StudyTimer = {
  intervalId: null,
  startTime: null,
  elapsedSeconds: 0,
  isPaused: false,
  currentUnitId: null,
  currentUnitName: null,

  start(unitId, unitName) {
    if (this.intervalId) {
      showToast('已有其他單元正在進行計時！', 'warning');
      return;
    }

    this.currentUnitId = unitId;
    this.currentUnitName = unitName;
    this.startTime = new Date();
    this.elapsedSeconds = 0;
    this.isPaused = false;

    // 顯示浮動計時面版
    const nameEl = document.getElementById('timer-unit-name');
    const floatEl = document.getElementById('floating-timer');
    if (nameEl) nameEl.innerText = unitName;
    if (floatEl) floatEl.style.display = 'flex';
    this.updateDisplay();

    // 綁定控制按鈕事件
    const btnPause = document.getElementById('btn-timer-pause');
    const btnStop = document.getElementById('btn-timer-stop');
    if (btnPause) btnPause.onclick = () => this.togglePause();
    if (btnStop) btnStop.onclick = () => this.stopAndSave();

    this.intervalId = setInterval(() => {
      if (!this.isPaused) {
        this.elapsedSeconds++;
        this.updateDisplay();
      }
    }, 1000);

    showToast(`開始學習：${unitName}`, 'info');
  },

  togglePause() {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById('btn-timer-pause');
    if (!btn) return;
    if (this.isPaused) {
      btn.innerHTML = '<span class="material-icons-round" style="font-size: 1rem;">play_arrow</span>';
      showToast('計時暫停', 'info');
    } else {
      btn.innerHTML = '<span class="material-icons-round" style="font-size: 1rem;">pause</span>';
      showToast('計時恢復', 'info');
    }
  },

  updateDisplay() {
    const hrs = Math.floor(this.elapsedSeconds / 3600);
    const mins = Math.floor((this.elapsedSeconds % 3600) / 60);
    const secs = this.elapsedSeconds % 60;

    const formatted = [
      String(hrs).padStart(2, '0'),
      String(mins).padStart(2, '0'),
      String(secs).padStart(2, '0')
    ].join(':');

    const timeEl = document.getElementById('timer-time');
    if (timeEl) timeEl.innerText = formatted;
  },

  async stopAndSave() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    const floatEl = document.getElementById('floating-timer');
    if (floatEl) floatEl.style.display = 'none';

    const elapsedMinutes = Math.max(1, Math.round(this.elapsedSeconds / 60));

    const confirmSave = confirm(`學習結束！本次累計研讀 ${elapsedMinutes} 分鐘。\n是否要將此時數記入 [${this.currentUnitName}] 的進度？`);

    if (confirmSave) {
      const notes = prompt('請輸入本次學習筆記心得（選填）：', '');
      const status = confirm('是否要將本單元標記為「已完成」(Completed)？\n(取消則標記為「進行中」)') ? 'completed' : 'in_progress';

      try {
        showToast('正在儲存研讀進度...', 'info');
        await DB.updateProgress(this.currentUnitId, status, elapsedMinutes, notes || '');
        showToast('學習進度已成功儲存！', 'success');

        // 重新整理當前頁面資料
        if (window.location.hash === '#syllabus') {
          loadSyllabusPage();
        } else if (window.location.hash === '#dashboard' || !window.location.hash) {
          loadDashboardPage();
        }
      } catch (err) {
        showToast('進度儲存失敗：' + err.message, 'error');
      }
    } else {
      showToast('計時已取消，未儲存時數', 'warning');
    }
  }
};

/**
 * 模擬測驗倒數計時器
 */
class ExamTimer {
  constructor(durationSeconds, onTick, onTimeUp) {
    this.duration = durationSeconds;
    this.elapsed = 0;
    this.onTick = onTick;
    this.onTimeUp = onTimeUp;
    this.intervalId = null;
    this.isStopped = false;
  }

  start() {
    this.intervalId = setInterval(() => {
      if (this.isStopped) return;
      this.elapsed++;
      const remaining = this.duration - this.elapsed;

      if (this.onTick) this.onTick(remaining, this.elapsed);

      if (remaining <= 0) {
        this.stop();
        if (this.onTimeUp) this.onTimeUp();
      }
    }, 1000);
  }

  stop() {
    this.isStopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
