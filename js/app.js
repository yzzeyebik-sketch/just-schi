(function () {
  const { CHARACTERS, POSES } = window.Figure;
  const $ = s => document.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('glfr.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('glfr.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  // ---------- background: liquid cream swirl ----------
  const bgR = new THREE.WebGLRenderer({ canvas: $('#bg'), antialias: false, powerPreference: 'low-power' });
  const bgScene = new THREE.Scene();
  const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bgU = {
    uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2() },
    uTint: { value: new THREE.Color(0xe9dfc9) }, uAmt: { value: 0.55 }
  };
  bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: bgU,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `
      precision highp float;
      uniform float uTime; uniform vec2 uRes; uniform vec2 uMouse; uniform vec3 uTint; uniform float uAmt;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0., a = .5; for(int i = 0; i < 5; i++){ v += a*noise(p); p = p*2.03 + vec2(1.7,9.2); a *= .5; } return v; }
      void main(){
        vec2 uv = vUv;
        vec2 p = (uv - .5) * vec2(uRes.x/uRes.y, 1.) * 1.35;
        float t = uTime * .035;
        vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2,1.3) - t));
        vec2 r = vec2(fbm(p + 3.2*q + vec2(1.7,9.2) + t*1.4 + uMouse*.25), fbm(p + 3.2*q + vec2(8.3,2.8) - t));
        float f = fbm(p + 2.6*r);
        float ribbon = pow(smoothstep(.42, .98, f), 2.6);
        float edge = smoothstep(.62, .66, f) * (1. - smoothstep(.66, .8, f)) * .35;
        vec3 col = vec3(.028, .028, .032);
        col += uTint * (ribbon + edge * ribbon * 2.) * uAmt;
        float centre = smoothstep(.0, .42, abs(uv.x - .5));
        col *= mix(.55, 1., centre);
        col *= mix(.3, 1., smoothstep(1.25, .15, length((uv - .5) * vec2(1.1, 1.))));
        col += (hash(uv * uRes + fract(uTime * 7.) * 91.) - .5) * .045;
        gl_FragColor = vec4(col, 1.);
      }`
  })));

  // ---------- main stage ----------
  const canvas = $('#stage');
  const R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  R.setClearColor(0x000000, 0);
  R.outputEncoding = THREE.sRGBEncoding;
  R.toneMapping = THREE.ACESFilmicToneMapping;
  R.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

  (function env() {
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x0c0c0e, side: THREE.BackSide })));
    const box = (w, h, pos, c, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(pos[0], pos[1], pos[2]);
      m.lookAt(0, 1, 0);
      es.add(m);
    };
    box(5, 8, [-7, 3, 4], 0xfff1dc, 3.2);
    box(10, 1.2, [0, 9, 0], 0xffffff, 2.4);
    box(2, 9, [7, 2, -4], 0xe9dfc9, 2.0);
    box(3, 3, [3, 1, 8], 0xffffff, 0.8);
    const pm = new THREE.PMREMGenerator(R);
    scene.environment = pm.fromScene(es, 0.03).texture;
    pm.dispose();
  })();

  const hemi = new THREE.HemisphereLight(0xf4efe6, 0x1a1a1e, 0.35);
  const key = new THREE.DirectionalLight(0xfff3e6, 2.2);
  const rim = new THREE.DirectionalLight(0xe9dfc9, 1.6);
  const fill = new THREE.DirectionalLight(0xdfe4ff, 0.35);
  key.position.set(-2.2, 3.2, 3);
  rim.position.set(2.6, 2.4, -3);
  fill.position.set(3, 1, 2.5);
  scene.add(hemi, key, rim, fill);

  const shadow = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.75)');
    gr.addColorStop(0.5, 'rgba(0,0,0,.3)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.002;
    scene.add(m);
    return m;
  })();

  const holder = new THREE.Group();
  scene.add(holder);

  // ---------- materials ----------
  const toonRamp = (() => {
    const t = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.LuminanceFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  })();
  const FLAT = { eyeWhite: 1, iris: 1, dark: 1, shine: 1, lip: 1 };
  const SURF = {
    skin: [0.55, 0], hair: [0.34, 0.08], cloth: [0.82, 0], leather: [0.36, 0.05], denim: [0.92, 0],
    silk: [0.3, 0.08], lace: [0.5, 0.02], metal: [0.22, 1], glass: [0.02, 0], darkglass: [0.08, 0.85]
  };
  const cache = new Map();
  function material(mode, role, hex) {
    const k = mode + '|' + role + '|' + hex;
    if (cache.has(k)) return cache.get(k);
    const color = new THREE.Color(hex).convertSRGBToLinear();
    let m;
    if (FLAT[role]) {
      m = new THREE.MeshBasicMaterial({ color: role === 'eyeWhite' ? color.clone().multiplyScalar(0.86) : color });
    } else if (mode === 'chrome') {
      const clothy = role !== 'skin' && role !== 'hair';
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(clothy ? 0x8e9098 : role === 'hair' ? 0xb8bac0 : 0xe4e6ea).convertSRGBToLinear(),
        metalness: 1, roughness: clothy ? 0.28 : role === 'hair' ? 0.18 : 0.09, envMapIntensity: 1.25
      });
    } else if (mode === 'toon') {
      m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp });
    } else {
      const [rough, metal] = SURF[role] || [0.6, 0];
      m = role === 'glass'
        ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.45, clearcoat: 1 })
        : new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: role === 'skin' ? 0.55 : 0.8 });
    }
    if (role === 'hair' || role === 'cloth' || role === 'silk' || role === 'lace' || role === 'denim' || role === 'leather') m.side = THREE.DoubleSide;
    cache.set(k, m);
    return m;
  }
  const inkMat = new THREE.ShaderMaterial({
    uniforms: { uW: { value: 0.0017 }, uC: { value: new THREE.Color(0x0b0b0c) } },
    vertexShader: 'uniform float uW; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uW, 1.); }',
    fragmentShader: 'uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.); }',
    side: THREE.BackSide
  });

  // ---------- figures ----------
  const figures = CHARACTERS.map(def => {
    const f = Figure.build(def);
    f.root.scale.setScalar(def.height);
    f.meshes = [];
    f.root.traverse(o => { if (o.isMesh) f.meshes.push(o); });
    for (const o of f.meshes) {
      if (FLAT[o.userData.role]) continue;
      const ink = new THREE.Mesh(o.geometry, inkMat);
      ink.visible = false;
      ink.raycast = () => {};
      o.add(ink);
      o.userData.ink = ink;
    }
    f.cur = {};
    for (const b in f.bones) f.cur[b] = [0, 0, 0];
    f.blink = 2 + Math.random() * 3;
    return f;
  });

  const state = {
    char: Math.min(store.get('char', 0), figures.length - 1),
    pose: store.get('pose', 0), light: store.get('light', 0), mode: store.get('mode', 'soft'),
    angle: -0.35, vel: 0, zoom: 0, zoomT: 0, tab: 'wardrobe', hover: null, swap: null
  };
  if (!['soft', 'toon', 'chrome'].includes(state.mode)) state.mode = 'soft';

  function applyMode(f) {
    for (const m of f.meshes) {
      const g = m.userData.garment;
      if (!g || g.anim == null) m.material = material(state.mode, m.userData.role, m.userData.color);
      if (m.userData.ink) m.userData.ink.visible = state.mode === 'toon' && (!g || (g.on && g.anim == null));
    }
  }

  let active = figures[state.char];
  holder.add(active.root);
  figures.forEach(applyMode);

  // ---------- garments ----------
  function animateGarment(g, on) {
    g.on = on;
    g.anim = on ? 0 : 1;
    g.from = g.anim;
    g.to = on ? 1 : 0;
    g.clock = 0;
    for (const m of g.meshes) {
      if (m.userData.fade) m.userData.fade.dispose();
      const fm = material(state.mode, m.userData.role, m.userData.color).clone();
      fm.transparent = true;
      m.userData.fade = fm;
      m.material = fm;
      m.visible = true;
      if (m.userData.ink) m.userData.ink.visible = false;
    }
    syncUI();
  }
  function stepGarments(f, dt) {
    for (const g of f.garments) {
      if (g.anim == null) continue;
      g.clock += dt / (g.on ? 0.45 : 0.55);
      const k = Math.min(1, g.clock);
      const e = 1 - Math.pow(1 - k, 3);
      const v = g.from + (g.to - g.from) * e;
      const dir = g.dir === 'down' ? -1 : 1;
      for (const m of g.meshes) {
        m.userData.fade.opacity = v;
        m.scale.copy(m.userData.baseScale).multiplyScalar(1 + (1 - v) * 0.12);
        m.position.copy(m.userData.basePos);
        m.position.y += dir * (1 - v) * 0.035;
      }
      if (k >= 1) {
        g.anim = null;
        for (const m of g.meshes) {
          m.scale.copy(m.userData.baseScale);
          m.position.copy(m.userData.basePos);
          m.visible = g.on;
          m.userData.fade.dispose();
          m.userData.fade = null;
        }
        applyMode(f);
      }
    }
  }
  const removable = f => f.garments.filter(g => !g.base);
  function strip() {
    if (state.swap) return;
    const g = removable(active).find(x => x.on);
    if (g) animateGarment(g, false);
  }
  function dress() {
    if (state.swap) return;
    removable(active).filter(g => !g.on).forEach(g => animateGarment(g, true));
  }

  // ---------- UI ----------
  const panels = { wardrobe: $('#panel-wardrobe'), pose: $('#panel-pose'), light: $('#panel-light') };
  const pad = n => String(n).padStart(2, '0');
  function row({ n, t, s, pressed, base, onClick, data }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'row' + (base ? ' base' : '');
    if (base) b.disabled = true; else b.setAttribute('aria-pressed', String(!!pressed));
    b.innerHTML = `<span class="n">${n}</span><span><span class="t"></span><br><span class="s"></span></span>${base ? '<span class="s">Base</span>' : '<span class="chk"></span>'}`;
    b.querySelector('.t').textContent = t;
    b.querySelector('.s').textContent = s;
    if (data) b.dataset.id = data;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function header(text) {
    const h = document.createElement('div');
    h.className = 'panel-h micro';
    h.textContent = text;
    return h;
  }
  function buildWardrobe() {
    const p = panels.wardrobe;
    p.replaceChildren(header(`${active.def.full} · ${removable(active).length} layers`));
    active.garments.forEach((g, i) => p.appendChild(row({
      n: pad(i + 1), t: g.name, s: g.sub, pressed: g.on, base: g.base, data: g.id,
      onClick: () => { if (!state.swap) animateGarment(g, !g.on); }
    })));
  }
  function buildPose() {
    const p = panels.pose;
    p.replaceChildren(header('Pose'));
    POSES.forEach((ps, i) => p.appendChild(row({
      n: pad(i + 1), t: ps.name, s: ps.sub, pressed: state.pose === i,
      onClick: () => { state.pose = i; store.set('pose', i); buildPose(); }
    })));
  }
  const LIGHTS = [
    { name: 'Studio', sub: 'soft box, cream rim', key: [0xfff3e6, 1.75], rim: [0xe9dfc9, 1.6], fill: 0.3, hemi: 0.3, tint: 0xe9dfc9, amt: 0.55, exp: 0.98, kp: [-2.2, 3.2, 3] },
    { name: 'Noir', sub: 'hard side light', key: [0xffffff, 3.0], rim: [0xc9ccd6, 2.2], fill: 0.05, hemi: 0.08, tint: 0xc9ccd6, amt: 0.2, exp: 1.0, kp: [-3.5, 2.2, 0.6] },
    { name: 'Sunny Deck', sub: 'golden hour, Thousand Sunny', key: [0xffb27a, 2.6], rim: [0xff8a4a, 2.0], fill: 0.3, hemi: 0.3, tint: 0xf2a263, amt: 0.62, exp: 1.08, kp: [2.5, 1.6, 3] }
  ];
  const MODES = [['soft', 'Soft', 'physically lit'], ['toon', 'Toon', 'cel shade, ink lines'], ['chrome', 'Chrome', 'liquid metal']];
  function buildLight() {
    const p = panels.light;
    p.replaceChildren(header('Lighting'));
    LIGHTS.forEach((l, i) => p.appendChild(row({
      n: pad(i + 1), t: l.name, s: l.sub, pressed: state.light === i,
      onClick: () => { state.light = i; store.set('light', i); applyLight(); buildLight(); }
    })));
    const sep = document.createElement('div');
    sep.className = 'panel-sep';
    p.append(sep, header('Render'));
    MODES.forEach(([k, t, s], i) => p.appendChild(row({
      n: pad(i + 1), t, s, pressed: state.mode === k,
      onClick: () => { state.mode = k; store.set('mode', k); figures.forEach(applyMode); buildLight(); }
    })));
  }
  function applyLight() {
    const l = LIGHTS[state.light];
    key.color.setHex(l.key[0]); key.intensity = l.key[1];
    rim.color.setHex(l.rim[0]); rim.intensity = l.rim[1];
    key.position.set(l.kp[0], l.kp[1], l.kp[2]);
    fill.intensity = l.fill; hemi.intensity = l.hemi;
    bgU.uTint.value.setHex(l.tint);
    state.bgAmt = l.amt;
    R.toneMappingExposure = l.exp;
  }
  function syncUI() {
    const list = removable(active);
    const left = list.filter(g => g.on).length;
    $('#strip-count').textContent = `${left} / ${list.length}`;
    $('#strip').disabled = left === 0;
    for (const b of panels.wardrobe.querySelectorAll('.row[data-id]')) {
      const g = active.garments.find(x => x.id === b.dataset.id);
      if (!g.base) b.setAttribute('aria-pressed', String(g.on));
    }
  }
  function syncChar() {
    const d = active.def;
    document.querySelectorAll('[data-char]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.char === state.char)));
    $('#st-bounty').textContent = d.bounty;
    $('#st-height').textContent = Math.round(d.height * 100) + ' cm';
    $('#st-age').textContent = d.age;
    $('#pg-cur').textContent = pad(state.char + 1);
    buildWardrobe();
    syncUI();
  }
  function setChar(i) {
    if (i === state.char || state.swap) return;
    state.char = i;
    store.set('char', i);
    state.swap = { t: 0, next: figures[i], swapped: false };
    const wm = $('#wordmark');
    wm.classList.add('swap');
    setTimeout(() => {
      wm.querySelectorAll('span').forEach(s => { s.textContent = figures[i].def.name; });
      wm.classList.remove('swap');
    }, 320);
  }
  function setTab(t) {
    state.tab = t;
    document.querySelectorAll('[role="tab"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    for (const k in panels) panels[k].hidden = k !== t;
  }

  document.querySelectorAll('[data-char]').forEach(b => b.addEventListener('click', () => setChar(+b.dataset.char)));
  document.querySelectorAll('[role="tab"]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#strip').addEventListener('click', strip);
  $('#dress').addEventListener('click', dress);
  $('#reset').addEventListener('click', () => { state.angle = -0.35; state.vel = 0; state.zoomT = 0; });
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft') state.vel -= 0.06;
    else if (k === 'arrowright') state.vel += 0.06;
    else if (k === 's') strip();
    else if (k === 'd') dress();
    else if (k === '1' || k === '2') setChar(+k - 1);
    else if (k === 'p') { state.pose = (state.pose + 1) % POSES.length; store.set('pose', state.pose); buildPose(); }
  });

  // ---------- pointer: rotate, zoom, pick ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tip = $('#tip');
  const ptrs = new Map();
  let drag = null, pinch = null;
  function pick(x, y) {
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = active.meshes.filter(m => m.visible);
    const hit = ray.intersectObjects(targets, false)[0];
    const g = hit && hit.object.userData.garment;
    return g && !g.base && g.on && g.anim == null ? g : null;
  }
  function setHover(g, x, y) {
    state.hover = g;
    canvas.classList.toggle('hovering', !!g && !drag);
    tip.hidden = !g;
    if (g) {
      tip.textContent = `${g.name} · tap to remove`;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }
    panels.wardrobe.querySelectorAll('.row[data-id]').forEach(b => b.classList.toggle('hot', !!g && b.dataset.id === g.id));
  }
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, t: performance.now() };
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: state.zoomT };
      drag = null;
    }
  });
  canvas.addEventListener('pointermove', e => {
    bgU.uMouse.value.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      state.zoomT = THREE.MathUtils.clamp(pinch.z + (Math.hypot(a.x - b.x, a.y - b.y) - pinch.d) / 300, 0, 1);
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x;
      drag.moved += Math.abs(dx) + Math.abs(e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
      state.angle += dx * 0.009;
      state.vel = dx * 0.009;
      if (drag.moved > 6) { canvas.classList.add('dragging'); setHover(null); }
      return;
    }
    if (e.pointerType === 'mouse') { const g = pick(e.clientX, e.clientY); setHover(g, e.clientX, e.clientY); }
  });
  const end = e => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && drag.moved <= 6 && e.type === 'pointerup') {
      const g = pick(e.clientX, e.clientY);
      if (g && !state.swap) { animateGarment(g, false); setHover(null); }
      state.vel = 0;
    }
    drag = null;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => setHover(null));
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    state.zoomT = THREE.MathUtils.clamp(state.zoomT - e.deltaY * 0.0012, 0, 1);
  }, { passive: false });

  // ---------- layout ----------
  const view = { d: 4, ty: 0.9, V: 2.3 };
  function resize() {
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    R.setPixelRatio(dpr); R.setSize(w, h, false);
    bgR.setPixelRatio(Math.min(dpr, 1) * 0.5); bgR.setSize(w, h, false);
    bgU.uRes.value.set(w, h);
    camera.aspect = w / h;
    const mobile = w < 760;
    const fillFrac = mobile ? 0.62 : 0.84, top = mobile ? 0.4 : 0.5;
    const frameH = 1.98;
    let V = frameH / fillFrac;
    if (w / h < 0.5) V = Math.max(V, 0.72 / camera.aspect);
    view.V = V;
    view.d = V / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    view.ty = frameH / 2 - 0.03 - (0.5 - top) * V;
    view.top = top;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ---------- animation ----------
  const tmp = new THREE.Vector3();
  function animateFigure(f, dt, t) {
    const target = POSES[state.pose].b;
    const k = 1 - Math.exp(-dt * 5);
    for (const b in f.bones) {
      const c = f.cur[b], tg = target[b] || [0, 0, 0];
      for (let i = 0; i < 3; i++) c[i] += (tg[i] - c[i]) * k;
      f.bones[b].rotation.set(c[0], c[1], c[2]);
    }
    const m = reduced ? 0.3 : 1;
    const br = Math.sin(t * 1.5) * m;
    f.bones.chest.rotation.x += br * 0.012;
    f.bones.chest.scale.set(1 + br * 0.006, 1 + br * 0.004, 1 + br * 0.01);
    f.bones.pelvis.rotation.y += Math.sin(t * 0.45) * 0.03 * m;
    f.bones.head.rotation.y += Math.sin(t * 0.37 + 1) * 0.06 * m;
    f.bones.uArmL.rotation.z += Math.sin(t * 1.5 + 0.4) * 0.012 * m;
    f.bones.uArmR.rotation.z -= Math.sin(t * 1.5 + 0.4) * 0.012 * m;
    f.back.rotation.x = -(f.bones.head.rotation.x + f.bones.neck.rotation.x + f.bones.chest.rotation.x) - 0.03 + Math.sin(t * 1.1) * 0.02 * m;

    f.blink -= dt;
    const bl = f.blink < 0.12 ? Math.max(0.08, Math.abs(f.blink - 0.06) / 0.06) : 1;
    if (f.blink < 0) f.blink = 2.5 + Math.random() * 3.5;
    f.eyes.forEach(e => { e.scale.y = bl; });

    f.root.position.y = 0;
    f.root.updateMatrixWorld(true);
    let min = Infinity;
    for (const b of ['footL', 'footR']) { f.bones[b].getWorldPosition(tmp); min = Math.min(min, tmp.y); }
    f.root.position.y = 0.036 * f.def.height - min;
  }

  const clock = new THREE.Clock();
  let t = 0, first = true;
  state.bgAmt = 0.55;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;

    if (state.swap) {
      const s = state.swap;
      s.t += dt;
      if (!s.swapped && s.t >= 0.32) {
        holder.remove(active.root);
        active = s.next;
        holder.add(active.root);
        s.swapped = true;
        syncChar();
      }
      const out = Math.min(1, s.t / 0.32), inn = Math.max(0, (s.t - 0.32) / 0.5);
      const back = x => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
      const sc = s.swapped ? Math.max(0.001, back(Math.min(1, inn))) : Math.max(0.001, 1 - out * out);
      holder.scale.set(1, sc, 1);
      state.angle += dt * (s.swapped ? 6 * (1 - Math.min(1, inn)) : 6 * out);
      if (inn >= 1) { holder.scale.set(1, 1, 1); state.swap = null; }
    }

    if (!drag) { state.angle += state.vel; state.vel *= Math.pow(0.02, dt); }
    holder.rotation.y = state.angle;
    const deg = Math.round(((-state.angle * 180 / Math.PI) % 360 + 360) % 360) % 360;
    if (deg !== state.deg) {
      state.deg = deg;
      $('#deg').firstChild.nodeValue = deg;
      $('#deg-mini').textContent = deg + '°';
    }

    state.zoom += (state.zoomT - state.zoom) * (1 - Math.exp(-dt * 6));
    const z = state.zoom, H = active.def.height;
    const dist = view.d * (1 - z * 0.6);
    const closeTy = H * 0.76 - (0.5 - view.top) * view.V * 0.4;
    const ty = view.ty + (closeTy - view.ty) * z;
    camera.position.set(0, ty + 0.12 * (1 - z), dist);
    camera.lookAt(0, ty, 0);
    shadow.scale.setScalar(H / 1.7);

    for (const f of figures) stepGarments(f, dt);
    animateFigure(active, dt, t);

    bgU.uAmt.value += (state.bgAmt - bgU.uAmt.value) * (1 - Math.exp(-dt * 3));
    if (!reduced) bgU.uTime.value = t;
    bgR.render(bgScene, bgCam);
    R.render(scene, camera);

    if (first) { first = false; setTimeout(() => $('#loader').classList.add('done'), 150); }
    requestAnimationFrame(frame);
  }

  applyLight();
  buildPose();
  buildLight();
  setTab('wardrobe');
  document.querySelectorAll('#wordmark span').forEach(s => { s.textContent = active.def.name; });
  syncChar();
  requestAnimationFrame(frame);
})();
