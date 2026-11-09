// Moving memories over from another AI: ask it to list what it remembers, then read the answer back.
import { sliceIntoMemories } from './slicer.js';

const ABOUT_ME = /^about me\s*[:：]?$/i;
const PROJECT = /^project\s*[:：]\s*(.+?)\s*[:：]?$/i;

export const buildMemoryExportPrompt = () => [
  '[Memory export request from Compass]',
  'I am moving to a tool that keeps my context across AI assistants. List everything you remember about me and about the things I work on: preferences, background, ongoing projects, and the decisions and rules I have given you. Use exactly this format and nothing else, one short sentence per line.',
  '',
  'About me:',
  '- <one thing about me or how I like answers>',
  '',
  'Project: <project name>',
  '- <a decision, rule, open question or background fact about this project>',
  '',
  'Repeat the Project block for each project. Leave out anything you are not sure about.',
  '[End of request]',
].join('\n');

const FORMAT = [
  'Already decided:',
  '- <something we settled>',
  'Rules:',
  '- <something every AI must always follow>',
  'Not decided yet:',
  '- <a question I still need to answer>',
  'Background:',
  '- <a fact about the project, like a name, date or source>',
  'About me:',
  '- <something about how I like to work>',
];

// Pasted into an ongoing chat: asks the AI what this chat changed, under the headings Compass reads back.
export const buildUpdateRequest = (projectName) => [
  '[Update request from Compass]',
  `List what we worked out in this chat for my project "${projectName}". One short sentence per line, under these headings. Leave out a heading if nothing new fits it, and leave out anything we only mentioned in passing.`,
  '',
  ...FORMAT,
  '[End of request]',
].join('\n');

// For a summary or notes Compass could not sort well: an AI sorts them into the same headings.
export const buildSortRequest = (projectName, notes) => [
  '[Sort request from Compass]',
  `Sort these notes about my project "${projectName}" under the headings below. One short sentence per line. Split anything that mixes two ideas, drop small talk and repeats, and do not add anything that is not in the notes.`,
  '',
  ...FORMAT,
  '',
  'Notes:',
  notes.trim(),
  '[End of request]',
].join('\n');

const PREFERENCE = /^(i|i'm|i am)\s+(prefer|like|want|love|hate|dislike|need|work best)\b|^我(更)?(喜欢|偏好|希望|习惯)/i;

const isHeading = (line) => /[:：]$/.test(line) && line.split(/\s+/).length <= 5;

// "About me:" lines go to About me; every other heading, and anything before the first one, stays with the project.
export function parseProjectUpdate(text) {
  const groups = [];
  let current = { isMe: false, lines: [] };
  text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).forEach((line) => {
    if (ABOUT_ME.test(line) || (current.isMe && isHeading(line))) {
      groups.push(current);
      current = { isMe: ABOUT_ME.test(line), lines: ABOUT_ME.test(line) ? [] : [line] };
      return;
    }
    current = { ...current, lines: [...current.lines, line] };
  });
  groups.push(current);
  return groups.flatMap(({ isMe, lines }) =>
    sliceIntoMemories(lines.join('\n')).map((slice) => {
      const isAboutMe = isMe || PREFERENCE.test(slice.text);
      return { ...slice, isMe: isAboutMe, kind: isAboutMe ? 'preference' : slice.kind };
    }));
}

// Splits the answer into "About me" and "Project: X" sections, then slices each section into memories.
export function parseMemoryExport(text) {
  const sections = [];
  let current = { destination: 'me', lines: [] };
  text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).forEach((line) => {
    const project = PROJECT.exec(line);
    if (ABOUT_ME.test(line) || project) {
      sections.push(current);
      current = { destination: project ? project[1] : 'me', lines: [] };
      return;
    }
    current = { ...current, lines: [...current.lines, line] };
  });
  sections.push(current);
  return sections.flatMap(({ destination, lines }) =>
    sliceIntoMemories(lines.join('\n')).map((slice) => ({
      ...slice,
      destination,
      kind: destination === 'me' ? 'preference' : slice.kind,
    })));
}
