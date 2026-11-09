import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY } from '../app/js/constants.js';
import { loadState } from '../app/js/storage.js';

const fakeStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), keys: () => [...data.keys()] };
};

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
  console.error = () => {};
});

test('nothing saved starts fresh without a warning', () => {
  const { state, backupKey } = loadState();
  assert.equal(state.onboarded, false);
  assert.equal(backupKey, null);
});

test('unreadable saved data is copied aside before starting fresh, so it is never overwritten', () => {
  localStorage.setItem(STORAGE_KEY, '{broken');
  const { state, backupKey } = loadState();
  assert.equal(state.onboarded, false);
  assert.ok(backupKey.startsWith(`${STORAGE_KEY}.unreadable`));
  assert.equal(localStorage.getItem(backupKey), '{broken');
});
