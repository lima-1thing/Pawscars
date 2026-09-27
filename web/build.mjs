/**
 * 打包网页测试版：src/main.js → dist/app.js，并复制静态文件
 *   node build.mjs          生成 dist/
 *   node build.mjs --serve  本地预览 http://localhost:5173（修改后自动重新打包；需在后台 WEB_ORIGINS 中登记）
 */
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'fs';

const serve = process.argv.includes('--serve');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('index.html', 'dist/index.html');
cpSync('styles.css', 'dist/styles.css');

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  outfile: 'dist/app.js',
  minify: !serve,
  sourcemap: serve,
  // 运行时编译模板字符串需要带编译器的 Vue 版本
  alias: { vue: 'vue/dist/vue.esm-bundler.js' },
  define: {
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
  },
  logLevel: 'info'
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: Number(process.env.PORT) || 5173 });
  console.log(`Serving http://localhost:${port}`);
} else {
  await esbuild.build(options);
}
