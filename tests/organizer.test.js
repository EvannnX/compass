import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeMemories, addMemory, addProject, emptyState } from '../app/js/model.js';
import { applyOrganized, organizeUpdate } from '../app/js/organizer.js';
import { parseProjectUpdate } from '../app/js/importer.js';
import { buildSortRequest } from '../app/js/importer.js';

const AT = '2026-11-03T10:00:00.000Z';
const withThesis = () => {
  const s = addProject(emptyState(), 'Thesis', AT);
  const projectId = s.projects[0].id;
  const filled = [
    { kind: 'decision', text: 'Chapter 3 compares the two field sites.' },
    { kind: 'constraint', text: 'Keep each section under 2,000 words.' },
    { kind: 'open_item', text: 'Which theory anchors the discussion?' },
  ].reduce((acc, m) => addMemory(acc, { layer: 'project', projectId, ...m }, AT), s);
  return { state: filled, projectId };
};
const item = (kind, text, isMe = false) => ({ kind, text, title: text, reason: '', source: text, isMe });

test('marks each item as new, already saved, a replacement or an answer to an open question', () => {
  const { state, projectId } = withThesis();
  const organized = organizeUpdate(state, projectId, [
    item('decision', 'Chapter 3 compares the two field sites.'),
    item('constraint', 'Keep each section under 3,000 words.'),
    item('decision', 'Practice theory anchors the discussion.'),
    item('fact', 'The fieldwork ran from March to June.'),
  ]);
  assert.deepEqual(organized.map((i) => [i.status, i.isPicked]), [['known', false], ['changes', true], ['answers', true], ['new', true]]);
  assert.equal(organized[1].targetTitle, 'Keep each section under 2,000 words');
});

test('drops repeats inside one paste', () => {
  const { state, projectId } = withThesis();
  const organized = organizeUpdate(state, projectId, [item('fact', 'Interviews are in Mandarin.'), item('fact', 'Interviews are in  mandarin.')]);
  assert.equal(organized.length, 1);
});

test('saving replaces the old memory, closes the answered question and adds the rest', () => {
  const { state, projectId } = withThesis();
  const organized = organizeUpdate(state, projectId, [
    item('constraint', 'Keep each section under 3,000 words.'),
    item('decision', 'Practice theory anchors the discussion.'),
    item('preference', 'I like feedback as a short list.', true),
  ]);
  const next = applyOrganized(state, { projectId, items: organized, platform: 'chatgpt' }, AT);
  const texts = (kind) => activeMemories(next, { projectId, kind }).map((m) => m.text);
  assert.deepEqual(texts('constraint'), ['Keep each section under 3,000 words.']);
  assert.deepEqual(texts('open_item'), []);
  assert.ok(texts('decision').includes('Practice theory anchors the discussion.'));
  assert.deepEqual(activeMemories(next, { layer: 'global' }).map((m) => m.text), ['I like feedback as a short list.']);
  assert.equal(state.memories.length, 3, 'original state untouched');
});

test('unticked items are not saved', () => {
  const { state, projectId } = withThesis();
  const [only] = organizeUpdate(state, projectId, [item('fact', 'The fieldwork ran from March to June.')]);
  const next = applyOrganized(state, { projectId, items: [{ ...only, isPicked: false }], platform: 'chatgpt' }, AT);
  assert.equal(next.memories.length, 3);
});

test('a loose summary still gets sorted, and the sort request carries the text', () => {
  const summary = 'In this chat we decided to drop the third site. Never cite blog posts. Not sure yet whether to add a map?';
  assert.deepEqual(parseProjectUpdate(summary).map((i) => i.kind), ['decision', 'constraint', 'open_item']);
  const request = buildSortRequest('Thesis', summary);
  assert.ok(request.includes(summary) && request.includes('Already decided:'));
});

test('a plain statement that settles an open question becomes its answer', () => {
  const { state, projectId } = withThesis();
  const [answer] = organizeUpdate(state, projectId, [item('fact', 'Practice theory anchors the discussion.')]);
  assert.deepEqual([answer.status, answer.kind], ['answers', 'decision']);
});

test('the same decision worded with "we agreed" counts as already saved', () => {
  const { state, projectId } = withThesis();
  const [same] = organizeUpdate(state, projectId, [item('decision', 'We agreed that chapter 3 compares the two field sites.')]);
  assert.equal(same.status, 'known');
});

test('first-person preferences in a loose summary go to About me', () => {
  assert.deepEqual(parseProjectUpdate('I prefer feedback as a short list of fixes.').map((i) => [i.isMe, i.kind]), [[true, 'preference']]);
});
