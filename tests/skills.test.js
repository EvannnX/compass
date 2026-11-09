import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMapEntry, addMemory, addProject, buildContextBlock, emptyState, parseImportedState, recordHandoff } from '../app/js/model.js';
import {
  buildSkillExtractionPrompt, installSkill, parseSkillDocuments, parseSkillMarkdown, removeSkill, setSkillScope,
  skillToMarkdown, skillsFor, toggleSkill,
} from '../app/js/skills.js';

const AT = '2026-11-02T10:00:00.000Z';
const SKILL_MD = `---
name: polish-academic-writing
description: Tighten academic prose without changing the argument. Use when polishing a thesis chapter.
---
1. Keep paragraphs, never bullet points.
2. Cut filler words.`;

const withProject = () => {
  const s = addProject(emptyState(), 'Thesis', AT);
  return { state: s, projectId: s.projects[0].id };
};

test('parses a SKILL.md document with front matter', () => {
  assert.deepEqual(parseSkillMarkdown(SKILL_MD), {
    name: 'polish-academic-writing',
    description: 'Tighten academic prose without changing the argument. Use when polishing a thesis chapter.',
    body: '1. Keep paragraphs, never bullet points.\n2. Cut filler words.',
  });
});

test('accepts quoted values and Windows line endings', () => {
  const doc = '---\r\nname: "plan-chapters"\r\ndescription: \'Plan chapters.\'\r\n---\r\nStep one.';
  assert.equal(parseSkillMarkdown(doc).name, 'plan-chapters');
  assert.equal(parseSkillMarkdown(doc).description, 'Plan chapters.');
});

test('rejects broken skills with a clear message', () => {
  assert.throws(() => parseSkillMarkdown('just text'), /starts with a --- block/);
  assert.throws(() => parseSkillMarkdown('---\ndescription: x\n---\nbody'), /needs a name/);
  assert.throws(() => parseSkillMarkdown('---\nname: Bad Name\ndescription: x\n---\nbody'), /lowercase letters, numbers and hyphens/);
  assert.throws(() => parseSkillMarkdown('---\nname: ok\n---\nbody'), /needs a description/);
  assert.throws(() => parseSkillMarkdown('---\nname: ok\ndescription: x\n---\n   '), /has no instructions/);
});

test('finds several skills in one AI answer, ignoring text around them', () => {
  const answer = `Sure! Here are two skills.\n\n${SKILL_MD}\n\n---\nname: plan-chapters\ndescription: Plan a chapter.\n---\nOutline first.\n\nHope this helps.`;
  const { skills, errors } = parseSkillDocuments(answer);
  assert.deepEqual(skills.map((s) => s.name), ['polish-academic-writing', 'plan-chapters']);
  assert.equal(skills[1].body, 'Outline first.\n\nHope this helps.');
  assert.deepEqual(errors, []);
});

test('reports skills it could not read and finds none in plain text', () => {
  const { skills, errors } = parseSkillDocuments('---\nname: Bad Name\ndescription: x\n---\nbody');
  assert.equal(skills.length, 0);
  assert.match(errors[0], /lowercase/);
  assert.deepEqual(parseSkillDocuments('no skills here'), { skills: [], errors: [] });
});

test('installs a skill, and reinstalling the same name updates it', () => {
  const s = installSkill(emptyState(), { ...parseSkillMarkdown(SKILL_MD), source: 'paste' }, AT);
  assert.equal(s.skills.length, 1);
  assert.equal(s.skills[0].enabled, true);
  assert.equal(s.skills[0].scope, 'all');
  const again = installSkill(s, { ...parseSkillMarkdown(SKILL_MD), body: 'New body.', source: 'file' }, '2026-11-03T10:00:00.000Z');
  assert.equal(again.skills.length, 1);
  assert.equal(again.skills[0].body, 'New body.');
  assert.equal(again.skills[0].installedAt, AT);
  assert.equal(s.skills[0].body.startsWith('1.'), true);
});

test('skills apply to all projects or one, and can be switched off or removed', () => {
  const { state, projectId } = withProject();
  const s = installSkill(state, { ...parseSkillMarkdown(SKILL_MD), source: 'paste' }, AT);
  const id = s.skills[0].id;
  assert.equal(skillsFor(s, projectId).length, 1);
  assert.equal(skillsFor(setSkillScope(s, id, 'other-project'), projectId).length, 0);
  assert.equal(skillsFor(setSkillScope(s, id, projectId), projectId).length, 1);
  assert.equal(skillsFor(toggleSkill(s, id), projectId).length, 0);
  assert.equal(removeSkill(s, id).skills.length, 0);
});

test('turns a skill back into SKILL.md text', () => {
  const s = installSkill(emptyState(), { ...parseSkillMarkdown(SKILL_MD), source: 'paste' }, AT);
  assert.equal(skillToMarkdown(s.skills[0]), SKILL_MD);
});

test('the brief lists the skills that apply to the project', () => {
  const { state, projectId } = withProject();
  const s = installSkill(state, { ...parseSkillMarkdown(SKILL_MD), source: 'paste' }, AT);
  assert.match(buildContextBlock(s, projectId), /Skills to follow:\n## polish-academic-writing\n1\. Keep paragraphs/);
  assert.doesNotMatch(buildContextBlock(state, projectId), /Skills to follow/);
});

test('the extraction request carries the workflow and asks for SKILL.md answers', () => {
  const { state, projectId } = withProject();
  const s = recordHandoff(
    addMemory(addMapEntry(state, { label: 'Thesis: plan', assignedPlatform: 'claude', reason: 'Big picture' }, AT),
      { layer: 'project', projectId, kind: 'constraint', text: 'Keep chapter order.' }, AT),
    { projectId, from: 'claude', to: 'chatgpt', decisions: ['Compare two sites.'], reasons: [], constraints: [], openItems: [] }, { saveNew: false }, AT);
  const prompt = buildSkillExtractionPrompt(s, projectId);
  assert.match(prompt, /^\[Skill request from Compass\]/);
  assert.match(prompt, /- Thesis: plan → Claude \(why: Big picture\)/);
  assert.match(prompt, /Rules:\n- Keep chapter order\./);
  assert.match(prompt, /- Claude → ChatGPT: Compare two sites\./);
  assert.match(prompt, /name: lowercase-words-with-hyphens/);
  assert.match(buildSkillExtractionPrompt(s, null), /Project: Thesis/);
});

test('old exports without skills still import', () => {
  const { skills, ...old } = emptyState();
  assert.deepEqual(parseImportedState(old).skills, []);
});
