/**
 * Pawscars 网页测试版入口：邀请码登录 → hash 路由切换页面
 */
import { createApp } from 'vue';
import { api } from './api';
import { route } from './router';
import { toastState, dialogState, closeDialog, loadingState } from './ui';
import InvitePage from './pages/invite';
import HomePage from './pages/home';
import BindPage from './pages/bind';
import NominatePage from './pages/nominate';
import VoteInitialPage from './pages/vote-initial';
import VoteFinalPage from './pages/vote-final';
import AwardsPage from './pages/awards';
import MyPage from './pages/my';
import AdminPage from './pages/admin';

const PAGES = {
  '/': HomePage,
  '/bind': BindPage,
  '/nominate': NominatePage,
  '/vote-initial': VoteInitialPage,
  '/vote-final': VoteFinalPage,
  '/awards': AwardsPage,
  '/my': MyPage,
  '/admin': AdminPage
};

createApp({
  components: { InvitePage },
  data() { return { status: 'loading', error: '', route, toast: toastState, dialog: dialogState, loading: loadingState }; },
  computed: {
    page() { return PAGES[this.route.path] || HomePage; }
  },
  async created() {
    api.setUnauthorizedHandler(() => { this.status = 'invite'; });
    try {
      this.status = (await api.init()) ? 'ready' : 'invite';
    } catch (e) {
      this.error = e.message;
      this.status = 'error';
    }
  },
  methods: {
    onLoggedIn() { this.status = 'ready'; location.hash = '#/'; },
    closeDialog,
    reload() { location.reload(); }
  },
  template: `
    <div class="app">
      <div v-if="status === 'loading'" class="splash">🐾 加载中…</div>
      <div v-else-if="status === 'error'" class="empty">
        <div class="big-emoji">😿</div><b>活动数据加载失败</b><p class="muted">{{ error }}</p>
        <button class="btn btn-primary" @click="reload">重试</button>
      </div>
      <InvitePage v-else-if="status === 'invite'" @done="onLoggedIn" />
      <component v-else :is="page" :key="route.key" />

      <div v-if="toast.visible" class="toast" role="status">{{ toast.text }}</div>
      <div v-if="loading.text" class="overlay loading-overlay"><div class="loading-box">{{ loading.text }}…</div></div>
      <div v-if="dialog.visible" class="overlay">
        <div class="modal-card dialog">
          <div v-if="dialog.title" class="modal-title">{{ dialog.title }}</div>
          <div class="dialog-content">{{ dialog.content }}</div>
          <div class="row-gap">
            <button v-if="dialog.cancelText" class="btn btn-outline grow" @click="closeDialog(false)">{{ dialog.cancelText }}</button>
            <button class="btn grow" :class="dialog.danger ? 'btn-danger' : 'btn-primary'" @click="closeDialog(true)">{{ dialog.confirmText }}</button>
          </div>
        </div>
      </div>
    </div>`
}).mount('#app');
