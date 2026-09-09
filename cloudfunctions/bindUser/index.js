// cloudfunctions/bindUser/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { ldap } = event;

  if (!ldap || typeof ldap !== 'string') {
    return { success: false, message: '请输入活动ID' };
  }

  const cleanLdap = ldap.trim().toUpperCase();

  // 1. 纯英文字母校验
  if (!/^[A-Za-z]+$/.test(cleanLdap)) {
    return { success: false, message: '活动ID仅支持英文字母，不能包含数字或特殊符号' };
  }

  // 2. 全局唯一性校验：检查该 LDAP 是否已被他人占用
  const existing = await db.collection('UserBinding').where({ ldap: cleanLdap }).get();
  if (existing.data.length > 0) {
    if (existing.data[0].openid !== openid) {
      return { success: false, message: '该ID已被使用，如认为是误占用请联系管理员申诉' };
    } else {
      return { success: true, message: '已成功绑定', user: existing.data[0] };
    }
  }

  // 3. 写入绑定记录
  const bindingRecord = {
    openid,
    ldap: cleanLdap,
    boundAt: db.serverDate()
  };

  await db.collection('UserBinding').add({
    data: bindingRecord
  });

  return { success: true, message: '绑定成功', user: bindingRecord };
};
