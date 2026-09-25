(function () {
  'use strict';
  const P = window.Play = {};

  P.$ = (s, r) => (r || document).querySelector(s);
  P.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  P.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  P.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  P.lerp = (a, b, t) => a + (b - a) * t;
  P.rand = (a, b) => a + Math.random() * (b - a);
  P.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  P.shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  P.el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  P.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  P.hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  };
  // shrink a big headline until its longest word fits on one line
  P.fit = (node, max, min) => {
    if (!node) return;
    let size = max;
    node.style.fontSize = size + 'px';
    while (size > min && node.scrollWidth > node.clientWidth + 1) { size -= 2; node.style.fontSize = size + 'px'; }
  };
  P.pad2 = n => String(n).padStart(2, '0');
  P.plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    return (a > 10 && a < 20) ? many : b === 1 ? one : (b > 1 && b < 5) ? few : many;
  };

  // player colours: the chromatic set from the hub, plus chalk
  P.COLORS = ['#ff7a1a', '#8a6bff', '#ff3d7f', '#5fd4ff', '#ffd23f', '#4dffb0', '#e9e7e2'];
  P.BOT = { id: 'bot', name: 'Бот', color: '#c9cbd1', bot: true };

  const ADJ = ['Ночной', 'Кибер', 'Сонный', 'Бешеный', 'Тихий', 'Лунный', 'Хромовый', 'Весёлый', 'Ледяной', 'Жареный', 'Турбо', 'Мятный', 'Грозный', 'Космический', 'Пиксельный'];
  const NOUN = ['Гусь', 'Пельмень', 'Барсук', 'Енот', 'Кактус', 'Батон', 'Сом', 'Тапок', 'Лис', 'Краб', 'Вареник', 'Филин', 'Хомяк', 'Бублик', 'Ёж'];
  P.nick = () => P.pick(ADJ) + ' ' + P.pick(NOUN);

  // ---------- store (this browser only) ----------
  const KEY = 'justplay.v1';
  const mk = (name, color) => ({ id: Math.random().toString(36).slice(2, 9), name, color });
  const fresh = () => ({ players: [mk(P.nick(), P.COLORS[0]), mk(P.nick(), P.COLORS[1])], wins: {}, best: {}, played: 0, sound: true });
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
  if (!data || typeof data !== 'object' || !Array.isArray(data.players) || !data.players.length) data = fresh();
  data.wins = data.wins || {}; data.best = data.best || {}; data.played = data.played || 0;
  if (data.sound === undefined) data.sound = true;

  const subs = new Set();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable: keep in memory */ }
    subs.forEach(fn => fn(data));
  };

  P.store = {
    get data() { return data; },
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    players: () => data.players,
    player: id => (id === 'bot' ? P.BOT : data.players.find(p => p.id === id)),
    add(name, color) {
      if (data.players.length >= 12) return null;
      const used = data.players.map(p => p.color);
      const c = color || P.COLORS.find(x => !used.includes(x)) || P.pick(P.COLORS);
      const p = mk((name || '').trim().slice(0, 18) || P.nick(), c);
      data.players.push(p); save(); return p;
    },
    rename(id, name) {
      const p = P.store.player(id); if (!p || p.bot) return;
      p.name = (name || '').trim().slice(0, 18) || p.name; save();
    },
    recolor(id) {
      const p = P.store.player(id); if (!p || p.bot) return;
      p.color = P.COLORS[(P.COLORS.indexOf(p.color) + 1) % P.COLORS.length]; save();
    },
    remove(id) {
      if (data.players.length <= 1) return;
      data.players = data.players.filter(p => p.id !== id); save();
    },
    // a finished match: ids of winners (empty for a draw)
    win(game, ids) {
      data.played++;
      const g = data.wins[game] = data.wins[game] || {};
      (ids || []).forEach(id => { g[id] = (g[id] || 0) + 1; });
      save();
    },
    // a solo result; returns true when it beats the player's previous best
    best(game, id, value, lower) {
      data.played++;
      const g = data.best[game] = data.best[game] || {};
      const prev = g[id];
      const better = prev == null || (lower ? value < prev : value > prev);
      if (better) g[id] = value;
      save();
      return better;
    },
    bestOf(game, id) { return (data.best[game] || {})[id]; },
    top(game, lower) {
      const g = data.best[game] || {}; let out = null;
      Object.keys(g).forEach(id => {
        const p = P.store.player(id); if (!p) return;
        if (!out || (lower ? g[id] < out.value : g[id] > out.value)) out = { player: p, value: g[id] };
      });
      return out;
    },
    winsOf(id, game) {
      if (game) return (data.wins[game] || {})[id] || 0;
      return Object.keys(data.wins).reduce((s, k) => s + ((data.wins[k] || {})[id] || 0), 0);
    },
    leader(game) {
      const g = data.wins[game] || {}; let out = null;
      Object.keys(g).forEach(id => {
        const p = P.store.player(id); if (!p || !g[id]) return;
        if (!out || g[id] > out.wins) out = { player: p, wins: g[id] };
      });
      return out;
    },
    reset() { data.wins = {}; data.best = {}; data.played = 0; save(); },
    setSound(on) { data.sound = !!on; save(); }
  };

  // ---------- sound: tiny WebAudio synth, no files ----------
  const S = P.sound = {
    ctx: null, master: null,
    get on() { return data.sound; },
    toggle() { P.store.setSound(!data.sound); if (data.sound) S.play('tap'); },
    ensure() {
      if (!S.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { S.ctx = new AC(); } catch (e) { return null; }
        S.master = S.ctx.createGain(); S.master.gain.value = 0.32;
        const comp = S.ctx.createDynamicsCompressor();
        S.master.connect(comp); comp.connect(S.ctx.destination);
      }
      if (S.ctx.state === 'suspended') S.ctx.resume();
      return S.ctx;
    },
    tone(freq, dur, o) {
      o = o || {};
      const ctx = S.ensure(); if (!ctx) return;
      const t = ctx.currentTime + (o.delay || 0);
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + o.slide), t + dur);
      const v = o.vol == null ? 0.4 : o.vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(S.master);
      osc.start(t); osc.stop(t + dur + 0.02);
    },
    noise(dur, o) {
      o = o || {};
      const ctx = S.ensure(); if (!ctx) return;
      const t = ctx.currentTime + (o.delay || 0);
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = buf; f.type = o.filter || 'bandpass'; f.frequency.value = o.freq || 2400; f.Q.value = o.q || 0.8;
      g.gain.value = o.vol == null ? 0.25 : o.vol;
      src.connect(f); f.connect(g); g.connect(S.master); src.start(t);
    },
    play(name, a) {
      if (!data.sound) return;
      const T = S.tone;
      switch (name) {
        case 'tap': T(660, 0.07, { vol: 0.18 }); break;
        case 'soft': T(1180, 0.05, { vol: 0.07 }); break;
        case 'hit': T(240 + (a || 0) * 380, 0.09, { type: 'square', vol: 0.16, slide: 120 }); break;
        case 'wall': T(170, 0.07, { type: 'triangle', vol: 0.25 }); break;
        case 'score': T(523, 0.12, { type: 'triangle', vol: 0.3 }); T(784, 0.2, { type: 'triangle', vol: 0.3, delay: 0.08 }); break;
        case 'lose': T(330, 0.32, { type: 'sawtooth', vol: 0.12, slide: -170 }); break;
        case 'win':
          [523, 659, 784, 1047].forEach((f, i) => T(f, 0.2, { type: 'triangle', vol: 0.28, delay: i * 0.09 }));
          T(1568, 0.5, { vol: 0.12, delay: 0.38 }); break;
        case 'drop': T(200, 0.14, { type: 'triangle', vol: 0.4, slide: -90 }); S.noise(0.05, { freq: 900, vol: 0.18 }); break;
        case 'bounce': T(260, 0.06, { type: 'triangle', vol: 0.14 }); break;
        case 'flip': S.noise(0.06, { freq: 3600, vol: 0.12 }); T(900, 0.03, { vol: 0.05 }); break;
        case 'eat': T(700, 0.08, { type: 'square', vol: 0.1, slide: 500 }); break;
        case 'go': T(988, 0.22, { type: 'square', vol: 0.18 }); T(1976, 0.22, { vol: 0.08 }); break;
        case 'tick': T(1800, 0.025, { type: 'square', vol: 0.05 }); break;
        case 'bad': T(150, 0.34, { type: 'sawtooth', vol: 0.22, slide: -60 }); break;
        case 'whoosh': S.noise(0.22, { freq: 1200, vol: 0.12, q: 0.5 }); break;
      }
    }
  };

  // ---------- fx: chromatic confetti on a full-screen canvas ----------
  const fxC = document.getElementById('fx');
  const fx = fxC ? fxC.getContext('2d') : null;
  const parts = [];
  let fxRaf = 0, fxLast = 0, fxDpr = 1;
  const FX_COLORS = ['#ffd23f', '#ff7a1a', '#ff3d7f', '#8a6bff', '#5fd4ff', '#ffffff'];
  function fxSize() {
    if (!fxC) return;
    fxDpr = Math.min(window.devicePixelRatio || 1, 2);
    fxC.width = innerWidth * fxDpr; fxC.height = innerHeight * fxDpr;
  }
  fxSize(); addEventListener('resize', fxSize);
  function fxFrame(t) {
    const dt = Math.min(0.033, (t - fxLast) / 1000 || 0.016); fxLast = t;
    fx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
    fx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life += dt;
      if (q.life > q.max) { parts.splice(i, 1); continue; }
      q.vx *= 0.985; q.vy = q.vy * 0.985 + q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      const k = q.life / q.max;
      fx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      fx.fillStyle = q.color;
      fx.save(); fx.translate(q.x, q.y); fx.rotate(q.rot);
      if (q.round) { fx.beginPath(); fx.arc(0, 0, q.size * 0.5, 0, 6.283); fx.fill(); }
      else fx.fillRect(-q.size * 0.5, -q.size * 0.22, q.size, q.size * 0.44 * (0.4 + Math.abs(Math.cos(q.rot * 2))));
      fx.restore();
    }
    fx.globalAlpha = 1;
    fxRaf = parts.length ? requestAnimationFrame(fxFrame) : 0;
  }
  P.fx = {
    burst(x, y, o) {
      if (!fx) return;
      o = o || {};
      const n = P.reduced ? Math.min(20, o.count || 70) : (o.count || 70);
      const colors = o.colors || FX_COLORS, power = o.power || 1;
      for (let i = 0; i < n; i++) {
        const a = (o.angle != null ? o.angle : -Math.PI / 2) + (Math.random() - 0.5) * (o.spread || Math.PI * 2);
        const sp = (240 + Math.random() * 620) * power;
        parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.gravity == null ? 900 : o.gravity,
          rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, size: 5 + Math.random() * 9,
          color: P.pick(colors), round: Math.random() < 0.35, life: 0, max: 1.1 + Math.random() * 1.1
        });
      }
      if (!fxRaf) { fxLast = performance.now(); fxRaf = requestAnimationFrame(fxFrame); }
    },
    rain() {
      for (let i = 0; i < 6; i++) setTimeout(() => P.fx.burst(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * 0.35, { count: 40, power: 0.9 }), i * 140);
    }
  };
})();
