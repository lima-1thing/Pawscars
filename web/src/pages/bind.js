import { api } from '../api';
import { back } from '../router';
import { toast, dialog } from '../ui';
import { validateLdap } from '../shared';
import NavBar from '../components/nav-bar';

export default {
  name: 'BindPage',
  components: { NavBar },
  data() { return { ldap: '', error: '', submitting: false }; },
  methods: {
    async submit() {
      const check = validateLdap(this.ldap);
      if (!check.valid) { this.error = check.message; return; }
      this.submitting = true;
      try {
        await api.bindUser(this.ldap.trim().toUpperCase());
        toast('绑定成功！');
        back();
      } catch (e) {
        this.error = e.message;
      } finally {
        this.submitting = false;
      }
    },
    appeal() {
      dialog({ title: '申诉提示', content: `请联系活动组织者（${(api.getState().config || {}).hostName || '管理员'}）并告知你的常用ID，核实后管理员会在后台为你解绑。`, confirmText: '我知道了' });
    }
  },
  template: `
    <div>
      <NavBar title="身份验证" subtitle="绑定活动ID" :show-my="false" :show-rules="false" />
      <div class="page">
        <div class="card">
          <div class="auth-icon">🐾</div>
          <h2 class="center">欢迎参加 Pawscars</h2>
          <p class="muted center">请先绑定你的社群活动ID (LDAP)</p>
          <label class="field-label">活动ID (LDAP)</label>
          <input class="text-input" :class="{ invalid: error }" v-model="ldap" maxlength="20" placeholder="例如：JENNIFER 或 LIMA0001（字母开头，字母和数字）" @input="error = ''" @keyup.enter="submit">
          <div v-if="error" class="error-msg">{{ error }}</div>
          <p class="hint">ℹ️ ID 用于评选身份标识与拉票辨识（展示时会自动隐去部分字母，如 JE******）。</p>
          <button class="btn btn-primary block" :disabled="submitting" @click="submit">{{ submitting ? '绑定中…' : '确认绑定' }}</button>
          <div class="appeal">
            <div class="appeal-title">ID 被他人占用了？</div>
            <button class="link-btn" @click="appeal">📩 联系管理员申诉</button>
          </div>
        </div>
      </div>
    </div>`
};
