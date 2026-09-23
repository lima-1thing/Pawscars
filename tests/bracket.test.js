const assert = require('assert');
const { validateLdap, validatePetName, validateCongrats } = require('../miniprogram/utils/validator');
const { maskLdap } = require('../miniprogram/utils/mask');
const {
  resolveInitialRound,
  generateQuarterFinalMatches,
  resolveMatchWinner,
  generateDerbyMatches,
  resolveDerbyRankings
} = require('../miniprogram/utils/bracket');

console.log('Testing Validator...');
assert.strictEqual(validateLdap('JENNIFER').valid, true);
assert.strictEqual(validateLdap('Alex').valid, true);
// 管理员不走活动ID例外：含数字/符号的ID一律拒绝
assert.strictEqual(validateLdap('LIMA0001').valid, false);
assert.strictEqual(validateLdap('privacy-by-design').valid, false);
assert.strictEqual(validateLdap('Alex123').valid, false);
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

console.log('Testing 8-to-4 Pairing (Alphabetical sorting A-Z)...');
// Top 8 sorted by ownerLdap:
// ALICE (3), BOBBY (4), CHARLIE (5), DAVID (6), EMILY (7), FRANK (8), JENNIFER (1), ZHANG (2)
const qfMatches = generateQuarterFinalMatches(initialResult.top8, 'food');
assert.strictEqual(qfMatches.length, 4);
assert.strictEqual(qfMatches[0].entryA.ownerLdap, 'ALICE');
assert.strictEqual(qfMatches[0].entryB.ownerLdap, 'BOBBY');
assert.strictEqual(qfMatches[1].entryA.ownerLdap, 'CHARLIE');
assert.strictEqual(qfMatches[1].entryB.ownerLdap, 'DAVID');
assert.strictEqual(qfMatches[2].entryA.ownerLdap, 'EMILY');
assert.strictEqual(qfMatches[2].entryB.ownerLdap, 'FRANK');
assert.strictEqual(qfMatches[3].entryA.ownerLdap, 'JENNIFER');
assert.strictEqual(qfMatches[3].entryB.ownerLdap, 'ZHANG');

console.log('Testing 4-strong Derby matches...');
const final4 = [qfMatches[0].entryA, qfMatches[1].entryA, qfMatches[2].entryA, qfMatches[3].entryA];
const derbyMatches = generateDerbyMatches(final4, 'food');
assert.strictEqual(derbyMatches.length, 6);

console.log('Testing Derby Rankings...');
// Simulate votes on derby matches
derbyMatches[0].votesA = 10; derbyMatches[0].votesB = 5; // A wins
derbyMatches[1].votesA = 10; derbyMatches[1].votesB = 5; // C wins
derbyMatches[2].votesA = 10; derbyMatches[2].votesB = 5; // A wins
derbyMatches[3].votesA = 5;  derbyMatches[3].votesB = 10; // D wins
derbyMatches[4].votesA = 10; derbyMatches[4].votesB = 5; // A wins
derbyMatches[5].votesA = 5;  derbyMatches[5].votesB = 10; // C wins

const derbyRankings = resolveDerbyRankings(final4, derbyMatches);
assert.strictEqual(derbyRankings.champion.ownerLdap, 'ALICE'); // 3 wins

console.log('All algorithm and bracket tests passed successfully!');
