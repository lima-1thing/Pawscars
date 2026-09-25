/**
 * 活动配置（Firestore: Activity/main_config）
 */
const { isPhaseOpen } = require('./bracket');

const COL = {
  ACTIVITY: 'Activity',
  USER: 'UserBinding',
  ENTRY: 'Entry',
  INITIAL: 'InitialSelection',
  MATCH: 'Match',
  VOTE: 'Vote',
  BRACKET: 'Bracket',
  CONGRATS: 'CongratsMessage'
};

const CONFIG_ID = 'main_config';
const STAGE_KNOCKOUT = '8进4';
const STAGE_DERBY = '4强德比';
const MAX_INITIAL_PICKS = 8;

const DEFAULT_CATEGORIES = [
  { id: 'food', name: '干饭王者' },
  { id: 'abstract', name: '抽象王者' },
  { id: 'beauty', name: '颜值王者' }
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
  STAGE_KNOCKOUT,
  STAGE_DERBY,
  MAX_INITIAL_PICKS,
  EDITABLE_CONFIG_FIELDS,
  loadConfig,
  publicConfig,
  isAdmin,
  isPhaseOpen
};
