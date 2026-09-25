/**
 * 前后台联调测试：小程序 utils/api.js（gcloud 模式）→ gcloud-functions 真实路由（内存数据库）
 * wx.request / wx.uploadFile / wx.login 被替换为直接调用后台处理函数；每个用户是一台独立的"手机"
 * 需要先安装后台依赖：npm ci --prefix gcloud-functions
 */
const assert = require('assert');
const path = require('path');
const { createApp } = require('../gcloud-functions/src/app');
const { createMemoryDb } = require('../gcloud-functions/src/db/memory');

const API_BASE_URL = 'https://api.pawscars.test';
const PHOTO_BASE = 'https://storage.googleapis.com/pawscars-test/';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(16)]);

// 小程序使用的 env.js 指向测试后台
require.cache[require.resolve('../miniprogram/env')] = {
  id: 'env', filename: 'env', loaded: true,
  exports: { BACKEND: 'gcloud', API_BASE_URL }
};

const db = createMemoryDb();
const handler = createApp({
  config: {
    wxAppId: 'wx_test', wxAppSecret: 's', tokenSecret: 'token-secret',
    photoBucket: 'pawscars-test', cronSecret: 'cron', tokenTtlHours: 1
  },
  db,
  storage: { publicUrl: (p = '') => PHOTO_BASE + p, save: async (p) => PHOTO_BASE + p },
  wx: { code2Session: async (code) => code.replace('code:', '') }
});

async function callBackend(url, { body = {}, headers = {}, rawBody, contentType }) {
  const allHeaders = {};
  Object.entries(headers).forEach(([k, v]) => { allHeaders[k.toLowerCase()] = v; });
  allHeaders['content-type'] = contentType || 'application/json';
  const req = {
    method: 'POST',
    path: url.slice(API_BASE_URL.length),
    body: rawBody ? {} : body,
    rawBody: rawBody || Buffer.from(JSON.stringify(body)),
    headers: allHeaders,
    get: (name) => allHeaders[name.toLowerCase()]
  };
  let statusCode = 200;
  let data = null;
  const res = { status(s) { statusCode = s; return res; }, json(b) { data = b; return res; } };
  await handler(req, res);
  return { statusCode, data };
}

function multipart(fields, fileBuffer) {
  const boundary = '----pawscars';
  const parts = Object.entries(fields).map(([k, v]) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), fileBuffer, Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { contentType: `multipart/form-data; boundary=${boundary}`, rawBody: Buffer.concat(parts) };
}

// 当前操作的手机（初始为一台空手机，供模块加载时的本地存储初始化使用）
let current = { openid: '', storage: {}, requests: [] };
global.wx = {
  getStorageSync: (k) => (current.storage[k] === undefined ? '' : current.storage[k]),
  setStorageSync: (k, v) => { current.storage[k] = v; },
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'release' } }),
  login: ({ success }) => success({ code: `code:${current.openid}` }),
  request: ({ url, data, header, success, fail }) => {
    current.requests.push(url.slice(API_BASE_URL.length));
    callBackend(url, { body: data, headers: header }).then(success, fail);
  },
  uploadFile: ({ url, formData, header, success, fail }) => {
    const { rawBody, contentType } = multipart(formData, PNG);
    callBackend(url, { rawBody, contentType, headers: header })
      .then(r => success({ statusCode: r.statusCode, data: JSON.stringify(r.data) }), fail);
  }
};

// 每台手机加载一份独立的 api.js（各自的令牌与状态）
function newPhone(openid) {
  delete require.cache[require.resolve('../miniprogram/utils/api')];
  return { openid, storage: {}, requests: [], api: require('../miniprogram/utils/api') };
}
const on = (phone, fn) => { current = phone; return fn(phone.api); };

(async () => {
  await db.set('Activity', 'main_config', { currentPhase: 'nominate', phaseDeadlines: {}, adminOpenids: ['o_admin'] });
  const alice = newPhone('o_alice');
  const bob = newPhone('o_bob');
  const admin = newPhone('o_admin');

  console.log('Testing login, bootstrap and token reuse...');
  await on(alice, api => api.init());
  assert.strictEqual(alice.api.getMode(), 'gcloud');
  assert.deepStrictEqual(alice.requests, ['/login']);
  assert.strictEqual(alice.api.getState().user, null);
  assert.ok(alice.api.getState().categories[0].bg); // 本地配色已合并
  assert.ok(alice.storage.pawscars_api_token);

  // 同一台手机再次启动：复用已保存的令牌，不再重新登录
  alice.api = newPhone('o_alice').api;
  alice.requests = [];
  await on(alice, api => api.init());
  assert.deepStrictEqual(alice.requests, ['/bootstrap']);

  // 令牌失效：自动重新登录并重试
  alice.storage.pawscars_api_token = 'forged.token';
  alice.api = newPhone('o_alice').api;
  alice.requests = [];
  await on(alice, api => api.init());
  assert.deepStrictEqual(alice.requests, ['/bootstrap', '/login']);
  assert.notStrictEqual(alice.storage.pawscars_api_token, 'forged.token');
  assert.ok(alice.storage.pawscars_api_token);

  await on(bob, api => api.init());
  await on(admin, api => api.init());
  assert.strictEqual(admin.api.getState().isAdmin, true);
  assert.strictEqual(alice.api.getState().isAdmin, false);

  console.log('Testing binding and nomination with photo upload...');
  await on(alice, api => api.bindUser('alice'));
  await on(bob, api => api.bindUser('bob'));
  await assert.rejects(on(admin, api => api.bindUser('ALICE')), /已被使用/);
  await on(admin, api => api.bindUser('admin'));

  const nom = await on(alice, api => api.submitNominations({ petName: '肉包', photoPath: 'wxfile://tmp/a.png', categoryIds: ['food'] }));
  assert.strictEqual(nom.addedEntries.length, 1);
  const entryId = nom.addedEntries[0].id;
  assert.ok((await db.get('Entry', entryId)).photoUrl.startsWith(`${PHOTO_BASE}entries/`));
  await on(alice, api => api.updateEntryPhoto(entryId, 'wxfile://tmp/b.png'));
  for (const [i, ldap] of ['CAT', 'DAN', 'EVE', 'FAY'].entries()) {
    await db.set('Entry', `x${i}`, { categoryId: 'food', petName: `宠物${i}`, ownerLdap: ldap, ownerOpenid: `o_x${i}`, photoUrl: PHOTO_BASE + 'p', status: 'active', initialVotes: 0, createdAt: i });
  }
  let mine = await on(alice, api => api.getMyNominations());
  assert.strictEqual(mine[0].ownerLdap, 'AL***');
  assert.strictEqual(mine[0].progress.title, '报名成功');

  console.log('Testing admin actions and stage flow...');
  await assert.rejects(on(bob, api => api.admin('setPhase', { targetPhase: 'awards' })), /权限不足/);
  await on(admin, api => api.admin('setPhase', { targetPhase: 'vote_initial' }));
  assert.strictEqual(admin.api.getState().config.currentPhase, 'vote_initial');
  await on(bob, api => api.refresh());
  assert.strictEqual(bob.api.isPhaseOpen('vote_initial'), true);
  const food = (await on(bob, api => api.getInitialState())).categories.find(c => c.id === 'food');
  assert.strictEqual(food.needsVote, false);
  assert.ok(food.entries.every(e => e.ownerLdap.includes('*') && e.ownerOpenid === undefined));

  await on(admin, api => api.admin('setPhase', { targetPhase: 'vote_match_8' }));
  const pk = (await on(bob, api => api.getMatchState(api.STAGE_KNOCKOUT))).categories.find(c => c.id === 'food');
  assert.ok(pk.generated && pk.matches.length === 2 && pk.matches.every(m => m.votesA === undefined));
  const match = pk.matches.find(m => m.entryA.id === entryId || m.entryB.id === entryId);
  const side = match.entryA.id === entryId ? 'A' : 'B';
  await on(bob, api => api.submitMatchVote(match.id, side));
  await assert.rejects(on(bob, api => api.submitMatchVote(match.id, side)), /已投过/);
  mine = await on(alice, api => api.getMyNominations());
  assert.match(mine[0].progress.detail, /我方 1 票/);

  console.log('Testing awards, certificate data and congratulations...');
  assert.strictEqual(await on(bob, api => api.getAwards('food')), null);
  await on(admin, api => api.admin('setPhase', { targetPhase: 'awards' }));
  await on(bob, api => api.refresh());
  const awards = await on(bob, api => api.getAwards('food'));
  assert.ok(awards.champion && awards.champion.ownerLdap.includes('*'));
  await on(bob, api => api.submitCongrats('恭喜！'));
  const wall = await on(bob, api => api.getCongrats());
  assert.strictEqual(wall.hasSent, true);
  assert.strictEqual(wall.list[0].ownerLdap, 'BO*');

  console.log('Testing admin overview and host avatar upload...');
  const overview = await on(admin, api => api.admin('getOverview'));
  assert.strictEqual(overview.stats.totalEntries, 5);
  await on(admin, api => api.uploadHostAvatar('wxfile://tmp/host.png'));
  assert.ok(admin.api.getState().config.hostAvatar.startsWith(`${PHOTO_BASE}host/`));
  await assert.rejects(on(bob, api => api.uploadHostAvatar('wxfile://tmp/host.png')), /权限不足/);

  console.log(`All front-end ↔ Google Cloud backend integration tests passed! (${path.basename(__filename)})`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
