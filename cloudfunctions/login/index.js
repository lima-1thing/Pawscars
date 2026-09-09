// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 查询用户是否已绑定活动ID
  const userRes = await db.collection('UserBinding').where({ openid }).get();
  const user = userRes.data.length > 0 ? userRes.data[0] : null;

  return {
    openid,
    user
  };
};
