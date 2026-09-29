/**
 * 基于 hash 的简单路由：#/path?key=value，适配 GitHub Pages 静态托管
 */
import { reactive } from 'vue';

export const route = reactive({ path: '/', query: {}, key: 0 });

function parse() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  route.path = path || '/';
  route.query = Object.fromEntries(new URLSearchParams(qs || ''));
  route.key += 1;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', parse);
parse();

export function go(path) {
  if (location.hash.slice(1) === path) parse();
  else location.hash = path;
}

export function back() {
  if (history.length > 1) history.back();
  else go('/');
}
