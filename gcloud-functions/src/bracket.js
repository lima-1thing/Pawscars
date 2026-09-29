/**
 * Pawscars 赛制规则（两轮制）
 *   报名 → 初选（每门类选出 8 强）→ 决赛（8 强两两 PK，按胜率决出冠亚季军）→ 颁奖
 *
 * 本文件被小程序、网页版与 Google Cloud 后台共用（后台为副本，测试会校验一致），保持为纯函数。
 */

const PHASE_ORDER = ['nominate', 'vote_initial', 'vote_final', 'awards'];
const FINALIST_COUNT = 8;
const MAX_FINAL_PAIRS = 8;

/**
 * 阶段是否开放：当前阶段一致且未过截止时间（0 表示不限）
 */
function isPhaseOpen(config, phase, now = Date.now()) {
  if (!config || config.currentPhase !== phase) return false;
  const deadline = (config.phaseDeadlines || {})[phase];
  return !deadline || now < deadline;
}

/**
 * 初选结算：选出 8 强
 * - 报名数 ≤ 8：不设初选，全员直接进入决赛
 * - 否则按被选次数从高到低取前 8；票数相同按"谁先达到该票数"（最后一票时间更早）判定
 * @param {Array} entries 该门类全部参赛条目
 * @param {Array} votes 初选选票，每条 { entryId, timestamp }
 * @returns {{ top8: Array, below8: Array, skipToStage: string|null }}
 */
function resolveInitialRound(entries, votes) {
  if (!entries || entries.length === 0) {
    return { top8: [], below8: [], skipToStage: 'awards' };
  }
  if (entries.length <= FINALIST_COUNT) {
    return { top8: entries, below8: [], skipToStage: 'vote_final' };
  }

  const stats = {};
  entries.forEach(e => { stats[e.id] = { entry: e, count: 0, lastVoteTime: 0 }; });
  (votes || []).forEach(v => {
    const s = stats[v.entryId];
    if (!s) return;
    s.count += 1;
    if (v.timestamp > s.lastVoteTime) s.lastVoteTime = v.timestamp;
  });

  const sorted = Object.values(stats).sort((a, b) =>
    (b.count - a.count) || ((a.lastVoteTime || 0) - (b.lastVoteTime || 0)));
  const withVotes = (s) => ({ ...s.entry, initialVotes: s.count, lastVoteTime: s.lastVoteTime });

  return {
    top8: sorted.slice(0, FINALIST_COUNT).map(withVotes),
    below8: sorted.slice(FINALIST_COUNT).map(withVotes),
    skipToStage: null
  };
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * 汇总已分配对局中每种两两组合出现的次数，用于下一位投票人的均衡分配
 * @param {Array<Array<{ a, b }>>} assignments 已有投票人的对局列表
 * @returns {Object} { 'idA|idB': count }
 */
function countPairCoverage(assignments) {
  const coverage = {};
  (assignments || []).forEach(pairs => (pairs || []).forEach(p => {
    const k = pairKey(p.a, p.b);
    coverage[k] = (coverage[k] || 0) + 1;
  }));
  return coverage;
}

function randomCycle(ids, rng) {
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((id, i) => [id, order[(i + 1) % order.length]]);
}

/**
 * 为一位投票人生成决赛对局（每门类最多 8 场）
 * 公平性：
 * 1. 单人：把决赛选手排成一圈、相邻两只配成一场 —— 每只毛孩恰好出场 2 次（选手 ≥ 3 时），上下位置随机；
 * 2. 全体：从多套随机排法中选出"最少被分配过"的组合（参考已有投票人的覆盖次数），
 *    使全部两两组合被均匀覆盖，每只毛孩遇到各个对手的机会大致相同。
 * @param {string[]} finalistIds
 * @param {object} [options]
 * @param {() => number} [options.rng] 随机数函数，默认 Math.random（测试可注入）
 * @param {Object} [options.coverage] countPairCoverage 的结果
 * @param {number} [options.candidates] 候选排法数量
 * @returns {Array<{ a: string, b: string }>}
 */
function generateFinalPairs(finalistIds, options = {}) {
  const rng = options.rng || Math.random;
  const coverage = options.coverage || {};
  const ids = [...new Set(finalistIds || [])];
  if (ids.length < 2) return [];

  let edges;
  if (ids.length === 2) {
    edges = [[ids[0], ids[1]]];
  } else {
    // 覆盖越少的组合越优先：按"已覆盖次数平方和"挑选最均衡的一套
    const cost = (cycle) => cycle.reduce((sum, [a, b]) => sum + ((coverage[pairKey(a, b)] || 0) + 1) ** 2, 0);
    let best = null;
    for (let i = 0; i < (options.candidates || 60); i++) {
      const cycle = randomCycle(ids, rng);
      const c = cost(cycle);
      if (!best || c < best.cost) best = { cycle, cost: c };
    }
    edges = best.cycle;
  }

  const pairs = edges.map(([x, y]) => (rng() < 0.5 ? { a: x, b: y } : { a: y, b: x }));
  // 对局顺序打乱，避免相邻两场总是同一只毛孩
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs.slice(0, MAX_FINAL_PAIRS);
}

/**
 * 决赛排名：按胜率 → 胜场 → 先达到该胜场的时间 → 主人ID字母序
 * @param {Array} finalists 决赛选手（含 id）
 * @param {Object} stats { [entryId]: { wins, games, lastWinTime } }
 * @returns {{ champion, runnerUp, thirdPlace, fullRankings, isEmpty }}
 */
function resolveFinalRankings(finalists, stats) {
  const list = finalists || [];
  if (list.length === 0) {
    return { champion: null, runnerUp: null, thirdPlace: null, fullRankings: [], isEmpty: true };
  }
  const ranked = list.map(e => {
    const s = (stats || {})[e.id] || {};
    const wins = s.wins || 0;
    const games = s.games || 0;
    return { ...e, wins, games, winRate: games ? wins / games : 0, lastWinTime: s.lastWinTime || 0 };
  }).sort((x, y) =>
    (y.winRate - x.winRate) ||
    (y.wins - x.wins) ||
    ((x.lastWinTime || Infinity) - (y.lastWinTime || Infinity)) ||
    (x.ownerLdap || '').localeCompare(y.ownerLdap || '')
  ).map((e, i) => ({ ...e, rank: i + 1 }));

  return {
    champion: ranked[0] || null,
    runnerUp: ranked[1] || null,
    thirdPlace: ranked[2] || null,
    fullRankings: ranked,
    isEmpty: false
  };
}

const percent = (r) => `${Math.round(r * 100)}%`;

/**
 * "我的提名"私密进度（本人可见各阶段票数与晋级情况）
 * @param {object} p
 * @param {object} p.entry 报名条目（含 id、initialVotes）
 * @param {string} p.phase 当前阶段
 * @param {boolean} p.needsInitialRound 该门类是否设初选
 * @param {Array|null} p.finalists 决赛名单（初选尚未结算为 null）
 * @param {Object} p.finalStats { [entryId]: { wins, games, lastWinTime } }
 * @returns {{ title: string, detail: string, tone: string }}
 */
function computeEntryProgress({ entry, phase, needsInitialRound, finalists, finalStats }) {
  const phaseIdx = PHASE_ORDER.indexOf(phase);
  const initialVotes = entry.initialVotes || 0;

  if (phaseIdx <= 0) return { title: '报名成功', detail: '等待初选开始', tone: 'neutral' };

  if (phaseIdx === 1) {
    if (!needsInitialRound) {
      return { title: '直接晋级', detail: `本门类报名不足 ${FINALIST_COUNT + 1} 只，免初选直接进入决赛`, tone: 'good' };
    }
    return { title: '初选投票中', detail: `当前已被选中 ${initialVotes} 次（前 ${FINALIST_COUNT} 名晋级决赛）`, tone: 'neutral' };
  }

  if (!(finalists || []).some(f => f.id === entry.id)) {
    return { title: '止步初选', detail: `初选共被选中 ${initialVotes} 次，感谢参与！`, tone: 'muted' };
  }

  const s = (finalStats || {})[entry.id] || {};
  const wins = s.wins || 0;
  const games = s.games || 0;
  const record = games ? `${wins} 胜 / ${games} 场 · 胜率 ${percent(wins / games)}` : '还没有对局结果';

  if (phaseIdx === 2) return { title: '决赛 PK 中', detail: `当前战绩：${record}`, tone: 'neutral' };

  const ranked = resolveFinalRankings(finalists, finalStats).fullRankings.find(r => r.id === entry.id);
  const labels = { 1: '冠军 🥇', 2: '亚军 🥈', 3: '季军 🥉' };
  if (ranked && labels[ranked.rank]) return { title: labels[ranked.rank], detail: `决赛战绩：${record}`, tone: 'gold' };
  return { title: '决赛入围', detail: `决赛战绩：${record}，感谢参与！`, tone: 'muted' };
}

module.exports = {
  PHASE_ORDER,
  FINALIST_COUNT,
  MAX_FINAL_PAIRS,
  isPhaseOpen,
  resolveInitialRound,
  countPairCoverage,
  generateFinalPairs,
  resolveFinalRankings,
  computeEntryProgress
};
