/**
 * 赛制边界 & 数据层回归测试
 */
const assert = require('assert');
const {
  resolveInitialRound,
  buildKnockoutStage,
  getKnockoutWinners,
  resolveMatchWinner,
  resolveFinalRankings,
  generateDerbyMatches
} = require('../miniprogram/utils/bracket');
const StorageService = require('../miniprogram/utils/storage');

const makeEntries = (n, categoryId = 'food') =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i + 1}`,
    categoryId,
    petName: `宠物${i + 1}`,
    ownerLdap: String.fromCharCode(65 + i).repeat(3), // AAA, BBB, CCC...
    status: 'active'
  }));

console.log('Testing tie-break when both sides are 0:0...');
assert.strictEqual(resolveMatchWinner({ entryA: {}, entryB: {}, votesA: 0, votesB: 0, lastVoteTimeA: 0, lastVoteTimeB: 0 }), 'A');
assert.strictEqual(resolveMatchWinner({ entryA: {}, entryB: {}, votesA: 3, votesB: 3, lastVoteTimeA: 200, lastVoteTimeB: 100 }), 'B');
assert.strictEqual(resolveMatchWinner({ entryA: {}, entryB: {}, votesA: 3, votesB: 3, lastVoteTimeA: 100, lastVoteTimeB: 200 }), 'A');

console.log('Testing categories with <= 8 entries skip the initial round...');
assert.strictEqual(resolveInitialRound(makeEntries(8), []).top8.length, 8);
assert.strictEqual(resolveInitialRound(makeEntries(8), []).skipToStage, 'vote_match_8');
assert.strictEqual(resolveInitialRound(makeEntries(3), []).skipToStage, 'vote_match_4');
assert.strictEqual(resolveInitialRound([], []).skipToStage, 'awards');

console.log('Testing knockout with a bye (5 qualifiers)...');
const ko5 = buildKnockoutStage(makeEntries(5), 'food');
assert.strictEqual(ko5.directToDerby, false);
assert.strictEqual(ko5.matches.length, 3);
assert.strictEqual(ko5.matches[2].entryB, null);
assert.strictEqual(ko5.matches[2].status, 'bye');
const winners5 = getKnockoutWinners(ko5.matches);
assert.strictEqual(winners5.length, 3);
assert.strictEqual(winners5[2].ownerLdap, 'EEE'); // 轮空者直接晋级

console.log('Testing <= 4 qualifiers go straight to the derby...');
const ko4 = buildKnockoutStage(makeEntries(4), 'food');
assert.strictEqual(ko4.directToDerby, true);
assert.strictEqual(ko4.matches.length, 0);

console.log('Testing derby sizes...');
assert.strictEqual(generateDerbyMatches(makeEntries(3), 'food').length, 3);
assert.strictEqual(generateDerbyMatches(makeEntries(3), 'food')[0].totalMatches, 3);
assert.strictEqual(generateDerbyMatches(makeEntries(2), 'food').length, 1);

console.log('Testing final rankings never fall back to entry order...');
assert.strictEqual(resolveFinalRankings([], []).isEmpty, true);
assert.strictEqual(resolveFinalRankings([], []).champion, null);
assert.strictEqual(resolveFinalRankings(makeEntries(1), []).champion.id, 'e1');

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

// 进入 8进4：生成对阵后投票，再次 setPhase 不应重置票数
StorageService.setPhase('vote_match_8');
const ko = StorageService.getVotableMatches('food', '8进4');
assert.ok(ko.length > 0);
StorageService.submitMatchVote(ko[0].id, 'B');
StorageService.setPhase('vote_match_8');
assert.strictEqual(StorageService.getMatches('food', '8进4')[0].votesB, 1);
assert.throws(() => StorageService.submitMatchVote(ko[0].id, 'A'), /已投过票/);
assert.throws(() => StorageService.submitMatchVote(ko[0].id, 'C'), /参数无效/);

// 颁奖前没有结果；直接跳到颁奖会补齐德比并按德比结算
assert.strictEqual(StorageService.getAwardsResult('food'), null);
StorageService.setPhase('awards');
const awards = StorageService.getAwardsResult('food');
assert.ok(awards && awards.champion);
assert.ok(StorageService.getFinalists('food').some(f => f.id === awards.champion.id));

// 回退到 8进4：德比与其投票被清除，8进4 票数保留
StorageService.setPhase('vote_match_8');
assert.strictEqual(StorageService.getMatches('food', '4强德比').length, 0);
assert.strictEqual(StorageService.getMatches('food', '8进4')[0].votesB, 1);

// 回退到报名期：对阵与初选票全部作废，可以重新投
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

console.log('Testing app.js launches without throwing...');
let appDef = null;
global.App = (def) => { appDef = def; };
global.wx = {
  getStorageSync: () => '',
  setStorageSync: () => {},
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'release' } })
};
require('../miniprogram/app.js');
appDef.onLaunch();
assert.strictEqual(appDef.globalData.isAdmin, false);
assert.strictEqual(appDef.isDevBuild(), false);
delete global.App;
delete global.wx;

console.log('All storage and edge-case tests passed!');
