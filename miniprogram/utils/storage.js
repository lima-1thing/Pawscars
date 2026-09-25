/**
 * Pawscars Storage & State Layer
 * 本地 Mock 存储实现（单机演示用）：所有数据只保存在当前设备。
 * 多人真实活动使用 gcloud-functions/ 后台（服务端做同样的校验与结算），见 utils/api.js。
 */

const { DEFAULT_CONFIG, DEFAULT_CATEGORIES, DEFAULT_ENTRIES, DEFAULT_CONGRATS } = require('./mock-data');
const {
  resolveInitialRound,
  buildKnockoutStage,
  getKnockoutWinners,
  generateDerbyMatches,
  resolveFinalRankings,
  computeEntryProgress,
  isPhaseOpen,
  PHASE_ORDER
} = require('./bracket');
const { validatePetName, validateCongrats } = require('./validator');

const STORAGE_KEYS = {
  CONFIG: 'pawscars_config',
  CATEGORIES: 'pawscars_categories',
  ENTRIES: 'pawscars_entries',
  USER_BINDING: 'pawscars_user_binding',
  INITIAL_VOTES: 'pawscars_initial_votes',
  MATCH_VOTES: 'pawscars_match_votes',
  MATCHES: 'pawscars_matches',
  CONGRATS: 'pawscars_congrats'
};

const STAGE_KNOCKOUT = '8进4';
const STAGE_DERBY = '4强德比';
const MAX_INITIAL_PICKS = 8;

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
  if (!getStorage(STORAGE_KEYS.MATCH_VOTES, null)) setStorage(STORAGE_KEYS.MATCH_VOTES, {});
  if (!getStorage(STORAGE_KEYS.MATCHES, null)) setStorage(STORAGE_KEYS.MATCHES, {});
}

initStorage();

function stageKey(categoryId, stage) {
  return `${categoryId}_${stage}`;
}

function qualifiersKey(categoryId) {
  return `${categoryId}_qualifiers`;
}

function isActive(entry) {
  return entry && entry.status !== 'deleted';
}

const StorageService = {
  PHASE_ORDER,
  STAGE_KNOCKOUT,
  STAGE_DERBY,

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
   * 门类改名：仅报名期开放，投票期锁定，避免中途改名造成混淆
   */
  renameCategory(categoryId, newName) {
    if (this.getPhase() !== 'nominate') {
      throw new Error('投票开始后门类名称已锁定，不可修改');
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
  // 阶段二/三：对阵与 PK 投票
  // ---------------------------------------------------------------
  getMatches(categoryId, stage) {
    const allMatches = getStorage(STORAGE_KEYS.MATCHES, {});
    return allMatches[stageKey(categoryId, stage)] || [];
  },

  /**
   * 用户可投票的对阵（排除轮空场）
   */
  getVotableMatches(categoryId, stage) {
    return this.getMatches(categoryId, stage).filter(m => m.entryA && m.entryB);
  },

  getQualifiers(categoryId) {
    const allMatches = getStorage(STORAGE_KEYS.MATCHES, {});
    return allMatches[qualifiersKey(categoryId)] || null;
  },

  submitMatchVote(matchId, chosenSide) {
    const user = this.getUserBinding();
    if (!user) throw new Error('请先绑定活动ID');
    if (chosenSide !== 'A' && chosenSide !== 'B') throw new Error('投票参数无效');

    const allMatches = getStorage(STORAGE_KEYS.MATCHES, {});
    let match = null;
    Object.keys(allMatches).some(key => {
      const list = allMatches[key];
      match = Array.isArray(list) ? list.find(m => m && m.id === matchId) : null;
      return !!match;
    });
    if (!match) throw new Error('对阵不存在，请刷新后重试');
    if (!match.entryA || !match.entryB) throw new Error('轮空场次无需投票');

    const phase = match.stage === STAGE_DERBY ? 'vote_match_4' : 'vote_match_8';
    this.assertPhaseOpen(phase, '本阶段投票已截止');

    const matchVotes = getStorage(STORAGE_KEYS.MATCH_VOTES, {});
    const voteKey = `${user.openid}_${matchId}`;
    if (matchVotes[voteKey]) {
      throw new Error('本场对决您已投过票，不可重复提交');
    }

    const now = Date.now();
    matchVotes[voteKey] = { openid: user.openid, matchId, chosenSide, timestamp: now };
    setStorage(STORAGE_KEYS.MATCH_VOTES, matchVotes);

    if (chosenSide === 'A') {
      match.votesA = (match.votesA || 0) + 1;
      match.lastVoteTimeA = now;
    } else {
      match.votesB = (match.votesB || 0) + 1;
      match.lastVoteTimeB = now;
    }
    setStorage(STORAGE_KEYS.MATCHES, allMatches);

    return matchVotes[voteKey];
  },

  getUserMatchVote(matchId) {
    const user = this.getUserBinding();
    if (!user) return null;
    const matchVotes = getStorage(STORAGE_KEYS.MATCH_VOTES, {});
    return matchVotes[`${user.openid}_${matchId}`] || null;
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
   * - 向后推进：按顺序补齐所需的结算与对阵（已生成的不会重复生成，票数不会被清空）
   * - 向前回退：清除目标阶段之后的对阵与投票记录，保证重新推进时数据一致
   */
  setPhase(targetPhase) {
    const targetIdx = PHASE_ORDER.indexOf(targetPhase);
    if (targetIdx === -1) throw new Error(`未知阶段：${targetPhase}`);

    const categories = this.getCategories();
    this.clearStagesAfter(targetPhase, categories);

    categories.forEach(cat => {
      if (targetIdx >= PHASE_ORDER.indexOf('vote_match_8')) this.ensureKnockout(cat.id);
      if (targetIdx >= PHASE_ORDER.indexOf('vote_match_4')) this.ensureDerby(cat.id);
    });

    return this.saveConfig({ currentPhase: targetPhase });
  },

  clearStagesAfter(targetPhase, categories) {
    const targetIdx = PHASE_ORDER.indexOf(targetPhase);
    const allMatches = getStorage(STORAGE_KEYS.MATCHES, {});
    const matchVotes = getStorage(STORAGE_KEYS.MATCH_VOTES, {});
    const removedMatchIds = new Set();

    const dropStage = (key) => {
      (allMatches[key] || []).forEach(m => m && removedMatchIds.add(m.id));
      delete allMatches[key];
    };

    categories.forEach(cat => {
      if (targetIdx < PHASE_ORDER.indexOf('vote_match_4')) dropStage(stageKey(cat.id, STAGE_DERBY));
      if (targetIdx < PHASE_ORDER.indexOf('vote_match_8')) {
        dropStage(stageKey(cat.id, STAGE_KNOCKOUT));
        delete allMatches[qualifiersKey(cat.id)];
      }
    });

    Object.keys(matchVotes).forEach(key => {
      if (removedMatchIds.has(matchVotes[key].matchId)) delete matchVotes[key];
    });

    setStorage(STORAGE_KEYS.MATCHES, allMatches);
    setStorage(STORAGE_KEYS.MATCH_VOTES, matchVotes);

    // 回到报名期：初选选票一并作废
    if (targetPhase === 'nominate') {
      setStorage(STORAGE_KEYS.INITIAL_VOTES, []);
      const entries = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
      entries.forEach(e => { e.initialVotes = 0; e.lastVoteTime = 0; });
      setStorage(STORAGE_KEYS.ENTRIES, entries);
    }
  },

  /**
   * 结算初选并生成淘汰赛（幂等：已生成则直接返回）
   */
  ensureKnockout(categoryId) {
    const allMatches = getStorage(STORAGE_KEYS.MATCHES, {});
    if (allMatches[qualifiersKey(categoryId)]) return;

    const entries = this.getEntries(categoryId);
    const votesFlat = [];
    getStorage(STORAGE_KEYS.INITIAL_VOTES, [])
      .filter(v => v.categoryId === categoryId)
      .forEach(v => v.selectedEntryIds.forEach(eid => votesFlat.push({ entryId: eid, timestamp: v.timestamp })));

    const { top8 } = resolveInitialRound(entries, votesFlat);
    const { matches } = buildKnockoutStage(top8, categoryId);

    allMatches[qualifiersKey(categoryId)] = top8;
    allMatches[stageKey(categoryId, STAGE_KNOCKOUT)] = matches;
    setStorage(STORAGE_KEYS.MATCHES, allMatches);
  },

  /**
   * 结算淘汰赛并生成德比循环赛（幂等）
   */
  ensureDerby(categoryId) {
    this.ensureKnockout(categoryId);
    const allMatches = getStorage(STORAGE_KEYS.MATCHES, {});
    const key = stageKey(categoryId, STAGE_DERBY);
    if (allMatches[key]) return;

    allMatches[key] = generateDerbyMatches(this.getFinalists(categoryId), categoryId);
    setStorage(STORAGE_KEYS.MATCHES, allMatches);
  },

  /**
   * 进入德比循环赛的名单：有淘汰赛则取胜者（含轮空），否则为全部晋级者
   */
  getFinalists(categoryId) {
    const knockout = this.getMatches(categoryId, STAGE_KNOCKOUT);
    if (knockout.length > 0) return getKnockoutWinners(knockout);
    return this.getQualifiers(categoryId) || [];
  },

  /**
   * 颁奖结果：只从德比循环赛结算得出；尚未结算返回 null
   */
  getAwardsResult(categoryId) {
    const allMatches = getStorage(STORAGE_KEYS.MATCHES, {});
    if (!allMatches[stageKey(categoryId, STAGE_DERBY)]) return null;
    return resolveFinalRankings(this.getFinalists(categoryId), allMatches[stageKey(categoryId, STAGE_DERBY)]);
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
      qualifiers: this.getQualifiers(catId),
      knockoutMatches: this.getMatches(catId, STAGE_KNOCKOUT),
      derbyMatches: this.getMatches(catId, STAGE_DERBY)
    });
  },

  /**
   * 管理员数据看板
   */
  getAdminStats() {
    const categories = this.getCategories();
    const initialVotes = getStorage(STORAGE_KEYS.INITIAL_VOTES, []);
    const matchVotes = Object.values(getStorage(STORAGE_KEYS.MATCH_VOTES, {}));
    const allVoters = new Set([...initialVotes.map(v => v.openid), ...matchVotes.map(v => v.openid)]);

    const perCategory = categories.map(cat => {
      const matchIds = new Set([
        ...this.getMatches(cat.id, STAGE_KNOCKOUT),
        ...this.getMatches(cat.id, STAGE_DERBY)
      ].map(m => m.id));
      const pkVoters = new Set(matchVotes.filter(v => matchIds.has(v.matchId)).map(v => v.openid));
      return {
        id: cat.id,
        name: cat.name,
        entryCount: this.getEntries(cat.id).length,
        initialVoterCount: initialVotes.filter(v => v.categoryId === cat.id).length,
        pkVoterCount: pkVoters.size
      };
    });

    return {
      totalEntries: this.getEntries().filter(isActive).length,
      totalVoters: allVoters.size,
      totalMatchVotes: matchVotes.length,
      totalCongrats: this.getCongrats().length,
      perCategory
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
    setStorage(STORAGE_KEYS.MATCH_VOTES, {});
    setStorage(STORAGE_KEYS.MATCHES, {});
    setStorage(STORAGE_KEYS.USER_BINDING, null);
  }
};

module.exports = StorageService;
