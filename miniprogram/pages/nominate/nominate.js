const { validatePetName } = require('../../utils/validator');
const StorageService = require('../../utils/storage');
const { createPetSvg } = require('../../utils/mock-data');

Page({
  data: {
    photoUrl: '',
    petName: '',
    categories: [],
    selectedCatMap: {},
    pledgeAgreed: false,
    isFormReady: false,
    myEntries: []
  },

  onLoad() {
    this.loadInitialData();
  },

  onShow() {
    this.refreshMyEntries();
  },

  loadInitialData() {
    const categories = StorageService.getCategories();
    // 默认预选第一个门类
    const selectedCatMap = {};
    if (categories.length > 0) {
      selectedCatMap[categories[0].id] = true;
    }

    this.setData({
      categories,
      selectedCatMap
    }, () => this.checkFormReady());
  },

  refreshMyEntries() {
    const user = StorageService.getUserBinding();
    if (!user) return;
    const entries = StorageService.getMyNominations(user.ldap);
    const categories = StorageService.getCategories();
    const catMap = {};
    categories.forEach(c => { catMap[c.id] = c.name; });

    const formatted = entries.map(e => ({
      ...e,
      categoryName: catMap[e.categoryId] || e.categoryId,
      timeStr: new Date(e.createdAt).toLocaleDateString()
    }));

    this.setData({ myEntries: formatted });
  },

  onChoosePhoto() {
    // 优先调用系统相册/相机，如果环境限制则生成精美毛孩示例图
    if (typeof wx !== 'undefined' && wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        camera: 'back',
        success: (res) => {
          if (res.tempFiles && res.tempFiles.length > 0) {
            this.setData({
              photoUrl: res.tempFiles[0].tempFilePath
            }, () => this.checkFormReady());
          }
        },
        fail: () => {
          this.useSamplePhoto();
        }
      });
    } else {
      this.useSamplePhoto();
    }
  },

  useSamplePhoto() {
    const randomAnimal = Math.random() > 0.5 ? 'dog' : 'cat';
    const randomBg = ['#FFF3CD', '#D8F3DC', '#E8D7F1', '#FFE8D6'][Math.floor(Math.random() * 4)];
    const sample = createPetSvg(randomBg, randomAnimal, this.data.petName || '毛孩');
    this.setData({ photoUrl: sample }, () => this.checkFormReady());
  },

  onInputPetName(e) {
    this.setData({
      petName: e.detail.value
    }, () => this.checkFormReady());
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
    this.setData({
      pledgeAgreed: !this.data.pledgeAgreed
    }, () => this.checkFormReady());
  },

  checkFormReady() {
    const hasPhoto = !!this.data.photoUrl;
    const nameValid = validatePetName(this.data.petName).valid;
    const hasCategory = Object.keys(this.data.selectedCatMap).length > 0;
    const pledge = this.data.pledgeAgreed;

    this.setData({
      isFormReady: hasPhoto && nameValid && hasCategory && pledge
    });
  },

  onSubmit() {
    if (!this.data.isFormReady) {
      if (!this.data.photoUrl) {
        wx.showToast({ title: '请先上传毛孩照片', icon: 'none' });
        return;
      }
      const val = validatePetName(this.data.petName);
      if (!val.valid) {
        wx.showToast({ title: val.message, icon: 'none' });
        return;
      }
      if (Object.keys(this.data.selectedCatMap).length === 0) {
        wx.showToast({ title: '请至少选择一个参赛门类', icon: 'none' });
        return;
      }
      if (!this.data.pledgeAgreed) {
        wx.showToast({ title: '请勾选本人拍摄承诺', icon: 'none' });
        return;
      }
      return;
    }

    const categoryIds = Object.keys(this.data.selectedCatMap);
    try {
      const result = StorageService.submitNominations({
        petName: this.data.petName,
        photoUrl: this.data.photoUrl,
        categoryIds
      });

      if (result.skippedCategories.length > 0) {
        wx.showModal({
          title: '部分门类已提交',
          content: `该毛孩已在【${result.skippedCategories.join('、')}】报过名，其余选中的门类已成功提交！`,
          showCancel: false,
          confirmText: '太棒了',
          success: () => {
            this.refreshMyEntries();
            this.resetForm();
          }
        });
      } else {
        wx.showToast({
          title: '提名成功！',
          icon: 'success',
          duration: 1500
        });
        setTimeout(() => {
          this.refreshMyEntries();
          this.resetForm();
        }, 1200);
      }
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败', icon: 'none' });
    }
  },

  resetForm() {
    this.setData({
      petName: '',
      photoUrl: '',
      pledgeAgreed: false,
      isFormReady: false
    });
  }
});
