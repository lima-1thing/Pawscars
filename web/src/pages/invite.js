import { api } from '../api';
import { GOOGLE_CLIENT_ID } from '../config';
import GoogleButton from '../components/google-button';

export default {
  name: 'InvitePage',
  components: { GoogleButton },
  emits: ['done'],
  data() { return { code: '', error: '', submitting: false, useGoogle: !!GOOGLE_CLIENT_ID }; },
  methods: {
    // 未配置 Google 登录时：仅凭邀请码登录（匿名身份）
    async submit() {
      if (!this.code.trim()) { this.error = '请输入邀请码'; return; }
      this.submitting = true;
      this.error = '';
      try {
        await api.loginWithInvite(this.code.trim());
        this.$emit('done');
      } catch (e) {
        this.error = e.message;
      } finally {
        this.submitting = false;
      }
    },
    async onGoogle(credential) {
      this.submitting = true;
      this.error = '';
      try {
        await api.loginWithGoogle(credential, this.code.trim());
        this.$emit('done');
      } catch (e) {
        this.error = e.message;
      } finally {
        this.submitting = false;
      }
    }
  },
  template: `
    <div class="auth-screen">
      <div class="card auth-card">
        <div class="auth-icon">🐾</div>
        <h1 class="auth-title">Pawscars 毛孩奥斯卡</h1>
        <template v-if="useGoogle">
          <p class="muted center">网页版 · 使用 Google 账号登录，换手机、换电脑都能认出你</p>
          <input class="text-input" v-model="code" placeholder="邀请码（第一次参加时填写）" autocomplete="off">
          <GoogleButton class="google-login" @credential="onGoogle" />
          <p v-if="submitting" class="muted small center">登录中…</p>
          <div v-if="error" class="error-msg">{{ error }}</div>
          <p class="hint">已经参加过的用户：邀请码留空，直接用同一个 Google 账号登录即可。</p>
        </template>
        <template v-else>
          <p class="muted center">网页测试版 · 请输入组织者提供的邀请码</p>
          <input class="text-input" v-model="code" placeholder="邀请码" autocomplete="off" @keyup.enter="submit">
          <div v-if="error" class="error-msg">{{ error }}</div>
          <button class="btn btn-primary block" :disabled="submitting" @click="submit">{{ submitting ? '验证中…' : '进入活动' }}</button>
        </template>
        <p class="hint">这是测试版，数据可能会在正式活动前清空。</p>
      </div>
    </div>`
};
