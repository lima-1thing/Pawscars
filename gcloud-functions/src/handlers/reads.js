/**
 * 只读查询：对外展示的数据在服务端打码，公共视图不返回实时票数与 openid
 */
const {
  COL, STAGE_KNOCKOUT, STAGE_DERBY, MAX_INITIAL_PICKS, isPhaseOpen, isAdmin
} = require('../activity');
const { computeEntryProgress, getKnockoutWinners, resolveFinalRankings } = require('../bracket');
const { loadStageMatches } = require('../settlement');
const { maskLdap, publicEntry, publicMatch, byOwnerLdap } = require('../present');
const { UserError } = require('../errors');

const activeEntries = (db, categoryId) =>
  db.query(COL.ENTRY, [['categoryId', '==', categoryId], ['status', '==', 'active']]);

// 初选页：各门类候选（按主人ID A→Z 固定排序）+ 本人已提交的选择
async function initialState(ctx) {
  const categories = [];
  for (const cat of ctx.activity.categories) {
    const entries = (await activeEntries(ctx.db, cat.id)).sort(byOwnerLdap);
    const mine = await ctx.db.get(COL.INITIAL, `${ctx.openid}_${cat.id}`);
    categories.push({
      id: cat.id,
      needsVote: entries.length > MAX_INITIAL_PICKS,
      entries: entries.map(publicEntry),
      mySelection: mine ? mine.selectedEntryIds : null
    });
  }
  return { categories, phaseOpen: isPhaseOpen(ctx.activity, 'vote_initial') };
}

// PK 页：各门类可投对阵（不含票数）+ 本人已投记录
async function matchState(ctx) {
  const { stage } = ctx.body;
  if (stage !== STAGE_KNOCKOUT && stage !== STAGE_DERBY) throw new UserError('未知阶段');

  const categories = [];
  for (const cat of ctx.activity.categories) {
    const generated = !!(await ctx.db.get(COL.BRACKET, cat.id));
    const matches = (await loadStageMatches(ctx.db, cat.id, stage)).filter(m => m.entryA && m.entryB);
    const votes = await ctx.db.getMany(COL.VOTE, matches.map(m => `${ctx.openid}_${m.id}`));
    const myVotes = {};
    votes.forEach(v => { if (v) myVotes[v.matchId] = v.chosenSide; });
    categories.push({ id: cat.id, generated, matches: matches.map(publicMatch), myVotes });
  }
  const phase = stage === STAGE_DERBY ? 'vote_match_4' : 'vote_match_8';
  return { categories, phaseOpen: isPhaseOpen(ctx.activity, phase) };
}

// 我的提名：仅本人条目，附带私密票数与晋级进度
async function myNominations(ctx) {
  const mine = await ctx.db.query(COL.ENTRY, [['ownerOpenid', '==', ctx.openid], ['status', '==', 'active']]);
  const cache = {};
  const loadCategory = async (categoryId) => {
    if (!cache[categoryId]) {
      const bracket = await ctx.db.get(COL.BRACKET, categoryId);
      cache[categoryId] = {
        needsInitialRound: (await ctx.db.count(COL.ENTRY, [['categoryId', '==', categoryId], ['status', '==', 'active']])) > MAX_INITIAL_PICKS,
        qualifiers: bracket ? bracket.qualifiers : null,
        knockoutMatches: bracket ? await loadStageMatches(ctx.db, categoryId, STAGE_KNOCKOUT) : [],
        derbyMatches: bracket ? await loadStageMatches(ctx.db, categoryId, STAGE_DERBY) : []
      };
    }
    return cache[categoryId];
  };

  const entries = [];
  for (const e of mine.sort((a, b) => a.createdAt - b.createdAt)) {
    entries.push({
      ...publicEntry(e),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      progress: computeEntryProgress({ entry: e, phase: ctx.activity.currentPhase, ...(await loadCategory(e.categoryId)) })
    });
  }
  return { entries };
}

// 颁奖结果：颁奖阶段公开；之前仅管理员可预览
async function awards(ctx) {
  const { categoryId } = ctx.body;
  if (ctx.activity.currentPhase !== 'awards' && !isAdmin(ctx.activity, ctx.openid)) return { result: null };

  const bracket = typeof categoryId === 'string' ? await ctx.db.get(COL.BRACKET, categoryId) : null;
  if (!bracket || !bracket.derbyGenerated) return { result: null };

  const knockout = await loadStageMatches(ctx.db, categoryId, STAGE_KNOCKOUT);
  const derby = await loadStageMatches(ctx.db, categoryId, STAGE_DERBY);
  const finalists = knockout.length > 0 ? getKnockoutWinners(knockout) : (bracket.qualifiers || []);
  const ranking = resolveFinalRankings(finalists, derby);

  const withScore = (e) => e && { ...publicEntry(e), rank: e.rank, wins: e.wins, totalVotes: e.totalVotes };
  return {
    result: {
      isEmpty: ranking.isEmpty,
      champion: withScore(ranking.champion),
      runnerUp: withScore(ranking.runnerUp),
      thirdPlace: withScore(ranking.thirdPlace)
    }
  };
}

async function congrats(ctx) {
  const list = (await ctx.db.query(COL.CONGRATS, [['status', '==', 'active']]))
    .sort((a, b) => b.createdAt - a.createdAt);
  return {
    list: list.map(c => ({ id: c.id, content: c.content, ownerLdap: maskLdap(c.ownerLdap), createdAt: c.createdAt })),
    hasSent: !!(await ctx.db.get(COL.CONGRATS, ctx.openid))
  };
}

module.exports = { initialState, matchState, myNominations, awards, congrats };
