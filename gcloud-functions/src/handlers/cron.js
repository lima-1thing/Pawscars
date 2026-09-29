/**
 * 定时任务入口（Cloud Scheduler 调用）：到截止时间自动推进阶段
 * 需在请求头 X-Cron-Secret 中携带 CRON_SECRET
 */
const { advanceIfDue } = require('../settlement');
const { safeEqual } = require('../token');
const { UserError } = require('../errors');

async function advancePhase(ctx) {
  if (!safeEqual(ctx.req.get('x-cron-secret'), ctx.config.cronSecret)) {
    throw new UserError('forbidden', 403);
  }
  const advancedTo = await advanceIfDue(ctx.db, ctx.activity);
  return { advancedTo };
}

module.exports = { advancePhase };
