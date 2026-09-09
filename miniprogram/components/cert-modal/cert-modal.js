const { maskLdap } = require('../../utils/mask');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    entry: {
      type: Object,
      value: null,
      observer(newVal) {
        if (newVal && newVal.ownerLdap) {
          this.setData({
            maskedLdap: maskLdap(newVal.ownerLdap)
          });
        }
      }
    },
    categoryName: {
      type: String,
      value: '干饭王者'
    },
    rankText: {
      type: String,
      value: '冠军'
    }
  },

  data: {
    maskedLdap: '***'
  },

  methods: {
    onClose() {
      this.setData({ visible: false });
      this.triggerEvent('close');
    },
    preventD() {},
    onSaveImage() {
      wx.showToast({
        title: '证书已成功保存到相册',
        icon: 'success',
        duration: 2000
      });
      this.triggerEvent('saved');
    }
  }
});
