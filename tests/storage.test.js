/**
 * 赛制边界 & 数据层回归测试
 */
const assert = require('assert');
const { resolveInitialRound, resolveFinalRankings } = require('../miniprogram/utils/bracket');
const StorageService = require('../miniprogram/utils/storage');

const makeEntries = (n, categoryId = 'food') =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i + 1}`,
    categoryId,
    petName: `宠物${i + 1}`,
    ownerLdap: String.fromCharCode(65 + i).repeat(3), // AAA, BBB, CCC...
    status: 'active'
  }));

console.log('Testing categories with <= 8 entries skip the initial round...');
assert.strictEqual(resolveInitialRound(makeEntries(8), []).top8.length, 8);
assert.strictEqual(resolveInitialRound(makeEntries(8), []).skipToStage, 'vote_final');
assert.strictEqual(resolveInitialRound(makeEntries(3), []).skipToStage, 'vote_final');
assert.strictEqual(resolveInitialRound([], []).skipToStage, 'awards');
assert.strictEqual(resolveInitialRound(makeEntries(9), []).top8.length, 8);

console.log('Testing final rankings never fall back to entry order...');
assert.strictEqual(resolveFinalRankings([], {}).isEmpty, true);
assert.strictEqual(resolveFinalRankings([], {}).champion, null);
assert.strictEqual(resolveFinalRankings(makeEntries(1), {}).champion.id, 'e1');

console.log('Testing storage phase flow is idempotent and gated...');
StorageService.resetAll();
StorageService.saveConfig({ phaseDeadlines: {} });
StorageService.bindUser('JENNIFER');

// 非报名期不能报名
StorageService.setPhase('vote_initial');
assert.throws(() => StorageService.submitNominations({ petName: '新宠', photoUrl: 'x.jpg', categoryIds: ['food'] }), /报名已截止/);

// 初选：去重 & 上限 & 必须属于该门类
StorageService.setPhase('nominate');
assert.throws(() => StorageService.submitInitialVote('food', ['entry_f1']), /初选投票已截止/);
StorageService.setPhase('vote_initial');
assert.throws(() => StorageService.submitInitialVote('food', ['not_exist']), /无效/);
const foodIds = StorageService.getEntries('food').map(e => e.id);
StorageService.submitInitialVote('food', [foodIds[0], foodIds[0]]);
assert.strictEqual(StorageService.getInitialVotesForUser('food').selectedEntryIds.length, 1);
assert.strictEqual(StorageService.getEntries('food').find(e => e.id === foodIds[0]).initialVotes, 1);

// 进入决赛：每位投票人随机分到对局（首次进入时生成并固定），再次 setPhase 不应清票
assert.deepStrictEqual(StorageService.getMyFinalPairs('food'), []); // 决赛名单尚未生成
StorageService.setPhase('vote_final');
const finalists = StorageService.getFinalists('food');
assert.strictEqual(finalists.length, Math.min(8, foodIds.length));
const pairs = StorageService.getMyFinalPairs('food');
assert.strictEqual(pairs.length, Math.min(8, finalists.length));
assert.deepStrictEqual(StorageService.getMyFinalPairs('food').map(p => p.entryA.id), pairs.map(p => p.entryA.id)); // 对局固定
StorageService.submitFinalVote('food', 0, 'B');
assert.throws(() => StorageService.submitFinalVote('food', 0, 'A'), /已投过票/);
assert.throws(() => StorageService.submitFinalVote('food', 1, 'C'), /参数无效/);
assert.throws(() => StorageService.submitFinalVote('food', 99, 'A'), /对局不存在/);
StorageService.setPhase('vote_final');
const winnerId = pairs[0].entryB.id;
assert.deepStrictEqual(StorageService.getFinalStats('food')[winnerId], { wins: 1, games: 1, lastWinTime: StorageService.getFinalStats('food')[winnerId].lastWinTime });
assert.strictEqual(StorageService.getMyFinalPairs('food')[0].myVote, 'B');

// 颁奖：按决赛胜率结算，赢过的那只排第一
StorageService.setPhase('awards');
const awards = StorageService.getAwardsResult('food');
assert.strictEqual(awards.champion.id, winnerId);
assert.throws(() => StorageService.submitFinalVote('food', 1, 'A'), /已截止/);

// 回退到初选：决赛名单、对局、票数全部清除，初选选票保留
StorageService.setPhase('vote_initial');
assert.strictEqual(StorageService.getQualifiers('food'), null);
assert.strictEqual(StorageService.getFinalStats('food')[winnerId].games, 0);
assert.ok(StorageService.getInitialVotesForUser('food'));

// 回退到报名期：初选票全部作废，可以重新投
StorageService.setPhase('nominate');
assert.strictEqual(StorageService.getQualifiers('food'), null);
assert.strictEqual(StorageService.getInitialVotesForUser('food'), null);

// 贺词仅颁奖期开放
assert.throws(() => StorageService.submitCongrats('恭喜！'), /颁奖典礼开始后/);

// 截止时间已过，即使阶段未切换也不能投票
StorageService.setPhase('vote_initial');
StorageService.saveConfig({ phaseDeadlines: { vote_initial: Date.now() - 1000 } });
assert.throws(() => StorageService.submitInitialVote('food', [foodIds[1]]), /已截止/);
StorageService.saveConfig({ phaseDeadlines: {} });

// 管理员只认 openid 白名单
StorageService.bindUser('DEVELOPER');
assert.strictEqual(StorageService.isAdmin(), false);
StorageService.saveConfig({ adminOpenids: ['user_developer'] });
assert.strictEqual(StorageService.isAdmin(), true);

console.log('All storage and edge-case tests passed!');
