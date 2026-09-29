/**
 * 只读查询：对外展示的数据在服务端打码，公共视图不返回实时票数与 openid
 */
const { COL, MAX_INITIAL_PICKS, isPhaseOpen, isAdmin } = require('../activity');
const { computeEntryProgress, countPairCoverage, generateFinalPairs, resolveFinalRankings } = require('../bracket');
const { loadFinalStats } = require('../settlement');
const { maskLdap, publicEntry, byOwnerLdap } = require('../present');
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

// 已提名的毛孩：各门类全部有效报名（最新在前，已打码，不含票数），任何阶段都可查看
async function gallery(ctx) {
  const categories = [];
  for (const cat of ctx.activity.categories) {
    const entries = (await activeEntries(ctx.db, cat.id)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    categories.push({ id: cat.id, entries: entries.map(publicEntry) });
  }
  return { categories };
}

// 决赛页：本人在各门类的对局（首次进入时随机生成并固定，不含任何票数）
async function finalState(ctx) {
  const open = isPhaseOpen(ctx.activity, 'vote_final');
  const categories = [];
  for (const cat of ctx.activity.categories) {
    const bracket = await ctx.db.get(COL.BRACKET, cat.id);
    const finalists = bracket ? bracket.qualifiers : [];
    const byId = Object.fromEntries(finalists.map(f => [f.id, f]));
    const assignId = `${ctx.openid}_${cat.id}`;

    let assignment = await ctx.db.get(COL.FINAL_PAIRS, assignId);
    if (!assignment && open && finalists.length >= 2) {
      // 参考本门类已分配的对局，让全部两两组合被均匀覆盖
      const existing = await ctx.db.query(COL.FINAL_PAIRS, [['categoryId', '==', cat.id]]);
      const pairs = generateFinalPairs(finalists.map(f => f.id), { coverage: countPairCoverage(existing.map(a => a.pairs)) });
      // 以确定性 ID 创建：并发打开页面时只会生成一份对局
      await ctx.db.commit([{ type: 'create', col: COL.FINAL_PAIRS, id: assignId,
        data: { openid: ctx.openid, categoryId: cat.id, pairs, createdAt: Date.now() } }]);
      assignment = await ctx.db.get(COL.FINAL_PAIRS, assignId);
    }

    const rawPairs = assignment ? assignment.pairs : [];
    const votes = await ctx.db.getMany(COL.FINAL_VOTE, rawPairs.map((p, i) => `${assignId}_${i}`));
    const pairs = rawPairs
      .map((p, index) => ({ index, entryA: publicEntry(byId[p.a]), entryB: publicEntry(byId[p.b]), myVote: votes[index] ? votes[index].chosenSide : null }))
      .filter(p => p.entryA && p.entryB);
    categories.push({ id: cat.id, generated: !!bracket, pairs });
  }
  return { categories, phaseOpen: open };
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
        finalists: bracket ? bracket.qualifiers : null,
        finalStats: bracket ? await loadFinalStats(ctx.db, categoryId) : {}
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
  if (!bracket) return { result: null };

  const ranking = resolveFinalRankings(bracket.qualifiers || [], await loadFinalStats(ctx.db, categoryId));
  const withScore = (e) => e && { ...publicEntry(e), rank: e.rank, wins: e.wins, games: e.games, winRate: e.winRate };
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

module.exports = { initialState, gallery, finalState, myNominations, awards, congrats };
