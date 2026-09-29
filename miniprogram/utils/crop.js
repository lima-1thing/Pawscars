/**
 * 正方形裁剪的几何计算（纯函数，便于测试）
 * 坐标系：裁剪框左上角为原点，边长 frame；图片左上角位于 (x, y)，显示尺寸 = 原图尺寸 × baseScale × zoom
 */

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/**
 * 初始状态：图片按"铺满"方式缩放（短边等于裁剪框），居中
 */
function initialState(imgW, imgH, frame) {
  const baseScale = frame / Math.min(imgW, imgH);
  const w = imgW * baseScale;
  const h = imgH * baseScale;
  return { imgW, imgH, frame, baseScale, zoom: 1, x: (frame - w) / 2, y: (frame - h) / 2 };
}

const displaySize = (s) => ({ w: s.imgW * s.baseScale * s.zoom, h: s.imgH * s.baseScale * s.zoom });

/**
 * 限制位置：图片必须始终完整覆盖裁剪框（不露出空白）
 */
function clamp(s) {
  const { w, h } = displaySize(s);
  return {
    ...s,
    x: Math.min(0, Math.max(s.frame - w, s.x)),
    y: Math.min(0, Math.max(s.frame - h, s.y))
  };
}

function moveBy(s, dx, dy) {
  return clamp({ ...s, x: s.x + dx, y: s.y + dy });
}

/**
 * 以裁剪框内某点为中心缩放（该点下的图片内容保持不动）
 */
function zoomTo(s, zoom, anchorX = s.frame / 2, anchorY = s.frame / 2) {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const ratio = next / s.zoom;
  return clamp({
    ...s,
    zoom: next,
    x: anchorX - (anchorX - s.x) * ratio,
    y: anchorY - (anchorY - s.y) * ratio
  });
}

/**
 * 裁剪框对应的原图区域（原图像素坐标）
 */
function cropRect(s) {
  const scale = s.baseScale * s.zoom;
  const size = Math.min(s.frame / scale, s.imgW, s.imgH);
  const sx = Math.min(Math.max(0, -s.x / scale), s.imgW - size);
  const sy = Math.min(Math.max(0, -s.y / scale), s.imgH - size);
  return { sx, sy, size };
}

module.exports = { MIN_ZOOM, MAX_ZOOM, initialState, displaySize, clamp, moveBy, zoomTo, cropRect };
