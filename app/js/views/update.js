// Bringing a finished chat back into a project: ask that chat for an update, paste its answer, tick what to keep.
import { MEMORY_KINDS, platformName } from '../constants.js';
import { lastAiFor, platformChoices } from '../model.js';
import { buildSortRequest, buildUpdateRequest, parseProjectUpdate } from '../importer.js';
import { applyOrganized, organizeUpdate } from '../organizer.js';
import { copyText, html, openPlatform } from '../ui.js';
import { materialFromText } from './materials.js';

const REQUEST_MARK = /\[(Update|Sort) request from Compass\]/;
const HAS_HEADINGS = /^(already decided|rules|not decided yet|background|about me)\s*[:：]/im;

const stateOf = (ctx) => ctx.ui.updating;
const aiOf = (ctx) => stateOf(ctx).ai ?? lastAiFor(ctx.state, stateOf(ctx).projectId) ?? ctx.state.favorite ?? 'chatgpt';
const setUpdate = (ctx, patch) => ctx.setUi({ updating: { ...stateOf(ctx), ...patch } });

const headline = (u, ai, project) => {
  if (!u.isWelcome) return `Update ${project.name} from a chat`;
  return u.ai ? `Back from ${platformName(ai)}? Save what you worked out there.` : 'Back from a chat? Save what you worked out there.';
};

const steps = (ctx, u, ai) => html`
  <ol class="fsteps">
    <li class="fstep"><span class="fstep__n">1</span><div class="fstep__body">
      <p class="fstep__title">${u.isSorting ? `Paste the request into ${platformName(ai)} and send` : 'Ask that chat for an update'}</p>
      <div class="row row--wrap">
        <select class="input input--select" data-change="upd-ai" aria-label="Which AI">
          ${platformChoices(ctx.state, [ai]).map((p) => html`<option value="${p.id}" ${ai === p.id ? 'selected' : ''}>${p.name}</option>`)}
        </select>
        <button class="btn" data-action="upd-ask">${u.isSorting ? 'Copy it again' : 'Copy the request'}</button>
      </div>
      <p class="muted small">${u.isSorting ? `It has your text in it. ${platformName(ai)} sorts it into the four groups.` : `Paste it into the same ${platformName(ai)} chat and send. It lists what you decided there.`}</p>
    </div></li>
    <li class="fstep ${u.isAsked ? '' : 'is-later'}"><span class="fstep__n">2</span><div class="fstep__body">
      <p class="fstep__title">Copy ${platformName(ai)}’s answer, or any summary or notes, then come back</p>
      <div class="row row--wrap">
        <button class="btn" data-action="upd-paste">Paste ${platformName(ai)}’s answer</button>
        ${u.isTyping ? '' : html`<button class="btn btn--quiet" data-action="upd-type">Paste it by hand</button>`}
      </div>
      ${u.isTyping && html`
        <textarea class="input area" id="updAnswer" rows="5" placeholder="Paste the answer here" aria-label="Answer"></textarea>
        <div><button class="btn btn--quiet" data-action="upd-read">Read it</button></div>`}
    </div></li>
  </ol>`;

const ABOUT_ME = { id: 'preference', title: 'About me', group: 'About me', hint: 'Saved to About me, so every project gets it.' };
const GROUPS = [...MEMORY_KINDS, ABOUT_ME];

const kindSelect = (i, selected) => html`
  <select class="input input--select input--sm" data-change="upd-kind" data-i="${i}" aria-label="Move to">
    ${GROUPS.map((k) => html`<option value="${k.id}" ${k.id === selected ? 'selected' : ''}>${k.title}</option>`)}
  </select>`;

const BADGE = {
  new: () => html`<span class="ubadge ubadge--new">New</span>`,
  known: () => html`<span class="ubadge ubadge--known">Already saved</span>`,
  changes: (item) => html`<span class="ubadge ubadge--changes">Replaces “${item.targetTitle}”</span>`,
  answers: (item) => html`<span class="ubadge ubadge--answers">Answers “${item.targetTitle}”</span>`,
};

const row = (item, i) => html`
  <li class="urow ${item.isPicked ? '' : 'is-off'}">
    <input type="checkbox" data-change="upd-pick" data-i="${i}" ${item.isPicked ? 'checked' : ''} aria-label="Save this one">
    <div class="urow__body">
      <input class="input input--sm urow__title" data-change="upd-title" data-i="${i}" value="${item.title}" aria-label="Title">
      <p class="urow__text">${item.text}${item.reason ? html` <span class="muted">Why: ${item.reason}</span>` : ''}</p>
      <div class="row row--wrap">${BADGE[item.status](item)}${kindSelect(i, item.kind)}</div>
    </div>
  </li>`;

const COUNT_TEXT = { new: ['new', 'new'], changes: ['replaces an old one', 'replace old ones'], answers: ['answers an open question', 'answer open questions'], known: ['already saved', 'already saved'] };
const summary = (items) => Object.entries(COUNT_TEXT)
  .map(([status, text]) => [items.filter((i) => i.status === status).length, text])
  .filter(([n]) => n)
  .map(([n, [one, many]]) => `${n} ${n === 1 ? one : many}`)
  .join(', ');

const review = (u, ai, project) => {
  const picked = u.items.filter((i) => i.isPicked).length;
  return html`
    <div class="ureview">
      <p class="ureview__head">Compass sorted ${u.items.length} ${u.items.length === 1 ? 'thing' : 'things'}: ${summary(u.items)}. Untick anything you don’t want, or move it to another group.</p>
      ${u.isLoose && html`<p class="ureview__note">This text had no headings, so Compass sorted it on its own. If a lot landed in the wrong place, <button class="link-btn" data-action="upd-sort">let ${platformName(ai)} sort it</button>.</p>`}
      ${GROUPS.map((k) => {
        const rows = u.items.map((item, i) => [item, i]).filter(([item]) => item.kind === k.id);
        return rows.length ? html`
          <section class="ugroup">
            <h3 class="mgroup__title mgroup__title--${k.id}">${k.group} <span>${rows.length}</span></h3>
            <ul class="ulist">${rows.map(([item, i]) => row(item, i))}</ul>
          </section>` : '';
      })}
      <div class="row row--wrap">
        <button class="btn" data-action="upd-save" ${picked ? '' : 'disabled'}>Save ${picked} to ${project.name}</button>
        ${u.isLoose ? '' : html`<button class="btn btn--quiet" data-action="upd-sort">Let ${platformName(ai)} sort it</button>`}
        <button class="btn btn--quiet" data-action="upd-material">Keep it whole as a reference material</button>
        <button class="btn btn--quiet" data-action="upd-again">Start over</button>
      </div>
    </div>`;
};

export function renderUpdate(ctx, project) {
  const u = stateOf(ctx);
  if (!u || u.projectId !== project.id) return '';
  const ai = aiOf(ctx);
  return html`
    <section class="update" aria-label="Update from a chat">
      <div class="update__head">
        <h2 class="update__title">${headline(u, ai, project)}</h2>
        <button class="btn btn--sm btn--quiet" data-action="upd-close">${u.isWelcome && !u.items ? 'Not now' : 'Close'}</button>
      </div>
      ${u.items ? review(u, ai, project) : steps(ctx, u, ai)}
    </section>`;
}

// Reads the answer, or explains why nothing came out of it.
function readAnswer(ctx, text) {
  if (REQUEST_MARK.test(text)) {
    ctx.toast(`That is still the request. Copy ${platformName(aiOf(ctx))}’s answer first.`, { isError: true });
    return;
  }
  const parsed = parseProjectUpdate(text);
  if (!parsed.length) {
    ctx.toast('Nothing to save in that text. Copy the whole answer and try again.', { isError: true });
    return;
  }
  const items = organizeUpdate(ctx.state, stateOf(ctx).projectId, parsed);
  setUpdate(ctx, { items, raw: text, isLoose: !HAS_HEADINGS.test(text), isSorting: false });
}

export const actions = {
  'upd-open': (ctx, el) => ctx.setUi({ updating: { projectId: el.dataset.id, ai: null, isWelcome: false } }),
  'upd-close': (ctx) => ctx.setUi({ updating: null, quietProjects: [...(ctx.ui.quietProjects ?? []), stateOf(ctx).projectId] }),
  'upd-ask': async (ctx) => {
    const project = ctx.state.projects.find((p) => p.id === stateOf(ctx).projectId);
    const u = stateOf(ctx);
    if (!(await copyText(u.isSorting ? buildSortRequest(project.name, u.raw) : buildUpdateRequest(project.name)))) {
      ctx.toast('Copy failed.', { isError: true });
      return;
    }
    setUpdate(ctx, { isAsked: true, ai: aiOf(ctx) });
    ctx.toast(`Copied. Paste it into your ${platformName(aiOf(ctx))} chat.`);
  },
  'upd-paste': async (ctx) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        readAnswer(ctx, text);
        return;
      }
      ctx.toast('The clipboard is empty. Copy the answer first.', { isError: true });
    } catch {
      ctx.toast('Your browser would not share the clipboard. Paste the answer here instead.', { isError: true });
      setUpdate(ctx, { isTyping: true });
    }
  },
  'upd-type': (ctx) => setUpdate(ctx, { isTyping: true }),
  'upd-read': (ctx) => readAnswer(ctx, document.getElementById('updAnswer').value),
  'upd-again': (ctx) => setUpdate(ctx, { items: null, isTyping: false, isSorting: false }),
  'upd-sort': async (ctx) => {
    const u = stateOf(ctx);
    const project = ctx.state.projects.find((p) => p.id === u.projectId);
    if (!(await copyText(buildSortRequest(project.name, u.raw)))) {
      ctx.toast('Copy failed.', { isError: true });
      return;
    }
    setUpdate(ctx, { items: null, isSorting: true, isAsked: true, isTyping: false, ai: aiOf(ctx) });
    ctx.toast(`Copied with your text. Paste it into ${platformName(aiOf(ctx))}, then bring the answer back.`);
    openPlatform(aiOf(ctx));
  },
  'upd-material': (ctx) => {
    const u = stateOf(ctx);
    ctx.commit(materialFromText(ctx.state, u.projectId, u.raw), 'Saved as a reference material');
    ctx.setUi({ updating: null });
  },
  'upd-save': (ctx) => {
    const u = stateOf(ctx);
    const picked = u.items.filter((i) => i.isPicked).length;
    const ai = aiOf(ctx);
    ctx.commit(applyOrganized(ctx.state, { projectId: u.projectId, items: u.items, platform: ai }), `Saved ${picked} from ${platformName(ai)}`);
    ctx.setUi({ updating: null });
  },
};

// Changes to one row are kept in the panel's state, so moving a row between groups keeps the rest.
const setItem = (ctx, el, patch, options) => {
  const index = Number(el.dataset.i);
  ctx.setUi({ updating: { ...stateOf(ctx), items: stateOf(ctx).items.map((item, i) => (i === index ? { ...item, ...patch } : item)) } }, options);
};

export const changes = {
  'upd-ai': (ctx, el) => setUpdate(ctx, { ai: el.value }),
  'upd-pick': (ctx, el) => setItem(ctx, el, { isPicked: el.checked }),
  'upd-title': (ctx, el) => setItem(ctx, el, { title: el.value.trim() || stateOf(ctx).items[Number(el.dataset.i)].title }, { isSilent: true }),
  // Moving a row asks again whether it is new, a replacement or an answer, now in its new group.
  'upd-kind': (ctx, el) => {
    const item = stateOf(ctx).items[Number(el.dataset.i)];
    const [moved] = organizeUpdate(ctx.state, stateOf(ctx).projectId, [{ ...item, kind: el.value, isMe: el.value === 'preference' }]);
    setItem(ctx, el, { ...moved, isPicked: item.isPicked });
  },
};
