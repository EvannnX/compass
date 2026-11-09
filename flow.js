// Landing page diagram: example tasks move from the left, through Compass, to where they belong.
// Each tab is one flow; each step lights one row. It only runs while the diagram is on screen.

const STEP_MS = 3200;
const MATCH_MS = 1000;
const LOOP_PAUSE_MS = 1800;

const AIS = [
  { p: 'claude', name: 'Claude' },
  { p: 'chatgpt', name: 'ChatGPT' },
  { p: 'deepseek', name: 'DeepSeek' },
  { p: 'gemini', name: 'Gemini' },
];

const MODES = [
  {
    tab: 'Pick the AI',
    desc: 'Each task is matched to a kind of work on your map. It opens in that kind’s main AI, with the project brief already pasted in.',
    from: { p: 'you', title: 'You', sub: 'a new task' },
    busy: 'matching…',
    rows: [
      { ...AIS[0], role: 'main', note: 'planning a big piece of work' },
      { ...AIS[1], role: 'main', note: 'carrying out a set plan' },
      { ...AIS[2], role: 'main', note: 'Chinese text' },
      { ...AIS[3], role: 'main', note: 'looking things up' },
    ],
    steps: [
      { caption: '“Outline chapter 4 of my thesis”', row: 0, done: 'sent to Claude' },
      { caption: '“Turn this outline into a first draft”', row: 1, done: 'sent to ChatGPT' },
      { caption: '“Polish the Chinese abstract”', row: 2, done: 'sent to DeepSeek' },
      { caption: '“Find three recent papers on market towns”', row: 3, done: 'sent to Gemini' },
    ],
    stats: [['tasks', 1], ['opened in their main AI', 1], ['words you didn’t retype', 277]],
    summary: '4 tasks, each opened in the AI your map names for it, with the brief already in the message.',
  },
  {
    tab: 'Hand off',
    desc: 'When work moves from one AI to another, Compass packs what was settled, so the next AI starts from your decisions instead of from zero.',
    from: { p: 'claude', title: 'Claude', sub: 'plan finished' },
    busy: 'packing…',
    isPacking: true,
    rows: [
      { k: 'decision', name: 'Already decided', count: '3', role: 'e.g.', note: 'Chapter 3 compares the two sites' },
      { k: 'constraint', name: 'Rules', count: '2', role: 'e.g.', note: 'Don’t change the chapter order' },
      { k: 'open_item', name: 'Not decided yet', count: '1', role: 'e.g.', note: 'Which theory anchors it' },
      { k: 'material', name: 'Reference material', count: '1', role: 'e.g.', note: 'Advisor feedback, Oct 30' },
    ],
    steps: [
      { caption: 'Claude made the plan. Next stop: ChatGPT.', row: 0, done: '3 decisions in' },
      { caption: 'Rules go along, so ChatGPT won’t break them.', row: 1, done: '2 rules in' },
      { caption: 'Open questions stay open for you to decide.', row: 2, done: '1 question in' },
      { caption: 'The advisor’s feedback goes in full.', row: 3, done: 'sent to ChatGPT' },
    ],
    stats: [['decisions carried', [3, 0, 0, 0]], ['rules carried', [0, 2, 0, 0]], ['words you didn’t retype', [120, 40, 15, 52]]],
    summary: 'ChatGPT got the plan with 3 decisions, 2 rules, 1 open question and the advisor’s feedback.',
  },
  {
    tab: 'Bring it back',
    desc: 'When a chat ends, Compass sorts what you worked out into the project. Anything new, replaced or answered is marked, and you tick what to keep.',
    from: { p: 'chatgpt', title: 'ChatGPT', sub: 'chat finished' },
    busy: 'sorting…',
    rows: [
      { k: 'decision', name: 'Already decided' },
      { k: 'constraint', name: 'Rules' },
      { k: 'open_item', name: 'Not decided yet' },
      { k: 'fact', name: 'Background' },
    ],
    steps: [
      { caption: '“We dropped the third field site”', row: 0, role: 'new', note: 'Drop the third site', done: 'sorted' },
      { caption: '“Keep each section under 3,000 words”', row: 1, role: 'replaces', note: 'the 2,000 word rule', done: 'sorted' },
      { caption: '“Practice theory anchors the discussion”', row: 0, role: 'answers', note: 'Which theory anchors it', done: 'sorted' },
      { caption: '“The fieldwork ran from March to June”', row: 3, role: 'new', note: 'Fieldwork, March to June', done: 'sorted' },
    ],
    stats: [['things sorted', 1], ['new', [1, 0, 0, 1]], ['replaced or answered', [0, 1, 1, 0]]],
    summary: '4 things sorted into the project. You tick what to keep, then save.',
  },
];

const COMPASS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>';
const YOU = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function shell(root) {
  root.innerHTML = `
    <div class="flow__top">
      <div class="flow__tabs" role="tablist" aria-label="Flows">
        ${MODES.map((m, i) => `<button class="flow__tab" role="tab" data-mode="${i}">${escape(m.tab)}</button>`).join('')}
      </div>
      <p class="flow__desc"></p>
    </div>
    <div class="flow__stage">
      <svg class="flow__wires" aria-hidden="true"></svg>
      <div class="fnode fnode--from"><div class="fnode__mark"></div><p class="fnode__title"></p><p class="fnode__sub"></p></div>
      <div class="fnode fnode--hub"><div class="fnode__mark">${COMPASS}</div><p class="fnode__title">Compass</p><p class="fnode__sub">in your browser</p><span class="flow__pill"></span></div>
      <ul class="flow__rows"></ul>
    </div>
    <div class="flow__foot">
      <p class="flow__caption" aria-live="polite"></p>
      <dl class="flow__stats"></dl>
    </div>`;
  return {
    tabs: [...root.querySelectorAll('.flow__tab')],
    desc: root.querySelector('.flow__desc'),
    stage: root.querySelector('.flow__stage'),
    wires: root.querySelector('.flow__wires'),
    from: root.querySelector('.fnode--from'),
    hub: root.querySelector('.fnode--hub'),
    needle: root.querySelector('.fnode--hub svg path'),
    pill: root.querySelector('.flow__pill'),
    rows: root.querySelector('.flow__rows'),
    caption: root.querySelector('.flow__caption'),
    stats: root.querySelector('.flow__stats'),
  };
}

const rowHtml = (row) => `
  <li class="frow" ${row.p ? `data-p="${row.p}"` : `data-k="${row.k}"`}>
    <span class="frow__radio"></span><span class="frow__mark"></span>
    <span class="frow__name">${escape(row.name)}${row.count ? `<span>${escape(row.count)}</span>` : ''}</span>
    <span class="frow__note">${row.note ? `<b>${escape(row.role)}</b>${escape(row.note)}` : ''}</span>
  </li>`;

// Curves from Compass to each row, and a dotted line from the source into Compass.
function drawWires(el) {
  const box = el.stage.getBoundingClientRect();
  const at = (node, side) => {
    const r = node.getBoundingClientRect();
    return { x: (side === 'right' ? r.right : r.left) - box.left, y: r.top + r.height / 2 - box.top };
  };
  const start = at(el.hub, 'right');
  const into = [at(el.from, 'right'), at(el.hub, 'left')];
  const curves = [...el.rows.children].map((row) => {
    const end = at(row, 'left');
    const bend = (end.x - start.x) / 2;
    return `<path class="wire" d="M${start.x} ${start.y} C${start.x + bend} ${start.y} ${end.x - bend} ${end.y} ${end.x} ${end.y}"/>`;
  });
  el.wires.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  el.wires.innerHTML = `<path class="wire wire--in" d="M${into[0].x} ${into[0].y} L${into[1].x} ${into[1].y}"/>${curves.join('')}`;
}

// A stat is either the same amount every step, or one amount per step.
const statAfter = (stat, stepIndex) => {
  const amount = stat[1];
  if (!Array.isArray(amount)) return amount * (stepIndex + 1);
  return amount.slice(0, stepIndex + 1).reduce((sum, n) => sum + n, 0);
};

function renderStats(el, mode, stepIndex) {
  el.stats.innerHTML = mode.stats
    .map((stat) => `<div><dt>${escape(stat[0])}</dt><dd>${stepIndex < 0 ? 0 : statAfter(stat, stepIndex)}</dd></div>`)
    .join('');
}

export function mountFlow(root) {
  const el = shell(root);
  let modeIndex = 0;
  let stepIndex = -1;
  let timers = [];
  let isVisible = false;

  const mode = () => MODES[modeIndex];
  const rowEls = () => [...el.rows.children];
  const wireEls = () => [...el.wires.querySelectorAll('.wire:not(.wire--in)')];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const stop = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  function showMode() {
    const m = mode();
    el.tabs.forEach((tab, i) => tab.setAttribute('aria-selected', String(i === modeIndex)));
    el.desc.textContent = m.desc;
    el.from.dataset.p = m.from.p;
    el.from.querySelector('.fnode__mark').innerHTML = m.from.p === 'you' ? YOU : '<span class="fnode__dot"></span>';
    el.from.querySelector('.fnode__title').textContent = m.from.title;
    el.from.querySelector('.fnode__sub').textContent = m.from.sub;
    el.rows.innerHTML = m.rows.map(rowHtml).join('');
    el.pill.textContent = 'ready';
    el.pill.classList.remove('is-busy');
    el.caption.textContent = '';
    stepIndex = -1;
    renderStats(el, m, -1);
    drawWires(el);
  }

  // One step: the task arrives and Compass works on it, then the right row lights up.
  function playStep(i) {
    const m = mode();
    const step = m.steps[i];
    stepIndex = i;
    el.caption.classList.add('is-fading');
    later(() => {
      el.caption.textContent = step.caption;
      el.caption.classList.remove('is-fading');
    }, 200);
    rowEls().forEach((row) => row.classList.remove('is-on'));
    wireEls().forEach((wire) => wire.classList.remove('is-live', 'is-quiet'));
    el.wires.querySelector('.wire--in')?.classList.add('is-live');
    el.pill.textContent = m.busy;
    el.pill.classList.add('is-busy');
    el.needle.style.transform = `rotate(${(i + 1) * 90}deg)`;
    later(() => {
      const row = rowEls()[step.row];
      if (step.note && !m.rows[step.row].note) {
        row.querySelector('.frow__note').innerHTML = `<b>${escape(step.role)}</b>${escape(step.note)}`;
      }
      row.classList.add('is-on');
      if (m.isPacking) row.classList.add('is-done');
      el.wires.querySelector('.wire--in')?.classList.remove('is-live');
      wireEls().forEach((wire, w) => wire.classList.add(w === step.row ? 'is-live' : 'is-quiet'));
      el.pill.textContent = step.done;
      el.pill.classList.remove('is-busy');
      renderStats(el, m, i);
    }, MATCH_MS);
  }

  function showSummary() {
    const m = mode();
    el.caption.textContent = m.summary;
    el.pill.textContent = 'done';
    wireEls().forEach((wire) => wire.classList.remove('is-live', 'is-quiet'));
    rowEls().forEach((row) => row.classList.remove('is-on'));
  }

  function run() {
    stop();
    if (!isVisible) return;
    const steps = mode().steps;
    steps.forEach((_, i) => later(() => playStep(i), i * STEP_MS));
    later(showSummary, steps.length * STEP_MS);
    later(() => {
      showMode();
      run();
    }, steps.length * STEP_MS + LOOP_PAUSE_MS);
  }

  // Without motion: the last step of the flow, shown still.
  function showStill() {
    stop();
    mode().steps.forEach((_, i) => playStep(i));
    stop();
    const m = mode();
    const last = m.steps.at(-1);
    el.caption.textContent = m.summary;
    el.caption.classList.remove('is-fading');
    rowEls().forEach((row, r) => {
      row.classList.toggle('is-on', r === last.row);
      if (m.isPacking) row.classList.add('is-done');
    });
    wireEls().forEach((wire, w) => wire.classList.toggle('is-live', w === last.row));
    el.wires.querySelector('.wire--in')?.classList.remove('is-live');
    el.pill.textContent = last.done;
    el.pill.classList.remove('is-busy');
    renderStats(el, m, m.steps.length - 1);
  }

  const start = () => {
    showMode();
    if (reduceMotion.matches) showStill();
    else run();
  };

  el.tabs.forEach((tab) => tab.addEventListener('click', () => {
    modeIndex = Number(tab.dataset.mode);
    start();
  }));

  new IntersectionObserver(([entry]) => {
    const wasVisible = isVisible;
    isVisible = entry.isIntersecting;
    if (isVisible && !wasVisible) start();
    if (!isVisible) stop();
  }, { threshold: 0.25 }).observe(root);

  let frame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      drawWires(el);
      if (stepIndex >= 0) wireEls().forEach((wire, w) => wire.classList.toggle('is-live', w === mode().steps[stepIndex].row));
    });
  });
  document.fonts?.ready.then(() => drawWires(el));
  showMode();
}

const root = document.querySelector('[data-flow]');
if (root) mountFlow(root);
