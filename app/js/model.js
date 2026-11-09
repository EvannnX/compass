// Pure state transitions. Every function returns a new state and never mutates its input.
import { autoTitle } from './slicer.js';
import { CUSTOM_ID, CUSTOM_NAME_MAX, MEMORY_KINDS, MIN_PLATFORMS, PLATFORMS, PLATFORM_IDS, QUESTIONS, SCHEMA_VERSION, STALE_AFTER_DAYS, platformName } from './constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const normalize = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ');

export const emptyState = () => ({
  version: SCHEMA_VERSION,
  onboarded: false,
  platforms: PLATFORMS.map((p) => ({ id: p.id, enabled: false })),
  favorite: null,
  taskTypes: [],
  mapEntries: [],
  projects: [],
  memories: [],
  handoffs: [],
  skills: [],
  materials: [],
});

// ---------- Platforms ----------
export const enabledPlatformIds = (state) => state.platforms.filter((p) => p.enabled).map((p) => p.id);

export const customPlatforms = (state) => state.platforms.filter((p) => p.isCustom);

// Every AI the user could pick: the common ones, then the ones they added by hand.
export const allPlatforms = (state) => [...PLATFORMS, ...customPlatforms(state)];

// The user's AIs, plus any others still named in `keep`, in catalogue order.
export const platformChoices = (state, keep = []) => {
  const wanted = new Set([...enabledPlatformIds(state), ...keep]);
  return allPlatforms(state).filter((p) => wanted.has(p.id));
};

export const setEnabledPlatforms = (state, ids) => ({
  ...state,
  platforms: allPlatforms(state).map((p) => ({ ...(p.isCustom ? p : { id: p.id }), enabled: ids.includes(p.id) })),
});

const toWebAddress = (url) => {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return parsed.hostname.includes('.') ? parsed.href : null;
  } catch {
    return null;
  }
};

// Adds an AI that is not in the list. Throws a message the user can read when the input is wrong.
export function addCustomPlatform(state, { name, url = '' }, { isEnabled = true } = {}) {
  const cleanName = name.trim().slice(0, CUSTOM_NAME_MAX);
  if (!cleanName) throw new Error('Give the AI a name.');
  const existing = allPlatforms(state).find((p) => normalize(p.name) === normalize(cleanName));
  if (existing) return { state: setEnabledPlatforms(state, [...enabledPlatformIds(state), existing.id]), id: existing.id };
  const address = toWebAddress(url);
  if (address === null) throw new Error('That web address doesn’t look right. Leave it empty if you’re not sure.');
  const platform = { id: `custom-${newId().replace(/-/g, '').slice(0, 8)}`, name: cleanName, url: address, isCustom: true, enabled: isEnabled };
  return { state: { ...state, platforms: [...state.platforms, platform] }, id: platform.id };
}

// ---------- Map ----------
export const taskLabel = (state, taskTypeId) => state.taskTypes.find((t) => t.id === taskTypeId)?.label ?? '';

export const visibleEntries = (state) => state.mapEntries.filter((e) => !e.removed);

export const daysSince = (iso, at = nowIso()) => Math.floor((Date.parse(at) - Date.parse(iso)) / DAY_MS);

export const needsCheck = (entry, at = nowIso()) =>
  entry.status === 'needs_check' || daysSince(entry.lastVerifiedAt, at) >= STALE_AFTER_DAYS;

export function addMapEntry(state, { label, assignedPlatform, alternatives = [], reason = '', confidence = 'medium', source = 'user_edit', domain, stage }, at = nowIso()) {
  const taskType = { id: newId(), label: label.trim(), domain, stage };
  const entry = {
    id: newId(),
    taskTypeId: taskType.id,
    assignedPlatform,
    alternatives: alternatives.filter((p) => p !== assignedPlatform),
    reason: reason.trim(),
    confidence,
    status: 'valid',
    lastVerifiedAt: at,
    source,
    history: [],
    createdAt: at,
    updatedAt: at,
  };
  return { ...state, taskTypes: [...state.taskTypes, taskType], mapEntries: [...state.mapEntries, entry] };
}

const reviseEntry = (entry, change, cause, at) => ({
  ...entry,
  ...change,
  updatedAt: at,
  history: [...entry.history, { at, change, cause }],
});

export function updateMapEntry(state, entryId, { label, ...change }, at = nowIso()) {
  const entry = state.mapEntries.find((e) => e.id === entryId);
  if (!entry) return state;
  const cleaned = {
    ...change,
    ...(change.alternatives && { alternatives: change.alternatives.filter((p) => p !== (change.assignedPlatform ?? entry.assignedPlatform)) }),
  };
  return {
    ...state,
    taskTypes: label === undefined ? state.taskTypes : state.taskTypes.map((t) => (t.id === entry.taskTypeId ? { ...t, label: label.trim() } : t)),
    mapEntries: state.mapEntries.map((e) => (e.id === entryId ? reviseEntry(e, cleaned, 'user_edit', at) : e)),
  };
}

export const verifyMapEntry = (state, entryId, at = nowIso()) => ({
  ...state,
  mapEntries: state.mapEntries.map((e) =>
    e.id === entryId ? reviseEntry(e, { status: 'valid', lastVerifiedAt: at }, 'user_edit', at) : e),
});

// Map entries are never hard-deleted (PRD Section 3): removing marks them stale and hides them.
export const removeMapEntry = (state, entryId, at = nowIso()) => ({
  ...state,
  mapEntries: state.mapEntries.map((e) =>
    e.id === entryId ? { ...reviseEntry(e, { status: 'stale' }, 'user_edit', at), removed: true } : e),
});

// "Thesis: plan structure" belongs to the Thesis group; a plain label has no group.
export function splitTaskLabel(label) {
  const match = /^([^:]+):\s+(.+)$/.exec(label);
  return match ? { group: match[1].trim(), title: match[2].trim() } : { group: null, title: label };
}

export function groupMapEntries(state) {
  const groups = new Map();
  visibleEntries(state).forEach((entry) => {
    const { group, title } = splitTaskLabel(taskLabel(state, entry.taskTypeId));
    groups.set(group, [...(groups.get(group) ?? []), { entry, title }]);
  });
  return [...groups]
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => (a.name === null) - (b.name === null));
}

const CHANGE_TEXT = { user_edit: 'Edited', weekly_suggestion: 'Suggestion accepted', model_update: 'Model updated', drift_alert: 'Drift alert' };

export function recentMapChanges(state, limit) {
  return visibleEntries(state)
    .flatMap((entry) => {
      const task = taskLabel(state, entry.taskTypeId);
      const created = { at: entry.createdAt, task, what: entry.source === 'onboarding' ? 'Created in onboarding' : 'Added' };
      return [created, ...entry.history.map((h) => ({ at: h.at, task, what: CHANGE_TEXT[h.cause] ?? h.cause }))];
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

// ---------- Projects ----------
export const activeProjects = (state) => state.projects.filter((p) => !p.archived);

export function addProject(state, name, at = nowIso()) {
  const project = { id: newId(), name: name.trim(), archived: false, createdAt: at };
  return { ...state, projects: [...state.projects, project] };
}

export const updateProject = (state, projectId, change) => ({
  ...state,
  projects: state.projects.map((p) => (p.id === projectId ? { ...p, ...change } : p)),
});

// ---------- Reference materials: longer texts such as an outline, feedback or a sample ----------
export function addMaterial(state, { projectId, title, body, source = 'paste' }, at = nowIso()) {
  const material = { id: newId(), projectId, title: title.trim(), body: body.trim(), source, includeInBrief: true, createdAt: at, updatedAt: at };
  return { ...state, materials: [...(state.materials ?? []), material] };
}

export const updateMaterial = (state, id, change, at = nowIso()) => ({
  ...state,
  materials: state.materials.map((m) => (m.id === id ? { ...m, ...change, updatedAt: at } : m)),
});

export const toggleMaterial = (state, id) => ({
  ...state,
  materials: state.materials.map((m) => (m.id === id ? { ...m, includeInBrief: !m.includeInBrief } : m)),
});

export const removeMaterial = (state, id) => ({ ...state, materials: state.materials.filter((m) => m.id !== id) });

export const projectMaterials = (state, projectId) => (state.materials ?? []).filter((m) => m.projectId === projectId);

// Chinese characters count one each, other text counts by word.
export const wordCount = (text) => (text.match(/[\u4e00-\u9fff]|[A-Za-z0-9’']+/g) ?? []).length;

export const archiveProject = (state, projectId) => ({
  ...state,
  projects: state.projects.map((p) => (p.id === projectId ? { ...p, archived: true } : p)),
});

// ---------- Memories ----------
export const activeMemories = (state, { layer, projectId, kind } = {}) =>
  state.memories.filter((m) =>
    m.status === 'active' &&
    (!layer || m.layer === layer) &&
    (!projectId || m.projectId === projectId) &&
    (!kind || m.kind === kind));

export function addMemory(state, { layer, projectId, kind, text, title, reason, excerpt, appliesTo = 'all', platform = 'claude', capturedVia = 'manual_add' }, at = nowIso()) {
  const memory = {
    id: newId(),
    layer,
    ...(layer === 'project' && { projectId }),
    kind,
    text: text.trim(),
    ...(title?.trim() && { title: title.trim() }),
    ...(reason?.trim() && { reason: reason.trim() }),
    appliesTo,
    provenance: { platform, capturedVia, capturedAt: at, ...(excerpt?.trim() && { excerpt: excerpt.trim() }) },
    status: 'active',
    createdAt: at,
    updatedAt: at,
  };
  return { ...state, memories: [...state.memories, memory] };
}

export const memoryTitle = (memory) => memory.title || autoTitle(memory.text);

// Edits keep a list of revisions, like map entries do.
export function updateMemory(state, memoryId, change, at = nowIso()) {
  if (!state.memories.some((m) => m.id === memoryId)) return state;
  return {
    ...state,
    memories: state.memories.map((m) => (m.id === memoryId
      ? { ...m, ...change, updatedAt: at, revisions: [...(m.revisions ?? []), { at, change }] }
      : m)),
  };
}

export const handoffsWithMemory = (state, memory) => {
  const wanted = normalize(memory.text);
  return state.handoffs.filter((h) => h.projectId === memory.projectId &&
    [...h.decisions, ...h.constraints, ...h.openItems].some((text) => normalize(text) === wanted));
};

export const archiveMemory = (state, memoryId, at = nowIso()) => ({
  ...state,
  memories: state.memories.map((m) => (m.id === memoryId ? { ...m, status: 'archived', updatedAt: at } : m)),
});

const appliesToPlatform = (memory, platformId) =>
  !platformId || memory.appliesTo === 'all' || memory.appliesTo.includes(platformId);

// ---------- Skills that apply to a project ----------
export const skillsFor = (state, projectId) =>
  (state.skills ?? []).filter((s) => s.enabled && (s.scope === 'all' || s.scope === projectId));

// ---------- Context block (PRD Section 7) ----------
const section = (title, lines) => (lines.length ? [`${title}:`, ...lines.map((l) => `- ${l}`)] : []);

// An example sits on the line under its memory, so the AI sees what good looks like.
const withExample = (memory, line) => (memory.example?.trim() ? `${line}\n  Example: ${memory.example.trim()}` : line);

const BRIEF_GUIDE = 'How to use this: build on what is already decided, never break the rules, and for anything not decided yet, suggest options and let me choose.';

const skillSection = (skills) => (skills.length ? ['Skills to follow:', ...skills.flatMap((s) => [`## ${s.name}`, s.body])] : []);

export function buildContextBlock(state, projectId, platformId) {
  const project = state.projects.find((p) => p.id === projectId);
  const about = activeMemories(state, { layer: 'global' }).filter((m) => appliesToPlatform(m, platformId));
  const ofKind = (kind) => (project ? activeMemories(state, { layer: 'project', projectId, kind }) : []);
  const decisions = ofKind('decision').map((m) => withExample(m, m.reason ? `${m.text} Why: ${m.reason}` : m.text));
  const plain = (kind) => ofKind(kind).map((m) => withExample(m, m.text));
  const materials = project ? projectMaterials(state, projectId).filter((m) => m.includeInBrief) : [];
  const isGuided = [decisions, plain('constraint'), plain('open_item')].some((lines) => lines.length);
  const body = [
    ...(isGuided ? [BRIEF_GUIDE] : []),
    ...(project?.description?.trim() ? ['About this project:', project.description.trim()] : []),
    ...section('About me', about.map((m) => withExample(m, m.text))),
    ...section('Already decided', decisions),
    ...section('Rules', plain('constraint')),
    ...section('Not decided yet', plain('open_item')),
    ...section('Facts', plain('fact')),
    ...(materials.length ? ['Reference materials:', ...materials.flatMap((m) => [`### ${m.title}`, m.body])] : []),
    ...skillSection(skillsFor(state, projectId)),
  ];
  const header = project ? `[Context from Compass — project: ${project.name}]` : '[Context from Compass]';
  return [header, ...body, '[End of context]'].join('\n');
}

// ---------- Handoff and return (PRD Section 7) ----------
export function draftHandoff(state, projectId) {
  const ofKind = (kind) => activeMemories(state, { layer: 'project', projectId, kind });
  const decisions = ofKind('decision');
  return {
    decisions: decisions.map((m) => m.text),
    reasons: decisions.filter((m) => m.reason).map((m) => m.reason),
    constraints: ofKind('constraint').map((m) => m.text),
    openItems: ofKind('open_item').map((m) => m.text),
  };
}

export function buildHandoffText({ from, projectName, decisions, reasons, constraints, openItems, sourceExcerpt }) {
  const plan = sourceExcerpt?.trim() ? ['Plan text:', sourceExcerpt.trim()] : [];
  return [
    `[Handoff from ${platformName(from)} via Compass — project: ${projectName}]`,
    `Your job: execute the plan below. Keep the decisions and constraints. Use your judgement only on open items.`,
    ...section('Decisions', decisions),
    ...section('Why these decisions', reasons),
    ...section('Do not change', constraints),
    ...section('Open for you to decide', openItems),
    ...plan,
    '[End of handoff]',
  ].join('\n');
}

export function buildReturnText({ projectName, decisions, constraints, result }) {
  return [
    `[Return via Compass — project: ${projectName}]`,
    'This is the result produced from your plan. Compare it with the original decisions and constraints and list any deviations, then say which ones are acceptable.',
    ...section('Original decisions and constraints', [...decisions, ...constraints]),
    'Result:',
    result.trim(),
    '[End of return]',
  ].join('\n');
}

// Records the package and saves decisions and constraints the project does not have yet.
export function recordHandoff(state, pkg, { saveNew = true } = {}, at = nowIso()) {
  const handoff = { id: newId(), ...pkg, createdAt: at };
  const withHandoff = { ...state, handoffs: [...state.handoffs, handoff] };
  if (!saveNew) return withHandoff;

  const known = new Set(activeMemories(state, { layer: 'project', projectId: pkg.projectId }).map((m) => normalize(m.text)));
  const fresh = [
    ...pkg.decisions.map((text) => ({ kind: 'decision', text })),
    ...pkg.constraints.map((text) => ({ kind: 'constraint', text })),
  ].filter(({ text }) => text.trim() && !known.has(normalize(text)));

  return fresh.reduce(
    (s, { kind, text }) => addMemory(s, { layer: 'project', projectId: pkg.projectId, kind, text, platform: pkg.from, capturedVia: 'handoff' }, at),
    withHandoff,
  );
}

export const openHandoffs = (state) => state.handoffs.filter((h) => !h.returnedAt);

export const markHandoffReturned = (state, handoffId, at = nowIso()) => ({
  ...state,
  handoffs: state.handoffs.map((h) => (h.id === handoffId ? { ...h, returnedAt: at } : h)),
});

// ---------- Overview ----------
export function setupProgress(state) {
  const steps = [
    { id: 'ais', label: 'Pick the AIs you use', done: enabledPlatformIds(state).length >= MIN_PLATFORMS, route: 'settings' },
    { id: 'map', label: 'Draw your map', done: visibleEntries(state).length > 0, route: 'map' },
    { id: 'project', label: 'Add a project', done: activeProjects(state).length > 0, route: 'projects' },
    { id: 'memory', label: 'Save decisions for a project', done: activeMemories(state, { layer: 'project' }).length > 0, route: 'projects' },
    { id: 'me', label: 'Tell every AI about you', done: activeMemories(state, { layer: 'global' }).length > 0, route: 'me' },
    { id: 'handoff', label: 'Hand work from one AI to another', done: state.handoffs.length > 0, route: 'handoff' },
  ];
  return { steps, done: steps.filter((step) => step.done).length };
}

const latest = (dates) => dates.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));

export const projectSummaries = (state) => activeProjects(state).map((project) => {
  const memories = activeMemories(state, { layer: 'project', projectId: project.id });
  const counts = Object.fromEntries(MEMORY_KINDS.map((k) => [k.id, memories.filter((m) => m.kind === k.id).length]));
  return { project, counts, total: memories.length, updatedAt: latest([project.createdAt, ...memories.map((m) => m.updatedAt)]) };
});

const KIND_TEXT = { decision: 'a decision', constraint: 'a constraint', open_item: 'an open item', fact: 'a fact', preference: 'a preference' };

export function activityFeed(state, limit, { projectId } = {}) {
  const projectName = (id) => state.projects.find((p) => p.id === id)?.name ?? 'a project';
  const memoryEvents = activeMemories(state).map((m) => ({
    at: m.createdAt,
    kind: 'memory',
    memoryKind: m.kind,
    title: memoryTitle(m),
    detail: m.layer === 'global' ? 'Saved to About me' : `Saved to ${projectName(m.projectId)} as ${KIND_TEXT[m.kind]}`,
    platform: m.provenance.platform,
    projectId: m.projectId,
  }));
  const handoffEvents = state.handoffs.flatMap((h) => [
    { at: h.createdAt, kind: 'handoff', title: `Handed ${projectName(h.projectId)} from ${platformName(h.from)} to ${platformName(h.to)}`, detail: `${h.decisions.length} decisions, ${h.constraints.length} constraints carried`, platform: h.to, projectId: h.projectId },
    ...(h.returnedAt ? [{ at: h.returnedAt, kind: 'return', title: `Brought the result back to ${platformName(h.from)}`, detail: projectName(h.projectId), platform: h.from, projectId: h.projectId }] : []),
  ]);
  const mapEvents = recentMapChanges(state, Infinity).map((c) => ({ at: c.at, kind: 'map', title: c.task, detail: `Map: ${c.what.toLowerCase()}` }));
  const inScope = projectId
    ? [...memoryEvents.filter((e) => e.projectId === projectId), ...handoffEvents.filter((e) => e.projectId === projectId)]
    : [...memoryEvents, ...handoffEvents, ...mapEvents];
  return inScope
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

// Map entries named "Thesis: ..." tell us which AI to suggest inside the Thesis project.
export function projectGoTo(state, projectName) {
  const wanted = projectName.trim().toLowerCase();
  return visibleEntries(state).reduce((acc, entry) => {
    const { group, title } = splitTaskLabel(taskLabel(state, entry.taskTypeId));
    if (group?.toLowerCase() !== wanted) return acc;
    return { ...acc, [entry.assignedPlatform]: [...(acc[entry.assignedPlatform] ?? []), title] };
  }, {});
}

// The AI a project was last sent to, else the user's favourite.
export function lastAiFor(state, projectId) {
  const last = state.handoffs.filter((h) => h.projectId === projectId).at(-1);
  return last?.to ?? state.favorite ?? null;
}

// ---------- Onboarding (PRD Section 5) ----------
export function completeOnboarding(state, { platformIds, answers, favorite, projectName }, at = nowIso()) {
  const withPlatforms = setEnabledPlatforms(state, platformIds);
  const withMap = answers.reduce((s, answer, i) => {
    if (!answer?.platform || answer.platform === 'none') return s;
    const q = QUESTIONS[i];
    return addMapEntry(s, {
      label: q.task,
      domain: q.domain,
      stage: q.stage,
      assignedPlatform: answer.platform,
      reason: answer.reason ?? '',
      confidence: 'medium',
      source: 'onboarding',
    }, at);
  }, withPlatforms);
  const withProject = projectName?.trim() ? addProject(withMap, projectName, at) : withMap;
  return { ...withProject, favorite: favorite ?? null, onboarded: true };
}

// ---------- Import validation ----------
const REQUIRED_ARRAYS = ['platforms', 'taskTypes', 'mapEntries', 'projects', 'memories', 'handoffs'];

const isValidCustom = (p) => p.isCustom === true && CUSTOM_ID.test(p.id) && typeof p.name === 'string' && p.name.trim().length > 0
  && p.name.length <= CUSTOM_NAME_MAX && (p.url === '' || /^https?:\/\//.test(p.url ?? ''));

export function parseImportedState(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('This file is not a Compass export.');
  if (raw.version === undefined) throw new Error('This file is not a Compass export.');
  if (raw.version !== SCHEMA_VERSION) throw new Error(`This file comes from a different version of Compass (${raw.version}), so it can’t be imported here.`);
  const missing = REQUIRED_ARRAYS.filter((key) => !Array.isArray(raw[key]));
  if (missing.length) throw new Error(`This Compass file is incomplete. It is missing: ${missing.join(', ')}.`);
  const unknownPlatform = raw.platforms.find((p) => !PLATFORM_IDS.includes(p.id) && !isValidCustom(p));
  if (unknownPlatform) throw new Error(`Unknown AI in file: ${unknownPlatform.id}.`);
  return { ...emptyState(), ...raw, onboarded: Boolean(raw.onboarded) };
}
