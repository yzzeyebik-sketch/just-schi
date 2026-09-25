(function () {
  'use strict';
  const P = window.Play, hexA = P.hexA;

  const COLS = 7, ROWS = 6, S = 96, PAD = 22, TOP = 112;
  const BW = COLS * S + PAD * 2, BH = ROWS * S + PAD * 2, W = BW, H = TOP + BH;
  const DR = S * 0.4, HR = S * 0.43;
  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  const cx = c => PAD + c * S + S / 2, cy = r => TOP + PAD + r * S + S / 2;

  // every group of four cells that can make a line
  const WINDOWS = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    [[0, 1], [1, 0], [1, 1], [1, -1]].forEach(([dr, dc]) => {
      const er = r + dr * 3, ec = c + dc * 3;
      if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) return;
      WINDOWS.push([0, 1, 2, 3].map(k => (r + dr * k) * COLS + c + dc * k));
    });
  }
  const rowFor = (b, c) => { for (let r = ROWS - 1; r >= 0; r--) if (!b[r * COLS + c]) return r; return -1; };
  function lineAt(b, i) {
    const r = (i / COLS) | 0, c = i % COLS, who = b[i];
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [i];
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr * COLS + cc] === who) { cells.push(rr * COLS + cc); rr += dr * s; cc += dc * s; }
      }
      if (cells.length >= 4) return cells;
    }
    return null;
  }

  // ---------- bot: negamax with alpha-beta ----------
  const WIN = 1e6;
  function evaluate(b, me) {
    const op = 3 - me; let s = 0;
    for (let r = 0; r < ROWS; r++) { const v = b[r * COLS + 3]; if (v === me) s += 3; else if (v === op) s -= 3; }
    for (let w = 0; w < WINDOWS.length; w++) {
      const win = WINDOWS[w]; let m = 0, o = 0;
      for (let k = 0; k < 4; k++) { const v = b[win[k]]; if (v === me) m++; else if (v === op) o++; }
      if (m && o) continue;
      if (m === 3) s += 6; else if (m === 2) s += 2;
      if (o === 3) s -= 8; else if (o === 2) s -= 2;
    }
    return s;
  }
  function negamax(b, depth, alpha, beta, who, last, filled) {
    if (last >= 0 && lineAt(b, last)) return -(WIN + depth);
    if (filled === ROWS * COLS) return 0;
    if (depth === 0) return evaluate(b, who);
    for (const c of ORDER) {
      const r = rowFor(b, c); if (r < 0) continue;
      const i = r * COLS + c;
      b[i] = who;
      const v = -negamax(b, depth - 1, -beta, -alpha, 3 - who, i, filled + 1);
      b[i] = 0;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return alpha;
  }
  function bestMove(board, me, depth) {
    const b = board.slice(), filled = b.filter(Boolean).length, scores = [];
    let best = -Infinity;
    for (const c of ORDER) {
      const r = rowFor(b, c); if (r < 0) continue;
      const i = r * COLS + c;
      b[i] = me;
      const v = -negamax(b, depth - 1, -Infinity, Infinity, 3 - me, i, filled + 1);
      b[i] = 0;
      scores.push([c, v]); if (v > best) best = v;
    }
    const good = scores.filter(([, v]) => v >= best - 1);
    return P.pick(good)[0];
  }

  // colour helpers for the glossy discs
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = x => Math.round(k >= 0 ? x + (255 - x) * k : x * (1 + k));
    return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
  }

  P.register({
    id: 'four', title: 'Четыре в ряд', kicker: 'Тактика', players: '1–2 игрока',
    glow: ['#8a6bff', '#ff3d7f', '#5fd4ff'],
    rules: 'Ходите по очереди и роняйте фишки в столбцы. Первый, кто выстроит четыре своих подряд по горизонтали, вертикали или диагонали, забирает партию.',
    modes: [
      { id: 'duo', label: 'Вдвоём', slots: ['Первый цвет', 'Второй цвет'],
        keys: [[['←', '→'], 'выбрать столбец'], [['↓', 'Пробел'], 'бросить фишку'], [['1', '…', '7'], 'сразу в столбец'], [['Клик'], 'или тап по столбцу']] },
      { id: 'cpu', label: 'Против бота', slots: ['Игрок'], bot: true,
        keys: [[['←', '→'], 'выбрать столбец'], [['↓', 'Пробел'], 'бросить фишку'], [['Клик'], 'или тап по столбцу']] }
    ],

    create(api) {
      const v = api.canvas(W, H), ctx = v.ctx;
      const players = api.players.map((p, i) => {
        // two players with the same colour would be unreadable
        if (i === 1 && p.color === api.players[0].color) return Object.assign({}, p, { color: p.color === '#8a6bff' ? '#ff7a1a' : '#8a6bff' });
        return p;
      });
      const board = new Array(ROWS * COLS).fill(0);
      const discs = [];
      let turn = api.round % 2, col = 3, hx = cx(3), busy = false, over = false, win = null, t = 0, moves = 0, nudge = 0;

      const human = () => !players[turn].bot;
      const hud = () => api.hud(players.map((p, i) => ({ name: p.name, color: p.color, value: i === turn && !over ? 'ходит' : '', active: i === turn && !over })));
      hud();

      function drop(c) {
        if (busy || over) return;
        const r = rowFor(board, c);
        if (r < 0) { nudge = 1; api.sfx('bad'); return; }
        col = c;
        board[r * COLS + c] = turn + 1;
        discs.push({ c, r, y: TOP / 2, vy: 0, who: turn, hit: false, done: false });
        busy = true; moves++;
        api.sfx('whoosh');
      }

      function landed(d) {
        busy = false;
        const i = d.r * COLS + d.c, line = lineAt(board, i);
        if (line) {
          over = true; win = line; hud();
          const mx = line.reduce((s, k) => s + cx(k % COLS), 0) / 4, my = line.reduce((s, k) => s + cy((k / COLS) | 0), 0) / 4;
          const at = v.toClient(mx, my);
          api.burst(at.x, at.y, { count: 90, colors: [players[d.who].color, '#ffffff', '#ffd23f'] });
          api.sfx('score');
          api.end({ winners: [players[d.who]], line: 'за ' + Math.ceil(moves / 2) + ' ' + P.plural(Math.ceil(moves / 2), 'ход', 'хода', 'ходов') });
          return;
        }
        if (moves === ROWS * COLS) { over = true; hud(); api.end({ winners: [], title: 'Поле забито', line: 'Никто не собрал четыре' }); return; }
        turn = 1 - turn; hud();
        if (!human()) api.after(420, botMove);
      }

      function botMove() {
        if (over) return;
        const c = bestMove(board, turn + 1, 5);
        col = c;
        api.after(260, () => drop(c));
      }
      if (!human()) api.after(700, botMove);

      const colAt = e => {
        const q = v.toLocal(e.clientX, e.clientY);
        return P.clamp(Math.floor((q.x - PAD) / S), 0, COLS - 1);
      };
      api.on(v.el, 'pointermove', e => { if (human() && !over) col = colAt(e); });
      api.on(v.el, 'pointerdown', e => { if (!human() || over || busy) return; col = colAt(e); drop(col); });
      api.key(e => {
        if (!human() || over) return;
        if (e.key === 'ArrowLeft') { col = (col + COLS - 1) % COLS; api.sfx('soft'); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { col = (col + 1) % COLS; api.sfx('soft'); e.preventDefault(); }
        else if (e.key === 'ArrowDown' || ((e.key === ' ' || e.key === 'Enter') && !e.target.closest('button'))) { e.preventDefault(); drop(col); }
        else if (/^[1-7]$/.test(e.key)) { e.preventDefault(); drop(+e.key - 1); }
      });

      function disc(x, y, color, alpha) {
        ctx.globalAlpha = alpha == null ? 1 : alpha;
        const g = ctx.createRadialGradient(x - DR * 0.35, y - DR * 0.45, DR * 0.08, x, y, DR);
        g.addColorStop(0, shade(color, 0.55)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.45));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, DR, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, DR * 0.7, 0, 6.283); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, DR * 0.86, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      function draw() {
        v.begin(nudge ? Math.sin(t * 60) * nudge * 6 : 0, 0);
        // hover disc and column glow
        if (!over && !busy) {
          const p = players[turn];
          disc(hx, TOP / 2 + Math.sin(t * 4) * 4, p.color, human() ? 0.95 : 0.6);
        }
        // discs sit behind the glass board
        discs.forEach(d => disc(cx(d.c), d.y, players[d.who].color));
        // board with holes
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(0, TOP, BW, BH, 30); else ctx.rect(0, TOP, BW, BH);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { ctx.moveTo(cx(c) + HR, cy(r)); ctx.arc(cx(c), cy(r), HR, 0, 6.283); }
        const g = ctx.createLinearGradient(0, TOP, BW, H);
        g.addColorStop(0, 'rgba(46,46,58,0.86)'); g.addColorStop(1, 'rgba(18,18,24,0.9)');
        ctx.fillStyle = g; ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { ctx.beginPath(); ctx.arc(cx(c), cy(r), HR, 0, 6.283); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(1, TOP + 1, BW - 2, BH - 2, 29); else ctx.rect(1, TOP + 1, BW - 2, BH - 2); ctx.stroke();
        // column highlight
        if (!over && !busy && human()) {
          const lg = ctx.createLinearGradient(0, TOP, 0, H);
          lg.addColorStop(0, hexA(players[turn].color, 0.2)); lg.addColorStop(1, hexA(players[turn].color, 0));
          ctx.fillStyle = lg; ctx.fillRect(PAD + col * S + 6, TOP + 6, S - 12, BH - 12);
        }
        // winning line
        if (win) {
          const pulse = 0.6 + 0.4 * Math.sin(t * 6);
          const pts = win.map(k => [cx(k % COLS), cy((k / COLS) | 0)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          ctx.save();
          ctx.shadowColor = '#fff'; ctx.shadowBlur = 24 * pulse;
          ctx.strokeStyle = `rgba(255,255,255,${0.7 * pulse + 0.3})`; ctx.lineWidth = 5;
          pts.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, DR + 5, 0, 6.283); ctx.stroke(); });
          ctx.lineCap = 'round'; ctx.lineWidth = 8;
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); ctx.stroke();
          ctx.restore();
        }
      }

      api.loop(dt => {
        t += dt;
        nudge = Math.max(0, nudge - dt * 4);
        hx += (cx(col) - hx) * (1 - Math.exp(-dt * 18));
        discs.forEach(d => {
          if (d.done) return;
          d.vy += 4200 * dt; d.y += d.vy * dt;
          const ty = cy(d.r);
          if (d.y >= ty) {
            d.y = ty;
            if (d.vy > 520) { d.vy = -d.vy * 0.3; api.sfx(d.hit ? 'bounce' : 'drop'); d.hit = true; }
            else { d.vy = 0; d.done = true; landed(d); }
          }
        });
        draw();
      });
    }
  });
})();
