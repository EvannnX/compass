(() => {
  'use strict';

  // ---------- Content ----------
  const PLATFORMS = [
    { id: 'chatgpt', name: 'ChatGPT' },
    { id: 'claude', name: 'Claude' },
    { id: 'gemini', name: 'Gemini' },
    { id: 'deepseek', name: 'DeepSeek' },
    { id: 'doubao', name: 'Doubao' },
  ];

  const MAP_ROWS = [
    { label: 'Thesis · plan', assigned: 'claude', alts: ['chatgpt'] },
    { label: 'Thesis · draft', assigned: 'chatgpt', alts: ['deepseek'] },
    { label: 'Chinese check', assigned: 'deepseek', alts: [] },
    { label: 'Research', assigned: 'gemini', alts: ['claude'] },
    { label: 'Images', assigned: 'doubao', alts: ['gemini'] },
    { label: 'Code', assigned: 'chatgpt', alts: ['claude'] },
  ];
  const UPDATED_PLATFORM = 'claude';

  const DIAL_ROUTES = [
    { task: 'Plan structure', platform: 'claude', angle: -90 },
    { task: 'Draft sections', platform: 'chatgpt', angle: -18 },
    { task: 'Research', platform: 'gemini', angle: 54 },
    { task: 'Images', platform: 'doubao', angle: 126 },
    { task: 'Check Chinese text', platform: 'deepseek', angle: 198 },
  ];
  const DIAL_INTERVAL_MS = 2800;
  const DIAL_SWAP_MS = 350;

  // Daily repair rate (repairs ÷ messages). Last days spike above 2× baseline.
  const DRIFT_SERIES = [0.12, 0.1, 0.14, 0.11, 0.13, 0.12, 0.1, 0.13, 0.11, 0.12, 0.14, 0.12, 0.11, 0.13, 0.27, 0.31, 0.35];
  const DRIFT_BASELINE = 0.12;
  const DRIFT_MULTIPLIER = 2;
  const DRIFT_SPIKE_DAYS = 3;
  const DRIFT_MAX = 0.4;
  const CHART = { width: 600, height: 220, pad: 24 };

  const TYPE_DELAY_MS = 42;
  const COMPACT_QUERY = '(max-width: 860px)';
  const STORY_OVERSHOOT = 1.15;

  // ---------- Helpers ----------
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const ramp = (p, start, length) => clamp01((p - start) / length);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const setActive = (items, index) => items.forEach((el, i) => el.classList.toggle('is-active', i === index));
  const pickStep = (p, bounds) => bounds.filter((b) => p >= b).length;

  // ---------- Nav ----------
  function initNav() {
    const nav = $('#nav');
    if (!nav) return;
    const darkSections = $$('.dark');
    const isOverDark = () => {
      const probe = nav.offsetHeight / 2;
      return darkSections.some((s) => {
        const rect = s.getBoundingClientRect();
        return rect.top <= probe && rect.bottom >= probe;
      });
    };
    const update = () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 8);
      nav.classList.toggle('is-dark', isOverDark());
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // ---------- Reveal on view ----------
  function initReveal() {
    const targets = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    targets.forEach((el) => observer.observe(el));
  }

  // ---------- Hero dial ----------
  function initDial() {
    const dial = $('#dial');
    const readout = $('.dial__readout');
    if (!dial || !readout) return;
    const taskEl = $('#dialTask');
    const aiEl = $('#dialAI');
    const nodes = $$('[data-node]', dial);
    let rotation = 0;
    let index = 0;

    const pointTo = (route) => {
      const target = route.angle + 90;
      const delta = ((((target - rotation) % 360) + 540) % 360) - 180;
      rotation += delta;
      dial.style.setProperty('--needle', `${rotation}deg`);
      dial.style.setProperty('--needle-c', `var(--c-${route.platform})`);
      nodes.forEach((n) => n.classList.toggle('is-active', n.dataset.node === route.platform));
    };

    const show = async (route) => {
      pointTo(route);
      readout.classList.add('is-swapping');
      await sleep(DIAL_SWAP_MS);
      taskEl.textContent = route.task;
      aiEl.textContent = PLATFORMS.find((p) => p.id === route.platform).name;
      readout.classList.remove('is-swapping');
    };

    pointTo(DIAL_ROUTES[0]);
    if (prefersReducedMotion) return;
    setInterval(() => {
      if (document.hidden) return;
      index = (index + 1) % DIAL_ROUTES.length;
      show(DIAL_ROUTES[index]);
    }, DIAL_INTERVAL_MS);
  }

  // ---------- Scene: story words light up ----------
  function initStory() {
    const text = $('[data-words]');
    if (!text) return null;
    const words = text.textContent.trim().split(/\s+/);
    text.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');
    const spans = $$('.w', text);
    return (p) => {
      const lit = p * STORY_OVERSHOOT * spans.length;
      spans.forEach((s, i) => s.classList.toggle('is-lit', i < lit));
    };
  }

  // ---------- Scene: relationship map ----------
  function buildMapCell(row, platform, rowIndex) {
    const role = row.assigned === platform.id ? 'assigned' : row.alts.includes(platform.id) ? 'alt' : null;
    if (!role) return '<div class="cell"></div>';
    const classes = [
      'cell',
      `cell--${role}`,
      platform.id === UPDATED_PLATFORM ? 'cell--affected' : '',
      rowIndex === 0 && role === 'assigned' ? 'cell--focus' : '',
    ].filter(Boolean).join(' ');
    const label = `${row.label}: ${platform.name} ${role === 'assigned' ? 'assigned' : 'alternative'}`;
    return `<div class="${classes}" data-p="${platform.id}" data-mark title="${label}"><span class="cell__mark"></span></div>`;
  }

  function initMap() {
    const grid = $('#mapGrid');
    if (!grid) return null;
    const head = ['<div></div>', ...PLATFORMS.map((p) => `<div class="grid__head" data-p="${p.id}"><i class="dot"></i><span>${p.name}</span></div>`)];
    const rows = MAP_ROWS.map((row, r) => [
      `<div class="grid__label${r === 0 ? ' grid__label--focus' : ''}">${row.label}</div>`,
      ...PLATFORMS.map((p) => buildMapCell(row, p, r)),
    ].join(''));
    grid.innerHTML = head.join('') + rows.join('');

    const marks = $$('[data-mark]', grid);
    const steps = $$('#mapSteps li');
    const detail = $('#mapDetail');
    const alert = $('#mapAlert');

    return (p) => {
      const visible = Math.round(ramp(p, 0.02, 0.4) * marks.length);
      marks.forEach((m, i) => m.classList.toggle('is-on', i < visible));
      const step = pickStep(p, [0.33, 0.64]);
      setActive(steps, step);
      grid.classList.toggle('is-detail', step === 1);
      grid.classList.toggle('is-updated', step === 2);
      detail.classList.toggle('is-shown', step === 1);
      alert.classList.toggle('is-shown', step === 2);
    };
  }

  // ---------- Scene: handoff & return ----------
  function initHandoff() {
    const stage = $('#handoffStage');
    if (!stage) return null;
    const steps = $$('#handoffSteps li');
    const groups = $$('.package__group', stage);
    const from = $('.pane--from', stage);
    const to = $('.pane--to', stage);
    const sendBtn = $('[data-handoff-btn]', stage);
    const returnBtn = $('[data-return-btn]', stage);
    const verdict = $('[data-verdict]', stage);
    const pill = $('[data-return-pill]', stage);
    const compact = window.matchMedia(COMPACT_QUERY);

    return (progress) => {
      // On small screens the scene is a static stack, so show the finished state.
      const p = compact.matches ? 1 : progress;
      const step = pickStep(p, [0.2, 0.46, 0.72]);
      const r = ramp(p, 0.75, 0.12);
      setActive(steps, step);

      stage.style.setProperty('--show', ramp(p, 0.17, 0.06).toFixed(3));
      stage.style.setProperty('--m', ramp(p, 0.47, 0.13).toFixed(3));
      stage.style.setProperty('--fill', ramp(p, 0.55, 0.15).toFixed(3));
      stage.style.setProperty('--r', r.toFixed(3));

      groups.forEach((g, i) => g.classList.toggle('is-on', p > 0.22 + i * 0.05));
      from.classList.toggle('is-focus', step === 0 || step === 3);
      to.classList.toggle('is-focus', step === 2);
      sendBtn.classList.toggle('is-pressed', p > 0.42 && p < 0.52);
      returnBtn.classList.toggle('is-pressed', p > 0.72 && p < 0.8);
      pill.classList.toggle('is-visible', r > 0 && r < 1);
      verdict.classList.toggle('is-shown', p > 0.88);
    };
  }

  // ---------- Scroll-linked scene driver ----------
  function initScenes(renderers) {
    const scenes = $$('[data-scene]')
      .map((el) => ({ el, render: renderers[el.dataset.scene] }))
      .filter((s) => typeof s.render === 'function');
    if (scenes.length === 0) return;

    let isTicking = false;
    const update = () => {
      isTicking = false;
      const vh = window.innerHeight;
      scenes.forEach(({ el, render }) => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -vh || rect.top > vh * 2) return;
        const span = rect.height - vh;
        render(span > 0 ? clamp01(-rect.top / span) : 1);
      });
    };
    const requestUpdate = () => {
      if (isTicking) return;
      isTicking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    window.matchMedia(COMPACT_QUERY).addEventListener('change', requestUpdate);
    update();
  }

  // ---------- Capture demo (plays while visible) ----------
  function initCaptureDemo() {
    const root = $('#captureDemo');
    if (!root) return;
    const typed = $('[data-typed]', root);
    const accept = $('[data-accept]', root);
    const message = $('[data-sent]', root).textContent.trim();
    const setState = (state) => { root.dataset.state = state; };

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      setState('card');
      return;
    }

    let isVisible = false;
    let isRunning = false;

    const typeMessage = async () => {
      for (let i = 1; i <= message.length; i += 1) {
        typed.textContent = message.slice(0, i);
        await sleep(TYPE_DELAY_MS);
      }
    };

    const playOnce = async () => {
      setState('idle');
      typed.textContent = '';
      accept.classList.remove('is-pressed');
      await sleep(900);
      setState('typing');
      await typeMessage();
      await sleep(400);
      typed.textContent = '';
      setState('sent');
      await sleep(1000);
      setState('card');
      await sleep(1800);
      accept.classList.add('is-pressed');
      await sleep(280);
      setState('saved');
      await sleep(3000);
    };

    const run = async () => {
      if (isRunning) return;
      isRunning = true;
      while (isVisible) await playOnce();
      isRunning = false;
    };

    new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible) run();
    }, { threshold: 0.4 }).observe(root);
  }

  // ---------- Drift chart ----------
  function initDriftChart() {
    const line = $('#driftLine');
    if (!line) return;
    const { width, height, pad } = CHART;
    const n = DRIFT_SERIES.length;
    const x = (i) => pad + (i * (width - 2 * pad)) / (n - 1);
    const y = (v) => height - pad - (v / DRIFT_MAX) * (height - 2 * pad);
    const points = DRIFT_SERIES.map((v, i) => [x(i), y(v)]);
    const d = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');

    line.setAttribute('d', d);
    $('#driftArea').setAttribute('d', `${d} L${x(n - 1)},${height - pad} L${x(0)},${height - pad} Z`);

    const baseY = y(DRIFT_BASELINE);
    const thrY = y(DRIFT_BASELINE * DRIFT_MULTIPLIER);
    $('#driftBaseline').setAttribute('y1', baseY);
    $('#driftBaseline').setAttribute('y2', baseY);
    $('#driftThreshold').setAttribute('y1', thrY);
    $('#driftThreshold').setAttribute('y2', thrY);

    const spikeStart = x(n - DRIFT_SPIKE_DAYS) - 14;
    const spike = $('#driftSpike');
    spike.setAttribute('x', spikeStart);
    spike.setAttribute('width', width - pad + 14 - spikeStart);

    $('#driftDots').innerHTML = points
      .slice(-DRIFT_SPIKE_DAYS)
      .map(([px, py], i) => `<circle class="drift__dot" style="--i:${i}" cx="${px}" cy="${py}" r="5"/>`)
      .join('');

    line.style.setProperty('--len', Math.ceil(line.getTotalLength()));
  }

  // ---------- Boot ----------
  initNav();
  initDriftChart();
  initReveal();
  initDial();
  initCaptureDemo();
  initScenes({ story: initStory(), map: initMap(), handoff: initHandoff() });
})();
