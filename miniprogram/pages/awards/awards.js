const StorageService = require('../../utils/storage');
const { maskLdap } = require('../../utils/mask');
const { validateCongrats } = require('../../utils/validator');

Page({
  data: {
    categories: [],
    currentCategory: null,
    awardsResult: null,
    congratsList: [],
    rulesModalVisible: false,
    certModalVisible: false,
    sendModalVisible: false,
    certEntry: null,
    certRankText: '冠军',
    myCongratsText: ''
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const categories = StorageService.getCategories();
    const currentCategory = this.data.currentCategory || categories[0];
    this.setData({
      categories,
      currentCategory
    }, () => {
      this.refreshCategoryResult();
      this.refreshCongrats();
    });
  },

  refreshCategoryResult() {
    const { currentCategory } = this.data;
    if (!currentCategory) return;

    const result = StorageService.getAwardsResult(currentCategory.id);
    // 处理打码
    const formatEntry = (e) => e ? { ...e, maskedLdap: maskLdap(e.ownerLdap) } : null;

    this.setData({
      awardsResult: {
        champion: formatEntry(result.champion),
        runnerUp: formatEntry(result.runnerUp),
        thirdPlace: formatEntry(result.thirdPlace),
        fourthPlace: formatEntry(result.fourthPlace)
      }
    });
  },

  refreshCongrats() {
    const rawList = StorageService.getCongrats();
    const congratsList = rawList.map(item => ({
      ...item,
      maskedLdap: maskLdap(item.ownerLdap),
      timeStr: new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));
    this.setData({ congratsList });
  },

  onSelectCategory(e) {
    const { id } = e.currentTarget.dataset;
    const cat = this.data.categories.find(c => c.id === id);
    if (cat) {
      this.setData({ currentCategory: cat }, () => {
        this.refreshCategoryResult();
      });
    }
  },

  onOpenCert(e) {
    const { rank } = e.currentTarget.dataset;
    const { awardsResult } = this.data;
    if (!awardsResult) return;

    let entry = awardsResult.champion;
    let rankText = '冠军';
    if (rank === 'runnerUp') {
      entry = awardsResult.runnerUp;
      rankText = '亚军';
    } else if (rank === 'thirdPlace') {
      entry = awardsResult.thirdPlace;
      rankText = '季军';
    }

    if (!entry) {
      wx.showToast({ title: '暂无该奖项获奖者', icon: 'none' });
      return;
    }

    this.setData({
      certEntry: entry,
      certRankText: rankText,
      certModalVisible: true
    });
  },

  onCloseCert() {
    this.setData({ certModalVisible: false });
  },

  onOpenSendModal() {
    const app = getApp();
    if (!app.checkUserBinding()) return;
    this.setData({ sendModalVisible: true, myCongratsText: '' });
  },

  onCloseSendModal() {
    this.setData({ sendModalVisible: false });
  },

  onInputCongrats(e) {
    this.setData({ myCongratsText: e.detail.value });
  },

  onSubmitCongrats() {
    const { myCongratsText } = this.data;
    const val = validateCongrats(myCongratsText);
    if (!val.valid) {
      wx.showToast({ title: val.message, icon: 'none' });
      return;
    }

    try {
      StorageService.submitCongrats(myCongratsText);
      wx.showToast({ title: '祝福已上墙！🎉', icon: 'success' });
      this.setData({ sendModalVisible: false });
      this.refreshCongrats();
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败', icon: 'none' });
    }
  },

  onOpenRules() {
    this.setData({ rulesModalVisible: true });
  },

  onCloseRules() {
    this.setData({ rulesModalVisible: false });
  }
});
