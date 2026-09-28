/**
 * 投票：初选（每人每门类一次）与决赛 PK（每人每场一次，只能投系统分配给自己的对局）
 * 投票记录与计数在同一批次原子写入；记录以确定性 ID 创建，重复提交整批失败
 */
const { COL, MAX_INITIAL_PICKS, isPhaseOpen } = require('../activity');
const { requireBinding } = require('./user');
const { UserError } = require('../errors');

async function submitInitial(ctx) {
  const { categoryId, selectedEntryIds } = ctx.body;
  if (!isPhaseOpen(ctx.activity, 'vote_initial')) throw new UserError('初选投票已截止');

  const ids = [...new Set(Array.isArray(selectedEntryIds) ? selectedEntryIds : [])].filter(id => typeof id === 'string');
  if (ids.length === 0) throw new UserError('请至少选择 1 张喜欢的毛孩');
  if (ids.length > MAX_INITIAL_PICKS) throw new UserError(`每个门类最多选择 ${MAX_INITIAL_PICKS} 张`);

  const entries = await ctx.db.getMany(COL.ENTRY, ids);
  if (entries.some(e => !e || e.categoryId !== categoryId || e.status !== 'active')) {
    throw new UserError('选择中包含无效的参赛毛孩，请刷新后重试');
  }

  const now = Date.now();
  const ok = await ctx.db.commit([
    {
      type: 'create',
      col: COL.INITIAL,
      id: `${ctx.openid}_${categoryId}`,
      data: { openid: ctx.openid, categoryId, selectedEntryIds: ids, timestamp: now }
    },
    // 累加被选次数，并记录"达到当前票数"的时刻用于打平裁定
    ...ids.map(id => ({
      type: 'update',
      col: COL.ENTRY,
      id,
      data: { initialVotes: ctx.db.increment(1), lastVoteTime: now }
    }))
  ]);
  if (!ok) throw new UserError('该门类您已锁定提交，不可重复修改');
  return { message: '初选选票提交成功' };
}

async function submitFinal(ctx) {
  const { categoryId, pairIndex, chosenSide } = ctx.body;
  if (chosenSide !== 'A' && chosenSide !== 'B') throw new UserError('投票参数无效');
  if (!isPhaseOpen(ctx.activity, 'vote_final')) throw new UserError('决赛投票已截止');

  const assignId = `${ctx.openid}_${categoryId}`;
  const assignment = typeof categoryId === 'string' ? await ctx.db.get(COL.FINAL_PAIRS, assignId) : null;
  const pair = assignment && Number.isInteger(pairIndex) ? assignment.pairs[pairIndex] : null;
  if (!pair) throw new UserError('对局不存在，请刷新后重试');

  const now = Date.now();
  const winner = chosenSide === 'A' ? pair.a : pair.b;
  const loser = chosenSide === 'A' ? pair.b : pair.a;
  const ok = await ctx.db.commit([
    {
      type: 'create',
      col: COL.FINAL_VOTE,
      id: `${assignId}_${pairIndex}`,
      data: { openid: ctx.openid, categoryId, pairIndex, chosenSide, winner, loser, timestamp: now }
    },
    { type: 'update', col: COL.ENTRY, id: winner, data: { finalWins: ctx.db.increment(1), finalGames: ctx.db.increment(1), lastFinalWinTime: now } },
    { type: 'update', col: COL.ENTRY, id: loser, data: { finalGames: ctx.db.increment(1) } }
  ]);
  if (!ok) throw new UserError('本场对决您已投过票，不可重复提交');
  return { message: '决赛投票成功' };
}

/**
 * POST /vote { voteType: 'initial' | 'final', ... }
 */
async function submitVote(ctx) {
  await requireBinding(ctx);
  if (ctx.body.voteType === 'initial') return submitInitial(ctx);
  if (ctx.body.voteType === 'final') return submitFinal(ctx);
  throw new UserError('未知投票类型');
}

module.exports = { submitVote };
