/**
 * 登录、启动数据与活动ID绑定
 */
const { COL, publicConfig, isAdmin } = require('../activity');
const crypto = require('crypto');
const { signToken, verifyToken, safeEqual } = require('../token');
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
  const [google] = await ctx.db.query(COL.GOOGLE, [['openid', '==', ctx.openid]]);
  return {
    config: publicConfig(ctx.activity),
    categories: ctx.activity.categories,
    user: binding ? { ldap: binding.ldap } : null,
    isAdmin: isAdmin(ctx.activity, ctx.openid),
    // 网页版：当前身份关联的 Google 账号（仅本人可见）
    googleEmail: google ? (google.email || 'linked') : null
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
 * POST /login/web { inviteCode } → { token, ...bootstrap }
 * 网页测试版匿名登录：凭邀请码为该浏览器生成一个独立身份（web_ 开头）。
 * 开启 Google 登录后停用，避免换个浏览器就能得到新身份重复投票（已发出的令牌仍可用于关联 Google 账号）。
 */
async function loginWeb(ctx) {
  const code = ctx.config.webInviteCode;
  if (!code) throw new UserError('网页版未开放', 403);
  if (ctx.config.googleClientId) throw new UserError('请使用 Google 账号登录', 410);
  if (!safeEqual(String(ctx.body.inviteCode || '').trim(), code)) throw new UserError('邀请码不正确', 401);
  const openid = `web_${crypto.randomBytes(12).toString('hex')}`;
  const token = signToken(openid, ctx.config.tokenSecret, ctx.config.tokenTtlHours);
  return { token, ...(await bootstrap({ ...ctx, openid })) };
}

/**
 * POST /login/google { credential, inviteCode? } （可带 Authorization: 已有的网页身份令牌）
 * - 已关联过的 Google 账号：直接登录到原来的身份（任何设备都是同一个人）
 * - 首次使用的 Google 账号：
 *   · 浏览器里已有网页身份（带有效令牌）→ 把 Google 账号关联到这个身份，活动ID、报名、投票、管理员权限都保留；
 *   · 否则需要邀请码，创建新身份 google_<sub>
 * 一个 Google 账号只对应一个身份，一个身份也只能关联一个 Google 账号。
 */
async function loginGoogle(ctx) {
  const { webInviteCode, googleClientId, tokenSecret, tokenTtlHours } = ctx.config;
  if (!googleClientId) throw new UserError('未开启 Google 登录', 403);
  const google = await ctx.google.verify(ctx.body.credential);
  const linkId = `google_${google.sub}`;

  let link = await ctx.db.get(COL.GOOGLE, linkId);
  if (!link) {
    const header = ctx.req.get('authorization') || '';
    const existing = header.startsWith('Bearer ') ? verifyToken(header.slice(7), tokenSecret) : null;
    let openid;
    if (existing && !existing.startsWith('google_')) {
      const [other] = await ctx.db.query(COL.GOOGLE, [['openid', '==', existing]]);
      if (other) throw new UserError('当前身份已关联了另一个 Google 账号，请用那个账号登录');
      openid = existing;
    } else {
      if (!webInviteCode || !safeEqual(String(ctx.body.inviteCode || '').trim(), webInviteCode)) {
        throw new UserError('第一次参加请先输入邀请码', 401);
      }
      openid = linkId;
    }
    await ctx.db.commit([{ type: 'create', col: COL.GOOGLE, id: linkId, data: { openid, email: google.email, linkedAt: Date.now() } }]);
    link = await ctx.db.get(COL.GOOGLE, linkId); // 并发时以先写入的为准
  }

  const token = signToken(link.openid, tokenSecret, tokenTtlHours);
  return { token, ...(await bootstrap({ ...ctx, openid: link.openid })) };
}

/**
 * POST /bind { ldap }
 * 规则：英文字母开头、只含字母和数字、2-20 位（与前端 validateLdap 一致）；
 *       一个微信只能绑定一个ID；ID 全局唯一（以ID作文档 ID，由数据库保证）
 */
async function bindUser(ctx) {
  const { ldap } = ctx.body;
  if (!ldap || typeof ldap !== 'string') throw new UserError('请输入活动ID');
  const clean = ldap.trim().toUpperCase();
  if (clean.length < 2 || clean.length > 20) throw new UserError('活动ID需为 2-20 位');
  if (!/^[A-Z][A-Z0-9]*$/.test(clean)) throw new UserError('活动ID需以英文字母开头，只能包含字母和数字');

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

module.exports = { login, loginWeb, loginGoogle, bootstrap, bindUser, requireBinding, findBinding };
