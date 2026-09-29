const assert = require('assert');
const { validateLdap, validatePetName, validateCongrats } = require('../miniprogram/utils/validator');
const { maskLdap } = require('../miniprogram/utils/mask');
const {
  resolveInitialRound,
  countPairCoverage,
  generateFinalPairs,
  resolveFinalRankings,
  computeEntryProgress
} = require('../miniprogram/utils/bracket');

console.log('Testing Validator...');
assert.strictEqual(validateLdap('JENNIFER').valid, true);
assert.strictEqual(validateLdap('Alex').valid, true);
// 字母开头、字母和数字组成；符号、空格、纯数字、数字开头一律拒绝
assert.strictEqual(validateLdap('LIMA0001').valid, true);
assert.strictEqual(validateLdap('Alex123').valid, true);
assert.strictEqual(validateLdap('privacy-by-design').valid, false);
assert.strictEqual(validateLdap('0001').valid, false);
assert.strictEqual(validateLdap('1LIMA').valid, false);
assert.strictEqual(validateLdap('LI MA').valid, false);
assert.strictEqual(validateLdap('A'.repeat(21)).valid, false);
assert.strictEqual(validateLdap('Tom_Cat').valid, false);
assert.strictEqual(validateLdap('A').valid, false);
assert.strictEqual(validateLdap('').valid, false);

assert.strictEqual(validatePetName('团子').valid, true);
assert.strictEqual(validatePetName('').valid, false);
assert.strictEqual(validatePetName('a'.repeat(21)).valid, false);

assert.strictEqual(validateCongrats('太棒了！').valid, true);
assert.strictEqual(validateCongrats('a'.repeat(51)).valid, false);

console.log('Testing Masking...');
assert.strictEqual(maskLdap('JENNIFER'), 'JE******');
assert.strictEqual(maskLdap('ZHANG'), 'ZH***');
assert.strictEqual(maskLdap('BO'), 'B*');
assert.strictEqual(maskLdap('JENNIFER', true), '主人 JE******');

console.log('Testing Initial Round Resolution & Tie-breaking...');
const mockEntries = [
  { id: '1', name: '团子', ownerLdap: 'JENNIFER' },
  { id: '2', name: '旺财', ownerLdap: 'ZHANG' },
  { id: '3', name: '小白', ownerLdap: 'ALICE' },
  { id: '4', name: '大黄', ownerLdap: 'BOBBY' },
  { id: '5', name: '可乐', ownerLdap: 'CHARLIE' },
  { id: '6', name: '雪球', ownerLdap: 'DAVID' },
  { id: '7', name: '年糕', ownerLdap: 'EMILY' },
  { id: '8', name: '奶茶', ownerLdap: 'FRANK' },
  { id: '9', name: '麻薯', ownerLdap: 'GEORGE' }
];

// Votes with tie at 8th place (id 8 and id 9 both get 2 votes, but id 8 reached 2 votes at t=100, id 9 at t=200)
const mockVotes = [
  { entryId: '1', timestamp: 10 }, { entryId: '1', timestamp: 20 }, { entryId: '1', timestamp: 30 },
  { entryId: '2', timestamp: 10 }, { entryId: '2', timestamp: 20 },
  { entryId: '3', timestamp: 10 }, { entryId: '3', timestamp: 20 },
  { entryId: '4', timestamp: 10 }, { entryId: '4', timestamp: 20 },
  { entryId: '5', timestamp: 10 }, { entryId: '5', timestamp: 20 },
  { entryId: '6', timestamp: 10 }, { entryId: '6', timestamp: 20 },
  { entryId: '7', timestamp: 10 }, { entryId: '7', timestamp: 20 },
  { entryId: '8', timestamp: 50 }, { entryId: '8', timestamp: 100 }, // reach 2 at 100
  { entryId: '9', timestamp: 80 }, { entryId: '9', timestamp: 200 }  // reach 2 at 200
];

const initialResult = resolveInitialRound(mockEntries, mockVotes);
assert.strictEqual(initialResult.top8.length, 8);
// id: 8 should advance over id: 9 because lastVoteTime (100) < (200)
const top8Ids = initialResult.top8.map(e => e.id);
assert.strictEqual(top8Ids.includes('8'), true);
assert.strictEqual(top8Ids.includes('9'), false);

console.log('Testing final-round pair generation fairness...');
// 固定种子的伪随机数，保证测试可重复
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const finalistIds = initialResult.top8.map(e => e.id);
const pairKey = (p) => [p.a, p.b].sort().join('-');
const assigned = [];
for (let voter = 1; voter <= 70; voter++) {
  // 依次分配：每位投票人参考之前所有人的覆盖情况
  const pairs = generateFinalPairs(finalistIds, { rng: seeded(voter), coverage: countPairCoverage(assigned) });
  assigned.push(pairs);
  assert.strictEqual(pairs.length, 8); // 每人每门类最多 8 场
  const appear = {};
  pairs.forEach(p => {
    assert.notStrictEqual(p.a, p.b);
    [p.a, p.b].forEach(id => { appear[id] = (appear[id] || 0) + 1; });
  });
  // 每只毛孩恰好出场 2 次，且同一人不会遇到重复对局
  assert.deepStrictEqual(Object.values(appear).sort(), Array(8).fill(2));
  assert.strictEqual(new Set(pairs.map(pairKey)).size, 8);
  // 7 位投票人即可覆盖全部 28 种两两组合
  if (voter === 7) assert.strictEqual(Object.keys(countPairCoverage(assigned)).length, 28);
}
// 70 位投票人：每种组合被覆盖的次数非常接近（期望 20 次）
const coverage = Object.values(countPairCoverage(assigned));
assert.strictEqual(coverage.length, 28);
assert.ok(Math.max(...coverage) - Math.min(...coverage) <= 3, `coverage spread too wide: ${coverage}`);
// 选手不足 8 只：场次等于人数；2 只一场；1 只无需投票
assert.strictEqual(generateFinalPairs(['a', 'b', 'c', 'd', 'e']).length, 5);
assert.strictEqual(generateFinalPairs(['a', 'b', 'c']).length, 3);
assert.strictEqual(generateFinalPairs(['a', 'b']).length, 1);
assert.strictEqual(generateFinalPairs(['a']).length, 0);

console.log('Testing final rankings by win rate...');
const fin = [
  { id: 'x', ownerLdap: 'XAVI' }, { id: 'y', ownerLdap: 'YAN' }, { id: 'z', ownerLdap: 'ZOE' }, { id: 'w', ownerLdap: 'WEN' }
];
const ranking = resolveFinalRankings(fin, {
  x: { wins: 3, games: 4, lastWinTime: 50 },   // 75%
  y: { wins: 2, games: 2, lastWinTime: 90 },   // 100%，但场次少
  z: { wins: 3, games: 4, lastWinTime: 40 },   // 75%，同胜场更早达到 → 排在 x 前
  w: { wins: 0, games: 4 }
});
assert.deepStrictEqual(ranking.fullRankings.map(r => r.id), ['y', 'z', 'x', 'w']);
assert.strictEqual(ranking.champion.id, 'y');
assert.strictEqual(ranking.thirdPlace.id, 'x');
assert.strictEqual(resolveFinalRankings([], {}).isEmpty, true);
assert.strictEqual(resolveFinalRankings([fin[0]], {}).champion.id, 'x'); // 只有 1 只直接夺冠

console.log('Testing private progress text...');
assert.strictEqual(computeEntryProgress({ entry: { id: 'x' }, phase: 'vote_final', finalists: fin, finalStats: { x: { wins: 3, games: 4 } } }).detail, '当前战绩：3 胜 / 4 场 · 胜率 75%');
assert.strictEqual(computeEntryProgress({ entry: { id: 'q', initialVotes: 2 }, phase: 'vote_final', finalists: fin, finalStats: {} }).title, '止步初选');
assert.strictEqual(computeEntryProgress({ entry: { id: 'y' }, phase: 'awards', finalists: fin, finalStats: { y: { wins: 2, games: 2 } } }).title, '冠军 🥇');

console.log('All algorithm and bracket tests passed successfully!');
