// cloudfunctions/adminOps/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, payload } = event;

  // 1. 白名单管理员校验
  const configRes = await db.collection('Activity').doc('main_config').get().catch(() => ({ data: {} }));
  const defaultAdmins = ['ADMIN_LIMA', 'ADMIN_GONG', 'DEVELOPER', 'LIMA0001', 'PRIVACY-BY-DESIGN'];
  const adminList = ((configRes.data && configRes.data.adminOpenids) || defaultAdmins).map(x => (x || '').toUpperCase());
  const requesterId = (event.ldap || openid || '').toUpperCase();
  if (!adminList.includes(openid) && !adminList.includes(requesterId)) {
    return { success: false, message: '权限不足：仅限活动管理员操作' };
  }

  if (action === 'setPhase') {
    const { targetPhase } = payload;
    await db.collection('Activity').doc('main_config').update({
      data: { currentPhase: targetPhase }
    });
    return { success: true, message: `阶段已切换至 ${targetPhase}` };
  } else if (action === 'unbindUser') {
    const { ldap } = payload;
    await db.collection('UserBinding').where({ ldap: ldap.toUpperCase() }).remove();
    return { success: true, message: `已成功解绑活动ID ${ldap}` };
  } else if (action === 'softDeleteEntry') {
    const { entryId } = payload;
    await db.collection('Entry').doc(entryId).update({
      data: { status: 'deleted' }
    });
    return { success: true, message: '条目已软删除' };
  } else if (action === 'softDeleteCongrats') {
    const { msgId } = payload;
    await db.collection('CongratsMessage').doc(msgId).update({
      data: { status: 'deleted' }
    });
    return { success: true, message: '留言已隐藏' };
  }

  return { success: false, message: '未知管理员操作' };
};
