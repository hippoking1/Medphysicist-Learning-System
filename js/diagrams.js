/**
 * 醫學物理師考照自學系統 - 確定性醫學物理繪圖引擎 (js/diagrams.js)
 * 包含：
 * 1. PhysicsPlotter: 以真實物理公式取樣 200 點渲染高精度 SVG 曲線 (PDD / Profile / LQ / Decay / HVL)
 * 2. ClinicalBlueprints: 工程製圖級標準臨床幾何藍圖 (TG-51 / 半影 / 照野銜接 / TG-43 / 不均勻界面 / 機頭)
 * 3. 雙主題自適應 (Ink Dark & Warm Paper) 與舊式行內 SVG 色彩正規化
 */

const Diagrams = {
  /**
   * 16 種標準確定性醫學物理圖表目錄 (供 NotebookLM 標記、關鍵字自動配圖與手動插入選單共用)
   */
  DIAGRAM_CATALOG: {
    interaction_z_e: {
      title: '光子與物質交互作用相對優勢圖 (原子序 Z vs. 光子能量 hν)',
      caption: '低能高 Z 以光電效應 (τ ∝ Z³/E³) 為主；臨床 MV 治療能量 (0.5–10 MeV) 在軟組織 (Z≈7.4) 以康普吞散射 (σ) 為主；E ≥ 1.022 MeV 發生設定成對產生 (κ ∝ Z²)。',
      keywords: ['光電效應', '康普吞', '成對產生', 'photoelectric', 'compton', 'pair production'],
      spec: { type: 'interaction_z_e', params: {} }
    },
    attenuation: {
      title: '窄射束與寬射束 HVL 衰減與射束硬化 (Beam Hardening)',
      caption: '單能窄射束符合指數衰減 I = I₀·e^(-μx)；寬射束含散射增建因子 B > 1，多能譜射束穿透後 HVL₂ > HVL₁。',
      keywords: ['半值層', 'HVL', 'TVL', '窄射束', '寬射束', '射束硬化'],
      spec: { type: 'attenuation', params: { hvl1: 3.0, showBroadBeam: true } }
    },
    linac_head: {
      title: '醫療用直線加速器機頭構造 (光子模式 vs. 電子模式)',
      caption: '光子模式經 X-ray Target 與 Flattening Filter；電子模式移開靶與整平濾器，改以 Scattering Foil 與 Electron Applicator 展寬射束。',
      keywords: ['整平濾器', '散射箔', 'flattening filter', 'scattering foil', '機頭'],
      spec: { type: 'linac_head', params: {} }
    },
    decay: {
      title: '放射性核種母子核衰變平衡曲線 (Transient vs. Secular Equilibrium)',
      caption: '瞬態平衡 (⁹⁹Mo → ⁹⁹ᵐTc, T₁ > T₂) 子核活度於 t_max 達最高峰；永恆平衡 (T₁ ≫ T₂) 子母核活度趨於相等。',
      keywords: ['瞬態平衡', '永恆平衡', '半衰期', 'secular', 'transient', '衰變常數'],
      spec: { type: 'decay', params: { t1: 66, t2: 6 } }
    },
    pdd: {
      title: '百分深度劑量曲線 (PDD：光子 / 電子 / 質子 Bragg Peak & SOBP)',
      caption: '高能光子具皮膚免除與建成區 (d_max)；電子具明確實務射程 Rp 與制動輻射尾；質子具尖銳 Bragg Peak 與臨床展寬峰 SOBP。',
      keywords: ['PDD', '百分深度劑量', 'dmax', '建成區', 'Bragg Peak', 'SOBP', 'Rp'],
      spec: { type: 'pdd', params: { curves: ['photon_6mv', 'photon_18mv', 'electron_12mev'] } }
    },
    tg51_setup: {
      title: 'AAPM TG-51 / IAEA TRS-398 水中吸收劑量參考校正幾何',
      caption: '於水假體參考深度 d_ref = 10 cm 量測，圓柱型游離腔在光子射束之有效量測點 P_eff 位於腔心上游 0.6 r_cav (TG-51) 或 0.5 r_cav (TRS-398)。',
      keywords: ['TG-51', 'TG51', 'TRS-398', 'TRS398', '有效量測點', 'kQ', '參考深度'],
      spec: { type: 'tg51_setup', params: { setup: 'SSD', dref: 10, field: '10×10 cm²' } }
    },
    inhomogeneity_slab: {
      title: '組織不均勻界面效應 (水 → 肺 → 骨 → 水)',
      caption: '低密度肺組織減少光子衰減但引發側向二次電子失衡；高密度皮質骨界面產生背向散射峰值與遠端遮蔽衰減。',
      keywords: ['不均勻', 'inhomogeneity', '肺組織', '電子失衡', 'ETAR'],
      spec: { type: 'inhomogeneity_slab', params: {} }
    },
    profile: {
      title: '離軸劑量剖面比較 (Flattening Filter vs. FFF 無整平濾器)',
      caption: 'FF 射束具平坦區與邊緣 Horns，50% 劑量點定義幾何照野寬度，80%–20% 定義物理半影；FFF 射束中心劑量率高且照野外散射低。',
      keywords: ['離軸', 'profile', 'FFF', '平坦度', '對稱性', 'horns'],
      spec: { type: 'profile', params: { showFFF: true, fieldSize: 10 } }
    },
    geometric_penumbra: {
      title: '幾何半影 (Geometric Penumbra) 相似三角形推導',
      caption: 'Pg = s × (SSD + d - SCD) / SCD；縮小射源尺寸 s 或增加準直儀距離 SCD 可減小半影寬度。',
      keywords: ['幾何半影', 'penumbra', 'SCD', 'MLC', '半影'],
      spec: { type: 'geometric_penumbra', params: { s: 2, scd: 50, ssd: 100, d: 10 } }
    },
    gamma_index: {
      title: 'IMRT 劑量驗證 Gamma Index (ΔD / DTA) 二維橢圓判定準則',
      caption: '結合劑量差 ΔD (通常 3%) 與吻合距離 DTA (通常 3 mm) 構成正規化橢圓，γ ≤ 1 代表該點通過驗證。',
      keywords: ['Gamma', 'DTA', 'IMRT', 'TG-119', 'TG-120', '劑量驗證'],
      spec: { type: 'gamma_index', params: { dd: '3%', dta: '3 mm' } }
    },
    tg43_geometry: {
      title: 'AAPM TG-43 近接治療線射源極座標幾何系統',
      caption: '以活性長度 L、距離 r、極角 θ 與端點張角 β 計算幾何因子 G_L(r, θ)，參考點定義於 P(r₀=1 cm, θ₀=90°)。',
      keywords: ['TG-43', 'TG43', '近接治療', '後裝', '幾何因子', 'Ir-192'],
      spec: { type: 'tg43_geometry', params: { L: 3.5 } }
    },
    field_matching: {
      title: '相鄰照野發散銜接與表面間隙 (Gap) 幾何計算',
      caption: '表面間隙 ΔG = ½·L₁·(d/SSD₁) + ½·L₂·(d/SSD₂)，避免相鄰發散射束在目標深度 d 上方重疊造成熱點 (Hot spot)。',
      keywords: ['照野銜接', 'gap', '發散', 'TBI', '鶴脊照射'],
      spec: { type: 'field_matching', params: { l1: 20, l2: 20, d: 10 } }
    },
    ctdi_phantom: {
      title: 'CT 輻射劑量指標 (CTDI₁₀₀ / CTDIw) 標準 PMMA 假體五孔配置',
      caption: '頭部假體直徑 16 cm、體部假體直徑 32 cm；加權指標 CTDIw = ⅓ CTDI₁₀₀(center) + ⅔ CTDI₁₀₀(periphery)，CTDIvol = CTDIw / Pitch。',
      keywords: ['CTDI', 'DLP', 'Pitch', '電腦斷層', '假體'],
      spec: { type: 'ctdi_phantom', params: {} }
    },
    lq_survival: {
      title: 'Linear-Quadratic (LQ) 細胞存活半對數曲線 (低 LET vs. 高 LET)',
      caption: 'S(D) = exp(-αD - βD²)；腫瘤/早反應組織 α/β 高 (~10 Gy)，晚反應正常組織 α/β 低 (~3 Gy) 對分次劑量變化更敏感。',
      keywords: ['LQ', '存活曲線', 'α/β', 'alpha/beta', 'LET', 'BED', 'EQD2'],
      spec: { type: 'lq_survival', params: {} }
    },
    tcp_ntcp: {
      title: '腫瘤控制機率 (TCP) 與正常組織併發症機率 (NTCP) 治療視窗',
      caption: '兩條 S 型劑量反應曲線間距愈寬，治療指數 (Therapeutic Ratio) 與治療視窗愈佳；危及器官劑量限制參照 QUANTEC。',
      keywords: ['TCP', 'NTCP', '治療視窗', 'QUANTEC', 'OAR', 'OER'],
      spec: { type: 'tcp_ntcp', params: {} }
    },
    dicom_rt_flow: {
      title: 'DICOM-RT 四大核心物件與臨床放療資訊流 (PACS / TPS / OIS)',
      caption: 'CT/MR 影像經圈選產出 RT Structure Set，於 TPS 計算產出 RT Plan 與 RT Dose，最終傳送至 OIS 與加速器執行治療。',
      keywords: ['DICOM', 'PACS', 'RT Plan', 'RT Struct', 'RT Dose', 'HL7'],
      spec: { type: 'dicom_rt_flow', params: {} }
    }
  },

  /**
   * 課綱核心單元內建標準圖解對照表 (涵蓋 M1 ~ M10)
   */
  UNIT_DIAGRAMS: {
    'U1.1.1': [
      {
        title: '光子與物質交互作用相對優勢圖 (Z vs. hν)',
        caption: '低能高 Z 以光電效應 (τ ∝ Z³/E³) 為主；臨床 MV 射束於軟組織以康普吞效應 (σ) 為主；E ≥ 1.022 MeV 發生成對產生 (κ)。',
        spec: { type: 'interaction_z_e', params: {} }
      }
    ],
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
    'U3.2.2': [
      {
        title: 'IMRT 劑量驗證 Gamma Index (ΔD / DTA) 判定準則',
        caption: '結合劑量差 ΔD (3%) 與距離吻合度 DTA (3 mm) 構成橢圓判定標準，γ ≤ 1 代表通過驗證。',
        spec: { type: 'gamma_index', params: { dd: '3%', dta: '3 mm' } }
      }
    ],
    'U4.1.1': [
      {
        title: '小照野與立體定位幾何半影控制',
        caption: 'SRS 小照野對幾何半影與側向電子失衡極度敏感，常藉助微型 MLC 或圓錐準直儀 (Cone) 提高 SCD 降低半影。',
        spec: { type: 'geometric_penumbra', params: { s: 1.5, scd: 65, ssd: 100, d: 8 } }
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
    'U5.1.2': [
      {
        title: 'TG-142 直線加速器光束平坦度與對稱性品管剖面',
        caption: '依據 TG-142 規範監控光子與電子射束剖面平坦度、對稱性變化與照野邊界準確度。',
        spec: { type: 'profile', params: { showFFF: true, fieldSize: 10 } }
      }
    ],
    'U5.2.1': [
      {
        title: 'IMRT QA Gamma Index 二維劑量與距離複合分析',
        caption: '臨床常用 3%/3mm 或 2%/2mm 評估計算劑量與實測劑量分佈吻合度，要求通過率 (γ ≤ 1) 達 95% 以上。',
        spec: { type: 'gamma_index', params: { dd: '3%', dta: '3 mm' } }
      }
    ],
    'U6.2.2': [
      {
        title: 'CT 劑量指標 (CTDI₁₀₀ / CTDIw) 標準假體五孔量測配置',
        caption: '使用 100 mm 鉛筆型游離腔量測中心孔 (c) 與外圍 1 cm 處四孔 (p)，CTDIw = ⅓ CTDIc + ⅔ CTDIp。',
        spec: { type: 'ctdi_phantom', params: {} }
      }
    ],
    'U7.1.1': [
      {
        title: 'NCRP-147 屏蔽厚度與寬射束衰減關係',
        caption: '主屏蔽與次屏蔽設計結合工作負載 W、使用因數 U、佔用因數 T 與寬射束半值層/十值層衰減曲線。',
        spec: { type: 'attenuation', params: { hvl1: 2.8, showBroadBeam: true } }
      }
    ],
    'U7.2.1': [
      {
        title: '輻射衰減與半值層 (HVL) / 十值層 (TVL) 指數關係',
        caption: '單能光子 I(x) = I₀·e^(-μx)；1 TVL ≈ 3.322 HVL；寬射束需乘入增建因子 B(μx)。',
        spec: { type: 'attenuation', params: { hvl1: 2.5, showBroadBeam: true } }
      }
    ],
    'U8.2.1': [
      {
        title: 'TCP 腫瘤控制率與 NTCP 正常組織併發症治療視窗',
        caption: '臨床放療處方設計旨在最大化 TCP 並將危及器官 (OAR) 劑量控制在 QUANTEC 容許之 NTCP 安全上限內。',
        spec: { type: 'tcp_ntcp', params: {} }
      }
    ],
    'U9.1.1': [
      {
        title: 'Linear-Quadratic (LQ) 細胞存活曲線 (低 LET vs. 高 LET)',
        caption: '低 LET (X/γ 光子) 具明顯肩區 (Shoulder)，S = exp(-αD - βD²)；高 LET (α/中子) 呈直線，OER 與修復能力大幅降低。',
        spec: { type: 'lq_survival', params: { alphaBetaLow: 10, alphaBetaLate: 3 } }
      }
    ],
    'U9.1.2': [
      {
        title: '早反應組織 (α/β≈10) 與晚反應組織 (α/β≈3) 存活曲線比較',
        caption: '晚反應正常組織 β 權重大、曲線彎曲明顯，分次照射可顯著保護晚反應組織。',
        spec: { type: 'lq_survival', params: { alphaBetaLow: 10, alphaBetaLate: 3 } }
      }
    ],
    'U9.2.1': [
      {
        title: '腫瘤控制機率 (TCP) 與正常組織併發症 (NTCP) 劑量反應曲線',
        caption: '利用增氧劑或分次治療將 TCP 曲線左移、NTCP 曲線右移以擴大治療視窗。',
        spec: { type: 'tcp_ntcp', params: {} }
      }
    ],
    'U10.1.2': [
      {
        title: 'DICOM-RT 四大核心物件與臨床放療資訊傳輸架構',
        caption: '涵蓋 CT/MR 影像、RT Structure Set (靶區與 OAR 輪廓)、RT Plan (射束與 MLC 參數) 及 RT Dose (三維劑量矩陣)。',
        spec: { type: 'dicom_rt_flow', params: {} }
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
      case 'interaction_z_e':
        return this.plotInteractionZE(p);
      case 'gamma_index':
        return this.drawGammaIndex(p);
      case 'ctdi_phantom':
        return this.drawCTDIPhantom(p);
      case 'tcp_ntcp':
        return this.plotTCPNTCP(p);
      case 'dicom_rt_flow':
        return this.drawDicomRTFlow(p);
      default:
        return '';
    }
  },

  /**
   * 0-Token 公式保護型 Markdown + 圖表標記渲染器 (專為 NotebookLM 複製貼上設計)
   */
  formatStudyGuide(rawText, unitId = '') {
    if (!rawText || !rawText.trim()) return '';
    let text = rawText.replace(/\r\n/g, '\n').trim();

    // 1. 保護 LaTeX 公式 ($$...$$, \[...\], \(...\), $...$) 避免底線 _ 與星號 * 被 Markdown 破壞
    const mathTokens = [];
    const saveMath = (m) => {
      const id = `@@MP_MATH_${mathTokens.length}@@`;
      mathTokens.push(m);
      return id;
    };
    text = text.replace(/\$\$[\s\S]*?\$\$/g, saveMath);
    text = text.replace(/\\\[[\s\S]*?\\\]/g, saveMath);
    text = text.replace(/\\\([\s\S]*?\\\)/g, saveMath);
    text = text.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, saveMath);

    // 2. 解析純文字圖表標記 [[DIAGRAM:type]] 或 [[DIAGRAM:type|k=v]]
    let injectedDiagramCount = 0;
    const renderDiagramCard = (typeKey, customTitle, customCaption, customParams) => {
      const cat = this.DIAGRAM_CATALOG[typeKey];
      if (!cat) return '';
      injectedDiagramCount++;
      const spec = {
        type: typeKey,
        params: { ...(cat.spec.params || {}), ...(customParams || {}) }
      };
      return `<div class="mp-diagram-block"><div class="mp-diagram-title">${customTitle || cat.title}</div><div class="mp-diagram">${this.renderSpec(spec)}</div><div class="mp-diagram-caption">${customCaption || cat.caption}</div></div>`;
    };

    const diagramTokens = [];
    text = text.replace(/`?\*{0,2}\[\[\s*DIAGRAM\s*:\s*([a-zA-Z0-9_-]+)(?:\|([^\]]+))?\s*\]\]\*{0,2}`?/gi, (_, rawType, rawParams) => {
      const typeKey = rawType.trim().toLowerCase();
      const params = {};
      if (rawParams) {
        rawParams.split(',').forEach((kv) => {
          const [k, v] = kv.split('=').map((s) => (s || '').trim());
          if (k && v !== undefined) params[k] = isNaN(Number(v)) ? v : Number(v);
        });
      }
      const html = renderDiagramCard(typeKey, null, null, params);
      if (!html) return '';
      const tok = `@@MP_DIAG_${diagramTokens.length}@@`;
      diagramTokens.push(html);
      return `\n${tok}\n`;
    });

    if (text.includes('class="mp-diagram"') || text.includes('<svg')) {
      injectedDiagramCount++;
    }

    // 3. 若內容主要是 Markdown (而非純 HTML)，執行結構化 Markdown -> HTML 轉換
    const looksLikeHtml = /<(h[1-4]|table|ul|ol|p|div)\b/i.test(text) && !/^#{1,4}\s/m.test(text);
    let htmlOut = text;

    if (!looksLikeHtml) {
      const formatInline = (str) =>
        str
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/`([^`]+)`/g, '<code>$1</code>');

      const lines = text.split('\n');
      const out = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i].trimEnd();
        const trimmed = line.trim();

        if (!trimmed) {
          i++;
          continue;
        }

        // 圖表佔位符直接輸出
        if (/^@@MP_DIAG_\d+@@$/.test(trimmed)) {
          out.push(trimmed);
          i++;
          continue;
        }

        // Fenced Code Block ```
        if (trimmed.startsWith('```')) {
          const codeLines = [];
          i++;
          while (i < lines.length && !lines[i].trim().startsWith('```')) {
            codeLines.push(lines[i]);
            i++;
          }
          i++;
          out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
          continue;
        }

        // Markdown 表格 (| col | col |)
        if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-|\s:]*/.test(lines[i + 1])) {
          const parseRow = (r) =>
            r
              .trim()
              .replace(/^\|/, '')
              .replace(/\|$/, '')
              .split('|')
              .map((c) => formatInline(c.trim()));

          const headers = parseRow(trimmed);
          i += 2; // 跳過表頭與分隔線
          const bodyRows = [];
          while (i < lines.length && lines[i].trim().startsWith('|')) {
            bodyRows.push(parseRow(lines[i]));
            i++;
          }
          const thHtml = headers.map((h) => `<th>${h}</th>`).join('');
          const tbHtml = bodyRows
            .map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`)
            .join('');
          out.push(`<table><thead><tr>${thHtml}</tr></thead><tbody>${tbHtml}</tbody></table>`);
          continue;
        }

        // 標題 (# ~ ####)
        const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
        if (hMatch) {
          const level = hMatch[1].length <= 3 ? 'h3' : 'h4';
          out.push(`<${level}>${formatInline(hMatch[2].trim())}</${level}>`);
          i++;
          continue;
        }

        // 水平分隔線
        if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
          out.push('<hr style="border: none; border-top: 1px solid var(--border-color); margin: 14px 0;">');
          i++;
          continue;
        }

        // 引用區塊 (> ...)
        if (trimmed.startsWith('>')) {
          const quoteLines = [];
          while (i < lines.length && lines[i].trim().startsWith('>')) {
            quoteLines.push(formatInline(lines[i].trim().replace(/^>\s?/, '')));
            i++;
          }
          out.push(`<div class="unit-notes-box">${quoteLines.join('<br>')}</div>`);
          continue;
        }

        // 無序清單 (- / * / •)
        if (/^([-*•])\s+/.test(trimmed)) {
          const items = [];
          while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) {
            items.push(`<li>${formatInline(lines[i].trim().replace(/^([-*•])\s+/, ''))}</li>`);
            i++;
          }
          out.push(`<ul>${items.join('')}</ul>`);
          continue;
        }

        // 有序清單 (1. )
        if (/^\d+[.)]\s+/.test(trimmed)) {
          const items = [];
          while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
            items.push(`<li>${formatInline(lines[i].trim().replace(/^\d+[.)]\s+/, ''))}</li>`);
            i++;
          }
          out.push(`<ol>${items.join('')}</ol>`);
          continue;
        }

        // 若該行已是 HTML 區塊標籤則直接保留
        if (/^<(h[1-6]|div|table|ul|ol|p|blockquote|hr)/i.test(trimmed)) {
          out.push(line);
          i++;
          continue;
        }

        // 一般段落
        out.push(`<p>${formatInline(trimmed)}</p>`);
        i++;
      }

      htmlOut = out.join('\n');
    }

    // 4. 還原圖表佔位符
    diagramTokens.forEach((diagHtml, idx) => {
      htmlOut = htmlOut.replace(`@@MP_DIAG_${idx}@@`, diagHtml);
    });

    // 5. 保底自動配圖：若貼上的內容完全未帶 [[DIAGRAM:...]] 標記，自動根據單元 ID 與內文關鍵字補上對應標準物理圖解
    if (injectedDiagramCount === 0) {
      const autoBlocks = [];
      const addedTypes = new Set();

      const unitList = (unitId && this.UNIT_DIAGRAMS[unitId]) || [];
      unitList.forEach((item) => {
        if (!addedTypes.has(item.spec.type)) {
          addedTypes.add(item.spec.type);
          autoBlocks.push(
            `<div class="mp-diagram-block"><div class="mp-diagram-title">${item.title}</div><div class="mp-diagram">${this.renderSpec(item.spec)}</div><div class="mp-diagram-caption">${item.caption}</div></div>`
          );
        }
      });

      const lowerRaw = rawText.toLowerCase();
      for (const [typeKey, cat] of Object.entries(this.DIAGRAM_CATALOG)) {
        if (addedTypes.has(typeKey) || autoBlocks.length >= 2) continue;
        if (cat.keywords.some((kw) => lowerRaw.includes(kw.toLowerCase()))) {
          addedTypes.add(typeKey);
          autoBlocks.push(renderDiagramCard(typeKey));
        }
      }

      if (autoBlocks.length > 0) {
        htmlOut += `\n<h3>標準醫學物理圖解對照</h3>\n${autoBlocks.join('\n')}`;
      }
    }

    // 6. 還原保護的 LaTeX 數學公式
    mathTokens.forEach((mathStr, idx) => {
      htmlOut = htmlOut.replace(`@@MP_MATH_${idx}@@`, () => mathStr);
    });

    return htmlOut;
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
  },

  // ==========================================
  // 3. 新增 M1 / M5 / M6 / M8 / M9 / M10 核心物理圖表
  // ==========================================
  plotInteractionZE() {
    const pad = { top: 28, right: 24, bottom: 44, left: 54 };
    const w = 520;
    const h = 265;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const xTicks = [
      { val: -2, label: '0.01' },
      { val: -1, label: '0.1' },
      { val: 0, label: '1' },
      { val: 1, label: '10' },
      { val: 2, label: '100' }
    ];
    const yTicks = [20, 40, 60, 80, 100].map((v) => ({ val: v, label: `${v}` }));
    const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '光子能量 Photon Energy hν (MeV, log)', '吸收體原子序 Atomic Number Z', xTicks, yTicks, [-2, 2], [0, 105]);

    // τ = σ 分界線 (左線) 與 σ = κ 分界線 (右線, E > 1.022 MeV)
    const leftBound = (logE) => Math.min(100, Math.max(4, 52 * Math.pow(10, 0.72 * (logE + 0.65))));
    const rightBound = (logE) => Math.min(100, Math.max(6, 95 - 52 * (logE - 0.35)));

    let body = grid;
    body += `<path d="${this._samplePath(leftBound, -1.7, 0.05, 80, xMap, yMap)}" fill="none" stroke="var(--accent)" stroke-width="2.4"/>`;
    body += `<path d="${this._samplePath(rightBound, 0.35, 1.85, 80, xMap, yMap)}" fill="none" stroke="var(--warning)" stroke-width="2.4"/>`;

    // 軟組織 Z ≈ 7.4 參考線
    const zSoftY = yMap(7.4).toFixed(1);
    body += `<line x1="${pad.left}" y1="${zSoftY}" x2="${pad.left + plotW}" y2="${zSoftY}" stroke="var(--success)" stroke-dasharray="4 3" stroke-width="1.2"/>`;
    body += `<text x="${pad.left + plotW - 6}" y="${Number(zSoftY) - 5}" text-anchor="end" fill="var(--success)" font-size="9.5" font-family="var(--font-mono)">軟組織 Z_eff ≈ 7.4</text>`;

    body += `<text x="${xMap(-1.25)}" y="${yMap(65)}" text-anchor="middle" fill="var(--accent)" font-size="11.5" font-weight="600">光電效應優勢區</text>`;
    body += `<text x="${xMap(-1.25)}" y="${yMap(55)}" text-anchor="middle" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">τ/ρ ∝ Z³ / E³</text>`;

    body += `<text x="${xMap(0.05)}" y="${yMap(45)}" text-anchor="middle" fill="var(--text-main)" font-size="11.5" font-weight="600">康普吞散射優勢區</text>`;
    body += `<text x="${xMap(0.05)}" y="${yMap(35)}" text-anchor="middle" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">σ/ρ 與 Z 無關 (∝ 전자密度)</text>`;

    body += `<text x="${xMap(1.38)}" y="${yMap(68)}" text-anchor="middle" fill="var(--warning)" font-size="11.5" font-weight="600">成對產生優勢區</text>`;
    body += `<text x="${xMap(1.38)}" y="${yMap(58)}" text-anchor="middle" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">κ/ρ ∝ Z (閾值 1.022 MeV)</text>`;

    return this._svgShell(`0 0 ${w} ${h}`, '', body);
  },

  drawGammaIndex(params) {
    const dd = params.dd || '3%';
    const dta = params.dta || '3 mm';
    const body = `
      <!-- 坐標軸 -->
      <line x1="70" y1="135" x2="430" y2="135" stroke="var(--border-strong)" stroke-width="1.4" marker-end="url(#mp-arrow)"/>
      <line x1="250" y1="230" x2="250" y2="25" stroke="var(--border-strong)" stroke-width="1.4" marker-end="url(#mp-arrow)"/>
      <text x="435" y="139" fill="var(--text-main)" font-size="10.5" font-weight="500">空間距離差 Δr (mm)</text>
      <text x="250" y="16" text-anchor="middle" fill="var(--text-main)" font-size="10.5" font-weight="500">劑量差 ΔD (%)</text>

      <!-- γ = 1 判定橢圓 -->
      <ellipse cx="250" cy="135" rx="125" ry="78" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="2.2"/>
      <text x="250" y="198" text-anchor="middle" fill="var(--accent)" font-size="10.5" font-family="var(--font-mono)">γ = √[(Δr/DTA)² + (ΔD/ΔD_tol)²] ≤ 1 (Pass)</text>

      <!-- 軸截距標註 -->
      <circle cx="375" cy="135" r="3.5" fill="var(--accent)"/>
      <text x="380" y="152" fill="var(--accent)" font-size="10" font-family="var(--font-mono)">+DTA (${dta})</text>
      <circle cx="125" cy="135" r="3.5" fill="var(--accent)"/>
      <text x="120" y="152" text-anchor="end" fill="var(--accent)" font-size="10" font-family="var(--font-mono)">-DTA</text>
      <circle cx="250" cy="57" r="3.5" fill="var(--accent)"/>
      <text x="260" y="54" fill="var(--accent)" font-size="10" font-family="var(--font-mono)">+ΔD_tol (${dd})</text>

      <!-- 通過點 vs 失敗點 -->
      <line x1="250" y1="135" x2="312" y2="95" stroke="var(--success)" stroke-width="1.8"/>
      <circle cx="312" cy="95" r="4" fill="var(--success)"/>
      <text x="320" y="94" fill="var(--success)" font-size="10" font-weight="600" font-family="var(--font-mono)">P₁ (γ = 0.72 ≤ 1 通過)</text>

      <line x1="250" y1="135" x2="388" y2="62" stroke="var(--danger)" stroke-width="1.6" stroke-dasharray="4 3"/>
      <circle cx="388" cy="62" r="4" fill="var(--danger)"/>
      <text x="395" y="60" fill="var(--danger)" font-size="10" font-weight="600" font-family="var(--font-mono)">P₂ (γ = 1.45 > 1 失敗)</text>
    `;
    return this._svgShell('0 0 500 245', '', body);
  },

  drawCTDIPhantom() {
    const body = `
      <!-- PMMA 圓柱假體截面 -->
      <circle cx="165" cy="128" r="92" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="2"/>
      <circle cx="165" cy="128" r="76" fill="none" stroke="var(--border-color)" stroke-dasharray="3 3"/>
      <text x="165" y="238" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="600">PMMA 圓柱假體 (Head 16cm / Body 32cm)</text>

      <!-- 中心孔 (Center) 與外圍 4 孔 (Periphery, 距表面 1 cm) -->
      <circle cx="165" cy="128" r="8" fill="var(--bg-primary)" stroke="var(--warning)" stroke-width="2.2"/>
      <text x="165" y="112" text-anchor="middle" fill="var(--warning)" font-size="10" font-family="var(--font-mono)">Center (c)</text>

      <circle cx="165" cy="52" r="7" fill="var(--bg-primary)" stroke="var(--success)" stroke-width="2"/>
      <text x="165" y="40" text-anchor="middle" fill="var(--success)" font-size="9.5" font-family="var(--font-mono)">12h (1cm deep)</text>
      <circle cx="241" cy="128" r="7" fill="var(--bg-primary)" stroke="var(--success)" stroke-width="2"/>
      <circle cx="165" cy="204" r="7" fill="var(--bg-primary)" stroke="var(--success)" stroke-width="2"/>
      <circle cx="89" cy="128" r="7" fill="var(--bg-primary)" stroke="var(--success)" stroke-width="2"/>

      <!-- 右側計算公式與定義 -->
      <rect x="285" y="42" width="195" height="172" rx="8" fill="var(--bg-secondary)" stroke="var(--border-strong)"/>
      <text x="300" y="68" fill="var(--accent)" font-size="11" font-weight="600">AAPM Report 96 關鍵公式</text>
      <text x="300" y="96" fill="var(--text-main)" font-size="10.5" font-family="var(--font-mono)">1. 100mm 鉛筆型游離腔積分</text>
      <text x="300" y="114" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">   CTDI₁₀₀ = (1 / N·T) ∫ D(z)dz</text>
      <text x="300" y="142" fill="var(--warning)" font-size="10.5" font-family="var(--font-mono)">2. 加權 CTDIw</text>
      <text x="300" y="160" fill="var(--text-main)" font-size="10" font-family="var(--font-mono)">   CTDIw = ⅓ CTDIc + ⅔ CTDIp</text>
      <text x="300" y="188" fill="var(--success)" font-size="10.5" font-family="var(--font-mono)">3. 體積 CTDIvol 與 DLP</text>
      <text x="300" y="204" fill="var(--text-main)" font-size="10" font-family="var(--font-mono)">   CTDIvol = CTDIw / Pitch</text>
    `;
    return this._svgShell('0 0 500 255', '', body);
  },

  plotTCPNTCP() {
    const pad = { top: 28, right: 24, bottom: 44, left: 54 };
    const w = 520;
    const h = 265;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const xTicks = [0, 20, 40, 60, 80, 100].map((v) => ({ val: v, label: `${v}` }));
    const yTicks = [0, 25, 50, 75, 100].map((v) => ({ val: v, label: `${v}%` }));
    const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '處方總劑量 Total Dose (Gy)', '反應機率 Probability (%)', xTicks, yTicks, [0, 100], [0, 105]);

    const tcpFn = (d) => 100 / (1 + Math.exp(-(d - 50) / 5.5));
    const ntcpFn = (d) => 100 / (1 + Math.exp(-(d - 75) / 5.5));

    let body = grid;
    body += `<path d="${this._samplePath(tcpFn, 0, 100, 160, xMap, yMap)}" fill="none" stroke="var(--success)" stroke-width="2.4"/>`;
    body += `<path d="${this._samplePath(ntcpFn, 0, 100, 160, xMap, yMap)}" fill="none" stroke="var(--danger)" stroke-width="2.4"/>`;

    // 治療視窗雙向箭頭
    const yMid = yMap(50).toFixed(1);
    const xTcp50 = xMap(50).toFixed(1);
    const xNtcp50 = xMap(75).toFixed(1);
    body += `<line x1="${xTcp50}" y1="${yMid}" x2="${xNtcp50}" y2="${yMid}" stroke="var(--accent)" stroke-width="1.6" marker-start="url(#mp-arrow-accent)" marker-end="url(#mp-arrow-accent)"/>`;
    body += `<text x="${xMap(62.5)}" y="${Number(yMid) - 8}" text-anchor="middle" fill="var(--accent)" font-size="10.5" font-weight="600">治療視窗 (Therapeutic Window)</text>`;

    body += `<text x="${xMap(36)}" y="${yMap(82)}" text-anchor="end" fill="var(--success)" font-size="11" font-weight="600">TCP (腫瘤控制率)</text>`;
    body += `<text x="${xMap(80)}" y="${yMap(30)}" fill="var(--danger)" font-size="11" font-weight="600">NTCP (正常組織併發症)</text>`;

    return this._svgShell(`0 0 ${w} ${h}`, '', body);
  },

  drawDicomRTFlow() {
    const body = `
      <!-- 1. CT / MR Sim -->
      <rect x="20" y="36" width="105" height="62" rx="8" fill="var(--bg-secondary)" stroke="var(--border-strong)"/>
      <text x="72" y="62" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="600">CT / MR Sim</text>
      <text x="72" y="80" text-anchor="middle" fill="var(--accent)" font-size="9.5" font-family="var(--font-mono)">DICOM Image</text>

      <line x1="125" y1="67" x2="152" y2="67" stroke="var(--text-muted)" stroke-width="1.5" marker-end="url(#mp-arrow)"/>

      <!-- 2. RT Struct -->
      <rect x="155" y="36" width="115" height="62" rx="8" fill="var(--bg-secondary)" stroke="var(--accent)"/>
      <text x="212" y="60" text-anchor="middle" fill="var(--accent)" font-size="11" font-weight="600">RT Structure Set</text>
      <text x="212" y="78" text-anchor="middle" fill="var(--text-muted)" font-size="9.5">GTV / PTV / OAR ROI</text>

      <line x1="270" y1="67" x2="297" y2="67" stroke="var(--text-muted)" stroke-width="1.5" marker-end="url(#mp-arrow)"/>

      <!-- 3. TPS: RT Plan & RT Dose -->
      <rect x="300" y="22" width="180" height="90" rx="8" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="1.6"/>
      <text x="390" y="42" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="600">治療計劃系統 (TPS)</text>
      <rect x="312" y="52" width="74" height="46" rx="6" fill="var(--bg-primary)" stroke="var(--warning)"/>
      <text x="349" y="72" text-anchor="middle" fill="var(--warning)" font-size="10" font-weight="600" font-family="var(--font-mono)">RT Plan</text>
      <text x="349" y="88" text-anchor="middle" fill="var(--text-muted)" font-size="8.5">Beams / MLC / MU</text>

      <rect x="394" y="52" width="74" height="46" rx="6" fill="var(--bg-primary)" stroke="var(--success)"/>
      <text x="431" y="72" text-anchor="middle" fill="var(--success)" font-size="10" font-weight="600" font-family="var(--font-mono)">RT Dose</text>
      <text x="431" y="88" text-anchor="middle" fill="var(--text-muted)" font-size="8.5">3D Dose Grid / DVH</text>

      <!-- 4. OIS & Linac / RT Treatment Record -->
      <line x1="390" y1="112" x2="390" y2="148" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#mp-arrow-accent)"/>
      <rect x="155" y="150" width="325" height="54" rx="8" fill="var(--bg-secondary)" stroke="var(--border-strong)"/>
      <text x="317" y="174" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="600">腫瘤資訊系統 (OIS) & 直線加速器 (Linac / EPID)</text>
      <text x="317" y="192" text-anchor="middle" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">RT Image (DRR / CBCT) + RT Treatment Record</text>
    `;
    return this._svgShell('0 0 500 220', '', body);
  }
};
