const api = require('../../utils/api');
const { maskLdap } = require('../../utils/mask');

const PHASE_STAGE = {
  vote_match_8: api.STAGE_KNOCKOUT,
  vote_match_4: api.STAGE_DERBY
};

const withMask = (m) => ({
  ...m,
  maskedLdapA: maskLdap(m.entryA.ownerLdap),
  maskedLdapB: maskLdap(m.entryB.ownerLdap)
});

Page({
  data: {
    stage: '',
    phaseOpen: true,
    categories: [],
    currentCategoryId: '',
    matches: [],
    currentMatch: null,
    currentMatchIndex: 0,
    stageSubtitle: '',
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
    const stage = PHASE_STAGE[api.getState().config.currentPhase] || '';
    if (!stage) {
      this.byCategory = {};
      this.setData({ stage, phaseOpen: false, categories: api.getState().categories }, () => this.loadCategoryMatches());
      return;
    }

    const { phaseOpen, categories } = await api.getMatchState(stage);
    // 本页缓存：各门类对阵与本人投票记录
    this.byCategory = {};
    categories.forEach(c => { this.byCategory[c.id] = c; });

    const tabs = this.buildTabs(stage);
    const currentCategoryId = tabs.some(c => c.id === this.data.currentCategoryId)
      ? this.data.currentCategoryId
      : (tabs.find(c => c.remaining > 0) || tabs[0] || {}).id;

    this.setData({ stage, phaseOpen, categories: tabs, currentCategoryId }, () => this.loadCategoryMatches());
  },

  // 门类标签上的投票进度：待投 x / 已投完 / 无需投票
  buildTabs(stage) {
    return api.getState().categories.map(cat => {
      const data = this.byCategory[cat.id];
      if (!stage || !data) return { ...cat, remaining: 0, statusText: '' };
      const remaining = data.matches.filter(m => !data.myVotes[m.id]).length;
      let statusText = '已投完';
      if (data.matches.length === 0) statusText = '无需投票';
      else if (remaining > 0) statusText = `待投 ${remaining}`;
      return { ...cat, remaining, statusText };
    });
  },

  loadCategoryMatches() {
    const { currentCategoryId, stage, phaseOpen } = this.data;
    const data = this.byCategory[currentCategoryId];
    if (!stage) {
      this.setData({ viewState: 'closed', currentMatch: null, stageSubtitle: 'PK 对局' });
      return;
    }
    if (!data || !data.generated) {
      this.setData({ viewState: 'notGenerated', matches: [], currentMatch: null, stageSubtitle: stage });
      return;
    }
    if (data.matches.length === 0) {
      this.setData({ viewState: 'noMatches', matches: [], currentMatch: null, stageSubtitle: stage });
      return;
    }

    // 从第一场未投的对局继续（支持中途退出后接着投）
    const nextIdx = data.matches.findIndex(m => !data.myVotes[m.id]);
    if (nextIdx === -1 || !phaseOpen) {
      this.setData({
        viewState: nextIdx === -1 ? 'completed' : 'closed',
        matches: data.matches,
        currentMatch: null,
        stageSubtitle: `${stage} · ${nextIdx === -1 ? '已完成' : '已截止'}`
      });
      return;
    }
    this.showMatch(data.matches, nextIdx);
  },

  showMatch(matches, idx) {
    this.setData({
      viewState: 'voting',
      matches,
      currentMatchIndex: idx,
      currentMatch: withMask(matches[idx]),
      selectedSide: null,
      stageSubtitle: `${this.data.stage} · 第 ${idx + 1}/${matches.length} 场`
    });
  },

  onSwitchCategory(e) {
    const { id } = e.currentTarget.dataset;
    if (id === this.data.currentCategoryId) return;
    this.setData({ currentCategoryId: id }, () => this.loadCategoryMatches());
  },

  async onChoosePet(e) {
    if (this.data.selectedSide || this.data.submitting) return; // 提交中或动效过渡中
    const { side } = e.currentTarget.dataset;
    const { currentMatch, currentCategoryId } = this.data;
    if (!currentMatch) return;

    this.setData({ submitting: true });
    try {
      await api.submitMatchVote(currentMatch.id, side);
    } catch (err) {
      // 已投过：视为本场完成，直接进入下一场；其他错误：停留在本场并提示重试，避免"以为投了其实没成功"
      if (!/已投过/.test(err.message)) {
        this.setData({ submitting: false });
        wx.showModal({
          title: '投票没有成功',
          content: `${err.message || '网络异常'}，请重试。`,
          showCancel: false,
          confirmText: '好的'
        });
        return;
      }
    }

    this.byCategory[currentCategoryId].myVotes[currentMatch.id] = side;
    // 选中动效：边框高亮 + 放大 + 打勾，随后自动跳下一场
    this.setData({ selectedSide: side, submitting: false });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });

    setTimeout(() => {
      const data = this.byCategory[currentCategoryId];
      this.setData({ categories: this.buildTabs(this.data.stage) });
      const { matches, currentMatchIndex } = this.data;
      const nextIdx = matches.findIndex((m, i) => i > currentMatchIndex && !data.myVotes[m.id]);
      if (nextIdx !== -1) {
        this.showMatch(matches, nextIdx);
      } else {
        this.setData({
          viewState: 'completed',
          currentMatch: null,
          selectedSide: null,
          stageSubtitle: `${this.data.stage} · 已完成`
        });
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
    this.setData({ currentCategoryId: next.id }, () => this.loadCategoryMatches());
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

  // "分享本场PK"按钮（open-type="share"）与右上角菜单共用
  onShareAppMessage() {
    const { currentMatch, currentCategoryId } = this.data;
    const path = `/pages/vote-match/vote-match?cat=${currentCategoryId}`;
    if (!currentMatch) {
      return { title: 'Pawscars PK 对决进行中，快来投票！', path };
    }
    const share = {
      title: `【${currentMatch.entryA.petName} VS ${currentMatch.entryB.petName}】火热对决中，帮忙投一票！`,
      path
    };
    // 分享封面只支持网络/本地图片；data: 与 cloud:// 地址交由微信默认截取当前页面
    if (/^(https?:|wxfile:)/.test(currentMatch.entryA.photoUrl)) share.imageUrl = currentMatch.entryA.photoUrl;
    return share;
  }
});
