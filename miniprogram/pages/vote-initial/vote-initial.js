const StorageService = require('../../utils/storage');
const { maskLdap } = require('../../utils/mask');

Page({
  data: {
    categoryList: [],
    rulesModalVisible: false
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const categories = StorageService.getCategories();
    const categoryList = categories.map(cat => {
      // 获取该门类全部候选条目，按主人活动ID字母顺序 (A-Z) 排序
      const rawEntries = StorageService.getEntries(cat.id);
      const sorted = [...rawEntries].sort((a, b) => {
        return (a.ownerLdap || '').toUpperCase().localeCompare((b.ownerLdap || '').toUpperCase());
      });

      const entries = sorted.map(e => ({
        ...e,
        maskedLdap: maskLdap(e.ownerLdap)
      }));

      // 检查当前用户是否已提交过初选选票
      const existingVote = StorageService.getInitialVotesForUser(cat.id);
      const selectedIds = existingVote ? existingVote.selectedEntryIds : [];
      const selectedMap = {};
      selectedIds.forEach(id => { selectedMap[id] = true; });

      return {
        ...cat,
        entries,
        selectedIds,
        selectedMap,
        currentIndex: 0,
        isLocked: !!existingVote
      };
    });

    this.setData({ categoryList });
  },

  onSwiperChange(e) {
    const { catid } = e.currentTarget.dataset;
    const index = e.detail.current;
    const list = this.data.categoryList.map(cat => {
      if (cat.id === catid) {
        return { ...cat, currentIndex: index };
      }
      return cat;
    });
    this.setData({ categoryList: list });
  },

  onToggleSelect(e) {
    const { catid, petid } = e.currentTarget.dataset;
    const list = this.data.categoryList.map(cat => {
      if (cat.id === catid) {
        if (cat.isLocked) {
          wx.showToast({ title: '该门类您已锁定提交', icon: 'none' });
          return cat;
        }

        const map = { ...cat.selectedMap };
        let ids = [...cat.selectedIds];

        if (map[petid]) {
          delete map[petid];
          ids = ids.filter(id => id !== petid);
        } else {
          if (ids.length >= 8) {
            wx.showToast({ title: '每个门类最多选择 8 张哦', icon: 'none' });
            return cat;
          }
          map[petid] = true;
          ids.push(petid);
        }

        return {
          ...cat,
          selectedMap: map,
          selectedIds: ids
        };
      }
      return cat;
    });

    this.setData({ categoryList: list });
  },

  onSubmitInitialVotes() {
    const { categoryList } = this.data;
    let submittedCount = 0;
    let errors = [];

    categoryList.forEach(cat => {
      if (cat.selectedIds.length > 0 && !cat.isLocked) {
        try {
          StorageService.submitInitialVote(cat.id, cat.selectedIds);
          submittedCount++;
        } catch (e) {
          errors.push(e.message);
        }
      }
    });

    if (submittedCount === 0) {
      if (errors.length > 0) {
        wx.showToast({ title: errors[0], icon: 'none' });
      } else {
        wx.showToast({ title: '请至少选择 1 张喜欢的毛孩哦', icon: 'none' });
      }
      return;
    }

    wx.showModal({
      title: '投票成功！🎉',
      content: `已成功提交 ${submittedCount} 个门类的初选投票！初选截止后系统将按票数自动生成8强对阵。`,
      showCancel: false,
      confirmText: '查看我的提名',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/my-nominations/my-nominations' });
        } else {
          this.loadData();
        }
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
