// Run with: npm test
// There is no build step, so these catch a module the offline copy would
// miss, or an import of a name that no longer exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function jsFiles(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsFiles(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );
}

test('the offline copy lists every file the app needs, and nothing missing', () => {
  const sw = read('sw.js');
  const listed = JSON.parse(sw.slice(sw.indexOf('[', sw.indexOf('const FILES')), sw.indexOf('];') + 1).replace(/'/g, '"').replace(/,\s*]/, ']'));
  for (const f of jsFiles('js')) assert.ok(listed.includes(f), `${f} is not in sw.js FILES`);
  for (const f of listed.filter((x) => x !== './')) assert.ok(existsSync(join(root, f)), `${f} in sw.js FILES does not exist`);
  for (const ref of read('index.html').matchAll(/(?:href|src)="([^"#:]+)"/g)) assert.ok(listed.includes(ref[1]), `${ref[1]} from index.html is not in sw.js FILES`);
});

test('every imported name is exported by its module', () => {
  const exportsOf = new Map();
  for (const f of jsFiles('js')) {
    exportsOf.set(normalize(f), new Set([...read(f).matchAll(/export (?:async )?(?:function|const|let|class) (\w+)/g)].map((m) => m[1])));
  }
  for (const f of jsFiles('js')) {
    for (const m of read(f).matchAll(/import \{([^}]*)\} from '([^']+)'/g)) {
      const target = normalize(join(dirname(f), m[2]));
      assert.ok(exportsOf.has(target), `${f} imports ${m[2]}, which does not exist`);
      for (const name of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        assert.ok(exportsOf.get(target).has(name), `${f} imports ${name} from ${relative('js', target)}, which does not export it`);
      }
    }
  }
});
