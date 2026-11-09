// Picking which AIs you use: the common ones as toggles, plus a small form to add any other AI.
import { CUSTOM_NAME_MAX, MIN_PLATFORMS, platformName } from '../constants.js';
import { addCustomPlatform, allPlatforms, enabledPlatformIds, setEnabledPlatforms, visibleEntries } from '../model.js';
import { dot, html } from '../ui.js';

// 'setup' keeps the picks in onboarding until Finish; 'live' saves every change straight away.
export const renderAiPicker = (state, picked, mode) => html`
  <div class="aipick">
    <div class="aipick__grid">
      ${allPlatforms(state).map((p) => html`
        <button type="button" class="choice choice--ai" data-action="${mode === 'setup' ? 'ob-toggle-ai' : 'ai-toggle'}" data-id="${p.id}" aria-pressed="${picked.includes(p.id)}">${dot(p.id)}${p.name}</button>`)}
    </div>
    <form class="aipick__add" data-submit="ai-add" data-mode="${mode}">
      <input class="input" name="name" maxlength="${CUSTOM_NAME_MAX}" placeholder="Another AI, e.g. Poe" aria-label="Name of another AI" required>
      <input class="input" name="url" placeholder="Its web address (optional)" aria-label="Its web address">
      <button class="btn btn--quiet">Add</button>
    </form>
  </div>`;

const mainFor = (state, id) => visibleEntries(state).filter((e) => e.assignedPlatform === id).length;

function toggleLive(ctx, id) {
  const enabled = enabledPlatformIds(ctx.state);
  if (!enabled.includes(id)) {
    ctx.commit(setEnabledPlatforms(ctx.state, [...enabled, id]), `Added ${platformName(id)}`);
    return;
  }
  if (enabled.length <= MIN_PLATFORMS) {
    ctx.toast(`Keep at least ${MIN_PLATFORMS} AIs.`, { isError: true });
    return;
  }
  const uses = mainFor(ctx.state, id);
  const note = uses ? ` It is still the main AI for ${uses} ${uses === 1 ? 'kind' : 'kinds'} of work on your map.` : '';
  ctx.commit(setEnabledPlatforms(ctx.state, enabled.filter((p) => p !== id)), `Removed ${platformName(id)}.${note}`);
}

export const actions = {
  'ai-toggle': (ctx, el) => toggleLive(ctx, el.dataset.id),
  'ai-add': (ctx, form) => {
    const data = new FormData(form);
    const isSetup = form.dataset.mode === 'setup';
    let added;
    try {
      added = addCustomPlatform(ctx.state, { name: String(data.get('name') ?? ''), url: String(data.get('url') ?? '') }, { isEnabled: !isSetup });
    } catch (error) {
      ctx.toast(error.message, { isError: true });
      return;
    }
    if (isSetup) {
      const { picked } = ctx.ui.ob;
      ctx.setUi({ ob: { ...ctx.ui.ob, picked: picked.includes(added.id) ? picked : [...picked, added.id] } }, { isSilent: true });
    }
    ctx.commit(added.state, `Added ${allPlatforms(added.state).find((p) => p.id === added.id).name}`);
  },
};
