import { FAVORITE_QUESTION, MIN_PLATFORMS, QUESTIONS, REASONS, platformName } from '../constants.js';
import { completeOnboarding, removeMapEntry } from '../model.js';
import { exampleState } from '../sample.js';
import { dot, html } from '../ui.js';
import { renderAiPicker } from './ai-picker.js';

const TOTAL = QUESTIONS.length + 1;
const isFavoriteStep = (index) => index === QUESTIONS.length;

export const initialOnboarding = () => ({ step: 'intro', picked: [], index: 0, answers: [], favorite: null });

const field = (root, name) => root.querySelector(`[name="${name}"]`)?.value ?? '';

// Keeps whatever the user typed before a re-render.
const withTypedReason = (ctx) => {
  const { ob } = ctx.ui;
  if (ob.step !== 'question' || isFavoriteStep(ob.index)) return ob;
  const answers = [...ob.answers];
  answers[ob.index] = { ...answers[ob.index], text: field(ctx.root, 'why') };
  return { ...ob, answers };
};

// ---------- Screens ----------
const intro = () => html`
  <h1 class="ob__title">Let’s draw your AI map.</h1>
  <p class="ob__lead">Seven quick questions about which AI you use for what. It takes under five minutes, and everything stays in this browser.</p>
  <div class="ob__row">
    <button class="btn" data-action="ob-start">Start</button>
    <button class="btn btn--quiet" data-action="ob-example">Explore with an example</button>
  </div>`;

const pickAis = ({ picked }, state) => html`
  <h1 class="ob__title">Which AIs do you use?</h1>
  <p class="ob__lead">Pick at least two. You can add or remove AIs later.</p>
  ${renderAiPicker(state, picked, 'setup')}
  <div class="ob__row ob__row--end">
    <button class="btn" data-action="ob-ais-next" ${picked.length < MIN_PLATFORMS ? 'disabled' : ''}>Next</button>
  </div>`;

const question = ({ picked, index, answers, favorite }) => {
  const isFavorite = isFavoriteStep(index);
  const answer = answers[index] ?? {};
  const chosen = isFavorite ? favorite : answer.platform;
  const options = isFavorite ? picked : [...picked, 'none'];
  return html`
    <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${TOTAL}" aria-valuenow="${index + 1}" aria-label="Question ${index + 1} of ${TOTAL}">
      <i style="--p:${(index + 1) / TOTAL}"></i>
    </div>
    <h1 class="ob__title">${isFavorite ? FAVORITE_QUESTION : QUESTIONS[index].text}</h1>
    <div class="ob__grid">
      ${options.map((id) => html`
        <button class="choice" data-action="ob-answer" data-id="${id}" aria-pressed="${chosen === id}">
          ${id === 'none' ? 'I don’t use AI for this' : html`${dot(id)}${platformName(id)}`}
        </button>`)}
    </div>
    ${!isFavorite && html`
      <div class="ob__why">
        <p class="ob__label">Why? <span>Optional</span></p>
        <div class="chips">
          ${REASONS.map((r) => html`<button class="chip" data-action="ob-reason" data-id="${r}" aria-pressed="${answer.chip === r}">${r}</button>`)}
        </div>
        <input class="input" name="why" maxlength="120" placeholder="In your words" value="${answer.text ?? ''}" aria-label="Why, in your words">
      </div>`}
    <div class="ob__row ob__row--between">
      <button class="btn btn--quiet" data-action="ob-back">Back</button>
      <button class="btn" data-action="ob-next" ${chosen ? '' : 'disabled'}>Next</button>
    </div>`;
};

const firstProject = () => html`
  <h1 class="ob__title">What are you working on right now?</h1>
  <p class="ob__lead">Compass keeps decisions and constraints for each project, so any AI can pick up where another left off.</p>
  <form class="ob__project" data-submit="ob-finish">
    <input class="input input--lg" name="project" maxlength="60" placeholder="e.g. Thesis" aria-label="Project name" autofocus>
    <div class="ob__row ob__row--between">
      <button type="button" class="btn btn--quiet" data-action="ob-skip-project">Skip</button>
      <button class="btn">Finish</button>
    </div>
  </form>`;

const SCREENS = { intro, ais: pickAis, question, project: firstProject };

export const render = (ctx) => html`
  <main class="ob">
    <a class="ob__brand" href="index.html">Compass</a>
    <div class="ob__card">${SCREENS[ctx.ui.ob.step](ctx.ui.ob, ctx.state)}</div>
  </main>`;

// ---------- Actions ----------
const setOb = (ctx, patch) => ctx.setUi({ ob: { ...withTypedReason(ctx), ...patch } });

function finish(ctx, projectName) {
  const { ob } = ctx.ui;
  // Re-running onboarding replaces the entries it created last time.
  const cleared = ctx.state.mapEntries
    .filter((e) => e.source === 'onboarding' && !e.removed)
    .reduce((s, e) => removeMapEntry(s, e.id), ctx.state);
  const answers = ob.answers.map((a) => a && { platform: a.platform, reason: a.text?.trim() || a.chip || '' });
  ctx.commit(completeOnboarding(cleared, { platformIds: ob.picked, answers, favorite: ob.favorite, projectName }));
  ctx.navigate('project');
}

export const actions = {
  'ob-start': (ctx) => setOb(ctx, { step: 'ais' }),
  'ob-example': (ctx) => {
    ctx.commit(exampleState(), 'Example loaded. Change anything, or clear it in Settings.');
    ctx.navigate('project');
  },
  'ob-toggle-ai': (ctx, el) => {
    const { picked } = ctx.ui.ob;
    const id = el.dataset.id;
    setOb(ctx, { picked: picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id] });
  },
  'ob-ais-next': (ctx) => setOb(ctx, { step: 'question', index: 0 }),
  'ob-answer': (ctx, el) => {
    const ob = withTypedReason(ctx);
    if (isFavoriteStep(ob.index)) return ctx.setUi({ ob: { ...ob, favorite: el.dataset.id } });
    const answers = [...ob.answers];
    answers[ob.index] = { ...answers[ob.index], platform: el.dataset.id };
    return ctx.setUi({ ob: { ...ob, answers } });
  },
  'ob-reason': (ctx, el) => {
    const ob = withTypedReason(ctx);
    const answers = [...ob.answers];
    const current = answers[ob.index] ?? {};
    answers[ob.index] = { ...current, chip: current.chip === el.dataset.id ? null : el.dataset.id };
    ctx.setUi({ ob: { ...ob, answers } });
  },
  'ob-back': (ctx) => {
    const { index } = ctx.ui.ob;
    setOb(ctx, index === 0 ? { step: 'ais' } : { index: index - 1 });
  },
  'ob-next': (ctx) => {
    const { index } = ctx.ui.ob;
    setOb(ctx, index === TOTAL - 1 ? { step: 'project' } : { index: index + 1 });
  },
  'ob-skip-project': (ctx) => finish(ctx, ''),
  'ob-finish': (ctx, form) => finish(ctx, new FormData(form).get('project') ?? ''),
};
