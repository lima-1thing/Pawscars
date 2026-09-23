/**
 * Pawscars Tournament Bracket & Progression Engine
 * 实现了需求文档中定义的完整赛制逻辑：
 * 1. 初选排名与时间戳并列裁决
 * 2. 8进4按主人ID字母顺序 (A-Z) 排序配对 (1v2, 3v4, 5v6, 7v8)
 * 3. 4强德比循环赛 6 场对阵生成与最终冠亚季军决胜
 */

/**
 * 初选结果结算：选出 8 强
 * @param {Array} entries - 该门类的所有参赛条目
 * @param {Array} votes - 初选选票记录列表，每条含 { entryId, timestamp }
 * @returns {{ top8: Array, below8: Array, skipToStage: string|null }}
 */
function resolveInitialRound(entries, votes) {
  if (!entries || entries.length === 0) {
    return { top8: [], below8: [], skipToStage: 'awards' };
  }

  // 若报名数 <= 4，跳过初选和淘汰赛，全员直接进入 4 强德比循环赛
  if (entries.length <= 4) {
    return { top8: entries, below8: [], skipToStage: 'vote_match_4' };
  }

  // 若报名数 <= 8，初选没有淘汰意义，跳过初选划屏，全员进入单败淘汰赛
  if (entries.length <= 8) {
    return { top8: entries, below8: [], skipToStage: 'vote_match_8' };
  }

  // 统计每张照片的得票数以及达到最终票数的最后时间戳
  const statsMap = {};
  entries.forEach(e => {
    statsMap[e.id] = {
      entry: e,
      count: 0,
      lastVoteTime: 0,
      voteTimestamps: []
    };
  });

  votes.forEach(v => {
    if (statsMap[v.entryId]) {
      statsMap[v.entryId].count += 1;
      statsMap[v.entryId].voteTimestamps.push(v.timestamp);
      if (v.timestamp > statsMap[v.entryId].lastVoteTime) {
        statsMap[v.entryId].lastVoteTime = v.timestamp;
      }
    }
  });

  // 排序规则：
  // 1. 得票数从高到低
  // 2. 票数相同时，按"谁先达到该票数"（即该票数的那个时间戳更小/更早）判定
  const sorted = Object.values(statsMap).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    // 票数相同，比较最后关键一票的时间戳（越早越先到达）
    return (a.lastVoteTime || 0) - (b.lastVoteTime || 0);
  });

  const top8 = sorted.slice(0, 8).map(s => ({
    ...s.entry,
    initialVotes: s.count,
    lastVoteTime: s.lastVoteTime
  }));

  const below8 = sorted.slice(8).map(s => ({
    ...s.entry,
    initialVotes: s.count,
    lastVoteTime: s.lastVoteTime
  }));

  return { top8, below8, skipToStage: null };
}

/**
 * 8进4淘汰赛配对生成：
 * 规则：8强按各自主人的活动ID字母顺序排序 (A→Z)，排序后依次两两配对
 * (1v2, 3v4, 5v6, 7v8)，共4场1V1单败淘汰
 * @param {Array} top8Entries 
 * @param {string} categoryId 
 * @returns {Array} matches
 */
function generateQuarterFinalMatches(top8Entries, categoryId) {
  // 按主人活动ID字母顺序 (A-Z) 排序
  const sorted = [...top8Entries].sort((a, b) => {
    const idA = (a.ownerLdap || '').toUpperCase();
    const idB = (b.ownerLdap || '').toUpperCase();
    return idA.localeCompare(idB);
  });

  const matches = [];
  for (let i = 0; i < sorted.length; i += 2) {
    const entryA = sorted[i];
    const entryB = sorted[i + 1] || null;
    const matchIndex = Math.floor(i / 2) + 1;
    matches.push({
      id: `${categoryId}_qf_${matchIndex}`,
      categoryId,
      stage: '8进4',
      stageIndex: matchIndex,
      totalMatches: Math.ceil(sorted.length / 2),
      entryA,
      entryB,
      votesA: 0,
      votesB: 0,
      lastVoteTimeA: 0,
      lastVoteTimeB: 0,
      status: entryB ? 'pending' : 'bye', // pending / bye（轮空自动晋级，不参与投票）
      winnerId: null
    });
  }
  return matches;
}

/**
 * 8进4结算判定胜者
 * @param {object} match 
 * @returns {string} winnerId ('A' or 'B')
 */
function resolveMatchWinner(match) {
  if (!match.entryB) return 'A'; // 轮空自动晋级
  if (match.votesA > match.votesB) return 'A';
  if (match.votesB > match.votesA) return 'B';

  // 平局：按谁先达到该票数判定（时间戳更早者获胜）；
  // 时间戳也相同（如双方 0 票）时，按对阵表顺序由 A 方（ID 字母序靠前）晋级，保证结果确定
  if ((match.lastVoteTimeB || 0) < (match.lastVoteTimeA || 0)) return 'B';
  return 'A';
}

/**
 * 4强德比循环赛对阵生成：
 * 规则：4强之间两两对战，共6场 (C(4,2))，固定配对
 * @param {Array} final4Entries 
 * @param {string} categoryId 
 * @returns {Array} matches
 */
function generateDerbyMatches(final4Entries, categoryId) {
  // 保证4强按主人ID有序排列：A, B, C, D
  const sorted = [...final4Entries].sort((a, b) => {
    const idA = (a.ownerLdap || '').toUpperCase();
    const idB = (b.ownerLdap || '').toUpperCase();
    return idA.localeCompare(idB);
  });

  const pairs = [
    [0, 1], // A vs B
    [2, 3], // C vs D
    [0, 2], // A vs C
    [1, 3], // B vs D
    [0, 3], // A vs D
    [1, 2]  // B vs C
  ];

  const validPairs = pairs.filter(pair => sorted[pair[0]] && sorted[pair[1]]);

  return validPairs.map((pair, idx) => ({
    id: `${categoryId}_derby_${idx + 1}`,
    categoryId,
    stage: '4强德比',
    stageIndex: idx + 1,
    totalMatches: validPairs.length,
    entryA: sorted[pair[0]],
    entryB: sorted[pair[1]],
    votesA: 0,
    votesB: 0,
    lastVoteTimeA: 0,
    lastVoteTimeB: 0,
    status: 'pending',
    winnerId: null
  }));
}

/**
 * 4强德比循环赛结果结算，排定冠亚季军
 * 规则：胜场数优先；若胜场相同，看总得票数；若仍相同，按最后得票时间戳更早判定
 * @param {Array} final4Entries 
 * @param {Array} derbyMatches 
 * @returns {{ champion: object, runnerUp: object, thirdPlace: object, fourthPlace: object, fullRankings: Array }}
 */
function resolveDerbyRankings(final4Entries, derbyMatches) {
  const stats = {};
  final4Entries.forEach(e => {
    stats[e.id] = {
      entry: e,
      wins: 0,
      totalVotes: 0,
      lastVoteTime: 0
    };
  });

  derbyMatches.forEach(m => {
    const winnerSide = resolveMatchWinner(m);
    if (winnerSide === 'A' && m.entryA) {
      stats[m.entryA.id].wins += 1;
    } else if (winnerSide === 'B' && m.entryB) {
      stats[m.entryB.id].wins += 1;
    }

    if (m.entryA) {
      stats[m.entryA.id].totalVotes += (m.votesA || 0);
      if (m.lastVoteTimeA > stats[m.entryA.id].lastVoteTime) {
        stats[m.entryA.id].lastVoteTime = m.lastVoteTimeA;
      }
    }
    if (m.entryB) {
      stats[m.entryB.id].totalVotes += (m.votesB || 0);
      if (m.lastVoteTimeB > stats[m.entryB.id].lastVoteTime) {
        stats[m.entryB.id].lastVoteTime = m.lastVoteTimeB;
      }
    }
  });

  const fullRankings = Object.values(stats).sort((a, b) => {
    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }
    if (b.totalVotes !== a.totalVotes) {
      return b.totalVotes - a.totalVotes;
    }
    return (a.lastVoteTime || 0) - (b.lastVoteTime || 0);
  }).map((s, index) => ({
    ...s.entry,
    rank: index + 1,
    wins: s.wins,
    totalVotes: s.totalVotes,
    lastVoteTime: s.lastVoteTime
  }));

  return {
    champion: fullRankings[0] || null,
    runnerUp: fullRankings[1] || null,
    thirdPlace: fullRankings[2] || null,
    fourthPlace: fullRankings[3] || null,
    fullRankings
  };
}

/**
 * 淘汰赛胜者列表（含轮空晋级者），按对阵顺序返回
 * @param {Array} knockoutMatches
 * @returns {Array} entries
 */
function getKnockoutWinners(knockoutMatches) {
  return (knockoutMatches || []).map(m => (resolveMatchWinner(m) === 'A' ? m.entryA : m.entryB)).filter(Boolean);
}

/**
 * 生成淘汰赛阶段：
 * - 晋级者 <= 4：不设淘汰赛，直接全员进入循环赛（返回空对阵）
 * - 5~8：按主人ID字母顺序两两配对，奇数时字母序最后一位轮空直接晋级
 * @returns {{ matches: Array, directToDerby: boolean }}
 */
function buildKnockoutStage(qualifiers, categoryId) {
  if (!qualifiers || qualifiers.length <= 4) {
    return { matches: [], directToDerby: true };
  }
  return { matches: generateQuarterFinalMatches(qualifiers, categoryId), directToDerby: false };
}

/**
 * 某门类最终排名：只从德比循环赛结果得出，绝不以报名顺序代替
 * @returns {{ champion, runnerUp, thirdPlace, fourthPlace, fullRankings, isEmpty }}
 */
function resolveFinalRankings(finalists, derbyMatches) {
  const list = finalists || [];
  if (list.length === 0) {
    return { champion: null, runnerUp: null, thirdPlace: null, fourthPlace: null, fullRankings: [], isEmpty: true };
  }
  if (list.length === 1) {
    const only = { ...list[0], rank: 1, wins: 0, totalVotes: 0 };
    return { champion: only, runnerUp: null, thirdPlace: null, fourthPlace: null, fullRankings: [only], isEmpty: false };
  }
  return { ...resolveDerbyRankings(list, derbyMatches || []), isEmpty: false };
}

module.exports = {
  getKnockoutWinners,
  buildKnockoutStage,
  resolveFinalRankings,
  resolveInitialRound,
  generateQuarterFinalMatches,
  resolveMatchWinner,
  generateDerbyMatches,
  resolveDerbyRankings
};
