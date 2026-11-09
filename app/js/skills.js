// Skills: reusable instructions in the SKILL.md format (front matter with name and description, then the steps).
// Every function is pure and returns a new state.
import { MEMORY_KINDS, platformName } from './constants.js';
import { activeMemories, activeProjects, skillsFor, taskLabel, visibleEntries } from './model.js';

export { skillsFor };

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const RECENT_HANDOFFS = 5;
const DOC_START = /^---[ \t]*\nname:/gm;

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const normalize = (text) => text.replace(/\r\n/g, '\n').replace(/^```[a-z]*[ \t]*$/gm, '');
const unquote = (value) => value.trim().replace(/^(["'])(.*)\1$/, '$2');

export function parseSkillMarkdown(text) {
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?([\s\S]*)$/.exec(normalize(text).trim());
  if (!match) throw new Error('A skill starts with a --- block that holds its name and description.');
  const fields = Object.fromEntries(match[1].split('\n')
    .map((line) => /^([a-zA-Z_-]+):\s*(.*)$/.exec(line))
    .filter(Boolean)
    .map(([, key, value]) => [key.toLowerCase(), unquote(value)]));
  const name = fields.name ?? '';
  const description = fields.description ?? '';
  const body = match[2].trim();
  if (!name) throw new Error('A skill needs a name.');
  if (!NAME_PATTERN.test(name) || name.length > MAX_NAME) throw new Error(`“${name}” is not a valid name. Skill names use lowercase letters, numbers and hyphens, like polish-writing.`);
  if (!description) throw new Error(`The skill “${name}” needs a description.`);
  if (description.length > MAX_DESCRIPTION) throw new Error(`The description of “${name}” is too long.`);
  if (!body) throw new Error(`The skill “${name}” has no instructions.`);
  return { name, description, body };
}

// An AI answer may hold several skills and some chatter around them.
export function parseSkillDocuments(text) {
  const doc = normalize(text);
  const starts = [...doc.matchAll(DOC_START)].map((m) => m.index);
  return starts.reduce((acc, start, i) => {
    try {
      return { ...acc, skills: [...acc.skills, parseSkillMarkdown(doc.slice(start, starts[i + 1]))] };
    } catch (error) {
      return { ...acc, errors: [...acc.errors, error.message] };
    }
  }, { skills: [], errors: [] });
}

export const skillToMarkdown = ({ name, description, body }) => `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;

// Installing a skill with a name that already exists updates it in place.
export function installSkill(state, { name, description, body, source }, at = nowIso()) {
  const existing = state.skills.find((s) => s.name === name);
  if (existing) {
    return {
      ...state,
      skills: state.skills.map((s) => (s.id === existing.id ? { ...s, description, body, source, updatedAt: at } : s)),
    };
  }
  const skill = { id: newId(), name, description, body, source, enabled: true, scope: 'all', installedAt: at, updatedAt: at };
  return { ...state, skills: [...state.skills, skill] };
}

const updateSkill = (state, id, change) => ({
  ...state,
  skills: state.skills.map((s) => (s.id === id ? { ...s, ...change } : s)),
});

export const toggleSkill = (state, id) => updateSkill(state, id, { enabled: !state.skills.find((s) => s.id === id)?.enabled });
export const setSkillScope = (state, id, scope) => updateSkill(state, id, { scope });
export const removeSkill = (state, id) => ({ ...state, skills: state.skills.filter((s) => s.id !== id) });

// ---------- The request that asks an AI to find skills in the user's workflow ----------
const list = (title, lines) => (lines.length ? [`${title}:`, ...lines.map((l) => `- ${l}`)] : []);

function projectLines(state, project) {
  const kinds = MEMORY_KINDS.flatMap((kind) =>
    list(kind.group, activeMemories(state, { layer: 'project', projectId: project.id, kind: kind.id }).map((m) => m.text)));
  return [`Project: ${project.name}`, ...kinds];
}

export function buildSkillExtractionPrompt(state, projectId) {
  const projects = activeProjects(state).filter((p) => !projectId || p.id === projectId);
  const inScope = new Set(projects.map((p) => p.id));
  const handoffs = state.handoffs.filter((h) => inScope.has(h.projectId)).slice(-RECENT_HANDOFFS);
  return [
    '[Skill request from Compass]',
    'I use several AI assistants. Below is how I work. Find repeatable ways of working that could become reusable skills: instructions an AI can follow the next time I do this kind of work. Return 1 to 3 skills and nothing else. Write each one exactly like this:',
    '',
    '---',
    'name: lowercase-words-with-hyphens',
    'description: One sentence on what the skill does and when to use it.',
    '---',
    'Step-by-step instructions, written to the AI.',
    '',
    ...list('How I split work between AIs', visibleEntries(state).map((e) =>
      `${taskLabel(state, e.taskTypeId)} → ${platformName(e.assignedPlatform)}${e.reason ? ` (why: ${e.reason})` : ''}`)),
    ...list('About me', activeMemories(state, { layer: 'global' }).map((m) => m.text)),
    ...projects.flatMap((p) => projectLines(state, p)),
    ...list('Recent hand-offs', handoffs.map((h) => `${platformName(h.from)} → ${platformName(h.to)}: ${h.decisions.join('; ') || 'no decisions listed'}`)),
    '[End of request]',
  ].join('\n');
}
