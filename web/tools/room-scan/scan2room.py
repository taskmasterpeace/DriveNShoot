"""Phone room scan -> DSOA room kit (room.json + clean collision mesh).

Usage:
  python -I scan2room.py <scan.glb|.obj|.ply|.usdz> <out_dir> [--name my-room] [--up auto|y|z]

What it does (no photos survive: the scan's colours are dropped, the game paints its own textures):
  1. Load the scan, make it Y-up, put the floor at 0 and square the room to the X/Z axes.
  2. Find floor height and ceiling height.
  3. Build a top-down grid (8 cm cells). Cells with tall vertical surfaces are WALL, cells you can stand in are FLOOR.
  4. Walls become straight runs (rectangles), with door gaps (floor-level holes in a wall run).
  5. Things on the floor that aren't wall (bed, table, sofa, shelves) become FURNITURE boxes with a guessed kind.
  6. Writes room.json (meters, Y-up, origin = room centre on the floor) and room-shell.glb (decimated, colourless mesh).
"""
import argparse, json, os, subprocess, sys
import numpy as np
import trimesh

CELL = 0.08          # grid cell, meters
WALL_MIN_H = 1.7     # a wall cell has vertical surface reaching at least this high
DOOR_H = 1.9         # door gaps: open from floor to at least this height

ap = argparse.ArgumentParser()
ap.add_argument("scan"); ap.add_argument("out")
ap.add_argument("--name", default=None)
ap.add_argument("--up", default="auto", choices=["auto", "y", "z"])
ap.add_argument("--blender", default=r"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe")
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
name = a.name or os.path.splitext(os.path.basename(a.scan))[0]


def load(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".usdz", ".usd", ".usdc", ".usda"):
        # trimesh can't read USD; Blender (free) converts it to GLB headless.
        glb = os.path.join(a.out, "_from_usd.glb")
        py = ("import bpy,sys;bpy.ops.wm.read_factory_settings(use_empty=True);"
              f"bpy.ops.wm.usd_import(filepath=r'{os.path.abspath(path)}');"
              f"bpy.ops.export_scene.gltf(filepath=r'{os.path.abspath(glb)}',export_format='GLB')")
        subprocess.run([a.blender, "-b", "--python-expr", py], check=True, capture_output=True)
        path, ext = glb, ".glb"
    s = trimesh.load(path, force="scene")
    m = s.to_geometry() if hasattr(s, "to_geometry") else s.dump(concatenate=True)
    return trimesh.Trimesh(m.vertices, m.faces, process=False), ext


mesh, ext = load(a.scan)
up = a.up
if up == "auto":
    # glTF/USD are Y-up by spec; raw PLY/OBJ from LiDAR tools are often Z-up. Pick the axis with the most flat faces.
    n = mesh.face_normals
    up = "y" if (np.abs(n[:, 1]) > 0.9).sum() >= (np.abs(n[:, 2]) > 0.9).sum() else "z"
if up == "z":
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
mesh.remove_unreferenced_vertices()

# ---- floor and ceiling ----
n = mesh.face_normals; c = mesh.triangles_center; area = mesh.area_faces
flat_up = n[:, 1] > 0.9; flat_dn = n[:, 1] < -0.9
hy = np.histogram(c[flat_up, 1], bins=np.arange(c[:, 1].min() - .05, c[:, 1].max() + .05, 0.04), weights=area[flat_up])
low_half = hy[1][:-1] < np.percentile(c[:, 1], 40)
floor_y = hy[1][np.argmax(np.where(low_half, hy[0], 0))] + 0.02
if flat_dn.sum() > 100 and area[flat_dn].sum() > 2:
    hd = np.histogram(c[flat_dn, 1], bins=np.arange(floor_y, c[:, 1].max() + .05, 0.04), weights=area[flat_dn])
    ceil_y = hd[1][np.argmax(hd[0])] + 0.02
else:
    ceil_y = np.percentile(c[:, 1], 99.5)
height = float(ceil_y - floor_y)
mesh.apply_translation([0, -floor_y, 0])
c = mesh.triangles_center

# ---- square the room: dominant wall direction (mod 90 deg) ----
vert = np.abs(n[:, 1]) < 0.2
ang = np.arctan2(n[vert, 2], n[vert, 0]) % (np.pi / 2)
h, e = np.histogram(ang, bins=180, range=(0, np.pi / 2), weights=area[vert])
h = np.convolve(np.r_[h[-3:], h, h[:3]], np.ones(5) / 5, mode="same")[3:-3]
yaw = e[np.argmax(h)] + (e[1] - e[0]) / 2
mesh.apply_transform(trimesh.transformations.rotation_matrix(yaw, [0, 1, 0]))
n = mesh.face_normals; c = mesh.triangles_center; area = mesh.area_faces

# ---- top-down grid ----
lo = mesh.bounds[0][[0, 2]] - CELL * 2; hi = mesh.bounds[1][[0, 2]] + CELL * 2
W, D = np.ceil((hi - lo) / CELL).astype(int)
def cell(xz): return np.clip(((xz - lo) / CELL).astype(int), 0, [W - 1, D - 1])
from scipy import ndimage as ndi
from shapely.geometry import box as sbox, Polygon
from shapely.ops import unary_union

pts, fi = trimesh.sample.sample_surface(mesh, 900000, seed=1)[:2]
pn = n[fi]; pc = cell(pts[:, [0, 2]]); py = pts[:, 1]
isv = np.abs(pn[:, 1]) < 0.35; isup = pn[:, 1] > 0.8
bands = [(0.15, 0.85), (0.95, 1.75), (1.75, DOOR_H + 0.05), (DOOR_H + 0.15, max(DOOR_H + 0.3, height - 0.12))]
cov = np.zeros((len(bands), W, D))
for bi, (b0, b1) in enumerate(bands):
    k = isv & (py > b0) & (py < b1)
    np.add.at(cov[bi], (pc[k, 0], pc[k, 1]), 1)
hasv = cov > 1
floor_hit = np.zeros((W, D), bool); k = isup & (py < 0.12); floor_hit[pc[k, 0], pc[k, 1]] = True
furn_top = np.full((W, D), -1.0)
k = isup & (py > 0.2) & (py < 1.95); np.maximum.at(furn_top, (pc[k, 0], pc[k, 1]), py[k])
low_stuff = np.zeros((W, D), bool); k = isv & (py > 0.15) & (py < 1.2); low_stuff[pc[k, 0], pc[k, 1]] = True

wall = (hasv[1] & hasv[2]) | (hasv[3] & (hasv[1] | hasv[2]))

# ---- room footprint: where you can stand, plus what stands on the floor, squared off ----
inside = ndi.binary_closing(floor_hit, iterations=3)
lab, nl = ndi.label(inside); sizes = ndi.sum(inside, lab, range(1, nl + 1))
inside = lab == (1 + int(np.argmax(sizes)))
inside = ndi.binary_fill_holes(inside)
# furniture standing against the floor region joins the footprint (bed against a wall leaves no floor under it)
grow = ndi.binary_dilation(inside, iterations=12) & ((furn_top > 0) | low_stuff) & ~wall
inside = ndi.binary_fill_holes(inside | (grow & ndi.binary_dilation(inside, iterations=12)))
sq = np.ones((5, 5), bool)  # 40 cm: kills scan fuzz, keeps real corners
fp = ndi.binary_opening(ndi.binary_closing(inside, sq), sq)
lab, nl = ndi.label(fp); fp = lab == (1 + int(np.argmax(ndi.sum(fp, lab, range(1, nl + 1)))))
fp = ndi.binary_fill_holes(fp)

def grid_to_poly(mask):
    rects = []
    for x in range(W):
        z = 0
        while z < D:
            if mask[x, z]:
                z0 = z
                while z < D and mask[x, z]: z += 1
                rects.append(sbox(lo[0] + x * CELL, lo[1] + z0 * CELL, lo[0] + (x + 1) * CELL, lo[1] + z * CELL))
            else: z += 1
    g = unary_union(rects)
    if g.geom_type == "MultiPolygon": g = max(g.geoms, key=lambda p: p.area)
    return Polygon(g.exterior).simplify(0.001)
poly = grid_to_poly(fp)
def orthogonalize(pl, tol=0.22):
    """Drop scan-fuzz steps: simplify, then force every edge to run along X or Z."""
    c = list(pl.simplify(tol).exterior.coords)[:-1]
    if len(c) < 4: return pl
    out = [list(c[0])]
    for x, z in c[1:]:
        px_, pz_ = out[-1]
        if abs(x - px_) >= abs(z - pz_): out.append([x, pz_])
        else: out.append([px_, z])
    # close: last edge must also be axis-aligned
    if abs(out[0][0] - out[-1][0]) >= abs(out[0][1] - out[-1][1]): out[0][1] = out[-1][1]
    else: out[0][0] = out[-1][0]
    q = Polygon(out).buffer(0)
    if q.geom_type == "MultiPolygon": q = max(q.geoms, key=lambda p: p.area)
    return Polygon(q.exterior).simplify(0.001) if q.area > 0.6 * pl.area else pl
poly = orthogonalize(poly)
if not poly.exterior.is_ccw: poly = Polygon(list(poly.exterior.coords)[::-1])

# ---- classify each wall edge every 8 cm: solid / door / window / open ----
def near(mask, x, z, nx, nz):
    """Any hit in a strip from 2 cells inside the edge to 4 cells outside it."""
    for t in range(-2, 5):
        i, j = cell(np.array([x + nx * t * CELL, z + nz * t * CELL]))
        for dx in (-1, 0, 1):
            ii = int(min(max(i + dx * round(abs(nz)), 0), W - 1)); jj = int(min(max(j + dx * round(abs(nx)), 0), D - 1))
            if mask[ii, jj]: return True
    return False
def outside_floor(x, z, nx, nz):
    for t in range(3, 12):
        i, j = cell(np.array([x + nx * t * CELL, z + nz * t * CELL]))
        if floor_hit[i, j]: return True
    return False

segments = []
coords = list(poly.exterior.coords)
for (x1, z1), (x2, z2) in zip(coords[:-1], coords[1:]):
    L = float(np.hypot(x2 - x1, z2 - z1))
    if L < 1e-3: continue
    tx, tz = (x2 - x1) / L, (z2 - z1) / L
    nx, nz = tz, -tx  # outward normal for a CCW ring (x right, z down in this frame)
    ns = max(1, int(round(L / CELL)))
    lab_s = []
    for s in range(ns):
        x = x1 + tx * (s + .5) * L / ns; z = z1 + tz * (s + .5) * L / ns
        lowb, mid, high = near(hasv[0], x, z, nx, nz), near(hasv[1] | hasv[2], x, z, nx, nz), near(hasv[3], x, z, nx, nz)
        if mid: c_ = "wall"
        elif not lowb and (high or outside_floor(x, z, nx, nz)): c_ = "door"
        elif lowb and high: c_ = "window"
        elif not lowb and not high: c_ = "open"
        else: c_ = "wall"
        lab_s.append(c_)
    # smooth: majority over 5 samples
    sm = [max(set(lab_s[max(0, i - 2):i + 3]), key=lab_s[max(0, i - 2):i + 3].count) for i in range(ns)]
    runs_ = []
    for i, c_ in enumerate(sm):
        if runs_ and runs_[-1][0] == c_: runs_[-1][2] = i + 1
        else: runs_.append([c_, i, i + 1])
    for r in runs_:
        ln = (r[2] - r[1]) * L / ns
        if r[0] == "door" and not (0.6 <= ln <= 1.9): r[0] = "wall" if ln < 0.6 else "open"
        if r[0] == "window" and ln < 0.4: r[0] = "wall"
        if r[0] == "open" and ln < 0.5: r[0] = "wall"
    merged = []
    for r in runs_:
        if merged and merged[-1][0] == r[0]: merged[-1][2] = r[2]
        else: merged.append(r)
    for c_, i0, i1 in merged:
        a0, a1 = i0 * L / ns, i1 * L / ns
        segments.append(dict(type=c_, x1=x1 + tx * a0, z1=z1 + tz * a0, x2=x1 + tx * a1, z2=z1 + tz * a1, nx=nx, nz=nz))

# ---- furniture ----
interior = fp & ndi.binary_erosion(fp, iterations=1)
furn = interior & ((furn_top > 0.25) | (low_stuff & ~ndi.binary_dilation(~fp, iterations=3)))
furn = ndi.binary_opening(furn, iterations=1)
_l, _n = ndi.label(furn)  # drop crumbs (cables, toys, scan noise) under 0.12 m2
_sz = ndi.sum(furn, _l, range(1, _n + 1)); furn &= np.isin(_l, 1 + np.nonzero(_sz * CELL * CELL >= 0.12)[0])
# split pieces joined by thin bridges: seed on the eroded mask, then give every cell to its nearest seed
seeds, nf = ndi.label(ndi.binary_erosion(furn, iterations=2))
if nf:
    dist, (ix, iz) = ndi.distance_transform_edt(seeds == 0, return_indices=True)
    fl = np.where(furn & (dist <= 3), seeds[ix, iz], 0)
    # Thin pieces (a wall shelf, a narrow desk) have no seed after erosion: each leftover blob keeps its own label.
    rest, nr = ndi.label(furn & (fl == 0))
    fl = np.where(rest > 0, rest + nf, fl); nf += nr
else:
    fl, nf = ndi.label(furn)
furniture = []
if os.environ.get('SCAN_DEBUG'): np.savez(os.path.join(a.out, 'debug.npz'), top=furn_top, fl=fl)
for i in range(1, nf + 1):
    xs, zs = np.nonzero(fl == i)
    if len(xs) * CELL * CELL < 0.15: continue
    hts = furn_top[xs, zs]; hts = hts[hts > 0]
    ht = float(np.percentile(hts, 85)) if len(hts) else 0.8
    seat = float(np.percentile(hts, 50)) if len(hts) else 0.5
    peak = float(np.percentile(hts, 97)) if len(hts) else ht
    w = (np.ptp(xs) + 1) * CELL; d = (np.ptp(zs) + 1) * CELL
    big, small = max(w, d), min(w, d)
    # A seat with a raised rim (back and arms) is a sofa or an armchair; a bed's top is one flat-ish mattress.
    th = furn_top[xs, zs]; th = th[th > 0]
    backed = len(th) > 8 and (th < 0.52).mean() > 0.25 and (th > 0.62).mean() > 0.2
    if backed and big > 1.3 and small < 1.3: kind = "sofa"
    elif ht < 0.8 and big > 1.7 and small > 0.8: kind = "bed"
    elif ht < 1.0 and big > 1.3 and small > 0.6: kind = "sofa"
    elif ht < 0.6 and big >= 0.8: kind = "table"
    elif 0.6 < ht < 0.95 and big > 0.7: kind = "table"
    elif ht >= 1.2 and small < 0.75: kind = "shelf"
    elif ht < 0.6 and big < 0.8: kind = "stool"
    elif ht < 1.15 and big < 0.9: kind = "chair"
    else: kind = "cabinet"
    furniture.append(dict(kind=kind, x=float(lo[0] + (xs.min() + xs.max() + 1) / 2 * CELL),
                          z=float(lo[1] + (zs.min() + zs.max() + 1) / 2 * CELL), w=round(float(w), 2), d=round(float(d), 2), h=round(ht, 2), seat=round(seat, 2), peak=round(peak, 2)))

# ---- recentre on the footprint ----
minx, minz, maxx, maxz = poly.bounds; cx, cz = (minx + maxx) / 2, (minz + maxz) / 2
r4 = lambda v: round(float(v), 3)
for s in segments:
    s.update(x1=r4(s["x1"] - cx), z1=r4(s["z1"] - cz), x2=r4(s["x2"] - cx), z2=r4(s["z2"] - cz), nx=r4(s["nx"]), nz=r4(s["nz"]))
for f in furniture: f["x"] = r4(f["x"] - cx); f["z"] = r4(f["z"] - cz)
mesh.apply_translation([-cx, 0, -cz])
outline = [[r4(x - cx), r4(z - cz)] for x, z in coords[:-1]]

shell = mesh.copy(); shell.visual = trimesh.visual.ColorVisuals(shell)
if len(shell.faces) > 80000:
    try: shell = shell.simplify_quadric_decimation(face_count=80000)
    except Exception as ex: print("decimate skipped:", ex)
shell.export(os.path.join(a.out, "room-shell.glb"))

counts = {t: sum(1 for s in segments if s["type"] == t) for t in ("wall", "door", "window", "open")}
room = dict(name=name, version=1, units="meters", up="y", origin="room centre, on the floor", source=os.path.basename(a.scan),
            size=dict(w=r4(maxx - minx), d=r4(maxz - minz), h=round(height, 2)), outline=outline, segments=segments, furniture=furniture,
            stats=dict(faces_in=int(len(mesh.faces)), floor_area_m2=round(float(poly.area), 1), yaw_deg=round(float(np.degrees(yaw)), 1),
                       furniture=len(furniture), **counts))
json.dump(room, open(os.path.join(a.out, "room.json"), "w"), indent=1)

# ---- top-down check picture ----
from PIL import Image, ImageDraw
S = 6
img = Image.new("RGB", (W * S, D * S), (22, 24, 22)); px = np.zeros((D, W, 3), np.uint8) + 22
px[floor_hit.T] = (52, 60, 54); px[wall.T] = (120, 120, 112); px[furn.T] = (176, 128, 64)
img = Image.fromarray(px).resize((W * S, D * S), Image.NEAREST); dr = ImageDraw.Draw(img)
col = dict(wall=(240, 236, 224), door=(60, 210, 120), window=(80, 170, 240), open=(230, 80, 60))
P = lambda x, z: ((x + cx - lo[0]) / CELL * S, (z + cz - lo[1]) / CELL * S)
for s in segments: dr.line([P(s["x1"], s["z1"]), P(s["x2"], s["z2"])], fill=col[s["type"]], width=5)
for f in furniture:
    x0, z0 = P(f["x"] - f["w"] / 2, f["z"] - f["d"] / 2); x1_, z1_ = P(f["x"] + f["w"] / 2, f["z"] + f["d"] / 2)
    dr.rectangle([x0, z0, x1_, z1_], outline=(250, 200, 90), width=2); dr.text((x0 + 3, z0 + 2), f["kind"], fill=(255, 255, 255))
img.save(os.path.join(a.out, "topdown.png"))
print(json.dumps(room["size"]), json.dumps(room["stats"]))
