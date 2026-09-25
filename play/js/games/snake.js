(function () {
  'use strict';
  const P = window.Play, hexA = P.hexA;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  P.register({
    id: 'snake', title: 'Змейка', kicker: 'Аркада', players: '1–2 игрока',
    glow: ['#4dffb0', '#5fd4ff', '#ff7a1a'],
    rules: 'Собирай огоньки, чтобы расти, и не врезайся в стены, в себя и в соперника. Вдвоём побеждает тот, кто продержится дольше.',
    modes: [
      { id: 'solo', label: 'Один на очки', slots: ['Игрок'], keys: [[['←', '↑', '→', '↓'], 'или'], [['W', 'A', 'S', 'D'], 'поворот'], [['Свайп'], 'на телефоне']] },
      { id: 'duo', label: 'Дуэль на выживание', slots: ['Клавиши WASD', 'Стрелки'],
        keys: [[['W', 'A', 'S', 'D'], 'первая змейка'], [['←', '↑', '→', '↓'], 'вторая змейка'], [['Свайп'], 'каждый на своей половине экрана']] }
    ],
    options: [{ id: 'speed', label: 'Скорость', values: [['chill', 'Спокойно'], ['norm', 'Нормально'], ['fast', 'Быстро']], def: 'norm' }],

    create(api) {
      const duo = api.mode === 'duo';
      const box = api.stage.getBoundingClientRect();
      const portrait = box.height > box.width;
      const COLS = portrait ? 16 : 28, ROWS = portrait ? 24 : 17, C = 32;
      const W = COLS * C, H = ROWS * C;
      const v = api.canvas(W, H), ctx = v.ctx;
      const base = { chill: 150, norm: 115, fast: 82 }[api.opts.speed] || 115;
      const colors = api.players.map((p, i) => (i === 1 && p.color === api.players[0].color) ? (p.color === '#4dffb0' ? '#ff3d7f' : '#4dffb0') : p.color);

      const mkSnake = (i) => {
        const y = duo ? (i ? ROWS - 4 : 3) : Math.floor(ROWS / 2);
        const x0 = duo ? (i ? COLS - 5 : 4) : 5;
        const d = duo && i ? DIRS.left : DIRS.right;
        const body = [0, 1, 2].map(k => ({ x: x0 - d[0] * k, y }));
        return { p: api.players[i], color: colors[i], body, prev: body.map(c => ({ ...c })), dir: d, queue: [], alive: true, grow: 0, score: 0 };
      };
      const snakes = api.players.map((_, i) => mkSnake(i));
      const foods = [];
      const sparks = [];
      let acc = 0, tick = base, t = 0, countdown = 2.4, over = false;

      const occupied = (x, y) => snakes.some(s => s.body.some(c => c.x === x && c.y === y)) || foods.some(f => f.x === x && f.y === y);
      function spawn() {
        for (let n = 0; n < 400; n++) {
          const x = Math.floor(Math.random() * COLS), y = Math.floor(Math.random() * ROWS);
          if (!occupied(x, y)) { foods.push({ x, y, born: t, hue: P.pick(['#ffd23f', '#ff7a1a', '#ff3d7f', '#5fd4ff']) }); return; }
        }
      }
      for (let i = 0; i < (duo ? 3 : 1); i++) spawn();

      const best = duo ? 0 : (P.store.bestOf('snake', api.players[0].id) || 0);
      const hud = () => {
        if (duo) api.hud(snakes.map(s => ({ name: s.p.name, color: s.color, value: s.alive ? s.body.length : '✕' })));
        else api.hud([{ name: 'Огоньки', value: snakes[0].score, color: snakes[0].color }, { name: 'Рекорд', value: Math.max(best, snakes[0].score) }]);
      };
      hud();

      function turn(s, d) {
        if (!s.alive) return;
        const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
        if (d === last || (d[0] === -last[0] && d[1] === -last[1])) return;
        if (s.queue.length < 3) s.queue.push(d);
      }
      const KEYS = {
        KeyW: [0, 'up'], KeyS: [0, 'down'], KeyA: [0, 'left'], KeyD: [0, 'right'],
        ArrowUp: [1, 'up'], ArrowDown: [1, 'down'], ArrowLeft: [1, 'left'], ArrowRight: [1, 'right']
      };
      api.key(e => {
        const k = KEYS[e.code]; if (!k) return;
        e.preventDefault();
        turn(snakes[duo ? k[0] : 0], DIRS[k[1]]);
      });

      // swipes: each pointer steers the snake on its half of the screen
      const swipes = new Map();
      api.on(api.stage, 'pointerdown', e => {
        const r = api.stage.getBoundingClientRect();
        swipes.set(e.pointerId, { x: e.clientX, y: e.clientY, who: duo && e.clientX > r.left + r.width / 2 ? 1 : 0 });
      });
      api.on(api.stage, 'pointermove', e => {
        const s = swipes.get(e.pointerId); if (!s) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.hypot(dx, dy) < 26) return;
        turn(snakes[s.who], Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRS.right : DIRS.left) : (dy > 0 ? DIRS.down : DIRS.up));
        s.x = e.clientX; s.y = e.clientY;
      });
      ['pointerup', 'pointercancel'].forEach(n => api.on(api.stage, n, e => swipes.delete(e.pointerId)));

      function burstAt(x, y, cols, count) {
        const at = v.toClient((x + 0.5) * C, (y + 0.5) * C);
        api.burst(at.x, at.y, { count, colors: cols, power: 0.6 });
      }

      function step() {
        const live = snakes.filter(s => s.alive);
        live.forEach(s => {
          if (s.queue.length) s.dir = s.queue.shift();
          s.prev = s.body.map(c => ({ ...c }));
          const h = s.body[0];
          s.body.unshift({ x: h.x + s.dir[0], y: h.y + s.dir[1] });
          if (s.grow > 0) s.grow--; else s.body.pop();
        });
        const dead = live.filter(s => {
          const h = s.body[0];
          if (h.x < 0 || h.y < 0 || h.x >= COLS || h.y >= ROWS) return true;
          return snakes.some(o => o.body.some((c, k) => (o !== s || k > 0) && c.x === h.x && c.y === h.y));
        });
        live.forEach(s => {
          if (dead.includes(s)) return;
          const h = s.body[0], fi = foods.findIndex(f => f.x === h.x && f.y === h.y);
          if (fi < 0) return;
          const f = foods.splice(fi, 1)[0];
          s.grow += duo ? 2 : 1; s.score++;
          for (let n = 0; n < 12; n++) sparks.push({ x: (f.x + 0.5) * C, y: (f.y + 0.5) * C, vx: P.rand(-260, 260), vy: P.rand(-260, 260), life: P.rand(0.3, 0.6), c: f.hue });
          api.sfx('eat'); spawn(); hud();
        });
        if (dead.length) {
          dead.forEach(s => { s.alive = false; const h = s.body[0]; burstAt(P.clamp(h.x, 0, COLS - 1), P.clamp(h.y, 0, ROWS - 1), [s.color, '#ffffff'], 50); });
          api.sfx('bad'); hud();
          const alive = snakes.filter(s => s.alive);
          if (!duo) {
            over = true;
            const s = snakes[0];
            api.end({ solo: true, player: s.p, value: s.score, fmt: x => x + ' ' + P.plural(x, 'огонёк', 'огонька', 'огоньков'), line: 'длина ' + s.body.length });
          } else if (alive.length <= 1) {
            over = true;
            api.end({ winners: alive.map(s => s.p), title: alive.length ? null : 'Лобовое', line: alive.length ? 'длина ' + alive[0].body.length : 'врезались одновременно' });
          }
        }
        const longest = Math.max.apply(null, snakes.map(s => s.score));
        tick = Math.max(base * 0.55, base - longest * 2.2);
      }

      const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      function drawSnake(s, k) {
        const b = s.body, pv = s.prev;
        const pts = [s.alive ? lerp(pv[0], b[0], k) : b[0]];
        for (let i = 1; i < b.length; i++) pts.push(b[i]);
        if (s.alive) pts.push(lerp(pv[pv.length - 1], b[b.length - 1], k));
        const n = pts.length;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let i = n - 1; i > 0; i--) {
          const a = pts[i], c = pts[i - 1], f = i / n;
          ctx.strokeStyle = hexA(s.color, s.alive ? 1 - f * 0.65 : 0.25);
          ctx.lineWidth = C * (0.66 - f * 0.22);
          ctx.beginPath(); ctx.moveTo((a.x + 0.5) * C, (a.y + 0.5) * C); ctx.lineTo((c.x + 0.5) * C, (c.y + 0.5) * C); ctx.stroke();
        }
        const h = pts[0], hx = (h.x + 0.5) * C, hy = (h.y + 0.5) * C;
        ctx.save();
        if (s.alive) { ctx.shadowColor = s.color; ctx.shadowBlur = 22; }
        ctx.fillStyle = s.alive ? s.color : hexA(s.color, 0.35);
        ctx.beginPath(); ctx.arc(hx, hy, C * 0.42, 0, 6.283); ctx.fill();
        ctx.restore();
        // eyes look where it is heading
        const [dx, dy] = s.dir, ex = -dy, ey = dx;
        ctx.fillStyle = '#0b0b0e';
        [1, -1].forEach(sg => { ctx.beginPath(); ctx.arc(hx + dx * C * 0.14 + ex * sg * C * 0.16, hy + dy * C * 0.14 + ey * sg * C * 0.16, C * 0.075, 0, 6.283); ctx.fill(); });
      }

      function draw(k) {
        v.begin();
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(0, 0, W, H, 22); else ctx.rect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        for (let x = 1; x < COLS; x++) for (let y = 1; y < ROWS; y++) ctx.fillRect(x * C - 1, y * C - 1, 2, 2);
        foods.forEach(f => {
          const x = (f.x + 0.5) * C, y = (f.y + 0.5) * C, pulse = 1 + 0.15 * Math.sin((t - f.born) * 6), grow = Math.min(1, (t - f.born) * 4);
          const g = ctx.createRadialGradient(x, y, 0, x, y, C * 1.1 * pulse);
          g.addColorStop(0, hexA(f.hue, 0.55)); g.addColorStop(1, hexA(f.hue, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, C * 1.1 * pulse, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, C * 0.2 * grow, 0, 6.283); ctx.fill();
          ctx.strokeStyle = f.hue; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, C * 0.3 * pulse * grow, 0, 6.283); ctx.stroke();
        });
        snakes.forEach(s => drawSnake(s, k));
        ctx.globalCompositeOperation = 'lighter';
        sparks.forEach(s => { ctx.fillStyle = hexA(s.c, Math.min(1, s.life * 2)); ctx.fillRect(s.x - 2, s.y - 2, 4, 4); });
        ctx.globalCompositeOperation = 'source-over';
        if (countdown > 0) {
          const n = Math.ceil(countdown / 0.8), f = (countdown % 0.8) / 0.8;
          ctx.fillStyle = `rgba(255,255,255,${0.15 + f * 0.6})`;
          ctx.font = `900 ${Math.round(140 + (1 - f) * 40)}px Unbounded, "Arial Black", sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(n, W / 2, H / 2);
        }
      }

      let lastCount = 4;
      api.loop(dt => {
        t += dt;
        if (countdown > 0) {
          countdown -= dt;
          const n = Math.ceil(countdown / 0.8);
          if (n !== lastCount && n > 0) { lastCount = n; api.sfx('tick'); }
          if (countdown <= 0) api.sfx('go');
        } else if (!over) {
          acc += dt * 1000;
          while (acc >= tick && !over) { acc -= tick; step(); }
        }
        sparks.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; });
        for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
        draw(over || countdown > 0 ? 1 : P.clamp(acc / tick, 0, 1));
      });
    }
  });
})();
