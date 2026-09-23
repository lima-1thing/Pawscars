const { validateLdap } = require('../../utils/validator');
const StorageService = require('../../utils/storage');

Page({
  data: {
    ldapInput: '',
    hasError: false,
    errorMessage: ''
  },

  onInputLdap(e) {
    this.setData({
      ldapInput: e.detail.value,
      hasError: false,
      errorMessage: ''
    });
  },

  onSubmitBinding() {
    const { ldapInput } = this.data;
    const valResult = validateLdap(ldapInput);
    if (!valResult.valid) {
      this.setData({
        hasError: true,
        errorMessage: valResult.message
      });
      return;
    }

    const cleanLdap = ldapInput.trim().toUpperCase();

    // 检查是否已被其他人绑定
    const currentBinding = StorageService.getUserBinding();
    if (currentBinding && currentBinding.ldap === cleanLdap) {
      wx.showToast({ title: '已成功绑定', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
      return;
    }

    try {
      StorageService.bindUser(cleanLdap);
      const app = getApp();
      app.globalData.userBinding = { ldap: cleanLdap, openid: `user_${cleanLdap.toLowerCase()}` };

      wx.showToast({
        title: '绑定成功！',
        icon: 'success',
        duration: 1500
      });

      setTimeout(() => {
        wx.navigateBack({
          fail: () => {
            wx.redirectTo({ url: '/pages/index/index' });
          }
        });
      }, 1200);
    } catch (e) {
      this.setData({
        hasError: true,
        errorMessage: '该ID已被使用，如认为是误占用请联系管理员申诉'
      });
    }
  },

  onContactAdmin() {
    wx.showModal({
      title: '申诉提示',
      content: `请联系活动组织者（${StorageService.getConfig().hostName || '管理员'}）并告知你的常用ID，核实后管理员会在后台为你解绑。`,
      showCancel: false,
      confirmText: '我知道了'
    });
  }
});
