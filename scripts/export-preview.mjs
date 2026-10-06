import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.jsx'],
  outfile: 'optica-preview.js',
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.svg': 'dataurl' },
  legalComments: 'inline',
});

const javascript = result.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = result.outputFiles.find(file => file.path.endsWith('.css')).text;
const favicon = await readFile(path.join(root, 'public/favicon.svg'), 'utf8');
const fontLicenses = await Promise.all(['dm-sans', 'instrument-serif'].map(async font => {
  const license = await readFile(path.join(root, `node_modules/@fontsource/${font}/LICENSE`), 'utf8');
  return `${font}\n${license}`;
}));
const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0c1014">
<title>OPTICA — The optics laboratory</title>
<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}">
<style>${css.replace(/<\/style/gi, '<\\/style')}</style>
</head><body><div id="root"></div>
<script>document.addEventListener('click',event=>{const link=event.target.closest?.('a');if(link?.getAttribute('href')==='/'){event.preventDefault();location.reload();}});${javascript.replace(/<\/script/gi, '<\\/script')}</script>
<!-- Bundled font licenses\n${fontLicenses.join('\n\n').replace(/-->/g, '-- >')}\n-->
</body></html>`;

await mkdir(path.join(root, 'preview'), { recursive: true });
const target = path.join(root, 'preview/OPTICA.html');
await writeFile(target, html);
console.log(`Created ${target} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB). Open it directly in a WebGL-capable browser. No server or network is needed.`);
