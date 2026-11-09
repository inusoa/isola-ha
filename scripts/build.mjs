// Builds dist/ from src/ — the files that Marketplace / HACS install.
//   npm install && npm run build      rebuild dist/isola-ha.js and dist/three.module.min.js
//   npm run check                     rebuild in memory and fail if dist/ differs from src/ (used by CI)
//
// dist/isola-ha.js       = src/isola-ha.js and everything it imports (cards, configurator, 3D home, translations, UI)
// dist/three.module.min.js = src/three.module.min.js, unchanged (three.js r163, MIT); loaded at runtime from the
//                          same folder as isola-ha.js. Nothing is ever loaded from a CDN or any other third party.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const check = process.argv.includes('--check');

const res = await build({
  entryPoints: [join(root, 'src/isola-ha.js')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minifyWhitespace: true,
  minifySyntax: true,
  legalComments: 'none',
  charset: 'utf8',
  write: false,
  logLevel: 'warning',
  banner: { js: `/* Isola for Home Assistant ${version} · https://github.com/inusoa/isola-ha · MIT\n * Isola (phone) type: custom:isola-mobile · Isola Live (tablet / hub) type: custom:isola-live\n * Built from src/ with scripts/build.mjs (esbuild). three.js is loaded from ./three.module.min.js next to this file. */` },
});
const out = res.outputFiles[0].text;

const src = readFileSync(join(root, 'src/isola-live.js'), 'utf8');
const m = src.match(/const VERSION = '([^']+)'/);
if (!m || m[1] !== version) { console.error(`version mismatch: package.json ${version}, src/isola-live.js ${m && m[1]}`); process.exit(1); }
if (/https?:\/\/(cdn\.|unpkg|fonts\.googleapis|fonts\.gstatic)/.test(out)) { console.error('third-party URL found in the bundle'); process.exit(1); }

const files = [['dist/isola-ha.js', out], ['dist/three.module.min.js', readFileSync(join(root, 'src/three.module.min.js'), 'utf8')]];
if (check) {
  let bad = 0;
  for (const [f, text] of files) { let cur = ''; try { cur = readFileSync(join(root, f), 'utf8'); } catch { } if (cur !== text) { console.error(`${f} is not built from src/: run npm run build`); bad++; } }
  if (bad) process.exit(1);
  console.log('dist/ matches src/');
} else {
  mkdirSync(join(root, 'dist'), { recursive: true });
  for (const [f, text] of files) writeFileSync(join(root, f), text);
  console.log(`built dist/isola-ha.js ${version} (${Math.round(out.length / 1024)} KB)`);
}
