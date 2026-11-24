/**
 * 醫學物理師考照自學系統 - HTML5 Canvas 圖表引擎 (js/charts.js)
 * 支援雙主題色階自適應：進度圓環圖 (Donut)、7 日時數折線圖 (Line) 與 10 軸模組弱點雷達圖 (Radar)
 */

const Charts = {
  _getThemeTokens() {
    const styles = getComputedStyle(document.documentElement);
    const val = (name, fallback) => (styles.getPropertyValue(name) || '').trim() || fallback;
    return {
      accent: val('--accent', '#38bdf8'),
      accentSubtle: val('--accent-subtle', 'rgba(56, 189, 248, 0.14)'),
      textMain: val('--text-main', '#eef0f5'),
      textMuted: val('--text-muted', '#9aa3b8'),
      textDark: val('--text-dark', '#6e778c'),
      warning: val('--warning', '#f59e0b'),
      bgPrimary: val('--bg-primary', '#0d1017'),
      track: val('--chart-track', '#1a202c'),
      grid: val('--chart-grid', 'rgba(238, 240, 245, 0.07)')
    };
  },

  /**
   * 繪製圓環進度圖 (Donut Progress Chart)
   */
  drawDonut(canvasId, percent, labelText = '完成度') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const t = this._getThemeTokens();
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 180;
    const h = rect.height || 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 14;

    ctx.clearRect(0, 0, w, h);

    // 1. 背景底環
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = t.track;
    ctx.lineWidth = 10;
    ctx.stroke();

    // 2. 實色單一強調進度環 (Unslop: 移除雙色漸層)
    if (percent > 0) {
      ctx.beginPath();
      const endAngle = -Math.PI / 2 + 2 * Math.PI * (percent / 100);
      ctx.arc(cx, cy, radius, -Math.PI / 2, endAngle);
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 3. 中心文字 (等寬數值)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = t.textMain;
    ctx.font = '500 24px "JetBrains Mono", monospace';
    ctx.fillText(`${percent}%`, cx, cy - 6);

    ctx.fillStyle = t.textMuted;
    ctx.font = '400 12px "IBM Plex Sans", "Noto Sans TC", sans-serif';
    ctx.fillText(labelText, cx, cy + 16);
  },

  /**
   * 繪製學習時數折線圖 (Line Trend Chart，支援每日目標參考虛線)
   */
  drawLine(canvasId, dataPoints, goalMinutes = 0) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const t = this._getThemeTokens();
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 420;
    const h = rect.height || 240;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);
    if (!dataPoints || dataPoints.length === 0) return;

    const padding = { top: 20, right: 20, bottom: 32, left: 42 };
    const chartWidth = w - padding.left - padding.right;
    const chartHeight = h - padding.top - padding.bottom;
    const goal = Number(goalMinutes || 0);
    const maxVal = Math.max(60, Math.ceil(goal * 1.2), ...dataPoints.map((p) => p.minutes));

    // 1. 水平參考線與刻度
    ctx.strokeStyle = t.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = t.textDark;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';

    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
      const yVal = Math.round((maxVal / gridCount) * i);
      const y = padding.top + chartHeight - chartHeight * (yVal / maxVal);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      ctx.fillText(`${yVal}m`, padding.left - 8, y + 3.5);
    }

    // 1B. 每日目標水平虛線
    if (goal > 0 && goal <= maxVal) {
      const gy = padding.top + chartHeight - chartHeight * (goal / maxVal);
      ctx.save();
      ctx.strokeStyle = t.warning;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, gy);
      ctx.lineTo(padding.left + chartWidth, gy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = t.warning;
      ctx.textAlign = 'right';
      ctx.font = '500 10.5px "JetBrains Mono", monospace';
      ctx.fillText(`目標 ${goal}m`, padding.left + chartWidth - 2, gy - 5);
      ctx.restore();
    }

    // 2. 計算節點座標
    const points = dataPoints.map((dp, i) => {
      const x = padding.left + chartWidth * (i / (dataPoints.length - 1 || 1));
      const y = padding.top + chartHeight - chartHeight * (dp.minutes / maxVal);
      return { x, y, ...dp };
    });

    // 3. 折線與淡色填充
    if (points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(points[0].x, padding.top + chartHeight);
      for (let i = 0; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
      ctx.closePath();
      ctx.fillStyle = t.accentSubtle;
      ctx.fill();
    }

    // 4. 節點圓點與 X 軸日期
    ctx.textAlign = 'center';
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = t.accent;
      ctx.fill();
      ctx.strokeStyle = t.bgPrimary;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = t.textMuted;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(p.date, p.x, padding.top + chartHeight + 18);
    });
  },

  /**
   * 繪製全 10 模組弱點分析雷達圖 (10-Axis Radar Chart: M1 ~ M10)
   */
  drawRadar(canvasId, moduleRates) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const t = this._getThemeTokens();
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 320;
    const h = rect.height || 260;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.min(cx, cy) - 34;

    const axes = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];
    const totalAxes = axes.length;

    // 1. 同心十邊形網格
    const gridLevels = 5;
    ctx.strokeStyle = t.grid;
    ctx.lineWidth = 1;

    for (let level = 1; level <= gridLevels; level++) {
      const radius = maxRadius * (level / gridLevels);
      ctx.beginPath();
      for (let i = 0; i < totalAxes; i++) {
        const angle = (i * 2 * Math.PI) / totalAxes - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // 2. 放射軸線與等寬標籤
    ctx.fillStyle = t.textMuted;
    ctx.font = '500 11px "JetBrains Mono", monospace';

    for (let i = 0; i < totalAxes; i++) {
      const angle = (i * 2 * Math.PI) / totalAxes - Math.PI / 2;
      const xOuter = cx + maxRadius * Math.cos(angle);
      const yOuter = cy + maxRadius * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(xOuter, yOuter);
      ctx.stroke();

      const textX = cx + (maxRadius + 16) * Math.cos(angle);
      const textY = cy + (maxRadius + 14) * Math.sin(angle);

      if (Math.abs(Math.cos(angle)) < 0.15) ctx.textAlign = 'center';
      else if (Math.cos(angle) > 0) ctx.textAlign = 'left';
      else ctx.textAlign = 'right';

      ctx.fillText(axes[i], textX, textY + 3.5);
    }

    // 3. 數據多邊形
    const dataPoints = axes.map((axis, i) => {
      const rate = moduleRates && moduleRates[axis] !== undefined ? moduleRates[axis] : 0;
      const radius = maxRadius * (rate / 100);
      const angle = (i * 2 * Math.PI) / totalAxes - Math.PI / 2;
      return {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle)
      };
    });

    ctx.beginPath();
    ctx.moveTo(dataPoints[0].x, dataPoints[0].y);
    for (let i = 1; i < totalAxes; i++) {
      ctx.lineTo(dataPoints[i].x, dataPoints[i].y);
    }
    ctx.closePath();

    ctx.fillStyle = t.accentSubtle;
    ctx.fill();
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. 數據節點
    dataPoints.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, 2 * Math.PI);
      ctx.fillStyle = t.accent;
      ctx.fill();
      ctx.strokeStyle = t.bgPrimary;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
  }
};
