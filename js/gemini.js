/**
 * 🤖 醫學物理師考照自學系統 - Gemini AI 服務層 (js/gemini.js)
 * 負責前端直連 Gemini REST API 進行出題、口試評分、SM-2 閃卡提煉與單元大綱整理
 */

const GeminiService = {
  /**
   * 呼叫 Gemini REST API 的共用核心函數
   */
  async callGeminiAPI(prompt, systemInstruction) {
    const apiKey = await DB.getConfig('geminiApiKey');
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未設定 Gemini API Key。請先前往「系統設定」頁面填寫 API 金鑰。');
    }

    const model = (await DB.getConfig('geminiModel')) || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7
      }
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 秒超時防護

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        throw new Error('Gemini API 請求逾時（超過 45 秒），請檢查網路狀態或重試。');
      }
      throw new Error('無法連線至 Gemini API: ' + fetchErr.message);
    }
    clearTimeout(timeoutId);

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
        // LaTeX 單反斜線容錯修復 (Bugfix 4.4)
        const repaired = this.repairJsonBackslashes(textOut.trim());
        return JSON.parse(repaired);
      }
    } catch (e) {
      console.error('[GeminiService] JSON 解析失敗，原始回應:', responseText);
      throw new Error("AI 回傳格式不符合預期 JSON: " + e.message);
    }
  },

  /**
   * 根據主題與單元生成四選一單選練習題
   */
  async generateAIQuestions(moduleId, topicId, count = 5, difficulty = 2, unitId = null) {
    const syllabus = await DB.getSyllabus();

    let topicName = '';
    let literatureList = '';
    let scopePrompt = '';

    if (unitId) {
      const matchedUnit = syllabus.find(u => u.unitId === unitId);
      if (!matchedUnit) throw new Error('找不到匹配的單元：' + unitId);
      topicName = matchedUnit.topicName;
      literatureList = `${matchedUnit.literature} (${matchedUnit.chapters})`;
      scopePrompt = `【指定學習單元】[${unitId}] ${matchedUnit.unitName}\n【參考文獻範疇】${matchedUnit.literature}\n【指定章節細目】${matchedUnit.chapters}`;
    } else {
      const matchedUnits = syllabus.filter(u => u.moduleId === moduleId && u.topicId === topicId);
      if (matchedUnits.length === 0) throw new Error('找不到匹配的主題');
      topicName = matchedUnits[0].topicName;
      literatureList = matchedUnits.map(u => `${u.literature} (${u.chapters})`).join(', ');
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
    "correctAnswer": "A", // 必須是 A、B、C 或 D
    "explanation": "詳細的解析與計算推導步驟（繁體中文）...",
    "sourceRef": "具體參考文獻與章節節段（例如: TG-51 Sec. III）"
  }
]

請確保：
1. 題目必須符合中華民國醫學物理師證照考試（放射治療物理組）的專業水準。
2. 若有計算題，公式與給定參數需完整、精確。
3. 選項需具備誘答性，不能一眼看出答案。
4. 解析要詳盡完整，說明正確與錯誤選項的物理原理。
5. 【重要：SVG 向量圖形支援與文字偏移】若此題目需要圖形說明（如照野幾何配置、射束入射路徑、深度劑量 PDD 曲線、Bragg Peak、或是電離腔測量配置等），請在 \`questionText\` 或 \`explanation\` 的合適內文位置直接嵌入 HTML 的 \`<svg>\` 程式碼：
   - SVG 寬度請設為 "100%"，\`viewBox\` 請設為適當的大小（如 \`viewBox="0 0 400 200"\`），以利網頁響應式縮放。
   - 由於系統為深色主題，SVG 內的線條（stroke）、文字（fill）與形狀必須使用明亮高對比的色彩（例如白色、亮灰、亮黃、亮青等，或使用 \`stroke="currentColor"\`），避免在深色背景下隱形。
   - 【避免重疊】：請務必確保所有的 \`<text>\` 標籤不要與線條（\`<line>\`）、圓圈（\`<circle>\`）、長方形（\`<rect>\`）等圖案重疊。文字與圖形元素在坐標上應保持至少 15px ~ 20px 的偏移距離，以防文字與圖案交互重疊。
`;

    const systemInstruction = "你是一位資深醫學物理師與考照出題專家。你出題極度嚴謹，完全符合醫學物理學會認證考試的規範，且只以繁體中文與 JSON 陣列格式回傳。";

    const questions = await this.callGeminiAPI(prompt, systemInstruction);

    const processedQuestions = questions.map(q => ({
      questionId: crypto.randomUUID(),
      moduleId: moduleId,
      topicId: topicId,
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
    const matchedUnits = syllabus.filter(u => u.moduleId === moduleId);
    if (matchedUnits.length === 0) throw new Error('找不到匹配的模組');

    const moduleName = matchedUnits[0].moduleName;
    const literatureList = [...new Set(matchedUnits.map(u => u.literature))].join(', ');

    const typeMap = {
      'concept': '概念解釋（評估基本觀念與理論深度）',
      'clinical': '臨床情境題（評估面對異常、品管、異常劑量之緊急處置與判斷）',
      'comparison': '比較分析（評估不同量測技術、協定之對比）',
      'calculation': '計算與公式推導（評估劑量公式之口頭推導與邏輯說明）',
      'regulation': '輻防安全與法規（評估防護設計與安全監管）'
    };

    const typeDesc = typeMap[questionType] || typeMap['clinical'];

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

    const systemInstruction = "你是一位資深醫學物理師考照口試委員（放射治療組）。你提問專業犀利，重視邏輯、安全與文獻依據，只以繁體中文與 JSON 物件格式回傳。";

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
  "feedback": "給予考生的詳細評語、改進建議與優缺點分析（繁體中文，要切中要點，口氣專業且建設性）...",
  "missingPoints": [
    "回答中缺漏的關鍵概念 1",
    "回答中缺漏的關鍵概念 2"
  ]
}
`;

    const systemInstruction = "你是一位嚴格但公正的醫學物理口試考官。你注重細節，會精準比對考生的回答與國際指引，給予極具建設性的臨床回饋。只以繁體中文與 JSON 物件格式回傳。";

    return await this.callGeminiAPI(prompt, systemInstruction);
  },

  /**
   * 根據一段文獻內容自動生成 SM-2 知識卡片
   */
  async generateFlashcardsAI(moduleId, unitId, textContent) {
    const prompt = `請閱讀以下醫學物理文獻片段，並為我生成 3-5 張雙面知識卡片（Flashcards），用於 Spaced Repetition（間隔重複）記憶：

【文獻內容】
${textContent}

你必須且只能回傳一個 JSON Array，格式如下：
[
  {
    "front": "卡片正面：簡短的問題或概念名詞（繁體中文）...",
    "back": "卡片背面：答案、核心公式、或簡短精確的物理原理解釋（繁體中文）..."
  }
]

請確保：
1. 卡片內容精簡扼要，方便快速閃卡複習。
2. 著重在重要數值（如品管誤差容許值）、核心物理定義、或公式。
3. 【重要】若內容包含 LaTeX 公式（如含有反斜線 \\ ），在 JSON 中必須將反斜線正確雙重轉義（例如將 \\lambda 寫成 \\\\lambda ），以符合標準 JSON 格式。
`;

    const systemInstruction = "你是醫學物理學習秘書，擅長將長篇文獻精煉為重點明確的 Anki 複習卡片。只以繁體中文與 JSON 陣列格式回傳。";

    const cards = await this.callGeminiAPI(prompt, systemInstruction);

    const processedCards = cards.map(c => ({
      cardId: crypto.randomUUID(),
      moduleId: moduleId,
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
   * 針對特定學習單元，整理詳細範圍與公式
   */
  async generateUnitSummaryAI(unitId) {
    const syllabus = await DB.getSyllabus();
    const unit = syllabus.find(u => u.unitId === unitId);
    if (!unit) throw new Error('找不到單元資訊：' + unitId);

    const prompt = `請針對以下醫學物理師考照的學習單元，整理出極為詳細且結構化的學習範圍內容與核心重點（繁體中文）：
【單元代碼】${unit.unitId}
【單元名稱】${unit.unitName}
【所屬主題】[${unit.topicId}] ${unit.topicName}
【參考文獻】${unit.literature}
【章節細目】${unit.chapters}

請針對此範圍整理並輸出以下四個部分：
1. 【核心物理觀念與定義】：說明此單元最基礎的物理原理與物理量定義。
2. 【核心計算公式與參數】：整理並列出所有必考的計算公式、公式中各代號的物理意義、常用常數。公式請使用標準 LaTeX 格式（例如：\\(D_{w,Q} = M \\cdot N_{D,w}^{Q_0} \\cdot k_Q\\)）。
3. 【指引與規範 (如 AAPM TG 或 IAEA TRS)】：針對文獻中的具體品管項目、頻率、容許差值（Tolerances）、實驗配置進行整理。
4. 【臨床情境與實務口試要點】：本單元在臨床實務上的重點與口試常問考點。

你必須且只能回傳一個 JSON Object，格式如下：
{
  "unitId": "${unit.unitId}",
  "unitName": "${unit.unitName}",
  "summaryHtml": "HTML 格式的詳細整理內容。排版必須美觀，請使用 <h3>, <p>, <ul>, <li>, <strong>, <table>, <thead>, <tbody>, <tr>, <th>, <td> 等標籤。LaTeX 公式請以 \\(...\\) 包裹以利 MathJax 渲染。"
}
`;

    const systemInstruction = "你是一位資深醫學物理師與考照輔導教授。你整理的複習筆記極度詳盡、精確，公式完美無缺，完全以繁體中文與 JSON 物件回傳。";

    return await this.callGeminiAPI(prompt, systemInstruction);
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
      } else {
        return match + '\\';
      }
    });
  }
};
