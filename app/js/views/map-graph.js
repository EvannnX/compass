// Node-and-edge view of the map: tasks on the left, AIs on the right, curves between them.
import { platformName } from '../constants.js';
import { allPlatforms, enabledPlatformIds, groupMapEntries, needsCheck, recentMapChanges, visibleEntries } from '../model.js';
import { formatDate, html } from '../ui.js';

const RECENT_LIMIT = 4;
const CURVE_PULL = 0.5;
const SAFE_ID = /^[a-z0-9-]+$/;

const quote = (reason) => (reason ? `“${reason}”` : 'No reason yet');

const taskCard = ({ entry, title }, selectedId) => html`
  <button class="tnode ${entry.id === selectedId ? 'is-selected' : ''}" data-action="map-select" data-id="${entry.id}">
    <span class="tnode__top">
      <span class="tnode__title">${title}</span>
      ${needsCheck(entry) ? html`<span class="pill pill--warn">Check</span>` : html`<span class="tnode__conf">${entry.confidence}</span>`}
    </span>
    <span class="tnode__why">${quote(entry.reason)}</span>
    <span class="tnode__route"><i class="dot" data-p="${entry.assignedPlatform}"></i>${platformName(entry.assignedPlatform)}${entry.alternatives.length ? html`<span class="tnode__alt">backup: ${entry.alternatives.map(platformName).join(', ')}</span>` : ''}</span>
    <i class="port port--out" data-p="${entry.assignedPlatform}" data-task-port="${entry.id}"></i>
  </button>`;

const taskColumn = (groups, selectedId) => html`
  <div class="gcol">
    <p class="gcol__head">Kinds of work <span>${groups.reduce((n, g) => n + g.items.length, 0)}</span></p>
    ${groups.map((g) => html`
      <section class="ggroup">
        <p class="ggroup__head"><span>${g.name ?? 'Everyday'}</span><span>${g.items.length} ${g.items.length === 1 ? 'task' : 'tasks'}</span></p>
        ${g.items.map((item) => taskCard(item, selectedId))}
      </section>`)}
  </div>`;

const aiRow = ({ entry, title, group }, role, selectedId) => html`
  <button class="arow ${role === 'backup' ? 'arow--backup' : ''} ${entry.id === selectedId ? 'is-selected' : ''}" data-action="map-select" data-id="${entry.id}">
    <i class="port port--in" data-ai-port="${entry.id}" data-role="${role}" data-check="${role === 'main' && needsCheck(entry)}"></i>
    <span class="arow__title">${title}${group ? html`<span class="arow__group">${group}</span>` : ''}</span>
    <span class="arow__role">${role === 'main' ? (needsCheck(entry) ? 'check this' : 'main') : 'backup'}</span>
  </button>`;

function aiNode(platformId, items, selectedId) {
  const main = items.filter((i) => i.entry.assignedPlatform === platformId);
  const backup = items.filter((i) => i.entry.alternatives.includes(platformId));
  return html`
    <article class="anode" data-p="${platformId}">
      <header class="anode__head">
        <span class="anode__mark"></span>
        <span class="anode__name">${platformName(platformId)}</span>
        <span class="anode__count">${main.length} main${backup.length ? `, ${backup.length} backup` : ''}</span>
      </header>
      ${main.length || backup.length
        ? html`<div class="anode__rows">${main.map((i) => aiRow(i, 'main', selectedId))}${backup.map((i) => aiRow(i, 'backup', selectedId))}</div>`
        : html`<p class="anode__empty">No tasks yet</p>`}
    </article>`;
}

const aiColumn = (state, groups, selectedId) => {
  const items = groups.flatMap((g) => g.items.map((item) => ({ ...item, group: g.name })));
  const used = new Set([...enabledPlatformIds(state), ...items.flatMap((i) => [i.entry.assignedPlatform, ...i.entry.alternatives])]);
  const platforms = allPlatforms(state).filter((p) => used.has(p.id)).map((p) => p.id);
  return html`
    <div class="gcol">
      <p class="gcol__head">Your AIs <span>${platforms.length}</span></p>
      ${platforms.map((id) => aiNode(id, items, selectedId))}
    </div>`;
};

const recentStrip = (state) => html`
  <section class="recent" aria-label="Recent changes">
    <p class="gcol__head">Recent changes</p>
    <ol class="recent__list">
      ${recentMapChanges(state, RECENT_LIMIT).map((c) => html`
        <li><time>${formatDate(c.at)}</time><span class="recent__task">${c.task}</span><span class="recent__what">${c.what}</span></li>`)}
    </ol>
  </section>`;

export const stats = (state) => {
  const entries = visibleEntries(state);
  const checks = entries.filter((e) => needsCheck(e)).length;
  return html`
    <p class="stats">
      <span><b>${entries.length}</b> kinds of work</span>
      <span><b>${new Set(entries.map((e) => e.assignedPlatform)).size}</b> AIs in use</span>
      <span class="${checks ? 'stats__warn' : ''}"><b>${checks}</b> to check</span>
    </p>`;
};

export function renderGraph(state, selectedId) {
  const groups = groupMapEntries(state);
  return html`
    <div class="legend2" aria-label="How to read the map">
      <span><svg viewBox="0 0 40 8" aria-hidden="true"><path d="M2 4h36" class="lg lg--main"/></svg><b>Solid line</b> your main AI for that work</span>
      <span><svg viewBox="0 0 40 8" aria-hidden="true"><path d="M2 4h36" class="lg lg--backup"/></svg><b>Dashed line</b> backup, if the main AI isn’t working well</span>
      <span><svg viewBox="0 0 40 8" aria-hidden="true"><path d="M2 4h36" class="lg lg--check"/></svg><b>Orange dots</b> not checked for a while, worth a look</span>
    </div>
    <div class="card graph ${selectedId ? 'has-selection' : ''}">
      <svg class="graph__edges" aria-hidden="true"></svg>
      ${taskColumn(groups, selectedId)}
      ${aiColumn(state, groups, selectedId)}
    </div>
    ${recentStrip(state)}`;
}

// ---------- Edges: measured after render, redrawn on resize ----------
const centerOf = (el, box) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
};

function edgePath(from, to) {
  const pull = (to.x - from.x) * CURVE_PULL;
  return `M${from.x},${from.y} C${from.x + pull},${from.y} ${to.x - pull},${to.y} ${to.x},${to.y}`;
}

export function drawEdges(root, selectedId) {
  const graph = root.querySelector('.graph');
  if (!graph) return;
  const svg = graph.querySelector('.graph__edges');
  const box = graph.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);

  svg.innerHTML = [...graph.querySelectorAll('[data-ai-port]')].map((target) => {
    const id = target.dataset.aiPort;
    const source = graph.querySelector(`[data-task-port="${id}"]`);
    if (!source) return '';
    const platform = target.closest('[data-p]').dataset.p;
    if (!SAFE_ID.test(platform)) return '';
    const classes = [
      'edge',
      target.dataset.role === 'backup' ? 'edge--backup' : '',
      target.dataset.check === 'true' ? 'edge--check' : '',
      selectedId && selectedId !== id ? 'edge--dim' : '',
      selectedId === id ? 'edge--on' : '',
    ].filter(Boolean).join(' ');
    return `<path class="${classes}" data-p="${platform}" d="${edgePath(centerOf(source, box), centerOf(target, box))}"/>`;
  }).join('');
}
