"""SDF sculpting kit: primitives, meshing, skin weights and a compact binary export for the browser."""
import base64
import json
import numpy as np
import pyfqmr
import scipy.sparse as sp
from skimage.measure import marching_cubes

F = np.float32


def length(x, y, z):
    return np.sqrt(x * x + y * y + z * z)


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def rot(ax=0.0, ay=0.0, az=0.0):
    cx, sx, cy, sy, cz, sz = np.cos(ax), np.sin(ax), np.cos(ay), np.sin(ay), np.cos(az), np.sin(az)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rx @ Ry @ Rz


def local(P, c, R=None):
    x, y, z = P[0] - F(c[0]), P[1] - F(c[1]), P[2] - F(c[2])
    if R is not None:
        Rt = np.asarray(R, dtype=F).T
        x, y, z = (Rt[0, 0] * x + Rt[0, 1] * y + Rt[0, 2] * z,
                   Rt[1, 0] * x + Rt[1, 1] * y + Rt[1, 2] * z,
                   Rt[2, 0] * x + Rt[2, 1] * y + Rt[2, 2] * z)
    return x, y, z


def ell(P, c, r, R=None):
    x, y, z = local(P, c, R)
    k0 = length(x / r[0], y / r[1], z / r[2])
    k1 = length(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]))
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)


def sphere(P, c, r):
    return length(P[0] - c[0], P[1] - c[1], P[2] - c[2]) - r


def rcone(P, a, b, ra, rb):
    """Round cone between points a and b (radii ra, rb)."""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    ba = b - a
    l2 = float(ba @ ba)
    rr = ra - rb
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    px, py, pz = P[0] - F(a[0]), P[1] - F(a[1]), P[2] - F(a[2])
    y = px * ba[0] + py * ba[1] + pz * ba[2]
    z = y - l2
    qx, qy, qz = px * l2 - ba[0] * y, py * l2 - ba[1] * y, pz * l2 - ba[2] * y
    x2 = qx * qx + qy * qy + qz * qz
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d_mid = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - ra
    d_b = np.sqrt(x2 + z2) * il2 - rb
    d_a = np.sqrt(x2 + y2) * il2 - ra
    return np.where(np.sign(z) * a2 * z2 > k, d_b, np.where(np.sign(y) * a2 * y2 < k, d_a, d_mid)).astype(F)


def chain(P, pts, radii, k=0.0):
    d = None
    for i in range(len(pts) - 1):
        s = rcone(P, pts[i], pts[i + 1], radii[i], radii[i + 1])
        d = s if d is None else smin(d, s, k)
    return d


def slab(P, axis, lo, hi):
    v = P[axis]
    return np.maximum(F(lo) - v, v - F(hi))


def plane(P, n, d):
    n = np.asarray(n, dtype=np.float64)
    n = n / np.linalg.norm(n)
    return (P[0] * n[0] + P[1] * n[1] + P[2] * n[2] - d).astype(F)


# ---------------- meshing ----------------

def adjacency(faces, n):
    i = np.concatenate([faces[:, 0], faces[:, 1], faces[:, 2], faces[:, 1], faces[:, 2], faces[:, 0]])
    j = np.concatenate([faces[:, 1], faces[:, 2], faces[:, 0], faces[:, 0], faces[:, 1], faces[:, 2]])
    A = sp.coo_matrix((np.ones(len(i), dtype=np.float64), (i, j)), shape=(n, n)).tocsr()
    A.data[:] = 1.0
    deg = np.asarray(A.sum(axis=1)).ravel()
    deg[deg == 0] = 1
    return sp.diags(1.0 / deg) @ A


def taubin(v, faces, iters=10, lam=0.5, mu=-0.53):
    W = adjacency(faces, len(v))
    v = v.astype(np.float64)
    for _ in range(iters):
        v = v + lam * (W @ v - v)
        v = v + mu * (W @ v - v)
    return v


def orient_outward(v, f):
    """Flip winding if the mesh's signed volume is negative (normals pointing inward)."""
    v = np.asarray(v, dtype=np.float64)
    vol = np.einsum('ij,ij->i', v[f[:, 0]], np.cross(v[f[:, 1]], v[f[:, 2]])).sum()
    return f[:, [0, 2, 1]] if vol < 0 else f


def mesh(fn, lo, hi, h, smooth=8, target=None):
    xs = [np.arange(lo[i], hi[i] + h, h, dtype=F) for i in range(3)]
    P = np.meshgrid(*xs, indexing='ij')
    D = fn(P).astype(F)
    del P
    if D.min() >= 0 or D.max() <= 0:
        raise ValueError('surface not inside the sampling box')
    for ax in range(3):
        for sl in (0, -1):
            idx = [slice(None)] * 3
            idx[ax] = sl
            if (D[tuple(idx)] < 0).any():
                raise ValueError(f'surface touches box face axis={ax} side={sl}')
    v, f, _, _ = marching_cubes(D, 0.0, spacing=(h, h, h), gradient_direction='ascent')
    del D
    v = v + np.asarray(lo, dtype=np.float64)
    f = f.astype(np.int64)
    if smooth:
        v = taubin(v, f, smooth)
    if target and len(f) > target:
        s = pyfqmr.Simplify()
        s.setMesh(v, f)
        s.simplify_mesh(target_count=int(target), aggressiveness=5, preserve_border=True, verbose=False)
        v, f, _ = s.getMesh()
    v = np.asarray(v, dtype=np.float64)
    f = np.asarray(f, dtype=np.int64)
    # keep outward winding: face normals should point away from local interior
    e1, e2 = v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]]
    fn_ = np.cross(e1, e2)
    probe = v[f].mean(axis=1) + 1e-3 * fn_ / (np.linalg.norm(fn_, axis=1, keepdims=True) + 1e-12)
    outside = fn(tuple(probe[:, i:i + 1].astype(F) for i in range(3))).ravel() > 0
    if outside.mean() < 0.5:
        f = f[:, [0, 2, 1]]
    return v.astype(F), f


# ---------------- skinning ----------------

BONES = ['pelvis', 'spine', 'chest', 'neck', 'head',
         'uArmL', 'fArmL', 'handL', 'uArmR', 'fArmR', 'handR',
         'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR']
SIDE = {b: (1 if b.endswith('L') else -1 if b.endswith('R') else 0) for b in BONES}


def seg_dist(v, a, b):
    a = np.asarray(a)
    b = np.asarray(b)
    ab = b - a
    t = np.clip(((v - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(v - (a + t[:, None] * ab), axis=1)


def skin_weights(v, faces, segs, allow=None, smooth=6, power=4):
    """segs: bone -> (a, b, radius). allow: optional bone list the part may use."""
    n = len(v)
    W = np.zeros((n, len(BONES)), dtype=np.float64)
    for i, bname in enumerate(BONES):
        if allow is not None and bname not in allow:
            continue
        a, b, r = segs[bname]
        d = np.maximum(seg_dist(v, a, b) - r, 0.004)
        w = 1.0 / d ** power
        s = SIDE[bname]
        if s:
            w[v[:, 0] * s < (0.045 if bname.startswith(('uArm', 'fArm', 'hand')) else -0.002)] = 0
        W[:, i] = w
    W /= W.sum(axis=1, keepdims=True) + 1e-12
    if smooth and faces is not None and len(faces):
        A = adjacency(faces, n)
        for _ in range(smooth):
            W = 0.5 * W + 0.5 * (A @ W)
    return quantize_weights(W)


def quantize_weights(W):
    idx = np.argsort(-W, axis=1)[:, :4]
    w = np.take_along_axis(W, idx, axis=1)
    w /= w.sum(axis=1, keepdims=True) + 1e-12
    q = np.floor(w * 255).astype(np.int32)
    q[:, 0] += 255 - q.sum(axis=1)
    return idx.astype(np.uint8), q.astype(np.uint8)


def rigid_weights(n, bone):
    j = np.zeros((n, 4), np.uint8)
    j[:, 0] = BONES.index(bone)
    w = np.zeros((n, 4), np.uint8)
    w[:, 0] = 255
    return j, w


# ---------------- export ----------------

class Pack:
    def __init__(self):
        self.buf = bytearray()
        self.parts = []

    def _put(self, arr):
        while len(self.buf) % 4:
            self.buf.append(0)
        off = len(self.buf)
        self.buf += np.ascontiguousarray(arr).tobytes()
        return off

    def add(self, meta, v, f, joints, weights, uv=None):
        q = np.clip(np.round(v * 30000), -32767, 32767).astype(np.int16)
        idx_t = 'u16' if len(v) < 65536 else 'u32'
        fi = f.astype(np.uint16 if idx_t == 'u16' else np.uint32).ravel()
        m = dict(meta)
        m.update(n=int(len(v)), tris=int(len(f)), idxType=idx_t,
                 pos=self._put(q), idx=self._put(fi), j=self._put(joints), w=self._put(weights))
        if uv is not None:
            m['uv'] = self._put(np.clip(np.round(uv * 65535), 0, 65535).astype(np.uint16))
        self.parts.append(m)
        print(f"  {meta['name']:<14} {len(v):>7} verts {len(f):>7} tris")

    def write(self, path, key, extra=None):
        data = {'bones': BONES, 'posScale': 1 / 30000, 'parts': self.parts,
                'bin': base64.b64encode(bytes(self.buf)).decode('ascii')}
        if extra:
            data.update(extra)
        with open(path, 'w') as fh:
            fh.write('(window.MODELS = window.MODELS || {})[%s] = ' % json.dumps(key))
            json.dump(data, fh, separators=(',', ':'))
            fh.write(';\n')
        print(f'wrote {path}: {len(self.buf) / 1e6:.2f} MB binary')
