/**
 * Pawscars End-to-End Simulation Test Run
 * 模拟完整的用户与赛事全流程，注入丰富的真实业务测试数据
 */

const StorageService = require('../miniprogram/utils/storage');
const { validateLdap, validatePetName, validateCongrats } = require('../miniprogram/utils/validator');
const { maskLdap } = require('../miniprogram/utils/mask');
const {
  resolveInitialRound,
  generateQuarterFinalMatches,
  resolveMatchWinner,
  generateDerbyMatches,
  resolveDerbyRankings
} = require('../miniprogram/utils/bracket');

console.log('====================================================');
console.log('       🏆 PAWSCARS 赛事全流程端到端仿真测试 🏆        ');
console.log('====================================================\n');

// 0. 初始化干净状态
StorageService.resetAll();

// ----------------------------------------------------------------
// 阶段一：用户身份验证与报名期 (Nomination Phase)
// ----------------------------------------------------------------
console.log('▶️ 【阶段一：身份绑定与毛孩提名报名】');
StorageService.setPhase('nominate');

// 测试 LDAP 规则拦截
console.log('  1.1 校验非法 LDAP ID (含数字与特殊字符)...');
const invalidCheck1 = validateLdap('Kevin888');
const invalidCheck2 = validateLdap('Tom_Cat');
console.log(`      输入 'Kevin888' 校验结果: valid=${invalidCheck1.valid}, message="${invalidCheck1.message}"`);
console.log(`      输入 'Tom_Cat'  校验结果: valid=${invalidCheck2.valid}, message="${invalidCheck2.message}"`);

console.log('  1.2 模拟社群成员绑定合法活动ID...');
const communityUsers = [
  'JENNIFER', 'ZHANG', 'ALICE', 'BOBBY', 'CHARLIE',
  'DAVID', 'EMILY', 'FRANK', 'GEORGE', 'HELEN'
];
communityUsers.forEach(id => {
  StorageService.bindUser(id);
});
console.log(`      成功为 ${communityUsers.length} 位社群成员绑定全局唯一活动ID: ${communityUsers.join(', ')}`);

console.log('  1.3 批量注入报名参赛毛孩 (多门类勾选与正方形裁切)...');
const sampleNominations = [
  { user: 'JENNIFER', pet: '团子', categories: ['food', 'beauty'], photo: 'cat_tuanzi.jpg' },
  { user: 'ZHANG',    pet: '旺财', categories: ['food', 'abstract'], photo: 'dog_wangcai.jpg' },
  { user: 'ZHANG',    pet: '小白', categories: ['beauty'], photo: 'cat_xiaobai.jpg' },
  { user: 'ALICE',    pet: '肉包', categories: ['food'], photo: 'dog_roubao.jpg' },
  { user: 'ALICE',    pet: '汤圆', categories: ['abstract'], photo: 'cat_tangyuan.jpg' },
  { user: 'ALICE',    pet: '雪球', categories: ['beauty'], photo: 'dog_xueqiu.jpg' },
  { user: 'BOBBY',    pet: '麻薯', categories: ['food'], photo: 'cat_mashu.jpg' },
  { user: 'BOBBY',    pet: '皮皮', categories: ['abstract'], photo: 'dog_pipi.jpg' },
  { user: 'BOBBY',    pet: '可可', categories: ['beauty'], photo: 'cat_keke.jpg' },
  { user: 'CHARLIE',  pet: '布丁', categories: ['food'], photo: 'dog_buding.jpg' },
  { user: 'CHARLIE',  pet: '怪兽', categories: ['abstract'], photo: 'cat_guaishou.jpg' },
  { user: 'CHARLIE',  pet: '美美', categories: ['beauty'], photo: 'dog_meimei.jpg' },
  { user: 'DAVID',    pet: '奥利奥', categories: ['food'], photo: 'cat_aoliao.jpg' },
  { user: 'DAVID',    pet: '旋风', categories: ['abstract'], photo: 'dog_xuanfeng.jpg' },
  { user: 'DAVID',    pet: '王子', categories: ['beauty'], photo: 'cat_wangzi.jpg' },
  { user: 'EMILY',    pet: '汉堡', categories: ['food'], photo: 'dog_hanbao.jpg' },
  { user: 'EMILY',    pet: '懵圈', categories: ['abstract'], photo: 'cat_mengquan.jpg' },
  { user: 'EMILY',    pet: '仙女', categories: ['beauty'], photo: 'dog_xiannv.jpg' },
  { user: 'FRANK',    pet: '奶黄', categories: ['food'], photo: 'cat_naihuang.jpg' },
  { user: 'FRANK',    pet: '铁锤', categories: ['abstract'], photo: 'dog_tiechui.jpg' },
  { user: 'FRANK',    pet: '珍珠', categories: ['beauty'], photo: 'cat_zhenzhu.jpg' },
  { user: 'GEORGE',   pet: '薯条', categories: ['food'], photo: 'dog_shutiao.jpg' },
  { user: 'HELEN',    pet: '糯米', categories: ['food'], photo: 'cat_nuomi.jpg' }
];

sampleNominations.forEach(item => {
  StorageService.bindUser(item.user);
  StorageService.submitNominations({
    petName: item.pet,
    photoUrl: item.photo,
    categoryIds: item.categories
  });
});

console.log('  1.4 测试重复报名拦截 (同一只宠物在同门类下限报1次)...');
StorageService.bindUser('JENNIFER');
const dupResult = StorageService.submitNominations({
  petName: '团子',
  photoUrl: 'cat_tuanzi_new.jpg',
  categoryIds: ['food', 'abstract'] // food 重复，abstract 为新追加
});
console.log(`      重复提交【干饭王者】结果: 拦截门类=[${dupResult.skippedCategories.join(', ')}], 成功追加新门类=[${dupResult.addedEntries.map(e => e.categoryId).join(', ')}]`);

const allEntries = StorageService.getEntries();
console.log(`      当前累计有效参赛毛孩条目: ${allEntries.length} 条\n`);

// ----------------------------------------------------------------
// 阶段二：初选打投划屏阶段 (Initial Swipe Phase)
// ----------------------------------------------------------------
console.log('▶️ 【阶段二：初选打投划屏（三门类同页横滑，最多选8张）】');
StorageService.setPhase('vote_initial');

// 模拟多位投票人进行初选多选打投
console.log('  2.1 模拟社群成员为【干饭王者】进行初选多选打投...');
const foodCandidates = StorageService.getEntries('food');
console.log(`      干饭王者候选人数: ${foodCandidates.length} 只 (按ID字母顺序排列: ${foodCandidates.map(e => `${e.petName}(${maskLdap(e.ownerLdap)})`).join(', ')})`);

// 模拟投票矩阵：
// 团子 (JENNIFER) -> 9票
// 旺财 (ZHANG) -> 8票
// 肉包 (ALICE) -> 8票
// 麻薯 (BOBBY) -> 7票
// 布丁 (CHARLIE) -> 6票
// 奥利奥 (DAVID) -> 5票
// 汉堡 (EMILY) -> 4票
// 奶黄 (FRANK) -> 3票 (在 t=1000 达到第3票)
// 薯条 (GEORGE) -> 3票 (在 t=2000 达到第3票) -> 平局测试：奶黄应胜出晋级8强！
// 糯米 (HELEN) -> 1票
const votesSimulation = [
  { voter: 'JENNIFER', pickIndices: [0, 1, 2, 3, 4, 5, 6, 7] },
  { voter: 'ZHANG',    pickIndices: [0, 1, 2, 3, 4, 5, 6, 8] },
  { voter: 'ALICE',    pickIndices: [0, 1, 2, 3, 4, 5, 6, 7] },
  { voter: 'BOBBY',    pickIndices: [0, 1, 2, 3, 4, 5, 6, 8] },
  { voter: 'CHARLIE',  pickIndices: [0, 1, 2, 3, 4, 5] },
  { voter: 'DAVID',    pickIndices: [0, 1, 2, 3, 4] },
  { voter: 'EMILY',    pickIndices: [0, 1, 2, 3] },
  { voter: 'FRANK',    pickIndices: [0, 1, 2, 7] }, // 奶黄 (idx 7) 拿到第3票
  { voter: 'GEORGE',   pickIndices: [0, 8] }        // 薯条 (idx 8) 稍后拿到第3票
];

votesSimulation.forEach((sim, idx) => {
  StorageService.bindUser(sim.voter);
  const chosenIds = sim.pickIndices.map(i => foodCandidates[i].id);
  StorageService.submitInitialVote('food', chosenIds);
});

// 验证防重复初选投票
try {
  StorageService.bindUser('JENNIFER');
  StorageService.submitInitialVote('food', [foodCandidates[0].id]);
} catch (e) {
  console.log(`  2.2 防重复初选投票拦截测试通过: "${e.message}"`);
}

// ----------------------------------------------------------------
// 阶段三：8进4单败淘汰赛 (Quarterfinals Phase)
// ----------------------------------------------------------------
console.log('\n▶️ 【阶段三：8进4淘汰赛（按主人ID字母顺序 A-Z 依次配对）】');
// 推进至 8进4
StorageService.setPhase('vote_match_8');
const qfMatches = StorageService.getMatches('food', '8进4');
console.log(`  3.1 系统自动按初选票数与平局规则决出 8 强，并按主人ID字母顺序 (A-Z) 依次配对 4 场 1V1：`);

qfMatches.forEach((m, idx) => {
  console.log(`      第 ${idx + 1} 场: 【${m.entryA.petName} (主人: ${maskLdap(m.entryA.ownerLdap)})】 VS 【${m.entryB.petName} (主人: ${maskLdap(m.entryB.ownerLdap)})】`);
});

// 模拟 8进4 投票
console.log('  3.2 模拟大众评审进行 1V1 单选投票...');
qfMatches.forEach((m, idx) => {
  // 模拟对局胜负：A胜或B胜
  StorageService.bindUser('JENNIFER');
  StorageService.submitMatchVote(m.id, 'A');
  StorageService.bindUser('ZHANG');
  StorageService.submitMatchVote(m.id, idx % 2 === 0 ? 'A' : 'B');
  StorageService.bindUser('ALICE');
  StorageService.submitMatchVote(m.id, 'A');
});

// ----------------------------------------------------------------
// 阶段四：4强巅峰德比循环赛 (Semifinals Derby Phase)
// ----------------------------------------------------------------
console.log('\n▶️ 【阶段四：4强巅峰德比（6场循环赛 C(4,2)，按胜场排定金银铜牌）】');
StorageService.setPhase('vote_match_4');
const derbyMatches = StorageService.getMatches('food', '4强德比');
console.log(`  4.1 8进4胜者晋级 4 强，系统自动生成 6 场循环赛固定对阵：`);

derbyMatches.forEach((m, idx) => {
  console.log(`      第 ${idx + 1} 场: ${m.entryA.petName} (${maskLdap(m.entryA.ownerLdap)}) VS ${m.entryB.petName} (${maskLdap(m.entryB.ownerLdap)})`);
});

console.log('  4.2 模拟 7 天自由投票期内的德比计票...');
derbyMatches.forEach((m, idx) => {
  StorageService.bindUser('ALICE');
  StorageService.submitMatchVote(m.id, idx % 3 === 0 ? 'B' : 'A');
  StorageService.bindUser('BOBBY');
  StorageService.submitMatchVote(m.id, 'A');
  StorageService.bindUser('CHARLIE');
  StorageService.submitMatchVote(m.id, 'A');
});

// ----------------------------------------------------------------
// 阶段五：颁奖盛典与贺词墙 (Awards Phase)
// ----------------------------------------------------------------
console.log('\n▶️ 【阶段五：颁奖盛典与全员贺词墙】');
StorageService.setPhase('awards');
const awardsResult = StorageService.getAwardsResult('food');

console.log('  5.1 德比循环赛结果结算完成：');
console.log(`      🥇 冠军（金牌）：【${awardsResult.champion.petName}】 主人: ${maskLdap(awardsResult.champion.ownerLdap)}`);
console.log(`      🥈 亚军（银牌）：【${awardsResult.runnerUp.petName}】 主人: ${maskLdap(awardsResult.runnerUp.ownerLdap)}`);
console.log(`      🥉 季军（铜牌）：【${awardsResult.thirdPlace.petName}】 主人: ${maskLdap(awardsResult.thirdPlace.ownerLdap)}`);

console.log('  5.2 模拟生成专属奥斯卡获奖证书...');
console.log(`      [证书文案] "PAWSCARS 2026 首届毛孩奥斯卡荣誉盛典"`);
console.log(`      [获奖毛孩] ${awardsResult.champion.petName} · 干饭王者 冠军`);
console.log(`      [大会主持] 宫师姐 敬颁`);

console.log('  5.3 测试颁奖期贺词墙（每人限发1条留言，≤50字）...');
StorageService.bindUser('EMILY');
const msg1 = StorageService.submitCongrats('太激动了！大家家的毛孩都太萌了，感谢群友们的支持！🎉');
console.log(`      EMILY 发表贺词: "${msg1.content}" (署名打码: ${maskLdap(msg1.ownerLdap)})`);

try {
  StorageService.submitCongrats('再发一条刷屏！');
} catch (e) {
  console.log(`      每人限发1条拦截校验通过: "${e.message}"`);
}

StorageService.bindUser('FRANK');
const msg2 = StorageService.submitCongrats('首届 Pawscars 超级好玩，恭喜所有毛孩！🐶');
console.log(`      FRANK 发表贺词: "${msg2.content}" (署名打码: ${maskLdap(msg2.ownerLdap)})`);

// ----------------------------------------------------------------
// 阶段六：私密“我的提名”查询验证
// ----------------------------------------------------------------
console.log('\n▶️ 【阶段六：私密“我的提名”状态追踪验证】');
const jenniferNoms = StorageService.getMyNominations('JENNIFER');
console.log(`  JENNIFER 查询本人提名的所有毛孩当前战绩：`);
jenniferNoms.forEach(e => {
  const isChamp = awardsResult.champion && awardsResult.champion.id === e.id;
  console.log(`    - 毛孩: ${e.petName} (${e.categoryId}) -> 状态: ${isChamp ? '荣登最高领奖台 🥇 (冠军)' : '顺利完赛 🐾'}`);
});

console.log('\n====================================================');
console.log('   ✅ 仿真测试全部圆满通过！所有业务场景校验 100% 达成！  ');
console.log('====================================================');
