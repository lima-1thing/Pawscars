/**
 * "使用 Google 账号登录"按钮（Google Identity Services）
 * 登录成功后发出 credential 事件（Google 签发的 ID Token，由后台校验）
 */
import { GOOGLE_CLIENT_ID } from '../config';

let initialized = false;
let currentHandler = null;

function whenGoogleReady(cb, tries = 0) {
  if (window.google && window.google.accounts && window.google.accounts.id) cb();
  else if (tries < 100) setTimeout(() => whenGoogleReady(cb, tries + 1), 100);
}

export default {
  name: 'GoogleButton',
  props: { text: { type: String, default: 'signin_with' }, locale: { type: String, default: 'zh_CN' } },
  emits: ['credential'],
  data() { return { failed: false }; },
  mounted() {
    whenGoogleReady(() => {
      // 同一页面只初始化一次；回调转发给当前显示的按钮
      if (!initialized) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (res) => currentHandler && currentHandler(res.credential),
          ux_mode: 'popup'
        });
        initialized = true;
      }
      currentHandler = (credential) => this.$emit('credential', credential);
      window.google.accounts.id.renderButton(this.$refs.slot, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: this.text, locale: this.locale, width: 280
      });
    });
    setTimeout(() => { if (!this.$refs.slot || !this.$refs.slot.children.length) this.failed = true; }, 10000);
  },
  template: `
    <div class="google-btn-wrap">
      <div ref="slot"></div>
      <p v-if="failed" class="error-msg">Google 登录组件加载失败，请检查网络后刷新页面。</p>
    </div>`
};
