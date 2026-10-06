/**
 * 页面底部的快捷入口：我的提名 / 活动规则（原先挤在顶栏里）
 * 点"活动规则"时向页面发出 openRules 事件，由页面打开规则弹窗
 */
Component({
  options: { addGlobalClass: true },

  properties: {
    showMyNomination: { type: Boolean, value: true },
    showRules: { type: Boolean, value: true }
  },

  methods: {
    onTapMyNomination() {
      wx.navigateTo({ url: '/pages/my-nominations/my-nominations' });
    },
    onTapRules() {
      this.triggerEvent('openRules');
    }
  }
});
