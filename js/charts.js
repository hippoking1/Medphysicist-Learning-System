/**
 * 醫學物理師考照自學系統 - HTML5 Canvas 圖表引擎 (js/charts.js)
 * 支援進度圓環圖 (Donut)、7 日時數折線圖 (Line) 以及 7 軸模組弱點雷達圖 (Radar)
 */

const Charts = {
  /**
   * 繪製圓環進度圖 (Donut Progress Chart)
   */
  drawDonut(canvasId, percent, labelText = '完成度') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    canvas.width = (rect.width || 180) * dpr;
    canvas.height = (rect.height || 180) * dpr;
    ctx.scale(dpr, dpr);

    const cx = (rect.width || 180) / 2;
    const cy = (rect.height || 180) / 2;
    const radius = Math.min(cx, cy) - 15;

    ctx.clearRect(0, 0, cx * 2, cy * 2);

    // 1. 繪製背景底環
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#1b1c26';
    ctx.lineWidth = 10;
    ctx.stroke();

    // 2. 繪製漸層進度環
    if (percent > 0) {
      ctx.beginPath();
      const endAngle = -Math.PI / 2 + (2 * Math.PI * (percent / 100));
      ctx.arc(cx, cy, radius, -Math.PI / 2, endAngle);

      const grad = ctx.createLinearGradient(0, 0, cx * 2, cy * 2);
      grad.addColorStop(0, '#8a2be2');
      grad.addColorStop(1, '#00f2fe');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 3. 繪製中心文字
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#f5f6fa';
    ctx.font = '700 24px "Outfit", sans-serif';
    ctx.fillText(`${percent}%`, cx, cy - 5);

    ctx.fillStyle = '#a0a5c1';
    ctx.font = '500 11px "Noto Sans TC", sans-serif';
    ctx.fillText(labelText, cx, cy + 18);
  },

  /**
   * 繪製學習時數折線圖 (Line Trend Chart)
   */
  drawLine(canvasId, dataPoints) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 400;
    const h = rect.height || 240;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);
    if (!dataPoints || dataPoints.length === 0) return;

    const padding = { top: 20, right: 20, bottom: 30, left: 35 };
    const chartWidth = w - padding.left - padding.right;
    const chartHeight = h - padding.top - padding.bottom;

    const maxVal = Math.max(60, ...dataPoints.map(p => p.minutes));

    // 1. 水平參考線與刻度
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6c7293';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';

    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
      const yVal = Math.round((maxVal / gridCount) * i);
      const y = padding.top + chartHeight - (chartHeight * (yVal / maxVal));

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      ctx.fillText(`${yVal}m`, padding.left - 8, y + 3);
    }

    // 2. 計算節點坐標
    const points = dataPoints.map((dp, i) => {
      const x = padding.left + (chartWidth * (i / (dataPoints.length - 1 || 1)));
      const y = padding.top + chartHeight - (chartHeight * (dp.minutes / maxVal));
      return { x, y, ...dp };
    });

    // 3. 繪製折線與漸層填充
    if (points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(points[0].x, padding.top + chartHeight);
      for (let i = 0; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
      grad.addColorStop(0, 'rgba(0, 242, 254, 0.25)');
      grad.addColorStop(1, 'rgba(0, 242, 254, 0)');
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // 4. 繪製節點圓點與 X 軸日期標籤
    ctx.textAlign = 'center';
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#00f2fe';
      ctx.fill();
      ctx.strokeStyle = '#0a0b10';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#a0a5c1';
      ctx.font = '10px monospace';
      ctx.fillText(p.date, p.x, padding.top + chartHeight + 18);
    });
  },

  /**
   * 繪製弱點分析雷達圖 (Radar Chart)
   */
  drawRadar(canvasId, moduleRates) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 350;
    const h = rect.height || 350;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.min(cx, cy) - 35;

    const axes = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'];
    const totalAxes = axes.length;

    // 1. 同心網格
    const gridLevels = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;

    for (let level = 1; level <= gridLevels; level++) {
      const radius = maxRadius * (level / gridLevels);
      ctx.beginPath();
      for (let i = 0; i < totalAxes; i++) {
        const angle = (i * 2 * Math.PI / totalAxes) - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // 2. 放射軸線與標籤
    ctx.fillStyle = '#6c7293';
    ctx.font = '700 11px "Outfit", sans-serif';

    for (let i = 0; i < totalAxes; i++) {
      const angle = (i * 2 * Math.PI / totalAxes) - Math.PI / 2;
      const xOuter = cx + maxRadius * Math.cos(angle);
      const yOuter = cy + maxRadius * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(xOuter, yOuter);
      ctx.stroke();

      const textX = cx + (maxRadius + 15) * Math.cos(angle);
      const textY = cy + (maxRadius + 12) * Math.sin(angle);

      if (Math.abs(Math.cos(angle)) < 0.1) ctx.textAlign = 'center';
      else if (Math.cos(angle) > 0) ctx.textAlign = 'left';
      else ctx.textAlign = 'right';

      ctx.fillText(axes[i], textX, textY + 3);
    }

    // 3. 數據多邊形
    const dataPoints = axes.map((axis, i) => {
      const rate = moduleRates && moduleRates[axis] !== undefined ? moduleRates[axis] : 0;
      const radius = maxRadius * (rate / 100);
      const angle = (i * 2 * Math.PI / totalAxes) - Math.PI / 2;
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

    ctx.fillStyle = 'rgba(138, 43, 226, 0.35)';
    ctx.fill();
    ctx.strokeStyle = '#8a2be2';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. 數據點高亮
    dataPoints.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#00f2fe';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }
};
