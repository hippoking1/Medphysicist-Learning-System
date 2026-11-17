/**
 * 醫學物理師考照自學系統 - 確定性醫學物理繪圖引擎 (js/diagrams.js)
 * 包含：
 * 1. PhysicsPlotter: 以真實物理公式取樣 200 點渲染高精度 SVG 曲線 (PDD / Profile / LQ / Decay / HVL)
 * 2. ClinicalBlueprints: 工程製圖級標準臨床幾何藍圖 (TG-51 / 半影 / 照野銜接 / TG-43 / 不均勻界面 / 機頭)
 * 3. 雙主題自適應 (Ink Dark & Warm Paper) 與舊式行內 SVG 色彩正規化
 */

const Diagrams = {
  /**
   * 課綱核心單元內建標準圖解對照表
   */
  UNIT_DIAGRAMS: {
    'U1.1.2': [
      {
        title: '窄射束與寬射束 HVL 衰減與射束硬化 (Beam Hardening)',
        caption: '多能譜 X 光隨厚度增加使有效能量上升，故寬射束與深層 HVL₂ > HVL₁。',
        spec: { type: 'attenuation', params: { hvl1: 3.2, showBroadBeam: true } }
      },
      {
        title: '直線加速器機頭構造比較 (光子模式 vs. 電子模式)',
        caption: '光子模式使用靶 (Target) 與整平濾器 (Flattening Filter)；電子模式移開靶與濾器，改用散射箔 (Scattering Foil)。',
        spec: { type: 'linac_head', params: { mode: 'photon' } }
      }
    ],
    'U1.2.1': [
      {
        title: '放射性核種母子核平衡曲線 (Transient vs. Secular Equilibrium)',
        caption: '瞬態平衡 (如 ⁹⁹Mo → ⁹⁹ᵐTc, T₁ > T₂) 子核活度可超越母核並於 t_max 達峰；永恆平衡 (T₁ ≫ T₂) 子母核活度趨於相等。',
        spec: { type: 'decay', params: { mode: 'both', t1: 66, t2: 6 } }
      }
    ],
    'U2.1.1': [
      {
        title: '高能光子與電子百分深度劑量 (PDD) 比較',
        caption: '光子具備皮膚免除效應與明確 d_max；電子具備急遽劑量跌落與制動輻射尾部 (Bremsstrahlung tail)。',
        spec: { type: 'pdd', params: { curves: ['photon_6mv', 'photon_18mv', 'electron_12mev'] } }
      }
    ],
    'U2.1.2': [
      {
        title: 'AAPM TG-51 水中吸收劑量參考校正幾何 (SSD vs. SAD)',
        caption: '參考深度 d_ref = 10 cm，圓柱型游離腔於光子射束之有效量測點 P_eff 位於腔體中心上游 0.6 r_cav。',
        spec: { type: 'tg51_setup', params: { setup: 'SSD', ssd: 100, dref: 10, field: '10×10 cm²' } }
      }
    ],
    'U2.2.1': [
      {
        title: 'IAEA TRS-398 水假體校正配置 (P_eff = 0.5 r_cav)',
        caption: 'TRS-398 與 TG-51 皆於水中 d_ref = 10 cm 量測，但光子有效量測點偏移規範不同 (TRS-398 為 0.5 r_cav)。',
        spec: { type: 'tg51_setup', params: { setup: 'SAD', ssd: 100, dref: 10, field: '10×10 cm²', protocol: 'TRS-398' } }
      }
    ],
    'U2.2.2': [
      {
        title: '質子射束 Pristine Bragg Peak 與展寬峰 (SOBP)',
        caption: '質子在射程末端釋放絕大部分能量形成尖銳 Bragg Peak；臨床治療藉由調變能量疊加為涵蓋腫瘤的 SOBP。',
        spec: { type: 'pdd', params: { curves: ['proton_pristine', 'proton_sobp', 'photon_6mv'] } }
      }
    ],
    'U3.1.1': [
      {
        title: '組織不均勻界面效應 (水 → 肺 → 骨 → 水)',
        caption: '低密度肺組織減少衰減但導致側向電子失衡；高密度骨組織在界面產生背向散射與後續衰減增加。',
        spec: { type: 'inhomogeneity_slab', params: { lungDensity: '0.25 g/cm³', boneDensity: '1.85 g/cm³' } }
      }
    ],
    'U3.1.2': [
      {
        title: '整平濾器 (FF) 與無整平濾器 (FFF) 離軸劑量剖面',
        caption: 'FF 射束具平坦中央區與射束角 (Horns)；FFF 射束呈中心尖峰狀且半影外散射輻射較低。',
        spec: { type: 'profile', params: { showFFF: true, fieldSize: 10 } }
      },
      {
        title: '高能光子 6 MV vs. 18 MV 百分深度劑量 (PDD)',
        caption: '能量越高，d_max 越深 (6 MV ≈ 1.5 cm, 18 MV ≈ 3.2 cm)，表面劑量比例越低且穿透力越強。',
        spec: { type: 'pdd', params: { curves: ['photon_6mv', 'photon_18mv'] } }
      }
    ],
    'U3.2.1': [
      {
        title: '幾何半影 (Geometric Penumbra) 相似三角形推導',
        caption: 'Pg = s × (SSD + d - SCD) / SCD；增加 SCD 或縮小射源直徑 s 可有效減少幾何半影。',
        spec: { type: 'geometric_penumbra', params: { s: 2, scd: 50, ssd: 100, d: 10 } }
      }
    ],
    'U4.1.3': [
      {
        title: 'AAPM TG-43 近接治療線射源極座標幾何系統',
        caption: '以幾何因子 G_L(r, θ) 與夾角 β 描述任意點 P(r, θ) 相對活性長度 L 線射源之劑量分佈，參考點為 (r₀=1 cm, θ₀=90°)。',
        spec: { type: 'tg43_geometry', params: { L: 3.5 } }
      }
    ],
    'U4.2.1': [
      {
        title: '相鄰照野發散銜接與表面間隙 (Gap) 幾何計算',
        caption: '表面間隙 ΔG = ½·L₁·(d/SSD₁) + ½·L₂·(d/SSD₂)，使兩發散射束邊界精準相交於目標深度 d。',
        spec: { type: 'field_matching', params: { l1: 20, l2: 20, ssd: 100, d: 10 } }
      }
    ],
    'U7.2.1': [
      {
        title: '輻射衰減與半值層 (HVL) / 十值層 (TVL) 指數關係',
        caption: '單能光子 I(x) = I₀·e^(-μx)；1 TVL ≈ 3.322 HVL；寬射束需乘入增建因子 B(μx)。',
        spec: { type: 'attenuation', params: { hvl1: 2.5, showBroadBeam: true } }
      }
    ],
    'U9.1.1': [
      {
        title: 'Linear-Quadratic (LQ) 細胞存活曲線 (低 LET vs. 高 LET)',
        caption: '低 LET (X/γ 光子) 具明顯肩區 (Shoulder)，S = exp(-αD - βD²)；高 LET (α/中子) 呈直線，OER 與修復能力大幅降低。',
        spec: { type: 'lq_survival', params: { alphaBetaLow: 10, alphaBetaLate: 3 } }
      }
    ]
  },

  /**
   * 掃描容器並渲染所有 .mp-diagram 佔位符，同時正規化既有手寫 SVG 色階
   */
  hydrateContainer(rootEl) {
    if (!rootEl) return;

    const specs = rootEl.querySelectorAll('.mp-diagram[data-spec]');
    specs.forEach((el) => {
      if (el.getAttribute('data-rendered') === 'true') return;
      try {
        const specStr = el.getAttribute('data-spec');
        const spec = JSON.parse(specStr);
        el.innerHTML = this.renderSpec(spec);
        el.setAttribute('data-rendered', 'true');
      } catch (err) {
        console.warn('[Diagrams] 規格解析失敗:', err);
      }
    });

    // 修復既有舊題庫中的硬編碼亮色 SVG，使其支援雙主題
    const legacySvgs = rootEl.querySelectorAll('svg:not(.mp-svg)');
    legacySvgs.forEach((svg) => this.normalizeInlineSVG(svg));
  },

  normalizeInlineSVG(svg) {
    svg.classList.add('mp-svg', 'mp-svg-legacy');
    const replaceColor = (val) => {
      if (!val) return val;
      const lower = val.trim().toLowerCase();
      if (['#fff', '#ffffff', 'white', '#f5f6fa', '#e0e0e0'].includes(lower)) return 'currentColor';
      if (['#00f2fe', '#4facfe', '#8a2be2', '#9d4edd', 'cyan'].includes(lower)) return 'var(--accent)';
      if (['#a0a5c1', '#6c7293', '#ccc', 'lightgray'].includes(lower)) return 'var(--text-muted)';
      return val;
    };

    svg.querySelectorAll('*').forEach((node) => {
      ['stroke', 'fill'].forEach((attr) => {
        const cur = node.getAttribute(attr);
        if (cur && cur !== 'none') {
          node.setAttribute(attr, replaceColor(cur));
        }
      });
    });
  },

  /**
   * 依規格 JSON 路由至對應繪圖函式
   */
  renderSpec(spec) {
    if (!spec || !spec.type) return '';
    const p = spec.params || {};
    switch (spec.type) {
      case 'pdd':
        return this.plotPDD(p);
      case 'profile':
        return this.plotProfile(p);
      case 'lq_survival':
        return this.plotLQSurvival(p);
      case 'decay':
        return this.plotDecay(p);
      case 'attenuation':
        return this.plotAttenuation(p);
      case 'tg51_setup':
        return this.drawTG51Setup(p);
      case 'geometric_penumbra':
        return this.drawGeometricPenumbra(p);
      case 'field_matching':
        return this.drawFieldMatching(p);
      case 'tg43_geometry':
        return this.drawTG43Geometry(p);
      case 'inhomogeneity_slab':
        return this.drawInhomogeneitySlab(p);
      case 'linac_head':
        return this.drawLinacHead(p);
      default:
        return '';
    }
  },

  // ==========================================
  // 共用 SVG 框架與座標轉換輔助
  // ==========================================
  _svgShell(viewBox, defs, body) {
    return `<svg class="mp-svg" viewBox="${viewBox}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img">
      <defs>
        <marker id="mp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--text-muted)"/>
        </marker>
        <marker id="mp-arrow-accent" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--accent)"/>
        </marker>
        ${defs || ''}
      </defs>
      ${body}
    </svg>`;
  },

  _buildAxes(pad, plotW, plotH, xLabel, yLabel, xTicks, yTicks, xDomain, yDomain) {
    const xMap = (x) => pad.left + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotW;
    const yMap = (y) => pad.top + plotH - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;
    let grid = '';

    yTicks.forEach((t) => {
      const y = yMap(t.val);
      grid += `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${pad.left + plotW}" y2="${y.toFixed(1)}" stroke="var(--border-color)" stroke-dasharray="3 3" stroke-width="1"/>`;
      grid += `<text x="${pad.left - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">${t.label}</text>`;
    });

    xTicks.forEach((t) => {
      const x = xMap(t.val);
      grid += `<line x1="${x.toFixed(1)}" y1="${pad.top}" x2="${x.toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--border-color)" stroke-dasharray="3 3" stroke-width="1"/>`;
      grid += `<text x="${x.toFixed(1)}" y="${pad.top + plotH + 16}" text-anchor="middle" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">${t.label}</text>`;
    });

    // 主軸線
    grid += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="var(--border-strong)" stroke-width="1.5"/>`;
    grid += `<line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="var(--border-strong)" stroke-width="1.5"/>`;

    // 軸標題
    grid += `<text x="${pad.left + plotW / 2}" y="${pad.top + plotH + 34}" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="500">${xLabel}</text>`;
    grid += `<text x="15" y="${pad.top + plotH / 2}" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="500" transform="rotate(-90 15 ${pad.top + plotH / 2})">${yLabel}</text>`;

    return { grid, xMap, yMap };
  },

  _samplePath(fn, xMin, xMax, steps, xMap, yMap) {
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const x = xMin + ((xMax - xMin) * i) / steps;
      const y = fn(x);
      const px = xMap(x).toFixed(1);
      const py = yMap(y).toFixed(1);
      d += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`;
    }
    return d;
  },

  // ==========================================
  // 1. PhysicsPlotter — 真實物理數學曲線
  // ==========================================
  plotPDD(params) {
    const curves = Array.isArray(params.curves) && params.curves.length > 0
      ? params.curves
      : ['photon_6mv', 'photon_18mv'];
    const pad = { top: 28, right: 24, bottom: 44, left: 54 };
    const w = 520;
    const h = 270;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const xTicks = [0, 5, 10, 15, 20, 25, 30].map((v) => ({ val: v, label: `${v}` }));
    const yTicks = [0, 20, 40, 60, 80, 100].map((v) => ({ val: v, label: `${v}%` }));
    const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '水中深度 Depth (cm)', '相對百分深度劑量 PDD (%)', xTicks, yTicks, [0, 30], [0, 105]);

    const models = {
      photon_6mv: {
        label: '6 MV 光子 (dmax ≈ 1.5 cm)',
        color: 'var(--accent)',
        dash: '',
        fn: (d) => {
          const buildUp = 1 - Math.exp(-d / 0.42);
          const atten = Math.exp(-0.045 * Math.max(0, d - 1.5));
          const raw = (0.32 + 0.68 * buildUp) * atten;
          return Math.min(100, raw * 102.5);
        }
      },
      photon_18mv: {
        label: '18 MV 光子 (dmax ≈ 3.2 cm)',
        color: 'var(--success)',
        dash: '',
        fn: (d) => {
          const buildUp = 1 - Math.exp(-d / 0.85);
          const atten = Math.exp(-0.028 * Math.max(0, d - 3.2));
          const raw = (0.18 + 0.82 * buildUp) * atten;
          return Math.min(100, raw * 102.5);
        }
      },
      electron_12mev: {
        label: '12 MeV 電子 (Rp ≈ 6.0 cm)',
        color: 'var(--warning)',
        dash: '5 3',
        fn: (d) => {
          if (d > 6.6) return 2.5;
          const build = 88 + 12 * (1 - Math.exp(-d / 0.9));
          const drop = 1 / (1 + Math.exp((d - 5.0) / 0.35));
          return Math.max(2.5, build * drop);
        }
      },
      proton_pristine: {
        label: '質子 Pristine Bragg Peak',
        color: 'var(--accent)',
        dash: '',
        fn: (d) => {
          if (d > 16.5) return 0.3;
          const base = 26 + 0.7 * d;
          const peak = 73 * Math.exp(-Math.pow((d - 15.0) / 0.65, 2));
          const tail = d > 15.0 ? Math.exp(-(d - 15.0) * 3.5) : 1;
          return Math.min(100, (base + peak) * tail);
        }
      },
      proton_sobp: {
        label: '質子 SOBP 展寬峰',
        color: 'var(--warning)',
        dash: '4 3',
        fn: (d) => {
          if (d > 16.5) return 0.3;
          if (d < 9.5) return 68 + (28 * d) / 9.5;
          if (d <= 15.0) return 97;
          return 97 * Math.exp(-Math.pow((d - 15.0) / 0.45, 2));
        }
      }
    };

    let paths = '';
    let legend = '';
    curves.forEach((key, idx) => {
      const m = models[key];
      if (!m) return;
      const d = this._samplePath(m.fn, 0, 30, 200, xMap, yMap);
      paths += `<path d="${d}" fill="none" stroke="${m.color}" stroke-width="2.2" ${m.dash ? `stroke-dasharray="${m.dash}"` : ''}/>`;

      const lx = pad.left + plotW - 185;
      const ly = pad.top + 14 + idx * 18;
      legend += `<line x1="${lx}" y1="${ly}" x2="${lx + 20}" y2="${ly}" stroke="${m.color}" stroke-width="2.2" ${m.dash ? `stroke-dasharray="${m.dash}"` : ''}/>`;
      legend += `<text x="${lx + 26}" y="${ly + 3.5}" fill="var(--text-main)" font-size="10.5">${m.label}</text>`;
    });

    // 若含光子 6MV，標示 dmax 參考點
    if (curves.includes('photon_6mv')) {
      const px = xMap(1.5);
      const py = yMap(100);
      paths += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="var(--accent)"/>`;
      paths += `<text x="${(px + 6).toFixed(1)}" y="${(py - 6).toFixed(1)}" fill="var(--accent)" font-size="10" font-family="var(--font-mono)">dmax 1.5cm</text>`;
    }

    return this._svgShell(`0 0 ${w} ${h}`, '', grid + paths + legend);
  },

  plotProfile(params) {
    const fieldSize = Number(params.fieldSize || 10);
    const half = fieldSize / 2;
    const showFFF = params.showFFF !== false;
    const pad = { top: 28, right: 24, bottom: 44, left: 54 };
    const w = 520;
    const h = 270;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const xTicks = [-10, -5, 0, 5, 10].map((v) => ({ val: v, label: `${v}` }));
    const yTicks = [0, 20, 50, 80, 100].map((v) => ({ val: v, label: `${v}%` }));
    const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '離軸距離 Off-axis Distance (cm)', '歸一化劑量 Relative Dose (%)', xTicks, yTicks, [-10, 10], [0, 110]);

    // FF 曲線 (帶 Horns 與 Sigmoid 半影)
    const ffFn = (x) => {
      const r = Math.abs(x);
      const horn = 1 + 0.035 * Math.pow(Math.min(r, half) / half, 2);
      const edge = 1 / (1 + Math.exp((r - half) / 0.32));
      return Math.max(1.5, 99 * horn * edge);
    };

    // FFF 曲線 (中心尖峰，低照野外洩漏)
    const fffFn = (x) => {
      const r = Math.abs(x);
      const cone = 100 * Math.exp(-0.045 * r * r * 0.28);
      const edge = 1 / (1 + Math.exp((r - half) / 0.28));
      return Math.max(0.8, cone * edge);
    };

    let body = grid;
    // 50% 等劑量線與幾何照野標註
    body += `<line x1="${pad.left}" y1="${yMap(50).toFixed(1)}" x2="${pad.left + plotW}" y2="${yMap(50).toFixed(1)}" stroke="var(--text-dark)" stroke-dasharray="2 3" stroke-width="1"/>`;
    body += `<line x1="${xMap(half).toFixed(1)}" y1="${pad.top}" x2="${xMap(half).toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--warning)" stroke-dasharray="4 3" stroke-width="1.2"/>`;
    body += `<text x="${(xMap(half) + 5).toFixed(1)}" y="${pad.top + 14}" fill="var(--warning)" font-size="10" font-family="var(--font-mono)">50% 照野邊界 (+${half}cm)</text>`;

    body += `<path d="${this._samplePath(ffFn, -10, 10, 200, xMap, yMap)}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>`;
    body += `<text x="${pad.left + 12}" y="${pad.top + 16}" fill="var(--accent)" font-size="10.5">── FF (整平射束)</text>`;

    if (showFFF) {
      body += `<path d="${this._samplePath(fffFn, -10, 10, 200, xMap, yMap)}" fill="none" stroke="var(--success)" stroke-width="2" stroke-dasharray="5 3"/>`;
      body += `<text x="${pad.left + 12}" y="${pad.top + 32}" fill="var(--success)" font-size="10.5">- - FFF (無整平濾器)</text>`;
    }

    return this._svgShell(`0 0 ${w} ${h}`, '', body);
  },

  plotLQSurvival(params) {
    const pad = { top: 28, right: 24, bottom: 44, left: 56 };
    const w = 520;
    const h = 270;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const xTicks = [0, 2, 4, 6, 8, 10, 12].map((v) => ({ val: v, label: `${v}` }));
    const yTicks = [
      { val: 0, label: '1.0' },
      { val: -1, label: '10⁻¹' },
      { val: -2, label: '10⁻²' },
      { val: -3, label: '10⁻³' }
    ];
    const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '單次劑量 Dose (Gy)', '細胞存活分率 Surviving Fraction (log)', xTicks, yTicks, [0, 12], [-3.2, 0.1]);

    // 低 LET 早反應組織 (α/β = 10 Gy) vs 晚反應組織 (α/β = 3 Gy) vs 高 LET (線性)
    const earlyFn = (D) => -(0.3 * D + 0.03 * D * D) / Math.LN10;
    const lateFn = (D) => -(0.12 * D + 0.04 * D * D) / Math.LN10;
    const highLetFn = (D) => -(0.62 * D) / Math.LN10;

    let body = grid;
    body += `<path d="${this._samplePath(earlyFn, 0, 12, 160, xMap, yMap)}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>`;
    body += `<path d="${this._samplePath(lateFn, 0, 12, 160, xMap, yMap)}" fill="none" stroke="var(--warning)" stroke-width="2"/>`;
    body += `<path d="${this._samplePath(highLetFn, 0, 11.5, 100, xMap, yMap)}" fill="none" stroke="var(--danger)" stroke-width="2" stroke-dasharray="5 3"/>`;

    // αD = βD² 交點提示
    const lx = pad.left + plotW - 188;
    body += `<text x="${lx}" y="${pad.top + 16}" fill="var(--accent)" font-size="10.5">── 低 LET 早反應/腫瘤 (α/β=10)</text>`;
    body += `<text x="${lx}" y="${pad.top + 34}" fill="var(--warning)" font-size="10.5">── 低 LET 晚反應組織 (α/β=3)</text>`;
    body += `<text x="${lx}" y="${pad.top + 52}" fill="var(--danger)" font-size="10.5">- - 高 LET 射束 (無 Shoulder)</text>`;

    return this._svgShell(`0 0 ${w} ${h}`, '', body);
  },

  plotDecay(params) {
    const t1 = Number(params.t1 || 66); // ⁹⁹Mo ~66h
    const t2 = Number(params.t2 || 6);  // ⁹⁹ᵐTc ~6h
    const l1 = Math.LN2 / t1;
    const l2 = Math.LN2 / t2;

    const pad = { top: 28, right: 24, bottom: 44, left: 54 };
    const w = 520;
    const h = 270;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const maxT = 72;
    const xTicks = [0, 12, 24, 36, 48, 60, 72].map((v) => ({ val: v, label: `${v}h` }));
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0, 1.2].map((v) => ({ val: v, label: `${v.toFixed(2)}` }));
    const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '經過時間 Time (hours)', '相對活度 A(t) / A₁(0)', xTicks, yTicks, [0, maxT], [0, 1.25]);

    const parentFn = (t) => Math.exp(-l1 * t);
    const daughterFn = (t) => (l2 / (l2 - l1)) * (Math.exp(-l1 * t) - Math.exp(-l2 * t));
    const tMax = Math.log(l2 / l1) / (l2 - l1);
    const aMax = daughterFn(tMax);

    let body = grid;
    body += `<path d="${this._samplePath(parentFn, 0, maxT, 180, xMap, yMap)}" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-dasharray="5 3"/>`;
    body += `<path d="${this._samplePath(daughterFn, 0, maxT, 180, xMap, yMap)}" fill="none" stroke="var(--accent)" stroke-width="2.4"/>`;

    // t_max 標註
    const px = xMap(tMax);
    const py = yMap(aMax);
    body += `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${px.toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--warning)" stroke-dasharray="3 3"/>`;
    body += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="var(--warning)"/>`;
    body += `<text x="${(px + 6).toFixed(1)}" y="${(py - 6).toFixed(1)}" fill="var(--warning)" font-size="10" font-family="var(--font-mono)">t_max ≈ ${tMax.toFixed(1)}h</text>`;

    const lx = pad.left + plotW - 190;
    body += `<text x="${lx}" y="${pad.top + 16}" fill="var(--text-muted)" font-size="10.5">- - 母核 A₁(t) (T½ = ${t1}h)</text>`;
    body += `<text x="${lx}" y="${pad.top + 34}" fill="var(--accent)" font-size="10.5">── 子核 A₂(t) (T½ = ${t2}h)</text>`;

    return this._svgShell(`0 0 ${w} ${h}`, '', body);
  },

  plotAttenuation(params) {
    const hvl1 = Number(params.hvl1 || 3.0);
    const mu = Math.LN2 / hvl1;
    const pad = { top: 28, right: 24, bottom: 44, left: 54 };
    const w = 520;
    const h = 270;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const maxX = hvl1 * 4;
    const xTicks = [0, 1, 2, 3, 4].map((n) => ({ val: n * hvl1, label: n === 0 ? '0' : `${n} HVL` }));
    const yTicks = [0, 25, 50, 75, 100].map((v) => ({ val: v, label: `${v}%` }));
    const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '屏蔽厚度 Thickness', '穿透射束強度 I / I₀ (%)', xTicks, yTicks, [0, maxX], [0, 105]);

    const narrowFn = (x) => 100 * Math.exp(-mu * x);
    const broadFn = (x) => 100 * (1 + 0.45 * mu * x) * Math.exp(-mu * x * 0.92);

    let body = grid;
    body += `<path d="${this._samplePath(narrowFn, 0, maxX, 160, xMap, yMap)}" fill="none" stroke="var(--accent)" stroke-width="2.3"/>`;
    if (params.showBroadBeam !== false) {
      body += `<path d="${this._samplePath(broadFn, 0, maxX, 160, xMap, yMap)}" fill="none" stroke="var(--warning)" stroke-width="2" stroke-dasharray="5 3"/>`;
    }

    // 50% 標示點
    const px = xMap(hvl1);
    const py = yMap(50);
    body += `<line x1="${pad.left}" y1="${py.toFixed(1)}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="var(--text-dark)" stroke-dasharray="2 2"/>`;
    body += `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${px.toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--text-dark)" stroke-dasharray="2 2"/>`;
    body += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="var(--accent)"/>`;

    const lx = pad.left + plotW - 185;
    body += `<text x="${lx}" y="${pad.top + 16}" fill="var(--accent)" font-size="10.5">── 窄射束 (Narrow Beam)</text>`;
    if (params.showBroadBeam !== false) {
      body += `<text x="${lx}" y="${pad.top + 34}" fill="var(--warning)" font-size="10.5">- - 寬射束 (含散射 B > 1)</text>`;
    }

    return this._svgShell(`0 0 ${w} ${h}`, '', body);
  },

  // ==========================================
  // 2. ClinicalBlueprints — 工程製圖級臨床幾何藍圖
  // ==========================================
  drawTG51Setup(params) {
    const setup = params.setup || 'SSD';
    const dref = params.dref || 10;
    const field = params.field || '10×10 cm²';
    const protocol = params.protocol || 'TG-51';
    const shiftNote = protocol === 'TRS-398' ? 'P_eff = 0.5 r_cav (上游)' : 'P_eff = 0.6 r_cav (上游)';

    const body = `
      <!-- 射源與準直儀 -->
      <circle cx="250" cy="24" r="5" fill="var(--warning)"/>
      <text x="262" y="28" fill="var(--text-main)" font-size="11" font-weight="600">Target / Source</text>
      <rect x="175" y="48" width="52" height="12" fill="var(--bg-raised)" stroke="var(--border-strong)"/>
      <rect x="273" y="48" width="52" height="12" fill="var(--bg-raised)" stroke="var(--border-strong)"/>
      <text x="333" y="58" fill="var(--text-muted)" font-size="10">Jaws (${field})</text>

      <!-- 射束錐體 -->
      <polygon points="250,24 166,245 334,245" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4 3"/>
      <line x1="250" y1="24" x2="250" y2="250" stroke="var(--text-dark)" stroke-dasharray="2 3" stroke-width="1"/>

      <!-- 水假體 -->
      <rect x="115" y="128" width="270" height="118" rx="4" fill="rgba(56, 189, 248, 0.06)" stroke="var(--accent)" stroke-width="1.6"/>
      <text x="125" y="144" fill="var(--accent)" font-size="10.5" font-weight="600">Water Phantom (水假體)</text>

      <!-- 游離腔 -->
      <rect x="228" y="182" width="44" height="14" rx="7" fill="var(--bg-primary)" stroke="var(--text-main)" stroke-width="1.8"/>
      <line x1="272" y1="189" x2="365" y2="189" stroke="var(--text-main)" stroke-width="2.5"/>
      <circle cx="250" cy="189" r="2.5" fill="var(--warning)"/>
      <circle cx="250" cy="183" r="2.5" fill="var(--success)"/>

      <!-- 深度與 SSD 標註 -->
      <line x1="90" y1="24" x2="90" y2="${setup === 'SAD' ? 189 : 128}" stroke="var(--text-muted)" stroke-width="1.2" marker-start="url(#mp-arrow)" marker-end="url(#mp-arrow)"/>
      <text x="82" y="${setup === 'SAD' ? 110 : 80}" text-anchor="end" fill="var(--text-main)" font-size="10.5" font-family="var(--font-mono)">${setup} = 100 cm</text>

      <line x1="145" y1="128" x2="145" y2="189" stroke="var(--accent)" stroke-width="1.2" marker-start="url(#mp-arrow-accent)" marker-end="url(#mp-arrow-accent)"/>
      <text x="152" y="164" fill="var(--accent)" font-size="10.5" font-family="var(--font-mono)">d_ref = ${dref} cm</text>

      <!-- P_eff 提示線 -->
      <line x1="255" y1="182" x2="310" y2="164" stroke="var(--success)" stroke-width="1"/>
      <text x="314" y="166" fill="var(--success)" font-size="10" font-family="var(--font-mono)">${shiftNote}</text>
      <text x="275" y="206" fill="var(--text-muted)" font-size="10">Chamber Center (軸心)</text>
    `;
    return this._svgShell('0 0 500 265', '', body);
  },

  drawGeometricPenumbra(params) {
    const s = params.s || 2;
    const scd = params.scd || 50;
    const ssd = params.ssd || 100;
    const d = params.d || 10;

    const body = `
      <!-- 有限射源寬度 s -->
      <line x1="226" y1="26" x2="274" y2="26" stroke="var(--warning)" stroke-width="4" stroke-linecap="round"/>
      <text x="250" y="16" text-anchor="middle" fill="var(--warning)" font-size="10.5" font-family="var(--font-mono)">射源寬度 s = ${s} mm</text>

      <!-- 準直儀 (SCD) -->
      <rect x="130" y="96" width="76" height="12" fill="var(--bg-raised)" stroke="var(--border-strong)"/>
      <rect x="294" y="96" width="76" height="12" fill="var(--bg-raised)" stroke="var(--border-strong)"/>
      <text x="378" y="106" fill="var(--text-muted)" font-size="10">Collimator (SCD=${scd})</text>

      <!-- 患者皮膚表面與深度 d -->
      <line x1="95" y1="176" x2="405" y2="176" stroke="var(--border-strong)" stroke-width="1.5"/>
      <text x="410" y="180" fill="var(--text-muted)" font-size="10">皮膚 (SSD=${ssd})</text>

      <line x1="95" y1="224" x2="405" y2="224" stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="4 3"/>
      <text x="410" y="228" fill="var(--accent)" font-size="10">深度 d = ${d} cm</text>

      <!-- 交叉切線 (左射源邊→右準直儀，右射源邊→左準直儀等) -->
      <line x1="226" y1="26" x2="152" y2="224" stroke="var(--accent)" stroke-width="1.3"/>
      <line x1="274" y1="26" x2="128" y2="224" stroke="var(--danger)" stroke-width="1.3" stroke-dasharray="4 2"/>
      <line x1="274" y1="26" x2="348" y2="224" stroke="var(--accent)" stroke-width="1.3"/>
      <line x1="226" y1="26" x2="372" y2="224" stroke="var(--danger)" stroke-width="1.3" stroke-dasharray="4 2"/>

      <!-- 半影 Pg 標註 -->
      <rect x="128" y="220" width="24" height="8" fill="rgba(229, 72, 77, 0.35)" stroke="var(--danger)"/>
      <rect x="348" y="220" width="24" height="8" fill="rgba(229, 72, 77, 0.35)" stroke="var(--danger)"/>
      <text x="140" y="246" text-anchor="middle" fill="var(--danger)" font-size="10.5" font-family="var(--font-mono)">Pg</text>
      <text x="360" y="246" text-anchor="middle" fill="var(--danger)" font-size="10.5" font-family="var(--font-mono)">Pg</text>

      <!-- 中心距離箭頭 -->
      <line x1="72" y1="26" x2="72" y2="102" stroke="var(--text-muted)" stroke-width="1.1" marker-start="url(#mp-arrow)" marker-end="url(#mp-arrow)"/>
      <text x="66" y="68" text-anchor="end" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">SCD</text>
      <line x1="48" y1="26" x2="48" y2="176" stroke="var(--text-muted)" stroke-width="1.1" marker-start="url(#mp-arrow)" marker-end="url(#mp-arrow)"/>
      <text x="42" y="108" text-anchor="end" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">SSD</text>
    `;
    return this._svgShell('0 0 500 260', '', body);
  },

  drawFieldMatching(params) {
    const l1 = params.l1 || 20;
    const l2 = params.l2 || 20;
    const d = params.d || 10;

    const body = `
      <!-- 左射源 & 右射源 -->
      <circle cx="145" cy="24" r="4.5" fill="var(--warning)"/>
      <text x="145" y="15" text-anchor="middle" fill="var(--text-main)" font-size="10">Source 1 (L₁=${l1}cm)</text>
      <circle cx="355" cy="24" r="4.5" fill="var(--warning)"/>
      <text x="355" y="15" text-anchor="middle" fill="var(--text-main)" font-size="10">Source 2 (L₂=${l2}cm)</text>

      <!-- 射束中心軸 -->
      <line x1="145" y1="24" x2="145" y2="235" stroke="var(--text-dark)" stroke-dasharray="3 3"/>
      <line x1="355" y1="24" x2="355" y2="235" stroke="var(--text-dark)" stroke-dasharray="3 3"/>

      <!-- 兩個發散照野 -->
      <polygon points="145,24 65,235 250,235" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="1.4"/>
      <polygon points="355,24 250,235 435,235" fill="rgba(76, 195, 138, 0.1)" stroke="var(--success)" stroke-width="1.4"/>

      <!-- 皮膚表面與 Gap -->
      <line x1="40" y1="168" x2="460" y2="168" stroke="var(--border-strong)" stroke-width="1.5"/>
      <text x="46" y="160" fill="var(--text-muted)" font-size="10">皮膚表面</text>

      <!-- Gap 標示段 -->
      <line x1="216" y1="168" x2="284" y2="168" stroke="var(--danger)" stroke-width="3.5"/>
      <text x="250" y="158" text-anchor="middle" fill="var(--danger)" font-size="10.5" font-weight="600" font-family="var(--font-mono)">Gap ΔG</text>

      <!-- 相交深度 d -->
      <line x1="40" y1="235" x2="460" y2="235" stroke="var(--warning)" stroke-dasharray="4 3" stroke-width="1.3"/>
      <circle cx="250" cy="235" r="4" fill="var(--warning)"/>
      <text x="250" y="252" text-anchor="middle" fill="var(--warning)" font-size="10.5">照野交會點 (深度 d = ${d} cm)</text>
    `;
    return this._svgShell('0 0 500 265', '', body);
  },

  drawTG43Geometry(params) {
    const L = params.L || 3.0;
    const body = `
      <!-- 坐標軸 -->
      <line x1="90" y1="190" x2="420" y2="190" stroke="var(--border-strong)" stroke-width="1.3"/>
      <line x1="200" y1="230" x2="200" y2="30" stroke="var(--border-strong)" stroke-width="1.3"/>

      <!-- 活性線射源 L -->
      <line x1="145" y1="190" x2="255" y2="190" stroke="var(--warning)" stroke-width="6" stroke-linecap="round"/>
      <text x="200" y="210" text-anchor="middle" fill="var(--warning)" font-size="10.5" font-family="var(--font-mono)">Active Length L = ${L} cm</text>

      <!-- 任意點 P(r, θ) -->
      <circle cx="335" cy="75" r="4.5" fill="var(--accent)"/>
      <text x="345" y="75" fill="var(--accent)" font-size="11" font-weight="600" font-family="var(--font-mono)">P(r, θ)</text>

      <!-- 中心距離 r 與兩端連線 -->
      <line x1="200" y1="190" x2="335" y2="75" stroke="var(--accent)" stroke-width="2"/>
      <text x="256" y="122" fill="var(--accent)" font-size="11" font-family="var(--font-mono)">r</text>
      <line x1="145" y1="190" x2="335" y2="75" stroke="var(--text-muted)" stroke-width="1.2" stroke-dasharray="4 3"/>
      <line x1="255" y1="190" x2="335" y2="75" stroke="var(--text-muted)" stroke-width="1.2" stroke-dasharray="4 3"/>

      <!-- 夾角 θ 與 β 弧線標註 -->
      <path d="M 235 190 A 35 35 0 0 0 226 168" fill="none" stroke="var(--success)" stroke-width="1.6"/>
      <text x="242" y="178" fill="var(--success)" font-size="11" font-family="var(--font-mono)">θ</text>
      <path d="M 304 101 A 40 40 0 0 0 315 110" fill="none" stroke="var(--warning)" stroke-width="1.6"/>
      <text x="292" y="114" fill="var(--warning)" font-size="11" font-family="var(--font-mono)">β</text>

      <!-- 參考點 P(r0, θ0) -->
      <circle cx="200" cy="115" r="3.5" fill="var(--success)"/>
      <text x="190" y="110" text-anchor="end" fill="var(--success)" font-size="10" font-family="var(--font-mono)">P₀(1cm, 90°)</text>
    `;
    return this._svgShell('0 0 500 245', '', body);
  },

  drawInhomogeneitySlab(params) {
    const body = `
      <!-- 入射射束 -->
      <line x1="35" y1="120" x2="88" y2="120" stroke="var(--accent)" stroke-width="3" marker-end="url(#mp-arrow-accent)"/>
      <text x="20" y="102" fill="var(--accent)" font-size="10.5" font-weight="600">MV 光子射束</text>

      <!-- 水 - 肺 - 骨 - 水 層狀假體 -->
      <rect x="95" y="45" width="75" height="150" fill="rgba(56, 189, 248, 0.08)" stroke="var(--border-strong)"/>
      <text x="132" y="65" text-anchor="middle" fill="var(--text-main)" font-size="10.5">水 / 軟組織</text>
      <text x="132" y="80" text-anchor="middle" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">ρ = 1.0</text>

      <rect x="170" y="45" width="110" height="150" fill="rgba(245, 158, 11, 0.08)" stroke="var(--warning)" stroke-dasharray="4 3"/>
      <text x="225" y="65" text-anchor="middle" fill="var(--warning)" font-size="10.5">肺組織 (Lung)</text>
      <text x="225" y="80" text-anchor="middle" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">${params.lungDensity || 'ρ ≈ 0.25'}</text>

      <rect x="280" y="45" width="60" height="150" fill="rgba(238, 240, 245, 0.14)" stroke="var(--text-main)"/>
      <text x="310" y="65" text-anchor="middle" fill="var(--text-main)" font-size="10.5">皮質骨</text>
      <text x="310" y="80" text-anchor="middle" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">${params.boneDensity || 'ρ ≈ 1.85'}</text>

      <rect x="340" y="45" width="120" height="150" fill="rgba(56, 189, 248, 0.08)" stroke="var(--border-strong)"/>
      <text x="400" y="65" text-anchor="middle" fill="var(--text-main)" font-size="10.5">水 / 遠端組織</text>

      <!-- 相對劑量變化示意曲線 -->
      <path d="M 95 155 Q 130 130 170 138 L 195 156 L 280 144 L 300 134 L 340 158 L 460 174" fill="none" stroke="var(--accent)" stroke-width="2.4"/>
      <text x="225" y="182" text-anchor="middle" fill="var(--danger)" font-size="9.5">側向電子失衡區 (劑量下降)</text>
      <text x="310" y="122" text-anchor="middle" fill="var(--success)" font-size="9.5">界面背散射↑</text>
    `;
    return this._svgShell('0 0 500 220', '', body);
  },

  drawLinacHead() {
    const body = `
      <!-- 左半邊：光子模式，右半邊：電子模式 -->
      <line x1="250" y1="15" x2="250" y2="245" stroke="var(--border-strong)" stroke-dasharray="4 4"/>
      <text x="130" y="24" text-anchor="middle" fill="var(--accent)" font-size="11.5" font-weight="600">光子模式 (Photon Mode)</text>
      <text x="370" y="24" text-anchor="middle" fill="var(--success)" font-size="11.5" font-weight="600">電子模式 (Electron Mode)</text>

      <!-- 電子槍射束 -->
      <line x1="130" y1="34" x2="130" y2="54" stroke="var(--warning)" stroke-width="2.5" marker-end="url(#mp-arrow)"/>
      <line x1="370" y1="34" x2="370" y2="95" stroke="var(--warning)" stroke-width="2.5" marker-end="url(#mp-arrow)"/>

      <!-- 靶 (僅光子) -->
      <rect x="108" y="58" width="44" height="10" fill="var(--warning)"/>
      <text x="160" y="67" fill="var(--text-main)" font-size="10">X-ray Target</text>

      <!-- 主準直儀 -->
      <polygon points="90,78 115,78 106,105 90,105" fill="var(--bg-raised)" stroke="var(--border-strong)"/>
      <polygon points="170,78 145,78 154,105 170,105" fill="var(--bg-raised)" stroke="var(--border-strong)"/>

      <!-- Flattening Filter vs Scattering Foil -->
      <polygon points="130,108 110,126 150,126" fill="var(--accent)" opacity="0.8"/>
      <text x="156" y="122" fill="var(--accent)" font-size="10">Flattening Filter</text>

      <line x1="345" y1="106" x2="395" y2="106" stroke="var(--success)" stroke-width="3"/>
      <text x="402" y="110" fill="var(--success)" font-size="10">Scattering Foil</text>

      <!-- Monitor Ion Chamber -->
      <rect x="95" y="142" width="70" height="10" fill="none" stroke="var(--text-main)" stroke-width="1.3"/>
      <text x="172" y="151" fill="var(--text-muted)" font-size="9.5">Ion Chamber</text>
      <rect x="335" y="142" width="70" height="10" fill="none" stroke="var(--text-main)" stroke-width="1.3"/>

      <!-- Jaws & Electron Cone -->
      <rect x="85" y="172" width="28" height="14" fill="var(--bg-raised)" stroke="var(--border-strong)"/>
      <rect x="147" y="172" width="28" height="14" fill="var(--bg-raised)" stroke="var(--border-strong)"/>
      <text x="130" y="205" text-anchor="middle" fill="var(--text-muted)" font-size="10">Jaws + MLC</text>

      <path d="M 342 172 L 332 225 M 398 172 L 408 225" stroke="var(--success)" stroke-width="2.5"/>
      <text x="370" y="238" text-anchor="middle" fill="var(--success)" font-size="10">Electron Applicator</text>
    `;
    return this._svgShell('0 0 500 255', '', body);
  }
};
