// cloudfunctions/submitNomination/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { petName, photoUrl, categoryIds } = event;

  // 1. 验证用户绑定
  const userRes = await db.collection('UserBinding').where({ openid }).get();
  if (userRes.data.length === 0) {
    return { success: false, message: '请先绑定活动ID' };
  }
  const user = userRes.data[0];

  const addedEntries = [];
  const skippedCategories = [];

  for (const catId of categoryIds) {
    // 唯一性约束：(openid + 宠物名 + 门类) 组合唯一
    const exists = await db.collection('Entry').where({
      ownerOpenid: openid,
      petName: petName.trim(),
      categoryId: catId,
      status: db.command.neq('deleted')
    }).get();

    if (exists.data.length > 0) {
      skippedCategories.push(catId);
    } else {
      const newEntry = {
        ownerOpenid: openid,
        ownerLdap: user.ldap,
        petName: petName.trim(),
        photoUrl,
        categoryId: catId,
        pledged: true,
        status: 'active',
        initialVotes: 0,
        createdAt: db.serverDate()
      };
      const res = await db.collection('Entry').add({ data: newEntry });
      addedEntries.push({ id: res._id, ...newEntry });
    }
  }

  return {
    success: true,
    addedEntries,
    skippedCategories
  };
};
