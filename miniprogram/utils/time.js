/**
 * Pawscars 时间展示工具
 */
const { PHASE_ORDER, isPhaseOpen } = require('./bracket');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 距截止的剩余时间文案，如 "3 天 12 小时"、"5 小时 20 分钟"
 * @param {number} deadline 截止时间戳（毫秒）；0 表示未设置
 * @param {number} now
 * @returns {string} 未设置返回空字符串，已过期返回 "已截止"
 */
function formatCountdown(deadline, now = Date.now()) {
  if (!deadline) return '';
  const left = deadline - now;
  if (left <= 0) return '已截止';
  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / HOUR);
  const minutes = Math.floor((left % HOUR) / MINUTE);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${Math.max(minutes, 1)} 分钟`;
}

const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

/**
 * "9月22日 14:05"；跨年时带年份
 */
function formatDateTime(ts, now = Date.now()) {
  if (!ts) return '';
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const date = `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${sameYear ? '' : `${d.getFullYear()}年`}${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * picker 组件使用的 "YYYY-MM-DD" 与 "HH:mm"
 */
function toPickerValues(ts) {
  const d = ts ? new Date(ts) : new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

function fromPickerValues(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

const shortDate = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const SCHEDULE = [
  { key: 'nominate', label: '提名', active: '提名进行中', done: '提名已结束' },
  { key: 'vote_initial', label: '初选', active: '投票进行中', done: '投票已结束' },
  { key: 'vote_final', label: '决赛', active: '投票进行中', done: '投票已结束' }
];

/**
 * 首页赛程：每个赛段的日期与状态，如 { label: '初选', dates: '10/21-10/23', status: '投票进行中', state: 'active' }
 * 赛段开始 = 上一赛段截止（提名取 nominateStart）；截止在 0 点时结束日显示前一天
 * @param {object} config 活动配置（currentPhase、phaseDeadlines、nominateStart）
 * @returns {Array<{ key, label, dates, status, state: 'done'|'active'|'upcoming' }>}
 */
function buildSchedule(config, now = Date.now()) {
  const deadlines = (config && config.phaseDeadlines) || {};
  const current = PHASE_ORDER.indexOf(config && config.currentPhase);
  return SCHEDULE.map((s, i) => {
    const start = i === 0 ? (config && config.nominateStart) || 0 : deadlines[SCHEDULE[i - 1].key] || 0;
    const end = deadlines[s.key] || 0;
    let dates = '时间待定';
    if (start && end) dates = `${shortDate(start)}-${shortDate(end - 1)}`;
    else if (end) dates = `截至 ${shortDate(end - 1)}`;
    else if (start) dates = `${shortDate(start)} 起`;

    const idx = PHASE_ORDER.indexOf(s.key);
    let state = 'upcoming';
    let status = '赛段未开始';
    if (idx < current) {
      state = 'done';
      status = s.done;
    } else if (idx === current) {
      state = 'active';
      status = isPhaseOpen(config, s.key, now) ? s.active : '已截止，等待结算';
    }
    return { key: s.key, label: s.label, dates, status, state };
  });
}

module.exports = {
  buildSchedule,
  formatCountdown,
  formatDateTime,
  toPickerValues,
  fromPickerValues
};
