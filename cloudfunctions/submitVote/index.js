// cloudfunctions/submitVote/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const MAX_INITIAL_PICKS = 8;
const STAGE_PHASE = { '8进4': 'vote_match_8', '4强德比': 'vote_match_4' };

async function isPhaseOpen(phase) {
  const res = await db.collection('Activity').doc('main_config').get().catch(() => null);
  if (!res || res.data.currentPhase !== phase) return false;
  const deadline = (res.data.phaseDeadlines || {})[phase];
  return !deadline || Date.now() < deadline;
}

/**
 * 以确定性 _id 写入，由数据库保证"每人每门类/每场只能一票"，并发重复提交也只会成功一次
 * @returns {boolean} 是否为首次写入
 */
async function addOnce(collection, id, data) {
  try {
    await db.collection(collection).add({ data: { _id: id, ...data } });
    return true;
  } catch (e) {
    const existing = await db.collection(collection).doc(id).get().catch(() => null);
    if (existing) return false;
    throw e;
  }
}

async function submitInitial(openid, { categoryId, selectedEntryIds }) {
  if (!(await isPhaseOpen('vote_initial'))) {
    return { success: false, message: '初选投票已截止' };
  }

  const ids = [...new Set(Array.isArray(selectedEntryIds) ? selectedEntryIds : [])];
  if (ids.length === 0) return { success: false, message: '请至少选择 1 张喜欢的毛孩' };
  if (ids.length > MAX_INITIAL_PICKS) return { success: false, message: `每个门类最多选择 ${MAX_INITIAL_PICKS} 张` };

  // 所选条目必须全部属于该门类且未被删除
  const valid = await db.collection('Entry')
    .where({ _id: _.in(ids), categoryId, status: _.neq('deleted') })
    .count();
  if (valid.total !== ids.length) {
    return { success: false, message: '选择中包含无效的参赛毛孩，请刷新后重试' };
  }

  const now = Date.now();
  const first = await addOnce('InitialSelection', `${openid}_${categoryId}`, {
    openid,
    categoryId,
    selectedEntryIds: ids,
    createdAt: db.serverDate(),
    timestamp: now
  });
  if (!first) return { success: false, message: '该门类您已锁定提交，不可重复修改' };

  // 累加被选次数，并记录"达到当前票数"的时刻用于打平裁定
  await db.collection('Entry').where({ _id: _.in(ids) }).update({
    data: { initialVotes: _.inc(1), lastVoteTime: now }
  });

  return { success: true, message: '初选选票提交成功' };
}

async function submitMatch(openid, { matchId, chosenSide }) {
  if (chosenSide !== 'A' && chosenSide !== 'B') {
    return { success: false, message: '投票参数无效' };
  }

  const matchRes = await db.collection('Match').doc(matchId).get().catch(() => null);
  if (!matchRes) return { success: false, message: '对阵不存在，请刷新后重试' };
  const match = matchRes.data;
  if (!match.entryA || !match.entryB) return { success: false, message: '轮空场次无需投票' };
  if (!(await isPhaseOpen(STAGE_PHASE[match.stage]))) {
    return { success: false, message: '本阶段投票已截止' };
  }

  const now = Date.now();
  const first = await addOnce('Vote', `${openid}_${matchId}`, {
    openid,
    matchId,
    chosenSide,
    createdAt: db.serverDate(),
    timestamp: now
  });
  if (!first) return { success: false, message: '本场对局您已投过票，不可重复提交' };

  const updateData = chosenSide === 'A'
    ? { votesA: _.inc(1), lastVoteTimeA: now }
    : { votesB: _.inc(1), lastVoteTimeB: now };
  await db.collection('Match').doc(matchId).update({ data: updateData });

  return { success: true, message: 'PK投票成功' };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  const binding = await db.collection('UserBinding').where({ openid: OPENID }).count();
  if (binding.total === 0) return { success: false, message: '请先绑定活动ID' };

  if (event.voteType === 'initial') return submitInitial(OPENID, event);
  if (event.voteType === 'match') return submitMatch(OPENID, event);
  return { success: false, message: '未知投票类型' };
};
