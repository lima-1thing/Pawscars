/**
 * 阶段流转与结算（两轮制）：报名 → 初选 → 决赛 → 颁奖
 * 推进到决赛时幂等生成决赛名单（已生成的不重复生成、不清票）；回退时清除之后阶段的名单与投票
 */
const { PHASE_ORDER, resolveInitialRound } = require('./bracket');
const { COL, CONFIG_ID } = require('./activity');
const { entrySnapshot } = require('./present');
const { UserError } = require('./errors');

async function ensureQualifiers(db, categoryId) {
  if (await db.get(COL.BRACKET, categoryId)) return;

  const entries = await db.query(COL.ENTRY, [['categoryId', '==', categoryId], ['status', '==', 'active']]);
  const votesFlat = [];
  (await db.query(COL.INITIAL, [['categoryId', '==', categoryId]]))
    .forEach(s => s.selectedEntryIds.forEach(entryId => votesFlat.push({ entryId, timestamp: s.timestamp })));

  const { top8 } = resolveInitialRound(entries, votesFlat);
  await db.set(COL.BRACKET, categoryId, { categoryId, qualifiers: top8.map(entrySnapshot), updatedAt: Date.now() });
}

/**
 * 决赛战绩：{ [entryId]: { wins, games, lastWinTime } }（计数保存在报名条目上）
 */
async function loadFinalStats(db, categoryId) {
  const stats = {};
  (await db.query(COL.ENTRY, [['categoryId', '==', categoryId]])).forEach(e => {
    stats[e.id] = { wins: e.finalWins || 0, games: e.finalGames || 0, lastWinTime: e.lastFinalWinTime || 0 };
  });
  return stats;
}

async function clearStagesAfter(db, targetPhase, categoryIds) {
  const targetIdx = PHASE_ORDER.indexOf(targetPhase);
  const beforeFinal = targetIdx < PHASE_ORDER.indexOf('vote_final');

  for (const categoryId of categoryIds) {
    if (beforeFinal) {
      await db.remove(COL.BRACKET, categoryId);
      await db.removeWhere(COL.FINAL_PAIRS, [['categoryId', '==', categoryId]]);
      await db.removeWhere(COL.FINAL_VOTE, [['categoryId', '==', categoryId]]);
      await db.updateWhere(COL.ENTRY, [['categoryId', '==', categoryId]], { finalWins: 0, finalGames: 0, lastFinalWinTime: 0 });
    }
    // 回到报名期：初选选票一并作废
    if (targetPhase === 'nominate') {
      await db.removeWhere(COL.INITIAL, [['categoryId', '==', categoryId]]);
      await db.updateWhere(COL.ENTRY, [['categoryId', '==', categoryId]], { initialVotes: 0, lastVoteTime: 0 });
    }
  }
}

async function setPhase(db, config, targetPhase) {
  const targetIdx = PHASE_ORDER.indexOf(targetPhase);
  if (targetIdx === -1) throw new UserError(`未知阶段：${targetPhase}`);

  const categoryIds = config.categories.map(c => c.id);
  await clearStagesAfter(db, targetPhase, categoryIds);
  if (targetIdx >= PHASE_ORDER.indexOf('vote_final')) {
    for (const categoryId of categoryIds) await ensureQualifiers(db, categoryId);
  }

  if (await db.get(COL.ACTIVITY, CONFIG_ID)) {
    await db.update(COL.ACTIVITY, CONFIG_ID, { currentPhase: targetPhase });
  } else {
    await db.set(COL.ACTIVITY, CONFIG_ID, { currentPhase: targetPhase });
  }
}

/**
 * 定时任务：当前阶段过了截止时间则自动推进到下一阶段
 * @returns {string|null} 推进后的阶段；无需推进返回 null
 */
async function advanceIfDue(db, config, now = Date.now()) {
  const phase = config.currentPhase;
  const idx = PHASE_ORDER.indexOf(phase);
  const deadline = (config.phaseDeadlines || {})[phase];
  if (idx === -1 || idx === PHASE_ORDER.length - 1 || !deadline || now < deadline) return null;

  const next = PHASE_ORDER[idx + 1];
  await setPhase(db, config, next);
  return next;
}

module.exports = { ensureQualifiers, loadFinalStats, setPhase, advanceIfDue };
