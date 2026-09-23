const api = require('../../utils/api');
const { maskLdap } = require('../../utils/mask');

const MAX_PICKS = 8;

Page({
  data: {
    phaseOpen: true,
    categoryList: [],
    confirmVisible: false,
    pendingGroups: [],
    submitting: false,
    rulesModalVisible: false
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
    const { phaseOpen, categories } = await api.getInitialState();
    const styles = {};
    api.getState().categories.forEach(c => { styles[c.id] = c; });

    const categoryList = categories.map(cat => {
      const selectedIds = cat.mySelection || [];
      const selectedMap = {};
      selectedIds.forEach(id => { selectedMap[id] = true; });
      return {
        ...styles[cat.id],
        id: cat.id,
        // 候选已按主人活动ID字母顺序 (A→Z) 固定排列，所有人看到的顺序一致
        entries: cat.entries.map(e => ({ ...e, maskedLdap: maskLdap(e.ownerLdap) })),
        needsVote: cat.needsVote,
        selectedIds,
        selectedMap,
        currentIndex: 0,
        isLocked: !!cat.mySelection
      };
    });

    this.setData({ phaseOpen, categoryList });
  },

  updateCategory(catId, updater) {
    const idx = this.data.categoryList.findIndex(c => c.id === catId);
    if (idx === -1) return;
    const next = updater(this.data.categoryList[idx]);
    if (next) this.setData({ [`categoryList[${idx}]`]: next });
  },

  onSwiperChange(e) {
    const { catid } = e.currentTarget.dataset;
    this.updateCategory(catid, cat => ({ ...cat, currentIndex: e.detail.current }));
  },

  onToggleSelect(e) {
    const { catid, petid } = e.currentTarget.dataset;
    this.updateCategory(catid, cat => {
      if (cat.isLocked) {
        wx.showToast({ title: '该门类已提交锁定', icon: 'none' });
        return null;
      }
      const map = { ...cat.selectedMap };
      let ids = [...cat.selectedIds];
      if (map[petid]) {
        delete map[petid];
        ids = ids.filter(id => id !== petid);
      } else {
        if (ids.length >= MAX_PICKS) {
          wx.showToast({ title: `每个门类最多选择 ${MAX_PICKS} 张哦`, icon: 'none' });
          return null;
        }
        map[petid] = true;
        ids.push(petid);
        if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      }
      return { ...cat, selectedMap: map, selectedIds: ids };
    });
  },

  // 点击"选好了" → 弹出确认页，按门类展示已选缩略图供最后检查
  onOpenConfirm() {
    if (!this.data.phaseOpen) {
      wx.showToast({ title: '初选投票已截止', icon: 'none' });
      return;
    }
    const pendingGroups = this.data.categoryList
      .filter(cat => cat.needsVote && !cat.isLocked && cat.selectedIds.length > 0)
      .map(cat => ({
        id: cat.id,
        name: cat.name,
        textColor: cat.textColor,
        bg: cat.bg,
        picks: cat.entries.filter(e => cat.selectedMap[e.id])
      }));

    if (pendingGroups.length === 0) {
      wx.showToast({ title: '请至少选择 1 张喜欢的毛孩哦', icon: 'none' });
      return;
    }
    this.setData({ confirmVisible: true, pendingGroups });
  },

  onCloseConfirm() {
    this.setData({ confirmVisible: false });
  },

  async onSubmitInitialVotes() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    const failures = [];
    let submittedCount = 0;
    for (const group of this.data.pendingGroups) {
      const cat = this.data.categoryList.find(c => c.id === group.id);
      try {
        await api.submitInitialVote(cat.id, cat.selectedIds);
        submittedCount++;
      } catch (e) {
        failures.push(`${cat.name}：${e.message}`);
      }
    }

    // 重新加载：已提交的门类锁定，失败/未提交的门类保留当前选择可重试
    const previousSelections = {};
    this.data.categoryList.forEach(c => { previousSelections[c.id] = c; });
    this.setData({ submitting: false, confirmVisible: false });
    try {
      await this.loadData();
    } catch (e) {
      // 刷新失败时保留当前页面状态
    }
    this.data.categoryList.forEach(c => {
      const prev = previousSelections[c.id];
      if (!c.isLocked && prev && prev.selectedIds.length > 0) {
        this.updateCategory(c.id, cat => ({ ...cat, selectedIds: prev.selectedIds, selectedMap: prev.selectedMap }));
      }
    });

    if (failures.length > 0) {
      wx.showModal({
        title: submittedCount > 0 ? '部分门类提交失败' : '提交失败',
        content: `${failures.join('\n')}\n\n未成功的门类已保留你的选择，可稍后重试。`,
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    wx.showModal({
      title: '投票成功！🎉',
      content: `已提交 ${submittedCount} 个门类的初选投票，初选截止后将按票数产生 8 强。`,
      confirmText: '我的提名',
      cancelText: '留在本页',
      success: (res) => {
        if (res.confirm) wx.navigateTo({ url: '/pages/my-nominations/my-nominations' });
      }
    });
  },

  noop() {},

  onOpenRules() {
    this.setData({ rulesModalVisible: true });
  },

  onCloseRules() {
    this.setData({ rulesModalVisible: false });
  },

  onShareAppMessage() {
    return { title: 'Pawscars 初选打投进行中，快来挑选你喜欢的毛孩！', path: '/pages/index/index' };
  }
});
