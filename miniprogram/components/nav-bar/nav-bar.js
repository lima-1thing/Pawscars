/**
 * 读取胶囊按钮位置，计算自定义导航栏的状态栏高度、导航栏高度与右侧避让宽度
 */
function getNavMetrics() {
  const fallback = { statusBarHeight: 20, navHeight: 44, capsuleInset: 96 };
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = win.statusBarHeight || fallback.statusBarHeight;
    if (!menu || !menu.height) return { ...fallback, statusBarHeight };
    return {
      statusBarHeight,
      navHeight: (menu.top - statusBarHeight) * 2 + menu.height,
      capsuleInset: win.windowWidth - menu.left + 8
    };
  } catch (e) {
    return fallback;
  }
}

Component({
  properties: {
    title: {
      type: String,
      value: 'Pawscars毛孩奥斯卡'
    },
    subtitle: {
      type: String,
      value: ''
    }
  },

  data: {
    statusBarHeight: 20,
    navHeight: 44,
    capsuleInset: 96,
    canGoBack: false
  },

  lifetimes: {
    attached() {
      this.setData({
        ...getNavMetrics(),
        canGoBack: getCurrentPages().length > 1
      });
    }
  },

  methods: {
    onTapBack() {
      if (this.data.canGoBack) {
        wx.navigateBack();
      } else {
        // 通过分享直达的页面没有上一页，回到首页
        wx.reLaunch({ url: '/pages/index/index' });
      }
    }
  }
});
