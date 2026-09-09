// cloudfunctions/submitVote/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { voteType } = event; // 'initial' or 'match'

  if (voteType === 'initial') {
    const { categoryId, selectedEntryIds } = event;
    // 阶段一初选：(openid + 门类) 组合唯一
    const exists = await db.collection('InitialSelection').where({
      openid,
      categoryId
    }).get();

    if (exists.data.length > 0) {
      return { success: false, message: '该门类您已锁定提交，不可重复修改' };
    }

    const now = Date.now();
    await db.collection('InitialSelection').add({
      data: {
        openid,
        categoryId,
        selectedEntryIds,
        createdAt: db.serverDate(),
        timestamp: now
      }
    });

    // 累加对应 Entry 的得票总数并更新最后得票时刻
    for (const eid of selectedEntryIds) {
      await db.collection('Entry').doc(eid).update({
        data: {
          initialVotes: _.inc(1),
          lastVoteTime: now
        }
      });
    }

    return { success: true, message: '初选选票提交成功' };
  } else if (voteType === 'match') {
    const { matchId, chosenSide } = event; // chosenSide: 'A' or 'B'
    // 阶段二/三PK对局：(openid + matchId) 唯一
    const exists = await db.collection('Vote').where({
      openid,
      matchId
    }).get();

    if (exists.data.length > 0) {
      return { success: false, message: '本场对局您已投过票，不可重复提交' };
    }

    const now = Date.now();
    await db.collection('Vote').add({
      data: {
        openid,
        matchId,
        chosenSide,
        createdAt: db.serverDate(),
        timestamp: now
      }
    });

    const updateData = chosenSide === 'A'
      ? { votesA: _.inc(1), lastVoteTimeA: now }
      : { votesB: _.inc(1), lastVoteTimeB: now };

    await db.collection('Match').doc(matchId).update({
      data: updateData
    });

    return { success: true, message: 'PK投票成功' };
  }

  return { success: false, message: '未知投票类型' };
};
