import { api } from '../api';

export default {
  name: 'RulesModal',
  props: { visible: Boolean },
  emits: ['close'],
  computed: {
    config() { return api.getState().config || {}; }
  },
  template: `
    <div v-if="visible" class="overlay" @click.self="$emit('close')">
      <div class="modal-card">
        <div class="modal-head">
          <span class="host-dot">{{ (config.hostName || '宫').slice(0, 1) }}</span>
          <div class="modal-head-text">
            <div class="muted small">{{ config.hostName }}发言</div>
            <div class="modal-title">Pawscars 比赛规则说明</div>
          </div>
          <button class="close-x" aria-label="关闭" @click="$emit('close')">×</button>
        </div>
        <div class="modal-body rules-text">{{ config.rulesDetail }}</div>
        <button class="btn btn-primary block" @click="$emit('close')">我知道啦！继续比赛</button>
      </div>
    </div>`
};
