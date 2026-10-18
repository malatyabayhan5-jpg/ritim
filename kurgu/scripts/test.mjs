// Saf JS modüllerini (model, motor tanımı, i18n çekirdeği) Node üzerinde test eder.
// Kaynaklar ESM + JSON içe aktarımı kullandığı için önce esbuild ile paketlenir.
import { build } from 'esbuild';
import { readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const testsDir = join(root, 'tests');
const files = readdirSync(testsDir).filter((f) => f.endsWith('.test.mjs'));
const outdir = mkdtempSync(join(tmpdir(), 'kurgu-tests-'));

await build({
  entryPoints: files.map((f) => join(testsDir, f)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir,
  outExtension: { '.js': '.mjs' },
  define: { __DEV__: 'false' },
  logLevel: 'warning',
});

const outFiles = readdirSync(outdir).filter((f) => f.endsWith('.mjs')).map((f) => join(outdir, f));
const r = spawnSync(process.execPath, ['--test', ...outFiles], { stdio: 'inherit' });
process.exit(r.status ?? 1);
