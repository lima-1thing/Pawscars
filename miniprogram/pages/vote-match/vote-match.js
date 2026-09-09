const StorageService = require('../../utils/storage');
const { maskLdap } = require('../../utils/mask');

Page({
  data: {
    categories: [],
    currentCategory: null,
    stage: '8进4', // '8进4' 或 '4强德比'
    stageSubtitle: '',
    matches: [],
    currentMatchIndex: 0,
    currentMatch: null,
    maskedLdapA: '',
    maskedLdapB: '',
    selectedSide: null,
    isCompleted: false,
    rulesModalVisible: false
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const config = StorageService.getConfig();
    const categories = StorageService.getCategories();
    const stage = config.currentPhase === 'vote_match_4' ? '4强德比' : '8进4';

    const currentCategory = this.data.currentCategory || categories[0];
    this.setData({
      categories,
      currentCategory,
      stage
    }, () => {
      this.loadCategoryMatches();
    });
  },

  loadCategoryMatches() {
    const { currentCategory, stage } = this.data;
    if (!currentCategory) return;

    let matches = StorageService.getMatches(currentCategory.id, stage);

    // 若尚未生成对阵，通过系统自检补齐
    if (matches.length === 0) {
      StorageService.setPhase(this.data.stage === '4强德比' ? 'vote_match_4' : 'vote_match_8');
      matches = StorageService.getMatches(currentCategory.id, stage);
    }

    // 找到用户下一个未投的场次
    let firstUnvotedIdx = -1;
    for (let i = 0; i < matches.length; i++) {
      const v = StorageService.getUserMatchVote(matches[i].id);
      if (!v) {
        firstUnvotedIdx = i;
        break;
      }
    }

    const isCompleted = matches.length > 0 && firstUnvotedIdx === -1;
    const currentMatchIndex = isCompleted ? matches.length : (firstUnvotedIdx !== -1 ? firstUnvotedIdx : 0);
    const currentMatch = matches[currentMatchIndex] || null;

    const subtitle = currentMatch
      ? `${stage} · 第 ${currentMatchIndex + 1}/${matches.length} 场`
      : `${stage} · 已完成`;

    this.setData({
      matches,
      currentMatchIndex,
      currentMatch,
      isCompleted,
      stageSubtitle: subtitle,
      selectedSide: null,
      maskedLdapA: currentMatch && currentMatch.entryA ? maskLdap(currentMatch.entryA.ownerLdap) : '',
      maskedLdapB: currentMatch && currentMatch.entryB ? maskLdap(currentMatch.entryB.ownerLdap) : ''
    });
  },

  onSwitchCategory(e) {
    const { id } = e.currentTarget.dataset;
    const cat = this.data.categories.find(c => c.id === id);
    if (cat) {
      this.setData({ currentCategory: cat }, () => {
        this.loadCategoryMatches();
      });
    }
  },

  onChoosePet(e) {
    if (this.data.selectedSide) return; // 正在动效过渡中
    const { side } = e.currentTarget.dataset;
    const { currentMatch, matches, currentMatchIndex, stage } = this.data;
    if (!currentMatch) return;

    // 触发边框高亮珊瑚红 + 打勾反馈动效
    this.setData({ selectedSide: side });

    try {
      StorageService.submitMatchVote(currentMatch.id, side);
    } catch (err) {
      console.warn('投票提交异常', err);
    }

    // 600ms 后自动跳下一场
    setTimeout(() => {
      const nextIdx = currentMatchIndex + 1;
      if (nextIdx < matches.length) {
        const nextMatch = matches[nextIdx];
        this.setData({
          currentMatchIndex: nextIdx,
          currentMatch: nextMatch,
          selectedSide: null,
          stageSubtitle: `${stage} · 第 ${nextIdx + 1}/${matches.length} 场`,
          maskedLdapA: maskLdap(nextMatch.entryA.ownerLdap),
          maskedLdapB: maskLdap(nextMatch.entryB.ownerLdap)
        });
      } else {
        // 全部投完
        this.setData({
          isCompleted: true,
          currentMatch: null,
          selectedSide: null,
          stageSubtitle: `${stage} · 已完成`
        });
      }
    }, 650);
  },

  onShareMatch() {
    const { currentMatch } = this.data;
    if (!currentMatch) return;
    wx.showModal({
      title: '对决已生成 📣',
      content: `【${currentMatch.entryA.petName} VS ${currentMatch.entryB.petName}】火热对决中！快发到社群里为TA拉票吧！`,
      showCancel: false,
      confirmText: '去拉票'
    });
  },

  onNextCategory() {
    const { categories, currentCategory } = this.data;
    const idx = categories.findIndex(c => c.id === currentCategory.id);
    const nextCat = categories[(idx + 1) % categories.length];
    this.setData({ currentCategory: nextCat }, () => {
      this.loadCategoryMatches();
    });
  },

  onGoHome() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  },

  onOpenRules() {
    this.setData({ rulesModalVisible: true });
  },

  onCloseRules() {
    this.setData({ rulesModalVisible: false });
  }
});
