import { api } from '../api';
import { go } from '../router';
import { toast } from '../ui';
import NavBar from '../components/nav-bar';

export default {
  name: 'MyPage',
  components: { NavBar },
  data() { return { loaded: false, entries: [], ldap: '', canNominate: false }; },
  async created() {
    const { user, categories } = api.getState();
    if (!user) { go('/bind'); return; }
    this.ldap = user.ldap;
    this.canNominate = api.isPhaseOpen('nominate');
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    try {
      this.entries = (await api.getMyNominations()).map(e => ({ ...e, cat: catMap[e.categoryId] || { name: e.categoryId, bg: '#FAC775', textColor: '#412402' } }));
    } catch (e) { toast(e.message); }
    this.loaded = true;
  },
  methods: { go },
  template: `
    <div>
      <NavBar title="我的提名" subtitle="参赛毛孩状态追踪" :show-my="false" :show-rules="false" />
      <div class="page">
        <div class="card user-card"><span class="big-emoji">🐾</span><div><b>活动ID: {{ ldap }}</b><div class="muted small">（私密页面，仅你本人可见实时票数与晋级状态）</div></div></div>
        <div v-for="e in entries" :key="e.id" class="card nom-card">
          <div class="photo-tile sm"><img :src="e.photoUrl" :alt="e.petName"></div>
          <div class="grow">
            <div class="nom-top"><b>{{ e.petName }}</b><span class="cat-pill" :style="{ background: e.cat.bg, color: e.cat.textColor }">{{ e.cat.name }}</span></div>
            <span class="status-pill" :class="'tone-' + e.progress.tone">{{ e.progress.title }}</span>
            <div class="muted small">{{ e.progress.detail }}</div>
          </div>
        </div>
        <div v-if="loaded && !entries.length" class="empty">
          <div class="big-emoji">🐶</div><b>你还没有提名参赛毛孩</b>
          <p class="muted">{{ canNominate ? '快去为自家的毛孩子报名参加 Pawscars 吧！' : '本届报名已截止，下次活动再来参加吧！' }}</p>
          <button v-if="canNominate" class="btn btn-primary" @click="go('/nominate')">立即去提名</button>
        </div>
      </div>
    </div>`
};
