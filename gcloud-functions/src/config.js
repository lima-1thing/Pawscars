/**
 * 运行配置（全部来自环境变量；密钥类变量请通过 Secret Manager 注入）
 */
const REQUIRED = ['WX_APPID', 'WX_APPSECRET', 'TOKEN_SECRET', 'PHOTO_BUCKET', 'CRON_SECRET'];

function loadConfig(env = process.env) {
  const missing = REQUIRED.filter(key => !env[key]);
  if (missing.length > 0) {
    throw new Error(`缺少环境变量：${missing.join(', ')}`);
  }
  return {
    wxAppId: env.WX_APPID,
    wxAppSecret: env.WX_APPSECRET,
    tokenSecret: env.TOKEN_SECRET,
    photoBucket: env.PHOTO_BUCKET,
    cronSecret: env.CRON_SECRET,
    tokenTtlHours: Number(env.TOKEN_TTL_HOURS) || 24 * 30,
    // 网页测试版（可选）：设置邀请码后开放 /login/web；WEB_ORIGINS 为允许跨域访问的网页来源，逗号分隔
    webInviteCode: env.WEB_INVITE_CODE || '',
    // Google 账号登录（可选）：设置 OAuth 客户端 ID 后，网页版改用 Google 账号识别身份，匿名的 /login/web 停用
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    webOrigins: (env.WEB_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  };
}

module.exports = { loadConfig };
