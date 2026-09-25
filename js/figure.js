(function () {
  const ARM_BIND = 0.25;
  const BONE_LAYOUT = [
    ['pelvis', null, 0, 0.5, 0], ['spine', 'pelvis', 0, 0.06, 0], ['chest', 'spine', 0, 0.1, 0],
    ['neck', 'chest', 0, 0.155, 0], ['head', 'neck', 0, 0.045, 0]
  ];
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    BONE_LAYOUT.push(
      ['uArm' + L, 'chest', 0.088 * s, 0.135, -0.005], ['fArm' + L, 'uArm' + L, 0, -0.165, 0], ['hand' + L, 'fArm' + L, 0, -0.145, 0],
      ['thigh' + L, 'pelvis', 0.048 * s, -0.012, 0], ['shin' + L, 'thigh' + L, 0, -0.225, 0], ['foot' + L, 'shin' + L, 0, -0.225, 0]);
  }

  function decode(model) {
    if (model._bin) return model._bin;
    const s = atob(model.bin);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    model._bin = u.buffer;
    return model._bin;
  }

  function geometry(model, p) {
    const bin = decode(model);
    const g = new THREE.BufferGeometry();
    const q = new Int16Array(bin, p.pos, p.n * 3);
    const f = new Float32Array(p.n * 3);
    for (let i = 0; i < f.length; i++) f[i] = q[i] * model.posScale;
    g.setAttribute('position', new THREE.BufferAttribute(f, 3));
    const Idx = p.idxType === 'u16' ? Uint16Array : Uint32Array;
    g.setIndex(new THREE.BufferAttribute(new Idx(bin, p.idx, p.tris * 3), 1));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(bin, p.j, p.n * 4), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(bin, p.w, p.n * 4), 4, true));
    if (p.uv != null) g.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(bin, p.uv, p.n * 2), 2, true));
    g.computeVertexNormals();
    return g;
  }

  // ---- painted anime face (UV rect covers x -0.055..0.055, y 0.87..0.98 of the figure) ----
  function drawFace(def, closed) {
    const N = 1024, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const U = x => (x + 0.055) / 0.11 * N;
    const V = y => (1 - (y - 0.87) / 0.11) * N;
    const px = d => d / 0.11 * N;
    const f = def.face;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // blush
    for (const s of [1, -1]) {
      const gr = g.createRadialGradient(U(0.03 * s), V(0.902), 0, U(0.03 * s), V(0.902), px(0.014));
      gr.addColorStop(0, 'rgba(235,110,110,.32)');
      gr.addColorStop(1, 'rgba(235,110,110,0)');
      g.fillStyle = gr;
      g.fillRect(U(0.03 * s) - px(0.02), V(0.902) - px(0.02), px(0.04), px(0.04));
    }
    for (const s of [1, -1]) {
      const cx = U(0.0215 * s), cy = V(0.924), w = px(f.eyeW), h = px(f.eyeH);
      g.save();
      g.translate(cx, cy);
      g.scale(s, 1);
      if (closed) {
        g.strokeStyle = '#1b1110';
        g.lineWidth = px(0.0022);
        g.beginPath();
        g.moveTo(-w * 0.55, -h * 0.05);
        g.quadraticCurveTo(0, h * 0.28, w * 0.6, -h * 0.12);
        g.stroke();
      } else {
        // sclera
        g.fillStyle = '#fbf8f4';
        g.beginPath();
        g.moveTo(-w * 0.55, h * 0.05);
        g.bezierCurveTo(-w * 0.4, -h * 0.55 * f.lid, w * 0.35, -h * 0.62 * f.lid, w * 0.58, -h * 0.15);
        g.bezierCurveTo(w * 0.45, h * 0.5, -w * 0.3, h * 0.55, -w * 0.55, h * 0.05);
        g.fill();
        g.save();
        g.clip();
        // iris
        const ir = h * 0.62;
        const ig = g.createLinearGradient(0, -ir, 0, ir);
        ig.addColorStop(0, f.irisTop);
        ig.addColorStop(0.55, f.iris);
        ig.addColorStop(1, f.irisLow);
        g.fillStyle = ig;
        g.beginPath();
        g.ellipse(w * 0.04, h * 0.02, ir * 0.78, ir, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(20,10,10,.55)';
        g.lineWidth = px(0.0009);
        g.stroke();
        g.fillStyle = '#120a0a';
        g.beginPath();
        g.ellipse(w * 0.04, h * 0.02, ir * 0.36, ir * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(0,0,0,.28)';
        g.fillRect(-w, -h, w * 2, h * 0.42);
        g.restore();
        // highlights
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(-w * 0.1, -h * 0.2, ir * 0.24, ir * 0.3, -0.3, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(w * 0.2, h * 0.28, ir * 0.1, ir * 0.1, 0, 0, Math.PI * 2);
        g.fill();
        // upper lash line with wing
        g.strokeStyle = '#1b1110';
        g.fillStyle = '#1b1110';
        g.lineWidth = px(0.0028);
        g.beginPath();
        g.moveTo(-w * 0.58, h * 0.08);
        g.bezierCurveTo(-w * 0.4, -h * 0.58 * f.lid, w * 0.35, -h * 0.66 * f.lid, w * 0.62, -h * 0.18);
        g.lineTo(w * 0.78, -h * 0.34);
        g.stroke();
        g.lineWidth = px(0.0009);
        g.beginPath();
        g.moveTo(-w * 0.2, h * 0.5);
        g.quadraticCurveTo(w * 0.2, h * 0.56, w * 0.5, h * 0.25);
        g.stroke();
      }
      // brow
      g.strokeStyle = f.brow;
      g.lineWidth = px(0.0016);
      g.beginPath();
      g.moveTo(-w * 0.45, -px(0.0205));
      g.quadraticCurveTo(w * 0.1, -px(0.0245), w * 0.62, -px(0.0185) + f.browTilt * px(0.01));
      g.stroke();
      g.restore();
    }
    // nose + mouth
    g.strokeStyle = 'rgba(150,80,60,.55)';
    g.lineWidth = px(0.001);
    g.beginPath();
    g.moveTo(U(0.001), V(0.9045));
    g.lineTo(U(-0.0015), V(0.9005));
    g.stroke();
    g.strokeStyle = f.lip;
    g.lineWidth = px(0.0014);
    g.beginPath();
    g.moveTo(U(-0.0075), V(0.8865));
    g.quadraticCurveTo(U(0), V(0.8845 - f.smile * 0.002), U(0.0075), V(0.8865));
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  function prim(geo, role, color, pos, rot) {
    const m = new THREE.Mesh(geo);
    m.userData.role = role;
    m.userData.color = color;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    return m;
  }

  function build(def) {
    const model = window.MODELS && window.MODELS[def.key];
    if (!model) throw new Error('model data missing for ' + def.key);
    const root = new THREE.Group();
    const B = {};
    for (const [name, parent, x, y, z] of BONE_LAYOUT) {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x, y, z);
      (parent ? B[parent] : root).add(b);
      B[name] = b;
    }
    B.uArmL.rotation.z = ARM_BIND;
    B.uArmR.rotation.z = -ARM_BIND;
    root.scale.setScalar(def.height);
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(model.bones.map(n => B[n]));

    const garments = def.garments.map(g => Object.assign({ meshes: [], on: true }, g));
    const byId = Object.fromEntries(garments.map(g => [g.id, g]));
    let face = null;
    for (const p of model.parts) {
      const m = new THREE.SkinnedMesh(geometry(model, p));
      m.userData.role = p.role;
      m.userData.color = parseInt(p.color.slice(1), 16);
      m.userData.skinned = true;
      m.frustumCulled = false;
      root.add(m);
      m.updateMatrixWorld(true);
      m.bind(skeleton, m.matrixWorld);
      if (p.kind === 'face') face = m;
      if (p.kind === 'garment') {
        const g = byId[p.garment];
        m.userData.garment = g;
        m.userData.dir = g.dir;
        g.meshes.push(m);
      }
    }
    for (const g of garments) {
      if (!g.accessory) continue;
      for (const [bone, mesh] of g.accessory()) {
        mesh.userData.garment = g;
        B[bone].add(mesh);
        g.meshes.push(mesh);
      }
    }
    const faceTex = { open: drawFace(def, false), closed: drawFace(def, true) };
    return { root, bones: B, skeleton, face, faceTex, garments, def };
  }

  const CHARACTERS = [
    {
      key: 'nami', name: 'NAMI', full: 'Nami', height: 1.70, bounty: '฿366,000,000', age: 20,
      face: { eyeW: 0.024, eyeH: 0.021, lid: 1, iris: '#8a4a22', irisTop: '#3a1a0c', irisLow: '#d98b4a', brow: '#b4541c', browTilt: 0.3, lip: '#b85a50', smile: 1 },
      garments: [
        { id: 'bomber', name: 'Bomber', sub: 'cropped leather', dir: 'up' },
        {
          id: 'logpose', name: 'Log Pose', sub: 'wrist compass', dir: 'up',
          accessory: () => [
            ['fArmL', prim(new THREE.TorusGeometry(0.0172, 0.004, 10, 28), 'leather', 0x7a5634, [0, -0.128, 0], [Math.PI / 2, 0, 0])],
            ['fArmL', prim(new THREE.SphereGeometry(0.0105, 20, 14), 'glass', 0xcfe6ee, [0.003, -0.128, 0.02])],
            ['fArmL', prim(new THREE.CylinderGeometry(0.0115, 0.0115, 0.004, 20), 'metal', 0xc9a45c, [0.003, -0.128, 0.013], [Math.PI / 2, 0, 0])]
          ]
        },
        { id: 'top', name: 'Tank Top', sub: 'white cotton crop', dir: 'up' },
        { id: 'jeans', name: 'Flare Jeans', sub: 'low rise denim', dir: 'down' },
        { id: 'heels', name: 'Sandals', sub: 'tan leather', dir: 'down' },
        { id: 'bikini', name: 'Bikini', sub: 'base layer', dir: 'none', base: true }
      ]
    },
    {
      key: 'robin', name: 'ROBIN', full: 'Nico Robin', height: 1.88, bounty: '฿930,000,000', age: 30,
      face: { eyeW: 0.025, eyeH: 0.017, lid: 0.8, iris: '#2e5aa8', irisTop: '#0e1a3a', irisLow: '#6fa0e0', brow: '#141019', browTilt: -0.2, lip: '#9c4a52', smile: 0.4 },
      garments: [
        { id: 'coat', name: 'Trench Coat', sub: 'long plum wool', dir: 'up' },
        {
          id: 'shades', name: 'Sunglasses', sub: 'pushed up', dir: 'up',
          accessory: () => [
            ['head', prim(new THREE.SphereGeometry(0.016, 20, 12).scale(1.25, 0.8, 0.3), 'darkglass', 0x0b0b0e, [0.024, 0.113, 0.057], [-0.75, 0.3, 0])],
            ['head', prim(new THREE.SphereGeometry(0.016, 20, 12).scale(1.25, 0.8, 0.3), 'darkglass', 0x0b0b0e, [-0.024, 0.113, 0.057], [-0.75, -0.3, 0])],
            ['head', prim(new THREE.CylinderGeometry(0.0022, 0.0022, 0.02, 6), 'metal', 0xd4d6db, [0, 0.114, 0.063], [0, 0, Math.PI / 2])]
          ]
        },
        { id: 'top', name: 'Silk Top', sub: 'cream, scoop neck', dir: 'up' },
        { id: 'skirt', name: 'Wrap Skirt', sub: 'black crepe, side slit', dir: 'down' },
        { id: 'boots', name: 'Boots', sub: 'knee high', dir: 'down' },
        { id: 'lace', name: 'Lace Set', sub: 'base layer', dir: 'none', base: true }
      ]
    }
  ];

  const POSES = [
    {
      key: 'stand', name: 'Contrapposto', sub: 'weight on the left leg',
      b: {
        pelvis: [0, 0.08, 0.05], spine: [0.03, -0.04, -0.04], chest: [-0.02, -0.03, -0.035], neck: [0.02, 0, 0.02], head: [0.04, -0.12, 0.06],
        uArmL: [0.05, 0, 0.22], fArmL: [-0.25, 0, 0.05], handL: [0, 0, 0.1],
        uArmR: [0.08, 0, -0.24], fArmR: [-0.32, 0, -0.05], handR: [0, 0, -0.1],
        thighL: [0, 0, -0.07], shinL: [0.02, 0, 0], footL: [0, 0.1, 0.02],
        thighR: [-0.2, 0.1, 0.02], shinR: [0.38, 0, 0], footR: [0.25, -0.1, 0]
      }
    },
    {
      key: 'hips', name: 'Hands on Hips', sub: 'captain on deck',
      b: {
        pelvis: [0, 0, 0], spine: [0.04, 0, 0], chest: [-0.06, 0, 0], neck: [0, 0, 0], head: [0.06, 0.08, 0.05],
        uArmL: [0.25, 0, 0.72], fArmL: [0, 0, -1.5], handL: [0, 0, -0.3],
        uArmR: [0.25, 0, -0.72], fArmR: [0, 0, 1.5], handR: [0, 0, 0.3],
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
