import { api } from '../api';
import { go, back } from '../router';

export default {
  name: 'NavBar',
  props: {
    title: { type: String, default: 'Pawscars毛孩奥斯卡' },
    subtitle: { type: String, default: '' },
    showMy: { type: Boolean, default: true },
    showRules: { type: Boolean, default: true }
  },
  emits: ['rules'],
  computed: {
    hostInitial() { return ((api.getState().config || {}).hostName || '宫').slice(0, 1); }
  },
  methods: { back, go },
  template: `
    <header class="nav-bar">
      <div class="nav-left">
        <button class="icon-btn" aria-label="返回" @click="back">‹</button>
        <button v-if="showMy" class="pill-btn" @click="go('/my')">📋 我的提名</button>
      </div>
      <div class="nav-center">
        <div class="nav-title">{{ title }}</div>
        <div v-if="subtitle" class="nav-subtitle">{{ subtitle }}</div>
      </div>
      <div class="nav-right">
        <button v-if="showRules" class="rules-bubble" aria-label="比赛规则" @click="$emit('rules')">
          <span class="avatar-ring">{{ hostInitial }}</span>
        </button>
      </div>
    </header>`
};
