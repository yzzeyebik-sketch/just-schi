(function () {
  'use strict';
  const P = window.Play, { el, esc } = P;

  const DECKS = {
    easy: { label: 'Лёгкие', words: ['кот', 'солнце', 'самолёт', 'зонт', 'телефон', 'мяч', 'книга', 'велосипед', 'пицца', 'часы', 'дождь', 'гитара', 'очки', 'дерево', 'ракета', 'торт', 'лампа', 'ключ', 'снеговик', 'поезд', 'рыба', 'машина', 'цветок', 'корабль', 'облако', 'радуга', 'воздушный шарик', 'замок', 'подушка', 'фотоаппарат', 'мороженое', 'звезда', 'лестница', 'зеркало', 'ножницы', 'чайник', 'робот', 'карандаш', 'бабочка', 'паук'] },
    animals: { label: 'Животные', words: ['жираф', 'пингвин', 'кенгуру', 'осьминог', 'ленивец', 'фламинго', 'крокодил', 'слон', 'змея', 'дятел', 'лягушка', 'краб', 'медуза', 'верблюд', 'панда', 'ёж', 'кролик', 'сова', 'горилла', 'дельфин', 'черепаха', 'павлин', 'бобр', 'скунс', 'хамелеон', 'страус', 'бегемот', 'летучая мышь', 'муравьед', 'морж', 'курица', 'корова', 'лебедь', 'акула', 'коала'] },
    actions: { label: 'Действия', words: ['чихать', 'танцевать', 'жонглировать', 'нырять', 'фотографировать', 'гладить бельё', 'чистить зубы', 'кататься на коньках', 'играть на барабанах', 'ловить рыбу', 'красить забор', 'открывать консервы', 'делать селфи', 'завязывать шнурки', 'качаться на качелях', 'месить тесто', 'прыгать через скакалку', 'подметать', 'зевать', 'медитировать', 'подкрадываться', 'копать', 'стрелять из лука', 'заводить машину', 'кататься на сёрфе', 'дирижировать', 'играть в боулинг', 'варить суп', 'кормить голубей', 'смотреть в телескоп'] },
    jobs: { label: 'Профессии', words: ['пожарный', 'хирург', 'дирижёр', 'пилот', 'парикмахер', 'фокусник', 'космонавт', 'сапёр', 'бариста', 'стоматолог', 'водолаз', 'скульптор', 'дрессировщик', 'официант', 'почтальон', 'футбольный судья', 'диджей', 'фотомодель', 'строитель', 'программист', 'повар', 'жонглёр', 'мим', 'рыбак', 'фермер', 'кассир', 'таксист', 'архитектор', 'клоун', 'детектив'] },
    movies: { label: 'Кино и мультики', words: ['Титаник', 'Гарри Поттер', 'Шрек', 'Король Лев', 'Человек-паук', 'Звёздные войны', 'Матрица', 'Холодное сердце', 'Пираты Карибского моря', 'Ну, погоди!', 'Властелин колец', 'Годзилла', 'Терминатор', 'Аватар', 'Кинг-Конг', 'Колобок', 'Винни-Пух', 'Маша и Медведь', 'Бэтмен', 'Корпорация монстров', 'Тачки', 'Мадагаскар', 'Чебурашка', 'Трансформеры', 'Челюсти', 'Рапунцель', 'Смешарики', 'Зверополис', 'Халк', 'Русалочка'] },
    hard: { label: 'Посложнее', words: ['вдохновение', 'ностальгия', 'дедлайн', 'дежавю', 'сарказм', 'интуиция', 'бессонница', 'гравитация', 'эхо', 'прокрастинация', 'сплетня', 'ревность', 'эволюция', 'мечта', 'отпуск', 'вайфай', 'пробка на дороге', 'аллергия', 'будильник', 'землетрясение', 'лень', 'свидание', 'экзамен', 'пароль', 'реклама', 'стартап', 'понедельник', 'икота', 'селфи-палка', 'спойлер'] }
  };
  const TEAM = { A: { name: 'Команда А', color: '#ff7a1a' }, B: { name: 'Команда Б', color: '#8a6bff' } };

  P.register({
    id: 'croc', title: 'Крокодил', kicker: 'Вечеринка', players: 'от 4 человек',
    glow: ['#ff3d7f', '#ffd23f', '#8a6bff'],
    rules: 'Один человек из команды показывает слово жестами, без звуков и букв в воздухе. Его команда угадывает, пока идёт таймер. Потом телефон переходит соперникам. Раунды идут парами, чтобы у команд было поровну попыток.',
    modes: [{ id: 'teams', label: 'Две команды', teams: true,
      keys: [[['→', 'Enter'], 'угадали'], [['←'], 'пропустить'], [['Свайп'], 'карточки вправо или влево']] }],
    options: [
      { id: 'deck', label: 'Колода', values: [['mix', 'Всё вперемешку']].concat(Object.keys(DECKS).map(k => [k, DECKS[k].label])), def: 'mix' },
      { id: 'time', label: 'Время на раунд', values: [[45, '45 секунд'], [60, '60 секунд'], [90, '90 секунд']], def: 60 },
      { id: 'to', label: 'Играем до', values: [[10, '10 слов'], [15, '15 слов'], [20, '20 слов']], def: 10 }
    ],

    create(api) {
      const teams = ['A', 'B'].map(k => ({ key: k, ...TEAM[k], members: api.teams[k], score: 0, turns: 0 }));
      const keys = api.opts.deck === 'mix' ? Object.keys(DECKS) : [api.opts.deck];
      const pool = P.shuffle(keys.flatMap(k => DECKS[k].words.map(w => ({ w, cat: DECKS[k].label }))));
      let cursor = 0, cur = api.round % 2, screen = 'pass', words = [], card = null, endAt = 0, lastTick = 0, drag = null;
      const draw = () => { if (cursor >= pool.length) { P.shuffle(pool); cursor = 0; } return pool[cursor++]; };

      const root = el('div', 'croc');
      api.stage.appendChild(root);
      const hud = () => api.hud(teams.map((t, i) => ({ name: t.name, color: t.color, value: t.score, active: i === cur })));
      hud();

      const team = () => teams[cur];
      const explainer = () => { const t = team(); return t.members[t.turns % t.members.length]; };

      function pass() {
        screen = 'pass';
        const t = team(), who = explainer();
        root.innerHTML = `<div class="croc-sheet" style="--c:${t.color}">
          <span class="micro">Раунд ${Math.min(teams[0].turns, teams[1].turns) + 1} · до ${api.opts.to} слов</span>
          <p class="croc-team">${esc(t.name)}</p>
          <p class="croc-who">Показывает <b style="color:${who.color}">${esc(who.name)}</b></p>
          <p class="croc-members micro">Угадывают: ${esc(t.members.filter(m => m !== who).map(m => m.name).join(', ') || 'все остальные')}</p>
          <p class="croc-tip">Передай телефон тому, кто показывает. Остальные, не подглядывайте в экран.</p>
          <button type="button" class="btn primary big" data-go>Я готов, поехали</button></div>`;
        root.querySelector('[data-go]').addEventListener('click', play);
      }

      function play() {
        screen = 'play'; words = [];
        endAt = performance.now() + api.opts.time * 1000; lastTick = api.opts.time;
        root.innerHTML = `<div class="croc-play" style="--c:${team().color}">
          <div class="croc-timer"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="track"/><circle cx="60" cy="60" r="52" class="bar"/></svg><b>${api.opts.time}</b></div>
          <div class="croc-deck"></div>
          <div class="croc-actions"><button type="button" class="btn big" data-skip>← Пропустить</button><span class="croc-count micro">угадано: 0</span><button type="button" class="btn primary big" data-ok>Угадали →</button></div></div>`;
        root.querySelector('[data-skip]').addEventListener('click', () => answer(false));
        root.querySelector('[data-ok]').addEventListener('click', () => answer(true));
        api.sfx('go');
        deal();
      }

      function deal() {
        const deck = root.querySelector('.croc-deck'); if (!deck) return;
        const item = draw();
        card = el('div', 'croc-card', `<span class="micro">${esc(item.cat)}</span><p>${esc(item.w)}</p><span class="micro croc-hint">свайп вправо, если угадали</span>`);
        card.item = item;
        deck.appendChild(card);
        P.fit(card.querySelector('p'), Math.min(68, Math.max(34, innerWidth * 0.064)), 20);
        api.on(card, 'pointerdown', e => { drag = { x: e.clientX, id: e.pointerId, el: card }; try { card.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } card.classList.add('drag'); });
        api.on(card, 'pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const dx = e.clientX - drag.x; card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`; card.dataset.lean = dx > 40 ? 'ok' : dx < -40 ? 'skip' : ''; });
        const up = e => {
          if (!drag || drag.id !== e.pointerId) return;
          const dx = e.clientX - drag.x; drag = null; card.classList.remove('drag');
          if (Math.abs(dx) > 90) answer(dx > 0); else { card.style.transform = ''; card.dataset.lean = ''; }
        };
        api.on(card, 'pointerup', up); api.on(card, 'pointercancel', up);
      }

      function answer(ok) {
        if (screen !== 'play' || !card) return;
        words.push({ w: card.item.w, ok });
        const c = card; card = null;
        c.classList.add(ok ? 'out-ok' : 'out-skip');
        c.style.transform = '';
        setTimeout(() => c.remove(), 500);
        api.sfx(ok ? 'score' : 'whoosh');
        if (ok) { const r = c.getBoundingClientRect(); api.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 26, colors: [team().color, '#ffffff', '#ffd23f'], power: 0.6 }); }
        const n = root.querySelector('.croc-count'); if (n) n.textContent = 'угадано: ' + words.filter(x => x.ok).length;
        deal();
      }

      function timeUp() {
        screen = 'sum';
        if (card) words.push({ w: card.item.w, ok: false, last: true });
        card = null;
        api.sfx('bad');
        summary();
      }

      function summary() {
        const t = team(), got = words.filter(x => x.ok).length;
        root.innerHTML = `<div class="croc-sheet" style="--c:${t.color}">
          <span class="micro">Время вышло · ${esc(t.name)}</span>
          <p class="croc-team">+${got}</p>
          <p class="croc-tip">Проверьте список. Тапни по слову, чтобы засчитать его или снять.</p>
          <div class="croc-words">${words.map((x, i) => `<button type="button" class="croc-word" data-i="${i}" aria-pressed="${x.ok}">${x.ok ? '✓' : '✕'} ${esc(x.w)}${x.last ? ' <small>(последнее)</small>' : ''}</button>`).join('') || '<span class="micro">ни одного слова</span>'}</div>
          <button type="button" class="btn primary big" data-next>Засчитать</button></div>`;
        root.querySelectorAll('.croc-word').forEach(b => b.addEventListener('click', () => { const x = words[+b.dataset.i]; x.ok = !x.ok; summary(); }));
        root.querySelector('[data-next]').addEventListener('click', commit);
      }

      function commit() {
        const t = team();
        t.score += words.filter(x => x.ok).length; t.turns++;
        hud();
        // decide only after both teams have had the same number of rounds
        if (teams[0].turns === teams[1].turns) {
          const [a, b] = teams;
          if ((a.score >= api.opts.to || b.score >= api.opts.to) && a.score !== b.score) {
            const w = a.score > b.score ? a : b;
            screen = 'over';
            root.innerHTML = '';
            api.end({ winners: w.members, title: w.name, line: a.score + ' : ' + b.score + ' · ' + w.members.map(m => m.name).join(', '), delay: 200 });
            return;
          }
        }
        cur = 1 - cur; hud(); pass();
      }

      api.key(e => {
        // a focused button handles its own Enter
        const onBtn = e.target.closest && e.target.closest('button');
        if (screen === 'play') {
          if (e.key === 'ArrowRight' || (e.key === 'Enter' && !onBtn)) { e.preventDefault(); answer(true); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); answer(false); }
        } else if (e.key === 'Enter' && !onBtn) {
          if (screen === 'pass') { e.preventDefault(); play(); }
          else if (screen === 'sum') { e.preventDefault(); commit(); }
        }
      });

      api.loop(() => {
        if (screen !== 'play') return;
        const left = Math.max(0, (endAt - performance.now()) / 1000), whole = Math.ceil(left);
        const b = root.querySelector('.croc-timer b'), bar = root.querySelector('.croc-timer .bar');
        if (b) b.textContent = whole;
        if (bar) bar.style.strokeDashoffset = String(326.7 * (1 - left / api.opts.time));
        root.classList.toggle('hurry', left <= 10);
        if (whole !== lastTick) { lastTick = whole; if (whole <= 5 && whole > 0) api.sfx('tick'); }
        if (left <= 0) timeUp();
      });

      pass();
    }
  });
})();
