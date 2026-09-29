/**
 * 投票：初选（每人每门类一次）与 PK（每人每场一次）
 * 投票记录与计数在同一批次原子写入；记录以确定性 ID 创建，重复提交整批失败
 */
const { COL, STAGE_DERBY, MAX_INITIAL_PICKS, isPhaseOpen } = require('../activity');
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

async function submitMatch(ctx) {
  const { matchId, chosenSide } = ctx.body;
  if (chosenSide !== 'A' && chosenSide !== 'B') throw new UserError('投票参数无效');

  const match = typeof matchId === 'string' ? await ctx.db.get(COL.MATCH, matchId) : null;
  if (!match) throw new UserError('对阵不存在，请刷新后重试');
  if (!match.entryA || !match.entryB) throw new UserError('轮空场次无需投票');
  const phase = match.stage === STAGE_DERBY ? 'vote_match_4' : 'vote_match_8';
  if (!isPhaseOpen(ctx.activity, phase)) throw new UserError('本阶段投票已截止');

  const now = Date.now();
  const counter = chosenSide === 'A'
    ? { votesA: ctx.db.increment(1), lastVoteTimeA: now }
    : { votesB: ctx.db.increment(1), lastVoteTimeB: now };
  const ok = await ctx.db.commit([
    {
      type: 'create',
      col: COL.VOTE,
      id: `${ctx.openid}_${matchId}`,
      data: { openid: ctx.openid, matchId, chosenSide, timestamp: now }
    },
    { type: 'update', col: COL.MATCH, id: matchId, data: counter }
  ]);
  if (!ok) throw new UserError('本场对局您已投过票，不可重复提交');
  return { message: 'PK投票成功' };
}

/**
 * POST /vote { voteType: 'initial' | 'match', ... }
 */
async function submitVote(ctx) {
  await requireBinding(ctx);
  if (ctx.body.voteType === 'initial') return submitInitial(ctx);
  if (ctx.body.voteType === 'match') return submitMatch(ctx);
  throw new UserError('未知投票类型');
}

module.exports = { submitVote };
