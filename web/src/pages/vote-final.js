import { api } from '../api';
import { go, route } from '../router';
import { toast, dialog } from '../ui';
import { maskLdap } from '../shared';
import NavBar from '../components/nav-bar';
import RulesModal from '../components/rules-modal';

export default {
  name: 'VoteFinalPage',
  components: { NavBar, RulesModal },
  data() {
    return { inFinal: true, phaseOpen: true, tabs: [], current: route.query.cat || '', pairs: [], idx: 0, pair: null,
      chosen: '', submitting: false, view: 'loading', rules: false };
  },
  computed: {
    subtitle() {
      if (this.view === 'voting') return `决赛 · 第 ${this.idx + 1}/${this.pairs.length} 场`;
      if (this.view === 'completed') return '决赛 · 已完成';
      return '决赛';
    }
  },
  created() { this.load(); },
  methods: {
    async load() {
      try {
        await api.refresh();
        if (api.getState().config.currentPhase !== 'vote_final') {
          this.inFinal = false;
          this.phaseOpen = false;
          this.tabs = api.getState().categories;
          this.view = 'closed';
          return;
        }
        const { phaseOpen, categories } = await api.getFinalState();
        this.phaseOpen = phaseOpen;
        // 本页缓存：各门类本人的决赛对局
        this.byCat = Object.fromEntries(categories.map(c => [c.id, c]));
        this.buildTabs();
        if (!this.tabs.some(t => t.id === this.current)) this.current = (this.tabs.find(t => t.remaining > 0) || this.tabs[0] || {}).id;
        this.showCategory();
      } catch (e) { toast(e.message); }
    },
    buildTabs() {
      this.tabs = api.getState().categories.map(c => {
        const pairs = (this.byCat[c.id] || {}).pairs || [];
        const remaining = pairs.filter(p => !p.myVote).length;
        const status = !pairs.length ? '无需投票' : (remaining ? `待投 ${remaining}` : '已投完');
        return { ...c, remaining, status };
      });
    },
    showCategory() {
      const d = this.byCat[this.current];
      if (!d || !d.generated) { this.view = 'notGenerated'; return; }
      if (!d.pairs.length) { this.view = 'noMatches'; return; }
      this.pairs = d.pairs;
      // 从第一场未投的对局继续（支持中途退出后接着投）
      const next = d.pairs.findIndex(p => !p.myVote);
      if (next === -1) { this.view = 'completed'; return; }
      if (!this.phaseOpen) { this.view = 'closed'; return; }
      this.show(next);
    },
    show(i) {
      const p = this.pairs[i];
      this.idx = i;
      this.pair = { ...p, maskA: maskLdap(p.entryA.ownerLdap), maskB: maskLdap(p.entryB.ownerLdap) };
      this.chosen = '';
      this.view = 'voting';
    },
    pickTab(id) { if (id !== this.current) { this.current = id; this.showCategory(); } },
    async choose(side) {
      if (this.chosen || this.submitting || !this.pair) return;
      this.submitting = true;
      try {
        await api.submitFinalVote(this.current, this.pair.index, side);
      } catch (e) {
        // 已投过：视为本场完成；其他错误：停留在本场并提示重试
        if (!/已投过/.test(e.message)) {
          this.submitting = false;
          dialog({ title: '投票没有成功', content: `${e.message}，请重试。`, confirmText: '好的' });
          return;
        }
      }
      this.pairs[this.idx].myVote = side;
      this.chosen = side;
      this.submitting = false;
      setTimeout(() => {
        this.buildTabs();
        const next = this.pairs.findIndex((p, i) => i > this.idx && !p.myVote);
        if (next !== -1) this.show(next); else { this.view = 'completed'; this.pair = null; }
      }, 650);
    },
    nextCategory() {
      const next = this.tabs.find(t => t.id !== this.current && t.remaining > 0);
      if (!next) { toast('所有门类都已投完啦！'); return; }
      this.pickTab(next.id);
    },
    async share() {
      const url = `${location.origin}${location.pathname}#/vote-final?cat=${this.current}`;
      const text = this.pair ? `【${this.pair.entryA.petName} VS ${this.pair.entryB.petName}】决赛火热进行中，帮忙投一票！` : 'Pawscars 决赛 PK 进行中，快来投票！';
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

      <template v-if="view === 'voting' && pair">
        <div class="pk-hint">点击为TA投票</div>
        <div class="duel">
          <template v-for="side in ['A', 'B']" :key="side">
            <div v-if="side === 'B'" class="vs">VS</div>
            <button class="duel-card" :class="{ chosen: chosen === side }" @click="choose(side)">
              <div class="duel-name">{{ pair['entry' + side].petName }}</div>
              <div class="duel-photo">
                <img :src="pair['entry' + side].photoUrl" :alt="pair['entry' + side].petName">
                <span v-if="chosen === side" class="tick">✓</span>
                <span class="mask-tag">主人 {{ pair['mask' + side] }}</span>
              </div>
            </button>
          </template>
        </div>
        <div class="center pad"><button class="btn btn-outline" @click="share">🔗 分享决赛拉票</button></div>
      </template>

      <div v-else-if="view === 'completed'" class="empty">
        <div class="big-emoji">🎉</div><b>本门类决赛投票已完成</b>
        <p class="muted">你的每一票都已记录，冠亚季军将在决赛截止后揭晓。</p>
        <button class="btn btn-primary" @click="nextCategory">再投下一个门类</button>
        <button class="btn btn-outline" @click="go('/')">返回首页</button>
      </div>
      <div v-else-if="view === 'noMatches'" class="empty">
        <div class="big-emoji">🕊️</div><b>本门类无需投票</b>
        <p class="muted">本门类决赛选手不足 2 只，无需 PK，可以去其他门类看看。</p>
        <button class="btn btn-primary" @click="nextCategory">去其他门类</button>
      </div>
      <div v-else-if="view === 'closed'" class="empty">
        <div class="big-emoji">⏰</div><b>{{ inFinal ? '决赛投票已截止' : '当前不在决赛投票阶段' }}</b>
        <p class="muted">结果公布后可在首页或"我的提名"查看。</p>
        <button class="btn btn-primary" @click="go('/')">返回首页</button>
      </div>
      <div v-else-if="view === 'notGenerated'" class="empty">
        <div class="big-emoji">⏳</div><b>决赛名单生成中</b>
        <p class="muted">管理员正在结算初选结果，请稍后再来！</p>
        <button class="btn btn-primary" @click="go('/')">返回首页</button>
      </div>
      <div v-else class="empty"><p class="muted">对局加载中…</p></div>
      <RulesModal :visible="rules" @close="rules = false" />
    </div>`
};
