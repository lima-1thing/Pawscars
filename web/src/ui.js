/**
 * 轻提示与确认对话框（替代小程序的 wx.showToast / wx.showModal）
 */
import { reactive } from 'vue';

export const toastState = reactive({ text: '', visible: false });
let toastTimer = null;

export function toast(text, ms = 2000) {
  toastState.text = text;
  toastState.visible = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastState.visible = false; }, ms);
}

export const dialogState = reactive({ visible: false, icon: '', title: '', content: '', confirmText: '确定', cancelText: '', danger: false, resolve: null });

/**
 * @returns {Promise<boolean>} 点确定为 true
 */
export function dialog({ icon = '', title = '', content = '', confirmText = '确定', cancelText = '', danger = false }) {
  return new Promise(resolve => {
    Object.assign(dialogState, { visible: true, icon, title, content, confirmText, cancelText, danger, resolve });
  });
}

export const confirmDialog = (opts) => dialog({ cancelText: '取消', ...opts });

export function closeDialog(result) {
  dialogState.visible = false;
  if (dialogState.resolve) dialogState.resolve(result);
  dialogState.resolve = null;
}

export const loadingState = reactive({ text: '' });
export function withLoading(text, fn) {
  loadingState.text = text;
  return Promise.resolve().then(fn).finally(() => { loadingState.text = ''; });
}
