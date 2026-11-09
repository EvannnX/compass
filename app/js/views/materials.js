// Reference materials: longer texts (an outline, feedback, a sample) that the AI should see in full.
import { addMaterial, projectMaterials, removeMaterial, toggleMaterial, updateMaterial, wordCount } from '../model.js';
import { autoTitle } from '../slicer.js';
import { formatDate, html } from '../ui.js';

const PREVIEW_CHARS = 140;

const card = (m) => html`
  <div class="matcard ${m.includeInBrief ? '' : 'is-off'}">
    <button class="matcard__main" data-action="mat-open" data-id="${m.id}">
      <span class="matcard__title">${m.title}</span>
      <span class="matcard__text">${m.body.slice(0, PREVIEW_CHARS)}${m.body.length > PREVIEW_CHARS ? '…' : ''}</span>
      <span class="mcard__meta">${wordCount(m.body)} words</span>
    </button>
    <label class="switch"><input type="checkbox" data-change="mat-toggle" data-id="${m.id}" ${m.includeInBrief ? 'checked' : ''}><span>${m.includeInBrief ? 'Sent' : 'Not sent'}</span></label>
  </div>`;

const addForm = () => html`
  <form class="matform" data-submit="mat-add">
    <input class="input" name="title" maxlength="80" placeholder="Title, e.g. Advisor feedback, Oct 30" aria-label="Title">
    <textarea class="input area" name="body" rows="8" placeholder="Paste the full text: an outline, feedback, a rubric, or a paragraph written the way you like." aria-label="Text" required></textarea>
    <div class="row"><button class="btn btn--sm">Save material</button><button type="button" class="btn btn--sm btn--quiet" data-action="mat-cancel">Cancel</button></div>
  </form>`;

const drawer = (m) => html`
  <div class="backdrop" data-action="mat-close"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="Reference material">
    <div class="drawer__head">
      <span class="ktag ktag--material">Reference material</span>
      <button class="icon-btn" data-action="mat-close" aria-label="Close"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg></button>
    </div>
    <form class="stack" data-submit="mat-save" data-id="${m.id}">
      <label class="field"><span>Title</span><input class="input drawer__title" name="title" value="${m.title}" maxlength="80" required></label>
      <label class="field"><span>Full text <em>${wordCount(m.body)} words</em></span><textarea class="input area" name="body" rows="14" required>${m.body}</textarea></label>
      <div class="row row--between">
        <button class="btn">Save changes</button>
        <button type="button" class="btn btn--danger-quiet" data-action="mat-delete" data-id="${m.id}">Delete</button>
      </div>
    </form>
    <section class="drawer__sec">
      <h3>Details</h3>
      <p class="muted">Added ${formatDate(m.createdAt)}${m.updatedAt !== m.createdAt ? `, last edited ${formatDate(m.updatedAt)}` : ''}. ${m.includeInBrief ? 'Sent in full whenever you continue in an AI.' : 'Not sent right now. Switch it on to include it.'}</p>
    </section>
  </aside>`;

export function renderMaterials(ctx, project) {
  const materials = projectMaterials(ctx.state, project.id);
  const open = materials.find((m) => m.id === ctx.ui.matOpen);
  return html`
    <div class="materials">
      <div>
        <h3 class="materials__title">Reference materials</h3>
        <p class="materials__sub">Longer texts the AI should see in full, so it has real examples and not just rules.</p>
      </div>
      ${materials.length ? html`<div class="matgrid">${materials.map(card)}</div>` : ''}
      ${ctx.ui.addingMaterial ? addForm() : html`<div><button class="btn btn--sm btn--quiet" data-action="mat-new">Add a reference material</button></div>`}
    </div>
    ${open && drawer(open)}`;
}

// Saves a long pasted text as one material instead of slicing it.
export const materialFromText = (state, projectId, raw) =>
  addMaterial(state, { projectId, title: autoTitle(raw.split('\n').find((l) => l.trim()) ?? raw), body: raw, source: 'paste' });

export const actions = {
  'mat-new': (ctx) => ctx.setUi({ addingMaterial: true }),
  'mat-cancel': (ctx) => ctx.setUi({ addingMaterial: false }),
  'mat-add': (ctx, form) => {
    const data = new FormData(form);
    const body = String(data.get('body') ?? '').trim();
    if (!body) return;
    const { projectId } = form.closest('[data-project-id]').dataset;
    const title = String(data.get('title') ?? '').trim() || autoTitle(body.split('\n')[0]);
    ctx.commit(addMaterial(ctx.state, { projectId, title, body }), 'Material saved');
    ctx.setUi({ addingMaterial: false });
  },
  'mat-open': (ctx, el) => ctx.setUi({ matOpen: el.dataset.id }),
  'mat-close': (ctx) => ctx.setUi({ matOpen: null }),
  'mat-save': (ctx, form) => {
    const data = new FormData(form);
    const body = String(data.get('body') ?? '').trim();
    if (!body) return;
    ctx.commit(updateMaterial(ctx.state, form.dataset.id, { title: String(data.get('title') ?? '').trim(), body }), 'Saved');
    ctx.setUi({ matOpen: null });
  },
  'mat-delete': (ctx, el) => {
    if (!window.confirm('Delete this material?')) return;
    ctx.commit(removeMaterial(ctx.state, el.dataset.id), 'Deleted');
    ctx.setUi({ matOpen: null });
  },
};

export const changes = {
  'mat-toggle': (ctx, el) => ctx.commit(toggleMaterial(ctx.state, el.dataset.id)),
};
