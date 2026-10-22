import * as THREE from 'three';
import { Input } from './engine/input.js';
import { StaticWorld } from './engine/collision.js';
import { makeRng, angleLerp, clamp } from './engine/rng.js';
import { buildWorld, TOWN, roadLines, HALF } from './world/city.js';
import { buildTerrain, drawTerrainOnMinimap } from './world/terrain.js';
import { Water, WATER_AVOID, DOCK, LAKE } from './world/water.js';
import { RAIL_AVOID } from './world/rail.js';
import { Train } from './systems/train.js';
import { Convoy } from './systems/convoy.js';
import { Ambient } from './systems/ambient.js';
import { coneTexture } from './world/textures.js';
import { Sky } from './systems/sky.js';
import { FX } from './systems/fx.js';
import { Character, CharacterRenderer, outfit, MAX_CHARS, stridePhase } from './systems/characters.js';
import { Combat, WEAPONS } from './systems/combat.js';
import { AI } from './systems/ai.js';
import { Society } from './systems/society.js';
import { Survival } from './systems/survival.js';
import { Skills } from './systems/skills.js';
import { Garage } from './systems/garage.js';
import { Stunts } from './systems/stunts.js';
import { Bases } from './systems/bases.js';
import { Inventory } from './systems/inventory.js';
import { Roles } from './systems/roles.js';
import { InventoryUI } from './ui/inventory.js';
import { ITEMS, GUN_CARE } from './data/items.js';
import { Trade } from './systems/trade.js';
import { ZOOM } from './data/camera.js';
import { Vehicles } from './systems/vehicles.js';
import { CarCombat } from './systems/carcombat.js';
import { Interiors } from './systems/interiors.js';
import { Zombies } from './systems/zombies.js';
import { VehicleDamage } from './systems/vehicledamage.js';
import { Seats } from './systems/seats.js';
import { Throwables, THROWABLES, THROW_ORDER } from './systems/throwables.js';
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
import { loadContentPacks } from './agent/content.js';

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
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 1, 600);
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    });

    this.input = new Input(canvas);
    this.nextId = 0;
    this.events = [];
    this.eventSeq = 0;
    this.audio = new Audio();
    this.statics = new StaticWorld();
    this.world = buildWorld(this.scene, this.statics);
    // Mountains (outer desert ring) and water (east river → lake), before the nav grids.
    this.terrain = buildTerrain(this.scene, this.statics, { avoid: [...this.world.spawns.camps.map((c) => ({ x: c.x, z: c.z, r: 34 })), ...WATER_AVOID, ...RAIL_AVOID] });
    this.water = new Water(this);
    drawTerrainOnMinimap(this.world.minimap, this.terrain, HALF);
    this.water.drawOnMinimap(this.world.minimap, HALF);
    // Ramps, dunes and the Thrill Show (data/stunts.js): drivable relief, built before the nav grids see its solids.
    this.stunts = new Stunts(this);
    // Military bases (data/bases.js): the Federal Remnant's fenced outpost. Its fence, walls and props are solid before
    // the nav grids see them; its doors and windows join the world's rows before the interiors system hangs them.
    this.bases = new Bases(this);
    // Navigation grids: one for people, one dilated for vehicles (built once, ~10ms each).
    this.nav = { foot: new NavGrid(this.statics, { radius: 0.45, cell: 1 }), car: new NavGrid(this.statics, { radius: 1.9, cell: 2 }) };
    // Deep water is off-limits to walkers' and drivers' path planning (you can still swim/boat it).
    for (const [grid, lim] of [[this.nav.foot, 1.2], [this.nav.car, 0.6]]) {
      for (let zc = 0; zc < grid.n; zc++) for (let xc = 0; xc < grid.n; xc++) {
        const x = grid.wx(xc), z = grid.wx(zc);
        if (x > 290 && this.water.depthAt(x, z) > lim) grid.blocked[zc * grid.n + xc] = 1;
      }
    }
    this.sky = new Sky(this.scene, this.audio);
    this.fx = new FX(this.scene);
    this.charR = new CharacterRenderer(this.scene, WEAPONS);
    this.charR.groundAt = (x, z) => this.stunts.heightAt(x, z); // people stand on ramps and dunes, not inside them
    this.chars = [];
    this.freeSlots = [];
    for (let i = MAX_CHARS - 1; i >= 0; i--) this.freeSlots.push(i);
    this.vehicles = [];
    this.combat = new Combat(this);
    this.ai = new AI(this);
    this.society = new Society(this); // who saw what, and who now hates you for it
    this.society.initPlaces();
    this.survival = new Survival(this); // water and food on the game clock (g.needs)
    this.vehDamage = new VehicleDamage(this);
    this.seats = new Seats(this);
    this.throwables = new Throwables(this);
    this.fuelTrail = [];
    window.__THROW_NAMES = Object.fromEntries(Object.entries(THROWABLES).map(([k, d]) => [k, d.name]));
    this.vehiclesSys = new Vehicles(this);
    this.carCombat = new CarCombat(this);
    this.garage = new Garage(this); // plate by facing, hood guns, tail droppers (data/parts.js)
    this.interiors = new Interiors(this); // doors, locks, windows (after the nav grids and the car glass it borrows)
    this.zombies = new Zombies(this);
    this.train = new Train(this);
    this.convoy = new Convoy(this);
    this.ambient = new Ambient(this);
    const ui = document.getElementById('ui');
    this.hud = new HUD(this, ui);
    this.dialogue = new Dialogue(this, ui);
    this.qol = new QOL(this, ui);
    this.feedback = new Feedback(this, ui);

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
    this.inventory = new Inventory(this); // items in containers: what you carry, trunks, the dead, the ground (data/items.js)
    this.roles = new Roles(this); // what the world calls you, earned by what you keep doing (data/roles.js, WEB_ROLES.md)
    this.invUI = new InventoryUI(this, ui); // the PACK screen (I / Tab)
    this.trade = new Trade(this); // a trader's own shelves are a counter while they're there (systems/trade.js)
    this.insideBuilding = null;
    this.paused = true;
    this.time = 0;
    this.respawnT = 0;
    this.camPos = new THREE.Vector3(0, 40, 0);
    this.camLook = new THREE.Vector3();
    this.camHeight = 34;
    this.zoomLevel = ZOOM.start; // index into ZOOM.levels (data/camera.js)
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
    this.api = new AgentAPI(this);
    this.title(ui);
  }

  // ---- population ----------------------------------------------------------------
  addChar(opts) {
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
    if (i >= 0) this.chars.splice(i, 1);
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
        x = (b.minX + b.maxX) / 2 + 1.5; z = (b.minZ + b.maxZ) / 2 + 1.5;
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
    for (const w of S.wardens) this.addChar({ x: w.x, z: w.z, faction: 'warden', weapon: 'smg', hp: 130, colors: outfit('warden', rng), name: randomName(rng), flag: this.randomFlag(rng) });
    for (const d of S.drifters) {
      for (let k = 0; k < (Math.max(Math.abs(d.x), Math.abs(d.z)) < TOWN ? 2 : 1); k++)
        this.addChar({ x: d.x + rng.range(-3, 3), z: d.z + rng.range(-3, 3), faction: 'drifter', weapon: rng.chance(0.15) ? 'pistol' : null, colors: outfit('drifter', rng), name: randomName(rng), flag: this.randomFlag(rng) });
    }
    for (const r of S.raiders) this.spawnRaider(r.x, r.z, rng);

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
        if (it.type === 'ammo') { const A = this.inv.ammo, W = this.inv.weapons; A.pistol += 12; if (W.includes('smg')) A.smg += 32; if (W.includes('shotgun')) A.shells += 4; if (W.includes('rifle')) A.rifle += 10; text = '+ AMMO'; }
        else if (it.type === 'med' || it.type === 'water' || it.type === 'food') text = this.pickItem(it.type, it.x, it.z);
        else { const c = 10 + Math.floor(Math.random() * 30); this.cash += c; text = `+$${c}`; }
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

  // Throw the selected throwable at the aim point (cooked = seconds already held).
  throwSelected(cooked = 0) {
    const k = this.inv.throwable, n = this.inv.throwables[k] ?? 0;
    if (n <= 0) { this.hud.toast(`No ${THROWABLES[k].name.toLowerCase()} left`, 'warn'); return null; }
    this.inv.throwables[k] = n - 1;
    return this.throwables.throw(this.player, k, this.aim.x, this.aim.z, THROWABLES[k].cook ? cooked : 0);
  }

  noise(x, z, r, src) { this.ai.onNoise(x, z, r, src); this.zombies?.onNoise(x, z, r * 2); this.bases?.onNoise(x, z, r, src); this.survival?.heard(x, z, r); }
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
  // The bed (a mattress in a house; world/city.js spawns.beds) within reach of (x, z), or null.
  bedNear(x, z) {
    let best = null, bd = 1.8;
    for (const b of this.world.spawns.beds ?? NO_BEDS) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    return best;
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
    // Prefer a route around cars; if a car is sealing a doorway, fall back to the static route.
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
      const body = this.inventory.place(`body:${c.id}`, c.faction === 'raider' ? 'raider' : c.faction === 'soldier' ? 'soldier' : 'person', c.x, c.z, 20, `${(c.name ?? 'SOMEBODY').toUpperCase()} (DEAD)`);
      this.inventory.armBody(body, c);
    }
    if (c === this.player) { this.respawnT = 4; if (this.player.inVehicle) this.exitVehicle(true); }
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
    this.seats.leave(p, true);
    if (v.ai === 'chauffeur') { v.ai = null; v.throttle = 0; } // allies park when you get out
    this.vehiclesSys.releaseHarpoon();
    const sp = this.vehiclesSys.speed(v);
    if (!forced && sp > 10) { this.combat.damage(p, sp * 1.2, null, 0, 0); this.hud.toast('BAILED OUT', 'warn'); }
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
      if (this.respawnT <= 0) {
        const clinic = this.world.spawns.shops[0];
        p.alive = true; p.hp = p.maxHp; p.bleed = 0;
        this.needs.water = Math.max(this.needs.water, 0.5); this.needs.food = Math.max(this.needs.food, 0.5); // the clinic feeds you
        // Wake up on the clinic's doorstep (never inside a furniture pocket).
        const door = clinic.doors[0] ?? { x: (clinic.minX + clinic.maxX) / 2, z: clinic.maxZ + 2 };
        p.x = door.x; p.z = door.z;
        this.emit('respawn', { x: +p.x.toFixed(1), z: +p.z.toFixed(1) });
        const fee = Math.floor(this.cash * 0.15);
        this.cash -= fee;
        this.wanted = 0;
        for (const c of this.chars) if (c.grudge === p) { c.grudge = null; c.target = null; }
        this.hud.toast(`Doc Reyes patched you up. Fee: $${fee}`, 'warn');
      }
      return;
    }
    // Mouse -> ground.
    _ndc.set(I.mouse.nx, I.mouse.ny);
    _ray.setFromCamera(_ndc, this.camera);
    if (this.aimOverride) { this.aim.x = this.aimOverride.x; this.aim.z = this.aimOverride.z; }
    else if (_ray.ray.intersectPlane(_plane, _hit)) { this.aim.x = _hit.x; this.aim.z = _hit.z; }

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
    if (this.invUI.open) { p.speed = 0; if (p.inVehicle?.driver === p) { p.inVehicle.throttle = 0; p.inVehicle.steer = 0; } this.invUI.input(I); return; }
    if (I.hit('KeyI') || I.hit('Tab')) { this.invUI.toggle(true); return; }
    if (I.hit('KeyN')) { this.trySleep(); return; }
    if (I.hit('KeyV')) this.quickUse();

    const v = p.inVehicle;
    if (v) {
      p.x = v.x; p.z = v.z;
      const driving = v.driver === p;
      if (driving) {
        v.throttle = (I.key('KeyW') || I.key('ArrowUp') ? 1 : 0) - (I.key('KeyS') || I.key('ArrowDown') ? 1 : 0);
        v.steer = (I.key('KeyA') || I.key('ArrowLeft') ? 1 : 0) - (I.key('KeyD') || I.key('ArrowRight') ? 1 : 0);
        v.handbrake = I.key('Space');
        v.boost = I.key('ShiftLeft') || I.key('ShiftRight');
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
      if (I.hit('KeyF') || I.hit('Enter')) { this.exitVehicle(); return; }
      if (I.hit('KeyH') && v.harpoon && driving) this.vehiclesSys.fireHarpoon(v, Math.atan2(this.aim.x - v.x, this.aim.z - v.z));
      if (I.hit('KeyE') && !v.harpoon) { this.audio.horn(0); this.ambient.honk(v); }
      if (I.hit('KeyB') && driving) this.garage.drop(v); // oil, caltrops or smoke off the tail
      // Drive-by.
      this.handleShooting(dt, Math.atan2(this.aim.x - v.x, this.aim.z - v.z));
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
    if (p.vault) { this.interiors.stepVault(p, dt); this.hud.prompt(null); return; }
    let mx = 0, mz = 0;
    if (I.key('KeyW') || I.key('ArrowUp')) mz -= 1;
    if (I.key('KeyS') || I.key('ArrowDown')) mz += 1;
    if (I.key('KeyA') || I.key('ArrowLeft')) mx -= 1;
    if (I.key('KeyD') || I.key('ArrowRight')) mx += 1;
    p.crouch = I.key('ControlLeft') || I.key('ControlRight') || !!this.crouchOverride;
    p.stamina = p.stamina ?? 1;
    const wantSprint = (I.key('ShiftLeft') || I.key('ShiftRight') || !!this.autopilot?.run) && !p.crouch;
    const sprint = wantSprint && p.stamina > 0.04 && !this.skills.overloaded; // over your carry weight: no sprinting
    // No regen mid-dive: the roll is exertion. It used to refund most of its 0.25 cost before you landed.
    // Thirst and hunger slow the recovery and cap how full the tank gets (data/survival.js).
    p.stamina = Math.max(0, Math.min(this.needs.maxStamina, p.stamina + (sprint && p.speed > 1 ? -0.16 * this.skills.sprintDrainMul * this.skills.drainMul : p.dive > 0 ? 0 : 0.22 * this.needs.staminaRegen) * dt));
    // Dive roll: a burst forward along your movement (or facing), harder to hit mid-air.
    if (I.hit('Space') && !(p.dive > 0) && (p.diveCool ?? 0) <= 0 && p.stamina > 0.2) this.startDive(p, mx0(I), mz0(I));
    p.diveCool = (p.diveCool ?? 0) - dt;
    if (p.dive > 0) {
      p.dive -= dt;
      const f = p.dive > 0.25 ? 9.5 : 3; // flight, then belly slide
      const t = { x: p.x + p.diveDx * f * dt, z: p.z + p.diveDz * f * dt };
      this.statics.resolveCircle(t, p.radius, p); // a dive shoulders doors open and goes through windows
      p.x = t.x; p.z = t.z; p.speed = 0;
      if (p.vault) return; // dove into a window: through it
      if (p.dive <= 0) { this.emit('dived', { x: +p.x.toFixed(1), z: +p.z.toFixed(1) }); this.fx.dust(p.x, p.z, 3); }
      this.handleShooting(dt, p.face);
      return;
    }
    // Water: wade slow, swim slower (no shooting), Ctrl dives under on a breath meter.
    const wet = this.water.stateAt(p.x, p.z);
    p.swim = wet === 'swim';
    p.breath = p.breath ?? 1;
    p.underwater = p.swim && p.crouch;
    if (p.underwater) {
      p.breath = Math.max(0, p.breath - dt / 20);
      if (p.breath <= 0) this.combat.damage(p, 9 * dt, null, 0, 0, 'drown');
    } else p.breath = Math.min(1, p.breath + dt / 4);
    if (p.swim) p.stamina = Math.max(0, p.stamina - dt * 0.03);
    if (wet !== 'dry' && p.speed > 1 && Math.random() < dt * 8) this.fx.spawn(2, p.x, 0.2, p.z, (Math.random() - 0.5) * 2, 0.6, (Math.random() - 0.5) * 2, 0.6, 0.35, '#dfe9ea', 2);
    if (wet !== this.lastWet) { if (wet === 'swim') this.hud.toast('Swimming — [Ctrl] dive under (hold your breath)', 'job'); this.emit('water', { state: wet }); this.lastWet = wet; }
    const speed = (p.underwater ? 2.0 : p.swim ? 2.8 : wet === 'wade' ? 2.9 : p.crouch ? 2.2 : sprint ? 7.6 : 4.6) * this.skills.speedMul; // a heavy pack slows you
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
      this.statics.resolveCircle(t, p.radius, p); // doors swing open ahead of you; broken windows get climbed
      p.x = t.x; p.z = t.z;
      if (p.vault) return;
    }
    p.speed = Math.hypot(p.x - px, p.z - pz) / dt;
    const prevStep = Math.floor(p.walk / Math.PI);
    p.walk += stridePhase(p.speed, dt);
    if (Math.floor(p.walk / Math.PI) !== prevStep && p.speed > 0.5) {
      const onRoad = roadLines.some((c) => Math.abs(p.z - c) < 7 || Math.abs(p.x - c) < 7);
      this.audio.step(this.insideBuilding ? 'floor' : onRoad ? 'road' : 'sand', 0);
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
    const aimAng = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);
    p.face = angleLerp(p.face, aimAng, Math.min(1, dt * 18));
    p.aiming = true;
    // QOL: slow regen to 60% after 6s without taking damage.
    p.sinceHit = (p.sinceHit ?? 99) + dt;
    if (p.sinceHit > 6 && p.hp < 60) p.hp = Math.min(60, p.hp + dt * 4);
    if (p.bleed > 0) { p.bleed = Math.max(0, p.bleed - dt * 0.05); if (Math.random() < dt * 5 * p.bleed) this.fx.decal(p.x, p.z, 0.2 + Math.random() * 0.25, '#5a0606'); }
    if (sprint && len && Math.random() < dt * 6) this.fx.dust(p.x, p.z, 1);

    // Weapon select.
    this.inv.weapons.forEach((k, i) => { if (I.hit(`Digit${i + 1}`)) this.switchWeapon(k); });
    if (I.wheel) {
      const i = this.inv.weapons.indexOf(this.inv.current);
      this.switchWeapon(this.inv.weapons[(i + I.wheel + this.inv.weapons.length) % this.inv.weapons.length]);
    }
    if (I.hit('KeyR')) this.reload();
    if (I.hit('KeyX')) { const i = THROW_ORDER.indexOf(this.inv.throwable); for (let k = 1; k <= THROW_ORDER.length; k++) { const n = THROW_ORDER[(i + k) % THROW_ORDER.length]; if ((this.inv.throwables[n] ?? 0) > 0) { this.inv.throwable = n; break; } } this.audio.blip(); }
    this.updateThrowAim(dt, I);
    if (!p.swim) this.handleShooting(dt, p.face);
    p.aiming = !p.swim;

    // Interactions.
    let best = null, bd = 2.8;
    for (const c of this.chars) {
      if (c === p || !c.alive || c.inVehicle || c.faction === 'raider' || c.target === p) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd) { bd = d; best = c; }
    }
    let bestV = null, bv = 4.2;
    for (const veh of this.vehicles) {
      if (veh.dead) continue;
      const d = Math.hypot(veh.x - p.x, veh.z - p.z) - veh.len * 0.3;
      if (d < bv) { bv = d; bestV = veh; }
    }
    // Nobody to talk to and no car: E works the nearest door (kick) or window (smash, climb, board).
    const op = !best && !bestV ? this.interiors.playerInteract(p, I, dt) : null;
    // Nothing else in reach: a crate, a shelf, a body or a pile you could go through (E or I opens the pack on it).
    const box = !best && !bestV && !op ? this.inventory.nearest(p.x, p.z, 2.6) : null;
    // Or a bed (a mattress in a house): E lies down on it.
    const bed = !best && !bestV && !op && !box ? this.bedNear(p.x, p.z) : null;
    if (box) { this.boxRing.x = box.x; this.boxRing.z = box.z; this.boxRing.len = 1.6; }
    else if (bed) { this.boxRing.x = bed.x; this.boxRing.z = bed.z; this.boxRing.len = 2.1; }
    this.qol.highlight(best ?? bestV ?? op ?? (box || bed ? this.boxRing : null));
    if (best) this.hud.prompt(`<kbd>E</kbd> ${best.sleeping ? 'Wake' : 'Talk to'} ${best.npc ? best.npc.name : best.name}`);
    else if (bestV) this.hud.prompt(`<kbd>F</kbd> ${bestV.driver && bestV.driver.faction !== 'ally' ? 'Carjack' : bestV.fallen ? 'Pick up' : 'Drive'} ${bestV.name} · <kbd>C</kbd> Ride${bestV.driver ? ' along' : ' as passenger'} · <kbd>G</kbd> Hang on`);
    else if (box) this.hud.prompt(`<kbd>E</kbd> ${box.kind === 'ground' ? 'Pick through what\'s here' : box.id.startsWith('body:') ? 'Go through the body' : `Search the ${box.label.split(' · ')[0].toLowerCase()}`}${box.owner ? ` · <b class="warn">${box.ownerName}'s</b>` : ''}`);
    else if (bed) this.hud.prompt(`<kbd>E</kbd> Sleep · ${Math.round(this.needs.rest * 100)}% rested`);
    else if (!op) this.hud.prompt(null);
    if (best && I.hit('KeyE')) { if (best.sleeping) this.ai.wake(best, 'shaken awake'); this.dialogue.open(best); this.hud.prompt(null); }
    else if (box && I.hit('KeyE')) { this.invUI.toggle(true); this.hud.prompt(null); }
    else if (bed && I.hit('KeyE')) { const r = this.survival.sleepAt('bed', bed); if (!r.ok) this.hud.toast(r.why.toUpperCase(), 'warn'); this.hud.prompt(null); }
    else if (bestV && I.hit('KeyF')) { this.enterVehicle(bestV); this.hud.prompt(null); }
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
    p.cool -= dt;
    // At the wheel of a car with a hood gun: aim ahead and the gun fires; aim aside and you shoot out of the window.
    const car = p.inVehicle;
    if (car?.mounts?.front && car.driver === p && I.mouse.left && this.garage.fireFront(car, p, ang)) return;
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
    const want = w.auto ? I.mouse.left : I.mouse.leftPressed;
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
    const fired = p.inVehicle ? this.carCombat.fireFromVehicle(p, p.inVehicle, k, ang) : this.combat.fire(p, k, ang);
    if (fired) {
      this.inv.mag[k]--;
      p.cool = w.rate;
      if (this.inventory.shot(k)) { // every round wears it; a worn one may jam on the next
        this.audio.burst?.({ dur: 0.06, freq: 1500, type: 'bandpass', q: 5, vol: 0.4, decay: 0.05 }); // the action stops short
        this.hud.toast(`${w.short} JAMMED · R TO CLEAR`, 'warn');
      } else if (this.inv.mag[k] === 0 && this.qol.settings.autoReload) this.reload();
      this.hud.shake(w.shake * 0.4);
    }
  }

  // ---- camera ----------------------------------------------------------------------------
  // Step the zoom (Z out, Shift+Z in; - and =). Clamped at both ends rather than wrapping: a jump from the widest
  // view back to the closest mid-fight is disorienting.
  setZoom(i) {
    const n = Math.max(0, Math.min(ZOOM.levels.length - 1, i));
    if (n === this.zoomLevel) return this.zoomLevel;
    this.zoomLevel = n;
    this.hud.toast(`ZOOM · ${ZOOM.levels[n].name}`);
    this.emit('zoom', { level: n, name: ZOOM.levels[n].name });
    return n;
  }

  updateCamera(dt) {
    const p = this.player, v = p.inVehicle, L = ZOOM.levels[this.zoomLevel];
    let tx = p.x, tz = p.z, h = L.foot;
    if (v) {
      const sp = this.vehiclesSys.speed(v);
      h = Math.min(ZOOM.maxHeight, L.drive + sp * ZOOM.speedLift);
      tx = v.x + v.vx * 0.55; tz = v.z + v.vz * 0.55;
    } else {
      // Lean the view toward the cursor so you can see what you shoot (further out at a wider zoom).
      const lean = 8 * Math.max(1, L.foot / 33);
      tx += clamp((this.aim.x - p.x) * 0.25, -lean, lean);
      tz += clamp((this.aim.z - p.z) * 0.25, -lean, lean);
      if (this.insideBuilding) h = Math.min(h, ZOOM.indoor);
    }
    // Exponential smoothing: the same feel at 30 fps and at 144 (a per-frame blend factor is not).
    this.camHeight += (h - this.camHeight) * (1 - Math.exp(-dt * ZOOM.heightRate));
    const k = 1 - Math.exp(-dt * ZOOM.follow);
    this.camLook.x += (tx - this.camLook.x) * k;
    this.camLook.z += (tz - this.camLook.z) * k;
    // How much ground is on screen: the half-diagonal of the footprint, with room for the camera's tilt.
    const halfZ = this.camHeight * Math.tan((this.camera.fov * Math.PI) / 360), halfX = halfZ * this.camera.aspect;
    this.viewR = Math.hypot(halfX, halfZ) * 1.15;
    const s = this.hud.shakeV;
    const sx = (Math.random() - 0.5) * s * 1.2, sz = (Math.random() - 0.5) * s * 1.2;
    this.camera.position.set(this.camLook.x + sx, this.camHeight, this.camLook.z + this.camHeight * 0.14 + sz);
    this.camera.lookAt(this.camLook.x + sx, 0, this.camLook.z + sz);
  }

  updateInterior() {
    const p = this.player;
    let inside = null;
    if (!p.inVehicle) {
      for (const b of this.world.buildings) {
        if (!b.enterable || !b.roofIdx.length) continue;
        if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ) { inside = b; break; }
      }
    }
    if (inside !== this.insideBuilding) {
      if (this.insideBuilding) this.world.setRoofVisible(this.insideBuilding, true);
      if (inside) {
        this.world.setRoofVisible(inside, false);
        if (inside.shopName) this.hud.toast(inside.shopName.toUpperCase());
      }
      this.insideBuilding = inside;
    }
  }

  updatePopulation(dt) {
    // Bodies far from view eventually get cleaned up (the blood stays).
    for (let i = this.chars.length - 1; i >= 0; i--) {
      const c = this.chars[i];
      if (!c.alive && c !== this.player && !c.npc && c.deadTime > 90 && Math.hypot(c.x - this.player.x, c.z - this.player.z) > Math.max(70, this.viewR + 10)) this.removeChar(c);
    }
    // Dustwolves keep coming.
    this.raiderTimer -= dt;
    if (this.raiderTimer <= 0) {
      this.raiderTimer = 18;
      const alive = this.chars.filter((c) => c.alive && c.faction === 'raider').length;
      // As many as the band can field (faction sim strength), and only from camps it still holds.
      const S = this.society, cap = Math.round(30 * S.sim.str('dustwolves') / 100);
      if (alive < cap) {
        const camps = this.world.spawns.camps.filter((c, i) => S.places[`camp_${i}`]?.owner === 'dustwolves' && Math.hypot(c.x - this.player.x, c.z - this.player.z) > Math.max(80, this.viewR + 10));
        const camp = camps[Math.floor(Math.random() * camps.length)];
        if (camp) for (let k = 0; k < 2; k++) this.spawnRaider(camp.x + (Math.random() - 0.5) * 10, camp.z + (Math.random() - 0.5) * 10);
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
        <div class="tag">OF AMERICA · PHOENIX, ARIZONA · THE UNION IS GONE. THE ROADS REMAIN.</div>
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
          <div><b>T</b>fast time</div><div><b>Y</b>weather</div><div><b>P</b>pause</div>
        </div>
      </div>`;
    ui.appendChild(t);
    t.querySelector('.play').onclick = () => {
      t.remove();
      this.audio.start();
      this.paused = false;
      this.hud.toast('You wake up in Rust Haven. Find Sheriff Okonkwo at the north gate.', 'job');
      this.hud.subtitle('The Whaler is parked on Central Ave. Kenji says don\'t scratch it.', 6);
    };
    this.render(0.016);
  }

  frame(dt) {
    const I = this.input;
    this.qol.input(I);
    if (I.hit('F3')) { this.showStats = !this.showStats; this.hud.el.stats.classList.toggle('hidden', !this.showStats); }
    if (I.hit('F4')) { this.sky.sun.castShadow = !this.sky.sun.castShadow; this.hud.toast(`Shadows ${this.sky.sun.castShadow ? 'ON' : 'OFF'}`); }
    if (I.hit('KeyT') && !this.survival.sleep) { this.sky.fast = !this.sky.fast; this.hud.toast(this.sky.fast ? 'TIME ×40' : 'TIME NORMAL'); }
    if (I.hit('KeyY')) { this.sky.cycleWeather(); this.hud.toast(`WEATHER → ${this.sky.label}`); }
    if (I.hit('KeyZ')) this.setZoom(this.zoomLevel + (I.key('ShiftLeft') || I.key('ShiftRight') ? -1 : 1));
    if (I.hit('Minus')) this.setZoom(this.zoomLevel + 1);
    if (I.hit('Equal')) this.setZoom(this.zoomLevel - 1);
    if (I.hit('KeyL')) { this.flashOverride = this.flashOverride === undefined ? !(this.sky.night > 0.5) : !this.flashOverride; }
    if (this.paused) { // map/menu stay live while paused; people keep their poses (photo mode shoots anyone placed while frozen)
      this.charR.sync(this.chars, 0); this.qol.update(dt); I.endFrame(); return;
    }

    this.time += dt;
    const simDt = this.dialogue.active ? 0 : dt;
    if (simDt) this.interiors.update(simDt); // door leaves swing (and bash) before anyone moves
    this.updatePlayer(dt);
    this.nanGuard('player');
    if (simDt) {
      this.ai.update(simDt); this.nanGuard('ai');
      this.bases.update(simDt); // sentries watch the wire, searchlights sweep
      this.society.update(simDt);
      this.roles.update(simDt); // a counter until its second is up: the odometer, the gates, the street's reaction
      this.survival.update(simDt);
      this.skillsSys.update(simDt);
      this.vehiclesSys.update(simDt, this.sky.night); this.nanGuard('vehicles');
      this.garage.update(simDt);
      this.train.update(simDt); this.nanGuard('train');
      this.convoy.update(simDt); this.nanGuard('convoy');
      this.ambient.update(simDt);
      this.carCombat.update(simDt);
      this.vehDamage.update(simDt);
      this.throwables.update(simDt);
      this.water.update(simDt);
      if (this.fuelTrail.length > 400) this.fuelTrail.splice(0, this.fuelTrail.length - 400);
      this.zombies.update(simDt);
      this.updatePopulation(simDt);
      this.nanGuard('late');
    }
    this.dialogue.update(dt, I);
    this.fx.update(dt);
    this.updatePickups(dt);
    this.updateFootprints();
    this.updateInterior();
    this.updateCamera(dt);
    const p = this.player;
    this.sky.update(dt, this.camLook, this.world.groundMat, this.world.roadMat, this.viewR);
    this.world.glowMat.opacity = 0.03 + this.sky.night * 0.8;
    this.world.updateFlames(this.time);
    const flashOn = this.flashOverride ?? this.sky.night > 0.55;
    this.flashMat.opacity = flashOn && p.alive && !p.inVehicle ? 0.55 : 0;
    this.flashlight.position.set(p.x, 0, p.z);
    this.flashlight.rotation.y = p.face;
    this.charR.sync(this.chars, dt);
    const pv = p.inVehicle;
    this.audio.ambience(this.sky.cur.rain, Math.max(this.sky.cur.dust, this.sky.cur.ash * 0.5), pv ? this.vehiclesSys.speed(pv) : null, pv?.air && pv.throttle > 0 ? pv.throttle : 0);
    this.hud.update(dt);
    this.qol.update(dt);
    this.invUI.update(dt);
    this.feedback.update(dt);
    I.endFrame();
  }

  render(dt) {
    this.renderer.render(this.scene, this.camera);
    if (this.showStats) {
      const r = this.renderer.info.render;
      this.hud.stats(`FPS       ${this.fps.toFixed(0)}\nDRAWS     ${r.calls}\nTRIS      ${(r.triangles / 1000).toFixed(1)}k\nCHARS     ${this.chars.length} (${this.chars.filter((c) => c.alive).length} alive)\nVEHICLES  ${this.vehicles.length}\nSTATICS   ${this.statics.boxes.length}\nPOS       ${this.player.x.toFixed(0)}, ${this.player.z.toFixed(0)}`);
    }
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;
      // A bug in one system must never freeze the game: log it, keep the loop alive.
      try { this.frame(dt); this.render(dt); } catch (e) { this.reportError(e); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

const game = new Game();
window.game = game;   // raw engine access (debugging)
window.DL = game.api; // the agent API — see AGENTS.md
loadContentPacks(game.api).then(async () => {
  // Dev QOL: a full page reload (code edit) keeps your place in the world.
  const keep = sessionStorage.getItem('dl.hmr');
  if (keep) { sessionStorage.removeItem('dl.hmr'); try { restore(game, JSON.parse(keep)); game.emit('hmrRestored'); } catch (e) { console.warn('hmr restore failed', e); } }
  startBridge(game.api);
  const sc = new URLSearchParams(location.search).get('scenario');
  if (sc) console.log('[scenario]', sc, await game.api.call('scenario', { name: sc }));
});
if (import.meta.hot) import.meta.hot.on('vite:beforeFullReload', () => { try { if (!document.querySelector('.title')) sessionStorage.setItem('dl.hmr', JSON.stringify(snapshot(game))); } catch {} });
game.start();
