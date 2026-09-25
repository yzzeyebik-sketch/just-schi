(function () {
  'use strict';
  const P = window.Play, { el, esc } = P;

  // twelve glyphs, each with its own two-colour gradient
  const GLYPHS = [
    '<circle cx="50" cy="50" r="30"/>',
    '<circle cx="50" cy="50" r="26" fill="none" stroke-width="14"/>',
    '<rect x="22" y="22" width="56" height="56" rx="10"/>',
    '<path d="M50 12 88 50 50 88 12 50z"/>',
    '<path d="M50 14 90 82H10z"/>',
    '<path d="M50 10l11.8 24 26.4 3.8-19.1 18.6 4.5 26.3L50 70.3 26.4 82.7l4.5-26.3L11.8 37.8 38.2 34z"/>',
    '<path d="M39 12h22v27h27v22H61v27H39V61H12V39h27z"/>',
    '<path d="M50 10 85 30v40L50 90 15 70V30z"/>',
    '<path d="M60 12a38 38 0 1 0 28 60A32 32 0 1 1 60 12z"/>',
    '<path d="M58 8 20 56h26l-6 36 40-50H54z"/>',
    '<path d="M50 86 18 55a19 19 0 0 1 32-26 19 19 0 0 1 32 26z"/>',
    '<path d="M50 12v76M17 31l66 38M17 69l66-38" fill="none" stroke-width="13" stroke-linecap="round"/>'
  ];
  const GRADS = [['#ffd23f', '#ff7a1a'], ['#ff3d7f', '#8a6bff'], ['#5fd4ff', '#8a6bff'], ['#4dffb0', '#5fd4ff'], ['#ff7a1a', '#ff3d7f'], ['#ffd23f', '#ff3d7f'],
    ['#8a6bff', '#5fd4ff'], ['#4dffb0', '#ffd23f'], ['#e9e7e2', '#8a6bff'], ['#ffd23f', '#4dffb0'], ['#ff3d7f', '#ff7a1a'], ['#5fd4ff', '#e9e7e2']];
  const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' + GRADS.map((g, i) =>
    `<linearGradient id="mg${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/></linearGradient>`).join('') + '</defs></svg>';
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5"/></svg>';

  P.register({
    id: 'memory', title: 'Мемори', kicker: 'Память', players: '1–2 игрока',
    glow: ['#5fd4ff', '#8a6bff', '#4dffb0'],
    rules: 'Открывай по две карточки. Совпали, значит пара твоя и ты ходишь снова. Не совпали, карточки закрываются и ход переходит. У кого больше пар, тот и выиграл.',
    modes: [
      { id: 'duo', label: 'Вдвоём', slots: ['Первый ходит', 'Второй'], keys: [[['Клик'], 'или тап по карточке'], [['←', '↑', '→', '↓'], 'двигаться по полю'], [['Пробел'], 'открыть']] },
      { id: 'solo', label: 'Один на ходы', slots: ['Игрок'], keys: [[['Клик'], 'или тап по карточке'], [['←', '↑', '→', '↓'], 'двигаться по полю'], [['Пробел'], 'открыть']] }
    ],
    options: [{ id: 'size', label: 'Поле', values: [['4x4', '4 × 4, восемь пар'], ['6x4', '6 × 4, двенадцать пар']], def: '6x4' }],

    create(api) {
      const duo = api.mode === 'duo', players = api.players;
      let [cols, rows] = api.opts.size.split('x').map(Number);
      const box = api.stage.getBoundingClientRect();
      if (box.height > box.width && cols > rows) [cols, rows] = [rows, cols];
      const pairs = cols * rows / 2;
      const deck = P.shuffle(P.shuffle([...Array(GLYPHS.length).keys()]).slice(0, pairs).flatMap(g => [g, g]));

      const root = el('div', 'mem');
      root.innerHTML = DEFS + deck.map((g, i) => `<button type="button" class="mem-card" data-i="${i}" style="--i:${i};--c:${GRADS[g][0]}" aria-label="Карточка ${i + 1}">
        <span class="mem-inner"><span class="mem-back">${STAR}</span><span class="mem-front"><svg viewBox="0 0 100 100" aria-hidden="true" fill="url(#mg${g})" stroke="url(#mg${g})">${GLYPHS[g]}</svg></span></span></button>`).join('');
      api.stage.appendChild(root);
      const cards = [...root.querySelectorAll('.mem-card')];

      function fit() {
        const r = api.stage.getBoundingClientRect();
        const gap = r.width < 520 ? 8 : 12;
        const w = Math.floor(Math.min((r.width - gap * (cols - 1)) / cols, ((r.height - gap * (rows - 1)) / rows) * 0.8));
        root.style.gap = gap + 'px';
        root.style.gridTemplateColumns = `repeat(${cols}, ${w}px)`;
        root.style.gridAutoRows = Math.floor(w / 0.8) + 'px';
      }
      fit(); api.on(window, 'resize', fit);

      let open = [], lock = false, turn = duo ? api.round % 2 : 0, moves = 0, found = 0, started = 0, lastSec = -1;
      const score = [0, 0];
      const clock = () => { const s = started ? Math.floor((performance.now() - started) / 1000) : 0; return Math.floor(s / 60) + ':' + P.pad2(s % 60); };
      const hud = () => {
        if (duo) api.hud(players.map((p, i) => ({ name: p.name, color: p.color, value: score[i], active: i === turn && found < pairs })));
        else api.hud([{ name: 'Ходы', value: moves }, { name: 'Пары', value: found + ' / ' + pairs }, { name: 'Время', value: clock() }]);
      };
      hud();

      function flip(i) {
        const c = cards[i];
        if (lock || c.classList.contains('open') || c.classList.contains('matched')) return;
        if (!started) started = performance.now();
        c.classList.add('open'); c.setAttribute('aria-label', 'Открыта'); api.sfx('flip');
        open.push(i);
        if (open.length < 2) return;
        moves++;
        const [a, b] = open;
        if (deck[a] === deck[b]) {
          open = []; found++; score[turn]++;
          [a, b].forEach(k => { cards[k].classList.remove('open'); cards[k].classList.add('matched'); cards[k].setAttribute('aria-label', 'Пара найдена'); });
          const r = cards[b].getBoundingClientRect();
          api.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 28, colors: [...GRADS[deck[a]], '#ffffff'], power: 0.55 });
          api.sfx('score');
          if (found === pairs) finish();
        } else {
          lock = true;
          api.after(850, () => {
            [a, b].forEach(k => { cards[k].classList.remove('open'); cards[k].setAttribute('aria-label', 'Карточка ' + (k + 1)); });
            open = []; lock = false;
            if (duo) turn = 1 - turn;
            hud();
          });
        }
        hud();
      }

      function finish() {
        lock = true;
        if (!duo) {
          // 6×4 is the headline record; the small board keeps its own
          api.end({ solo: true, key: api.opts.size === '6x4' ? 'memory' : 'memory-4x4', player: players[0], value: moves, lower: true, fmt: v => v + ' ' + P.plural(v, 'ход', 'хода', 'ходов'), line: 'за ' + clock() });
          return;
        }
        const w = score[0] === score[1] ? [] : [players[score[0] > score[1] ? 0 : 1]];
        api.end({ winners: w, line: score[0] + ' : ' + score[1] + ' ' + P.plural(Math.max(score[0], score[1]), 'пара', 'пары', 'пар') });
      }

      cards.forEach((c, i) => api.on(c, 'click', () => { if (api.playing) flip(i); }));
      api.key(e => {
        const i = cards.indexOf(document.activeElement);
        const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
        if (move == null) return;
        e.preventDefault();
        const n = i < 0 ? 0 : P.clamp(i + move, 0, cards.length - 1);
        cards[n].focus();
      });
      api.loop(() => {
        if (duo || !started || found === pairs) return;
        const s = Math.floor((performance.now() - started) / 1000);
        if (s !== lastSec) { lastSec = s; hud(); }
      });
    }
  });
})();
