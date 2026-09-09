const StorageService = require('../../utils/storage');

Page({
  data: {
    config: null,
    categories: [],
    rulesModalVisible: false,
    clickCount: 0
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const config = StorageService.getConfig();
    const categories = StorageService.getCategories();
    this.setData({
      config,
      categories
    });
  },

  onShowRules() {
    this.setData({ rulesModalVisible: true });
  },

  onCloseRules() {
    this.setData({ rulesModalVisible: false });
  },

  onTapNominate() {
    const app = getApp();
    if (!app.checkUserBinding()) return;
    wx.navigateTo({
      url: '/pages/nominate/nominate'
    });
  },

  onTapVote() {
    const app = getApp();
    if (!app.checkUserBinding()) return;

    const { currentPhase } = this.data.config;
    if (currentPhase === 'vote_initial') {
      wx.navigateTo({
        url: '/pages/vote-initial/vote-initial'
      });
    } else {
      wx.navigateTo({
        url: '/pages/vote-match/vote-match'
      });
    }
  },

  onTapAwards() {
    wx.navigateTo({
      url: '/pages/awards/awards'
    });
  },

  onTapMyNomination() {
    const app = getApp();
    if (!app.checkUserBinding()) return;
    wx.navigateTo({
      url: '/pages/my-nominations/my-nominations'
    });
  },

  onTapAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin'
    });
  },

  // 连续点击标题进入管理后台彩蛋
  onTitleClick() {
    const count = this.data.clickCount + 1;
    this.setData({ clickCount: count });
    if (count >= 3) {
      this.setData({ clickCount: 0 });
      this.onTapAdmin();
    }
  }
});
