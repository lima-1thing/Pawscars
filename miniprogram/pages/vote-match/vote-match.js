const StorageService = require('../../utils/storage');
const { maskLdap } = require('../../utils/mask');

const PHASE_STAGE = {
  vote_match_8: StorageService.STAGE_KNOCKOUT,
  vote_match_4: StorageService.STAGE_DERBY
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
    viewState: 'loading', // voting | completed | noMatches | notGenerated | closed
    rulesModalVisible: false
  },

  onLoad(options) {
    // 分享卡片带门类参数直达对应门类
    if (options && options.cat) this.setData({ currentCategoryId: options.cat });
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const phase = StorageService.getPhase();
    const stage = PHASE_STAGE[phase] || '';
    const categories = StorageService.getCategories().map(cat => ({
      ...cat,
      ...this.getCategoryStatus(cat.id, stage)
    }));

    const currentCategoryId = categories.some(c => c.id === this.data.currentCategoryId)
      ? this.data.currentCategoryId
      : (categories.find(c => c.remaining > 0) || categories[0] || {}).id;

    this.setData({
      stage,
      phaseOpen: !!stage && StorageService.isPhaseOpen(phase),
      categories,
      currentCategoryId
    }, () => this.loadCategoryMatches());
  },

  // 门类标签上的投票进度：未投 x 场 / 已投完 / 无需投票
  getCategoryStatus(categoryId, stage) {
    if (!stage) return { total: 0, remaining: 0, statusText: '' };
    const matches = StorageService.getVotableMatches(categoryId, stage);
    const remaining = matches.filter(m => !StorageService.getUserMatchVote(m.id)).length;
    let statusText = '已投完';
    if (matches.length === 0) statusText = '无需投票';
    else if (remaining > 0) statusText = `待投 ${remaining}`;
    return { total: matches.length, remaining, statusText };
  },

  refreshCategoryStatus() {
    const { stage } = this.data;
    this.setData({
      categories: this.data.categories.map(cat => ({ ...cat, ...this.getCategoryStatus(cat.id, stage) }))
    });
  },

  loadCategoryMatches() {
    const { currentCategoryId, stage, phaseOpen } = this.data;
    if (!stage) {
      this.setData({ viewState: 'closed', currentMatch: null, stageSubtitle: 'PK 对局' });
      return;
    }

    // 对阵只由管理员推进阶段时生成，这里只读取
    const generated = StorageService.getQualifiers(currentCategoryId) !== null;
    const matches = StorageService.getVotableMatches(currentCategoryId, stage);

    if (!generated) {
      this.setData({ viewState: 'notGenerated', matches: [], currentMatch: null, stageSubtitle: stage });
      return;
    }
    if (matches.length === 0) {
      this.setData({ viewState: 'noMatches', matches: [], currentMatch: null, stageSubtitle: stage });
      return;
    }

    // 从第一场未投的对局继续（支持中途退出后接着投）
    const nextIdx = matches.findIndex(m => !StorageService.getUserMatchVote(m.id));
    if (nextIdx === -1 || !phaseOpen) {
      this.setData({
        viewState: nextIdx === -1 ? 'completed' : 'closed',
        matches,
        currentMatch: null,
        stageSubtitle: `${stage} · ${nextIdx === -1 ? '已完成' : '已截止'}`
      });
      return;
    }
    this.showMatch(matches, nextIdx);
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

  onChoosePet(e) {
    if (this.data.selectedSide) return; // 正在动效过渡中
    const { side } = e.currentTarget.dataset;
    const { currentMatch } = this.data;
    if (!currentMatch) return;

    try {
      StorageService.submitMatchVote(currentMatch.id, side);
    } catch (err) {
      // 已投过：视为本场完成，直接进入下一场；其他错误：停留在本场并提示重试，避免"以为投了其实没成功"
      if (!/已投过/.test(err.message)) {
        wx.showModal({
          title: '投票没有成功',
          content: `${err.message || '网络异常'}，请重试。`,
          showCancel: false,
          confirmText: '好的'
        });
        return;
      }
    }

    // 选中动效：边框高亮 + 放大 + 打勾，随后自动跳下一场
    this.setData({ selectedSide: side });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });

    setTimeout(() => {
      this.refreshCategoryStatus();
      const { matches, currentMatchIndex } = this.data;
      const nextIdx = matches.findIndex((m, i) => i > currentMatchIndex && !StorageService.getUserMatchVote(m.id));
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
    // data: URI 不能作为分享封面，此时由微信默认截取当前页面
    if (!/^data:/.test(currentMatch.entryA.photoUrl)) share.imageUrl = currentMatch.entryA.photoUrl;
    return share;
  }
});
