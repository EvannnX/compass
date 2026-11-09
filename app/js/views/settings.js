import { emptyState, enabledPlatformIds } from '../model.js';
import { clearState, downloadJson, readImportFile } from '../storage.js';
import { html } from '../ui.js';
import { renderAiPicker } from './ai-picker.js';
import { initialOnboarding } from './onboarding.js';

export function render(ctx) {
  const enabled = enabledPlatformIds(ctx.state);
  return html`
    <header class="page__head"><div><h1>Settings</h1><p>Everything is stored in this browser only.</p></div></header>
    <div class="stack-lg">
      <section class="card stack">
        <h2 class="panel__title">Your AIs</h2>
        <p class="muted">Tap an AI to add or remove it. Not in the list? Add it by name.</p>
        ${renderAiPicker(ctx.state, enabled, 'live')}
      </section>
      <section class="card stack">
        <h2 class="panel__title">Your data</h2>
        <div class="row row--wrap">
          <button class="btn btn--quiet" data-action="settings-export">Export as JSON</button>
          <label class="btn btn--quiet file-btn">Import JSON<input type="file" accept="application/json,.json" data-change="settings-import"></label>
          <button class="btn btn--quiet" data-action="settings-redo">Redo the questions</button>
        </div>
      </section>
      <section class="card stack">
        <h2 class="panel__title">Start over</h2>
        <p class="muted">Deletes your map, projects and memories from this browser. Export first if you want a copy.</p>
        <div><button class="btn btn--danger" data-action="settings-reset">Delete all data</button></div>
      </section>
    </div>`;
}

export const actions = {
  'settings-export': (ctx) => downloadJson(ctx.state),
  'settings-redo': (ctx) => ctx.setUi({ ob: { ...initialOnboarding(), step: 'ais', picked: enabledPlatformIds(ctx.state) }, isRedoing: true }),
  'settings-reset': (ctx) => {
    if (!window.confirm('Delete all Compass data in this browser? This cannot be undone.')) return;
    clearState();
    ctx.commit(emptyState(), 'All data deleted');
    ctx.setUi({ ob: initialOnboarding() });
  },
};

export const changes = {
  'settings-import': async (ctx, input) => {
    const [file] = input.files;
    if (!file) return;
    try {
      ctx.commit(await readImportFile(file), 'Imported');
    } catch (error) {
      ctx.toast(error.message, { isError: true });
    } finally {
      input.value = '';
    }
  },
};
