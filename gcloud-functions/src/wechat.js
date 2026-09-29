/**
 * 微信登录：用 wx.login 的临时 code 换取 openid
 * https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html
 */
const { UserError } = require('./errors');

function createWxClient({ wxAppId, wxAppSecret }, fetchImpl = fetch) {
  return {
    async code2Session(code) {
      if (!code || typeof code !== 'string') throw new UserError('登录失败，请重试', 401);
      const url = 'https://api.weixin.qq.com/sns/jscode2session'
        + `?appid=${encodeURIComponent(wxAppId)}`
        + `&secret=${encodeURIComponent(wxAppSecret)}`
        + `&js_code=${encodeURIComponent(code)}`
        + '&grant_type=authorization_code';
      const res = await fetchImpl(url);
      const body = await res.json();
      if (!body.openid) {
        console.warn('code2Session failed', body.errcode, body.errmsg);
        throw new UserError('微信登录失败，请重新打开小程序', 401);
      }
      return body.openid;
    }
  };
}

module.exports = { createWxClient };
