/**
 * 报名：多选门类提交、报名期内替换照片
 */
const { COL, isPhaseOpen } = require('../activity');
const { requireBinding } = require('./user');
const { UserError } = require('../errors');

function assertNominationOpen(activity) {
  if (!isPhaseOpen(activity, 'nominate')) throw new UserError('报名已截止');
}

// 照片必须是本服务上传到 entries/ 目录下的文件
function assertOwnPhoto(ctx, photoUrl) {
  if (typeof photoUrl !== 'string' || !photoUrl.startsWith(ctx.storage.publicUrl('entries/'))) {
    throw new UserError('请先上传毛孩照片');
  }
}

/**
 * POST /nominate { petName, photoUrl, categoryIds, pledged }
 * 唯一性：(openid + 宠物名 + 门类)；冲突门类跳过，其余正常提交（部分成功）
 */
async function create(ctx) {
  const binding = await requireBinding(ctx);
  assertNominationOpen(ctx.activity);

  const { petName, photoUrl, categoryIds, pledged } = ctx.body;
  const name = typeof petName === 'string' ? petName.trim() : '';
  if (name.length < 1 || name.length > 20) throw new UserError('宠物名字需在 1 到 20 个字之间');
  assertOwnPhoto(ctx, photoUrl);
  if (pledged !== true) throw new UserError('请勾选本人拍摄承诺');

  const catNames = {};
  ctx.activity.categories.forEach(c => { catNames[c.id] = c.name; });
  const validIds = [...new Set(Array.isArray(categoryIds) ? categoryIds : [])].filter(id => catNames[id]);
  if (validIds.length === 0) throw new UserError('请至少选择一个参赛门类');

  const addedEntries = [];
  const skippedCategories = [];
  for (const categoryId of validIds) {
    const exists = await ctx.db.count(COL.ENTRY, [
      ['ownerOpenid', '==', ctx.openid],
      ['petName', '==', name],
      ['categoryId', '==', categoryId],
      ['status', '==', 'active']
    ]);
    if (exists > 0) {
      skippedCategories.push(catNames[categoryId]);
      continue;
    }
    const now = Date.now();
    const id = await ctx.db.add(COL.ENTRY, {
      ownerOpenid: ctx.openid,
      ownerLdap: binding.ldap,
      petName: name,
      photoUrl,
      categoryId,
      pledged: true,
      pledgedAt: now,
      status: 'active',
      initialVotes: 0,
      lastVoteTime: 0,
      createdAt: now
    });
    addedEntries.push({ id, categoryId, petName: name });
  }

  return { addedEntries, skippedCategories };
}

/**
 * POST /nominate/photo { entryId, photoUrl }：覆盖式编辑，保留最后一次提交
 */
async function updatePhoto(ctx) {
  await requireBinding(ctx);
  assertNominationOpen(ctx.activity);
  const { entryId, photoUrl } = ctx.body;
  assertOwnPhoto(ctx, photoUrl);

  const entry = typeof entryId === 'string' ? await ctx.db.get(COL.ENTRY, entryId) : null;
  if (!entry || entry.ownerOpenid !== ctx.openid || entry.status !== 'active') {
    throw new UserError('只能修改自己的报名');
  }
  await ctx.db.update(COL.ENTRY, entryId, { photoUrl, updatedAt: Date.now() });
  return { message: '照片已更新' };
}

module.exports = { create, updatePhoto };
