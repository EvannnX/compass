// Project memories as cards: filter by kind, slice pasted text into new cards, open a card for its details.
import { MEMORY_KINDS, platformName } from '../constants.js';
import { activeMemories, addMemory, archiveMemory, handoffsWithMemory, memoryTitle, updateMemory } from '../model.js';
import { sliceIntoMemories } from '../slicer.js';
import { dot, formatDate, html } from '../ui.js';

const KIND_TITLE = Object.fromEntries(MEMORY_KINDS.map((k) => [k.id, k.title]));
const KIND_HINT = Object.fromEntries(MEMORY_KINDS.map((k) => [k.id, k.hint]));
const VIA_TEXT = { repair_card: 'saved after a correction', manual_add: 'added by you', handoff: 'saved from a hand-off', import: 'imported', chat_update: 'saved from a chat update', auto: 'saved automatically' };
const FIELD_TEXT = { title: 'title', text: 'text', reason: 'reason', example: 'example', kind: 'kind' };
const normalize = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ');

const kindTag = (kind) => html`<span class="ktag ktag--${kind}">${KIND_TITLE[kind]}</span>`;

// ---------- Cards ----------
// Under the title: the full text when the title is a shortened version, otherwise the reason.
const snippet = (m) => {
  const isSame = normalize(memoryTitle(m)) === normalize(m.text.replace(/[.。!！?？]+$/, ''));
  if (!isSame) return m.text;
  return m.reason ? `Why: ${m.reason}` : '';
};

const card = (m) => html`
  <button class="mcard mcard--${m.kind}" data-action="mem-open" data-id="${m.id}">
    <span class="mcard__title">${memoryTitle(m)}</span>
    ${snippet(m) && html`<span class="mcard__text">${snippet(m)}</span>`}
    <span class="mcard__meta">${dot(m.provenance.platform)}${formatDate(m.createdAt)}${m.example ? html`<span class="mcard__ex">has example</span>` : ''}</span>
  </button>`;

// Each kind has its own group and its own add box, so nothing has to be moved after adding.
const addBox = (kind) => html`
  <form class="gadd" data-submit="mem-group-add" data-kind="${kind.id}">
    <textarea class="input area" name="text" rows="2" placeholder="${kind.placeholder}" aria-label="Add to ${kind.group}"></textarea>
    <div class="row"><button class="btn btn--sm">Add</button><button type="button" class="btn btn--sm btn--quiet" data-action="mem-add-close">Cancel</button></div>
  </form>`;

const group = (kind, items, isAdding) => html`
  <section class="mgroup" aria-label="${kind.group}">
    <div class="mgroup__head">
      <h3 class="mgroup__title mgroup__title--${kind.id}">${kind.group} <span>${items.length}</span></h3>
      ${isAdding ? '' : html`<button class="btn btn--sm btn--quiet mgroup__add" data-action="mem-add-open" data-kind="${kind.id}">+ Add</button>`}
      <p class="mgroup__hint">${kind.hint}</p>
    </div>
    ${items.length ? html`<div class="mgrid">${items.map(card)}</div>` : ''}
    ${isAdding ? addBox(kind) : ''}
  </section>`;

// ---------- Details drawer ----------
const changeList = (m) => html`
  <ol class="timeline">
    ${[...(m.revisions ?? [])].reverse().map((r) => html`<li><time>${formatDate(r.at)}</time>Edited ${Object.keys(r.change).map((k) => FIELD_TEXT[k] ?? k).join(', ')}</li>`)}
    <li><time>${formatDate(m.createdAt)}</time>Saved</li>
  </ol>`;

const drawer = (state, m) => {
  const sent = handoffsWithMemory(state, m);
  return html`
    <div class="backdrop" data-action="mem-close"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="Memory details">
      <div class="drawer__head">
        ${kindTag(m.kind)}
        <button class="icon-btn" data-action="mem-close" aria-label="Close"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg></button>
      </div>
      <form class="stack" data-submit="mem-save" data-id="${m.id}">
        <label class="field"><span>Title</span><input class="input drawer__title" name="title" value="${memoryTitle(m)}" maxlength="80" required></label>
        <label class="field"><span>What every AI will read</span><textarea class="input area" name="text" rows="3" maxlength="400" required>${m.text}</textarea></label>
        <label class="field"><span>Why <em>Optional</em></span><input class="input" name="reason" value="${m.reason ?? ''}" maxlength="200"></label>
        <label class="field"><span>Example <em>Optional. Show the AI what good looks like</em></span><textarea class="input area" name="example" rows="4" maxlength="1500" placeholder="e.g. a paragraph written the way you want, or a before and after">${m.example ?? ''}</textarea></label>
        <fieldset class="field"><legend>Kind</legend><div class="seg">
          ${MEMORY_KINDS.map((k) => html`<label class="seg__opt" title="${k.hint}"><input type="radio" name="kind" value="${k.id}" ${k.id === m.kind ? 'checked' : ''}><span>${k.title}</span></label>`)}
        </div><p class="muted small">${KIND_HINT[m.kind]}</p></fieldset>
        <div class="row row--between">
          <button class="btn">Save changes</button>
          <button type="button" class="btn btn--danger-quiet" data-action="mem-delete" data-id="${m.id}">Delete</button>
        </div>
      </form>
      <section class="drawer__sec">
        <h3>Where it came from</h3>
        <p class="drawer__src">${dot(m.provenance.platform)}${platformName(m.provenance.platform)}, ${m.provenance.excerpt && m.provenance.excerpt !== m.text ? 'from text you pasted' : VIA_TEXT[m.provenance.capturedVia] ?? 'saved'}, ${formatDate(m.provenance.capturedAt)}</p>
        ${m.provenance.excerpt && m.provenance.excerpt !== m.text ? html`<blockquote class="drawer__quote">${m.provenance.excerpt}</blockquote>` : ''}
      </section>
      <section class="drawer__sec">
        <h3>Sent to other AIs</h3>
        ${sent.length
          ? html`<ol class="timeline">${sent.map((h) => html`<li><time>${formatDate(h.createdAt)}</time>${platformName(h.from)} → ${platformName(h.to)}${h.returnedAt ? ', result checked' : ''}</li>`)}</ol>`
          : html`<p class="muted">Not in any hand-off yet. It is still included whenever you continue in an AI.</p>`}
      </section>
      <section class="drawer__sec">
        <h3>Changes</h3>
        ${changeList(m)}
      </section>
    </aside>`;
};

// ---------- Section ----------
export function renderMemories(ctx, project) {
  const memories = activeMemories(ctx.state, { layer: 'project', projectId: project.id });
  const open = memories.find((m) => m.id === ctx.ui.memOpen);
  return html`
    ${MEMORY_KINDS.map((k) => group(k, memories.filter((m) => m.kind === k.id), ctx.ui.addingKind === k.id))}
    ${open && drawer(ctx.state, open)}`;
}

// ---------- Actions ----------
export const actions = {
  'mem-add-open': (ctx, el) => {
    ctx.setUi({ addingKind: el.dataset.kind }, { isSilent: true });
    ctx.focusAfterRender('.gadd textarea');
  },
  'mem-add-close': (ctx) => ctx.setUi({ addingKind: null }),
  'mem-open': (ctx, el) => ctx.setUi({ memOpen: el.dataset.id }),
  'mem-close': (ctx) => ctx.setUi({ memOpen: null }),
  'mem-save': (ctx, form) => {
    const data = new FormData(form);
    const memory = ctx.state.memories.find((m) => m.id === form.dataset.id);
    const next = {
      title: String(data.get('title') ?? '').trim(),
      text: String(data.get('text') ?? '').trim(),
      reason: String(data.get('reason') ?? '').trim(),
      example: String(data.get('example') ?? '').trim(),
      kind: String(data.get('kind') ?? memory.kind),
    };
    if (!next.text) return;
    const current = { title: memoryTitle(memory), text: memory.text, reason: memory.reason ?? '', example: memory.example ?? '', kind: memory.kind };
    const change = Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== current[key]));
    if (!Object.keys(change).length) {
      ctx.setUi({ memOpen: null });
      return;
    }
    ctx.commit(updateMemory(ctx.state, memory.id, change), 'Saved');
    ctx.setUi({ memOpen: null });
  },
  'mem-delete': (ctx, el) => {
    if (!window.confirm('Delete this memory? AIs will no longer be told about it.')) return;
    ctx.commit(archiveMemory(ctx.state, el.dataset.id), 'Deleted');
    ctx.setUi({ memOpen: null });
  },
  // Every line or sentence typed into a group's box is saved in that group.
  'mem-group-add': (ctx, form) => {
    const raw = String(new FormData(form).get('text') ?? '').trim();
    if (!raw) return;
    const { projectId } = form.closest('[data-project-id]').dataset;
    const { kind } = form.dataset;
    const slices = sliceIntoMemories(raw);
    const pieces = slices.length ? slices : [{ title: raw, text: raw, reason: '', source: raw }];
    const next = pieces.reduce((state, s) => addMemory(state, { layer: 'project', projectId, ...s, kind, excerpt: s.source, platform: ctx.state.favorite ?? 'claude' }), ctx.state);
    const groupName = MEMORY_KINDS.find((k) => k.id === kind).group;
    ctx.commit(next, pieces.length === 1 ? `Added to ${groupName}` : `Added ${pieces.length} to ${groupName}`);
    ctx.focusAfterRender('.gadd textarea');
  },
};
