const { maskLdap } = require('../../utils/mask');
const api = require('../../utils/api');

// 证书画布的逻辑尺寸（px），导出时按设备像素比放大
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

// 中文逐字换行，返回实际绘制的行数
function fillWrappedText(ctx, text, centerX, y, maxWidth, lineHeight, maxLines) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, centerX, y + i * lineHeight));
  return Math.min(lines.length, maxLines);
}

// 网络图片先下载到本地再绘制（需在小程序后台登记 downloadFile 合法域名）
function resolveImageSrc(src) {
  if (!src || !/^https?:\/\//.test(src)) return Promise.resolve(src);
  return new Promise((resolve) => {
    wx.downloadFile({
      url: src,
      success: (res) => resolve(res.statusCode === 200 ? res.tempFilePath : ''),
      fail: () => resolve('')
    });
  });
}

async function loadImage(canvas, rawSrc) {
  const src = await resolveImageSrc(rawSrc);
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(visible) {
        // 画布在 wx:if 块内，等渲染完成（且 entry 等属性同步到位）后再绘制
        if (visible) setTimeout(() => this.generate(), 50);
      }
    },
    entry: {
      type: Object,
      value: null
    },
    categoryName: {
      type: String,
      value: ''
    },
    rankText: {
      type: String,
      value: '冠军'
    }
  },

  data: {
    certPath: '',
    generating: false,
    failed: false
  },

  methods: {
    generate() {
      const { entry } = this.properties;
      if (!entry) return;
      this.setData({ certPath: '', generating: true, failed: false });

      this.createSelectorQuery()
        .select('#certCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          const canvas = res && res[0] && res[0].node;
          if (!canvas) {
            this.setData({ generating: false, failed: true });
            return;
          }
          try {
            await this.draw(canvas);
            wx.canvasToTempFilePath({
              canvas,
              fileType: 'png',
              success: (out) => this.setData({ certPath: out.tempFilePath, generating: false }),
              fail: () => this.setData({ generating: false, failed: true })
            });
          } catch (e) {
            console.error('证书生成失败', e);
            this.setData({ generating: false, failed: true });
          }
        });
    },

    async draw(canvas) {
      const { entry, categoryName, rankText } = this.properties;
      const config = api.getState().config || {};
      const theme = RANK_THEME[rankText] || RANK_THEME['冠军'];
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;

      canvas.width = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      // 背景：奶油底 + 双层鎏金边框
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

      // 标题区
      ctx.font = '26px sans-serif';
      ctx.fillText('🏆', W / 2, 52);
      ctx.fillStyle = '#5C4A02';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`PAWSCARS ${new Date().getFullYear()}`, W / 2, 78);
      ctx.fillStyle = '#7A6A3A';
      ctx.font = '11px sans-serif';
      ctx.fillText(config.title || 'Pawscars 毛孩奥斯卡', W / 2, 96);

      // 宠物照片（圆角正方形 + 门类色描边）
      const photoSize = 128;
      const px = (W - photoSize) / 2;
      const py = 110;
      ctx.save();
      roundRect(ctx, px, py, photoSize, photoSize, 16);
      ctx.clip();
      const img = await loadImage(canvas, entry.photoUrl);
      if (img) {
        ctx.drawImage(img, px, py, photoSize, photoSize);
      } else {
        ctx.fillStyle = '#F4EEDD';
        ctx.fillRect(px, py, photoSize, photoSize);
        ctx.font = '48px sans-serif';
        ctx.fillText('🐾', W / 2, py + photoSize / 2 + 16);
      }
      ctx.restore();
      ctx.strokeStyle = theme.main;
      ctx.lineWidth = 3;
      roundRect(ctx, px, py, photoSize, photoSize, 16);
      ctx.stroke();

      // 打码角标
      const masked = `主人 ${maskLdap(entry.ownerLdap)}`;
      ctx.font = 'bold 9px sans-serif';
      const badgeW = ctx.measureText(masked).width + 10;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      roundRect(ctx, px + photoSize - badgeW - 6, py + photoSize - 20, badgeW, 14, 4);
      ctx.fill();
      ctx.fillStyle = '#4A3E3D';
      ctx.fillText(masked, px + photoSize - badgeW / 2 - 6, py + photoSize - 10);

      // 宠物名
      ctx.fillStyle = '#2B2625';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(entry.petName, W / 2, py + photoSize + 32);

      // 奖项绶带
      const award = `${categoryName} · ${rankText}`;
      ctx.font = 'bold 13px sans-serif';
      const ribbonW = ctx.measureText(award).width + 36;
      ctx.fillStyle = theme.main;
      roundRect(ctx, (W - ribbonW) / 2, py + photoSize + 44, ribbonW, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(award, W / 2, py + photoSize + 62);
      ctx.fillStyle = theme.main;
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText(theme.label, W / 2, py + photoSize + 84);

      // 颁奖词
      ctx.fillStyle = '#5E5654';
      ctx.font = '11px sans-serif';
      fillWrappedText(ctx, `在 ${config.title || 'Pawscars 毛孩奥斯卡'} 评选中凭借超凡实力与极高人气荣获此殊荣，特发此证以资表彰！`, W / 2, py + photoSize + 106, W - 70, 17, 3);

      // 落款
      ctx.fillStyle = '#7A6A3A';
      ctx.font = '10px sans-serif';
      ctx.fillText(`大会主持人 ${config.hostName || '宫师姐'} 敬颁`, W / 2, H - 30);
    },

    onSaveImage() {
      const { certPath } = this.data;
      if (!certPath) return;
      wx.saveImageToPhotosAlbum({
        filePath: certPath,
        success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: (err) => {
          if (/cancel/.test(err.errMsg || '')) return;
          // 用户曾拒绝相册权限：引导去设置页重新开启
          wx.showModal({
            title: '需要相册权限',
            content: '保存证书需要允许访问相册，是否前往设置开启？',
            confirmText: '去设置',
            success: (res) => { if (res.confirm) wx.openSetting(); }
          });
        }
      });
    },

    onShareImage() {
      const { certPath } = this.data;
      if (!certPath) return;
      if (wx.showShareImageMenu) {
        wx.showShareImageMenu({ path: certPath });
      } else {
        wx.previewImage({ urls: [certPath] }); // 低版本：预览后长按转发
      }
    },

    onRetry() {
      this.generate();
    },

    onClose() {
      this.triggerEvent('close');
    },

    preventD() {}
  }
});
