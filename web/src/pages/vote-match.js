import { api, STAGE_KNOCKOUT, STAGE_DERBY } from '../api';
import { go, route } from '../router';
import { toast, dialog } from '../ui';
import { maskLdap } from '../shared';
import NavBar from '../components/nav-bar';
import RulesModal from '../components/rules-modal';

const PHASE_STAGE = { vote_match_8: STAGE_KNOCKOUT, vote_match_4: STAGE_DERBY };

export default {
  name: 'VoteMatchPage',
  components: { NavBar, RulesModal },
  data() {
    return { stage: '', phaseOpen: true, tabs: [], current: route.query.cat || '', matches: [], idx: 0, match: null,
      chosen: '', submitting: false, view: 'loading', rules: false };
  },
  computed: {
    subtitle() {
      if (!this.stage) return 'PK 对局';
      if (this.view === 'voting') return `${this.stage} · 第 ${this.idx + 1}/${this.matches.length} 场`;
      if (this.view === 'completed') return `${this.stage} · 已完成`;
      return this.stage;
    }
  },
  created() { this.load(); },
  methods: {
    async load() {
      try {
        await api.refresh();
        this.stage = PHASE_STAGE[api.getState().config.currentPhase] || '';
        if (!this.stage) { this.view = 'closed'; this.tabs = api.getState().categories; return; }
        const { phaseOpen, categories } = await api.getMatchState(this.stage);
        this.phaseOpen = phaseOpen;
        this.byCat = Object.fromEntries(categories.map(c => [c.id, c]));
        this.buildTabs();
        if (!this.tabs.some(t => t.id === this.current)) this.current = (this.tabs.find(t => t.remaining > 0) || this.tabs[0] || {}).id;
        this.showCategory();
      } catch (e) { toast(e.message); }
    },
    buildTabs() {
      this.tabs = api.getState().categories.map(c => {
        const d = this.byCat[c.id];
        const remaining = d ? d.matches.filter(m => !d.myVotes[m.id]).length : 0;
        const status = !d || !d.matches.length ? '无需投票' : (remaining ? `待投 ${remaining}` : '已投完');
        return { ...c, remaining, status };
      });
    },
    showCategory() {
      const d = this.byCat[this.current];
      if (!d || !d.generated) { this.view = 'notGenerated'; return; }
      if (!d.matches.length) { this.view = 'noMatches'; return; }
      this.matches = d.matches;
      const next = d.matches.findIndex(m => !d.myVotes[m.id]);
      if (next === -1) { this.view = 'completed'; return; }
      if (!this.phaseOpen) { this.view = 'closed'; return; }
      this.show(next);
    },
    show(i) {
      const m = this.matches[i];
      this.idx = i;
      this.match = { ...m, maskA: maskLdap(m.entryA.ownerLdap), maskB: maskLdap(m.entryB.ownerLdap) };
      this.chosen = '';
      this.view = 'voting';
    },
    pickTab(id) { if (id !== this.current) { this.current = id; this.showCategory(); } },
    async choose(side) {
      if (this.chosen || this.submitting || !this.match) return;
      this.submitting = true;
      try {
        await api.submitMatchVote(this.match.id, side);
      } catch (e) {
        if (!/已投过/.test(e.message)) {
          this.submitting = false;
          dialog({ title: '投票没有成功', content: `${e.message}，请重试。`, confirmText: '好的' });
          return;
        }
      }
      const d = this.byCat[this.current];
      d.myVotes[this.match.id] = side;
      this.chosen = side;
      this.submitting = false;
      setTimeout(() => {
        this.buildTabs();
        const next = this.matches.findIndex((m, i) => i > this.idx && !d.myVotes[m.id]);
        if (next !== -1) this.show(next); else { this.view = 'completed'; this.match = null; }
      }, 650);
    },
    nextCategory() {
      const next = this.tabs.find(t => t.id !== this.current && t.remaining > 0);
      if (!next) { toast('所有门类都已投完啦！'); return; }
      this.pickTab(next.id);
    },
    async share() {
      const url = `${location.origin}${location.pathname}#/vote-match?cat=${this.current}`;
      const text = this.match ? `【${this.match.entryA.petName} VS ${this.match.entryB.petName}】火热对决中，帮忙投一票！` : 'Pawscars PK 对决进行中，快来投票！';
      try {
        if (navigator.share) await navigator.share({ title: text, url });
        else { await navigator.clipboard.writeText(`${text} ${url}`); toast('链接已复制，快去群里拉票吧！'); }
      } catch (e) { /* 用户取消 */ }
    },
    go
  },
  template: `
    <div>
      <NavBar :subtitle="subtitle" @rules="rules = true" />
      <div class="tabs">
        <button v-for="t in tabs" :key="t.id" class="tab" :class="{ on: t.id === current }"
          :style="t.id === current ? { background: t.bg, color: t.textColor } : {}" @click="pickTab(t.id)">
          {{ t.icon }} {{ t.name }} <span v-if="t.status" class="tab-status" :class="{ todo: t.remaining > 0 }">{{ t.status }}</span>
        </button>
      </div>

      <template v-if="view === 'voting' && match">
        <div class="pk-hint">点击为TA投票</div>
        <div class="duel">
          <template v-for="side in ['A', 'B']" :key="side">
            <div v-if="side === 'B'" class="vs">VS</div>
            <button class="duel-card" :class="{ chosen: chosen === side }" @click="choose(side)">
              <div class="duel-name">{{ match['entry' + side].petName }}</div>
              <div class="duel-photo">
                <img :src="match['entry' + side].photoUrl" :alt="match['entry' + side].petName">
                <span v-if="chosen === side" class="tick">✓</span>
                <span class="mask-tag">主人 {{ match['mask' + side] }}</span>
              </div>
            </button>
          </template>
        </div>
        <div class="center pad"><button class="btn btn-outline" @click="share">🔗 分享本场PK拉票</button></div>
      </template>

      <div v-else-if="view === 'completed'" class="empty">
        <div class="big-emoji">🎉</div><b>本门类{{ stage }}投票已完成</b>
        <p class="muted">你的每一票都已记录，结果将在本阶段截止后公布。</p>
        <button class="btn btn-primary" @click="nextCategory">再投下一个门类</button>
        <button class="btn btn-outline" @click="go('/')">返回首页</button>
      </div>
      <div v-else-if="view === 'noMatches'" class="empty">
        <div class="big-emoji">🕊️</div><b>本门类本轮无需投票</b>
        <p class="muted">晋级名额不足以组成对决（或全部轮空晋级），可以去其他门类看看。</p>
        <button class="btn btn-primary" @click="nextCategory">去其他门类</button>
      </div>
      <div v-else-if="view === 'closed'" class="empty">
        <div class="big-emoji">⏰</div><b>{{ stage ? '本阶段投票已截止' : '当前不在 PK 投票阶段' }}</b>
        <p class="muted">结果公布后可在首页或"我的提名"查看。</p>
        <button class="btn btn-primary" @click="go('/')">返回首页</button>
      </div>
      <div v-else-if="view === 'notGenerated'" class="empty">
        <div class="big-emoji">⏳</div><b>对阵表生成中</b>
        <p class="muted">管理员正在结算上一阶段结果，请稍后再来！</p>
        <button class="btn btn-primary" @click="go('/')">返回首页</button>
      </div>
      <div v-else class="empty"><p class="muted">对阵加载中…</p></div>
      <RulesModal :visible="rules" @close="rules = false" />
    </div>`
};
