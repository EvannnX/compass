import { useCustomPlatforms } from './constants.js';
import { activeProjects, customPlatforms, needsCheck, openHandoffs, visibleEntries } from './model.js';
import { loadState, saveState } from './storage.js';
import { html, toHtml, toast } from './ui.js';
import * as aiPicker from './views/ai-picker.js';
import * as board from './views/board.js';
import * as importView from './views/import.js';
import * as map from './views/map.js';
import * as materials from './views/materials.js';
import * as me from './views/me.js';
import * as memoryCards from './views/memory-cards.js';
import * as memoryList from './views/memory-list.js';
import * as onboarding from './views/onboarding.js';
import * as project from './views/project.js';
import * as settings from './views/settings.js';
import * as skills from './views/skills.js';
import * as update from './views/update.js';

const ROUTES = [
  { id: 'project', title: 'Projects', view: project },
  { id: 'map', title: 'My AI map', view: map },
  { id: 'me', title: 'About me', view: me },
  { id: 'skills', title: 'Skills', view: skills },
  { id: 'settings', title: 'Settings', view: settings },
];
const VIEWS = [...ROUTES.map((r) => r.view), onboarding, memoryList, memoryCards, materials, importView, update, aiPicker, board];
const merge = (key) => Object.assign({}, ...VIEWS.map((v) => v[key] ?? {}));
const ACTIONS = merge('actions');
const INPUTS = merge('inputs');
const CHANGES = merge('changes');

const root = document.getElementById('app');

// "#/p/<id>" opens a project; "#/map", "#/me", "#/settings" open the other pages.
function parseHash() {
  const [first, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (first === 'p') return { route: 'project', projectId: id ?? null };
  return ROUTES.some((r) => r.id === first) ? { route: first, projectId: null } : { route: 'project', projectId: null };
}
const hashFor = (routeId, id) => (routeId === 'project' ? (id ? `#/p/${id}` : '#/') : `#/${routeId}`);

const loaded = loadState();
let state = loaded.state;
let ui = {
  ...parseHash(),
  ob: onboarding.initialOnboarding(),
  isRedoing: false,
  isNaming: false,
  continueTo: null,
  map: { selectedId: null, isAdding: false },
};
let pendingFocus = null;

// ---------- Rendering ----------
const sidebar = () => {
  const checks = visibleEntries(state).filter((e) => needsCheck(e)).length;
  const waiting = new Set(openHandoffs(state).map((h) => h.projectId));
  const current = project.currentProject({ state, ui });
  const link = (id, label, extra = '') => html`<a class="nav-link" href="#/${id}" aria-current="${ui.route === id ? 'page' : 'false'}">${label}${extra}</a>`;
  return html`
    <aside class="sidebar">
      <a class="sidebar__brand" href="index.html">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>Compass
      </a>
      <button class="sidebar__new" data-action="proj-new">+ New project</button>
      ${ui.isNaming && html`
        <form class="sidebar__name" data-submit="proj-create">
          <input class="input" name="name" maxlength="60" placeholder="Project name" aria-label="Project name" required>
        </form>`}
      <p class="sidebar__label">Projects</p>
      <nav class="sidebar__projects" aria-label="Projects">
        ${activeProjects(state).map((p) => html`
          <a class="nav-link" href="#/p/${p.id}" aria-current="${ui.route === 'project' && current?.id === p.id ? 'page' : 'false'}">
            ${p.name}${waiting.has(p.id) && html`<span class="nav-link__wait">Waiting</span>`}
          </a>`)}
      </nav>
      <nav class="sidebar__bottom" aria-label="More">
        ${link('map', 'My AI map', checks > 0 ? html`<span class="count" aria-label="${checks} to check">${checks}</span>` : '')}
        ${link('me', 'About me')}
        ${link('skills', 'Skills', state.skills?.length ? html`<span class="nav-link__n">${state.skills.filter((x) => x.enabled).length}</span>` : '')}
        ${link('settings', 'Settings')}
      </nav>
    </aside>`;
};

function render() {
  useCustomPlatforms(customPlatforms(state));
  const ctx = context();
  const showOnboarding = !state.onboarded || ui.isRedoing;
  const route = ROUTES.find((r) => r.id === ui.route);
  root.innerHTML = toHtml(showOnboarding
    ? onboarding.render(ctx)
    : html`<div class="shell">${sidebar()}<main class="page" id="main">${route.view.render(ctx)}</main></div>`);
  const projectName = project.currentProject(ctx)?.name;
  document.title = showOnboarding ? 'Compass' : `${ui.route === 'project' && projectName ? projectName : route.title} — Compass`;
  if (!showOnboarding) route.view.afterRender?.(ctx);
  if (ui.isNaming) root.querySelector('.sidebar__name input')?.focus();
  if (pendingFocus) {
    root.querySelector(pendingFocus)?.focus();
    pendingFocus = null;
  }
}

// ---------- Context handed to view actions ----------
function context() {
  return {
    root,
    state,
    ui,
    toast,
    commit(next, message) {
      state = next;
      if (!saveState(state)) toast('Could not save. Your browser may be blocking storage.', { isError: true });
      else if (message) toast(message);
      render();
    },
    setUi(patch, { isSilent = false } = {}) {
      ui = { ...ui, ...patch };
      if (!isSilent) render();
    },
    navigate(routeId, id) {
      ui = { ...ui, isRedoing: false };
      const target = hashFor(routeId, id);
      if (location.hash === target) render();
      else location.hash = target;
    },
    focusAfterRender(selector) {
      pendingFocus = selector;
      render();
    },
  };
}

// ---------- Event delegation ----------
const run = (handlers, name, el, event) => {
  const handler = handlers[name];
  if (!handler) return;
  Promise.resolve(handler(context(), el, event)).catch((error) => {
    console.error(`Compass: action "${name}" failed.`, error);
    toast('Something went wrong. Please try again.', { isError: true });
  });
};

root.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (el && !el.disabled) run(ACTIONS, el.dataset.action, el, event);
});

// Escape closes the memory details from anywhere on the page.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (ui.memOpen) run(ACTIONS, 'mem-close', event.target, event);
  if (ui.matOpen) run(ACTIONS, 'mat-close', event.target, event);
});

root.addEventListener('keydown', (event) => {
  const el = event.target.closest('tr[data-action]');
  if (!el || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  run(ACTIONS, el.dataset.action, el, event);
});

root.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-submit]');
  if (!form) return;
  event.preventDefault();
  run(ACTIONS, form.dataset.submit, form, event);
});

root.addEventListener('input', (event) => {
  const el = event.target.closest('[data-input]');
  if (el) run(INPUTS, el.dataset.input, el, event);
});

root.addEventListener('change', (event) => {
  const el = event.target.closest('[data-change]');
  if (el) run(CHANGES, el.dataset.change, el, event);
});

// Coming back to Compass after a chat: offer to save what was worked out there.
// After an AI that Compass opened, ask soon; after any other long absence, ask once per project.
const BACK_FROM_COMPASS_MS = 15_000;
const BACK_FROM_ELSEWHERE_MS = 60_000;
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    return;
  }
  const awayFor = Date.now() - hiddenAt;
  const current = project.currentProject({ state, ui });
  if (!state.onboarded || ui.updating || ui.route !== 'project' || !current) return;
  const { away } = ui;
  const isFromCompass = away?.projectId === current.id && awayFor >= BACK_FROM_COMPASS_MS;
  const isLongAway = awayFor >= BACK_FROM_ELSEWHERE_MS && !(ui.quietProjects ?? []).includes(current.id);
  if (!isFromCompass && !isLongAway) return;
  ui = { ...ui, away: null, updating: { projectId: current.id, ai: isFromCompass ? away.ai : null, isWelcome: true } };
  render();
  window.scrollTo(0, 0);
});

let resizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => ROUTES.find((r) => r.id === ui.route).view.afterRender?.(context()));
});

window.addEventListener('hashchange', () => {
  ui = { ...ui, ...parseHash(), isRedoing: false, continueTo: null, editingAis: false, memOpen: null, matOpen: null, addingKind: null, editingAbout: false, addingMaterial: false, importing: null };
  render();
  window.scrollTo(0, 0);
});

render();
if (loaded.backupKey) toast('Your saved data could not be read, so Compass started fresh. A copy was kept in this browser.', { isError: true });
