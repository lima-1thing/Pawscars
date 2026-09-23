// cloudfunctions/getData/index.js
// 只读数据接口：对外展示的数据在服务端完成打码，公共视图不返回实时票数与 openid。
// bracket.js 是 miniprogram/utils/bracket.js 的副本（npm test 会校验一致）。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const {
  isPhaseOpen,
  computeEntryProgress,
  getKnockoutWinners,
  resolveFinalRankings
} = require('./bracket');

const PAGE_SIZE = 100;
const STAGE_KNOCKOUT = '8进4';
const STAGE_DERBY = '4强德比';
const MAX_INITIAL_PICKS = 8;
const DEFAULT_CATEGORIES = [
  { id: 'food', name: '干饭王者' },
  { id: 'abstract', name: '抽象王者' },
  { id: 'beauty', name: '颜值王者' }
];
// 返回给前端的配置字段（不含管理员白名单）
const PUBLIC_CONFIG_FIELDS = [
  'title', 'hostName', 'hostAvatar', 'hostIntro', 'rulesSummary', 'callToActionText',
  'rulesDetail', 'currentPhase', 'phaseDeadlines'
];

function maskLdap(ldap) {
  if (!ldap || typeof ldap !== 'string') return '***';
  const clean = ldap.trim().toUpperCase();
  return clean.length <= 2 ? `${clean.slice(0, 1)}*` : clean.slice(0, 2) + '*'.repeat(clean.length - 2);
}

// 对外展示的报名条目：打码主人ID，去掉 openid 与票数
const publicEntry = (e) => e && ({
  id: e._id || e.id,
  categoryId: e.categoryId,
  petName: e.petName,
  photoUrl: e.photoUrl,
  ownerLdap: maskLdap(e.ownerLdap)
});

const publicMatch = (m) => ({
  id: m._id,
  categoryId: m.categoryId,
  stage: m.stage,
  stageIndex: m.stageIndex,
  totalMatches: m.totalMatches,
  entryA: publicEntry(m.entryA),
  entryB: publicEntry(m.entryB)
});

const byOwnerLdap = (a, b) => (a.ownerLdap || '').toUpperCase().localeCompare((b.ownerLdap || '').toUpperCase());

async function fetchAll(collection, where) {
  const countRes = await db.collection(collection).where(where).count();
  const all = [];
  for (let skip = 0; skip < countRes.total; skip += PAGE_SIZE) {
    const res = await db.collection(collection).where(where).skip(skip).limit(PAGE_SIZE).get();
    all.push(...res.data);
  }
  return all;
}

async function getDoc(collection, id) {
  const res = await db.collection(collection).doc(id).get().catch(() => null);
  return res ? res.data : null;
}

async function loadConfig() {
  const config = (await getDoc('Activity', 'main_config')) || { currentPhase: 'nominate' };
  if (!Array.isArray(config.categories) || config.categories.length === 0) {
    config.categories = DEFAULT_CATEGORIES;
  }
  return config;
}

async function loadStageMatches(categoryId, stage) {
  return (await fetchAll('Match', { categoryId, stage }))
    .map(m => ({ ...m, id: m._id }))
    .sort((a, b) => a.stageIndex - b.stageIndex);
}

const actions = {
  async bootstrap(ctx) {
    const { config, openid } = ctx;
    const binding = await db.collection('UserBinding').where({ openid }).get();
    const publicConfig = {};
    PUBLIC_CONFIG_FIELDS.forEach(k => { if (config[k] !== undefined) publicConfig[k] = config[k]; });
    return {
      config: publicConfig,
      categories: config.categories,
      user: binding.data[0] ? { ldap: binding.data[0].ldap } : null,
      isAdmin: (config.adminOpenids || []).includes(openid)
    };
  },

  // 初选页：各门类候选（按主人ID A→Z 固定排序）+ 本人已提交的选择
  async initialState(ctx) {
    const { config, openid } = ctx;
    const categories = [];
    for (const cat of config.categories) {
      const entries = (await fetchAll('Entry', { categoryId: cat.id, status: _.neq('deleted') })).sort(byOwnerLdap);
      const mine = await getDoc('InitialSelection', `${openid}_${cat.id}`);
      categories.push({
        id: cat.id,
        needsVote: entries.length > MAX_INITIAL_PICKS,
        entries: entries.map(publicEntry),
        mySelection: mine ? mine.selectedEntryIds : null
      });
    }
    return { categories, phaseOpen: isPhaseOpen(config, 'vote_initial') };
  },

  // PK 页：各门类可投对阵（不含票数）+ 本人已投记录
  async matchState(ctx, { stage }) {
    const { config, openid } = ctx;
    if (stage !== STAGE_KNOCKOUT && stage !== STAGE_DERBY) throw new Error('未知阶段');
    const categories = [];
    for (const cat of config.categories) {
      const generated = !!(await getDoc('Bracket', cat.id));
      const matches = (await loadStageMatches(cat.id, stage)).filter(m => m.entryA && m.entryB);
      const myVotes = {};
      if (matches.length > 0) {
        const votes = await fetchAll('Vote', { openid, matchId: _.in(matches.map(m => m._id)) });
        votes.forEach(v => { myVotes[v.matchId] = v.chosenSide; });
      }
      categories.push({ id: cat.id, generated, matches: matches.map(publicMatch), myVotes });
    }
    const phase = stage === STAGE_DERBY ? 'vote_match_4' : 'vote_match_8';
    return { categories, phaseOpen: isPhaseOpen(config, phase) };
  },

  // 我的提名：仅返回本人条目，附带私密票数与晋级进度
  async myNominations(ctx) {
    const { config, openid } = ctx;
    const mine = await fetchAll('Entry', { ownerOpenid: openid, status: _.neq('deleted') });
    const cache = {};
    const loadCategory = async (categoryId) => {
      if (!cache[categoryId]) {
        const bracket = await getDoc('Bracket', categoryId);
        cache[categoryId] = {
          needsInitialRound: (await db.collection('Entry').where({ categoryId, status: _.neq('deleted') }).count()).total > MAX_INITIAL_PICKS,
          qualifiers: bracket ? bracket.qualifiers : null,
          knockoutMatches: bracket ? await loadStageMatches(categoryId, STAGE_KNOCKOUT) : [],
          derbyMatches: bracket ? await loadStageMatches(categoryId, STAGE_DERBY) : []
        };
      }
      return cache[categoryId];
    };

    const entries = [];
    for (const e of mine) {
      const data = await loadCategory(e.categoryId);
      entries.push({
        ...publicEntry(e),
        createdAt: e.createdAt,
        progress: computeEntryProgress({ entry: { ...e, id: e._id }, phase: config.currentPhase, ...data })
      });
    }
    return { entries };
  },

  // 颁奖结果：颁奖阶段公开；之前仅管理员可预览
  async awards(ctx, { categoryId }) {
    const { config, openid } = ctx;
    const isAdmin = (config.adminOpenids || []).includes(openid);
    if (config.currentPhase !== 'awards' && !isAdmin) return { result: null };

    const bracket = await getDoc('Bracket', categoryId);
    if (!bracket || !bracket.derbyGenerated) return { result: null };
    const knockout = await loadStageMatches(categoryId, STAGE_KNOCKOUT);
    const derby = await loadStageMatches(categoryId, STAGE_DERBY);
    const finalists = knockout.length > 0 ? getKnockoutWinners(knockout) : (bracket.qualifiers || []);
    const ranking = resolveFinalRankings(finalists, derby);

    const withScore = (e) => e && { ...publicEntry(e), rank: e.rank, wins: e.wins, totalVotes: e.totalVotes };
    return {
      result: {
        isEmpty: ranking.isEmpty,
        champion: withScore(ranking.champion),
        runnerUp: withScore(ranking.runnerUp),
        thirdPlace: withScore(ranking.thirdPlace)
      }
    };
  },

  async congrats(ctx) {
    const list = (await fetchAll('CongratsMessage', { status: _.neq('deleted') }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const hasSent = !!(await getDoc('CongratsMessage', ctx.openid));
    return {
      list: list.map(c => ({
        id: c._id,
        content: c.content,
        ownerLdap: maskLdap(c.ownerLdap),
        createdAt: new Date(c.createdAt).getTime()
      })),
      hasSent
    };
  }
};

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const handler = actions[event.action];
  if (!handler) return { success: false, message: '未知查询' };
  try {
    const config = await loadConfig();
    const data = await handler({ config, openid: OPENID }, event.payload || {});
    return { success: true, data };
  } catch (e) {
    return { success: false, message: e.message || '查询失败' };
  }
};
