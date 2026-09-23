const { validateLdap } = require('../../utils/validator');
const api = require('../../utils/api');

Page({
  data: {
    ldapInput: '',
    hasError: false,
    errorMessage: '',
    submitting: false
  },

  onInputLdap(e) {
    this.setData({
      ldapInput: e.detail.value,
      hasError: false,
      errorMessage: ''
    });
  },

  async onSubmitBinding() {
    if (this.data.submitting) return;
    const valResult = validateLdap(this.data.ldapInput);
    if (!valResult.valid) {
      this.setData({ hasError: true, errorMessage: valResult.message });
      return;
    }

    this.setData({ submitting: true });
    try {
      await getApp().ready;
      await api.bindUser(this.data.ldapInput.trim().toUpperCase());
      wx.showToast({ title: '绑定成功！', icon: 'success', duration: 1500 });
      setTimeout(() => {
        wx.navigateBack({
          fail: () => wx.reLaunch({ url: '/pages/index/index' })
        });
      }, 1200);
    } catch (e) {
      this.setData({ hasError: true, errorMessage: e.message || '绑定失败，请重试' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onContactAdmin() {
    const config = api.getState().config || {};
    wx.showModal({
      title: '申诉提示',
      content: `请联系活动组织者（${config.hostName || '管理员'}）并告知你的常用ID，核实后管理员会在后台为你解绑。`,
      showCancel: false,
      confirmText: '我知道了'
    });
  }
});
