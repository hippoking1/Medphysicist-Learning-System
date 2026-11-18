/**
 * 醫學物理師考照自學系統 - Gemini AI 服務層 (js/gemini.js)
 * 負責前端直連 Gemini REST API 進行出題、口試評分與 SM-2 閃卡提煉
 */

const GeminiService = {
  /**
   * 雙軌授權請求核心：優先使用 Google OAuth Access Token，失敗或未授權時無縫切換本機 Session API Key
   */
  async _fetchWithAuth(baseUrl, fetchOptions = {}, timeoutMs = 120000, overrideKey = '') {
    const oauthToken = overrideKey ? '' : (typeof getGoogleOAuthToken === 'function' ? getGoogleOAuthToken() : '');
    let apiKey = (overrideKey || DB.getGeminiKey() || '').trim();

    if (!oauthToken && !apiKey && typeof DB.trySilentBrowserAutofill === 'function') {
      await DB.trySilentBrowserAutofill(false);
      apiKey = (DB.getGeminiKey() || '').trim();
    }

    if (!oauthToken && !apiKey) {
      throw new Error('尚未授權 Gemini AI，請先登入 Google 帳號授權或於「系統設定」帶入 API Key。');
    }

    const doFetch = async (url, extraHeaders = {}) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const mergedHeaders = { ...(fetchOptions.headers || {}), ...extraHeaders };
        const res = await fetch(url, {
          ...fetchOptions,
          headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return res;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error(`Gemini API 請求逾時（超過 ${Math.round(timeoutMs / 1000)} 秒），建議減少單次出題數或切換至 Flash 模型後重試。`);
        }
        throw err;
      }
    };

    if (oauthToken) {
      try {
        const res = await doFetch(baseUrl, { Authorization: `Bearer ${oauthToken}` });
        if (res.ok || (res.status !== 401 && res.status !== 403)) {
          return res;
        }
        if (res.status === 401 && typeof clearGoogleOAuthToken === 'function') {
          clearGoogleOAuthToken();
        }
        if (!apiKey) {
          const errBody = await res.text().catch(() => '');
          throw new Error(`Google OAuth 授權無效或尚未於專案啟用 Generative Language API (HTTP ${res.status})。請重新授權或由 Google 密碼管理員帶入 API Key。${errBody ? '' : ''}`);
        }
      } catch (oauthErr) {
        if (!apiKey) {
          throw oauthErr.message && oauthErr.message.includes('OAuth')
            ? oauthErr
            : new Error(`Google OAuth 連線受阻 (${oauthErr.message || oauthErr})，建議於「系統設定」改由 Google 密碼管理員帶入 API Key`);
        }
      }
    }

    const sep = baseUrl.includes('?') ? '&' : '?';
    return await doFetch(`${baseUrl}${sep}key=${encodeURIComponent(apiKey)}`);
  },

  getAuthStatus() {
    const hasOAuth = typeof getGoogleOAuthToken === 'function' && Boolean(getGoogleOAuthToken());
    const hasSessionKey = Boolean(DB.getGeminiKey());
    if (hasOAuth && hasSessionKey) return { ready: true, mode: 'both', label: 'Google OAuth + Session Key' };
    if (hasOAuth) return { ready: true, mode: 'oauth', label: 'Google OAuth 免金鑰直連' };
    if (hasSessionKey) return { ready: true, mode: 'key', label: '本機 Session API Key' };
    return { ready: false, mode: 'none', label: '尚未授權' };
  },

  /**
   * 呼叫 Gemini REST API 的共用核心函數
   */
  async callGeminiAPI(prompt, systemInstruction, timeoutMs = 120000, extraParts = []) {
    const model = (await DB.getConfig('geminiModel')) || 'gemini-2.5-flash';
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const parts = Array.isArray(extraParts) && extraParts.length > 0
      ? [...extraParts, { text: prompt }]
      : [{ text: prompt }];

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7
      }
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    let response;
    try {
      response = await this._fetchWithAuth(
        baseUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        },
        timeoutMs
      );
    } catch (fetchErr) {
      if (fetchErr.message && (fetchErr.message.includes('逾時') || fetchErr.message.includes('授權'))) {
        throw fetchErr;
      }
      throw new Error('無法連線至 Gemini API: ' + fetchErr.message);
    }

    const responseText = await response.text();

    if (!response.ok) {
      let errMsg = `Gemini API 呼叫失敗 (HTTP ${response.status})`;
      try {
        const errJson = JSON.parse(responseText);
        if (errJson.error && errJson.error.message) {
          errMsg += `: ${errJson.error.message}`;
        }
      } catch (e) {}
      throw new Error(errMsg);
    }

    try {
      const resObj = JSON.parse(responseText);
      const textOut = resObj.candidates[0].content.parts[0].text;

      try {
        return JSON.parse(textOut.trim());
      } catch (err) {
        const repaired = this.repairJsonBackslashes(textOut.trim());
        return JSON.parse(repaired);
      }
    } catch (e) {
      console.error('[GeminiService] JSON 解析失敗，原始回應:', responseText);
      throw new Error('AI 回傳格式不符合預期 JSON: ' + e.message);
    }
  },

  /**
   * 根據主題與單元生成四選一單選練習題
   */
  async generateAIQuestions(moduleId, topicId, count = 5, difficulty = 2, unitId = null) {
    const syllabus = await DB.getSyllabus();

    let literatureList = '';
    let scopePrompt = '';

    if (unitId) {
      const matchedUnit = syllabus.find((u) => u.unitId === unitId);
      if (!matchedUnit) throw new Error('找不到匹配的單元：' + unitId);
      literatureList = `${matchedUnit.literature} (${matchedUnit.chapters})`;
      scopePrompt = `【指定學習單元】[${unitId}] ${matchedUnit.unitName}\n【參考文獻範疇】${matchedUnit.literature}\n【指定章節細目】${matchedUnit.chapters}`;
    } else {
      const matchedUnits = syllabus.filter((u) => u.moduleId === moduleId && u.topicId === topicId);
      if (matchedUnits.length === 0) throw new Error('找不到匹配的主題');
      const topicName = matchedUnits[0].topicName;
      literatureList = matchedUnits.map((u) => `${u.literature} (${u.chapters})`).join(', ');
      scopePrompt = `【主題名稱】${topicName}\n【參考文獻範疇】${literatureList}`;
    }

    const prompt = `請根據以下資訊生成 ${count} 道四選一單選題：
【醫學物理模組代碼】${moduleId}
${scopePrompt}
【難度等級】${difficulty} (1=基礎概念/觀念, 2=臨床計算/應用, 3=高難度複雜臨床判斷與推導)

你必須且只能回傳一個 JSON Array，格式如下：
[
  {
    "questionText": "題目敘述（繁體中文）...",
    "optionA": "選項 A...",
    "optionB": "選項 B...",
    "optionC": "選項 C...",
    "optionD": "選項 D...",
    "correctAnswer": "A",
    "explanation": "詳細的解析與計算推導步驟（繁體中文）...",
    "sourceRef": "具體參考文獻與章節節段（例如: TG-51 Sec. III）"
  }
]

請確保：
1. 題目符合中華民國醫學物理師證照考試（放射治療物理組）專業水準。
2. 若有計算題，公式與給定參數需完整、精確。
3. 選項具備合理誘答性，解析詳盡完整。
4. 【物理圖示規範 — 優先使用確定性繪圖引擎】：
   若題目或詳解需要附圖，若屬於以下標準類型，請勿手寫 SVG 座標，直接插入 \`<div class="mp-diagram" data-spec='{"type":"...","params":{...}}'></div>\` 呼叫前端物理繪圖引擎：
   - 深度劑量曲線: \`type: "pdd"\`, \`params: {"curves": ["photon_6mv" | "photon_18mv" | "electron_12mev" | "proton_pristine" | "proton_sobp"]}\`
   - 離軸剖面: \`type: "profile"\`, \`params: {"showFFF": true, "fieldSize": 10}\`
   - LQ 存活曲線: \`type: "lq_survival"\`, \`params: {}\`
   - 核種衰變平衡: \`type: "decay"\`, \`params: {"t1": 66, "t2": 6}\`
   - HVL 衰減曲線: \`type: "attenuation"\`, \`params: {"hvl1": 3.0, "showBroadBeam": true}\`
   - TG-51 / TRS-398 校正配置: \`type: "tg51_setup"\`, \`params: {"setup": "SSD"|"SAD", "dref": 10, "field": "10×10 cm²", "protocol": "TG-51"|"TRS-398"}\`
   - 幾何半影推導: \`type: "geometric_penumbra"\`, \`params: {"s": 2, "scd": 50, "ssd": 100, "d": 10}\`
   - 照野發散銜接: \`type: "field_matching"\`, \`params: {"l1": 20, "l2": 20, "d": 10}\`
   - TG-43 極座標: \`type: "tg43_geometry"\`, \`params: {"L": 3.0}\`
   - 組織不均勻界面: \`type: "inhomogeneity_slab"\`, \`params: {}\`
   - 直線加速器機頭: \`type: "linac_head"\`, \`params: {}\`
   若確實需要自訂 \`<svg>\`（非上述類型），顏色務必使用 \`currentColor\`（主文字/主線條）、\`var(--accent)\`（重點強調）與 \`var(--text-muted)\`（輔助線），絕對不可寫死白色 (#ffffff) 以相容深/淺色雙主題。
`;

    const systemInstruction =
      '你是一位資深醫學物理師與考照出題專家。你出題極度嚴謹，完全符合醫學物理學會認證考試的規範，且只以繁體中文與 JSON 陣列格式回傳。';

    const questions = await this.callGeminiAPI(prompt, systemInstruction);

    const processedQuestions = questions.map((q) => ({
      questionId: crypto.randomUUID(),
      moduleId,
      topicId,
      unitId: unitId || '',
      difficulty: Number(difficulty),
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      sourceRef: q.sourceRef || literatureList.substring(0, 100),
      source: 'ai',
      verified: false,
      createdAt: new Date().toISOString().split('T')[0]
    }));

    await DB.insertQuestions(processedQuestions);
    return processedQuestions;
  },

  /**
   * 生成口試模擬題目
   */
  async generateOralQuestionAI(moduleId, questionType) {
    const syllabus = await DB.getSyllabus();
    const matchedUnits = syllabus.filter((u) => u.moduleId === moduleId);
    if (matchedUnits.length === 0) throw new Error('找不到匹配的模組');

    const moduleName = matchedUnits[0].moduleName;
    const literatureList = [...new Set(matchedUnits.map((u) => u.literature))].join(', ');

    const typeMap = {
      concept: '概念解釋（評估基本觀念與理論深度）',
      clinical: '臨床情境題（評估面對異常、品管、異常劑量之緊急處置與判斷）',
      comparison: '比較分析（評估不同量測技術、協定之對比）',
      calculation: '計算與公式推導（評估劑量公式之口頭推導與邏輯說明）',
      regulation: '輻防安全與法規（評估防護設計與安全監管）'
    };

    const typeDesc = typeMap[questionType] || typeMap.clinical;

    const prompt = `請針對醫學物理師證照的「口試」關卡，生成 1 道專業的口試題目。
【醫學物理模組】${moduleId} - ${moduleName}
【對應文獻範疇】${literatureList}
【指定題型】${typeDesc}

你必須且只能回傳一個 JSON Object，格式如下：
{
  "question": "口試題目內容（繁體中文，需口語化，像是考官現場問答）...",
  "referenceAnswer": "此題目的標準參考解答（包含必答的關鍵字與物理原理說明）..."
}

題目設計原則：
1. 臨床情境題要貼近醫院放射治療科的實際運作（如：加速器 QA 不過、劑量計算出錯、射源意外等）。
2. 問題需具有開放性，考驗邏輯論述能力。
3. 參考答案需列出考生回答時「必須包含的關鍵字(Keywords)」與推導邏輯。
`;

    const systemInstruction =
      '你是一位資深醫學物理師考照口試委員（放射治療組）。你提問專業犀利，重視邏輯、安全與文獻依據，只以繁體中文與 JSON 物件格式回傳。';

    const result = await this.callGeminiAPI(prompt, systemInstruction);
    return {
      moduleId,
      questionType,
      question: result.question,
      referenceAnswer: result.referenceAnswer
    };
  },

  /**
   * 評分與評估口試答案 (四維度評分)
   */
  async gradeOralAnswerAI(question, questionType, referenceAnswer, userAnswer) {
    const prompt = `請以醫學物理師口試考官的身分，評估考生的口試回答：
【口試題目】${question}
【題型分類】${questionType}
【標準參考解答】${referenceAnswer}
【考生的回答內容】
${userAnswer}

請針對以下四個維度進行細部評分（每個維度 0-25 分，加總即為總分 0-100），並提供具體回饋：
1. 完整度 (completeness): 回答是否涵蓋了標準答案的所有核心要點與關鍵字。
2. 正確度 (accuracy): 物理觀念、公式及臨床步驟是否正確無誤。
3. 邏輯性 (logic): 論述是否清晰、有條理，步驟先後順序是否合理。
4. 深度 (depth): 對於物理原理或文獻指引（如 TG report）的了解深度。

你必須且只能回傳一個 JSON Object，格式如下：
{
  "score": 85,
  "completeness": 20,
  "accuracy": 20,
  "logic": 20,
  "depth": 25,
  "feedback": "給予考生的詳細評語、改進建議與優缺點分析（繁體中文）...",
  "missingPoints": [
    "回答中缺漏的關鍵概念 1",
    "回答中缺漏的關鍵概念 2"
  ]
}
`;

    const systemInstruction =
      '你是一位嚴格但公正的醫學物理口試考官。你注重細節，會精準比對考生的回答與國際指引，給予建設性的臨床回饋。只以繁體中文與 JSON 物件格式回傳。';

    return await this.callGeminiAPI(prompt, systemInstruction);
  },

  /**
   * 根據一段文獻內容自動生成 SM-2 知識卡片
   */
  async generateFlashcardsAI(moduleId, unitId, textContent) {
    const prompt = `請閱讀以下醫學物理文獻片段，並生成 3-5 張雙面知識卡片（Flashcards），用於 Spaced Repetition（間隔重複）記憶：

【文獻內容】
${textContent}

你必須且只能回傳一個 JSON Array，格式如下：
[
  {
    "front": "卡片正面：簡短的問題或概念名詞（繁體中文）...",
    "back": "卡片背面：答案、核心公式、或精確的物理原理解釋（繁體中文）..."
  }
]

請確保：
1. 卡片內容精簡扼要，方便快速閃卡複習。
2. 著重在重要數值（如品管誤差容許值）、核心物理定義、或公式。
3. 【重要】若內容包含 LaTeX 公式（如含有反斜線 \\ ），在 JSON 中必須將反斜線正確雙重轉義（例如將 \\lambda 寫成 \\\\lambda ）。
`;

    const systemInstruction =
      '你是醫學物理學習秘書，擅長將長篇文獻精煉為重點明確的 Anki 複習卡片。只以繁體中文與 JSON 陣列格式回傳。';

    const cards = await this.callGeminiAPI(prompt, systemInstruction);

    const processedCards = cards.map((c) => ({
      cardId: crypto.randomUUID(),
      moduleId,
      unitId: unitId || '',
      front: c.front,
      back: c.back,
      interval: 1,
      easeFactor: 2.5,
      nextReviewDate: new Date().toISOString().split('T')[0],
      repetitions: 0,
      updatedAt: new Date().toISOString()
    }));

    await DB.insertReviewCards(processedCards);
    return processedCards;
  },

  /**
   * 從單元文獻字串解析內建 PDF 檔名與相對路徑
   */
  getUnitPdfFiles(literatureStr) {
    if (!literatureStr) return [];
    return literatureStr
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /\.pdf$/i.test(s))
      .map((name) => ({
        name,
        url: `考試範圍文獻資料/${encodeURIComponent(name)}`
      }));
  },

  /**
   * 嘗試載入 ≤ 12 MB 之內建文獻 PDF 作為 Gemini inlineData
   */
  async _tryLoadLocalPdfPart(literatureStr, maxBytes = 12 * 1024 * 1024) {
    const files = this.getUnitPdfFiles(literatureStr);
    for (const f of files) {
      try {
        const headRes = await fetch(f.url, { method: 'HEAD' });
        if (!headRes.ok) continue;
        const sizeHeader = headRes.headers.get('content-length');
        if (sizeHeader && Number(sizeHeader) > maxBytes) {
          console.info(`[GeminiService] 跳過大型 PDF (${f.name}, ${Math.round(Number(sizeHeader) / 1048576)} MB)`);
          continue;
        }

        const res = await fetch(f.url);
        if (!res.ok) continue;
        const blob = await res.blob();
        if (blob.size > maxBytes) continue;

        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }

        return {
          filename: f.name,
          part: {
            inlineData: {
              mimeType: 'application/pdf',
              data: btoa(binary)
            }
          }
        };
      } catch (e) {
        console.warn(`[GeminiService] 載入本地 PDF 失敗 (${f.name}):`, e);
      }
    }
    return null;
  },

  /**
   * 一站式共讀工作台：為指定單元生成深度考點講義（優先直讀專案內建 PDF）
   */
  async generateUnitStudyGuideAI(unit, usePdf = true) {
    if (!unit) throw new Error('找不到單元資訊');

    let pdfLoaded = null;
    if (usePdf) {
      pdfLoaded = await this._tryLoadLocalPdfPart(unit.literature);
    }

    const extraParts = pdfLoaded ? [pdfLoaded.part] : [];
    const sourceNotice = pdfLoaded
      ? `已附上原文文獻 PDF《${pdfLoaded.filename}》，請優先依據該原文內容精確提煉重點與數值，不可憑空捏造公差數字。`
      : `請依據醫學物理權威文獻《${unit.literature}》之對應章節進行整理。`;

    const prompt = `請為中華民國醫學物理師證照（放射治療物理組）考生整理以下單元的深度自學講義：
【單元代碼】${unit.unitId}
【單元名稱】${unit.unitName}
【所屬模組】[${unit.moduleId}] ${unit.moduleName}
【指定文獻】${unit.literature}
【學習範疇】${unit.chapters}
【資料來源指示】${sourceNotice}

請回傳一個 JSON Object，格式如下：
{
  "guideHtml": "使用乾淨語義化 HTML 撰寫的結構化講義..."
}

guideHtml 排版與內容要求：
1. 請依序包含四個明確段落標題 (<h3>)：
   - <h3>1. 核心物理觀念與臨床定義</h3>
   - <h3>2. 關鍵計算公式與參數意義</h3>
   - <h3>3. 國際指引規範與品管容許差 (Tolerances)</h3>（若有數值規範，請務必使用 <table><thead><tr><th>...</th></tr></thead><tbody>...</tbody></table> 呈現）
   - <h3>4. 臨床常考陷阱與口試重點</h3>
2. 數學公式請使用標準 LaTeX 格式：行內公式用 \\(...\\)，獨立推導公式用 $$...$$。
3. 若該單元適合搭配標準曲線或幾何圖示說明，請在對應段落插入 \`<div class="mp-diagram" data-spec='{"type":"...","params":{...}}'></div>\`（可用 type: pdd, profile, lq_survival, decay, attenuation, tg51_setup, geometric_penumbra, field_matching, tg43_geometry, inhomogeneity_slab, linac_head）。
4. 只使用 <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <code>, <table>, <thead>, <tbody>, <tr>, <th>, <td> 與上述 diagram div，勿輸出 <script> 或 <html>/<body> 標籤。`;

    const systemInstruction =
      '你是一位資深醫學物理師與考照輔導教授。你整理的講義精準、有條理、重視臨床容許差與公式物理意義，完全以繁體中文與 JSON 物件格式回傳。';

    const result = await this.callGeminiAPI(prompt, systemInstruction, 150000, extraParts);
    return {
      html: result.guideHtml || '',
      usedPdfFilename: pdfLoaded ? pdfLoaded.filename : ''
    };
  },

  /**
   * 單元共讀工作台：針對當前單元講義內容進行 AI 助教即時追問
   */
  async askUnitTutorAI(unit, currentGuideHtml, userQuestion) {
    const plainGuide = (currentGuideHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 6000);
    const prompt = `考生正在研讀醫學物理考照單元 [${unit.unitId}] ${unit.unitName}（文獻：${unit.literature}；範疇：${unit.chapters}）。

【目前講義摘要】
${plainGuide || '（尚未生成講義）'}

【考生提問】
${userQuestion}

請以資深醫學物理師身分直接切中核心回答，若涉及公式請用 \\(...\\) 或 $$...$$ 表示，若涉及比較請使用 <table> 或條列式。
只回傳一個 JSON Object：
{
  "answerHtml": "HTML 格式的精準解答（使用 <p>, <ul>, <li>, <strong>, <table> 等標籤）"
}`;

    const systemInstruction =
      '你是一位專精放射治療與醫學影像物理的考照指導教授，回答精準直白不廢話，只以繁體中文與 JSON 物件回傳。';

    const result = await this.callGeminiAPI(prompt, systemInstruction, 90000);
    return result.answerHtml || '';
  },

  /**
   * 修復 JSON 字串中無效的反斜線跳脫 (例如 LaTeX 中的 \lambda)
   */
  repairJsonBackslashes(jsonStr) {
    return jsonStr.replace(/\\+/g, function (match, offset, fullStr) {
      const len = match.length;
      if (len % 2 === 0) return match;

      const nextCharIndex = offset + len;
      const nextChar = fullStr.charAt(nextCharIndex);

      let isUnicode = false;
      if (nextChar === 'u') {
        const nextFour = fullStr.substring(nextCharIndex + 1, nextCharIndex + 5);
        if (/^[0-9a-fA-F]{4}$/.test(nextFour)) isUnicode = true;
      }

      const validEscapes = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't'];
      if (validEscapes.indexOf(nextChar) !== -1 || isUnicode) {
        return match;
      }
      return match + '\\';
    });
  },

  /**
   * 即時自 Google API 動態取得最新且最適合醫學物理考照的前 5 款 Gemini 模型
   */
  async fetchTopModels(apiKey) {
    const fallbackModels = this.getDefaultTopModels();
    const oauthToken = typeof getGoogleOAuthToken === 'function' ? getGoogleOAuthToken() : '';
    const effectiveKey = (apiKey || DB.getGeminiKey() || '').trim();
    if (!effectiveKey && !oauthToken) return fallbackModels;

    try {
      const res = await this._fetchWithAuth(
        'https://generativelanguage.googleapis.com/v1beta/models',
        { method: 'GET' },
        10000,
        effectiveKey
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rawList = data.models || [];

      const candidateModels = rawList.filter((m) => {
        const id = (m.name || '').replace('models/', '');
        const methods = m.supportedGenerationMethods || [];
        return (
          methods.includes('generateContent') &&
          !id.includes('embedding') &&
          !id.includes('aqa') &&
          !id.includes('imagen') &&
          !id.includes('tts') &&
          !id.includes('whisper') &&
          !id.includes('bison') &&
          id.startsWith('gemini')
        );
      });

      if (candidateModels.length === 0) return fallbackModels;

      const scored = candidateModels.map((m) => {
        const id = m.name.replace('models/', '');
        let score = 0;

        const verMatch = id.match(/gemini-(\d+)\.?(\d+)?/i);
        if (verMatch) {
          const major = parseInt(verMatch[1] || '0', 10);
          const minor = parseInt(verMatch[2] || '0', 10);
          score += major * 1000 + minor * 100;
        }

        if (id.includes('flash')) score += 60;
        if (id.includes('pro')) score += 50;
        if (id.includes('thinking')) score += 20;
        if (id.includes('exp') || id.includes('preview')) score -= 15;
        if (id.includes('lite')) score -= 30;

        let desc = '';
        if (id.includes('2.5-flash')) desc = '推薦: 最新極速且精準，性價比首選';
        else if (id.includes('2.5-pro')) desc = '頂級旗艦: 複雜公式推導與口試首選';
        else if (id.includes('2.0-flash') && !id.includes('lite')) desc = '高速穩定: 日常題庫練習首選';
        else if (id.includes('2.0-pro')) desc = '高精確深度分析: 適合臨床評估';
        else if (id.includes('1.5-pro')) desc = '長文本旗艦: 適合大篇幅文獻研讀';
        else if (id.includes('1.5-flash')) desc = '高效輕量快速';
        else desc = m.displayName || id;

        return { id, name: `${id} (${desc})`, score };
      });

      scored.sort((a, b) => b.score - a.score);

      const top5 = [];
      const seenBases = new Set();

      for (const item of scored) {
        const base = item.id.replace(/-latest$/, '').replace(/-\d{3}$/, '');
        if (!seenBases.has(base)) {
          seenBases.add(base);
          top5.push(item);
        }
        if (top5.length >= 5) break;
      }

      return top5.length >= 3 ? top5 : fallbackModels;
    } catch (err) {
      console.warn('即時獲取 Gemini 模型列表失敗，降級使用預設前 5 款模型:', err);
      return fallbackModels;
    }
  },

  getDefaultTopModels() {
    return [
      { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash (推薦: 最新極速且精準，性價比首選)' },
      { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro (頂級旗艦: 複雜公式推導與口試首選)' },
      { id: 'gemini-2.0-flash', name: 'gemini-2.0-flash (高速穩定: 日常題庫練習首選)' },
      { id: 'gemini-2.0-pro-exp-02-05', name: 'gemini-2.0-pro-exp-02-05 (高精確深度分析: 適合臨床評估)' },
      { id: 'gemini-1.5-pro', name: 'gemini-1.5-pro (長文本旗艦: 適合大篇幅文獻研讀)' }
    ];
  }
};
