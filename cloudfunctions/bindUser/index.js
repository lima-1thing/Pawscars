// cloudfunctions/bindUser/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { ldap } = event;

  if (!ldap || typeof ldap !== 'string') {
    return { success: false, message: '请输入活动ID' };
  }

  const cleanLdap = ldap.trim().toUpperCase();

  // 1. 纯英文字母校验（与前端 validateLdap 规则一致）
  if (cleanLdap.length < 2) {
    return { success: false, message: '活动ID长度至少为2位字母' };
  }
  if (!/^[A-Z]+$/.test(cleanLdap)) {
    return { success: false, message: '活动ID仅支持英文字母，不能包含数字或特殊符号' };
  }

  // 2. openid 唯一：同一个微信身份只能绑定一个活动ID
  const mine = await db.collection('UserBinding').where({ openid: OPENID }).get();
  if (mine.data.length > 0) {
    const bound = mine.data[0];
    if (bound.ldap === cleanLdap) {
      return { success: true, message: '已成功绑定', user: bound };
    }
    return { success: false, message: `你已绑定活动ID ${bound.ldap}，如需更换请联系管理员` };
  }

  // 3. 活动ID 全局唯一：以活动ID作为文档 _id，由数据库保证并发下也不会重复绑定
  const bindingRecord = { openid: OPENID, ldap: cleanLdap, boundAt: db.serverDate() };
  try {
    await db.collection('UserBinding').add({ data: { _id: cleanLdap, ...bindingRecord } });
  } catch (e) {
    const taken = await db.collection('UserBinding').doc(cleanLdap).get().catch(() => null);
    if (taken) {
      return { success: false, message: '该ID已被使用，如认为是误占用请联系管理员申诉' };
    }
    throw e;
  }

  return { success: true, message: '绑定成功', user: bindingRecord };
};
