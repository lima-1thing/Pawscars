const api = require('../../utils/api');

Page({
  data: {
    loaded: false,
    userLdap: '',
    entries: [],
    canNominate: false
  },

  async onShow() {
    try {
      await getApp().ready;
    } catch (e) {
      return;
    }
    const { user, categories } = api.getState();
    if (!user) {
      wx.redirectTo({ url: '/pages/auth/auth' });
      return;
    }

    let raw = [];
    try {
      raw = await api.getMyNominations();
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }

    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c; });

    // 私密页面：本人可见各阶段票数与晋级情况
    const entries = raw.map(e => {
      const cat = catMap[e.categoryId] || { name: e.categoryId, bg: '#FAC775', textColor: '#412402' };
      return {
        ...e,
        categoryName: cat.name,
        catBg: cat.bg,
        catText: cat.textColor,
        phaseStatusTitle: e.progress.title,
        phaseStatusDetail: e.progress.detail,
        statusTone: e.progress.tone
      };
    });

    this.setData({
      loaded: true,
      userLdap: user.ldap,
      entries,
      canNominate: api.isPhaseOpen('nominate')
    });
  },

  onGoNominate() {
    wx.navigateTo({ url: '/pages/nominate/nominate' });
  }
});
