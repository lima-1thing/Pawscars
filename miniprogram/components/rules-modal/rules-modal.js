Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onClose() {
      this.setData({ visible: false });
      this.triggerEvent('close');
    },
    preventD() {
      // 阻止蒙层滚动穿透
    }
  }
});
