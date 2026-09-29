import { api } from '../api';
import { toast, dialog, withLoading } from '../ui';
import { go } from '../router';
import { validatePetName, formatDateTime, maskLdap } from '../shared';
import NavBar from '../components/nav-bar';
import ImageCropper from '../components/image-cropper';

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export default {
  name: 'NominatePage',
  components: { NavBar, ImageCropper },
  data() {
    return {
      phaseOpen: true, categories: [], selected: {}, petName: '', pledge: false,
      photoBlob: null, photoUrl: '', originalUrl: '', cropSrc: '', cropping: false, submitting: false,
      groups: [], entryCount: 0
    };
  },
  computed: {
    ready() { return !this.missingHint; },
    missingHint() {
      if (!this.photoBlob) return '请先上传毛孩照片';
      const v = validatePetName(this.petName);
      if (!v.valid) return v.message;
      if (!Object.keys(this.selected).length) return '请至少选择一个参赛门类';
      if (!this.pledge) return '请勾选本人拍摄承诺';
      return '';
    }
  },
  created() {
    this.categories = api.getState().categories;
    this.phaseOpen = api.isPhaseOpen('nominate');
    this.loadMine();
  },
  methods: {
    async loadMine() {
      try {
        const entries = await api.getMyNominations();
        this.entryCount = entries.length;
        this.groups = this.categories
          .map(c => ({ ...c, entries: entries.filter(e => e.categoryId === c.id).map(e => ({ ...e, time: formatDateTime(e.updatedAt || e.createdAt), masked: maskLdap(e.ownerLdap) })) }))
          .filter(g => g.entries.length);
      } catch (e) { toast(e.message); }
    },
    pickFile(target) {
      this.cropTarget = target;
      this.$refs.file.value = '';
      this.$refs.file.click();
    },
    onFile(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
      if (file.size > MAX_SOURCE_BYTES) { toast('照片太大了，请换一张'); return; }
      const url = URL.createObjectURL(file);
      if (this.cropTarget.type === 'new') this.originalUrl = url;
      this.cropSrc = url;
      this.cropping = true;
    },
    recrop() {
      this.cropTarget = { type: 'new' };
      this.cropSrc = this.originalUrl;
      this.cropping = true;
    },
    async onCropped(blob) {
      this.cropping = false;
      if (this.cropTarget.type === 'new') {
        this.photoBlob = blob;
        if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
        this.photoUrl = URL.createObjectURL(blob);
        return;
      }
      try {
        await withLoading('上传中', () => api.updateEntryPhoto(this.cropTarget.entryId, blob));
        toast('照片已更新');
        this.loadMine();
      } catch (e) { toast(e.message); }
    },
    toggle(id) {
      const next = { ...this.selected };
      if (next[id]) delete next[id]; else next[id] = true;
      this.selected = next;
    },
    async submit() {
      if (this.submitting) return;
      if (this.missingHint) { toast(this.missingHint); return; }
      this.submitting = true;
      try {
        const res = await withLoading('提交中', () => api.submitNominations({ petName: this.petName, photoBlob: this.photoBlob, categoryIds: Object.keys(this.selected) }));
        this.reset();
        this.loadMine();
        if (res.skippedCategories.length) {
          const added = res.addedEntries.length;
          dialog({ title: added ? '部分门类已提交' : '没有新增提名', content: `该毛孩已经被提名【${res.skippedCategories.join('｜')}】${added ? '，其余选中的门类已成功提交！' : '。'}`, confirmText: '知道了' });
        } else toast('提名成功！');
      } catch (e) { toast(e.message); } finally { this.submitting = false; }
    },
    go,
    reset() {
      this.petName = ''; this.selected = {}; this.pledge = false; this.photoBlob = null; this.photoUrl = ''; this.originalUrl = '';
    }
  },
  template: `
    <div>
      <NavBar title="我要提名" subtitle="提交参赛毛孩" :show-rules="false" />
      <div class="page">
        <div class="right"><button class="link-btn small" @click="go('/gallery')">👀 看看大家都提名了哪些毛孩 ›</button></div>
        <div v-if="!phaseOpen" class="card closed-note"><b>报名已截止</b><span class="muted">下方为你已提交的提名，现已锁定为只读。</span></div>
        <div v-else class="card">
          <div class="field-label">毛孩照片 <span class="muted small">（单张，可拖动缩放裁剪为正方形）</span></div>
          <div class="upload-box" @click="pickFile({ type: 'new' })">
            <img v-if="photoUrl" :src="photoUrl" alt="已选照片"><span v-if="photoUrl" class="change-badge">点击更换</span>
            <div v-else class="upload-placeholder"><div class="big-emoji">📷</div><div>点击上传爱宠靓照</div><div class="muted small">猫猫/狗狗/虚拟AI生成均可</div></div>
          </div>
          <div v-if="photoUrl" class="center"><button class="link-btn" @click="recrop">✂️ 重新裁剪</button></div>

          <div class="field-label">毛孩名字 <span class="req">*</span></div>
          <input class="text-input" v-model="petName" maxlength="20" placeholder="给毛孩起个闪亮的名字 (1-20字)">

          <div class="field-label">参赛门类 <span class="muted small">（可同时勾选多个门类）</span></div>
          <div class="chips">
            <button v-for="c in categories" :key="c.id" class="chip" :class="{ on: selected[c.id] }"
              :style="selected[c.id] ? { background: c.bg, borderColor: c.accentColor, color: c.textColor } : {}" @click="toggle(c.id)">
              {{ c.icon }} {{ c.name }} <span v-if="selected[c.id]">✓</span>
            </button>
          </div>

          <label class="pledge"><input type="checkbox" v-model="pledge"> 我确认这是本人拍摄/生成的毛孩子照片</label>
          <button class="btn btn-primary block" :class="{ dim: !ready }" :disabled="submitting" @click="submit">确认提名</button>
        </div>

        <div v-if="entryCount" class="section">
          <div class="section-title">我提名的毛孩 ({{ entryCount }})</div>
          <div v-for="g in groups" :key="g.id" class="entry-group">
            <div class="group-title" :style="{ color: g.textColor }"><span class="dot" :style="{ background: g.bg }"></span>{{ g.icon }} {{ g.name }}</div>
            <div class="entry-row">
              <div v-for="e in g.entries" :key="e.id" class="mini-entry">
                <div class="photo-tile"><img :src="e.photoUrl" :alt="e.petName"><span class="tile-name">{{ e.petName }}</span><span class="tile-mask">{{ e.masked }}</span></div>
                <div class="muted tiny">{{ e.time }}</div>
                <button v-if="phaseOpen" class="link-btn small" @click="pickFile({ type: 'replace', entryId: e.id })">更换照片</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <input ref="file" type="file" accept="image/*" hidden @change="onFile">
      <ImageCropper :visible="cropping" :src="cropSrc" @confirm="onCropped" @cancel="cropping = false" />
    </div>`
};
