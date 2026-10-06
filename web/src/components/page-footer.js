/**
 * 页面底部的快捷入口：我的提名 / 活动规则（原先挤在顶栏里）
 */
import { go } from '../router';

export default {
  name: 'PageFooter',
  props: {
    showMy: { type: Boolean, default: true },
    showRules: { type: Boolean, default: true }
  },
  emits: ['rules'],
  methods: { go },
  template: `
    <div v-if="showMy || showRules" class="page-footer">
      <button v-if="showMy" class="footer-link" @click="go('/my')"><img src="images/icon-paw.svg" alt="">我的提名</button>
      <button v-if="showRules" class="footer-link" @click="$emit('rules')"><img src="images/icon-rules.svg" alt="">活动规则</button>
    </div>`
};
