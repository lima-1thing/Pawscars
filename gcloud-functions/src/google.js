/**
 * Google 账号登录：校验网页端 Google Identity Services 返回的 ID Token
 * https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */
const { OAuth2Client } = require('google-auth-library');
const { UserError } = require('./errors');

function createGoogleVerifier(clientId) {
  const client = new OAuth2Client(clientId);
  return {
    /**
     * @returns {Promise<{ sub: string, email: string }>} Google 账号的唯一 ID 与邮箱
     */
    async verify(credential) {
      if (!credential || typeof credential !== 'string') throw new UserError('Google 登录失败，请重试', 401);
      let payload;
      try {
        const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
        payload = ticket.getPayload();
      } catch (e) {
        throw new UserError('Google 登录已失效，请重新登录', 401);
      }
      if (!payload || !payload.sub) throw new UserError('Google 登录失败，请重试', 401);
      return { sub: payload.sub, email: payload.email_verified ? payload.email : '' };
    }
  };
}

module.exports = { createGoogleVerifier };
