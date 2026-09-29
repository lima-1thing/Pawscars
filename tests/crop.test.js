/**
 * 照片裁剪几何计算测试
 */
const assert = require('assert');
const crop = require('../miniprogram/utils/crop');

console.log('Testing square crop geometry...');

// 横图：短边铺满裁剪框，居中
let s = crop.initialState(4000, 3000, 300);
assert.strictEqual(s.baseScale, 0.1);
assert.deepStrictEqual([s.x, s.y], [-50, 0]);
assert.deepStrictEqual(crop.cropRect(s), { sx: 500, sy: 0, size: 3000 });

// 拖动不能露出空白
s = crop.moveBy(s, 1000, 1000);
assert.deepStrictEqual([s.x, s.y], [0, 0]);
s = crop.moveBy(s, -99999, 0);
assert.deepStrictEqual(crop.cropRect(s), { sx: 1000, sy: 0, size: 3000 });

// 以框中心放大 2 倍：裁剪区域边长减半，中心保持不变
s = crop.zoomTo(crop.initialState(4000, 3000, 300), 2, 150, 150);
assert.deepStrictEqual(crop.cropRect(s), { sx: 1250, sy: 750, size: 1500 });

// 缩放范围 1x ~ 4x
assert.strictEqual(crop.zoomTo(s, 99).zoom, crop.MAX_ZOOM);
assert.strictEqual(crop.zoomTo(s, 0.1).zoom, crop.MIN_ZOOM);

// 竖图拖到底部
s = crop.moveBy(crop.initialState(1000, 2000, 200), 0, -10000);
assert.deepStrictEqual(crop.cropRect(s), { sx: 0, sy: 1000, size: 1000 });

// 已是正方形：默认整图
assert.deepStrictEqual(crop.cropRect(crop.initialState(800, 800, 300)), { sx: 0, sy: 0, size: 800 });

console.log('All crop tests passed!');
