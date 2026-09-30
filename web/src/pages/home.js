import { api } from '../api';
import { go } from '../router';
import { toast } from '../ui';
import { formatCountdown } from '../shared';
import RulesModal from '../components/rules-modal';
import GoogleButton from '../components/google-button';
import { GOOGLE_CLIENT_ID } from '../config';

const VOTE_PHASES = {
  vote_initial: { step: '第一轮', name: '初选打投' },
  vote_final: { step: '第二轮', name: '8强决赛' }
};

export default {
  name: 'HomePage',
  components: { RulesModal, GoogleButton },
  data() {
    return { config: {}, categories: [], user: null, isAdmin: false, googleEmail: null, phaseOpen: true, countdown: '', rules: false, linking: false };
  },
  computed: {
    phase() { return this.config.currentPhase; },
    phaseKind() { return this.phase === 'nominate' ? 'nominate' : (VOTE_PHASES[this.phase] ? 'vote' : 'awards'); },
    voteInfo() { return VOTE_PHASES[this.phase] || {}; },
    // 旧的匿名网页身份：提示关联 Google 账号，以便在其他设备认出同一个人
    needsLink() { return !!GOOGLE_CLIENT_ID && !this.googleEmail; },
    year() { return new Date().getFullYear(); }
  },
  async created() {
    try { await api.refresh(); } catch (e) { toast(e.message); }
    Object.assign(this, api.getState());
    this.tick();
    this.timer = setInterval(() => this.tick(), 60000);
  },
  unmounted() { clearInterval(this.timer); },
  methods: {
    tick() {
      this.phaseOpen = api.isPhaseOpen(this.phase);
      this.countdown = formatCountdown((this.config.phaseDeadlines || {})[this.phase]);
    },
    requireUser() {
      if (this.user) return true;
      go('/bind');
      return false;
    },
    nominate() { if (this.phaseOpen && this.requireUser()) go('/nominate'); },
    vote() {
      if (!this.phaseOpen) { toast('本阶段投票已截止，请等待结果公布'); return; }
      if (this.requireUser()) go(this.phase === 'vote_initial' ? '/vote-initial' : '/vote-final');
    },
    my() { if (this.requireUser()) go('/my'); },
    congrats() { if (this.requireUser()) go('/awards?focus=congrats'); },
    async onLink(credential) {
      try {
        await api.loginWithGoogle(credential);
        Object.assign(this, api.getState());
        toast('已关联 Google 账号，换设备也能用它登录');
      } catch (e) { toast(e.message); }
    },
    go
  },
  template: `
    <div class="home">
      <section class="banner">
        <div class="banner-row">
          <div class="avatar-circle"><img src="images/banner-cat.jpg" alt="粉色猫咪"></div>
          <div class="brand"><div class="brand-title">Pawscars</div><div class="brand-sub">{{ config.title }}</div></div>
          <div class="avatar-circle"><img src="images/banner-dog.jpg" alt="蓝色贵宾犬"></div>
        </div>
        <div class="mini-icons"><span class="mi yellow">🐾</span><span class="mi green">🏆</span><span class="mi purple">❤️</span></div>
      </section>

      <section v-if="needsLink" class="link-banner">
        <div><b>关联 Google 账号</b><div class="small">关联后换手机、换电脑都能用同一个身份，活动ID和报名都保留</div></div>
        <GoogleButton text="continue_with" @credential="onLink" />
      </section>

      <section class="content">
        <div class="speaker-row">
          <span class="host-dot">{{ (config.hostName || '宫').slice(0, 1) }}</span>
          <span class="host-name">{{ config.hostName }}</span>
          <button class="user-chip" :class="{ unbound: !user }" @click="user ? go('/my') : go('/bind')">
            <template v-if="user">👤 {{ user.ldap }}<span v-if="isAdmin" class="admin-tag">管理员</span></template>
            <template v-else>未绑定 · 去绑定 ›</template>
          </button>
        </div>

        <template v-if="phaseKind === 'nominate'">
          <p class="story">{{ config.hostIntro }}</p>
          <div class="phase-strip" :class="{ closed: !phaseOpen }">
            <template v-if="phaseOpen && countdown">报名中 · 距截止还剩 {{ countdown }}</template>
            <template v-else-if="phaseOpen">报名进行中</template>
            <template v-else>报名已截止，初选即将开始</template>
          </div>
          <div class="center"><button class="rule-capsule" @click="rules = true">{{ config.rulesSummary }} ›</button></div>
          <div class="section-label">评选类别：</div>
          <div class="cat-cards">
            <div v-for="c in categories" :key="c.id" class="cat-card" :style="{ background: c.bg, color: c.textColor }">
              <div class="cat-icon">{{ c.icon }}</div><div class="cat-tag">{{ c.name.slice(0, 2) }}</div><div class="cat-suffix">{{ c.name.slice(2) }}</div>
            </div>
          </div>
          <p class="callout">{{ config.callToActionText }}</p>
          <button v-if="phaseOpen" class="btn btn-primary block" @click="nominate">我要提名</button>
          <button v-else class="btn btn-primary block" @click="my">📋 查看我的提名</button>
          <button class="link-btn gallery-link" @click="go('/gallery')">👀 看看已提名的毛孩 ›</button>
        </template>

        <template v-else-if="phaseKind === 'vote'">
          <div class="speech">
            <div class="speech-tag">投票进行中 · {{ voteInfo.step }}</div>
            <div class="speech-title">Pawscars【{{ voteInfo.name }}】进行时</div>
            <div class="speech-sub">
              <template v-if="!phaseOpen">本阶段投票已截止，结果即将公布</template>
              <template v-else-if="countdown">距离本阶段投票截止还有 {{ countdown }}</template>
              <template v-else>快来为喜欢的毛孩投上一票！</template>
            </div>
          </div>
          <div class="stepper">
            <span :class="{ on: phase === 'vote_initial' }">初选</span>
            <span :class="{ on: phase === 'vote_final' }">决赛</span>
          </div>
          <div class="stack">
            <button class="btn btn-primary block" :class="{ dim: !phaseOpen }" @click="vote">{{ phaseOpen ? '我要投票' : '投票已截止' }}</button>
            <button class="btn btn-outline block" @click="my">📋 我的提名</button>
          </div>
        </template>

        <template v-else>
          <div class="speech gold">
            <div class="big-emoji">🏆</div>
            <div class="speech-title">热烈祝贺 {{ year }} {{ config.title }}的王者们！</div>
            <div class="speech-sub">各大门类冠亚季军已荣耀揭晓，来贺词墙送上祝福吧</div>
          </div>
          <div class="stack">
            <button class="btn btn-primary block" @click="congrats">发送贺词</button>
            <button class="btn btn-outline block" @click="go('/awards')">🏆 查看颁奖结果</button>
            <button class="btn btn-outline block" @click="my">📋 我的提名</button>
          </div>
        </template>
      </section>

      <div v-if="isAdmin" class="center admin-link"><button class="chip-btn" @click="go('/admin')">⚙️ 管理后台</button></div>
      <p class="web-note">网页测试版 · 正式活动请使用微信小程序</p>
      <RulesModal :visible="rules" @close="rules = false" />
    </div>`
};
