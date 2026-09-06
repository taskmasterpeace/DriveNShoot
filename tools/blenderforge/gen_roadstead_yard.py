"""Original reclaimed Roadstead yard kit. Execute through Blender MCP.

Imports mesh/material helpers without regenerating or altering the homestead kit.
Metres; Blender front -Y exports to Godot front +Z. No external assets or textures.
"""
import importlib.util
import math
from pathlib import Path
import bpy

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("drivn_homestead_helpers", HERE / "gen_homestead.py")
kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kit)


def shelter():
    kit.asset_scene("freight_shelter")
    for x in (-2.8, 2.8):
        for y in (-1.7, 1.7):
            kit.box("Post_foot", (.30,.30,.12), (x,y,.06), "concrete", .025)
            kit.box("Timber_post", (.18,.18,3.05), (x,y,1.64), "cedar", .025)
            for z in (.22,2.65):
                kit.box("Steel_strap", (.20,.20,.12), (x,y,z), "steel", .008)
            kit.beam("Knee_brace", (x,y,2.55), (x-math.copysign(.55,x),y,3.16), .10, "cedar_light")
    for y in (-1.7,1.7):
        kit.box("Eave_beam", (6.0,.16,.22), (0,y,3.16), "cedar_dark")
    for x in (-2.8,0,2.8):
        kit.box("Rafter", (.13,4.15,.16), (x,0,3.34), "cedar")
    # Layered corrugated panels are a separate hideable roof, not an invisible collider.
    for panel in range(16):
        x=-3.05+panel*.405
        kit.box("Roof_sheet", (.40,4.4,.065), (x,0,3.50),
                "roof" if panel%4 else "rust", .005, (math.radians(4),0,0))
        kit.box("Roof_rib", (.025,4.4,.04), (x-.16,0,3.555), "roof_light", .004,
                (math.radians(4),0,0))
    kit.box("Office_sign", (5.1,.09,.62), (0,-1.82,2.78), "paint_dark", .02)
    kit.box("Sign_top_trim", (5.22,.11,.055), (0,-1.84,3.10), "amber", .005)
    kit.lettering("ROAD OFFICE", (0,-1.88,2.69), .42, "paper")
    kit.lettering("FREIGHT  /  DEEDS  /  KEEP MOVING", (0,-1.885,2.43), .115, "chalk")
    # A rear cargo shelf, with open central space around the real job kiosk.
    for x in (-2.1,2.1):
        kit.box("Shelf_leg", (.10,.10,1.0), (x,1.48,.5), "steel")
    kit.box("Freight_shelf", (4.5,.55,.10), (0,1.48,1.0), "cedar_light")
    return kit.finish("freight_shelter")


def fence():
    kit.asset_scene("reclaimed_fence")
    for x in (-1.95,1.95):
        kit.box("Fence_post", (.14,.17,1.30), (x,0,.65), "cedar_dark", .02)
        kit.box("Post_cap", (.18,.21,.06), (x,0,1.32), "zinc", .005)
    for z in (.35,.91):
        kit.box("Cross_rail", (4,.09,.11), (0,.07,z), "cedar", .012)
    for i in range(11):
        x=-1.75+i*.35
        height=1.08+(i%3)*.06
        kit.box("Salvaged_board", (.24,.065,height), (x,-.025,height/2+.05),
                ("paint","cedar_light","paint_dark")[i%3], .01,
                (0,(i%3-1)*.018,0))
        for z in (.35,.91):
            kit.cylinder("Bolt", .013,.02,(x,-.07,z),"steel",8,(math.pi/2,0,0))
    return kit.finish("reclaimed_fence")


def lamp():
    kit.asset_scene("yard_lamp")
    kit.box("Concrete_foot", (.48,.48,.16), (0,0,.08), "concrete", .035)
    kit.cylinder("Reclaimed_pole", .075,3.45,(0,0,1.85),"steel",12)
    kit.box("Service_box", (.24,.18,.38), (0,.06,1.15), "paint_dark", .015)
    for z in (.8,2.6):
        kit.cylinder("Pole_collar", .095,.10,(0,0,z),"rust",12)
    kit.beam("Lamp_arm", (0,0,3.45),(0,-.42,3.62),.085,"steel")
    kit.box("Lamp_cap", (.46,.40,.13), (0,-.42,3.65), "roof", .025)
    kit.box("Warm_diffuser", (.32,.28,.25), (0,-.42,3.47), "lamp", .015)
    for x in (-.18,.18):
        kit.box("Lamp_guard", (.025,.32,.32), (x,-.42,3.48), "steel", .005)
    kit.box("Lamp_base", (.42,.36,.055), (0,-.42,3.31), "steel", .008)
    return kit.finish("yard_lamp")


if __name__ == "__main__":
    names={"freight_shelter","reclaimed_fence","yard_lamp"}
    neutral=next((s for s in bpy.data.scenes if not s.get("drivn_original_asset")), None)
    if neutral is None:
        neutral=bpy.data.scenes.new("DRIVN_Yard_Workbench")
    bpy.context.window.scene=neutral
    for old in list(bpy.data.scenes):
        if old.get("drivn_original_asset") in names:
            for obj in list(old.objects):
                if len(obj.users_scene)==1:
                    bpy.data.objects.remove(obj,do_unlink=True)
            bpy.data.scenes.remove(old)
    kit.materials()
    home,_=shelter()
    fence()
    lamp()
    bpy.context.window.scene=home
    bpy.ops.wm.save_as_mainfile(filepath=str(kit.SOURCES / "roadstead_yard.blend"))
    print("DRIVN_ROADSTEAD_YARD_COMPLETE")
