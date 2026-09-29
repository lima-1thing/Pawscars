import { api } from '../api';
import { go } from '../router';
import { toast } from '../ui';
import { maskLdap } from '../shared';
import NavBar from '../components/nav-bar';

export default {
  name: 'GalleryPage',
  components: { NavBar },
  data() { return { loaded: false, tabs: [], current: '', byCat: {}, viewer: -1, canNominate: false }; },
  computed: {
    entries() { return this.byCat[this.current] || []; },
    total() { return this.tabs.reduce((sum, t) => sum + t.count, 0); },
    viewing() { return this.entries[this.viewer] || null; }
  },
  async created() {
    try {
      const { categories } = await api.getGallery();
      this.byCat = Object.fromEntries(categories.map(c => [c.id, c.entries.map(e => ({ ...e, masked: maskLdap(e.ownerLdap) }))]));
      this.tabs = api.getState().categories.map(c => ({ ...c, count: (this.byCat[c.id] || []).length }));
      this.current = (this.tabs[0] || {}).id;
      this.canNominate = api.isPhaseOpen('nominate');
    } catch (e) { toast(e.message); }
    this.loaded = true;
    window.addEventListener('keydown', this.onKey);
  },
  unmounted() { window.removeEventListener('keydown', this.onKey); },
  methods: {
    step(d) {
      const n = this.entries.length;
      if (n) this.viewer = (this.viewer + d + n) % n;
    },
    onKey(e) {
      if (this.viewer < 0) return;
      if (e.key === 'Escape') this.viewer = -1;
      if (e.key === 'ArrowLeft') this.step(-1);
      if (e.key === 'ArrowRight') this.step(1);
    },
    nominate() { go(api.getState().user ? '/nominate' : '/bind'); }
  },
  template: `
    <div class="with-bottom-bar">
      <NavBar title="已提名的毛孩" :subtitle="'共 ' + total + ' 条提名'" :show-rules="false" />
      <div class="tabs">
        <button v-for="t in tabs" :key="t.id" class="tab" :class="{ on: t.id === current }"
          :style="t.id === current ? { background: t.bg, color: t.textColor } : {}" @click="current = t.id">{{ t.icon }} {{ t.name }} · {{ t.count }}</button>
      </div>
      <div v-if="entries.length" class="gallery-grid">
        <button v-for="(e, i) in entries" :key="e.id" class="photo-tile gallery-tile" @click="viewer = i">
          <img :src="e.photoUrl" :alt="e.petName" loading="lazy">
          <span class="tile-name">{{ e.petName }}</span><span class="tile-mask">{{ e.masked }}</span>
        </button>
      </div>
      <div v-else-if="loaded" class="empty"><div class="big-emoji">🐾</div><span class="muted">这个门类还没有毛孩报名</span></div>
      <p class="muted small center">点击照片可放大查看 · 主人ID已打码</p>

      <div v-if="canNominate" class="bottom-bar"><button class="btn btn-primary block" @click="nominate">我也要提名</button></div>

      <div v-if="viewing" class="overlay viewer" @click.self="viewer = -1">
        <button class="viewer-nav left" aria-label="上一张" @click="step(-1)">‹</button>
        <figure class="viewer-figure">
          <img :src="viewing.photoUrl" :alt="viewing.petName">
          <figcaption>{{ viewing.petName }} · 主人 {{ viewing.masked }} <span class="muted">（{{ viewer + 1 }}/{{ entries.length }}）</span></figcaption>
        </figure>
        <button class="viewer-nav right" aria-label="下一张" @click="step(1)">›</button>
        <button class="viewer-close" aria-label="关闭" @click="viewer = -1">×</button>
      </div>
    </div>`
};
