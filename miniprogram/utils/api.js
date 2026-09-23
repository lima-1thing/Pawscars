/**
 * Pawscars 数据接口层（页面只通过这里读写数据）
 * - cloud 模式：调用 cloudfunctions/ 下的云函数，照片上传到云存储
 * - mock 模式：包装本地 StorageService，便于单机演示与开发调试
 * 所有方法均返回 Promise；失败时抛出带中文提示的 Error。
 */
const StorageService = require('./storage');
const { DEFAULT_CATEGORIES } = require('./mock-data');
const { isPhaseOpen } = require('./bracket');
const { USE_CLOUD, CLOUD_ENV } = require('../env');

const STAGE_KNOCKOUT = '8进4';
const STAGE_DERBY = '4强德比';

let mode = 'mock';
let state = { config: null, categories: [], user: null, isAdmin: false };

function isDevBuild() {
  try {
    const { envVersion } = wx.getAccountInfoSync().miniProgram;
    return envVersion === 'develop' || envVersion === 'trial';
  } catch (e) {
    return false;
  }
}

// 服务端只存门类 id/名称，配色与图标沿用本地默认样式
function withCategoryStyles(serverCategories) {
  return (serverCategories || DEFAULT_CATEGORIES).map(cat => {
    const style = DEFAULT_CATEGORIES.find(d => d.id === cat.id) || DEFAULT_CATEGORIES[0];
    return { ...style, ...cat };
  });
}

async function callFunction(name, data) {
  let res;
  try {
    res = await wx.cloud.callFunction({ name, data });
  } catch (e) {
    throw new Error('网络开小差了，请稍后重试');
  }
  const result = res.result || {};
  if (result.success === false) throw new Error(result.message || '操作失败');
  return result;
}

async function query(action, payload) {
  return (await callFunction('getData', { action, payload })).data;
}

async function uploadPhoto(filePath, folder) {
  const ext = (filePath.match(/\.(\w+)$/) || [])[1] || 'jpg';
  const cloudPath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try {
    const res = await wx.cloud.uploadFile({ cloudPath, filePath });
    return res.fileID;
  } catch (e) {
    throw new Error('照片上传失败，请检查网络后重试');
  }
}

function loadMockState() {
  state = {
    config: StorageService.getConfig(),
    categories: StorageService.getCategories(),
    user: StorageService.getUserBinding(),
    isAdmin: StorageService.isAdmin()
  };
}

async function loadCloudState() {
  const data = await query('bootstrap');
  state = {
    config: data.config,
    categories: withCategoryStyles(data.categories),
    user: data.user,
    isAdmin: data.isAdmin
  };
}

// 本地模式同步方法包成 Promise，与云模式保持一致的调用方式
const mockCall = (fn) => new Promise((resolve, reject) => {
  try {
    resolve(fn());
  } catch (e) {
    reject(e);
  }
});

const api = {
  STAGE_KNOCKOUT,
  STAGE_DERBY,

  async init() {
    if (USE_CLOUD && typeof wx !== 'undefined' && wx.cloud) {
      try {
        wx.cloud.init({ env: CLOUD_ENV || undefined, traceUser: true });
        await loadCloudState();
        mode = 'cloud';
        return state;
      } catch (e) {
        if (!isDevBuild()) throw e;
        console.warn('云开发不可用，开发版退回本地 Mock 存储：', e.message);
      }
    }
    mode = 'mock';
    loadMockState();
    return state;
  },

  getMode() {
    return mode;
  },

  isDevBuild,

  getState() {
    return state;
  },

  async refresh() {
    if (mode === 'cloud') await loadCloudState();
    else loadMockState();
    return state;
  },

  isPhaseOpen(phase) {
    return isPhaseOpen(state.config, phase);
  },

  // ---------------- 身份 ----------------
  async bindUser(ldap) {
    if (mode === 'cloud') {
      const res = await callFunction('bindUser', { ldap });
      state.user = { ldap: res.user.ldap };
      return state.user;
    }
    return mockCall(() => {
      state.user = StorageService.bindUser(ldap);
      state.isAdmin = StorageService.isAdmin();
      return state.user;
    });
  },

  // ---------------- 报名 ----------------
  async submitNominations({ petName, photoPath, categoryIds }) {
    if (mode === 'cloud') {
      const photoUrl = await uploadPhoto(photoPath, 'entries');
      const res = await callFunction('submitNomination', { petName, photoUrl, categoryIds, pledged: true });
      return { addedEntries: res.addedEntries, skippedCategories: res.skippedCategories };
    }
    return mockCall(() => StorageService.submitNominations({ petName, photoUrl: photoPath, categoryIds }));
  },

  async updateEntryPhoto(entryId, photoPath) {
    if (mode === 'cloud') {
      const photoUrl = await uploadPhoto(photoPath, 'entries');
      await callFunction('submitNomination', { action: 'updatePhoto', entryId, photoUrl });
      return;
    }
    return mockCall(() => StorageService.updateEntryPhoto(entryId, photoPath));
  },

  /**
   * 本人全部报名，含私密进度 progress: { title, detail, tone }
   */
  async getMyNominations() {
    if (mode === 'cloud') return (await query('myNominations')).entries;
    return mockCall(() => StorageService.getMyNominations().map(e => ({
      ...e,
      progress: StorageService.getEntryProgress(e)
    })));
  },

  // ---------------- 初选 ----------------
  /**
   * @returns {{ phaseOpen, categories: [{ id, needsVote, entries, mySelection }] }}
   */
  async getInitialState() {
    if (mode === 'cloud') return query('initialState');
    return mockCall(() => ({
      phaseOpen: StorageService.isPhaseOpen('vote_initial'),
      categories: state.categories.map(cat => {
        const mine = StorageService.getInitialVotesForUser(cat.id);
        return {
          id: cat.id,
          needsVote: StorageService.needsInitialRound(cat.id),
          entries: [...StorageService.getEntries(cat.id)]
            .sort((a, b) => (a.ownerLdap || '').toUpperCase().localeCompare((b.ownerLdap || '').toUpperCase())),
          mySelection: mine ? mine.selectedEntryIds : null
        };
      })
    }));
  },

  async submitInitialVote(categoryId, selectedEntryIds) {
    if (mode === 'cloud') {
      await callFunction('submitVote', { voteType: 'initial', categoryId, selectedEntryIds });
      return;
    }
    return mockCall(() => StorageService.submitInitialVote(categoryId, selectedEntryIds));
  },

  // ---------------- PK 对局 ----------------
  /**
   * @returns {{ phaseOpen, categories: [{ id, generated, matches, myVotes }] }}
   */
  async getMatchState(stage) {
    if (mode === 'cloud') return query('matchState', { stage });
    const phase = stage === STAGE_DERBY ? 'vote_match_4' : 'vote_match_8';
    return mockCall(() => ({
      phaseOpen: StorageService.isPhaseOpen(phase),
      categories: state.categories.map(cat => {
        const matches = StorageService.getVotableMatches(cat.id, stage);
        const myVotes = {};
        matches.forEach(m => {
          const v = StorageService.getUserMatchVote(m.id);
          if (v) myVotes[m.id] = v.chosenSide;
        });
        return { id: cat.id, generated: StorageService.getQualifiers(cat.id) !== null, matches, myVotes };
      })
    }));
  },

  async submitMatchVote(matchId, chosenSide) {
    if (mode === 'cloud') {
      await callFunction('submitVote', { voteType: 'match', matchId, chosenSide });
      return;
    }
    return mockCall(() => StorageService.submitMatchVote(matchId, chosenSide));
  },

  // ---------------- 颁奖 & 贺词 ----------------
  /**
   * 颁奖结果；尚未结算（或无权预览）返回 null
   */
  async getAwards(categoryId) {
    if (mode === 'cloud') return (await query('awards', { categoryId })).result;
    return mockCall(() => StorageService.getAwardsResult(categoryId));
  },

  /**
   * @returns {{ list, hasSent }}
   */
  async getCongrats() {
    if (mode === 'cloud') return query('congrats');
    return mockCall(() => {
      const list = StorageService.getCongrats();
      return { list, hasSent: !!state.user && list.some(c => c.ownerLdap === state.user.ldap) };
    });
  },

  async submitCongrats(content) {
    if (mode === 'cloud') {
      await callFunction('submitCongrats', { content });
      return;
    }
    return mockCall(() => StorageService.submitCongrats(content));
  },

  // ---------------- 管理员 ----------------
  async admin(action, payload) {
    if (mode === 'cloud') {
      const res = await callFunction('adminOps', { action, payload });
      if (['setPhase', 'updateConfig', 'renameCategory'].includes(action)) await loadCloudState();
      return res.data;
    }
    return mockCall(() => {
      const result = mockAdmin[action](payload || {});
      loadMockState();
      return result;
    });
  },

  async uploadHostAvatar(filePath) {
    const url = mode === 'cloud' ? await uploadPhoto(filePath, 'host') : filePath;
    return api.admin('updateConfig', { hostAvatar: url });
  }
};

// 本地模式的管理员操作（与 adminOps 云函数 action 同名）
const mockAdmin = {
  setPhase: ({ targetPhase }) => StorageService.setPhase(targetPhase),
  updateConfig: (fields) => StorageService.saveConfig(fields),
  renameCategory: ({ categoryId, name }) => StorageService.renameCategory(categoryId, name),
  unbindUser: ({ ldap }) => {
    // 本地模式绑定关系只存在本机
    const current = StorageService.getUserBinding();
    if (!current || current.ldap !== (ldap || '').trim().toUpperCase()) {
      throw new Error('本地模式只能解绑本机身份');
    }
    StorageService.unbindUser();
  },
  softDeleteEntry: ({ entryId }) => StorageService.deleteEntry(entryId),
  softDeleteCongrats: ({ msgId }) => StorageService.deleteCongrats(msgId),
  getOverview: () => ({
    stats: StorageService.getAdminStats(),
    entries: StorageService.getEntries().filter(e => e.status !== 'deleted'),
    congrats: StorageService.getCongrats()
  })
};

module.exports = api;
