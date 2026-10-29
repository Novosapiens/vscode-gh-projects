// Bundles the extension host code (Node, CJS) and the webview code (browser, IIFE).
import * as esbuild from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');
// MARKETPLACE=1 builds the Marketplace version, without updates from GitHub releases.
const marketplace = process.env.MARKETPLACE === '1';

const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

const extension = {
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  define: { MARKETPLACE: String(marketplace) },
};

const webview = {
  ...common,
  entryPoints: ['src/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
};

await mkdir('dist', { recursive: true });
await cp('src/webview/styles.css', 'dist/webview.css');

if (watch) {
  const contexts = await Promise.all([esbuild.context(extension), esbuild.context(webview)]);
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
}
