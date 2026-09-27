/**
 * 正方形照片裁剪（网页版）：拖动定位，双指 / 滚轮 / 滑块缩放，导出 ≤1080px 的 JPG
 * 几何计算与小程序共用 miniprogram/utils/crop.js
 */
import { crop } from '../shared';

const MAX_OUTPUT = 1080;

export default {
  name: 'ImageCropper',
  props: { visible: Boolean, src: String },
  emits: ['confirm', 'cancel'],
  data() {
    return { frame: 300, s: null, exporting: false, minZoom: crop.MIN_ZOOM * 100, maxZoom: crop.MAX_ZOOM * 100 };
  },
  computed: {
    imgStyle() {
      if (!this.s) return {};
      const { w, h } = crop.displaySize(this.s);
      return { width: `${w}px`, height: `${h}px`, transform: `translate(${this.s.x}px, ${this.s.y}px)` };
    },
    zoomPercent() { return this.s ? Math.round(this.s.zoom * 100) : 100; }
  },
  watch: {
    visible: { immediate: true, handler(v) { if (v) this.load(); } }
  },
  methods: {
    load() {
      this.s = null;
      this.pointers = new Map();
      this.frame = Math.min(window.innerWidth - 48, 360);
      const img = new Image();
      img.onload = () => {
        this.img = img;
        this.s = crop.initialState(img.naturalWidth, img.naturalHeight, this.frame);
      };
      img.onerror = () => this.$emit('cancel');
      img.src = this.src;
    },
    local(e) {
      const rect = this.$refs.frame.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    onPointerDown(e) {
      if (!this.s) return;
      this.$refs.frame.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, this.local(e));
      this.startPinch();
    },
    startPinch() {
      const pts = [...this.pointers.values()];
      this.pinch = pts.length >= 2 ? { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom: this.s.zoom } : null;
    },
    onPointerMove(e) {
      if (!this.s || !this.pointers.has(e.pointerId)) return;
      const prev = this.pointers.get(e.pointerId);
      const cur = this.local(e);
      this.pointers.set(e.pointerId, cur);
      const pts = [...this.pointers.values()];
      if (pts.length >= 2 && this.pinch) {
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.s = crop.zoomTo(this.s, this.pinch.zoom * dist / this.pinch.dist, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      } else if (pts.length === 1) {
        this.s = crop.moveBy(this.s, cur.x - prev.x, cur.y - prev.y);
      }
    },
    onPointerUp(e) {
      this.pointers.delete(e.pointerId);
      this.startPinch();
    },
    onWheel(e) {
      if (!this.s) return;
      const p = this.local(e);
      this.s = crop.zoomTo(this.s, this.s.zoom * (1 - e.deltaY * 0.0015), p.x, p.y);
    },
    onSlider(e) {
      if (this.s) this.s = crop.zoomTo(this.s, Number(e.target.value) / 100);
    },
    reset() {
      if (this.s) this.s = crop.initialState(this.s.imgW, this.s.imgH, this.frame);
    },
    confirm() {
      if (!this.s || this.exporting) return;
      this.exporting = true;
      const { sx, sy, size } = crop.cropRect(this.s);
      const out = Math.max(1, Math.min(MAX_OUTPUT, Math.round(size)));
      const canvas = document.createElement('canvas');
      canvas.width = out;
      canvas.height = out;
      canvas.getContext('2d').drawImage(this.img, sx, sy, size, size, 0, 0, out, out);
      canvas.toBlob(blob => {
        this.exporting = false;
        if (blob) this.$emit('confirm', blob);
      }, 'image/jpeg', 0.9);
    }
  },
  template: `
    <div v-if="visible" class="cropper-mask">
      <div class="cropper-title">调整照片</div>
      <div class="cropper-hint">拖动调整位置，双指、滚轮或滑块缩放；框内即为展示的正方形照片</div>
      <div ref="frame" class="crop-frame" :style="{ width: frame + 'px', height: frame + 'px' }"
        @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
        @wheel.prevent="onWheel">
        <img v-if="s" class="crop-image" :src="src" :style="imgStyle" draggable="false" alt="">
        <div v-else class="crop-loading">加载中…</div>
        <div class="grid-line grid-v1"></div><div class="grid-line grid-v2"></div>
        <div class="grid-line grid-h1"></div><div class="grid-line grid-h2"></div>
      </div>
      <div class="zoom-row" :style="{ width: frame + 'px' }">
        <span>－</span>
        <input class="zoom-slider" type="range" :min="minZoom" :max="maxZoom" step="1" :value="zoomPercent" @input="onSlider" aria-label="缩放">
        <span>＋</span>
      </div>
      <div class="cropper-actions" :style="{ width: frame + 'px' }">
        <button class="btn btn-outline" @click="$emit('cancel')">取消</button>
        <button class="btn btn-outline" @click="reset">还原</button>
        <button class="btn btn-primary" :disabled="exporting" @click="confirm">{{ exporting ? '处理中…' : '确定' }}</button>
      </div>
    </div>`
};
