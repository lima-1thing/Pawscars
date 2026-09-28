const api = require('../../utils/api');
const { maskLdap } = require('../../utils/mask');

const withMask = (p) => ({
  ...p,
  maskedLdapA: maskLdap(p.entryA.ownerLdap),
  maskedLdapB: maskLdap(p.entryB.ownerLdap)
});

Page({
  data: {
    phaseOpen: true,
    inFinal: true,
    categories: [],
    currentCategoryId: '',
    pairs: [],
    currentPair: null,
    currentIndex: 0,
    stageSubtitle: '决赛',
    selectedSide: null,
    submitting: false,
    viewState: 'loading', // loading | voting | completed | noMatches | notGenerated | closed
    rulesModalVisible: false
  },

  onLoad(options) {
    // 分享卡片带门类参数直达对应门类
    if (options && options.cat) this.setData({ currentCategoryId: options.cat });
  },

  async onShow() {
    try {
      await getApp().ready;
      await this.loadData();
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  async loadData() {
    await api.refresh();
    if (api.getState().config.currentPhase !== 'vote_final') {
      this.byCat = {};
      this.setData({ phaseOpen: false, inFinal: false, categories: api.getState().categories, viewState: 'closed', stageSubtitle: '决赛' });
      return;
    }

    const { phaseOpen, categories } = await api.getFinalState();
    // 本页缓存：各门类本人的决赛对局
    this.byCat = {};
    categories.forEach(c => { this.byCat[c.id] = c; });

    const tabs = this.buildTabs();
    const currentCategoryId = tabs.some(c => c.id === this.data.currentCategoryId)
      ? this.data.currentCategoryId
      : (tabs.find(c => c.remaining > 0) || tabs[0] || {}).id;

    this.setData({ phaseOpen, inFinal: true, categories: tabs, currentCategoryId }, () => this.showCategory());
  },

  // 门类标签上的投票进度：待投 x / 已投完 / 无需投票
  buildTabs() {
    return api.getState().categories.map(cat => {
      const data = this.byCat[cat.id];
      const pairs = data ? data.pairs : [];
      const remaining = pairs.filter(p => !p.myVote).length;
      let statusText = '已投完';
      if (pairs.length === 0) statusText = '无需投票';
      else if (remaining > 0) statusText = `待投 ${remaining}`;
      return { ...cat, remaining, statusText };
    });
  },

  showCategory() {
    const data = this.byCat[this.data.currentCategoryId];
    if (!data || !data.generated) {
      this.setData({ viewState: 'notGenerated', pairs: [], currentPair: null, stageSubtitle: '决赛' });
      return;
    }
    if (data.pairs.length === 0) {
      this.setData({ viewState: 'noMatches', pairs: [], currentPair: null, stageSubtitle: '决赛' });
      return;
    }

    // 从第一场未投的对局继续（支持中途退出后接着投）
    const nextIdx = data.pairs.findIndex(p => !p.myVote);
    if (nextIdx === -1 || !this.data.phaseOpen) {
      this.setData({
        viewState: nextIdx === -1 ? 'completed' : 'closed',
        pairs: data.pairs,
        currentPair: null,
        stageSubtitle: nextIdx === -1 ? '决赛 · 已完成' : '决赛 · 已截止'
      });
      return;
    }
    this.showPair(data.pairs, nextIdx);
  },

  showPair(pairs, idx) {
    this.setData({
      viewState: 'voting',
      pairs,
      currentIndex: idx,
      currentPair: withMask(pairs[idx]),
      selectedSide: null,
      stageSubtitle: `决赛 · 第 ${idx + 1}/${pairs.length} 场`
    });
  },

  onSwitchCategory(e) {
    const { id } = e.currentTarget.dataset;
    if (id === this.data.currentCategoryId) return;
    this.setData({ currentCategoryId: id }, () => this.showCategory());
  },

  async onChoosePet(e) {
    if (this.data.selectedSide || this.data.submitting) return; // 提交中或动效过渡中
    const { side } = e.currentTarget.dataset;
    const { currentPair, currentCategoryId } = this.data;
    if (!currentPair) return;

    this.setData({ submitting: true });
    try {
      await api.submitFinalVote(currentCategoryId, currentPair.index, side);
    } catch (err) {
      // 已投过：视为本场完成，直接进入下一场；其他错误：停留在本场并提示重试，避免"以为投了其实没成功"
      if (!/已投过/.test(err.message)) {
        this.setData({ submitting: false });
        wx.showModal({ title: '投票没有成功', content: `${err.message || '网络异常'}，请重试。`, showCancel: false, confirmText: '好的' });
        return;
      }
    }

    const data = this.byCat[currentCategoryId];
    data.pairs[this.data.currentIndex].myVote = side;
    // 选中动效：边框高亮 + 放大 + 打勾，随后自动跳下一场
    this.setData({ selectedSide: side, submitting: false });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });

    setTimeout(() => {
      this.setData({ categories: this.buildTabs() });
      const nextIdx = data.pairs.findIndex((p, i) => i > this.data.currentIndex && !p.myVote);
      if (nextIdx !== -1) {
        this.showPair(data.pairs, nextIdx);
      } else {
        this.setData({ viewState: 'completed', currentPair: null, selectedSide: null, stageSubtitle: '决赛 · 已完成' });
      }
    }, 650);
  },

  onNextCategory() {
    const { categories, currentCategoryId } = this.data;
    const next = categories.find(c => c.id !== currentCategoryId && c.remaining > 0);
    if (!next) {
      wx.showToast({ title: '所有门类都已投完啦！', icon: 'none' });
      return;
    }
    this.setData({ currentCategoryId: next.id }, () => this.showCategory());
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onOpenRules() {
    this.setData({ rulesModalVisible: true });
  },

  onCloseRules() {
    this.setData({ rulesModalVisible: false });
  },

  // "分享决赛拉票"按钮（open-type="share"）与右上角菜单共用
  onShareAppMessage() {
    const { currentPair, currentCategoryId } = this.data;
    const path = `/pages/vote-final/vote-final?cat=${currentCategoryId}`;
    if (!currentPair) return { title: 'Pawscars 决赛 PK 进行中，快来投票！', path };
    const share = { title: `【${currentPair.entryA.petName} VS ${currentPair.entryB.petName}】决赛火热进行中，帮忙投一票！`, path };
    // 分享封面只支持网络/本地图片；data: 地址交由微信默认截取当前页面
    if (/^(https?:|wxfile:)/.test(currentPair.entryA.photoUrl)) share.imageUrl = currentPair.entryA.photoUrl;
    return share;
  }
});
