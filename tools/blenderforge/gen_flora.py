# BLENDERFORGE FLORA — the tree and desert-plant factory for the web game (Blender 5.x, headless).
# DIVIDED STATES OF AMERICA is seen from a camera ~34 m up, looking almost straight down (8 deg of tilt), so every
# plant here is built to read FROM ABOVE first: a palm is a starburst of fronds, a saguaro a ribbed star with arms, a
# palo verde an airy broken crown you can see the green limbs through, a citrus a dark dome dotted with fruit.
#
# Run (headless only — never the Blender MCP, which drives Robert's live Blender):
#   node tools/blenderforge/blender.mjs gen_flora.py                 # every species, GLBs only
#   node tools/blenderforge/blender.mjs gen_flora.py -- --previews   # + preview PNGs (top, game camera, 3/4 hero)
#   node tools/blenderforge/blender.mjs gen_flora.py -- --previews --sheet saguaro joshua
#                                                     # named species only; --sheet adds the all-species contact sheets
#   (or: blender --background --factory-startup --python tools/blenderforge/gen_flora.py -- [same args])
# Out:
#   web/public/models/flora/<species>.glb  — three seeded variants per file, nodes <species>_v0.._v2, each ONE mesh
#   web/public/models/flora/flora.json     — per species: nominal height, crown radius, triangles per variant
#   docs/renders/web/flora/<species>_{top,game,hero}.png (+ sheet_top.png, sheet_game.png with --sheet)
#
# LAWS
# - AXIS: Blender +Z up, origin at the foot of the trunk on the ground. glTF export maps +Z to three's +Y.
# - SIZE: each variant is scaled uniformly so its top is exactly SPECIES[k]["h"] metres; the web loader
#   (web/src/world/flora.js SPECIES) carries the same heights so a caller's scale is (wanted height / h).
# - BUDGET: 150-600 triangles per variant; the build fails loudly outside it.
# - COLOUR: vertex colour only (a CORNER "Color" attribute, flat per face), one shared material. No textures.
#   NO PURPLE: every palette entry is checked against hue 270-320 at start-up.
# - NAME LAW (gen_vehicles.py): never name a part ending in -col / -convcol / -rigid / -vehicle / -wheel / -navmesh
#   / -occ (Godot's importer grows colliders and wheels from those suffixes). Variant nodes are <species>_vN.
# - primitive_cube_add(size=1) is already a 1 m cube (gen_vehicles.py's half-scale bug). This factory builds every
#   mesh from raw vertices instead, so there is no primitive scale to get wrong, and no booleans at all.
# - REVIEW BEFORE WIRING: look at every preview. A green test only proves a file loads; it is blind to art.

import bpy
import bmesh
import colorsys
import json
import math
import os
import random
import sys
import zlib
from mathutils import Matrix, Vector

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT_DIR = os.path.join(REPO, "web", "public", "models", "flora")
PREVIEW_DIR = os.path.join(REPO, "docs", "renders", "web", "flora")

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
DO_PREVIEWS = "--previews" in ARGS
DO_SHEET = "--sheet" in ARGS
VARIANTS = 3
TRI_MIN, TRI_MAX = 150, 600
H_LOOK = [0.0]  # the hero camera's look height (set per species)


# ---------------------------------------------------------------- palette (sRGB hex; stored linear)
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexc(h):
    h = h.lstrip("#")
    return tuple(_lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


PAL = {
    "pv_bark": "#7f9a48", "pv_bark_dk": "#667f3a", "pv_leaf": ["#8ca23e", "#9ab04a", "#7f9638"], "pv_flower": "#e6c83a",
    "mq_bark": "#4a3828", "mq_bark_dk": "#3a2c20", "mq_leaf": ["#3e5826", "#48622c", "#364f22"],
    "fan_trunk": "#8a7862", "fan_trunk_dk": "#6e5e4c", "fan_leaf": ["#5f8a3a", "#6e9944", "#557e33"],
    "skirt": "#a88c5c", "skirt_dk": "#8a704a",
    "date_trunk": "#8a7050", "date_trunk_dk": "#6a5440", "date_leaf": ["#62874a", "#6f9454", "#557a42"], "dates": "#b8742a",
    "citrus_leaf": ["#2f5a24", "#3a6a2c", "#29501f"], "orange": "#f08a1c", "lemon": "#e8d23a", "citrus_bark": "#5a4632",
    "sag": ["#5c783c", "#4e6834", "#688646"], "sag_rib": "#7c9852", "sag_crown": "#e8dfc0",
    "josh_trunk": "#6a5a44", "josh_skirt": "#8c7c5c", "josh_leaf": ["#6e7c34", "#7e8c3e", "#606c2e"], "josh_core": "#4a5426",
    "oco_cane": "#6c6c4a", "oco_cane_dk": "#5a5c40", "oco_leaf": "#7c9240", "oco_flower": "#e0482a",
    "dead": "#7c7064", "dead_dk": "#5e554c", "dead_lt": "#93887a",
    "tumble": ["#bc9e66", "#a88a58", "#caae76"], "tumble_core": "#8a7048",
    "creo": ["#56623a", "#606e40", "#4c5734"], "creo_stem": "#4a4030", "creo_flower": "#d8c03e",
    "pear": ["#6c8c48", "#7a9852", "#5f7f40"], "pear_rim": "#86a25c", "pear_fruit": "#c23a2c",
    # THE WOODS (the World Forge's BRUSH paints them: docs/design/WEB_FORGE.md 3.4) - a closed canopy from above
    "pine": ["#2c4a2a", "#335430", "#284226", "#3a5a32"],  # the woods' pine (bark: the Florida slash pine's keys)
    "oak": ["#3a5424", "#44602a", "#324a20", "#4e6a2e"],
    # Florida
    "sabal_trunk": "#857a6c", "sabal_boot": "#9c8a6c", "sabal_boot_dk": "#57493a",
    "sabal_leaf": ["#3f6b2e", "#4b7834", "#5b7c30", "#476a2a"],
    "pine_bark": "#7c4c34", "pine_bark_gr": "#6e625a", "pine_bark_dk": "#4c3424",
    "pine_leaf": ["#2c4a36", "#34553c", "#27432f", "#3a5a3a"],
    "cyp_bark": "#86705c", "cyp_bark_dk": "#6a5646", "cyp_leaf": ["#7a8c3e", "#8a9a4a", "#6c7e38"], "cyp_knee": "#7a6652",
    "moss": ["#8a8a6c", "#76775c", "#9c9b7e"], "sabal_stalk": "#56682e",
    "mang_root": "#6a5040", "mang_root_dk": "#54402f", "mang_bark": "#5e4a3a",
    "mang_leaf": ["#2a4c26", "#33582c", "#264420"],
    "oak_bark": "#54483c", "oak_bark_dk": "#433a30", "oak_leaf": ["#31502a", "#3a5c30", "#2b4724", "#40602f"],
}


def _check_palette():
    for k, v in PAL.items():
        for h in (v if isinstance(v, list) else [v]):
            r, g, b = (int(h.lstrip("#")[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
            hue, _, s = colorsys.rgb_to_hls(r, g, b)
            if s > 0.08 and 270 <= hue * 360 <= 320:
                raise SystemExit("PURPLE in palette %s %s (hue %.0f)" % (k, h, hue * 360))


def tone(c, k):
    return tuple(min(1.0, x * k) for x in c)


# ---------------------------------------------------------------- geometry accumulator
class Geo:
    """Raw vertices + faces + one linear RGB colour per face (flat, per corner)."""

    def __init__(self, rng):
        self.v = []
        self.f = []
        self.c = []
        self.rng = rng

    def vert(self, p):
        self.v.append(Vector(p))
        return len(self.v) - 1

    def face(self, idx, col, jit=0.06):
        k = 1.0 + (self.rng.random() * 2 - 1) * jit
        self.f.append(tuple(idx))
        self.c.append(tone(col, k))

    def tris(self):
        return sum(len(f) - 2 for f in self.f)

    def top(self):
        return max(p.z for p in self.v)

    def scale(self, k):
        for p in self.v:
            p *= k


def frame(t):
    """Two unit vectors perpendicular to tangent t."""
    up = Vector((0, 0, 1)) if abs(t.z) < 0.95 else Vector((1, 0, 0))
    n = t.cross(up).normalized()
    b = t.cross(n).normalized()
    return n, b


def tube(g, pts, radii, sides, col, cap="point", cap_len=0.6, profile=None, offset_rings=False,
         col_fn=None, base_cap=False, phase=0.0):
    """A tube along pts (Vectors) with radius per point. Parallel-transported rings (no twist flips).
    profile(k) -> radius multiplier per side (saguaro ribs). offset_rings: every other ring turned half a side,
    triangulated, for the date palm's diamond leaf bases. col_fn(seg, side, tri) -> colour overrides col."""
    pts = [Vector(p) for p in pts]
    rings = []
    t0 = (pts[1] - pts[0]).normalized()
    n, b = frame(t0)
    for i, p in enumerate(pts):
        if 0 < i < len(pts) - 1:
            t = (pts[i + 1] - pts[i - 1]).normalized()
        else:
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        # parallel transport n onto the new tangent
        n = (n - t * n.dot(t)).normalized()
        b = t.cross(n).normalized()
        a0 = phase + (math.pi / sides if (offset_rings and i % 2) else 0.0)
        ring = []
        for k in range(sides):
            a = a0 + 2 * math.pi * k / sides
            r = radii[i] * (profile(k) if profile else 1.0)
            ring.append(g.vert(p + (n * math.cos(a) + b * math.sin(a)) * r))
        rings.append(ring)
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for k in range(sides):
            k1 = (k + 1) % sides
            if offset_rings:
                if i % 2 == 0:
                    t1, t2 = (A[k], A[k1], B[k]), (A[k1], B[k1], B[k])
                else:
                    t1, t2 = (A[k], A[k1], B[k1]), (A[k], B[k1], B[k])
                g.face(t1, col_fn(i, k, 0) if col_fn else col)
                g.face(t2, col_fn(i, k, 1) if col_fn else col)
            else:
                g.face((A[k], A[k1], B[k1], B[k]), col_fn(i, k, 0) if col_fn else col)
    last = rings[-1]
    tl = (pts[-1] - pts[-2]).normalized()
    if cap == "point":
        apex = g.vert(pts[-1] + tl * radii[-1] * cap_len)
        for k in range(sides):
            g.face((last[k], last[(k + 1) % sides], apex), col_fn(len(rings), k, 0) if col_fn else col)
    elif cap == "flat":
        g.face(tuple(last), col)
    if base_cap:
        g.face(tuple(reversed(rings[0])), col)
    return rings


def ico(subdiv):
    bm = bmesh.new()
    # bmesh counts the bare icosahedron as subdivisions=1: here 0 -> 20 faces, 1 -> 80, 2 -> 320
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv + 1, radius=1.0)
    vs = [v.co.copy() for v in bm.verts]
    fs = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return vs, fs


_ICO = {}


def blob(g, c, rad, cols, subdiv=0, jitter=0.18, yaw=None, light_top=True, dark=0.78):
    """A lumpy low-poly ellipsoid: icosphere pushed in and out per vertex, shaded lighter on top."""
    if subdiv not in _ICO:
        _ICO[subdiv] = ico(subdiv)
    vs, fs = _ICO[subdiv]
    yaw = g.rng.random() * 6.283 if yaw is None else yaw
    R = Matrix.Rotation(yaw, 3, 'Z')
    base = len(g.v)
    for p in vs:
        k = 1.0 + (g.rng.random() * 2 - 1) * jitter
        q = Vector((p.x * rad[0] * k, p.y * rad[1] * k, p.z * rad[2] * k))
        g.vert(Vector(c) + R @ q)
    for f in fs:
        zc = sum(vs[i].z for i in f) / len(f)  # -1 bottom .. 1 top
        col = g.rng.choice(cols) if isinstance(cols, list) else cols
        k = (dark + (1.0 - dark) * (zc * 0.5 + 0.5) + 0.12 * max(0.0, zc)) if light_top else 1.0
        g.face(tuple(base + i for i in f), tone(col, k))


def octa(g, c, r, col, squash=1.0, yaw=0.0, stretch=1.0):
    c = Vector(c)
    R = Matrix.Rotation(yaw, 3, 'Z')
    ids = [g.vert(c + R @ (Vector(d) * r)) for d in ((stretch, 0, 0), (-stretch, 0, 0), (0, 1, 0), (0, -1, 0))]
    top = g.vert(c + Vector((0, 0, r * squash)))
    bot = g.vert(c - Vector((0, 0, r * squash)))
    ring = [ids[0], ids[2], ids[1], ids[3]]
    for k in range(4):
        a, b = ring[k], ring[(k + 1) % 4]
        g.face((a, b, top), col, 0.03)
        g.face((b, a, bot), tone(col, 0.8), 0.03)


def spike(g, base, d, length, r, col):
    """A 3-sided pyramid from base along d (yucca/joshua leaf, ocotillo flower)."""
    d = Vector(d).normalized()
    n, b = frame(d)
    ring = [g.vert(Vector(base) + (n * math.cos(a) + b * math.sin(a)) * r) for a in (0, 2.094, 4.189)]
    tip = g.vert(Vector(base) + d * length)
    for k in range(3):
        g.face((ring[k], ring[(k + 1) % 3], tip), col)


def ribbon(g, pts, widths, fold, cols, up_hint=Vector((0, 0, 1))):
    """A frond: a strip along pts, folded into a V along its spine (fold = ridge height / width).
    The two halves take slightly different shades, so the fold reads under a high sun."""
    pts = [Vector(p) for p in pts]
    L, M, R = [], [], []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        s = t.cross(up_hint)
        s = s.normalized() if s.length > 1e-6 else Vector((1, 0, 0))
        u = s.cross(t).normalized()
        w = widths[i]
        if w <= 1e-4:
            tip = g.vert(p)
            L.append(tip); M.append(tip); R.append(tip)
        else:
            L.append(g.vert(p - s * w - u * w * fold * 0.3))
            M.append(g.vert(p + u * w * fold))
            R.append(g.vert(p + s * w - u * w * fold * 0.3))
    for i in range(len(pts) - 1):
        cl = cols[i % len(cols)]
        for (a0, a1, b0, b1, k) in ((L[i], L[i + 1], M[i], M[i + 1], 0.92), (M[i], M[i + 1], R[i], R[i + 1], 1.06)):
            quad = [a0, b0, b1, a1]
            uniq = []
            for q in quad:
                if q not in uniq:
                    uniq.append(q)
            if len(uniq) >= 3:
                g.face(tuple(uniq), tone(cl, k), 0.04)


def arc(p0, d, length, n, droop, rise=0.0):
    """Points along an arching frond: out along d (horizontal-ish), up by rise then down by droop (parabola)."""
    p0 = Vector(p0)
    d = Vector(d).normalized()
    out = []
    for i in range(n):
        t = i / (n - 1)
        out.append(p0 + d * (length * t) + Vector((0, 0, rise * t - droop * t * t)))
    return out


def ring_dirs(n, rng, jitter=0.25):
    return [2 * math.pi * (k + rng.uniform(-jitter, jitter)) / n for k in range(n)]


# ---------------------------------------------------------------- species builders
def build_paloverde(g, rng):
    """Green bark from the ground up: a short trunk that splits low into four or five green limbs, each forking
    again; an airy yellow-green crown of many small clumps at the twig ends, wider than it is tall, with gaps you
    see the green limbs through from above; a few yellow blossom flecks."""
    H = 4.6
    bark = hexc(PAL["pv_bark"]); bark_dk = hexc(PAL["pv_bark_dk"])
    leaf = [hexc(c) for c in PAL["pv_leaf"]]
    fork = Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), rng.uniform(0.55, 0.8)))
    tube(g, [(0, 0, 0), fork], [0.17, 0.14], 5, bark_dk, cap=None)
    tips = []
    for a in ring_dirs(rng.randint(4, 5), rng, 0.3):
        d = Vector((math.cos(a), math.sin(a), 0))
        reach = rng.uniform(1.1, 1.6)
        end = fork + d * reach + Vector((0, 0, rng.uniform(1.5, 2.1)))
        tube(g, [fork, fork + d * reach * 0.4 + Vector((0, 0, 0.9)), end], [0.1, 0.075, 0.05], 4, bark, cap=None)
        for s in (-1, 1):
            d2 = Matrix.Rotation(s * rng.uniform(0.35, 0.7), 3, 'Z') @ d
            tip = end + d2 * rng.uniform(0.6, 1.0) + Vector((0, 0, rng.uniform(0.3, 0.7)))
            tube(g, [end, tip], [0.045, 0.03], 3, bark, cap=None)
            tips.append(tip)
    rng.shuffle(tips)
    tips = tips[:rng.randint(10, 11)]
    tips.append(fork + Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 2.9)))
    # each twig end carries a loose cluster of small flat leaf puffs at a few heights and tints: a fine, broken
    # texture from above (one big blob per twig read as a cut gem)
    for t in tips:
        for q in range(4):
            a = rng.random() * 6.283
            dd = rng.uniform(0.15, 0.6) if q else 0.0
            c = t + Vector((math.cos(a) * dd, math.sin(a) * dd, rng.uniform(0.0, 0.35)))
            col = tone(rng.choice(leaf), rng.uniform(0.86, 1.08))
            octa(g, c, rng.uniform(0.5, 0.68), col, squash=0.42, yaw=rng.random() * 3.14, stretch=rng.uniform(1.0, 1.4))
    fl = hexc(PAL["pv_flower"])
    for _ in range(rng.randint(6, 8)):
        c = rng.choice(tips) + Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), rng.uniform(0.35, 0.55)))
        octa(g, c, rng.uniform(0.12, 0.18), fl if rng.random() < 0.7 else tone(leaf[1], 1.15), squash=0.6)
    return H


def build_mesquite(g, rng):
    """Dark, low and spreading: a short twisted trunk splitting into leaning limbs under a broad umbrella of dark
    rounded clumps, wider than it is tall, its rim hanging lower than its middle."""
    H = 4.4
    bark = hexc(PAL["mq_bark"]); bark_dk = hexc(PAL["mq_bark_dk"])
    lean = Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0))
    fork = Vector((0, 0, rng.uniform(0.7, 1.0))) + lean
    tube(g, [(0, 0, 0), Vector((0, 0, 0.4)) + lean * 0.5, fork], [0.25, 0.21, 0.18], 5, bark_dk, cap=None)
    leaf = [hexc(c) for c in PAL["mq_leaf"]]
    n = rng.randint(4, 5)
    for i, a in enumerate(ring_dirs(n, rng, 0.25)):
        reach = rng.uniform(2.1, 2.8)
        d = Vector((math.cos(a), math.sin(a), 0))
        mid = fork + d * reach * 0.5 + Vector((0, 0, rng.uniform(0.8, 1.1)))
        end = fork + d * reach + Vector((0, 0, rng.uniform(1.0, 1.4)))
        tube(g, [fork, mid, end], [0.13, 0.09, 0.05], 4, bark, cap=None)
        r = rng.uniform(1.2, 1.5)
        blob(g, end + Vector((0, 0, 0.45)), (r, r * 0.85, r * 0.5), leaf, 1 if i < 3 else 0, jitter=0.16, dark=0.62)
    blob(g, fork + Vector((0, 0, 2.35)), (1.8, 1.6, 0.75), leaf, 1, jitter=0.14, dark=0.62)
    return H


def build_fanpalm(g, rng):
    """Washingtonia: a tall slender ringed trunk, a long shag skirt of dead fronds under the crown, and a dense round
    crown of pleated fan leaves in three tiers (young ones standing up over the heart, old ones hanging) — from above
    a full ragged green disc, not a wreath."""
    H = 11.0
    tk = hexc(PAL["fan_trunk"]); tkd = hexc(PAL["fan_trunk_dk"])
    lean = Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0))
    top_z = rng.uniform(8.6, 9.2)
    n = 8
    pts = [lean * ((i / n) ** 2) + Vector((0, 0, top_z * i / n)) for i in range(n + 1)]
    radii = [0.38] + [0.3 - 0.07 * (i / n) for i in range(1, n + 1)]
    tube(g, pts, radii, 6, tk, cap=None, col_fn=lambda s, k, tr: tk if s % 2 else tkd)
    crown = pts[-1]
    # the skirt: dead fronds hanging in a long shaggy cone under the crown
    sk = hexc(PAL["skirt"]); skd = hexc(PAL["skirt_dk"])
    m = 10
    topr = [g.vert(crown + Vector((math.cos(2 * math.pi * k / m) * 0.55, math.sin(2 * math.pi * k / m) * 0.55, 0.3))) for k in range(m)]
    bot = []
    for k in range(m):
        a = 2 * math.pi * (k + 0.5) / m
        drop = rng.uniform(2.6, 3.6) if k % 2 else rng.uniform(1.8, 2.6)
        bot.append(g.vert(crown + Vector((math.cos(a) * 0.72, math.sin(a) * 0.72, -drop))))
    for k in range(m):
        g.face((topr[k], topr[(k + 1) % m], bot[k]), sk if k % 2 else skd)
        g.face((topr[(k + 1) % m], bot[(k + 1) % m], bot[k]), skd if k % 2 else sk)
    leaf = [hexc(c) for c in PAL["fan_leaf"]]
    nf = rng.randint(15, 17)
    base = crown + Vector((0, 0, 0.35))
    for i, a in enumerate(ring_dirs(nf, rng, 0.35)):
        tier = i % 3  # 0 young (up, short), 1 level, 2 old (hanging)
        d = Vector((math.cos(a), math.sin(a), 0))
        stalk = (0.35, 0.8, 1.0)[tier] * rng.uniform(0.85, 1.15)
        pitch = (0.75, 0.15, -0.45)[tier] + rng.uniform(-0.12, 0.12)
        f = (d * math.cos(pitch) + Vector((0, 0, math.sin(pitch)))).normalized()
        hub = base + f * stalk
        side = d.cross(Vector((0, 0, 1))).normalized()
        sw = side * 0.05
        g.face((g.vert(base - sw), g.vert(base + sw), g.vert(hub + sw), g.vert(hub - sw)), tkd)
        R = (1.05, 1.35, 1.35)[tier] * rng.uniform(0.9, 1.1)
        col = rng.choice(leaf) if tier < 2 else tone(rng.choice(leaf), 0.82)
        K = 9
        c0 = g.vert(hub)
        rim = []
        for k in range(K + 1):
            th = math.radians(-100 + 200 * k / K)
            dirv = f * math.cos(th) + side * math.sin(th)
            droop = (0.25 + 0.2 * math.cos(th)) * R * (0.5 if tier == 0 else 1.0)
            pleat = 0.12 * R * (1 if k % 2 else -1)
            rim.append(g.vert(hub + dirv * R + Vector((0, 0, -droop + pleat))))
        for k in range(K):
            g.face((c0, rim[k], rim[k + 1]), tone(col, 1.08 if k % 2 else 0.88), 0.03)
    return H


def build_datepalm(g, rng):
    """Phoenix dactylifera: a thick trunk armoured in diamond leaf bases, a big crown of long arching feather fronds
    (narrow folded strips with a saw-tooth edge of leaflets, grey-green) — from above a feathery starburst — and
    orange date clusters under the crown."""
    H = 9.5
    tk = hexc(PAL["date_trunk"]); tkd = hexc(PAL["date_trunk_dk"])
    lean = Vector((rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8), 0))
    top_z = rng.uniform(6.6, 7.2)
    n = 8
    pts = [lean * ((i / n) ** 1.6) + Vector((0, 0, top_z * i / n)) for i in range(n + 1)]
    radii = [0.5] + [0.42 + 0.03 * math.sin(i * 1.7) for i in range(1, n + 1)]
    tube(g, pts, radii, 6, tk, cap=None, offset_rings=True, col_fn=lambda s, k, tr: tk if tr == 0 else tkd)
    crown = pts[-1]
    leaf = [hexc(c) for c in PAL["date_leaf"]]
    nf = rng.randint(15, 16)
    w = [0.05, 0.22, 0.4, 0.26, 0.42, 0.24, 0.32, 0.0]
    for i, a in enumerate(ring_dirs(nf, rng, 0.35)):
        tier = i % 3
        d = Vector((math.cos(a), math.sin(a), 0))
        L = rng.uniform(3.8, 4.6) * (0.8 if tier == 0 else 1.0)
        rise = (2.6, 1.6, 0.7)[tier] * rng.uniform(0.85, 1.15)
        droop = (2.3, 2.7, 3.1)[tier] * rng.uniform(0.85, 1.15)
        p = arc(crown + Vector((0, 0, 0.3)) + d * 0.3, d, L, len(w), droop, rise)
        # a slight sideways sweep, so the starburst is not ruled lines
        sw = d.cross(Vector((0, 0, 1))).normalized() * rng.uniform(-0.5, 0.5)
        p = [q + sw * ((k / (len(p) - 1)) ** 2) for k, q in enumerate(p)]
        c = rng.choice(leaf)
        ribbon(g, p, [x * rng.uniform(0.9, 1.1) for x in w], 0.5, [c, tone(c, 0.88)])
    octa(g, crown + Vector((0, 0, 0.7)), 0.5, tone(leaf[2], 0.75), squash=1.4)
    dt = hexc(PAL["dates"])
    for _ in range(rng.randint(2, 3)):
        a = rng.random() * 6.283
        octa(g, crown + Vector((math.cos(a) * 0.65, math.sin(a) * 0.65, -0.35)), 0.3, dt, squash=1.6)
    return H


def build_citrus(g, rng, lemons=False):
    """A round dense dome of dark glossy green on a short trunk, dotted with orange (or lemon) fruit you can see from
    the street and from above."""
    H = 3.6
    bark = hexc(PAL["citrus_bark"])
    tube(g, [(0, 0, 0), (0, 0, 0.5), (rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), 0.95)], [0.12, 0.1, 0.09], 5, bark, cap=None)
    leaf = [hexc(c) for c in PAL["citrus_leaf"]]
    R = rng.uniform(1.5, 1.7)
    cz = 0.95 + R * 0.78
    blob(g, (0, 0, cz), (R, R * rng.uniform(0.92, 1.0), R * 0.86), leaf, 2, jitter=0.06, dark=0.62)
    fr = hexc(PAL["lemon"] if lemons else PAL["orange"])
    n = rng.randint(15, 18)
    for k in range(n):
        # golden-angle spread over the upper three-quarters of the dome, sitting just proud of the leaves
        t = (k + 0.5) / n
        z = 1.0 - 1.45 * t
        rr = math.sqrt(max(0.0, 1 - z * z))
        a = k * 2.39996 + rng.uniform(-0.2, 0.2)
        dv = Vector((math.cos(a) * rr, math.sin(a) * rr, z))
        p = Vector((0, 0, cz)) + Vector((dv.x * R * 1.0, dv.y * R * 1.0, dv.z * R * 0.88))
        octa(g, p, 0.17, fr, squash=1.0)
    return H


def build_saguaro(g, rng):
    """A ribbed green column with arms that leave it level and turn up; a pale crown at the top. From above: a
    ribbed star with the arms' own stars round it."""
    H = 7.5
    ribs = 7
    cols = [hexc(c) for c in PAL["sag"]]
    rib = hexc(PAL["sag_rib"])
    base = rng.choice(cols)
    prof = lambda k: 1.0 if k % 2 == 0 else 0.8
    colf = lambda s, k, tr: rib if k % 2 == 0 else tone(base, 0.85)
    top = rng.uniform(5.6, 6.4)
    R = rng.uniform(0.42, 0.48)
    pts = [Vector((0, 0, 0)), Vector((0, 0, top * 0.35)), Vector((0, 0, top * 0.7)), Vector((0, 0, top))]
    rings = tube(g, pts, [R * 1.05, R, R, R * 0.96], ribs * 2, base, cap=None, profile=prof, col_fn=colf)
    # dome: one smaller ring then the crown point
    dome = [g.vert(pts[-1] + (g.v[i] - pts[-1]) * 0.62 + Vector((0, 0, R * 0.55))) for i in rings[-1]]
    m = len(dome)
    for k in range(m):
        g.face((rings[-1][k], rings[-1][(k + 1) % m], dome[(k + 1) % m], dome[k]), colf(0, k, 0))
    apex = g.vert(pts[-1] + Vector((0, 0, R * 0.85)))
    cr = hexc(PAL["sag_crown"])
    for k in range(m):
        g.face((dome[k], dome[(k + 1) % m], apex), cr if rng.random() < 0.35 else colf(0, k, 0))
    narms = rng.choice([1, 2, 2, 3, 3, 4])
    used = []
    for _ in range(narms):
        for _try in range(8):
            a = rng.random() * 6.283
            if all(abs((a - u + math.pi) % (2 * math.pi) - math.pi) > 1.1 for u in used):
                break
        used.append(a)
        d = Vector((math.cos(a), math.sin(a), 0))
        ay = top * rng.uniform(0.38, 0.62)
        out = rng.uniform(1.0, 1.35)
        up = rng.uniform(1.3, min(2.6, top - ay + 0.6))
        r = R * rng.uniform(0.62, 0.72)
        p = [Vector((0, 0, ay)) + d * (R * 0.5), Vector((0, 0, ay + 0.05)) + d * (out * 0.75),
             Vector((0, 0, ay + 0.45)) + d * out, Vector((0, 0, ay + up)) + d * out]
        ar = tube(g, p, [r, r, r, r * 0.95], 10, base, cap=None, profile=prof, col_fn=colf)
        last = ar[-1]
        tipc = g.vert(p[-1] + Vector((0, 0, r * 0.8)))
        for k in range(10):
            g.face((last[k], last[(k + 1) % 10], tipc), colf(0, k, 0))
    return H


def build_joshua(g, rng):
    """A shaggy trunk that forks and forks again, each limb ending in a spiky pom-pom of dagger leaves over a
    collar of dead grey ones. From above: a scatter of green stars on brown limbs."""
    H = 5.4
    tk = hexc(PAL["josh_trunk"]); sk = hexc(PAL["josh_skirt"])
    leaf = [hexc(c) for c in PAL["josh_leaf"]]
    core = hexc(PAL["josh_core"])
    fork = Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(1.6, 2.2)))
    tube(g, [(0, 0, 0), fork * 0.5, fork], [0.24, 0.2, 0.17], 5, tk, cap=None,
         col_fn=lambda s, k, tr: tk if (s + k) % 2 else sk)
    tips = []
    for a in ring_dirs(rng.randint(2, 3), rng, 0.3):
        d = Vector((math.cos(a), math.sin(a), 0))
        mid = fork + d * rng.uniform(0.6, 0.9) + Vector((0, 0, rng.uniform(0.7, 1.0)))
        tube(g, [fork, mid], [0.14, 0.11], 4, tk, cap=None)
        if rng.random() < 0.75:
            for s in (-1, 1):
                d2 = Matrix.Rotation(s * rng.uniform(0.4, 0.7), 3, 'Z') @ d
                end = mid + d2 * rng.uniform(0.6, 0.9) + Vector((0, 0, rng.uniform(0.5, 0.9)))
                tube(g, [mid, end], [0.1, 0.08], 4, tk, cap=None)
                tips.append((end, d2))
        else:
            end = mid + d * 0.5 + Vector((0, 0, 0.6))
            tube(g, [mid, end], [0.11, 0.09], 4, tk, cap=None)
            tips.append((end, d))
    for end, d in tips:
        # dead-leaf collar (a short hanging cone) then the live pom-pom
        m = 5
        top = [g.vert(end + Vector((math.cos(2 * math.pi * k / m) * 0.12, math.sin(2 * math.pi * k / m) * 0.12, 0.05))) for k in range(m)]
        bot = [g.vert(end + Vector((math.cos(2 * math.pi * (k + 0.5) / m) * 0.26, math.sin(2 * math.pi * (k + 0.5) / m) * 0.26, -0.45))) for k in range(m)]
        for k in range(m):
            g.face((top[k], top[(k + 1) % m], bot[k]), sk)
            g.face((top[(k + 1) % m], bot[(k + 1) % m], bot[k]), tone(sk, 0.85))
        c = end + Vector((0, 0, 0.18))
        octa(g, c, 0.2, core)
        ns = 9
        for k in range(ns):
            zz = 1 - 1.5 * (k + 0.5) / ns
            rr = math.sqrt(max(0.0, 1 - zz * zz))
            a = k * 2.39996 + rng.random()
            dirv = Vector((math.cos(a) * rr, math.sin(a) * rr, zz + 0.25))
            spike(g, c, dirv, rng.uniform(0.5, 0.7), 0.06, rng.choice(leaf))
    return H


def build_ocotillo(g, rng):
    """A fountain of long whip canes from one root, splaying out and curving, green with leaf after the rain, a
    red-orange flower spike on every tip. From above: a burst of thin rays with red ends."""
    H = 4.6
    cane = hexc(PAL["oco_cane"]); caned = hexc(PAL["oco_cane_dk"]); lf = hexc(PAL["oco_leaf"])
    fl = hexc(PAL["oco_flower"])
    n = rng.randint(11, 14)
    for i, a in enumerate(ring_dirs(n, rng, 0.4)):
        tilt = rng.uniform(0.18, 0.5)
        L = rng.uniform(3.4, 4.4) * (0.75 if i % 4 == 0 else 1.0)
        d = Vector((math.cos(a), math.sin(a), 0))
        pts = []
        for k in range(5):
            t = k / 4
            ang = tilt * (0.6 + 0.8 * t)  # curving outward as it climbs
            pts.append(d * (L * t * math.sin(ang) * 1.1) + Vector((0, 0, L * t * math.cos(ang * 0.7))) + d * 0.08)
        tube(g, pts, [0.07, 0.06, 0.05, 0.04, 0.03], 3, cane, cap=None,
             col_fn=lambda s, k, tr: (lf if s in (1, 2) else caned) if k != 1 else cane)
        tipd = (pts[-1] - pts[-2]).normalized()
        spike(g, pts[-1], tipd, rng.uniform(0.35, 0.5), 0.07, fl)
    # the root crown
    blob(g, (0, 0, 0.08), (0.28, 0.28, 0.14), [caned], 0, jitter=0.2)
    return H


def _dead_limb(g, rng, p0, d, length, r, depth, cols):
    p0 = Vector(p0)
    d = Vector(d).normalized()
    bend = Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(-0.05, 0.15)))
    mid = p0 + d * (length * 0.5) + bend * length * 0.3
    end = p0 + d * length + bend * length * 0.5
    sides = 5 if depth == 0 else (4 if depth == 1 else 3)
    tube(g, [p0, mid, end], [r, r * 0.8, r * 0.55], sides, cols[depth % len(cols)], cap="point", cap_len=1.5)
    if depth >= 2:
        return
    kids = rng.randint(2, 3) if depth == 0 else rng.randint(1, 3)
    for _ in range(kids):
        a = rng.uniform(0.4, 0.9) * rng.choice((-1, 1))
        axis = d.cross(Vector((0, 0, 1)))
        axis = axis.normalized() if axis.length > 1e-4 else Vector((1, 0, 0))
        nd = (Matrix.Rotation(a, 3, axis) @ d)
        nd = Matrix.Rotation(rng.uniform(0, 6.283), 3, d) @ nd
        nd.z = max(nd.z, 0.15)
        t = rng.uniform(0.55, 0.95)
        _dead_limb(g, rng, p0 + (end - p0) * t, nd, length * rng.uniform(0.45, 0.7), r * 0.6, depth + 1, cols)


def build_deadtree(g, rng):
    """A bleached dead tree: a split trunk and bare forking limbs, one snapped short. From above: a grey skeleton."""
    H = 5.2
    cols = [hexc(PAL["dead_dk"]), hexc(PAL["dead"]), hexc(PAL["dead_lt"])]
    fork = Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(1.5, 2.1)))
    tube(g, [(0, 0, 0), fork * 0.55, fork], [0.26, 0.2, 0.17], 5, cols[0], cap=None)
    for i, a in enumerate(ring_dirs(rng.randint(2, 3), rng, 0.3)):
        d = Vector((math.cos(a) * 0.7, math.sin(a) * 0.7, 1.0))
        L = rng.uniform(2.0, 3.0) * (0.45 if i == 0 and rng.random() < 0.5 else 1.0)
        _dead_limb(g, rng, fork, d, L, 0.14, 0, cols)
    return H


def build_tumbleweed(g, rng):
    """A ball of dry tangled twigs: a straw-coloured lumpy core wrapped in many short crooked twig arcs at random
    tilts, so it reads as a loose round tan mass from above, not a wire cage."""
    H = 0.9
    R = 0.45
    cols = [hexc(c) for c in PAL["tumble"]]
    c = Vector((0, 0, R))
    blob(g, c, (R * 0.72, R * 0.72, R * 0.66), cols + [hexc(PAL["tumble_core"])], 1, jitter=0.22, dark=0.72)
    for h in range(14):
        axis = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
        n, b = frame(axis)
        seg = 4
        start = rng.uniform(0, 6.283)
        span = rng.uniform(1.4, 2.6)
        pts = []
        for k in range(seg + 1):
            a = start + span * k / seg
            rr = R * rng.uniform(0.78, 1.04)
            pts.append(c + (n * math.cos(a) + b * math.sin(a)) * rr + axis * rng.uniform(-0.06, 0.06))
        tube(g, pts, [0.016] * (seg + 1), 3, rng.choice(cols), cap=None)
    return H


def build_creosote(g, rng):
    """Creosote bush: a low open mound of small dark olive clumps on thin dark stems, flecked with yellow flowers."""
    H = 1.5
    cols = [hexc(c) for c in PAL["creo"]]
    stem = hexc(PAL["creo_stem"])
    fl = hexc(PAL["creo_flower"])
    n = rng.randint(7, 9)
    tops = []
    for a in ring_dirs(n, rng, 0.45):
        rr = rng.uniform(0.35, 0.95)
        top = Vector((math.cos(a) * rr, math.sin(a) * rr, rng.uniform(0.75, 1.15) * (1.15 - rr * 0.3)))
        tube(g, [Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0)), top], [0.035, 0.02], 3, stem, cap=None)
        tops.append(top)
    tops.append(Vector((0, 0, 1.15)))
    for t in tops:
        r = rng.uniform(0.32, 0.45)
        blob(g, t, (r, r * 0.9, r * 0.75), cols, 0, jitter=0.3, dark=0.72)
    for _ in range(rng.randint(5, 7)):
        t = rng.choice(tops) + Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0.15, 0.3)))
        octa(g, t, 0.06, fl)
    return H


def _pad(g, c, normal, up, w, h, th, col, rim):
    """A prickly-pear pad: a flattened 8-gon disc (both faces + rim) centred at c, its face along `normal`."""
    normal = Vector(normal).normalized()
    up = (Vector(up) - normal * Vector(up).dot(normal)).normalized()
    side = up.cross(normal).normalized()
    m = 8
    front, back = [], []
    for k in range(m):
        a = 2 * math.pi * k / m
        p = c + side * (math.cos(a) * w) + up * (math.sin(a) * h)
        front.append(g.vert(p + normal * th))
        back.append(g.vert(p - normal * th))
    cf = g.vert(c + normal * th * 1.8)
    cb = g.vert(c - normal * th * 1.8)
    for k in range(m):
        k1 = (k + 1) % m
        g.face((front[k], front[k1], cf), col)
        g.face((back[k1], back[k], cb), tone(col, 0.9))
        g.face((front[k1], front[k], back[k], back[k1]), rim)
    return [c + side * (math.cos(a) * w * 0.9) + up * (math.sin(a) * h * 0.9) for a in (0.9, 1.57, 2.2)]


def build_pricklypear(g, rng):
    """Opuntia: a sprawl of flat oval pads, each growing from the rim of the last, some leaning out so their faces
    show from above, with red fruit along the top rims."""
    H = 1.5
    cols = [hexc(c) for c in PAL["pear"]]
    rim = hexc(PAL["pear_rim"])
    fruit = hexc(PAL["pear_fruit"])
    queue = []
    for a in ring_dirs(rng.randint(3, 4), rng, 0.4):
        d = Vector((math.cos(a), math.sin(a), 0))
        lean = rng.uniform(0.7, 1.2)
        up = (Vector((0, 0, 1)) + d * lean).normalized()
        c = d * 0.22 + up * 0.38
        queue.append((c, d, up, 0))
    pads = 0
    while queue and pads < 11:
        c, d, up, depth = queue.pop(0)
        # the pad's face turned mostly skyward (normal = its lean's side, rolled toward up) so it reads from above
        normal = d.cross(up)
        normal = normal.normalized() if normal.length > 1e-4 else Vector((1, 0, 0))
        normal = Matrix.Rotation(rng.uniform(0.9, 1.3) * rng.choice((-1, 1)), 3, up) @ normal
        tops = _pad(g, c, normal, up, rng.uniform(0.32, 0.4), rng.uniform(0.42, 0.5), 0.04, rng.choice(cols), rim)
        pads += 1
        if depth < 2:
            for t in rng.sample(tops, rng.randint(1, 2)):
                nd = Matrix.Rotation(rng.uniform(-0.8, 0.8), 3, Vector((0, 0, 1))) @ d
                nup = (up + nd * rng.uniform(0.3, 0.6) + Vector((0, 0, 0.15))).normalized()
                queue.append((t + nup * 0.36, nd, nup, depth + 1))
        elif rng.random() < 0.8:
            for t in rng.sample(tops, 2):
                octa(g, t + up * 0.05, 0.075, fruit, squash=1.3)
    return H


def build_pine(g, rng):
    """A ponderosa-like pine: a straight red-brown trunk under a tall narrow spire of ragged needle tiers, each tier a
    drooping star of boughs with a lighter upper face, so from above it reads as a dark star nested in stars, and a
    stand of them closes into a rough dark canopy."""
    H = 14.0
    bark_dk = hexc(PAL["pine_bark_dk"])
    cols = [hexc(c) for c in PAL["pine"]]
    lean = Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), 0))
    tube(g, [(0, 0, 0), lean * 0.3 + Vector((0, 0, 5)), lean + Vector((0, 0, 12.6))], [0.42, 0.3, 0.12], 6, bark_dk, cap=None)
    tiers = 6
    z0, z1 = rng.uniform(3.6, 4.4), 13.4
    for t in range(tiers):
        f = t / (tiers - 1)
        zb = z0 + (z1 - z0) * f * 0.86
        R = (3.4 - 2.5 * f) * rng.uniform(0.9, 1.08)
        sides = 9
        c = lean * (zb / 12.6) + Vector((0, 0, zb))
        ph = rng.random() * 6.283
        outer, inner = [], []
        for k in range(sides):
            a = ph + 2 * math.pi * k / sides
            rr = R * rng.uniform(0.78, 1.12)
            outer.append(g.vert(c + Vector((math.cos(a) * rr, math.sin(a) * rr, -rng.uniform(0.35, 0.7)))))
            a2 = a + math.pi / sides
            ri = rr * 0.55
            inner.append(g.vert(c + Vector((math.cos(a2) * ri, math.sin(a2) * ri, 0.55 + 0.25 * (1 - f)))))
        apex = g.vert(c + Vector((0, 0, 1.6 + 1.1 * (1 - f))))
        col = tone(cols[t % len(cols)], 0.86 + 0.22 * f)
        for k in range(sides):
            k1 = (k + 1) % sides
            g.face((outer[k], outer[k1], inner[k]), tone(col, 0.82))
            g.face((outer[k1], inner[k1], inner[k]), col)
            g.face((inner[k], inner[k1], apex), tone(col, 1.08))
        g.face(tuple(reversed(outer)), tone(col, 0.6))
    return H


def build_oak(g, rng):
    """A broad oak: a short heavy trunk splitting low into spreading limbs under a wide, flattened dome of dark
    rounded masses, wider than twice its height, lit on top and dark underneath. Side by side they close into a
    canopy you cannot see the ground through."""
    H = 9.0
    bark = hexc(PAL["oak_bark"]); bark_dk = hexc(PAL["oak_bark_dk"])
    cols = [hexc(c) for c in PAL["oak"]]
    fork = Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(2.0, 2.6)))
    tube(g, [(0, 0, 0), Vector((0, 0, 1.1)), fork], [0.62, 0.48, 0.4], 6, bark_dk, cap=None)
    n = rng.randint(4, 5)
    for i, a in enumerate(ring_dirs(n, rng, 0.22)):
        d = Vector((math.cos(a), math.sin(a), 0))
        reach = rng.uniform(3.4, 4.6)
        mid = fork + d * reach * 0.45 + Vector((0, 0, rng.uniform(1.2, 1.7)))
        end = fork + d * reach + Vector((0, 0, rng.uniform(2.2, 3.0)))
        tube(g, [fork, mid, end], [0.26, 0.17, 0.1], 4, bark, cap=None)
        r = rng.uniform(2.4, 3.0)
        blob(g, end + Vector((0, 0, 0.6)), (r, r * 0.9, r * 0.55), cols, 0, jitter=0.2, dark=0.55)
    blob(g, fork + Vector((0, 0, 4.4)), (3.6, 3.3, 1.9), cols, 1, jitter=0.15, dark=0.55)
    for _ in range(3):
        a = rng.random() * 6.283
        c = fork + Vector((math.cos(a) * 1.6, math.sin(a) * 1.6, 5.2 + rng.uniform(0, 0.6)))
        blob(g, c, (1.7, 1.5, 0.9), cols, 0, jitter=0.2, dark=0.7)
    return H


# ---------------------------------------------------------------- Florida
def moss(g, top, length, w, cols):
    """A strand of Spanish moss: two crossed tapering strips hanging straight down from top, swaying a little."""
    top = Vector(top)
    sway = Vector((g.rng.uniform(-0.15, 0.15), g.rng.uniform(-0.15, 0.15), 0))
    yaw = g.rng.random() * 3.14
    for a in (yaw, yaw + math.pi / 2):
        s = Vector((math.cos(a), math.sin(a), 0)) * w
        mid = top + sway + Vector((0, 0, -length * 0.5))
        ids = [g.vert(top - s), g.vert(top + s), g.vert(mid + s * 0.8), g.vert(mid - s * 0.8)]
        mc = g.vert(mid + Vector((0, 0, -length * 0.08)))
        # a ragged beard, not an icicle: the lower half splits into two straggling tails of different length
        t1 = g.vert(mid - s * 0.5 + sway + Vector((0, 0, -length * g.rng.uniform(0.35, 0.5))))
        t2 = g.vert(mid + s * 0.5 + sway + Vector((0, 0, -length * g.rng.uniform(0.2, 0.35))))
        col = g.rng.choice(cols)
        g.face(tuple(ids), col)
        g.face((ids[3], mc, t1), tone(col, 0.9))
        g.face((mc, ids[2], t2), tone(col, 0.84))


def lid(g, c, R, h, under, cols, sectors=16):
    """A broad umbrella canopy: a lumpy low dome over c (rim at c's height, crown h above) with a scalloped edge,
    closed underneath by a shallow dark cone. Lighter on the roof, darker on the drooping rim and underside."""
    rng = g.rng
    rim = [R * rng.uniform(0.86, 1.06) * (1.0 + 0.08 * math.sin(k * 2.6)) for k in range(sectors)]
    prof = ((0.3, 0.97, 1.1), (0.58, 0.84, 1.0), (0.82, 0.58, 0.9), (1.0, 0.08, 0.76))  # radius frac, height frac, shade
    top = g.vert(c + Vector((0, 0, h)))
    rings = []
    for i, (fr, zh, _) in enumerate(prof):
        ring = []
        for k in range(sectors):
            # alternate rings turned half a sector, so the roof does not read as umbrella spokes from above
            a = 2 * math.pi * (k + 0.5 * (i % 2)) / sectors
            r = rim[k] * fr * rng.uniform(0.94, 1.06)
            z = zh * h + rng.uniform(-0.1, 0.1) * h * (1.0 if fr < 1 else 0.6)
            ring.append(g.vert(c + Vector((math.cos(a) * r, math.sin(a) * r, z))))
        rings.append(ring)
    und = [g.vert(c + Vector((math.cos(2 * math.pi * k / sectors) * rim[k] * 0.55,
                              math.sin(2 * math.pi * k / sectors) * rim[k] * 0.55, -under))) for k in range(sectors)]
    bot = g.vert(c + Vector((0, 0, -under * 0.5)))
    for k in range(sectors):
        k1 = (k + 1) % sectors
        g.face((top, rings[0][k], rings[0][k1]), tone(rng.choice(cols), prof[0][2]))
        for i in range(len(rings) - 1):
            A, B = rings[i], rings[i + 1]
            g.face((A[k], B[k], B[k1], A[k1]), tone(rng.choice(cols), prof[i + 1][2]))
        B = rings[-1]
        g.face((B[k], und[k], und[k1], B[k1]), tone(rng.choice(cols), 0.6))
        g.face((bot, und[k1], und[k]), tone(rng.choice(cols), 0.5))


def puffs(g, c, n, r, cols, spread, squash=0.4, lift=0.3):
    """A loose cluster of flat leaf puffs round c: a broken, needle-tuft texture from above."""
    rng = g.rng
    for q in range(n):
        a = rng.random() * 6.283
        dd = rng.uniform(0.3, 1.0) * spread if q else 0.0
        p = Vector(c) + Vector((math.cos(a) * dd, math.sin(a) * dd, rng.uniform(-0.15, 1.0) * lift))
        octa(g, p, r * rng.uniform(0.8, 1.15), tone(rng.choice(cols), rng.uniform(0.86, 1.08)),
             squash=squash, yaw=rng.random() * 3.14, stretch=rng.uniform(1.0, 1.4))


def build_sabal(g, rng):
    """Cabbage palm (Sabal palmetto), Florida's state tree: a straight grey-brown trunk armoured in criss-cross leaf
    'boots' on its lower and middle reach, smooth grey at the foot, and a dense ROUND head of costapalmate fans —
    each fan arched down along its midrib and split at the tips — deeper green than the desert fan palm, with no dead
    skirt. From above: a full rounded green star-disc."""
    H = 9.0
    tk = hexc(PAL["sabal_trunk"]); bt = hexc(PAL["sabal_boot"]); btd = hexc(PAL["sabal_boot_dk"])
    lean = Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 0))
    top_z = rng.uniform(7.0, 7.6)
    n = 8
    pts = [lean * ((i / n) ** 1.8) + Vector((0, 0, top_z * i / n)) for i in range(n + 1)]
    # boot rings stand proud of the trunk; the bottom two segments are the smooth weathered foot
    radii = [0.36, 0.33] + [(0.42 if i % 2 else 0.36) - 0.03 * (i / n) for i in range(2, n + 1)]
    boot = lambda s, k, tr: tk if s < 2 else (bt if (tr + s) % 2 == 0 else btd)
    tube(g, pts, radii, 6, tk, cap=None, offset_rings=True, col_fn=boot)
    crown = pts[-1]
    leaf = [hexc(c) for c in PAL["sabal_leaf"]]
    stalk_c = hexc(PAL["sabal_stalk"])
    nf = rng.randint(17, 18)
    base = crown + Vector((0, 0, 0.25))
    for i, a in enumerate(ring_dirs(nf, rng, 0.35)):
        # a BALL of fans, not stacked plates: pitches spread from standing up over the heart to hanging, golden-step
        # so neighbours differ — and no dead skirt below
        t = (i * 0.618 + rng.uniform(-0.05, 0.05)) % 1.0
        pitch = -0.75 + 1.95 * t
        d = Vector((math.cos(a), math.sin(a), 0))
        stalk = (1.3 - 0.55 * t) * rng.uniform(0.85, 1.15)
        f = (d * math.cos(pitch) + Vector((0, 0, math.sin(pitch)))).normalized()
        side = d.cross(Vector((0, 0, 1))).normalized()
        hub = base + f * stalk
        sw = side * 0.06
        g.face((g.vert(base - sw), g.vert(base + sw), g.vert(hub + sw), g.vert(hub - sw)), stalk_c)
        R = (1.85 - 0.45 * t) * rng.uniform(0.9, 1.1)
        col = rng.choice(leaf)
        if pitch < -0.2:
            col = tone(col, 0.85)
        K = 7
        c0 = g.vert(hub)
        inner, rim = [], []
        for k in range(K + 1):
            th = math.radians(-115 + 230 * k / K)
            dirv = f * math.cos(th) + side * math.sin(th)
            # costapalmate: the fan arches down along its midrib, hardest at the centre line
            arch = (0.25 + 0.35 * math.cos(th)) * R * (0.6 if pitch > 0.6 else 1.0)
            pleat = 0.1 * R * (1 if k % 2 else -1)
            inner.append(g.vert(hub + dirv * R * 0.45 + Vector((0, 0, -arch * 0.2 + pleat))))
            jag = 1.0 if k % 2 == 0 else 0.6  # deeply split segments: pointed star tips
            rim.append(g.vert(hub + dirv * R * jag + Vector((0, 0, -arch * jag))))
        for k in range(K):
            shade = 1.08 if k % 2 else 0.9
            g.face((c0, inner[k], inner[k + 1]), tone(col, shade * 0.95), 0.03)
            g.face((inner[k], rim[k], rim[k + 1], inner[k + 1]), tone(col, shade), 0.03)
    return H


def build_slashpine(g, rng):
    """Slash pine of the flatwoods: a tall straight bare trunk of plated red-brown and grey bark, limbs only in the top
    third, and an open, irregular, flat-topped crown of dark blue-green needle tufts on short limbs — not a cone. From
    above: a ragged dark crown with gaps you see the limbs through."""
    H = 16.0
    bk = hexc(PAL["pine_bark"]); bg = hexc(PAL["pine_bark_gr"]); bd = hexc(PAL["pine_bark_dk"])
    leaf = [hexc(c) for c in PAL["pine_leaf"]]
    lean = Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0))
    top_z = rng.uniform(14.2, 15.0)
    n = 6
    pts = [lean * ((i / n) ** 1.5) + Vector((0, 0, top_z * i / n)) for i in range(n + 1)]
    radii = [0.42 - 0.3 * (i / n) for i in range(n + 1)]
    plates = lambda s, k, tr: (bk if (s + k) % 2 else bg) if rng.random() > 0.15 else bd
    tube(g, pts, radii, 6, bk, cap="point", cap_len=2.0, col_fn=plates)

    def trunk_at(z):
        t = z / top_z
        return lean * (t ** 1.5) + Vector((0, 0, z))

    nl = rng.randint(6, 7)
    for i, a in enumerate(ring_dirs(nl, rng, 0.35)):
        z0 = top_z * rng.uniform(0.66, 0.9)
        p0 = trunk_at(z0)
        d = Vector((math.cos(a), math.sin(a), 0))
        reach = rng.uniform(1.6, 3.3) * (0.6 if i % 3 == 2 else 1.0)
        ez = max(z0 + 0.6, top_z * rng.uniform(0.84, 1.0))
        end = p0 + d * reach
        end.z = ez
        mid = p0 + d * reach * 0.55 + Vector((0, 0, (ez - z0) * 0.45))
        tube(g, [p0, mid, end], [0.13, 0.09, 0.06], 3, bd, cap=None)
        # a needle tuft: a lumpy flattened clump plus a loose spray off its edge
        r = rng.uniform(1.1, 1.45)
        blob(g, end + Vector((0, 0, 0.2)), (r, r * 0.85, r * 0.45), leaf, 0, jitter=0.35, dark=0.62)
        puffs(g, end + Vector((0, 0, 0.1)) + d * r * 0.8, 1, 0.65, leaf, spread=0.6, squash=0.5, lift=0.2)
        if rng.random() < 0.6:
            # a side fork off the limb with a second, smaller tuft: a ragged crown, not one ball per limb
            d2 = Matrix.Rotation(rng.choice((-1, 1)) * rng.uniform(0.6, 1.0), 3, 'Z') @ d
            f0 = p0 + (end - p0) * 0.5
            f1 = f0 + d2 * rng.uniform(1.2, 1.8) + Vector((0, 0, rng.uniform(0.2, 0.6)))
            tube(g, [f0, f1], [0.07, 0.05], 3, bd, cap=None)
            r2 = rng.uniform(0.8, 1.0)
            blob(g, f1 + Vector((0, 0, 0.15)), (r2, r2 * 0.85, r2 * 0.45), leaf, 0, jitter=0.35, dark=0.62)
    r = 1.05
    blob(g, pts[-1] + Vector((0, 0, 0.1)), (r, r, r * 0.5), leaf, 0, jitter=0.35, dark=0.62)
    return H


def build_cypress(g, rng):
    """Bald cypress of the swamp: a broad buttressed foot flaring into ridges at the waterline, a straight tapering
    trunk, a narrow flat-topped crown of soft feathery yellow-green on short limbs, knees standing round the base and a
    few grey strands of moss hanging from the limbs."""
    H = 13.0
    bk = hexc(PAL["cyp_bark"]); bd = hexc(PAL["cyp_bark_dk"]); kn = hexc(PAL["cyp_knee"])
    leaf = [hexc(c) for c in PAL["cyp_leaf"]]
    ms = [hexc(c) for c in PAL["moss"]]
    # the buttress: a ribbed flared cone
    prof = lambda k: 1.0 if k % 2 == 0 else 0.6
    tube(g, [(0, 0, 0), (0, 0, 0.55), (0, 0, 1.5)], [1.3, 0.72, 0.44], 10, bd, cap=None, profile=prof,
         col_fn=lambda s, k, tr: bd if k % 2 else bk)
    top_z = rng.uniform(11.4, 12.0)
    lean = Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0))
    zs = [1.4, 4.0, 7.0, 9.6, top_z]
    pts = [lean * ((z / top_z) ** 1.5) + Vector((0, 0, z)) for z in zs]
    tube(g, pts, [0.44, 0.36, 0.28, 0.2, 0.12], 6, bk, cap="point", cap_len=2.0,
         col_fn=lambda s, k, tr: bk if (s + k) % 3 else bd)
    # knees: little conical stumps standing out of the water round the foot
    for a in ring_dirs(rng.randint(2, 4), rng, 0.4):
        rr = rng.uniform(1.7, 2.5)
        p = Vector((math.cos(a) * rr, math.sin(a) * rr, 0))
        h = rng.uniform(0.35, 0.6)
        tube(g, [p, p + Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), h))], [0.17, 0.1], 4, kn,
             cap="point", cap_len=1.6)

    def trunk_at(z):
        return lean * ((z / top_z) ** 1.5) + Vector((0, 0, z))

    nl = 8
    limb_pts = []
    for i, a in enumerate(ring_dirs(nl, rng, 0.35)):
        # limbs climb the upper half in a spiral, so the crown is a narrow column of foliage, not tiers of pads
        z0 = top_z * (0.5 + 0.43 * ((i * 0.618) % 1.0) + rng.uniform(-0.03, 0.03))
        p0 = trunk_at(z0)
        d = Vector((math.cos(a), math.sin(a), 0))
        # flat top: the high limbs reach out as far as the low ones, so the crown's roof is level
        reach = rng.uniform(1.1, 1.7) + 0.5 * ((z0 / top_z) - 0.5) / 0.43
        end = p0 + d * reach + Vector((0, 0, rng.uniform(0.2, 0.5)))
        tube(g, [p0, end], [0.1, 0.06], 3, bd, cap=None)
        limb_pts.append((p0 + (end - p0) * 0.55, end))
        # feathery sprays: small, flat, elongated, lots of them, along the limb and at its end
        for t, nn in ((0.5, 1), (1.0, 3)):
            puffs(g, p0 + (end - p0) * t, nn, rng.uniform(0.6, 0.72), leaf, spread=0.95, squash=0.5, lift=0.9)
    puffs(g, pts[-1] + Vector((0, 0, -0.3)), 4, 0.9, leaf, spread=0.9, squash=0.4, lift=0.3)
    for mp, end in rng.sample(limb_pts, 4):
        moss(g, mp + Vector((0, 0, -0.15)), rng.uniform(1.3, 2.0), 0.16, ms)
    return H


def build_mangrove(g, rng):
    """Red mangrove: a short trunk held up off the mud on an arching tangle of prop roots that splay out in a ring,
    under a dense dome of glossy dark green. From above: a dark dome with the root arches showing at its edge."""
    H = 4.5
    rt = hexc(PAL["mang_root"]); rtd = hexc(PAL["mang_root_dk"]); bk = hexc(PAL["mang_bark"])
    leaf = [hexc(c) for c in PAL["mang_leaf"]]
    tube(g, [(0, 0, 0.4), (0, 0, 1.4), (rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 2.4)], [0.17, 0.15, 0.12], 5,
         bk, cap=None)
    # prop roots: some from the trunk, some dropping from the low limbs under the canopy edge; each rises a little,
    # arches out, then plunges steeply into the mud past the canopy's rim
    # a TANGLE, not legs: many roots of mixed reach, each a rainbow arch (out level, then curving down to plunge
    # vertically), drifting sideways as it goes so neighbours cross
    nr = rng.randint(13, 14)
    for i, a in enumerate(ring_dirs(nr, rng, 0.45)):
        a1 = a + rng.uniform(-0.55, 0.55)
        s = rng.uniform(0.1, 0.4) if i % 3 == 0 else rng.uniform(0.6, 1.3)
        z0 = rng.uniform(1.0, 1.5) if i % 3 == 0 else rng.uniform(1.5, 2.1)
        R = rng.uniform(1.4, 1.7) if i % 4 == 1 else rng.uniform(1.95, 2.3)
        p = []
        for th in (0.0, 0.42, 0.78, 1.0):
            aa = a + (a1 - a) * th
            ang = th * math.pi / 2
            rr = s + (R - s) * math.sin(ang)
            p.append(Vector((math.cos(aa) * rr, math.sin(aa) * rr, z0 * math.cos(ang) + 0.25 * math.sin(2 * ang) - 0.05)))
        tube(g, p, [0.11, 0.1, 0.09, 0.085], 3, rt if i % 2 else rtd, cap=None)
    # the dome stays inside the root ring, so from above the arches show as a brown fringe round the green
    Rd = rng.uniform(1.45, 1.6)
    cz = 2.85
    blob(g, (0, 0, cz), (Rd, Rd * rng.uniform(0.88, 0.98), 1.15), leaf, 1, jitter=0.14, dark=0.6)
    for a in ring_dirs(4, rng, 0.3):
        p = Vector((math.cos(a) * Rd * 0.62, math.sin(a) * Rd * 0.62, cz - 0.55))
        r = rng.uniform(0.7, 0.85)
        blob(g, p, (r, r, r * 0.6), leaf, 0, jitter=0.2, dark=0.6)
    return H


def build_liveoak(g, rng):
    """Southern live oak: a short massive trunk that splits low into long, near-horizontal limbs, under a very broad,
    flattened dark-green canopy, far wider than it is tall, hung with grey-green Spanish moss."""
    H = 9.0
    bk = hexc(PAL["oak_bark"]); bd = hexc(PAL["oak_bark_dk"])
    leaf = [hexc(c) for c in PAL["oak_leaf"]]
    ms = [hexc(c) for c in PAL["moss"]]
    fork = Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(2.3, 2.7)))
    tube(g, [(0, 0, 0), fork * 0.5, fork], [0.85, 0.66, 0.6], 6, bd, cap=None,
         col_fn=lambda s, k, tr: bd if (s + k) % 2 else bk)
    nl = rng.randint(4, 5)
    ends = []
    for i, a in enumerate(ring_dirs(nl, rng, 0.2)):
        d = Vector((math.cos(a), math.sin(a), 0))
        reach = rng.uniform(3.8, 4.4)
        rise = rng.uniform(1.2, 1.7)
        # long near-horizontal limbs: climb out of the fork, then run level and sag a little at the end
        p = [fork, fork + d * reach * 0.3 + Vector((0, 0, rise * 0.85)), fork + d * reach * 0.65 + Vector((0, 0, rise)),
             fork + d * reach + Vector((0, 0, rise * rng.uniform(0.55, 0.8)))]
        tube(g, p, [0.42, 0.3, 0.21, 0.13], 4, bk, cap=None)
        ends.append((p, d))
    # the canopy: ONE broad, low, flattened umbrella with a scalloped, drooping rim — from above a single wide dark
    # mass, not a cluster of balls (that is the mesquite) — with a few low lumps breaking its roof
    c = Vector((fork.x, fork.y, fork.z + 2.3))
    R = rng.uniform(4.45, 4.75)
    hl = 2.3
    lid(g, c, R, hl, 0.5, leaf)
    for a in ring_dirs(4, rng, 0.3):
        dd = rng.uniform(0.3, 0.6) * R
        q = c + Vector((math.cos(a) * dd, math.sin(a) * dd, hl * 0.72))
        r = rng.uniform(1.5, 1.9)
        blob(g, q, (r, r * 0.85, r * 0.36), leaf, 0, jitter=0.22, dark=0.72)
    # Spanish moss: beards hanging from the limbs under the canopy rim, long enough to show below it
    strands = 0
    for p, d in ends:
        for t in (2, 3):
            if strands >= 8:
                break
            q = p[t] - d * 0.3 + Vector((rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0.1))
            moss(g, q, rng.uniform(1.8, 2.6), 0.24, ms)
            strands += 1
    return H


SPECIES = {
    # name: (builder, nominal height m) — heights mirror web/src/world/flora.js SPECIES
    "paloverde": (build_paloverde, 4.6),
    "mesquite": (build_mesquite, 4.4),
    "fanpalm": (build_fanpalm, 11.0),
    "datepalm": (build_datepalm, 9.5),
    "citrus": (lambda g, r, v: build_citrus(g, r, lemons=(v == 2)), 3.6),
    "saguaro": (build_saguaro, 7.5),
    "joshua": (build_joshua, 5.4),
    "ocotillo": (build_ocotillo, 4.6),
    "deadtree": (build_deadtree, 5.2),
    "tumbleweed": (build_tumbleweed, 0.9),
    "creosote": (build_creosote, 1.5),
    "pricklypear": (build_pricklypear, 1.3),
    "pine": (build_pine, 14.0),
    "oak": (build_oak, 9.0),
    # Florida
    "sabal": (build_sabal, 9.0),
    "slashpine": (build_slashpine, 16.0),
    "cypress": (build_cypress, 13.0),
    "mangrove": (build_mangrove, 4.5),
    "liveoak": (build_liveoak, 9.0),
}


# ---------------------------------------------------------------- Blender plumbing
def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def flora_material():
    m = bpy.data.materials.get("flora")
    if m:
        return m
    m = bpy.data.materials.new("flora")
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Color"
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.9
    return m


def to_object(name, g, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in g.v], [], [list(f) for f in g.f])
    me.validate(clean_customdata=False)
    me.update()
    attr = me.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    cols = []
    for poly in me.polygons:
        r, gg, b = g.c[poly.index]
        for _ in range(poly.loop_total):
            cols.extend((r, gg, b, 1.0))
    attr.data.foreach_set("color", cols)
    me.color_attributes.active_color = attr
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build_species(name):
    builder, H = SPECIES[name]
    mat = flora_material()
    obs, info = [], []
    for v in range(VARIANTS):
        rng = random.Random(zlib.crc32(("%s:%d" % (name, v)).encode()))
        g = Geo(rng)
        if builder.__code__.co_argcount >= 3:
            builder(g, rng, v)
        else:
            builder(g, rng)
        g.scale(H / g.top())
        tris = g.tris()
        if not (TRI_MIN <= tris <= TRI_MAX):
            raise SystemExit("BUDGET %s v%d: %d triangles (want %d-%d)" % (name, v, tris, TRI_MIN, TRI_MAX))
        crown = max(math.hypot(p.x, p.y) for p in g.v)
        obs.append(to_object("%s_v%d" % (name, v), g, mat))
        info.append({"tris": tris, "radius": round(crown, 2)})
    return obs, info, H


def export(name, obs):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_vertex_color='ACTIVE', export_materials='EXPORT',
                              export_normals=True, export_texcoords=False)
    print("EXPORTED %s" % path)


# ---------------------------------------------------------------- previews
def stage(ground_size):
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE'
    try:
        scn.eevee.taa_render_samples = 24
    except Exception:
        pass
    scn.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new("sky")
    scn.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.62, 0.64, 0.66, 1.0)
    bg.inputs["Strength"].default_value = 0.55
    me = bpy.data.meshes.new("ground")
    s = ground_size
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [[0, 1, 2, 3]])
    gm = bpy.data.materials.new("sand")
    try:
        gm.use_nodes = True
    except Exception:
        pass
    b = next(n for n in gm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*hexc("#c2a27a"), 1.0)
    b.inputs["Roughness"].default_value = 1.0
    me.materials.append(gm)
    ground = bpy.data.objects.new("ground_plane", me)
    scn.collection.objects.link(ground)
    sun = bpy.data.lights.new("sun", 'SUN')
    sun.energy = 4.0
    sun.angle = math.radians(2)
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(38), math.radians(0), math.radians(-35))
    scn.collection.objects.link(so)
    return ground, so


def camera(kind, span, aspect=16 / 9):
    scn = bpy.context.scene
    cd = bpy.data.cameras.new("cam")
    co = bpy.data.objects.new("cam", cd)
    scn.collection.objects.link(co)
    if kind == "top":
        cd.type = 'ORTHO'
        cd.ortho_scale = span
        co.location = (0, 0, 60)
        co.rotation_euler = (0, 0, 0)
    else:
        cd.sensor_fit = 'VERTICAL'
        cd.angle_y = math.radians(42)
        if kind == "game":
            # web/src/main.js: the camera stands camHeight over the look point and 0.14 x camHeight to the south
            # (+z in three = -y here), looking at the point: ~8 degrees off vertical.
            h = max(12.0, span / aspect / (2 * math.tan(math.radians(21))) * 1.0)
            co.location = (0, -0.14 * h, h)
            look = Vector((0, 0, 0))
        else:
            d = span * 0.62
            co.location = (d * 0.55, -d * 0.95, d * 0.6)
            look = Vector((0, 0, H_LOOK[0]))
        dirv = look - Vector(co.location)
        co.rotation_mode = 'QUATERNION'
        co.rotation_quaternion = dirv.to_track_quat('-Z', 'Y')
    cd.clip_end = 400
    scn.camera = co
    return co


def render(path, res=(800, 450)):
    scn = bpy.context.scene
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    st = scn.render.image_settings
    st.file_format = 'PNG'
    st.color_mode = 'RGB'      # no alpha, 8-bit, max compression: previews stay small in the repo
    st.color_depth = '8'
    st.compression = 100
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("PREVIEW %s" % path)


def preview_species(name, obs, info, H):
    crown = max(i["radius"] for i in info)
    gap = max(2 * crown * 1.35, H * 0.5, 1.6)
    for i, ob in enumerate(obs):
        ob.location.x = (i - 1) * gap
    span = gap * 3 * 1.1
    H_LOOK[0] = H * 0.45
    ground, sun = stage(span * 3)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    for kind in ("top", "game", "hero"):
        cam = camera(kind, span if kind != "hero" else max(span, H * 2.2))
        render(os.path.join(PREVIEW_DIR, "%s_%s.png" % (name, kind)))
        bpy.data.objects.remove(cam, do_unlink=True)


def sheet(names):
    """Every species' first variant in a 4 x 3 grid, each at its nominal size, from the game camera and above."""
    wipe()
    placed = []
    for name in names:
        obs, info, H = build_species(name)
        placed.append((name, obs[0], info[0]["radius"]))
        for ob in obs[1:]:
            bpy.data.objects.remove(ob, do_unlink=True)
    cell = 9.0
    for i, (name, ob, r) in enumerate(placed):
        cx, cy = i % 4, i // 4
        ob.location = ((cx - 1.5) * cell, (1 - cy) * cell - 3.0, 0)
    span = cell * 5.6
    stage(span * 2)
    for kind in ("top", "game"):
        cam = camera(kind, span)
        render(os.path.join(PREVIEW_DIR, "sheet_%s.png" % kind), res=(1280, 720))
        bpy.data.objects.remove(cam, do_unlink=True)


if __name__ == "__main__":
    _check_palette()
    only = [a for a in ARGS if not a.startswith("--")]
    targets = only if only else list(SPECIES.keys())
    manifest_path = os.path.join(OUT_DIR, "flora.json")
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            manifest = json.load(f).get("species", {})
    for name in targets:
        wipe()
        obs, info, H = build_species(name)
        export(name, obs)
        manifest[name] = {"h": H, "radius": max(i["radius"] for i in info), "tris": [i["tris"] for i in info]}
        print("SPECIES %s h=%.1f tris=%s" % (name, H, [i["tris"] for i in info]))
        if DO_PREVIEWS:
            preview_species(name, obs, info, H)
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(manifest_path, "w") as f:
        json.dump({"note": "Written by tools/blenderforge/gen_flora.py. h: model height (m), radius: widest crown "
                           "reach from the trunk (m), tris: triangles per variant.",
                   "species": {k: manifest[k] for k in SPECIES if k in manifest}}, f, indent=1)
    if DO_SHEET:
        sheet(list(SPECIES.keys()))
    print("BLENDERFORGE FLORA DONE: %s" % ", ".join(targets))
