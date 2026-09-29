/**
 * 网页版数据接口：调用 Google Cloud 后台（gcloud-functions/），方法与小程序 utils/api.js 同名
 * 登录方式：首次访问输入邀请码 → /login/web 生成本浏览器专属身份，令牌保存在 localStorage
 */
import { API_BASE_URL } from './config';
import { isPhaseOpen, DEFAULT_CATEGORIES, DEFAULT_CONFIG } from './shared';

const TOKEN_KEY = 'pawscars_web_token';
const DISPLAY_DEFAULT_FIELDS = ['title', 'hostName', 'hostAvatar', 'hostIntro', 'rulesSummary', 'callToActionText', 'rulesDetail'];

let state = { config: null, categories: [], user: null, isAdmin: false };
let token = '';
let onUnauthorized = () => {};

const store = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } },
  set: (v) => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* 隐私模式下只保存在内存 */ } }
};

function withDisplayDefaults(config) {
  const merged = { ...config };
  DISPLAY_DEFAULT_FIELDS.forEach(key => {
    if (merged[key] === undefined || merged[key] === null || merged[key] === '') merged[key] = DEFAULT_CONFIG[key];
  });
  return merged;
}

function withCategoryStyles(serverCategories) {
  return (serverCategories || DEFAULT_CATEGORIES).map(cat => {
    const style = DEFAULT_CATEGORIES.find(d => d.id === cat.id) || DEFAULT_CATEGORIES[0];
    return { ...style, ...cat };
  });
}

function applyBootstrap(data) {
  state = {
    config: withDisplayDefaults(data.config),
    categories: withCategoryStyles(data.categories),
    user: data.user,
    isAdmin: !!data.isAdmin
  };
  return state;
}

class UnauthorizedError extends Error {}

async function send(path, init) {
  let res;
  try {
    res = await fetch(API_BASE_URL + path, { method: 'POST', ...init });
  } catch (e) {
    throw new Error('网络开小差了，请稍后重试');
  }
  let body = {};
  try { body = await res.json(); } catch (e) { body = {}; }
  if (res.status === 401 && path !== '/login/web') {
    token = '';
    store.set('');
    onUnauthorized();
    throw new UnauthorizedError('登录已过期，请重新输入邀请码');
  }
  if (!body.success) throw new Error(body.message || '操作失败');
  return body.data;
}

function request(path, data) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return send(path, { headers, body: JSON.stringify(data || {}) });
}

async function uploadPhoto(blob, folder) {
  const form = new FormData();
  form.append('folder', folder);
  form.append('file', blob, 'photo.jpg');
  const data = await send('/upload', { headers: { Authorization: `Bearer ${token}` }, body: form });
  return data.url;
}

export const api = {

  /** 注册令牌失效时的回调（跳回邀请码页） */
  setUnauthorizedHandler(fn) { onUnauthorized = fn; },

  /** @returns {Promise<boolean>} 是否已登录 */
  async init() {
    token = store.get();
    if (!token) return false;
    try {
      applyBootstrap(await request('/bootstrap'));
      return true;
    } catch (e) {
      if (e instanceof UnauthorizedError) return false;
      throw e;
    }
  },

  async loginWithInvite(inviteCode) {
    const data = await request('/login/web', { inviteCode });
    token = data.token;
    store.set(token);
    return applyBootstrap(data);
  },

  logout() {
    token = '';
    store.set('');
  },

  getState: () => state,
  isPhaseOpen: (phase) => isPhaseOpen(state.config, phase),

  async refresh() {
    return applyBootstrap(await request('/bootstrap'));
  },

  async bindUser(ldap) {
    state.user = (await request('/bind', { ldap })).user;
    return state.user;
  },

  async submitNominations({ petName, photoBlob, categoryIds }) {
    const photoUrl = await uploadPhoto(photoBlob, 'entries');
    return request('/nominate', { petName, photoUrl, categoryIds, pledged: true });
  },

  async updateEntryPhoto(entryId, photoBlob) {
    const photoUrl = await uploadPhoto(photoBlob, 'entries');
    await request('/nominate/photo', { entryId, photoUrl });
  },

  /** 已提名的毛孩：各门类全部有效报名（最新在前、已打码），任何阶段可查看 */
  getGallery: () => request('/data/gallery'),
  async getMyNominations() { return (await request('/data/myNominations')).entries; },
  getInitialState: () => request('/data/initialState'),
  submitInitialVote: (categoryId, selectedEntryIds) => request('/vote', { voteType: 'initial', categoryId, selectedEntryIds }),
  /** 本人在各门类的决赛对局（首次进入时由后台随机生成并固定） */
  getFinalState: () => request('/data/finalState'),
  submitFinalVote: (categoryId, pairIndex, chosenSide) => request('/vote', { voteType: 'final', categoryId, pairIndex, chosenSide }),
  async getAwards(categoryId) { return (await request('/data/awards', { categoryId })).result; },
  getCongrats: () => request('/data/congrats'),
  submitCongrats: (content) => request('/congrats', { content }),

  async admin(action, payload) {
    const data = await request(`/admin/${action}`, payload);
    if (['setPhase', 'updateConfig', 'renameCategory'].includes(action)) await api.refresh();
    return data;
  },

  async uploadHostAvatar(blob) {
    const url = await uploadPhoto(blob, 'host');
    return api.admin('updateConfig', { hostAvatar: url });
  }
};
