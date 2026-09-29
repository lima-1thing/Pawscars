/**
 * HTTP 路由（单个 Cloud Function 入口）
 * 所有接口返回 { success: true, data } 或 { success: false, message }
 *
 *   POST /login               { code }                  无需登录
 *   POST /bootstrap
 *   POST /bind                { ldap }
 *   POST /data/:query         initialState | matchState | myNominations | awards | congrats
 *   POST /nominate            { petName, photoUrl, categoryIds, pledged }
 *   POST /nominate/photo      { entryId, photoUrl }
 *   POST /vote                { voteType, ... }
 *   POST /congrats            { content }
 *   POST /upload              multipart/form-data: file, folder
 *   POST /admin/:action       { ...payload }
 *   POST /cron/advance-phase  X-Cron-Secret 头            无需登录
 * 除标注外，均需 Authorization: Bearer <token>（由 /login 签发）
 */
const { loadConfig } = require('./activity');
const { verifyToken } = require('./token');
const { UserError } = require('./errors');
const user = require('./handlers/user');
const nominations = require('./handlers/nominations');
const votes = require('./handlers/votes');
const congrats = require('./handlers/congrats');
const reads = require('./handlers/reads');
const { runAdmin } = require('./handlers/admin');
const { uploadPhoto } = require('./handlers/upload');
const { advancePhase } = require('./handlers/cron');

const READ_QUERIES = ['initialState', 'matchState', 'myNominations', 'awards', 'congrats'];

const ROUTES = {
  '/login': { handler: user.login, public: true },
  '/bootstrap': { handler: user.bootstrap },
  '/bind': { handler: user.bindUser },
  '/nominate': { handler: nominations.create },
  '/nominate/photo': { handler: nominations.updatePhoto },
  '/vote': { handler: votes.submitVote },
  '/congrats': { handler: congrats.submitCongrats },
  '/upload': { handler: uploadPhoto },
  '/cron/advance-phase': { handler: advancePhase, public: true }
};

function resolveRoute(path) {
  if (ROUTES[path]) return ROUTES[path];
  const data = path.match(/^\/data\/(\w+)$/);
  if (data && READ_QUERIES.includes(data[1])) return { handler: reads[data[1]] };
  const admin = path.match(/^\/admin\/(\w+)$/);
  if (admin) return { handler: (ctx) => runAdmin(ctx, admin[1]) };
  return null;
}

function bearerToken(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

/**
 * @param {object} deps { db, storage, wx, config }
 */
function createApp(deps) {
  return async function api(req, res) {
    const send = (status, body) => res.status(status).json(body);

    if (req.method !== 'POST') return send(405, { success: false, message: 'Method Not Allowed' });
    const route = resolveRoute(req.path);
    if (!route) return send(404, { success: false, message: '接口不存在' });

    let openid = null;
    if (!route.public) {
      openid = verifyToken(bearerToken(req), deps.config.tokenSecret);
      if (!openid) return send(401, { success: false, message: '登录已过期，请重新打开小程序', code: 'UNAUTHORIZED' });
    }

    try {
      const ctx = {
        ...deps,
        req,
        openid,
        body: (req.body && typeof req.body === 'object') ? req.body : {},
        activity: await loadConfig(deps.db)
      };
      const data = await route.handler(ctx);
      return send(200, { success: true, data });
    } catch (e) {
      if (e instanceof UserError) {
        return send(e.status, { success: false, message: e.message });
      }
      console.error(`[${req.path}]`, e);
      return send(500, { success: false, message: '服务器开小差了，请稍后重试' });
    }
  };
}

module.exports = { createApp };
