/**
 * Pawscars Storage & State Layer
 * 本地 Mock 存储实现（单机演示用）：所有数据只保存在当前设备。
 * 多人真实活动使用 gcloud-functions/ 后台（服务端做同样的校验与结算），见 utils/api.js。
 */

const { DEFAULT_CONFIG, DEFAULT_CATEGORIES, DEFAULT_ENTRIES, DEFAULT_CONGRATS } = require('./mock-data');
const {
  PHASE_ORDER,
  FINALIST_COUNT,
  isPhaseOpen,
  resolveInitialRound,
  countPairCoverage,
  generateFinalPairs,
  resolveFinalRankings,
  computeEntryProgress
} = require('./bracket');
const { validatePetName, validateCongrats } = require('./validator');

const STORAGE_KEYS = {
  CONFIG: 'pawscars_config',
  CATEGORIES: 'pawscars_categories',
  ENTRIES: 'pawscars_entries',
  USER_BINDING: 'pawscars_user_binding',
  INITIAL_VOTES: 'pawscars_initial_votes',
  QUALIFIERS: 'pawscars_qualifiers',     // { [categoryId]: 决赛名单 }
  FINAL_PAIRS: 'pawscars_final_pairs',   // { [openid_categoryId]: [{ a, b }] } 每位投票人的决赛对局
  FINAL_VOTES: 'pawscars_final_votes',   // { [openid_categoryId_index]: 投票记录 }
  CONGRATS: 'pawscars_congrats'
};

const MAX_INITIAL_PICKS = FINALIST_COUNT;

const memoryStore = {};

function getStorage(key, defaultVal) {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const val = wx.getStorageSync(key);
      return val !== '' && val !== null && val !== undefined ? val : defaultVal;
    }
  } catch (e) {
    console.error('getStorage error', e);
  }
  return memoryStore[key] !== undefined && memoryStore[key] !== null ? memoryStore[key] : defaultVal;
}

function setStorage(key, val) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(key, val);
      return;
    }
  } catch (e) {
    console.error('setStorage error', e);
  }
  // 与 wx.setStorageSync 的序列化语义保持一致，避免写入时篡改默认数据对象
  memoryStore[key] = val === undefined ? undefined : JSON.parse(JSON.stringify(val));
}

function initStorage() {
  if (!getStorage(STORAGE_KEYS.CONFIG, null)) setStorage(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG);
  if (!getStorage(STORAGE_KEYS.CATEGORIES, null)) setStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
  if (!getStorage(STORAGE_KEYS.ENTRIES, null)) setStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
  if (!getStorage(STORAGE_KEYS.CONGRATS, null)) setStorage(STORAGE_KEYS.CONGRATS, DEFAULT_CONGRATS);
  if (!getStorage(STORAGE_KEYS.INITIAL_VOTES, null)) setStorage(STORAGE_KEYS.INITIAL_VOTES, []);
  if (!getStorage(STORAGE_KEYS.QUALIFIERS, null)) setStorage(STORAGE_KEYS.QUALIFIERS, {});
  if (!getStorage(STORAGE_KEYS.FINAL_PAIRS, null)) setStorage(STORAGE_KEYS.FINAL_PAIRS, {});
  if (!getStorage(STORAGE_KEYS.FINAL_VOTES, null)) setStorage(STORAGE_KEYS.FINAL_VOTES, {});
}

initStorage();

function isActive(entry) {
  return entry && entry.status !== 'deleted';
}

const StorageService = {
  PHASE_ORDER,

  // ---------------------------------------------------------------
  // 活动配置
  // ---------------------------------------------------------------
  getConfig() {
    return getStorage(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG);
  },
  saveConfig(cfg) {
    const updated = { ...this.getConfig(), ...cfg };
    setStorage(STORAGE_KEYS.CONFIG, updated);
    return updated;
  },

  getPhase() {
    return this.getConfig().currentPhase;
  },

  /**
   * 当前阶段截止时间（毫秒时间戳），未配置返回 0
   */
  getPhaseDeadline(phase) {
    const cfg = this.getConfig();
    const target = phase || cfg.currentPhase;
    return (cfg.phaseDeadlines && cfg.phaseDeadlines[target]) || 0;
  },

  /**
   * 当前阶段是否仍在开放窗口内（阶段匹配且未过截止时间）
   */
  isPhaseOpen(phase) {
    return isPhaseOpen(this.getConfig(), phase);
  },

  assertPhaseOpen(phase, closedMessage) {
    if (!this.isPhaseOpen(phase)) {
      throw new Error(closedMessage);
    }
  },

  getCategories() {
    return getStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
  },
  saveCategories(cats) {
    setStorage(STORAGE_KEYS.CATEGORIES, cats);
    return cats;
  },
  /**
   * 门类改名：门类固定为三个，任何阶段都可以改名（报名与投票按门类 id 记录，不受影响）
   */
  renameCategory(categoryId, newName) {
    if (!this.getCategories().some(c => c.id === categoryId)) {
      throw new Error('门类不存在');
    }
    const name = (newName || '').trim();
    if (!name || name.length > 10) {
      throw new Error('门类名称需在 1-10 字之间');
    }
    const cats = this.getCategories().map(c => (c.id === categoryId ? { ...c, name } : c));
    return this.saveCategories(cats);
  },

  // ---------------------------------------------------------------
  // 身份绑定 & 权限
  // ---------------------------------------------------------------
  getUserBinding() {
    return getStorage(STORAGE_KEYS.USER_BINDING, null);
  },
  bindUser(ldap) {
    const binding = {
      ldap: ldap.toUpperCase(),
      openid: `user_${ldap.toLowerCase()}`,
      boundAt: Date.now()
    };
    setStorage(STORAGE_KEYS.USER_BINDING, binding);
    return binding;
  },
  unbindUser() {
    setStorage(STORAGE_KEYS.USER_BINDING, null);
  },

  /**
   * 管理员判定：只认 openid 白名单，不认用户自己填写的活动ID
   */
  isAdmin() {
    const user = this.getUserBinding();
    const admins = this.getConfig().adminOpenids || [];
    return !!(user && user.openid && admins.includes(user.openid));
  },

  // ---------------------------------------------------------------
  // 报名
  // ---------------------------------------------------------------
  getEntries(categoryId) {
    const all = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    if (!categoryId) return all;
    return all.filter(e => e.categoryId === categoryId && isActive(e));
  },

  /**
   * 提交报名（支持多选门类）
   * 边界条件：(ownerLdap + petName + categoryId) 组合唯一
   */
  submitNominations({ petName, photoUrl, categoryIds }) {
    const user = this.getUserBinding();
    if (!user) throw new Error('请先绑定活动ID');
    this.assertPhaseOpen('nominate', '报名已截止');

    const nameCheck = validatePetName(petName);
    if (!nameCheck.valid) throw new Error(nameCheck.message);
    if (!photoUrl) throw new Error('请先上传毛孩照片');

    const categories = this.getCategories();
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c.name; });
    const validIds = [...new Set(categoryIds || [])].filter(id => catMap[id]);
    if (validIds.length === 0) throw new Error('请至少选择一个参赛门类');

    const allEntries = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    const addedEntries = [];
    const skippedCategories = [];
    const cleanName = petName.trim();

    validIds.forEach(catId => {
      const exists = allEntries.some(e =>
        e.ownerLdap.toUpperCase() === user.ldap.toUpperCase() &&
        e.petName.trim() === cleanName &&
        e.categoryId === catId &&
        isActive(e)
      );

      if (exists) {
        skippedCategories.push(catMap[catId]);
      } else {
        const newEntry = {
          id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          categoryId: catId,
          petName: cleanName,
          ownerLdap: user.ldap.toUpperCase(),
          ownerOpenid: user.openid,
          photoUrl,
          pledged: true,
          status: 'active',
          createdAt: Date.now(),
          initialVotes: 0
        };
        allEntries.push(newEntry);
        addedEntries.push(newEntry);
      }
    });

    setStorage(STORAGE_KEYS.ENTRIES, allEntries);
    return { addedEntries, skippedCategories };
  },

  /**
   * 报名期内替换自己某条报名的照片（覆盖式编辑，保留最后一次提交）
   */
  updateEntryPhoto(entryId, photoUrl) {
    const user = this.getUserBinding();
    if (!user) throw new Error('请先绑定活动ID');
    this.assertPhaseOpen('nominate', '报名已截止，不能再修改');
    if (!photoUrl) throw new Error('请先选择新照片');

    const all = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    const entry = all.find(e => e.id === entryId && isActive(e));
    if (!entry || entry.ownerOpenid !== user.openid) {
      throw new Error('只能修改自己的报名');
    }
    entry.photoUrl = photoUrl;
    entry.updatedAt = Date.now();
    setStorage(STORAGE_KEYS.ENTRIES, all);
    return entry;
  },

  getMyNominations(ldap) {
    const user = this.getUserBinding();
    const targetLdap = ldap || (user ? user.ldap : '');
    if (!targetLdap) return [];
    const all = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    return all.filter(e => e.ownerLdap.toUpperCase() === targetLdap.toUpperCase() && isActive(e));
  },

  // ---------------------------------------------------------------
  // 阶段一：初选
  // ---------------------------------------------------------------
  /**
   * 报名数 <= 8 的门类不设初选划屏，全员直接晋级
   */
  needsInitialRound(categoryId) {
    return this.getEntries(categoryId).length > MAX_INITIAL_PICKS;
  },

  submitInitialVote(categoryId, selectedEntryIds) {
    const user = this.getUserBinding();
    if (!user) throw new Error('请先绑定活动ID');
    this.assertPhaseOpen('vote_initial', '初选投票已截止');

    const ids = [...new Set(selectedEntryIds || [])];
    if (ids.length === 0) throw new Error('请至少选择 1 张喜欢的毛孩');
    if (ids.length > MAX_INITIAL_PICKS) throw new Error(`每个门类最多选择 ${MAX_INITIAL_PICKS} 张`);

    const candidateIds = new Set(this.getEntries(categoryId).map(e => e.id));
    if (!ids.every(id => candidateIds.has(id))) {
      throw new Error('选择中包含无效的参赛毛孩，请刷新后重试');
    }

    const votes = getStorage(STORAGE_KEYS.INITIAL_VOTES, []);
    if (votes.some(v => v.categoryId === categoryId && v.openid === user.openid)) {
      throw new Error('您已提交过该门类的初选投票，不可重复修改');
    }

    const now = Date.now();
    const voteRecord = {
      id: `init_vote_${now}_${Math.random().toString(36).slice(2, 6)}`,
      openid: user.openid,
      ldap: user.ldap,
      categoryId,
      selectedEntryIds: ids,
      timestamp: now
    };
    votes.push(voteRecord);
    setStorage(STORAGE_KEYS.INITIAL_VOTES, votes);

    // 同步累加被选次数与"达到当前票数"的时刻，供"我的提名"私密查看
    const all = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    all.forEach(e => {
      if (ids.includes(e.id)) {
        e.initialVotes = (e.initialVotes || 0) + 1;
        e.lastVoteTime = now;
      }
    });
    setStorage(STORAGE_KEYS.ENTRIES, all);

    return voteRecord;
  },

  getInitialVotesForUser(categoryId) {
    const user = this.getUserBinding();
    if (!user) return null;
    const votes = getStorage(STORAGE_KEYS.INITIAL_VOTES, []);
    return votes.find(v => v.categoryId === categoryId && v.openid === user.openid) || null;
  },

  // ---------------------------------------------------------------
  // 阶段二：决赛（8 强两两 PK）
  // ---------------------------------------------------------------
  /**
   * 决赛名单；初选尚未结算返回 null
   */
  getQualifiers(categoryId) {
    return getStorage(STORAGE_KEYS.QUALIFIERS, {})[categoryId] || null;
  },

  getFinalists(categoryId) {
    return this.getQualifiers(categoryId) || [];
  },

  /**
   * 决赛战绩：{ [entryId]: { wins, games, lastWinTime } }
   */
  getFinalStats(categoryId) {
    const stats = {};
    this.getEntries(categoryId).forEach(e => {
      stats[e.id] = { wins: e.finalWins || 0, games: e.finalGames || 0, lastWinTime: e.lastFinalWinTime || 0 };
    });
    return stats;
  },

  /**
   * 当前用户在某门类的决赛对局（首次进入时随机生成并固定）
   * @returns {Array<{ index, entryA, entryB, myVote }>}
   */
  getMyFinalPairs(categoryId) {
    const user = this.getUserBinding();
    const finalists = this.getFinalists(categoryId);
    if (!user || finalists.length < 2) return [];

    const all = getStorage(STORAGE_KEYS.FINAL_PAIRS, {});
    const key = `${user.openid}_${categoryId}`;
    if (!all[key]) {
      if (!this.isPhaseOpen('vote_final')) return [];
      // 参考本门类已分配的对局，让全部两两组合被均匀覆盖
      const existing = Object.keys(all).filter(k => k.endsWith(`_${categoryId}`)).map(k => all[k]);
      all[key] = generateFinalPairs(finalists.map(f => f.id), { coverage: countPairCoverage(existing) });
      setStorage(STORAGE_KEYS.FINAL_PAIRS, all);
    }

    const byId = {};
    finalists.forEach(f => { byId[f.id] = f; });
    const votes = getStorage(STORAGE_KEYS.FINAL_VOTES, {});
    return all[key].map((p, index) => {
      const v = votes[`${key}_${index}`];
      return { index, entryA: byId[p.a], entryB: byId[p.b], myVote: v ? v.chosenSide : null };
    }).filter(p => p.entryA && p.entryB);
  },

  submitFinalVote(categoryId, pairIndex, chosenSide) {
    const user = this.getUserBinding();
    if (!user) throw new Error('请先绑定活动ID');
    if (chosenSide !== 'A' && chosenSide !== 'B') throw new Error('投票参数无效');
    this.assertPhaseOpen('vote_final', '决赛投票已截止');

    const key = `${user.openid}_${categoryId}`;
    const pair = (getStorage(STORAGE_KEYS.FINAL_PAIRS, {})[key] || [])[pairIndex];
    if (!pair) throw new Error('对局不存在，请刷新后重试');

    const votes = getStorage(STORAGE_KEYS.FINAL_VOTES, {});
    const voteKey = `${key}_${pairIndex}`;
    if (votes[voteKey]) throw new Error('本场对决您已投过票，不可重复提交');

    const now = Date.now();
    const winner = chosenSide === 'A' ? pair.a : pair.b;
    const loser = chosenSide === 'A' ? pair.b : pair.a;
    votes[voteKey] = { openid: user.openid, categoryId, pairIndex, chosenSide, winner, loser, timestamp: now };
    setStorage(STORAGE_KEYS.FINAL_VOTES, votes);

    const entries = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    entries.forEach(e => {
      if (e.id === winner) {
        e.finalWins = (e.finalWins || 0) + 1;
        e.finalGames = (e.finalGames || 0) + 1;
        e.lastFinalWinTime = now;
      } else if (e.id === loser) {
        e.finalGames = (e.finalGames || 0) + 1;
      }
    });
    setStorage(STORAGE_KEYS.ENTRIES, entries);
    return votes[voteKey];
  },

  // ---------------------------------------------------------------
  // 贺词
  // ---------------------------------------------------------------
  getCongrats() {
    const all = getStorage(STORAGE_KEYS.CONGRATS, DEFAULT_CONGRATS);
    return all.filter(isActive);
  },
  getAllCongrats() {
    return getStorage(STORAGE_KEYS.CONGRATS, DEFAULT_CONGRATS);
  },
  submitCongrats(content) {
    const user = this.getUserBinding();
    if (!user) throw new Error('请先绑定活动ID');
    if (this.getPhase() !== 'awards') throw new Error('颁奖典礼开始后才能发送贺词');

    const check = validateCongrats(content);
    if (!check.valid) throw new Error(check.message);

    const all = getStorage(STORAGE_KEYS.CONGRATS, DEFAULT_CONGRATS);
    if (all.some(c => c.ownerLdap === user.ldap && isActive(c))) {
      throw new Error('每位用户仅限提交 1 条贺词');
    }

    const newMsg = {
      id: `msg_${Date.now()}`,
      ownerLdap: user.ldap,
      content: content.trim(),
      createdAt: Date.now(),
      status: 'active'
    };
    all.unshift(newMsg);
    setStorage(STORAGE_KEYS.CONGRATS, all);
    return newMsg;
  },

  // ---------------------------------------------------------------
  // 管理员：阶段流转与结算
  // ---------------------------------------------------------------
  /**
   * 切换活动阶段。
   * - 推进到决赛：结算初选、生成决赛名单（已生成的不会重复生成，票数不会被清空）
   * - 向前回退：清除目标阶段之后的名单与投票记录，保证重新推进时数据一致
   */
  setPhase(targetPhase) {
    const targetIdx = PHASE_ORDER.indexOf(targetPhase);
    if (targetIdx === -1) throw new Error(`未知阶段：${targetPhase}`);

    const categories = this.getCategories();
    this.clearStagesAfter(targetPhase, categories);
    if (targetIdx >= PHASE_ORDER.indexOf('vote_final')) {
      categories.forEach(cat => this.ensureQualifiers(cat.id));
    }
    return this.saveConfig({ currentPhase: targetPhase });
  },

  clearStagesAfter(targetPhase, categories) {
    const targetIdx = PHASE_ORDER.indexOf(targetPhase);
    const catIds = new Set(categories.map(c => c.id));

    if (targetIdx < PHASE_ORDER.indexOf('vote_final')) {
      const qualifiers = getStorage(STORAGE_KEYS.QUALIFIERS, {});
      catIds.forEach(id => { delete qualifiers[id]; });
      setStorage(STORAGE_KEYS.QUALIFIERS, qualifiers);

      const dropByCategory = (store) => {
        const data = getStorage(store, {});
        Object.keys(data).forEach(k => {
          const catId = data[k] && data[k].categoryId;
          if (catId ? catIds.has(catId) : [...catIds].some(id => k.endsWith(`_${id}`))) delete data[k];
        });
        setStorage(store, data);
      };
      dropByCategory(STORAGE_KEYS.FINAL_PAIRS);
      dropByCategory(STORAGE_KEYS.FINAL_VOTES);
    }

    const entries = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    entries.forEach(e => {
      if (!catIds.has(e.categoryId)) return;
      if (targetIdx < PHASE_ORDER.indexOf('vote_final')) { e.finalWins = 0; e.finalGames = 0; e.lastFinalWinTime = 0; }
      if (targetPhase === 'nominate') { e.initialVotes = 0; e.lastVoteTime = 0; }
    });
    setStorage(STORAGE_KEYS.ENTRIES, entries);

    // 回到报名期：初选选票一并作废
    if (targetPhase === 'nominate') setStorage(STORAGE_KEYS.INITIAL_VOTES, []);
  },

  /**
   * 结算初选、生成决赛名单（幂等：已生成则直接返回）
   */
  ensureQualifiers(categoryId) {
    const qualifiers = getStorage(STORAGE_KEYS.QUALIFIERS, {});
    if (qualifiers[categoryId]) return;

    const votesFlat = [];
    getStorage(STORAGE_KEYS.INITIAL_VOTES, [])
      .filter(v => v.categoryId === categoryId)
      .forEach(v => v.selectedEntryIds.forEach(eid => votesFlat.push({ entryId: eid, timestamp: v.timestamp })));

    qualifiers[categoryId] = resolveInitialRound(this.getEntries(categoryId), votesFlat).top8;
    setStorage(STORAGE_KEYS.QUALIFIERS, qualifiers);
  },

  /**
   * 颁奖结果：按决赛胜率排名；初选尚未结算返回 null
   */
  getAwardsResult(categoryId) {
    if (!this.getQualifiers(categoryId)) return null;
    return resolveFinalRankings(this.getFinalists(categoryId), this.getFinalStats(categoryId));
  },

  /**
   * "我的提名"私密进度：本人可见各阶段票数与晋级情况
   */
  getEntryProgress(entry) {
    const catId = entry.categoryId;
    return computeEntryProgress({
      entry,
      phase: this.getPhase(),
      needsInitialRound: this.needsInitialRound(catId),
      finalists: this.getQualifiers(catId),
      finalStats: this.getFinalStats(catId)
    });
  },

  /**
   * 管理员数据看板
   */
  getAdminStats() {
    const initialVotes = getStorage(STORAGE_KEYS.INITIAL_VOTES, []);
    const finalVotes = Object.values(getStorage(STORAGE_KEYS.FINAL_VOTES, {}));
    const allVoters = new Set([...initialVotes.map(v => v.openid), ...finalVotes.map(v => v.openid)]);

    return {
      totalEntries: this.getEntries().filter(isActive).length,
      totalVoters: allVoters.size,
      totalFinalVotes: finalVotes.length,
      totalCongrats: this.getCongrats().length,
      perCategory: this.getCategories().map(cat => ({
        id: cat.id,
        name: cat.name,
        entryCount: this.getEntries(cat.id).length,
        initialVoterCount: initialVotes.filter(v => v.categoryId === cat.id).length,
        finalVoterCount: new Set(finalVotes.filter(v => v.categoryId === cat.id).map(v => v.openid)).size
      }))
    };
  },

  // ---------------------------------------------------------------
  // 管理员：违规内容处理（软删除）
  // ---------------------------------------------------------------
  deleteEntry(entryId) {
    const all = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    const item = all.find(e => e.id === entryId);
    if (item) {
      item.status = 'deleted';
      setStorage(STORAGE_KEYS.ENTRIES, all);
    }
  },

  deleteCongrats(msgId) {
    const all = getStorage(STORAGE_KEYS.CONGRATS, DEFAULT_CONGRATS);
    const item = all.find(c => c.id === msgId);
    if (item) {
      item.status = 'deleted';
      setStorage(STORAGE_KEYS.CONGRATS, all);
    }
  },

  /**
   * 重置全部为初始演示数据（仅开发版可用）
   */
  resetAll() {
    setStorage(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG);
    setStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
    setStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    setStorage(STORAGE_KEYS.CONGRATS, DEFAULT_CONGRATS);
    setStorage(STORAGE_KEYS.INITIAL_VOTES, []);
    setStorage(STORAGE_KEYS.QUALIFIERS, {});
    setStorage(STORAGE_KEYS.FINAL_PAIRS, {});
    setStorage(STORAGE_KEYS.FINAL_VOTES, {});
    setStorage(STORAGE_KEYS.USER_BINDING, null);
  }
};

module.exports = StorageService;
