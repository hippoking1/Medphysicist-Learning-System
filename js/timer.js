/**
 * 醫學物理師考照自學系統 - 計時器管理 (js/timer.js)
 * 使用真實時間戳差值 (Date.now) 防範瀏覽器背景分頁節流，並支援 sessionStorage 持久化與 <dialog> 連動
 */

const TIMER_STORAGE_KEY = 'mp_active_study_timer';

const StudyTimer = {
  intervalId: null,
  accumulatedMs: 0,
  lastResumeAt: null,
  isPaused: false,
  currentUnitId: null,
  currentUnitName: null,

  _getElapsedSeconds() {
    const runningMs = !this.isPaused && this.lastResumeAt ? Date.now() - this.lastResumeAt : 0;
    return Math.floor((this.accumulatedMs + runningMs) / 1000);
  },

  _persistState() {
    if (!this.currentUnitId) {
      sessionStorage.removeItem(TIMER_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(
      TIMER_STORAGE_KEY,
      JSON.stringify({
        unitId: this.currentUnitId,
        unitName: this.currentUnitName,
        accumulatedMs: this.accumulatedMs,
        lastResumeAt: this.lastResumeAt,
        isPaused: this.isPaused
      })
    );
  },

  restoreIfRunning() {
    try {
      const raw = sessionStorage.getItem(TIMER_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || !saved.unitId) return;

      this.currentUnitId = saved.unitId;
      this.currentUnitName = saved.unitName;
      this.accumulatedMs = Number(saved.accumulatedMs || 0);
      this.lastResumeAt = saved.lastResumeAt || null;
      this.isPaused = !!saved.isPaused;
      this._mountUI();
      this._startTicker();
    } catch (e) {}
  },

  start(unitId, unitName) {
    if (this.currentUnitId) {
      showToast('已有其他單元正在進行計時', 'warning');
      return;
    }

    this.currentUnitId = unitId;
    this.currentUnitName = unitName;
    this.accumulatedMs = 0;
    this.lastResumeAt = Date.now();
    this.isPaused = false;

    this._persistState();
    this._mountUI();
    this._startTicker();
    showToast(`開始學習：${unitName}`, 'info');
  },

  _mountUI() {
    const nameEl = document.getElementById('timer-unit-name');
    const floatEl = document.getElementById('floating-timer');
    const btnPause = document.getElementById('btn-timer-pause');
    const btnStop = document.getElementById('btn-timer-stop');

    if (nameEl) nameEl.innerText = this.currentUnitName;
    if (floatEl) floatEl.style.display = 'flex';
    if (btnPause) {
      btnPause.innerHTML = `<span class="material-icons-round" style="font-size: 16px;">${
        this.isPaused ? 'play_arrow' : 'pause'
      }</span>`;
      btnPause.onclick = () => this.togglePause();
    }
    if (btnStop) btnStop.onclick = () => this.stopAndSave();
    this.updateDisplay();
  },

  _startTicker() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => {
      if (!this.isPaused) {
        this.updateDisplay();
      }
    }, 1000);
  },

  togglePause() {
    if (!this.currentUnitId) return;
    if (!this.isPaused) {
      this.accumulatedMs += this.lastResumeAt ? Date.now() - this.lastResumeAt : 0;
      this.lastResumeAt = null;
      this.isPaused = true;
    } else {
      this.lastResumeAt = Date.now();
      this.isPaused = false;
    }
    this._persistState();
    this._mountUI();
  },

  updateDisplay() {
    const totalSecs = this._getElapsedSeconds();
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const formatted = [
      String(hrs).padStart(2, '0'),
      String(mins).padStart(2, '0'),
      String(secs).padStart(2, '0')
    ].join(':');

    const timeEl = document.getElementById('timer-time');
    if (timeEl) timeEl.innerText = formatted;
  },

  reset() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.currentUnitId = null;
    this.currentUnitName = null;
    this.accumulatedMs = 0;
    this.lastResumeAt = null;
    this.isPaused = false;
    sessionStorage.removeItem(TIMER_STORAGE_KEY);
    const floatEl = document.getElementById('floating-timer');
    if (floatEl) floatEl.style.display = 'none';
  },

  async stopAndSave() {
    if (!this.currentUnitId) return;
    // 先凍結時間，若使用者取消儲存則保留計時狀態可繼續
    if (!this.isPaused) {
      this.togglePause();
    }
    const elapsedMinutes = Math.max(1, Math.round(this._getElapsedSeconds() / 60));
    const unitId = this.currentUnitId;

    const progressList = await DB.getProgress();
    const existing = progressList.find((p) => p.unitId === unitId);
    const defaultStatus = existing && existing.status === 'completed' ? 'completed' : 'in_progress';

    openProgressModal(unitId, defaultStatus, existing ? existing.notes : '', elapsedMinutes, () => {
      this.reset();
    });
  }
};

/**
 * 模擬測驗倒數計時器（同樣採用真實時間戳，避免切換視窗計時飄移）
 */
class ExamTimer {
  constructor(durationSeconds, onTick, onTimeUp) {
    this.duration = durationSeconds;
    this.elapsed = 0;
    this.startTime = null;
    this.onTick = onTick;
    this.onTimeUp = onTimeUp;
    this.intervalId = null;
    this.isStopped = false;
  }

  start() {
    this.startTime = Date.now();
    this.intervalId = setInterval(() => {
      if (this.isStopped) return;
      this.elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const remaining = Math.max(0, this.duration - this.elapsed);

      if (this.onTick) this.onTick(remaining, this.elapsed);

      if (remaining <= 0) {
        this.stop();
        if (this.onTimeUp) this.onTimeUp();
      }
    }, 500);
  }

  stop() {
    this.isStopped = true;
    if (this.startTime) {
      this.elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
