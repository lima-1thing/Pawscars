const api = require('../../utils/api');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(visible) {
        if (visible) this.loadConfig();
      }
    }
  },

  data: {
    hostName: '宫师姐',
    hostAvatar: '',
    rulesDetail: ''
  },

  methods: {
    // 规则文案由管理员在后台编辑维护，每次打开时读取最新内容
    loadConfig() {
      const config = api.getState().config || {};
      this.setData({
        hostName: config.hostName || '宫师姐',
        hostAvatar: config.hostAvatar || '',
        rulesDetail: config.rulesDetail || ''
      });
    },
    onClose() {
      this.triggerEvent('close');
    },
    onAvatarError() {
      this.setData({ hostAvatar: '' });
    },
    preventD() {
      // 阻止蒙层滚动穿透
    }
  }
});
