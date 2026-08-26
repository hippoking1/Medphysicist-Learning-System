/**
 * 知識卡片與間隔重複服務 (ReviewCardService)
 * 實作 SuperMemo-2 (SM-2) 演算法來優化學習記憶
 */

/**
 * 取得所有知識卡片
 */
function getReviewCards() {
  const cards = getTableData('ReviewCards');
  return cards.map(c => {
    return {
      ...c,
      interval: Number(c.interval || 1),
      easeFactor: Number(c.easeFactor || 2.5),
      repetitions: Number(c.repetitions || 0),
      nextReviewDate: formatDate(c.nextReviewDate)
    };
  });
}

/**
 * 取得今日需要複習的卡片 (nextReviewDate <= 今日)
 */
function getDueReviewCards() {
  const todayStr = formatDate(new Date());
  const cards = getReviewCards();
  return cards.filter(c => !c.nextReviewDate || c.nextReviewDate <= todayStr);
}

/**
 * 手動新增複習卡片
 */
function addManualReviewCard(moduleId, unitId, front, back) {
  const card = {
    cardId: generateUUID(),
    moduleId: moduleId,
    unitId: unitId || '',
    front: front,
    back: back,
    interval: 1,
    easeFactor: 2.5,
    nextReviewDate: formatDate(new Date()),
    repetitions: 0
  };
  insertRow('ReviewCards', card);
  return card;
}

/**
 * 刪除卡片
 */
function deleteReviewCard(cardId) {
  return deleteRow('ReviewCards', 'cardId', cardId);
}

/**
 * 提交複習卡片自我評分 (0-5 分)，計算並更新下一次複習時間與間隔
 * @param {string} cardId 卡片 ID
 * @param {number} score 回答品質分數 (0-5)
 *   0: 完全不記得
 *   1: 答錯，但看到答案有印象
 *   2: 答錯，但很容易記起來
 *   3: 答對，但極度吃力
 *   4: 答對，稍微遲疑
 *   5: 完美答對，反射性想起來
 */
function submitReviewCardScore(cardId, score) {
  score = Number(score);
  if (score < 0 || score > 5) throw new Error('評分必須在 0 到 5 之間');
  
  const cards = getReviewCards();
  const card = cards.find(c => c.cardId === cardId);
  if (!card) throw new Error('找不到指定的卡片: ' + cardId);
  
  let repetitions = card.repetitions;
  let interval = card.interval;
  let easeFactor = card.easeFactor;
  
  // SM-2 演算法核心邏輯
  if (score >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions++;
  } else {
    repetitions = 0;
    interval = 1; // 答錯，明天立刻重來
  }
  
  // 修正 Ease Factor
  easeFactor = easeFactor + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02));
  if (easeFactor < 1.3) {
    easeFactor = 1.3; // 設下限防止 easeFactor 縮小至零
  }
  
  // 計算下一個複習日期
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  
  const updatedData = {
    interval: interval,
    easeFactor: easeFactor,
    repetitions: repetitions,
    nextReviewDate: formatDate(nextDate)
  };
  
  const success = updateRow('ReviewCards', 'cardId', cardId, updatedData);
  return { success: success, data: updatedData };
}
