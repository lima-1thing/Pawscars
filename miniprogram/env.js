/**
 * 运行环境配置
 * - BACKEND: 'gcloud' 时所有数据走 Google Cloud 后台（多人真实活动）；'mock' 时使用本地存储（单机演示）
 * - API_BASE_URL: 后台地址（gcloud-functions 部署后绑定的自有域名，需在小程序后台登记为合法域名）
 *   本地调试可填 'http://localhost:8080'，并在开发者工具中勾选"不校验合法域名"
 * 开发版/体验版中后台不可用时会自动退回本地存储；正式版不会退回（避免用户把票投到本机）。
 */
module.exports = {
  BACKEND: 'gcloud',
  API_BASE_URL: ''
};
