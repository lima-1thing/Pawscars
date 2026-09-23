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
    const config = StorageService.getConfig();
    const adminList = (config.adminOpenids || []).map(id => (id || '').toUpperCase());
    const isAdmin = userBinding && userBinding.ldap && adminList.includes(userBinding.ldap.toUpperCase());

    this.globalData = {
      config,
      userBinding,
      isAdmin: !!isAdmin,
      rulesModalVisible: false
    };
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
    return true;
  },

  showRulesModal() {
    const pages = getCurrentPages();
    const curPage = pages[pages.length - 1];
    if (curPage) {
      curPage.setData({ rulesModalVisible: true });
    }
  },

  globalData: {
    config: null,
    userBinding: null,
    isAdmin: false,
    rulesModalVisible: false
  }
});
