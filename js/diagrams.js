/**
 * 醫學物理師考照自學系統 - 互動式醫學物理模擬實驗室引擎與 SafeHTML 淨化器 (js/diagrams.js)
 * 涵蓋 16 種臨床與放射物理確定性公式模擬器 + DOM 白名單 XSS 防護層：
 * - SafeHTML：DOMParser 惰性解析 + 嚴格白名單節點重建，防範剪貼簿 / JSON / AI 回傳之 Stored & DOM XSS
 * - 即時參數滑桿 & 雙主題自適應 SVG 重繪
 * - 支援滑鼠/觸控十字探針讀數 (getScreenCTM) 與機件點擊檢視
 * - 相容 NotebookLM 0-Token [[DIAGRAM:type]] 標記與舊式 SVG 正規化
 */

const SafeHTML = {
  HTML_TAGS: new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'br', 'hr',
    'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'sub', 'sup', 'code', 'pre',
    'blockquote', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a'
  ]),
  SVG_TAGS: new Set([
    'svg', 'g', 'path', 'line', 'rect', 'circle', 'ellipse', 'polygon',
    'polyline', 'text', 'tspan', 'defs', 'marker', 'title'
  ]),
  DROP_WITH_CONTENT: new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'applet', 'form',
    'input', 'textarea', 'select', 'button', 'meta', 'link', 'base',
    'foreignobject', 'animate', 'animatetransform', 'set', 'use', 'image'
  ]),
  HTML_ATTRS: new Set(['class', 'title', 'colspan', 'rowspan', 'scope', 'dir', 'lang']),
  SVG_ATTRS: new Set([
    'viewbox', 'width', 'height', 'xmlns', 'role', 'class',
    'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'd', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray',
    'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity',
    'text-anchor', 'dominant-baseline', 'font-size', 'font-weight', 'font-family',
    'transform', 'id', 'refx', 'refy', 'markerwidth', 'markerheight', 'orient',
    'marker-end', 'marker-start'
  ]),

  escape(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  safeUrl(rawUrl, allowHash = false) {
    const val = String(rawUrl || '').trim();
    if (!val) return '';
    if (allowHash && val.startsWith('#')) return val;
    try {
      const parsed = new URL(val, 'https://example.invalid');
      if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
        return val;
      }
      if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
        return val;
      }
    } catch (e) {}
    return '';
  },

  _validateDiagramSpec(rawSpec) {
    try {
      const parsed = JSON.parse(rawSpec);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') return null;
      if (typeof Diagrams !== 'undefined' && Diagrams.DIAGRAM_CATALOG && !Diagrams.DIAGRAM_CATALOG[parsed.type]) {
        return null;
      }
      return JSON.stringify({
        type: parsed.type,
        params: parsed.params && typeof parsed.params === 'object' ? parsed.params : {}
      });
    } catch (e) {
      return null;
    }
  },

  _sanitizeDomNode(node, doc) {
    if (node.nodeType === 3) {
      return doc.createTextNode(node.nodeValue || '');
    }
    if (node.nodeType !== 1) return null;

    const tag = node.tagName.toLowerCase();
    if (this.DROP_WITH_CONTENT.has(tag)) return null;

    const isSvg = this.SVG_TAGS.has(tag);
    const isHtml = this.HTML_TAGS.has(tag);
    if (!isHtml && !isSvg) {
      const frag = doc.createDocumentFragment();
      Array.from(node.childNodes).forEach((child) => {
        const cleanChild = this._sanitizeDomNode(child, doc);
        if (cleanChild) frag.appendChild(cleanChild);
      });
      return frag;
    }

    const cleanEl = isSvg
      ? doc.createElementNS('http://www.w3.org/2000/svg', tag)
      : doc.createElement(tag);

    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value || '';
      if (name.startsWith('on') || name === 'style' || name === 'srcdoc') return;

      if (tag === 'a' && name === 'href') {
        const safeHref = this.safeUrl(value, true);
        if (safeHref) {
          cleanEl.setAttribute('href', safeHref);
          if (!safeHref.startsWith('#')) {
            cleanEl.setAttribute('target', '_blank');
            cleanEl.setAttribute('rel', 'noopener noreferrer');
          }
        }
        return;
      }

      if ((tag === 'div' || tag === 'span') && name === 'data-spec') {
        const validated = this._validateDiagramSpec(value);
        if (validated) cleanEl.setAttribute('data-spec', validated);
        return;
      }

      if (isSvg) {
        if (!this.SVG_ATTRS.has(name)) return;
        if ((name === 'marker-end' || name === 'marker-start') && !/^url\(#mp-[a-z0-9_-]+\)$/i.test(value.trim())) {
          return;
        }
        if (/javascript:|data:|expression\s*\(/i.test(value)) return;
        cleanEl.setAttribute(attr.name, value);
      } else if (this.HTML_ATTRS.has(name)) {
        if (name === 'class') {
          const safeClass = value.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
          if (safeClass) cleanEl.setAttribute('class', safeClass);
        } else {
          cleanEl.setAttribute(name, value);
        }
      }
    });

    Array.from(node.childNodes).forEach((child) => {
      const cleanChild = this._sanitizeDomNode(child, doc);
      if (cleanChild) cleanEl.appendChild(cleanChild);
    });
    return cleanEl;
  },

  sanitizeFragment(rawHtml) {
    const html = String(rawHtml ?? '');
    const doc = document;
    const frag = doc.createDocumentFragment();
    if (!html.trim()) return frag;

    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, 'text/html');
    Array.from(parsed.body.childNodes).forEach((node) => {
      const clean = this._sanitizeDomNode(node, doc);
      if (clean) frag.appendChild(clean);
    });
    return frag;
  },

  sanitizeHtml(rawHtml) {
    const html = String(rawHtml ?? '');
    if (!html.trim()) return '';
    if (typeof DOMParser !== 'undefined' && typeof document !== 'undefined') {
      const wrap = document.createElement('div');
      wrap.appendChild(this.sanitizeFragment(html));
      return wrap.innerHTML;
    }
    // 非瀏覽器環境 (Node 自檢) 之降級靜態白名單淨化
    return html
      .replace(/<(script|style|iframe|object|embed|foreignObject|applet|form|meta|link|base)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<(script|style|iframe|object|embed|foreignObject|applet|form|input|textarea|button|meta|link|base|img|use|image|animate|set)\b[^>]*\/?>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+(?:href|src|xlink:href)\s*=\s*(?:"\s*(?:javascript|vbscript|data):[^"]*"|'\s*(?:javascript|vbscript|data):[^']*')/gi, '');
  },

  set(el, rawHtml, options = {}) {
    if (!el) return;
    const html = String(rawHtml ?? '');
    if (!html.trim()) {
      el.replaceChildren();
      return;
    }
    if (options.trusted === true) {
      el.innerHTML = html;
      return;
    }
    if (options.plainText === true) {
      el.textContent = html;
      return;
    }
    if (typeof DOMParser !== 'undefined') {
      const frag = this.sanitizeFragment(html);
      el.replaceChildren(frag);
      return;
    }
    el.innerHTML = this.sanitizeHtml(html);
  }
};

const Diagrams = {
  SafeHTML,
  _uidCounter: 0,

  DIAGRAM_CATALOG: {
    interaction_z_e: {
      title: '光子與物質交互作用相對優勢模擬 (Z vs. hν)',
      caption: '拖曳圖面探針或調整原子序 Z 與能量 hν，即時觀察光電 (τ ∝ Z³/E³)、康普吞 (σ) 與成對產生 (κ ∝ Z, 閾值 1.022 MeV) 優勢佔比。',
      keywords: ['光電效應', '康普吞', '成對產生', 'photoelectric', 'compton', 'pair production'],
      spec: { type: 'interaction_z_e', params: { logE: 0.78, z: 7.4 } }
    },
    attenuation: {
      title: '窄射束與寬射束 HVL 衰減與射束硬化模擬',
      caption: '拖曳厚度探針 x 或調整半值層 HVL₁、射束硬化與散射增建係數，即時計算窄射束指數衰減與寬射束穿透率 I/I₀。',
      keywords: ['半值層', 'HVL', 'TVL', '窄射束', '寬射束', '射束硬化'],
      spec: { type: 'attenuation', params: { hvl1: 3.0, hardening: 0.15, buildup: 0.45, probeX: 3.0 } }
    },
    linac_head: {
      title: '直線加速器機頭互動結構圖 (FF / FFF / 電子模式)',
      caption: '切換射束模式觀察靶、整平濾器、散射箔與電子限光筒機械聯鎖，點擊各組件檢視物理原理與 TG-142 品管規範。',
      keywords: ['整平濾器', '散射箔', 'flattening filter', 'scattering foil', '機頭'],
      spec: { type: 'linac_head', params: { mode: 'photon_ff', selectedPart: 'filter_foil' } }
    },
    decay: {
      title: '母子核衰變平衡與 ⁹⁹ᵐTc 乳牛淘洗模擬',
      caption: '調整母子核半衰期並可模擬 24 小時淘洗 (Elution)，拖曳時間探針觀察瞬態平衡 (T₁ > T₂) 與永恆平衡 (T₁ ≫ T₂) 活度演變。',
      keywords: ['瞬態平衡', '永恆平衡', '半衰期', 'secular', 'transient', '衰變常數'],
      spec: { type: 'decay', params: { t1: 66, t2: 6, eluteAt: 0, probeT: 22.9 } }
    },
    pdd: {
      title: '百分深度劑量模擬實驗室 (光子 / 電子 / 質子 SOBP)',
      caption: '拖曳水中深度探針 d 並調整電子能量 E₀，即時讀取各射束百分深度劑量、d_max、電子 R_50 與實務射程 R_p。',
      keywords: ['PDD', '百分深度劑量', 'dmax', '建成區', 'Bragg Peak', 'SOBP', 'Rp'],
      spec: { type: 'pdd', params: { curves: ['photon_6mv', 'photon_18mv', 'electron_12mev'], eElectron: 12, probeD: 10 } }
    },
    tg51_setup: {
      title: 'TG-51 / TRS-398 參考校正幾何與溫壓修正實驗室',
      caption: '切換協定與 SSD/SAD 幾何基準，調整腔徑 r_cav、溫度 T 與氣壓 P，即時計算有效量測點 P_eff 上游偏移與 P_TP。',
      keywords: ['TG-51', 'TG51', 'TRS-398', 'TRS398', '有效量測點', 'kQ', '參考深度'],
      spec: { type: 'tg51_setup', params: { protocol: 'TG-51', setup: 'SSD', dref: 10, rcav: 3.1, temp: 22.0, press: 101.33 } }
    },
    inhomogeneity_slab: {
      title: '組織不均勻界面效應模擬 (水 → 肺 → 骨 → 水)',
      caption: '切換射束能量與照野大小並調整肺與骨組織密度，即時模擬低密度肺組織側向電子失衡與骨界面背向散射峰值。',
      keywords: ['不均勻', 'inhomogeneity', '肺組織', '電子失衡', 'ETAR'],
      spec: { type: 'inhomogeneity_slab', params: { energy: '6MV', field: '10x10', rhoLung: 0.25, rhoBone: 1.85 } }
    },
    profile: {
      title: '離軸劑量剖面與平坦度模擬 (FF vs. FFF)',
      caption: '調整照野寬度與量測深度，並沿離軸拖曳探針，即時觀察 Horns 變化、半影寬度及射束平坦度 (Flatness)。',
      keywords: ['離軸', 'profile', 'FFF', '平坦度', '對稱性', 'horns'],
      spec: { type: 'profile', params: { fieldSize: 10, depth: 10, showFFF: true, probeX: 0 } }
    },
    geometric_penumbra: {
      title: '幾何半影 (Geometric Penumbra) 動態射線光學台',
      caption: '調整射源寬度 s、準直儀距離 SCD、SSD 與深度 d，即時重繪幾何交叉切線並計算 Pg = s × (SSD + d - SCD) / SCD。',
      keywords: ['幾何半影', 'penumbra', 'SCD', 'MLC', '半影'],
      spec: { type: 'geometric_penumbra', params: { s: 2.0, scd: 50, ssd: 100, d: 10 } }
    },
    gamma_index: {
      title: 'IMRT Gamma Index (ΔD / DTA) 互動判定儀',
      caption: '在二維誤差平面點擊或拖曳測試點 (Δr, ΔD)，即時依所選容許差計算 γ 值並驗證通過準則 (γ ≤ 1)。',
      keywords: ['Gamma', 'DTA', 'IMRT', 'TG-119', 'TG-120', '劑量驗證'],
      spec: { type: 'gamma_index', params: { ddTol: 3, dtaTol: 3, dr: 1.8, dd: 2.0 } }
    },
    tg43_geometry: {
      title: 'AAPM TG-43 近接線射源極座標幾何模擬器',
      caption: '拖曳評估點 P(r, θ) 或調整活性長度 L，動態重繪極角 θ 與端點張角 β，即時計算線射源幾何因子 G_L(r, θ)。',
      keywords: ['TG-43', 'TG43', '近接治療', '後裝', '幾何因子', 'Ir-192'],
      spec: { type: 'tg43_geometry', params: { L: 3.5, r: 2.0, theta: 45 } }
    },
    field_matching: {
      title: '相鄰照野發散銜接與皮膚間隙 (Gap) 模擬器',
      caption: '調整兩照野寬度 L₁/L₂、目標深度 d 與實際表面間隙 Gap，即時視覺化淺層過量熱點 (Hot Spot) 或深層冷點。',
      keywords: ['照野銜接', 'gap', '發散', 'TBI', '鶴脊照射'],
      spec: { type: 'field_matching', params: { l1: 20, l2: 20, ssd: 100, d: 10, actualGap: 2.0 } }
    },
    ctdi_phantom: {
      title: 'CT 劑量指標 (CTDIw / CTDIvol / DLP) 假體計算實驗室',
      caption: '切換 Head (16 cm) 與 Body (32 cm) 假體並調整 Pitch 與掃描長度，點擊假體孔位檢視權重與有效劑量估算。',
      keywords: ['CTDI', 'DLP', 'Pitch', '電腦斷層', '假體'],
      spec: { type: 'ctdi_phantom', params: { phantom: 'body', ctdiC: 24, ctdiP: 32, pitch: 1.0, scanLen: 30, selectedHole: 'center' } }
    },
    lq_survival: {
      title: 'LQ 細胞存活曲線與 BED / EQD₂ 分次劑量模擬',
      caption: '調整早/晚反應組織 α/β 比與單次劑量 d，即時觀察存活曲線肩區彎曲度與 BED / EQD₂ 等效生物劑量差異。',
      keywords: ['LQ', '存活曲線', 'α/β', 'alpha/beta', 'LET', 'BED', 'EQD2'],
      spec: { type: 'lq_survival', params: { abTumor: 10, abLate: 3, dFrac: 2.0, nFrac: 30, showHighLet: true } }
    },
    tcp_ntcp: {
      title: 'TCP / NTCP 治療視窗與缺氧 OER 效應模擬',
      caption: '拖曳處方總劑量 D 或切換腫瘤缺氧狀態，即時觀察 TCP、NTCP、無併發症控制率 P₊ 與治療比變化。',
      keywords: ['TCP', 'NTCP', '治療視窗', 'QUANTEC', 'OAR', 'OER'],
      spec: { type: 'tcp_ntcp', params: { dRx: 62, tcd50: 50, td50: 75, hypoxic: false } }
    },
    dicom_rt_flow: {
      title: 'DICOM-RT 四大核心物件互動架構檢視器',
      caption: '點擊臨床工作流中任一節點，高亮上下游相依關聯並檢視對應 DICOM SOP Class、關鍵 Tag 與放療品管核對項目。',
      keywords: ['DICOM', 'PACS', 'RT Plan', 'RT Struct', 'RT Dose', 'HL7'],
      spec: { type: 'dicom_rt_flow', params: { activeNode: 'plan' } }
    }
  },

  UNIT_DIAGRAMS: {
    'U1.1.1': [{
      title: '光子與物質交互作用相對優勢模擬 (Z vs. hν)',
      caption: '低能高 Z 以光電效應為主；臨床 MV 光子於軟組織以康普吞為主；E ≥ 1.022 MeV 發生設定成對產生。',
      spec: { type: 'interaction_z_e', params: { logE: 0.78, z: 7.4 } }
    }],
    'U1.1.2': [
      {
        title: '窄射束與寬射束 HVL 衰減與射束硬化模擬',
        caption: '多能譜 X 光隨厚度增加使有效能量上升，故寬射束與深層 HVL₂ > HVL₁。',
        spec: { type: 'attenuation', params: { hvl1: 3.2, hardening: 0.16, buildup: 0.45, probeX: 3.2 } }
      },
      {
        title: '直線加速器機頭互動結構圖 (FF / FFF / 電子模式)',
        caption: '點擊切換模式與機頭組件，檢視 Target、Flattening Filter 與 Scattering Foil 聯鎖機制。',
        spec: { type: 'linac_head', params: { mode: 'photon_ff', selectedPart: 'filter_foil' } }
      }
    ],
    'U1.2.1': [{
      title: '母子核衰變平衡與 ⁹⁹ᵐTc 乳牛淘洗模擬',
      caption: '瞬態平衡 (⁹⁹Mo → ⁹⁹ᵐTc) 子核於 t_max 達最高峰；可開啟 24h 淘洗模擬臨床核醫萃取。',
      spec: { type: 'decay', params: { t1: 66, t2: 6, eluteAt: 0, probeT: 22.9 } }
    }],
    'U2.1.1': [{
      title: '百分深度劑量模擬實驗室 (光子 / 電子 / 質子 SOBP)',
      caption: '調整電子能量觀察 Rp ≈ E/2 變化，並拖曳深度探針讀取不同深度 PDD。',
      spec: { type: 'pdd', params: { curves: ['photon_6mv', 'photon_18mv', 'electron_12mev'], eElectron: 12, probeD: 10 } }
    }],
    'U2.1.2': [{
      title: 'AAPM TG-51 水中吸收劑量參考校正幾何',
      caption: 'TG-51 參考溫度 T₀=22°C、P₀=101.33 kPa；圓柱腔光子有效量測點位於腔心上游 0.6 r_cav。',
      spec: { type: 'tg51_setup', params: { protocol: 'TG-51', setup: 'SSD', dref: 10, rcav: 3.1, temp: 22.0, press: 101.33 } }
    }],
    'U2.2.1': [{
      title: 'IAEA TRS-398 國際劑量協定水假體配置',
      caption: 'TRS-398 參考溫度 T₀=20°C、P₀=101.325 kPa；圓柱腔光子有效量測點為腔心上游 0.5 r_cav。',
      spec: { type: 'tg51_setup', params: { protocol: 'TRS-398', setup: 'SAD', dref: 10, rcav: 3.1, temp: 20.0, press: 101.325 } }
    }],
    'U2.2.2': [{
      title: '質子射束 Pristine Bragg Peak 與展寬峰 (SOBP)',
      caption: '切換射束與移動深度探針，對照質子尖銳射程末端釋放與 6 MV 光子指數衰減差異。',
      spec: { type: 'pdd', params: { curves: ['proton_pristine', 'proton_sobp', 'photon_6mv'], eElectron: 12, probeD: 14.5 } }
    }],
    'U3.1.1': [{
      title: '組織不均勻界面效應模擬 (水 → 肺 → 骨 → 水)',
      caption: '嘗試切換 18 MV 搭配 3×3 小照野並降低肺密度，觀察側向電子失衡造成之肺內劑量顯著下降。',
      spec: { type: 'inhomogeneity_slab', params: { energy: '6MV', field: '10x10', rhoLung: 0.25, rhoBone: 1.85 } }
    }],
    'U3.1.2': [
      {
        title: '離軸劑量剖面與平坦度模擬 (FF vs. FFF)',
        caption: '調整照野大小與深度，即時計算離軸平坦區平坦度 (Flatness) 與 80%–20% 半影。',
        spec: { type: 'profile', params: { fieldSize: 10, depth: 10, showFFF: true, probeX: 0 } }
      },
      {
        title: '高能光子 6 MV vs. 18 MV 百分深度劑量 (PDD)',
        caption: '比較不同深度下 6 MV 與 18 MV 光子的建成深度與衰減速率。',
        spec: { type: 'pdd', params: { curves: ['photon_6mv', 'photon_18mv'], eElectron: 12, probeD: 10 } }
      }
    ],
    'U3.2.1': [{
      title: '幾何半影 (Geometric Penumbra) 動態射線光學台',
      caption: '實測增大 SCD 或縮小射源直徑 s 如何依據相似三角形有效縮小 Pg。',
      spec: { type: 'geometric_penumbra', params: { s: 2.0, scd: 50, ssd: 100, d: 10 } }
    }],
    'U3.2.2': [{
      title: 'IMRT Gamma Index (ΔD / DTA) 互動判定儀',
      caption: '點擊或拖曳誤差點檢驗 3%/3mm 與 2%/2mm 判定邊界 γ ≤ 1。',
      spec: { type: 'gamma_index', params: { ddTol: 3, dtaTol: 3, dr: 1.8, dd: 2.0 } }
    }],
    'U4.1.1': [{
      title: 'SRS 小照野幾何半影控制模擬',
      caption: 'SRS 藉由縮小等效射源並使用錐形準直儀提高 SCD，降低邊緣幾何半影。',
      spec: { type: 'geometric_penumbra', params: { s: 1.5, scd: 65, ssd: 100, d: 8 } }
    }],
    'U4.1.3': [{
      title: 'AAPM TG-43 近接線射源極座標幾何模擬器',
      caption: '拖曳點 P(r, θ) 驗證軸線上 (θ=0°) 與垂直雙等分面 (θ=90°) 的幾何因子趨勢。',
      spec: { type: 'tg43_geometry', params: { L: 3.5, r: 2.0, theta: 45 } }
    }],
    'U4.2.1': [{
      title: '相鄰照野發散銜接與表面間隙 (Gap) 模擬器',
      caption: '刻意將實際 Gap 設小於理想 ΔG，即時觀察深度 d 上方產生的紅色重疊熱點區。',
      spec: { type: 'field_matching', params: { l1: 20, l2: 20, ssd: 100, d: 10, actualGap: 2.0 } }
    }],
    'U5.1.2': [{
      title: 'TG-142 射束剖面平坦度與對稱性品管模擬',
      caption: '檢測照野中央 80% 區域劑量極值比與 FF/FFF 射束特性。',
      spec: { type: 'profile', params: { fieldSize: 10, depth: 10, showFFF: true, probeX: 0 } }
    }],
    'U5.2.1': [{
      title: 'IMRT QA Gamma Index 雙維複合誤差模擬',
      caption: '切換 3%/3mm 或嚴格 2%/2mm SRS 標準檢驗單點通過狀態。',
      spec: { type: 'gamma_index', params: { ddTol: 3, dtaTol: 3, dr: 1.5, dd: 1.5 } }
    }],
    'U6.2.2': [{
      title: 'CT 劑量指標 (CTDIw / CTDIvol / DLP) 假體實驗室',
      caption: '比較 Head 16cm 與 Body 32cm 假體配置，調整 Pitch 觀察體積劑量反比變化。',
      spec: { type: 'ctdi_phantom', params: { phantom: 'body', ctdiC: 24, ctdiP: 32, pitch: 1.0, scanLen: 30, selectedHole: 'center' } }
    }],
    'U7.1.1': [{
      title: 'NCRP-147 寬射束屏蔽衰減與散射增建模擬',
      caption: '調整增建強度與厚度 x，比較窄射束與寬射束防護需求差異。',
      spec: { type: 'attenuation', params: { hvl1: 2.8, hardening: 0.14, buildup: 0.5, probeX: 5.6 } }
    }],
    'U7.2.1': [{
      title: '輻射指數衰減、HVL 與 TVL 計算模擬',
      caption: '拖曳厚度探針驗證 1 TVL ≈ 3.322 HVL 與每增加 1 HVL 強度減半規律。',
      spec: { type: 'attenuation', params: { hvl1: 2.5, hardening: 0.12, buildup: 0.4, probeX: 2.5 } }
    }],
    'U8.2.1': [{
      title: 'TCP / NTCP 治療視窗與缺氧效應模擬',
      caption: '調整總處方劑量 D 尋找最佳無併發症控制率 P₊ 峰值。',
      spec: { type: 'tcp_ntcp', params: { dRx: 62, tcd50: 50, td50: 75, hypoxic: false } }
    }],
    'U9.1.1': [{
      title: 'LQ 細胞存活半對數曲線與 BED 模擬',
      caption: '比較低 LET 肩區與高 LET 指數直線差異。',
      spec: { type: 'lq_survival', params: { abTumor: 10, abLate: 3, dFrac: 2.0, nFrac: 30, showHighLet: true } }
    }],
    'U9.1.2': [{
      title: '早反應組織 (α/β≈10) vs. 晚反應組織 (α/β≈3) 分次效應',
      caption: '嘗試提高單次劑量 d，觀察晚反應正常組織 EQD₂ 快速攀升風險。',
      spec: { type: 'lq_survival', params: { abTumor: 10, abLate: 3, dFrac: 2.0, nFrac: 30, showHighLet: false } }
    }],
    'U9.2.1': [{
      title: 'TCP / NTCP 劑量反應與氧效應 (OER) 模擬',
      caption: '切換「腫瘤缺氧狀態」觀察腫瘤控制曲線右移導致治療視窗縮小。',
      spec: { type: 'tcp_ntcp', params: { dRx: 62, tcd50: 50, td50: 75, hypoxic: false } }
    }],
    'U10.1.2': [{
      title: 'DICOM-RT 四大核心物件互動架構檢視器',
      caption: '點擊臨床流向節點檢視對應 SOP Class 與資料檢核重點。',
      spec: { type: 'dicom_rt_flow', params: { activeNode: 'plan' } }
    }]
  },

  // ==========================================
  // 容納器水合與宣告式互動實驗室引擎 (Ponytail 共用核心)
  // ==========================================
  hydrateContainer(rootEl) {
    if (!rootEl) return;

    const specs = rootEl.querySelectorAll('.mp-diagram[data-spec]');
    specs.forEach((el) => {
      if (el.getAttribute('data-rendered') === 'true') return;
      try {
        const spec = JSON.parse(el.getAttribute('data-spec'));
        el.innerHTML = this.renderSpec(spec);
        el.setAttribute('data-rendered', 'true');
      } catch (err) {
        console.warn('[Diagrams] 規格解析失敗:', err);
      }
    });

    this.bindInteractiveLabs(rootEl);

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

  _getDefaultState(type, customParams = {}) {
    const catDefaults = (this.DIAGRAM_CATALOG[type] && this.DIAGRAM_CATALOG[type].spec.params) || {};
    const merged = { ...catDefaults, ...(customParams || {}) };

    if (type === 'pdd' && Array.isArray(merged.curves)) {
      const normalized = [];
      merged.curves.forEach((c) => {
        if (c === 'electron_12mev') {
          if (!normalized.includes('electron')) normalized.push('electron');
          if (!customParams.eElectron) merged.eElectron = 12;
        } else if (!normalized.includes(c)) {
          normalized.push(c);
        }
      });
      merged.curves = normalized.length > 0 ? normalized : ['photon_6mv', 'photon_18mv'];
    }

    if (type === 'linac_head' && merged.mode === 'photon') {
      merged.mode = 'photon_ff';
    }
    if (type === 'gamma_index') {
      if (typeof merged.dd === 'string') merged.ddTol = parseFloat(merged.dd) || 3;
      if (typeof merged.dta === 'string') merged.dtaTol = parseFloat(merged.dta) || 3;
      if (typeof merged.dd === 'string') merged.dd = 2.0;
    }
    if (type === 'inhomogeneity_slab') {
      if (typeof merged.lungDensity === 'string') merged.rhoLung = parseFloat(merged.lungDensity) || 0.25;
      if (typeof merged.boneDensity === 'string') merged.rhoBone = parseFloat(merged.boneDensity) || 1.85;
    }
    if (type === 'tg51_setup' && merged.dref !== undefined) {
      merged.dref = Number(merged.dref) || 10;
    }
    return merged;
  },

  renderSpec(spec) {
    if (!spec || !spec.type || !this._LAB_BUILDERS[spec.type]) return '';
    const type = spec.type;
    const defaultState = this._getDefaultState(type, spec.params || {});
    const lab = this._LAB_BUILDERS[type].call(this, defaultState);
    if (!lab) return '';

    const escapedDefault = this._escapeAttr(JSON.stringify(defaultState));
    const controlsHtml = (lab.controls || []).map((ctrl) => this._renderControl(ctrl, defaultState)).join('');

    return `
      <div class="mp-lab" data-lab-type="${type}" data-lab-state="${escapedDefault}" data-lab-default="${escapedDefault}">
        <div class="mp-lab-toolbar">
          <span class="mp-lab-badge"><span class="mp-lab-dot" aria-hidden="true"></span>互動物理模擬</span>
          <button type="button" class="mp-lab-reset" title="重設為標準預設參數">重設參數</button>
        </div>
        <div class="mp-lab-readouts">${this._renderReadoutsHtml(lab.readouts)}</div>
        <div class="mp-lab-stage">${lab.svg}</div>
        <div class="mp-lab-inspector" style="${lab.inspector ? '' : 'display:none;'}">${lab.inspector || ''}</div>
        ${controlsHtml ? `<div class="mp-lab-controls">${controlsHtml}</div>` : ''}
      </div>
    `;
  },

  _escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  _readLabState(labEl, attr = 'data-lab-state') {
    const type = labEl.getAttribute('data-lab-type');
    try {
      const raw = labEl.getAttribute(attr);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return this._getDefaultState(type);
  },

  _renderReadoutsHtml(readouts = []) {
    return readouts
      .map(
        (r) => `
      <div class="mp-lab-readout mp-tone-${r.tone || 'neutral'}">
        <span class="mp-lab-readout-label">${r.label}</span>
        <span class="mp-lab-readout-val mono-num">${r.value}</span>
      </div>`
      )
      .join('');
  },

  _renderControl(ctrl, state) {
    if (ctrl.kind === 'range') {
      const val = Number(state[ctrl.param]);
      const disp = ctrl.format ? ctrl.format(val) : String(val);
      return `
        <div class="mp-lab-ctrl">
          <div class="mp-lab-ctrl-head">
            <span>${ctrl.label}</span>
            <span class="mp-lab-val mono-num" data-for="${ctrl.param}">${disp}${ctrl.unit ? ` ${ctrl.unit}` : ''}</span>
          </div>
          <input type="range" class="mp-lab-slider" data-param="${ctrl.param}" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${val}">
        </div>
      `;
    }

    if (ctrl.kind === 'choice' || ctrl.kind === 'multichoice') {
      const cur = state[ctrl.param];
      const btns = ctrl.options
        .map((opt) => {
          const active = ctrl.kind === 'multichoice'
            ? Array.isArray(cur) && cur.includes(opt.value)
            : String(cur) === String(opt.value);
          return `<button type="button" class="mp-lab-pill ${active ? 'active' : ''}" data-kind="${ctrl.kind}" data-param="${ctrl.param}" data-value="${opt.value}">${opt.label}</button>`;
        })
        .join('');
      return `
        <div class="mp-lab-ctrl mp-lab-ctrl-wide">
          <div class="mp-lab-ctrl-head"><span>${ctrl.label}</span></div>
          <div class="mp-lab-btn-group">${btns}</div>
        </div>
      `;
    }

    if (ctrl.kind === 'toggle') {
      const active = Boolean(state[ctrl.param]);
      return `
        <div class="mp-lab-ctrl mp-lab-ctrl-compact">
          <button type="button" class="mp-lab-pill ${active ? 'active' : ''}" data-kind="toggle" data-param="${ctrl.param}">${ctrl.label}</button>
        </div>
      `;
    }

    if (ctrl.kind === 'action') {
      return `
        <div class="mp-lab-ctrl mp-lab-ctrl-compact">
          <button type="button" class="mp-lab-pill mp-lab-action" data-kind="action" data-action="${ctrl.action}">${ctrl.label}</button>
        </div>
      `;
    }

    return '';
  },

  bindInteractiveLabs(rootEl) {
    if (!rootEl) return;
    const labs = rootEl.querySelectorAll('.mp-lab[data-lab-type]');
    labs.forEach((labEl) => {
      if (labEl.getAttribute('data-lab-bound') === 'true') return;
      labEl.setAttribute('data-lab-bound', 'true');

      const stopBubble = (e) => e.stopPropagation();
      const controlsBox = labEl.querySelector('.mp-lab-controls');
      if (controlsBox) {
        controlsBox.addEventListener('click', stopBubble);
        controlsBox.addEventListener('pointerdown', stopBubble);
        controlsBox.addEventListener('input', (e) => {
          const slider = e.target.closest('input.mp-lab-slider[data-param]');
          if (!slider) return;
          e.stopPropagation();
          const state = this._readLabState(labEl);
          state[slider.getAttribute('data-param')] = Number(slider.value);
          this._patchLab(labEl, state, slider.getAttribute('data-param'));
        });

        controlsBox.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-kind]');
          if (!btn) return;
          e.stopPropagation();
          const kind = btn.getAttribute('data-kind');
          const state = this._readLabState(labEl);

          if (kind === 'choice') {
            const p = btn.getAttribute('data-param');
            const v = btn.getAttribute('data-value');
            const num = Number(v);
            state[p] = v === 'true' ? true : (v === 'false' ? false : (v !== '' && Number.isFinite(num) ? num : v));
            this._applyLabPresetSideEffects(labEl.getAttribute('data-lab-type'), p, state);
          } else if (kind === 'multichoice') {
            const p = btn.getAttribute('data-param');
            const v = btn.getAttribute('data-value');
            const arr = Array.isArray(state[p]) ? [...state[p]] : [];
            const idx = arr.indexOf(v);
            if (idx >= 0 && arr.length > 1) arr.splice(idx, 1);
            else if (idx < 0) arr.push(v);
            state[p] = arr;
          } else if (kind === 'toggle') {
            const p = btn.getAttribute('data-param');
            state[p] = !state[p];
          } else if (kind === 'action') {
            this._runLabAction(labEl.getAttribute('data-lab-type'), btn.getAttribute('data-action'), state);
          }
          this._patchLab(labEl, state);
        });
      }

      const btnReset = labEl.querySelector('.mp-lab-reset');
      if (btnReset) {
        btnReset.addEventListener('click', (e) => {
          e.stopPropagation();
          const defState = this._readLabState(labEl, 'data-lab-default');
          this._patchLab(labEl, defState);
        });
      }

      // 舞台點擊與十字探針拖曳 (事件委派到 .mp-lab-stage，重繪 SVG 不需重新綁定!)
      const stage = labEl.querySelector('.mp-lab-stage');
      if (stage) {
        let dragging = false;

        const handleProbePointer = (evt) => {
          const svg = stage.querySelector('svg[data-probe-mode]');
          if (!svg || !svg.getScreenCTM) return;
          const ctm = svg.getScreenCTM();
          if (!ctm) return;

          const pt = svg.createSVGPoint();
          pt.x = evt.clientX;
          pt.y = evt.clientY;
          const loc = pt.matrixTransform(ctm.inverse());

          const mode = svg.getAttribute('data-probe-mode');
          const pxMin = Number(svg.getAttribute('data-px-min'));
          const pxMax = Number(svg.getAttribute('data-px-max'));
          const pyMin = Number(svg.getAttribute('data-py-min'));
          const pyMax = Number(svg.getAttribute('data-py-max'));
          const xMin = Number(svg.getAttribute('data-x-min'));
          const xMax = Number(svg.getAttribute('data-x-max'));
          const yMin = Number(svg.getAttribute('data-y-min'));
          const yMax = Number(svg.getAttribute('data-y-max'));

          const rx = Math.max(0, Math.min(1, (loc.x - pxMin) / (pxMax - pxMin)));
          const valX = xMin + rx * (xMax - xMin);
          const state = this._readLabState(labEl);

          if (mode === 'x') {
            const xKey = svg.getAttribute('data-x-key');
            state[xKey] = Number(valX.toFixed(2));
            this._patchLab(labEl, state);
          } else if (mode === 'xy') {
            const ry = Math.max(0, Math.min(1, (pyMax - loc.y) / (pyMax - pyMin)));
            const valY = yMin + ry * (yMax - yMin);
            state[svg.getAttribute('data-x-key')] = Number(valX.toFixed(2));
            state[svg.getAttribute('data-y-key')] = Number(valY.toFixed(1));
            this._patchLab(labEl, state);
          } else if (mode === 'polar_tg43') {
            const ox = Number(svg.getAttribute('data-origin-x'));
            const oy = Number(svg.getAttribute('data-origin-y'));
            const scale = Number(svg.getAttribute('data-scale'));
            const dx = (loc.x - ox) / scale;
            const dy = Math.max(0.15, (oy - loc.y) / scale);
            const rVal = Math.max(0.5, Math.min(5.0, Math.hypot(dx, dy)));
            const thetaDeg = Math.max(10, Math.min(170, (Math.atan2(dy, dx) * 180) / Math.PI));
            state.r = Number(rVal.toFixed(2));
            state.theta = Math.round(thetaDeg);
            this._patchLab(labEl, state);
          }
        };

        stage.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          const partEl = e.target.closest('[data-part]');
          if (partEl) {
            const state = this._readLabState(labEl);
            const partKey = partEl.getAttribute('data-part-key') || 'selectedPart';
            state[partKey] = partEl.getAttribute('data-part');
            this._patchLab(labEl, state);
            return;
          }
          const svg = stage.querySelector('svg[data-probe-mode]');
          if (svg) {
            dragging = true;
            if (stage.setPointerCapture) {
              try { stage.setPointerCapture(e.pointerId); } catch (err) {}
            }
            handleProbePointer(e);
          }
        });

        stage.addEventListener('pointermove', (e) => {
          if (!dragging) return;
          e.stopPropagation();
          handleProbePointer(e);
        });

        const stopDrag = (e) => {
          if (dragging) {
            dragging = false;
            e.stopPropagation();
          }
        };
        stage.addEventListener('pointerup', stopDrag);
        stage.addEventListener('pointercancel', stopDrag);
      }
    });
  },

  _applyLabPresetSideEffects(type, param, state) {
    if (type === 'tg51_setup' && param === 'protocol') {
      state.temp = state.protocol === 'TRS-398' ? 20.0 : 22.0;
      state.press = state.protocol === 'TRS-398' ? 101.325 : 101.33;
    }
    if (type === 'ctdi_phantom' && param === 'phantom') {
      if (state.phantom === 'head') {
        state.ctdiC = 48;
        state.ctdiP = 50;
      } else {
        state.ctdiC = 24;
        state.ctdiP = 32;
      }
    }
  },

  _runLabAction(type, action, state) {
    if (type === 'field_matching' && action === 'apply_ideal_gap') {
      const ideal = 0.5 * state.l1 * (state.d / state.ssd) + 0.5 * state.l2 * (state.d / state.ssd);
      state.actualGap = Number(ideal.toFixed(2));
    } else if (type === 'decay') {
      if (action === 'preset_transient') {
        state.t1 = 66;
        state.t2 = 6;
        state.eluteAt = 0;
      } else if (action === 'preset_secular') {
        state.t1 = 200;
        state.t2 = 4;
        state.eluteAt = 0;
      } else if (action === 'toggle_elute') {
        state.eluteAt = state.eluteAt ? 0 : 24;
      }
    } else if (type === 'interaction_z_e') {
      if (action === 'preset_tissue_6mv') { state.z = 7.4; state.logE = 0.78; }
      else if (action === 'preset_bone_60kv') { state.z = 13.8; state.logE = -1.22; }
      else if (action === 'preset_lead_18mv') { state.z = 82; state.logE = 1.25; }
    }
  },

  _patchLab(labEl, state, activeSliderParam = null) {
    const type = labEl.getAttribute('data-lab-type');
    const builder = this._LAB_BUILDERS[type];
    if (!builder) return;

    labEl.setAttribute('data-lab-state', JSON.stringify(state));
    const lab = builder.call(this, state);

    const readoutsEl = labEl.querySelector('.mp-lab-readouts');
    if (readoutsEl) readoutsEl.innerHTML = this._renderReadoutsHtml(lab.readouts);

    const stageEl = labEl.querySelector('.mp-lab-stage');
    if (stageEl) stageEl.innerHTML = lab.svg;

    const inspEl = labEl.querySelector('.mp-lab-inspector');
    if (inspEl) {
      if (lab.inspector) {
        inspEl.innerHTML = lab.inspector;
        inspEl.style.display = 'block';
      } else {
        inspEl.style.display = 'none';
      }
    }

    // 同步控制列讀數與按鈕狀態，但不重建 DOM 避免中斷滑桿拖曳
    (lab.controls || []).forEach((ctrl) => {
      if (ctrl.kind === 'range') {
        const val = Number(state[ctrl.param]);
        const disp = ctrl.format ? ctrl.format(val) : String(val);
        const valSpan = labEl.querySelector(`.mp-lab-val[data-for="${ctrl.param}"]`);
        if (valSpan) valSpan.textContent = `${disp}${ctrl.unit ? ` ${ctrl.unit}` : ''}`;
        if (activeSliderParam !== ctrl.param) {
          const inp = labEl.querySelector(`input.mp-lab-slider[data-param="${ctrl.param}"]`);
          if (inp) {
            inp.min = String(ctrl.min);
            inp.max = String(ctrl.max);
            inp.step = String(ctrl.step);
            inp.value = String(val);
          }
        }
      } else if (ctrl.kind === 'choice' || ctrl.kind === 'multichoice') {
        const cur = state[ctrl.param];
        labEl.querySelectorAll(`button[data-param="${ctrl.param}"]`).forEach((b) => {
          const ov = b.getAttribute('data-value');
          const active = ctrl.kind === 'multichoice'
            ? Array.isArray(cur) && cur.includes(ov)
            : String(cur) === String(ov);
          b.classList.toggle('active', active);
        });
      } else if (ctrl.kind === 'toggle') {
        const btn = labEl.querySelector(`button[data-kind="toggle"][data-param="${ctrl.param}"]`);
        if (btn) btn.classList.toggle('active', Boolean(state[ctrl.param]));
      } else if (ctrl.kind === 'action') {
        const btn = labEl.querySelector(`button[data-kind="action"][data-action="${ctrl.action}"]`);
        if (btn) btn.textContent = ctrl.label;
      }
    });
  },

  // ==========================================
  // 0-Token NotebookLM Markdown + 圖表標記渲染器
  // ==========================================
  formatStudyGuide(rawText, unitId = '') {
    if (!rawText || !rawText.trim()) return '';
    let text = rawText
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/\r\n/g, '\n')
      .trim();

    const mathTokens = [];
    const saveMath = (m) => {
      const id = `@@MP_MATH_${mathTokens.length}@@`;
      mathTokens.push(m);
      return id;
    };
    text = text.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_, inner) => saveMath(`\\[${inner}\\]`));
    text = text.replace(/\\\\\(([\s\S]*?)\\\\\)/g, (_, inner) => saveMath(`\\(${inner}\\)`));
    text = text.replace(/\$\$[\s\S]*?\$\$/g, saveMath);
    text = text.replace(/\\\[[\s\S]*?\\\]/g, saveMath);
    text = text.replace(/\\\([\s\S]*?\\\)/g, saveMath);
    text = text.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, saveMath);

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

    const looksLikeHtml = /<(h[1-4]|table|ul|ol|p|div)\b/i.test(text) && !/^#{1,4}\s/m.test(text);
    let htmlOut = text;

    if (looksLikeHtml) {
      htmlOut = SafeHTML.sanitizeHtml(htmlOut);
    } else {
      const formatInline = (str) =>
        SafeHTML.escape(str)
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code>$1</code>');

      const lines = text.split('\n');
      const out = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i].trimEnd();
        const trimmed = line.trim();

        if (!trimmed) { i++; continue; }
        if (/^@@MP_DIAG_\d+@@$/.test(trimmed)) { out.push(trimmed); i++; continue; }

        if (trimmed.startsWith('```')) {
          const codeLines = [];
          i++;
          while (i < lines.length && !lines[i].trim().startsWith('```')) {
            codeLines.push(SafeHTML.escape(lines[i]));
            i++;
          }
          i++;
          out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
          continue;
        }

        if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-|\s:]*/.test(lines[i + 1])) {
          const parseRow = (r) =>
            r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => formatInline(c.trim()));
          const headers = parseRow(trimmed);
          i += 2;
          const bodyRows = [];
          while (i < lines.length && lines[i].trim().startsWith('|')) {
            bodyRows.push(parseRow(lines[i]));
            i++;
          }
          const thHtml = headers.map((h) => `<th>${h}</th>`).join('');
          const tbHtml = bodyRows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
          out.push(`<table><thead><tr>${thHtml}</tr></thead><tbody>${tbHtml}</tbody></table>`);
          continue;
        }

        const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
        if (hMatch) {
          const level = hMatch[1].length <= 3 ? 'h3' : 'h4';
          out.push(`<${level}>${formatInline(hMatch[2].trim())}</${level}>`);
          i++;
          continue;
        }

        if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
          out.push('<hr class="guide-divider">');
          i++;
          continue;
        }

        if (trimmed.startsWith('>')) {
          const quoteLines = [];
          while (i < lines.length && lines[i].trim().startsWith('>')) {
            quoteLines.push(formatInline(lines[i].trim().replace(/^>\s?/, '')));
            i++;
          }
          out.push(`<div class="unit-notes-box">${quoteLines.join('<br>')}</div>`);
          continue;
        }

        if (/^([-*•])\s+/.test(trimmed)) {
          const items = [];
          while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) {
            items.push(`<li>${formatInline(lines[i].trim().replace(/^([-*•])\s+/, ''))}</li>`);
            i++;
          }
          out.push(`<ul>${items.join('')}</ul>`);
          continue;
        }

        if (/^\d+[.)]\s+/.test(trimmed)) {
          const items = [];
          while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
            items.push(`<li>${formatInline(lines[i].trim().replace(/^\d+[.)]\s+/, ''))}</li>`);
            i++;
          }
          out.push(`<ol>${items.join('')}</ol>`);
          continue;
        }

        if (/^<(h[1-6]|div|table|ul|ol|p|blockquote|hr)\b/i.test(trimmed)) {
          out.push(SafeHTML.sanitizeHtml(line));
          i++;
          continue;
        }

        out.push(`<p>${formatInline(trimmed)}</p>`);
        i++;
      }

      htmlOut = out.join('\n');
    }

    diagramTokens.forEach((diagHtml, idx) => {
      htmlOut = htmlOut.replace(`@@MP_DIAG_${idx}@@`, diagHtml);
    });

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
        htmlOut += `\n<h3>標準醫學物理互動模擬實驗室</h3>\n${autoBlocks.join('\n')}`;
      }
    }

    mathTokens.forEach((mathStr, idx) => {
      const safeMath = mathStr.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      htmlOut = htmlOut.replace(`@@MP_MATH_${idx}@@`, () => safeMath);
    });

    return htmlOut;
  },

  // ==========================================
  // 共用 SVG 框架與座標轉換輔助
  // ==========================================
  _svgShell(viewBox, defs, body, extraAttrs = '') {
    const uid = ++this._uidCounter;
    const html = body
      .replace(/url\(#mp-arrow\)/g, `url(#mp-arrow-${uid})`)
      .replace(/url\(#mp-arrow-accent\)/g, `url(#mp-arrow-accent-${uid})`);

    return `<svg class="mp-svg" viewBox="${viewBox}" width="100%" xmlns="http://www.w3.org/2000/svg" role="img" ${extraAttrs}>
      <defs>
        <marker id="mp-arrow-${uid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--text-muted)"/>
        </marker>
        <marker id="mp-arrow-accent-${uid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--accent)"/>
        </marker>
        ${defs || ''}
      </defs>
      ${html}
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

    grid += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="var(--border-strong)" stroke-width="1.5"/>`;
    grid += `<line x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" stroke="var(--border-strong)" stroke-width="1.5"/>`;
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

  _probeAttrsX(pad, plotW, xDomain, xKey) {
    return `data-probe-mode="x" data-px-min="${pad.left}" data-px-max="${pad.left + plotW}" data-x-min="${xDomain[0]}" data-x-max="${xDomain[1]}" data-x-key="${xKey}"`;
  },

  _probeAttrsXY(pad, plotW, plotH, xDomain, yDomain, xKey, yKey) {
    return `data-probe-mode="xy" data-px-min="${pad.left}" data-px-max="${pad.left + plotW}" data-py-min="${pad.top}" data-py-max="${pad.top + plotH}" data-x-min="${xDomain[0]}" data-x-max="${xDomain[1]}" data-y-min="${yDomain[0]}" data-y-max="${yDomain[1]}" data-x-key="${xKey}" data-y-key="${yKey}"`;
  },

  // ==========================================
  // 16 座互動物理模擬實驗室建構器
  // ==========================================
  _LAB_BUILDERS: {
    // 1. PDD 百分深度劑量模擬
    pdd(s) {
      const curves = Array.isArray(s.curves) ? s.curves : ['photon_6mv', 'photon_18mv'];
      const eE = Number(s.eElectron || 12);
      const dProbe = Math.max(0, Math.min(30, Number(s.probeD ?? 10)));
      const pad = { top: 24, right: 24, bottom: 44, left: 54 };
      const w = 520;
      const h = 265;
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      const xTicks = [0, 5, 10, 15, 20, 25, 30].map((v) => ({ val: v, label: `${v}` }));
      const yTicks = [0, 20, 40, 60, 80, 100].map((v) => ({ val: v, label: `${v}%` }));
      const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '水中深度 Depth (cm)', '相對百分深度劑量 PDD (%)', xTicks, yTicks, [0, 30], [0, 105]);

      const rp = eE / 2.0;
      const r50 = eE / 2.33;
      const eDmax = Math.min(3.5, 0.22 * eE);
      const bremTail = 1.4 + 0.14 * eE;

      const models = {
        photon_6mv: {
          short: '6 MV 光子',
          label: '6 MV 光子 (dmax ≈ 1.5 cm)',
          color: 'var(--accent)',
          dash: '',
          fn: (d) => Math.min(100, (0.32 + 0.68 * (1 - Math.exp(-d / 0.42))) * Math.exp(-0.045 * Math.max(0, d - 1.5)) * 102.5)
        },
        photon_18mv: {
          short: '18 MV 光子',
          label: '18 MV 光子 (dmax ≈ 3.2 cm)',
          color: 'var(--success)',
          dash: '',
          fn: (d) => Math.min(100, (0.18 + 0.82 * (1 - Math.exp(-d / 0.85))) * Math.exp(-0.028 * Math.max(0, d - 3.2)) * 102.5)
        },
        electron: {
          short: `${eE} MeV 電子`,
          label: `${eE} MeV 電子 (Rp ≈ ${rp.toFixed(1)} cm)`,
          color: 'var(--warning)',
          dash: '5 3',
          fn: (d) => {
            if (d > rp + 1.4) return bremTail;
            const build = (84 + 0.6 * eE) + (16 - 0.6 * eE) * (1 - Math.exp(-d / Math.max(0.3, eDmax * 0.45)));
            const slope = Math.max(0.28, 0.03 * eE);
            const drop = 1 / (1 + Math.exp((d - r50) / slope));
            return Math.min(100, Math.max(bremTail, build * drop));
          }
        },
        proton_pristine: {
          short: '質子 Pristine',
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
          short: '質子 SOBP',
          label: '質子 SOBP 展寬峰',
          color: 'var(--danger)',
          dash: '4 3',
          fn: (d) => {
            if (d > 16.5) return 0.3;
            if (d < 9.5) return 68 + (28 * d) / 9.5;
            if (d <= 15.0) return 97;
            return 97 * Math.exp(-Math.pow((d - 15.0) / 0.45, 2));
          }
        }
      };

      let body = grid;
      let legend = '';
      const readouts = [{ label: '探測深度 d', value: `${dProbe.toFixed(1)} cm`, tone: 'accent' }];
      const px = xMap(dProbe);
      body += `<line x1="${px.toFixed(1)}" y1="${pad.top}" x2="${px.toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--text-muted)" stroke-width="1.2" stroke-dasharray="3 3"/>`;

      curves.forEach((key, idx) => {
        const m = models[key];
        if (!m) return;
        const dPath = this._samplePath(m.fn, 0, 30, 200, xMap, yMap);
        body += `<path d="${dPath}" fill="none" stroke="${m.color}" stroke-width="2.2" ${m.dash ? `stroke-dasharray="${m.dash}"` : ''}/>`;
        const val = m.fn(dProbe);
        body += `<circle cx="${px.toFixed(1)}" cy="${yMap(val).toFixed(1)}" r="4" fill="${m.color}" stroke="var(--bg-primary)" stroke-width="1.5"/>`;
        readouts.push({ label: m.short, value: `${val.toFixed(1)} %`, tone: 'neutral' });

        const lx = pad.left + plotW - 195;
        const ly = pad.top + 12 + idx * 17;
        legend += `<line x1="${lx}" y1="${ly}" x2="${lx + 18}" y2="${ly}" stroke="${m.color}" stroke-width="2.2" ${m.dash ? `stroke-dasharray="${m.dash}"` : ''}/>`;
        legend += `<text x="${lx + 24}" y="${ly + 3.5}" fill="var(--text-main)" font-size="10">${m.label}</text>`;
      });

      if (curves.includes('electron')) {
        readouts.push({ label: '電子射程 Rp / R50', value: `${rp.toFixed(1)} / ${r50.toFixed(1)} cm`, tone: 'warning' });
      }

      const controls = [
        { kind: 'range', param: 'probeD', label: '深度探針 d (可拖曳圖面)', min: 0, max: 30, step: 0.5, unit: 'cm', format: (v) => v.toFixed(1) },
        { kind: 'range', param: 'eElectron', label: '電子能量 E₀', min: 6, max: 20, step: 1, unit: 'MeV', format: (v) => String(Math.round(v)) },
        {
          kind: 'multichoice',
          param: 'curves',
          label: '射束疊加比較',
          options: [
            { value: 'photon_6mv', label: '6 MV 光子' },
            { value: 'photon_18mv', label: '18 MV 光子' },
            { value: 'electron', label: '電子射束' },
            { value: 'proton_pristine', label: '質子 Pristine' },
            { value: 'proton_sobp', label: '質子 SOBP' }
          ]
        }
      ];

      return {
        svg: this._svgShell(`0 0 ${w} ${h}`, '', body + legend, this._probeAttrsX(pad, plotW, [0, 30], 'probeD')),
        readouts,
        controls
      };
    },

    // 2. 離軸劑量剖面
    profile(s) {
      const fieldSize = Number(s.fieldSize || 10);
      const depth = Number(s.depth ?? 10);
      const showFFF = s.showFFF !== false;
      const probeX = Math.max(-16, Math.min(16, Number(s.probeX ?? 0)));

      // 隨深度發散：SAD 定義或微幅發散半寬
      const half = (fieldSize / 2) * (1 + (depth - 10) * 0.004);
      const hornFactor = Math.max(0.005, 0.045 - depth * 0.0014);
      const penSlope = 0.24 + depth * 0.008;

      const pad = { top: 24, right: 24, bottom: 44, left: 54 };
      const w = 520;
      const h = 265;
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      const xTicks = [-15, -10, -5, 0, 5, 10, 15].map((v) => ({ val: v, label: `${v}` }));
      const yTicks = [0, 20, 50, 80, 100].map((v) => ({ val: v, label: `${v}%` }));
      const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '離軸距離 Off-axis Distance (cm)', '歸一化劑量 Relative Dose (%)', xTicks, yTicks, [-16, 16], [0, 112]);

      const ffFn = (x) => {
        const r = Math.abs(x);
        const horn = 1 + hornFactor * Math.pow(Math.min(r, half) / half, 2);
        const edge = 1 / (1 + Math.exp((r - half) / penSlope));
        return Math.max(1.2, 99 * horn * edge);
      };
      const fffFn = (x) => {
        const r = Math.abs(x);
        const cone = 100 * Math.exp(-0.011 * r * r);
        const edge = 1 / (1 + Math.exp((r - half) / (penSlope * 0.88)));
        return Math.max(0.6, cone * edge);
      };

      // 計算中央 80% 平坦區 Flatness = (Dmax - Dmin)/(Dmax + Dmin) * 100%
      let dMax = 0;
      let dMin = 200;
      const flatLimit = half * 0.8;
      for (let t = 0; t <= 40; t++) {
        const x = (t / 40) * flatLimit;
        const v = ffFn(x);
        if (v > dMax) dMax = v;
        if (v < dMin) dMin = v;
      }
      const flatness = ((dMax - dMin) / (dMax + dMin)) * 100;
      // 80%-20% 物理半影近似: ln(4)*2 * slope ≈ 2.77 * penSlope (cm) -> mm
      const penumbraMm = 2.77 * penSlope * 10;

      let body = grid;
      body += `<line x1="${pad.left}" y1="${yMap(50).toFixed(1)}" x2="${pad.left + plotW}" y2="${yMap(50).toFixed(1)}" stroke="var(--text-dark)" stroke-dasharray="2 3" stroke-width="1"/>`;
      body += `<line x1="${xMap(half).toFixed(1)}" y1="${pad.top}" x2="${xMap(half).toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--warning)" stroke-dasharray="4 3" stroke-width="1.2"/>`;
      body += `<line x1="${xMap(-half).toFixed(1)}" y1="${pad.top}" x2="${xMap(-half).toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--warning)" stroke-dasharray="4 3" stroke-width="1.2"/>`;

      body += `<path d="${this._samplePath(ffFn, -16, 16, 200, xMap, yMap)}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>`;
      if (showFFF) {
        body += `<path d="${this._samplePath(fffFn, -16, 16, 200, xMap, yMap)}" fill="none" stroke="var(--success)" stroke-width="2" stroke-dasharray="5 3"/>`;
      }

      const px = xMap(probeX);
      const ffVal = ffFn(probeX);
      const fffVal = fffFn(probeX);
      body += `<line x1="${px.toFixed(1)}" y1="${pad.top}" x2="${px.toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--text-muted)" stroke-dasharray="3 3"/>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${yMap(ffVal).toFixed(1)}" r="4" fill="var(--accent)" stroke="var(--bg-primary)" stroke-width="1.5"/>`;
      if (showFFF) {
        body += `<circle cx="${px.toFixed(1)}" cy="${yMap(fffVal).toFixed(1)}" r="4" fill="var(--success)" stroke="var(--bg-primary)" stroke-width="1.5"/>`;
      }

      body += `<text x="${pad.left + 10}" y="${pad.top + 14}" fill="var(--accent)" font-size="10.5">── FF 整平射束</text>`;
      if (showFFF) body += `<text x="${pad.left + 10}" y="${pad.top + 30}" fill="var(--success)" font-size="10.5">- - FFF 無整平濾器</text>`;

      const readouts = [
        { label: '離軸位置 x', value: `${probeX.toFixed(1)} cm`, tone: 'accent' },
        { label: 'FF / FFF 劑量', value: showFFF ? `${ffVal.toFixed(1)}% / ${fffVal.toFixed(1)}%` : `${ffVal.toFixed(1)}%`, tone: 'neutral' },
        { label: 'FF 平坦度 (80%)', value: `${flatness.toFixed(2)} %`, tone: flatness <= 3.0 ? 'success' : 'warning' },
        { label: '80%–20% 半影', value: `${penumbraMm.toFixed(1)} mm`, tone: 'neutral' }
      ];

      const controls = [
        { kind: 'range', param: 'fieldSize', label: '標稱照野寬度', min: 4, max: 28, step: 2, unit: 'cm', format: (v) => `${v}×${v}` },
        { kind: 'range', param: 'depth', label: '掃描深度 d', min: 1.5, max: 20, step: 0.5, unit: 'cm', format: (v) => v.toFixed(1) },
        { kind: 'range', param: 'probeX', label: '離軸探針 x', min: -16, max: 16, step: 0.5, unit: 'cm', format: (v) => v.toFixed(1) },
        { kind: 'toggle', param: 'showFFF', label: '疊加 FFF 射束比較' }
      ];

      return {
        svg: this._svgShell(`0 0 ${w} ${h}`, '', body, this._probeAttrsX(pad, plotW, [-16, 16], 'probeX')),
        readouts,
        controls
      };
    },

    // 3. 幾何半影動態射線光學台
    geometric_penumbra(s) {
      const srcMm = Number(s.s || 2.0);
      const scd = Number(s.scd || 50);
      const ssd = Number(s.ssd || 100);
      const d = Number(s.d ?? 10);

      const pgMm = srcMm * ((ssd + d - scd) / scd);
      const totalDist = ssd + d;

      // 依真實比例映射 Y 軸：ySrc=24 到 yTarget=226
      const ySrc = 26;
      const yMax = 224;
      const scaleY = (yMax - ySrc) / Math.max(totalDist, 125);
      const yCol = ySrc + scd * scaleY;
      const ySkin = ySrc + ssd * scaleY;
      const yDepth = ySrc + totalDist * scaleY;

      // 視覺放大射源寬度以便清晰觀察切線 (1mm -> 8px)
      const halfSrcPx = srcMm * 4.2;
      const cx = 250;
      const srcL = cx - halfSrcPx;
      const srcR = cx + halfSrcPx;
      // 準直儀半開口 (固定在 ±65px * scd/50 讓整體照野視覺穩定)
      const colHalf = 48 * (scd / 50);
      const colL = cx - colHalf;
      const colR = cx + colHalf;

      // 由準直儀開口決定四條真實幾何切線在 yDepth 上的投影點
      const proj = (x1, y1, x2, y2, yT) => x1 + ((x2 - x1) * (yT - y1)) / (y2 - y1);
      const innerL = proj(srcL, ySrc, colL, yCol, yDepth);
      const outerL = proj(srcR, ySrc, colL, yCol, yDepth);
      const innerR = proj(srcR, ySrc, colR, yCol, yDepth);
      const outerR = proj(srcL, ySrc, colR, yCol, yDepth);

      const pgWidthPxL = Math.max(1, innerL - outerL);
      const pgWidthPxR = Math.max(1, outerR - innerR);

      const body = `
        <line x1="250" y1="${ySrc}" x2="250" y2="${yDepth + 6}" stroke="var(--text-dark)" stroke-dasharray="2 3"/>
        <line x1="${srcL.toFixed(1)}" y1="${ySrc}" x2="${srcR.toFixed(1)}" y2="${ySrc}" stroke="var(--warning)" stroke-width="5" stroke-linecap="round"/>
        <text x="250" y="15" text-anchor="middle" fill="var(--warning)" font-size="10.5" font-family="var(--font-mono)">射源直徑 s = ${srcMm.toFixed(1)} mm</text>

        <rect x="${(colL - 70).toFixed(1)}" y="${(yCol - 5).toFixed(1)}" width="70" height="10" fill="var(--bg-raised)" stroke="var(--border-strong)"/>
        <rect x="${colR.toFixed(1)}" y="${(yCol - 5).toFixed(1)}" width="70" height="10" fill="var(--bg-raised)" stroke="var(--border-strong)"/>
        <text x="${(colR + 76).toFixed(1)}" y="${(yCol + 4).toFixed(1)}" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">準直儀 (SCD=${scd}cm)</text>

        <line x1="88" y1="${ySkin.toFixed(1)}" x2="412" y2="${ySkin.toFixed(1)}" stroke="var(--border-strong)" stroke-width="1.5"/>
        <text x="416" y="${(ySkin + 4).toFixed(1)}" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">皮膚 SSD=${ssd}</text>

        <line x1="88" y1="${yDepth.toFixed(1)}" x2="412" y2="${yDepth.toFixed(1)}" stroke="var(--accent)" stroke-width="1.3" stroke-dasharray="4 3"/>
        <text x="416" y="${(yDepth + 4).toFixed(1)}" fill="var(--accent)" font-size="10" font-family="var(--font-mono)">深度 d=${d}cm</text>

        <line x1="${srcL.toFixed(1)}" y1="${ySrc}" x2="${innerL.toFixed(1)}" y2="${yDepth.toFixed(1)}" stroke="var(--accent)" stroke-width="1.4"/>
        <line x1="${srcR.toFixed(1)}" y1="${ySrc}" x2="${outerL.toFixed(1)}" y2="${yDepth.toFixed(1)}" stroke="var(--danger)" stroke-width="1.4" stroke-dasharray="4 2"/>
        <line x1="${srcR.toFixed(1)}" y1="${ySrc}" x2="${innerR.toFixed(1)}" y2="${yDepth.toFixed(1)}" stroke="var(--accent)" stroke-width="1.4"/>
        <line x1="${srcL.toFixed(1)}" y1="${ySrc}" x2="${outerR.toFixed(1)}" y2="${yDepth.toFixed(1)}" stroke="var(--danger)" stroke-width="1.4" stroke-dasharray="4 2"/>

        <rect x="${outerL.toFixed(1)}" y="${(yDepth - 4).toFixed(1)}" width="${pgWidthPxL.toFixed(1)}" height="8" fill="var(--danger-subtle)" stroke="var(--danger)"/>
        <rect x="${innerR.toFixed(1)}" y="${(yDepth - 4).toFixed(1)}" width="${pgWidthPxR.toFixed(1)}" height="8" fill="var(--danger-subtle)" stroke="var(--danger)"/>
        <text x="${((outerL + innerL) / 2).toFixed(1)}" y="${(yDepth + 18).toFixed(1)}" text-anchor="middle" fill="var(--danger)" font-size="10" font-family="var(--font-mono)">Pg=${pgMm.toFixed(2)}mm</text>
        <text x="${((innerR + outerR) / 2).toFixed(1)}" y="${(yDepth + 18).toFixed(1)}" text-anchor="middle" fill="var(--danger)" font-size="10" font-family="var(--font-mono)">Pg=${pgMm.toFixed(2)}mm</text>

        <line x1="68" y1="${ySrc}" x2="68" y2="${yCol.toFixed(1)}" stroke="var(--text-muted)" stroke-width="1.1" marker-start="url(#mp-arrow)" marker-end="url(#mp-arrow)"/>
        <text x="62" y="${((ySrc + yCol) / 2 + 3).toFixed(1)}" text-anchor="end" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">SCD</text>
        <line x1="42" y1="${ySrc}" x2="42" y2="${ySkin.toFixed(1)}" stroke="var(--text-muted)" stroke-width="1.1" marker-start="url(#mp-arrow)" marker-end="url(#mp-arrow)"/>
        <text x="36" y="${((ySrc + ySkin) / 2 + 3).toFixed(1)}" text-anchor="end" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">SSD</text>
      `;

      return {
        svg: this._svgShell('0 0 500 256', '', body),
        readouts: [
          { label: '幾何半影 Pg', value: `${pgMm.toFixed(2)} mm`, tone: pgMm > 3.5 ? 'danger' : 'accent' },
          { label: '準直距離比例 (SSD+d-SCD)/SCD', value: ((ssd + d - scd) / scd).toFixed(2), tone: 'neutral' },
          { label: '射源至量測點距離', value: `${totalDist.toFixed(0)} cm`, tone: 'neutral' }
        ],
        controls: [
          { kind: 'range', param: 's', label: '射源有效直徑 s', min: 0.5, max: 5.0, step: 0.5, unit: 'mm', format: (v) => v.toFixed(1) },
          { kind: 'range', param: 'scd', label: '射源至準直儀距離 SCD', min: 30, max: 75, step: 1, unit: 'cm' },
          { kind: 'range', param: 'ssd', label: '射源至皮膚距離 SSD', min: 80, max: 120, step: 2, unit: 'cm' },
          { kind: 'range', param: 'd', label: '評估深度 d', min: 0, max: 25, step: 1, unit: 'cm' }
        ]
      };
    },

    // 4. 相鄰照野發散銜接與表面間隙
    field_matching(s) {
      const l1 = Number(s.l1 || 20);
      const l2 = Number(s.l2 || 20);
      const ssd = Number(s.ssd || 100);
      const d = Number(s.d || 10);
      const actualGap = Number(s.actualGap ?? 2.0);

      const half1 = 0.5 * l1 * (d / ssd);
      const half2 = 0.5 * l2 * (d / ssd);
      const idealGap = half1 + half2;
      const diff = actualGap - idealGap;
      const denom = 0.5 * (l1 + l2);
      const matchDepth = denom > 0 ? (actualGap * ssd) / denom : 0;

      // 統一幾何比例 (水平 4.2 px/cm, 垂直 3.4 px/cm)，自射束準直後下方視窗繪製以維持真直線交會
      const pxPerCm = 4.2;
      const scaleY = 3.4;
      const ySkin = 136;
      const ySrc = ySkin - ssd * scaleY; // 虛擬射源實際延長線位置
      const yCol = 20;                   // 截斷視窗頂部 (準直後射束進入)
      const yDepth = Math.min(226, ySkin + d * scaleY);

      const skinGapPx = actualGap * pxPerCm;
      const w1Skin = l1 * pxPerCm;
      const w2Skin = l2 * pxPerCm;
      const cx = 250;

      const gapL = cx - skinGapPx / 2;
      const gapR = cx + skinGapPx / 2;
      const x1Center = gapL - w1Skin / 2;
      const x2Center = gapR + w2Skin / 2;

      const projX = (xs, xSkin, yT) => xs + ((xSkin - xs) * (yT - ySrc)) / (ySkin - ySrc);
      const f1L_top = projX(x1Center, gapL - w1Skin, yCol);
      const f1R_top = projX(x1Center, gapL, yCol);
      const f2L_top = projX(x2Center, gapR, yCol);
      const f2R_top = projX(x2Center, gapR + w2Skin, yCol);

      const f1L_d = projX(x1Center, gapL - w1Skin, yDepth);
      const f1R_d = projX(x1Center, gapL, yDepth);
      const f2L_d = projX(x2Center, gapR, yDepth);
      const f2R_d = projX(x2Center, gapR + w2Skin, yDepth);

      const yMatch = ySkin + matchDepth * scaleY;
      const xMatch = projX(x1Center, gapL, yMatch);

      let overlapShape = '';
      let statusTone = 'success';
      let statusText = '於深度 d 精準銜接';

      if (diff < -0.05) {
        statusTone = 'danger';
        statusText = `淺層重疊熱點 (交於 ${matchDepth.toFixed(1)} cm)`;
        if (yMatch < yDepth) {
          overlapShape = `<polygon points="${xMatch.toFixed(1)},${yMatch.toFixed(1)} ${f2L_d.toFixed(1)},${yDepth.toFixed(1)} ${f1R_d.toFixed(1)},${yDepth.toFixed(1)}" fill="var(--danger-subtle)" stroke="var(--danger)" stroke-width="1.6"/>
            <text x="250" y="${Math.min(yDepth - 6, yMatch + 15).toFixed(1)}" text-anchor="middle" fill="var(--danger)" font-size="10" font-weight="600">Hot Spot 重疊區</text>`;
        }
      } else if (diff > 0.05) {
        statusTone = 'warning';
        const gapAtD = (f2L_d - f1R_d) / pxPerCm;
        statusText = `深層冷點缺口 ${Math.max(0, gapAtD).toFixed(2)} cm`;
        overlapShape = `<polygon points="${gapL.toFixed(1)},${ySkin} ${gapR.toFixed(1)},${ySkin} ${f2L_d.toFixed(1)},${yDepth.toFixed(1)} ${f1R_d.toFixed(1)},${yDepth.toFixed(1)}" fill="var(--warning-subtle)" stroke="var(--warning)" stroke-dasharray="3 2" stroke-width="1.2"/>
          <text x="250" y="${((ySkin + yDepth) / 2 + 4).toFixed(1)}" text-anchor="middle" fill="var(--warning)" font-size="10" font-weight="600">Cold Spot 間隙</text>`;
      }

      const body = `
        <text x="${((f1L_top + f1R_top) / 2).toFixed(1)}" y="14" text-anchor="middle" fill="var(--accent)" font-size="10" font-weight="600">Field 1 (L₁=${l1}cm)</text>
        <text x="${((f2L_top + f2R_top) / 2).toFixed(1)}" y="14" text-anchor="middle" fill="var(--success)" font-size="10" font-weight="600">Field 2 (L₂=${l2}cm)</text>

        <polygon points="${f1L_top.toFixed(1)},${yCol} ${f1R_top.toFixed(1)},${yCol} ${f1R_d.toFixed(1)},${yDepth.toFixed(1)} ${f1L_d.toFixed(1)},${yDepth.toFixed(1)}" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="1.3"/>
        <polygon points="${f2L_top.toFixed(1)},${yCol} ${f2R_top.toFixed(1)},${yCol} ${f2R_d.toFixed(1)},${yDepth.toFixed(1)} ${f2L_d.toFixed(1)},${yDepth.toFixed(1)}" fill="var(--success-subtle)" stroke="var(--success)" stroke-width="1.3"/>
        ${overlapShape}

        <line x1="24" y1="${ySkin}" x2="476" y2="${ySkin}" stroke="var(--border-strong)" stroke-width="1.5"/>
        <text x="28" y="${ySkin - 8}" fill="var(--text-muted)" font-size="10">皮膚表面 (SSD=${ssd}cm)</text>
        <line x1="${gapL.toFixed(1)}" y1="${ySkin}" x2="${gapR.toFixed(1)}" y2="${ySkin}" stroke="var(--danger)" stroke-width="4"/>
        <text x="250" y="${ySkin - 10}" text-anchor="middle" fill="var(--danger)" font-size="10.5" font-weight="600" font-family="var(--font-mono)">Gap = ${actualGap.toFixed(2)} cm</text>

        <line x1="24" y1="${yDepth.toFixed(1)}" x2="476" y2="${yDepth.toFixed(1)}" stroke="var(--accent)" stroke-dasharray="4 3" stroke-width="1.2"/>
        ${yMatch <= 238 ? `<circle cx="${xMatch.toFixed(1)}" cy="${yMatch.toFixed(1)}" r="4" fill="var(--warning)" stroke="var(--bg-primary)" stroke-width="1.2"/>` : ''}
        <text x="250" y="${(yDepth + 16).toFixed(1)}" text-anchor="middle" fill="var(--text-main)" font-size="10">目標深度 d = ${d} cm · 兩照野幾何交會深度 = ${matchDepth.toFixed(1)} cm</text>
      `;

      return {
        svg: this._svgShell('0 0 500 265', '', body),
        readouts: [
          { label: '理想表面間隙 ΔG', value: `${idealGap.toFixed(2)} cm`, tone: 'accent' },
          { label: '實際間隙 / 交會深度', value: `${actualGap.toFixed(2)} cm / ${matchDepth.toFixed(1)} cm`, tone: 'neutral' },
          { label: '劑量銜接狀態', value: statusText, tone: statusTone }
        ],
        controls: [
          { kind: 'range', param: 'l1', label: '照野 1 長度 L₁', min: 10, max: 36, step: 2, unit: 'cm' },
          { kind: 'range', param: 'l2', label: '照野 2 長度 L₂', min: 10, max: 36, step: 2, unit: 'cm' },
          { kind: 'range', param: 'd', label: '目標深度 d', min: 4, max: 20, step: 1, unit: 'cm' },
          { kind: 'range', param: 'actualGap', label: '實際表面間隙 Gap', min: 0, max: 8, step: 0.1, unit: 'cm', format: (v) => v.toFixed(2) },
          { kind: 'action', action: 'apply_ideal_gap', label: '自動套用理想間隙 ΔG' }
        ]
      };
    },

    // 5. TG-51 / TRS-398 校正配置與溫壓修正
    tg51_setup(s) {
      const protocol = s.protocol === 'TRS-398' ? 'TRS-398' : 'TG-51';
      const setup = s.setup === 'SAD' ? 'SAD' : 'SSD';
      const dref = Number(s.dref || 10);
      const rcav = Number(s.rcav || 3.1);
      const temp = Number(s.temp ?? 22.0);
      const press = Number(s.press ?? 101.33);

      const shiftFactor = protocol === 'TRS-398' ? 0.5 : 0.6;
      const pEffMm = shiftFactor * rcav;
      const t0 = protocol === 'TRS-398' ? 20.0 : 22.0;
      const p0 = protocol === 'TRS-398' ? 101.325 : 101.33;
      const pTP = ((273.2 + temp) / (273.2 + t0)) * (p0 / press);

      const ySrc = 22;
      const yChamber = setup === 'SAD' ? 186 : 128 + dref * 5.2;
      const yWater = setup === 'SAD' ? yChamber - dref * 5.2 : 128;

      const body = `
        <circle cx="250" cy="${ySrc}" r="5" fill="var(--warning)"/>
        <text x="262" y="${ySrc + 4}" fill="var(--text-main)" font-size="11" font-weight="600">Target / Source</text>
        <rect x="175" y="44" width="52" height="12" fill="var(--bg-raised)" stroke="var(--border-strong)"/>
        <rect x="273" y="44" width="52" height="12" fill="var(--bg-raised)" stroke="var(--border-strong)"/>
        <text x="333" y="54" fill="var(--text-muted)" font-size="10">Jaws (10×10 cm²)</text>

        <polygon points="250,${ySrc} 166,248 334,248" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4 3"/>
        <line x1="250" y1="${ySrc}" x2="250" y2="250" stroke="var(--text-dark)" stroke-dasharray="2 3" stroke-width="1"/>

        <rect x="115" y="${yWater.toFixed(1)}" width="270" height="${(248 - yWater).toFixed(1)}" rx="4" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="1.5"/>
        <text x="125" y="${(yWater + 16).toFixed(1)}" fill="var(--accent)" font-size="10.5" font-weight="600">Water Phantom (水假體)</text>

        <rect x="228" y="${(yChamber - 7).toFixed(1)}" width="44" height="14" rx="7" fill="var(--bg-primary)" stroke="var(--text-main)" stroke-width="1.8"/>
        <line x1="272" y1="${yChamber.toFixed(1)}" x2="365" y2="${yChamber.toFixed(1)}" stroke="var(--text-main)" stroke-width="2.5"/>
        <circle cx="250" cy="${yChamber.toFixed(1)}" r="2.6" fill="var(--warning)"/>
        <circle cx="250" cy="${(yChamber - 5).toFixed(1)}" r="2.6" fill="var(--success)"/>

        <line x1="88" y1="${ySrc}" x2="88" y2="${(setup === 'SAD' ? yChamber : yWater).toFixed(1)}" stroke="var(--text-muted)" stroke-width="1.2" marker-start="url(#mp-arrow)" marker-end="url(#mp-arrow)"/>
        <text x="80" y="${((ySrc + (setup === 'SAD' ? yChamber : yWater)) / 2 + 3).toFixed(1)}" text-anchor="end" fill="var(--text-main)" font-size="10.5" font-family="var(--font-mono)">${setup} = 100 cm</text>

        <line x1="145" y1="${yWater.toFixed(1)}" x2="145" y2="${yChamber.toFixed(1)}" stroke="var(--accent)" stroke-width="1.2" marker-start="url(#mp-arrow-accent)" marker-end="url(#mp-arrow-accent)"/>
        <text x="152" y="${((yWater + yChamber) / 2 + 4).toFixed(1)}" fill="var(--accent)" font-size="10.5" font-family="var(--font-mono)">d_ref = ${dref} cm</text>

        <line x1="255" y1="${(yChamber - 6).toFixed(1)}" x2="310" y2="${(yChamber - 22).toFixed(1)}" stroke="var(--success)" stroke-width="1"/>
        <text x="314" y="${(yChamber - 19).toFixed(1)}" fill="var(--success)" font-size="10" font-family="var(--font-mono)">P_eff 上游 ${shiftFactor} r_cav (${pEffMm.toFixed(2)} mm)</text>
      `;

      return {
        svg: this._svgShell('0 0 500 265', '', body),
        readouts: [
          { label: `參考基準 (${protocol})`, value: `T₀=${t0}°C · P₀=${p0} kPa`, tone: 'neutral' },
          { label: '有效量測點上游偏移 P_eff', value: `${pEffMm.toFixed(2)} mm (${shiftFactor} r_cav)`, tone: 'success' },
          { label: '溫壓修正因子 P_TP', value: pTP.toFixed(4), tone: Math.abs(pTP - 1) > 0.05 ? 'warning' : 'accent' }
        ],
        controls: [
          { kind: 'choice', param: 'protocol', label: '劑量協定', options: [{ value: 'TG-51', label: 'AAPM TG-51 (22°C)' }, { value: 'TRS-398', label: 'IAEA TRS-398 (20°C)' }] },
          { kind: 'choice', param: 'setup', label: '量測幾何', options: [{ value: 'SSD', label: 'SSD 100 cm' }, { value: 'SAD', label: 'SAD 100 cm' }] },
          { kind: 'range', param: 'rcav', label: '游離腔內半徑 r_cav', min: 1.5, max: 4.5, step: 0.1, unit: 'mm', format: (v) => v.toFixed(1) },
          { kind: 'range', param: 'dref', label: '參考深度 d_ref', min: 5, max: 15, step: 1, unit: 'cm' },
          { kind: 'range', param: 'temp', label: '室溫/水溫 T', min: 16, max: 28, step: 0.5, unit: '°C', format: (v) => v.toFixed(1) },
          { kind: 'range', param: 'press', label: '氣壓 P', min: 95, max: 105, step: 0.2, unit: 'kPa', format: (v) => v.toFixed(1) }
        ]
      };
    },

    // 6. TG-43 極座標線射源幾何因子模擬
    tg43_geometry(s) {
      const L = Number(s.L || 3.5);
      const r = Number(s.r || 2.0);
      const thetaDeg = Number(s.theta || 45);
      const thetaRad = (thetaDeg * Math.PI) / 180;

      const px = r * Math.cos(thetaRad);
      const py = Math.max(0.05, r * Math.sin(thetaRad));
      const a1 = Math.atan2(py, px - L / 2);
      const a2 = Math.atan2(py, px + L / 2);
      const beta = Math.abs(a1 - a2);

      // 依 TG-43：θ = 0° 或 180° 沿縱軸極限值為 1 / (r² - L²/4)
      const sinT = Math.sin(thetaRad);
      const gVal = sinT > 0.02
        ? beta / (L * r * sinT)
        : 1 / Math.max(0.05, Math.abs(r * r - (L * L) / 4));
      const beta0 = 2 * Math.atan(L / 2);
      const gRef = beta0 / L;
      const gRel = gVal / gRef;

      const ox = 230;
      const oy = 195;
      const scale = 34; // 1 cm -> 34 px
      const x1 = ox - (L / 2) * scale;
      const x2 = ox + (L / 2) * scale;
      const ptX = ox + px * scale;
      const ptY = oy - py * scale;
      const refY = oy - 1.0 * scale;

      const arcR = 28;
      const arcX = ox + arcR * Math.cos(thetaRad);
      const arcY = oy - arcR * Math.sin(thetaRad);

      const body = `
        <line x1="55" y1="${oy}" x2="435" y2="${oy}" stroke="var(--border-strong)" stroke-width="1.3"/>
        <line x1="${ox}" y1="228" x2="${ox}" y2="20" stroke="var(--border-strong)" stroke-width="1.3"/>
        <text x="440" y="${oy + 4}" fill="var(--text-muted)" font-size="10">0°</text>
        <text x="${ox}" y="14" text-anchor="middle" fill="var(--text-muted)" font-size="10">90°</text>

        <line x1="${x1.toFixed(1)}" y1="${oy}" x2="${x2.toFixed(1)}" y2="${oy}" stroke="var(--warning)" stroke-width="6" stroke-linecap="round"/>
        <text x="${ox}" y="${oy + 18}" text-anchor="middle" fill="var(--warning)" font-size="10.5" font-family="var(--font-mono)">活性長度 L = ${L.toFixed(1)} cm</text>

        <line x1="${ox}" y1="${oy}" x2="${ptX.toFixed(1)}" y2="${ptY.toFixed(1)}" stroke="var(--accent)" stroke-width="2"/>
        <line x1="${x1.toFixed(1)}" y1="${oy}" x2="${ptX.toFixed(1)}" y2="${ptY.toFixed(1)}" stroke="var(--text-muted)" stroke-width="1.2" stroke-dasharray="4 3"/>
        <line x1="${x2.toFixed(1)}" y1="${oy}" x2="${ptX.toFixed(1)}" y2="${ptY.toFixed(1)}" stroke="var(--text-muted)" stroke-width="1.2" stroke-dasharray="4 3"/>

        <path d="M ${ox + arcR} ${oy} A ${arcR} ${arcR} 0 0 0 ${arcX.toFixed(1)} ${arcY.toFixed(1)}" fill="none" stroke="var(--success)" stroke-width="1.6"/>
        <text x="${(ox + 34).toFixed(1)}" y="${(oy - 10).toFixed(1)}" fill="var(--success)" font-size="10.5" font-family="var(--font-mono)">θ=${thetaDeg}°</text>

        <circle cx="${ox}" cy="${refY.toFixed(1)}" r="3.5" fill="var(--success)"/>
        <text x="${ox - 8}" y="${(refY - 6).toFixed(1)}" text-anchor="end" fill="var(--success)" font-size="9.5" font-family="var(--font-mono)">P₀(1cm, 90°)</text>

        <circle cx="${ptX.toFixed(1)}" cy="${ptY.toFixed(1)}" r="5.5" fill="var(--accent)" stroke="var(--bg-primary)" stroke-width="1.5"/>
        <text x="${(ptX + 8).toFixed(1)}" y="${(ptY - 6).toFixed(1)}" fill="var(--accent)" font-size="10.5" font-weight="600" font-family="var(--font-mono)">P(${r.toFixed(1)}, ${thetaDeg}°)</text>
      `;

      return {
        svg: this._svgShell('0 0 500 245', '', body, `data-probe-mode="polar_tg43" data-origin-x="${ox}" data-origin-y="${oy}" data-scale="${scale}"`),
        readouts: [
          { label: '端點張角 β', value: `${((beta * 180) / Math.PI).toFixed(1)}° (${beta.toFixed(3)} rad)`, tone: 'warning' },
          { label: '幾何因子 G_L(r,θ)', value: `${gVal.toFixed(4)} cm⁻²`, tone: 'accent' },
          { label: '相對參考點 G_L / G_L(1,90°)', value: gRel.toFixed(4), tone: 'success' }
        ],
        controls: [
          { kind: 'range', param: 'L', label: '活性長度 L', min: 1.0, max: 5.0, step: 0.5, unit: 'cm', format: (v) => v.toFixed(1) },
          { kind: 'range', param: 'r', label: '中心徑距 r (或直接拖曳點 P)', min: 0.5, max: 5.0, step: 0.1, unit: 'cm', format: (v) => v.toFixed(1) },
          { kind: 'range', param: 'theta', label: '極角 θ', min: 10, max: 170, step: 5, unit: '°' }
        ]
      };
    },

    // 7. LQ 細胞存活曲線與 BED / EQD2
    lq_survival(s) {
      const abTumor = Number(s.abTumor || 10);
      const abLate = Number(s.abLate || 3);
      const dFrac = Math.max(1.5, Math.min(12, Number(s.dFrac || 2.0)));
      const nFrac = Number(s.nFrac || 30);
      const showHighLet = s.showHighLet !== false;

      const totalD = dFrac * nFrac;
      const bedTumor = totalD * (1 + dFrac / abTumor);
      const bedLate = totalD * (1 + dFrac / abLate);
      const eqd2Tumor = totalD * ((dFrac + abTumor) / (2 + abTumor));
      const eqd2Late = totalD * ((dFrac + abLate) / (2 + abLate));

      const pad = { top: 24, right: 24, bottom: 44, left: 56 };
      const w = 520;
      const h = 265;
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      const xTicks = [0, 2, 4, 6, 8, 10, 12].map((v) => ({ val: v, label: `${v}` }));
      const yTicks = [
        { val: 0, label: '1.0' },
        { val: -1, label: '10⁻¹' },
        { val: -2, label: '10⁻²' },
        { val: -3, label: '10⁻³' }
      ];
      const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '單次分次劑量 Dose / fraction (Gy)', '細胞存活分率 SF (log₁₀)', xTicks, yTicks, [0, 12], [-3.2, 0.1]);

      const aT = 0.28;
      const bT = aT / abTumor;
      const aL = 0.14;
      const bL = aL / abLate;

      const earlyFn = (D) => -(aT * D + bT * D * D) / Math.LN10;
      const lateFn = (D) => -(aL * D + bL * D * D) / Math.LN10;
      const highLetFn = (D) => -(0.62 * D) / Math.LN10;

      let body = grid;
      body += `<path d="${this._samplePath(earlyFn, 0, 12, 160, xMap, yMap)}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>`;
      body += `<path d="${this._samplePath(lateFn, 0, 12, 160, xMap, yMap)}" fill="none" stroke="var(--warning)" stroke-width="2"/>`;
      if (showHighLet) {
        body += `<path d="${this._samplePath(highLetFn, 0, 11.5, 100, xMap, yMap)}" fill="none" stroke="var(--danger)" stroke-width="2" stroke-dasharray="5 3"/>`;
      }

      const px = xMap(Math.min(12, dFrac));
      body += `<line x1="${px.toFixed(1)}" y1="${pad.top}" x2="${px.toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--text-muted)" stroke-dasharray="3 3"/>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${yMap(Math.max(-3.2, earlyFn(dFrac))).toFixed(1)}" r="4" fill="var(--accent)"/>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${yMap(Math.max(-3.2, lateFn(dFrac))).toFixed(1)}" r="4" fill="var(--warning)"/>`;

      const lx = pad.left + plotW - 195;
      body += `<text x="${lx}" y="${pad.top + 14}" fill="var(--accent)" font-size="10">── 腫瘤/早反應 (α/β=${abTumor})</text>`;
      body += `<text x="${lx}" y="${pad.top + 30}" fill="var(--warning)" font-size="10">── 晚反應正常組織 (α/β=${abLate})</text>`;
      if (showHighLet) body += `<text x="${lx}" y="${pad.top + 46}" fill="var(--danger)" font-size="10">- - 高 LET (無肩區)</text>`;

      return {
        svg: this._svgShell(`0 0 ${w} ${h}`, '', body, this._probeAttrsX(pad, plotW, [0, 12], 'dFrac')),
        readouts: [
          { label: '總物理劑量 (n × d)', value: `${totalD.toFixed(1)} Gy (${nFrac} fx)`, tone: 'neutral' },
          { label: '腫瘤 BED / EQD₂', value: `${bedTumor.toFixed(1)} / ${eqd2Tumor.toFixed(1)} Gy`, tone: 'accent' },
          { label: '晚反應組織 BED / EQD₂', value: `${bedLate.toFixed(1)} / ${eqd2Late.toFixed(1)} Gy`, tone: dFrac > 4 ? 'danger' : 'warning' }
        ],
        controls: [
          { kind: 'range', param: 'dFrac', label: '單次劑量 d', min: 1.5, max: 12, step: 0.5, unit: 'Gy', format: (v) => v.toFixed(1) },
          { kind: 'range', param: 'nFrac', label: '分次數 n', min: 1, max: 35, step: 1, unit: 'fx' },
          { kind: 'range', param: 'abTumor', label: '腫瘤 α/β', min: 5, max: 20, step: 1, unit: 'Gy' },
          { kind: 'range', param: 'abLate', label: '晚反應 α/β', min: 1.5, max: 6, step: 0.5, unit: 'Gy', format: (v) => v.toFixed(1) },
          { kind: 'toggle', param: 'showHighLet', label: '顯示高 LET 直線' }
        ]
      };
    },

    // 8. 放射性母子核衰變平衡與乳牛淘洗
    decay(s) {
      const t1 = Number(s.t1 || 66);
      const t2 = Number(s.t2 || 6);
      const eluteAt = Number(s.eluteAt || 0);
      const probeT = Math.max(0, Math.min(72, Number(s.probeT ?? 22.9)));

      const l1 = Math.LN2 / t1;
      const l2 = Math.LN2 / Math.max(0.1, t2);
      const sameLambda = Math.abs(l2 - l1) < 1e-4;

      const parentFn = (t) => Math.exp(-l1 * t);
      const daughterFn = (t) => {
        if (eluteAt > 0 && t >= eluteAt) {
          const dt = t - eluteAt;
          const a1Elute = Math.exp(-l1 * eluteAt);
          if (sameLambda) return a1Elute * l1 * dt * Math.exp(-l1 * dt);
          return (l2 / (l2 - l1)) * a1Elute * (Math.exp(-l1 * dt) - Math.exp(-l2 * dt));
        }
        if (sameLambda) return l1 * t * Math.exp(-l1 * t);
        return (l2 / (l2 - l1)) * (Math.exp(-l1 * t) - Math.exp(-l2 * t));
      };

      const tMax = !sameLambda && t1 > t2 ? Math.log(l2 / l1) / (l2 - l1) : null;
      const regimeLabel = t1 > t2 * 15 ? '永恆平衡 (Secular)' : (t1 > t2 ? '瞬態平衡 (Transient)' : '無平衡 (T₁ ≤ T₂)');

      const pad = { top: 24, right: 24, bottom: 44, left: 54 };
      const w = 520;
      const h = 265;
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      const maxT = 72;
      const xTicks = [0, 12, 24, 36, 48, 60, 72].map((v) => ({ val: v, label: `${v}h` }));
      const yTicks = [0, 0.25, 0.5, 0.75, 1.0, 1.2].map((v) => ({ val: v, label: `${v.toFixed(2)}` }));
      const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '經過時間 Time (hours)', '相對活度 A(t) / A₁(0)', xTicks, yTicks, [0, maxT], [0, 1.25]);

      let body = grid;
      body += `<path d="${this._samplePath(parentFn, 0, maxT, 180, xMap, yMap)}" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-dasharray="5 3"/>`;
      body += `<path d="${this._samplePath(daughterFn, 0, maxT, 220, xMap, yMap)}" fill="none" stroke="var(--accent)" stroke-width="2.4"/>`;

      if (eluteAt > 0) {
        const ex = xMap(eluteAt);
        body += `<line x1="${ex.toFixed(1)}" y1="${pad.top}" x2="${ex.toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--danger)" stroke-dasharray="3 2"/>`;
        body += `<text x="${(ex + 5).toFixed(1)}" y="${pad.top + 14}" fill="var(--danger)" font-size="9.5">24h 淘洗歸零</text>`;
      }

      if (tMax && tMax <= maxT) {
        const tx = xMap(tMax);
        const ty = yMap(Math.min(1.25, (l2 / (l2 - l1)) * (Math.exp(-l1 * tMax) - Math.exp(-l2 * tMax))));
        body += `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="3.5" fill="var(--warning)"/>`;
        body += `<text x="${(tx + 6).toFixed(1)}" y="${(ty - 6).toFixed(1)}" fill="var(--warning)" font-size="9.5" font-family="var(--font-mono)">t_max=${tMax.toFixed(1)}h</text>`;
      }

      const px = xMap(probeT);
      const a1 = parentFn(probeT);
      const a2 = daughterFn(probeT);
      body += `<line x1="${px.toFixed(1)}" y1="${pad.top}" x2="${px.toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--text-muted)" stroke-dasharray="3 3"/>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${yMap(a1).toFixed(1)}" r="3.5" fill="var(--text-muted)"/>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${yMap(Math.min(1.25, a2)).toFixed(1)}" r="4" fill="var(--accent)" stroke="var(--bg-primary)" stroke-width="1.5"/>`;

      const lx = pad.left + plotW - 188;
      body += `<text x="${lx}" y="${pad.top + 14}" fill="var(--text-muted)" font-size="10">- - 母核 T½=${t1}h</text>`;
      body += `<text x="${lx}" y="${pad.top + 30}" fill="var(--accent)" font-size="10">── 子核 T½=${t2}h</text>`;

      return {
        svg: this._svgShell(`0 0 ${w} ${h}`, '', body, this._probeAttrsX(pad, plotW, [0, maxT], 'probeT')),
        readouts: [
          { label: '平衡類型', value: regimeLabel, tone: 'neutral' },
          { label: `時間 t=${probeT.toFixed(1)}h 活度`, value: `母 ${a1.toFixed(3)} · 子 ${a2.toFixed(3)}`, tone: 'accent' },
          { label: '首次達峰時間 t_max', value: tMax ? `${tMax.toFixed(1)} h` : '—', tone: 'warning' }
        ],
        controls: [
          { kind: 'range', param: 'probeT', label: '時間探針 t', min: 0, max: 72, step: 0.5, unit: 'h', format: (v) => v.toFixed(1) },
          { kind: 'range', param: 't1', label: '母核半衰期 T₁', min: 8, max: 200, step: 2, unit: 'h' },
          { kind: 'range', param: 't2', label: '子核半衰期 T₂', min: 1, max: 24, step: 1, unit: 'h' },
          { kind: 'action', action: 'preset_transient', label: '⁹⁹Mo/⁹⁹ᵐTc 瞬態' },
          { kind: 'action', action: 'preset_secular', label: '永恆平衡' },
          { kind: 'action', action: 'toggle_elute', label: eluteAt ? '取消 24h 淘洗' : '執行 24h 淘洗' }
        ]
      };
    },

    // 9. HVL / TVL 窄與寬射束衰減
    attenuation(s) {
      const hvl1 = Number(s.hvl1 || 3.0);
      const hardening = Number(s.hardening ?? 0.15);
      const buildup = Number(s.buildup ?? 0.45);
      const probeX = Math.max(0, Math.min(hvl1 * 4, Number(s.probeX ?? hvl1)));

      const mu = Math.LN2 / hvl1;
      const tvl = 3.3219 * hvl1;
      const maxX = hvl1 * 4;

      const narrowFn = (x) => 100 * Math.exp(-mu * x);
      const broadFn = (x) => Math.min(105, 100 * (1 + buildup * mu * x) * Math.exp(-mu * x * (1 - hardening)));

      const pad = { top: 24, right: 24, bottom: 44, left: 54 };
      const w = 520;
      const h = 265;
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      const xTicks = [0, 1, 2, 3, 4].map((n) => ({ val: n * hvl1, label: n === 0 ? '0' : `${n} HVL` }));
      const yTicks = [0, 25, 50, 75, 100].map((v) => ({ val: v, label: `${v}%` }));
      const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '屏蔽厚度 Thickness (cm)', '穿透射束強度 I / I₀ (%)', xTicks, yTicks, [0, maxX], [0, 105]);

      let body = grid;
      body += `<path d="${this._samplePath(narrowFn, 0, maxX, 160, xMap, yMap)}" fill="none" stroke="var(--accent)" stroke-width="2.3"/>`;
      body += `<path d="${this._samplePath(broadFn, 0, maxX, 160, xMap, yMap)}" fill="none" stroke="var(--warning)" stroke-width="2" stroke-dasharray="5 3"/>`;

      const px = xMap(probeX);
      const nVal = narrowFn(probeX);
      const bVal = broadFn(probeX);
      body += `<line x1="${px.toFixed(1)}" y1="${pad.top}" x2="${px.toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--text-muted)" stroke-dasharray="3 3"/>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${yMap(nVal).toFixed(1)}" r="4" fill="var(--accent)"/>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${yMap(bVal).toFixed(1)}" r="4" fill="var(--warning)"/>`;

      const lx = pad.left + plotW - 185;
      body += `<text x="${lx}" y="${pad.top + 14}" fill="var(--accent)" font-size="10">── 窄射束 (Narrow Beam)</text>`;
      body += `<text x="${lx}" y="${pad.top + 30}" fill="var(--warning)" font-size="10">- - 寬射束 (含散射 B > 1)</text>`;

      return {
        svg: this._svgShell(`0 0 ${w} ${h}`, '', body, this._probeAttrsX(pad, plotW, [0, maxX], 'probeX')),
        readouts: [
          { label: `厚度 x = ${probeX.toFixed(2)} cm`, value: `${(probeX / hvl1).toFixed(2)} HVL`, tone: 'neutral' },
          { label: '窄射束 / 寬射束穿透率', value: `${nVal.toFixed(1)}% / ${bVal.toFixed(1)}%`, tone: 'accent' },
          { label: 'μ / 1 TVL', value: `${mu.toFixed(3)} cm⁻¹ / ${tvl.toFixed(1)} cm`, tone: 'warning' }
        ],
        controls: [
          { kind: 'range', param: 'probeX', label: '厚度探針 x', min: 0, max: Number(maxX.toFixed(2)), step: 0.2, unit: 'cm', format: (v) => Math.min(v, maxX).toFixed(2) },
          { kind: 'range', param: 'hvl1', label: '第一半值層 HVL₁', min: 1.0, max: 5.0, step: 0.2, unit: 'cm', format: (v) => v.toFixed(1) },
          { kind: 'range', param: 'buildup', label: '寬射束散射增建係數', min: 0, max: 0.8, step: 0.05, format: (v) => v.toFixed(2) },
          { kind: 'range', param: 'hardening', label: '能譜硬化程度', min: 0, max: 0.35, step: 0.05, format: (v) => `${Math.round(v * 100)}%` }
        ]
      };
    },

    // 10. 組織不均勻界面效應
    inhomogeneity_slab(s) {
      const energy = s.energy === '18MV' ? '18MV' : '6MV';
      const field = s.field === '3x3' ? '3x3' : '10x10';
      const rhoLung = Number(s.rhoLung ?? 0.25);
      const rhoBone = Number(s.rhoBone ?? 1.85);

      // 物理效應強度：高能量 + 小照野 + 低肺密度 -> 側向電子失衡越劇烈
      const disEq = (energy === '18MV' ? 1.45 : 0.85) * (field === '3x3' ? 1.6 : 0.75) * (0.45 / Math.max(0.1, rhoLung));
      const lungDrop = Math.min(36, Math.round(disEq * 10));
      const boneSpike = Math.round((rhoBone - 1.0) * (energy === '18MV' ? 12 : 9));

      // 動態計算劑量曲線 y 值 (基準線約 y=135)
      const yLungDip = Math.min(182, 138 + lungDrop * 1.15);
      const yBonePeak = Math.max(108, 138 - boneSpike * 1.2);
      const yDistal = 152 + (rhoBone - 1.3) * 14;

      const body = `
        <line x1="28" y1="115" x2="86" y2="115" stroke="var(--accent)" stroke-width="3" marker-end="url(#mp-arrow-accent)"/>
        <text x="18" y="96" fill="var(--accent)" font-size="10.5" font-weight="600">${energy} (${field} cm²)</text>

        <rect x="92" y="38" width="76" height="154" fill="var(--accent-subtle)" stroke="var(--border-strong)"/>
        <text x="130" y="58" text-anchor="middle" fill="var(--text-main)" font-size="10.5">水 / 軟組織</text>
        <text x="130" y="73" text-anchor="middle" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">ρ = 1.00</text>

        <rect x="168" y="38" width="112" height="154" fill="var(--warning-subtle)" stroke="var(--warning)" stroke-dasharray="4 3"/>
        <text x="224" y="58" text-anchor="middle" fill="var(--warning)" font-size="10.5">肺組織 (Lung)</text>
        <text x="224" y="73" text-anchor="middle" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">ρ = ${rhoLung.toFixed(2)} g/cm³</text>

        <rect x="280" y="38" width="62" height="154" fill="var(--bg-raised)" stroke="var(--text-main)"/>
        <text x="311" y="58" text-anchor="middle" fill="var(--text-main)" font-size="10.5">皮質骨</text>
        <text x="311" y="73" text-anchor="middle" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">ρ = ${rhoBone.toFixed(2)}</text>

        <rect x="342" y="38" width="132" height="154" fill="var(--accent-subtle)" stroke="var(--border-strong)"/>
        <text x="408" y="58" text-anchor="middle" fill="var(--text-main)" font-size="10.5">水 / 遠端組織</text>

        <path d="M 92 150 Q 130 128 168 136 L 210 ${yLungDip.toFixed(1)} L 280 140 L 298 ${yBonePeak.toFixed(1)} L 342 ${yDistal.toFixed(1)} L 474 ${(yDistal + 14).toFixed(1)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
        <text x="224" y="183" text-anchor="middle" fill="var(--danger)" font-size="9.5">電子失衡 (-${lungDrop}%)</text>
        <text x="311" y="${(yBonePeak - 8).toFixed(1)}" text-anchor="middle" fill="var(--success)" font-size="9.5">背散射 +${boneSpike}%</text>
      `;

      return {
        svg: this._svgShell('0 0 500 208', '', body),
        readouts: [
          { label: '肺內劑量跌落 (電子失衡)', value: `-${lungDrop} %`, tone: lungDrop >= 18 ? 'danger' : 'warning' },
          { label: '骨界面背散射增建', value: `+${boneSpike} %`, tone: 'success' },
          { label: '臨床算法警示', value: field === '3x3' && energy === '18MV' ? '必須使用 Type-B (AAA/AXB)' : 'ETAR/AAA 適用', tone: 'accent' }
        ],
        controls: [
          { kind: 'choice', param: 'energy', label: '光子能量', options: [{ value: '6MV', label: '6 MV' }, { value: '18MV', label: '18 MV (長電子射程)' }] },
          { kind: 'choice', param: 'field', label: '照野大小', options: [{ value: '10x10', label: '10×10 cm²' }, { value: '3x3', label: '3×3 cm² (小照野)' }] },
          { kind: 'range', param: 'rhoLung', label: '肺組織密度', min: 0.1, max: 0.5, step: 0.05, unit: 'g/cm³', format: (v) => v.toFixed(2) },
          { kind: 'range', param: 'rhoBone', label: '皮質骨密度', min: 1.3, max: 2.0, step: 0.05, unit: 'g/cm³', format: (v) => v.toFixed(2) }
        ]
      };
    },

    // 11. 直線加速器機頭互動剖面
    linac_head(s) {
      const mode = ['photon_ff', 'photon_fff', 'electron'].includes(s.mode) ? s.mode : 'photon_ff';
      const part = s.selectedPart || 'filter_foil';
      const isPhoton = mode !== 'electron';
      const isFF = mode === 'photon_ff';

      const partInfo = {
        gun: { title: '電子加速與彎曲磁鐵 (Electron Beam & Bending Magnet)', desc: '270° 消色差彎曲磁鐵聚焦電子束進入機頭；TG-142 要求每月能量穩定度與光學射束對齊核對。' },
        target: { title: '高原子序靶 (X-ray Target, W/Cu)', desc: isPhoton ? '電子撞擊鎢靶產生制動輻射 (Bremsstrahlung) 光子。' : '電子模式已移出路徑！若安全聯鎖失效誤插入靶將導致劑量驟降與異常高能電子散射。' },
        primary_coll: { title: '主準直儀 (Primary Collimator)', desc: '鎢合金圓錐開口定義最大可用圓形射束錐角 (約 28°)。' },
        filter_foil: {
          title: mode === 'photon_ff' ? '整平濾器 (Flattening Filter)' : (mode === 'photon_fff' ? 'FFF 無整平濾器開孔 (Open Port)' : '雙散射箔 (Dual Scattering Foil)'),
          desc: mode === 'photon_ff'
            ? '圓錐形高 Z 金屬濾器吸收中心過強的前向制動光子並造成 off-axis 能量微幅軟化，產生平坦剖面 (Horns)。'
            : (mode === 'photon_fff'
              ? '移開整平濾器使中心劑量率提升 2–4 倍 (1400–2400 MU/min) 並減少機頭散射與漏射，適用 SBRT。'
              : '極薄低 Z 箔片將細電子束均勻展寬覆蓋治療照野，同時將制動輻射污染降至最低。')
        },
        ion_chamber: { title: '雙通道監測游離腔 (Dual Monitor Ion Chamber)', desc: '密封式平行板腔即時監測 MU 輸出、劑量率、平坦度與對稱性；TG-142 每日輸出誤差容許 ±3%。' },
        jaws_mlc: { title: '二級準直儀與多葉準直儀 (Jaws & MLC)', desc: '塑形臨床照野與執行 IMRT/VMAT 動態調強；TG-142 規範葉片位置再現性 ±1 mm。' },
        applicator: { title: '電子限光筒 (Electron Applicator / Cone)', desc: isPhoton ? '光子模式不使用；外掛時可將病人表面附近空氣中大角度散射電子擋除。' : '延伸至距離皮膚 5 cm (SSD=100cm)，大幅降低空氣散射造成之幾何半影膨脹。' }
      };

      const sel = (k) => (part === k ? 'stroke="var(--accent)" stroke-width="2.4"' : 'stroke="var(--border-strong)" stroke-width="1.3"');
      const beamColor = mode === 'electron' ? 'var(--success)' : (mode === 'photon_fff' ? 'var(--warning)' : 'var(--accent)');

      const body = `
        <g data-part="gun" style="cursor:pointer">
          <rect x="220" y="14" width="60" height="22" rx="4" fill="var(--bg-raised)" ${sel('gun')}/>
          <text x="250" y="29" text-anchor="middle" fill="var(--text-main)" font-size="10">電子束入窗</text>
        </g>
        <line x1="250" y1="36" x2="250" y2="232" stroke="${beamColor}" stroke-width="${mode === 'photon_fff' ? 3.5 : 2}" stroke-dasharray="${isPhoton ? '' : '4 3'}" opacity="0.7"/>

        <g data-part="target" style="cursor:pointer">
          <rect x="${isPhoton ? 218 : 138}" y="54" width="64" height="12" rx="2" fill="var(--warning)" opacity="${isPhoton ? 0.9 : 0.35}" ${sel('target')}/>
          <text x="${isPhoton ? 292 : 128}" y="64" text-anchor="${isPhoton ? 'start' : 'end'}" fill="var(--warning)" font-size="10">${isPhoton ? 'X-ray Target (插入)' : 'Target (已移出)'}</text>
        </g>

        <g data-part="primary_coll" style="cursor:pointer">
          <polygon points="178,78 228,78 216,104 178,104" fill="var(--bg-raised)" ${sel('primary_coll')}/>
          <polygon points="322,78 272,78 284,104 322,104" fill="var(--bg-raised)" ${sel('primary_coll')}/>
          <text x="330" y="95" fill="var(--text-muted)" font-size="10">主準直儀</text>
        </g>

        <g data-part="filter_foil" style="cursor:pointer">
          ${isFF
            ? `<polygon points="250,108 214,132 286,132" fill="var(--accent)" opacity="0.85" ${sel('filter_foil')}/><text x="296" y="125" fill="var(--accent)" font-size="10.5">Flattening Filter (整平濾器)</text>`
            : (mode === 'photon_fff'
              ? `<rect x="218" y="114" width="64" height="14" fill="transparent" stroke-dasharray="4 3" ${sel('filter_foil')}/><text x="296" y="125" fill="var(--warning)" font-size="10.5">FFF Open Port (濾器移開)</text>`
              : `<line x1="215" y1="120" x2="285" y2="120" stroke="var(--success)" stroke-width="4"/><rect x="212" y="114" width="76" height="12" fill="transparent" ${sel('filter_foil')}/><text x="296" y="124" fill="var(--success)" font-size="10.5">Scattering Foil (散射箔)</text>`)
          }
        </g>

        <g data-part="ion_chamber" style="cursor:pointer">
          <rect x="200" y="144" width="100" height="12" rx="2" fill="var(--bg-primary)" ${sel('ion_chamber')}/>
          <text x="308" y="154" fill="var(--text-main)" font-size="10">Monitor Ion Chamber</text>
        </g>

        <g data-part="jaws_mlc" style="cursor:pointer">
          <rect x="175" y="170" width="44" height="16" fill="var(--bg-raised)" ${sel('jaws_mlc')}/>
          <rect x="281" y="170" width="44" height="16" fill="var(--bg-raised)" ${sel('jaws_mlc')}/>
          <text x="333" y="182" fill="var(--text-muted)" font-size="10">Jaws & MLC</text>
        </g>

        ${!isPhoton ? `
          <g data-part="applicator" style="cursor:pointer">
            <path d="M 212 194 L 198 240 M 288 194 L 302 240" stroke="var(--success)" stroke-width="3"/>
            <rect x="195" y="194" width="110" height="46" fill="transparent" ${sel('applicator')}/>
            <text x="312" y="224" fill="var(--success)" font-size="10.5">Electron Applicator (限光筒)</text>
          </g>` : ''}
      `;

      const info = partInfo[part] || partInfo.filter_foil;
      return {
        svg: this._svgShell('0 0 500 250', '', body),
        readouts: [
          { label: '射束模式', value: mode === 'photon_ff' ? '光子 FF (600 MU/min)' : (mode === 'photon_fff' ? '光子 FFF (1400–2400 MU/min)' : '電子模式 (散射箔)'), tone: 'accent' },
          { label: '選中組件', value: info.title.split('(')[0].trim(), tone: 'neutral' }
        ],
        inspector: `<strong>${info.title}</strong><div style="margin-top:4px;color:var(--text-muted);">${info.desc}</div>`,
        controls: [
          {
            kind: 'choice',
            param: 'mode',
            label: '切換直線加速器運作模式（點擊機頭元件看詳解）',
            options: [
              { value: 'photon_ff', label: '光子 FF' },
              { value: 'photon_fff', label: '光子 FFF' },
              { value: 'electron', label: '電子模式' }
            ]
          }
        ]
      };
    },

    // 12. IMRT Gamma Index 2D 互動儀
    gamma_index(s) {
      const ddTol = Number(s.ddTol || 3);
      const dtaTol = Number(s.dtaTol || 3);
      const dr = Math.max(-6, Math.min(6, Number(s.dr ?? 1.8)));
      const dd = Math.max(-6, Math.min(6, Number(s.dd ?? 2.0)));

      const gamma = Math.sqrt(Math.pow(dr / dtaTol, 2) + Math.pow(dd / ddTol, 2));
      const pass = gamma <= 1.0;

      const cx = 250;
      const cy = 128;
      const scaleX = 28; // 1mm -> 28px (±6mm)
      const scaleY = 18; // 1% -> 18px (±6%)

      const rx = dtaTol * scaleX;
      const ry = ddTol * scaleY;
      const px = cx + dr * scaleX;
      const py = cy - dd * scaleY;

      const body = `
        <line x1="72" y1="${cy}" x2="428" y2="${cy}" stroke="var(--border-strong)" stroke-width="1.3" marker-end="url(#mp-arrow)"/>
        <line x1="${cx}" y1="234" x2="${cx}" y2="20" stroke="var(--border-strong)" stroke-width="1.3" marker-end="url(#mp-arrow)"/>
        <text x="432" y="${cy + 4}" fill="var(--text-main)" font-size="10">Δr (mm)</text>
        <text x="${cx}" y="13" text-anchor="middle" fill="var(--text-main)" font-size="10">ΔD (%)</text>

        <ellipse cx="${cx}" cy="${cy}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="2"/>
        <text x="${(cx + rx + 6).toFixed(1)}" y="${cy + 14}" fill="var(--accent)" font-size="9.5" font-family="var(--font-mono)">+${dtaTol}mm</text>
        <text x="${cx + 8}" y="${(cy - ry - 4).toFixed(1)}" fill="var(--accent)" font-size="9.5" font-family="var(--font-mono)">+${ddTol}%</text>

        <line x1="${cx}" y1="${cy}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="${pass ? 'var(--success)' : 'var(--danger)'}" stroke-width="2" ${pass ? '' : 'stroke-dasharray="4 3"'}/>
        <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5.5" fill="${pass ? 'var(--success)' : 'var(--danger)'}" stroke="var(--bg-primary)" stroke-width="1.5"/>
        <text x="${(px + 8).toFixed(1)}" y="${(py - 6).toFixed(1)}" fill="${pass ? 'var(--success)' : 'var(--danger)'}" font-size="10.5" font-weight="600" font-family="var(--font-mono)">γ = ${gamma.toFixed(2)}</text>
      `;

      const pad = { top: cy - 6 * scaleY, left: cx - 6 * scaleX };
      return {
        svg: this._svgShell('0 0 500 245', '', body, this._probeAttrsXY(pad, 12 * scaleX, 12 * scaleY, [-6, 6], [-6, 6], 'dr', 'dd')),
        readouts: [
          { label: '測試點 (Δr, ΔD)', value: `(${dr.toFixed(1)} mm, ${dd.toFixed(1)} %)`, tone: 'neutral' },
          { label: 'Gamma 指數 γ', value: gamma.toFixed(3), tone: pass ? 'success' : 'danger' },
          { label: `驗證判定 (${ddTol}% / ${dtaTol}mm)`, value: pass ? 'PASS (γ ≤ 1.0)' : 'FAIL (γ > 1.0)', tone: pass ? 'success' : 'danger' }
        ],
        controls: [
          { kind: 'choice', param: 'ddTol', label: '劑量差容許 ΔD', options: [{ value: 3, label: '3%' }, { value: 2, label: '2%' }, { value: 1, label: '1%' }] },
          { kind: 'choice', param: 'dtaTol', label: '距離吻合 DTA', options: [{ value: 3, label: '3 mm' }, { value: 2, label: '2 mm' }, { value: 1, label: '1 mm' }] },
          { kind: 'range', param: 'dr', label: '空間距離誤差 Δr (或拖曳圖面紅/綠點)', min: -6, max: 6, step: 0.2, unit: 'mm', format: (v) => v.toFixed(1) },
          { kind: 'range', param: 'dd', label: '劑量差異 ΔD', min: -6, max: 6, step: 0.2, unit: '%', format: (v) => v.toFixed(1) }
        ]
      };
    },

    // 13. CTDI 劑量假體與 DLP 計算
    ctdi_phantom(s) {
      const isHead = s.phantom === 'head';
      const ctdiC = Number(s.ctdiC ?? 24);
      const ctdiP = Number(s.ctdiP ?? 32);
      const pitch = Number(s.pitch ?? 1.0);
      const scanLen = Number(s.scanLen ?? 30);
      const hole = s.selectedHole === 'periphery' ? 'periphery' : 'center';

      const ctdiW = (1 / 3) * ctdiC + (2 / 3) * ctdiP;
      const ctdiVol = ctdiW / pitch;
      const dlp = ctdiVol * scanLen;
      const kFactor = isHead ? 0.0021 : 0.015;
      const effDose = dlp * kFactor;

      const rPx = isHead ? 56 : 90;
      const cx = 160;
      const cy = 124;
      const pOffset = rPx - 14;

      const body = `
        <circle cx="${cx}" cy="${cy}" r="${rPx}" fill="var(--accent-subtle)" stroke="var(--accent)" stroke-width="2"/>
        <circle cx="${cx}" cy="${cy}" r="${pOffset}" fill="none" stroke="var(--border-color)" stroke-dasharray="3 3"/>
        <text x="${cx}" y="236" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="600">${isHead ? 'Head 16 cm PMMA' : 'Body 32 cm PMMA'}</text>

        <g data-part="center" data-part-key="selectedHole" style="cursor:pointer">
          <circle cx="${cx}" cy="${cy}" r="9" fill="var(--bg-primary)" stroke="${hole === 'center' ? 'var(--warning)' : 'var(--text-muted)'}" stroke-width="${hole === 'center' ? 3 : 1.8}"/>
          <text x="${cx}" y="${cy - 14}" text-anchor="middle" fill="var(--warning)" font-size="9.5" font-family="var(--font-mono)">Center (⅓)</text>
        </g>

        <g data-part="periphery" data-part-key="selectedHole" style="cursor:pointer">
          <circle cx="${cx}" cy="${cy - pOffset}" r="7.5" fill="var(--bg-primary)" stroke="${hole === 'periphery' ? 'var(--success)' : 'var(--text-muted)'}" stroke-width="${hole === 'periphery' ? 2.6 : 1.8}"/>
          <circle cx="${cx + pOffset}" cy="${cy}" r="7.5" fill="var(--bg-primary)" stroke="${hole === 'periphery' ? 'var(--success)' : 'var(--text-muted)'}" stroke-width="${hole === 'periphery' ? 2.6 : 1.8}"/>
          <circle cx="${cx}" cy="${cy + pOffset}" r="7.5" fill="var(--bg-primary)" stroke="${hole === 'periphery' ? 'var(--success)' : 'var(--text-muted)'}" stroke-width="${hole === 'periphery' ? 2.6 : 1.8}"/>
          <circle cx="${cx - pOffset}" cy="${cy}" r="7.5" fill="var(--bg-primary)" stroke="${hole === 'periphery' ? 'var(--success)' : 'var(--text-muted)'}" stroke-width="${hole === 'periphery' ? 2.6 : 1.8}"/>
          <text x="${cx}" y="${cy - pOffset - 11}" text-anchor="middle" fill="var(--success)" font-size="9.5" font-family="var(--font-mono)">Periphery 4孔 (⅔)</text>
        </g>

        <rect x="280" y="34" width="204" height="176" rx="8" fill="var(--bg-secondary)" stroke="var(--border-strong)"/>
        <text x="294" y="58" fill="var(--accent)" font-size="11" font-weight="600">AAPM Report 96 即時算式</text>
        <text x="294" y="84" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">CTDIw = ⅓(${ctdiC}) + ⅔(${ctdiP})</text>
        <text x="294" y="102" fill="var(--text-main)" font-size="11" font-weight="600" font-family="var(--font-mono)">      = ${ctdiW.toFixed(1)} mGy</text>
        <text x="294" y="130" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">CTDIvol = ${ctdiW.toFixed(1)} / ${pitch.toFixed(2)}</text>
        <text x="294" y="148" fill="var(--warning)" font-size="11" font-weight="600" font-family="var(--font-mono)">        = ${ctdiVol.toFixed(1)} mGy</text>
        <text x="294" y="176" fill="var(--text-muted)" font-size="10" font-family="var(--font-mono)">DLP = CTDIvol × ${scanLen} cm</text>
        <text x="294" y="194" fill="var(--success)" font-size="11" font-weight="600" font-family="var(--font-mono)">    = ${dlp.toFixed(0)} mGy·cm</text>
      `;

      return {
        svg: this._svgShell('0 0 500 250', '', body),
        inspector: hole === 'center'
          ? '<strong>中心孔 CTDI₁₀₀,c (權重 1/3)</strong>：於大體積假體受射束硬化與衰減影響較大，通常較外圍低。'
          : '<strong>外圍 4 孔平均 CTDI₁₀₀,p (權重 2/3)</strong>：位於距表面 1 cm 處之 12/3/6/9 點鐘方向，主導體表與加權劑量。',
        readouts: [
          { label: 'CTDIw / CTDIvol', value: `${ctdiW.toFixed(1)} / ${ctdiVol.toFixed(1)} mGy`, tone: 'accent' },
          { label: 'DLP (劑量長度乘積)', value: `${dlp.toFixed(0)} mGy·cm`, tone: 'warning' },
          { label: `推估有效劑量 (k=${kFactor})`, value: `${effDose.toFixed(2)} mSv`, tone: 'success' }
        ],
        controls: [
          { kind: 'choice', param: 'phantom', label: '假體規格', options: [{ value: 'head', label: 'Head 16 cm' }, { value: 'body', label: 'Body 32 cm' }] },
          { kind: 'range', param: 'pitch', label: '螺旋螺距 Pitch', min: 0.5, max: 2.0, step: 0.1, format: (v) => v.toFixed(1) },
          { kind: 'range', param: 'scanLen', label: '掃描長度 L', min: 10, max: 60, step: 5, unit: 'cm' },
          { kind: 'range', param: 'ctdiC', label: 'CTDI₁₀₀(center)', min: 10, max: 80, step: 2, unit: 'mGy' },
          { kind: 'range', param: 'ctdiP', label: 'CTDI₁₀₀(periphery)', min: 10, max: 80, step: 2, unit: 'mGy' }
        ]
      };
    },

    // 14. TCP / NTCP 治療視窗與缺氧 OER
    tcp_ntcp(s) {
      const dRx = Number(s.dRx ?? 62);
      const tcd50Base = Number(s.tcd50 ?? 50);
      const td50 = Number(s.td50 ?? 75);
      const hypoxic = Boolean(s.hypoxic);
      const tcd50 = hypoxic ? Math.min(95, tcd50Base * 1.32) : tcd50Base;

      const tcpFn = (d) => 100 / (1 + Math.exp(-(d - tcd50) / 5.2));
      const ntcpFn = (d) => 100 / (1 + Math.exp(-(d - td50) / 5.2));
      const pPlusFn = (d) => (tcpFn(d) * (100 - ntcpFn(d))) / 100;

      const tcpVal = tcpFn(dRx);
      const ntcpVal = ntcpFn(dRx);
      const pPlusVal = pPlusFn(dRx);
      const tr = td50 / tcd50;

      const pad = { top: 24, right: 24, bottom: 44, left: 54 };
      const w = 520;
      const h = 265;
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      const xTicks = [0, 20, 40, 60, 80, 100].map((v) => ({ val: v, label: `${v}` }));
      const yTicks = [0, 25, 50, 75, 100].map((v) => ({ val: v, label: `${v}%` }));
      const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '處方總劑量 Total Dose (Gy)', '反應機率 Probability (%)', xTicks, yTicks, [0, 100], [0, 105]);

      let body = grid;
      body += `<path d="${this._samplePath(tcpFn, 0, 100, 160, xMap, yMap)}" fill="none" stroke="var(--success)" stroke-width="2.3"/>`;
      body += `<path d="${this._samplePath(ntcpFn, 0, 100, 160, xMap, yMap)}" fill="none" stroke="var(--danger)" stroke-width="2.3"/>`;
      body += `<path d="${this._samplePath(pPlusFn, 0, 100, 160, xMap, yMap)}" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-dasharray="4 3"/>`;

      const px = xMap(dRx);
      body += `<line x1="${px.toFixed(1)}" y1="${pad.top}" x2="${px.toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--text-muted)" stroke-dasharray="3 3"/>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${yMap(tcpVal).toFixed(1)}" r="4" fill="var(--success)"/>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${yMap(ntcpVal).toFixed(1)}" r="4" fill="var(--danger)"/>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${yMap(pPlusVal).toFixed(1)}" r="4" fill="var(--accent)"/>`;

      body += `<text x="${pad.left + 8}" y="${pad.top + 14}" fill="var(--success)" font-size="10">── TCP</text>`;
      body += `<text x="${pad.left + 64}" y="${pad.top + 14}" fill="var(--danger)" font-size="10">── NTCP</text>`;
      body += `<text x="${pad.left + 126}" y="${pad.top + 14}" fill="var(--accent)" font-size="10">- - P₊ = TCP(1-NTCP)</text>`;

      return {
        svg: this._svgShell(`0 0 ${w} ${h}`, '', body, this._probeAttrsX(pad, plotW, [0, 100], 'dRx')),
        readouts: [
          { label: `處方劑量 D = ${dRx.toFixed(1)} Gy`, value: `TCP ${tcpVal.toFixed(1)}% · NTCP ${ntcpVal.toFixed(1)}%`, tone: ntcpVal > 10 ? 'danger' : 'success' },
          { label: '無併發症控制率 P₊', value: `${pPlusVal.toFixed(1)} %`, tone: 'accent' },
          { label: '治療比 (TD₅₀ / TCD₅₀)', value: tr.toFixed(2), tone: tr > 1.2 ? 'success' : 'warning' }
        ],
        controls: [
          { kind: 'range', param: 'dRx', label: '處方劑量 D (或拖曳圖面)', min: 30, max: 95, step: 1, unit: 'Gy' },
          { kind: 'range', param: 'tcd50', label: 'TCD₅₀', min: 35, max: 70, step: 1, unit: 'Gy' },
          { kind: 'range', param: 'td50', label: 'OAR TD₅₀', min: 55, max: 95, step: 1, unit: 'Gy' },
          { kind: 'toggle', param: 'hypoxic', label: '模擬腫瘤缺氧 (OER 右移)' }
        ]
      };
    },

    // 15. 光子交互作用相對優勢模擬 (Z vs hν)
    interaction_z_e(s) {
      const logE = Math.max(-2, Math.min(2, Number(s.logE ?? 0.78)));
      const z = Math.max(1, Math.min(92, Number(s.z ?? 7.4)));
      const energyMeV = Math.pow(10, logE);

      // 簡化定性物理截面積權重模型 (用以正確反映主導區分界線與相對佔比)
      const wPhoto = Math.pow(z, 3.2) / Math.pow(Math.max(0.01, energyMeV * 100), 2.9);
      const wCompton = 12 * (1 / (1 + 0.55 * energyMeV));
      const wPair = energyMeV > 1.022 ? 0.095 * z * Math.log(energyMeV / 1.022 + 0.08) * (energyMeV > 1.022 ? 1 : 0) : 0;
      const sum = wPhoto + wCompton + wPair || 1;
      const pPct = (wPhoto / sum) * 100;
      const cPct = (wCompton / sum) * 100;
      const ppPct = (wPair / sum) * 100;

      const dominant = pPct >= cPct && pPct >= ppPct
        ? '光電效應 (τ)'
        : (cPct >= ppPct ? '康普吞散射 (σ)' : '成對產生 (κ)');

      const pad = { top: 24, right: 24, bottom: 44, left: 54 };
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
      const { grid, xMap, yMap } = this._buildAxes(pad, plotW, plotH, '光子能量 hν (MeV, log)', '原子序 Atomic Number Z', xTicks, yTicks, [-2, 2], [0, 105]);

      const leftBound = (le) => Math.min(100, Math.max(4, 52 * Math.pow(10, 0.72 * (le + 0.65))));
      const rightBound = (le) => Math.min(100, Math.max(6, 95 - 52 * (le - 0.35)));

      let body = grid;
      body += `<path d="${this._samplePath(leftBound, -1.7, 0.05, 80, xMap, yMap)}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>`;
      body += `<path d="${this._samplePath(rightBound, 0.35, 1.85, 80, xMap, yMap)}" fill="none" stroke="var(--warning)" stroke-width="2.2"/>`;

      const zSoftY = yMap(7.4).toFixed(1);
      body += `<line x1="${pad.left}" y1="${zSoftY}" x2="${pad.left + plotW}" y2="${zSoftY}" stroke="var(--success)" stroke-dasharray="4 3" stroke-width="1.2"/>`;

      body += `<text x="${xMap(-1.3)}" y="${yMap(72)}" text-anchor="middle" fill="var(--accent)" font-size="10.5" font-weight="600">光電優勢區 (τ ∝ Z³/E³)</text>`;
      body += `<text x="${xMap(0.0)}" y="${yMap(44)}" text-anchor="middle" fill="var(--text-main)" font-size="10.5" font-weight="600">康普吞優勢區 (σ ∝ 電子密度)</text>`;
      body += `<text x="${xMap(1.38)}" y="${yMap(72)}" text-anchor="middle" fill="var(--warning)" font-size="10.5" font-weight="600">成對產生 (≥1.022 MeV)</text>`;

      const px = xMap(logE);
      const py = yMap(z);
      body += `<line x1="${px.toFixed(1)}" y1="${pad.top}" x2="${px.toFixed(1)}" y2="${pad.top + plotH}" stroke="var(--text-muted)" stroke-dasharray="2 3"/>`;
      body += `<line x1="${pad.left}" y1="${py.toFixed(1)}" x2="${pad.left + plotW}" y2="${py.toFixed(1)}" stroke="var(--text-muted)" stroke-dasharray="2 3"/>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5" fill="var(--danger)" stroke="var(--bg-primary)" stroke-width="1.5"/>`;

      const eDisp = energyMeV < 1 ? `${(energyMeV * 1000).toFixed(0)} keV` : `${energyMeV.toFixed(2)} MeV`;
      return {
        svg: this._svgShell(`0 0 ${w} ${h}`, '', body, this._probeAttrsXY(pad, plotW, plotH, [-2, 2], [0, 105], 'logE', 'z')),
        readouts: [
          { label: `座標 (hν, Z)`, value: `${eDisp} · Z=${z.toFixed(1)}`, tone: 'neutral' },
          { label: '主導作用機制', value: dominant, tone: 'accent' },
          { label: '相對比重 τ / σ / κ', value: `${pPct.toFixed(0)}% / ${cPct.toFixed(0)}% / ${ppPct.toFixed(0)}%`, tone: 'warning' }
        ],
        controls: [
          { kind: 'range', param: 'logE', label: '能量 log₁₀(MeV) (或拖曳相圖十字)', min: -2.0, max: 2.0, step: 0.05, format: () => eDisp },
          { kind: 'range', param: 'z', label: '吸收體原子序 Z', min: 1, max: 92, step: 0.5, format: (v) => v.toFixed(1) },
          { kind: 'action', action: 'preset_tissue_6mv', label: '軟組織 6 MV' },
          { kind: 'action', action: 'preset_bone_60kv', label: '骨骼 60 keV' },
          { kind: 'action', action: 'preset_lead_18mv', label: '鉛屏蔽 18 MV' }
        ]
      };
    },

    // 16. DICOM-RT 臨床工作流互動檢視器
    dicom_rt_flow(s) {
      const node = s.activeNode || 'plan';
      const nodes = {
        ct: {
          title: 'CT / MR Simulation (DICOM Image Storage)',
          sop: '1.2.840.10008.5.1.4.1.1.2 (CT Image Storage)',
          tags: '(0020,0052) Frame of Reference UID · (0018,0050) Slice Thickness · HU-to-RED Curve',
          qa: '確認掃描層厚、定位參考座標與電子密度校正曲線無誤。'
        },
        struct: {
          title: 'RT Structure Set (靶區與危及器官輪廓)',
          sop: '1.2.840.10008.5.1.4.1.1.481.3 (RT Structure Set)',
          tags: '(3006,0020) Structure Set ROI Sequence · (3006,0040) Contour Data',
          qa: '檢查 GTV/CTV/PTV 與 OAR 外擴邊界、布林聯集與病患體表 (External Body) 閉合。'
        },
        plan: {
          title: 'RT Plan (治療射束與 MLC 序列)',
          sop: '1.2.840.10008.5.1.4.1.1.481.5 (RT Plan Storage)',
          tags: '(300A,0070) Fraction Group · (300A,00B0) Beam Sequence · Isocenter / MU / MLC',
          qa: '核對處方次數、等中心座標、機架/準直儀角度與治療床碰撞餘裕。'
        },
        dose: {
          title: 'RT Dose (3D 劑量網格與 DVH)',
          sop: '1.2.840.10008.5.1.4.1.1.481.2 (RT Dose Storage)',
          tags: '(3004,000E) Dose Grid Scaling · (3004,0050) DVH Sequence',
          qa: '比對獨立 MU 驗算 (Secondary Check) 與 IMRT QA Gamma 通過率 ≥ 95%。'
        },
        ois: {
          title: 'OIS & Linac (RT Image / RT Treatment Record)',
          sop: '1.2.840.10008.5.1.4.1.1.481.4 (RT Treatment Record)',
          tags: '(3002,0002) RT Image (DRR/CBCT) · 實測傳送 MU 與聯鎖記錄',
          qa: '驗證 CBCT / KV 對位偏移校正後之 Record & Verify (R&V) 聯鎖一致。'
        }
      };

      const st = (k) => (node === k ? 'stroke="var(--accent)" stroke-width="2.4" fill="var(--accent-subtle)"' : 'stroke="var(--border-strong)" stroke-width="1.3" fill="var(--bg-secondary)"');
      const body = `
        <g data-part="ct" data-part-key="activeNode" style="cursor:pointer">
          <rect x="20" y="34" width="105" height="62" rx="8" ${st('ct')}/>
          <text x="72" y="58" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="600">CT / MR Sim</text>
          <text x="72" y="76" text-anchor="middle" fill="var(--accent)" font-size="9.5" font-family="var(--font-mono)">DICOM Image</text>
        </g>
        <line x1="125" y1="65" x2="152" y2="65" stroke="var(--text-muted)" stroke-width="1.5" marker-end="url(#mp-arrow)"/>

        <g data-part="struct" data-part-key="activeNode" style="cursor:pointer">
          <rect x="155" y="34" width="115" height="62" rx="8" ${st('struct')}/>
          <text x="212" y="58" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="600">RT Struct</text>
          <text x="212" y="76" text-anchor="middle" fill="var(--text-muted)" font-size="9.5">GTV / PTV / OAR</text>
        </g>
        <line x1="270" y1="65" x2="297" y2="65" stroke="var(--text-muted)" stroke-width="1.5" marker-end="url(#mp-arrow)"/>

        <rect x="300" y="18" width="182" height="94" rx="8" fill="var(--bg-primary)" stroke="var(--border-strong)"/>
        <text x="391" y="37" text-anchor="middle" fill="var(--text-muted)" font-size="10" font-weight="600">TPS 治療計劃系統</text>
        <g data-part="plan" data-part-key="activeNode" style="cursor:pointer">
          <rect x="310" y="46" width="77" height="52" rx="6" ${st('plan')}/>
          <text x="348" y="68" text-anchor="middle" fill="var(--warning)" font-size="10" font-weight="600" font-family="var(--font-mono)">RT Plan</text>
          <text x="348" y="84" text-anchor="middle" fill="var(--text-muted)" font-size="8.5">Beams / MLC</text>
        </g>
        <g data-part="dose" data-part-key="activeNode" style="cursor:pointer">
          <rect x="395" y="46" width="77" height="52" rx="6" ${st('dose')}/>
          <text x="433" y="68" text-anchor="middle" fill="var(--success)" font-size="10" font-weight="600" font-family="var(--font-mono)">RT Dose</text>
          <text x="433" y="84" text-anchor="middle" fill="var(--text-muted)" font-size="8.5">3D Grid / DVH</text>
        </g>

        <line x1="391" y1="112" x2="391" y2="146" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#mp-arrow-accent)"/>
        <g data-part="ois" data-part-key="activeNode" style="cursor:pointer">
          <rect x="155" y="148" width="327" height="54" rx="8" ${st('ois')}/>
          <text x="318" y="172" text-anchor="middle" fill="var(--text-main)" font-size="11" font-weight="600">腫瘤資訊系統 (OIS) & 直線加速器 (Linac / EPID)</text>
          <text x="318" y="190" text-anchor="middle" fill="var(--text-muted)" font-size="9.5" font-family="var(--font-mono)">RT Image (DRR / CBCT) + RT Treatment Record</text>
        </g>
      `;

      const cur = nodes[node] || nodes.plan;
      return {
        svg: this._svgShell('0 0 500 215', '', body),
        readouts: [
          { label: '選中 DICOM 物件', value: cur.title.split('(')[0].trim(), tone: 'accent' },
          { label: 'SOP Class UID', value: cur.sop.split(' ')[0], tone: 'neutral' }
        ],
        inspector: `<div><strong>${cur.title}</strong></div><div class="mono-num" style="font-size:11.5px;color:var(--accent);margin-top:4px;">關鍵 Tag：${cur.tags}</div><div style="margin-top:4px;color:var(--text-muted);">QA 核對：${cur.qa}</div>`,
        controls: [
          {
            kind: 'choice',
            param: 'activeNode',
            label: '點選架構圖節點或下方切換物件',
            options: [
              { value: 'ct', label: 'CT Image' },
              { value: 'struct', label: 'RT Struct' },
              { value: 'plan', label: 'RT Plan' },
              { value: 'dose', label: 'RT Dose' },
              { value: 'ois', label: 'OIS / Record' }
            ]
          }
        ]
      };
    }
  }
};
