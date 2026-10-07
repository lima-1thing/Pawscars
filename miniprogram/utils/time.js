/**
 * Pawscars 时间展示工具
 */

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

module.exports = {
  formatCountdown,
  formatDateTime,
  toPickerValues,
  fromPickerValues
};
