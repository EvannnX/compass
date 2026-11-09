import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, enabledPlatformIds, setEnabledPlatforms, addMapEntry, updateMapEntry, verifyMapEntry,
  removeMapEntry, visibleEntries, needsCheck, taskLabel, addProject, archiveProject, activeProjects,
  addMemory, archiveMemory, activeMemories, buildContextBlock, draftHandoff, buildHandoffText,
  buildReturnText, recordHandoff, completeOnboarding, parseImportedState, splitTaskLabel, groupMapEntries,
  recentMapChanges, setupProgress, openHandoffs, markHandoffReturned, projectSummaries, activityFeed,
  projectGoTo, lastAiFor, updateMemory, memoryTitle, handoffsWithMemory,
} from '../app/js/model.js';

const AT = '2026-11-02T10:00:00.000Z';
const LATER = '2026-12-05T10:00:00.000Z';

const withThesis = () => {
  const s = addProject(emptyState(), 'Thesis', AT);
  const projectId = s.projects[0].id;
  const filled = [
    { kind: 'decision', text: 'Chapter 3 compares the two field sites.', reason: 'Advisor asked for a comparative frame.' },
    { kind: 'constraint', text: 'Do not change the chapter order.' },
    { kind: 'open_item', text: 'Which theory anchors the discussion.' },
  ].reduce((acc, m) => addMemory(acc, { layer: 'project', projectId, ...m }, AT), s);
  return { state: filled, projectId };
};

test('enables only the chosen platforms without touching the original state', () => {
  const original = emptyState();
  const next = setEnabledPlatforms(original, ['claude', 'chatgpt']);
  assert.deepEqual(enabledPlatformIds(next), ['claude', 'chatgpt']);
  assert.deepEqual(enabledPlatformIds(original), []);
});

test('adds a map entry with its task type and drops the main AI from backups', () => {
  const s = addMapEntry(emptyState(), { label: ' Code ', assignedPlatform: 'chatgpt', alternatives: ['chatgpt', 'claude'] }, AT);
  const [entry] = s.mapEntries;
  assert.equal(taskLabel(s, entry.taskTypeId), 'Code');
  assert.deepEqual(entry.alternatives, ['claude']);
  assert.equal(entry.lastVerifiedAt, AT);
});

test('records every edit in the entry history and renames the task', () => {
  const s = addMapEntry(emptyState(), { label: 'Code', assignedPlatform: 'chatgpt' }, AT);
  const id = s.mapEntries[0].id;
  const next = updateMapEntry(s, id, { label: 'Code review', assignedPlatform: 'claude', alternatives: ['claude', 'gemini'] }, LATER);
  const entry = next.mapEntries[0];
  assert.equal(entry.assignedPlatform, 'claude');
  assert.deepEqual(entry.alternatives, ['gemini']);
  assert.equal(entry.history.length, 1);
  assert.equal(taskLabel(next, entry.taskTypeId), 'Code review');
  assert.equal(s.mapEntries[0].assignedPlatform, 'chatgpt');
});

test('ignores updates to an unknown entry', () => {
  const s = emptyState();
  assert.equal(updateMapEntry(s, 'missing', { reason: 'x' }), s);
});

test('flags entries not checked for 30 days and clears the flag on verify', () => {
  const s = addMapEntry(emptyState(), { label: 'Code', assignedPlatform: 'chatgpt' }, AT);
  const id = s.mapEntries[0].id;
  assert.equal(needsCheck(s.mapEntries[0], AT), false);
  assert.equal(needsCheck(s.mapEntries[0], LATER), true);
  const verified = verifyMapEntry(s, id, LATER);
  assert.equal(needsCheck(verified.mapEntries[0], LATER), false);
});

test('removing an entry hides it but keeps it as stale', () => {
  const s = addMapEntry(emptyState(), { label: 'Code', assignedPlatform: 'chatgpt' }, AT);
  const next = removeMapEntry(s, s.mapEntries[0].id, LATER);
  assert.equal(visibleEntries(next).length, 0);
  assert.equal(next.mapEntries[0].status, 'stale');
});

test('archived projects and memories drop out of active lists', () => {
  const { state, projectId } = withThesis();
  const memoryId = activeMemories(state, { kind: 'constraint' })[0].id;
  assert.equal(activeMemories(archiveMemory(state, memoryId)).length, 2);
  assert.equal(activeProjects(archiveProject(state, projectId)).length, 0);
});

test('builds the context block in the PRD format, filtered by platform', () => {
  const { state, projectId } = withThesis();
  const s = addMemory(addMemory(state, { layer: 'global', kind: 'preference', text: 'Write in paragraphs, no bullet points.' }, AT),
    { layer: 'global', kind: 'preference', text: 'Answer in Chinese.', appliesTo: ['deepseek'] }, AT);
  assert.equal(buildContextBlock(s, projectId, 'claude'), [
    '[Context from Compass — project: Thesis]',
    'How to use this: build on what is already decided, never break the rules, and for anything not decided yet, suggest options and let me choose.',
    'About me:',
    '- Write in paragraphs, no bullet points.',
    'Already decided:',
    '- Chapter 3 compares the two field sites. Why: Advisor asked for a comparative frame.',
    'Rules:',
    '- Do not change the chapter order.',
    'Not decided yet:',
    '- Which theory anchors the discussion.',
    '[End of context]',
  ].join('\n'));
  assert.match(buildContextBlock(s, projectId, 'deepseek'), /Answer in Chinese/);
});

test('builds an about-me block when no project is chosen', () => {
  const s = addMemory(emptyState(), { layer: 'global', kind: 'preference', text: 'Be brief.' }, AT);
  assert.equal(buildContextBlock(s, null), '[Context from Compass]\nAbout me:\n- Be brief.\n[End of context]');
});

test('drafts a handoff from project memory and renders it with plan text', () => {
  const { state, projectId } = withThesis();
  const draft = draftHandoff(state, projectId);
  assert.deepEqual(draft.reasons, ['Advisor asked for a comparative frame.']);
  const text = buildHandoffText({ from: 'claude', projectName: 'Thesis', ...draft, sourceExcerpt: ' Open with the sites. ' });
  assert.match(text, /^\[Handoff from Claude via Compass — project: Thesis\]/);
  assert.match(text, /Do not change:\n- Do not change the chapter order\./);
  assert.match(text, /Plan text:\nOpen with the sites\.\n\[End of handoff\]$/);
});

test('omits empty handoff sections', () => {
  const text = buildHandoffText({ from: 'claude', projectName: 'X', decisions: ['A'], reasons: [], constraints: [], openItems: [] });
  assert.doesNotMatch(text, /Why these decisions|Plan text/);
});

test('builds the return text with the original decisions and constraints', () => {
  const text = buildReturnText({ projectName: 'Thesis', decisions: ['A'], constraints: ['B'], result: ' Done. ' });
  assert.match(text, /Original decisions and constraints:\n- A\n- B\nResult:\nDone\.\n\[End of return\]$/);
});

test('recording a handoff saves only new decisions and constraints', () => {
  const { state, projectId } = withThesis();
  const pkg = {
    projectId, from: 'claude', to: 'chatgpt',
    decisions: ['chapter 3 compares the two  field sites.', 'Keep it under 8,000 words.'],
    reasons: [], constraints: [''], openItems: [],
  };
  const next = recordHandoff(state, pkg, {}, LATER);
  const added = activeMemories(next).filter((m) => m.provenance.capturedVia === 'handoff');
  assert.equal(next.handoffs.length, 1);
  assert.deepEqual(added.map((m) => m.text), ['Keep it under 8,000 words.']);
  assert.equal(recordHandoff(state, pkg, { saveNew: false }).memories.length, state.memories.length);
});

test('onboarding turns answers into map entries and skips unused tasks', () => {
  const s = completeOnboarding(emptyState(), {
    platformIds: ['claude', 'chatgpt'],
    answers: [{ platform: 'claude', reason: 'Quality' }, { platform: 'none' }, undefined, { platform: 'chatgpt' }],
    favorite: 'claude',
    projectName: 'Thesis',
  }, AT);
  assert.equal(s.onboarded, true);
  assert.deepEqual(visibleEntries(s).map((e) => taskLabel(s, e.taskTypeId)), ['Plan a big piece of work', 'Images and visuals']);
  assert.equal(s.mapEntries[0].source, 'onboarding');
  assert.equal(s.projects[0].name, 'Thesis');
});

test('accepts a valid export and rejects broken files with a clear message', () => {
  const { state } = withThesis();
  assert.equal(parseImportedState(JSON.parse(JSON.stringify(state))).projects[0].name, 'Thesis');
  assert.throws(() => parseImportedState(null), /not a Compass export/);
  assert.throws(() => parseImportedState({ nope: 1 }), /not a Compass export/);
  assert.throws(() => parseImportedState({ version: 9 }), /different version of Compass/);
  assert.throws(() => parseImportedState({ version: 1, platforms: [] }), /missing: taskTypes/);
  assert.throws(() => parseImportedState({ ...state, platforms: [{ id: 'other' }] }), /Unknown AI in file: other/);
});

test('splits "Project: task" labels and leaves plain labels ungrouped', () => {
  assert.deepEqual(splitTaskLabel('Thesis: plan structure'), { group: 'Thesis', title: 'plan structure' });
  assert.deepEqual(splitTaskLabel('Code'), { group: null, title: 'Code' });
  assert.deepEqual(splitTaskLabel(': odd'), { group: null, title: ': odd' });
});

test('groups map entries by project prefix, ungrouped last', () => {
  const s = ['Code', 'Thesis: plan', 'Thesis: execute'].reduce(
    (acc, label) => addMapEntry(acc, { label, assignedPlatform: 'claude' }, AT), emptyState());
  const groups = groupMapEntries(s);
  assert.deepEqual(groups.map((g) => g.name), ['Thesis', null]);
  assert.deepEqual(groups[0].items.map((i) => i.title), ['plan', 'execute']);
});

test('lists the most recent map changes first, including creation', () => {
  const s = addMapEntry(emptyState(), { label: 'Code', assignedPlatform: 'chatgpt', source: 'onboarding' }, AT);
  const next = verifyMapEntry(s, s.mapEntries[0].id, LATER);
  const changes = recentMapChanges(next, 5);
  assert.deepEqual(changes.map((c) => [c.at, c.task, c.what]), [
    [LATER, 'Code', 'Edited'],
    [AT, 'Code', 'Created in onboarding'],
  ]);
  assert.equal(recentMapChanges(next, 1).length, 1);
});

test('setup progress counts what the user has done so far', () => {
  const blank = setupProgress(emptyState());
  assert.equal(blank.done, 0);
  assert.equal(blank.steps.length, 6);
  const { state } = withThesis();
  const s = addMapEntry(setEnabledPlatforms(state, ['claude', 'chatgpt']), { label: 'Code', assignedPlatform: 'claude' }, AT);
  const progress = setupProgress(s);
  assert.deepEqual(progress.steps.filter((x) => x.done).map((x) => x.id), ['ais', 'map', 'project', 'memory']);
  assert.equal(progress.done, 4);
});

test('a hand-off waits for its result until it is marked returned', () => {
  const { state, projectId } = withThesis();
  const s = recordHandoff(state, { projectId, from: 'claude', to: 'chatgpt', decisions: [], reasons: [], constraints: [], openItems: [] }, { saveNew: false }, AT);
  const id = s.handoffs[0].id;
  assert.deepEqual(openHandoffs(s).map((h) => h.id), [id]);
  const done = markHandoffReturned(s, id, LATER);
  assert.equal(done.handoffs[0].returnedAt, LATER);
  assert.equal(openHandoffs(done).length, 0);
  assert.equal(s.handoffs[0].returnedAt, undefined);
});

test('summarises each project: counts by kind and last update', () => {
  const { state, projectId } = withThesis();
  const later = addMemory(state, { layer: 'project', projectId, kind: 'decision', text: 'Second.' }, LATER);
  const [summary] = projectSummaries(later);
  assert.equal(summary.project.name, 'Thesis');
  assert.deepEqual(summary.counts, { decision: 2, constraint: 1, open_item: 1, fact: 0 });
  assert.equal(summary.total, 4);
  assert.equal(summary.updatedAt, LATER);
});

test('the activity feed merges saves, hand-offs, returns and map changes, newest first', () => {
  const { state, projectId } = withThesis();
  const withMap = addMapEntry(state, { label: 'Code', assignedPlatform: 'claude' }, '2026-11-01T09:00:00.000Z');
  const sent = recordHandoff(withMap, { projectId, from: 'claude', to: 'chatgpt', decisions: ['A'], reasons: [], constraints: [], openItems: [] }, { saveNew: false }, LATER);
  const back = markHandoffReturned(sent, sent.handoffs[0].id, '2026-12-06T10:00:00.000Z');
  const feed = activityFeed(back, 10);
  assert.deepEqual(feed.slice(0, 2).map((e) => e.kind), ['return', 'handoff']);
  assert.equal(feed[1].title, 'Handed Thesis from Claude to ChatGPT');
  assert.ok(feed.some((e) => e.kind === 'memory' && e.detail === 'Saved to Thesis as a decision'));
  assert.equal(feed.at(-1).kind, 'map');
  assert.equal(activityFeed(back, 2).length, 2);
});

test('filters the activity feed to one project and leaves out map changes', () => {
  const { state, projectId } = withThesis();
  const other = addProject(state, 'Essays', AT);
  const s = addMemory(addMapEntry(other, { label: 'Code', assignedPlatform: 'claude' }, AT),
    { layer: 'project', projectId: other.projects[1].id, kind: 'fact', text: 'Due in May.' }, AT);
  const feed = activityFeed(s, 20, { projectId });
  assert.equal(feed.length, 3);
  assert.ok(feed.every((e) => e.kind === 'memory' && !e.title.includes('May')));
});

test('finds the go-to AI for each kind of work in a project from the map', () => {
  const s = ['Thesis: plan structure', 'Thesis: execute', 'Code'].reduce(
    (acc, label, i) => addMapEntry(acc, { label, assignedPlatform: ['claude', 'chatgpt', 'gemini'][i] }, AT), emptyState());
  assert.deepEqual(projectGoTo(s, 'Thesis'), { claude: ['plan structure'], chatgpt: ['execute'] });
  assert.deepEqual(projectGoTo(s, 'thesis'), { claude: ['plan structure'], chatgpt: ['execute'] });
  assert.deepEqual(projectGoTo(s, 'Essays'), {});
});

test('the AI you continue from is where the project last went, else your favourite', () => {
  const { state, projectId } = withThesis();
  assert.equal(lastAiFor({ ...state, favorite: 'gemini' }, projectId), 'gemini');
  assert.equal(lastAiFor(state, projectId), null);
  const s = recordHandoff(state, { projectId, from: 'claude', to: 'chatgpt', decisions: [], reasons: [], constraints: [], openItems: [] }, { saveNew: false }, AT);
  assert.equal(lastAiFor(s, projectId), 'chatgpt');
});

test('editing a memory records a revision and keeps the original untouched', () => {
  const { state } = withThesis();
  const id = state.memories[0].id;
  const next = updateMemory(state, id, { title: 'Two sites', kind: 'fact' }, LATER);
  assert.equal(next.memories[0].title, 'Two sites');
  assert.equal(next.memories[0].kind, 'fact');
  assert.deepEqual(next.memories[0].revisions, [{ at: LATER, change: { title: 'Two sites', kind: 'fact' } }]);
  assert.equal(state.memories[0].title, undefined);
  assert.equal(updateMemory(state, 'missing', { title: 'x' }), state);
});

test('a memory title falls back to an automatic one', () => {
  const s = addMemory(emptyState(), { layer: 'global', kind: 'preference', text: 'Keep answers short.', title: '  ' }, AT);
  assert.equal(memoryTitle(s.memories[0]), 'Keep answers short');
  const titled = addMemory(emptyState(), { layer: 'global', kind: 'preference', text: 'Keep answers short.', title: 'Brevity' }, AT);
  assert.equal(memoryTitle(titled.memories[0]), 'Brevity');
});

test('finds the hand-offs that carried a memory', () => {
  const { state, projectId } = withThesis();
  const s = recordHandoff(state, { projectId, from: 'claude', to: 'chatgpt', decisions: ['chapter 3 compares the two field sites.'], reasons: [], constraints: [], openItems: [] }, { saveNew: false }, LATER);
  const decision = s.memories.find((m) => m.kind === 'decision');
  const constraint = s.memories.find((m) => m.kind === 'constraint');
  assert.equal(handoffsWithMemory(s, decision).length, 1);
  assert.equal(handoffsWithMemory(s, constraint).length, 0);
});
