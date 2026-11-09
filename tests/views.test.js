import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// main.js merges every view's handlers into one table, so a name used twice silently replaces the other.
test('no two views register the same action, change or input name', () => {
  const dir = new URL('../app/js/views/', import.meta.url);
  const owners = new Map();
  readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((file) => {
    const source = readFileSync(new URL(file, dir), 'utf8');
    for (const block of source.matchAll(/export const (actions|changes|inputs) = \{([\s\S]*?)\n\};/g)) {
      for (const [, name] of block[2].matchAll(/^ {2}'([a-z-]+)':/gm)) {
        const key = `${block[1]}:${name}`;
        assert.ok(!owners.has(key), `${key} is in both ${owners.get(key)} and ${file}`);
        owners.set(key, file);
      }
    }
  });
  assert.ok(owners.size > 50);
});
