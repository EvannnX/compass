import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORMS, platformName, platformUrl, useCustomPlatforms } from '../app/js/constants.js';
import {
  addCustomPlatform, allPlatforms, emptyState, enabledPlatformIds, parseImportedState, platformChoices, setEnabledPlatforms,
} from '../app/js/model.js';

test('offers more than the original four AIs and never Doubao', () => {
  assert.ok(PLATFORMS.length >= 10);
  assert.ok(!PLATFORMS.some((p) => /doubao/i.test(p.id + p.name)));
});

test('turns on AIs that old saves did not list yet', () => {
  const old = { ...emptyState(), platforms: [{ id: 'claude', enabled: true }, { id: 'chatgpt', enabled: true }] };
  const next = setEnabledPlatforms(old, ['claude', 'kimi']);
  assert.deepEqual(enabledPlatformIds(next), ['claude', 'kimi']);
  assert.deepEqual(enabledPlatformIds(old), ['claude', 'chatgpt']);
});

test('adds an AI by hand, switched on, without touching the original state', () => {
  const original = setEnabledPlatforms(emptyState(), ['claude', 'chatgpt']);
  const { state, id } = addCustomPlatform(original, { name: '  Poe ', url: 'poe.com' });
  assert.match(id, /^custom-[a-z0-9]+$/);
  assert.deepEqual(enabledPlatformIds(state), ['claude', 'chatgpt', id]);
  assert.equal(state.platforms.at(-1).name, 'Poe');
  assert.equal(state.platforms.at(-1).url, 'https://poe.com/');
  assert.equal(allPlatforms(original).length, PLATFORMS.length);
});

test('a hand-added AI can be switched off and on like the others', () => {
  const { state, id } = addCustomPlatform(setEnabledPlatforms(emptyState(), ['claude']), { name: 'Poe' });
  const off = setEnabledPlatforms(state, ['claude']);
  assert.deepEqual(enabledPlatformIds(off), ['claude']);
  assert.ok(allPlatforms(off).some((p) => p.id === id));
  assert.deepEqual(enabledPlatformIds(setEnabledPlatforms(off, ['claude', id])), ['claude', id]);
});

test('adding a name that already exists switches that AI on instead of making a copy', () => {
  const { state, id } = addCustomPlatform(emptyState(), { name: 'kimi' });
  assert.equal(id, 'kimi');
  assert.deepEqual(enabledPlatformIds(state), ['kimi']);
  assert.equal(allPlatforms(state).length, PLATFORMS.length);
});

test('can be added without a web address, but not without a name or with a broken address', () => {
  assert.equal(addCustomPlatform(emptyState(), { name: 'Work bot' }).state.platforms.at(-1).url, '');
  assert.throws(() => addCustomPlatform(emptyState(), { name: '  ' }), /Give the AI a name/);
  assert.throws(() => addCustomPlatform(emptyState(), { name: 'Bot', url: 'not a site' }), /web address/);
});

test('lists the user’s AIs plus any still in use, in catalogue order', () => {
  const s = setEnabledPlatforms(emptyState(), ['gemini', 'claude']);
  assert.deepEqual(platformChoices(s).map((p) => p.id), ['claude', 'gemini']);
  assert.deepEqual(platformChoices(s, ['chatgpt']).map((p) => p.id), ['claude', 'chatgpt', 'gemini']);
});

test('names and addresses of hand-added AIs are found once registered', () => {
  const { state, id } = addCustomPlatform(emptyState(), { name: 'Poe', url: 'https://poe.com' });
  useCustomPlatforms(state.platforms.filter((p) => p.isCustom));
  assert.equal(platformName(id), 'Poe');
  assert.equal(platformUrl(id), 'https://poe.com/');
  useCustomPlatforms([]);
  assert.equal(platformUrl('custom-none'), null);
});

test('imports hand-added AIs but rejects ones with unsafe addresses', () => {
  const { state } = addCustomPlatform(emptyState(), { name: 'Poe', url: 'poe.com' });
  assert.equal(parseImportedState(state).platforms.at(-1).name, 'Poe');
  const bad = { ...state, platforms: [{ id: 'custom-x1', name: 'Bad', url: 'javascript:alert(1)', isCustom: true }] };
  assert.throws(() => parseImportedState(bad), /Unknown AI in file: custom-x1/);
});
