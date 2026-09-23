/**
 * 运行环境配置
 * - USE_CLOUD: true 时所有数据走云开发（多人真实活动）；false 时使用本地 Mock（单机演示）
 * - CLOUD_ENV: 云开发环境 ID；留空则使用开发者工具中为本项目选择的默认环境
 * 开发版/体验版中云开发不可用时会自动退回本地 Mock，正式版不会退回（避免用户把票投到本机）。
 */
module.exports = {
  USE_CLOUD: true,
  CLOUD_ENV: ''
};
