/**
 * 贺词：颁奖阶段开放，每人限发 1 条（以 openid 作文档 ID；被管理员隐藏后也不可重发）
 */
const { COL } = require('../activity');
const { requireBinding } = require('./user');
const { UserError } = require('../errors');

async function submitCongrats(ctx) {
  const binding = await requireBinding(ctx);
  const { content } = ctx.body;
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) throw new UserError('请输入祝贺内容');
  if (text.length > 50) throw new UserError('贺词内容限 50 字以内');
  if (ctx.activity.currentPhase !== 'awards') throw new UserError('颁奖典礼开始后才能发送贺词');

  const ok = await ctx.db.commit([{
    type: 'create',
    col: COL.CONGRATS,
    id: ctx.openid,
    data: { openid: ctx.openid, ownerLdap: binding.ldap, content: text, status: 'active', createdAt: Date.now() }
  }]);
  if (!ok) throw new UserError('每位用户仅限发送 1 条贺词');
  return { message: '贺词发表成功' };
}

module.exports = { submitCongrats };
