# BLENDERFORGE — the vehicle body factory (Blender 5.x, headless).
# Authors the DRIVN fleet's GLB bodies: a SOLID silhouette shell per rig (side-profile
# polygon extruded to width), window openings BOOLEAN-CUT with glass panes set in,
# and a visible cabin interior (floor/seats/dash/wheel) so THE DRIVER IS SEEN.
#
# Run:  blender --background --python tools/blenderforge/gen_vehicles.py -- [--previews] [names...]
# Out:  game/assets/models/vehicles/<archetype>.glb  (+ tools/blenderforge/previews/*.png)
#
# AXIS LAW: nose points Blender +Y (glTF export maps it to Godot -Z = game forward);
# origin at chassis center, METERS 1:1 against ProtoCar3D.VEHICLES dims.
# Wheels are NOT modeled — Godot's VehicleWheel3D renders them.
# "body" material is the TINT TARGET (Godot recolors per rig). NO PURPLE.

import bpy
import bmesh
import math
import os
import sys
import mathutils

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT_DIR = os.path.join(REPO, "game", "assets", "models", "vehicles")
PREVIEW_DIR = os.path.join(REPO, "tools", "blenderforge", "previews")

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
DO_PREVIEWS = "--previews" in ARGS


# ---------------------------------------------------------------- materials
def _mat(name, rgba, rough=0.75, metal=0.0, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        m.surface_render_method = 'BLENDED'
    return m


def mats():
    return {
        "body":     _mat("body", (0.60, 0.56, 0.50, 1.0), rough=0.55, metal=0.15),
        "trim":     _mat("trim", (0.13, 0.12, 0.11, 1.0), rough=0.85),
        "glass":    _mat("glass", (0.58, 0.72, 0.76, 1.0), rough=0.05, metal=0.25, alpha=0.22),
        "interior": _mat("interior", (0.20, 0.17, 0.13, 1.0), rough=0.9),
        "seat":     _mat("seat", (0.33, 0.24, 0.16, 1.0), rough=0.95),
        "rust":     _mat("rust", (0.40, 0.25, 0.15, 1.0), rough=0.95),
        "steel":    _mat("steel", (0.34, 0.35, 0.37, 1.0), rough=0.35, metal=0.85),
    }


# ---------------------------------------------------------------- helpers
def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def box(name, size, loc, mat, rot=(0, 0, 0), bevel=0.015):
    # primitive_cube_add(size=1.0) is ALREADY a 1m-edge cube — scale by the full
    # size, not half (the half-scale bug shrank every interior/pane/bumper 50%).
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = ob.modifiers.new("bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
    ob.data.materials.append(mat)
    return ob


def cyl(name, r, depth, loc, mat, rot=(0, 0, 0), verts=14):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def tube(name, p_from, p_to, r, mat):
    """Cylinder strut between two points (roll cages, forks)."""
    a = mathutils.Vector(p_from)
    b = mathutils.Vector(p_to)
    mid = (a + b) * 0.5
    d = b - a
    ob = cyl(name, r, d.length, mid, mat, verts=8)
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return ob


def shell(name, w, profile, mat, bevel=0.03):
    """SOLID body: side-profile polygon (list of (y, z), counter-clockwise in the
    Y-Z plane viewed from +X) extruded across the width. The one honest car shape."""
    mesh = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    left = [bm.verts.new((-w * 0.5, y, z)) for (y, z) in profile]
    face = bm.faces.new(left)
    face.normal_update()
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    verts = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=verts, vec=(w, 0, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    if bevel > 0:
        # apply IMMEDIATELY — a pending bevel corrupts later boolean cuts
        mod = ob.modifiers.new("bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def cut(target, name, size, loc, rot=(0, 0, 0)):
    """Boolean-DIFFERENCE a box out of target (window openings, wheel wells)."""
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    cutter = bpy.context.active_object
    cutter.name = name + "_cutter"
    cutter.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(scale=True, rotation=False, location=False)
    mod = target.modifiers.new(name, 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'   # 5.x default solver can silently no-op on these cuts
    mod.object = cutter
    bpy.ops.object.select_all(action='DESELECT')
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def wheel_wells(body, wheels, well_r_pad=0.10, w=2.0):
    """Open arches where Godot's wheels live. wheels: [[x, z_game, .., radius]...] —
    game +z is Blender -y."""
    done = set()
    for row in wheels:
        y = -row[1]
        r = row[5] + well_r_pad
        key = round(y, 2)
        if key in done:
            continue
        done.add(key)
        cyl_cutter = cyl("well_cut", r, w * 2.0, (0, y, r * 0.55), mats()["trim"], rot=(0, math.radians(90), 0), verts=16)
        mod = body.modifiers.new("well", 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = cyl_cutter
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cyl_cutter, do_unlink=True)


def glass_pane(name, size, loc, mat, rot=(0, 0, 0)):
    return box(name, size, loc, mat, rot=rot, bevel=0.0)


def greenhouse(M, w, belt, roof_h, y_ws_base, y_ws_top, y_rr_top, y_rr_base,
               pillar=0.09, glass_inset=0.05):
    """EXPLICIT cab construction — no booleans (5.x boolean nicks ngon prism sides
    instead of cutting holes): roof slab + A/C pillars + raked windshield glass +
    side glass + rear glass. Everything between belt and roof is SEE-THROUGH.
      belt: beltline z · roof_h: roof z · y_ws_base/top: windshield bottom/top y
      y_rr_top/base: rear glass top/bottom y."""
    t = 0.06
    roof_z = roof_h
    # roof slab spans the flat top
    box("roof", (w, y_ws_top - y_rr_top + 0.1, t), (0, (y_ws_top + y_rr_top) * 0.5, roof_z + t * 0.5), M["body"], bevel=0.02)
    px = w * 0.5 - pillar * 0.6
    # A pillars follow the windshield rake; C pillars follow the rear rake.
    # Slight z inset keeps pillar caps from poking through belt/roof planes.
    for s in (-1, 1):
        tube("a_pillar_%d" % s, (s * px, y_ws_base, belt - 0.03), (s * px, y_ws_top, roof_z - 0.02), pillar * 0.55, M["body"])
        tube("c_pillar_%d" % s, (s * px, y_rr_base, belt - 0.03), (s * px, y_rr_top, roof_z - 0.02), pillar * 0.55, M["body"])
    # windshield glass — raked plane fit between the A pillars.
    # SIGN LAW: rotating +X tips the pane TOP toward +Y (the nose) — a windshield
    # whose top sits rearward of its base needs the NEGATIVE angle.
    ws_len = math.hypot(y_ws_top - y_ws_base, roof_z - belt)
    ws_ang = math.atan2(y_ws_top - y_ws_base, roof_z - belt)
    glass_pane("ws_glass", (w - pillar * 2.2, 0.04, ws_len - glass_inset),
               (0, (y_ws_base + y_ws_top) * 0.5, (belt + roof_z) * 0.5), M["glass"], rot=(ws_ang, 0, 0))
    # rear glass — top leans toward the nose
    rr_len = math.hypot(y_rr_top - y_rr_base, roof_z - belt)
    rr_ang = math.atan2(y_rr_top - y_rr_base, roof_z - belt)
    glass_pane("rear_glass", (w - pillar * 2.2, 0.04, rr_len - glass_inset),
               (0, (y_rr_base + y_rr_top) * 0.5, (belt + roof_z) * 0.5), M["glass"], rot=(rr_ang, 0, 0))
    # side glass — one pane per flank between the pillars
    side_len = (y_ws_base - y_rr_base) - pillar * 2.0
    for s in (-1, 1):
        glass_pane("side_glass_%d" % s, (0.04, side_len, roof_z - belt - glass_inset),
                   (s * px, (y_ws_base + y_rr_base) * 0.5, (belt + roof_z) * 0.5), M["glass"])


def interior(M, w, cab_y, floor_z, seats=2, wheel=True, bench_depth=0.55):
    """A floor, seat(s), dash and steering wheel — what the windows exist to show."""
    box("cab_floor", (w, 1.7, 0.06), (0, cab_y - 0.1, floor_z), M["interior"], bevel=0)
    xs = [-w * 0.25, w * 0.25] if seats >= 2 else [0.0]
    for i, x in enumerate(xs[:seats]):
        box("seat_base_%d" % i, (0.5, bench_depth, 0.18), (x, cab_y - 0.25, floor_z + 0.14), M["seat"])
        box("seat_back_%d" % i, (0.5, 0.13, 0.6), (x, cab_y - 0.5, floor_z + 0.5), M["seat"])
    if wheel:
        dx = -w * 0.25 if seats >= 2 else 0.0
        # cowl UNDER the dash so it never floats in open-cab rigs
        box("cowl", (w - 0.1, 0.26, 0.6 - 0.11), (0, cab_y + 0.5, floor_z + (0.6 - 0.11) * 0.5), M["interior"], bevel=0)
        box("dash", (w - 0.1, 0.24, 0.22), (0, cab_y + 0.5, floor_z + 0.6), M["trim"])
        # NAME LAW: Godot's glTF importer hijacks name suffixes — "*wheel" becomes a
        # VehicleWheel3D and "*col" GROWS A STATIC COLLIDER INSIDE THE CAR (the great
        # self-colliding-steering-column drift of 2026-07-14). helm/helm_shaft only.
        cyl("helm", 0.18, 0.05, (dx, cab_y + 0.33, floor_z + 0.58), M["trim"], rot=(math.radians(65), 0, 0), verts=16)
        cyl("helm_shaft", 0.028, 0.28, (dx, cab_y + 0.42, floor_z + 0.5), M["trim"], rot=(math.radians(65), 0, 0), verts=8)


# ------------------------------------------------------------ archetypes
def build_scavenger(M):
    """Two-box wasteland wagon. chassis 2.0 x 0.7 x 4.4."""
    w, hl = 1.95, 2.2
    sill, belt, roofz = 0.28, 0.95, 1.5
    # body stops at the BELTLINE — the greenhouse above is explicit pillars+glass
    profile = [
        (hl, sill), (hl, 0.62),                  # front bumper face
        (hl - 0.18, 0.74), (0.95, 0.84),         # hood
        (0.7, belt), (-1.7, belt),               # belt deck (cabin sits on this)
        (-hl, 0.82), (-hl, sill),                # tail
    ]
    body = shell("body", w, profile, M["body"])
    wheel_wells(body, [[-0.85, -1.45, 0, 0, 0, 0.38], [-0.85, 1.45, 0, 0, 0, 0.38]], w=w)
    greenhouse(M, w - 0.15, belt, roofz, y_ws_base=0.65, y_ws_top=0.2, y_rr_top=-1.15, y_rr_base=-1.6)
    interior(M, 1.5, -0.35, 0.55, seats=2)
    box("bumper_f", (w - 0.1, 0.14, 0.15), (0, hl + 0.05, 0.5), M["rust"])
    box("bumper_r", (w - 0.1, 0.14, 0.15), (0, -hl - 0.05, 0.5), M["rust"])
    box("roof_rack", (w - 0.7, 1.0, 0.07), (0, -0.5, roofz + 0.1), M["rust"])
    cyl("tailpipe", 0.045, 0.28, (-0.65, -hl - 0.02, 0.24), M["steel"], rot=(math.radians(90), 0, 0))
    return 1.5


def build_pickup(M):
    """Cab-forward truck with a real OPEN BED. chassis 2.1 x 1.0 x 4.8."""
    w, hl = 2.05, 2.4
    sill, belt, roofz = 0.35, 1.12, 1.78
    profile = [
        (hl, sill), (hl, 0.85),
        (hl - 0.2, 1.05), (0.75, belt),          # hood up to the cowl/belt
        (-hl, belt),                             # belt deck runs to the tail
        (-hl, sill),
    ]
    body = shell("body", w, profile, M["body"])
    wheel_wells(body, [[-0.88, -1.6, 0, 0, 0, 0.44], [-0.88, 1.6, 0, 0, 0, 0.44]], w=w)
    # cab greenhouse over the front half only
    greenhouse(M, w - 0.15, belt, roofz, y_ws_base=0.6, y_ws_top=0.25, y_rr_top=-0.5, y_rr_base=-0.62)
    interior(M, 1.6, 0.1, 0.72, seats=2)
    # OPEN BED walls behind the cab (body deck is the floor)
    box("bed_wall_l", (0.07, hl - 0.75, 0.34), (-(w * 0.5 - 0.06), -(hl + 0.72) * 0.5 + 0.35, belt + 0.17), M["body"])
    box("bed_wall_r", (0.07, hl - 0.75, 0.34), (w * 0.5 - 0.06, -(hl + 0.72) * 0.5 + 0.35, belt + 0.17), M["body"])
    box("tailgate", (w - 0.1, 0.07, 0.34), (0, -hl + 0.05, belt + 0.17), M["body"])
    box("bed_front", (w - 0.1, 0.07, 0.34), (0, -0.72, belt + 0.17), M["body"])
    box("bumper_f", (w - 0.05, 0.16, 0.18), (0, hl + 0.06, 0.55), M["steel"])
    box("bumper_r", (w - 0.05, 0.16, 0.18), (0, -hl - 0.06, 0.55), M["steel"])
    cyl("tailpipe", 0.05, 0.3, (-0.7, -hl - 0.02, 0.28), M["steel"], rot=(math.radians(90), 0, 0))
    return 1.6


def build_van(M, camper=False):
    """One-box hauler: solid CARGO box behind an open glazed COCKPIT front.
    chassis 2.2 x 1.5 x 5.2."""
    w, hl = 2.15, 2.6
    sill, belt, roofz = 0.4, 1.15, 2.05
    cab_len = 1.55                                # glazed front section
    box_y = hl - cab_len                          # cargo box starts here
    # cargo box: solid, full height, butted hard against the cockpit
    box("cargo", (w, hl + box_y + 0.15, roofz - sill), (0, (box_y - hl) * 0.5 + 0.075, (roofz + sill) * 0.5), M["body"], bevel=0.03)
    # cockpit floorpan + hoodlet up front (below the belt)
    profile = [
        (hl, sill), (hl, 0.9), (hl - 0.25, belt), (box_y, belt), (box_y, sill),
    ]
    body = shell("body", w, profile, M["body"])
    wheel_wells(body, [[-0.9, 1.9, 0, 0, 0, 0.4]], w=w)
    # rear wells cut the cargo box
    wheel_wells(bpy.data.objects["cargo"], [[-0.9, -1.9, 0, 0, 0, 0.4]], w=w)
    # glazed cockpit: pillars + windshield + door glass, roof bridges to the box
    greenhouse(M, w - 0.15, belt, roofz - 0.06, y_ws_base=hl - 0.15, y_ws_top=hl - 0.55,
               y_rr_top=box_y + 0.1, y_rr_base=box_y + 0.1)
    interior(M, 1.7, hl - 1.35, 0.62, seats=2)
    box("bumper_f", (w - 0.05, 0.15, 0.2), (0, hl + 0.05, 0.6), M["rust"])
    box("bumper_r", (w - 0.05, 0.15, 0.2), (0, -hl - 0.05, 0.6), M["rust"])
    if camper:
        box("camper_top", (w - 0.5, 2.2, 0.42), (0, -0.9, roofz + 0.2), M["rust"])
        glass_pane("camper_win_l", (0.04, 0.7, 0.35), (-(w * 0.5 - 0.02), -1.1, 1.35), M["glass"])
        glass_pane("camper_win_r", (0.04, 0.7, 0.35), (w * 0.5 - 0.02, -1.1, 1.35), M["glass"])
        cyl("stove_pipe", 0.06, 0.5, (0.6, -1.6, roofz + 0.5), M["steel"])
    return 1.7


def build_humvee(M):
    """Wide, flat, slit-windowed military brick. chassis 2.3 x 1.1 x 4.9."""
    w, hl = 2.25, 2.45
    sill, belt, roofz = 0.45, 1.28, 1.85
    profile = [
        (hl, sill), (hl, 0.95),
        (hl - 0.25, 1.15), (0.95, belt),         # hood to the high military belt
        (-1.3, belt), (-hl, 1.2),                # belt deck → rear cargo lip
        (-hl, sill),
    ]
    body = shell("body", w, profile, M["body"])
    # low slit greenhouse (military: more armor, less glass)
    greenhouse(M, w - 0.2, belt, roofz, y_ws_base=0.85, y_ws_top=0.55, y_rr_top=-1.0, y_rr_base=-1.25, pillar=0.14)
    wheel_wells(body, [[-0.95, -1.6, 0, 0, 0, 0.46], [-0.95, 1.6, 0, 0, 0, 0.46]], w=w, well_r_pad=0.14)
    interior(M, 1.8, 0.1, 0.78, seats=2)
    box("bumper_f", (w, 0.2, 0.28), (0, hl + 0.08, 0.62), M["steel"])
    box("deck_floor", (w - 0.6, 0.95, 0.06), (0, -1.85, 1.05), M["interior"])
    box("spare", (0.2, 0.55, 0.55), (w * 0.5 - 0.05, -2.2, 1.0), M["trim"])
    return 1.8


def build_semi(M):
    """Long-nose rig tractor. chassis 2.4 x 1.9 x 6.4."""
    w, hl = 2.35, 3.2
    sill, hood, roofz = 0.5, 1.55, 2.75
    cab_front = 0.9
    belt = 1.9                                        # tall rig beltline
    profile = [
        (hl, sill), (hl, 1.1),
        (hl - 0.25, hood), (cab_front + 0.1, hood),   # long hood
        (cab_front, belt), (-1.2, belt),              # cab belt deck
        (-1.2, 1.35), (-hl, 1.35),                    # bare frame to the hitch
        (-hl, sill),
    ]
    body = shell("body", w, profile, M["body"])
    wheel_wells(body, [[-0.95, -2.4, 0, 0, 0, 0.45], [-0.95, 1.6, 0, 0, 0, 0.45], [-0.95, 2.55, 0, 0, 0, 0.45]], w=w)
    greenhouse(M, w - 0.15, belt, roofz, y_ws_base=cab_front - 0.05, y_ws_top=cab_front - 0.35,
               y_rr_top=-1.05, y_rr_base=-1.15, pillar=0.11)
    interior(M, 1.9, 0.05, 1.35, seats=2)
    cyl("stack_l", 0.09, 1.5, (-w * 0.5 + 0.15, -1.05, 2.3), M["steel"])
    cyl("stack_r", 0.09, 1.5, (w * 0.5 - 0.15, -1.05, 2.3), M["steel"])
    box("fuel_l", (0.3, 1.1, 0.5), (-w * 0.5 + 0.1, -0.2, 0.75), M["steel"])
    box("fuel_r", (0.3, 1.1, 0.5), (w * 0.5 - 0.1, -0.2, 0.75), M["steel"])
    box("fifth_plate", (1.1, 1.1, 0.16), (0, -2.35, 1.5), M["trim"])  # NAME LAW: never "*wheel"
    box("bumper_f", (w, 0.2, 0.3), (0, hl + 0.08, 0.7), M["steel"])
    return 1.9


def build_trailer(M):
    """Box trailer. chassis 2.4 x 2.2 x 8.0."""
    w, hl = 2.35, 4.0
    body = box("boxbody", (w, hl * 2 - 0.2, 2.1), (0, 0, 1.45), M["body"], bevel=0.04)
    box("underframe", (w - 0.6, hl * 2 - 1.2, 0.28), (0, 0, 0.36), M["steel"])
    box("doors", (w - 0.08, 0.08, 1.9), (0, -hl + 0.06, 1.45), M["rust"])
    box("door_bar", (0.06, 0.06, 1.7), (0.4, -hl + 0.01, 1.4), M["steel"])
    cyl("kingpin", 0.08, 0.4, (0, hl - 0.7, 0.28), M["steel"])
    box("legs", (0.12, 0.12, 0.6), (0.7, hl - 1.6, 0.35), M["steel"])
    return 0.0


def build_buggy(M):
    """Open-frame dune rig — no glass anywhere, driver fully visible. 1.7 x 0.6 x 3.0."""
    w, hl = 1.6, 1.5
    profile = [
        (hl, 0.3), (hl, 0.5),
        (hl - 0.5, 0.62), (-0.4, 0.62),
        (-hl + 0.3, 0.95), (-hl, 0.95),          # rear engine hump
        (-hl, 0.3),
    ]
    body = shell("pan", w, profile, M["body"])
    wheel_wells(body, [[-0.8, -1.1, 0, 0, 0, 0.42], [-0.8, 1.1, 0, 0, 0, 0.42]], w=w, well_r_pad=0.16)
    px, pz = w * 0.5 - 0.1, 1.5
    for s in (-1, 1):
        tube("cage_a_%d" % s, (s * px, 0.75, 0.6), (s * (px - 0.2), 0.3, pz), 0.045, M["steel"])
        tube("cage_c_%d" % s, (s * px, -0.95, 0.6), (s * (px - 0.2), -0.55, pz), 0.045, M["steel"])
        tube("cage_top_%d" % s, (s * (px - 0.2), 0.3, pz), (s * (px - 0.2), -0.55, pz), 0.04, M["steel"])
    tube("cage_cross_f", (-(px - 0.2), 0.3, pz), (px - 0.2, 0.3, pz), 0.04, M["steel"])
    tube("cage_cross_r", (-(px - 0.2), -0.55, pz), (px - 0.2, -0.55, pz), 0.04, M["steel"])
    interior(M, 1.3, 0.05, 0.62, seats=2, bench_depth=0.5)
    box("engine_rear", (0.95, 0.55, 0.45), (0, -hl + 0.35, 1.0), M["steel"])
    box("nose_rack", (w - 0.5, 0.35, 0.08), (0, hl - 0.25, 0.68), M["rust"])
    return 1.3


def build_motorcycle(M):
    """The Rat Bike — ONE connected frame silhouette (narrow profile shell) with
    tank/saddle/fork riding it. Rider always visible.
    chassis 0.55 x 0.6 x 2.2, wheels r=0.34 at y=±0.8 (game z ∓0.8)."""
    # frame: side profile from headtube, down under the engine, up over the rear axle
    frame_profile = [
        (0.62, 0.95),                # headtube top
        (0.72, 0.72),                # headtube bottom / downtube start
        (0.30, 0.30), (-0.30, 0.30), # under-engine cradle
        (-0.78, 0.55), (-0.95, 0.62),# swingarm up over the rear axle
        (-0.85, 0.72), (-0.35, 0.62),# seat rail back → under saddle
        (0.30, 0.68),                # backbone to the tank
    ]
    shell("frame", 0.13, frame_profile, M["steel"], bevel=0.015)
    box("engine", (0.34, 0.5, 0.32), (0, 0.0, 0.48), M["steel"], bevel=0.02)
    box("tank", (0.28, 0.5, 0.22), (0, 0.32, 0.78), M["body"], bevel=0.05)
    box("saddle", (0.3, 0.55, 0.09), (0, -0.28, 0.72), M["seat"], bevel=0.03)
    box("rear_fender", (0.28, 0.5, 0.05), (0, -0.78, 0.74), M["body"], bevel=0.02)
    # raked fork: headtube (y .62, z .95) down PAST the front axle (y .8, z .34)
    for s in (-1, 1):
        tube("fork_%d" % s, (s * 0.07, 0.58, 1.0), (s * 0.07, 0.86, 0.26), 0.03, M["steel"])
    box("front_fender", (0.24, 0.42, 0.05), (0, 0.8, 0.74), M["body"], bevel=0.02)
    tube("bars", (-0.3, 0.54, 1.04), (0.3, 0.54, 1.04), 0.026, M["trim"])
    box("headlamp", (0.13, 0.09, 0.13), (0, 0.66, 0.94), M["trim"], bevel=0.03)
    tube("exhaust", (0.14, 0.2, 0.35), (0.16, -0.8, 0.5), 0.038, M["steel"])
    return 0.0


BUILDERS = {
    "scavenger": build_scavenger,
    "motorcycle": build_motorcycle,
    "buggy": build_buggy,
    "pickup": build_pickup,
    "van": lambda M: build_van(M, camper=False),
    "camper": lambda M: build_van(M, camper=True),
    "humvee": build_humvee,
    "semi": build_semi,
    "trailer": build_trailer,
}

# preview camera distance per rig (bigger rigs, farther eye)
CAM_DIST = {"motorcycle": 3.2, "buggy": 4.5, "scavenger": 6.0, "pickup": 6.5,
            "van": 7.5, "camper": 7.5, "humvee": 6.8, "semi": 9.0, "trailer": 10.5}

# PREVIEW-ONLY mock wheels [x, y(=-game_z), radius] so stance is judgeable —
# never exported (Godot's VehicleWheel3D renders the real ones).
MOCK_WHEELS = {
    "scavenger": [[0.85, 1.45, 0.38], [0.85, -1.45, 0.38]],
    "motorcycle": [[0.0, 0.8, 0.34], [0.0, -0.8, 0.34]],
    "buggy": [[0.8, 1.1, 0.42], [0.8, -1.1, 0.42]],
    "pickup": [[0.88, 1.6, 0.44], [0.88, -1.6, 0.44]],
    "van": [[0.9, 1.9, 0.4], [0.9, -1.9, 0.4]],
    "camper": [[0.9, 1.9, 0.4], [0.9, -1.9, 0.4]],
    "humvee": [[0.95, 1.6, 0.46], [0.95, -1.6, 0.46]],
    "semi": [[0.95, 2.4, 0.45], [0.95, -1.6, 0.45], [0.95, -2.55, 0.45]],
    "trailer": [[0.95, -2.2, 0.45], [0.95, -3.1, 0.45]],
}


def export_one(archetype):
    wipe()
    M = mats()
    BUILDERS[archetype](M)
    for ob in bpy.context.scene.objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, archetype + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True)
    print("EXPORTED %s (%d parts)" % (path, len(bpy.context.scene.objects)))
    if DO_PREVIEWS:
        _preview(archetype)


def _preview(archetype):
    scn = bpy.context.scene
    M = mats()
    for wx, wy, wr in MOCK_WHEELS.get(archetype, []):
        for s in ((1, -1) if wx > 0 else (1,)):
            cyl("mock_wheel", wr, 0.26, (s * wx, wy, wr), M["trim"], rot=(0, math.radians(90), 0), verts=16)
    scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x = 900
    scn.render.resolution_y = 640
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.02))
    ground = bpy.context.active_object
    ground.data.materials.append(_mat("ground", (0.35, 0.30, 0.24, 1.0), rough=1.0))
    bpy.ops.object.light_add(type='SUN', location=(4, -4, 8))
    sun = bpy.context.active_object
    sun.data.energy = 3.5
    # rake the sun toward the camera quadrant so flanks are LIT (window cuts must read)
    sun.rotation_euler = (math.radians(55), math.radians(20), math.radians(40))
    bpy.ops.object.light_add(type='AREA', location=(-5, 3, 5))
    bpy.context.active_object.data.energy = 500.0
    d = CAM_DIST.get(archetype, 7.0)
    bpy.ops.object.camera_add(location=(d * 0.75, d * 0.85, d * 0.55))
    cam = bpy.context.active_object
    look = mathutils.Vector((0, 0, 0.7))
    direction = look - cam.location
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = direction.to_track_quat('-Z', 'Y')
    scn.camera = cam
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    scn.render.filepath = os.path.join(PREVIEW_DIR, archetype + ".png")
    bpy.ops.render.render(write_still=True)
    print("PREVIEW %s" % scn.render.filepath)


if __name__ == "__main__":
    only = [a for a in ARGS if not a.startswith("--")]
    targets = only if only else list(BUILDERS.keys())
    for arch in targets:
        export_one(arch)
    print("BLENDERFORGE DONE: %s" % ", ".join(targets))
