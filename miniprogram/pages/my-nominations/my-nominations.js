const StorageService = require('../../utils/storage');

Page({
  data: {
    userLdap: '',
    entries: [],
    canNominate: false
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const user = StorageService.getUserBinding();
    if (!user) {
      wx.redirectTo({ url: '/pages/auth/auth' });
      return;
    }

    const catMap = {};
    StorageService.getCategories().forEach(c => { catMap[c.id] = c; });

    // 私密页面：本人可见各阶段票数与晋级情况
    const entries = StorageService.getMyNominations(user.ldap).map(e => {
      const cat = catMap[e.categoryId] || { name: e.categoryId, bg: '#FAC775', textColor: '#412402' };
      const progress = StorageService.getEntryProgress(e);
      return {
        ...e,
        categoryName: cat.name,
        catBg: cat.bg,
        catText: cat.textColor,
        phaseStatusTitle: progress.title,
        phaseStatusDetail: progress.detail,
        statusTone: progress.tone
      };
    });

    this.setData({
      userLdap: user.ldap,
      entries,
      canNominate: StorageService.isPhaseOpen('nominate')
    });
  },

  onGoNominate() {
    wx.navigateTo({ url: '/pages/nominate/nominate' });
  }
});
