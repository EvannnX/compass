import { platformName } from '../constants.js';
import { addMemory, archiveMemory } from '../model.js';
import { dot, formatDate, html } from '../ui.js';

const VIA_TEXT = { repair_card: 'after a correction', manual_add: 'added by you', handoff: 'from a handoff', import: 'imported', chat_update: 'from a chat update', auto: 'saved automatically' };

const appliesText = (appliesTo) => (appliesTo === 'all' ? 'All AIs' : appliesTo.map(platformName).join(', '));

export const memoryItem = (memory, { showApplies = false } = {}) => html`
  <li class="mem">
    <div class="mem__body">
      <p>${memory.text}</p>
      ${memory.reason && html`<p class="mem__why">${memory.reason}</p>`}
      <p class="mem__src" title="Where this came from">
        ${showApplies ? appliesText(memory.appliesTo) : html`${dot(memory.provenance.platform)}${VIA_TEXT[memory.provenance.capturedVia] ?? ''}, ${formatDate(memory.provenance.capturedAt)}`}
      </p>
    </div>
    <button class="icon-btn" data-action="mem-remove" data-id="${memory.id}" aria-label="Remove “${memory.text}”">
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg>
    </button>
  </li>`;

// Reads a memory add form. Returns null when the text is empty.
export function readMemoryForm(form) {
  const data = new FormData(form);
  const text = String(data.get('text') ?? '').trim();
  if (!text) return null;
  const applies = String(data.get('appliesTo') ?? 'all');
  return {
    text,
    reason: String(data.get('reason') ?? ''),
    appliesTo: applies === 'all' ? 'all' : [applies],
  };
}

export const actions = {
  'mem-remove': (ctx, el) => ctx.commit(archiveMemory(ctx.state, el.dataset.id), 'Removed'),
  'mem-add': (ctx, form) => {
    const values = readMemoryForm(form);
    if (!values) return;
    const { layer, projectId } = form.dataset;
    const kind = String(new FormData(form).get('kind') ?? form.dataset.kind);
    ctx.commit(addMemory(ctx.state, { layer, kind, projectId: projectId || undefined, ...values, platform: ctx.state.favorite ?? 'claude' }), 'Saved');
    ctx.focusAfterRender('form[data-submit="mem-add"] [name="text"]');
  },
};
