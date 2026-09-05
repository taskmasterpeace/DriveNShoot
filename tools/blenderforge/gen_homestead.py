"""Original DRIVN homestead kit. Execute with mcp_client.py --code this_file.

Blender Z-up, front -Y; GLB converts to Godot Y-up, front +Z. Metres.
All materials/geometry are authored here. No downloaded or paid assets.
"""
import bpy
import json
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "game/assets/models/homestead"
PREVIEWS = ROOT / "tools/blenderforge/previews/homestead"
SOURCES = ROOT / "tools/blenderforge/sources"
for directory in (OUT, PREVIEWS, SOURCES):
    directory.mkdir(parents=True, exist_ok=True)
RNG = random.Random(90417)
M = {}
OWNED = []


def material(name, color, roughness=.75, metal=0, emission=0):
    key = "DRIVN_" + name
    mat = bpy.data.materials.get(key) or bpy.data.materials.new(key)
    mat.diffuse_color = (*color, 1)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    M[name] = mat
    return mat


def materials():
    palette = {
        "chalk": ((.68, .65, .52), .85, 0),
        "paint": ((.31, .43, .38), .85, 0),
        "paint_light": ((.41, .51, .43), .85, 0),
        "paint_dark": ((.22, .32, .29), .9, 0),
        "cedar": ((.32, .19, .095), .88, 0),
        "cedar_light": ((.44, .29, .15), .82, 0),
        "cedar_dark": ((.18, .105, .06), .95, 0),
        "rust": ((.38, .115, .042), .93, .1),
        "rust_light": ((.53, .21, .065), .86, .12),
        "roof": ((.18, .235, .225), .58, .6),
        "roof_light": ((.24, .30, .28), .63, .48),
        "steel": ((.075, .092, .085), .45, .75),
        "zinc": ((.42, .45, .40), .35, .78),
        "glass": ((.09, .20, .19), .16, .48),
        "concrete": ((.31, .31, .26), .96, 0),
        "brick": ((.33, .17, .095), .95, 0),
        "fabric": ((.53, .40, .20), .98, 0),
        "ink": ((.027, .038, .033), .9, 0),
        "paper": ((.76, .68, .46), .97, 0),
        "amber": ((.91, .43, .085), .6, .15),
        "red": ((.48, .065, .03), .76, .05),
    }
    for name, (color, rough, metal) in palette.items():
        material(name, color, rough, metal)
    material("lamp", (1, .49, .15), .35, .05, 2)


def own(obj, name, mat=None):
    obj.name = name
    if mat:
        obj.data.materials.append(M[mat])
    OWNED.append(obj)
    return obj


def box(name, dimensions, location, mat, bevel=.012, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    ob = own(bpy.context.object, name, mat)
    ob.scale = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = ob.modifiers.new("Manufactured_edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2 if bevel >= .04 else 1
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def cylinder(name, radius, depth, location, mat, vertices=12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                      location=location, rotation=rotation)
    return own(bpy.context.object, name, mat)


def beam(name, start, end, width, mat, depth=None):
    delta = Vector(end) - Vector(start)
    ob = box(name, (width, depth or width, delta.length), (Vector(start) + Vector(end)) / 2, mat)
    ob.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return ob


def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    return own(ob, name, mat)


def lettering(text, location, size, mat="chalk", name="Lettering", rotation=(math.pi / 2, 0, 0)):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.size = size
    curve.resolution_u = 2
    curve.extrude = .0006
    curve.bevel_depth = 0
    curve.bevel_resolution = 0
    ob = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(ob)
    ob.location = location
    ob.rotation_euler = rotation
    own(ob, name, mat)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob.select_set(False)
    return ob


def asset_scene(name):
    global OWNED
    OWNED = []
    scene = bpy.data.scenes.new("DRIVN_" + name)
    scene["drivn_original_asset"] = name
    bpy.context.window.scene = scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    return scene


def join_category(name, objects):
    if not objects:
        return
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    # Bake transforms: exporter produces straightforward metre-space bounds.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    joined["drivn_part"] = "roof" if name.startswith("Roof") else "body"
    return joined


def finish(name):
    scene = bpy.context.scene
    roof = [ob for ob in OWNED if ob.name.startswith("Roof")]
    body = [ob for ob in OWNED if ob not in roof]
    parts = [ob for ob in (join_category("Body_" + name, body), join_category("Roof_" + name, roof)) if ob]
    bpy.ops.object.select_all(action="DESELECT")
    for ob in parts:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + ".glb")), export_format="GLB", use_active_scene=True,
                             use_selection=True, export_apply=True, export_extras=True,
                             export_cameras=False, export_lights=False, export_yup=True)
    triangles = 0
    for ob in parts:
        ob.data.calc_loop_triangles()
        triangles += len(ob.data.loop_triangles)
    print(json.dumps({"asset": name, "triangles": triangles, "parts": len(parts), "path": str(OUT / (name + '.glb'))}))
    return scene, parts


def shutter(cx, y, z, width=.48, height=1.55):
    for sign in (-1, 1):
        x = cx + sign * .99
        box("Shutter_frame", (width, .07, height), (x, y, z), "cedar_dark")
        for n in range(8):
            box("Shutter_slat", (width-.07, .085, .13), (x, y-.045, z-height/2+.13+n*.177), "paint_dark", .006)
        for zz in (z-.51, z+.51):
            box("Shutter_hinge", (.15, .02, .06), (x+sign*.1, y-.1, zz), "steel", .004)


def window(cx, cy, cz, side=False):
    # Front-facing window kit. Side kits are rotated in place around their anchor.
    before = len(OWNED)
    box("Window_glass", (1.4, .025, 1.25), (cx, cy, cz), "glass", .002)
    for x in (cx-.76, cx+.76):
        box("Window_casing", (.12, .16, 1.5), (x, cy-.015, cz), "chalk")
    for z in (cz-.72, cz+.72):
        box("Window_casing", (1.64, .18, .12), (cx, cy-.015, z), "chalk")
    box("Window_mullion", (.055, .07, 1.32), (cx, cy-.055, cz), "chalk", .004)
    box("Window_crossbar", (1.4, .07, .055), (cx, cy-.055, cz+.08), "chalk", .004)
    box("Window_sill", (1.85, .37, .11), (cx, cy-.09, cz-.79), "cedar_light")
    shutter(cx, cy-.03, cz)
    if side:
        from mathutils import Matrix
        spin = Matrix.Rotation(math.pi/2, 4, 'Z')
        anchor = Vector((cx, cy, cz))
        for ob in OWNED[before:]:
            ob.location = anchor + spin.to_3x3() @ (ob.location - anchor)
            ob.rotation_euler.z += math.pi/2


def porch_chair(x, y):
    for xx in (-.29, .29):
        for yy in (-.28, .28):
            beam("Chair_leg", (x+xx, y+yy, .39), (x+xx*.84, y+yy*.9, .89), .065, "cedar")
    for n in range(5):
        box("Chair_seat", (.61, .105, .055), (x, y-.23+n*.115, .91), "cedar_light", .009)
        box("Chair_back", (.11, .07, .58), (x-.23+n*.115, y+.28, 1.25), "paint", .009, (math.radians(-10), 0, 0))
    for xx in (-.32, .32):
        box("Chair_arm", (.08, .7, .065), (x+xx, y, 1.17), "cedar_light")


def cottage():
    asset_scene("roadstead_cottage")
    box("Foundation", (10.2, 8.2, .32), (0, 0, .12), "concrete", .035)
    # Floor boards provide readable interior detail when the roof is hidden.
    for x in range(34):
        box("Floor_plank", (.29, 7.77, .07), (-4.79+x*.29, 0, .32),
            ("cedar", "cedar_light", "cedar_dark")[x % 3], .005)
    # Front siding is interrupted by a real doorway and two window openings.
    for row in range(17):
        z = .45 + row*.175
        spans = [(-5, 5)]
        holes = []
        if z < 2.55:
            holes.append((-.70, .70))
        if 1.02 < z < 2.63:
            holes += [(-3.76, -2.24), (2.24, 3.76)]
        for left, right in holes:
            updated = []
            for a, b in spans:
                if right <= a or left >= b:
                    updated.append((a, b))
                else:
                    if a < left: updated.append((a, left))
                    if right < b: updated.append((right, b))
            spans = updated
        for a, b in spans:
            box("Front_clapboard", (b-a, .20, .18), ((a+b)/2, -3.95, z),
                ("paint", "paint_light", "paint_dark")[row % 3], .005)
        box("Back_clapboard", (10, .20, .18), (0, 3.95, z), "paint", .005)
        for x in (-4.95, 4.95):
            box("Side_clapboard", (.20, 8, .18), (x, 0, z), "paint_light" if row%3 == 0 else "paint", .005)
    # Patches of exposed timber interrupt the maintained paint, especially near
    # the ground and corners. Thin geometry survives portable glTF materials.
    for n in range(32):
        x = RNG.choice((-1,1)) * RNG.uniform(1.35,4.7)
        z = RNG.choice((.45,.625,.80,2.90,3.08))
        box("Weathered_paint_chip",(RNG.uniform(.08,.31),.014,RNG.uniform(.018,.055)),
            (x,-4.057,z),"cedar_light",.003)
    for n in range(22):
        y = RNG.uniform(-3.5,3.5)
        z = RNG.choice((.45,.625,.80,3.08))
        box("Side_paint_chip",(.014,RNG.uniform(.12,.42),.035),(5.057,y,z),"cedar",.003)
    for x in (-4.98, 4.98):
        for y in (-4, 4):
            box("Corner_trim", (.18, .24, 3.08), (x, y, 1.82), "chalk")
    for x in (-.77, .77):
        box("Door_casing", (.14, .3, 2.34), (x, -4.02, 1.52), "chalk")
    box("Door_header", (1.68, .3, .17), (0, -4.02, 2.76), "chalk")
    # Open door is parked against inside wall; never spans the entry gap.
    box("Door_open", (.09, 1.3, 2.15), (.81, -3.25, 1.45), "paint_dark")
    for z in (.93, 1.80):
        box("Door_inset", (.025, 1.05, .60), (.755, -3.25, z), "cedar")
    cylinder("Door_knob", .044, .09, (.73, -2.73, 1.45), "zinc", rotation=(0, math.pi/2, 0))
    window(-3, -4.08, 1.88)
    window(3, -4.08, 1.88)
    # Side glazing sits over dark recess patches; front glazing is through-open.
    window(5.08, 1.0, 1.88, side=True)
    # Gable and the entire roof are a separate runtime cutaway mesh.
    for y in (-4.06, 4.06):
        mesh("Roof_gable", [(-5,y,3.34),(5,y,3.34),(0,y,5.20)], [(0,1,2)], "cedar")
        for sign in (-1,1):
            beam("Roof_bargeboard", (0,y-.04,5.28), (sign*5.4,y-.04,3.28), .16, "chalk")
    rise, run = 2.0, 5.45
    slope = math.atan2(rise, run)
    roof_length = math.hypot(rise, run)
    for sign in (-1, 1):
        box("Roof_metal", (roof_length, 8.85, .10), (sign*run/2, 0, 4.28), "roof", .009, (0, sign*slope, 0))
        # Standing seams run from ridge to eave, clear at top-down distance.
        for n in range(18):
            y = -4.30 + n*.50
            beam("Roof_standing_seam", (0,y,5.34), (sign*5.45,y,3.34), .033,
                 "rust" if n%5 == 0 else "roof_light", .028)
        for n in range(6):
            xx = sign * (1.0+n*.62)
            yy = RNG.uniform(-3.4, 3.4)
            zz = 5.30 - abs(xx)*rise/run
            box("Roof_weather_patch", (.34+RNG.random()*.3, .44, .014), (xx,yy,zz), "rust", .005, (0, sign*slope,0))
    cylinder("Roof_ridge", .12, 8.9, (0,0,5.30), "zinc", 10, (math.pi/2,0,0))
    for x in (-5.45, 5.45):
        box("Roof_gutter", (.14,8.95,.13), (x,0,3.28), "zinc")
        cylinder("Downpipe", .055, 2.85, (x,3.6,1.73), "zinc", 8)
    box("Roof_chimney", (.73,.85,1.75), (-2.5,2.3,4.62), "brick", .03)
    for z in range(7):
        box("Roof_chimney_course", (.78,.9,.045), (-2.5,2.3,3.86+z*.245), "concrete", .005)
    box("Roof_chimney_cap", (.92,1.0,.15), (-2.5,2.3,5.55), "concrete")
    cylinder("Roof_stove_flue", .15,.42,(-2.5,2.3,5.83),"steel")
    # Porch and steps: grounded construction with a clear 1.3m walking route.
    for n in range(35):
        box("Porch_plank", (.28,2.0,.10),(-4.76+n*.28,-5.02,.35), "cedar_light" if n%3 else "cedar", .008)
    for x in (-4.72,4.72):
        for y in (-4.9,-5.85):
            box("Porch_post",(.13,.13,2.65),(x,y,1.67),"chalk")
        box("Porch_rail",(.1,1.85,.1),(x,-5.04,1.23),"chalk")
        for n in range(8):
            box("Porch_spindle",(.045,.045,.78),(x,-5.8+n*.215,.81),"paint_light",.003)
        beam("Porch_brace",(x,-5.85,2.4),(x-math.copysign(.5,x),-5.85,2.9),.09,"cedar_light")
    # Canopy is roof-tagged too, so the porch remains visible in cutaway.
    box("Roof_porch_canopy",(10.5,2.35,.13),(0,-5.04,3.10),"roof",.012,(math.radians(6),0,0))
    for n in range(15):
        beam("Roof_canopy_seam",(-5.1+n*.73,-3.89,3.29),(-5.1+n*.73,-6.19,3.04),.027,"roof_light")
    for n in range(3):
        box("Entry_step",(1.7,.34,.11),(0,-6.1-n*.26,.28-n*.10),"concrete",.025)
    porch_chair(-3.4,-5.14)
    porch_chair(-2.35,-5.14)
    cylinder("Porch_table",.29,.075,(-2.86,-5.5,1.02),"cedar_light",16)
    cylinder("Porch_table_leg",.06,.61,(-2.86,-5.5,.68),"steel")
    cylinder("Coffee_mug",.062,.10,(-2.84,-5.50,1.10),"chalk")
    for x in (2.0,3.65):
        box("Planter",(.62,.62,.42),(x,-5.55,.61),"cedar")
        box("Planter_soil",(.53,.53,.035),(x,-5.55,.84),"cedar_dark",.003)
        for n in range(7):
            angle = n*2.4
            beam("Planter_dried_stem",(x,-5.55,.85),(x+math.cos(angle)*.25,-5.55+math.sin(angle)*.22,1.1+RNG.random()*.23),.025,"paint_dark")
    box("House_number_plate",(.68,.035,.26),(1.25,-4.09,2.50),"ink")
    lettering("104",(1.25,-4.12,2.43),.19,"chalk")
    box("Porch_lamp_back",(.18,.08,.30),(-1.23,-4.1,2.39),"steel")
    cylinder("Porch_lamp",.075,.19,(-1.23,-4.24,2.38),"lamp",8)
    box("Fuse_box",(.3,.16,.45),(4.45,-4.08,1.22),"zinc")
    lettering("ROADSTEAD",(0,-4.19,3.02),.17,"paper")
    # Interior is useful scale-reference furniture, not a decorative sealed shell.
    box("Interior_rug",(2.6,2.0,.025),(-1.7,-.1,.39),"fabric",.005)
    box("Bed_frame",(1.5,2.05,.35),(-3.85,2.5,.53),"cedar")
    box("Bed_mattress",(1.4,1.95,.22),(-3.85,2.5,.82),"chalk",.07)
    box("Bed_blanket",(1.42,1.24,.08),(-3.85,2.17,.96),"paint",.035)
    box("Bed_pillow",(.85,.43,.16),(-3.85,3.17,1.01),"fabric",.06)
    box("Kitchen_counter",(2.0,.6,.87),(3.72,3.46,.79),"cedar")
    box("Kitchen_worktop",(2.1,.68,.085),(3.72,3.46,1.27),"chalk")
    box("Kitchen_sink",(.58,.42,.026),(3.28,3.42,1.33),"steel",.045)
    box("Radio_shelf",(1.3,.34,.1),(4.70,.0,1.45),"cedar_light")
    box("Shortwave_radio",(.4,.26,.23),(4.54,.0,1.62),"ink")
    box("Radio_dial",(.018,.17,.045),(4.32,.0,1.64),"amber",.004)
    # Exact physical doorway clearance independent of the exported metadata.
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    for x in (-.60,0,.60):
        for z in (.60,1.4,2.25):
            hit, *_ = bpy.context.scene.ray_cast(deps, Vector((x,-4.4,z)), Vector((0,1,0)), distance=.75)
            assert not hit, f"Doorway obstructed at x={x}, z={z}"
    return finish("roadstead_cottage")


def mailbox():
    asset_scene("parcel_mailbox")
    box("Foot",(.42,.4,.13),(0,0,.065),"concrete")
    box("Post",(.13,.15,1.12),(0,0,.66),"cedar")
    box("Mailbox_body",(.38,.58,.28),(0,0,1.34),"paint_dark",.08)
    box("Mailbox_door",(.32,.035,.22),(0,-.30,1.32),"roof_light",.035)
    box("Mailbox_handle",(.09,.045,.025),(0,-.333,1.39),"zinc",.006)
    beam("Flag_stem",(.215,.05,1.32),(.215,.05,1.65),.023,"red")
    box("Mailbox_flag",(.04,.16,.085),(.215,-.025,1.63),"red")
    box("Parcel_plaque",(.82,.065,.35),(0,-.07,.84),"ink")
    lettering("ROADSTEAD",(0,-.11,.88),.095)
    lettering("PROPERTY OFFICE",(0,-.11,.76),.064,"paper")
    for x in (-.36,.36):
        cylinder("Plaque_bolt",.016,.015,(x,-.12,.84),"zinc",8,(math.pi/2,0,0))
    return finish("parcel_mailbox")


def kiosk():
    asset_scene("freight_kiosk")
    box("Kiosk_slab",(2.5,1.15,.16),(0,0,.08),"concrete",.035)
    for x in (-1,1):
        box("Kiosk_post",(.16,.16,2.75),(x,.25,1.48),"cedar")
        box("Kiosk_post_boot",(.22,.22,.29),(x,.25,.30),"rust")
    box("Notice_back",(2.1,.16,1.76),(0,.25,1.85),"cedar_dark")
    box("Notice_cork",(1.89,.035,1.49),(0,.145,1.84),"fabric")
    box("Header",(2.2,.13,.41),(0,.13,2.91),"paint_dark")
    lettering("THE ROAD OFFICE",(0,.055,2.88),.16)
    lettering("FREIGHT  /  SALVAGE  /  SAFE PASSAGE",(0,.05,2.76),.056,"paper")
    for n, title in enumerate(("MEDICINE", "SPARE PARTS", "LAST LIGHT")):
        x = -.61+n*.61
        box("Job_notice",(.49,.022,.75),(x,.112,1.94),"paper",.008, (0,math.radians(n-1),0))
        lettering(title,(x,.094,2.16),.064,"ink")
        lettering(("TO THE CLINIC", "KEEP THEM RUNNING", "DELIVER BEFORE DARK")[n],(x,.091,2.035),.034,"ink")
        for j, w in enumerate((.30,.36,.27,.34)):
            box("Notice_print",(w,.004,.01),(x,.088,1.92-j*.07),"cedar",0)
        cylinder("Notice_pin",.022,.012,(x,.079,2.265),"red",8,(math.pi/2,0,0))
    box("Dispatch_shelf",(2.25,.56,.11),(0,-.02,1.02),"cedar_light")
    box("Dispatch_radio",(.45,.27,.23),(.69,.01,1.19),"paint_dark")
    box("Radio_face",(.37,.018,.16),(.69,-.134,1.19),"ink")
    box("Radio_frequency",(.20,.022,.065),(.62,-.15,1.21),"amber")
    cylinder("Radio_knob",.036,.036,(.83,-.165,1.2),"zinc",12,(math.pi/2,0,0))
    beam("Radio_aerial",(.83,.07,1.30),(.96,.07,1.82),.011,"zinc")
    for sign in (-1,1):
        box("Roof_kiosk",(1.30,1.3,.09),(sign*.59,.16,3.31),"roof",.01,(0,sign*math.radians(17),0))
    box("Lower_sign",(1.45,.055,.25),(0,.13,.76),"ink")
    lettering("TAKE A JOB. MAKE IT HOME.",(0,.093,.715),.077,"paper")
    return finish("freight_kiosk")


def crate():
    asset_scene("delivery_crate")
    for x in (-.39,.39):
        box("Skid",(.12,.79,.10),(x,0,.05),"cedar_dark")
    box("Crate_core",(.96,.70,.63),(0,0,.43),"cedar",.022)
    for y in (-.367,.367):
        for n in range(5):
            box("Crate_plank",(.19,.046,.58),(-.39+n*.195,y,.43),"cedar_light" if n%2 else "cedar",.006)
    for x in (-.49,.49):
        box("Steel_edge",(.055,.74,.63),(x,0,.43),"steel")
    for x in (-.30,.30):
        box("Cargo_strap",(.048,.74,.026),(x,0,.76),"paint_dark",.004)
        for y in (-.388,.388):
            box("Cargo_strap",(.048,.021,.66),(x,y,.43),"paint_dark",.004)
    box("Shipping_label",(.43,.01,.27),(0,-.397,.44),"paper",.002)
    lettering("DRIVN FREIGHT",(0,-.407,.49),.049,"ink")
    lettering("HANDLE WITH CARE",(0,-.407,.415),.034,"ink")
    lettering("07 / MERIDIAN",(0,-.407,.35),.030,"ink")
    box("Seal",(.095,.027,.11),(.3,-.41,.64),"amber")
    return finish("delivery_crate")


def light(name, kind, location, energy, color, size=5):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "AREA": data.shape = "DISK"; data.size = size
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    ob.location = location
    ob.rotation_euler = (Vector((0,0,1.5))-ob.location).to_track_quat('-Z','Y').to_euler()
    return ob


def render(scene, name, eye, target, scale, cutaway=False):
    bpy.context.window.scene = scene
    for old in list(scene.objects):
        if old.name.startswith("Preview_"):
            bpy.data.objects.remove(old, do_unlink=True)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new("Preview_sky")
    if bpy.app.version < (5, 0, 0):
        scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.32,.39,.42,1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .45
    ground = box("Preview_ground",(200,200,.08),(0,0,-.10),"paint_dark",0)
    light("Preview_key","AREA",(-8,-10,15),2400,(1,.79,.51),8)
    light("Preview_fill","AREA",(10,-2,8),1500,(.57,.75,1),10)
    light("Preview_rim","AREA",(1,8,12),2100,(1,.88,.64),8)
    camera_data = bpy.data.cameras.new("Preview_camera")
    camera = bpy.data.objects.new("Preview_camera",camera_data)
    scene.collection.objects.link(camera)
    camera.location = eye
    camera.rotation_euler = (Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = scale
    scene.camera = camera
    roofs = [ob for ob in scene.objects if ob.name.startswith("Roof")]
    for ob in roofs: ob.hide_render = cutaway
    scene.render.filepath = str(PREVIEWS/(name+".png"))
    bpy.ops.render.render(write_still=True)
    for ob in roofs: ob.hide_render = False
    # Preview objects live only in the source blend, never exported GLBs.
    ground.hide_viewport = True


if __name__ == "__main__":
    # Repeatable task-owned generation without collecting old copies in .blend.
    # Other scenes, including any user's saved scene, are never deleted.
    original_scene = next((s for s in bpy.data.scenes if not s.get("drivn_original_asset")), None)
    if original_scene is None:
        original_scene = bpy.data.scenes.new("DRIVN_Workbench")
    bpy.context.window.scene = original_scene
    for old_scene in list(bpy.data.scenes):
        if old_scene.get("drivn_original_asset") in ("roadstead_cottage","parcel_mailbox","freight_kiosk","delivery_crate"):
            for obj in list(old_scene.objects):
                if len(obj.users_scene) == 1:
                    bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.scenes.remove(old_scene)
    materials()
    home, _ = cottage()
    post, _ = mailbox()
    dispatch, _ = kiosk()
    cargo, _ = crate()
    render(home,"cottage_exterior",(15,-19,13),(0,-.8,1.7),20)
    render(home,"cottage_cutaway",(12,-16,19),(0,-.8,1.1),18,True)
    render(dispatch,"freight_kiosk",(4,-7,4),(0,0,1.6),5.6)
    render(post,"parcel_mailbox",(3,-5,3),(0,0,.9),2.9)
    render(cargo,"delivery_crate",(2,-3,2),(0,0,.4),1.7)
    bpy.context.window.scene = home
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCES/"homestead_kit.blend"))
    print("DRIVN_HOMESTEAD_KIT_COMPLETE")
