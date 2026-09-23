/**
 * Pawscars 小程序全局入口
 */
const api = require('./utils/api');

App({
  onLaunch() {
    // 页面在 onShow 中 await app.ready，确保配置与身份已加载
    this.ready = api.init()
      .then(state => {
        this.globalData.mode = api.getMode();
        return state;
      })
      .catch(err => {
        console.error('初始化失败', err);
        wx.showModal({
          title: '加载失败',
          content: '活动数据加载失败，请检查网络后重新打开小程序。',
          showCancel: false
        });
        throw err;
      });
    // 避免未处理的 Promise 拒绝警告；页面自己 await 时仍会收到错误
    this.ready.catch(() => {});
  },

  /**
   * 是否为开发版/体验版：身份切换、数据重置等调试工具只在这里开放
   */
  isDevBuild() {
    return api.isDevBuild();
  },

  /**
   * 可进入管理后台：openid 白名单管理员，或开发/体验版调试
   */
  canAccessAdmin() {
    return api.getState().isAdmin || this.isDevBuild();
  },

  /**
   * 未绑定活动ID时跳转绑定页
   */
  checkUserBinding(redirect = true) {
    if (api.getState().user) return true;
    if (redirect) wx.navigateTo({ url: '/pages/auth/auth' });
    return false;
  },

  globalData: {
    mode: 'mock'
  }
});
