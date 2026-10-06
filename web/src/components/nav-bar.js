import { back } from '../router';

/**
 * 顶栏：返回按钮 + 居中的标题/副标题（我的提名、活动规则在页面底部的 PageFooter）
 */
export default {
  name: 'NavBar',
  props: {
    title: { type: String, default: 'Pawscars毛孩奥斯卡' },
    subtitle: { type: String, default: '' }
  },
  methods: { back },
  template: `
    <header class="nav-bar">
      <div class="nav-row">
        <button class="icon-btn" aria-label="返回" @click="back">‹</button>
      </div>
      <div class="nav-center">
        <div class="nav-title">{{ title }}</div>
        <div v-if="subtitle" class="nav-subtitle">{{ subtitle }}</div>
      </div>
    </header>`
};
