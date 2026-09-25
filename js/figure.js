(function () {
  const TAU = Math.PI * 2;

  function lathe(profile, seg = 32, phiStart = 0, phiLen = TAU, smooth = 6) {
    const curve = new THREE.CatmullRomCurve3(profile.map(p => new THREE.Vector3(p[0], p[1], 0)), false, 'centripetal');
    const pts = curve.getPoints(profile.length * smooth).map(p => new THREE.Vector2(Math.max(p.x, 0.0004), p.y));
    return new THREE.LatheGeometry(pts, seg, phiStart, phiLen);
  }

  function limb(len, radii, d = 0, caps = true, seg = 28) {
    const n = radii.length, r = radii.map(v => v + d);
    const pts = [];
    if (caps) { pts.push([0.0004, -len - r[n - 1] * 0.9], [r[n - 1] * 0.75, -len - r[n - 1] * 0.55]); }
    for (let i = n - 1; i >= 0; i--) pts.push([r[i], -len * i / (n - 1)]);
    if (caps) pts.push([r[0] * 0.75, r[0] * 0.55], [0.0004, r[0] * 0.9]);
    return lathe(pts, seg);
  }

  function sphere(r, sx = 1, sy = 1, sz = 1, w = 28, h = 20) {
    const g = new THREE.SphereGeometry(r, w, h);
    g.scale(sx, sy, sz);
    return g;
  }

  function mk(geo, role, color, pos, rot, scl) {
    const m = new THREE.Mesh(geo);
    m.userData.role = role;
    m.userData.color = color;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    return m;
  }

  function wave(geo, amp, freq, phase = 0) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(x, z);
      const k = 1 + amp * Math.sin(y * freq + a * 3 + phase) * Math.min(1, Math.max(0, -y * 6 + 0.2));
      p.setXYZ(i, x * k, y, z * k);
    }
    geo.computeVertexNormals();
    return geo;
  }

  const THIGH = [0.057, 0.053, 0.046, 0.039, 0.032];
  const SHIN = [0.033, 0.037, 0.033, 0.025, 0.019];
  const UARM = [0.029, 0.027, 0.024, 0.021];
  const FARM = [0.021, 0.021, 0.018, 0.015];
  const HIPS = [[0.0004, -0.05], [0.03, -0.047], [0.06, -0.035], [0.08, -0.015], [0.088, 0.005], [0.084, 0.03], [0.074, 0.06], [0.066, 0.085], [0.0004, 0.1]];
  const ABS = [[0.0004, -0.03], [0.066, -0.01], [0.058, 0.03], [0.053, 0.06], [0.056, 0.09], [0.062, 0.12], [0.0004, 0.14]];
  const RIBS = [[0.0004, -0.03], [0.06, -0.01], [0.068, 0.03], [0.074, 0.07], [0.075, 0.1], [0.068, 0.13], [0.05, 0.15], [0.0004, 0.16]];

  function build(def) {
    const root = new THREE.Group();
    const B = {};
    const bone = (name, parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.name = name;
      (parent ? B[parent] : root).add(g);
      B[name] = g;
      return g;
    };

    bone('pelvis', null, 0, 0.5, 0);
    bone('spine', 'pelvis', 0, 0.06, 0);
    bone('chest', 'spine', 0, 0.1, 0);
    bone('neck', 'chest', 0, 0.155, 0);
    bone('head', 'neck', 0, 0.045, 0);
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R';
      bone('uArm' + L, 'chest', 0.088 * s, 0.135, -0.005);
      bone('fArm' + L, 'uArm' + L, 0, -0.165, 0);
      bone('hand' + L, 'fArm' + L, 0, -0.145, 0);
      bone('thigh' + L, 'pelvis', 0.048 * s, -0.012, 0);
      bone('shin' + L, 'thigh' + L, 0, -0.225, 0);
      bone('foot' + L, 'shin' + L, 0, -0.225, 0);
    }

    const skin = def.skin, bust = def.bust;
    const add = (b, m) => { B[b].add(m); return m; };

    // body
    add('pelvis', mk(lathe(HIPS), 'skin', skin, null, null, [1, 1, 0.78]));
    for (const s of [1, -1]) add('pelvis', mk(sphere(0.05, 1, 0.95, 0.9), 'skin', skin, [0.034 * s, -0.005, -0.03]));
    add('spine', mk(lathe(ABS), 'skin', skin, null, null, [1, 1, 0.72]));
    add('chest', mk(lathe(RIBS), 'skin', skin, null, null, [1, 1, 0.7]));
    add('chest', mk(limb(0.16, [0.03, 0.034, 0.03]), 'skin', skin, [-0.08, 0.133, -0.005], [0, 0, Math.PI / 2], [1, 1, 0.8]));
    for (const s of [1, -1]) add('chest', mk(sphere(bust, 1, 0.95, 1), 'skin', skin, [0.037 * s, 0.07, 0.032], [0.12, 0.25 * s, 0]));
    add('neck', mk(new THREE.CylinderGeometry(0.021, 0.026, 0.08, 20), 'skin', skin, [0, 0.03, 0]));

    // head + face
    add('head', mk(sphere(0.06, 0.9, 1.06, 0.97), 'skin', skin, [0, 0.067, 0]));
    add('head', mk(sphere(0.045, 0.85, 0.9, 0.95), 'skin', skin, [0, 0.035, 0.012]));
    add('head', mk(sphere(0.004), 'skin', skin, [0, 0.042, 0.055]));
    add('head', mk(new THREE.BoxGeometry(0.013, 0.0022, 0.003), 'lip', def.lip, [0, 0.025, 0.0535]));
    const eyes = [];
    for (const s of [1, -1]) {
      const e = new THREE.Group();
      e.position.set(0.022 * s, 0.058, 0.0528);
      e.rotation.set(0, 0.36 * s, 0);
      e.add(mk(sphere(0.012, 1.3, 1.1, 0.25), 'eyeWhite', 0xf6f3ee));
      e.add(mk(sphere(0.011, 0.8, 1.1, 0.3), 'iris', def.eye, [0.001 * -s, -0.001, 0.0015]));
      e.add(mk(sphere(0.005, 0.8, 1.1, 0.3), 'dark', 0x0c0a0a, [0.001 * -s, -0.001, 0.003]));
      e.add(mk(sphere(0.0026), 'shine', 0xffffff, [0.003 * s, 0.004, 0.0045]));
      e.add(mk(new THREE.BoxGeometry(0.032, 0.0035, 0.004), 'dark', 0x16100e, [0, 0.0135, 0.001], [0, 0, -0.14 * s]));
      e.add(mk(new THREE.BoxGeometry(0.022, 0.0025, 0.003), 'hair', def.brow, [0.002 * s, 0.031, -0.003], [0, 0, -0.1 * s]));
      B.head.add(e);
      eyes.push(e);
    }

    // limbs
    for (const s of [1, -1]) {
      const L = s > 0 ? 'L' : 'R';
      add('thigh' + L, mk(limb(0.225, THIGH), 'skin', skin));
      add('shin' + L, mk(limb(0.225, SHIN), 'skin', skin));
      add('foot' + L, mk(sphere(0.024, 0.8, 0.85, 2.0), 'skin', skin, [0, -0.014, 0.03]));
      add('uArm' + L, mk(limb(0.165, UARM), 'skin', skin));
      add('fArm' + L, mk(limb(0.145, FARM), 'skin', skin));
      add('hand' + L, mk(sphere(0.021, 0.5, 1.5, 0.75), 'skin', skin, [0, -0.028, 0.002]));
      add('hand' + L, mk(sphere(0.008, 1, 2, 1), 'skin', skin, [0, -0.015, 0.016], [0.5, 0, 0]));
    }

    // hair
    const hair = def.hair;
    const hairParts = [];
    const H = m => { add('head', m); hairParts.push(m); return m; };
    H(mk(new THREE.SphereGeometry(0.067, 32, 16, 0, TAU, 0, Math.PI / 2), 'hair', hair, [0, 0.066, -0.004], [-0.35, 0, 0], [0.95, 1.08, 1.02]));
    const backLen = def.hairLen;
    const backGeo = new THREE.CylinderGeometry(0.062, def.hairFlare, backLen, 28, 18, true, Math.PI / 2 + 0.25, Math.PI - 0.5);
    backGeo.translate(0, -backLen / 2, 0);
    if (def.wavy) wave(backGeo, 0.07, 55);
    const back = H(mk(backGeo, 'hair', hair, [0, 0.075, -0.02]));
    for (const s of [1, -1]) {
      const lg = new THREE.ConeGeometry(0.017, def.lockLen, 10, 8, true);
      lg.translate(0, -def.lockLen / 2, 0);
      lg.rotateX(Math.PI);
      lg.translate(0, 0, 0);
      if (def.wavy) wave(lg, 0.25, 70, s);
      H(mk(lg, 'hair', hair, [0.056 * s, 0.07 - def.lockLen, 0.012], [0.08, 0, -0.06 * s]));
    }
    if (def.fringe === 'blunt') {
      H(mk(new THREE.CylinderGeometry(0.068, 0.07, 0.032, 28, 1, true, -1.05, 2.1), 'hair', hair, [0, 0.086, -0.002]));
    } else {
      const bangs = [[-0.75, 0.045, 0.25], [-0.38, 0.034, 0.12], [0.02, 0.03, 0.05], [0.4, 0.036, -0.15], [0.78, 0.048, -0.3]];
      for (const [a, len, tilt] of bangs) {
        const c = new THREE.ConeGeometry(0.019, len, 8);
        c.rotateX(Math.PI);
        const m = H(mk(c, 'hair', hair));
        m.position.set(Math.sin(a) * 0.061, 0.106 - len / 2, Math.cos(a) * 0.061);
        m.rotation.set(-0.25, a, tilt);
      }
    }

    // garments
    const garments = [];
    const G = (id, name, sub, dir, base) => {
      const g = { id, name, sub, dir, base: !!base, meshes: [], on: true, t: 1 };
      garments.push(g);
      return g;
    };
    const put = (g, b, m) => {
      m.userData.garment = g;
      m.userData.baseScale = m.scale.clone();
      m.userData.basePos = m.position.clone();
      g.meshes.push(m);
      B[b].add(m);
      return m;
    };
    def.outfit({ G, put, lathe, limb, sphere, mk, THIGH, SHIN, UARM, FARM, bust, TAU });

    return { root, bones: B, eyes, back, hairParts, garments, def };
  }

  // ---- outfits ----
  function bikini(k, g, col, trim) {
    const { put, lathe, sphere, mk, bust } = k;
    put(g, 'pelvis', mk(lathe([[0.02, -0.054], [0.06, -0.039], [0.084, -0.017], [0.091, 0.0], [0.09, 0.012]], 32, 0, k.TAU, 5), 'lace', col, null, null, [1, 1, 0.8]));
    for (const s of [1, -1]) put(g, 'pelvis', mk(sphere(0.0525, 1, 0.8, 0.9, 24, 12), 'lace', col, [0.034 * s, -0.012, -0.031]));
    for (const s of [1, -1]) {
      put(g, 'chest', mk(sphere(bust + 0.0035, 1, 0.95, 1), 'lace', col, [0.037 * s, 0.07, 0.032], [0.12, 0.25 * s, 0]));
      put(g, 'chest', mk(new THREE.CylinderGeometry(0.0016, 0.0016, 0.1, 5), 'lace', trim, [0.03 * s, 0.13, 0.035], [0.35, 0, 0.3 * s]));
      put(g, 'pelvis', mk(new THREE.TorusGeometry(0.006, 0.0018, 6, 12), 'lace', trim, [0.089 * s, 0.006, 0], [0, Math.PI / 2, 0]));
    }
    put(g, 'chest', mk(new THREE.TorusGeometry(0.07, 0.004, 8, 40), 'lace', col, [0, 0.045, -0.002], [Math.PI / 2, 0, 0], [1, 0.72, 1]));
  }

  function jacketTorso(k, g, b, role, col, lower) {
    const { put, lathe } = k;
    const prof = [[0.07, lower], [0.074, -0.01], [0.082, 0.02], [0.101, 0.06], [0.102, 0.09], [0.088, 0.125], [0.062, 0.15], [0.036, 0.162]];
    put(g, b, k.mk(lathe(prof, 36, 0, k.TAU, 5), role, col, [0, 0, 0.012], null, [1.05, 1, 0.92]));
  }

  function sleeves(k, g, role, col, dU, dF, toWrist) {
    const { put, limb, mk, UARM, FARM } = k;
    for (const L of ['L', 'R']) {
      put(g, 'uArm' + L, mk(limb(0.165, UARM, dU, true), role, col));
      if (toWrist) put(g, 'fArm' + L, mk(limb(0.14, FARM.map((r, i) => r + i * 0.002), dF, false), role, col));
    }
    put(g, 'chest', mk(limb(0.162, [0.03, 0.034, 0.03], dU + 0.002), role, col, [-0.081, 0.133, -0.005], [0, 0, Math.PI / 2], [1, 1, 0.82]));
  }

  const CHARACTERS = [
    {
      key: 'nami', name: 'NAMI', full: 'Nami', height: 1.70, bounty: '฿366,000,000', age: 20, accent: '#f07a2a',
      skin: 0xeab896, hair: 0xf0782c, brow: 0xc0561c, eye: 0x6b3b1f, lip: 0xc8645a, bust: 0.049,
      hairLen: 0.37, hairFlare: 0.085, wavy: true, lockLen: 0.2, fringe: 'swept',
      outfit(k) {
        const { G, put, lathe, limb, sphere, mk, THIGH, SHIN } = k;
        const bomber = G('bomber', 'Bomber', 'cropped leather', 'up');
        jacketTorso(k, bomber, 'chest', 'leather', 0x1d1c21, -0.02);
        sleeves(k, bomber, 'leather', 0x1d1c21, 0.007, 0.006, true);
        put(bomber, 'chest', mk(new THREE.TorusGeometry(0.071, 0.006, 8, 40), 'cloth', 0xe9dfc9, [0, -0.02, 0.012], [Math.PI / 2, 0, 0], [1, 0.96, 1]));
        put(bomber, 'chest', mk(new THREE.TorusGeometry(0.036, 0.009, 8, 32), 'cloth', 0xe9dfc9, [0, 0.158, 0.004], [Math.PI / 2 - 0.2, 0, 0]));
        for (const L of ['L', 'R']) put(bomber, 'fArm' + L, mk(new THREE.TorusGeometry(0.023, 0.005, 8, 24), 'cloth', 0xe9dfc9, [0, -0.14, 0], [Math.PI / 2, 0, 0]));

        const log = G('logpose', 'Log Pose', 'wrist compass', 'up');
        put(log, 'fArmL', mk(new THREE.TorusGeometry(0.0185, 0.0045, 8, 24), 'leather', 0x7a5634, [0, -0.125, 0], [Math.PI / 2, 0, 0]));
        put(log, 'fArmL', mk(sphere(0.011), 'glass', 0xcfe6ee, [0.004, -0.125, 0.021]));
        put(log, 'fArmL', mk(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 16), 'metal', 0xc9a45c, [0.004, -0.125, 0.014], [Math.PI / 2, 0, 0]));

        const top = G('top', 'Tank Top', 'white cotton crop', 'up');
        put(top, 'chest', mk(lathe([[0.066, -0.02], [0.072, 0.01], [0.098, 0.058], [0.099, 0.09], [0.082, 0.118], [0.07, 0.128]], 36, 0, k.TAU, 5), 'cloth', 0xefebe3, [0, 0, 0.011], null, [1.05, 1, 0.92]));
        for (const s of [1, -1]) put(top, 'chest', mk(new THREE.TorusGeometry(0.04, 0.004, 6, 18, Math.PI), 'cloth', 0xefebe3, [0.046 * s, 0.128, 0.002], [0, Math.PI / 2, 0], [1.2, 1, 1]));

        const jeans = G('jeans', 'Flare Jeans', 'low rise denim', 'down');
        put(jeans, 'pelvis', mk(lathe([[0.034, -0.054], [0.064, -0.04], [0.086, -0.017], [0.094, 0.005], [0.091, 0.035]], 36, 0, k.TAU, 5), 'denim', 0x2c4665, null, null, [1, 1, 0.8]));
        for (const s of [1, -1]) put(jeans, 'pelvis', mk(sphere(0.056, 1, 0.95, 0.9), 'denim', 0x2c4665, [0.034 * s, -0.005, -0.031]));
        put(jeans, 'pelvis', mk(new THREE.TorusGeometry(0.091, 0.005, 8, 44), 'denim', 0x223752, [0, 0.035, 0], [Math.PI / 2, 0, 0], [1, 0.8, 1]));
        for (const L of ['L', 'R']) {
          put(jeans, 'thigh' + L, mk(limb(0.238, THIGH, 0.006, false), 'denim', 0x2c4665));
          put(jeans, 'shin' + L, mk(limb(0.246, [0.04, 0.042, 0.04, 0.042, 0.054], 0, false), 'denim', 0x2c4665, [0, 0.014, 0]));
        }

        const heels = G('heels', 'Heels', 'tan leather', 'down');
        for (const L of ['L', 'R']) {
          put(heels, 'foot' + L, mk(sphere(0.027, 0.8, 0.88, 1.95), 'leather', 0xc79d66, [0, -0.014, 0.03]));
          put(heels, 'foot' + L, mk(new THREE.CylinderGeometry(0.004, 0.007, 0.034, 10), 'leather', 0x8f6a3e, [0, -0.036, -0.018]));
          put(heels, 'shin' + L, mk(new THREE.TorusGeometry(0.021, 0.0035, 6, 20), 'leather', 0xc79d66, [0, -0.215, 0], [Math.PI / 2, 0, 0]));
        }

        bikini(k, G('bikini', 'Bikini', 'base layer', 'none', true), 0x4b8d6a, 0xe9dfc9);
      }
    },
    {
      key: 'robin', name: 'ROBIN', full: 'Nico Robin', height: 1.88, bounty: '฿930,000,000', age: 30, accent: '#8f7bd6',
      skin: 0xd49e7a, hair: 0x1e1b27, brow: 0x15121c, eye: 0x2f4d8c, lip: 0xa8545a, bust: 0.051,
      hairLen: 0.42, hairFlare: 0.07, wavy: false, lockLen: 0.24, fringe: 'blunt',
      outfit(k) {
        const { G, put, lathe, limb, sphere, mk, SHIN } = k;
        const coat = G('coat', 'Trench Coat', 'long plum wool', 'up');
        jacketTorso(k, coat, 'chest', 'cloth', 0x3b3048, -0.03);
        put(coat, 'spine', mk(lathe([[0.078, -0.02], [0.068, 0.03], [0.064, 0.06], [0.066, 0.09], [0.074, 0.115]], 32, 0, k.TAU, 5), 'cloth', 0x3b3048, [0, 0, 0.006], null, [1, 1, 0.86]));
        put(coat, 'pelvis', mk(lathe([[0.165, -0.31], [0.132, -0.16], [0.104, -0.03], [0.097, 0.02], [0.08, 0.085], [0.076, 0.105]], 40, 0.32, k.TAU - 0.64, 5), 'cloth', 0x3b3048, null, null, [1, 1, 0.92]));
        sleeves(k, coat, 'cloth', 0x3b3048, 0.008, 0.007, true);
        put(coat, 'spine', mk(new THREE.TorusGeometry(0.067, 0.006, 8, 40), 'leather', 0xb6a283, [0, 0.06, 0.006], [Math.PI / 2, 0, 0], [1, 0.86, 1]));
        put(coat, 'chest', mk(new THREE.TorusGeometry(0.04, 0.012, 8, 32), 'cloth', 0x2e2539, [0, 0.155, 0.002], [Math.PI / 2 - 0.35, 0, 0]));

        const shades = G('shades', 'Sunglasses', 'pushed up', 'up');
        for (const s of [1, -1]) put(shades, 'head', mk(sphere(0.016, 1.25, 0.8, 0.3), 'darkglass', 0x0b0b0e, [0.024 * s, 0.117, 0.049], [-0.75, 0.3 * s, 0]));
        put(shades, 'head', mk(new THREE.CylinderGeometry(0.0022, 0.0022, 0.02, 6), 'metal', 0xd4d6db, [0, 0.118, 0.056], [0, 0, Math.PI / 2]));

        const top = G('top', 'Halter Top', 'cream silk', 'up');
        put(top, 'chest', mk(lathe([[0.066, -0.01], [0.073, 0.015], [0.098, 0.058], [0.099, 0.09], [0.082, 0.12], [0.062, 0.13]], 36, 0, k.TAU, 5), 'silk', 0xd9cfbe, [0, 0, 0.011], null, [1.05, 1, 0.92]));
        put(top, 'neck', mk(new THREE.TorusGeometry(0.03, 0.005, 8, 28), 'silk', 0xd9cfbe, [0, 0.0, 0.004], [Math.PI / 2 - 0.25, 0, 0]));

        const skirt = G('skirt', 'Wrap Skirt', 'black crepe, side slit', 'down');
        put(skirt, 'pelvis', mk(lathe([[0.104, -0.1], [0.101, -0.04], [0.1, 0.0], [0.085, 0.05], [0.064, 0.1]], 40, 0, k.TAU, 5), 'silk', 0x141418, null, null, [1, 1, 0.97]));
        put(skirt, 'pelvis', mk(lathe([[0.138, -0.36], [0.125, -0.26], [0.113, -0.17], [0.104, -0.09]], 40, -Math.PI / 2 + 0.42, k.TAU - 0.84, 5), 'silk', 0x141418, null, null, [1, 1, 0.95]));

        const boots = G('boots', 'Boots', 'knee high', 'down');
        for (const L of ['L', 'R']) {
          put(boots, 'shin' + L, mk(limb(0.235, SHIN.map(r => r + 0.002), 0.006, false), 'leather', 0x101012, [0, 0.012, 0]));
          put(boots, 'foot' + L, mk(sphere(0.028, 0.82, 0.9, 1.95), 'leather', 0x101012, [0, -0.014, 0.03]));
          put(boots, 'foot' + L, mk(new THREE.CylinderGeometry(0.005, 0.008, 0.034, 10), 'leather', 0x0a0a0b, [0, -0.036, -0.018]));
        }

        bikini(k, G('lace', 'Lace Set', 'base layer', 'none', true), 0x5a3a70, 0x2a1a36);
      }
    }
  ];

  const POSES = [
    {
      key: 'stand', name: 'Contrapposto', sub: 'weight on the left leg',
      b: {
        pelvis: [0, 0.08, 0.05], spine: [0.03, -0.04, -0.04], chest: [-0.02, -0.03, -0.035], neck: [0.02, 0, 0.02], head: [0.04, -0.12, 0.06],
        uArmL: [0.05, 0, 0.2], fArmL: [-0.25, 0, 0.05], handL: [0, 0, 0.1],
        uArmR: [0.08, 0, -0.22], fArmR: [-0.32, 0, -0.05], handR: [0, 0, -0.1],
        thighL: [0, 0, -0.07], shinL: [0.02, 0, 0], footL: [0, 0.1, 0.02],
        thighR: [-0.2, 0.1, 0.02], shinR: [0.38, 0, 0], footR: [0.25, -0.1, 0]
      }
    },
    {
      key: 'hips', name: 'Hands on Hips', sub: 'captain on deck',
      b: {
        pelvis: [0, 0, 0], spine: [0.04, 0, 0], chest: [-0.06, 0, 0], neck: [0, 0, 0], head: [0.06, 0.08, 0.05],
        uArmL: [0.25, 0, 0.7], fArmL: [0, 0, -1.5], handL: [0, 0, -0.3],
        uArmR: [0.25, 0, -0.7], fArmR: [0, 0, 1.5], handR: [0, 0, 0.3],
        thighL: [-0.02, 0, 0.07], shinL: [0.03, 0, -0.03], footL: [0, 0.25, -0.04],
        thighR: [-0.02, 0, -0.07], shinR: [0.03, 0, 0.03], footR: [0, -0.25, 0.04]
      }
    },
    {
      key: 'hair', name: 'Hands in Hair', sub: 'arched, chin up',
      b: {
        pelvis: [0, 0.12, 0.04], spine: [-0.02, -0.05, -0.02], chest: [-0.08, -0.04, -0.03], neck: [-0.04, 0, 0], head: [-0.08, 0.15, 0.08],
        uArmL: [-0.25, 0, 2.45], fArmL: [0, 0, 1.75], handL: [0.3, 0, 0.4],
        uArmR: [-0.25, 0, -2.45], fArmR: [0, 0, -1.75], handR: [0.3, 0, -0.4],
        thighL: [0, 0, -0.05], shinL: [0.02, 0, 0], footL: [0, 0.1, 0],
        thighR: [-0.14, 0.05, 0.09], shinR: [0.22, 0, 0], footR: [0.2, 0, 0]
      }
    }
  ];

  window.Figure = { build, CHARACTERS, POSES };
})();
