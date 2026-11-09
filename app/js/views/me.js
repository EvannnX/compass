import { activeMemories, buildContextBlock, platformChoices } from '../model.js';
import { copyText, html } from '../ui.js';
import { renderImport } from './import.js';
import { memoryItem } from './memory-list.js';

export function render(ctx) {
  const items = activeMemories(ctx.state, { layer: 'global' });
  return html`
    <header class="page__head">
      <div><h1>About me</h1><p>Preferences every AI should know, whatever the project.</p></div>
      <button class="btn btn--quiet" data-action="me-copy" ${items.length ? '' : 'disabled'}>Copy about me</button>
    </header>
    <div class="card stack-lg">
      <section class="group">
        ${items.length ? html`<ul class="mems">${items.map((m) => memoryItem(m, { showApplies: true }))}</ul>` : html`<p class="muted">Nothing yet. Add something you keep telling every AI.</p>`}
        <form class="add" data-submit="mem-add" data-layer="global" data-kind="preference">
          <input class="input" name="text" maxlength="200" placeholder="e.g. Write in paragraphs, no bullet points." aria-label="New preference" required>
          <select class="input input--select" name="appliesTo" aria-label="Applies to">
            <option value="all">All AIs</option>
            ${platformChoices(ctx.state).map((p) => html`<option value="${p.id}">Only ${p.name}</option>`)}
          </select>
          <button class="btn btn--sm btn--quiet">Add</button>
        </form>
      </section>
    </div>
    ${renderImport(ctx)}`;
}

export const actions = {
  'me-copy': async (ctx) => {
    const isCopied = await copyText(buildContextBlock(ctx.state, null));
    ctx.toast(isCopied ? 'Copied. Paste it at the top of your next message.' : 'Copy failed.', { isError: !isCopied });
  },
};
