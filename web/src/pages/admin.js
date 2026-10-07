import { api } from '../api';
import { go } from '../router';
import { toast, confirmDialog, withLoading } from '../ui';
import { formatDateTime } from '../shared';
import NavBar from '../components/nav-bar';

const PHASES = [
  { key: 'nominate', label: '1. 报名期' }, { key: 'vote_initial', label: '2. 初选（选出8强）' },
  { key: 'vote_final', label: '3. 决赛（8强PK）' }, { key: 'awards', label: '4. 颁奖盛典' }
];
const DEADLINE_LABELS = { nominate: '报名截止', vote_initial: '初选截止', vote_final: '决赛截止' };
const EDITABLE = ['title', 'hostName', 'hostIntro', 'rulesSummary', 'callToActionText', 'rulesDetail'];
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export default {
  name: 'AdminPage',
  components: { NavBar },
  data() { return { allowed: false, phases: PHASES, labels: DEADLINE_LABELS, config: {}, form: {}, deadlines: {}, categories: [], stats: null, entries: [], congrats: [], unbind: '' }; },
  created() {
    this.allowed = api.getState().isAdmin;
    if (this.allowed) this.load();
  },
  methods: {
    async load() {
      try {
        await api.refresh();
        const o = await api.admin('getOverview');
        const s = api.getState();
        this.config = s.config;
        this.categories = s.categories.map(c => ({ ...c, draft: c.name }));
        this.form = Object.fromEntries(EDITABLE.map(k => [k, s.config[k] || '']));
        this.deadlines = Object.fromEntries(PHASES.slice(0, 3).map(p => [p.key, toLocalInput((s.config.phaseDeadlines || {})[p.key])]));
        this.stats = o.stats;
        this.entries = o.entries;
        this.congrats = o.congrats;
      } catch (e) { toast(e.message); }
    },
    async run(action, payload, okText) {
      try {
        await withLoading('处理中', () => api.admin(action, payload));
        toast(okText);
        await this.load();
        return true;
      } catch (e) { toast(e.message); return false; }
    },
    async setPhase(p) {
      if (p.key === this.config.currentPhase) return;
      const order = PHASES.map(x => x.key);
      const backward = order.indexOf(p.key) < order.indexOf(this.config.currentPhase);
      const ok = await confirmDialog({
        title: backward ? '确认回退阶段？' : '确认推进阶段？',
        content: backward ? `回退到「${p.label}」会清除之后阶段已生成的对阵和投票记录，且无法恢复。` : `推进到「${p.label}」会结算当前结果并生成对阵表，普通用户将立即看到新阶段。`,
        confirmText: backward ? '确认回退' : '确认推进', danger: backward
      });
      if (ok) this.run('setPhase', { targetPhase: p.key }, '阶段已切换');
    },
    saveDeadline(key) {
      const value = this.deadlines[key];
      const phaseDeadlines = { ...(this.config.phaseDeadlines || {}), [key]: value ? new Date(value).getTime() : 0 };
      this.run('updateConfig', { phaseDeadlines }, value ? '截止时间已保存' : '已清除截止时间');
    },
    saveConfig() {
      if (!this.form.title.trim() || !this.form.hostName.trim()) { toast('活动标题和主持人昵称不能为空'); return; }
      this.run('updateConfig', { ...this.form }, '活动信息已保存');
    },
    rename(c) {
      if (c.draft.trim() && c.draft.trim() !== c.name) this.run('renameCategory', { categoryId: c.id, name: c.draft.trim() }, '门类名已保存');
    },
    async onAvatar(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try { await withLoading('上传中', () => api.uploadHostAvatar(file)); toast('头像已更新'); this.load(); } catch (err) { toast(err.message); }
    },
    async doUnbind() {
      const ldap = this.unbind.trim().toUpperCase();
      if (!ldap) { toast('请输入要解绑的活动ID'); return; }
      if (await confirmDialog({ title: '确认解绑', content: `解绑后 ${ldap} 可被正确的人重新绑定。请确认已线下核实申诉。` })) {
        if (await this.run('unbindUser', { ldap }, `已解绑 ${ldap}`)) this.unbind = '';
      }
    },
    async delEntry(e) {
      if (await confirmDialog({ title: '确认删除报名', content: `软删除「${e.petName}」这条报名？删除后不再参与评选，数据仍保留在后台。`, danger: true })) {
        this.run('softDeleteEntry', { entryId: e.id }, '已删除');
      }
    },
    async hideMsg(m) {
      if (await confirmDialog({ title: '确认隐藏贺词', content: '隐藏后贺词墙不再展示这条留言。', danger: true })) this.run('softDeleteCongrats', { msgId: m.id }, '已隐藏');
    },
    entriesOf(id) { return this.entries.filter(e => e.categoryId === id); },
    formatDateTime,
    go
  },
  template: `
    <div>
      <NavBar title="Pawscars 管理后台" subtitle="赛程控制与运维" />
      <div v-if="!allowed" class="empty"><div class="big-emoji">🔒</div><b>仅限活动管理员访问</b><button class="btn btn-primary" @click="go('/')">返回首页</button></div>
      <div v-else class="page">
        <div class="card">
          <div class="card-title">⚙️ 活动阶段推进控制</div>
          <div class="phase-grid"><button v-for="p in phases" :key="p.key" class="phase-btn" :class="{ on: config.currentPhase === p.key }" @click="setPhase(p)">{{ p.label }}</button></div>
          <p class="muted small">推进阶段会自动结算上一阶段并生成固定对阵表；回退会清除之后阶段的对阵与投票。</p>
        </div>
        <div class="card">
          <div class="card-title">⏰ 各阶段截止时间</div>
          <p class="muted small">过了截止时间将拒绝报名/投票，定时任务每 10 分钟检查一次并自动推进到下一阶段。</p>
          <div v-for="p in phases.slice(0, 3)" :key="p.key" class="deadline-row">
            <span class="grow small"><b>{{ labels[p.key] }}</b></span>
            <input class="text-input dt" type="datetime-local" v-model="deadlines[p.key]" @change="saveDeadline(p.key)">
          </div>
        </div>
        <div v-if="stats" class="card">
          <div class="card-title">📊 赛事数据看板</div>
          <div class="metrics">
            <div><b>{{ stats.totalEntries }}</b><span>有效报名</span></div><div><b>{{ stats.totalVoters }}</b><span>投票人数</span></div>
            <div><b>{{ stats.totalFinalVotes }}</b><span>决赛票数</span></div><div><b>{{ stats.totalCongrats }}</b><span>贺词</span></div>
          </div>
          <div v-for="c in stats.perCategory" :key="c.id" class="stat-row"><b>{{ c.name }}</b><span>{{ c.entryCount }} 位参赛 · 初选 {{ c.initialVoterCount }} 人 · 决赛 {{ c.finalVoterCount }} 人</span></div>
        </div>
        <div class="card">
          <div class="card-title">📝 活动信息与文案</div>
          <div class="field-label">主持人头像</div>
          <label class="avatar-row"><img v-if="config.hostAvatar" :src="config.hostAvatar" class="host-avatar" alt=""><span class="link-btn">更换头像</span><input type="file" accept="image/jpeg,image/png" hidden @change="onAvatar"></label>
          <div class="field-label">活动主标题</div><input class="text-input" v-model="form.title" maxlength="20">
          <div class="field-label">主持人昵称</div><input class="text-input" v-model="form.hostName" maxlength="10">
          <div class="field-label">首页开场白</div><textarea class="text-input area" v-model="form.hostIntro" maxlength="200"></textarea>
          <div class="field-label">赛制一句话</div><input class="text-input" v-model="form.rulesSummary" maxlength="40">
          <div class="field-label">结尾号召语</div><input class="text-input" v-model="form.callToActionText" maxlength="40">
          <div class="field-label">比赛规则（投票页"比赛规则"弹窗）</div><textarea class="text-input area tall" v-model="form.rulesDetail" maxlength="2000"></textarea>
          <button class="btn btn-primary block" @click="saveConfig">保存活动信息</button>
        </div>
        <div class="card">
          <div class="card-title">🏷️ 三大门类名称</div>
          <p class="muted small">门类固定为三个，任何阶段都可以改名（已报名和投票不受影响）。建议 4 个字：首页卡片分两行显示，每行两个字。</p>
          <div v-for="c in categories" :key="c.id" class="cat-edit"><span>{{ c.icon }}</span><input class="text-input" v-model="c.draft" maxlength="10" @blur="rename(c)"></div>
        </div>
        <div class="card">
          <div class="card-title">🆔 活动ID 申诉处理</div>
          <p class="muted small">线下核实申诉后，解绑被误占用的ID，让正确的人重新绑定。</p>
          <div class="row-gap"><input class="text-input grow" v-model="unbind" placeholder="输入要解绑的活动ID"><button class="btn btn-outline" @click="doUnbind">解绑</button></div>
        </div>
        <div class="card">
          <div class="card-title">🛡️ 违规报名与贺词</div>
          <div v-for="c in categories" :key="c.id">
            <div class="group-title">{{ c.name }}（{{ entriesOf(c.id).length }}）</div>
            <div v-for="e in entriesOf(c.id)" :key="e.id" class="mod-row"><img :src="e.photoUrl" alt=""><span class="grow">{{ e.petName }} · {{ e.ownerLdap }}</span><button class="link-btn danger" @click="delEntry(e)">删除</button></div>
          </div>
          <div class="group-title">贺词（{{ congrats.length }}）</div>
          <div v-for="m in congrats" :key="m.id" class="mod-row"><span class="grow">{{ m.content }} — {{ m.ownerLdap }}</span><button class="link-btn danger" @click="hideMsg(m)">隐藏</button></div>
        </div>
      </div>
    </div>`
};
