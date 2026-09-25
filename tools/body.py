"""Body and hair sculpts. Units: figure height = 1, y up, face toward +z. Joints match js/figure.js bones."""
import numpy as np

from sdf import F, chain, ell, plane, rcone, rot, smax, smin, sphere

ARM_BIND = 0.25  # A-pose abduction baked into the bind pose (uArm rotation.z)


def joints(side):
    s = side
    S = np.array([0.088 * s, 0.795, -0.005])
    d = np.array([np.sin(ARM_BIND) * s, -np.cos(ARM_BIND), 0.0])
    E = S + 0.165 * d
    W = E + 0.145 * d
    H = np.array([0.048 * s, 0.488, 0.0])
    K = H + np.array([0, -0.225, 0])
    A = K + np.array([0, -0.225, 0])
    T = A + np.array([0, -0.03, 0.075])
    return dict(S=S, d=d, E=E, W=W, Hd=W + 0.08 * d, H=H, K=K, A=A, T=T)


def segments():
    """Bone segments (a, b, surface radius) used for skin weights."""
    seg = {
        'pelvis': ((0, 0.47, -0.01), (0, 0.55, 0), 0.06),
        'spine': ((0, 0.56, 0), (0, 0.65, 0), 0.045),
        'chest': ((0, 0.67, 0), (0, 0.79, -0.005), 0.055),
        'neck': ((0, 0.815, -0.005), (0, 0.86, 0), 0.02),
        'head': ((0, 0.87, 0), (0, 0.98, 0), 0.05),
    }
    for s, L in ((1, 'L'), (-1, 'R')):
        j = joints(s)
        seg['uArm' + L] = (j['S'], j['E'], 0.024)
        seg['fArm' + L] = (j['E'], j['W'], 0.017)
        seg['hand' + L] = (j['W'], j['Hd'], 0.012)
        seg['thigh' + L] = (j['H'], j['K'], 0.042)
        seg['shin' + L] = (j['K'], j['A'], 0.026)
        seg['foot' + L] = (j['A'], j['T'], 0.014)
    return seg


class Body:
    def __init__(self, bust=0.05, hip=1.0, thigh=1.0):
        self.bust, self.hip, self.th = bust, hip, thigh

    def breasts(self, P, grow=0.0):
        b = self.bust + grow
        d = None
        for s in (1, -1):
            e = ell(P, (0.039 * s, 0.722, 0.03), (b, b * 0.93, b * 0.9), rot(ax=0.12, ay=0.22 * s))
            d = e if d is None else np.minimum(d, e)
        return d

    def torso(self, P, bust=True):
        hw = self.hip
        t = ell(P, (0, 0.505, -0.004), (0.086 * hw, 0.07, 0.064))
        for s in (1, -1):
            t = smin(t, ell(P, (0.037 * s * hw, 0.48, -0.034), (0.05, 0.056, 0.046)), 0.02)
        t = smin(t, ell(P, (0, 0.537, 0.01), (0.057, 0.045, 0.04)), 0.03)
        t = smin(t, ell(P, (0, 0.612, -0.002), (0.049, 0.06, 0.037)), 0.045)
        t = smin(t, ell(P, (0, 0.705, -0.006), (0.07, 0.085, 0.05)), 0.04)
        t = smin(t, ell(P, (0, 0.765, -0.01), (0.075, 0.045, 0.047)), 0.03)
        t = smin(t, rcone(P, (-0.08, 0.797, -0.008), (0.08, 0.797, -0.008), 0.023, 0.023), 0.03)
        t = smin(t, rcone(P, (0, 0.79, -0.012), (0, 0.885, 0.002), 0.023, 0.018), 0.02)
        if bust:
            t = smin(t, self.breasts(P), 0.012)
        return t

    def clothed_torso(self, P):
        """Torso with the valley between breasts bridged, the way fabric spans it."""
        t = self.torso(P)
        bridge = ell(P, (0, 0.722, 0.035), (0.085, self.bust * 0.92, self.bust * 0.95))
        return smin(t, bridge, 0.02)

    def head(self, P):
        h = ell(P, (0, 0.93, -0.004), (0.053, 0.061, 0.057))
        h = smin(h, rcone(P, (0, 0.917, 0.008), (0, 0.873, 0.027), 0.043, 0.013), 0.025)
        for s in (1, -1):
            h = smin(h, ell(P, (0.03 * s, 0.902, 0.026), (0.024, 0.024, 0.022)), 0.015)
        h = smin(h, ell(P, (0, 0.902, 0.052), (0.004, 0.008, 0.005), rot(ax=0.3)), 0.004)
        return h

    def arm(self, P, s, hand=True):
        j = joints(s)
        S, d, E, W = j['S'], j['d'], j['E'], j['W']
        R = rot(az=ARM_BIND * s)
        a = rcone(P, S, E, 0.026, 0.019)
        a = smin(a, ell(P, S + 0.028 * d + np.array([0.004 * s, 0, 0]), (0.026, 0.036, 0.026), R), 0.02)
        a = smin(a, rcone(P, E, W, 0.019, 0.013), 0.012)
        a = smin(a, ell(P, E + 0.04 * d, (0.0185, 0.044, 0.0175), R), 0.02)
        if hand:
            a = smin(a, self.hand(P, s), 0.008)
        return a

    def hand(self, P, s):
        j = joints(s)
        W, d = j['W'], j['d']
        R = rot(az=ARM_BIND * s)
        h = ell(P, W + 0.03 * d, (0.0115, 0.029, 0.021), R)
        h = smin(h, rcone(P, W + 0.05 * d, W + 0.082 * d + np.array([0, 0, 0.004]), 0.0095, 0.0065), 0.006)
        h = smin(h, rcone(P, W + 0.014 * d + np.array([0, 0, 0.014]), W + 0.042 * d + np.array([-0.004 * s, 0, 0.022]), 0.0062, 0.0048), 0.005)
        return h

    def leg(self, P, s, foot=True):
        j = joints(s)
        H, K, A, T = j['H'], j['K'], j['A'], j['T']
        th = self.th
        l = rcone(P, H + np.array([0.006 * s, 0, 0]), K, 0.051 * th, 0.032)
        l = smin(l, ell(P, (0.057 * s, 0.4, 0.008), (0.043 * th, 0.1, 0.045 * th)), 0.03)
        l = smin(l, ell(P, K + np.array([0, 0, 0.008]), (0.03, 0.032, 0.03)), 0.012)
        l = smin(l, rcone(P, K, A, 0.032, 0.018), 0.012)
        l = smin(l, ell(P, (0.049 * s, 0.2, -0.01), (0.031, 0.07, 0.032)), 0.03)
        l = smin(l, sphere(P, A, 0.02), 0.01)
        if foot:
            l = smin(l, self.foot(P, s), 0.01)
        return l

    def foot(self, P, s):
        j = joints(s)
        A, T = j['A'], j['T']
        f = ell(P, A + np.array([0, -0.022, -0.012]), (0.018, 0.017, 0.022))
        f = smin(f, rcone(P, A + np.array([0, -0.008, 0.0]), T + np.array([0, 0.004, 0]), 0.018, 0.011), 0.012)
        return f

    def upper(self, P):
        t = smin(self.torso(P), self.head(P), 0.012)
        for s in (1, -1):
            t = smin(t, self.arm(P, s), 0.012)
        return t

    def full(self, P):
        u = self.upper(P)
        return np.minimum(smin(u, self.leg(P, 1), 0.02), smin(u, self.leg(P, -1), 0.02))


# ---------------- hair ----------------

class Sparse:
    """Accumulates many small primitives into one grid, evaluating each only inside its own box."""

    def __init__(self, lo, hi, h):
        self.lo, self.h = np.asarray(lo, float), h
        self.xs = [np.arange(lo[i], hi[i] + h, h, dtype=F) for i in range(3)]
        self.D = np.full([len(x) for x in self.xs], 1.0, dtype=F)

    def add(self, fn, blo, bhi, k=0.0, mode='union'):
        sl, P = [], []
        for i in range(3):
            a = max(0, int((blo[i] - self.lo[i]) / self.h) - 1)
            b = min(len(self.xs[i]), int((bhi[i] - self.lo[i]) / self.h) + 2)
            if a >= b:
                return
            sl.append(slice(a, b))
            P.append(self.xs[i][a:b])
        P = np.meshgrid(*P, indexing='ij')
        d = fn(P)
        cur = self.D[tuple(sl)]
        if mode == 'union':
            self.D[tuple(sl)] = smin(cur, d, k)
        else:
            self.D[tuple(sl)] = smax(cur, -d, k)

    def strand(self, pts, radii, k, dense=4):
        """One hair clump: a spline-smoothed chain of round cones, unioned hard within the clump."""
        pts = np.asarray(pts, float)
        radii = np.asarray(radii, float)
        n = len(pts)
        t = np.arange(n)
        tt = np.linspace(0, n - 1, (n - 1) * dense + 1)
        if n >= 3:
            from scipy.interpolate import CubicSpline
            pts = CubicSpline(t, pts, axis=0)(tt)
        else:
            pts = np.stack([np.interp(tt, t, pts[:, i]) for i in range(3)], 1)
        radii = np.interp(tt, t, radii)
        m = radii.max() + k + 3 * self.h
        lo, hi = pts.min(0) - m, pts.max(0) + m
        box = self._box(lo, hi)
        if box is None:
            return
        sl, P = box
        tmp = np.full(P[0].shape, 1.0, dtype=F)
        org = [s_.start for s_ in sl]
        for i in range(len(pts) - 1):
            mm = max(radii[i], radii[i + 1]) + 3 * self.h
            sub = self._box(np.minimum(pts[i], pts[i + 1]) - mm, np.maximum(pts[i], pts[i + 1]) + mm)
            if sub is None:
                continue
            ssl, SP = sub
            rel = tuple(slice(q.start - o, q.stop - o) for q, o in zip(ssl, org))
            tmp[rel] = np.minimum(tmp[rel], rcone(SP, pts[i], pts[i + 1], radii[i], radii[i + 1]))
        self.D[tuple(sl)] = smin(self.D[tuple(sl)], tmp, k)

    def _box(self, blo, bhi):
        sl, P = [], []
        for i in range(3):
            a = max(0, int((blo[i] - self.lo[i]) / self.h) - 1)
            b = min(len(self.xs[i]), int((bhi[i] - self.lo[i]) / self.h) + 2)
            if a >= b:
                return None
            sl.append(slice(a, b))
            P.append(self.xs[i][a:b])
        return sl, np.meshgrid(*P, indexing='ij')


def zback(y):
    """Approximate back surface z along the spine, used to lay hair on the back."""
    ys = [0.50, 0.58, 0.64, 0.70, 0.76, 0.80, 0.85, 0.88, 0.92]
    zs = [-0.075, -0.052, -0.048, -0.058, -0.062, -0.052, -0.04, -0.05, -0.07]
    return float(np.interp(y, ys, zs))


def hair(style, h):
    long_end = style['end']
    S = Sparse((-0.13, long_end - 0.04, -0.13), (0.13, 1.02, 0.11), h)
    c = np.array([0, 0.93, -0.004])
    # scalp cap
    n = np.array([0, 0.811, -0.585])
    p0 = np.array([0, style['hairline'], 0.055])
    S.add(lambda P: smax(ell(P, c, (0.0595, 0.0685, 0.0635)), -plane(P, n, float(n @ p0)), 0.006),
          (-0.07, 0.84, -0.075), (0.07, 1.01, 0.07), 0)
    wav = style['wave']
    N = style['back']
    for layer, dz in ((0, 0.0), (1, -0.009), (2, 0.006)):
        for i in range(N):
            u = (i + 0.5 * layer) / (N - 1) * 2 - 1
            a = np.pi + u * 1.55
            e = 0.35 + 0.35 * (1 - abs(u))
            root = c + np.array([0.058 * np.cos(e) * np.sin(a), 0.066 * np.sin(e), 0.062 * np.cos(e) * np.cos(a)])
            end = long_end + 0.03 * (1 - u * u) - 0.02 * layer
            hug = c + np.array([0.056 * np.sin(a), -0.032, 0.06 * np.cos(a) - 0.006])
            pts = [root, hug]
            ys = np.linspace(0.862, end, 8)
            ph = i * 1.7 + layer
            for y in ys:
                spread = np.interp(y, [end, 0.64, 0.78, 0.88], [0.058, 0.07, 0.076, 0.052])
                x = u * spread + wav * np.sin(y * 34 + ph) * (0.9 - y) * 1.6
                z = zback(y) - 0.012 + dz - 0.01 * (1 - u * u) + wav * np.cos(y * 30 + ph) * (0.9 - y)
                pts.append(np.array([x, y, z]))
            r0 = style['r'] * (1 - 0.35 * abs(u))
            radii = [r0 * 0.8, r0] + list(r0 * np.array([1.1, 1.15, 1.15, 1.1, 1.0, 0.85, 0.6, 0.25])[:len(pts) - 2])
            S.strand(pts, radii, style['k'])
    # bangs: follow the forehead curve, pointed tips
    def front_z(x, y):
        q = 1 - (x / 0.0595) ** 2 - ((y - 0.93) / 0.0685) ** 2
        return -0.004 + 0.0635 * np.sqrt(max(q, 0.02))
    hl = style['hairline']
    for (x0, x1, yend, r) in style['bangs']:
        ys = [hl + 0.03, hl + 0.006, (hl + yend) / 2, yend]
        xs = [x0 * 0.85, x0, (x0 + x1) / 2, x1]
        pts = [np.array([x, y, front_z(x, y) + off]) for x, y, off in zip(xs, ys, (-0.006, 0.002, 0.003, 0.0025))]
        S.strand(pts, [r, r, r * 0.7, 0.0012], 0.003)
    # side locks framing the face
    for s in (1, -1):
        for off in (0.0, 0.01):
            pts = [np.array([0.047 * s, 0.965, 0.03 - off]), np.array([0.059 * s, 0.92, 0.036 - off]),
                   np.array([0.061 * s, 0.87, 0.03 - off])]
            for y in np.linspace(0.83, style['lock'], 4):
                pts.append(np.array([(0.062 + (0.83 - y) * 0.2) * s + wav * 0.8 * np.sin(y * 40 + s),
                                     y, 0.028 - off + (0.83 - y) * 0.15]))
            S.strand(pts, [0.012, 0.013, 0.013, 0.012, 0.011, 0.008, 0.003], 0.01)
    return S


NAMI_HAIR = dict(end=0.56, hairline=0.958, wave=0.01, back=16, r=0.013, k=0.009, lock=0.765,
                 bangs=[(x0, x0 + 0.014, 0.944 - 0.006 * np.cos(x0 * 30), 0.0068) for x0 in np.linspace(-0.047, 0.041, 10)])
ROBIN_HAIR = dict(end=0.6, hairline=0.962, wave=0.0, back=18, r=0.012, k=0.007, lock=0.74,
                  bangs=[(x, x * 1.02, 0.946, 0.0064) for x in np.linspace(-0.045, 0.045, 12)])
