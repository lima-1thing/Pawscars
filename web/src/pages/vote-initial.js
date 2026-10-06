import { api } from '../api';
import { go } from '../router';
import { toast, dialog } from '../ui';
import { maskLdap } from '../shared';
import NavBar from '../components/nav-bar';
import PageFooter from '../components/page-footer';
import RulesModal from '../components/rules-modal';

const MAX_PICKS = 8;

export default {
  name: 'VoteInitialPage',
  components: { NavBar, PageFooter, RulesModal },
  data() { return { phaseOpen: true, rows: [], confirm: false, pending: [], submitting: false, rules: false }; },
  computed: {
    allSubmitted() { return this.rows.length > 0 && this.rows.every(r => !r.needsVote || r.locked); }
  },
  created() { this.load(); },
  methods: {
    async load(keep) {
      try {
        const { phaseOpen, categories } = await api.getInitialState();
        const styles = Object.fromEntries(api.getState().categories.map(c => [c.id, c]));
        this.phaseOpen = phaseOpen;
        this.rows = categories.map(c => {
          const prev = keep && keep[c.id];
          const locked = !!c.mySelection;
          const picks = locked ? c.mySelection : (prev || []);
          return { ...styles[c.id], id: c.id, needsVote: c.needsVote, locked, picks: [...picks], index: 0,
            entries: c.entries.map(e => ({ ...e, masked: maskLdap(e.ownerLdap) })) };
        });
      } catch (e) { toast(e.message); }
    },
    toggle(row, id) {
      if (!row.needsVote) return; // 免初选门类只展示照片
      if (row.locked) { toast('该门类已提交锁定'); return; }
      const i = row.picks.indexOf(id);
      if (i >= 0) row.picks.splice(i, 1);
      else if (row.picks.length >= MAX_PICKS) toast(`每个门类最多选择 ${MAX_PICKS} 张哦`);
      else row.picks.push(id);
    },
    onScroll(row, e) {
      const el = e.target;
      const card = el.firstElementChild;
      if (card) row.index = Math.round(el.scrollLeft / (card.offsetWidth + 12));
    },
    openConfirm() {
      if (!this.phaseOpen) { toast('初选投票已截止'); return; }
      this.pending = this.rows.filter(r => r.needsVote && !r.locked && r.picks.length)
        .map(r => ({ ...r, chosen: r.entries.filter(e => r.picks.includes(e.id)) }));
      if (!this.pending.length) { toast('请至少选择 1 张喜欢的毛孩哦'); return; }
      this.confirm = true;
    },
    async submit() {
      if (this.submitting) return;
      this.submitting = true;
      const failures = [];
      let count = 0;
      for (const r of this.pending) {
        try { await api.submitInitialVote(r.id, r.picks); count++; } catch (e) { failures.push(`${r.name}：${e.message}`); }
      }
      const keep = Object.fromEntries(this.rows.map(r => [r.id, r.picks]));
      this.confirm = false;
      this.submitting = false;
      await this.load(keep);
      if (failures.length) {
        dialog({ title: count ? '部分门类提交失败' : '提交失败', content: `${failures.join('\n')}\n\n未成功的门类已保留你的选择，可稍后重试。`, confirmText: '知道了' });
      } else {
        const toMine = await dialog({ icon: 'images/icon-party.svg', title: '投票成功！', content: `已提交 ${count} 个门类的初选投票，初选截止后将按票数产生 8 强。`, confirmText: '我的提名', cancelText: '留在本页' });
        if (toMine) go('/my');
      }
    },
    go
  },
  template: `
    <div class="with-bottom-bar">
      <NavBar subtitle="初选投票" />
      <div v-if="!phaseOpen" class="closed-banner">初选投票已截止，已提交的选择仍可在下方查看</div>
      <div v-for="row in rows" :key="row.id" class="vote-row">
        <div class="row-head">
          <span class="row-name" :style="{ color: row.textColor }">{{ row.icon }} {{ row.name }}</span>
          <span v-if="!row.needsVote" class="status-pill">免初选</span>
          <span v-else-if="row.locked" class="status-pill tone-good">已提交 ✓</span>
          <span v-else class="muted small">已选 <b>{{ row.picks.length }}</b>/8</span>
        </div>
        <div v-if="!row.needsVote" class="skip-note" :style="{ background: row.bg, color: row.textColor }">
          {{ row.entries.length === 8 ? '角逐提名毛孩正好8名' : '本项角逐提名毛孩不足8名' }}，全员晋级淘汰赛。恭喜各位毛孩晋级！
        </div>
        <template v-if="row.entries.length">
          <div class="swipe" @scroll.passive="onScroll(row, $event)">
            <div v-for="e in row.entries" :key="e.id" class="swipe-card">
              <div class="swipe-name">{{ e.petName }}</div>
              <button class="pet-square" :class="{ picked: row.picks.includes(e.id), readonly: !row.needsVote }" :style="{ background: row.bg }" @click="toggle(row, e.id)">
                <img :src="e.photoUrl" :alt="e.petName" loading="lazy">
                <span v-if="row.needsVote" class="heart">{{ row.picks.includes(e.id) ? '❤️' : '🤍' }}</span>
                <span class="mask-tag">主人 {{ e.masked }}</span>
              </button>
            </div>
          </div>
          <div class="muted small center">第 {{ Math.min(row.index + 1, row.entries.length) }} / {{ row.entries.length }} 位 · 左右滑动浏览{{ row.needsVote ? '，点击照片选择' : '' }}</div>
        </template>
      </div>

      <PageFooter @rules="rules = true" />

      <div v-if="phaseOpen" class="bottom-bar">
        <template v-if="allSubmitted">
          <div class="done-text">✅ 初选已全部提交，等待 8 强揭晓</div>
          <button class="btn btn-outline block" @click="go('/my')">查看我的提名</button>
        </template>
        <button v-else class="btn btn-primary block" @click="openConfirm">选好了！冲鸭</button>
      </div>

      <div v-if="confirm" class="overlay sheet-overlay" @click.self="confirm = false">
        <div class="sheet">
          <div class="sheet-title">确认提交初选</div>
          <div class="muted small center">每个门类提交后即锁定，不可更改</div>
          <div class="sheet-body">
            <div v-for="g in pending" :key="g.id" class="confirm-group">
              <div class="group-title" :style="{ color: g.textColor }">{{ g.name }} · {{ g.chosen.length }} 张</div>
              <div class="thumbs"><div v-for="e in g.chosen" :key="e.id" class="thumb"><img :src="e.photoUrl" :alt="e.petName"><span>{{ e.petName }}</span></div></div>
            </div>
          </div>
          <div class="row-gap">
            <button class="btn btn-outline grow" @click="confirm = false">返回修改</button>
            <button class="btn btn-primary grow" :disabled="submitting" @click="submit">{{ submitting ? '提交中…' : '确认提交' }}</button>
          </div>
        </div>
      </div>
      <RulesModal :visible="rules" @close="rules = false" />
    </div>`
};
