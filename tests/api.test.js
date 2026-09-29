/**
 * 数据接口层（本地模式）与小程序启动冒烟测试
 */
const assert = require('assert');

// 测试不依赖真实 env.js：模拟"未配置后台地址"的情况
require.cache[require.resolve('../miniprogram/env')] = {
  id: 'env', filename: 'env', loaded: true,
  exports: { BACKEND: 'gcloud', API_BASE_URL: '' }
};

(async () => {
  console.log('Testing app.js launch: release build refuses to run without a backend...');
  let appDef = null;
  let modalShown = false;
  let envVersion = 'release';
  global.App = (def) => { appDef = def; };
  global.wx = {
    getStorageSync: () => '',
    setStorageSync: () => {},
    showModal: () => { modalShown = true; },
    getAccountInfoSync: () => ({ miniProgram: { envVersion } })
  };
  require('../miniprogram/app.js');
  appDef.onLaunch();
  await assert.rejects(appDef.ready, /API_BASE_URL/);
  assert.strictEqual(modalShown, true);

  console.log('Testing app.js launch: dev build falls back to local mock storage...');
  envVersion = 'develop';
  appDef.onLaunch();
  await appDef.ready;
  assert.strictEqual(appDef.globalData.mode, 'mock');
  assert.strictEqual(appDef.checkUserBinding(false), false);
  delete global.App;
  delete global.wx;

  const api = require('../miniprogram/utils/api');
  const StorageService = require('../miniprogram/utils/storage');
  StorageService.resetAll();
  StorageService.saveConfig({ phaseDeadlines: {} });
  await api.refresh();

  console.log('Testing mock API: bind, nominate, initial round, PK, awards, congrats...');
  await api.bindUser('JENNIFER');
  assert.strictEqual(api.getState().user.ldap, 'JENNIFER');

  const nom = await api.submitNominations({ petName: '新宠', photoPath: 'tmp.jpg', categoryIds: ['food'] });
  assert.strictEqual(nom.addedEntries.length, 1);
  const gal = (await api.getGallery()).categories.find(c => c.id === 'food');
  assert.strictEqual(gal.entries[0].petName, '新宠'); // 最新提名在前
  const mine = await api.getMyNominations();
  assert.ok(mine.every(e => e.progress && e.progress.title));

  await api.admin('setPhase', { targetPhase: 'vote_initial' });
  assert.strictEqual(api.getState().config.currentPhase, 'vote_initial');
  assert.strictEqual(api.isPhaseOpen('vote_initial'), true);
  const initial = await api.getInitialState();
  const food = initial.categories.find(c => c.id === 'food');
  assert.strictEqual(food.mySelection, null);
  const ldaps = food.entries.map(e => e.ownerLdap);
  assert.deepStrictEqual(ldaps, [...ldaps].sort((a, b) => a.localeCompare(b)));
  if (food.needsVote) {
    await api.submitInitialVote('food', [food.entries[0].id]);
    assert.deepStrictEqual((await api.getInitialState()).categories.find(c => c.id === 'food').mySelection, [food.entries[0].id]);
  }

  await api.admin('setPhase', { targetPhase: 'vote_final' });
  const fin = (await api.getFinalState()).categories.find(c => c.id === 'food');
  assert.strictEqual(fin.generated, true);
  assert.ok(fin.pairs.length > 0 && fin.pairs.every(p => p.myVote === null));
  await api.submitFinalVote('food', fin.pairs[0].index, 'A');
  assert.strictEqual((await api.getFinalState()).categories.find(c => c.id === 'food').pairs[0].myVote, 'A');
  await assert.rejects(api.submitFinalVote('food', fin.pairs[0].index, 'B'), /已投过/);

  await api.admin('setPhase', { targetPhase: 'awards' });
  const awards = await api.getAwards('food');
  assert.ok(awards.champion);
  assert.strictEqual((await api.getCongrats()).hasSent, true); // 演示数据中 JENNIFER 已发过
  await api.bindUser('KEVIN');
  assert.strictEqual((await api.getCongrats()).hasSent, false);
  await api.submitCongrats('恭喜所有毛孩！');
  assert.strictEqual((await api.getCongrats()).hasSent, true);

  console.log('Testing mock admin API...');
  const overview = await api.admin('getOverview');
  assert.ok(overview.stats.totalEntries > 0);
  await assert.rejects(api.admin('unbindUser', { ldap: 'ZHANG' }), /本机/);
  await api.admin('updateConfig', { title: '新标题' });
  assert.strictEqual(api.getState().config.title, '新标题');

  console.log('All API tests passed!');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
