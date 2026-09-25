(function () {
  'use strict';
  const P = window.Play, hexA = P.hexA;

  P.register({
    id: 'pong', title: 'Понг', kicker: 'Дуэль', players: '1–2 игрока',
    glow: ['#ff7a1a', '#ff3d7f', '#ffd23f'],
    rules: 'Отбивай мяч и не пропускай. После каждого удара он летит быстрее, а удар краем ракетки закручивает траекторию.',
    modes: [
      { id: 'duo', label: 'Вдвоём', slots: ['Левая ракетка', 'Правая ракетка'],
        keys: [[['W', 'S'], 'левая ракетка'], [['↑', '↓'], 'правая ракетка'], [['Палец'], 'на телефоне каждый водит по своей половине']] },
      { id: 'cpu', label: 'Против бота', slots: ['Игрок'], bot: true,
        keys: [[['W', 'S'], 'или'], [['↑', '↓'], 'ракетка'], [['Мышь'], 'или палец тоже работают']] }
    ],
    options: [{ id: 'to', label: 'Играем до', values: [[5, '5 очков'], [7, '7 очков'], [11, '11 очков']], def: 7 }],

    create(api) {
      const W = 960, H = 600, PW = 16, PH = 108, PX = 40, R = 10, MAX = 1180;
      const v = api.canvas(W, H, { rotate: true });
      const ctx = v.ctx, cpu = api.mode === 'cpu', target = api.opts.to;
      const pads = api.players.map((p, i) => ({ p, x: i ? W - PX : PX, y: H / 2, vy: 0, aim: null, score: 0, flash: 0 }));
      const ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: 0 };
      const trail = [], sparks = [];
      let serve = 1.1, dir = api.round % 2 ? -1 : 1, over = false, shake = 0, t = 0;
      let ai = { at: 0, y: H / 2, err: 0 };

      const keys = new Set();
      api.on(window, 'keydown', e => {
        if (!api.playing) return;
        if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Space'].includes(e.code)) e.preventDefault();
        keys.add(e.code);
      });
      api.on(window, 'keyup', e => keys.delete(e.code));
      api.on(window, 'blur', () => keys.clear());

      const point = e => {
        const q = v.toLocal(e.clientX, e.clientY);
        const side = cpu ? 0 : (q.x < W / 2 ? 0 : 1);
        pads[side].aim = P.clamp(q.y, PH / 2, H - PH / 2);
      };
      api.on(v.el, 'pointerdown', e => { try { v.el.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } point(e); });
      api.on(v.el, 'pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) point(e); });

      const hud = () => api.hud(pads.map(d => ({ name: d.p.name, color: d.p.color, value: d.score })));
      hud();

      function launch() {
        const a = P.rand(-0.38, 0.38);
        ball.speed = 460;
        ball.vx = Math.cos(a) * ball.speed * dir; ball.vy = Math.sin(a) * ball.speed;
        api.sfx('tap');
      }

      function predict() {
        // where the ball will cross the bot's x, folding wall bounces
        if (ball.vx <= 0) return H / 2;
        const tt = (pads[1].x - PW / 2 - R - ball.x) / ball.vx;
        const span = H - 2 * R;
        let y = ball.y - R + ball.vy * tt;
        y = ((y % (2 * span)) + 2 * span) % (2 * span);
        if (y > span) y = 2 * span - y;
        return y + R;
      }

      function step(dt) {
        t += dt;
        pads.forEach((d, i) => {
          let k = 0;
          if (i === 0) { if (keys.has('KeyW')) k -= 1; if (keys.has('KeyS')) k += 1; if (cpu) { if (keys.has('ArrowUp')) k -= 1; if (keys.has('ArrowDown')) k += 1; } }
          else if (!d.p.bot) { if (keys.has('ArrowUp')) k -= 1; if (keys.has('ArrowDown')) k += 1; }
          if (d.p.bot) {
            ai.at -= dt;
            if (ai.at <= 0) { ai.at = 0.11; ai.y = predict() + ai.err; }
            const want = ball.vx > 0 ? ai.y : H / 2;
            const maxV = 470 + Math.min(260, ball.speed * 0.2);
            d.vy = P.clamp((want - d.y) * 9, -maxV, maxV);
          } else if (k) { d.aim = null; d.vy = k * 660; }
          else if (d.aim != null) d.vy = P.clamp((d.aim - d.y) * 16, -1100, 1100);
          else d.vy *= 0.75;
          d.y = P.clamp(d.y + d.vy * dt, PH / 2, H - PH / 2);
          d.flash = Math.max(0, d.flash - dt * 3);
        });

        if (over) return;
        if (serve > 0) {
          serve -= dt; ball.x = W / 2; ball.y = H / 2 + Math.sin(t * 3) * 6;
          if (serve <= 0) launch();
          return;
        }
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy); api.sfx('wall'); }
        if (ball.y > H - R) { ball.y = H - R; ball.vy = -Math.abs(ball.vy); api.sfx('wall'); }

        pads.forEach((d, i) => {
          const toward = i === 0 ? ball.vx < 0 : ball.vx > 0;
          if (!toward) return;
          if (Math.abs(ball.x - d.x) < PW / 2 + R && Math.abs(ball.y - d.y) < PH / 2 + R) {
            const off = P.clamp((ball.y - d.y) / (PH / 2), -1, 1);
            const a = off * 1.02;
            ball.speed = Math.min(MAX, ball.speed * 1.065 + 12);
            const s = i === 0 ? 1 : -1;
            ball.vx = Math.cos(a) * ball.speed * s;
            ball.vy = Math.sin(a) * ball.speed + d.vy * 0.12;
            ball.x = d.x + s * (PW / 2 + R);
            d.flash = 1; shake = Math.min(10, 3 + ball.speed / 160);
            for (let n = 0; n < 14; n++) sparks.push({ x: ball.x, y: ball.y, vx: s * P.rand(80, 420), vy: P.rand(-320, 320), life: P.rand(0.25, 0.5), c: d.p.color });
            api.sfx('hit', (ball.speed - 460) / (MAX - 460));
            if (i === 0) ai.err = P.rand(-PH * 0.42, PH * 0.42) * (ball.speed > 800 ? 1.25 : 1);
          }
        });

        if (ball.x < -R * 3 || ball.x > W + R * 3) scored(ball.x < 0 ? 1 : 0);
      }

      function scored(i) {
        const d = pads[i];
        d.score++; hud();
        const at = v.toClient(i ? 0 : W, P.clamp(ball.y, 40, H - 40));
        api.burst(at.x, at.y, { count: 46, colors: [d.p.color, '#ffffff', '#ffd23f'], power: 0.8 });
        shake = 14; trail.length = 0;
        if (d.score >= target) {
          over = true; api.sfx('score');
          api.end({ winners: [d.p], line: pads[0].score + ' : ' + pads[1].score });
          return;
        }
        api.sfx('score');
        dir = i ? -1 : 1; // serve toward whoever just conceded
        serve = 0.95; ball.vx = ball.vy = 0;
      }

      function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
      }

      function draw() {
        const sx = shake ? P.rand(-shake, shake) : 0, sy = shake ? P.rand(-shake, shake) : 0;
        v.begin(sx, sy);
        // field
        roundRect(0, 0, W, H, 26);
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.015)');
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5; ctx.stroke();
        // colour wash behind each side
        pads.forEach((d, i) => {
          const wg = ctx.createRadialGradient(i ? W : 0, H / 2, 0, i ? W : 0, H / 2, W * 0.55);
          wg.addColorStop(0, hexA(d.p.color, 0.10 + d.flash * 0.12)); wg.addColorStop(1, hexA(d.p.color, 0));
          ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H);
        });
        // centre line + big faint scores
        ctx.setLineDash([10, 16]); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(W / 2, 20); ctx.lineTo(W / 2, H - 20); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '900 210px Unbounded, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        ctx.fillText(pads[0].score, W * 0.25, H / 2 + 8); ctx.fillText(pads[1].score, W * 0.75, H / 2 + 8);

        // trail
        trail.push({ x: ball.x, y: ball.y }); if (trail.length > 16) trail.shift();
        if (serve <= 0 && !over) {
          trail.forEach((q, i) => {
            const k = i / trail.length;
            ctx.fillStyle = `rgba(255,255,255,${k * 0.16})`;
            ctx.beginPath(); ctx.arc(q.x, q.y, R * (0.35 + k * 0.6), 0, 6.283); ctx.fill();
          });
        }
        // sparks
        ctx.globalCompositeOperation = 'lighter';
        sparks.forEach(s => {
          ctx.strokeStyle = hexA(s.c, Math.min(1, s.life * 2.4)); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke();
        });
        // ball with chromatic split along its velocity
        if (!over || serve > 0 || (ball.x > -R && ball.x < W + R)) {
          const sp = Math.hypot(ball.vx, ball.vy) || 1, ox = ball.vx / sp, oy = ball.vy / sp;
          const k = 1.5 + (ball.speed / MAX) * 4.5;
          [['rgb(255,50,90)', -k], ['rgb(70,255,140)', 0], ['rgb(80,120,255)', k]].forEach(([c, o]) => {
            ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ball.x + ox * o, ball.y + oy * o, R, 0, 6.283); ctx.fill();
          });
        }
        ctx.globalCompositeOperation = 'source-over';
        // serve ring
        if (serve > 0 && !over) {
          ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(t * 8)})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(W / 2, H / 2, 26 + serve * 30, 0, 6.283); ctx.stroke();
        }
        // paddles
        pads.forEach(d => {
          ctx.save();
          ctx.shadowColor = d.p.color; ctx.shadowBlur = 26 + d.flash * 30;
          roundRect(d.x - PW / 2, d.y - PH / 2, PW, PH, PW / 2);
          ctx.fillStyle = d.p.color; ctx.fill();
          ctx.restore();
          roundRect(d.x - PW / 2 + 3, d.y - PH / 2 + 6, PW / 2 - 3, PH - 12, 4);
          ctx.fillStyle = `rgba(255,255,255,${0.35 + d.flash * 0.5})`; ctx.fill();
        });
      }

      api.loop(dt => {
        // two sub-steps keep a fast ball from skipping through a paddle
        step(dt / 2); step(dt / 2);
        sparks.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; });
        for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
        shake = Math.max(0, shake - dt * 40);
        draw();
      });
    }
  });
})();
