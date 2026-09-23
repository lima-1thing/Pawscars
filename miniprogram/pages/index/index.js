const StorageService = require('../../utils/storage');
const { formatCountdown } = require('../../utils/time');

const VOTE_PHASES = {
  vote_initial: { step: '阶段一', name: '初选打投' },
  vote_match_8: { step: '阶段二', name: '8强淘汰赛' },
  vote_match_4: { step: '阶段三', name: '4强巅峰德比' }
};

Page({
  data: {
    config: null,
    categories: [],
    phaseKind: 'nominate', // nominate | vote | awards
    phaseOpen: true,
    countdownText: '',
    votePhaseInfo: null,
    awardsYear: new Date().getFullYear(),
    hostAvatar: '',
    canAccessAdmin: false,
    rulesModalVisible: false,
    clickCount: 0
  },

  onShow() {
    this.loadData();
    // 倒计时每分钟刷新一次
    this.clearTimer();
    this.timer = setInterval(() => this.refreshCountdown(), 60 * 1000);
  },

  onHide() {
    this.clearTimer();
  },

  onUnload() {
    this.clearTimer();
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  loadData() {
    const config = StorageService.getConfig();
    const phase = config.currentPhase;
    let phaseKind = 'awards';
    if (phase === 'nominate') phaseKind = 'nominate';
    else if (VOTE_PHASES[phase]) phaseKind = 'vote';

    this.setData({
      config,
      categories: StorageService.getCategories(),
      phaseKind,
      votePhaseInfo: VOTE_PHASES[phase] || null,
      hostAvatar: config.hostAvatar || '',
      canAccessAdmin: getApp().canAccessAdmin()
    });
    this.refreshCountdown();
  },

  refreshCountdown() {
    const phase = StorageService.getPhase();
    this.setData({
      phaseOpen: StorageService.isPhaseOpen(phase),
      countdownText: formatCountdown(StorageService.getPhaseDeadline(phase))
    });
  },

  onHostAvatarError() {
    this.setData({ hostAvatar: '' });
  },

  onShowRules() {
    this.setData({ rulesModalVisible: true });
  },

  onCloseRules() {
    this.setData({ rulesModalVisible: false });
  },

  onTapNominate() {
    if (!this.data.phaseOpen) {
      wx.showToast({ title: '报名已截止', icon: 'none' });
      return;
    }
    if (!getApp().checkUserBinding()) return;
    wx.navigateTo({ url: '/pages/nominate/nominate' });
  },

  onTapVote() {
    if (!this.data.phaseOpen) {
      wx.showToast({ title: '本阶段投票已截止，请等待结果公布', icon: 'none' });
      return;
    }
    if (!getApp().checkUserBinding()) return;

    const url = this.data.config.currentPhase === 'vote_initial'
      ? '/pages/vote-initial/vote-initial'
      : '/pages/vote-match/vote-match';
    wx.navigateTo({ url });
  },

  onTapAwards() {
    wx.navigateTo({ url: '/pages/awards/awards' });
  },

  onTapSendCongrats() {
    if (!getApp().checkUserBinding()) return;
    wx.navigateTo({ url: '/pages/awards/awards?focus=congrats' });
  },

  onTapMyNomination() {
    if (!getApp().checkUserBinding()) return;
    wx.navigateTo({ url: '/pages/my-nominations/my-nominations' });
  },

  onTapAdmin() {
    if (!getApp().canAccessAdmin()) return;
    wx.navigateTo({ url: '/pages/admin/admin' });
  },

  // 管理员连续点击标题 3 次进入后台（非管理员无反应）
  onTitleClick() {
    if (!this.data.canAccessAdmin) return;
    const count = this.data.clickCount + 1;
    this.setData({ clickCount: count >= 3 ? 0 : count });
    if (count >= 3) this.onTapAdmin();
  },

  onShareAppMessage() {
    const title = (this.data.config && this.data.config.title) || 'Pawscars 毛孩奥斯卡';
    return { title: `${title}，快来给毛孩子们投票！`, path: '/pages/index/index' };
  },

  onShareTimeline() {
    return { title: (this.data.config && this.data.config.title) || 'Pawscars 毛孩奥斯卡' };
  }
});
