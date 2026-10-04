/**
 * 活动配置（Firestore: Activity/main_config）
 */
const { isPhaseOpen } = require('./bracket');

const COL = {
  ACTIVITY: 'Activity',
  USER: 'UserBinding',
  ENTRY: 'Entry',
  INITIAL: 'InitialSelection',
  BRACKET: 'Bracket',               // 每门类的决赛名单
  FINAL_PAIRS: 'FinalAssignment',   // 每位投票人每门类的决赛对局（openid_categoryId）
  FINAL_VOTE: 'FinalVote',          // 决赛投票（openid_categoryId_index）
  CONGRATS: 'CongratsMessage',
  GOOGLE: 'GoogleLink'              // google_<sub> → 对应的活动身份（openid），跨设备识别同一个人
};

const CONFIG_ID = 'main_config';
const MAX_INITIAL_PICKS = 8;

const DEFAULT_CATEGORIES = [
  { id: 'food', name: '干饭王者' },
  { id: 'abstract', name: '脸蛋天才' },
  { id: 'beauty', name: '万圣顶流' }
];

// 下发给小程序的配置字段（不含管理员白名单）
const PUBLIC_CONFIG_FIELDS = [
  'title', 'hostName', 'hostAvatar', 'hostIntro', 'rulesSummary', 'callToActionText',
  'rulesDetail', 'currentPhase', 'phaseDeadlines'
];

// 管理员可在后台修改的字段
const EDITABLE_CONFIG_FIELDS = [
  'title', 'hostName', 'hostAvatar', 'hostIntro', 'rulesSummary', 'callToActionText',
  'rulesDetail', 'phaseDeadlines'
];

async function loadConfig(db) {
  const config = (await db.get(COL.ACTIVITY, CONFIG_ID)) || { currentPhase: 'nominate' };
  if (!Array.isArray(config.categories) || config.categories.length === 0) {
    config.categories = DEFAULT_CATEGORIES;
  }
  if (!config.currentPhase) config.currentPhase = 'nominate';
  return config;
}

function publicConfig(config) {
  const out = {};
  PUBLIC_CONFIG_FIELDS.forEach(k => { if (config[k] !== undefined) out[k] = config[k]; });
  return out;
}

// 管理员判定：只认服务端校验过的 openid；配置缺失时无人是管理员
const isAdmin = (config, openid) => !!openid && (config.adminOpenids || []).includes(openid);

module.exports = {
  COL,
  CONFIG_ID,
  MAX_INITIAL_PICKS,
  EDITABLE_CONFIG_FIELDS,
  loadConfig,
  publicConfig,
  isAdmin,
  isPhaseOpen
};
