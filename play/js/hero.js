(function () {
  'use strict';
  // Hero: a glass "play" over a blurred "together", dark dunes with chromatic streaks,
  // and a liquid lens that follows the cursor and splits light at its edges.
  const P = window.Play;
  const hero = document.getElementById('hero'), canvas = document.getElementById('hero-gl');
  if (!hero || !canvas) return;
  let gl = null;
  try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) return;

  const VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
  const FS = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime, uIntro, uBlur, uRefr, uLensOn;
uniform vec3 uLens;
uniform vec2 uVel;

const vec3 SUN = vec3(1.0, 0.82, 0.25);
const vec3 EMBER = vec3(1.0, 0.48, 0.10);
const vec3 ROSE = vec3(1.0, 0.24, 0.50);
const vec3 VIOLET = vec3(0.54, 0.42, 1.0);
const vec3 ICE = vec3(0.37, 0.83, 1.0);
const vec3 INK = vec3(0.024, 0.024, 0.028);

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float ease(float x){ x = clamp(x, 0.0, 1.0); return 1.0 - pow(1.0 - x, 3.0); }
vec3 ramp(float x){
  x = fract(x);
  vec3 c = mix(SUN, EMBER, smoothstep(0.0, 0.25, x));
  c = mix(c, ROSE, smoothstep(0.25, 0.5, x));
  c = mix(c, VIOLET, smoothstep(0.5, 0.75, x));
  return mix(c, ICE, smoothstep(0.75, 1.0, x));
}

vec3 backdrop(vec2 uv){
  float x = uv.x * uRes.x / uRes.y, t = uTime;
  vec3 col = mix(vec3(0.032, 0.032, 0.04), vec3(0.012, 0.012, 0.016), uv.y);
  float d1 = 0.60 + 0.07 * sin(x * 1.3 + t * 0.12) + 0.04 * sin(x * 2.9 - t * 0.19);
  float d2 = 0.36 + 0.07 * sin(x * 1.1 - t * 0.09 + 2.0) + 0.03 * sin(x * 3.3 + t * 0.14);
  float d3 = 0.14 + 0.05 * sin(x * 1.6 + t * 0.07 + 4.0) + 0.03 * sin(x * 2.4 - t * 0.11);
  col = mix(col, vec3(0.15, 0.15, 0.17), smoothstep(d1 + 0.02, d1 - 0.22, uv.y) * 0.9);
  col += vec3(0.95, 0.95, 1.0) * exp(-pow((uv.y - d1 + 0.03) / 0.07, 2.0)) * 0.36;
  col = mix(col, vec3(0.014, 0.014, 0.018), smoothstep(d2 + 0.06, d2 - 0.10, uv.y));
  col += vec3(0.8) * exp(-pow((uv.y - d2 + 0.015) / 0.035, 2.0)) * 0.12;
  col = mix(col, vec3(0.085, 0.085, 0.095), smoothstep(d3 + 0.05, d3 - 0.12, uv.y) * 0.8);
  float lum = dot(col, vec3(0.333));
  col += step(0.93, hash(floor(uv * uRes / 2.0))) * smoothstep(0.07, 0.3, lum) * 0.16;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y0 = 0.41 + fi * 0.042 + 0.02 * sin(t * 0.3 + fi * 2.1);
    float th = 0.0022 + 0.003 * fract(fi * 0.37);
    float line = exp(-pow((uv.y - y0) / th, 2.0));
    float glow = exp(-pow((uv.y - y0) / (th * 8.0), 2.0)) * 0.22;
    float xs = 0.18 + 0.28 * fract(fi * 0.61) + 0.08 * sin(t * 0.2 + fi);
    float span = smoothstep(xs - 0.25, xs + 0.1, uv.x) * smoothstep(xs + 0.8, xs + 0.3, uv.x);
    col += ramp(uv.x * 0.9 + fi * 0.23 + t * 0.03) * (line * 0.85 + glow) * span;
  }
  return col;
}

float ghost(vec2 uv){
  float g = 0.0, dx = uBlur * 0.09 / uRes.x;
  for (int i = -4; i <= 4; i++) g += texture2D(uTex, uv + vec2(float(i) * dx, 0.0)).r * (1.0 - abs(float(i)) * 0.1);
  return g / 7.0;
}

vec3 scene(vec2 uv){
  float gi = ease(uIntro * 1.6);
  return mix(backdrop(uv), vec3(0.94, 0.94, 0.96), ghost(uv + vec2((1.0 - gi) * 0.05, 0.0)) * 0.9 * gi);
}

vec3 glassNormal(vec2 uv, out float m){
  vec2 e = vec2(1.5 / uRes.x, 0.0), f = vec2(0.0, 1.5 / uRes.y);
  m = texture2D(uTex, uv).g;
  float dx = texture2D(uTex, uv + e).b - texture2D(uTex, uv - e).b;
  float dy = texture2D(uTex, uv + f).b - texture2D(uTex, uv - f).b;
  return normalize(vec3(-vec2(dx, dy) / 3.0 * uBlur * 1.7, 1.0));
}

vec3 glassShade(vec2 uv, vec3 n, vec3 refr){
  float fres = pow(1.0 - n.z, 1.2);
  vec3 col = refr * 0.8 + 0.03;
  // studio strip reflection, like the chrome gradient: bright sky, dark horizon, soft floor
  float ry = n.y * 1.4 + (uv.y - 0.5) * 1.1;
  float env = smoothstep(-0.02, 0.3, ry) * 0.85 + exp(-pow((ry + 0.3) / 0.1, 2.0)) * 0.45 + exp(-pow((ry - 0.55) / 0.06, 2.0)) * 0.5;
  col += vec3(env) * (0.1 + fres * 0.9);
  // vertical strokes catch the side lights: bright left rim, softer right one, darker core
  float side = exp(-pow((n.x + 0.42) / 0.14, 2.0)) * 0.75 + exp(-pow((n.x - 0.55) / 0.12, 2.0)) * 0.35;
  col += vec3(side) * fres * vec3(0.97, 0.98, 1.0);
  col *= 1.0 - 0.18 * smoothstep(0.93, 1.0, n.z);
  col += pow(max(dot(n, normalize(vec3(-0.45, 0.65, 0.6))), 0.0), 28.0) * 1.1;
  col += pow(max(dot(n, normalize(vec3(0.6, -0.5, 0.6))), 0.0), 40.0) * 0.35 * vec3(0.9, 0.95, 1.0);
  return col;
}

vec3 composite(vec2 uv, bool fancy){
  float ci = ease((uIntro - 0.15) * 1.4);
  float m;
  vec3 n = glassNormal(uv + vec2(0.0, (1.0 - ci) * 0.1), m);
  m *= ci;
  vec3 base = scene(uv);
  if (m < 0.002) return base;
  vec2 off = n.xy * uRefr / uRes;
  vec3 refr;
  if (fancy) {
    float d = 0.12 + 0.55 * (1.0 - n.z);
    refr = vec3(scene(uv + off * (1.0 + d)).r, scene(uv + off).g, scene(uv + off * (1.0 - d)).b);
  } else refr = scene(uv + off);
  return mix(base, glassShade(uv, n, refr), m);
}

void main(){
  vec2 fc = gl_FragCoord.xy, uv = fc / uRes;
  float R = uLens.z * uLensOn;
  vec2 p = fc - uLens.xy;
  float sp = length(uVel);
  vec2 dir = sp > 0.0001 ? uVel / sp : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float k = clamp(sp, 0.0, 0.5);
  vec2 q = vec2(dot(p, dir) / (1.0 + k), dot(p, nrm) * (1.0 + k * 0.4));
  float ang = atan(q.y, q.x) + atan(dir.y, dir.x);
  float wob = 1.0 + 0.045 * sin(ang * 3.0 + uTime * 1.1) + 0.03 * sin(ang * 5.0 - uTime * 1.7) + 0.02 * sin(ang * 2.0 + uTime * 0.6);
  float r = max(R * wob, 1.0);
  float rho = length(q) / r;
  vec3 col;
  if (R > 2.0 && rho < 1.0) {
    float z = sqrt(1.0 - rho * rho);
    float bend = mix(1.45, 0.58, z);
    float disp = 0.02 + 0.12 * pow(1.0 - z, 2.0);
    vec2 s = p * bend;
    vec3 c = vec3(
      composite((uLens.xy + s * (1.0 + disp)) / uRes, false).r,
      composite((uLens.xy + s) / uRes, false).g,
      composite((uLens.xy + s * (1.0 - disp)) / uRes, false).b);
    vec3 N = normalize(vec3(q / r, z));
    c = c * 1.05 + 0.015;
    c += ramp(ang / 6.2831 + uTime * 0.04) * smoothstep(0.78, 1.0, rho) * 0.32;
    c += pow(max(dot(N, normalize(vec3(-0.5, 0.6, 0.62))), 0.0), 55.0) * 1.4;
    c += smoothstep(0.9, 0.995, rho) * 0.28;
    float aa = smoothstep(1.0, 1.0 - 2.0 / r, rho);
    col = aa > 0.999 ? c : mix(composite(uv, true), c, aa);
  } else {
    col = composite(uv, true);
    if (R > 2.0) col *= 1.0 - 0.3 * exp(-(rho - 1.0) * r / 36.0);
  }
  vec2 vc = (uv - 0.5) * vec2(0.9, 1.2);
  col *= 1.0 - 0.45 * dot(vc, vc);
  col = mix(col, INK, smoothstep(0.16, 0.0, uv.y) * 0.92);
  col = mix(col, INK, smoothstep(0.86, 1.0, uv.y) * 0.5);
  col += (hash(fc + fract(uTime * 7.13) * 91.7) - 0.5) * 0.045;
  gl_FragColor = vec4(col, 1.0);
}`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  ['uTex', 'uRes', 'uTime', 'uIntro', 'uBlur', 'uRefr', 'uLensOn', 'uLens', 'uVel'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.uniform1i(U.uTex, 0);
  hero.classList.add('gl-on');

  // Text texture: R = ghost word, G = glass word mask, B = blurred glass word (its bevel height).
  const tc = document.createElement('canvas'), tx = tc.getContext('2d');
  const FONT = 'Unbounded, "Arial Black", Impact, sans-serif';
  let W = 2, H = 2, scale = 1, fsPx = 100, blurPx = 8;
  function paint() {
    tc.width = W; tc.height = H;
    tx.globalCompositeOperation = 'source-over';
    tx.fillStyle = '#000'; tx.fillRect(0, 0, W, H);
    tx.globalCompositeOperation = 'lighter';
    tx.textAlign = 'center'; tx.textBaseline = 'alphabetic';
    tx.font = `900 100px ${FONT}`;
    const narrow = W < H * 0.9;
    fsPx = Math.min((W * (narrow ? 0.9 : 0.74)) / tx.measureText('play').width * 100, H * 0.44);
    tx.font = `900 ${fsPx}px ${FONT}`;
    const m = tx.measureText('play');
    const asc = m.actualBoundingBoxAscent || fsPx * 0.76, desc = m.actualBoundingBoxDescent || fsPx * 0.22;
    const cx = W / 2, base = H * (narrow ? 0.47 : 0.5) + (asc - desc) / 2;
    // the ghost word runs wider than the glass one, so it shows on both sides
    tx.font = `700 100px ${FONT}`;
    const gs = Math.min(fsPx * 0.62, (W * 0.94) / tx.measureText('together').width * 100);
    tx.font = `700 ${gs}px ${FONT}`;
    tx.fillStyle = '#ff0000';
    tx.shadowColor = '#ff0000'; tx.shadowBlur = Math.max(2, fsPx * 0.012);
    tx.fillText('together', cx + fsPx * 0.04, base - fsPx * 0.14);
    tx.shadowColor = 'rgba(0,0,0,0)'; tx.shadowBlur = 0;
    tx.font = `900 ${fsPx}px ${FONT}`;
    tx.fillStyle = '#00ff00';
    tx.fillText('play', cx, base);
    // only the shadow lands on the canvas: that is the blurred copy
    blurPx = Math.max(5, fsPx * 0.13);
    tx.shadowColor = '#0000ff'; tx.shadowBlur = blurPx; tx.shadowOffsetX = W + 200; tx.shadowOffsetY = 0;
    tx.fillStyle = '#0000ff';
    tx.fillText('play', cx - W - 200, base);
    tx.shadowColor = 'rgba(0,0,0,0)'; tx.shadowBlur = 0; tx.shadowOffsetX = 0;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, tc);
  }

  const lens = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, on: 0 };
  function resize() {
    const r = hero.getBoundingClientRect();
    let s = Math.min(window.devicePixelRatio || 1, 1.5);
    const px = r.width * r.height * s * s;
    if (px > 2.3e6) s *= Math.sqrt(2.3e6 / px);
    scale = s;
    W = Math.max(2, Math.round(r.width * s)); H = Math.max(2, Math.round(r.height * s));
    canvas.width = W; canvas.height = H;
    gl.viewport(0, 0, W, H);
    paint();
    if (!lens.x) { lens.x = lens.tx = W * 0.64; lens.y = lens.ty = H * 0.52; }
  }
  resize();
  let rz = 0;
  addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(resize); });

  let lastMove = -1e9;
  const aim = e => {
    const r = canvas.getBoundingClientRect();
    lens.tx = (e.clientX - r.left) * scale; lens.ty = (r.bottom - e.clientY) * scale;
    lastMove = performance.now();
  };
  hero.addEventListener('pointermove', aim);
  hero.addEventListener('pointerdown', aim);

  const t0 = performance.now();
  let introStart = null, running = false, inView = true, last = t0;
  const begin = () => { if (introStart == null) { paint(); introStart = P.reduced ? performance.now() - 5000 : performance.now(); } };
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load(`900 100px ${FONT}`), document.fonts.load(`700 100px ${FONT}`)]).then(begin, begin);
  }
  setTimeout(begin, 1600);

  function frame(now) {
    if (!running) return;
    // a game is open on top: don't spend the GPU on a hidden hero
    if (P.arena && P.arena.state !== 'closed') { last = now; requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = P.reduced ? 18 : (now - t0) / 1000;
    const idle = now - lastMove > 2600;
    if (idle && !P.reduced) {
      lens.tx = W * (0.5 + 0.3 * Math.sin(t * 0.37));
      lens.ty = H * (0.52 + 0.13 * Math.sin(t * 0.61 + 1.3));
    }
    const px = lens.x, py = lens.y, k = 1 - Math.exp(-dt * (idle ? 2 : 10));
    lens.x += (lens.tx - lens.x) * k; lens.y += (lens.ty - lens.y) * k;
    const inv = 1 / Math.max(dt, 1e-3);
    lens.vx += ((lens.x - px) * inv - lens.vx) * 0.2; lens.vy += ((lens.y - py) * inv - lens.vy) * 0.2;
    const intro = introStart == null ? 0 : Math.min(1, (now - introStart) / 1900);
    lens.on += ((intro > 0.5 ? 1 : 0) - lens.on) * (1 - Math.exp(-dt * 3.2));
    const R = Math.max(60 * scale, Math.min(W, H) * (W < H ? 0.19 : 0.2));
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uIntro, intro);
    gl.uniform1f(U.uBlur, blurPx);
    gl.uniform1f(U.uRefr, fsPx * 0.16);
    gl.uniform1f(U.uLensOn, P.reduced ? 1 : lens.on);
    gl.uniform3f(U.uLens, lens.x, lens.y, R);
    gl.uniform2f(U.uVel, lens.vx / (R * 9), lens.vy / (R * 9));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  }
  function setRunning() {
    const want = inView && !document.hidden;
    if (want && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    else if (!want) running = false;
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { inView = es[0].isIntersecting; setRunning(); }).observe(hero);
  document.addEventListener('visibilitychange', setRunning);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); running = false; hero.classList.remove('gl-on'); });
  setRunning();
})();
