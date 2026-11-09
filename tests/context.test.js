import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityFeed, addMaterial, addMemory, addProject, buildContextBlock, emptyState, removeMaterial, toggleMaterial,
  updateMaterial, updateMemory, updateProject, wordCount,
} from '../app/js/model.js';
import { buildMemoryExportPrompt, parseMemoryExport } from '../app/js/importer.js';

const AT = '2026-11-02T10:00:00.000Z';
const LATER = '2026-11-03T10:00:00.000Z';

const thesis = () => {
  const s = addProject(emptyState(), 'Thesis', AT);
  return { state: s, projectId: s.projects[0].id };
};

test('the brief opens with what the project is about', () => {
  const { state, projectId } = thesis();
  const s = updateProject(state, projectId, { description: 'A master’s thesis comparing two field sites. Due in May.' });
  assert.match(buildContextBlock(s, projectId), /^\[Context from Compass — project: Thesis\]\nAbout this project:\nA master’s thesis comparing two field sites\. Due in May\.\n/);
  assert.equal(state.projects[0].description, undefined);
});

test('a memory example is sent right under the memory', () => {
  const { state, projectId } = thesis();
  const s = addMemory(state, { layer: 'project', projectId, kind: 'constraint', text: 'Paragraphs, no bullet points.' }, AT);
  const withExample = updateMemory(s, s.memories[0].id, { example: 'The first site, a coastal market town, was chosen because…' }, LATER);
  assert.match(buildContextBlock(withExample, projectId), /- Paragraphs, no bullet points\.\n  Example: The first site, a coastal market town, was chosen because…/);
});

test('reference materials are sent in full when switched on', () => {
  const { state, projectId } = thesis();
  const s = addMaterial(state, { projectId, title: 'Advisor feedback', body: 'Tighten the comparison.\nCite more local sources.', source: 'paste' }, AT);
  const id = s.materials[0].id;
  assert.match(buildContextBlock(s, projectId), /Reference materials:\n### Advisor feedback\nTighten the comparison\.\nCite more local sources\./);
  assert.doesNotMatch(buildContextBlock(toggleMaterial(s, id), projectId), /Reference materials/);
  const renamed = updateMaterial(s, id, { title: 'Feedback, Oct' }, LATER);
  assert.equal(renamed.materials[0].title, 'Feedback, Oct');
  assert.equal(renamed.materials[0].updatedAt, LATER);
  assert.equal(removeMaterial(s, id).materials.length, 0);
});

test('counts words in English and characters in Chinese', () => {
  assert.equal(wordCount('Keep it short, please.'), 4);
  assert.equal(wordCount('不要用列表'), 5);
  assert.equal(wordCount('Use 三个 cases'), 4);
});

test('activity entries for saved memories carry their kind and short title', () => {
  const { state, projectId } = thesis();
  const s = addMemory(state, { layer: 'project', projectId, kind: 'constraint', text: 'Do not change the chapter order.', title: 'Chapter order' }, AT);
  const [entry] = activityFeed(s, 5);
  assert.equal(entry.memoryKind, 'constraint');
  assert.equal(entry.title, 'Chapter order');
});

test('the export request asks the AI for memories grouped by me and project', () => {
  const prompt = buildMemoryExportPrompt('chatgpt');
  assert.match(prompt, /^\[Memory export request from Compass\]/);
  assert.match(prompt, /About me:/);
  assert.match(prompt, /Project: <project name>/);
});

test('reads an exported memory list into destinations', () => {
  const answer = `Here is what I remember:\n\nAbout me:\n- Prefers paragraphs over bullet points.\n- Writes in English and Chinese.\n\nProject: Thesis\n- Chapter 3 compares the two field sites.\n- Not sure which theory to use?\n\nProject: Side app\n- Built with React and a small Node server.`;
  const items = parseMemoryExport(answer);
  assert.deepEqual(items.map((i) => [i.destination, i.text]), [
    ['me', 'Prefers paragraphs over bullet points.'],
    ['me', 'Writes in English and Chinese.'],
    ['Thesis', 'Chapter 3 compares the two field sites.'],
    ['Thesis', 'Not sure which theory to use?'],
    ['Side app', 'Built with React and a small Node server.'],
  ]);
  assert.equal(items[0].kind, 'preference');
  assert.equal(items[3].kind, 'open_item');
});

test('an export without headings goes to About me', () => {
  assert.deepEqual(parseMemoryExport('- Likes short answers.\n- Lives in Shanghai.').map((i) => i.destination), ['me', 'me']);
});
