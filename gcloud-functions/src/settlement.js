/**
 * 阶段流转与结算：初选 → 8进4 → 4强德比 → 颁奖
 * 推进时幂等补齐对阵（已生成的不重复生成、不清票）；回退时清除之后阶段的对阵与投票
 */
const {
  PHASE_ORDER,
  resolveInitialRound,
  buildKnockoutStage,
  getKnockoutWinners,
  generateDerbyMatches
} = require('./bracket');
const { COL, CONFIG_ID, STAGE_KNOCKOUT, STAGE_DERBY } = require('./activity');
const { entrySnapshot } = require('./present');
const { UserError } = require('./errors');

async function loadStageMatches(db, categoryId, stage) {
  return (await db.query(COL.MATCH, [['categoryId', '==', categoryId], ['stage', '==', stage]]))
    .sort((a, b) => a.stageIndex - b.stageIndex);
}

async function saveMatches(db, matches) {
  for (const m of matches) {
    const { id, ...data } = m;
    await db.set(COL.MATCH, id, { ...data, entryA: entrySnapshot(m.entryA), entryB: entrySnapshot(m.entryB) || null });
  }
}

async function ensureKnockout(db, categoryId) {
  if (await db.get(COL.BRACKET, categoryId)) return;

  const entries = await db.query(COL.ENTRY, [['categoryId', '==', categoryId], ['status', '==', 'active']]);
  const votesFlat = [];
  (await db.query(COL.INITIAL, [['categoryId', '==', categoryId]]))
    .forEach(s => s.selectedEntryIds.forEach(entryId => votesFlat.push({ entryId, timestamp: s.timestamp })));

  const { top8 } = resolveInitialRound(entries, votesFlat);
  const { matches } = buildKnockoutStage(top8, categoryId);
  await saveMatches(db, matches);
  await db.set(COL.BRACKET, categoryId, {
    categoryId,
    qualifiers: top8.map(entrySnapshot),
    finalists: null,
    derbyGenerated: false,
    updatedAt: Date.now()
  });
}

async function ensureDerby(db, categoryId) {
  await ensureKnockout(db, categoryId);
  const bracket = await db.get(COL.BRACKET, categoryId);
  if (bracket.derbyGenerated) return;

  const knockout = await loadStageMatches(db, categoryId, STAGE_KNOCKOUT);
  const finalists = knockout.length > 0 ? getKnockoutWinners(knockout) : bracket.qualifiers;
  await saveMatches(db, generateDerbyMatches(finalists, categoryId));
  await db.update(COL.BRACKET, categoryId, { finalists: finalists.map(entrySnapshot), derbyGenerated: true });
}

async function clearStagesAfter(db, targetPhase, categoryIds) {
  const targetIdx = PHASE_ORDER.indexOf(targetPhase);
  const stagesToDrop = [];
  if (targetIdx < PHASE_ORDER.indexOf('vote_match_4')) stagesToDrop.push(STAGE_DERBY);
  if (targetIdx < PHASE_ORDER.indexOf('vote_match_8')) stagesToDrop.push(STAGE_KNOCKOUT);

  for (const categoryId of categoryIds) {
    for (const stage of stagesToDrop) {
      const matches = await loadStageMatches(db, categoryId, stage);
      for (const m of matches) {
        await db.removeWhere(COL.VOTE, [['matchId', '==', m.id]]);
        await db.remove(COL.MATCH, m.id);
      }
    }
    if (stagesToDrop.includes(STAGE_KNOCKOUT)) {
      await db.remove(COL.BRACKET, categoryId);
    } else if (stagesToDrop.includes(STAGE_DERBY) && await db.get(COL.BRACKET, categoryId)) {
      await db.update(COL.BRACKET, categoryId, { derbyGenerated: false, finalists: null });
    }
  }

  // 回到报名期：初选选票一并作废
  if (targetPhase === 'nominate') {
    for (const categoryId of categoryIds) {
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
  for (const categoryId of categoryIds) {
    if (targetIdx >= PHASE_ORDER.indexOf('vote_match_8')) await ensureKnockout(db, categoryId);
    if (targetIdx >= PHASE_ORDER.indexOf('vote_match_4')) await ensureDerby(db, categoryId);
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

module.exports = { loadStageMatches, ensureKnockout, ensureDerby, setPhase, advanceIfDue };
