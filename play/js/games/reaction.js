(function () {
  'use strict';
  const P = window.Play, { el, esc } = P;

  P.register({
    id: 'reaction', title: 'Реакция', kicker: 'Скорость', players: '1–2 игрока',
    glow: ['#ffd23f', '#ff7a1a', '#ff3d7f'],
    rules: 'Ждите, пока экран не вспыхнет, и жмите свою кнопку. Кто первый, тот и забрал очко. Нажал до сигнала, значит фальстарт и очко сопернику. Играем до трёх.',
    modes: [
      { id: 'duo', label: 'Дуэль', slots: ['Слева (клавиша A)', 'Справа (клавиша L)'],
        keys: [[['A'], 'левый игрок'], [['L'], 'правый игрок'], [['Тап'], 'по своей половине экрана']] },
      { id: 'solo', label: 'Один на время', slots: ['Игрок'],
        keys: [[['Пробел'], 'или любая клавиша'], [['Тап'], 'по экрану']] }
    ],

    create(api) {
      const duo = api.mode === 'duo', players = api.players;
      const root = el('div', 'rx ' + (duo ? 'rx-duo' : 'rx-solo'));
      root.dataset.state = 'ready';
      const side = (p, i) => `<button type="button" class="rx-side" data-side="${i}" style="--c:${p.color}">
        <span class="rx-name">${esc(p.name)}</span>
        <span class="rx-key"><kbd>${i ? 'L' : 'A'}</kbd><span class="micro">или тап сюда</span></span>
        <span class="rx-dots"><i></i><i></i><i></i></span>
        <span class="rx-ms micro">&nbsp;</span></button>`;
      const center = '<div class="rx-center"><p class="rx-signal">Готовы?</p><p class="rx-sub micro">&nbsp;</p></div>';
      root.innerHTML = duo ? side(players[0], 0) + center + side(players[1], 1)
        : `<button type="button" class="rx-pad" style="--c:${players[0].color}">${center}<span class="rx-tries"></span></button>`;
      api.stage.appendChild(root);
      const $ = s => root.querySelector(s);
      const signal = $('.rx-signal'), sub = $('.rx-sub');

      let state = 'ready', t0 = 0, timer = 0;
      const score = [0, 0], NEED = 3, TRIES = 5, tries = [];

      const set = (s, big, small) => {
        state = s; root.dataset.state = s; signal.textContent = big; sub.textContent = small || '\u00a0';
        signal.classList.toggle('long', big.length > 7);
      };
      const hud = () => {
        if (duo) api.hud(players.map((p, i) => ({ name: p.name, color: p.color, value: score[i] })));
        else {
          const best = P.store.bestOf('reaction', players[0].id);
          api.hud([{ name: 'Попытка', value: Math.min(tries.length + 1, TRIES) + ' / ' + TRIES }, { name: 'Рекорд', value: best ? best + ' мс' : '—' }]);
        }
      };
      hud();

      function next() {
        set('ready', duo ? 'Приготовились' : 'Приготовься', duo ? 'первый до трёх очков' : 'попытка ' + (tries.length + 1) + ' из ' + TRIES);
        api.after(1000, arm);
      }
      function arm() {
        set('wait', 'Ждём…', 'не жми раньше сигнала');
        timer = api.after(P.rand(1300, 4300), go);
      }
      function go() {
        set('go', 'Жми!', '');
        t0 = performance.now();
        requestAnimationFrame(ts => { if (state === 'go') t0 = ts; });
        api.sfx('go');
      }

      function press(i, stamp) {
        if (state === 'wait') {
          clearTimeout(timer);
          api.sfx('bad');
          if (duo) award(1 - i, 'Фальстарт: ' + players[i].name);
          else { set('result', 'Рано!', 'попытка не засчитана'); api.after(1100, next); }
          return;
        }
        if (state !== 'go') return;
        const ms = Math.max(1, Math.round((stamp || performance.now()) - t0));
        if (duo) {
          root.querySelectorAll('.rx-ms')[i].textContent = ms + ' мс';
          award(i, ms + ' мс');
        } else {
          tries.push(ms);
          $('.rx-tries').innerHTML = tries.map(x => `<span>${x}<small> мс</small></span>`).join('');
          api.sfx('score');
          if (tries.length >= TRIES) {
            const avg = Math.round(tries.reduce((a, b) => a + b, 0) / tries.length);
            set('result', avg + ' мс', 'среднее из пяти');
            api.end({ solo: true, player: players[0], value: avg, lower: true, fmt: x => x + ' мс', line: 'среднее из пяти, лучшая ' + Math.min.apply(null, tries) + ' мс' });
          } else { set('result', ms + ' мс', verdict(ms)); hud(); api.after(1200, next); }
        }
      }

      function award(i, why) {
        score[i]++;
        set('result', players[i].name, why);
        const sideEl = root.querySelectorAll('.rx-side')[i];
        sideEl.classList.add('won');
        sideEl.querySelectorAll('.rx-dots i').forEach((d, k) => d.classList.toggle('on', k < score[i]));
        api.after(900, () => sideEl.classList.remove('won'));
        const r = sideEl.getBoundingClientRect();
        api.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 40, colors: [players[i].color, '#ffffff'], power: 0.7 });
        api.sfx('score'); hud();
        if (score[i] >= NEED) api.end({ winners: [players[i]], line: score[0] + ' : ' + score[1] });
        else api.after(1500, next);
      }

      const verdict = ms => ms < 200 ? 'кошачья реакция' : ms < 260 ? 'очень быстро' : ms < 330 ? 'неплохо' : 'можно бодрее';

      api.key(e => {
        if (e.repeat) return;
        if (duo) {
          if (e.code === 'KeyA') press(0, e.timeStamp);
          else if (e.code === 'KeyL') press(1, e.timeStamp);
        } else if (!e.metaKey && !e.ctrlKey && e.key !== 'Escape' && e.key !== 'Tab') { e.preventDefault(); press(0, e.timeStamp); }
      });
      root.querySelectorAll(duo ? '.rx-side' : '.rx-pad').forEach(b => {
        api.on(b, 'pointerdown', e => { e.preventDefault(); if (api.playing) press(duo ? +b.dataset.side : 0, e.timeStamp); });
        api.on(b, 'keydown', e => { if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });
      });

      api.after(500, next);
    }
  });
})();
