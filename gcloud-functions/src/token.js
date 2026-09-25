/**
 * 登录令牌：base64url(payload).base64url(HMAC-SHA256)
 * payload = { openid, exp }；只在服务端签发与校验，前端无法伪造 openid
 */
const crypto = require('crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const hmac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest();

function signToken(openid, secret, ttlHours, now = Date.now()) {
  const payload = b64url(JSON.stringify({ openid, exp: now + ttlHours * 3600 * 1000 }));
  return `${payload}.${b64url(hmac(payload, secret))}`;
}

/**
 * @returns {string|null} 有效时返回 openid
 */
function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = hmac(payload, secret);
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const { openid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!openid || typeof exp !== 'number' || exp < now) return null;
    return openid;
  } catch (e) {
    return null;
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { signToken, verifyToken, safeEqual };
