"""Builds js/models/<character>.js from SDF sculpts: body, hair, face decal and garments."""
import os
import sys
import time

import numpy as np
from skimage.measure import marching_cubes

import sdf
from body import ARM_BIND, Body, NAMI_HAIR, ROBIN_HAIR, hair, joints, segments
from sdf import F, Pack, ell, mesh, plane, rcone, skin_weights, slab, smax, smin, sphere

OUT = os.path.join(os.path.dirname(__file__), '..', 'js', 'models')
SEGS = segments()
NO_LIMB_ENDS = [b for b in sdf.BONES if not b.startswith(('hand', 'foot'))]
SKIRT = ['pelvis', 'spine', 'chest', 'thighL', 'thighR', 'shinL', 'shinR']


def box_sdf(P, lo, hi):
    return np.maximum.reduce([F(lo[0]) - P[0], P[0] - F(hi[0]), F(lo[1]) - P[1], P[1] - F(hi[1]), F(lo[2]) - P[2], P[2] - F(hi[2])])


def lower_body(B, P, foot=False):
    t = B.torso(P)
    return np.minimum(smin(t, B.leg(P, 1, foot), 0.02), smin(t, B.leg(P, -1, foot), 0.02))


def sleeves(B, P, off, wrist_gap=0.008):
    d = None
    for s in (1, -1):
        j = joints(s)
        a = smax(B.arm(P, s, hand=False) - off, plane(P, j['d'], float(j['d'] @ j['W']) - wrist_gap), 0.003)
        d = a if d is None else np.minimum(d, a)
    return d


def cuffs(B, P, off, width=0.014):
    d = None
    for s in (1, -1):
        j = joints(s)
        w = float(j['d'] @ j['W'])
        a = smax(smax(B.arm(P, s, hand=False) - off, plane(P, j['d'], w - 0.008), 0),
                 -plane(P, j['d'], w - 0.008 - width), 0)
        d = a if d is None else np.minimum(d, a)
    return d


def cone_skirt(P, ys, rs, zs=0.92):
    r = np.interp(P[1], ys, rs).astype(F)
    return (np.sqrt(P[0] ** 2 + (P[2] / zs) ** 2) - r) * F(0.92)


def bikini_parts(B, cut_top):
    def cups(P):
        t = B.torso(P) - 0.003
        return smax(smax(t, B.breasts(P, 0.007), 0.002), P[1] - F(cut_top), 0.003)

    def band(P):
        return smax(B.torso(P) - 0.003, slab(P, 1, 0.681, 0.69), 0.002)

    def bottom(P):
        g = lower_body(B, P) - 0.003
        n = np.array([0.053, -0.078])
        n = n / np.linalg.norm(n)
        legcut = (np.abs(P[0]) - 0.09) * n[0] + (P[1] - 0.506) * n[1]
        g = smax(g, P[1] - F(0.513), 0.003)
        return smax(g, legcut.astype(F), 0.003)
    return cups, band, bottom


class Builder:
    def __init__(self, key, body, hstyle, skin, hair_col, h=0.0022):
        self.key, self.B, self.hstyle, self.skin, self.hair_col, self.h = key, body, hstyle, skin, hair_col, h
        self.pk = Pack()
        self.t = time.time()

    def log(self, msg):
        print(f'[{self.key}] {msg} ({time.time() - self.t:.0f}s)', flush=True)

    def add(self, meta, fn, lo, hi, target=30000, allow=None, h=None, smooth=5):
        v, f = mesh(fn, lo, hi, h or self.h, smooth=smooth, target=target)
        j, w = skin_weights(v.astype(np.float64), f, SEGS, allow=allow)
        self.pk.add(meta, v, f, j, w)
        self.log('built ' + meta['name'])
        return v, f

    def body_and_face(self):
        v, f = self.add({'name': 'body', 'kind': 'body', 'role': 'skin', 'color': self.skin},
                        self.B.full, (-0.215, -0.012, -0.125), (0.215, 1.0, 0.135), target=90000, smooth=6)
        self.face(v, f)

    def face(self, v, f):
        v = v.astype(np.float64)
        fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
        vn = np.zeros_like(v)
        for i in range(3):
            np.add.at(vn, f[:, i], fn)
        vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
        c = v[f].mean(axis=1)
        fnn = fn / (np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12)
        keep = (c[:, 1] > 0.862) & (c[:, 1] < 0.985) & (np.abs(c[:, 0]) < 0.05) & (c[:, 2] > 0.012) & (fnn[:, 2] > 0.25)
        ff = f[keep]
        used, inv = np.unique(ff, return_inverse=True)
        fv = v[used] + vn[used] * 0.0007
        uv = np.stack([(fv[:, 0] + 0.055) / 0.11, (fv[:, 1] - 0.87) / 0.11], 1).clip(0, 1)
        j, w = sdf.rigid_weights(len(fv), 'head')
        self.pk.add({'name': 'face', 'kind': 'face', 'role': 'face', 'color': self.skin,
                     'uvRect': [-0.055, 0.87, 0.11, 0.11]}, fv.astype(F), inv.reshape(-1, 3), j, w, uv=uv)

    def hair(self):
        S = hair(self.hstyle, 0.002)
        v, f, _, _ = marching_cubes(S.D, 0.0, spacing=(0.002,) * 3, gradient_direction='ascent')
        v = v + np.array([S.xs[0][0], S.xs[1][0], S.xs[2][0]])
        f = f.astype(np.int64)
        v = sdf.taubin(v, f, 4)
        import pyfqmr
        s = pyfqmr.Simplify()
        s.setMesh(v, f)
        s.simplify_mesh(target_count=60000, aggressiveness=5, preserve_border=True, verbose=False)
        v, f, _ = s.getMesh()
        v = np.asarray(v)
        f = sdf.orient_outward(v, np.asarray(f))
        # scalp follows the head; the long part rides the chest so it stays on the back when posed
        t = np.clip((v[:, 1] - 0.76) / 0.08, 0, 1)
        n = len(v)
        J = np.zeros((n, 4), np.uint8)
        W = np.zeros((n, 4), np.uint8)
        J[:, 0], J[:, 1] = sdf.BONES.index('head'), sdf.BONES.index('chest')
        W[:, 0] = np.round(t * 255).astype(np.uint8)
        W[:, 1] = 255 - W[:, 0]
        self.pk.add({'name': 'hair', 'kind': 'hair', 'role': 'hair', 'color': self.hair_col}, v.astype(F), f, J, W)
        self.log('built hair')

    def write(self, extra):
        os.makedirs(OUT, exist_ok=True)
        self.pk.write(os.path.join(OUT, self.key + '.js'), self.key, extra)


TORSO_BOX = ((-0.13, 0.6, -0.1), (0.13, 0.84, 0.13))
ARMS_BOX = ((-0.2, 0.46, -0.1), (0.2, 0.84, 0.13))
LOWER_BOX = ((-0.14, 0.0, -0.12), (0.14, 0.56, 0.12))


def build_nami():
    B = Body(bust=0.05)
    b = Builder('nami', B, NAMI_HAIR, '#eab896', '#f0782c')
    b.body_and_face()
    b.hair()
    cups, band, bottom = bikini_parts(B, 0.752)
    g = dict(kind='garment', garment='bikini', role='lace')
    b.add(dict(g, name='bikini-top', color='#4b8d6a'), lambda P: np.minimum(cups(P), band(P)), (-0.12, 0.66, -0.08), (0.12, 0.79, 0.12), 12000)
    b.add(dict(g, name='bikini-bottom', color='#4b8d6a'), bottom, (-0.12, 0.42, -0.1), (0.12, 0.53, 0.1), 10000)

    g = dict(kind='garment', garment='jeans', role='denim', color='#2c4665')

    def jeans(P):
        J = lower_body(B, P) - 0.007
        for s in (1, -1):
            jn = joints(s)
            J = smin(J, rcone(P, jn['K'] + np.array([0, -0.07, 0]), jn['A'] + np.array([0, -0.004, 0.006]), 0.04, 0.058), 0.03)
        return smax(J, slab(P, 1, 0.03, 0.536), 0.003)
    b.add(dict(g, name='jeans'), jeans, (-0.14, 0.01, -0.12), (0.14, 0.56, 0.12), 36000, allow=NO_LIMB_ENDS + ['footL', 'footR'])

    g = dict(kind='garment', garment='top', role='cloth', color='#efebe3')

    def top(P):
        t = smax(B.clothed_torso(P) - 0.0055, slab(P, 1, 0.648, 0.792), 0.003)
        return smax(t, -sphere(P, (0, 0.835, 0.055), 0.058), 0.004)
    b.add(dict(g, name='top'), top, *TORSO_BOX, 24000)

    g = dict(kind='garment', garment='bomber', role='leather')

    def bomber(P):
        t = smax(B.clothed_torso(P) - 0.012, slab(P, 1, 0.64, 0.812), 0.003)
        t = smax(t, -sphere(P, (0, 0.845, 0.05), 0.045), 0.004)
        return smin(t, sleeves(B, P, 0.0105), 0.01)
    b.add(dict(g, name='bomber', color='#1d1c21'), bomber, *ARMS_BOX, 40000)

    def trim(P):
        hem = smax(B.clothed_torso(P) - 0.0155, slab(P, 1, 0.636, 0.652), 0.002)
        return np.minimum(hem, cuffs(B, P, 0.0135))
    b.add(dict(g, name='bomber-trim', role='cloth', color='#e9dfc9'), trim, *ARMS_BOX, 12000)

    g = dict(kind='garment', garment='heels', role='leather', color='#c79d66')

    def shoes(P):
        d = None
        for s in (1, -1):
            f = smax(B.foot(P, s) - 0.0045, P[1] - F(0.052), 0.003)
            d = f if d is None else np.minimum(d, f)
        return d
    b.add(dict(g, name='heels'), shoes, (-0.1, -0.02, -0.06), (0.1, 0.07, 0.13), 8000, allow=['footL', 'footR', 'shinL', 'shinR'])

    b.write({'height': 1.70})


def build_robin():
    B = Body(bust=0.052, hip=1.03, thigh=1.02)
    b = Builder('robin', B, ROBIN_HAIR, '#d49e7a', '#1e1b27')
    b.body_and_face()
    b.hair()
    cups, band, bottom = bikini_parts(B, 0.758)
    g = dict(kind='garment', garment='lace', role='lace')
    b.add(dict(g, name='lace-top', color='#5a3a70'), lambda P: np.minimum(cups(P), band(P)), (-0.12, 0.66, -0.08), (0.12, 0.79, 0.12), 12000)
    b.add(dict(g, name='lace-bottom', color='#5a3a70'), bottom, (-0.12, 0.42, -0.1), (0.12, 0.53, 0.1), 10000)

    g = dict(kind='garment', garment='boots', role='leather', color='#101012')

    def boots(P):
        d = None
        for s in (1, -1):
            l = smax(B.leg(P, s, foot=True) - 0.0055, P[1] - F(0.285), 0.003)
            d = l if d is None else np.minimum(d, l)
        return d
    b.add(dict(g, name='boots'), boots, (-0.12, -0.02, -0.08), (0.12, 0.31, 0.13), 24000, allow=['thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'])

    g = dict(kind='garment', garment='skirt', role='silk', color='#141418')

    def skirt(P):
        waist = smax(B.torso(P) - 0.006, slab(P, 1, 0.54, 0.626), 0.003)
        cone = smax(cone_skirt(P, [0.15, 0.3, 0.45, 0.52, 0.58], [0.142, 0.125, 0.106, 0.096, 0.07]), slab(P, 1, 0.15, 0.58), 0.004)
        s_ = smin(waist, cone, 0.015)
        return smax(s_, -box_sdf(P, (-0.3, 0.1, -0.03), (-0.045, 0.4, 0.3)), 0.006)
    b.add(dict(g, name='skirt'), skirt, (-0.17, 0.13, -0.16), (0.17, 0.64, 0.16), 30000, allow=SKIRT)

    g = dict(kind='garment', garment='top', role='silk', color='#d9cfbe')

    def top(P):
        t = smax(B.clothed_torso(P) - 0.0055, slab(P, 1, 0.655, 0.795), 0.003)
        return smax(t, -sphere(P, (0, 0.83, 0.062), 0.066), 0.004)
    b.add(dict(g, name='top'), top, *TORSO_BOX, 24000)

    g = dict(kind='garment', garment='coat', role='cloth', color='#3b3048')

    def coat(P):
        t = smax(B.clothed_torso(P) - 0.015, slab(P, 1, 0.5, 0.815), 0.003)
        t = smax(t, -sphere(P, (0, 0.85, 0.05), 0.048), 0.004)
        lower = smax(cone_skirt(P, [0.25, 0.4, 0.5, 0.56, 0.6], [0.172, 0.142, 0.115, 0.095, 0.074], 0.94), slab(P, 1, 0.25, 0.6), 0.004)
        t = smin(t, lower, 0.02)
        t = smax(t, -box_sdf(P, (-0.024, 0.1, 0.0), (0.024, 0.53, 0.3)), 0.006)
        return smin(t, sleeves(B, P, 0.013), 0.01)
    b.add(dict(g, name='coat'), coat, (-0.21, 0.23, -0.18), (0.21, 0.84, 0.18), 45000, allow=NO_LIMB_ENDS)

    def belt(P):
        return smax(B.torso(P) - 0.021, slab(P, 1, 0.6, 0.618), 0.002)
    b.add(dict(g, name='coat-belt', role='leather', color='#b6a283'), belt, (-0.1, 0.58, -0.08), (0.1, 0.64, 0.08), 5000)

    b.write({'height': 1.88})


if __name__ == '__main__':
    which = sys.argv[1:] or ['nami', 'robin']
    if 'nami' in which:
        build_nami()
    if 'robin' in which:
        build_robin()
