// The project's flow: this project on the left, Compass in the middle, every one of your AIs on the right.
// The line to the AI being briefed, sent to or brought back from moves; the others stay still.
import { platformName } from '../constants.js';
import { activeMemories, enabledPlatformIds, platformChoices, projectGoTo, projectMaterials } from '../model.js';
import { dot, html } from '../ui.js';
import { renderAiPicker } from './ai-picker.js';

const CURVE_PULL = 0.5;
const COMPASS = html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>`;

// What Compass is doing for this project right now, and which AI it is doing it with.
function status(ui, projectId) {
  const back = ui.updating?.projectId === projectId ? ui.updating.ai : null;
  if (back) return { text: `Bringing back from ${platformName(back)}`, live: back, tone: 'busy' };
  if (ui.continueTo) return { text: `Briefing ${platformName(ui.continueTo)}`, live: ui.continueTo, tone: 'busy' };
  if (ui.away?.projectId === projectId) return { text: `Sent to ${platformName(ui.away.ai)}`, live: ui.away.ai, tone: 'done' };
  return { text: 'Pick an AI', live: null, tone: '' };
}

const savedCount = (state, projectId) =>
  activeMemories(state, { layer: 'project', projectId }).length + projectMaterials(state, projectId).length;

const row = (p, note, live, isOpen) => html`
  <button class="brow ${live === p.id ? 'is-live' : ''}" data-action="cont-open" data-id="${p.id}" data-p="${p.id}" aria-expanded="${isOpen}">
    <i class="brow__radio"></i>
    <span class="brow__name">${dot(p.id)}${p.name}</span>
    <span class="brow__note">${note}</span>
  </button>`;

export function renderBoard(ctx, project) {
  const { state, ui } = ctx;
  const goTo = projectGoTo(state, project.name);
  const ais = platformChoices(state, Object.keys(goTo));
  const now = status(ui, project.id);
  const saved = savedCount(state, project.id);
  return html`
    <div class="board ${now.live ? 'has-live' : ''}">
      <svg class="board__wires" aria-hidden="true"></svg>
      <div class="bnode bnode--src">
        <p class="bnode__title">${project.name}</p>
        <p class="bnode__sub">${saved ? `${saved} ${saved === 1 ? 'thing' : 'things'} saved` : 'Nothing saved yet'}</p>
      </div>
      <div class="bnode bnode--hub">
        ${COMPASS}
        <p class="bnode__title">Compass</p>
        <span class="bpill ${now.tone ? `is-${now.tone}` : ''}">${now.text}</span>
      </div>
      <div class="board__rows">
        ${ais.map((p) => row(p, goTo[p.id] ? `Main AI for ${goTo[p.id].join(', ')}` : 'Open with this project', now.live, ui.continueTo === p.id))}
        <button class="brow brow--add" data-action="board-edit" aria-expanded="${Boolean(ui.editingAis)}">${ui.editingAis ? 'Done' : '+ Add or remove AIs'}</button>
      </div>
    </div>
    ${ui.editingAis && html`
      <div class="board__edit">
        <p class="muted small">Tap an AI to add or remove it. Not in the list? Add it by name.</p>
        ${renderAiPicker(state, enabledPlatformIds(state), 'live')}
      </div>`}`;
}

// ---------- Lines: measured after render, redrawn on resize ----------
const edge = (el, box, side) => {
  const r = el.getBoundingClientRect();
  return { x: (side === 'right' ? r.right : r.left) - box.left, y: r.top + r.height / 2 - box.top };
};

const curve = (from, to) => {
  const pull = (to.x - from.x) * CURVE_PULL;
  return `M${from.x},${from.y} C${from.x + pull},${from.y} ${to.x - pull},${to.y} ${to.x},${to.y}`;
};

export function drawBoard(root) {
  const board = root.querySelector('.board');
  if (!board) return;
  const svg = board.querySelector('.board__wires');
  const box = board.getBoundingClientRect();
  const hub = board.querySelector('.bnode--hub');
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  const into = `<path class="bwire bwire--in" d="M${edge(board.querySelector('.bnode--src'), box, 'right').x},${edge(hub, box, 'left').y} L${edge(hub, box, 'left').x},${edge(hub, box, 'left').y}"/>`;
  const out = [...board.querySelectorAll('.brow:not(.brow--add)')].map((rowEl) => {
    const live = rowEl.classList.contains('is-live') ? ' is-live' : '';
    return `<path class="bwire${live}" d="${curve(edge(hub, box, 'right'), edge(rowEl, box, 'left'))}"/>`;
  });
  svg.innerHTML = into + out.join('');
}

export const actions = {
  'board-edit': (ctx) => ctx.setUi({ editingAis: !ctx.ui.editingAis }),
};
