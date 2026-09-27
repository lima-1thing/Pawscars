/**
 * 获奖证书（网页版）：Canvas 绘制，与小程序 components/cert-modal 版式一致
 */
import { api } from '../api';
import { maskLdap } from '../shared';

const W = 300;
const H = 420;
const RANK_THEME = {
  冠军: { main: '#C9962B', light: '#FFF4D6', label: 'CHAMPION' },
  亚军: { main: '#8C96A3', light: '#F1F3F6', label: 'RUNNER-UP' },
  季军: { main: '#B0703C', light: '#FBEBDD', label: 'THIRD PLACE' }
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillWrappedText(ctx, text, centerX, y, maxWidth, lineHeight, maxLines) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) { lines.push(line); line = ch; } else line += ch;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, centerX, y + i * lineHeight));
}

// 照片存储桶已配置跨域读取，canvas 才能导出图片
function loadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export default {
  name: 'CertModal',
  props: { visible: Boolean, entry: Object, categoryName: String, rankText: String },
  emits: ['close'],
  data() { return { dataUrl: '', failed: false }; },
  computed: {
    canShare() { return typeof navigator !== 'undefined' && !!navigator.share; }
  },
  watch: {
    visible: { immediate: true, handler(v) { if (v) this.generate(); } }
  },
  methods: {
    async generate() {
      this.dataUrl = '';
      this.failed = false;
      try {
        this.dataUrl = await this.draw();
      } catch (e) {
        console.error(e);
        this.failed = true;
      }
    },
    async draw() {
      const { entry, categoryName, rankText } = this;
      const config = api.getState().config || {};
      const theme = RANK_THEME[rankText] || RANK_THEME['冠军'];
      const dpr = Math.min(window.devicePixelRatio || 2, 3);
      const canvas = document.createElement('canvas');
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.textAlign = 'center';
      const font = (size, bold) => `${bold ? 'bold ' : ''}${size}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#FFFDF8');
      bg.addColorStop(1, theme.light);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = theme.main;
      ctx.lineWidth = 3;
      roundRect(ctx, 10, 10, W - 20, H - 20, 14);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      roundRect(ctx, 17, 17, W - 34, H - 34, 10);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = font(26);
      ctx.fillText('🏆', W / 2, 52);
      ctx.fillStyle = '#5C4A02';
      ctx.font = font(18, true);
      ctx.fillText(`PAWSCARS ${new Date().getFullYear()}`, W / 2, 78);
      ctx.fillStyle = '#7A6A3A';
      ctx.font = font(11);
      ctx.fillText(config.title || 'Pawscars 毛孩奥斯卡', W / 2, 96);

      const size = 128;
      const px = (W - size) / 2;
      const py = 110;
      ctx.save();
      roundRect(ctx, px, py, size, size, 16);
      ctx.clip();
      const img = await loadImage(entry.photoUrl);
      if (img) ctx.drawImage(img, px, py, size, size);
      else { ctx.fillStyle = '#F4EEDD'; ctx.fillRect(px, py, size, size); ctx.font = font(48); ctx.fillText('🐾', W / 2, py + size / 2 + 16); }
      ctx.restore();
      ctx.strokeStyle = theme.main;
      ctx.lineWidth = 3;
      roundRect(ctx, px, py, size, size, 16);
      ctx.stroke();

      const masked = `主人 ${maskLdap(entry.ownerLdap)}`;
      ctx.font = font(9, true);
      const badgeW = ctx.measureText(masked).width + 10;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      roundRect(ctx, px + size - badgeW - 6, py + size - 20, badgeW, 14, 4);
      ctx.fill();
      ctx.fillStyle = '#4A3E3D';
      ctx.fillText(masked, px + size - badgeW / 2 - 6, py + size - 10);

      ctx.fillStyle = '#2B2625';
      ctx.font = font(20, true);
      ctx.fillText(entry.petName, W / 2, py + size + 32);

      const award = `${categoryName} · ${rankText}`;
      ctx.font = font(13, true);
      const ribbonW = ctx.measureText(award).width + 36;
      ctx.fillStyle = theme.main;
      roundRect(ctx, (W - ribbonW) / 2, py + size + 44, ribbonW, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(award, W / 2, py + size + 62);
      ctx.fillStyle = theme.main;
      ctx.font = font(8, true);
      ctx.fillText(theme.label, W / 2, py + size + 84);

      ctx.fillStyle = '#5E5654';
      ctx.font = font(11);
      fillWrappedText(ctx, `在 ${config.title || 'Pawscars 毛孩奥斯卡'} 评选中凭借超凡实力与极高人气荣获此殊荣，特发此证以资表彰！`, W / 2, py + size + 106, W - 70, 17, 3);
      ctx.fillStyle = '#7A6A3A';
      ctx.font = font(10);
      ctx.fillText(`大会主持人 ${config.hostName || '宫师姐'} 敬颁`, W / 2, H - 30);
      return canvas.toDataURL('image/png');
    },
    fileName() { return `pawscars-${this.entry.petName}-${this.rankText}.png`; },
    async share() {
      try {
        const blob = await (await fetch(this.dataUrl)).blob();
        const file = new File([blob], this.fileName(), { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Pawscars 获奖证书' });
        else await navigator.share({ title: 'Pawscars 获奖证书', url: location.href });
      } catch (e) { /* 用户取消分享 */ }
    }
  },
  template: `
    <div v-if="visible" class="overlay" @click.self="$emit('close')">
      <div class="cert-dialog">
        <div class="cert-preview">
          <img v-if="dataUrl" :src="dataUrl" alt="获奖证书" class="cert-image">
          <div v-else class="cert-placeholder">
            <template v-if="failed">证书生成失败 <button class="link-btn" @click="generate">点击重试</button></template>
            <template v-else>证书生成中…</template>
          </div>
        </div>
        <div class="row-gap">
          <a class="btn btn-primary grow" :class="{ disabled: !dataUrl }" :href="dataUrl || undefined" :download="fileName()">保存图片</a>
          <button v-if="canShare" class="btn btn-outline grow" :disabled="!dataUrl" @click="share">分享证书</button>
        </div>
        <div class="cert-tip">手机上也可以长按证书图片保存</div>
        <button class="close-link" @click="$emit('close')">关闭</button>
      </div>
    </div>`
};
