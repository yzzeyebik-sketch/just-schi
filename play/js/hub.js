(function () {
  'use strict';
  const P = window.Play, { $, $$, el, esc, store, hexA } = P;
  const GAMES = ['pong', 'four', 'reaction', 'memory', 'snake', 'croc'];

  // ---------- header ----------
  const top = $('#top');
  const onScroll = () => top.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // ---------- sound toggles (header + arena) ----------
  const syncSound = () => $$('.sound-toggle').forEach(b => {
    b.setAttribute('aria-pressed', String(P.sound.on));
    b.setAttribute('aria-label', P.sound.on ? 'Выключить звук' : 'Включить звук');
  });
  $$('.sound-toggle').forEach(b => b.addEventListener('click', () => P.sound.toggle()));

  // ---------- game cards ----------
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  $$('.game').forEach(card => {
    const glass = card.querySelector('.game-glass');
    glass.setAttribute('aria-label', 'Играть: ' + card.querySelector('.g-title').textContent.replace(/\.$/, ''));
    glass.addEventListener('click', () => { P.sound.play('tap'); P.arena.open(card.dataset.game, card); });
    if (!fine || P.reduced) return;
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.classList.add('tilting');
      card.style.transform = `perspective(1000px) rotateX(${((0.5 - y) * 7).toFixed(2)}deg) rotateY(${((x - 0.5) * 9).toFixed(2)}deg)`;
      glass.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      glass.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    });
    card.addEventListener('pointerleave', () => { card.classList.remove('tilting'); card.style.transform = ''; });
  });

  addEventListener('keydown', e => {
    if (P.arena.state !== 'closed' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const card = $(`.game[data-key="${e.key}"]`);
    if (card) { e.preventDefault(); P.sound.play('tap'); P.arena.open(card.dataset.game, card); }
  });

  const SOLO = {
    reaction: { lower: true, fmt: v => v + ' мс' },
    snake: { lower: false, fmt: v => v + ' ' + P.plural(v, 'огонёк', 'огонька', 'огоньков') },
    memory: { lower: true, fmt: v => v + ' ' + P.plural(v, 'ход', 'хода', 'ходов') }
  };
  function renderLeaders() {
    $$('.game').forEach(card => {
      const id = card.dataset.game, slot = card.querySelector('[data-leader]');
      const L = store.leader(id), solo = SOLO[id], best = solo && store.top(id, solo.lower);
      slot.textContent = L ? `лидер: ${L.player.name} ×${L.wins}` : best ? `рекорд: ${solo.fmt(best.value)}, ${best.player.name}` : 'клавиша ' + card.dataset.key;
    });
  }

  // ---------- hero stats ----------
  const statPlayers = $('#stat-players'), statPlayed = $('#stat-played');
  function renderStats() {
    statPlayers.textContent = P.pad2(store.players().length);
    statPlayed.textContent = P.pad2(store.data.played);
  }

  // ---------- roster ----------
  const list = $('#roster'), form = $('#roster-form'), input = $('#roster-name');
  const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  function renderRoster() {
    const ps = store.players(), seen = new Set();
    ps.forEach(p => {
      seen.add(p.id);
      let li = list.querySelector(`[data-id="${p.id}"]`);
      if (!li) {
        li = el('li', 'roster-item');
        li.dataset.id = p.id;
        li.innerHTML = `<button type="button" class="swatch" data-act="color"></button>
          <input class="roster-name" id="rn-${p.id}" maxlength="18" autocomplete="off" spellcheck="false">
          <span class="micro roster-wins"></span>
          <button type="button" class="roster-del" data-act="del">${X}</button>`;
        list.appendChild(li);
      }
      const w = store.winsOf(p.id), inp = li.querySelector('.roster-name');
      li.querySelector('.swatch').style.setProperty('--c', p.color);
      li.querySelector('.swatch').setAttribute('aria-label', 'Сменить цвет, игрок ' + p.name);
      if (document.activeElement !== inp) inp.value = p.name;
      inp.setAttribute('aria-label', 'Имя игрока ' + p.name);
      li.querySelector('.roster-wins').textContent = w + ' ' + P.plural(w, 'победа', 'победы', 'побед');
      const del = li.querySelector('.roster-del');
      del.disabled = ps.length <= 1;
      del.setAttribute('aria-label', 'Убрать игрока ' + p.name);
    });
    list.querySelectorAll('.roster-item').forEach(li => { if (!seen.has(li.dataset.id)) li.remove(); });
    $('#roster-count').textContent = ps.length + ' / 12';
    const full = ps.length >= 12;
    form.querySelectorAll('button').forEach(b => { b.disabled = full; });
    input.disabled = full;
    input.placeholder = full ? 'Состав заполнен' : 'Имя друга';
  }
  list.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.closest('.roster-item').dataset.id;
    if (b.dataset.act === 'color') { store.recolor(id); P.sound.play('soft'); }
    if (b.dataset.act === 'del') { store.remove(id); P.sound.play('whoosh'); }
  });
  list.addEventListener('change', e => {
    if (!e.target.classList.contains('roster-name')) return;
    store.rename(e.target.closest('.roster-item').dataset.id, e.target.value);
  });
  list.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('roster-name')) e.target.blur(); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (store.add(input.value)) { P.sound.play('tap'); input.value = ''; }
  });
  $('#roster-random').addEventListener('click', () => { if (store.add(P.nick())) P.sound.play('tap'); });

  // ---------- roulette ----------
  const wheel = $('#wheel'), wx = wheel.getContext('2d'), wres = $('#wheel-result'), spinBtn = $('#wheel-spin');
  let angle = 0, spinning = false;
  const TAU = Math.PI * 2;
  const segAt = (n) => Math.floor((((-angle) % TAU) + TAU) % TAU / (TAU / n)) % n;
  function sizeWheel() {
    const r = wheel.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2), s = Math.round(r.width * d);
    if (s > 0 && wheel.width !== s) { wheel.width = s; wheel.height = s; }
    drawWheel();
  }
  function drawWheel() {
    const ps = store.players(), n = ps.length, S = wheel.width, c = S / 2, R = c * 0.94, seg = TAU / n;
    wx.clearRect(0, 0, S, S);
    // soft halo
    const halo = wx.createRadialGradient(c, c, R * 0.8, c, c, c);
    halo.addColorStop(0, 'rgba(255,255,255,0.06)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
    wx.fillStyle = halo; wx.fillRect(0, 0, S, S);
    const fs = Math.round(S * (n > 8 ? 0.032 : n > 5 ? 0.038 : 0.044));
    for (let i = 0; i < n; i++) {
      const a0 = angle + i * seg - Math.PI / 2, a1 = a0 + seg, p = ps[i];
      const g = wx.createRadialGradient(c, c, R * 0.15, c, c, R);
      g.addColorStop(0, hexA(p.color, 0.08)); g.addColorStop(0.7, hexA(p.color, 0.5)); g.addColorStop(1, hexA(p.color, 0.9));
      wx.fillStyle = g;
      wx.beginPath(); wx.moveTo(c, c); wx.arc(c, c, R, a0, a1); wx.closePath(); wx.fill();
      if (n > 1) { wx.strokeStyle = 'rgba(6,6,7,0.85)'; wx.lineWidth = S * 0.007; wx.stroke(); }
      // labels on the left half are turned over so they never read upside down
      const mid = a0 + seg / 2, flip = Math.cos(mid) < 0;
      wx.save(); wx.translate(c, c); wx.rotate(flip ? mid + Math.PI : mid);
      wx.textAlign = flip ? 'left' : 'right'; wx.textBaseline = 'middle'; wx.fillStyle = '#ffffff';
      wx.font = `600 ${fs}px Onest, "Helvetica Neue", Arial, sans-serif`;
      let name = p.name; while (name.length > 3 && wx.measureText(name).width > R * 0.62) name = name.slice(0, -2) + '…';
      wx.shadowColor = 'rgba(0,0,0,0.6)'; wx.shadowBlur = S * 0.01;
      wx.fillText(name, flip ? -R * 0.9 : R * 0.9, 0);
      wx.restore();
    }
    wx.strokeStyle = 'rgba(255,255,255,0.28)'; wx.lineWidth = S * 0.006;
    wx.beginPath(); wx.arc(c, c, R, 0, TAU); wx.stroke();
    // chrome hub with the asterisk mark
    const hr = R * 0.17, hg = wx.createLinearGradient(0, c - hr, 0, c + hr);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.45, '#c4c6cd'); hg.addColorStop(0.52, '#3e3f46'); hg.addColorStop(1, '#e7e8eb');
    wx.fillStyle = hg; wx.beginPath(); wx.arc(c, c, hr, 0, TAU); wx.fill();
    wx.save(); wx.translate(c, c); wx.rotate(angle);
    wx.strokeStyle = '#0b0b0e'; wx.lineWidth = hr * 0.18; wx.lineCap = 'round';
    for (let k = 0; k < 3; k++) { wx.rotate(Math.PI / 3); wx.beginPath(); wx.moveTo(0, -hr * 0.55); wx.lineTo(0, hr * 0.55); wx.stroke(); }
    wx.restore();
  }
  spinBtn.addEventListener('click', () => {
    const ps = store.players(); if (spinning || !ps.length) return;
    spinning = true; spinBtn.disabled = true;
    const n = ps.length, seg = TAU / n, pick = Math.floor(Math.random() * n);
    let target = -(pick + 0.5) * seg + (Math.random() - 0.5) * seg * 0.7;
    const floor = angle + TAU * (5 + Math.floor(Math.random() * 2));
    target += Math.ceil((floor - target) / TAU) * TAU;
    const from = angle, dur = P.reduced ? 700 : 4600, t0 = performance.now();
    let last = segAt(n);
    wres.textContent = 'Крутится…';
    P.sound.play('whoosh');
    const frame = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      angle = from + (target - from) * e;
      const s = segAt(n); if (s !== last) { last = s; P.sound.play('tick'); }
      drawWheel();
      if (k < 1) { requestAnimationFrame(frame); return; }
      angle %= TAU;
      const p = ps[pick];
      wres.innerHTML = `Выпало: <b style="color:${p.color}">${esc(p.name)}</b>`;
      const r = wheel.getBoundingClientRect();
      P.fx.burst(r.left + r.width / 2, r.top + r.height * 0.08, { count: 70, colors: [p.color, '#ffffff', '#ffd23f'] });
      P.sound.play('win');
      spinning = false; spinBtn.disabled = false;
    };
    requestAnimationFrame(frame);
  });
  addEventListener('resize', sizeWheel);

  // ---------- records ----------
  const tbody = $('#board tbody'), bestRow = $('#best-row');
  const TILES = [
    { g: 'reaction', label: 'Реакция / лучшее среднее', lower: true, unit: () => 'мс' },
    { g: 'snake', label: 'Змейка / больше всего огоньков', lower: false, unit: () => '' },
    { g: 'memory', label: 'Мемори 6 × 4 / меньше всего ходов', lower: true, unit: v => P.plural(v, 'ход', 'хода', 'ходов') }
  ];
  function renderBoard() {
    const rows = store.players().map(p => ({ p, total: store.winsOf(p.id), per: GAMES.map(g => store.winsOf(p.id, g)) }));
    const bot = store.winsOf('bot');
    if (bot) rows.push({ p: P.BOT, total: bot, per: GAMES.map(g => store.winsOf('bot', g)) });
    rows.sort((a, b) => b.total - a.total);
    const max = Math.max(1, ...rows.map(r => r.total));
    let h = rows.map((r, i) => `<tr class="${i === 0 && r.total ? 'first' : ''}">
      <td class="rank">${P.pad2(i + 1)}</td>
      <td class="name"><span><i class="dot" style="--c:${r.p.color}"></i>${esc(r.p.name)}</span></td>
      <td class="total"><span class="bar">${r.total ? `<i style="width:${Math.round((r.total / max) * 110)}px"></i>` : ''}${r.total}</span></td>
      ${r.per.map(n => `<td class="${n ? '' : 'zero'}">${n}</td>`).join('')}</tr>`).join('');
    if (!store.data.played) h += '<tr class="board-empty"><td colspan="9">Пока ни одной партии. Выбери игру выше, и здесь появятся победы.</td></tr>';
    tbody.innerHTML = h;
    bestRow.innerHTML = TILES.map(t => {
      const b = store.top(t.g, t.lower);
      return `<div class="panel best"><span class="micro">${t.label}</span>
        <span class="best-num${b ? '' : ' empty'}">${b ? b.value : '—'}${b && t.unit(b.value) ? `<small>${t.unit(b.value)}</small>` : ''}</span>
        <span class="best-who">${b ? `<i class="dot" style="--c:${b.player.color}"></i><span>${esc(b.player.name)}</span>` : '<span class="micro">пусто, сыграй в одиночном режиме</span>'}</span></div>`;
    }).join('');
    $('#board-note').textContent = 'Сыграно партий: ' + store.data.played;
  }
  const confirmBox = $('#board-confirm'), resetBtn = $('#board-reset');
  resetBtn.addEventListener('click', () => { confirmBox.hidden = false; resetBtn.hidden = true; $('#board-no').focus(); });
  $('#board-no').addEventListener('click', () => { confirmBox.hidden = true; resetBtn.hidden = false; resetBtn.focus(); });
  $('#board-yes').addEventListener('click', () => { store.reset(); confirmBox.hidden = true; resetBtn.hidden = false; P.sound.play('whoosh'); });

  // ---------- wire up ----------
  function renderAll() { syncSound(); renderLeaders(); renderStats(); renderRoster(); drawWheel(); renderBoard(); }
  store.on(renderAll);
  renderAll();
  sizeWheel();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawWheel);
})();
