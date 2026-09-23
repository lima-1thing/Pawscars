// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();

  // 查询用户是否已绑定活动ID
  const userRes = await db.collection('UserBinding').where({ openid: OPENID }).get();
  const user = userRes.data.length > 0 ? userRes.data[0] : null;

  // 管理员身份由服务端按 openid 白名单判定，前端只用来决定是否显示后台入口
  const configRes = await db.collection('Activity').doc('main_config').get().catch(() => null);
  const admins = (configRes && configRes.data.adminOpenids) || [];

  return {
    openid: OPENID,
    user,
    isAdmin: admins.includes(OPENID)
  };
};
