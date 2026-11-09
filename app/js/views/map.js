import { CONFIDENCE, platformName } from '../constants.js';
import {
  addMapEntry, daysSince, platformChoices, needsCheck, removeMapEntry, taskLabel, updateMapEntry,
  verifyMapEntry, visibleEntries,
} from '../model.js';
import { dot, formatDate, html } from '../ui.js';
import { drawEdges, renderGraph, stats } from './map-graph.js';

const CAUSE_TEXT = { user_edit: 'Edited', weekly_suggestion: 'Suggestion accepted', model_update: 'Model updated', drift_alert: 'Drift alert' };

const platformRadios = (ais, name, selected) => ais.map((p) => html`
  <label class="seg__opt"><input type="radio" name="${name}" value="${p.id}" ${p.id === selected ? 'checked' : ''} required><span>${dot(p.id)}${p.name}</span></label>`);

const form = (state, entry) => {
  const label = entry ? taskLabel(state, entry.taskTypeId) : '';
  const ais = platformChoices(state, entry ? [entry.assignedPlatform, ...entry.alternatives] : []);
  return html`
    <form class="stack" data-submit="map-save" data-id="${entry?.id ?? ''}">
      <label class="field"><span>Kind of work</span><input class="input" name="label" value="${label}" maxlength="60" placeholder="e.g. Thesis: plan structure" required></label>
      <fieldset class="field"><legend>Main AI <em>the one you open first</em></legend><div class="seg">${platformRadios(ais, 'assigned', entry?.assignedPlatform)}</div></fieldset>
      <fieldset class="field"><legend>Backup AI <em>if the main AI isn’t working well</em></legend><div class="seg">
        ${ais.map((p) => html`<label class="seg__opt"><input type="checkbox" name="alternatives" value="${p.id}" ${entry?.alternatives.includes(p.id) ? 'checked' : ''}><span>${dot(p.id)}${p.name}</span></label>`)}
      </div></fieldset>
      <label class="field"><span>Why</span><input class="input" name="reason" value="${entry?.reason ?? ''}" maxlength="120" placeholder="e.g. Best at the big picture"></label>
      <fieldset class="field"><legend>Confidence</legend><div class="seg">
        ${CONFIDENCE.map((c) => html`<label class="seg__opt"><input type="radio" name="confidence" value="${c}" ${c === (entry?.confidence ?? 'medium') ? 'checked' : ''}><span>${c[0].toUpperCase() + c.slice(1)}</span></label>`)}
      </div></fieldset>
      <div class="row">
        <button class="btn">${entry ? 'Save' : 'Add to map'}</button>
        <button type="button" class="btn btn--quiet" data-action="map-close">Cancel</button>
      </div>
    </form>`;
};

const checkNotice = (entry) => html`
  <div class="notice notice--warn">
    <p>${entry.status === 'needs_check' ? 'Marked for a check.' : `Not checked in ${daysSince(entry.lastVerifiedAt)} days.`} Is ${platformName(entry.assignedPlatform)} still right for this?</p>
    <button class="btn btn--sm" data-action="map-verify" data-id="${entry.id}">Still accurate</button>
  </div>`;

const history = (entry) => html`
  <ol class="timeline">
    ${[...entry.history].reverse().map((h) => html`<li><time>${formatDate(h.at)}</time>${CAUSE_TEXT[h.cause] ?? h.cause}</li>`)}
    <li><time>${formatDate(entry.createdAt)}</time>${entry.source === 'onboarding' ? 'Created in onboarding' : 'Added'}</li>
  </ol>`;

const panel = (state, entry) => html`
  <aside class="card panel" aria-label="${entry ? 'Edit map entry' : 'New map entry'}">
    <h2 class="panel__title">${entry ? taskLabel(state, entry.taskTypeId) : 'New kind of work'}</h2>
    ${entry && needsCheck(entry) && checkNotice(entry)}
    ${form(state, entry)}
    ${entry && html`
      <p class="panel__meta">Last checked ${formatDate(entry.lastVerifiedAt)}</p>
      ${history(entry)}
      <button class="btn btn--danger-quiet" data-action="map-remove" data-id="${entry.id}">Remove from map</button>`}
  </aside>`;

const empty = () => html`
  <div class="card empty">
    <h2>Your map is empty.</h2>
    <p>Add the kinds of work you do with AI, like “plan my essay” or “fix code”, and which AI you use for each.</p>
    <button class="btn" data-action="map-add">Add a kind of work</button>
  </div>`;

export function render(ctx) {
  const { state, ui } = ctx;
  const entries = visibleEntries(state);
  const selected = entries.find((e) => e.id === ui.map.selectedId);
  const isPanelOpen = Boolean(selected) || ui.map.isAdding;
  return html`
    <header class="page__head">
      <div><h1>My AI map</h1><p>Which AI you use for each kind of work. Click a card to change it.</p>${entries.length ? stats(state) : ''}</div>
      <button class="btn" data-action="map-add">Add a kind of work</button>
    </header>
    <div class="split ${isPanelOpen ? 'split--open' : ''}">
      <div class="stack-lg">${entries.length ? renderGraph(state, selected?.id) : empty()}</div>
      ${isPanelOpen && panel(state, selected)}
    </div>`;
}

// Card positions move once web fonts load, so draw now and again when they are ready.
export const afterRender = (ctx) => {
  const draw = () => drawEdges(ctx.root, ctx.ui.map.selectedId);
  draw();
  document.fonts?.ready.then(draw);
};

// ---------- Actions ----------
const setMap = (ctx, patch) => ctx.setUi({ map: { ...ctx.ui.map, ...patch } });
const closePanel = (ctx) => setMap(ctx, { selectedId: null, isAdding: false });

export const actions = {
  'map-select': (ctx, el) => setMap(ctx, { selectedId: el.dataset.id === ctx.ui.map.selectedId ? null : el.dataset.id, isAdding: false }),
  'map-add': (ctx) => setMap(ctx, { selectedId: null, isAdding: true }),
  'map-close': closePanel,
  'map-save': (ctx, form) => {
    const data = new FormData(form);
    const values = {
      label: String(data.get('label') ?? ''),
      assignedPlatform: String(data.get('assigned') ?? ''),
      alternatives: data.getAll('alternatives').map(String),
      reason: String(data.get('reason') ?? ''),
      confidence: String(data.get('confidence') ?? 'medium'),
    };
    if (!values.label.trim() || !values.assignedPlatform) return;
    const id = form.dataset.id;
    if (id) {
      ctx.commit(updateMapEntry(ctx.state, id, values), 'Saved');
      return;
    }
    const next = addMapEntry(ctx.state, values);
    ctx.commit(next, 'Added to your map');
    setMap(ctx, { selectedId: next.mapEntries.at(-1).id, isAdding: false });
  },
  'map-verify': (ctx, el) => ctx.commit(verifyMapEntry(ctx.state, el.dataset.id), 'Marked as checked today'),
  'map-remove': (ctx, el) => {
    ctx.commit(removeMapEntry(ctx.state, el.dataset.id), 'Removed from your map');
    closePanel(ctx);
  },
};
