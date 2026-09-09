Component({
  properties: {
    title: {
      type: String,
      value: 'Pawscars毛孩奥斯卡'
    },
    subtitle: {
      type: String,
      value: ''
    },
    showMyNomination: {
      type: Boolean,
      value: true
    },
    showBack: {
      type: Boolean,
      value: false
    },
    showRules: {
      type: Boolean,
      value: true
    }
  },

  methods: {
    onTapMyNomination() {
      wx.navigateTo({
        url: '/pages/my-nominations/my-nominations'
      });
    },
    onTapBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: '/pages/index/index' });
        }
      });
    },
    onTapRules() {
      const app = getApp();
      if (app && app.showRulesModal) {
        app.showRulesModal();
      } else {
        this.triggerEvent('openRules');
      }
    }
  }
});
