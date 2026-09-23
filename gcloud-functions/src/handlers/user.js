/**
 * 登录、启动数据与活动ID绑定
 */
const { COL, publicConfig, isAdmin } = require('../activity');
const { signToken } = require('../token');
const { UserError } = require('../errors');

async function findBinding(db, openid) {
  const [binding] = await db.query(COL.USER, [['openid', '==', openid]]);
  return binding || null;
}

/**
 * 需要已绑定活动ID的操作调用：返回绑定记录
 */
async function requireBinding(ctx) {
  const binding = await findBinding(ctx.db, ctx.openid);
  if (!binding) throw new UserError('请先绑定活动ID');
  return binding;
}

async function bootstrap(ctx) {
  const binding = await findBinding(ctx.db, ctx.openid);
  return {
    config: publicConfig(ctx.activity),
    categories: ctx.activity.categories,
    user: binding ? { ldap: binding.ldap } : null,
    isAdmin: isAdmin(ctx.activity, ctx.openid)
  };
}

/**
 * POST /login { code } → { token, ...bootstrap }
 */
async function login(ctx) {
  const openid = await ctx.wx.code2Session(ctx.body.code);
  const token = signToken(openid, ctx.config.tokenSecret, ctx.config.tokenTtlHours);
  return { token, ...(await bootstrap({ ...ctx, openid })) };
}

/**
 * POST /bind { ldap }
 * 规则：仅字母、至少 2 位；一个微信只能绑定一个ID；ID 全局唯一（以ID作文档 ID，由数据库保证）
 */
async function bindUser(ctx) {
  const { ldap } = ctx.body;
  if (!ldap || typeof ldap !== 'string') throw new UserError('请输入活动ID');
  const clean = ldap.trim().toUpperCase();
  if (clean.length < 2) throw new UserError('活动ID长度至少为2位字母');
  if (!/^[A-Z]+$/.test(clean)) throw new UserError('活动ID仅支持英文字母，不能包含数字或特殊符号');

  const mine = await findBinding(ctx.db, ctx.openid);
  if (mine) {
    if (mine.ldap === clean) return { user: { ldap: clean } };
    throw new UserError(`你已绑定活动ID ${mine.ldap}，如需更换请联系管理员`);
  }

  const created = await ctx.db.commit([
    { type: 'create', col: COL.USER, id: clean, data: { openid: ctx.openid, ldap: clean, boundAt: Date.now() } }
  ]);
  if (!created) throw new UserError('该ID已被使用，如认为是误占用请联系管理员申诉');
  return { user: { ldap: clean } };
}

module.exports = { login, bootstrap, bindUser, requireBinding, findBinding };
