// cloudfunctions/submitCongrats/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { content } = event;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return { success: false, message: '请输入祝贺内容' };
  }
  if (content.trim().length > 50) {
    return { success: false, message: '贺词内容限 50 字以内' };
  }

  // 贺词仅在颁奖阶段开放
  const configRes = await db.collection('Activity').doc('main_config').get().catch(() => null);
  if (!configRes || configRes.data.currentPhase !== 'awards') {
    return { success: false, message: '颁奖典礼开始后才能发送贺词' };
  }

  const userRes = await db.collection('UserBinding').where({ openid: OPENID }).get();
  if (userRes.data.length === 0) {
    return { success: false, message: '请先绑定活动ID' };
  }
  const user = userRes.data[0];

  // 唯一性约束：以 openid 作为文档 _id，每人限发 1 条（被管理员隐藏后也不可重发）
  try {
    await db.collection('CongratsMessage').add({
      data: {
        _id: OPENID,
        openid: OPENID,
        ownerLdap: user.ldap,
        content: content.trim(),
        status: 'active',
        createdAt: db.serverDate()
      }
    });
  } catch (e) {
    const existing = await db.collection('CongratsMessage').doc(OPENID).get().catch(() => null);
    if (existing) {
      return { success: false, message: '每位用户仅限发送 1 条贺词' };
    }
    throw e;
  }

  return { success: true, message: '贺词发表成功' };
};
