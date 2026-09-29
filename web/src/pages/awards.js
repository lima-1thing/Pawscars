import { api } from '../api';
import { route } from '../router';
import { toast } from '../ui';
import { maskLdap, validateCongrats, formatDateTime } from '../shared';
import NavBar from '../components/nav-bar';
import RulesModal from '../components/rules-modal';
import CertModal from '../components/cert-modal';

const RANKS = [{ key: 'champion', text: '冠军' }, { key: 'runnerUp', text: '亚军' }, { key: 'thirdPlace', text: '季军' }];
const fmt = (e) => e && { ...e, masked: maskLdap(e.ownerLdap), score: e.games ? `${e.wins} 胜 / ${e.games} 场 · 胜率 ${Math.round(e.winRate * 100)}%` : (e.games === 0 ? '暂无对局' : '') };

export default {
  name: 'AwardsPage',
  components: { NavBar, RulesModal, CertModal },
  data() {
    return { isAwards: false, isAdmin: false, categories: [], current: null, result: null, state: 'loading',
      wall: [], hasSent: false, cert: null, certRank: '冠军', sending: false, text: '', posting: false, rules: false, pickRank: false };
  },
  computed: {
    available() { return RANKS.filter(r => this.result && this.result[r.key]); }
  },
  async created() {
    try { await api.refresh(); } catch (e) { toast(e.message); }
    const s = api.getState();
    this.isAwards = s.config.currentPhase === 'awards';
    this.isAdmin = s.isAdmin;
    this.categories = s.categories;
    this.current = s.categories.find(c => c.id === route.query.cat) || s.categories[0];
    this.loadResult();
    await this.loadWall();
    if (route.query.focus === 'congrats') {
      this.$nextTick(() => document.getElementById('congrats-wall')?.scrollIntoView({ behavior: 'smooth' }));
      if (this.isAwards && !this.hasSent) this.sending = true;
    }
  },
  methods: {
    async loadResult() {
      this.state = 'loading';
      const id = this.current.id;
      try {
        const r = await api.getAwards(id);
        if (this.current.id !== id) return;
        this.result = r ? { champion: fmt(r.champion), runnerUp: fmt(r.runnerUp), thirdPlace: fmt(r.thirdPlace) } : null;
        this.state = !r ? 'pending' : (r.isEmpty ? 'empty' : 'ready');
      } catch (e) { toast(e.message); }
    },
    async loadWall() {
      try {
        const { list, hasSent } = await api.getCongrats();
        this.wall = list.map(c => ({ ...c, masked: maskLdap(c.ownerLdap), time: formatDateTime(c.createdAt) }));
        this.hasSent = hasSent;
      } catch (e) { toast(e.message); }
    },
    pick(c) { this.current = c; this.loadResult(); },
    openCert(key) {
      const rank = RANKS.find(r => r.key === key);
      if (!this.result || !this.result[key]) { toast('暂无该奖项获奖者'); return; }
      this.pickRank = false;
      this.certRank = rank.text;
      this.cert = this.result[key];
    },
    chooseCert() {
      if (this.available.length === 1) this.openCert(this.available[0].key);
      else this.pickRank = true;
    },
    async shareReport() {
      const champ = this.result && this.result.champion;
      const text = champ ? `【${this.current.name}】冠军是 ${champ.petName}！快来看 Pawscars 颁奖典礼` : 'Pawscars 毛孩奥斯卡颁奖典礼';
      const url = `${location.origin}${location.pathname}#/awards?cat=${this.current.id}`;
      try {
        if (navigator.share) await navigator.share({ title: text, url });
        else { await navigator.clipboard.writeText(`${text} ${url}`); toast('链接已复制'); }
      } catch (e) { /* 用户取消 */ }
    },
    async post() {
      const v = validateCongrats(this.text);
      if (!v.valid) { toast(v.message); return; }
      this.posting = true;
      try {
        await api.submitCongrats(this.text);
        toast('祝福已上墙！🎉');
        this.sending = false;
        this.text = '';
        this.loadWall();
      } catch (e) { toast(e.message); } finally { this.posting = false; }
    }
  },
  template: `
    <div>
      <NavBar subtitle="颁奖结果" @rules="rules = true" />
      <div v-if="!isAwards && !isAdmin" class="empty">
        <div class="big-emoji">🎬</div><b>颁奖典礼尚未开始</b>
        <p class="muted">所有投票结束后将在这里揭晓各门类冠亚季军，敬请期待！</p>
      </div>
      <div v-else class="page">
        <div v-if="!isAwards" class="preview-banner">管理员预览 · 普通用户在颁奖阶段开始后才能看到</div>
        <div class="red-carpet">
          <div class="tabs carpet-tabs">
            <button v-for="c in categories" :key="c.id" class="tab" :class="{ on: current && c.id === current.id }"
              :style="current && c.id === current.id ? { background: c.bg, color: c.textColor } : {}" @click="pick(c)">{{ c.icon }} {{ c.name }}</button>
          </div>
          <div v-if="state === 'empty'" class="podium-empty">本门类无人参赛</div>
          <div v-else-if="state === 'pending'" class="podium-empty">结果将在决赛结束后生成</div>
          <div v-else-if="state === 'loading'" class="podium-empty">结果加载中…</div>
          <div v-else class="podium">
            <div v-for="slot in [['runnerUp', '🥈', 'silver', 2], ['champion', '🏆', 'gold', 1], ['thirdPlace', '🥉', 'bronze', 3]]" :key="slot[0]" class="slot">
              <template v-if="result[slot[0]]">
                <div class="medal">{{ slot[1] }}</div>
                <button class="podium-photo" :class="slot[2]" @click="openCert(slot[0])"><img :src="result[slot[0]].photoUrl" :alt="result[slot[0]].petName"></button>
                <div class="podium-name" :class="{ champ: slot[3] === 1 }">{{ result[slot[0]].petName }}</div>
                <div class="podium-owner">主人 {{ result[slot[0]].masked }}</div>
                <div class="podium-score">{{ result[slot[0]].score }}</div>
              </template>
              <div class="step" :class="slot[2]">{{ slot[3] }}</div>
            </div>
          </div>
        </div>
        <div v-if="state === 'ready'" class="stack pad">
          <button class="btn btn-primary block" @click="chooseCert">生成获奖证书</button>
          <button class="btn btn-outline block" @click="shareReport">📣 分享战报</button>
          <div class="muted small center">也可以直接点击领奖台上的毛孩生成证书</div>
        </div>

        <hr class="divider">
        <section id="congrats-wall">
          <div class="wall-head"><b>贺词墙 <span class="muted small">({{ wall.length }}条祝贺)</span></b><span class="muted small">每人限发1条祝福</span></div>
          <div v-if="!wall.length" class="muted center pad">还没有人留言，来当第一个送祝福的人吧！</div>
          <div v-for="m in wall" :key="m.id" class="wall-card"><div>{{ m.content }}</div><div class="wall-meta"><span>{{ m.masked }}</span><span>{{ m.time }}</span></div></div>
          <div v-if="isAwards" class="center pad">
            <button v-if="!hasSent" class="btn btn-outline" @click="sending = true">✍️ 发送贺词</button>
            <span v-else class="done-text">你的祝福已上墙 ✓</span>
          </div>
        </section>
      </div>

      <div v-if="pickRank" class="overlay sheet-overlay" @click.self="pickRank = false">
        <div class="sheet">
          <div class="sheet-title">为谁生成证书？</div>
          <button v-for="r in available" :key="r.key" class="btn btn-outline block" @click="openCert(r.key)">{{ r.text }} · {{ result[r.key].petName }}</button>
        </div>
      </div>
      <div v-if="sending" class="overlay" @click.self="sending = false">
        <div class="modal-card">
          <div class="modal-title">为王者毛孩送上祝贺</div>
          <textarea class="text-input area" v-model="text" maxlength="50" placeholder="写下你对毛孩们的祝福（限50字以内）"></textarea>
          <div class="muted small right">{{ text.length }}/50</div>
          <div class="row-gap">
            <button class="btn btn-outline grow" @click="sending = false">取消</button>
            <button class="btn btn-primary grow" :disabled="posting" @click="post">发送祝福</button>
          </div>
        </div>
      </div>
      <CertModal :visible="!!cert" :entry="cert" :category-name="current && current.name" :rank-text="certRank" @close="cert = null" />
      <RulesModal :visible="rules" @close="rules = false" />
    </div>`
};
