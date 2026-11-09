// Skills page: find skills in your own work with an AI, install SKILL.md files, and manage what is installed.
import { PLATFORMS, platformName, platformUrl } from '../constants.js';
import { activeProjects, enabledPlatformIds } from '../model.js';
import {
  buildSkillExtractionPrompt, installSkill, parseSkillDocuments, removeSkill, setSkillScope, skillToMarkdown, toggleSkill,
} from '../skills.js';
import { copyText, html } from '../ui.js';

const initialFinder = (state) => ({
  scope: '',
  ai: state.favorite ?? enabledPlatformIds(state)[0] ?? 'claude',
  isAsked: false,
  candidates: [],
  errors: [],
});
const finderOf = (ctx) => ctx.ui.skillFinder ?? initialFinder(ctx.state);

// ---------- Find skills in my work ----------
const step = (n, title, body, isActive) => html`
  <li class="fstep ${isActive ? '' : 'is-later'}">
    <span class="fstep__n">${n}</span>
    <div class="fstep__body"><p class="fstep__title">${title}</p>${body}</div>
  </li>`;

const candidateList = (finder) => html`
  ${finder.errors.length ? html`<div class="notice notice--warn"><p>Some of the answer could not be read: ${finder.errors.join(' ')}</p></div>` : ''}
  <form class="stack" data-submit="sk-install-picked">
    ${finder.candidates.map((c, i) => html`
      <label class="cand">
        <input type="checkbox" name="pick" value="${i}" checked>
        <span class="cand__body">
          <span class="skill__name">${c.name}</span>
          <span class="cand__desc">${c.description}</span>
          <span class="cand__steps">${c.body}</span>
        </span>
      </label>`)}
    <div><button class="btn">Install selected</button></div>
  </form>`;

const finder = (ctx) => {
  const f = finderOf(ctx);
  const projects = activeProjects(ctx.state);
  const ask = html`
    <div class="row row--wrap">
      <select class="input input--select" data-change="sk-scope-pick" aria-label="What to look at">
        <option value="">All my work</option>
        ${projects.map((p) => html`<option value="${p.id}" ${f.scope === p.id ? 'selected' : ''}>Only ${p.name}</option>`)}
      </select>
      <select class="input input--select" data-change="sk-ai-pick" aria-label="Which AI to ask">
        ${PLATFORMS.map((p) => html`<option value="${p.id}" ${f.ai === p.id ? 'selected' : ''}>Ask ${p.name}</option>`)}
      </select>
      <button class="btn" data-action="sk-ask">Copy request and open ${platformName(f.ai)}</button>
    </div>`;
  const paste = html`
    <textarea class="input area" id="skAnswer" rows="5" placeholder="Paste ${platformName(f.ai)}’s whole answer here" aria-label="${platformName(f.ai)}’s answer"></textarea>
    <div><button class="btn ${f.isAsked ? '' : 'btn--quiet'}" data-action="sk-read">Read skills from the answer</button></div>`;
  const review = f.candidates.length ? candidateList(f) : html`<p class="muted">Skills found in the answer show up here for you to pick.</p>`;
  return html`
    <section class="card stack" aria-label="Find skills in my work">
      <h2 class="panel__title">Find skills in my work</h2>
      <p class="muted">Compass writes up how you work (your map, project decisions and hand-offs) and asks an AI to turn the repeatable parts into skills.</p>
      <ol class="fsteps">
        ${step(1, 'Choose what to look at, then send the request', ask, true)}
        ${step(2, `Paste ${platformName(f.ai)}’s answer`, paste, f.isAsked)}
        ${step(3, 'Pick the skills to install', review, f.candidates.length > 0)}
      </ol>
    </section>`;
};

// ---------- Install ----------
const installer = () => html`
  <section class="card stack" aria-label="Install a skill">
    <h2 class="panel__title">Install a skill</h2>
    <p class="muted">Skills use the SKILL.md format: a short block with a name and description, then the instructions. Skills made for Claude work here too.</p>
    <div class="row row--wrap">
      <label class="btn btn--quiet file-btn">Upload SKILL.md<input type="file" accept=".md,text/markdown,text/plain" data-change="sk-file"></label>
    </div>
    <textarea class="input area mono" id="skPaste" rows="6" placeholder="---&#10;name: polish-writing&#10;description: Tighten prose without changing the argument.&#10;---&#10;1. Keep paragraphs, not bullet points." aria-label="Paste a SKILL.md"></textarea>
    <div><button class="btn btn--quiet" data-action="sk-paste-install">Install pasted skill</button></div>
  </section>`;

// ---------- Installed ----------
const installedSkill = (skill, projects) => html`
  <li class="skill ${skill.enabled ? '' : 'is-off'}">
    <div class="skill__top">
      <span class="skill__name">${skill.name}</span>
      <label class="switch"><input type="checkbox" data-change="sk-toggle" data-id="${skill.id}" ${skill.enabled ? 'checked' : ''}><span>${skill.enabled ? 'On' : 'Off'}</span></label>
    </div>
    <p class="skill__desc">${skill.description}</p>
    <div class="row row--wrap">
      <select class="input input--select input--sm" data-change="sk-scope" data-id="${skill.id}" aria-label="Where ${skill.name} applies">
        <option value="all" ${skill.scope === 'all' ? 'selected' : ''}>All projects</option>
        ${projects.map((p) => html`<option value="${p.id}" ${skill.scope === p.id ? 'selected' : ''}>Only ${p.name}</option>`)}
      </select>
      <button class="btn btn--sm btn--quiet" data-action="sk-download" data-id="${skill.id}">Download</button>
      <button class="btn btn--danger-quiet" data-action="sk-remove" data-id="${skill.id}">Remove</button>
    </div>
    <details class="skill__more"><summary>See instructions</summary><pre>${skill.body}</pre></details>
  </li>`;

const installed = (state) => {
  const skills = state.skills ?? [];
  return html`
    <section class="card stack" aria-label="Installed skills">
      <h2 class="panel__title">Installed <span class="muted">${skills.length}</span></h2>
      ${skills.length
        ? html`<ul class="skills">${skills.map((s) => installedSkill(s, activeProjects(state)))}</ul>`
        : html`<p class="muted">No skills yet. Find some in your work above, or install one.</p>`}
    </section>`;
};

export const render = (ctx) => html`
  <header class="page__head">
    <div><h1>Skills</h1><p>Reusable ways of working. Compass adds the ones that are on to everything you send an AI.</p></div>
  </header>
  <div class="skills-page">
    <div class="stack-lg">${finder(ctx)}${installer()}</div>
    ${installed(ctx.state)}
  </div>`;

// ---------- Actions ----------
const setFinder = (ctx, patch) => ctx.setUi({ skillFinder: { ...finderOf(ctx), ...patch } });

function installAll(ctx, skills, source) {
  const next = skills.reduce((s, skill) => installSkill(s, { ...skill, source }), ctx.state);
  ctx.commit(next, skills.length === 1 ? `Installed ${skills[0].name}` : `Installed ${skills.length} skills`);
}

function installFromText(ctx, text, source) {
  const { skills, errors } = parseSkillDocuments(text);
  if (!skills.length) {
    ctx.toast(errors[0] ?? 'No skill found. A skill starts with a --- block that holds its name and description.', { isError: true });
    return false;
  }
  installAll(ctx, skills, source);
  if (errors.length) ctx.toast(`Installed ${skills.length}. Skipped one: ${errors[0]}`, { isError: true });
  return true;
}

export const actions = {
  'sk-ask': async (ctx) => {
    const f = finderOf(ctx);
    if (!(await copyText(buildSkillExtractionPrompt(ctx.state, f.scope || null)))) {
      ctx.toast('Copy failed.', { isError: true });
      return;
    }
    setFinder(ctx, { isAsked: true });
    ctx.toast(`Copied. Paste it into ${platformName(f.ai)}, send, then paste the answer back here.`);
    window.open(platformUrl(f.ai), '_blank', 'noopener');
  },
  'sk-read': (ctx) => {
    const text = document.getElementById('skAnswer').value;
    const { skills, errors } = parseSkillDocuments(text);
    if (!skills.length) {
      ctx.toast(errors[0] ?? 'No skills found in that answer. Make sure you pasted all of it.', { isError: true });
      return;
    }
    setFinder(ctx, { candidates: skills, errors });
  },
  'sk-install-picked': (ctx, form) => {
    const picked = new FormData(form).getAll('pick').map(Number);
    const f = finderOf(ctx);
    const skills = picked.map((i) => f.candidates[i]).filter(Boolean);
    if (!skills.length) {
      ctx.toast('Pick at least one skill.', { isError: true });
      return;
    }
    installAll(ctx, skills, 'extracted');
    ctx.setUi({ skillFinder: initialFinder(ctx.state) });
  },
  'sk-paste-install': (ctx) => {
    const area = document.getElementById('skPaste');
    if (installFromText(ctx, area.value, 'paste')) area.value = '';
  },
  'sk-remove': (ctx, el) => {
    if (!window.confirm('Remove this skill?')) return;
    ctx.commit(removeSkill(ctx.state, el.dataset.id), 'Removed');
  },
  'sk-download': (ctx, el) => {
    const skill = ctx.state.skills.find((s) => s.id === el.dataset.id);
    const url = URL.createObjectURL(new Blob([skillToMarkdown(skill)], { type: 'text/markdown' }));
    Object.assign(document.createElement('a'), { href: url, download: `${skill.name}.md` }).click();
    URL.revokeObjectURL(url);
  },
};

export const changes = {
  'sk-scope-pick': (ctx, el) => setFinder(ctx, { scope: el.value }),
  'sk-ai-pick': (ctx, el) => setFinder(ctx, { ai: el.value }),
  'sk-toggle': (ctx, el) => ctx.commit(toggleSkill(ctx.state, el.dataset.id)),
  'sk-scope': (ctx, el) => ctx.commit(setSkillScope(ctx.state, el.dataset.id, el.value), 'Saved'),
  'sk-file': async (ctx, input) => {
    const [file] = input.files;
    if (!file) return;
    try {
      installFromText(ctx, await file.text(), 'file');
    } finally {
      input.value = '';
    }
  },
};
