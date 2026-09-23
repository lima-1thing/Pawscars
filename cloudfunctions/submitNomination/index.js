// cloudfunctions/submitNomination/index.js
// action = 'create'（默认，多选门类报名）| 'updatePhoto'（报名期内替换照片）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const DEFAULT_CATEGORIES = [
  { id: 'food', name: '干饭王者' },
  { id: 'abstract', name: '抽象王者' },
  { id: 'beauty', name: '颜值王者' }
];

async function getOpenConfig() {
  const res = await db.collection('Activity').doc('main_config').get().catch(() => null);
  if (!res || res.data.currentPhase !== 'nominate') return null;
  const deadline = (res.data.phaseDeadlines || {}).nominate;
  if (deadline && Date.now() >= deadline) return null;
  return res.data;
}

// 照片必须先上传到云存储，只接受云文件 ID
const isCloudFile = (url) => typeof url === 'string' && url.startsWith('cloud://');

async function create(openid, user, config, { petName, photoUrl, categoryIds, pledged }) {
  const name = typeof petName === 'string' ? petName.trim() : '';
  if (name.length < 1 || name.length > 20) return { success: false, message: '宠物名字需在 1 到 20 个字之间' };
  if (!isCloudFile(photoUrl)) return { success: false, message: '请先上传毛孩照片' };
  if (pledged !== true) return { success: false, message: '请勾选本人拍摄承诺' };

  const catNames = {};
  const categories = Array.isArray(config.categories) && config.categories.length > 0 ? config.categories : DEFAULT_CATEGORIES;
  categories.forEach(c => { catNames[c.id] = c.name; });
  const validIds = [...new Set(Array.isArray(categoryIds) ? categoryIds : [])].filter(id => catNames[id]);
  if (validIds.length === 0) return { success: false, message: '请至少选择一个参赛门类' };

  const addedEntries = [];
  const skippedCategories = [];

  for (const catId of validIds) {
    // 唯一性约束：(openid + 宠物名 + 门类) 组合唯一
    const exists = await db.collection('Entry').where({
      ownerOpenid: openid,
      petName: name,
      categoryId: catId,
      status: _.neq('deleted')
    }).count();

    if (exists.total > 0) {
      skippedCategories.push(catNames[catId]);
      continue;
    }

    const newEntry = {
      ownerOpenid: openid,
      ownerLdap: user.ldap,
      petName: name,
      photoUrl,
      categoryId: catId,
      pledged: true,
      pledgedAt: db.serverDate(),
      status: 'active',
      initialVotes: 0,
      createdAt: db.serverDate()
    };
    const res = await db.collection('Entry').add({ data: newEntry });
    addedEntries.push({ id: res._id, categoryId: catId, petName: name });
  }

  return { success: true, addedEntries, skippedCategories };
}

async function updatePhoto(openid, { entryId, photoUrl }) {
  if (!isCloudFile(photoUrl)) return { success: false, message: '请先上传新照片' };
  const res = await db.collection('Entry')
    .where({ _id: entryId, ownerOpenid: openid, status: _.neq('deleted') })
    .update({ data: { photoUrl, updatedAt: db.serverDate() } });
  if (res.stats.updated === 0) return { success: false, message: '只能修改自己的报名' };
  return { success: true, message: '照片已更新' };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  const userRes = await db.collection('UserBinding').where({ openid: OPENID }).get();
  if (userRes.data.length === 0) return { success: false, message: '请先绑定活动ID' };

  const config = await getOpenConfig();
  if (!config) return { success: false, message: '报名已截止' };

  if (event.action === 'updatePhoto') return updatePhoto(OPENID, event);
  return create(OPENID, userRes.data[0], config, event);
};
