import { api } from '../api';

export default {
  name: 'InvitePage',
  emits: ['done'],
  data() { return { code: '', error: '', submitting: false }; },
  methods: {
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
    }
  },
  template: `
    <div class="auth-screen">
      <div class="card auth-card">
        <div class="auth-icon">🐾</div>
        <h1 class="auth-title">Pawscars 毛孩奥斯卡</h1>
        <p class="muted center">网页测试版 · 请输入组织者提供的邀请码</p>
        <input class="text-input" v-model="code" placeholder="邀请码" autocomplete="off" @keyup.enter="submit">
        <div v-if="error" class="error-msg">{{ error }}</div>
        <button class="btn btn-primary block" :disabled="submitting" @click="submit">{{ submitting ? '验证中…' : '进入活动' }}</button>
        <p class="hint">这是测试版，数据可能会在正式活动前清空。</p>
      </div>
    </div>`
};
