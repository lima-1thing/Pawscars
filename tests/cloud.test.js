/**
 * 云函数权限与唯一性回归测试（使用内存版 wx-server-sdk 模拟）
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

console.log('Testing cloud bracket.js stays in sync with the mini program copy...');
assert.strictEqual(
  fs.readFileSync(path.join(__dirname, '../cloudfunctions/adminOps/bracket.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '../miniprogram/utils/bracket.js'), 'utf8'),
  'cloudfunctions/adminOps/bracket.js 与 miniprogram/utils/bracket.js 不一致，请同步复制'
);

// ---------------- 内存数据库 ----------------
const tables = {};
let currentOpenid = '';
const table = (name) => (tables[name] = tables[name] || {});

const matches = (doc, where) => Object.keys(where).every(key => {
  const cond = where[key];
  if (cond && cond.__op === 'neq') return doc[key] !== cond.value;
  if (cond && cond.__op === 'in') return cond.value.includes(doc[key]);
  return doc[key] === cond;
});

function query(name, where = {}) {
  const rows = () => Object.values(table(name)).filter(d => matches(d, where));
  return {
    skip() { return this; },
    limit() { return this; },
    async get() { return { data: rows() }; },
    async count() { return { total: rows().length }; },
    async remove() { const r = rows(); r.forEach(d => delete table(name)[d._id]); return { stats: { removed: r.length } }; },
    async update({ data }) {
      const r = rows();
      r.forEach(d => Object.keys(data).forEach(k => {
        d[k] = data[k] && data[k].__op === 'inc' ? (d[k] || 0) + data[k].value : data[k];
      }));
      return { stats: { updated: r.length } };
    }
  };
}

let autoId = 0;
const fakeDb = {
  command: {
    neq: (value) => ({ __op: 'neq', value }),
    in: (value) => ({ __op: 'in', value }),
    inc: (value) => ({ __op: 'inc', value }),
    remove: () => undefined
  },
  serverDate: () => Date.now(),
  collection(name) {
    return {
      where: (w) => query(name, w),
      count: () => query(name).count(),
      doc(id) {
        return {
          async get() {
            if (!table(name)[id]) throw new Error('document not exists');
            return { data: table(name)[id] };
          },
          async set({ data }) { table(name)[id] = { ...data, _id: id }; },
          async update(args) { return query(name, { _id: id }).update(args); },
          async remove() { delete table(name)[id]; }
        };
      },
      async add({ data }) {
        const id = data._id || `auto_${++autoId}`;
        if (table(name)[id]) throw new Error('duplicate key');
        table(name)[id] = { ...data, _id: id };
        return { _id: id };
      }
    };
  }
};

const fakeSdk = {
  DYNAMIC_CURRENT_ENV: 'test',
  init() {},
  database: () => fakeDb,
  getWXContext: () => ({ OPENID: currentOpenid })
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'wx-server-sdk') return 'wx-server-sdk';
  return originalResolve.call(this, request, ...rest);
};
require.cache['wx-server-sdk'] = { id: 'wx-server-sdk', filename: 'wx-server-sdk', loaded: true, exports: fakeSdk };

const fn = (name) => require(`../cloudfunctions/${name}/index.js`).main;
const as = (openid, name, event) => { currentOpenid = openid; return fn(name)(event); };

(async () => {
  table('Activity').main_config = {
    _id: 'main_config',
    currentPhase: 'nominate',
    phaseDeadlines: {},
    adminOpenids: ['openid_admin'],
    categories: [{ id: 'food', name: '干饭王者' }]
  };

  console.log('Testing adminOps ignores client-supplied identity...');
  let res = await as('openid_attacker', 'adminOps', { action: 'setPhase', ldap: 'LIMA0001', payload: { targetPhase: 'awards' } });
  assert.strictEqual(res.success, false);
  assert.strictEqual(table('Activity').main_config.currentPhase, 'nominate');
  res = await as('openid_admin', 'adminOps', { action: 'renameCategory', payload: { categoryId: 'food', name: '干饭之王' } });
  assert.strictEqual(res.success, true);

  console.log('Testing bindUser uniqueness...');
  assert.strictEqual((await as('openid_a', 'bindUser', { ldap: 'LIMA0001' })).success, false);
  assert.strictEqual((await as('openid_a', 'bindUser', { ldap: 'jennifer' })).success, true);
  assert.match((await as('openid_b', 'bindUser', { ldap: 'JENNIFER' })).message, /已被使用/);
  assert.match((await as('openid_a', 'bindUser', { ldap: 'ZHANG' })).message, /你已绑定/);

  console.log('Testing submitNomination validation...');
  res = await as('openid_a', 'submitNomination', { petName: '团子', photoUrl: 'wxfile://tmp.jpg', categoryIds: ['food'], pledged: true });
  assert.strictEqual(res.success, false);
  res = await as('openid_a', 'submitNomination', { petName: '团子', photoUrl: 'cloud://x.jpg', categoryIds: ['food', 'nope'], pledged: true });
  assert.strictEqual(res.addedEntries.length, 1);
  res = await as('openid_a', 'submitNomination', { petName: '团子', photoUrl: 'cloud://x.jpg', categoryIds: ['food'], pledged: true });
  assert.deepStrictEqual(res.skippedCategories, ['干饭之王']);
  const entryId = Object.keys(table('Entry'))[0];

  console.log('Testing submitVote phase gating and one-vote-per-user...');
  res = await as('openid_a', 'submitVote', { voteType: 'initial', categoryId: 'food', selectedEntryIds: [entryId] });
  assert.match(res.message, /截止/);
  table('Activity').main_config.currentPhase = 'vote_initial';
  res = await as('openid_a', 'submitVote', { voteType: 'initial', categoryId: 'food', selectedEntryIds: [entryId, entryId] });
  assert.strictEqual(res.success, true);
  assert.strictEqual(table('Entry')[entryId].initialVotes, 1);
  res = await as('openid_a', 'submitVote', { voteType: 'initial', categoryId: 'food', selectedEntryIds: [entryId] });
  assert.match(res.message, /已锁定/);
  assert.strictEqual(table('Entry')[entryId].initialVotes, 1);

  console.log('Testing adminOps settles stages idempotently...');
  ['BBB', 'CCC', 'DDD', 'EEE'].forEach((ldap, i) => {
    table('Entry')[`e${i}`] = { _id: `e${i}`, categoryId: 'food', petName: `宠物${i}`, ownerLdap: ldap, status: 'active' };
  });
  await as('openid_admin', 'adminOps', { action: 'setPhase', payload: { targetPhase: 'vote_match_8' } });
  const knockout = Object.values(table('Match')).filter(m => m.stage === '8进4');
  assert.strictEqual(knockout.length, 3); // 5 只：2 场对决 + 1 场轮空
  assert.strictEqual(knockout.filter(m => m.status === 'bye').length, 1);
  table('Match').food_qf_1.votesB = 2;
  await as('openid_admin', 'adminOps', { action: 'setPhase', payload: { targetPhase: 'vote_match_8' } });
  assert.strictEqual(table('Match').food_qf_1.votesB, 2); // 重复推进不会重置票数
  await as('openid_admin', 'adminOps', { action: 'setPhase', payload: { targetPhase: 'vote_match_4' } });
  assert.strictEqual(Object.values(table('Match')).filter(m => m.stage === '4强德比').length, 3); // 3 强循环赛
  await as('openid_admin', 'adminOps', { action: 'setPhase', payload: { targetPhase: 'nominate' } });
  assert.strictEqual(Object.keys(table('Match')).length, 0);
  assert.strictEqual(Object.keys(table('InitialSelection')).length, 0);

  console.log('Testing submitCongrats only opens during awards...');
  assert.strictEqual((await as('openid_a', 'submitCongrats', { content: '恭喜！' })).success, false);
  table('Activity').main_config.currentPhase = 'awards';
  assert.strictEqual((await as('openid_a', 'submitCongrats', { content: '恭喜！' })).success, true);
  assert.match((await as('openid_a', 'submitCongrats', { content: '再来一条' })).message, /仅限/);

  console.log('All cloud function tests passed!');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
