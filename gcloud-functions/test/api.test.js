/**
 * Pawscars Google Cloud 后台测试：真实路由 + 内存数据库 + 假存储 + 假微信登录
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');
const { createMemoryDb } = require('../src/db/memory');
const { createFirestoreDb } = require('../src/db/firestore');
const { signToken } = require('../src/token');
const { advanceIfDue } = require('../src/settlement');
const { UserError } = require('../src/errors');

const CONFIG = {
  wxAppId: 'wx_test',
  wxAppSecret: 'secret',
  tokenSecret: 'token-secret',
  photoBucket: 'pawscars-photos',
  cronSecret: 'cron-secret',
  tokenTtlHours: 1
};
const PHOTO_BASE = `https://storage.googleapis.com/${CONFIG.photoBucket}/`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(32)]);

// 设置了 FIRESTORE_EMULATOR_HOST 时使用真实 Firestore 适配器连接本地模拟器，否则使用内存库
const USE_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const db = USE_EMULATOR ? createFirestoreDb({ projectId: `pawscars-test-${Date.now()}` }) : createMemoryDb();
const get = (col, id) => db.get(col, id);
const all = (col) => db.query(col, []);
const saved = {};
const storage = {
  publicUrl: (p = '') => PHOTO_BASE + p,
  async save(p, buffer) { saved[p] = buffer; return PHOTO_BASE + p; }
};
// 假微信登录：code 形如 "code:<openid>"
const wx = {
  async code2Session(code) {
    if (!code || !code.startsWith('code:')) throw new UserError('微信登录失败', 401);
    return code.slice(5);
  }
};
const app = createApp({ config: CONFIG, db, storage, wx });

function multipart(fields, fileBuffer) {
  const boundary = '----pawscarsboundary';
  const parts = Object.entries(fields).map(([k, v]) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (fileBuffer) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`));
    parts.push(fileBuffer, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { contentType: `multipart/form-data; boundary=${boundary}`, rawBody: Buffer.concat(parts) };
}

async function call(pathname, { body = {}, token, headers = {}, method = 'POST', raw } = {}) {
  const allHeaders = { 'content-type': 'application/json', ...headers };
  if (token) allHeaders.authorization = `Bearer ${token}`;
  if (raw) allHeaders['content-type'] = raw.contentType;
  const req = {
    method,
    path: pathname,
    body: raw ? {} : body,
    rawBody: raw ? raw.rawBody : Buffer.from(JSON.stringify(body)),
    headers: allHeaders,
    get: (name) => allHeaders[name.toLowerCase()]
  };
  let status = 200;
  let json = null;
  const res = {
    status(s) { status = s; return res; },
    json(b) { json = b; return res; }
  };
  await app(req, res);
  return { status, ...json };
}

const ok = async (promise) => {
  const r = await promise;
  assert.strictEqual(r.success, true, `expected success, got ${JSON.stringify(r)}`);
  return r.data;
};
const fails = async (promise, pattern, status) => {
  const r = await promise;
  assert.strictEqual(r.success, false, `expected failure, got ${JSON.stringify(r)}`);
  if (pattern) assert.match(r.message, pattern);
  if (status) assert.strictEqual(r.status, status);
  return r;
};

async function login(openid) {
  return (await ok(call('/login', { body: { code: `code:${openid}` } }))).token;
}

(async () => {
  console.log('Testing bracket.js copy stays in sync with the mini program...');
  assert.strictEqual(
    fs.readFileSync(path.join(__dirname, '../src/bracket.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '../../miniprogram/utils/bracket.js'), 'utf8'),
    'gcloud-functions/src/bracket.js 与 miniprogram/utils/bracket.js 不一致，请同步复制'
  );

  console.log(`Using ${USE_EMULATOR ? 'Firestore emulator' : 'in-memory db'}`);
  await db.set('Activity', 'main_config', { currentPhase: 'nominate', phaseDeadlines: {}, adminOpenids: ['o_admin'] });

  console.log('Testing routing and auth...');
  assert.strictEqual((await call('/bootstrap', { method: 'GET' })).status, 405);
  assert.strictEqual((await call('/nope')).status, 404);
  await fails(call('/bootstrap'), /登录已过期/, 401);
  await fails(call('/bootstrap', { token: 'forged.token' }), /登录已过期/, 401);
  await fails(call('/bootstrap', { token: signToken('o_u1', 'wrong-secret', 1) }), /登录已过期/, 401);
  await fails(call('/bootstrap', { token: signToken('o_u1', CONFIG.tokenSecret, 1, Date.now() - 2 * 3600 * 1000) }), /登录已过期/, 401);
  await fails(call('/admin/setPhase', { token: await login('o_u1'), body: { targetPhase: 'awards' } }), /权限不足/, 403);

  const u1 = await login('o_u1');
  const u2 = await login('o_u2');
  const admin = await login('o_admin');
  const boot = await ok(call('/bootstrap', { token: u1 }));
  assert.strictEqual(boot.user, null);
  assert.strictEqual(boot.isAdmin, false);
  assert.strictEqual(boot.config.adminOpenids, undefined);
  assert.strictEqual(boot.categories.length, 3);
  assert.strictEqual((await ok(call('/bootstrap', { token: admin }))).isAdmin, true);

  console.log('Testing ID binding...');
  await fails(call('/bind', { token: u1, body: { ldap: 'LIMA0001' } }), /仅支持英文字母/);
  assert.deepStrictEqual((await ok(call('/bind', { token: u1, body: { ldap: 'alice' } }))).user, { ldap: 'ALICE' });
  await fails(call('/bind', { token: u2, body: { ldap: 'ALICE' } }), /已被使用/);
  await fails(call('/bind', { token: u1, body: { ldap: 'BOB' } }), /你已绑定/);
  await ok(call('/bind', { token: u2, body: { ldap: 'zed' } }));
  await ok(call('/bind', { token: admin, body: { ldap: 'admin' } }));

  console.log('Testing photo upload...');
  const u3 = await login('o_u3');
  await fails(call('/upload', { token: u3, raw: multipart({ folder: 'entries' }, PNG) }), /请先绑定/);
  await fails(call('/upload', { token: u1, raw: multipart({ folder: 'entries' }, Buffer.from('not an image')) }), /JPG \/ PNG/);
  await fails(call('/upload', { token: u1, raw: multipart({ folder: 'entries' }, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)])) }), /5MB/);
  await fails(call('/upload', { token: u1, raw: multipart({ folder: 'host' }, PNG) }), /权限不足/, 403);
  const photoUrl = (await ok(call('/upload', { token: u1, raw: multipart({ folder: 'entries' }, PNG) }))).url;
  assert.ok(photoUrl.startsWith(`${PHOTO_BASE}entries/`) && photoUrl.endsWith('.png'));
  const hostUrl = (await ok(call('/upload', { token: admin, raw: multipart({ folder: 'host' }, PNG) }))).url;
  assert.ok(hostUrl.startsWith(`${PHOTO_BASE}host/`));

  console.log('Testing nominations...');
  await fails(call('/nominate', { token: u1, body: { petName: '肉包', photoUrl: 'https://evil.example/x.png', categoryIds: ['food'], pledged: true } }), /上传毛孩照片/);
  await fails(call('/nominate', { token: u1, body: { petName: '肉包', photoUrl, categoryIds: ['food'], pledged: false } }), /承诺/);
  const nom = await ok(call('/nominate', { token: u1, body: { petName: '肉包', photoUrl, categoryIds: ['food', 'bogus'], pledged: true } }));
  assert.strictEqual(nom.addedEntries.length, 1);
  const myEntryId = nom.addedEntries[0].id;
  assert.deepStrictEqual((await ok(call('/nominate', { token: u1, body: { petName: '肉包', photoUrl, categoryIds: ['food'], pledged: true } }))).skippedCategories, ['干饭王者']);
  await fails(call('/nominate/photo', { token: u2, body: { entryId: myEntryId, photoUrl } }), /只能修改自己/);
  await ok(call('/nominate/photo', { token: u1, body: { entryId: myEntryId, photoUrl } }));
  for (const [i, ldap] of ['BOB', 'CAT', 'DAN', 'EVE'].entries()) {
    await db.set('Entry', `x${i}`, { categoryId: 'food', petName: `宠物${i}`, ownerLdap: ldap, ownerOpenid: `o_x${i}`, photoUrl, status: 'active', initialVotes: 0, createdAt: i });
  }
  let mine = (await ok(call('/data/myNominations', { token: u1 }))).entries;
  assert.strictEqual(mine.length, 1);
  assert.strictEqual(mine[0].ownerLdap, 'AL***');
  assert.strictEqual(mine[0].ownerOpenid, undefined);
  assert.strictEqual(mine[0].progress.title, '报名成功');

  console.log('Testing admin config updates...');
  await fails(call('/admin/updateConfig', { token: admin, body: { hostAvatar: 'https://evil.example/a.png' } }), /上传主持人头像/);
  await ok(call('/admin/updateConfig', { token: admin, body: { hostAvatar: hostUrl, title: '新标题', adminOpenids: ['o_u1'] } }));
  assert.deepStrictEqual((await get('Activity', 'main_config')).adminOpenids, ['o_admin']); // 白名单不能通过接口修改
  await ok(call('/admin/renameCategory', { token: admin, body: { categoryId: 'food', name: '干饭之王' } }));

  console.log('Testing initial round...');
  await fails(call('/vote', { token: u1, body: { voteType: 'initial', categoryId: 'food', selectedEntryIds: [myEntryId] } }), /初选投票已截止/);
  await ok(call('/admin/setPhase', { token: admin, body: { targetPhase: 'vote_initial' } }));
  await fails(call('/admin/renameCategory', { token: admin, body: { categoryId: 'food', name: '改名' } }), /已锁定/);
  const initial = await ok(call('/data/initialState', { token: u2 }));
  const food = initial.categories.find(c => c.id === 'food');
  assert.strictEqual(food.needsVote, false);
  assert.deepStrictEqual(food.entries.map(e => e.ownerLdap), ['AL***', 'BO*', 'CA*', 'DA*', 'EV*']);
  assert.ok(food.entries.every(e => e.initialVotes === undefined && e.ownerOpenid === undefined));
  await fails(call('/vote', { token: u2, body: { voteType: 'initial', categoryId: 'food', selectedEntryIds: ['nope'] } }), /无效/);
  await ok(call('/vote', { token: u2, body: { voteType: 'initial', categoryId: 'food', selectedEntryIds: [myEntryId, myEntryId] } }));
  assert.strictEqual((await get('Entry', myEntryId)).initialVotes, 1);
  await fails(call('/vote', { token: u2, body: { voteType: 'initial', categoryId: 'food', selectedEntryIds: [myEntryId] } }), /已锁定/);
  assert.strictEqual((await get('Entry', myEntryId)).initialVotes, 1);

  console.log('Testing knockout stage...');
  await ok(call('/admin/setPhase', { token: admin, body: { targetPhase: 'vote_match_8' } }));
  assert.strictEqual((await ok(call('/data/awards', { token: u2, body: { categoryId: 'food' } }))).result, null);
  const pk = (await ok(call('/data/matchState', { token: u2, body: { stage: '8进4' } }))).categories.find(c => c.id === 'food');
  assert.strictEqual(pk.generated, true);
  assert.strictEqual(pk.matches.length, 2); // 5 只：2 场对决 + 1 个轮空（不下发）
  assert.ok(pk.matches.every(m => m.votesA === undefined && m.entryA.ownerOpenid === undefined));
  const match = pk.matches.find(m => m.entryA.id === myEntryId || m.entryB.id === myEntryId);
  const mySide = match.entryA.id === myEntryId ? 'A' : 'B';
  await fails(call('/vote', { token: u2, body: { voteType: 'match', matchId: match.id, chosenSide: 'C' } }), /参数无效/);
  await ok(call('/vote', { token: u2, body: { voteType: 'match', matchId: match.id, chosenSide: mySide } }));
  await fails(call('/vote', { token: u2, body: { voteType: 'match', matchId: match.id, chosenSide: mySide } }), /已投过/);
  const pkAfter = (await ok(call('/data/matchState', { token: u2, body: { stage: '8进4' } }))).categories.find(c => c.id === 'food');
  assert.strictEqual(pkAfter.myVotes[match.id], mySide);
  mine = (await ok(call('/data/myNominations', { token: u1 }))).entries;
  assert.match(mine[0].progress.detail, /我方 1 票/);
  // 重复推进不会清票
  await ok(call('/admin/setPhase', { token: admin, body: { targetPhase: 'vote_match_8' } }));
  assert.strictEqual((await all('Match')).filter(m => m.stage === '8进4').reduce((s, m) => s + (m.votesA || 0) + (m.votesB || 0), 0), 1);

  console.log('Testing derby, awards and congratulations...');
  await ok(call('/admin/setPhase', { token: admin, body: { targetPhase: 'vote_match_4' } }));
  assert.strictEqual((await all('Match')).filter(m => m.stage === '4强德比').length, 3); // 3 强循环赛
  await fails(call('/congrats', { token: u1, body: { content: '恭喜' } }), /颁奖典礼开始后/);
  await ok(call('/admin/setPhase', { token: admin, body: { targetPhase: 'awards' } }));
  const awards = (await ok(call('/data/awards', { token: u2, body: { categoryId: 'food' } }))).result;
  assert.ok(awards.champion && awards.champion.ownerLdap.includes('*'));
  await ok(call('/congrats', { token: u1, body: { content: '恭喜所有毛孩！' } }));
  await fails(call('/congrats', { token: u1, body: { content: '再来一条' } }), /仅限/);
  const wall = await ok(call('/data/congrats', { token: u1 }));
  assert.strictEqual(wall.hasSent, true);
  assert.strictEqual(wall.list[0].ownerLdap, 'AL***');

  console.log('Testing admin overview and moderation...');
  const overview = await ok(call('/admin/getOverview', { token: admin }));
  assert.strictEqual(overview.stats.totalEntries, 5);
  assert.strictEqual(overview.entries.find(e => e.id === myEntryId).ownerLdap, 'ALICE');
  await ok(call('/admin/softDeleteCongrats', { token: admin, body: { msgId: 'o_u1' } }));
  assert.strictEqual((await ok(call('/data/congrats', { token: u1 }))).list.length, 0);
  await ok(call('/admin/unbindUser', { token: admin, body: { ldap: 'zed' } }));
  assert.strictEqual((await ok(call('/bootstrap', { token: u2 }))).user, null);

  console.log('Testing rollback to nomination clears stages and votes...');
  await ok(call('/admin/setPhase', { token: admin, body: { targetPhase: 'nominate' } }));
  assert.strictEqual((await all('Match')).length, 0);
  assert.strictEqual((await all('Vote')).length, 0);
  assert.strictEqual((await all('InitialSelection')).length, 0);
  assert.strictEqual((await get('Entry', myEntryId)).initialVotes, 0);

  console.log('Testing scheduled phase advance...');
  await fails(call('/cron/advance-phase', { headers: { 'x-cron-secret': 'wrong' } }), /forbidden/, 403);
  assert.strictEqual((await ok(call('/cron/advance-phase', { headers: { 'x-cron-secret': CONFIG.cronSecret } }))).advancedTo, null);
  await db.update('Activity', 'main_config', { phaseDeadlines: { nominate: Date.now() - 1000 } });
  assert.strictEqual((await ok(call('/cron/advance-phase', { headers: { 'x-cron-secret': CONFIG.cronSecret } }))).advancedTo, 'vote_initial');
  assert.strictEqual((await get('Activity', 'main_config')).currentPhase, 'vote_initial');
  assert.strictEqual(await advanceIfDue(db, { currentPhase: 'awards', phaseDeadlines: { awards: 1 }, categories: [] }), null);

  console.log('All Google Cloud backend tests passed!');
  process.exit(0); // Firestore 客户端会保持连接，测试结束后主动退出
})().catch(err => {
  console.error(err);
  process.exit(1);
});
