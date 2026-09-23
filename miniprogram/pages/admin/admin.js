const api = require('../../utils/api');
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
const PHASE_ORDER = PHASES.map(p => p.key);
const DEV_IDS = ['JENNIFER', 'ZHANG', 'ALICE', 'BOBBY'];

Page({
  data: {
    allowed: false,
    isDevBuild: false,
    isMockMode: true,
    hostAvatar: '',
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

  async onShow() {
    try {
      await getApp().ready;
    } catch (e) {
      return;
    }
    const app = getApp();
    const allowed = app.canAccessAdmin();
    this.setData({ allowed, isDevBuild: app.isDevBuild(), isMockMode: api.getMode() === 'mock' });
    if (allowed) this.loadData();
  },

  async loadData() {
    let overview;
    try {
      await api.refresh();
      overview = await api.admin('getOverview');
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      return;
    }
    const { config, categories, user } = api.getState();

    const form = {};
    EDITABLE_FIELDS.forEach(key => { form[key] = config[key] || ''; });

    const deadlineRows = PHASES.filter(p => p.key !== 'awards').map(p => {
      const ts = (config.phaseDeadlines || {})[p.key] || 0;
      return { key: p.key, label: p.label, ...toPickerValues(ts), display: ts ? formatDateTime(ts) : '未设置' };
    });

    this.setData({
      config,
      form,
      hostAvatar: config.hostAvatar || '',
      deadlineRows,
      categories,
      categoryLocked: config.currentPhase !== 'nominate',
      stats: overview.stats,
      moderationGroups: categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        entries: overview.entries.filter(e => e.categoryId === cat.id)
      })),
      congratsItems: overview.congrats,
      currentLdap: user ? user.ldap : ''
    });
  },

  // 统一执行管理员操作：loading → 成功提示 → 刷新
  async runAdmin(action, payload, successText) {
    wx.showLoading({ title: '处理中', mask: true });
    try {
      await api.admin(action, payload);
      wx.hideLoading();
      wx.showToast({ title: successText, icon: 'success' });
      await this.loadData();
      return true;
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '操作失败', icon: 'none' });
      return false;
    }
  },

  // ---------------- 阶段流转 ----------------
  onChangePhase(e) {
    const { phase } = e.currentTarget.dataset;
    const current = this.data.config.currentPhase;
    if (phase === current) return;

    const backward = PHASE_ORDER.indexOf(phase) < PHASE_ORDER.indexOf(current);
    const label = PHASES.find(p => p.key === phase).label;
    wx.showModal({
      title: backward ? '确认回退阶段？' : '确认推进阶段？',
      content: backward
        ? `回退到「${label}」会清除之后阶段已生成的对阵和投票记录，且无法恢复。`
        : `推进到「${label}」会结算当前结果并生成对阵表，普通用户将立即看到新阶段。`,
      confirmText: backward ? '确认回退' : '确认推进',
      confirmColor: backward ? '#C0392B' : '#576B95',
      success: (res) => {
        if (res.confirm) this.runAdmin('setPhase', { targetPhase: phase }, '阶段已切换');
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
    this.runAdmin('updateConfig', { phaseDeadlines: deadlines }, '截止时间已保存');
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
    this.runAdmin('updateConfig', form, '活动信息已保存');
  },

  onChooseHostAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        wx.showLoading({ title: '上传中', mask: true });
        try {
          await api.uploadHostAvatar(file.tempFilePath);
          wx.hideLoading();
          wx.showToast({ title: '头像已更新', icon: 'success' });
          this.loadData();
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: e.message || '上传失败', icon: 'none' });
        }
      }
    });
  },

  // ---------------- 门类名称 ----------------
  onEditCategoryName(e) {
    const { id } = e.currentTarget.dataset;
    const newName = e.detail.value.trim();
    const current = this.data.categories.find(c => c.id === id);
    if (!current || newName === current.name) return;
    this.runAdmin('renameCategory', { categoryId: id, name: newName }, '门类名已保存');
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
      success: async (res) => {
        if (!res.confirm) return;
        if (await this.runAdmin('unbindUser', { ldap }, `已解绑 ${ldap}`)) {
          this.setData({ unbindInput: '' });
        }
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
        if (res.confirm) this.runAdmin('softDeleteEntry', { entryId: id }, '已删除');
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
        if (res.confirm) this.runAdmin('softDeleteCongrats', { msgId: id }, '已隐藏');
      }
    });
  },

  // ---------------- 开发调试工具（仅开发版/体验版 + 本地模式） ----------------
  async onSwitchId(e) {
    if (!this.data.isDevBuild || !this.data.isMockMode) return;
    const { id } = e.currentTarget.dataset;
    await api.bindUser(id);
    wx.showToast({ title: `已切换为 ${id}`, icon: 'success' });
    this.loadData();
  },

  async onUnbindCurrent() {
    if (!this.data.isDevBuild || !this.data.isMockMode) return;
    StorageService.unbindUser();
    await api.refresh();
    wx.showToast({ title: '已解绑当前身份', icon: 'none' });
    this.loadData();
  },

  onResetAll() {
    if (!this.data.isDevBuild || !this.data.isMockMode) return;
    wx.showModal({
      title: '警告',
      content: '将清空所有投票记录并重置为初始演示数据，确认重置？',
      confirmColor: '#C0392B',
      success: (res) => {
        if (!res.confirm) return;
        StorageService.resetAll();
        api.refresh().then(() => this.loadData());
        wx.showToast({ title: '已重置数据', icon: 'success' });
      }
    });
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
