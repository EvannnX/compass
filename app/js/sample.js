import { installSkill, setSkillScope } from './skills.js';
import {
  addMapEntry, addMaterial, addMemory, addProject, emptyState, markHandoffReturned, recordHandoff, setEnabledPlatforms, updateMemory,
  updateProject,
} from './model.js';

const daysAgo = (n, at) => new Date(Date.parse(at) - n * 24 * 60 * 60 * 1000).toISOString();

const ENTRIES = [
  { label: 'Thesis: plan structure', assignedPlatform: 'claude', alternatives: ['chatgpt'], reason: 'Best at the big picture', confidence: 'high', age: 3 },
  { label: 'Thesis: execute', assignedPlatform: 'chatgpt', alternatives: ['deepseek'], reason: 'Cheap and fast for drafting from a fixed plan', confidence: 'medium', age: 34 },
  { label: 'Polish writing', assignedPlatform: 'claude', reason: 'Keeps my voice', confidence: 'high', age: 6 },
  { label: 'Check Chinese text', assignedPlatform: 'deepseek', reason: 'Most natural Chinese', confidence: 'high', age: 10 },
  { label: 'Research', assignedPlatform: 'gemini', alternatives: ['chatgpt'], reason: 'Good with sources', confidence: 'medium', age: 12 },
  { label: 'Code', assignedPlatform: 'chatgpt', alternatives: ['claude'], reason: 'Habit', confidence: 'medium', age: 20 },
];

const THESIS_MEMORIES = [
  { kind: 'decision', text: 'Chapter 3 compares the two field sites.', reason: 'Advisor asked for a comparative frame.' },
  { kind: 'decision', text: 'Comparison stays its own section.', reason: "Keeps each site's account clean." },
  { kind: 'constraint', text: 'Do not change the chapter order.' },
  { kind: 'constraint', text: 'Paragraphs, no bullet points.' },
  { kind: 'open_item', text: 'Which theory anchors the discussion.' },
  { kind: 'fact', text: 'Field sites: a coastal market town and an inland county seat.' },
];

const THESIS_SKILL = {
  name: 'draft-thesis-chapter',
  description: 'Draft a thesis chapter from an agreed outline. Use when an outline is settled and prose is needed.',
  body: '1. Restate the outline and the decisions before writing.\n2. Write in paragraphs, never bullet points.\n3. Keep each field site in its own section; compare them only in the comparison section.\n4. End by listing anything you changed from the outline.',
};

const THESIS_ABOUT = 'A master’s thesis in human geography comparing two field sites in coastal and inland Fujian. Chapters 1 and 2 are done. Now drafting chapter 3, the cross-site comparison. Due to the advisor in May.';

const ADVISOR_FEEDBACK = 'The comparison is promising but reads like two separate reports. Introduce one shared question at the start of chapter 3 and come back to it at the end of each section.\nUse more local sources: county gazetteers and the market committee minutes.\nKeep the tone descriptive; save the theory for chapter 4.';

const PARAGRAPH_EXAMPLE = 'The coastal market town was chosen because its weekly market still draws traders from three counties. Unlike the inland site, where trade moved to a permanent mall in 2015, the market here keeps its old rhythm, which makes the contrast between the two places visible week by week.';

const ABOUT_ME = [
  { text: 'Write in paragraphs, no bullet points.' },
  { text: 'Keep answers under 300 words unless I ask for more.' },
  { text: 'Reply in Chinese when I write in Chinese.', appliesTo: ['deepseek', 'chatgpt'] },
];

export function exampleState(at = new Date().toISOString()) {
  const withAis = setEnabledPlatforms(emptyState(), ['claude', 'chatgpt', 'gemini', 'deepseek']);
  const withMap = ENTRIES.reduce(
    (s, { age, ...entry }) => addMapEntry(s, { ...entry, source: 'onboarding' }, daysAgo(age, at)),
    withAis,
  );
  const withProjects = ['Thesis', 'Grad school essays'].reduce((s, name) => addProject(s, name, at), withMap);
  const thesisId = withProjects.projects[0].id;
  const withThesis = THESIS_MEMORIES.reduce(
    (s, m) => addMemory(s, { layer: 'project', projectId: thesisId, platform: 'claude', ...m }, at),
    withProjects,
  );
  const withMe = ABOUT_ME.reduce((s, m) => addMemory(s, { layer: 'global', kind: 'preference', ...m }, at), withThesis);
  const handoff = (s, extra, when) => recordHandoff(s, {
    projectId: thesisId, from: 'claude', to: 'chatgpt',
    decisions: THESIS_MEMORIES.filter((m) => m.kind === 'decision').map((m) => m.text),
    reasons: THESIS_MEMORIES.filter((m) => m.reason).map((m) => m.reason),
    constraints: THESIS_MEMORIES.filter((m) => m.kind === 'constraint').map((m) => m.text),
    openItems: [],
    ...extra,
  }, { saveNew: false }, when);
  const withReviewed = handoff(withMe, { openItems: ['Length of each subsection.'] }, daysAgo(5, at));
  const reviewed = markHandoffReturned(withReviewed, withReviewed.handoffs[0].id, daysAgo(4, at));
  const withOpen = handoff(reviewed, { openItems: ['Transitions between sites.'] }, daysAgo(1, at));
  const withSkill = installSkill(withOpen, { ...THESIS_SKILL, source: 'extracted' }, daysAgo(2, at));
  const scoped = setSkillScope(withSkill, withSkill.skills[0].id, thesisId);
  const described = updateProject(scoped, thesisId, { description: THESIS_ABOUT });
  const withMaterial = addMaterial(described, { projectId: thesisId, title: 'Advisor feedback, Oct 30', body: ADVISOR_FEEDBACK }, daysAgo(3, at));
  const paragraphRule = withMaterial.memories.find((m) => m.text === 'Paragraphs, no bullet points.');
  const withExample = updateMemory(withMaterial, paragraphRule.id, { example: PARAGRAPH_EXAMPLE }, at);
  return { ...withExample, favorite: 'claude', onboarded: true };
}
