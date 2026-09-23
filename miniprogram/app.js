/**
 * Pawscars 小程序全局入口
 */
const StorageService = require('./utils/storage');

App({
  onLaunch() {
    console.log('Pawscars 小程序已启动');
    
    // 初始化云开发环境（如支持）
    if (typeof wx !== 'undefined' && wx.cloud) {
      try {
        wx.cloud.init({
          env: 'pawscars-env',
          traceUser: true
        });
      } catch (e) {
        console.log('云开发未初始化或环境未配置，已无缝启用本地 Mock 存储服务');
      }
    }

    // 初始化全局配置与用户状态
    this.globalData = {
      config: StorageService.getConfig(),
      userBinding: StorageService.getUserBinding(),
      isAdmin: StorageService.isAdmin()
    };
  },

  /**
   * 是否为开发版/体验版：模拟身份切换、数据重置等调试工具只在这里开放
   */
  isDevBuild() {
    try {
      const { envVersion } = wx.getAccountInfoSync().miniProgram;
      return envVersion === 'develop' || envVersion === 'trial';
    } catch (e) {
      return false;
    }
  },

  /**
   * 可进入管理后台：openid 白名单管理员，或开发/体验版调试
   */
  canAccessAdmin() {
    return StorageService.isAdmin() || this.isDevBuild();
  },

  checkUserBinding(redirect = true) {
    const binding = StorageService.getUserBinding();
    if (!binding) {
      if (redirect) {
        wx.navigateTo({
          url: '/pages/auth/auth'
        });
      }
      return false;
    }
    this.globalData.userBinding = binding;
    this.globalData.isAdmin = StorageService.isAdmin();
    return true;
  },

  globalData: {
    config: null,
    userBinding: null,
    isAdmin: false
  }
});
