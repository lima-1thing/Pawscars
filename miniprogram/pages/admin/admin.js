const StorageService = require('../../utils/storage');
const { toPickerValues, fromPickerValues, formatDateTime } = require('../../utils/time');

const PHASES = [
  { key: 'nominate', label: '1. 报名期' },
  { key: 'vote_initial', label: '2. 初选划屏' },
  { key: 'vote_match_8', label: '3. 8进4淘汰赛' },
  { key: 'vote_match_4', label: '4. 4强德比' },
  { key: 'awards', label: '5. 颁奖盛典' }
];

const EDITABLE_FIELDS = ['title', 'hostName', 'hostIntro', 'rulesSummary', 'callToActionText', 'rulesDetail'];
const DEV_IDS = ['JENNIFER', 'ZHANG', 'ALICE', 'BOBBY'];

Page({
  data: {
    allowed: false,
    isDevBuild: false,
    phases: PHASES,
    config: null,
    form: {},
    deadlineRows: [],
    categories: [],
    categoryLocked: true,
    stats: null,
    moderationGroups: [],
    congratsItems: [],
    unbindInput: '',
    currentLdap: '',
    devIds: DEV_IDS
  },

  onShow() {
    const app = getApp();
    const allowed = app.canAccessAdmin();
    this.setData({ allowed, isDevBuild: app.isDevBuild() });
    if (allowed) this.loadData();
  },

  loadData() {
    const config = StorageService.getConfig();
    const categories = StorageService.getCategories();
    const user = StorageService.getUserBinding();

    const form = {};
    EDITABLE_FIELDS.forEach(key => { form[key] = config[key] || ''; });

    const deadlineRows = PHASES.filter(p => p.key !== 'awards').map(p => {
      const ts = (config.phaseDeadlines || {})[p.key] || 0;
      return { key: p.key, label: p.label, ...toPickerValues(ts), display: ts ? formatDateTime(ts) : '未设置' };
    });

    const entries = StorageService.getEntries().filter(e => e.status !== 'deleted');
    const moderationGroups = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      entries: entries.filter(e => e.categoryId === cat.id)
    }));

    this.setData({
      config,
      form,
      deadlineRows,
      categories,
      categoryLocked: config.currentPhase !== 'nominate',
      stats: StorageService.getAdminStats(),
      moderationGroups,
      congratsItems: StorageService.getCongrats(),
      currentLdap: user ? user.ldap : ''
    });
  },

  // ---------------- 阶段流转 ----------------
  onChangePhase(e) {
    const { phase } = e.currentTarget.dataset;
    const current = this.data.config.currentPhase;
    if (phase === current) return;

    const order = StorageService.PHASE_ORDER;
    const backward = order.indexOf(phase) < order.indexOf(current);
    const label = PHASES.find(p => p.key === phase).label;
    wx.showModal({
      title: backward ? '确认回退阶段？' : '确认推进阶段？',
      content: backward
        ? `回退到「${label}」会清除之后阶段已生成的对阵和投票记录，且无法恢复。`
        : `推进到「${label}」会结算当前结果并生成对阵表，普通用户将立即看到新阶段。`,
      confirmText: backward ? '确认回退' : '确认推进',
      confirmColor: backward ? '#C0392B' : '#576B95',
      success: (res) => {
        if (!res.confirm) return;
        try {
          StorageService.setPhase(phase);
          wx.showToast({ title: '阶段已切换', icon: 'success' });
          this.loadData();
        } catch (err) {
          wx.showToast({ title: err.message, icon: 'none' });
        }
      }
    });
  },

  // ---------------- 阶段截止时间 ----------------
  onDeadlineChange(e) {
    const { phase, part } = e.currentTarget.dataset;
    const row = this.data.deadlineRows.find(r => r.key === phase);
    const date = part === 'date' ? e.detail.value : row.date;
    const time = part === 'time' ? e.detail.value : row.time;
    const deadlines = { ...(this.data.config.phaseDeadlines || {}), [phase]: fromPickerValues(date, time) };
    StorageService.saveConfig({ phaseDeadlines: deadlines });
    wx.showToast({ title: '截止时间已保存', icon: 'success' });
    this.loadData();
  },

  // ---------------- 活动信息文案 ----------------
  onFormInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onSaveConfig() {
    const { form } = this.data;
    if (!form.title.trim() || !form.hostName.trim()) {
      wx.showToast({ title: '活动标题和主持人昵称不能为空', icon: 'none' });
      return;
    }
    StorageService.saveConfig(form);
    wx.showToast({ title: '活动信息已保存', icon: 'success' });
    this.loadData();
  },

  // ---------------- 门类名称 ----------------
  onEditCategoryName(e) {
    const { id } = e.currentTarget.dataset;
    const newName = e.detail.value.trim();
    const current = this.data.categories.find(c => c.id === id);
    if (!current || newName === current.name) return;
    try {
      StorageService.renameCategory(id, newName);
      wx.showToast({ title: '门类名已保存', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' });
    }
    this.loadData();
  },

  // ---------------- ID 申诉解绑 ----------------
  onUnbindInput(e) {
    this.setData({ unbindInput: e.detail.value });
  },

  onUnbindLdap() {
    const ldap = this.data.unbindInput.trim().toUpperCase();
    if (!ldap) {
      wx.showToast({ title: '请输入要解绑的活动ID', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认解绑',
      content: `解绑后 ${ldap} 可被正确的人重新绑定。请确认已线下核实申诉。`,
      success: (res) => {
        if (!res.confirm) return;
        // 本地演示模式下绑定关系只存在本机；正式环境由云函数 adminOps.unbindUser 执行
        const current = StorageService.getUserBinding();
        if (current && current.ldap === ldap) {
          StorageService.unbindUser();
          getApp().globalData.userBinding = null;
          wx.showToast({ title: `已解绑 ${ldap}`, icon: 'success' });
        } else {
          wx.showToast({ title: '本地模式只能解绑本机身份', icon: 'none' });
        }
        this.setData({ unbindInput: '' });
        this.loadData();
      }
    });
  },

  // ---------------- 违规内容处理（软删除） ----------------
  onDeleteEntry(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除报名',
      content: `软删除「${name}」这条报名？删除后不再参与评选，数据仍保留在后台。`,
      confirmColor: '#C0392B',
      success: (res) => {
        if (!res.confirm) return;
        StorageService.deleteEntry(id);
        wx.showToast({ title: '已删除', icon: 'success' });
        this.loadData();
      }
    });
  },

  onHideCongrats(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认隐藏贺词',
      content: '隐藏后贺词墙不再展示这条留言。',
      confirmColor: '#C0392B',
      success: (res) => {
        if (!res.confirm) return;
        StorageService.deleteCongrats(id);
        wx.showToast({ title: '已隐藏', icon: 'success' });
        this.loadData();
      }
    });
  },

  // ---------------- 开发调试工具（仅开发版/体验版） ----------------
  onSwitchId(e) {
    if (!this.data.isDevBuild) return;
    const { id } = e.currentTarget.dataset;
    getApp().globalData.userBinding = StorageService.bindUser(id);
    wx.showToast({ title: `已切换为 ${id}`, icon: 'success' });
    this.loadData();
  },

  onUnbindCurrent() {
    if (!this.data.isDevBuild) return;
    StorageService.unbindUser();
    getApp().globalData.userBinding = null;
    wx.showToast({ title: '已解绑当前身份', icon: 'none' });
    this.loadData();
  },

  onResetAll() {
    if (!this.data.isDevBuild) return;
    wx.showModal({
      title: '警告',
      content: '将清空所有投票记录并重置为初始演示数据，确认重置？',
      confirmColor: '#C0392B',
      success: (res) => {
        if (!res.confirm) return;
        StorageService.resetAll();
        wx.showToast({ title: '已重置数据', icon: 'success' });
        this.loadData();
      }
    });
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
