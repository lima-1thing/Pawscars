const api = require('../../utils/api');
const { maskLdap } = require('../../utils/mask');
const { validateCongrats } = require('../../utils/validator');
const { formatDateTime } = require('../../utils/time');

const RANKS = [
  { key: 'champion', text: '冠军' },
  { key: 'runnerUp', text: '亚军' },
  { key: 'thirdPlace', text: '季军' }
];

const formatEntry = (e) => (e ? {
  ...e,
  maskedLdap: maskLdap(e.ownerLdap),
  scoreText: e.totalVotes !== undefined ? `${e.wins || 0} 胜 · ${e.totalVotes || 0} 票` : ''
} : null);

Page({
  data: {
    isAwardsPhase: false,
    canPreview: false,
    categories: [],
    currentCategory: null,
    awardsResult: null,
    resultState: 'loading', // loading | ready | empty | pending
    congratsList: [],
    hasSentCongrats: false,
    rulesModalVisible: false,
    certModalVisible: false,
    sendModalVisible: false,
    certEntry: null,
    certRankText: '冠军',
    myCongratsText: ''
  },

  onLoad(options) {
    this.focusCongrats = options && options.focus === 'congrats';
    this.initialCategoryId = options && options.cat;
  },

  async onShow() {
    try {
      await getApp().ready;
      await api.refresh();
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      return;
    }
    this.loadData();
    if (this.focusCongrats) {
      this.focusCongrats = false;
      setTimeout(() => {
        wx.pageScrollTo({ selector: '#congrats-wall', duration: 300 });
        if (this.data.isAwardsPhase && !this.data.hasSentCongrats) this.onOpenSendModal();
      }, 600);
    }
  },

  loadData() {
    const { config, categories } = api.getState();
    const preferredId = (this.data.currentCategory && this.data.currentCategory.id) || this.initialCategoryId;
    const currentCategory = categories.find(c => c.id === preferredId) || categories[0];
    this.setData({
      isAwardsPhase: config.currentPhase === 'awards',
      // 管理员可在颁奖前预览结果；普通用户颁奖开始后才能看到
      canPreview: getApp().canAccessAdmin(),
      categories,
      currentCategory
    }, () => {
      this.refreshCategoryResult();
      this.refreshCongrats();
    });
  },

  async refreshCategoryResult() {
    const { currentCategory } = this.data;
    if (!currentCategory) return;

    let result = null;
    try {
      result = await api.getAwards(currentCategory.id);
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    }
    // 切换门类期间返回的旧结果直接丢弃
    if (!this.data.currentCategory || this.data.currentCategory.id !== currentCategory.id) return;

    let resultState = 'ready';
    if (!result) resultState = 'pending';
    else if (result.isEmpty) resultState = 'empty';

    this.setData({
      resultState,
      awardsResult: result ? {
        champion: formatEntry(result.champion),
        runnerUp: formatEntry(result.runnerUp),
        thirdPlace: formatEntry(result.thirdPlace)
      } : null
    });
  },

  async refreshCongrats() {
    try {
      const { list, hasSent } = await api.getCongrats();
      this.setData({
        congratsList: list.map(item => ({
          ...item,
          maskedLdap: maskLdap(item.ownerLdap),
          timeStr: formatDateTime(item.createdAt)
        })),
        hasSentCongrats: hasSent
      });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  onSelectCategory(e) {
    const { id } = e.currentTarget.dataset;
    const cat = this.data.categories.find(c => c.id === id);
    if (cat) {
      this.setData({ currentCategory: cat, resultState: 'loading' }, () => this.refreshCategoryResult());
    }
  },

  openCertFor(rankKey) {
    const rank = RANKS.find(r => r.key === rankKey);
    const entry = this.data.awardsResult && this.data.awardsResult[rankKey];
    if (!rank || !entry) {
      wx.showToast({ title: '暂无该奖项获奖者', icon: 'none' });
      return;
    }
    this.setData({ certEntry: entry, certRankText: rank.text, certModalVisible: true });
  },

  // 点击领奖台上的获奖者，直接生成其证书
  onTapWinner(e) {
    this.openCertFor(e.currentTarget.dataset.rank);
  },

  // 主按钮：选择要生成证书的奖项
  onChooseCert() {
    const available = RANKS.filter(r => this.data.awardsResult && this.data.awardsResult[r.key]);
    if (available.length === 0) return;
    if (available.length === 1) {
      this.openCertFor(available[0].key);
      return;
    }
    wx.showActionSheet({
      itemList: available.map(r => `${r.text} · ${this.data.awardsResult[r.key].petName}`),
      success: (res) => this.openCertFor(available[res.tapIndex].key)
    });
  },

  onCloseCert() {
    this.setData({ certModalVisible: false });
  },

  onOpenSendModal() {
    if (!getApp().checkUserBinding()) return;
    if (this.data.hasSentCongrats) {
      wx.showToast({ title: '你已经发送过贺词啦', icon: 'none' });
      return;
    }
    this.setData({ sendModalVisible: true, myCongratsText: '' });
  },

  onCloseSendModal() {
    this.setData({ sendModalVisible: false });
  },

  onInputCongrats(e) {
    this.setData({ myCongratsText: e.detail.value });
  },

  async onSubmitCongrats() {
    if (this.sendingCongrats) return;
    const val = validateCongrats(this.data.myCongratsText);
    if (!val.valid) {
      wx.showToast({ title: val.message, icon: 'none' });
      return;
    }
    this.sendingCongrats = true;
    try {
      await api.submitCongrats(this.data.myCongratsText);
      wx.showToast({ title: '祝福已上墙！🎉', icon: 'success' });
      this.setData({ sendModalVisible: false });
      this.refreshCongrats();
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败', icon: 'none' });
    } finally {
      this.sendingCongrats = false;
    }
  },

  onOpenRules() {
    this.setData({ rulesModalVisible: true });
  },

  onCloseRules() {
    this.setData({ rulesModalVisible: false });
  },

  // 分享战报：带当前门类的冠军信息
  onShareAppMessage() {
    const { currentCategory, awardsResult } = this.data;
    const path = `/pages/awards/awards?cat=${currentCategory ? currentCategory.id : ''}`;
    const champion = awardsResult && awardsResult.champion;
    if (!champion) return { title: 'Pawscars 毛孩奥斯卡颁奖典礼', path };
    return { title: `【${currentCategory.name}】冠军是 ${champion.petName}！快来看 Pawscars 颁奖典礼`, path };
  },

  onShareTimeline() {
    return { title: 'Pawscars 毛孩奥斯卡颁奖典礼' };
  }
});
