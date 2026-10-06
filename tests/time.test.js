/**
 * 首页赛程（buildSchedule）：日期区间与各赛段状态
 */
const assert = require('assert');
const { buildSchedule } = require('../miniprogram/utils/time');

const at = (m, d) => new Date(2026, m - 1, d).getTime(); // 本地时间 0 点
const config = {
  currentPhase: 'vote_initial',
  nominateStart: at(10, 16),
  phaseDeadlines: { nominate: at(10, 21), vote_initial: at(10, 24), vote_final: at(10, 27) }
};

console.log('Testing schedule dates and statuses...');
const rows = buildSchedule(config, at(10, 22));
assert.deepStrictEqual(rows.map(r => [r.label, r.dates, r.status, r.state]), [
  ['提名', '10/16-10/20', '提名已结束', 'done'],
  ['初选', '10/21-10/23', '投票进行中', 'active'],
  ['决赛', '10/24-10/26', '赛段未开始', 'upcoming']
]);

// 当前赛段过了截止时间但尚未推进
assert.strictEqual(buildSchedule(config, at(10, 25))[1].status, '已截止，等待结算');

// 缺少开始或截止时间
const partial = buildSchedule({ currentPhase: 'nominate', phaseDeadlines: { nominate: at(10, 21) } }, at(10, 18));
assert.deepStrictEqual(partial.map(r => r.dates), ['截至 10/20', '10/21 起', '时间待定']);
assert.strictEqual(partial[0].status, '提名进行中');

// 颁奖阶段：三个赛段都已结束
assert.ok(buildSchedule({ ...config, currentPhase: 'awards' }, at(10, 28)).every(r => r.state === 'done'));

console.log('All schedule tests passed!');
