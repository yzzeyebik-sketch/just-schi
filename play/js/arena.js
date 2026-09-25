(function () {
  'use strict';
  const P = window.Play;
  const { $, el, esc, store } = P;

  // Games call Play.register({...}); the arena runs whichever one is open.
  const defs = P.games = {};
  P.register = def => { defs[def.id] = def; };

  const arena = $('#arena'), stage = $('#arena-play'), panel = $('#arena-panel'), hud = $('#arena-hud');
  const titleEl = $('#arena-title'), kickerEl = $('#arena-kicker');
  const saved = {}, rounds = {};
  let cur = null, origin = null, lastFocus = null, state = 'closed';

  // ---------- settings ----------
  const modeOf = (def, s) => def.modes.find(m => m.id === s.mode) || def.modes[0];
  function settingsFor(def) {
    let s = saved[def.id];
    if (!s) {
      s = saved[def.id] = { mode: def.modes[0].id, slots: [], opts: {}, teams: { A: [], B: [], out: [] } };
      (def.options || []).forEach(o => { s.opts[o.id] = o.def; });
    }
    const m = modeOf(def, s), ids = store.players().map(p => p.id);
    const n = (m.slots || []).length;
    let slots = s.slots.filter((id, i) => ids.includes(id) && s.slots.indexOf(id) === i);
    for (const id of ids) { if (slots.length >= n) break; if (!slots.includes(id)) slots.push(id); }
    s.slots = slots.slice(0, n);
    if (m.teams) {
      const keep = arr => arr.filter(id => ids.includes(id));
      const A = keep(s.teams.A), B = keep(s.teams.B), out = keep(s.teams.out);
      ids.forEach(id => { if (!A.includes(id) && !B.includes(id) && !out.includes(id)) (A.length <= B.length ? A : B).push(id); });
      s.teams = { A, B, out };
    }
    return s;
  }
  function ready(def, s) {
    const m = modeOf(def, s);
    if (m.teams) return s.teams.A.length >= 1 && s.teams.B.length >= 1;
    return s.slots.length === (m.slots || []).length;
  }

  // ---------- panels ----------
  function showPanel(node, quiet) {
    // re-renders of the same sheet (a chip click) should not replay the entrance
    if (quiet && !panel.hidden) node.style.animation = 'none';
    const y = panel.scrollTop;
    panel.innerHTML = ''; panel.appendChild(node); panel.hidden = false;
    panel.scrollTop = quiet ? y : 0;
  }
  function hidePanel() { panel.hidden = true; panel.innerHTML = ''; }

  const field = (label, inner) => `<div class="sheet-field"><span class="micro">${esc(label)}</span>${inner}</div>`;
  const seg = (name, values, current) => `<div class="seg" role="group">${values.map(([v, label]) =>
    `<button type="button" data-seg="${esc(name)}" data-val="${esc(v)}" aria-pressed="${String(v) === String(current)}">${esc(label)}</button>`).join('')}</div>`;
  const chip = (p, attrs, pressed, tag) => `<button type="button" class="chip" style="--c:${p.color}" ${attrs} aria-pressed="${pressed}"><i class="dot"></i>${esc(p.name)}${tag ? `<span class="tag">${tag}</span>` : ''}</button>`;
  const addChip = () => store.players().length < 12 ? '<button type="button" class="chip add" data-act="add">+ игрок</button>' : '';
  const keysHtml = rows => rows && rows.length ? `<div class="sheet-keys">${rows.map(([keys, label]) =>
    `<div class="key-row">${keys.map(k => `<kbd>${esc(k)}</kbd>`).join('')}<span class="lbl">${esc(label)}</span></div>`).join('')}</div>` : '';

  function intro(quiet) {
    teardown();
    state = 'intro';
    const def = cur.def, s = settingsFor(def), m = modeOf(def, s);
    const players = store.players();
    let h = `<div class="sheet-head"><span class="micro">${esc(def.kicker)} / ${esc(def.players)}</span>
      <h3 class="sheet-title">${esc(def.title)}.</h3><p class="sheet-rules">${esc(def.rules)}</p></div>`;
    if (def.modes.length > 1) h += field('Режим', seg('mode', def.modes.map(x => [x.id, x.label]), s.mode));
    if (m.teams) {
      const group = (key, label, tag) => field(label, `<div class="chips">${s.teams[key].map(id => chip(store.player(id), `data-team="${id}"`, key !== 'out', tag)).join('') ||
        '<span class="micro">пока никого</span>'}${key === 'out' ? addChip() : ''}</div>`);
      h += group('A', 'Команда А · тапни игрока, чтобы перекинуть', 'А') + group('B', 'Команда Б', 'Б') + group('out', 'Не играют', '');
    } else {
      (m.slots || []).forEach((label, i) => {
        h += field(label, `<div class="chips">${players.map(p => chip(p, `data-slot="${i}" data-pid="${p.id}"`, s.slots[i] === p.id)).join('')}${i === m.slots.length - 1 ? addChip() : ''}</div>`);
      });
    }
    if (!ready(def, s)) {
      h += `<p class="sheet-warn">${m.teams ? 'В каждой команде нужен хотя бы один человек.' : 'Не хватает игроков. Добавь ещё одного кнопкой «+ игрок» или в разделе «Компания».'}</p>`;
    }
    (def.options || []).forEach(o => {
      if (o.modes && !o.modes.includes(s.mode)) return;
      h += field(o.label, seg('opt:' + o.id, o.values, s.opts[o.id]));
    });
    h += keysHtml(m.keys);
    h += `<div class="sheet-actions"><button type="button" class="btn primary big" data-act="start"${ready(def, s) ? '' : ' disabled'}>Играть <kbd>Enter</kbd></button>
      <button type="button" class="btn" data-act="hub">В хаб</button></div>`;
    const sheet = el('div', 'sheet', h);
    showPanel(sheet, quiet);
    P.fit(sheet.querySelector('.sheet-title'), Math.min(72, Math.max(40, innerWidth * 0.07)), 24);
    hud.innerHTML = '';
  }

  function result(r, rec) {
    const def = cur.def;
    let kicker, name, line = r.line || '', dotColor = null, badge = '';
    if (r.solo) {
      const fmt = r.fmt || (v => String(v));
      kicker = rec && rec.isNew ? 'Новый рекорд' : 'Результат';
      name = fmt(r.value);
      line = [r.player.name, line, rec && !rec.isNew ? 'лучший: ' + fmt(rec.best) : ''].filter(Boolean).join(' · ');
      if (rec && rec.isNew) badge = '<span class="badge">✳ личный рекорд</span>';
      dotColor = r.player.color;
    } else if (!r.winners || !r.winners.length) {
      kicker = 'Ничья'; name = r.title || 'Никто не уступил';
    } else {
      kicker = r.winners.length > 1 ? 'Победа команды' : 'Победа';
      name = r.title || r.winners.map(p => p.name).join(', ');
      dotColor = r.winners[0].color;
    }
    const h = `<div class="sheet-head">${badge}<span class="micro">${esc(def.title)} / ${esc(kicker)}</span>
      <p class="result-name chrome-text">${esc(name)}</p>
      ${line ? `<p class="result-line">${dotColor ? `<i class="dot" style="--c:${dotColor}"></i> ` : ''}${esc(line)}</p>` : ''}</div>
      <div class="sheet-actions"><button type="button" class="btn primary big" data-act="start">Ещё раз <kbd>Enter</kbd></button>
      <button type="button" class="btn" data-act="setup">Настройки</button><button type="button" class="btn" data-act="hub">В хаб</button></div>`;
    showPanel(el('div', 'sheet', h));
    P.fit(panel.querySelector('.result-name'), Math.min(76, Math.max(38, innerWidth * 0.07)), 20);
    const happy = r.solo ? rec && rec.isNew : r.winners && r.winners.length && !r.winners[0].bot;
    if (happy) { P.fx.rain(); P.sound.play('win'); } else P.sound.play(r.solo ? 'score' : 'lose');
  }

  // ---------- running a game ----------
  function teardown() {
    const bag = cur && cur.bag;
    if (bag) {
      bag.alive = false;
      bag.loops.forEach(L => cancelAnimationFrame(L.id));
      bag.timers.forEach(id => clearTimeout(id));
      bag.offs.forEach(off => off());
      try { cur.inst && cur.inst.destroy && cur.inst.destroy(); } catch (e) { console.error(e); }
      cur.bag = null; cur.inst = null;
    }
    stage.innerHTML = '';
  }

  function start() {
    const def = cur.def, s = settingsFor(def), m = modeOf(def, s);
    if (!ready(def, s)) return;
    teardown(); hidePanel();
    state = 'play';
    const round = rounds[def.id] = (rounds[def.id] || 0) + 1;
    const players = m.teams ? [] : s.slots.map(id => store.player(id));
    if (m.bot) players.push(P.BOT);
    const bag = cur.bag = { alive: true, loops: [], timers: [], offs: [] };
    const api = {
      stage, mode: m.id, opts: Object.assign({}, s.opts), players, round: round - 1,
      teams: m.teams ? { A: s.teams.A.map(store.player), B: s.teams.B.map(store.player) } : null,
      get playing() { return bag.alive && state === 'play'; },
      sfx: (n, a) => P.sound.play(n, a),
      burst: (x, y, o) => P.fx.burst(x, y, o),
      hud: renderHud,
      on(t, type, fn, o) { t.addEventListener(type, fn, o); bag.offs.push(() => t.removeEventListener(type, fn, o)); },
      after(ms, fn) { const id = setTimeout(() => { if (bag.alive) fn(); }, ms); bag.timers.push(id); return id; },
      loop(fn) {
        const L = { id: 0 }; let last = performance.now();
        const tick = t => {
          if (!bag.alive) return;
          const dt = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t;
          fn(dt, t);
          L.id = requestAnimationFrame(tick);
        };
        L.id = requestAnimationFrame(tick); bag.loops.push(L);
      },
      key(fn) { api.on(window, 'keydown', e => { if (api.playing) fn(e); }); },
      canvas: (W, H, o) => makeCanvas(W, H, o, api),
      end(r) { finish(r); }
    };
    try { cur.inst = def.create(api) || {}; } catch (e) { console.error(e); }
  }

  function finish(r) {
    if (state !== 'play') return;
    state = 'result';
    const def = cur.def;
    let rec = null;
    if (r.solo) {
      const key = r.key || def.id;
      const isNew = store.best(key, r.player.id, r.value, !!r.lower);
      rec = { isNew, best: store.bestOf(key, r.player.id) };
    } else {
      store.win(def.id, (r.winners || []).filter(p => p && !p.guest).map(p => p.id));
    }
    const id = setTimeout(() => { if (state === 'result') result(r, rec); }, r.delay == null ? 900 : r.delay);
    if (cur.bag) cur.bag.timers.push(id);
  }

  function renderHud(items) {
    if (typeof items === 'string') { hud.innerHTML = items; return; }
    hud.innerHTML = (items || []).map(it => `<span class="hud-pill${it.active ? ' active' : ''}" style="--c:${it.color || '#f3f2ef'}">` +
      `${it.color ? '<i class="dot"></i>' : ''}<span>${esc(it.name)}</span>${it.value != null ? `<b>${esc(it.value)}</b>` : ''}</span>`).join('');
  }

  // A crisp canvas with a fixed logical size, letterboxed into the stage.
  // With {rotate:true} it turns 90° on portrait screens (left edge of the field goes to the top).
  function makeCanvas(W, H, o, api) {
    o = o || {};
    const c = el('canvas', 'game-canvas'); stage.appendChild(c);
    const ctx = c.getContext('2d');
    const v = { el: c, ctx, W, H, rot: false, s: 1, dpr: 1 };
    const fit = () => {
      const r = stage.getBoundingClientRect();
      const rot = !!o.rotate && r.height > r.width * 1.1;
      const lw = rot ? H : W, lh = rot ? W : H;
      const s = Math.max(0.05, Math.min(r.width / lw, r.height / lh));
      const cw = Math.floor(lw * s), ch = Math.floor(lh * s);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.max(1, Math.round(cw * dpr)); c.height = Math.max(1, Math.round(ch * dpr));
      c.style.width = cw + 'px'; c.style.height = ch + 'px';
      v.rot = rot; v.s = s; v.dpr = dpr;
    };
    v.begin = (dx, dy) => {
      const k = v.s * v.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      if (v.rot) ctx.setTransform(0, k, -k, 0, c.width, 0); else ctx.setTransform(k, 0, 0, k, 0, 0);
      if (dx || dy) ctx.translate(dx || 0, dy || 0);
    };
    v.toLocal = (cx, cy) => {
      const r = c.getBoundingClientRect(), X = (cx - r.left) / v.s, Y = (cy - r.top) / v.s;
      return v.rot ? { x: Y, y: H - X } : { x: X, y: Y };
    };
    v.toClient = (x, y) => {
      const r = c.getBoundingClientRect();
      return v.rot ? { x: r.left + (H - y) * v.s, y: r.top + x * v.s } : { x: r.left + x * v.s, y: r.top + y * v.s };
    };
    fit();
    api.on(window, 'resize', fit);
    return v;
  }

  // ---------- open / close ----------
  const clipOf = r => `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 28px)`;
  function originRect() {
    if (!origin) return null;
    const r = origin.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return null;
    return r;
  }

  function open(id, card) {
    const def = defs[id]; if (!def) return;
    if (state !== 'closed') teardown();
    origin = card || null; lastFocus = document.activeElement;
    cur = { def };
    titleEl.textContent = def.title; kickerEl.textContent = def.kicker;
    (def.glow || []).forEach((g, i) => arena.style.setProperty('--g' + (i + 1), g));
    arena.hidden = false; document.body.classList.add('locked');
    intro();
    P.sound.play('whoosh');
    const r = originRect();
    if (!P.reduced && r && arena.animate) {
      arena.animate([{ clipPath: clipOf(r) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], { duration: 720, easing: 'cubic-bezier(.75,0,.2,1)' });
    }
    const btn = panel.querySelector('[data-act="start"]');
    if (btn && !btn.disabled) btn.focus({ preventScroll: true });
  }

  function close() {
    if (state === 'closed') return;
    teardown(); state = 'closed';
    const done = () => {
      arena.hidden = true; hidePanel(); hud.innerHTML = '';
      document.body.classList.remove('locked');
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    };
    const r = originRect();
    if (!P.reduced && r && arena.animate) {
      const a = arena.animate([{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: clipOf(r) }], { duration: 560, easing: 'cubic-bezier(.75,0,.2,1)' });
      a.onfinish = done;
    } else done();
  }

  // ---------- panel interactions ----------
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !cur) return;
    const def = cur.def, s = settingsFor(def);
    if (b.dataset.act === 'start') { P.sound.play('tap'); start(); return; }
    if (b.dataset.act === 'hub') { close(); return; }
    if (b.dataset.act === 'setup') { P.sound.play('tap'); intro(); return; }
    if (b.dataset.act === 'add') { store.add(); P.sound.play('tap'); intro(true); return; }
    if (b.dataset.seg) {
      const key = b.dataset.seg, raw = b.dataset.val;
      if (key === 'mode') s.mode = raw;
      else {
        const o = def.options.find(x => 'opt:' + x.id === key);
        const hit = o && o.values.find(([v]) => String(v) === raw);
        if (hit) s.opts[o.id] = hit[0];
      }
      P.sound.play('soft'); intro(true); return;
    }
    if (b.dataset.slot != null) {
      const i = +b.dataset.slot, id = b.dataset.pid, j = s.slots.indexOf(id);
      if (j >= 0 && j !== i) s.slots[j] = s.slots[i];
      s.slots[i] = id;
      P.sound.play('soft'); intro(true); return;
    }
    if (b.dataset.team) {
      const id = b.dataset.team, t = s.teams;
      const from = t.A.includes(id) ? 'A' : t.B.includes(id) ? 'B' : 'out';
      const to = { A: 'B', B: 'out', out: 'A' }[from];
      t[from] = t[from].filter(x => x !== id); t[to].push(id);
      P.sound.play('soft'); intro(true);
    }
  });

  $('#arena-back').addEventListener('click', close);

  addEventListener('keydown', e => {
    if (state === 'closed') return;
    if (e.key === 'Escape') { e.preventDefault(); if (state === 'play') intro(); else close(); return; }
    if (e.key === 'Enter' && state !== 'play' && !panel.hidden && !(e.target.closest && e.target.closest('button, input'))) {
      e.preventDefault(); P.sound.play('tap'); start();
    }
  });

  // keep the setup panel in sync if the roster changes elsewhere
  store.on(() => { if (state === 'intro' && cur) intro(true); });

  P.arena = { open, close, get state() { return state; } };
})();
