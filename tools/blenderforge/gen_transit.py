"""Original LASTLINE coach / KESTREL courier. Execute through Blender MCP.

Blender +Y is the vehicle front; glTF/Godot front is -Z. Origin is ground
contact, metres. Separate doors, wheels, rotors and seats are runtime contracts.
Only scenes tagged with these two asset IDs are replaced during regeneration.
"""
import importlib.util
import json
import math
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('drivn_transit_helpers', HERE / 'gen_homestead.py')
kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kit)
ROOT = HERE.parents[1]
OUT = ROOT / 'game/assets/models/transit'
PREVIEWS = HERE / 'previews/transit'
IDS = ('lastline_coach', 'kestrel_courier')
PARTS = []
ANCHORS = []


def begin(name):
    global PARTS, ANCHORS
    PARTS, ANCHORS = [], []
    return kit.asset_scene(name)


def group(name, objects, pivot=(0, 0, 0)):
    ob = kit.join_category(name, objects)
    ob.data.transform(Matrix.Translation(-Vector(pivot)))
    ob.location = pivot
    PARTS.append(ob)
    return ob


def anchor(name, position):
    ob = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(ob)
    ob.location = position
    ob.empty_display_size = .12
    ob['drivn_attachment'] = True
    ANCHORS.append(ob)


def section(name, pivot, build):
    start = len(kit.OWNED)
    build()
    return group(name, kit.OWNED[start:], pivot)


def seat(x, y, z):
    kit.box('Seat_base', (.55,.54,.12), (x,y,z), 'fabric', .045)
    kit.box('Seat_back', (.55,.14,.63), (x,y-.23,z+.30), 'fabric', .05)
    for xx in (x-.21,x+.21):
        kit.beam('Seat_leg', (xx,y-.15,z-.35), (xx,y+.16,z-.05), .04, 'steel')


def worn_edge(x, y, z, length):
    """Small irregular exposed-metal chips; real geometry, no texture dependency."""
    kit.mesh('Paint_chip', [(x,y,z),(x,y+length*.25,z+.035),
             (x,y+length*.38,z+.015),(x,y+length*.78,z+.045),
             (x,y+length,z+.008),(x,y+length*.81,z-.022),
             (x,y+length*.42,z-.008)], [(0,1,2,3,4,5,6)], 'rust')


def coach():
    scene = begin('lastline_coach')
    kit.box('Chassis', (2.25,8.4,.24), (0,0,.62), 'steel', .08)
    kit.box('Cabin_floor', (2.36,7.95,.14), (0,0,.84), 'cedar_dark', .015)
    for x in (-1.20,1.20):
        # Right-side sill and stripe stop at the real boarding opening.
        spans = [(-4.075,4.075)] if x < 0 else [(-4.075,2.66),(3.86,4.075)]
        for start,end in spans:
            kit.box('Lower_panel', (.14,end-start,.86), (x,(start+end)/2,1.14), 'paint', .035)
            kit.box('Route_stripe', (.025,end-start,.12), (x*1.064,(start+end)/2,1.46), 'amber', .006)
        kit.box('Window_rail', (.12,8.1,.13), (x,0,2.71), 'chalk', .03)
        for i in range(7):
            y=-3.32+i*1.02
            if x > 0 and i >= 6:
                continue
            kit.box('Safety_glass', (.035,.86,.86), (x,y,2.13), 'transit_glass', .025)
            kit.box('Window_post', (.12,.105,1.20), (x,y-.48,2.12), 'chalk', .02)
        for y in (-3.9,3.9):
            kit.box('Corner_post', (.17,.18,1.95), (x,y,1.78), 'chalk', .045)
        for y in (-3,-1,1):
            kit.box('Repaired_panel', (.028,.73,.33), (x*1.075,y,1.08), 'roof_light', .01)
            for yy in (y-.28,y+.28):
                kit.cylinder('Panel_rivet', .018,.035,(x*1.097,yy,1.08),'zinc',8,(0,math.pi/2,0))
        for i,y in enumerate((-3.76,-3.02,-2.37,-1.73,-.84,.04,.89,1.65)):
            worn_edge(math.copysign(1.274,x),y,.86+(i%3)*.03,.32+(i%4)*.11)
    for y in (-4.02,4.02):
        kit.box('Nose_tail_panel', (2.35,.18,.96), (0,y,1.26), 'paint', .09)
        kit.box('Bumper', (2.52,.26,.19), (0,y*1.04,.78), 'steel', .055)
        for x in (-.84,.84):
            kit.cylinder('Lamp_bezel', .16,.08,(x,y*1.029,1.29),'zinc',16,(math.pi/2,0,0))
            kit.cylinder('Lamp_lens', .115,.085,(x,y*1.04,1.29),'lamp' if y>0 else 'red',16,(math.pi/2,0,0))
    kit.box('Windshield', (2.16,.055,.89), (0,3.95,2.16), 'transit_glass', .08, (math.radians(-9),0,0))
    kit.box('Windshield_center', (.065,.10,.97), (0,4.0,2.16), 'steel', .02)
    for x in (-.62,.62):
        kit.beam('Wiper', (x,4.06,1.77), (x+.30,4.15,2.21), .025, 'steel')
    kit.box('Rear_window', (1.8,.04,.78), (0,-4.04,2.2), 'transit_glass', .04)
    kit.box('Destination_board', (2.14,.14,.38), (0,4.0,2.86), 'ink', .04)
    kit.lettering('LASTLINE', (0,4.081,2.76), .23, 'paper', rotation=(math.pi/2,0,math.pi))
    kit.lettering('MERIDIAN  /  EAST ROAD', (0,4.083,2.66), .071, 'amber', rotation=(math.pi/2,0,math.pi))
    for x in (-1.45,1.45):
        kit.beam('Mirror_arm', (x*.84,3.65,2.35),(x,3.87,2.40),.045,'steel')
        kit.box('Mirror', (.13,.14,.34),(x,3.86,2.38),'zinc',.03)
    kit.box('Driver_dash', (1.85,.49,.24),(0,3.31,1.55),'ink',.035)
    kit.cylinder('Steering_wheel', .22,.045,(-.51,3.25,1.70),'steel',20,(math.radians(55),0,0))
    seat(-.52,2.78,1.22)
    for i in range(6):
        seat(-.56 if i%2==0 else .56,1.2-(i//2)*1.30,1.21)
    for x in (-.70,.70):
        kit.beam('Aisle_rail',(x,-3.4,2.61),(x,2.1,2.61),.035,'zinc')
    kit.box('First_aid_box', (.35,.20,.34),(-.85,2.1,1.94),'chalk',.02)
    kit.box('Medical_mark_v', (.065,.012,.23),(-.85,1.988,1.94),'red',0)
    kit.box('Medical_mark_h', (.23,.012,.065),(-.85,1.985,1.94),'red',0)
    # Steps belong to the chassis, not the swinging door. They are ahead of the tire.
    for x,z in ((1.50,.24),(1.28,.46),(1.07,.68)):
        kit.box('Boarding_step',(.30,1.0,.085),(x,3.26,z),'steel',.015)
    group('Body_coach', list(kit.OWNED))

    def roof():
        kit.box('Roof_shell',(2.48,8.15,.24),(0,0,2.93),'chalk',.10)
        for y in (-3,-2,-1,0,1,2,3):
            kit.box('Roof_seam',(2.35,.045,.04),(0,y,3.065),'zinc',.006)
        for x in (-.91,.91):
            kit.beam('Rack_rail',(x,-2.9,3.38),(x,1.25,3.38),.055,'steel')
            for y in (-2.9,-1,.9):
                kit.beam('Rack_leg',(x,y,3.05),(x,y,3.38),.045,'steel')
        for x,y in ((-.4,-1.7),(.4,-1.7),(0,-.3)):
            kit.box('Tied_baggage',(.69,.86,.42),(x,y,3.29),'fabric',.09)
            kit.box('Cargo_strap',(.05,.89,.46),(x,y,3.29),'steel',.005)
        kit.box('Vent',(1.05,.75,.14),(0,2.3,3.12),'paint_dark',.045)
    section('Roof_coach',(0,0,0),roof)

    def door():
        for y in (2.73,3.79):
            kit.box('Door_stile',(.11,.08,1.90),(1.25,y,1.77),'chalk',.02)
        for z in (.86,1.43,2.68):
            kit.box('Door_rail',(.11,1.14,.08),(1.25,3.26,z),'chalk',.02)
        kit.box('Door_pane',(.035,.99,1.17),(1.25,3.26,2.06),'transit_glass',.02)
        kit.box('Door_lower',(.10,1.0,.50),(1.25,3.26,1.14),'paint',.025)
        kit.box('Door_handle',(.05,.20,.045),(1.33,2.91,1.57),'steel',.01)
    section('Door_passenger',(1.25,3.83,.9),door)
    for name,x,y in (('FL',-1.10,1.95),('FR',1.10,1.95),('RL',-1.10,-2.70),('RR',1.10,-2.70)):
        def wheel(x=x,y=y):
            kit.cylinder('Tire',.50,.26,(x,y,.50),'rubber',24,(0,math.pi/2,0))
            outside=x+math.copysign(.145,x)
            kit.cylinder('Rim',.285,.035,(outside,y,.50),'zinc',20,(0,math.pi/2,0))
            kit.cylinder('Hub',.12,.06,(outside,y,.50),'steel',12,(0,math.pi/2,0))
        section('Wheel_'+name,(x,y,.50),wheel)
    anchor('Seat_driver',(-.52,2.78,1.23))
    for i in range(6):
        anchor('Seat_passenger_%02d'%(i+1),(-.56 if i%2==0 else .56,1.2-(i//2)*1.30,1.22))
    anchor('Boarding',(1.95,3.26,.1))
    anchor('Exit',(2.15,3.26,.1))
    return export(scene,'lastline_coach')


def helicopter():
    scene=begin('kestrel_courier')
    # A hollow shell: a solid aft cube used to engulf both rear passenger seats.
    kit.box('Cabin_floor',(1.90,3.20,.16),(0,.40,.83),'paint_dark',.045)
    kit.box('Aft_wall',(1.90,.12,1.67),(0,-1.42,1.76),'paint',.04)
    kit.box('Aft_left_wall',(.10,1.35,1.67),(-.91,-.75,1.76),'paint',.035)
    kit.box('Aft_right_wall',(.10,.57,1.67),(.91,-1.14,1.76),'paint',.035)
    # Faceted nose: its upper glass and sloping chin preserve a utility silhouette.
    vertices=[(-.94,1.4,1.1),(.94,1.4,1.1),(-.70,2.65,1.38),(.70,2.65,1.38),
              (-.94,1.4,2.53),(.94,1.4,2.53),(-.72,2.37,2.20),(.72,2.37,2.20)]
    kit.mesh('Nose_chin',vertices,[(0,2,3,1),(0,4,6,2),(1,3,7,5)],'paint')
    kit.mesh('Cockpit_glass',vertices,[(2,6,7,3),(4,5,7,6)],'transit_glass')
    for a,b in ((vertices[2],vertices[6]),(vertices[3],vertices[7]),(vertices[6],vertices[7])):
        kit.beam('Nose_frame',a,b,.055,'steel')
    kit.beam('Windshield_center',(0,2.65,1.38),(0,2.37,2.20),.05,'steel')
    for x in (-.96,.96):
        length,center = (1.48,.64) if x < 0 else (.76,1.0)
        kit.box('Side_glazing',(.035,length,.86),(x,center,2.03),'transit_glass',.04)
        for y in ((-.1,1.4) if x < 0 else (-.84,.56,1.4)):
            kit.box('Cabin_pillar',(.09,.07,1.25),(x,y,1.98),'chalk',.025)
        spans = [(-1.08,1.54)] if x < 0 else [(-1.45,-.84),(.56,1.54)]
        for start,end in spans:
            kit.box('Cabin_sill',(.10,end-start,.43),(x,(start+end)/2,1.13),'paint_dark',.02)
            kit.box('Safety_stripe',(.023,end-start,.15),(x*1.02,(start+end)/2,1.39),'amber',.005)
            worn_edge(math.copysign(1.015,x),start+.04,1.02,min(.42,end-start-.08))
        kit.box('Intake',(.065,.57,.29),(x,-1.15,2.22),'ink',.015)
        for y in (-1.36,-1.20,-1.04,-.88):
            kit.box('Intake_louver',(.08,.035,.25),(x*1.02,y,2.22),'zinc',.005)
    seat(-.43,1.0,1.24)
    seat(.43,1.0,1.24)
    seat(-.43,-.3,1.24)
    seat(.43,-.3,1.24)
    kit.box('Instrument_panel',(1.42,.34,.30),(0,1.64,1.57),'ink',.07)
    for x in (-.45,-.15,.15,.45):
        kit.cylinder('Instrument',.09,.025,(x,1.453,1.63),'zinc',16,(math.pi/2,0,0))
    # Tapered tail boom, separate from the independent spinning tail rotor.
    rings=[]
    for y,z,radius in ((-1.3,1.82,.48),(-3.0,2.02,.25),(-4.85,2.30,.13)):
        rings.extend([(math.cos(i*math.tau/8)*radius,y,z+math.sin(i*math.tau/8)*radius) for i in range(8)])
    faces=[]
    for ring in range(2):
        for i in range(8):
            a=ring*8+i;b=ring*8+(i+1)%8
            faces.append((a,b,b+8,a+8))
    kit.mesh('Tail_boom',rings,faces,'paint')
    kit.box('Tail_fin',(.11,.82,1.28),(0,-4.59,2.59),'chalk',.035,(math.radians(-20),0,0))
    kit.box('Tailplane',(2.15,.57,.08),(0,-3.82,2.27),'paint_dark',.025)
    kit.box('Tail_warning',(.13,.43,.27),(0,-4.67,2.96),'amber',.015)
    for x in (-.94,.94):
        kit.beam('Skid',(x,-1.9,.09),(x,1.6,.09),.18,'steel')
        kit.beam('Skid_nose',(x,1.6,.09),(x,2.10,.38),.18,'steel')
        for y in (-1.15,.9):
            kit.beam('Skid_strut',(x,y,.15),(x*.67,y,.87),.095,'zinc')
    kit.cylinder('Rotor_mast',.13,.59,(0,-.16,2.94),'zinc',16)
    for x in (-.52,.52):
        kit.cylinder('Turbine_exhaust',.15,.50,(x,-1.49,2.60),'steel',16,(math.pi/2,0,0))
    kit.cylinder('Nose_lamp',.115,.07,(0,2.49,1.25),'lamp',16,(math.pi/2,0,0))
    group('Body_helicopter',list(kit.OWNED))

    def roof():
        kit.box('Roof',(1.91,2.96,.20),(0,.13,2.66),'chalk',.09)
        kit.box('Engine_cowling',(1.14,1.22,.42),(0,-.54,2.89),'paint',.13)
        kit.box('Rescue_mark',(1.16,.06,.025),(0,.58,2.773),'amber',.005)
    section('Roof_cabin',(0,0,0),roof)
    def door():
        for y in (-.765,.485):
            kit.box('Door_stile',(.08,.07,1.60),(.99,y,1.74),'paint',.02)
        for z in (.96,1.58,2.50):
            kit.box('Door_rail',(.08,1.32,.07),(.99,-.14,z),'paint',.02)
        kit.box('Door_lower',(.08,1.25,.55),(.99,-.14,1.27),'paint',.025)
        kit.box('Door_glass',(.035,1.17,.85),(.99,-.14,2.05),'transit_glass',.025)
        kit.box('Door_handle',(.08,.24,.04),(1.055,-.56,1.56),'steel',.012)
        kit.box('Courier_plaque',(.03,.75,.20),(1.04,-.1,1.33),'chalk',.008)
        kit.lettering('KESTREL',(1.057,-.1,1.30),.12,'ink',rotation=(math.pi/2,0,math.pi/2))
    section('Door_passenger',(.99,-.78,1.13),door)
    def rotor():
        kit.cylinder('Rotor_hub',.26,.14,(0,-.16,3.31),'steel',16)
        for angle in (0,math.pi/2,math.pi,math.pi*1.5):
            dx,dy=math.cos(angle),math.sin(angle)
            kit.box('Rotor_blade',(4.60,.25,.045),(dx*2.64,-.16+dy*2.64,3.32),'steel',.008,(0,0,angle))
            kit.box('Blade_tip',(.24,.255,.05),(dx*4.82,-.16+dy*4.82,3.32),'amber',.005,(0,0,angle))
    section('Rotor_main',(0,-.16,3.31),rotor)
    def tail_rotor():
        kit.cylinder('Tail_hub',.10,.20,(.23,-4.72,2.49),'zinc',12,(0,math.pi/2,0))
        for angle in (0,math.pi/2):
            kit.box('Tail_blade',(.05,1.34,.12),(.34,-4.72,2.49),'steel',.015,(angle,0,0))
    section('Rotor_tail',(.34,-4.72,2.49),tail_rotor)
    anchor('Seat_driver',(-.43,1.0,1.25))
    for i,(x,y) in enumerate(((.43,1.0),(-.43,-.3),(.43,-.3))):
        anchor('Seat_passenger_%02d'%(i+1),(x,y,1.25))
    anchor('Boarding',(1.65,-.14,.2))
    anchor('Exit',(1.9,-.14,.2))
    return export(scene,'kestrel_courier')


def export(scene,name):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in PARTS+ANCHORS:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',
        use_active_scene=True,use_selection=True,export_apply=True,export_extras=True,
        export_cameras=False,export_lights=False,export_yup=True)
    triangles=0
    for ob in PARTS:
        ob.data.calc_loop_triangles()
        triangles+=len(ob.data.loop_triangles)
    print(json.dumps({'asset':name,'triangles':triangles,'parts':len(PARTS),'anchors':len(ANCHORS)}))
    # Blender object names are global across scenes. Release the shared runtime
    # names after this export so the next vehicle does not acquire .001 suffixes.
    # The editable source keeps both its unique name and canonical attachment key.
    for ob in PARTS+ANCHORS:
        ob['drivn_runtime_name']=ob.name
        ob.name=name+'__'+ob.name
    return scene


def preview(scene,name,eye,target,scale,roof_hidden=False):
    bpy.context.window.scene=scene
    for ob in list(scene.objects):
        if ob.name.startswith('Preview_'):
            bpy.data.objects.remove(ob,do_unlink=True)
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1440
    scene.render.resolution_y=900
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world=bpy.data.worlds.new('Preview_world')
    if bpy.app.version<(5,0,0):scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.23,.29,.30,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
    kit.box('Preview_ground',(100,100,.10),(0,0,-.07),'paint_dark',0)
    kit.light('Preview_key','AREA',(-7,9,14),2200,(1,.84,.65),8)
    kit.light('Preview_fill','AREA',(8,2,10),1800,(.67,.82,1),9)
    kit.light('Preview_rim','AREA',(0,-8,10),2000,(1,.80,.51),7)
    data=bpy.data.cameras.new('Preview_camera')
    camera=bpy.data.objects.new('Preview_camera',data)
    scene.collection.objects.link(camera)
    camera.location=eye
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    data.type='ORTHO';data.ortho_scale=scale;scene.camera=camera
    for ob in scene.objects:
        if ob.get('drivn_part')=='roof':ob.hide_render=roof_hidden
    scene.render.filepath=str(PREVIEWS/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    for ob in scene.objects:
        if ob.get('drivn_part')=='roof':ob.hide_render=False


if __name__=='__main__':
    for directory in (OUT,PREVIEWS):directory.mkdir(parents=True,exist_ok=True)
    for scene in list(bpy.data.scenes):
        if scene.get('drivn_original_asset') in IDS:
            for ob in list(scene.objects):bpy.data.objects.remove(ob,do_unlink=True)
            bpy.data.scenes.remove(scene)
    kit.materials()
    # Darker oxidized paint and old canvas remain legible under the game sun.
    # These materials live only in this disposable source/export session.
    kit.material('paint',(.125,.205,.155),.90,0)
    kit.material('paint_dark',(.085,.13,.095),.92,0)
    kit.material('chalk',(.48,.435,.32),.88,0)
    kit.material('fabric',(.29,.215,.105),.98,0)
    kit.material('zinc',(.27,.29,.25),.48,.65)
    kit.material('rubber',(.024,.029,.027),.94,0)
    glass=kit.material('transit_glass',(.075,.18,.17),.12,.15)
    glass.diffuse_color=(.075,.18,.17,.34)
    glass.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value=.34
    if hasattr(glass,'surface_render_method'):glass.surface_render_method='DITHERED'
    elif hasattr(glass,'blend_method'):glass.blend_method='BLEND'
    bus=coach()
    heli=helicopter()
    for scene,name,scale in ((bus,'coach',13),(heli,'helicopter',14)):
        preview(scene,name+'_front',(10,13,8),(0,0,1.4),scale)
        preview(scene,name+'_rear',(-11,-13,7),(0,0,1.4),scale)
        preview(scene,name+'_cabin',(7,8,12),(0,0,1.3),scale,True)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'sources/transit_kit.blend'))
    print('DRIVN_TRANSIT_ASSETS_COMPLETE',flush=True)
