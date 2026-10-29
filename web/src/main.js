import * as THREE from 'three';
import { Input } from './engine/input.js';
import { Controls } from './engine/controls.js'; // the controller: binding rows, the pad, rebinds (docs/design/WEB_CONTROLLER.md)
import { PAD } from './data/controls.js';
import { StaticWorld, RAY_SIGHT } from './engine/collision.js';
import { makeRng, angleLerp, clamp } from './engine/rng.js';
import { buildWorld, TOWN, roadLines, HALF, OUTSIDE } from './world/city.js';
import { Streamer } from './world/streamer.js';
import { buildTerrain, drawTerrainOnMinimap } from './world/terrain.js';
import { Water, WATER_AVOID, DOCK, LAKE } from './world/water.js';
import { Waves } from './world/waves.js';
import { Sealife } from './systems/sealife.js';
import { WaterPlace } from './systems/waterplace.js';
import { Diving } from './systems/diving.js';
import { Swamp } from './systems/swamp.js';
import { RAIL_AVOID } from './world/rail.js';
import { Train } from './systems/train.js';
import { Convoy } from './systems/convoy.js';
import { Semis } from './systems/semis.js';
import { Ambient } from './systems/ambient.js';
import { coneTexture } from './world/textures.js';
import { Sky } from './systems/sky.js';
import { FX } from './systems/fx.js';
import { LookFeel } from './systems/lookfeel.js'; // the grade, wind, history decals, impact feel, vehicle wear (WEB_LOOK_FEEL.md)
import { Character, CharacterRenderer, outfit, MAX_CHARS, stridePhase } from './systems/characters.js';
import { Combat, WEAPONS } from './systems/combat.js';
import { Ballistics } from './systems/ballistics.js';
import { Deaths } from './systems/deaths.js';
import { Migrations } from './systems/migrations.js';
import { Arms } from './systems/arms.js';
import { Gunpoint } from './systems/gunpoint.js';
import { Melee } from './systems/melee.js';
import { CamRig } from './systems/camrig.js';
import { Cutaway } from './systems/cutaway.js';
import { WeaponBar } from './ui/weaponbar.js';
import { AI } from './systems/ai.js';
import { Society } from './systems/society.js';
import { Survival } from './systems/survival.js';
import { Skills } from './systems/skills.js';
import { Stats } from './systems/stats.js';
import { Soundscape } from './systems/soundscape.js';
import { LlmTalk } from './systems/llmtalk.js';
import { CharSheet } from './ui/charsheet.js';
import { Radio } from './systems/radio.js';
import { Garage } from './systems/garage.js';
import { Workshop } from './systems/workshop.js';
import { WorkshopUI } from './ui/workshop.js';
import { Stunts } from './systems/stunts.js';
import { Bases } from './systems/bases.js';
import { Inventory } from './systems/inventory.js';
import { Roles } from './systems/roles.js';
import { Witnesses } from './systems/witnesses.js';
import { Storeys } from './world/storeys.js';
import { Talk } from './systems/talk.js';
import { LEVEL } from './data/storeys.js';
import { InventoryUI } from './ui/inventory.js';
import { ITEMS, GUN_CARE } from './data/items.js';
import { Trade } from './systems/trade.js';
import { ZOOM, CAMERA } from './data/camera.js';
import { Vehicles } from './systems/vehicles.js';
import { CarCombat } from './systems/carcombat.js';
import { Interiors } from './systems/interiors.js';
import { Materials } from './systems/materials.js';
import { Zombies, AMBIENT_RESERVE } from './systems/zombies.js';
import { Population } from './systems/population.js';
import { Residents } from './systems/residents.js';
import { Dogs } from './systems/dogs.js';
import { Fauna } from './systems/fauna.js';
import { Gear } from './systems/gear.js';
import { Regions } from './systems/regions.js';
import { Underground } from './systems/underground.js';
import { UnderStreet } from './systems/understreet.js'; // UNDER THE STREET: storm drains under every town (docs/design/WEB_UNDERSTREET.md)
import { Milbases } from './systems/milbases.js'; // the military bases' garrisons, hordes and sealed doors (docs/design/WEB_MILITARY_BASES.md)
import { CityGen } from './systems/citygen.js'; // procedural cities, homesteads, bases, the overrun (docs/design/WEB_CITYGEN.md)
import { Wrecks } from './systems/wrecks.js';
import { BackLots } from './systems/backlots.js';
import { Clone } from './systems/clone.js'; // death as Autoduel had it: pressings, husks, the brine (docs/design/WEB_CLONE_TRAVEL.md)
import { Travel } from './systems/travel.js'; // the trundle, the iron, the one airline: the way back to your husk
import { Pulls } from './systems/pulls.js'; // why go out today: bars, road people, the radio, boards, your needs; what reached you (WEB_PULLS.md)
import { PullsBoard } from './ui/pullsboard.js';
import { Kit } from './systems/kit.js'; // GADGETS-2: night goggles, heat scope, glass, torch, scanner, mask, dog gear, car kit (WEB_GADGETS2.md)
import { SiteStories } from './systems/sitestories.js'; // every place's living state, the parties between them, the stories, the Tally (WEB_SITE_STORIES.md)
import { Workforce } from './systems/workforce.js'; // who works where in a built settlement, on shift, and what the work makes (WEB_OCCUPATIONS.md)
import { RoadsideSys } from './systems/roadside.js'; // siphon a station's tank, strip a hulk, a farm's water, the dam's gates (WEB_ROADSIDE.md)
// A new arrival gets a quiet start (no night hordes, no Dustwolf top-ups for ARRIVAL_QUIET game-seconds), and a player
// patched up at the clinic gets RESPAWN_GRACE s before anything can hurt them.
const ARRIVAL_QUIET = 180, RESPAWN_GRACE = 8;
import { VehicleDamage } from './systems/vehicledamage.js';
import { Seats } from './systems/seats.js';
import { Stance } from './systems/stance.js';
import { Throwables, THROWABLES, THROW_ORDER } from './systems/throwables.js';
import { Gadgets } from './systems/gadgets.js';
import { Rites } from './systems/rites.js';
import { Audio } from './systems/audio.js';
import { HUD } from './ui/hud.js';
import { Dialogue } from './ui/dialogue.js';
import { FLAG_KEYS } from './ui/portrait.js';
import { NPCS, randomName } from './data/npcs.js';
import { AgentAPI, snapshot, restore } from './agent/api.js';
import { NavGrid } from './engine/nav.js';
import { Feedback } from './ui/feedback.js';
import { QOL } from './ui/qol.js';
import { startBridge } from './agent/bridge.js';
import { Recorder } from './agent/recorder.js';
import { loadContentPacks } from './agent/content.js';
import { attachShard } from './net/shard.js';
import { Creator } from './systems/creator.js';
import { CreatorUI } from './ui/creator.js';
import { Crew } from './systems/crew.js';       // the crew: records, orders, jobs, trust, the fallen (docs/design/WEB_CREW.md)
import { Tactics } from './systems/tactics.js'; // cover, bands, flanking, suppression for the crew and every hostile side
import { CrewUI } from './ui/crew.js';          // U: the CREW panel (tap) and the orders radial (hold)

const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);
const _hit = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _o = new THREE.Object3D();
const NO_BEDS = [];
const _col = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// Raw WASD direction (world space; screen up = -z) — used for dive direction.
function mx0(I) { return (I.key('KeyD') || I.key('ArrowRight') ? 1 : 0) - (I.key('KeyA') || I.key('ArrowLeft') ? 1 : 0); }
function mz0(I) { return (I.key('KeyS') || I.key('ArrowDown') ? 1 : 0) - (I.key('KeyW') || I.key('ArrowUp') ? 1 : 0); }

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 1, 600);
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    });

    this.input = new Input(canvas);
    this.controls = new Controls(this); // folds the binding rows into the input layer; polls the pad
    this.nextId = 0;
    this.events = [];
    this.eventSeq = 0;
    this.audio = new Audio();
    this.statics = new StaticWorld();
    this.world = buildWorld(this.scene, this.statics);
    this.wrecks = new Wrecks(this); // every static car is one of our bodies, dead, in one batched mesh (systems/wrecks.js)
    this.wrecks.add('island', this.world.wrecks);
    // Mountains (outer desert ring) and water (east river → lake), before the nav grids.
    this.terrain = buildTerrain(this.scene, this.statics, { avoid: [...this.world.spawns.camps.map((c) => ({ x: c.x, z: c.z, r: 34 })), ...WATER_AVOID, ...RAIL_AVOID] });
    this.water = new Water(this);
    this.waves = new Waves(this); // the surface moving: swell, chop, whitecaps, surf, wakes; boats ride it (world/waves.js, WEB_WATER_LIFE.md)
    drawTerrainOnMinimap(this.world.minimap, this.terrain, HALF);
    this.water.drawOnMinimap(this.world.minimap, HALF);
    // Ramps, dunes and the Thrill Show (data/stunts.js): drivable relief, built before the nav grids see its solids.
    this.stunts = new Stunts(this);
    // Military bases (data/bases.js): the Federal Remnant's fenced outpost. Its fence, walls and props are solid before
    // the nav grids see them; its doors and windows join the world's rows before the interiors system hangs them.
    this.bases = new Bases(this);
    // Floors above the street (world/storeys.js): after the city, the ramps and the base (the staircases keep clear of their
    // furniture), before the nav grids (the street floor's walkers route round a stairwell). Its own seed: the island's
    // golden hash does not move.
    this.storeys = new Storeys(this);
    this.storeys.build();
    this.stunts.storeys = this.storeys;
    // Navigation grids: one for people, one dilated for vehicles. The island is rasterised once into each grid's pinned
    // store; A* runs on a 1 km window that moves with the queries and copies streamed chunks' tiles in (engine/nav.js).
    this.nav = { foot: new NavGrid(this.statics, { radius: 0.45, cell: 1 }), car: new NavGrid(this.statics, { radius: 1.9, cell: 2 }) };
    // Deep water is off-limits to walkers' and drivers' path planning (you can still swim/boat it).
    for (const [grid, lim] of [[this.nav.foot, 1.2], [this.nav.car, 0.6]]) grid.blockStore((x, z) => x > 290 && this.water.depthAt(x, z) > lim);
    // The streamed world past the island (docs/design/WEB_STREAMING.md, P1): the I-10 corridor from Los Angeles to El
    // Paso through Phoenix, chunks, pools, chunked collision, the nav window's tiles, the dust wall.
    this.streamer = new Streamer(this);
    OUTSIDE.name = (x, z) => this.streamer.W.nameAt(x, z);
    OUTSIDE.region = (x, z) => this.streamer.W.regionAt(x, z);
    this.sky = new Sky(this.scene, this.audio);
    this.fx = new FX(this.scene);
    this.look = new LookFeel(this);
    this.charR = new CharacterRenderer(this.scene, WEAPONS);
    this.charR.groundAt = (x, z, y) => this.stunts.heightAt(x, z, y); // people stand on ramps and dunes, not inside them
    this.chars = [];
    this.freeSlots = [];
    for (let i = MAX_CHARS - 1; i >= 0; i--) this.freeSlots.push(i);
    this.vehicles = [];
    this.combat = new Combat(this);
    this.ballistics = new Ballistics(this, this.scene); // rounds in flight (docs/design/WEB_BALLISTICS.md)
    this.deaths = new Deaths(this); // the death library: clips, ragdolls, limbs, blood (docs/design/WEB_DEATHS.md)
    this.arms = new Arms(this);         // stance, grip, fire modes, recoil (WEB_CONTROLLER §3.2-3.4)
    this.gunpoint = new Gunpoint(this); // a raised gun held on a person is a state (§3.5)
    this.melee = new Melee(this);       // shove, strike, kick (§3.6)
    this.ai = new AI(this);
    this.tactics = new Tactics(this); // where a fighter stands (data/doctrine.js); ai.js still decides when they shoot
    this.society = new Society(this); // who saw what, and who now hates you for it
    this.society.initPlaces();
    this.witnesses = new Witnesses(this);
    this.talk = new Talk(this); // what a stranger talks about: the news, the road, what their people make of you // the one who saw it runs home to tell it (catch them on the way)
    this.survival = new Survival(this); // water and food on the game clock (g.needs)
    this.vehDamage = new VehicleDamage(this);
    this.seats = new Seats(this);
    this.stance = new Stance(this); // stand / crouch / prone: bodies, speed, being seen, footing (systems/stance.js)
    this.throwables = new Throwables(this);
    this.fuelTrail = [];
    window.__THROW_NAMES = Object.fromEntries(Object.entries(THROWABLES).map(([k, d]) => [k, d.name]));
    this.vehiclesSys = new Vehicles(this);
    this.carCombat = new CarCombat(this);
    this.garage = new Garage(this); // plate by facing, hood guns, tail droppers (data/parts.js)
    this.workshop = new Workshop(this); // THE WORKSHOP: six faces, mounts with arcs, the counter (data/workshop.js, WEB_WORKSHOP.md)
    this.interiors = new Interiors(this); // doors, locks, windows (after the nav grids and the car glass it borrows)
    // Caves, bunker levels, the secret facilities (docs/design/WEB_UNDERGROUND.md): levels below the street on their own
    // StaticWorld, promoted near you; after the interiors (their doors hang its leaves).
    this.under = new Underground(this);
    this.stunts.under = this.under;
    this.understreet = new UnderStreet(this); // a town's storm drains: the underground's `drains` sites (systems/understreet.js)
    this.materials = new Materials(this); // what everything is made of: rounds through it, blasts, fire, rams, breaking; blood on walls (this.blood)
    this.zombies = new Zombies(this);
    this.population = new Population(this); // the far fold: ambient people left far behind hand their slots back (systems/population.js)
    this.milbases = new Milbases(this); // before citygen: a stamped base hands its garrison here (systems/milbases.js)
    this.citygen = new CityGen(this); // the country's settlements: planned at boot, built near you (after the underground: a base's vault is its site)
    this.backlots = new BackLots(this); // their alleys, yard fences and gates, back-door locks, town pathing (docs/design/WEB_BACK_LOTS.md)
    this.train = new Train(this);
    this.convoy = new Convoy(this);
    this.semis = new Semis(this); // tractor-trailers: the hitch, the ramp, cars in the hold, the freight (systems/semis.js)
    this.ambient = new Ambient(this);
    this.residents = new Residents(this); // the Phoenix ring's people: records by building, promoted near you (WEB_STREAMING §1.3 R2)
    this.regions = new Regions(this); // Florida (WEB_FLORIDA.md): where a new game starts, Meridian's people, the gators, the region's infected
    const ui = document.getElementById('ui');
    this.hud = new HUD(this, ui);
    this.dialogue = new Dialogue(this, ui);
    this.qol = new QOL(this, ui);
    this.feedback = new Feedback(this, ui);
    this.weaponBar = new WeaponBar(this, ui); // the weapon bar, the pad's weapon wheel, the CONTROLS panel (F2)
    this.crew = new Crew(this);
    this.rites = new Rites(this); // the dead: bodies that rot on the clock, cemeteries everywhere, funerals (WEB_DEATH_RITES.md)
    this.crewUI = new CrewUI(this, ui);

    this.cash = 120;
    this.wanted = 0;
    this.wantedT = 0;
    this.stats = { kills: 0, raiderKills: 0 };
    this.quests = {};
    // The guns on you (loadout), the rounds in each (mag), each one's condition (cond: 1 clean) and jams. ammo is a view
    // onto the rounds in your pockets once the inventory binds it (36 loose revolver rounds to start).
    this.inv = { weapons: ['pistol'], current: 'pistol', mag: { pistol: 6 }, cond: { pistol: 0.82 }, jam: {}, ammo: { pistol: 36, smg: 0, shells: 0, rifle: 0 }, throwables: { frag: 2, molotov: 2, smoke: 1, flash: 1, pipe: 0, sticky: 0, rock: 99 }, throwable: 'frag' };
    this.lastVehicle = null;
    this.skillsSys = new Skills(this); // strength, dexterity, endurance grown by doing; carried weight (g.skills)
    this.deep = new Stats(this); // the deep sheet: attributes, 36 skills, perks, traits, conditions, injuries, stress, reputation (g.deep.fx)
    this.soundscape = new Soundscape(this); // the sound sets heard: beds, the engine you drive, the fight's barks
    this.llmtalk = new LlmTalk(this); // strangers' small talk through the local model, grounded in the live world (offline: authored)
    this.charSheet = new CharSheet(this); // ` the character sheet
    this.radio = new Radio(this); // the stations: in a car or with a portable radio, , and . walk the dial
    this.inventory = new Inventory(this); // items in containers: what you carry, trunks, the dead, the ground (data/items.js)
    this.gear = new Gear(this); // the 19-slot paperdoll: armor that soaks, clothes and charms with mods (data/gear.js)
    this.roles = new Roles(this); // what the world calls you, earned by what you keep doing (data/roles.js, WEB_ROLES.md)
    this.invUI = new InventoryUI(this, ui); // the PACK screen (I / Tab)
    this.workshopUI = new WorkshopUI(this, ui); // the WORKSHOP screen (U at a garage, or Kenji)
    this.trade = new Trade(this); // a trader's own shelves are a counter while they're there (systems/trade.js)
    this.dogs = new Dogs(this); // strays in packs, and the one you feed until it is yours (data/dogs.js, WEB_DOGS.md)
    this.clone = new Clone(this);   // pressings, the husk where you fell, coming up in the brine (systems/clone.js)
    this.travel = new Travel(this); // poles, punches, the trundle on I-10, the iron, Five City Air (systems/travel.js)
    this.kit = new Kit(this); // what you wear and look through, and what feeds it (systems/kit.js, WEB_GADGETS2.md)
    this.gadgets = new Gadgets(this); // chains, mines, crawlers, lures, flares, charges, alarms, bells; g.drones and g.security (WEB_GADGETS.md)
    this.sealife = new Sealife(this); this.waterplace = new WaterPlace(this); this.diving = new Diving(this); this.swamp = new Swamp(this); // what lives in the water, places in it, how deep a breath goes (WEB_WATER_LIFE.md)
    this.fauna = new Fauna(this); // L5: regional animals by biome, hour and how much of man is about (data/fauna.js, WEB_FAUNA.md)
    this.pulls = new Pulls(this); // pulls and what you know of them (systems/pulls.js, systems/knowledge.js)
    this.migrations = new Migrations(this); // hordes that walk the highways, seen before they are reported (WEB_DEATHS.md)
    this.workforce = new Workforce(this); // the settlements' workers (systems/workforce.js)
    this.pullsUI = new PullsBoard(this, ui); // the PULLS chip and the board tab (ui/pullsboard.js)
    this.stories = new SiteStories(this); // site stories and the bounty guild (systems/sitestories.js)
    this.roadside = new RoadsideSys(this); // the roadside's tanks, hulks, water and keepers (systems/roadside.js; laid out by world/roadside.js)
    this.insideBuilding = null;
    this.paused = true;
    this.time = 0;
    this.respawnT = 0;
    this.camPos = new THREE.Vector3(0, 40, 0);
    this.camLook = new THREE.Vector3();
    this.camHeight = 34;
    this.cam = new CamRig(this);  // the boom, the views, the zoom (systems/camrig.js); g.zoomLevel = the nearest named stop
    this.cutaway = new Cutaway(this); // what stands between the camera and you fades (systems/cutaway.js)
    this.viewR = 30;             // radius of ground the camera shows (m): what 'out of sight' means right now
    this.aim = { x: 0, z: 0 };
    this.boxRing = { x: 0, z: 0, len: 1.6 }; // the highlight ring on a container in reach
    this.raiderTimer = 10;
    this.fps = 60;

    this.populate();
    this.inventory.placeFurniture(); // crates and shelves become containers; shopkeepers own theirs
    this.bases.placeBoxes();         // the base's ammo crates, footlockers and cabinets (data/bases.js boxes)
    this.buildPickups();
    this.buildFlashlight();
    this.streamer.warmup(); // the streamed world's shaders compile now (lights and fog are all in place), not mid-drive
    this.recorder = new Recorder(this); // the session ring the observer replays (agent/recorder.js, WEB_OBSERVER.md)
    this.regions.placeAtStart(); // ?start=florida (the players' default): a new game begins at Meridian's clinic door
    this.crew.seed(); // who you can meet: two in Rust Haven, one at Meridian, captives at a Dustwolf camp (data/crew.js CREW_SEEDS)
    this.api = new AgentAPI(this);
    this.title(ui);
    this.creator = new Creator(this); // point-buy survivors (data/creator.js, docs/design/WEB_CREATOR.md): the draft, the sheet, BEGIN
    this.creatorUI = new CreatorUI(this); // its screen, and MAKE A SURVIVOR on the title
  }

  // ---- population ----------------------------------------------------------------
  addChar(opts) {
    // Budget full: the Phoenix ring's residents yield first (written back to their records, systems/residents.js); they
    // never push anyone else out themselves (opts.res: no slot, no resident).
    if (!this.freeSlots.length && !opts.res) this.residents?.yieldSlot();
    if (!this.freeSlots.length && opts.res) return null;
    if (!this.freeSlots.length) {
      // Budget full: recycle the longest-dead corpse (blood decals stay), then the farthest idle drifter.
      const dead = this.chars.filter((c) => !c.alive && c !== this.player && !c.npc).sort((a, b) => b.deadTime - a.deadTime)[0];
      const far = dead ?? this.chars.filter((c) => c.alive && c.faction === 'drifter' && !c.npc && !c.inVehicle)
        .sort((a, b) => Math.hypot(b.x - this.player.x, b.z - this.player.z) - Math.hypot(a.x - this.player.x, a.z - this.player.z))[0];
      if (!far) return null;
      this.removeChar(far);
    }
    const slot = this.freeSlots.pop();
    if (!opts.colors) opts = { ...opts, colors: outfit(opts.faction ?? 'drifter') }; // nobody walks out unpainted (a pack or a script that forgot)
    const c = new Character(slot, opts);
    c.id = `c${++this.nextId}`;
    c.flag = opts.flag ?? 'US';
    const p = { x: c.x, z: c.z };
    this.statics.resolveCircle(p, 0.5);
    c.x = p.x; c.z = p.z;
    c.mag = c.weapon ? WEAPONS[c.weapon].mag : 0;
    this.society.factions.assign(c);
    this.chars.push(c);
    this.charR.paint(c);
    return c;
  }

  removeChar(c) {
    const i = this.chars.indexOf(c);
    // Someone already gone: their slot is free already (pushing it twice gave two people one slot and the cap 161).
    if (i < 0) { (this.doubleRemoves ??= []).push(new Error().stack?.split('\n').slice(2, 5).join(' <- ')); return; }
    if (!c.alive) this.rites?.fold(c); // the dead leave the world as their body's record (systems/rites.js), never as nothing
    this.chars.splice(i, 1);
    this.charR.clear(c.slot);
    this.freeSlots.push(c.slot);
  }

  randomFlag(rng) {
    // Most people out here are American, but everybody's from somewhere.
    const r = rng();
    if (r < 0.4) return 'US';
    if (r < 0.55) return 'MX';
    return FLAG_KEYS[Math.floor(rng() * FLAG_KEYS.length)];
  }

  populate() {
    const rng = makeRng(42);
    const S = this.world.spawns;
    this.player = this.addChar({ x: -16, z: -16, faction: 'player', weapon: 'pistol', hp: 100, colors: outfit('player', rng), name: 'You', flag: 'US' });
    this.player.face = Math.PI;

    // Named characters.
    for (const n of NPCS) {
      let x, z;
      if (n.where === 'gate') {
        const gate = S.wardens.reduce((b, w) => (Math.hypot(w.x, w.z + TOWN) < Math.hypot(b.x, b.z + TOWN) ? w : b));
        x = gate.x + 2; z = gate.z + 3;
      } else if (typeof n.where === 'string') {
        const b = S.shops[Number(n.where.split(':')[1]) % S.shops.length];
        // Their post: the front room's open floor (world/city.js b.post), not the middle of the building (a closet now).
        x = b.post?.x ?? (b.minX + b.maxX) / 2 + 1.5; z = b.post?.z ?? (b.minZ + b.maxZ) / 2 + 1.5;
        b.shopName = n.title;
      } else { x = n.where.x; z = n.where.z; }
      // The body wears what the portrait shows: same hair or hat, same goggles, mask, eyepatch, bandolier.
      const p = n.portrait;
      this.addChar({ x, z, faction: n.faction, weapon: n.weapon ?? null, npc: n, name: n.name, flag: n.flag, hp: 140,
        colors: { skin: p.skin, hair: p.hair, shirt: p.shirt ?? '#5a4a38', pants: '#2f2a24', boots: '#2b241e', hat: '#5a3f24',
          hatStyle: ['cowboy', 'cap', 'mohawk', 'wrap', 'long', 'bald'].includes(p.hat) ? p.hat : 'short',
          gearStyle: p.gear === 'bandolier' ? 'bandolier' : n.faction === 'warden' ? 'vest' : 'none', gear: '#3a3128',
          accStyle: { goggles: 'goggles', bandana: 'mask', eyepatch: 'eyepatch' }[p.gear] ?? 'none', mask: '#6a2a1e', sleeves: 'long' } });
    }
    for (const w of S.wardens) { const c = this.addChar({ x: w.x, z: w.z, faction: 'warden', weapon: 'smg', hp: 130, colors: outfit('warden', rng), name: randomName(rng), flag: this.randomFlag(rng) }); if (c) c.amb = true; }
    for (const d of S.drifters) {
      for (let k = 0; k < (Math.max(Math.abs(d.x), Math.abs(d.z)) < TOWN ? 2 : 1); k++)
        { const c = this.addChar({ x: d.x + rng.range(-3, 3), z: d.z + rng.range(-3, 3), faction: 'drifter', weapon: rng.chance(0.15) ? 'pistol' : null, colors: outfit('drifter', rng), name: randomName(rng), flag: this.randomFlag(rng) }); if (c) c.amb = true; } // amb: may fold far away (systems/population.js)
    }
    for (const r of S.raiders) { const c = this.spawnRaider(r.x, r.z, rng); if (c) c.amb = true; }

    // Vehicles: the War Rig (harpoon) and an Interceptor wait in town.
    this.vehiclesSys.spawn('rig', 3.5, -30, Math.PI, '#7a3a1c');
    this.vehiclesSys.spawn('interceptor', -3.5, -48, 0, '#4a3a2a'); // faded brown, never the black ex-cop car
    this.vehiclesSys.spawn('pickup', 30, 3.5, -Math.PI / 2, '#56603f');
    this.vehiclesSys.spawn('atv', 36.5, 3.5, -Math.PI / 2, '#8a5a2a'); // a four-wheeler for the flats
    // Traffic on the grid.
    const paints = ['#8a6a2a', '#3f5a62', '#6a2a1a', '#4a4a48', '#7a5a3a', '#2f4a3a', '#c9a24a', '#6a4a2a'];
    for (let i = 0; i < 9; i++) {
      const a = 1 + Math.floor(rng() * 7), b = 1 + Math.floor(rng() * 7);
      const horizontal = rng.chance(0.5);
      const x = horizontal ? roadLines[a] + 30 : roadLines[a] - 3.5, z = horizontal ? roadLines[b] + 3.5 : roadLines[b] + 30;
      const v = this.vehiclesSys.spawn(rng.pick(['interceptor', 'pickup', 'buggy']), x, z, horizontal ? Math.PI / 2 : Math.PI, rng.pick(paints), { ai: 'traffic' });
      const d = this.addChar({ x, z, faction: 'drifter', colors: outfit('drifter', rng), name: randomName(rng), flag: this.randomFlag(rng) });
      if (d) this.seats.board(d, v, 0);
    }
    // Watercraft: an airboat and a waterbike tied up at the lake dock; a raider gunboat patrols.
    this.vehiclesSys.spawn('airboat', DOCK.x + 8, DOCK.z + 5, Math.PI / 2, '#5a6a48');
    this.vehiclesSys.spawn('jetski', DOCK.x + 14, DOCK.z - 5, Math.PI / 2, '#b0301e');
    const gb = this.vehiclesSys.spawn('gunboat', LAKE.x + 20, LAKE.z, 0, '#3a3632', { ai: 'boatPatrol' });
    for (let k = 0; k < 2; k++) { const r = this.spawnRaider(gb.x, gb.z, rng, 'smg'); if (r) this.seats.board(r, gb, k); }
    // Dustwolf buggies at the camps.
    for (const camp of S.camps) {
      const v = this.vehiclesSys.spawn('buggy', camp.x + 22, camp.z - 4, rng() * 6, '#4a2018', { ai: 'raider' });
      const d = this.spawnRaider(camp.x + 22, camp.z - 4, rng, 'smg');
      if (d) this.seats.board(d, v, 0);
    }
    // Last, from their own seed (so nobody above moves): the base's sentries, patrols and motor pool.
    this.bases.populate();
  }

  spawnRaider(x, z, rng = Math.random, weapon) {
    const wpn = weapon ?? (rng() < 0.5 ? 'smg' : rng() < 0.6 ? 'pistol' : 'shotgun');
    const names = ['Dustwolf', 'Dustwolf Grunt', 'Dustwolf Cutter', 'Dustwolf Scav'];
    const r = this.addChar({ x, z, faction: 'raider', weapon: wpn, hp: 90, colors: outfit('raider', typeof rng === 'function' ? rng : Math.random), name: names[Math.floor(Math.random() * names.length)], flag: Math.random() < 0.6 ? 'US' : FLAG_KEYS[Math.floor(Math.random() * FLAG_KEYS.length)] });
    if (r) r.grenades = Math.random() < 0.35 ? 1 : 0;
    return r;
  }

  // ---- pickups --------------------------------------------------------------------
  buildPickups() {
    const rng = makeRng(9);
    this.pickups = this.world.spawns.loot.map((l) => {
      const r = rng();
      const type = r < 0.32 ? 'ammo' : r < 0.52 ? 'med' : r < 0.7 ? 'cash' : r < 0.88 ? 'water' : 'food';
      return { x: l.x, z: l.z, type, alive: true };
    });
    this.pickupMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: '#222' }), 300);
    this.pickupMesh.frustumCulled = false;
    this.pickupMesh.castShadow = true;
    for (let i = 0; i < 300; i++) { this.pickupMesh.setMatrixAt(i, ZERO); this.pickupMesh.setColorAt(i, new THREE.Color('#fff')); }
    this.scene.add(this.pickupMesh);
    this.pickupsDirty = true;
  }

  dropPickup(x, z, type) {
    if (this.pickups.length > 290) this.pickups.shift();
    this.pickups.push({ x, z, type, alive: true });
    this.pickupsDirty = true;
  }

  updatePickups(dt) {
    const p = this.player;
    const col = { ammo: '#d4a23a', med: '#d83a2a', cash: '#6fb36a', water: '#5b8fa8', food: '#b07a3a' };
    let n = 0;
    for (const it of this.pickups) {
      if (!it.alive) continue;
      if (p.alive && !p.inVehicle && Math.abs(it.x - p.x) < 1.3 && Math.abs(it.z - p.z) < 1.3) {
        it.alive = false;
        this.audio.pickup();
        let text;
        if (it.type === 'ammo') { const A = this.inv.ammo, W = new Set(this.inv.weapons.map((k) => WEAPONS[k]?.ammo)); A.pistol += 12; if (W.has('smg')) A.smg += 32; if (W.has('shells')) A.shells += 4; if (W.has('rifle')) A.rifle += 10; text = '+ AMMO'; } // by the rounds your guns eat
        else if (it.type === 'med' || it.type === 'water' || it.type === 'food') text = this.pickItem(it.type, it.x, it.z);
        else { const c = it.amount ?? 10 + Math.floor(Math.random() * 30); this.cash += c; text = `+$${c}`; } // amount: a purse that spilled (systems/pulls.js)
        this.emit('pickup', { kind: it.type, x: +it.x.toFixed(1), z: +it.z.toFixed(1), text }); // floating text says it; no toast spam
        continue;
      }
      if (Math.abs(it.x - p.x) > 70 || Math.abs(it.z - p.z) > 70) continue;
      _o.position.set(it.x, 0.5 + Math.sin(this.time * 3 + it.x) * 0.15, it.z);
      _o.rotation.set(0, this.time * 1.5 + it.z, 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
      this.pickupMesh.setMatrixAt(n, _o.matrix);
      this.pickupMesh.setColorAt(n, _col.set(col[it.type]));
      n++;
      if (n >= 300) break;
    }
    this.pickupMesh.count = n;
    this.pickupMesh.instanceMatrix.needsUpdate = true;
    if (this.pickupMesh.instanceColor) this.pickupMesh.instanceColor.needsUpdate = true;
  }

  buildFlashlight() {
    const g = new THREE.PlaneGeometry(7, 15); g.rotateX(-Math.PI / 2); g.translate(0, 0.15, 8);
    this.flashMat = new THREE.MeshBasicMaterial({ map: coneTexture(), color: '#fff3d6', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    this.flashlight = new THREE.Mesh(g, this.flashMat);
    this.flashlight.renderOrder = 3;
    this.scene.add(this.flashlight);
  }

  // ---- game rules -------------------------------------------------------------------
  give({ cash = 0, ammo = {} }) {
    this.cash += cash;
    for (const k in ammo) this.inv.ammo[k] += ammo[k];
    if (cash) this.hud.toast(`+ $${cash}`, 'job');
  }
  spend(n) {
    if (this.cash < n) { this.hud.toast('NOT ENOUGH CASH', 'warn'); return false; }
    this.cash -= n;
    return true;
  }
  // Sight line that respects walls AND smoke.
  los(ax, az, bx, bz) { return this.statics.lineOfSight(ax, az, bx, bz) && !this.throwables.blocksSight(ax, az, bx, bz); }
  // The same at a floor's height (world/storeys.js): y = the floor (0 on the street, where it is exactly los()).
  losAt(ax, az, bx, bz, y = 0) {
    if (y < 0.5 && y > -0.5) return this.los(ax, az, bx, bz);
    return this.statics.lineOfSight(ax, az, bx, bz, RAY_SIGHT, y + LEVEL.eye) && !this.throwables.blocksSight(ax, az, bx, bz);
  }
  // Can person a see person b: on their floor, and nothing in the way at its height. Outside the storeyed buildings,
  // exactly the old flat line of sight.
  // THE FOOTING line on the HUD prompt while you ride an open deck (WEB_DECKS_STANCE.md §3.3): the band (SURE FOOTING ..
  // GOING OVER), your stance and its footing multiplier (QUICKNESS x brace), and how to brace harder.
  footingText(p) {
    const H = this.decks.hud, d = p.onDeck;
    if (!d?.D.open || !H.show || H.v !== d.v) return null;
    const st = this.stance.kind(p), hot = H.share >= 0.8;
    return `<b${hot ? ' class="warn"' : ''}>FOOTING · ${H.word}</b> ${st.toUpperCase()} ×${H.footing.toFixed(2)}${p.prone ? '' : st === 'crouch' ? ' · <kbd>ALT</kbd> prone' : ' · <kbd>CTRL</kbd> brace · <kbd>ALT</kbd> prone'}`;
  }

  sees(a, b) {
    if (!this.storeys.sameFloor(a, b)) return false;
    return this.losAt(a.x, a.z, b.x, b.z, a.ug ? Math.min(a.gy ?? 0, b.gy ?? 0) - (this.under?.y0 ?? 0) : a.storey || b.storey ? Math.min(a.gy ?? 0, b.gy ?? 0) : 0); // below the street: that level's walls (over its street: a town's pad for its drains)
  }

  // Throw the selected throwable at the aim point (cooked = seconds already held).
  throwSelected(cooked = 0) {
    const k = this.inv.throwable, n = this.inv.throwables[k] ?? 0;
    if (this.player.ug) { this.hud.toast('NO ROOM TO LOB ONE DOWN HERE · SET IT ON A DOOR (HOLD E)', 'warn'); return null; } // v1: throws are the street's (WEB_UNDERGROUND §5)
    if (n <= 0) { this.hud.toast(`No ${THROWABLES[k].name.toLowerCase()} left`, 'warn'); return null; }
    this.inv.throwables[k] = n - 1;
    return this.throwables.throw(this.player, k, this.aim.x, this.aim.z, THROWABLES[k].cook ? cooked : 0);
  }

  noise(x, z, r, src) { if (this.under?.noise(x, z, r, src)) return; this.citygen?.onNoise(x, z, r); if (src === this.player && this.deep) r *= this.deep.fx.noiseMul; this.ai.onNoise(x, z, r, src); this.zombies?.onNoise(x, z, r * 2); this.bases?.onNoise(x, z, r, src); this.milbases?.onNoise(x, z, r, src); this.survival?.heard(x, z, r); this.dogs?.onNoise(x, z, r, src); this.fauna?.onNoise(x, z, r, src); this.sealife?.onNoise(x, z, r, src); }
  // N: sleep in the seat of a parked car, in the bed you stand at, or on the bedroll you carry (survival.js).
  trySleep() {
    const p = this.player, S = this.survival;
    let r;
    if (p.inVehicle) r = S.sleepAt('car');
    else {
      const bed = this.bedNear(p.x, p.z);
      r = bed ? S.sleepAt('bed', bed) : this.inventory.carried.count('bedroll') ? S.sleepAt('bedroll') : { ok: false, why: 'nowhere to sleep: a bed, a bedroll or a parked car' };
    }
    if (!r.ok) this.hud.toast(r.why.toUpperCase(), 'warn');
    return r;
  }
  // Where a person stands - the floor or stair under them (world/storeys.js), a ramp, a dune, a bridge deck - and whether
  // that is inside a storeyed building. Kept by the sim (here and ai.move), so someone off screen climbs stairs too;
  // characters.js only draws it. A sentry on a tower deck keeps the deck.
  standOn(c) {
    if (c.perchY) { c.gy = c.perchY; return; }
    c.gy = this.stunts.heightAt(c.x, c.z, c.gy ?? 0);
    c.storey = this.storeys.at(c.x, c.z);
    c.ug = this.under?.siteOf(c) ?? null; // below the street: which site's level (systems/underground.js)
  }

  // The bed (a mattress in a house; world/city.js spawns.beds) within reach of (x, z), or null.
  bedNear(x, z, y = 0) {
    let best = null, bd = 1.8;
    for (const b of this.world.spawns.beds ?? NO_BEDS) { if (Math.abs((b.y ?? 0) - y) > LEVEL.same) continue; const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    return best ?? this.decks.bedNear(x, z, y); // or the bunk in a van or an RV you stand in (systems/decks.js)
  }
  // Foot path that also routes around vehicles near the walker (they're dynamic, not in the grid).
  footPath(sx, sz, tx, tz) {
    const discs = [];
    for (const v of this.vehicles) {
      if (v.driver === this.player) continue;
      if (Math.abs(v.x - sx) > 90 && Math.abs(v.x - tx) > 90) continue;
      if (Math.abs(v.z - sz) > 90 && Math.abs(v.z - tz) > 90) continue;
      // Approximate the car by discs along its length.
      const n = Math.max(2, Math.round(v.len / v.wid));
      for (let k = 0; k < n; k++) { const o = (k / (n - 1) - 0.5) * (v.len - v.wid); discs.push({ x: v.x + Math.sin(v.h) * o, z: v.z + Math.cos(v.h) * o, r: v.wid * 0.55 }); }
    }
    // Prefer a route around cars; if a car is sealing a doorway, fall back to the static route. (The nav window is set
    // first: it holds still while the cars are stamped into it.)
    if (!this.nav.foot.ensureCovers(sx, sz, tx, tz)) return null;
    return this.nav.foot.withObstacles(discs, () => this.nav.foot.find(sx, sz, tx, tz)) ?? this.nav.foot.find(sx, sz, tx, tz);
  }

  // Stereo position of a world x relative to the camera centre (-1..1).
  pan(x) { return Math.max(-1, Math.min(1, (x - this.camLook.x) / 28)); }
  raiseWanted(n) {
    const before = this.wanted;
    this.wanted = Math.min(5, this.wanted + n);
    this.wantedT = 0;
    const slack = this.roles?.offices.deputy ? 1 : 0; // a sworn deputy's star of slack (roles.js)
    if (before <= slack && this.wanted > slack) this.hud.toast('RUST HAVEN WARDENS ARE HUNTING YOU', 'hot');
    else if (before === 0 && this.wanted > 0) this.hud.toast('ONE STAR: THE BULLS GIVE THEIR DEPUTY THAT ONE', 'warn');
  }

  // Runtime errors are collected (not swallowed): DL.perf / status / selftest surface them.
  // NaN sentinel: a non-finite number poisons everything it touches (camera, AI, physics), and it
  // spreads: a NaN facing becomes a NaN dive, a NaN heading a NaN position, and whatever reads a
  // poisoned position (vultures, tumbleweeds) latches on for good. frame() runs this after EVERY
  // system that moves entities, so nothing downstream reads a NaN and the report names the culprit.
  // (The bug it caught: restore() rebuilt zombies without zSpeed, they walked at NaN m/s, and crowd
  // separation spread the NaN to whoever stood next to them, the player included: NaN * 0 is NaN.)
  nanGuard(phase = '') {
    for (let i = 0; i < this.chars.length; i++) this.nanFix(this.chars[i], false, phase);
    for (let i = 0; i < this.vehicles.length; i++) this.nanFix(this.vehicles[i], true, phase);
    const drop = this.nanDrop;
    if (drop?.length) { for (const o of drop) if (o.anchors) this.vehiclesSys.remove(o); else this.removeChar(o); drop.length = 0; }
    // The aim point steers facing, dives and throws: a NaN there starts the whole chain.
    const a = this.aim;
    if (a && !(Number.isFinite(a.x) && Number.isFinite(a.z))) { a.x = this.player.x; a.z = this.player.z + 1; }
  }

  nanFix(o, veh, phase) {
    const posOk = Number.isFinite(o.x) && Number.isFinite(o.z);
    const motionOk = veh ? Number.isFinite((o.vx ?? 0) + (o.vz ?? 0) + (o.h ?? 0) + (o.av ?? 0)) : o.face == null || Number.isFinite(o.face);
    if (posOk && motionOk) { o._gx = o.x; o._gz = o.z; return; }
    const ctx = veh ? `vx=${o.vx} vz=${o.vz} h=${o.h} av=${o.av} driver=${o.driver?.id}` : `face=${o.face} inVehicle=${o.inVehicle?.id} onTrain=${!!o.onTrain} grabbing=${!!o.grabbing} dive=${o.dive} leap=${o.leapT} swim=${!!o.swim}`;
    this.reportError(new Error(`NaN ${posOk ? 'motion' : 'position'} on ${o.id} (${o.type ?? o.faction}) after '${phase}' ${ctx}`));
    if (!posOk) {
      // Never had a good position (broken on its first frame): remove it rather than teleport it to 0,0.
      if (o._gx === undefined && o !== this.player) { (this.nanDrop ??= []).push(o); return; }
      o.x = o._gx ?? 0; o.z = o._gz ?? 0;
    }
    if (veh) {
      if (!Number.isFinite((o.vx ?? 0) + (o.vz ?? 0) + (o.av ?? 0))) { o.vx = 0; o.vz = 0; o.av = 0; }
      if (!Number.isFinite(o.h ?? 0)) o.h = 0;
    } else if (o.face != null && !Number.isFinite(o.face)) o.face = 0;
    o._gx = o.x; o._gz = o.z;
  }

  reportError(e) {
    const msg = String(e?.stack ?? e).split(String.fromCharCode(10)).slice(0, 3).join(' | ');
    this.errors ??= [];
    const fresh = !this.errors.some((x) => x.msg === msg);
    if (this.errors.length < 50 && fresh) this.errors.push({ t: +this.time.toFixed(2), msg });
    // Surface loop exceptions to `dl status` too (once per distinct error), not just the console.
    if (fresh) try { fetch('/agent/client-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'runtime', message: msg.slice(0, 500), at: Date.now() }) }); } catch { /* offline build */ }
    this.emit('error', { msg });
    console.error('[dsoa]', e);
    this.input.endFrame();
  }

  // Structured event log for agents (DL.events). Ring buffer, never grows unbounded.
  emit(type, data = {}) {
    // The event's own seq/t/type come last: a payload key of the same name must never overwrite them.
    this.events.push({ ...data, seq: ++this.eventSeq, t: +this.time.toFixed(2), type });
    if (this.events.length > 500) this.events.shift();
  }

  onKill(c, attacker, cause = 'bullet') {
    this.emit('kill', { victim: c.id, victimName: c.npc?.name ?? c.name, faction: c.faction, by: attacker?.id ?? null, downed: c.downedT > 0, cause });
    this.society.deeds.onKill(c, attacker, cause); // witnesses and rumors; wanted stars only on a lawful witness's word
    this.crew?.onKill(c, attacker); // a fight won outnumbered moves the crew's trust

    if (attacker === this.player) {
      this.stats.kills++;
      if (c.faction === 'raider') {
        this.stats.raiderKills++;
        if (this.quests.bounty === 'active') {
          const k = this.stats.raiderKills - this.quests.bountyStart;
          this.hud.toast(k >= 6 ? 'BOUNTY COMPLETE — return to Sheriff Okonkwo' : `Dustwolf Bounty ${k}/6`, 'job');
        }
      }
    }
    if (c.faction === 'raider' && Math.random() < 0.45) this.dropPickup(c.x + 0.8, c.z, 'cash'); // the pocket money spills
    // The dead carry what they carried: a body is a container you can go through (I, standing over it), the gun they
    // held and its spare rounds in it (a soldier's rifle is the prize).
    if (c !== this.player && c.faction !== 'zombie' && !c.npc) {
      const body = this.inventory.place(`body:${c.id}`, c.fauna ? c.faunaKind : c.faction === 'raider' ? 'raider' : c.faction === 'soldier' ? 'soldier' : 'person', c.x, c.z, 20, `${(c.name ?? 'SOMEBODY').toUpperCase()} (DEAD)`); // an animal: its own LOOT row (data/items.js)
      if (((c.gy ?? 0) > 0.5 && c.storey) || c.ug) body.y = c.gy; // the dead lie on their own floor (or their level below)
      this.inventory.armBody(body, c);
    }
    this.pulls?.onKill(c, attacker); // a pull's person: their body holds what they carried; a bounty's tally
    this.stories?.onKill(c, attacker); // a party's person, a fallen place's master, a hunter (systems/sitestories.js)
    if (c === this.player) { this.respawnT = 4; if (this.player.inVehicle) this.exitVehicle(true); this.clone.onDeath(c); } // the husk lies where you fell
    if (c.res) this.residents.onKill(c, attacker); // a ring resident: the death goes on their household's record
    this.rites?.onDeath(c, attacker, cause); // the body's record: it rots on the clock until buried, burned or dragged off
  }

  // A pickup box is a find: it goes in your pack (or, with no room, you use it on the spot - drink the water, eat
  // the food, wrap the cut). Returns the floating text.
  pickItem(kind, x, z) {
    const r = Math.random();
    const id = kind === 'water' ? (r < 0.8 ? 'water_bottle' : 'canteen')
      : kind === 'med' ? (r < 0.55 ? 'bandage' : r < 0.75 ? 'painkillers' : r < 0.92 ? 'suture_kit' : 'first_aid')
      : r < 0.35 ? 'beans_tin' : r < 0.55 ? 'jerky' : r < 0.7 ? 'peaches_tin' : r < 0.82 ? 'ration' : r < 0.92 ? 'honey' : 'cactus_fruit';
    const inv = this.inventory, it = ITEMS[id];
    const state = it.uses ? { left: Math.max(1, Math.ceil(it.uses * (0.5 + Math.random() * 0.5))) } : {};
    if (inv.add(inv.carried, id, 1, state)) { inv.changed(); this.emit('itemFound', { item: id, x: +x.toFixed(1), z: +z.toFixed(1) }); return `+ ${it.name.toUpperCase()}`; }
    inv.add(inv.groundAt(x, z), id, 1, state); inv.changed(); // no room: it stays where it lay
    return `${it.name.toUpperCase()} · NO ROOM`;
  }

  // V: patch up, drink or eat - whatever you need most - from what you carry.
  quickUse() {
    const p = this.player, N = this.needs, inv = this.inventory;
    const want = (p.bleed > 0.25 || p.hp < p.maxHp * 0.45) ? ['med', 'water', 'food']
      : N.water < N.food && N.water < 0.75 ? ['water', 'food', 'med'] : N.food < 0.75 ? ['food', 'water', 'med'] : p.hp < p.maxHp * 0.85 ? ['med'] : [];
    for (const kind of want) {
      const i = inv.best(kind);
      if (i < 0) continue;
      const r = inv.use(i);
      if (r.ok) { this.emit('pickup', { kind, x: +p.x.toFixed(1), z: +p.z.toFixed(1), text: r.text }); return r; }
    }
    this.hud.toast(want.length ? `NOTHING TO ${want[0] === 'med' ? 'PATCH YOU UP' : want[0] === 'water' ? 'DRINK' : 'EAT'}` : 'NOTHING YOU NEED RIGHT NOW', 'warn');
    return null;
  }

  // seat: 0 = take the wheel (carjacks a non-ally driver); 'passenger' = ride along.
  enterVehicle(v, seat = 0) {
    this.emit('enterVehicle', { vehicle: v.id, vehicleType: v.type, seat });
    const p = this.player;
    if (v.fallen) { v.fallen = false; v.lean = 0; } // pick the bike back up
    if (seat === 'passenger') {
      const s = this.seats.freeSeat(v, { passengerOnly: true });
      if (s < 0) { this.hud.toast('No free seat', 'warn'); return false; }
      this.seats.board(p, v, s);
      this.lastVehicle = v;
      this.hud.toast(v.driver ? `Riding with ${v.driver.name ?? 'the driver'} — [C] change seat` : `${v.seats[s].id} seat — [C] change seat`, 'job');
      return true;
    }
    const d = v.occ?.[0];
    if (d && d !== p && d.alive) {
      if (d.faction === 'ally') { this.seats.leave(d, true); this.seats.board(d, v, this.seats.freeSeat(v, { passengerOnly: true })); }
      else {
        this.seats.leave(d);
        this.society.deeds.record('carjack', { target: d, stars: d.faction !== 'raider' ? 1 : 0 });
        // A known wheelman's reputation does the talking: the driver runs instead of fighting (roles.js perk).
        if (this.roles.perk.carjackFlee && !d.npc) { d.flee = 6; d.fleeX = p.x; d.fleeZ = p.z; d.target = null; }
        else this.ai.onDamaged(d, p, true);
        this.hud.toast(`CARJACKED: ${v.name}`, 'hot');
      }
    }
    this.seats.board(p, v, 0); v.ai = null;
    this.lastVehicle = v;
    if (v.harpoon) this.hud.subtitle('WHALER: aim with the mouse, [H] fires the harpoon — [H] again to YANK.', 6);
  }

  exitVehicle(forced = false) {
    const p = this.player, v = p.inVehicle;
    if (!v) return;
    this.emit('exitVehicle', { vehicle: v.id, forced });
    this.seats.leave(p, true, !forced); // a van's or an RV's cab: up from the wheel onto its deck (systems/decks.js)
    if (v.ai === 'chauffeur' && p.onDeck?.v !== v) { v.ai = null; v.throttle = 0; } // allies park when you get out
    this.vehiclesSys.releaseHarpoon();
    const sp = this.vehiclesSys.speed(v);
    if (!forced && sp > 10 && !p.onDeck) { this.combat.damage(p, sp * 1.2, null, 0, 0); this.hud.toast('BAILED OUT', 'warn'); }
  }

  // Walking through a blood pool leaves a trail of bloody footprints for a few steps.
  updateFootprints() {
    for (const c of this.chars) {
      if (!c.alive || c.inVehicle || c.speed < 0.8) continue;
      if (Math.abs(c.x - this.player.x) > 60 || Math.abs(c.z - this.player.z) > 60) continue;
      if (this.fx.inPool(c.x, c.z)) c.bloodySteps = 10;
      const step = Math.floor(c.walk / Math.PI);
      if (step !== c.lastStep) {
        c.lastStep = step;
        if (c.bloodySteps > 0) {
          c.bloodySteps--;
          const side = step % 2 ? 0.14 : -0.14;
          const fx = Math.cos(c.face) * side, fz = -Math.sin(c.face) * side;
          this.fx.footprint(c.x + fx, c.z + fz, c.face, Math.min(1, c.bloodySteps / 6 + 0.25));
        }
      }
    }
  }

  // ---- player ---------------------------------------------------------------------------
  updatePlayer(dt) {
    const p = this.player, I = this.input;
    this.qol.highlight(null);
    if (!p.alive) {
      this.respawnT -= dt;
      // Coming up in the brine (systems/clone.js): your pressing's vat, its skills, nothing on you, brine-sick; no pressing:
      // you die flat. Whoever was after you lets it go, and you get RESPAWN_GRACE s on your feet before anything can hurt
      // you (a review found the player killed twice at the clinic door inside 21 s by the raider who killed them).
      if (this.respawnT <= 0 && !this.clone.flat) {
        this.clone.wake();
        if (p.alive && !this.travel.away) p.graceT = RESPAWN_GRACE;
      }
      return;
    }
    if (p.graceT > 0) p.graceT -= dt;
    // Mouse -> ground.
    _ndc.set(I.mouse.nx, I.mouse.ny);
    _ray.setFromCamera(_ndc, this.camera);
    _plane.constant = -((p.gy ?? 0) + 1.2); // upstairs, the cursor meets your floor (a tilted camera shows the offset)
    if (this.aimOverride) { this.aim.x = this.aimOverride.x; this.aim.z = this.aimOverride.z; }
    else if (_ray.ray.intersectPlane(_plane, _hit)) { this.aim.x = _hit.x; this.aim.z = _hit.z; }
    if (this.aimOverride) this.aim.y = this.aimOverride.y ?? 0; else this.fauna?.skyAim(_ray.ray, this.aim); // a bird under the cursor: aim at it, at its height (systems/fauna.js)
    if (!this.aimOverride) this.controls.aimAt(p, dt, p.inVehicle ?? p); // the pad in hand: the right stick aims
    // Something on the wing under the cursor (the wilds lane's hook: fauna.pickAir(ray) -> { x, z, y } or null): aim at it.
    this.aimAir = this.aimOverride ? null : this.fauna?.pickAir?.(_ray.ray) ?? null;
    if (this.aimAir) { this.aim.x = this.aimAir.x; this.aim.z = this.aimAir.z; }
    p.aimD = Math.hypot(this.aim.x - (p.inVehicle ?? p).x, this.aim.z - (p.inVehicle ?? p).z); // the gun at the side toes in to it (characters.js)

    if (this.dialogue.active) { p.speed = 0; return; }
    // Asleep: the night runs x40 and you lie still; E gets you up (survival.js wakes you for danger).
    if (this.survival.sleep) {
      p.speed = 0;
      const sv = p.inVehicle;
      if (sv?.driver === p) { sv.throttle = 0; sv.steer = 0; sv.handbrake = true; sv.boost = false; } // asleep in the seat: parked
      this.hud.prompt(null); // the sleep screen says how to get up
      if (I.hit('KeyE')) this.survival.wake();
      return;
    }
    // Dead on your feet: a microsleep takes the hands for a second or two (a car coasts on, unsteered).
    if (this.needs.blackout > 0) {
      const mv = p.inVehicle;
      if (mv?.driver === p) { mv.throttle = 0; mv.steer = 0; mv.handbrake = false; mv.boost = false; } else p.speed = 0;
      return;
    }
    // Rummaging in your pack: you stand still (a car coasts), and the keys work the PACK screen.
    if (this.workshopUI.open) { p.speed = 0; if (p.inVehicle?.driver === p) { p.inVehicle.throttle = 0; p.inVehicle.steer = 0; } this.workshopUI.input(I); return; }
    if (I.hit('KeyU') && this.workshop.siteAt(p.x, p.z)) { this.workshopUI.toggle(true); return; } // at a garage U is the workshop; anywhere else it is the crew (ui/crew.js)
    if (this.invUI.open) { p.speed = 0; if (p.inVehicle?.driver === p) { p.inVehicle.throttle = 0; p.inVehicle.steer = 0; } this.invUI.input(I); return; }
    if (I.hit('KeyI') || I.hit('Tab')) { this.invUI.toggle(true); return; }
    // Flying a drone (systems/drones.js): the keys fly it, your body stays put (a car you sit in is held parked).
    if (this.drones?.piloting) { p.speed = 0; const dv = p.inVehicle; if (dv?.driver === p) { dv.throttle = 0; dv.steer = 0; dv.handbrake = true; } this.drones.input(I); return; }
    if (I.hit('KeyN')) { if (!this.travel.napRide()) this.trySleep(); return; } // on the trundle with a punch: sleep through the trip
    if (I.hit('KeyV')) this.quickUse();

    const v = p.inVehicle;
    if (v) {
      p.x = v.x; p.z = v.z;
      const driving = v.driver === p;
      if (driving) {
        v.throttle = (I.key('KeyW') || I.key('ArrowUp') ? 1 : 0) - (I.key('KeyS') || I.key('ArrowDown') ? 1 : 0);
        v.handbrake = I.key('Space');
        v.boost = I.key('ShiftLeft') || I.key('ShiftRight');
        const pd = this.controls.drive; // the pad: RT gas, LT brake, the left stick steers (analog)
        if (pd.throttle) v.throttle = clamp(v.throttle + pd.throttle, -1, 1);
        // Keys and stick together, through one left-is-left rule (the pause menu's Steering setting: screen-left, or the car's own).
        const sIn = clamp((I.key('KeyA') || I.key('ArrowLeft') ? 1 : 0) - (I.key('KeyD') || I.key('ArrowRight') ? 1 : 0) + pd.steer, -1, 1);
        v.steer = this.vehiclesSys.screenSteer(v, sIn);
      }
      if (I.hit('KeyC')) this.seats.cycle(p);
      this.updateThrowAim(dt, I);
      if (this.driveOverride) {
        // Agent-issued drive controls win over the keyboard until they expire. Boost too: the keyboard
        // read above used to reset it every frame, so an agent could never wheelie a bike.
        const o = this.driveOverride;
        v.throttle = o.throttle ?? 0; v.steer = o.steer ?? 0; v.handbrake = !!o.handbrake; v.boost = !!o.boost;
        if (o.until !== undefined && this.time >= o.until) this.driveOverride = null;
      }
      if (this.train.canBoard(p)) {
        this.hud.prompt('<kbd>G</kbd> Jump onto the train');
        if (I.hit('KeyG')) { this.exitVehicle(true); this.train.board(p); this.hud.prompt(null); return; }
      }
      if (I.hit('KeyF') || I.hit('Enter')) { if (!this.travel.cord()) this.exitVehicle(); return; } // aboard a moving coach (or a lift): pull the cord (systems/travel.js)
      if (I.hit('KeyH') && v.harpoon && driving) this.vehiclesSys.fireHarpoon(v, Math.atan2(this.aim.x - v.x, this.aim.z - v.z));
      if (I.hit('KeyE') && !v.harpoon) { this.audio.horn(0); this.ambient.honk(v); }
      if (I.hit('KeyB') && driving) this.garage.drop(v); // the tail: oil, caltrops, smoke, mines, flares, paint (group 2)
      if (v.mounts && this.controls.held('fireTurret') && this.seats.turretFor(p, v)) this.workshop.fireMount(v, 3, Math.atan2(this.aim.x - v.x, this.aim.z - v.z), p); // the roof turret (group 3): the driver's, or a passenger's who mans it (seats.turretFor)
      else if (!driving && v.mounts?.top && !this.seats.turretOwner(v)) this.hud.prompt('<kbd>RMB</kbd> Man the roof turret');
      // Drive-by.
      this.handleShooting(dt, Math.atan2(this.aim.x - v.x, this.aim.z - v.z));
      p.aiming = this.arms.stance === 'raised'; // a rider (bike saddle, truck bed) shows the gun up only when it is
      return;
    }

    // Riding the freight: walk the roofs (W/S), aim and shoot, G jumps off.
    if (p.onTrain) {
      p.face = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);
      p.aiming = true;
      const walk = ((I.key('KeyS') || I.key('ArrowDown') ? 1 : 0) - (I.key('KeyW') || I.key('ArrowUp') ? 1 : 0)) * 4.2;
      p.onTrain.off += walk * dt; p.speed = Math.abs(walk);
      this.hud.prompt(`<kbd>W</kbd>/<kbd>S</kbd> Walk the roofs · <kbd>G</kbd> Jump off${this.train.speed > 6 ? ' (it will hurt)' : ''}`);
      this.updateThrowAim(dt, I);
      if (I.hit('KeyG') || I.hit('KeyF')) { this.train.leave(p); this.hud.prompt(null); }
      else this.handleShooting(dt, p.face);
      return;
    }

    // Hanging onto a vehicle: ride along, aim and shoot; G/F lets go.
    if (p.grabbing) {
      p.face = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);
      p.aiming = true;
      this.hud.prompt(`<kbd>G</kbd> Let go of the ${p.grabbing.v.name}`);
      if (I.hit('KeyG') || I.hit('KeyF')) { this.carCombat.letGo(p); this.hud.prompt(null); }
      else this.handleShooting(dt, p.face);
      return;
    }

    // On foot. A door to the face puts you on the floor for a moment; climbing through a window
    // takes its time. Neither lets you shoot.
    if (p.knockT > 0) { p.knockT -= dt; p.speed = 0; p.aiming = false; p.dive = 0; this.hud.prompt(null); return; }
    if (p.vault) { this.interiors.stepVault(p, dt * this.arms.vaultMul()); this.hud.prompt(null); return; } // free hands climb faster
    let mx = 0, mz = 0;
    if (I.key('KeyW') || I.key('ArrowUp')) mz -= 1;
    if (I.key('KeyS') || I.key('ArrowDown')) mz += 1;
    if (I.key('KeyA') || I.key('ArrowLeft')) mx -= 1;
    if (I.key('KeyD') || I.key('ArrowRight')) mx += 1;
    const pm = this.controls.move, tilt = !mx && !mz && pm.mag ? Math.max(PAD.walkMin, pm.mag) : 1; // the left stick: a light tilt creeps
    if (pm.mag) { mx += pm.x; mz += pm.z; }
    if (this.cam.yaw) { const w = this.cam.toWorld(mx, mz); mx = w.x; mz = w.z; } // ISO/CHASE: W is up the screen
    p.crouch = (I.key('ControlLeft') || I.key('ControlRight') || !!this.crouchOverride) && !p.prone;
    if (this.controls.hit('prone')) { const r = this.stance.setProne(p, !p.prone); if (!r.ok) this.hud.toast(`CAN'T GO PRONE · ${r.why.toUpperCase()}`, 'warn'); } // data/stance.js PRONE (D2)
    if (p.proneT > 0) p.proneT -= dt; // getting down or up: no shooting, no crawl
    p.stamina = p.stamina ?? 1;
    const wantSprint = (I.key('ShiftLeft') || I.key('ShiftRight') || !!this.autopilot?.run) && !p.crouch && !p.prone;
    const sprint = wantSprint && p.stamina > 0.04 && !this.skills.overloaded; // over your carry weight: no sprinting
    // No regen mid-dive: the roll is exertion. It used to refund most of its 0.25 cost before you landed.
    // Thirst and hunger slow the recovery and cap how full the tank gets (data/survival.js).
    p.stamina = Math.max(0, Math.min(this.needs.maxStamina, p.stamina + (sprint && p.speed > 1 ? -0.16 * this.skills.sprintDrainMul * this.skills.drainMul * this.arms.sprintDrain() : p.dive > 0 ? 0 : 0.22 * this.needs.staminaRegen) * dt));
    // Dive roll: a burst forward along your movement (or facing), harder to hit mid-air.
    if (I.hit('Space') && p.prone) this.stance.setProne(p, false); // Space from prone: up, not a dive
    else if (I.hit('Space') && !(p.dive > 0) && (p.diveCool ?? 0) <= 0 && p.stamina > 0.2) { const w = this.cam.toWorld(mx0(I) + pm.x, mz0(I) + pm.z); this.startDive(p, w.x, w.z); }
    p.diveCool = (p.diveCool ?? 0) - dt;
    if (p.dive > 0) {
      p.dive -= dt;
      const f = p.dive > 0.25 ? 9.5 : 3; // flight, then belly slide
      const t = { x: p.x + p.diveDx * f * dt, z: p.z + p.diveDz * f * dt };
      this.statics.resolveBody(t, p.radius, p); // a dive shoulders doors open and goes through windows
      p.x = t.x; p.z = t.z; p.speed = 0;
      this.standOn(p);
      if (p.vault) return; // dove into a window: through it
      if (p.dive <= 0) { this.emit('dived', { x: +p.x.toFixed(1), z: +p.z.toFixed(1) }); this.fx.dust(p.x, p.z, 3); }
      this.handleShooting(dt, p.face);
      return;
    }
    // Water: wade slow, swim slower (no shooting), Ctrl dives under on a breath meter.
    const wet = this.water.stateAt(p.x, p.z, p.gy); // gy: up on a river's bridge deck you are dry (world/rivers.js)
    p.swim = wet === 'swim';
    p.breath = p.breath ?? 1;
    if (p.prone && wet !== 'dry') this.stance.setProne(p, false); // into the water: up on your feet
    p.underwater = p.swim && p.crouch;
    this.waves.swimmer(p, wet, dt); // the current carries a swimmer, a kick leaves a wake, going in splashes
    this.diving.step(p, dt, wet); // how deep: the view darkens and closes, sound goes thick, a gasp coming up (systems/diving.js)
    if (p.underwater) {
      p.breath = Math.max(0, p.breath - dt / 20 * this.diving.drainMul(p)); // deeper drains faster
      if (p.breath <= 0) this.combat.damage(p, 9 * dt, null, 0, 0, 'drown');
    } else p.breath = Math.min(1, p.breath + dt / 4);
    if (p.swim) p.stamina = Math.max(0, p.stamina - dt * 0.03);
    if (wet !== 'dry' && p.speed > 1 && Math.random() < dt * 8) this.fx.spawn(2, p.x, (p.gy ?? 0) + 0.2, p.z, (Math.random() - 0.5) * 2, 0.6, (Math.random() - 0.5) * 2, 0.6, 0.35, '#dfe9ea', 2);
    if (wet !== this.lastWet) { if (wet === 'swim') this.hud.toast('Swimming — [Ctrl] dive under (hold your breath)', 'job'); this.emit('water', { state: wet }); this.lastWet = wet; }
    const speed = (p.underwater ? 2.0 : p.swim ? 2.8 : wet === 'wade' ? 2.9 : p.prone ? (p.proneT > 0 ? 0 : this.stance.speed(p)) : p.crouch ? 2.2 : sprint ? 7.6 : 4.6) * this.skills.speedMul * this.needs.speedMul * this.arms.moveMul() * (sprint ? 1 : tilt) * (p.ug ? this.under.speedMul(p) : 1) * (p.swampSlow ?? 1); // a heavy pack slows you; so do a bad leg, the cold, fear's rush (needs.speedMul); two hands on a gun too
    if (this.autopilot) {
      // moveTo: follow the A* waypoint list; the last point uses the caller's tolerance.
      const ap = this.autopilot;
      const wp = ap.path?.[ap.i] ?? ap;
      const last = !ap.path || ap.i >= ap.path.length - 1;
      const dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
      // Stuck (someone in the doorway, a crate)? sidestep, then re-plan from here.
      ap.chkT = (ap.chkT ?? 0) + dt;
      if (ap.chkT > 0.8) {
        const moved = Math.hypot(p.x - (ap.lx ?? p.x + 9), p.z - (ap.lz ?? p.z));
        ap.lx = p.x; ap.lz = p.z; ap.chkT = 0;
        if (moved < 0.5) {
          ap.side = 0.45; ap.sideSign = Math.random() < 0.5 ? 1 : -1;
          if (ap.follow?.alive) { ap.x = ap.follow.x; ap.z = ap.follow.z; }
          const np = this.footPath(p.x, p.z, ap.x, ap.z);
          if (np) { ap.path = np; ap.i = 0; }
        }
      }
      if (d < (last ? ap.tolerance ?? 1 : 0.55)) {
        if (last) { this.autopilot = null; this.emit('arrived', { x: +p.x.toFixed(1), z: +p.z.toFixed(1) }); }
        else ap.i++;
      } else if (ap.side > 0) {
        ap.side -= dt; mx = (-dz / d) * ap.sideSign + (dx / d) * 0.3; mz = (dx / d) * ap.sideSign + (dz / d) * 0.3;
      } else { mx = dx / d; mz = dz / d; }
    }
    const len = Math.hypot(mx, mz);
    const px = p.x, pz = p.z;
    if (len) {
      const t = { x: p.x + (mx / len) * speed * dt, z: p.z + (mz / len) * speed * dt };
      this.statics.resolveBody(t, this.stance.radius(p), p, p.prone ? null : p); // doors swing open ahead of you; broken windows get climbed (a crawl pushes no door)
      p.x = t.x; p.z = t.z;
      this.standOn(p); // up a stair, onto a floor, down off a ramp
      if (p.vault) return;
    }
    p.speed = Math.hypot(p.x - px, p.z - pz) / dt;
    const prevStep = Math.floor(p.walk / Math.PI);
    p.walk += stridePhase(p.speed, dt);
    if (Math.floor(p.walk / Math.PI) !== prevStep && p.speed > 0.5) {
      const onRoad = roadLines.some((c) => Math.abs(p.z - c) < 7 || Math.abs(p.x - c) < 7);
      this.audio.step(this.insideBuilding || p.ug ? 'floor' : onRoad ? 'road' : 'sand', 0);
    }
    if (this.qol.settings.aimAssist && !this.aimOverride) {
      // Aim assist: snap to the closest living character within 2.2m of the cursor.
      let snap = null, sd = 2.2;
      for (const c of this.chars) {
        if (c === p || !c.alive || c.inVehicle) continue;
        const d = Math.hypot(c.x - this.aim.x, c.z - this.aim.z);
        if (d < sd) { sd = d; snap = c; }
      }
      if (snap) { this.aim.x = snap.x; this.aim.z = snap.z; }
    }
    const wk = this.arms.work; // hands busy at something (systems/arms.js): face it, not the aim
    const aimAng = wk ? Math.atan2(wk.x - p.x, wk.z - p.z) : Math.atan2(this.aim.x - p.x, this.aim.z - p.z);
    if (p.prone) { p.face = this.stance.steer(p, aimAng, len && p.speed > 0.05 ? Math.atan2(mx, mz) : null, dt); if (!p.onDeck) this.stance.fitNow(p); } // the body crawls round; the gun stays in its arc; no head through a wall
    else p.face = angleLerp(p.face, aimAng, Math.min(1, dt * 18));
    p.aiming = true;
    // QOL: slow regen to 60% after 6s without taking damage.
    p.sinceHit = (p.sinceHit ?? 99) + dt;
    if (p.sinceHit > 6 && p.hp < 60) p.hp = Math.min(60, p.hp + dt * 4 * this.needs.healMul); // healMul: hunger, cold, gloom, an infection (survival.js)
    if (p.bleed > 0) { p.bleed = Math.max(0, p.bleed - dt * 0.05); if (Math.random() < dt * 5 * p.bleed) this.fx.decal(p.x, p.z, 0.2 + Math.random() * 0.25, '#5a0606', undefined, this.fx.onFloor(p)); } // on their floor (engine/depthlayers.js)
    if (sprint && len && Math.random() < dt * 6) this.fx.dust(p.x, p.z, 1);

    // Weapon select.
    this.arms.slotKeys(I, dt); // a new number selects the slot; the same number again (or held) steps its fire modes
    if (I.wheelAlt) { // the plain wheel zooms (systems/camrig.js); Alt+wheel cycles the guns
      const i = this.inv.weapons.indexOf(this.inv.current);
      this.switchWeapon(this.inv.weapons[(i + I.wheelAlt + this.inv.weapons.length) % this.inv.weapons.length]);
    }
    if (I.hit('KeyR')) this.reload();
    if (I.hit('KeyX')) { const i = THROW_ORDER.indexOf(this.inv.throwable); for (let k = 1; k <= THROW_ORDER.length; k++) { const n = THROW_ORDER[(i + k) % THROW_ORDER.length]; if ((this.inv.throwables[n] ?? 0) > 0) { this.inv.throwable = n; break; } } this.audio.blip(); }
    this.updateThrowAim(dt, I);
    if (!p.swim && !(p.proneT > 0)) this.handleShooting(dt, p.face);
    p.aiming = !p.swim && this.arms.stance === 'raised'; // lowered or holstered: no aim pose (systems/arms.js)

    // Interactions. A person held at gunpoint takes E first (hand it over, open the door, walk with me).
    if (this.gunpoint.playerInteract(p, I, dt)) return;
    let best = null, bd = 2.8;
    for (const c of this.chars) {
      if (c === p || !c.alive || c.inVehicle || c.faction === 'raider' || c.faction === 'zombie' || c.target === p) continue; // nobody talks to the dead
      if (!this.storeys.sameFloor(p, c)) continue; // the floor between you
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd) { bd = d; best = c; }
    }
    let bestV = null, bv = 4.2;
    for (const veh of this.vehicles) {
      if (veh.dead || (p.storey && (p.gy ?? 0) > LEVEL.same) || p.ug) continue; // the street's cars, from upstairs (or below): no
      if (veh === p.onDeck?.v || veh.trailer) continue; // a trailer has no wheel (systems/semis.js); the one you stand in: its wheel is a spot on its deck (systems/decks.js)
      const d = Math.hypot(veh.x - p.x, veh.z - p.z) - veh.len * 0.3;
      if (d < bv) { bv = d; bestV = veh; }
    }
    // A dog at your feet (systems/dogs.js): E feeds it, bandages it, or tells yours to stay or follow. C whistles (taps and a
    // hold: heel, guard, seek, SIC, shield), unless a car in reach takes C for its passenger seat.
    // A roadside work spot (a tank's caps, a hulk, a water tank, the dam's wheel: systems/roadside.js) is E's before your dog at heel.
    const rsSpot = !best ? this.roadside.spotNear(p) : null;
    const dog = !best && !bestV && !rsSpot ? this.dogs.nearFor(p) : null;
    this.dogs.whistleKey(!bestV && I.key('KeyC'), dt);
    const climb = bestV ? this.decks.canClimb(bestV, p) : null; // E climbs into a pickup's bed, steps in a van's door
    const dk = !best && !bestV ? this.decks.spot(p) : null;      // aboard: the wheel (F), the stove and the tank (E)
    const foot = this.footingText(p); // riding an open deck: how near the floor is to throwing you (systems/decks.js feel)
    this.hud.footing(foot); // its own HUD chip (data/hudlayout.js 'footing'), so the prompt stays the verb
    // Nobody to talk to and no car: E works the nearest door (kick) or window (smash, climb, board).
    const ugI = !best && !bestV && !dog && !dk && p.ug ? this.under.playerInteract(p, I, dt) : null; // below the street: the lift, the generator, keypads, doors, logs (systems/underground.js)
    const op = !best && !bestV && !dog && !dk && !ugI && !p.ug && !p.onDeck && !(p.storey && (p.gy ?? 0) > LEVEL.same) ? (this.interiors.playerInteract(p, I, dt) ?? this.citygen?.bayInteract(p, I, dt) ?? this.milbases?.interact(p, I, dt) ?? this.backlots?.interact(p, I, dt) ?? this.understreet?.interact(p, I, dt) ?? null) : null; // the street storey's doors and windows (and a generated building's roll-up bays)
    // A carcass to butcher, or raw meat to cook at the fire you stand at (systems/fauna.js).
    const game = !best && !bestV && !op && !ugI && !dog && !dk ? this.fauna.nearFor(p) : null;
    // Nothing else in reach: a crate, a shelf, a body or a pile you could go through (E or I opens the pack on it).
    // A pole's board, a station's, a field's counter or a vat's (systems/travel.js): E reads it, buys a punch, gets you pressed.
    // ... or the roadside's: a tank's caps (a car beside them is what you siphon into: E stays the caps'), a hulk, a water tank, the dam's wheel.
    const spot = !best && !op && !ugI && !dog && !dk && !game ? (!bestV ? this.travel.spotNear(p) : null) ?? rsSpot : null;
    const box = !best && !bestV && !op && !ugI && !dog && !dk && !spot && !game ? this.inventory.nearest(p.x, p.z, 2.6, false, p.gy ?? 0) : null;
    // Or a bed (a mattress in a house): E lies down on it.
    const bed = !best && !bestV && !op && !ugI && !dk && !box && !spot && !game ? this.bedNear(p.x, p.z, p.gy ?? 0) : null;
    if (box) { this.boxRing.x = box.x; this.boxRing.z = box.z; this.boxRing.len = 1.6; }
    else if (bed) { this.boxRing.x = bed.x; this.boxRing.z = bed.z; this.boxRing.len = 2.1; }
    this.qol.highlight(best ?? bestV ?? dog?.d ?? op ?? ugI ?? (box || bed ? this.boxRing : null));
    const runner = best?.telling && this.witnesses.canBribe(best) ? best : null; // a witness running home: buy their silence
    if (runner) this.hud.prompt(`<kbd>E</kbd> Pay <b>$${this.witnesses.bribeCost(runner)}</b> to forget what they saw`);
    else if (best) this.hud.prompt(`<kbd>E</kbd> ${best.sleeping ? 'Wake' : 'Talk to'} ${best.npc ? best.npc.name : best.name}`);
    else if (bestV) this.hud.prompt(`<kbd>F</kbd> ${bestV.driver && bestV.driver.faction !== 'ally' ? 'Carjack' : bestV.fallen ? 'Pick up' : 'Drive'} ${bestV.name} · <kbd>C</kbd> Ride${bestV.driver ? ' along' : ' as passenger'} · <kbd>G</kbd> Hang on${spot ? ` · ${spot.label}` : climb ? ` · <kbd>E</kbd> ${climb}` : ''}`);
    else if (dog) this.hud.prompt(dog.verb === 'none' ? dog.text : `<kbd>E</kbd> ${dog.text}`);
    else if (dk) this.hud.prompt(dk.text);
    else if (game) this.hud.prompt(game.verb === 'none' || game.verb === 'busy' ? game.text : `<kbd>E</kbd> ${game.text}`);
    else if (spot) this.hud.prompt(spot.label);
    else if (box) this.hud.prompt(`<kbd>E</kbd> ${box.kind === 'ground' ? 'Pick through what\'s here' : box.husk ? 'Go through your husk' : box.id.startsWith('body:') ? 'Go through the body' : `Search the ${box.label.split(' · ')[0].toLowerCase()}`}${box.owner ? ` · <b class="warn">${box.ownerName}'s</b>` : ''}`);
    else if (bed) this.hud.prompt(`<kbd>E</kbd> Sleep · ${Math.round(this.needs.rest * 100)}% rested`);
    else if (!op && !ugI) this.hud.prompt(null);
    if (runner && I.hit('KeyE')) { this.witnesses.bribe(runner); this.hud.prompt(null); }
    else if (best && I.hit('KeyE')) { if (best.sleeping) this.ai.wake(best, 'shaken awake'); this.dialogue.open(best); this.hud.prompt(null); }
    else if (dog && dog.verb !== 'none' && I.hit('KeyE')) { const r = this.dogs.interact(dog.d, dog.verb); this.hud.toast(r.ok ? r.text : r.why.toUpperCase(), r.ok ? 'job' : 'warn'); }
    else if (game && game.verb !== 'none' && I.hit('KeyE')) { const r = this.fauna.interact(game); this.hud.toast(r.ok ? r.text : String(r.why).toUpperCase(), r.ok ? 'job' : 'warn'); }
    else if (spot && I.hit('KeyE')) { if (spot.roadside) this.roadside.interact(spot); else this.travel.interact(spot); this.hud.prompt(null); }
    else if (box && I.hit('KeyE')) { this.invUI.toggle(true); this.hud.prompt(null); }
    else if (bed && I.hit('KeyE')) { const r = this.survival.sleepAt('bed', bed); if (!r.ok) this.hud.toast(r.why.toUpperCase(), 'warn'); this.hud.prompt(null); }
    else if (bestV && I.hit('KeyF')) { this.enterVehicle(bestV); this.hud.prompt(null); }
    else if (bestV && climb && I.hit('KeyE')) { this.decks.climb(p, bestV); this.hud.prompt(null); }
    else if (dk && I.hit(dk.key)) { this.decks.use(p, dk); this.hud.prompt(null); }
    else if (bestV && I.hit('KeyC')) { this.enterVehicle(bestV, 'passenger'); this.hud.prompt(null); }
    else if (bestV && I.hit('KeyG')) { this.carCombat.grab(p, bestV, this.carCombat.sideToward(bestV, p.x, p.z)); this.hud.prompt(null); }
    else if (!best && !bestV && !op && this.train.canBoard(p)) {
      this.hud.prompt('<kbd>G</kbd> Climb aboard the train');
      if (I.hit('KeyG')) { this.train.board(p); this.hud.prompt(null); }
    }
  }

  // Q held: show the arc and cook; release: throw. Works from a car window too.
  updateThrowAim(dt, I) {
    const p = this.player;
    if (I.key('KeyQ') && !this.dialogue.active) {
      p.cookT = (p.cookT ?? 0) + dt;
      const ox = p.inVehicle ? p.inVehicle.x : p.x, oz = p.inVehicle ? p.inVehicle.z : p.z;
      this.throwables.showArc(this.throwables.previewArc(ox, oz, this.aim.x, this.aim.z));
      const def = THROWABLES[this.inv.throwable];
      if (def.cook && p.cookT >= def.fuse - 0.05) { this.throwSelected(p.cookT); p.cookT = 0; this.hud.toast('COOKED TOO LONG!', 'hot'); }
    } else if (p.cookT > 0) {
      this.throwSelected(p.cookT);
      p.cookT = 0;
      this.throwables.showArc(null);
    } else this.throwables.showArc(null);
  }

  startDive(c, dx, dz) {
    if (!dx && !dz) { dx = Math.sin(c.face); dz = Math.cos(c.face); }
    const l = Math.hypot(dx, dz) || 1;
    c.diveDx = dx / l; c.diveDz = dz / l;
    c.dive = 0.65; c.diveCool = 0.9;
    c.stamina = Math.max(0, (c.stamina ?? 1) - 0.25);
    this.audio.throwWhoosh?.(0);
  }

  switchWeapon(k) {
    if (k === this.inv.current) return;
    this.inv.current = k;
    this.player.weapon = k;
    this.player.reloading = 0; this.player.clearing = false;
    this.audio.blip();
  }

  // R: clear a jam if the gun has one (work the action, throw the stuck round), else reload from your pockets.
  reload() {
    const p = this.player, k = this.inv.current, w = WEAPONS[k];
    if (p.reloading > 0) return;
    if (this.inv.jam[k]) { p.reloading = GUN_CARE.clearTime * this.skills.reloadMul; p.clearing = true; this.audio.reload(); return; }
    if (this.inv.mag[k] >= w.mag || this.inv.ammo[w.ammo] <= 0) return;
    p.clearing = false;
    p.reloading = w.reload * this.skills.reloadMul; // dexterity makes quick hands
    this.audio.reload();
  }

  handleShooting(dt, ang) {
    const p = this.player, I = this.input, k = this.inv.current, w = WEAPONS[k];
    const fm = this.arms.row(k); // the gun as it fires: its fire mode, your grip, the recoil bloom (systems/arms.js)
    p.cool -= dt;
    // At the wheel of a car with a hood gun: aim ahead and the gun fires; aim aside and you shoot out of the window.
    const car = p.inVehicle;
    if (car?.mounts && car.driver === p && I.mouse.left && this.garage.fireFront(car, p, ang)) return; // group 1: hood + pods, whichever arc holds the aim
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) {
        if (p.clearing) { p.clearing = false; this.inventory.cleared(k); }
        else {
          const need = w.mag - this.inv.mag[k];
          const take = Math.min(need, this.inv.ammo[w.ammo]); // out of the rounds in your pockets
          this.inv.mag[k] += take; this.inv.ammo[w.ammo] -= take;
          this.skillsSys.gain('dexterity', 1.5);
        }
      }
      return;
    }
    // Auto-reload: an empty gun loads itself as soon as there are rounds for it in the pack (bought, looted, picked up
    // after it ran dry) - not only at the trigger. It used to sit at 0 over 60 spare until you pulled.
    if (this.inv.mag[k] === 0 && this.inv.ammo[w.ammo] > 0 && this.qol.settings.autoReload && !this.inv.jam[k] && this.inventory.cond(k) > 0) this.reload();
    const want = this.arms.trigger(I, k); // raises or draws the gun; single, burst or automatic by the mode
    if (!want || p.cool > 0) return;
    // A jammed gun's trigger goes dead: the pull starts clearing it. A broken one does nothing at all.
    if (this.inv.jam[k]) { this.audio.empty(); p.cool = 0.3; this.reload(); return; }
    if (this.inventory.cond(k) <= 0) {
      this.audio.empty(); p.cool = 0.5;
      if (this.time - (this.brokeT ?? -9) > 3) { this.brokeT = this.time; this.hud.toast(`${w.short} IS BROKEN · A GUNSMITH CAN FIX IT`, 'warn'); }
      return;
    }
    if (this.inv.mag[k] <= 0) { this.audio.empty(); p.cool = 0.25; this.reload(); return; }
    // In a car: shoot out of the window on that side (knocks the glass out first).
    const fired = p.inVehicle ? this.carCombat.fireFromVehicle(p, p.inVehicle, k, ang, fm) : this.combat.fire(p, k, ang, fm);
    if (fired) {
      this.inv.mag[k]--;
      p.cool = this.arms.afterShot(fm);
      this.controls.rumble('shot', w.shake);
      if (this.inventory.shot(k)) { // every round wears it; a worn one may jam on the next
        this.audio.burst?.({ dur: 0.06, freq: 1500, type: 'bandpass', q: 5, vol: 0.4, decay: 0.05 }); // the action stops short
        this.hud.toast(`${w.short} JAMMED · R TO CLEAR`, 'warn');
      } else if (this.inv.mag[k] === 0 && this.qol.settings.autoReload) this.reload();
      this.hud.shake(w.shake * 0.4 * this.arms.kickMul()); // one hand kicks harder
      this.look.onShot(p, k, ang); // the camera kick by calibre
    }
  }

  // ---- camera ----------------------------------------------------------------------------
  // Step the zoom (Z out, Shift+Z in; - and =). Clamped at both ends rather than wrapping: a jump from the widest
  // view back to the closest mid-fight is disorienting.
  setZoom(i) { return this.cam.setStop(i); }

  updateCamera(dt) {
    const p = this.player, v = p.inVehicle, C = this.cam;
    let tx = p.x, tz = p.z;
    if (v) {
      tx = v.x + v.vx * 0.55; tz = v.z + v.vz * 0.55;
      if (C.eff() === 'CHASE') { const a = CAMERA.view.CHASE.ahead; tx = v.x + Math.sin(v.h) * a + v.vx * 0.3; tz = v.z + Math.cos(v.h) * a + v.vz * 0.3; }
    } else {
      // Lean the view toward the cursor so you can see what you shoot (further out at a wider zoom).
      // Look far (held): all the way to the cursor, out to most of the screen (systems/camrig.js leanMax).
      const lean = C.leanMax(), share = C.looking ? 1 : CAMERA.lean;
      tx += clamp((this.aim.x - p.x) * share, -lean, lean);
      tz += clamp((this.aim.z - p.z) * share, -lean, lean);
    }
    // Upstairs, the camera keeps its height above the floor you stand on (not above the street).
    // On real terrain (flag, world/realterrain.js) it keeps its height above the ground it looks at.
    const T = this.streamer?.W?.terrain;
    const floorY = (this.insideBuilding?.storey || p.ug) && !v ? p.gy ?? 0 : T ? T.at(this.camLook.x, this.camLook.z) : 0;
    this.camFloor = (this.camFloor ?? 0) + (floorY - (this.camFloor ?? 0)) * (1 - Math.exp(-dt * ZOOM.heightRate));
    if (T) this.camLook.y = this.camFloor; // the sun's shadow box follows it up and down (sky.js)
    if (this.droneCam?.active) { tx = this.droneCam.x; tz = this.droneCam.z; } // the drone's eye (systems/drones.js) while you fly it; its height: camrig.js
    const k = 1 - Math.exp(-dt * ZOOM.follow);
    this.camLook.x += (tx - this.camLook.x) * k;
    this.camLook.z += (tz - this.camLook.z) * k;
    C.update(dt, this.camLook, this.camFloor, this.insideBuilding || p.ug); // places the camera; sets camHeight and viewR (below the street: the indoor framing)
    this.cutaway.update(dt);
    this.under?.view(this.camera); // below the street: the clipping plane, the level shown, the light (systems/underground.js)
  }

  updateInterior() {
    const p = this.player;
    let inside = null;
    if (!p.inVehicle) {
      for (const b of this.world.buildings) {
        if (!b.enterable || !b.roofIdx.length) continue;
        if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ) { inside = b; break; }
      }
      // Past the island: a building of the Phoenix ring (world/ring.js; its roof hides through the streamer's pool).
      if (!inside && (Math.abs(p.x) > 464 || Math.abs(p.z) > 464)) inside = this.streamer.ringBuildingAt(p.x, p.z);
      if (!inside) inside = this.citygen?.buildingAt(p.x, p.z) ?? null; // a generated settlement's (systems/citygen.js)
    }
    const S = inside?.storey ?? null;
    this.storeys.setView(S, p.gy ?? 0);
    this.charR.cullAbove = S ? { b: inside, y: (p.gy ?? 0) + LEVEL.same } : null;
    this.charR.lsw.focus = p; // LSW-BODIES: the people nearest you wear the LSW bodies (systems/lswbodies.js)
    if (inside !== this.insideBuilding) {
      if (this.insideBuilding) this.world.setRoofVisible(this.insideBuilding, true);
      if (inside) {
        this.world.setRoofVisible(inside, false);
        if (inside.shopName) this.hud.toast(inside.shopName.toUpperCase());
        else if (inside.label && inside.district === 'town') this.hud.toast(inside.label); // Rust Haven's keeperless houses: a cantina, a boarding house, a store

      }
      this.insideBuilding = inside;
    }
  }

  updatePopulation(dt) {
    // Bodies far from view fold into their records (systems/rites.js draws them and ages them; the blood stays).
    for (let i = this.chars.length - 1; i >= 0; i--) {
      const c = this.chars[i];
      if (!c.alive && c !== this.player && !c.npc && !c.res && c.deadTime > 90 && Math.hypot(c.x - this.player.x, c.z - this.player.z) > Math.max(70, this.viewR + 10)) this.removeChar(c);
    }
    this.population.update(dt); // far ambient people fold when the pool runs low, unfold when you come back
    // Dustwolves keep coming.
    this.raiderTimer -= dt;
    if (this.raiderTimer <= 0) {
      this.raiderTimer = 18;
      const alive = this.chars.filter((c) => c.alive && c.faction === 'raider' && !c.res).length; // a chop shop's wolves live in the ring, not the camps
      // As many as the band can field (faction sim strength), and only from camps it still holds.
      const S = this.society, cap = Math.round(30 * S.sim.str('dustwolves') / 100);
      if (alive < cap && this.freeSlots.length > AMBIENT_RESERVE && this.time > ARRIVAL_QUIET) { // leave the director room (systems/director.js needs 10 free)
        const camps = this.world.spawns.camps.filter((c, i) => S.places[`camp_${i}`]?.owner === 'dustwolves' && Math.hypot(c.x - this.player.x, c.z - this.player.z) > Math.max(80, this.viewR + 10));
        const camp = camps[Math.floor(Math.random() * camps.length)];
        if (camp) for (let k = 0; k < 2; k++) { const c = this.spawnRaider(camp.x + (Math.random() - 0.5) * 10, camp.z + (Math.random() - 0.5) * 10); if (c) c.amb = true; }
      }
    }
    // Wanted level cools off.
    if (this.wanted > 0) {
      this.wantedT += dt;
      if (this.wantedT > 25) { this.wanted--; this.wantedT = 0; if (!this.wanted) this.hud.toast('The wardens lost interest.'); }
    }
  }

  // ---- loop ------------------------------------------------------------------------------
  title(ui) {
    const t = document.createElement('div');
    t.className = 'title';
    t.innerHTML = `
      <div class="title-inner">
        <h1>DIVIDED <span>STATES</span></h1>
        <div class="tag">${this.regions?.intro()?.tag ?? 'OF AMERICA · PHOENIX, ARIZONA · THE UNION IS GONE. THE ROADS REMAIN.'}</div>
        <button class="play">ENTER THE WASTE</button>
        <div class="keys">
          <div><b>WASD</b>move</div><div><b>MOUSE</b>aim</div><div><b>LMB</b>shoot</div>
          <div><b>SHIFT</b>sprint / boost</div><div><b>R</b>reload</div><div><b>1-3</b>weapons</div>
          <div><b>E</b>talk / kick doors / horn</div><div><b>F</b>drive / exit</div><div><b>C</b>ride / swap seat</div>
          <div><b>E</b>at a window: smash · climb</div><div><b>hold E</b>board a broken window</div><div><b>SHIFT</b>into a door: bash it open</div>
          <div><b>G</b>hang on / train</div><div><b>Q</b>hold: aim throw</div><div><b>X</b>next throwable</div>
          <div><b>SPACE</b>dive / handbrake</div><div><b>CTRL</b>crouch / dive under</div><div><b>H</b>harpoon / yank</div>
          <div><b>M</b>map</div><div><b>L</b>flashlight</div><div><b>Z</b>zoom out (Shift: in)</div>
          <div><b>I / TAB</b>pack</div><div><b>V</b>patch up / drink / eat</div><div><b>B</b>drop from the tail</div>
          <div><b>H</b>gun up/down · hold: holster</div><div><b>J</b>one / two hands</div><div><b>RMB</b>melee · hold: kick</div>
          <div><b>1-4 again</b>fire mode</div><div><b>PAD</b>twin-stick, RT fire</div><div><b>F2</b>controls</div>
          <div><b>T</b>fast time</div><div><b>Y</b>weather</div><div><b>P</b>pause</div>
        </div>
      </div>`;
    ui.appendChild(t);
    t.querySelector('.play').onclick = () => {
      t.remove();
      this.audio.start();
      this.paused = false;
      const intro = this.regions?.intro(); // a Florida start (WEB_FLORIDA.md): Meridian's own first words
      this.hud.toast(intro?.toast ?? 'You wake up in Rust Haven. Find Sheriff Okonkwo at the north gate.', 'job');
      this.hud.subtitle(intro?.sub ?? 'The Whaler is parked on Central Ave. Kenji says don\'t scratch it.', 6);
    };
    this.render(0.016);
  }

  frame(dt) {
    const I = this.input;
    this.controls.poll(dt); // the pad's buttons become the codes below; its sticks the analog move, aim and drive
    if (!this.workshopUI.open) this.qol.input(I); // the WORKSHOP screen is modal: its Esc closes it, not the pause menu
    if (I.hit('F3')) { this.showStats = !this.showStats; this.hud.el.stats.classList.toggle('hidden', !this.showStats); }
    if (I.hit('F4')) { this.sky.sun.castShadow = !this.sky.sun.castShadow; this.hud.toast(`Shadows ${this.sky.sun.castShadow ? 'ON' : 'OFF'}`); }
    if (I.hit('KeyT') && !this.survival.sleep) { this.sky.fast = !this.sky.fast; this.hud.toast(this.sky.fast ? 'TIME ×40' : 'TIME NORMAL'); }
    if (I.hit('KeyY')) { this.sky.cycleWeather(); this.hud.toast(`WEATHER → ${this.sky.label}`); }
    if (!this.paused && !this.invUI.open && !this.dialogue.active) this.cam.input(I, dt); // wheel, Z / - / =, O, [ ]; a panel keeps the wheel
    if (I.hit('KeyL')) { this.flashOverride = this.flashOverride === undefined ? !(this.sky.night > 0.5) : !this.flashOverride; }
    if (this.paused) { // map/menu stay live while paused; people keep their poses (photo mode shoots anyone placed while frozen)
      this.charR.sync(this.chars, 0); this.qol.update(dt); this.weaponBar.update(dt); I.endFrame(); return;
    }

    dt = this.look.warp(dt); // a hit-stop: the sim runs near frozen for its real 40-80 ms (systems/lookfeel.js)
    this.time += dt;
    const simDt = this.dialogue.active ? 0 : dt;
    if (simDt) this.interiors.update(simDt); // door leaves swing (and bash) before anyone moves
    if (simDt) this.crew.input(I); // E beside a downed crew member is theirs: patch up, or hold to drag
    if (simDt) this.rites.input(I); // beside the dead: hold E to drag, G to bury, F to burn (systems/rites.js)
    this.updatePlayer(dt);
    this.arms.update(dt);  // H, J, B, RB: stance, grip, fire mode, the wheel; who has noticed your gun
    this.melee.update(dt); // RMB / R3: the blow in flight lands at its moment of contact
    this.nanGuard('player');
    if (simDt) {
      this.ai.update(simDt); this.nanGuard('ai');
      this.bases.update(simDt); // sentries watch the wire, searchlights sweep
      this.witnesses.update(simDt);
      this.society.update(simDt);
      this.roles.update(simDt); // a counter until its second is up: the odometer, the gates, the street's reaction
      this.survival.update(simDt);
      this.skillsSys.update(simDt);
      this.deep.update(simDt);
      this.vehiclesSys.update(simDt, this.sky.night); this.nanGuard('vehicles');
      this.garage.update(simDt);
      this.workshop.update(simDt); // rockets in flight, seeker locks, power, nitrous, the fire bottles
      this.train.update(simDt); this.nanGuard('train');
      this.convoy.update(simDt); this.nanGuard('convoy');
      this.semis.update(simDt); this.nanGuard('semis');
      this.travel.update(simDt); this.nanGuard('travel'); // the trundle on the road, the iron's riders, the boards
      this.clone.update(simDt); // brine money, the pickers on your husks, the husk drawn near you
      this.ambient.update(simDt);
      this.gunpoint.update(simDt); // after ambient: the held keep their hands up
      this.carCombat.update(simDt);
      this.ballistics.update(simDt); // rounds in the air fly on and meet what is in their way
      this.deaths.update(simDt); this.migrations?.update(simDt); // the dying land; hordes walk the highways (WEB_DEATHS.md)
      this.vehDamage.update(simDt);
      this.throwables.update(simDt);
      this.gadgets.update(simDt); // and the drone in the air, the bulls (systems/gadgets.js)
      this.kit.update(simDt); // cells drain, the glass marks, the scanner listens, bad air, dog gear, car kit (systems/kit.js)
      this.rites.update(simDt); // the dead age on the clock, the cemeteries near you, funerals (systems/rites.js)
      this.materials.update(simDt); // things burning down, cars ramming through, blood drying
      this.water.update(simDt);
      this.waves.update(simDt);
      this.waterplace.update(simDt); // the drowned blocks, the key, the ferry (systems/waterplace.js)
      this.sealife.update(simDt);    // sharks, the deep one, piranhas, bait and gulls (systems/sealife.js)
      this.swamp.update(simDt);      // the nasty water: pads, knees, weed, fog, rot; filth in an open wound (systems/swamp.js)
      if (this.fuelTrail.length > 400) this.fuelTrail.splice(0, this.fuelTrail.length - 400);
      this.zombies.update(simDt);
      this.dogs.update(simDt);
      this.crew.update(simDt); // the downed bleed, deeds move trust, jobs on the game clock, dawn
      this.fauna.update(simDt); // the animals (after the dogs: a SIC'd dog's teeth land first)
      this.updatePopulation(simDt);
      this.residents.update(simDt); // the ring's households: promoted near you, written back when you leave
      this.regions.update(simDt); // a holdout's people, the region's animals and infected
      this.workforce.update(simDt); // workers to their shifts, the work banked (systems/workforce.js)
      this.pulls.update(simDt); // road people on the clock, bars near you, the grapevine, what you hear (systems/pulls.js)
      this.stories.update(simDt); // places on the world clock, traders, raids, refugees, hunters (systems/sitestories.js)
      this.roadside.update(simDt); // a hulk being stripped on the clock, keepers near you, a junkyard's dog, the downed-line warning
      this.nanGuard('late');
    }
    this.dialogue.update(dt, I);
    this.fx.update(dt);
    this.look.update(dt);
    this.updatePickups(dt);
    this.updateFootprints();
    this.updateInterior();
    this.updateCamera(dt);
    this.milbases.update(simDt); // the bases' gate rule, the horde's moans (systems/milbases.js)
    this.citygen.update(simDt); // generated settlements near you built, far ones released; hordes, sieges, falls (systems/citygen.js)
    this.backlots.update(simDt); // their yard gates hung near you, the nav windows told when a town comes or goes
    this.under.update(simDt, dt); // the underground: entrances near you, levels promoted and written back, the lift, the power
    this.understreet.update(simDt, dt); // the drains: the flood and its current, who stands up near you, the rats, the dead following a sound down
    this.streamer.update(dt); // lay out what is coming, put what is near on the GPU, hold the dust wall
    const p = this.player;
    this.sky.update(dt, this.camLook, this.world.groundMat, this.world.roadMat, this.viewR);
    this.streamer.postSky(); // the dust wall thickens the fog; streamed surfaces follow the sky's wet/dry tint
    this.world.glowMat.opacity = 0.03 + this.sky.night * 0.8;
    this.world.updateFlames(this.time);
    const flashOn = (this.flashOverride ?? (this.sky.night > 0.55 || !!p.ug)) && this.kit.beamOk(); // below the street it comes on by itself (L still switches it); it needs a carried light with charge (systems/kit.js)
    // The darker the night (the Night setting, systems/sky.js nightLight), the more your light carries: brighter and longer
    // (an additive cone, no light of its own: the fixed light count holds). Below the street: the underground's cone.
    const dark = p.ug ? 0 : this.sky.night * (1 - this.sky.nightLight);
    this.flashMat.opacity = flashOn && p.alive && !p.inVehicle ? (p.ug ? this.under.coneOpacity : 0.55 + 0.35 * dark) : 0;
    this.flashlight.scale.set(1, 1, (1 + 0.45 * dark) * this.kit.beamReach()); // a headlamp throws shorter than a torch
    this.flashlight.position.set(p.x, p.ug ? p.gy ?? 0 : 0, p.z);
    this.flashlight.rotation.y = p.face;
    this.kit.frame(dt); // the goggles' and the scope's overlay, body heat, dog and car kit drawn (systems/kit.js)
    this.charR.lsw.heat.value = this.kit.eyes === 'thermal_scope' ? 1 : 0; // veins are not warm: their glow goes dark under the scope
    this.charR.sync(this.chars, dt);
    this.dogs.draw(dt);
    this.fauna.draw(dt);
    const pv = p.inVehicle;
    this.soundscape.update(dt);
    this.radio.update(dt);
    const amb = p.ug ? 0 : 1; // below the street no wind, no rain on the roof
    this.audio.ambience(this.sky.cur.rain * amb, Math.max(this.sky.cur.dust, this.sky.cur.ash * 0.5) * amb, pv ? this.vehiclesSys.speed(pv) : null, pv?.air && pv.throttle > 0 ? pv.throttle : 0);
    this.hud.update(dt);
    this.weaponBar.update(dt);
    this.qol.update(dt);
    this.invUI.update(dt);
    this.crewUI.update(dt);
    this.workshopUI.update(dt);
    this.feedback.update(dt);
    this.recorder.tick(); // a time check; 4 times a game second, one sample into preallocated arrays
    I.endFrame();
  }

  render(dt) {
    this.look.render(this.camera); // the scene, then the grade pass (systems/lookfeel.js)
    if (this.showStats) {
      const r = this.renderer.info.render;
      this.hud.stats(`FPS       ${this.fps.toFixed(0)}\nDRAWS     ${r.calls}\nTRIS      ${(r.triangles / 1000).toFixed(1)}k\nCHARS     ${this.chars.length} (${this.chars.filter((c) => c.alive).length} alive)\nVEHICLES  ${this.vehicles.length}\nSTATICS   ${this.statics.boxes.length}\nPOS       ${this.player.x.toFixed(0)}, ${this.player.z.toFixed(0)}`);
    }
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      // The first animation timestamp can predate start() after a slow startup. Never advance timers backward.
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;
      // A bug in one system must never freeze the game: log it, keep the loop alive. (holdLoop: a scenario is driving
      // frames itself at a fixed step, so the clock it measures is the only one running.)
      if (!this.holdLoop) try { this.frame(dt); this.render(dt); } catch (e) { this.reportError(e); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

const game = new Game();
window.game = game;   // raw engine access (debugging)
window.DL = game.api; // the agent API — see AGENTS.md
loadContentPacks(game.api).then(async () => {
  attachShard(game); // the shard (docs/design/WEB_SHARD.md): LOG IN, other players, persistence; does nothing until you log in
  // Dev QOL: a full page reload (code edit) keeps your place in the world.
  const keep = sessionStorage.getItem('dl.hmr');
  if (keep) { sessionStorage.removeItem('dl.hmr'); try { restore(game, JSON.parse(keep)); game.emit('hmrRestored'); } catch (e) { console.warn('hmr restore failed', e); } }
  // Real terrain (docs/design/WEB_TERRAIN.md, WEB_SITES_TERRAIN.md) is ON by default, before agents connect; ?terrain=flat
  // keeps the old flat world (the escape hatch).
  if (new URLSearchParams(location.search).get('terrain') !== 'flat') try { await game.streamer.setTerrain(true); } catch (e) { console.warn('terrain', e); }
  startBridge(game.api);
  const sc = new URLSearchParams(location.search).get('scenario');
  if (sc) console.log('[scenario]', sc, await game.api.call('scenario', { name: sc }));
});
if (import.meta.hot) import.meta.hot.on('vite:beforeFullReload', () => { try { if (!document.querySelector('.title')) sessionStorage.setItem('dl.hmr', JSON.stringify(snapshot(game))); } catch {} });
game.start();
