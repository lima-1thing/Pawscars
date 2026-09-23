// cloudfunctions/adminOps/index.js
// 管理员运维：阶段流转与结算、活动配置、门类改名、ID 解绑、违规内容软删除、数据看板
// 注意：bracket.js 是 miniprogram/utils/bracket.js 的副本（云函数需独立部署），
// 修改赛制算法时两处需保持一致（tests/storage.test.js 会校验）。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const {
  resolveInitialRound,
  buildKnockoutStage,
  getKnockoutWinners,
  generateDerbyMatches
} = require('./bracket');

const PHASE_ORDER = ['nominate', 'vote_initial', 'vote_match_8', 'vote_match_4', 'awards'];
const STAGE_KNOCKOUT = '8进4';
const STAGE_DERBY = '4强德比';
const CONFIG_FIELDS = ['title', 'hostName', 'hostAvatar', 'hostIntro', 'rulesSummary', 'callToActionText', 'rulesDetail', 'phaseDeadlines'];
const PAGE_SIZE = 100;

async function getConfig() {
  const res = await db.collection('Activity').doc('main_config').get().catch(() => null);
  return res ? res.data : null;
}

async function fetchAll(collection, where) {
  const countRes = await db.collection(collection).where(where).count();
  const all = [];
  for (let skip = 0; skip < countRes.total; skip += PAGE_SIZE) {
    const res = await db.collection(collection).where(where).skip(skip).limit(PAGE_SIZE).get();
    all.push(...res.data);
  }
  return all;
}

const toEntry = (doc) => ({ ...doc, id: doc._id });

// 对阵文档以确定性 ID（如 food_qf_1）存储，重复生成会覆盖而不是新增
async function saveMatches(matches) {
  for (const { id, ...data } of matches) {
    await db.collection('Match').doc(id).set({ data });
  }
}

/**
 * 结算初选、生成淘汰赛对阵（幂等：Bracket 文档存在即视为已生成）
 */
async function ensureKnockout(categoryId) {
  const existing = await db.collection('Bracket').doc(categoryId).get().catch(() => null);
  if (existing) return;

  const entries = (await fetchAll('Entry', { categoryId, status: _.neq('deleted') })).map(toEntry);
  const selections = await fetchAll('InitialSelection', { categoryId });
  const votesFlat = [];
  selections.forEach(s => s.selectedEntryIds.forEach(eid => votesFlat.push({ entryId: eid, timestamp: s.timestamp })));

  const { top8 } = resolveInitialRound(entries, votesFlat);
  const { matches } = buildKnockoutStage(top8, categoryId);

  await saveMatches(matches);
  await db.collection('Bracket').doc(categoryId).set({
    data: { categoryId, qualifiers: top8, derbyGenerated: false, updatedAt: db.serverDate() }
  });
}

/**
 * 结算淘汰赛、生成德比循环赛对阵（幂等）
 */
async function ensureDerby(categoryId) {
  await ensureKnockout(categoryId);
  const bracket = (await db.collection('Bracket').doc(categoryId).get()).data;
  if (bracket.derbyGenerated) return;

  const knockout = (await fetchAll('Match', { categoryId, stage: STAGE_KNOCKOUT }))
    .map(toEntry)
    .sort((a, b) => a.stageIndex - b.stageIndex);
  const finalists = knockout.length > 0 ? getKnockoutWinners(knockout) : bracket.qualifiers;

  const matches = generateDerbyMatches(finalists, categoryId);
  await saveMatches(matches);
  await db.collection('Bracket').doc(categoryId).update({ data: { finalists, derbyGenerated: true } });
}

/**
 * 回退阶段时清除之后阶段的对阵与投票，保证重新推进时数据一致
 */
async function clearStagesAfter(targetPhase, categoryIds) {
  const targetIdx = PHASE_ORDER.indexOf(targetPhase);
  const stagesToDrop = [];
  if (targetIdx < PHASE_ORDER.indexOf('vote_match_4')) stagesToDrop.push(STAGE_DERBY);
  if (targetIdx < PHASE_ORDER.indexOf('vote_match_8')) stagesToDrop.push(STAGE_KNOCKOUT);
  if (stagesToDrop.length === 0) return;

  for (const categoryId of categoryIds) {
    const matches = await fetchAll('Match', { categoryId, stage: _.in(stagesToDrop) });
    const matchIds = matches.map(m => m._id);
    if (matchIds.length > 0) {
      await db.collection('Vote').where({ matchId: _.in(matchIds) }).remove();
      await db.collection('Match').where({ _id: _.in(matchIds) }).remove();
    }
    if (stagesToDrop.includes(STAGE_KNOCKOUT)) {
      await db.collection('Bracket').doc(categoryId).remove().catch(() => null);
    } else {
      await db.collection('Bracket').doc(categoryId).update({ data: { derbyGenerated: false, finalists: _.remove() } }).catch(() => null);
    }
  }

  if (targetPhase === 'nominate') {
    await db.collection('InitialSelection').where({ categoryId: _.in(categoryIds) }).remove();
    await db.collection('Entry').where({ categoryId: _.in(categoryIds) }).update({ data: { initialVotes: 0, lastVoteTime: 0 } });
  }
}

const actions = {
  async setPhase({ targetPhase }, config) {
    const targetIdx = PHASE_ORDER.indexOf(targetPhase);
    if (targetIdx === -1) return { success: false, message: `未知阶段：${targetPhase}` };

    const categoryIds = (config.categories || []).map(c => c.id);
    await clearStagesAfter(targetPhase, categoryIds);
    for (const categoryId of categoryIds) {
      if (targetIdx >= PHASE_ORDER.indexOf('vote_match_8')) await ensureKnockout(categoryId);
      if (targetIdx >= PHASE_ORDER.indexOf('vote_match_4')) await ensureDerby(categoryId);
    }

    await db.collection('Activity').doc('main_config').update({ data: { currentPhase: targetPhase } });
    return { success: true, message: `阶段已切换至 ${targetPhase}` };
  },

  async updateConfig(payload) {
    const data = {};
    CONFIG_FIELDS.forEach(key => {
      if (payload[key] !== undefined) data[key] = payload[key];
    });
    if (Object.keys(data).length === 0) return { success: false, message: '没有可更新的字段' };
    await db.collection('Activity').doc('main_config').update({ data });
    return { success: true, message: '活动配置已保存' };
  },

  async renameCategory({ categoryId, name }, config) {
    if (config.currentPhase !== 'nominate') {
      return { success: false, message: '投票开始后门类名称已锁定，不可修改' };
    }
    const clean = (name || '').trim();
    if (!clean || clean.length > 10) return { success: false, message: '门类名称需在 1-10 字之间' };
    const categories = (config.categories || []).map(c => (c.id === categoryId ? { ...c, name: clean } : c));
    await db.collection('Activity').doc('main_config').update({ data: { categories } });
    return { success: true, message: '门类名已保存' };
  },

  async unbindUser({ ldap }) {
    const clean = (ldap || '').trim().toUpperCase();
    if (!clean) return { success: false, message: '请输入要解绑的活动ID' };
    const res = await db.collection('UserBinding').where({ ldap: clean }).remove();
    if (res.stats.removed === 0) return { success: false, message: `未找到活动ID ${clean} 的绑定记录` };
    return { success: true, message: `已成功解绑活动ID ${clean}` };
  },

  async softDeleteEntry({ entryId }) {
    await db.collection('Entry').doc(entryId).update({ data: { status: 'deleted' } });
    return { success: true, message: '条目已软删除' };
  },

  async softDeleteCongrats({ msgId }) {
    await db.collection('CongratsMessage').doc(msgId).update({ data: { status: 'deleted' } });
    return { success: true, message: '留言已隐藏' };
  },

  async getDashboard(payload, config) {
    const perCategory = [];
    for (const cat of config.categories || []) {
      const entryCount = (await db.collection('Entry').where({ categoryId: cat.id, status: _.neq('deleted') }).count()).total;
      const initialVoterCount = (await db.collection('InitialSelection').where({ categoryId: cat.id }).count()).total;
      perCategory.push({ id: cat.id, name: cat.name, entryCount, initialVoterCount });
    }
    const totalMatchVotes = (await db.collection('Vote').count()).total;
    const totalCongrats = (await db.collection('CongratsMessage').where({ status: _.neq('deleted') }).count()).total;
    return { success: true, data: { perCategory, totalMatchVotes, totalCongrats } };
  }
};

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const config = await getConfig();

  // 白名单管理员校验：只认服务端获取的 OPENID，绝不信任客户端传来的任何身份字段；
  // 配置缺失时一律拒绝（fail closed）
  const admins = (config && config.adminOpenids) || [];
  if (!OPENID || !admins.includes(OPENID)) {
    return { success: false, message: '权限不足：仅限活动管理员操作' };
  }

  const handler = actions[event.action];
  if (!handler) return { success: false, message: '未知管理员操作' };
  return handler(event.payload || {}, config);
};
