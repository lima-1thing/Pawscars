const { validatePetName } = require('../../utils/validator');
const api = require('../../utils/api');
const { formatDateTime } = require('../../utils/time');

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = /\.(jpe?g|png)$/i;

/**
 * 选择一张照片 → 校验格式与大小 → 裁剪为正方形
 * @returns {Promise<string>} 裁剪后的临时路径；用户取消返回空字符串
 */
function pickSquarePhoto() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return resolve('');
        if (!ALLOWED_EXT.test(file.tempFilePath)) {
          return reject(new Error('仅支持 JPG / PNG 格式的照片'));
        }
        if (file.size > MAX_PHOTO_BYTES) {
          return reject(new Error('照片需小于 5MB，请换一张'));
        }
        if (!wx.cropImage) return resolve(file.tempFilePath); // 低版本基础库：展示时居中裁剪
        wx.cropImage({
          src: file.tempFilePath,
          cropScale: '1:1',
          success: (cropRes) => resolve(cropRes.tempFilePath),
          fail: (err) => (/cancel/.test(err.errMsg || '') ? resolve('') : resolve(file.tempFilePath))
        });
      },
      fail: (err) => (/cancel/.test(err.errMsg || '') ? resolve('') : reject(new Error('无法打开相册，请检查权限')))
    });
  });
}

Page({
  data: {
    phaseOpen: true,
    photoUrl: '',
    petName: '',
    categories: [],
    selectedCatMap: {},
    pledgeAgreed: false,
    isFormReady: false,
    entryGroups: [],
    entryCount: 0,
    submitting: false
  },

  async onShow() {
    try {
      await getApp().ready;
    } catch (e) {
      return;
    }
    // 不默认预选门类，避免引导所有人都报第一个门类
    this.setData({
      categories: api.getState().categories,
      phaseOpen: api.isPhaseOpen('nominate')
    });
    this.refreshMyEntries();
  },

  async refreshMyEntries() {
    if (!api.getState().user) return;
    let entries;
    try {
      entries = await api.getMyNominations();
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
      return;
    }

    // 按门类分组展示（同一门类下可能有多只不同的宠物）
    const entryGroups = api.getState().categories
      .map(cat => ({
        ...cat,
        entries: entries
          .filter(e => e.categoryId === cat.id)
          .map(e => ({ ...e, timeStr: formatDateTime(e.updatedAt || e.createdAt) }))
      }))
      .filter(group => group.entries.length > 0);

    this.setData({ entryGroups, entryCount: entries.length });
  },

  async onChoosePhoto() {
    if (!this.data.phaseOpen) return;
    try {
      const path = await pickSquarePhoto();
      if (path) this.setData({ photoUrl: path }, () => this.checkFormReady());
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  async onReplacePhoto(e) {
    const { id } = e.currentTarget.dataset;
    try {
      const path = await pickSquarePhoto();
      if (!path) return;
      wx.showLoading({ title: '上传中', mask: true });
      await api.updateEntryPhoto(id, path);
      wx.hideLoading();
      wx.showToast({ title: '照片已更新', icon: 'success' });
      this.refreshMyEntries();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '更新失败', icon: 'none' });
    }
  },

  onInputPetName(e) {
    this.setData({ petName: e.detail.value }, () => this.checkFormReady());
  },

  onToggleCategory(e) {
    const { id } = e.currentTarget.dataset;
    const map = { ...this.data.selectedCatMap };
    if (map[id]) {
      delete map[id];
    } else {
      map[id] = true;
    }
    this.setData({ selectedCatMap: map }, () => this.checkFormReady());
  },

  onTogglePledge() {
    this.setData({ pledgeAgreed: !this.data.pledgeAgreed }, () => this.checkFormReady());
  },

  checkFormReady() {
    const { photoUrl, petName, selectedCatMap, pledgeAgreed } = this.data;
    this.setData({
      isFormReady: !!photoUrl && validatePetName(petName).valid && Object.keys(selectedCatMap).length > 0 && pledgeAgreed
    });
  },

  // 返回第一个缺失项的提示文案，全部满足返回空字符串
  getMissingHint() {
    if (!this.data.photoUrl) return '请先上传毛孩照片';
    const val = validatePetName(this.data.petName);
    if (!val.valid) return val.message;
    if (Object.keys(this.data.selectedCatMap).length === 0) return '请至少选择一个参赛门类';
    if (!this.data.pledgeAgreed) return '请勾选本人拍摄承诺';
    return '';
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const hint = this.getMissingHint();
    if (hint) {
      wx.showToast({ title: hint, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中', mask: true });
    try {
      const result = await api.submitNominations({
        petName: this.data.petName,
        photoPath: this.data.photoUrl,
        categoryIds: Object.keys(this.data.selectedCatMap)
      });
      wx.hideLoading();
      this.refreshMyEntries();
      this.resetForm();

      if (result.skippedCategories.length > 0) {
        const added = result.addedEntries.length;
        wx.showModal({
          title: added > 0 ? '部分门类已提交' : '没有新增提名',
          content: `该毛孩已经被提名【${result.skippedCategories.join('｜')}】${added > 0 ? '，其余选中的门类已成功提交！' : '。'}`,
          showCancel: false,
          confirmText: '知道了'
        });
      } else {
        wx.showToast({ title: '提名成功！', icon: 'success' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  resetForm() {
    this.setData({
      petName: '',
      photoUrl: '',
      selectedCatMap: {},
      pledgeAgreed: false,
      isFormReady: false
    });
  }
});
