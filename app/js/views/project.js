// One project on one page: continue in an AI, bring replies back, and see what every AI will know.
import { MEMORY_KINDS, platformName } from '../constants.js';
import {
  activeMemories, activeProjects, activityFeed, addProject, archiveProject, buildContextBlock, buildHandoffText,
  buildReturnText, draftHandoff, lastAiFor, markHandoffReturned, openHandoffs, recordHandoff, skillsFor,
  updateProject, wordCount,
} from '../model.js';
import { copyText, formatDate, html, openPlatform } from '../ui.js';
import { drawBoard, renderBoard } from './board.js';
import { renderMaterials } from './materials.js';
import { renderMemories } from './memory-cards.js';
import { renderUpdate } from './update.js';

const KIND_TITLE = Object.fromEntries(MEMORY_KINDS.map((k) => [k.id, k.title]));

const HISTORY_LIMIT = 15;

export const currentProject = (ctx) => {
  const projects = activeProjects(ctx.state);
  return projects.find((p) => p.id === ctx.ui.projectId) ?? projects[0];
};

// What gets pasted: Compass's brief, or a hand-off when there is work from another AI to carry.
function messageFor(state, project, to, plan) {
  const from = lastAiFor(state, project.id);
  const hasPlan = Boolean(plan.trim());
  if (hasPlan && from && from !== to) {
    return { isHandoff: true, from, text: buildHandoffText({ from, projectName: project.name, ...draftHandoff(state, project.id), sourceExcerpt: plan }) };
  }
  const brief = buildContextBlock(state, project.id, to);
  return { isHandoff: false, from, text: hasPlan ? `${brief}\nWork from this:\n${plan.trim()}` : brief };
}

// ---------- Continue in an AI ----------
const LONG_BRIEF_WORDS = 1200;
const sizeNote = (text) => {
  const words = wordCount(text);
  return words > LONG_BRIEF_WORDS ? `(about ${words} words, quite long)` : `(about ${words} words)`;
};

const sheet = (ctx, project) => {
  const to = ctx.ui.continueTo;
  const { text } = messageFor(ctx.state, project, to, '');
  return html`
    <form class="sheet" data-submit="cont-send" data-input="cont-input">
      <label class="field"><span>Anything from another AI for ${platformName(to)} to work from? <em>Optional</em></span>
        <textarea class="input area" name="plan" rows="3" placeholder="Paste a plan or a reply here. Leave it empty to send only what Compass knows."></textarea>
      </label>
      <details class="sheet__preview">
        <summary>See exactly what ${platformName(to)} will get <span class="sheet__count" id="contCount">${sizeNote(text)}</span></summary>
        <pre id="contPreview">${text}</pre>
      </details>
      <div class="row">
        <button class="btn">Copy and open ${platformName(to)}</button>
        <button type="button" class="btn btn--quiet" data-action="cont-close">Cancel</button>
      </div>
      <p class="sheet__hint">Compass copies the text. In ${platformName(to)}, paste it into the message box and send.</p>
    </form>`;
};

// ---------- Waiting for a reply ----------
const waiting = (h) => html`
  <section class="waiting" aria-label="Waiting for a reply">
    <p class="waiting__title">Waiting for ${platformName(h.to)}’s reply</p>
    <p class="waiting__text">You sent this project from ${platformName(h.from)} to ${platformName(h.to)} on ${formatDate(h.createdAt)}. When ${platformName(h.to)} is done, paste its reply here and ${platformName(h.from)} will check it against your decisions.</p>
    <textarea class="input area" name="result" rows="3" placeholder="Paste ${platformName(h.to)}’s reply" aria-label="${platformName(h.to)}’s reply"></textarea>
    <div class="row row--wrap">
      <button class="btn" data-action="ret-check" data-id="${h.id}">Check it in ${platformName(h.from)}</button>
      <button class="btn btn--quiet" data-action="ret-done" data-id="${h.id}">It’s fine, mark as done</button>
    </div>
  </section>`;

// ---------- What every AI will know ----------
const aboutProject = (ctx, project) => {
  const isEditing = ctx.ui.editingAbout || !project.description;
  if (isEditing) {
    return html`
      <form class="about" data-submit="about-save">
        <label class="field"><span>About this project <em>The big picture every AI reads first</em></span>
          <textarea class="input area" name="description" rows="3" maxlength="1200" placeholder="What is it, who is it for, where are you now, and when is it due? For example: A master’s thesis comparing two field sites in coastal China. Chapters 1 and 2 are done; now drafting chapter 3. Due in May.">${project.description ?? ''}</textarea>
        </label>
        <div class="row"><button class="btn btn--sm">Save</button>${project.description ? html`<button type="button" class="btn btn--sm btn--quiet" data-action="about-cancel">Cancel</button>` : ''}</div>
      </form>`;
  }
  return html`
    <div class="about about--read">
      <p class="about__label">About this project</p>
      <p class="about__text">${project.description}</p>
      <button class="btn btn--sm btn--quiet" data-action="about-edit">Edit</button>
    </div>`;
};

const known = (ctx, project) => {
  const about = activeMemories(ctx.state, { layer: 'global' }).length;
  const skillCount = skillsFor(ctx.state, project.id).length;
  return html`
    <section class="known" data-project-id="${project.id}">
      <h2 class="known__title">What every AI will know</h2>
      <p class="known__sub">Compass puts this at the top of your message whenever you continue in an AI.${about ? html` Your <a class="link" href="#/me">About me</a> (${about}) is added too.` : ''}${skillCount ? html` So ${skillCount === 1 ? 'is' : 'are'} <a class="link" href="#/skills">${skillCount} ${skillCount === 1 ? 'skill' : 'skills'}</a>.` : ''}</p>
      ${aboutProject(ctx, project)}
      ${renderMemories(ctx, project)}
      ${renderMaterials(ctx, project)}
    </section>`;
};

const TAG_TEXT = { handoff: 'Handed off', return: 'Checked', material: 'Material' };
const historyTag = (e) => (e.kind === 'memory' ? `Saved: ${KIND_TITLE[e.memoryKind] ?? 'About me'}` : TAG_TEXT[e.kind] ?? e.kind);

const history = (state, project) => {
  const feed = activityFeed(state, HISTORY_LIMIT, { projectId: project.id });
  return html`
    <aside class="history" aria-label="History">
      <h2 class="history__title">History</h2>
      ${feed.length
        ? html`<ol class="history__list">${feed.map((e) => html`
            <li class="hitem hitem--${e.kind === 'memory' ? e.memoryKind : e.kind}">
              <span class="hitem__top"><span class="htag htag--${e.kind === 'memory' ? e.memoryKind : e.kind}">${historyTag(e)}</span><time>${formatDate(e.at)}</time></span>
              <span class="hitem__title">${e.title}</span>
            </li>`)}</ol>`
        : html`<p class="muted">Nothing yet.</p>`}
    </aside>`;
};

const startScreen = () => html`
  <div class="start">
    <h1>Start your first project</h1>
    <p>A project is anything you work on across different AIs, like a thesis, an essay or an app. Compass remembers its decisions, so every AI you open starts fully briefed.</p>
    <form class="start__form" data-submit="proj-create">
      <input class="input input--lg" name="name" maxlength="60" placeholder="e.g. Thesis" aria-label="Project name" required>
      <button class="btn btn--lg">Create project</button>
    </form>
  </div>`;

export function render(ctx) {
  const project = currentProject(ctx);
  if (!project) return startScreen();
  const open = openHandoffs(ctx.state).filter((h) => h.projectId === project.id).reverse();
  return html`
    <div class="proj">
      <div class="proj__main">
        <header class="proj__head">
          <h1>${project.name}</h1>
          <button class="btn btn--danger-quiet" data-action="proj-archive" data-id="${project.id}">Archive</button>
        </header>
        ${renderUpdate(ctx, project)}
        <section class="continue">
          <h2 class="continue__title">Continue this project in</h2>
          ${renderBoard(ctx, project)}
          ${ctx.ui.continueTo && sheet(ctx, project)}
          ${ctx.ui.updating?.projectId === project.id ? '' : html`<div class="continue__back"><span>Finished a chat?</span><button class="btn btn--sm btn--quiet" data-action="upd-open" data-id="${project.id}">Update ${project.name} from it</button></div>`}
        </section>
        ${open.map(waiting)}
        ${known(ctx, project)}
      </div>
      ${history(ctx.state, project)}
    </div>`;
}

// Line positions move once web fonts load, so draw now and again when they are ready.
export const afterRender = (ctx) => {
  drawBoard(ctx.root);
  document.fonts?.ready.then(() => drawBoard(ctx.root));
};

// ---------- Actions ----------
export const actions = {
  'about-edit': (ctx) => ctx.setUi({ editingAbout: true }),
  'about-cancel': (ctx) => ctx.setUi({ editingAbout: false }),
  'about-save': (ctx, form) => {
    const description = String(new FormData(form).get('description') ?? '').trim();
    ctx.commit(updateProject(ctx.state, currentProject(ctx).id, { description }), description ? 'Saved' : 'Cleared');
    ctx.setUi({ editingAbout: false });
  },
  'proj-new': (ctx) => ctx.setUi({ isNaming: true }),
  'proj-create': (ctx, form) => {
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name) return;
    const next = addProject(ctx.state, name);
    ctx.commit(next, `Created ${name}`);
    ctx.setUi({ isNaming: false, continueTo: null });
    ctx.navigate('project', next.projects.at(-1).id);
  },
  'proj-archive': (ctx, el) => {
    if (!window.confirm('Archive this project? It stays in your export.')) return;
    ctx.commit(archiveProject(ctx.state, el.dataset.id), 'Project archived');
    ctx.navigate('project');
  },
  'cont-open': (ctx, el) => ctx.setUi({ continueTo: ctx.ui.continueTo === el.dataset.id ? null : el.dataset.id, editingAis: false }),
  'cont-close': (ctx) => ctx.setUi({ continueTo: null }),
  'cont-send': async (ctx, form) => {
    const project = currentProject(ctx);
    const to = ctx.ui.continueTo;
    const plan = String(new FormData(form).get('plan') ?? '');
    const message = messageFor(ctx.state, project, to, plan);
    if (!(await copyText(message.text))) {
      ctx.toast('Copy failed. Open “See exactly what…” and copy it by hand.', { isError: true });
      return;
    }
    if (message.isHandoff) {
      const draft = draftHandoff(ctx.state, project.id);
      ctx.commit(recordHandoff(ctx.state, { projectId: project.id, from: message.from, to, ...draft, sourceExcerpt: plan }, { saveNew: false }));
    }
    ctx.setUi({ continueTo: null, away: { ai: to, projectId: project.id } });
    ctx.toast(`Copied. Paste it into ${platformName(to)} and send.`);
    openPlatform(to);
  },
  'ret-check': async (ctx, el) => {
    const project = currentProject(ctx);
    const handoff = ctx.state.handoffs.find((h) => h.id === el.dataset.id);
    const result = el.closest('section').querySelector('[name="result"]').value;
    if (!result.trim()) {
      ctx.toast(`Paste ${platformName(handoff.to)}’s reply first.`, { isError: true });
      return;
    }
    const text = buildReturnText({ projectName: project.name, decisions: handoff.decisions, constraints: handoff.constraints, result });
    if (!(await copyText(text))) {
      ctx.toast('Copy failed.', { isError: true });
      return;
    }
    ctx.commit(markHandoffReturned(ctx.state, handoff.id), `Copied. Paste it into ${platformName(handoff.from)} and send.`);
    ctx.setUi({ away: { ai: handoff.from, projectId: project.id } }, { isSilent: true });
    openPlatform(handoff.from);
  },
  'ret-done': (ctx, el) => ctx.commit(markHandoffReturned(ctx.state, el.dataset.id), 'Marked as done'),
};

// The preview follows whatever is pasted, without re-rendering the form.
export const inputs = {
  'cont-input': (ctx, form) => {
    const plan = String(new FormData(form).get('plan') ?? '');
    const { text } = messageFor(ctx.state, currentProject(ctx), ctx.ui.continueTo, plan);
    document.getElementById('contPreview').textContent = text;
    document.getElementById('contCount').textContent = sizeNote(text);
  },
};
