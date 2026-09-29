const api = require('../../utils/api');

Page({
  data: {
    loaded: false,
    tabs: [],
    currentId: '',
    entries: [],
    total: 0,
    canNominate: false
  },

  async onShow() {
    try {
      await getApp().ready;
      const { categories } = await api.getGallery();
      this.byCat = {};
      categories.forEach(c => { this.byCat[c.id] = c.entries; });
      const tabs = api.getState().categories.map(c => ({ ...c, count: (this.byCat[c.id] || []).length }));
      const currentId = tabs.some(t => t.id === this.data.currentId) ? this.data.currentId : (tabs[0] || {}).id;
      this.setData({
        loaded: true,
        tabs,
        currentId,
        entries: this.byCat[currentId] || [],
        total: tabs.reduce((sum, t) => sum + t.count, 0),
        canNominate: api.isPhaseOpen('nominate')
      });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  onSwitchTab(e) {
    const { id } = e.currentTarget.dataset;
    this.setData({ currentId: id, entries: this.byCat[id] || [] });
  },

  // 点击放大查看，可左右滑动浏览本门类其他照片
  onPreview(e) {
    const { index } = e.currentTarget.dataset;
    const urls = this.data.entries.map(item => item.photoUrl);
    wx.previewImage({ urls, current: urls[index] });
  },

  onGoNominate() {
    if (!getApp().checkUserBinding()) return;
    wx.navigateTo({ url: '/pages/nominate/nominate' });
  },

  onShareAppMessage() {
    return { title: `Pawscars 已有 ${this.data.total} 只毛孩报名，快来看看！`, path: '/pages/gallery/gallery' };
  }
});
