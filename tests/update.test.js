import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUpdateRequest, parseProjectUpdate } from '../app/js/importer.js';
import { sliceIntoMemories } from '../app/js/slicer.js';

test('the update request names the project and the four headings Compass reads back', () => {
  const request = buildUpdateRequest('Thesis');
  assert.match(request, /"Thesis"/);
  ['Already decided:', 'Rules:', 'Not decided yet:', 'Background:', 'About me:'].forEach((h) => assert.ok(request.includes(h), h));
});

test('reads an update answer into project memories and About me items', () => {
  const answer = [
    'Sure, here is the update.',
    'Already decided:',
    '- Chapter 3 compares the two sites because the advisor asked for it.',
    'Rules:',
    '- Keep the section order 3.1 to 3.4.',
    'Not decided yet:',
    '- Which theory anchors the discussion.',
    'About me:',
    '- I like short paragraphs without bullet points.',
    'Background:',
    '- The fieldwork ran from March to June.',
  ].join('\n');
  assert.deepEqual(parseProjectUpdate(answer).map((i) => [i.isMe, i.kind, i.text]), [
    [false, 'decision', 'Chapter 3 compares the two sites.'],
    [false, 'constraint', 'Keep the section order 3.1 to 3.4.'],
    [false, 'open_item', 'Which theory anchors the discussion.'],
    [true, 'preference', 'I like short paragraphs without bullet points.'],
    [false, 'fact', 'The fieldwork ran from March to June.'],
  ]);
});

test('an answer without headings still becomes project memories', () => {
  const items = parseProjectUpdate('We decided to drop the third site.\nNot sure about the title yet?');
  assert.deepEqual(items.map((i) => [i.isMe, i.kind]), [[false, 'decision'], [false, 'open_item']]);
});

test('Compass headings, old and new, set the kind', () => {
  const text = 'Already decided:\n- Drop the third site.\nRules:\n- Never use bullet points.\nNot decided yet:\n- The final title.\nBackground:\n- The advisor is Prof. Lin.';
  assert.deepEqual(sliceIntoMemories(text).map((m) => m.kind), ['decision', 'constraint', 'open_item', 'fact']);
});
