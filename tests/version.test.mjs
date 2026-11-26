import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('version.js, package.json and the newest BUILDS.md entry agree and the title screen shows it', () => {
  const sandbox = { CC: {} };
  runInNewContext(read('version.js'), sandbox);
  const v = sandbox.CC.VERSION;
  assert.match(v.build, /^\d{8}\.\d+$/);
  assert.equal(v.version, JSON.parse(read('package.json')).version);
  assert.equal(v.label, 'v' + v.version + ' · build ' + v.build);
  const row = read('BUILDS.md').split('\n').find(line => /^\| \d{8}\.\d+ /.test(line));
  assert.ok(row && row.startsWith('| ' + v.build + ' | ' + v.version + ' |'), 'the newest BUILDS.md row is this build');
  assert.match(read('index.html'), /<script src="version\.js"><\/script>/);
  assert.match(read('main.js'), /CC\.VERSION/);
});
