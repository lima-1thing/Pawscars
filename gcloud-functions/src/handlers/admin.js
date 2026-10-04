/**
 * 管理员操作：仅 openid 在 Activity/main_config.adminOpenids 白名单内可调用
 */
const { COL, CONFIG_ID, EDITABLE_CONFIG_FIELDS, isAdmin } = require('../activity');
const { setPhase } = require('../settlement');
const { UserError } = require('../errors');

const actions = {
  async setPhase(ctx, { targetPhase }) {
    await setPhase(ctx.db, ctx.activity, targetPhase);
    return { message: `阶段已切换至 ${targetPhase}` };
  },

  async updateConfig(ctx, payload) {
    const data = {};
    EDITABLE_CONFIG_FIELDS.forEach(key => { if (payload[key] !== undefined) data[key] = payload[key]; });
    if (Object.keys(data).length === 0) throw new UserError('没有可更新的字段');
    if (data.hostAvatar !== undefined && data.hostAvatar !== '' && !String(data.hostAvatar).startsWith(ctx.storage.publicUrl('host/'))) {
      throw new UserError('请通过后台上传主持人头像');
    }
    await ctx.db.update(COL.ACTIVITY, CONFIG_ID, data);
    return { message: '活动配置已保存' };
  },

  // 门类固定为三个（id 不变，报名与投票都按 id 记录），任何阶段都可以改名
  async renameCategory(ctx, { categoryId, name }) {
    if (!ctx.activity.categories.some(c => c.id === categoryId)) throw new UserError('门类不存在');
    const clean = typeof name === 'string' ? name.trim() : '';
    if (!clean || clean.length > 10) throw new UserError('门类名称需在 1-10 字之间');
    const categories = ctx.activity.categories.map(c => (c.id === categoryId ? { ...c, name: clean } : c));
    await ctx.db.update(COL.ACTIVITY, CONFIG_ID, { categories });
    return { message: '门类名已保存' };
  },

  async unbindUser(ctx, { ldap }) {
    const clean = typeof ldap === 'string' ? ldap.trim().toUpperCase() : '';
    if (!clean) throw new UserError('请输入要解绑的活动ID');
    if (!(await ctx.db.get(COL.USER, clean))) throw new UserError(`未找到活动ID ${clean} 的绑定记录`);
    await ctx.db.remove(COL.USER, clean);
    return { message: `已成功解绑活动ID ${clean}` };
  },

  async softDeleteEntry(ctx, { entryId }) {
    if (typeof entryId !== 'string' || !(await ctx.db.get(COL.ENTRY, entryId))) throw new UserError('报名不存在');
    await ctx.db.update(COL.ENTRY, entryId, { status: 'deleted' });
    return { message: '条目已软删除' };
  },

  async softDeleteCongrats(ctx, { msgId }) {
    if (typeof msgId !== 'string' || !(await ctx.db.get(COL.CONGRATS, msgId))) throw new UserError('贺词不存在');
    await ctx.db.update(COL.CONGRATS, msgId, { status: 'deleted' });
    return { message: '留言已隐藏' };
  },

  // 后台总览：数据看板 + 待审核的报名与贺词（管理员可见完整活动ID）
  async getOverview(ctx) {
    const entries = await ctx.db.query(COL.ENTRY, [['status', '==', 'active']]);
    const congrats = await ctx.db.query(COL.CONGRATS, [['status', '==', 'active']]);
    const initial = await ctx.db.query(COL.INITIAL, []);
    const finalVotes = await ctx.db.query(COL.FINAL_VOTE, []);

    const perCategory = ctx.activity.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      entryCount: entries.filter(e => e.categoryId === cat.id).length,
      initialVoterCount: initial.filter(s => s.categoryId === cat.id).length,
      finalVoterCount: new Set(finalVotes.filter(v => v.categoryId === cat.id).map(v => v.openid)).size
    }));

    return {
      stats: {
        totalEntries: entries.length,
        totalVoters: new Set([...initial.map(s => s.openid), ...finalVotes.map(v => v.openid)]).size,
        totalFinalVotes: finalVotes.length,
        totalCongrats: congrats.length,
        perCategory
      },
      entries: entries.map(e => ({
        id: e.id, categoryId: e.categoryId, petName: e.petName, photoUrl: e.photoUrl, ownerLdap: e.ownerLdap
      })),
      congrats: congrats.map(c => ({ id: c.id, content: c.content, ownerLdap: c.ownerLdap }))
    };
  }
};

/**
 * POST /admin/:action { ...payload }
 */
async function runAdmin(ctx, action) {
  if (!isAdmin(ctx.activity, ctx.openid)) throw new UserError('权限不足：仅限活动管理员操作', 403);
  const handler = Object.prototype.hasOwnProperty.call(actions, action) ? actions[action] : null;
  if (!handler) throw new UserError('未知管理员操作', 404);
  return handler(ctx, ctx.body || {});
}

module.exports = { runAdmin };
