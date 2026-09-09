// cloudfunctions/submitCongrats/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { content } = event;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return { success: false, message: '请输入祝贺内容' };
  }
  if (content.trim().length > 50) {
    return { success: false, message: '贺词内容限 50 字以内' };
  }

  // 获取活动ID
  const userRes = await db.collection('UserBinding').where({ openid }).get();
  if (userRes.data.length === 0) {
    return { success: false, message: '请先绑定活动ID' };
  }
  const user = userRes.data[0];

  // 唯一性约束：(openid) 唯一，每人限发1条贺词
  const existing = await db.collection('CongratsMessage').where({
    openid,
    status: db.command.neq('deleted')
  }).get();

  if (existing.data.length > 0) {
    return { success: false, message: '每位用户仅限发送 1 条贺词' };
  }

  await db.collection('CongratsMessage').add({
    data: {
      openid,
      ownerLdap: user.ldap,
      content: content.trim(),
      status: 'active',
      createdAt: db.serverDate()
    }
  });

  return { success: true, message: '贺词发表成功' };
};
