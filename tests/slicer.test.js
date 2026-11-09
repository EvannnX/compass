import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoTitle, guessKind, sliceIntoMemories } from '../app/js/slicer.js';

test('one short line becomes one memory with a guessed kind', () => {
  assert.deepEqual(sliceIntoMemories('Do not change the chapter order.'), [
    { title: 'Do not change the chapter order', text: 'Do not change the chapter order.', reason: '', kind: 'constraint', source: 'Do not change the chapter order.' },
  ]);
});

test('guesses kinds from wording, in English and Chinese', () => {
  assert.equal(guessKind('We decided to compare the two sites.'), 'decision');
  assert.equal(guessKind('Never use bullet points.'), 'constraint');
  assert.equal(guessKind('Which theory anchors the discussion?'), 'open_item');
  assert.equal(guessKind('Still not sure about the length.'), 'open_item');
  assert.equal(guessKind('The advisor is Prof. Lin.'), 'fact');
  assert.equal(guessKind('第三章采用比较两个田野点的结构。'), 'decision');
  assert.equal(guessKind('不要改动章节顺序。'), 'constraint');
  assert.equal(guessKind('是否需要加入第三个案例？'), 'open_item');
});

test('section headings set the kind of the lines under them', () => {
  const text = `Decisions:\n- Chapter 3 compares the two field sites.\nDo not change:\n- Section order 3.1 to 3.4.\nOpen for you to decide:\n- Transitions between sites.`;
  assert.deepEqual(sliceIntoMemories(text).map((m) => [m.kind, m.text]), [
    ['decision', 'Chapter 3 compares the two field sites.'],
    ['constraint', 'Section order 3.1 to 3.4.'],
    ['open_item', 'Transitions between sites.'],
  ]);
});

test('skips Compass markers, filler and very short fragments', () => {
  const text = `[Handoff from Claude via Compass — project: Thesis]\nYour job: execute the plan below.\nSure, here you go!\nOk.\nWe will keep each site in its own section.\n[End of handoff]`;
  assert.deepEqual(sliceIntoMemories(text).map((m) => m.text), ['We will keep each site in its own section.']);
});

test('splits paragraphs into sentences and pulls out the reason', () => {
  const text = 'We decided to compare the two sites because the advisor asked for it. The thesis is due in May. 第三章不要用列表，因为导师喜欢段落。';
  const slices = sliceIntoMemories(text);
  assert.deepEqual(slices.map((m) => m.text), ['We decided to compare the two sites.', 'The thesis is due in May.', '第三章不要用列表。']);
  assert.deepEqual(slices.map((m) => m.reason), ['the advisor asked for it', '', '导师喜欢段落']);
  assert.deepEqual(slices.map((m) => m.kind), ['decision', 'fact', 'constraint']);
});

test('keeps decimals and abbreviations inside one sentence', () => {
  assert.equal(sliceIntoMemories('Section 3.1 covers the coastal site, e.g. the market.').length, 1);
});

test('makes short titles', () => {
  assert.equal(autoTitle('We decided to compare the two field sites in chapter three because of the advisor.'), 'Compare the two field sites in chapter');
  assert.equal(autoTitle('Do not change the chapter order.'), 'Do not change the chapter order');
  assert.equal(autoTitle('第三章采用比较两个田野点的结构，并单独成节。'), '第三章采用比较两个田野点的结构');
  assert.equal(autoTitle('   '), 'Untitled');
});

test('returns nothing for empty input', () => {
  assert.deepEqual(sliceIntoMemories('  \n '), []);
});

test('titles keep short lead-ins and never end on a filler word', () => {
  assert.equal(autoTitle('Paragraphs, no bullet points.'), 'Paragraphs, no bullet points');
  assert.equal(autoTitle('Field sites: a coastal market town and an inland county seat.'), 'Field sites: a coastal market town');
});

test('a comma inside a number does not cut the title', () => {
  assert.equal(autoTitle('Keep each section under 2,000 words.'), 'Keep each section under 2,000 words');
});

test('an intro line ending in a colon is not a memory', () => {
  assert.deepEqual(sliceIntoMemories("Here's a summary of our conversation:\n- The fieldwork ran from March to June.").map((m) => m.text), ['The fieldwork ran from March to June.']);
});

test('rules are spotted mid-sentence too', () => {
  assert.equal(guessKind('Paragraphs only, never bullet points.'), 'constraint');
  assert.equal(guessKind('The advisor wants each section kept under 3,000 words.'), 'constraint');
});

test('a title cut mid-sentence does not end in a comma', () => {
  assert.equal(autoTitle('Paragraphs only, never bullet points, and the advisor wants more.'), 'Paragraphs only, never bullet points');
});

test('two-word memories are kept, single words are not', () => {
  assert.deepEqual(sliceIntoMemories('- Likes examples.\n- Ok').map((m) => m.text), ['Likes examples.']);
});
