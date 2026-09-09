/**
 * Pawscars Storage & State Layer
 * 封装微信小程序本地存储与云开发适配器：
 * 默认使用本地 Mock 存储保障开箱即用体验，同时无缝支持 wx.cloud 云函数调用
 */

const { DEFAULT_CONFIG, DEFAULT_CATEGORIES, DEFAULT_ENTRIES, DEFAULT_CONGRATS } = require('./mock-data');
const { resolveInitialRound, generateQuarterFinalMatches, generateDerbyMatches, resolveDerbyRankings } = require('./bracket');

const STORAGE_KEYS = {
  CONFIG: 'pawscars_config',
  CATEGORIES: 'pawscars_categories',
  ENTRIES: 'pawscars_entries',
  USER_BINDING: 'pawscars_user_binding',
  INITIAL_VOTES: 'pawscars_initial_votes',
  MATCH_VOTES: 'pawscars_match_votes',
  MATCHES: 'pawscars_matches',
  CONGRATS: 'pawscars_congrats',
  IS_ADMIN: 'pawscars_is_admin'
};

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
  return memoryStore[key] !== undefined ? memoryStore[key] : defaultVal;
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
  memoryStore[key] = val;
}

// 初始化状态
function initStorage() {
  if (!getStorage(STORAGE_KEYS.CONFIG, null)) {
    setStorage(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG);
  }
  if (!getStorage(STORAGE_KEYS.CATEGORIES, null)) {
    setStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
  }
  if (!getStorage(STORAGE_KEYS.ENTRIES, null)) {
    setStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
  }
  if (!getStorage(STORAGE_KEYS.CONGRATS, null)) {
    setStorage(STORAGE_KEYS.CONGRATS, DEFAULT_CONGRATS);
  }
  if (!getStorage(STORAGE_KEYS.INITIAL_VOTES, null)) {
    setStorage(STORAGE_KEYS.INITIAL_VOTES, []);
  }
  if (!getStorage(STORAGE_KEYS.MATCH_VOTES, null)) {
    setStorage(STORAGE_KEYS.MATCH_VOTES, {});
  }
  if (!getStorage(STORAGE_KEYS.MATCHES, null)) {
    setStorage(STORAGE_KEYS.MATCHES, {});
  }
}

initStorage();

const StorageService = {
  getConfig() {
    return getStorage(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG);
  },
  saveConfig(cfg) {
    const current = this.getConfig();
    const updated = { ...current, ...cfg };
    setStorage(STORAGE_KEYS.CONFIG, updated);
    return updated;
  },

  getCategories() {
    return getStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
  },
  saveCategories(cats) {
    setStorage(STORAGE_KEYS.CATEGORIES, cats);
    return cats;
  },

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

  getEntries(categoryId) {
    const all = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    if (!categoryId) return all;
    return all.filter(e => e.categoryId === categoryId && e.status !== 'deleted');
  },

  /**
   * 提交报名（支持多选门类）
   * 边界条件：(ownerLdap + petName + categoryId) 组合唯一
   */
  submitNominations({ petName, photoUrl, categoryIds }) {
    const user = this.getUserBinding();
    if (!user) throw new Error('请先绑定活动ID');

    const allEntries = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    const addedEntries = [];
    const skippedCategories = [];

    const categories = this.getCategories();
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c.name; });

    categoryIds.forEach(catId => {
      const exists = allEntries.some(e =>
        e.ownerLdap.toUpperCase() === user.ldap.toUpperCase() &&
        e.petName.trim() === petName.trim() &&
        e.categoryId === catId &&
        e.status !== 'deleted'
      );

      if (exists) {
        skippedCategories.push(catMap[catId] || catId);
      } else {
        const newEntry = {
          id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          categoryId: catId,
          petName: petName.trim(),
          ownerLdap: user.ldap.toUpperCase(),
          ownerOpenid: user.openid,
          photoUrl,
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
   * 初选划屏：提交某门类的选票（最多8张）
   */
  submitInitialVote(categoryId, selectedEntryIds) {
    const user = this.getUserBinding();
    if (!user) throw new Error('请先绑定活动ID');

    const votes = getStorage(STORAGE_KEYS.INITIAL_VOTES, []);
    const existing = votes.find(v => v.categoryId === categoryId && v.openid === user.openid);
    if (existing) {
      throw new Error('您已提交过该门类的初选投票，不可重复修改');
    }

    const voteRecord = {
      id: `init_vote_${Date.now()}`,
      openid: user.openid,
      ldap: user.ldap,
      categoryId,
      selectedEntryIds,
      timestamp: Date.now()
    };
    votes.push(voteRecord);
    setStorage(STORAGE_KEYS.INITIAL_VOTES, votes);
    return voteRecord;
  },

  getInitialVotesForUser(categoryId) {
    const user = this.getUserBinding();
    if (!user) return null;
    const votes = getStorage(STORAGE_KEYS.INITIAL_VOTES, []);
    return votes.find(v => v.categoryId === categoryId && v.openid === user.openid) || null;
  },

  /**
   * 获取某阶段的对阵表
   */
  getMatches(categoryId, stage) {
    const allMatches = getStorage(STORAGE_KEYS.MATCHES, {});
    const key = `${categoryId}_${stage}`;
    return allMatches[key] || [];
  },

  /**
   * 提交单场 PK 投票
   */
  submitMatchVote(matchId, chosenSide) {
    const user = this.getUserBinding();
    if (!user) throw new Error('请先绑定活动ID');

    const matchVotes = getStorage(STORAGE_KEYS.MATCH_VOTES, {});
    const voteKey = `${user.openid}_${matchId}`;
    if (matchVotes[voteKey]) {
      throw new Error('本场对决您已投过票，不可重复提交');
    }

    matchVotes[voteKey] = {
      openid: user.openid,
      matchId,
      chosenSide,
      timestamp: Date.now()
    };
    setStorage(STORAGE_KEYS.MATCH_VOTES, matchVotes);

    // 更新比赛票数
    const allMatches = getStorage(STORAGE_KEYS.MATCHES, {});
    for (const key of Object.keys(allMatches)) {
      const match = allMatches[key].find(m => m.id === matchId);
      if (match) {
        if (chosenSide === 'A') {
          match.votesA = (match.votesA || 0) + 1;
          match.lastVoteTimeA = Date.now();
        } else {
          match.votesB = (match.votesB || 0) + 1;
          match.lastVoteTimeB = Date.now();
        }
        setStorage(STORAGE_KEYS.MATCHES, allMatches);
        break;
      }
    }

    return matchVotes[voteKey];
  },

  getUserMatchVote(matchId) {
    const user = this.getUserBinding();
    if (!user) return null;
    const matchVotes = getStorage(STORAGE_KEYS.MATCH_VOTES, {});
    return matchVotes[`${user.openid}_${matchId}`] || null;
  },

  /**
   * 贺词留言
   */
  getCongrats() {
    const all = getStorage(STORAGE_KEYS.CONGRATS, DEFAULT_CONGRATS);
    return all.filter(c => c.status !== 'deleted');
  },
  submitCongrats(content) {
    const user = this.getUserBinding();
    if (!user) throw new Error('请先绑定活动ID');

    const all = getStorage(STORAGE_KEYS.CONGRATS, DEFAULT_CONGRATS);
    const existing = all.find(c => c.ownerLdap === user.ldap && c.status !== 'deleted');
    if (existing) {
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

  /**
   * 获取我的提名
   */
  getMyNominations(ldap) {
    const targetLdap = ldap || (this.getUserBinding() ? this.getUserBinding().ldap : '');
    if (!targetLdap) return [];
    const all = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    return all.filter(e => e.ownerLdap.toUpperCase() === targetLdap.toUpperCase() && e.status !== 'deleted');
  },

  /**
   * 管理员功能：切换活动阶段并自动生成对阵
   */
  setPhase(targetPhase) {
    const cfg = this.getConfig();
    cfg.currentPhase = targetPhase;
    this.saveConfig(cfg);

    const categories = this.getCategories();
    const allMatches = getStorage(STORAGE_KEYS.MATCHES, {});
    const initialVotes = getStorage(STORAGE_KEYS.INITIAL_VOTES, []);

    if (targetPhase === 'vote_match_8') {
      // 报名截止/初选结束，生成 8 进 4 对阵
      categories.forEach(cat => {
        const entries = this.getEntries(cat.id);
        const votesFlat = [];
        initialVotes.filter(v => v.categoryId === cat.id).forEach(v => {
          v.selectedEntryIds.forEach(eid => {
            votesFlat.push({ entryId: eid, timestamp: v.timestamp });
          });
        });
        const { top8 } = resolveInitialRound(entries, votesFlat);
        const qfMatches = generateQuarterFinalMatches(top8, cat.id);
        allMatches[`${cat.id}_8进4`] = qfMatches;
      });
      setStorage(STORAGE_KEYS.MATCHES, allMatches);
    } else if (targetPhase === 'vote_match_4') {
      // 8进4结束，生成 4 强德比 6 场循环赛对阵
      categories.forEach(cat => {
        const qfMatches = allMatches[`${cat.id}_8进4`] || [];
        const final4 = [];
        qfMatches.forEach(m => {
          const winner = (m.votesA >= m.votesB) ? m.entryA : (m.entryB || m.entryA);
          if (winner) final4.push(winner);
        });
        // 兜底补齐4只
        const entries = this.getEntries(cat.id);
        while (final4.length < 4 && final4.length < entries.length) {
          const remain = entries.find(e => !final4.some(f => f.id === e.id));
          if (remain) final4.push(remain);
          else break;
        }
        const derbyMatches = generateDerbyMatches(final4, cat.id);
        allMatches[`${cat.id}_4强德比`] = derbyMatches;
      });
      setStorage(STORAGE_KEYS.MATCHES, allMatches);
    }

    return cfg;
  },

  /**
   * 计算颁奖结果
   */
  getAwardsResult(categoryId) {
    const allMatches = getStorage(STORAGE_KEYS.MATCHES, {});
    const derbyMatches = allMatches[`${categoryId}_4强德比`] || [];
    const entries = this.getEntries(categoryId);

    if (derbyMatches.length > 0) {
      const final4 = [];
      derbyMatches.forEach(m => {
        if (m.entryA && !final4.some(f => f.id === m.entryA.id)) final4.push(m.entryA);
        if (m.entryB && !final4.some(f => f.id === m.entryB.id)) final4.push(m.entryB);
      });
      return resolveDerbyRankings(final4, derbyMatches);
    }

    // 若未进行德比，直接取前三名展示
    return {
      champion: entries[0] || null,
      runnerUp: entries[1] || null,
      thirdPlace: entries[2] || null,
      fourthPlace: entries[3] || null,
      fullRankings: entries.map((e, idx) => ({ ...e, rank: idx + 1 }))
    };
  },

  /**
   * 软删除违规条目
   */
  deleteEntry(entryId) {
    const all = getStorage(STORAGE_KEYS.ENTRIES, DEFAULT_ENTRIES);
    const item = all.find(e => e.id === entryId);
    if (item) {
      item.status = 'deleted';
      setStorage(STORAGE_KEYS.ENTRIES, all);
    }
  },

  /**
   * 软删除留言
   */
  deleteCongrats(msgId) {
    const all = getStorage(STORAGE_KEYS.CONGRATS, DEFAULT_CONGRATS);
    const item = all.find(c => c.id === msgId);
    if (item) {
      item.status = 'deleted';
      setStorage(STORAGE_KEYS.CONGRATS, all);
    }
  },

  /**
   * 重置全部为初始演示数据
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
