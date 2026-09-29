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
    tokenTtlHours: Number(env.TOKEN_TTL_HOURS) || 24 * 30
  };
}

module.exports = { loadConfig };
