const StorageService = require('../../utils/storage');

Page({
  data: {
    config: null,
    categories: [],
    currentPhaseText: '',
    currentLdap: '',
    totalEntries: 0,
    totalInitialVotes: 0,
    totalCongrats: 0,
    categoryStats: [],
    entriesSample: []
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const config = StorageService.getConfig();
    const categories = StorageService.getCategories();
    const user = StorageService.getUserBinding();
    const allEntries = StorageService.getEntries();
    const initialVotes = StorageService.getInitialVotesForUser() ? 1 : 0;
    const congrats = StorageService.getCongrats();

    const phaseMap = {
      nominate: '1. 报名期',
      vote_initial: '2. 初选划屏',
      vote_match_8: '3. 8进4淘汰赛',
      vote_match_4: '4. 4强德比循环赛',
      awards: '5. 颁奖盛典'
    };

    const categoryStats = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      count: allEntries.filter(e => e.categoryId === cat.id && e.status !== 'deleted').length
    }));

    this.setData({
      config,
      categories,
      currentPhaseText: phaseMap[config.currentPhase] || config.currentPhase,
      currentLdap: user ? user.ldap : '',
      totalEntries: allEntries.filter(e => e.status !== 'deleted').length,
      totalInitialVotes: 12, // 模拟活跃票数
      totalCongrats: congrats.length,
      categoryStats,
      entriesSample: allEntries.filter(e => e.status !== 'deleted').slice(0, 10)
    });
  },

  onChangePhase(e) {
    const { phase } = e.currentTarget.dataset;
    const updated = StorageService.setPhase(phase);
    wx.showToast({
      title: '阶段已推进',
      icon: 'success'
    });
    this.loadData();
  },

  onSwitchId(e) {
    const { id } = e.currentTarget.dataset;
    StorageService.bindUser(id);
    const app = getApp();
    app.globalData.userBinding = { ldap: id, openid: `user_${id.toLowerCase()}` };
    wx.showToast({ title: `已切换为 ${id}`, icon: 'success' });
    this.loadData();
  },

  onUnbindCurrent() {
    StorageService.unbindUser();
    const app = getApp();
    app.globalData.userBinding = null;
    wx.showToast({ title: '已解绑当前身份', icon: 'none' });
    this.loadData();
  },

  onEditCategoryName(e) {
    const { id } = e.currentTarget.dataset;
    const newName = e.detail.value.trim();
    if (!newName) return;

    const cats = this.data.categories.map(c => {
      if (c.id === id) {
        return { ...c, name: newName };
      }
      return c;
    });

    StorageService.saveCategories(cats);
    this.setData({ categories: cats });
    wx.showToast({ title: '门类名已保存', icon: 'success' });
  },

  onDeleteEntry(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '是否确认软删除该毛孩报名条目？',
      success: (res) => {
        if (res.confirm) {
          StorageService.deleteEntry(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadData();
        }
      }
    });
  },

  onResetAll() {
    wx.showModal({
      title: '警告',
      content: '将清空所有投票记录并重置为初始状态，确认重置？',
      success: (res) => {
        if (res.confirm) {
          StorageService.resetAll();
          wx.showToast({ title: '已重置数据', icon: 'success' });
          this.loadData();
        }
      }
    });
  }
});
