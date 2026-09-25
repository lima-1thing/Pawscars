/**
 * Pawscars 数据接口层（页面只通过这里读写数据）
 * - gcloud 模式：调用 Google Cloud 后台（gcloud-functions/），照片上传到 Cloud Storage
 * - mock 模式：包装本地 StorageService，便于单机演示与开发调试
 * 所有方法均返回 Promise；失败时抛出带中文提示的 Error。
 */
const StorageService = require('./storage');
const { DEFAULT_CATEGORIES } = require('./mock-data');
const { isPhaseOpen } = require('./bracket');
const { BACKEND, API_BASE_URL } = require('../env');

const STAGE_KNOCKOUT = '8进4';
const STAGE_DERBY = '4强德比';
const TOKEN_KEY = 'pawscars_api_token';
const REQUEST_TIMEOUT = 15000;

let mode = 'mock';
let state = { config: null, categories: [], user: null, isAdmin: false };
let token = '';

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

function saveToken(value) {
  token = value || '';
  try {
    wx.setStorageSync(TOKEN_KEY, token);
  } catch (e) {
    // 存储失败时本次会话仍可使用内存中的令牌
  }
}

function loadToken() {
  try {
    return wx.getStorageSync(TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}

function applyBootstrap(data) {
  state = {
    config: data.config,
    categories: withCategoryStyles(data.categories),
    user: data.user,
    isAdmin: data.isAdmin
  };
  return state;
}

// ---------------- Google Cloud 后台请求 ----------------
function rawRequest(path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE_URL + path,
      method: 'POST',
      data: data || {},
      timeout: REQUEST_TIMEOUT,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => resolve({ status: res.statusCode, body: res.data || {} }),
      fail: () => reject(new Error('网络开小差了，请稍后重试'))
    });
  });
}

function wxLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => (res.code ? resolve(res.code) : reject(new Error('微信登录失败，请重试'))),
      fail: () => reject(new Error('微信登录失败，请重试'))
    });
  });
}

let loginInFlight = null;

// 多个请求同时遇到 401 时共用同一次登录
function login() {
  if (!loginInFlight) {
    loginInFlight = (async () => {
      const code = await wxLoginCode();
      const { body } = await rawRequest('/login', { code });
      if (!body.success) throw new Error(body.message || '登录失败，请重试');
      saveToken(body.data.token);
      return applyBootstrap(body.data);
    })().finally(() => { loginInFlight = null; });
  }
  return loginInFlight;
}

/**
 * 调用后台接口；令牌过期（401）时自动重新登录并重试一次
 */
async function request(path, data) {
  let res = await rawRequest(path, data);
  if (res.status === 401) {
    await login();
    res = await rawRequest(path, data);
  }
  if (!res.body.success) throw new Error(res.body.message || '操作失败');
  return res.body.data;
}

function uploadOnce(filePath, folder) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/upload`,
      filePath,
      name: 'file',
      formData: { folder },
      timeout: 60000,
      header: { Authorization: `Bearer ${token}` },
      success: (res) => {
        let body = {};
        try {
          body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        } catch (e) {
          body = {};
        }
        resolve({ status: res.statusCode, body });
      },
      fail: () => reject(new Error('照片上传失败，请检查网络后重试'))
    });
  });
}

async function uploadPhoto(filePath, folder) {
  let res = await uploadOnce(filePath, folder);
  if (res.status === 401) {
    await login();
    res = await uploadOnce(filePath, folder);
  }
  if (!res.body.success) throw new Error(res.body.message || '照片上传失败');
  return res.body.data.url;
}

async function loadRemoteState() {
  if (!API_BASE_URL) throw new Error('未配置后台地址（miniprogram/env.js 中的 API_BASE_URL）');
  if (!token) token = loadToken();
  if (!token) return login();
  const res = await rawRequest('/bootstrap');
  if (res.status === 401) return login();
  if (!res.body.success) throw new Error(res.body.message || '加载失败');
  return applyBootstrap(res.body.data);
}

function loadMockState() {
  state = {
    config: StorageService.getConfig(),
    categories: StorageService.getCategories(),
    user: StorageService.getUserBinding(),
    isAdmin: StorageService.isAdmin()
  };
}

// 本地模式同步方法包成 Promise，与后台模式保持一致的调用方式
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
    if (BACKEND === 'gcloud') {
      try {
        await loadRemoteState();
        mode = 'gcloud';
        return state;
      } catch (e) {
        if (!isDevBuild()) throw e;
        console.warn('Google Cloud 后台不可用，开发版退回本地存储：', e.message);
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
    if (mode === 'gcloud') applyBootstrap(await request('/bootstrap'));
    else loadMockState();
    return state;
  },

  isPhaseOpen(phase) {
    return isPhaseOpen(state.config, phase);
  },

  // ---------------- 身份 ----------------
  async bindUser(ldap) {
    if (mode === 'gcloud') {
      state.user = (await request('/bind', { ldap })).user;
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
    if (mode === 'gcloud') {
      const photoUrl = await uploadPhoto(photoPath, 'entries');
      return request('/nominate', { petName, photoUrl, categoryIds, pledged: true });
    }
    return mockCall(() => StorageService.submitNominations({ petName, photoUrl: photoPath, categoryIds }));
  },

  async updateEntryPhoto(entryId, photoPath) {
    if (mode === 'gcloud') {
      const photoUrl = await uploadPhoto(photoPath, 'entries');
      await request('/nominate/photo', { entryId, photoUrl });
      return;
    }
    return mockCall(() => StorageService.updateEntryPhoto(entryId, photoPath));
  },

  /**
   * 本人全部报名，含私密进度 progress: { title, detail, tone }
   */
  async getMyNominations() {
    if (mode === 'gcloud') return (await request('/data/myNominations')).entries;
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
    if (mode === 'gcloud') return request('/data/initialState');
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
    if (mode === 'gcloud') {
      await request('/vote', { voteType: 'initial', categoryId, selectedEntryIds });
      return;
    }
    return mockCall(() => StorageService.submitInitialVote(categoryId, selectedEntryIds));
  },

  // ---------------- PK 对局 ----------------
  /**
   * @returns {{ phaseOpen, categories: [{ id, generated, matches, myVotes }] }}
   */
  async getMatchState(stage) {
    if (mode === 'gcloud') return request('/data/matchState', { stage });
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
    if (mode === 'gcloud') {
      await request('/vote', { voteType: 'match', matchId, chosenSide });
      return;
    }
    return mockCall(() => StorageService.submitMatchVote(matchId, chosenSide));
  },

  // ---------------- 颁奖 & 贺词 ----------------
  /**
   * 颁奖结果；尚未结算（或无权预览）返回 null
   */
  async getAwards(categoryId) {
    if (mode === 'gcloud') return (await request('/data/awards', { categoryId })).result;
    return mockCall(() => StorageService.getAwardsResult(categoryId));
  },

  /**
   * @returns {{ list, hasSent }}
   */
  async getCongrats() {
    if (mode === 'gcloud') return request('/data/congrats');
    return mockCall(() => {
      const list = StorageService.getCongrats();
      return { list, hasSent: !!state.user && list.some(c => c.ownerLdap === state.user.ldap) };
    });
  },

  async submitCongrats(content) {
    if (mode === 'gcloud') {
      await request('/congrats', { content });
      return;
    }
    return mockCall(() => StorageService.submitCongrats(content));
  },

  // ---------------- 管理员 ----------------
  async admin(action, payload) {
    if (mode === 'gcloud') {
      const data = await request(`/admin/${action}`, payload);
      if (['setPhase', 'updateConfig', 'renameCategory'].includes(action)) await api.refresh();
      return data;
    }
    return mockCall(() => {
      const result = mockAdmin[action](payload || {});
      loadMockState();
      return result;
    });
  },

  async uploadHostAvatar(filePath) {
    const url = mode === 'gcloud' ? await uploadPhoto(filePath, 'host') : filePath;
    return api.admin('updateConfig', { hostAvatar: url });
  }
};

// 本地模式的管理员操作（与后台 /admin/:action 同名）
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
