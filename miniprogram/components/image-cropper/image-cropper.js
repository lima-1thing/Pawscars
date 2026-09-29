/**
 * 正方形图片裁剪器：拖动调整位置，双指或滑块缩放，导出正方形 JPG
 * 用法：<image-cropper visible="{{...}}" src="{{临时路径}}" bind:confirm="..." bind:cancel="..." />
 * confirm 事件 detail: { path }
 */
const { initialState, displaySize, moveBy, zoomTo, cropRect, MIN_ZOOM, MAX_ZOOM } = require('../../utils/crop');

const MAX_OUTPUT = 1080; // 导出边长上限（像素）

const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

Component({
  // 使用 app.wxss 中的全局样式（如 paw-btn 按钮）
  options: { addGlobalClass: true },

  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(visible) {
        if (visible) this.load();
      }
    },
    src: {
      type: String,
      value: ''
    }
  },

  data: {
    frame: 300,
    loading: true,
    exporting: false,
    imgStyle: '',
    zoomPercent: 100,
    minZoom: MIN_ZOOM * 100,
    maxZoom: MAX_ZOOM * 100
  },

  methods: {
    load() {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const frame = Math.min(win.windowWidth - 48, 360);
      this.setData({ frame, loading: true, imgStyle: '' });

      wx.getImageInfo({
        src: this.properties.src,
        success: (info) => {
          this.crop = initialState(info.width, info.height, frame);
          this.render();
          this.setData({ loading: false });
          // 记录裁剪框位置，双指缩放时换算触点坐标
          this.createSelectorQuery().select('.crop-frame').boundingClientRect(rect => {
            this.frameRect = rect;
          }).exec();
        },
        fail: () => {
          wx.showToast({ title: '图片读取失败，请换一张', icon: 'none' });
          this.triggerEvent('cancel');
        }
      });
    },

    render() {
      const { w, h } = displaySize(this.crop);
      this.setData({
        imgStyle: `width:${w}px;height:${h}px;transform:translate(${this.crop.x}px,${this.crop.y}px);`,
        zoomPercent: Math.round(this.crop.zoom * 100)
      });
    },

    onTouchStart(e) {
      if (!this.crop) return;
      const t = e.touches;
      this.gesture = t.length >= 2
        ? { type: 'pinch', startDist: distance(t[0], t[1]), startZoom: this.crop.zoom }
        : { type: 'drag', lastX: t[0].clientX, lastY: t[0].clientY };
    },

    onTouchMove(e) {
      if (!this.crop || !this.gesture) return;
      const t = e.touches;
      if (this.gesture.type === 'pinch' && t.length >= 2) {
        const rect = this.frameRect || { left: 0, top: 0 };
        const midX = (t[0].clientX + t[1].clientX) / 2 - rect.left;
        const midY = (t[0].clientY + t[1].clientY) / 2 - rect.top;
        const zoom = this.gesture.startZoom * (distance(t[0], t[1]) / this.gesture.startDist);
        this.crop = zoomTo(this.crop, zoom, midX, midY);
      } else if (this.gesture.type === 'drag' && t.length === 1) {
        this.crop = moveBy(this.crop, t[0].clientX - this.gesture.lastX, t[0].clientY - this.gesture.lastY);
        this.gesture.lastX = t[0].clientX;
        this.gesture.lastY = t[0].clientY;
      }
      this.render();
    },

    onTouchEnd(e) {
      // 双指变单指时重新开始拖动，避免跳动
      if (e.touches.length === 1) this.onTouchStart(e);
      else this.gesture = null;
    },

    onZoomSlider(e) {
      if (!this.crop) return;
      this.crop = zoomTo(this.crop, e.detail.value / 100);
      this.render();
    },

    onReset() {
      if (!this.crop) return;
      this.crop = initialState(this.crop.imgW, this.crop.imgH, this.crop.frame);
      this.render();
    },

    onCancel() {
      this.triggerEvent('cancel');
    },

    onConfirm() {
      if (!this.crop || this.data.exporting) return;
      this.setData({ exporting: true });
      const { sx, sy, size } = cropRect(this.crop);
      const out = Math.max(1, Math.min(MAX_OUTPUT, Math.round(size)));

      this.createSelectorQuery().select('#cropCanvas').fields({ node: true }).exec((res) => {
        const canvas = res && res[0] && res[0].node;
        if (!canvas) return this.fail();
        canvas.width = out;
        canvas.height = out;
        const ctx = canvas.getContext('2d');
        const img = canvas.createImage();
        img.onload = () => {
          ctx.drawImage(img, sx, sy, size, size, 0, 0, out, out);
          wx.canvasToTempFilePath({
            canvas,
            fileType: 'jpg',
            quality: 0.9,
            destWidth: out,
            destHeight: out,
            success: (r) => {
              this.setData({ exporting: false });
              this.triggerEvent('confirm', { path: r.tempFilePath });
            },
            fail: () => this.fail()
          });
        };
        img.onerror = () => this.fail();
        img.src = this.properties.src;
      });
    },

    fail() {
      this.setData({ exporting: false });
      wx.showToast({ title: '裁剪失败，请重试', icon: 'none' });
    },

    noop() {}
  }
});
