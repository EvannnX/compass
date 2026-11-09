// Moving memories from another AI: ask it to list what it remembers, paste the answer, choose where each one goes.
import { MEMORY_KINDS, platformName } from '../constants.js';
import { activeProjects, addMemory, addProject, platformChoices } from '../model.js';
import { buildMemoryExportPrompt, parseMemoryExport } from '../importer.js';
import { copyText, html, openPlatform } from '../ui.js';

const WHERE_TO_FIND = {
  chatgpt: 'ChatGPT also lists what it remembers under Settings, Personalization, Memory. You can paste that list too.',
  claude: 'Claude also keeps project knowledge and instructions inside each Claude project. You can paste those too.',
  gemini: 'Gemini also lists saved info under Settings, Saved info. You can paste that list too.',
  deepseek: 'DeepSeek does not keep long-term memory, so asking it is the only way.',
};
const NEW_PREFIX = 'new:';

const stateOf = (ctx) => ctx.ui.importing ?? { ai: 'chatgpt', isAsked: false, items: [] };

// "me", an existing project id, or "new:<name>" for a project that does not exist yet.
function defaultDestination(projects, destination) {
  if (destination === 'me') return 'me';
  const match = projects.find((p) => p.name.toLowerCase() === destination.toLowerCase());
  return match ? match.id : `${NEW_PREFIX}${destination}`;
}

const destinationSelect = (i, projects, selected, newNames) => html`
  <select class="input input--select input--sm" name="dest-${i}" aria-label="Where this goes">
    <option value="me" ${selected === 'me' ? 'selected' : ''}>About me</option>
    ${projects.map((p) => html`<option value="${p.id}" ${selected === p.id ? 'selected' : ''}>${p.name}</option>`)}
    ${newNames.map((name) => html`<option value="${NEW_PREFIX}${name}" ${selected === `${NEW_PREFIX}${name}` ? 'selected' : ''}>New project: ${name}</option>`)}
  </select>`;

const review = (ctx, items) => {
  const projects = activeProjects(ctx.state);
  const newNames = [...new Set(items.map((i) => defaultDestination(projects, i.destination)).filter((d) => d.startsWith(NEW_PREFIX)).map((d) => d.slice(NEW_PREFIX.length)))];
  return html`
    <form class="slices" data-submit="imp-save">
      <p class="slices__head">Found ${items.length} memories. Choose where each one goes, untick any you don’t want, then import.</p>
      <ul class="slices__list">
        ${items.map((item, i) => html`
          <li class="slice">
            <input type="checkbox" name="keep" value="${i}" checked aria-label="Import this one">
            <div class="slice__body">
              <div class="row row--wrap">
                ${destinationSelect(i, projects, defaultDestination(projects, item.destination), newNames)}
                <select class="input input--select input--sm" name="kind-${i}" aria-label="Kind">
                  <option value="preference" ${item.kind === 'preference' ? 'selected' : ''}>About me</option>
                  ${MEMORY_KINDS.map((k) => html`<option value="${k.id}" ${item.kind === k.id ? 'selected' : ''}>${k.title}</option>`)}
                </select>
              </div>
              <p class="slice__text">${item.text}</p>
            </div>
          </li>`)}
      </ul>
      <div class="row"><button class="btn">Import selected</button><button type="button" class="btn btn--quiet" data-action="imp-cancel">Cancel</button></div>
    </form>`;
};

export function renderImport(ctx) {
  const imp = stateOf(ctx);
  return html`
    <section class="card stack" aria-label="Bring memories from another AI">
      <h2 class="panel__title">Bring memories from another AI</h2>
      <p class="muted">Already told ChatGPT or Claude a lot about yourself? Move it here so every AI gets it.</p>
      ${imp.items.length ? review(ctx, imp.items) : html`
        <ol class="fsteps">
          <li class="fstep"><span class="fstep__n">1</span><div class="fstep__body">
            <p class="fstep__title">Ask the AI to list what it remembers</p>
            <div class="row row--wrap">
              <select class="input input--select" data-change="imp-ai" aria-label="Which AI">
                ${platformChoices(ctx.state, [imp.ai]).map((p) => html`<option value="${p.id}" ${imp.ai === p.id ? 'selected' : ''}>${p.name}</option>`)}
              </select>
              <button class="btn" data-action="imp-ask">Copy request and open ${platformName(imp.ai)}</button>
            </div>
            <p class="muted small">${WHERE_TO_FIND[imp.ai] ?? `If ${platformName(imp.ai)} has a memory or saved info page in its settings, you can paste that list too.`}</p>
          </div></li>
          <li class="fstep ${imp.isAsked ? '' : 'is-later'}"><span class="fstep__n">2</span><div class="fstep__body">
            <p class="fstep__title">Paste ${platformName(imp.ai)}’s answer</p>
            <textarea class="input area" id="impAnswer" rows="5" placeholder="Paste the whole answer, or a memory list copied from settings" aria-label="Answer"></textarea>
            <div><button class="btn btn--quiet" data-action="imp-read">Read memories</button></div>
          </div></li>
        </ol>`}
    </section>`;
}

const setImport = (ctx, patch) => ctx.setUi({ importing: { ...stateOf(ctx), ...patch } });

// Creates any new projects first, then adds every kept memory where it was sent.
function importItems(state, items, choices, platform) {
  const newNames = [...new Set(choices.map((c) => c.dest).filter((d) => d.startsWith(NEW_PREFIX)).map((d) => d.slice(NEW_PREFIX.length)))];
  const withProjects = newNames.reduce((s, name) => addProject(s, name), state);
  const idFor = (dest) => (dest.startsWith(NEW_PREFIX) ? withProjects.projects.find((p) => p.name === dest.slice(NEW_PREFIX.length)).id : dest);
  return choices.reduce((s, { index, dest, kind }) => {
    const item = items[index];
    const isMe = dest === 'me';
    return addMemory(s, {
      layer: isMe ? 'global' : 'project',
      projectId: isMe ? undefined : idFor(dest),
      kind: isMe ? 'preference' : (kind === 'preference' ? 'fact' : kind),
      text: item.text,
      title: item.title,
      reason: item.reason,
      excerpt: item.source,
      platform,
      capturedVia: 'import',
    });
  }, withProjects);
}

export const actions = {
  'imp-ask': async (ctx) => {
    const imp = stateOf(ctx);
    if (!(await copyText(buildMemoryExportPrompt(imp.ai)))) {
      ctx.toast('Copy failed.', { isError: true });
      return;
    }
    setImport(ctx, { isAsked: true });
    ctx.toast(`Copied. Paste it into ${platformName(imp.ai)}, send, then paste the answer back here.`);
    openPlatform(imp.ai);
  },
  'imp-read': (ctx) => {
    const items = parseMemoryExport(document.getElementById('impAnswer').value);
    if (!items.length) {
      ctx.toast('No memories found in that text. Make sure you pasted the whole answer.', { isError: true });
      return;
    }
    setImport(ctx, { items });
  },
  'imp-cancel': (ctx) => ctx.setUi({ importing: null }),
  'imp-save': (ctx, form) => {
    const data = new FormData(form);
    const imp = stateOf(ctx);
    const choices = data.getAll('keep').map(Number).map((index) => ({
      index,
      dest: String(data.get(`dest-${index}`) ?? 'me'),
      kind: String(data.get(`kind-${index}`) ?? 'fact'),
    }));
    if (!choices.length) {
      ctx.toast('Pick at least one memory.', { isError: true });
      return;
    }
    ctx.commit(importItems(ctx.state, imp.items, choices, imp.ai), `Imported ${choices.length} memories from ${platformName(imp.ai)}`);
    ctx.setUi({ importing: null });
  },
};

export const changes = {
  'imp-ai': (ctx, el) => setImport(ctx, { ai: el.value }),
};
