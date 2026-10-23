import { WEAPONS } from '../systems/combat.js';
import { VEHICLES } from '../systems/vehicles.js';
import { WEATHER } from '../systems/sky.js';
import { FLAGS, FLAG_KEYS } from '../ui/portrait.js';
import { NPCS } from '../data/npcs.js';
import { outfit } from '../systems/characters.js';
import { locationName, districtName, HALF } from '../world/city.js';
import { VERBS, TIERS, MEMORY_KINDS } from '../data/society.js';
import { EVENTS } from '../data/events.js';
import { PLATE, MOUNTS } from '../data/parts.js';
import { K } from '../systems/chronicle.js';
import { ITEMS, LOOT, GUN_ITEM, GUN_CARE } from '../data/items.js';
import { ZOOM } from '../data/camera.js';
import { DOOR, WINDOW, DOOR_MATERIALS } from '../data/interiors.js';
import { BASE_RULES } from '../data/bases.js';
import { RAY_BULLET } from '../engine/collision.js';
import { ROLE_TIERS } from '../data/roles.js';

// ============================================================================
// DSOA AGENT API
// Every command: JSON args in -> JSON-serialisable result out. Never throws:
// failures come back as { ok:false, error, hint }. The COMMANDS table below is
// the single source of truth: `help` prints it, the HTTP bridge + CLI route
// through it, and AGENTS.md documents it. Add a command = add one row.
// ============================================================================

const r1 = (v) => Math.round(v * 10) / 10;
// A chronicle record in plain words for agents.
const FLAG_NAMES = Object.entries(K);
const readRec = (g, r) => ({
  seq: r.seq, t: r.t, day: r.day, hour: r.hr, actor: r.a, actorFaction: r.af, verb: r.v, target: r.o || null, targetName: r.on || null, targetFaction: r.of || null,
  place: r.p, placeName: g.society.places[r.p]?.name ?? r.p, x: r.x, z: r.z, mag: r.m, witnesses: r.w.slice(), unidentified: r.un,
  flags: FLAG_NAMES.filter(([, bit]) => r.k & bit).map(([n]) => n), src: r.src,
});
const _mc = new MessageChannel();
const _q = [];
_mc.port1.onmessage = () => _q.shift()?.();
const yieldNow = () => new Promise((r) => { _q.push(r); _mc.port2.postMessage(0); });
const ang = (dx, dz) => Math.atan2(dx, dz);

function charView(g, c) {
  return {
    id: c.id, name: c.npc?.name ?? c.name, faction: c.faction, alive: c.alive, hp: Math.round(c.hp),
    x: r1(c.x), z: r1(c.z), weapon: c.weapon, flag: c.flag, named: !!c.npc, npcId: c.npc?.id ?? null,
    state: !c.alive ? 'dead' : c.inVehicle ? 'driving' : c.target ? 'fighting' : c.flee > 0 ? 'fleeing' : 'idle',
    vehicle: c.inVehicle?.id ?? null, hostileToPlayer: g.ai.hostile(c, g.player),
    dist: r1(Math.hypot(c.x - g.player.x, c.z - g.player.z)),
  };
}
function vehView(g, v) {
  return {
    id: v.id, type: v.type, name: v.name, x: r1(v.x), z: r1(v.z), heading: r1(v.h), speed: r1(g.vehiclesSys.speed(v)),
    hp: Math.round(v.hp), maxHp: v.maxHp, dead: v.dead, onFire: v.onFire > 0, damageBy: v.dmgLog ? Object.fromEntries(Object.entries(v.dmgLog).map(([k, a]) => [k, Math.round(a)])) : undefined, driver: v.driver?.id ?? null, ai: v.ai, harpoon: !!v.harpoon,
    dist: r1(Math.hypot(v.x - g.player.x, v.z - g.player.z)),
    ...g.carCombat.view(v),
    ...g.vehDamage.view(v),
    occupants: g.seats.occupants(v), seatsTotal: v.seats?.length ?? 0, fallen: !!v.fallen, boat: !!v.boat, sunk: !!v.sunk, waterDepth: r1(v.depth ?? 0),
  };
}

export class AgentAPI {
  constructor(game) {
    this.g = game;
    this.COMMANDS = buildCommands(this);
  }

  // Main entry: DL.call('teleport', {x:0, z:0}) — also used by the HTTP bridge.
  async call(cmd, args = {}) {
    const spec = this.COMMANDS[cmd];
    if (!spec) {
      const near = Object.keys(this.COMMANDS).filter((k) => k.toLowerCase().includes(String(cmd).toLowerCase().slice(0, 4)));
      return { ok: false, error: `unknown command "${cmd}"`, hint: near.length ? `did you mean: ${near.join(', ')}` : 'run "help" for the list' };
    }
    const a = { ...(args ?? {}) };
    for (const [k, s] of Object.entries(spec.args ?? {})) {
      if (a[k] === undefined && s.default !== undefined) a[k] = s.default;
      if (a[k] === undefined && s.required) return { ok: false, error: `missing arg "${k}"`, hint: `${cmd} args: ${fmtArgs(spec.args)}` };
      if (a[k] !== undefined && s.type === 'number') {
        a[k] = Number(a[k]);
        if (Number.isNaN(a[k])) return { ok: false, error: `arg "${k}" must be a number` };
      }
      if (a[k] !== undefined && s.type === 'boolean') a[k] = a[k] === true || a[k] === 'true' || a[k] === 1 || a[k] === '1';
      if (a[k] !== undefined && s.enum && !s.enum.includes(a[k])) return { ok: false, error: `arg "${k}" must be one of ${s.enum.join('|')}` };
    }
    try {
      // Watchdog: every command gets a wall-clock budget (default 90s) so nothing can hang the page.
      this.budgetS = Number(args?.budget ?? spec.budget ?? 90);
      const outer = this.deadline;
      this.deadline = Math.min(outer ?? Infinity, performance.now() + this.budgetS * 1000);
      let out;
      try { out = await spec.run(a); } finally { this.deadline = outer; }
      return { ok: true, ...(out && typeof out === 'object' && !Array.isArray(out) ? out : { result: out }) };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e), hint: `${cmd} args: ${fmtArgs(spec.args)}` };
    }
  }

  // Sugar so console/scenario code can do `await DL.teleport({x,z})`.
  bind() {
    // Command names always win, so DL.step() is the command, never an internal helper.
    for (const k of Object.keys(this.COMMANDS)) this[k] = (a) => this.call(k, a);
    return this;
  }

  // Deterministic fixed-step simulation. Works when the tab is hidden (rAF paused).
  async _step(frames, dt = 1 / 60) {
    const g = this.g;
    const wasPaused = g.paused;
    g.paused = false;
    let slice = performance.now();
    for (let i = 0; i < frames; i++) {
      try { g.frame(dt); } catch (e) { g.reportError(e); }
      // Yield to the event loop every ~30ms so the bridge keeps polling and the page stays alive.
      if (performance.now() - slice > 30) {
        await yieldNow();
        slice = performance.now();
        if (this.deadline && performance.now() > this.deadline) throw new Error(`command exceeded its ${this.budgetS}s wall-clock budget (raise with budget=<s>)`);
      }
    }
    g.paused = wasPaused;
    g.render(dt);
  }

  findChar(id) {
    const g = this.g;
    if (id === 'player' || id === undefined) return g.player;
    if (id === 'hostile' || id === 'nearestHostile') {
      // Nearest living character hostile to (or fighting) the player.
      let best = null, bd = Infinity;
      for (const c of g.chars) {
        if (c === g.player || !c.alive || c.inVehicle || !(g.ai.hostile(c, g.player) || c.target === g.player)) continue;
        const d = Math.hypot(c.x - g.player.x, c.z - g.player.z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    }
    return g.chars.find((c) => c.id === id || c.npc?.id === id || (c.name && c.name.toLowerCase() === String(id).toLowerCase()) || (c.npc?.name ?? '').toLowerCase() === String(id).toLowerCase());
  }
  findVeh(id) { return this.g.vehicles.find((v) => v.id === id || v.type === id); }

  dialogueState() {
    const d = this.g.dialogue;
    if (!d.active) return { open: false };
    return { open: true, npc: d.npc.id, name: d.npc.npc?.name ?? d.npc.name, text: d.full, choices: d.choices.map((c, i) => ({ index: i, text: c.t, ends: !!c.end })) };
  }
}

function fmtArgs(args = {}) {
  const e = Object.entries(args);
  if (!e.length) return '(none)';
  return e.map(([k, s]) => `${k}${s.required ? '' : '?'}:${s.enum ? s.enum.join('|') : s.type}`).join(' ');
}

function buildCommands(api) {
  const g = api.g;
  const P = () => g.player;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };

  return {
    // ---------------------------------------------------------------- meta
    help: {
      group: 'meta', desc: 'List every command with its args. Pass {cmd} for one command.',
      args: { cmd: { type: 'string' } },
      run: async ({ cmd }) => {
        const list = Object.entries(api.COMMANDS).filter(([k]) => !cmd || k === cmd)
          .map(([k, s]) => ({ cmd: k, group: s.group, desc: s.desc, args: fmtArgs(s.args), schema: s.args ?? {} }));
        return { commands: list };
      },
    },
    start: {
      group: 'meta', desc: 'Dismiss the title screen and unpause (needed once after page load unless ?agent=1).',
      run: async () => { document.querySelector('.title .play')?.click(); g.paused = false; return { paused: g.paused }; },
    },
    pause: { group: 'meta', desc: 'Pause or resume the realtime loop.', args: { on: { type: 'boolean', default: true } }, run: async ({ on }) => { g.paused = on; return { paused: on }; } },
    step: {
      group: 'meta', desc: 'Advance the simulation deterministically by N seconds at a fixed 60Hz step (runs even if tab hidden). Returns state + new events.',
      args: { seconds: { type: 'number', default: 1 }, dt: { type: 'number', default: 1 / 60 } },
      run: async ({ seconds, dt }) => {
        need(seconds > 0 && seconds <= 120, 'seconds must be in (0,120]');
        const since = g.eventSeq;
        await api._step(Math.round(seconds / dt), dt);
        return { ...(await api.COMMANDS.state.run({})), events: g.events.filter((e) => e.seq > since) };
      },
    },
    state: {
      group: 'observe', desc: 'Snapshot: player, vehicle, inventory, time, weather, wanted, quests, dialogue, nearby counts.',
      run: async () => {
        const p = P(), v = p.inVehicle;
        const near = g.chars.filter((c) => c !== p && c.alive && Math.hypot(c.x - p.x, c.z - p.z) < 40);
        return {
          player: { id: p.id, x: r1(p.x), z: r1(p.z), facing: r1(p.face), hp: Math.round(p.hp), maxHp: p.maxHp, alive: p.alive, inBuilding: !!g.insideBuilding, stamina: r1(p.stamina ?? 1), crouch: !!p.crouch, water: g.water.stateAt(p.x, p.z), underwater: !!p.underwater, breath: r1(p.breath ?? 1), onTrain: !!p.onTrain, burning: (p.burning ?? 0) > 0, seat: p.inVehicle ? p.inVehicle.seats[p.seat]?.id : null,
            location: locationName(p.x, p.z), district: districtName(p.x, p.z) },
          vehicle: v ? vehView(g, v) : null,
          inventory: { weapons: g.inv.weapons, current: g.inv.current, mag: g.inv.mag, ammo: g.inv.ammo, cond: g.inv.cond, jam: g.inv.jam },
          cash: g.cash, wanted: g.wanted, quests: g.quests, stats: g.stats, society: g.society.view(), needs: g.survival.view(), body: g.skillsSys.view(),
          world: { time: g.sky.clock, hour: r1(g.sky.time), phase: g.sky.phase, weather: g.sky.weatherKey, night: r1(g.sky.night) },
          dialogue: api.dialogueState(),
          nearby: { hostiles: near.filter((c) => g.ai.hostile(c, p)).length, npcs: near.filter((c) => c.npc).map((c) => c.id), total: near.length },
          paused: g.paused, lastEvent: g.eventSeq,
        };
      },
    },
    query: {
      group: 'observe', desc: 'Find entities. type=char|vehicle|building|pickup|camp. Filters: x,z,radius (default around player), faction, alive, named, limit.',
      args: { type: { type: 'string', default: 'char', enum: ['char', 'vehicle', 'building', 'pickup', 'camp'] }, x: { type: 'number' }, z: { type: 'number' }, radius: { type: 'number', default: 60 },
        faction: { type: 'string' }, alive: { type: 'boolean' }, named: { type: 'boolean' }, limit: { type: 'number', default: 25 } },
      run: async ({ type, x, z, radius, faction, alive, named, limit }) => {
        const cx = x ?? P().x, cz = z ?? P().z;
        const within = (ox, oz) => Math.hypot(ox - cx, oz - cz) <= radius;
        const sortD = (a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz);
        let out;
        if (type === 'char') out = g.chars.filter((c) => c !== P() && within(c.x, c.z) && (!faction || c.faction === faction) && (alive === undefined || c.alive === alive) && (named === undefined || !!c.npc === named)).sort(sortD).map((c) => charView(g, c));
        else if (type === 'vehicle') out = g.vehicles.filter((v) => within(v.x, v.z)).sort(sortD).map((v) => vehView(g, v));
        else if (type === 'building') out = g.world.buildings.filter((b) => within((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2)).map((b) => ({ x: r1((b.minX + b.maxX) / 2), z: r1((b.minZ + b.maxZ) / 2), w: r1(b.maxX - b.minX), d: r1(b.maxZ - b.minZ), enterable: b.enterable, doors: b.doors.map((d) => ({ x: r1(d.x), z: r1(d.z) })), name: b.shopName ?? null }));
        else if (type === 'pickup') out = g.pickups.filter((it) => it.alive && within(it.x, it.z)).map((it) => ({ kind: it.type, x: r1(it.x), z: r1(it.z) }));
        else out = g.world.spawns.camps.map((c, i) => ({ id: i, x: c.x, z: c.z, dist: r1(Math.hypot(c.x - P().x, c.z - P().z)) }));
        return { count: out.length, items: out.slice(0, limit) };
      },
    },
    events: {
      group: 'observe', desc: 'Structured event log (kill, pickup, dialogueOpen, dialogueChoice, enterVehicle, exitVehicle, arrived, toast...). Pass since=<seq>.',
      args: { since: { type: 'number', default: 0 }, type: { type: 'string' } },
      run: async ({ since, type }) => ({ events: g.events.filter((e) => e.seq > since && (!type || e.type === type)), last: g.eventSeq }),
    },
    map: {
      group: 'observe', desc: 'World layout summary: bounds, districts, road lines, shops (named buildings), raider camps, military bases (base for the detail), named NPC homes.',
      run: async () => ({
        bounds: { min: -HALF, max: HALF }, units: 'metres; +x east, +z south (screen down); heading 0 = facing +z',
        districts: [{ name: 'RUST HAVEN', rule: 'max(|x|,|z|) < 88, walled settlement, gates on roads' }, { name: 'OLD PHOENIX RUINS', rule: '88 <= max < 250' }, { name: 'THE GLASS FLATS', rule: 'max >= 250, desert, raider camps, the Federal Remnant outpost' }],
        roads: { spacing: 80, lines: [-320, -240, -160, -80, 0, 80, 160, 240, 320], route66: 'z = 0, spans the whole map' },
        shops: g.world.spawns.shops.filter((b) => b.shopName).map((b) => ({ name: b.shopName, x: r1((b.minX + b.maxX) / 2), z: r1((b.minZ + b.maxZ) / 2) })),
        camps: g.world.spawns.camps,
        bases: g.bases.sites.map((s) => ({ id: s.id, name: s.name, faction: s.faction, x: s.ox, z: s.oz, fence: { ...s.fence }, gate: { x: s.ox + s.row.gate.at, z: s.row.gate.side === 'N' ? s.fence.z0 : s.fence.z1 }, alert: s.alert })),
        namedNpcs: g.chars.filter((c) => c.npc).map((c) => ({ id: c.id, npc: c.npc.id, name: c.npc.name, x: r1(c.x), z: r1(c.z) })),
      }),
    },
    perf: {
      group: 'observe', desc: 'Frame rate, draw calls, triangles, entity counts.',
      run: async () => {
        const i = g.renderer.info;
        return { fps: Math.round(g.fps), drawCalls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures,
          chars: g.chars.length, alive: g.chars.filter((c) => c.alive).length, vehicles: g.vehicles.length, statics: g.statics.boxes.length, decalsBudget: 1200, particlesBudget: 2400,
          audio: { context: g.audio.ctx?.state ?? 'not started', played: g.audio.counts },
          society: { witnessMsMax: +g.society.deeds.witnessMsMax.toFixed(3), deeds: g.society.deeds.deeds, rumorsPending: g.society.deeds.pending, rumorOverflow: g.society.deeds.overflow },
          interiors: { doors: g.interiors.doors.length, leaves: g.interiors.leaves.length, windows: g.interiors.windows.length, leavesSimulating: g.interiors.active.length },
          runtimeErrors: g.errors ?? [] };
      },
    },
    screenshot: {
      group: 'observe', desc: 'Render the world as a JPEG data URL (fixed size, works in hidden tabs). Optional x,z to look at a spot, zoom = camera height (8 = close-up, 33 = default, 90 = overview) and tilt (0.14 = the game camera, 0 = straight down … 1.6 = low angle from the south; negative = from the north, upside down, to see the front of north-facing cars). In photo mode it shoots the photo framing. CLI: --out file.jpg saves it.',
      args: { quality: { type: 'number', default: 0.82 }, width: { type: 'number', default: 1280 }, height: { type: 'number', default: 720 }, x: { type: 'number' }, z: { type: 'number' }, zoom: { type: 'number' }, tilt: { type: 'number' } },
      run: async ({ quality, width, height, x, z, zoom, tilt }) => {
        // Render at a fixed size so it works even when the tab is hidden / 0x0.
        const r = g.renderer, cam = g.camera;
        const prevPR = r.getPixelRatio(), prevW = r.domElement.width, prevH = r.domElement.height, prevAspect = cam.aspect;
        r.setPixelRatio(1); r.setSize(width, height, false);
        cam.aspect = width / height; cam.updateProjectionMatrix();
        if (g.qol.photo) g.qol.placePhotoCamera(); else g.updateCamera(0.016);
        if (x !== undefined || z !== undefined || zoom || tilt !== undefined) {
          // Camera override for close-ups / inspecting a spot: zoom = camera height in metres.
          const cx = x ?? g.camLook.x, cz = z ?? g.camLook.z, h = zoom ?? g.camHeight, t = Math.max(-1.6, Math.min(1.6, tilt ?? 0.14));
          cam.position.set(cx, h, cz + h * t); cam.lookAt(cx, 0, cz);
        }
        r.render(g.scene, cam);
        const image = r.domElement.toDataURL('image/jpeg', quality);
        r.setPixelRatio(prevPR); r.setSize(Math.max(1, prevW / prevPR), Math.max(1, prevH / prevPR), false);
        cam.aspect = prevAspect; cam.updateProjectionMatrix();
        return { image, width, height, note: 'world render only; DOM HUD not included' };
      },
    },

    // ---------------------------------------------------------------- player
    teleport: {
      group: 'player', desc: 'Move the player (and their vehicle) to x,z. Snaps out of walls.',
      args: { x: { type: 'number', required: true }, z: { type: 'number', required: true } },
      run: async ({ x, z }) => {
        const p = P(), v = p.inVehicle;
        const pos = { x, z };
        g.statics.resolveCircle(pos, v ? v.wid * 0.6 : 0.5);
        if (v) { v.x = pos.x; v.z = pos.z; v.vx = v.vz = 0; }
        p.x = pos.x; p.z = pos.z;
        g.camLook.x = pos.x; g.camLook.z = pos.z;
        return { x: r1(pos.x), z: r1(pos.z), location: locationName(pos.x, pos.z) };
      },
    },
    moveTo: {
      group: 'player', desc: 'Walk (or run) to x,z — or to a moving character/vehicle with id — along an A* path around walls, through doors and around parked cars. With wait=true, steps the sim until arrival or maxSeconds of game time (default 120, cap 600). Running covers ~7.6 m/s.',
      args: { x: { type: 'number' }, z: { type: 'number' }, id: { type: 'string' }, run: { type: 'boolean', default: false }, wait: { type: 'boolean', default: true }, maxSeconds: { type: 'number', default: 120 }, tolerance: { type: 'number' } },
      run: async ({ x, z, id, run, wait, maxSeconds, tolerance }) => {
        // id: walk up to a (possibly moving) character or vehicle and stop beside it.
        const follow = id ? (api.findChar(id) ?? api.findVeh(id)) : null;
        need(!id || follow, `no entity ${id}`);
        need(follow || (x !== undefined && z !== undefined), 'give x,z or id');
        if (follow) { x = follow.x; z = follow.z; tolerance ??= follow.len ? follow.len * 0.5 + 1.5 : 2.2; }
        tolerance ??= 1;
        need(!P().inVehicle, 'player is in a vehicle; use drive or exitVehicle');
        need(P().alive, 'player is dead; step ~5s to respawn at the clinic');
        const path = g.footPath(P().x, P().z, x, z);
        need(path, `no walkable path from (${r1(P().x)}, ${r1(P().z)}) to (${r1(x)}, ${r1(z)}) — target inside a solid building or walled off?`);
        // Following: walk right up to the reachable cell beside the target (tolerance 1);
        // "arrived" is then judged against the target itself (outer loop).
        g.autopilot = { x, z, run, tolerance: follow ? 1 : tolerance, path, i: 0, follow };
        let best = Infinity, bestT = 0, lost = false;
        if (!wait) return { moving: true };
        let t = 0;
        const hp0 = P().hp;
        let interrupted;
        while ((g.autopilot || (follow && Math.hypot(follow.x - P().x, follow.z - P().z) > tolerance)) && t < Math.min(600, maxSeconds)) {
          if (!g.autopilot && follow) {
            // Reached where they were, but they moved on: re-plan to their live position. Give up once
            // 3 s of chasing hasn't got us 0.5 m closer: as close as the world (or their pace) allows.
            // One re-plan without progress used to end it, so anyone on the move (an NPC in a gunfight,
            // you out of breath) shook the follower off while it was still gaining on them.
            const here = Math.hypot(follow.x - P().x, follow.z - P().z);
            if (here < best - 0.5) { best = here; bestT = t; } else if (t - bestT >= 3) { lost = true; break; }
            const np = g.footPath(P().x, P().z, follow.x, follow.z);
            if (!np) break;
            g.autopilot = { x: follow.x, z: follow.z, run, tolerance: 1, path: np, i: 0, follow };
          }
          await api._step(15); t += 0.25;
          if (follow && g.autopilot) {
            // Re-aim at a moving target; re-plan if it wandered more than 3m from the plan.
            const ap = g.autopilot;
            if (Math.hypot(follow.x - ap.x, follow.z - ap.z) > 3) { ap.x = follow.x; ap.z = follow.z; const np = g.footPath(P().x, P().z, ap.x, ap.z); if (np) { ap.path = np; ap.i = 0; } }
            if (Math.hypot(follow.x - P().x, follow.z - P().z) < tolerance) { g.autopilot = null; break; }
          }
          if (!P().alive) { interrupted = 'player died'; break; }
          if (hp0 - P().hp > 25) { interrupted = `under fire (hp ${Math.round(P().hp)}) — consider engage`; break; }
        }
        const arrived = follow ? Math.hypot(follow.x - P().x, follow.z - P().z) <= tolerance + 0.5 : !g.autopilot;
        g.autopilot = null;
        g.autopilot = null;
        return { arrived, interrupted, x: r1(P().x), z: r1(P().z), secondsUsed: t, remaining: arrived ? 0 : Math.round(Math.hypot(x - P().x, z - P().z)), hint: arrived || interrupted ? undefined : lost ? `couldn't close on ${id} (no progress for 3 s): out of reach, or faster than you` : `ran out of time (${maxSeconds}s game time) — raise maxSeconds, or find a vehicle for long trips` };
      },
    },
    aim: { group: 'player', desc: 'Lock the aim point to x,z (null x to release back to the mouse).', args: { x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ x, z }) => { g.aimOverride = x === undefined ? null : { x, z }; return { aim: g.aimOverride }; } },
    fire: {
      group: 'player', desc: 'Fire the current weapon at x,z or entity id (id="hostile" = nearest enemy, re-acquired every shot). Auto-reloads. shots=N fires N rounds, stepping the sim between them.',
      args: { x: { type: 'number' }, z: { type: 'number' }, id: { type: 'string' }, shots: { type: 'number', default: 1 } },
      run: async ({ x, z, id, shots }) => {
        const p = P();
        need(p.alive, 'player is dead');
        let killed = 0;
        const before = g.stats.kills;
        for (let i = 0; i < shots; i++) {
          let tx = x, tz = z;
          if (id) {
            const t = api.findChar(id) ?? api.findVeh(id);
            if (!t && id === 'hostile') return { fired: i, killed: g.stats.kills - before, note: 'no hostiles left' };
            need(t, `no entity ${id}`); tx = t.x; tz = t.z;
          }
          need(p.alive, 'player died');
          need(tx !== undefined && tz !== undefined, 'give x,z or id');
          const k = g.inv.current, w = WEAPONS[k];
          if (g.inventory.cond(k) <= 0) return { fired: i, killed: g.stats.kills - before, error: 'gun broken', hint: 'gun fix=true (the gunsmith), or equip another' };
          if (g.inv.jam[k]) { g.inventory.cleared(k); await api._step(Math.round(GUN_CARE.clearTime * 60)); } // work the action
          if (g.inv.mag[k] <= 0) {
            if (g.inv.ammo[w.ammo] <= 0) return { fired: i, error: 'out of ammo', ammo: g.inv.ammo };
            const take = Math.min(w.mag, g.inv.ammo[w.ammo]); g.inv.mag[k] = take; g.inv.ammo[w.ammo] -= take; await api._step(Math.round(w.reload * 60));
          }
          const sx = p.inVehicle ? p.inVehicle.x : p.x, sz = p.inVehicle ? p.inVehicle.z : p.z;
          if (id && !g.statics.lineOfSight(sx, sz, tx, tz)) return { fired: i, killed: g.stats.kills - before, blocked: true, hint: 'no line of sight (wall in the way); use engage to path around it' };
          p.face = ang(tx - sx, tz - sz);
          const car = p.inVehicle;
          if (car ? g.carCombat.fireFromVehicle(p, car, k, p.face) : g.combat.fire(p, k, p.face)) { g.inv.mag[k]--; g.inventory.shot(k); }
          await api._step(Math.max(1, Math.round(w.rate * 60)));
        }
        killed = g.stats.kills - before;
        return { killed, mag: g.inv.mag[g.inv.current], reserve: g.inv.ammo[WEAPONS[g.inv.current].ammo], cond: +g.inventory.cond(g.inv.current).toFixed(3), jammed: !!g.inv.jam[g.inv.current] };
      },
    },
    engage: {
      group: 'player', desc: 'On-foot combat autopilot: repeatedly pick the nearest enemy (or id), path toward it until there is line of sight and it is in range, shoot, reload, repeat. Stops when no enemies within radius, out of ammo, dead, or seconds elapse.',
      args: { id: { type: 'string', default: 'hostile' }, seconds: { type: 'number', default: 20 }, radius: { type: 'number', default: 60 }, minHp: { type: 'number', default: 0 } },
      run: async ({ id, seconds, radius, minHp }) => {
        const p = P();
        need(!p.inVehicle, 'engage is on foot; exitVehicle first (or drive into them)');
        need(p.alive, 'player is dead');
        const k0 = g.stats.kills, t0 = g.time;
        let reason = 'time';
        while (g.time - t0 < seconds) {
          if (!p.alive) { reason = 'died'; break; }
          if (p.hp < minHp) { reason = 'low health'; break; }
          const t = api.findChar(id);
          if (!t || Math.hypot(t.x - p.x, t.z - p.z) > radius) { reason = 'no enemies in radius'; break; }
          const k = g.inv.current, w = WEAPONS[k];
          const usable = (o) => g.inventory.cond(o) > 0 && (g.inv.mag[o] > 0 || g.inv.ammo[WEAPONS[o].ammo] > 0);
          if (!usable(k)) {
            const other = g.inv.weapons.find(usable);
            if (other) { g.switchWeapon(other); continue; }
            reason = g.inventory.cond(k) <= 0 ? 'gun broken' : 'out of ammo'; break;
          }
          const d = Math.hypot(t.x - p.x, t.z - p.z);
          const los = g.statics.lineOfSight(p.x, p.z, t.x, t.z);
          if (los && d < w.range * 0.75) {
            g.autopilot = null;
            await api.call('fire', { id: t.id, shots: w.auto ? 4 : 1 });
          } else {
            const path = g.nav.foot.find(p.x, p.z, t.x, t.z);
            if (!path) { reason = 'unreachable target'; break; }
            g.autopilot = { x: t.x, z: t.z, run: true, tolerance: 2, path, i: 0 };
            await api._step(12);
          }
        }
        g.autopilot = null;
        return { stopped: reason, kills: g.stats.kills - k0, hp: Math.round(p.hp), mag: g.inv.mag[g.inv.current], reserve: g.inv.ammo[WEAPONS[g.inv.current].ammo], weapon: g.inv.current };
      },
    },
    throw: {
      group: 'player', desc: 'Throw a throwable (frag|molotov|smoke|flash|pipe|sticky|rock) at x,z or entity id; works on foot or out of a car window (knocks the glass out). cook = seconds held first (frag only). Steps the sim until it resolves (max 6s) and reports what happened.',
      args: { type: { type: 'string', default: 'frag', enum: ['frag', 'molotov', 'smoke', 'flash', 'pipe', 'sticky', 'rock'] }, x: { type: 'number' }, z: { type: 'number' }, id: { type: 'string' }, cook: { type: 'number', default: 0 }, wait: { type: 'boolean', default: true } },
      run: async ({ type, x, z, id, cook, wait }) => {
        const p = P();
        need(p.alive, 'player is dead');
        if (id) { const t = api.findChar(id) ?? api.findVeh(id); need(t, `no entity ${id}`); x = t.x; z = t.z; }
        need(x !== undefined && z !== undefined, 'give x,z or id');
        need((g.inv.throwables[type] ?? 0) > 0, `no ${type} left; inventory: ${JSON.stringify(g.inv.throwables)} (give ${type}=N)`);
        g.inv.throwables[type]--;
        const since = g.eventSeq, k0 = g.stats.kills;
        const proj = g.throwables.throw(p, type, x, z, cook);
        if (wait) for (let t = 0; t < 6 && g.throwables.list.includes(proj); t += 0.1) await api._step(6);
        if (wait) await api._step(30);
        const ev = g.events.filter((e) => e.seq > since && ['detonated', 'ignited', 'windowBroken', 'kill', 'fire'].includes(e.type));
        return { thrown: type, landed: { x: r1(proj.x), z: r1(proj.z) }, stuckTo: proj.stuck?.ref?.id ?? null, kills: g.stats.kills - k0, effects: ev, left: g.inv.throwables[type] };
      },
    },
    dive: {
      group: 'player', desc: 'Dive-roll toward x,z (or facing): ~5m burst, most bullets miss mid-air, costs stamina.',
      args: { x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ x, z }) => {
        const p = P();
        need(!p.inVehicle && p.alive, 'must be on foot');
        need((p.stamina ?? 1) > 0.2, 'too winded to dive (stamina)');
        const x0 = p.x, z0 = p.z;
        g.startDive(p, x !== undefined ? x - p.x : 0, z !== undefined ? z - p.z : 0);
        await api._step(42);
        return { moved: r1(Math.hypot(p.x - x0, p.z - z0)), x: r1(p.x), z: r1(p.z), stamina: r1(p.stamina) };
      },
    },
    crouch: { group: 'player', desc: 'Hold a crouch on/off (slower, quieter, harder to spot). Keyboard: hold Ctrl.', args: { on: { type: 'boolean', default: true } },
      run: async ({ on }) => { g.crouchOverride = on; P().crouch = on; return { crouch: on }; } },
    photo: {
      group: 'observe', desc: 'Photo mode: on=true freezes the world and hides the HUD; x,z,zoom (camera height 6-160), tilt (0 = straight down … 1.6 = low angle) frame the shot. Take it with screenshot, then on=false. Keyboard: K.',
      args: { on: { type: 'boolean', default: true }, x: { type: 'number' }, z: { type: 'number' }, zoom: { type: 'number' }, tilt: { type: 'number' } },
      run: async ({ on, x, z, zoom, tilt }) => {
        if (!on) { if (g.qol.photo) g.qol.togglePhoto(false); return { photo: false }; }
        if (!g.qol.photo) g.qol.togglePhoto(true);
        const ph = g.qol.photo;
        if (x !== undefined) ph.x = x; if (z !== undefined) ph.z = z;
        if (zoom !== undefined) ph.h = Math.max(6, Math.min(160, zoom)); if (tilt !== undefined) ph.tilt = Math.max(0, Math.min(1.6, tilt));
        g.qol.updatePhoto(0, g.input);
        return { photo: true, ...ph };
      },
    },
    ambient: {
      group: 'observe', desc: 'Ambient detail state: tyre tracks and brass on the ground (capped by their ring buffers; tracksLaid/brassEjected are running totals for before/after checks), tumbleweeds near you, vultures (and whether gunfire spooked them), who is cowering.',
      run: async () => g.ambient.view(),
    },
    honk: { group: 'player', desc: 'Sound the horn of the vehicle you are in: people in front leap aside. Keyboard: E while driving.', run: async () => { need(P().inVehicle, 'not in a vehicle'); g.audio.horn(0); return { dodged: g.ambient.honk(P().inVehicle) }; } },
    hud: {
      group: 'observe', desc: 'What the HUD is showing right now (screenshots only capture the 3D world): kill feed, damage-direction arcs (bearing 0 = north/screen-up, clockwise), name tags with flags, compass heading + markers (waypoint, train, convoy), floating texts, lens blood, and under plates: clock/weather, wanted, cash, street sign, health/stamina segments, food/water gauges (null without a needs system), the flag patch, the faction respect chips (standing, and the reading your roles colour it to), the role tapes on the status plate (what the world calls you: role id, text, chevrons for the tier), the weapon plate (mag, reserve, cartridges, dog tags, throwable) or the dash gauge.',
      run: async () => ({ ...g.feedback.view(), plates: g.hud.view() }),
    },
    train: {
      group: 'world', desc: 'The Iron Line freight (rail x=-360, Dust Bowl Station z=110, Route 66 crossing z=0). action: status | board (player climbs onto the nearest car — must be beside the track) | leave (jump off; hurts above ~6 m/s) | summon (put the train 80 m north of the station, arriving) | place (nose at z, cruising south — for staging) | blowTanker.',
      args: { action: { type: 'string', default: 'status' }, z: { type: 'number' } },
      run: async ({ action, z }) => {
        const T = g.train;
        if (action === 'board') { if (P().inVehicle) g.exitVehicle(true); need(T.canBoard(P()) || T.speed < 7 && T.present && Math.abs(P().x - T.view().x) < 5, 'not beside a slow/stopped train (walk up to the track, or summon it)'); T.board(P()); await api._step(2); }
        else if (action === 'leave') { need(P().onTrain, 'not on the train'); T.leave(P()); }
        else if (action === 'summon') { T.state = 'running'; T.head = T.view().station.z - 80; T.speed = 12; }
        else if (action === 'place') { need(z !== undefined, 'give z'); T.state = 'running2'; T.head = z; T.speed = 17; }
        else if (action === 'blowTanker') { const c = T.cars.find((k) => k.kind === 'tanker'); need(T.present && !c.blown, 'no intact tanker in the world right now'); T.hitCar(c, 9999, P()); }
        return { ...T.view(), onTrain: !!P().onTrain };
      },
    },
    convoy: {
      group: 'world', desc: 'Dustwolf war convoys on Route 66 (lead buggy, bike outriders, gun-truck with a bed gunner, loot hauler). action: status | spawn (dir=east|west; default rolls toward the player) | engage (break formation now) | clear. Kill the hauler for its cargo.',
      args: { action: { type: 'string', default: 'status' }, dir: { type: 'string' } },
      run: async ({ action, dir }) => {
        const Cv = g.convoy;
        if (action === 'spawn') Cv.spawn(dir === 'east' ? 1 : dir === 'west' ? -1 : 0);
        else if (action === 'engage') { need(Cv.active, 'no convoy on the road (spawn one)'); Cv.engage('agent'); }
        else if (action === 'clear') Cv.despawn();
        return Cv.view();
      },
    },
    water: {
      group: 'observe', desc: 'Water depth at x,z (default: the player) and what it means: dry | wade | swim. Also lists where the water is (river, lake, bridge, dock).',
      args: { x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ x, z }) => {
        const px = x ?? P().x, pz = z ?? P().z;
        return { depth: r1(g.water.depthAt(px, pz)), state: g.water.stateAt(px, pz), places: { lake: { x: 390, z: 398, r: 52 }, bridge: { x: 416, z: 0 }, dock: { x: 360, z: 382 }, river: 'runs north-south around x≈410-428 on the east edge' } };
      },
    },
    doors: {
      group: 'world', desc: 'Doors near x,z (default: you) within radius: id, kind (front = a shop\'s double door | back | inner), axis the wall runs along, width, leaves, material (wood|metal), locked, state (closed|ajar|open), angle in degrees (the widest leaf, signed by the side it swung to), kicksLeft, lockHp, the outside/inside points 2.5 m off it, kickFrom (a spot within a boot\'s reach), its building. locked=true lists only locked ones.',
      args: { x: { type: 'number' }, z: { type: 'number' }, radius: { type: 'number', default: 25 }, limit: { type: 'number', default: 20 }, locked: { type: 'boolean' } },
      run: async ({ x, z, radius, limit, locked }) => {
        const cx = x ?? P().x, cz = z ?? P().z, I2 = g.interiors;
        const near = I2.doors.filter((d) => Math.hypot(d.x - cx, d.z - cz) <= radius && (locked === undefined || d.locked === locked))
          .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
        return { count: near.length, total: I2.doors.length, lockedTotal: I2.doors.filter((d) => d.locked).length, items: near.slice(0, limit).map((d) => I2.doorView(d)) };
      },
    },
    door: {
      group: 'world', desc: `Act on a door by id: status | open (swing it wide, away from you) | close | lock | unlock | kick (one boot from where you stand, as the E key does: a locked door takes 2-3, then bursts open into whoever is behind it; an unlocked one flies open; you must be within ${DOOR.kickReach} m unless force=true). Every kick is a loud noise the AI hears.`,
      args: { id: { type: 'string', required: true }, action: { type: 'string', default: 'status', enum: ['status', 'open', 'close', 'lock', 'unlock', 'kick'] }, force: { type: 'boolean', default: false } },
      run: async ({ id, action, force }) => {
        const I2 = g.interiors, d = I2.byId.get(id);
        need(d?.leaves, `no door ${id}; list them with doors`);
        let out = {};
        if (action === 'open') {
          if (d.locked) I2.setLocked(d, false);
          for (const L of d.leaves) { const side = (P().x - L.hx) * L.px + (P().z - L.hz) * L.pz >= 0 ? 1 : -1; L.th = -side * 1.5; L.w = 0; I2.orient(L); }
          I2.flush();
        } else if (action === 'close') { for (const L of d.leaves) { L.th = 0; L.w = 0; I2.orient(L); } I2.flush(); }
        else if (action === 'lock') I2.setLocked(d, true);
        else if (action === 'unlock') I2.setLocked(d, false);
        else if (action === 'kick') {
          need(P().alive && !P().inVehicle, 'kick on foot');
          const dist = Math.hypot(P().x - d.x, P().z - d.z), v = I2.doorView(d);
          need(force || dist <= DOOR.kickReach, `${id} is ${r1(dist)} m away; stand within ${DOOR.kickReach} m of it (moveTo x=${v.kickFrom.x} z=${v.kickFrom.z}) or pass force=true`);
          if ((P().kickAt ?? -9) > g.time) await api._step(Math.ceil((P().kickAt - g.time) * 60) + 1); // catch your breath between boots
          out = I2.kick(d, P());
          await api._step(6);
        }
        return { ...I2.doorView(d), ...out };
      },
    },
    windows: {
      group: 'world', desc: 'Windows near x,z (default: you) within radius: id, state (intact|cracked|shattered|boarded), glassHp, crack 0..1, boardHp, boardedFrom (inside|outside), the outside/inside points 2.2 m off it. state= filters (cracked counts as intact).',
      args: { x: { type: 'number' }, z: { type: 'number' }, radius: { type: 'number', default: 25 }, limit: { type: 'number', default: 20 }, state: { type: 'string', enum: ['intact', 'shattered', 'boarded'] } },
      run: async ({ x, z, radius, limit, state }) => {
        const cx = x ?? P().x, cz = z ?? P().z, I2 = g.interiors;
        const near = I2.windows.filter((w) => Math.hypot(w.x - cx, w.z - cz) <= radius && (!state || w.state === state))
          .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
        return { count: near.length, total: I2.windows.length, items: near.slice(0, limit).map((w) => I2.windowView(w)) };
      },
    },
    window: {
      group: 'world', desc: 'Act on a window by id: status | break (shatter the glass, or the boards) | board (board a broken window up from your side, as holding E does; within 2.5 m unless force=true) | unboard | vault (climb through a broken window; within 2 m) | repair (new glass, for staging).',
      args: { id: { type: 'string', required: true }, action: { type: 'string', default: 'status', enum: ['status', 'break', 'board', 'unboard', 'vault', 'repair'] }, force: { type: 'boolean', default: false } },
      run: async ({ id, action, force }) => {
        const I2 = g.interiors, w = I2.byId.get(id);
        need(w?.kind === 'window', `no window ${id}; list them with windows`);
        const p = P(), dist = Math.hypot(p.x - w.x, p.z - w.z), side = (p.x - w.x) * w.nx + (p.z - w.z) * w.nz >= 0 ? 1 : -1;
        if (action === 'break') { if (w.state === 'boarded') I2.damageBoards(w, 9999, p); else I2.shatter(w, -w.nx * side, -w.nz * side, p); }
        else if (action === 'board') {
          need(w.state === 'shattered', `window ${id} is ${w.state}: board a broken one (window action=break first)`);
          need(force || dist <= 2.5, `${id} is ${r1(dist)} m away; stand within 2.5 m of it or force=true`);
          I2.board(w, side, p);
        } else if (action === 'unboard') { need(w.state === 'boarded', `window ${id} is not boarded`); I2.unboard(w, p); }
        else if (action === 'repair') { w.state = 'intact'; w.hp = WINDOW.hp; w.boardHp = 0; I2.syncGlass(w); I2.syncBoards(w); }
        else if (action === 'vault') {
          need(w.state === 'shattered', `window ${id} is ${w.state}: only a broken window can be climbed through`);
          need(p.alive && !p.inVehicle && !p.vault, 'climb on foot');
          need(force || dist <= 2, `${id} is ${r1(dist)} m away; stand within 2 m of it`);
          const x0 = p.x, z0 = p.z;
          I2.startVault(p, w, side, WINDOW.vaultTime);
          for (let i = 0; i < 90 && p.vault; i++) await api._step(1);
          return { ...I2.windowView(w), climbed: true, from: { x: r1(x0), z: r1(z0) }, to: { x: r1(p.x), z: r1(p.z) } };
        }
        return I2.windowView(w);
      },
    },
    base: {
      group: 'world', desc: "A military base (data/bases.js; the Federal Remnant's OUTPOST NINE in the north-west Glass Flats by default): where it is (fence, gate), the alert (calm | warned | hostile) and why, how many seconds of grace are left after a warning, where you stand (inside? seen by whom? in a pool of light? your standing and tier with its faction), every soldier (post or patrol, alive, perched on a tower, hostile to you), its buildings, its doors (the armory's steel door: locked, kicks left), its searchable boxes (searched yet, what was in them), its parked vehicles and its lights. action=alarm brings the post down on you now, action=calm stands it down (clears every grudge it holds against you), action=warn makes a sentry warn you as if you had just walked in.",
      args: { id: { type: 'string', default: 'outpost9' }, action: { type: 'string', default: 'status', enum: ['status', 'alarm', 'calm', 'warn'] } },
      run: async ({ id, action }) => {
        const B = g.bases, s = B.byId[id];
        need(s, `unknown base; known: ${Object.keys(B.byId).join(',')}`);
        if (action === 'alarm') B.alarm(s, 'agent', B.nearestGuard(s, P().x, P().z));
        else if (action === 'calm') { B.calm(s, 'agent'); s.warnedAt = -1e9; s.cleared = false; s.shotWarned = false; }
        else if (action === 'warn') B.warn(s, B.nearestGuard(s, P().x, P().z));
        return B.view(s);
      },
    },
    submerge: {
      group: 'player', desc: 'While swimming: dive under (on=true) — hidden from AI, bullets can\'t reach, breath drains ~20s — or surface (on=false).',
      args: { on: { type: 'boolean', default: true } },
      run: async ({ on }) => { need(P().swim || !on, 'not in deep water (find the river or the lake first)'); g.crouchOverride = on; await api._step(2); return { underwater: !!P().underwater, breath: r1(P().breath ?? 1) }; },
    },
    equip: { group: 'player', desc: 'Switch to an owned weapon.', args: { weapon: { type: 'string', required: true } },
      run: async ({ weapon }) => { need(g.inv.weapons.includes(weapon), `not owned; owned: ${g.inv.weapons.join(',')}`); g.switchWeapon(weapon); return { current: weapon }; } },
    give: {
      group: 'player', desc: 'Grant cash, rounds {pistol,smg,shells,rifle} (into your pockets: what will not fit lands at your feet), throwables {frag,molotov,smoke,flash,pipe,sticky}, a weapon key (slung and loaded; a spare in your pack if you already carry one), or health.',
      args: { cash: { type: 'number' }, weapon: { type: 'string' }, pistol: { type: 'number' }, smg: { type: 'number' }, shells: { type: 'number' }, rifle: { type: 'number' }, hp: { type: 'number' },
        frag: { type: 'number' }, molotov: { type: 'number' }, smoke: { type: 'number' }, flash: { type: 'number' }, pipe: { type: 'number' }, sticky: { type: 'number' } },
      run: async ({ cash, weapon, pistol, smg, shells, rifle, hp, frag, molotov, smoke, flash, pipe, sticky }) => {
        for (const [k, n] of Object.entries({ frag, molotov, smoke, flash, pipe, sticky })) if (n) g.inv.throwables[k] = (g.inv.throwables[k] ?? 0) + n;
        if (cash) g.cash += cash;
        if (weapon) { need(WEAPONS[weapon], `unknown weapon; known: ${Object.keys(WEAPONS).join(',')}`); if (!g.inv.weapons.includes(weapon)) g.inventory.gainGun(weapon); }
        if (pistol) g.inv.ammo.pistol += pistol; if (smg) g.inv.ammo.smg += smg; if (shells) g.inv.ammo.shells += shells; if (rifle) g.inv.ammo.rifle += rifle;
        if (hp) P().hp = Math.min(P().maxHp, P().hp + hp);
        return { cash: g.cash, inventory: g.inv };
      },
    },
    difficulty: { group: 'player', desc: 'Set damage-taken difficulty: story (35%), normal (70%), hard (100%). Persists like the pause-menu setting.', args: { level: { type: 'string', required: true, enum: ['story', 'normal', 'hard'] } },
      run: async ({ level }) => { g.qol.settings.difficulty = level; g.qol.saveSettings(); return { difficulty: level, damageTaken: g.qol.damageTaken() }; } },
    god: { group: 'player', desc: 'Toggle invulnerability (for testing).', args: { on: { type: 'boolean', default: true } }, run: async ({ on }) => { g.godMode = on; return { god: on }; } },

    path: {
      group: 'player', desc: 'A* route from the player (or fx,fz) to x,z. mode=foot|car. Returns waypoints + length; nothing moves.',
      args: { x: { type: 'number', required: true }, z: { type: 'number', required: true }, fx: { type: 'number' }, fz: { type: 'number' }, mode: { type: 'string', default: 'foot', enum: ['foot', 'car'] } },
      run: async ({ x, z, fx, fz, mode }) => {
        const t0 = performance.now();
        const pts = g.nav[mode].find(fx ?? P().x, fz ?? P().z, x, z);
        if (!pts) return { found: false, ms: +(performance.now() - t0).toFixed(1) };
        let len = 0, px = fx ?? P().x, pz = fz ?? P().z;
        for (const p of pts) { len += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; }
        return { found: true, length: Math.round(len), searchMs: +(performance.now() - t0).toFixed(1), waypoints: pts.map((p) => ({ x: r1(p.x), z: r1(p.z) })) };
      },
    },
    objective: {
      group: 'player', desc: 'Current objective text, its target position, and GPS route length (what the HUD tracker shows).',
      run: async () => { const o = g.qol.objective(); g.qol.routeT = 0; g.qol.updateRoute(0); return { text: o.text, target: o.target ? { x: r1(o.target.x), z: r1(o.target.z) } : null, routeLength: g.qol.routeLength() && Math.round(g.qol.routeLength()), waypoint: g.qol.waypoint }; },
    },
    waypoint: {
      group: 'player', desc: 'Set (x,z) or clear (no args) the GPS waypoint shown on the minimap/big map.',
      args: { x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ x, z }) => { g.qol.setWaypoint(x === undefined ? null : { x, z }); return { waypoint: g.qol.waypoint }; },
    },

    // ---------------------------------------------------------------- vehicles
    enterVehicle: {
      group: 'vehicle', desc: 'Get into a vehicle by id. You must be beside it (moveTo id=<vehicle> first); force=true skips that (testing). Carjacks if occupied.',
      args: { id: { type: 'string', required: true }, force: { type: 'boolean', default: false } },
      run: async ({ id, force }) => {
        const v = api.findVeh(id);
        need(v && !v.dead, `no live vehicle ${id}`);
        const d = Math.hypot(v.x - P().x, v.z - P().z) - v.len * 0.5;
        need(d < 3.5 || force || P().inVehicle === v, `${v.name} is ${Math.round(d)}m away at (${r1(v.x)}, ${r1(v.z)}); moveTo id=${v.id} first`);
        if (P().inVehicle) g.exitVehicle(true);
        g.enterVehicle(v);
        return vehView(g, v);
      },
    },
    exitVehicle: {
      group: 'vehicle', desc: 'Leave the current vehicle. If it is burning, the player automatically sprints clear of the blast (7m).',
      run: async () => {
        const v = P().inVehicle;
        need(v, 'not in a vehicle');
        const burning = v.onFire > 0;
        g.exitVehicle(true);
        if (burning) {
          // Run directly away from the wreck before it blows.
          const dx = P().x - v.x, dz = P().z - v.z, d = Math.hypot(dx, dz) || 1;
          const tx = v.x + (dx / d) * 14, tz = v.z + (dz / d) * 14;
          const path = g.nav.foot.find(P().x, P().z, tx, tz);
          if (path) { g.autopilot = { x: tx, z: tz, run: true, tolerance: 1.5, path, i: 0 }; await api._step(Math.round(Math.max(0.5, v.onFire - 0.3) * 60)); g.autopilot = null; }
        }
        return { x: r1(P().x), z: r1(P().z), fledBurningVehicle: burning, distFromVehicle: r1(Math.hypot(P().x - v.x, P().z - v.z)) };
      },
    },
    drive: {
      group: 'vehicle', desc: 'Hold throttle(-1..1)/steer(-1..1, +left)/handbrake/boost (Shift: a bike wheelies under 24 m/s) for N seconds of sim time, or give x,z to auto-drive there along an A* route (unsticks itself).',
      args: { throttle: { type: 'number', default: 1 }, steer: { type: 'number', default: 0 }, handbrake: { type: 'boolean', default: false }, boost: { type: 'boolean', default: false }, seconds: { type: 'number', default: 1 }, x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ throttle, steer, handbrake, boost, seconds, x, z }) => {
        const v = P().inVehicle;
        need(v, 'not in a vehicle; use enterVehicle');
        if (x !== undefined && z !== undefined) {
          // Follow an A* route on the vehicle nav grid (dilated for car width).
          const path = g.nav.car.find(v.x, v.z, x, z) ?? [{ x, z }];
          let t = 0, i = 0, stuckT = 0, lastX = v.x, lastZ = v.z;
          while (t < Math.max(seconds, 90) && i < path.length) {
            const wp = path[i], isLast = i === path.length - 1;
            const d = Math.hypot(wp.x - v.x, wp.z - v.z);
            if (d < (isLast ? 6 : 8)) { i++; continue; }
            const want = ang(wp.x - v.x, wp.z - v.z);
            const diff = ((want - v.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            const sp = g.vehiclesSys.speed(v);
            const corner = Math.abs(diff) > 0.6 && sp > 14;
            // Brake for non-hostile people in the lane ahead (don't run over townsfolk).
            const fx = Math.sin(v.h), fz = Math.cos(v.h);
            const ped = g.chars.some((c) => c.alive && !c.inVehicle && c !== P() && !g.ai.hostile(c, P()) && (() => { const ox = c.x - v.x, oz = c.z - v.z, al = ox * fx + oz * fz; return al > 0 && al < 7 + sp * 0.6 && Math.abs(ox * fz - oz * fx) < v.wid; })());
            if (ped && !stuckT) { g.driveOverride = { throttle: sp > 2 ? -1 : 0, steer: 0 }; await api._step(6); t += 0.1; continue; }
            g.driveOverride = { throttle: stuckT > 1 ? -1 : corner ? -0.3 : isLast && d < 25 ? 0.5 : 1, steer: Math.max(-1, Math.min(1, (stuckT > 1 ? -diff : diff) * 2.2)), handbrake: Math.abs(diff) > 1.5 && sp > 8 };
            await api._step(6); t += 0.1;
            // Unstick: if barely moving for a while, reverse briefly.
            if (Math.hypot(v.x - lastX, v.z - lastZ) < 0.2) stuckT += 0.1; else stuckT = Math.max(0, stuckT - 0.2);
            if (stuckT > 1.8) stuckT = 0;
            lastX = v.x; lastZ = v.z;
            if (v.dead || !P().inVehicle) break;
            if (v.onFire) { g.driveOverride = null; return { arrived: false, interrupted: 'vehicle on fire — exitVehicle now', ...vehView(g, v) }; }
            if (!P().alive) { g.driveOverride = null; return { arrived: false, interrupted: 'player died' }; }
          }
          g.driveOverride = { throttle: -1, steer: 0 }; await api._step(30); g.driveOverride = null;
          return { arrived: Math.hypot(x - v.x, z - v.z) < 10, waypoints: path.length, ...vehView(g, v) };
        }
        g.driveOverride = { throttle, steer, handbrake, boost };
        for (let f = 0; f < Math.round(seconds * 60); f += 6) {
          await api._step(6);
          if (v.onFire) { g.driveOverride = null; return { interrupted: 'vehicle on fire — exitVehicle now', ...vehView(g, v) }; }
        }
        g.driveOverride = null;
        return vehView(g, v);
      },
    },
    ram: {
      group: 'vehicle', desc: 'Run a character down (id or "hostile"): steers at their live position at full throttle, reverses out if stuck, until they die or seconds elapse. Returns kills.',
      args: { id: { type: 'string', default: 'hostile' }, seconds: { type: 'number', default: 8 } },
      run: async ({ id, seconds }) => {
        const v = P().inVehicle;
        need(v, 'not in a vehicle');
        const k0 = g.stats.kills;
        let t = 0, reverseT = 0, last = { x: v.x, z: v.z }, interrupted;
        const tgt = api.findChar(id);
        need(tgt, `no target ${id}`);
        // Progress watchdog: if we can't close the gap for 2.5s, the target is behind
        // something a car can't pass (camp walls, buildings): say so instead of flailing.
        let bestD = Infinity, sinceBest = 0;
        while (t < seconds && tgt.alive) {
          const dNow = Math.hypot(tgt.x - v.x, tgt.z - v.z);
          if (dNow < bestD - 1) { bestD = dNow; sinceBest = 0; } else if ((sinceBest += 0.1) > 2.5) { interrupted = 'unreachable by vehicle (walls in the way) — exitVehicle and engage on foot'; break; }
          if (v.onFire) { interrupted = 'vehicle on fire — exitVehicle now'; break; }
          const want = ang(tgt.x - v.x, tgt.z - v.z);
          const diff = ((want - v.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          if (reverseT > 0) { reverseT -= 0.1; g.driveOverride = { throttle: -1, steer: -Math.sign(diff) }; }
          else {
            const d = Math.hypot(tgt.x - v.x, tgt.z - v.z);
            // Too close and pointed away: back up to get a run-up.
            if (d < 8 && Math.abs(diff) > 1.2) reverseT = 0.8;
            g.driveOverride = { throttle: 1, steer: Math.max(-1, Math.min(1, diff * 2.5)), handbrake: Math.abs(diff) > 1.6 && g.vehiclesSys.speed(v) > 10 };
          }
          await api._step(6); t += 0.1;
          if (Math.hypot(v.x - last.x, v.z - last.z) < 0.15 && reverseT <= 0) reverseT = 0.7;
          last = { x: v.x, z: v.z };
        }
        g.driveOverride = null;
        return { killed: !tgt.alive, kills: g.stats.kills - k0, interrupted, unreachable: /unreachable/.test(interrupted ?? ''), ...vehView(g, v) };
      },
    },
    horde: {
      group: 'world', desc: 'Spawn a herd of the infected around x,z (default 30m from the player). runners = fraction that are sprinters.',
      args: { x: { type: 'number' }, z: { type: 'number' }, count: { type: 'number', default: 10 }, runners: { type: 'number', default: 0.2 }, radius: { type: 'number', default: 8 } },
      run: async ({ x, z, count, runners, radius }) => ({ ids: g.zombies.horde(x ?? P().x + 30, z ?? P().z, Math.min(40, count), runners, radius) }),
    },
    zombies: {
      group: 'world', desc: 'Turn night herd spawning on/off (the infected already out stay). Returns how many are alive.', args: { on: { type: 'boolean', default: true } },
      run: async ({ on }) => { g.zombies.enabled = on; return { nightHordes: on, alive: g.chars.filter((c) => c.faction === 'zombie' && c.alive).length }; },
    },
    grab: {
      group: 'vehicle', desc: 'Player grabs onto a vehicle (car-surfing): rides along on that side and can shoot. Must be within ~2m (moveTo id=<vehicle> first). letGo drops off (at speed = tumble damage).',
      args: { id: { type: 'string', required: true }, side: { type: 'string', enum: ['left', 'right', 'front', 'rear'] } },
      run: async ({ id, side }) => {
        const v = api.findVeh(id);
        need(v && !v.dead, `no live vehicle ${id}`);
        need(!P().inVehicle && !P().grabbing, 'already in or on a vehicle');
        let gap = Infinity;
        for (const d of g.vehiclesSys.discs(v)) gap = Math.min(gap, Math.hypot(d.x - P().x, d.z - P().z) - d.r);
        need(gap < 2.2, `${v.name} is ${Math.round(gap)}m away; moveTo id=${v.id} first`);
        need(g.carCombat.grab(P(), v, side ?? g.carCombat.sideToward(v, P().x, P().z)), 'no free spot to hang on (6 max)');
        return { grabbed: v.id, side: P().grabbing.side };
      },
    },
    letGo: {
      group: 'vehicle', desc: 'Let go of the vehicle you are hanging on.',
      run: async () => { need(P().grabbing, 'not hanging on a vehicle'); const v = P().grabbing.v, sp = g.vehiclesSys.speed(v); g.carCombat.letGo(P()); return { x: r1(P().x), z: r1(P().z), speedWhenDropped: r1(sp), hp: Math.round(P().hp) }; },
    },
    shakeOff: {
      group: 'vehicle', desc: 'Swerve hard left/right at speed to fling off anyone hanging on your car. Returns who fell off.',
      args: { seconds: { type: 'number', default: 3 } },
      run: async ({ seconds }) => {
        const v = P().inVehicle;
        need(v, 'not driving');
        const before = v.grabbers.map((gr) => gr.c.id);
        for (let t = 0; t < seconds && v.grabbers.length; t += 0.5) {
          g.driveOverride = { throttle: 1, steer: Math.floor(t * 2) % 2 ? 1 : -1, handbrake: g.vehiclesSys.speed(v) > 14 };
          await api._step(30);
          if (v.onFire) break;
        }
        g.driveOverride = null;
        const still = v.grabbers.map((gr) => gr.c.id);
        return { flung: before.filter((x2) => !still.includes(x2)), stillOn: still, ...vehView(g, v) };
      },
    },
    recruit: {
      group: 'player', desc: 'Make a living non-hostile character your follower (faction ally): follows you, fights your enemies, boards your vehicle, shoots out of their own window, and takes the wheel if you slide seats (C).',
      args: { id: { type: 'string', required: true } },
      run: async ({ id }) => {
        const c = api.findChar(id);
        need(c && c.alive && c !== P(), `no living character ${id}`);
        need(!['raider', 'zombie'].includes(c.faction), `${c.name} won't ride with you (${c.faction})`);
        g.seats.recruit(c);
        return { recruited: c.id, name: c.npc?.name ?? c.name, weapon: c.weapon };
      },
    },
    dismiss: { group: 'player', desc: 'Send a follower on their way.', args: { id: { type: 'string', required: true } },
      run: async ({ id }) => { const c = api.findChar(id); need(c?.follower, `${id} is not following you`); g.seats.dismiss(c); return { dismissed: c.id }; } },
    seat: {
      group: 'vehicle', desc: 'Board a vehicle in a specific seat (driver|shotgun|backL|backR|bedL|bedR|pillion|any passenger), or switch seats inside your current vehicle. Seat list is in each vehicle report.',
      args: { id: { type: 'string' }, seat: { type: 'string', default: 'passenger' } },
      run: async ({ id, seat }) => {
        const p = P();
        if (!id && p.inVehicle) {
          const v = p.inVehicle;
          if (seat === 'next' || seat === 'passenger') need(g.seats.cycle(p), 'no free seat to move to');
          else {
            const si = v.seats.findIndex((s) => s.id === seat);
            need(si >= 0, `no seat "${seat}" in a ${v.type}; seats: ${v.seats.map((s) => s.id).join(',')}`);
            need(!v.occ[si] || v.occ[si] === p, `${seat} is taken by ${v.occ[si]?.name}`);
            while (p.seat !== si) need(g.seats.cycle(p), 'could not reach that seat');
          }
          return { seat: v.seats[p.seat].id, driver: v.driver?.id ?? null, ai: v.ai };
        }
        const v = api.findVeh(id);
        need(v && !v.dead, `no live vehicle ${id}`);
        const d = Math.hypot(v.x - p.x, v.z - p.z) - v.len * 0.5;
        need(d < 3.5 || p.inVehicle === v, `${v.name} is ${Math.round(d)}m away; moveTo id=${v.id} first`);
        if (seat === 'driver') { g.enterVehicle(v, 0); return { seat: 'driver' }; }
        if (seat === 'passenger') { need(g.enterVehicle(v, 'passenger'), 'no free passenger seat'); return { seat: v.seats[p.seat].id, driver: v.driver?.id ?? null }; }
        const si = v.seats.findIndex((s) => s.id === seat);
        need(si > 0, `no seat "${seat}"; seats: ${v.seats.map((s) => s.id).join(',')}`);
        need(g.seats.board(p, v, si), `${seat} is taken`);
        g.lastVehicle = v;
        return { seat, driver: v.driver?.id ?? null };
      },
    },
    repair: {
      group: 'vehicle', desc: 'Full field repair of a vehicle (testing / mechanic): parts, tyres, dents, panels, hp.',
      args: { id: { type: 'string' } },
      run: async ({ id }) => { const v = id ? api.findVeh(id) : P().inVehicle ?? g.lastVehicle; need(v && !v.dead, 'no live vehicle'); g.vehDamage.repair(v); return vehView(g, v); },
    },
    harpoon: {
      group: 'vehicle', desc: 'Fire the Whaler\'s harpoon at x,z or entity id. Call again while hooked to YANK.',
      args: { x: { type: 'number' }, z: { type: 'number' }, id: { type: 'string' } },
      run: async ({ x, z, id }) => {
        const v = P().inVehicle;
        need(v?.harpoon, 'must be driving a vehicle with a harpoon (type "rig")');
        if (id) { const t = api.findVeh(id) ?? api.findChar(id); need(t, `no entity ${id}`); x = t.x; z = t.z; }
        const was = g.vehiclesSys.harpoon?.state;
        g.vehiclesSys.fireHarpoon(v, ang((x ?? v.x) - v.x, (z ?? v.z + 10) - v.z));
        await api._step(30);
        const h = g.vehiclesSys.harpoon;
        return { action: was === 'attached' ? 'yank' : 'fire', state: h?.state ?? 'idle', hooked: h?.target?.id ?? null };
      },
    },

    // ---------------------------------------------------------------- dialogue
    talk: {
      group: 'dialogue', desc: 'Open a conversation with a character (id, npc id like "okonkwo", or name). You must be within 4m (moveTo them first); force=true snaps you next to them (testing only).',
      args: { id: { type: 'string', required: true }, force: { type: 'boolean', default: false } },
      run: async ({ id, force }) => {
        const c = api.findChar(id);
        need(c && c.alive && c !== P(), !c ? `no character ${id}` : c.downedT > 0 ? `${c.npc?.name ?? c.name} is downed — back on their feet in ${Math.ceil(c.downedT)}s (step that long, then retry)` : `${c.npc?.name ?? c.name} is dead`);
        const d = Math.hypot(c.x - P().x, c.z - P().z);
        need(d <= 4 || force, `${c.npc?.name ?? c.name} is ${Math.round(d)}m away at (${r1(c.x)}, ${r1(c.z)}); moveTo them first`);
        need(!P().inVehicle, 'get out of the vehicle to talk');
        if (d > 3) { P().x = c.x + 1.2; P().z = c.z; }
        g.dialogue.open(c);
        g.dialogue.shown = g.dialogue.full.length;
        return { ...api.dialogueState(), cash: g.cash, quests: g.quests };
      },
    },
    choose: {
      group: 'dialogue', desc: 'Pick a dialogue choice by index (0-based). Returns the next line + choices.',
      args: { index: { type: 'number', required: true } },
      run: async ({ index }) => {
        need(g.dialogue.active, 'no dialogue open; use talk');
        g.dialogue.shown = g.dialogue.full.length;
        g.dialogue.pick(index);
        if (g.dialogue.active) g.dialogue.shown = g.dialogue.full.length;
        return { ...api.dialogueState(), cash: g.cash, quests: g.quests };
      },
    },
    dialogue: { group: 'dialogue', desc: 'Current dialogue text + choices.', run: async () => api.dialogueState() },

    // ---------------------------------------------------------------- world
    setTime: { group: 'world', desc: 'Set hour of day (0-24). fast=true runs time x40.', args: { hour: { type: 'number', required: true }, fast: { type: 'boolean' } },
      run: async ({ hour, fast }) => { g.sky.time = ((hour % 24) + 24) % 24; if (fast !== undefined) g.sky.fast = fast; return { time: g.sky.clock, phase: g.sky.phase }; } },
    setWeather: { group: 'world', desc: 'Change weather (blends over ~6s; instant=true snaps).', args: { key: { type: 'string', required: true, enum: Object.keys(WEATHER) }, instant: { type: 'boolean', default: false } },
      run: async ({ key, instant }) => { g.sky.setWeather(key); if (instant) Object.assign(g.sky.cur, WEATHER[key]); return { weather: key, label: WEATHER[key].label }; } },
    spawn: {
      group: 'world', desc: 'Spawn a character. kind=raider|drifter|warden|soldier (a Federal Remnant soldier with a service rifle, faction remnant). Optional name, flag (ISO code), weapon, hostile grudge vs player.',
      args: { kind: { type: 'string', default: 'raider', enum: ['raider', 'drifter', 'warden', 'soldier', 'zombie'] }, runner: { type: 'boolean' }, x: { type: 'number' }, z: { type: 'number' }, count: { type: 'number', default: 1 },
        name: { type: 'string' }, flag: { type: 'string' }, weapon: { type: 'string' }, hp: { type: 'number' }, angry: { type: 'boolean', default: false } },
      run: async ({ kind, x, z, count, name, flag, weapon, hp, angry, runner }) => {
        const ids = [];
        for (let i = 0; i < Math.min(count, 40); i++) {
          const sx = (x ?? P().x + 15) + (Math.random() - 0.5) * 4 * Math.min(count, 6), sz = (z ?? P().z) + (Math.random() - 0.5) * 4 * Math.min(count, 6);
          const c = kind === 'raider'
            ? g.spawnRaider(sx, sz, Math.random, weapon)
            : kind === 'zombie' ? g.zombies.spawn(sx, sz, runner)
            : kind === 'soldier' ? g.bases.spawnSoldier(sx, sz, Math.random, weapon ?? 'rifle')
            : g.addChar({ x: sx, z: sz, faction: kind, weapon: weapon ?? (kind === 'warden' ? 'smg' : null), hp: hp ?? 100, colors: outfit(kind), name: name ?? `${kind[0].toUpperCase()}${kind.slice(1)}`, flag: flag ?? g.randomFlag(Math.random) });
          need(c, 'character budget full (160)');
          if (name) c.name = name;
          if (flag) { need(FLAGS[flag], `unknown flag; known: ${FLAG_KEYS.join(',')}`); c.flag = flag; }
          if (hp) { c.hp = c.maxHp = hp; }
          if (angry) { c.grudge = P(); if (c.weapon) { c.target = P(); } }
          ids.push(c.id);
        }
        return { ids };
      },
    },
    spawnVehicle: {
      group: 'world', desc: 'Spawn a vehicle. ai=traffic|raider|none. withDriver adds an NPC driver (raider ai = armed Dustwolf).',
      args: { type: { type: 'string', default: 'interceptor' }, x: { type: 'number' }, z: { type: 'number' }, heading: { type: 'number', default: 0 }, paint: { type: 'string', default: '#5a3a24' },
        ai: { type: 'string', default: 'none', enum: ['traffic', 'raider', 'none'] }, withDriver: { type: 'boolean', default: false } },
      run: async ({ type, x, z, heading, paint, ai, withDriver }) => {
        need(VEHICLES[type], `unknown vehicle; known: ${Object.keys(VEHICLES).join(',')}`);
        const v = g.vehiclesSys.spawn(type, x ?? P().x + 8, z ?? P().z, heading, paint, { ai: ai === 'none' ? null : ai });
        if (withDriver || ai !== 'none') {
          const d = ai === 'raider' ? g.spawnRaider(v.x, v.z, Math.random, 'smg') : g.addChar({ x: v.x, z: v.z, faction: 'drifter', colors: outfit('drifter'), name: 'Driver', flag: 'US' });
          if (d) g.seats.board(d, v, 0);
        }
        return vehView(g, v);
      },
    },
    kill: { group: 'world', desc: 'Kill a character (with full gore).', args: { id: { type: 'string', required: true }, cause: { type: 'string', default: 'bullet', enum: ['bullet', 'vehicle', 'explosion'] } },
      run: async ({ id, cause }) => { const c = api.findChar(id); need(c && c.alive, `no living character ${id}`); g.combat.damage(c, 9999, null, 1, 0, cause); return { killed: c.id }; } },
    damage: { group: 'world', desc: 'Damage a character or vehicle by id.', args: { id: { type: 'string', required: true }, amount: { type: 'number', default: 25 } },
      run: async ({ id, amount }) => { const c = api.findChar(id); if (c) { g.combat.damage(c, amount, null, 1, 0); return { hp: c.hp, alive: c.alive }; } const v = api.findVeh(id); need(v, `no entity ${id}`); g.vehiclesSys.damage(v, amount, null); return { hp: v.hp, dead: v.dead }; } },
    explode: { group: 'world', desc: 'Blow up a vehicle by id.', args: { id: { type: 'string', required: true } }, run: async ({ id }) => { const v = api.findVeh(id); need(v && !v.dead, `no live vehicle ${id}`); g.vehiclesSys.explode(v, null); return { exploded: v.id }; } },
    remove: { group: 'world', desc: 'Delete a non-player character (no corpse).', args: { id: { type: 'string', required: true } }, run: async ({ id }) => { const c = api.findChar(id); need(c && c !== P(), `no character ${id}`); g.removeChar(c); return { removed: id }; } },

    // ---------------------------------------------------------------- society (docs/design/WEB_WORLD_MEMORY.md)
    chronicle: {
      group: 'society', desc: "What happened, newest first: your deeds (with who saw them), rumors that reached a faction, the world's own violence. Filters: since (seq), verb, actor, faction (either side), place, legend (notable only), limit.",
      args: { since: { type: 'number', default: 0 }, verb: { type: 'string' }, actor: { type: 'string' }, faction: { type: 'string' }, place: { type: 'string' }, legend: { type: 'boolean', default: false }, limit: { type: 'number', default: 25 } },
      run: async (a) => {
        const C = g.society.chronicle;
        return { records: C.query({ ...a, limit: Math.max(1, Math.min(200, a.limit)) }).map((r) => readRec(g, r)), last: C.seq, size: C.size, capacity: C.cap, legend: C.legend.length };
      },
    },
    tally: {
      group: 'society', desc: 'Rolled-up counts per "actorFaction|verb|targetFaction" (they survive the ring), plus the last 7 day digests.', args: { prefix: { type: 'string' } },
      run: async ({ prefix }) => {
        const S = g.society;
        return { tally: Object.fromEntries([...S.chronicle.tally].filter(([k]) => !prefix || k.startsWith(prefix)).map(([k, v]) => [k, { n: v.n, mag: r1(v.m), lastT: v.t }])), day: S.day, digests: S.chronicle.digests.slice(-7) };
      },
    },
    deed: {
      group: 'society', desc: `Record a deed as if the player did it, through the real witness pass unless witness=false. verb: ${Object.keys(VERBS).join('|')}. target = character id; faction overrides the target's faction.`,
      args: { verb: { type: 'string', required: true }, target: { type: 'string' }, faction: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, mag: { type: 'number' }, witness: { type: 'boolean', default: true } },
      run: async ({ verb, target, faction, x, z, mag, witness }) => {
        need(VERBS[verb] !== undefined, `unknown verb; known: ${Object.keys(VERBS).join(',')}`);
        const t = target ? api.findChar(target) : null;
        need(!target || t, `no character ${target}`);
        const D = g.society.deeds, before = D.pending;
        const rec = D.record(verb, { target: t, tf: faction, x, z, m: mag, witness });
        need(rec, 'deed rejected: position not finite');
        return { seq: rec.seq, witnesses: rec.w.slice(), unidentified: rec.un, unwitnessed: !!(rec.k & K.unwitnessed), rumorsQueued: D.pending - before, place: rec.p };
      },
    },
    witnesses: {
      group: 'society', desc: 'Dry run of the witness pass at x,z (default: where you stand): who would put a name to your face, how many would only see something, and the sight/ID ranges right now.',
      args: { x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ x, z }) => {
        const D = g.society.deeds, p = P(), wx = x ?? p.x, wz = z ?? p.z, rg = D.ranges(p);
        const identified = D.witnessPass(wx, wz, p, null).map((c) => ({ id: c.id, name: c.npc?.name ?? c.name, faction: c.fid, dist: r1(Math.hypot(c.x - wx, c.z - wz)) }));
        return { identified, sawOnly: D.sawOnly, sight: r1(rg.sight), idRange: r1(rg.idRange), night: rg.night, fogK: rg.fogK, crouch: rg.crouch };
      },
    },
    rumors: {
      group: 'society', desc: 'Word on its way: each pending report (witness, faction, verb, seconds until it lands). flush=true lands them all now.', args: { flush: { type: 'boolean', default: false } },
      run: async ({ flush }) => {
        const D = g.society.deeds;
        if (flush) { for (const r of D.rumors) if (r.live) r.due = g.time; D.nextDue = g.time; D.update(); }
        return D.view();
      },
    },
    runners: {
      group: 'society', desc: "Witnesses running home to tell it (systems/witnesses.js): who, which people, how far from the hub, seconds until the report lands anyway, the price of their silence. bribe=<id> pays one you stand next to (the E prompt's path). Stop one by killing them, or by holding your gun on them (aim at them inside 9 m for 1.2 s).",
      args: { bribe: { type: 'string' } },
      run: async ({ bribe }) => {
        const W = g.witnesses;
        if (bribe) { const c = api.findChar(bribe); need(c, `no character ${bribe}`); return { ...W.bribe(c), ...W.view() }; }
        return W.view();
      },
    },
    factions: {
      group: 'society', desc: 'Every faction (or one by id): your standing, tier, whether they shoot you on sight, relations, wars, alliances.', args: { id: { type: 'string' } },
      run: async ({ id }) => {
        const F = g.society.factions;
        if (id) { const v = F.view(id); need(v, `unknown faction; known: ${F.ids.join(',')}`); return { ...v, sim: g.society.sim.view()[id] ?? null }; }
        return { factions: F.view(), tiers: TIERS, sim: g.society.sim.view() };
      },
    },
    standing: {
      group: 'society', desc: "Read, set or add to a faction's standing toward you (-100..100). Tiers: hunted ≤ -80, hostile ≤ -40 (shoot on sight), wary, neutral, friendly, allied ≥ 60.",
      args: { faction: { type: 'string', required: true }, set: { type: 'number' }, add: { type: 'number' } },
      run: async ({ faction, set, add }) => {
        const F = g.society.factions;
        need(F.index[faction] !== undefined, `unknown faction; known: ${F.ids.join(',')}`);
        const tierFrom = F.tiers[F.index[faction]];
        if (set !== undefined) F.set(faction, set);
        if (add !== undefined) F.add(faction, add);
        return { ...F.view(faction), tierFrom, tierTo: F.tiers[F.index[faction]] };
      },
    },
    relation: {
      group: 'society', desc: 'Read or set how two factions feel about each other (-100..100, mutual): ≤ -50 is war, ≥ 50 an alliance.',
      args: { a: { type: 'string', required: true }, b: { type: 'string', required: true }, set: { type: 'number' }, add: { type: 'number' } },
      run: async ({ a, b, set, add }) => {
        const F = g.society.factions;
        need(F.index[a] !== undefined && F.index[b] !== undefined, `unknown faction; known: ${F.ids.join(',')}`);
        need(a !== b, 'a faction always stands with itself');
        if (set !== undefined || add !== undefined) F.setRelation(a, b, set ?? F.relation(a, b) + add);
        const v = F.relation(a, b);
        return { a, b, value: v, war: v <= -50, alliance: v >= 50 };
      },
    },
    memory: {
      group: 'society', desc: "What a named person remembers about you: each memory (kind, who it's about, firsthand or heard, what it's worth now), their opinion, whether they refuse to deal and whether they want you dead.",
      args: { id: { type: 'string', required: true } },
      run: async ({ id }) => { need(g.chars.some((c) => c.npc?.id === id) || g.society.memory.byNpc.has(id), `no named person ${id}`); return g.society.memory.view(id); },
    },
    remember: {
      group: 'society', desc: `Give a named person a memory of you (or forget=true to clear it; no kind clears all). kind: ${Object.keys(MEMORY_KINDS).join('|')}.`,
      args: { id: { type: 'string', required: true }, kind: { type: 'string' }, weight: { type: 'number', default: 1 }, about: { type: 'string', default: '' }, heard: { type: 'boolean', default: false }, forget: { type: 'boolean', default: false } },
      run: async ({ id, kind, weight, about, heard, forget }) => {
        need(g.chars.some((c) => c.npc?.id === id), `no named person ${id}`);
        need(forget || MEMORY_KINDS[kind], `unknown kind; known: ${Object.keys(MEMORY_KINDS).join(',')}`);
        if (forget) g.society.memory.forget(id, kind); else g.society.memory.remember(id, kind, { weight, about, heard });
        return g.society.memory.view(id);
      },
    },
    director: {
      group: 'society', desc: 'The event director: running events, cooldowns, what could fire now and why the rest can\'t. action=eval fires the pick now; pause/resume stop or restart it; digest reads a day back on the radio now (day=, default yesterday) the way STATIC 1660 AM does every dawn.',
      args: { action: { type: 'string', default: 'status', enum: ['status', 'eval', 'pause', 'resume', 'digest'] }, day: { type: 'number' } },
      run: async ({ action, day }) => {
        const D = g.society.director;
        if (action === 'digest') { D.digestDay = day ?? Math.max(0, g.society.day - 1); return { day: D.digestDay, lines: D.readDigest() }; }
        if (action === 'pause') D.paused = true;
        if (action === 'resume') D.paused = false;
        const fired = action === 'eval' ? D.evaluate() : null;
        return { ...D.view(), fired: fired ? { event: fired.id, tpl: fired.tpl } : null };
      },
    },
    fireEvent: {
      group: 'society', desc: `Fire a director event now, skipping pacing: tpl = ${Object.keys(EVENTS).join('|')}. hunters takes faction= (it must have a hunters row); the rest bind themselves. Returns the event and who it spawned.`,
      args: { tpl: { type: 'string', required: true }, faction: { type: 'string' } },
      run: async ({ tpl, faction }) => {
        need(EVENTS[tpl], `unknown event; known: ${Object.keys(EVENTS).join(',')}`);
        let bind;
        if (faction) { const F = g.society.factions; need(F.row(faction)?.hunters, `${faction} has no hunters row`); bind = { i: F.index[faction], fid: faction }; }
        const ev = g.society.director.fire(tpl, bind);
        return { event: ev.id, tpl, bind: g.society.director.plainBind(ev), spawned: ev.members.map((c) => ({ id: c.id, name: c.name, faction: c.fid, dist: r1(Math.hypot(c.x - P().x, c.z - P().z)) })) };
      },
    },
    cancelEvent: {
      group: 'society', desc: 'End a running director event: anyone it spawned leaves.', args: { id: { type: 'string', required: true } },
      run: async ({ id }) => { const r = g.society.director.cancel(id); need(r, `no running event ${id}`); return r; },
    },
    needs: {
      group: 'player', desc: 'Water, food and rest (0 empty .. 1 full), their wear pips (0-4: thirsty, parched...; tired, weary, exhausted, dead on your feet), what they cost you right now (stamina, sway on your aim, the dark at the edges, a microsleep), game hours left, a fever, and whether you are asleep. water=, food=, rest= set them.',
      args: { water: { type: 'number' }, food: { type: 'number' }, rest: { type: 'number' } },
      run: async ({ water, food, rest }) => {
        const N = g.needs, S2 = g.survival, set = { water, food, rest };
        for (const k of Object.keys(set)) if (set[k] !== undefined) { need(set[k] >= 0 && set[k] <= 1, `${k} is 0..1`); N[k] = set[k]; N.pips[k] = S2.pip(set[k]); }
        if (water !== undefined || food !== undefined || rest !== undefined) S2.update(0); // recompute the effects now
        return S2.view();
      },
    },
    town: {
      group: 'world', desc: 'The town at night (data/survival.js TOWN_NIGHT): from 22:00 to 06:00 the town\'s own people (drifters, named townsfolk; not the wardens, soldiers, raiders or your followers) go to a bed near home (a mattress, else the floor) and sleep; asleep they witness nothing and a trader keeps no counter; a noise, pain, a fight or someone standing at the bedside wakes them. Reports who is asleep within radius= m, who is up and why, and the beds (claimed tonight / all). wake=<id> shakes one awake (as E does).',
      args: { radius: { type: 'number', default: 150 }, wake: { type: 'string' } },
      run: async ({ radius, wake }) => {
        const p = P();
        if (wake) { const c = api.findChar(wake); need(c, `no character ${wake}`); g.ai.wake(c, 'shaken awake'); }
        const near = g.chars.filter((c) => c !== p && c.alive && Math.hypot(c.x - p.x, c.z - p.z) < radius && g.ai.sleeper(c));
        const beds = g.world.spawns.beds ?? [], n = g.ai.nightId();
        return {
          night: g.ai.night(), hour: r1(g.sky.time),
          asleep: near.filter((c) => c.sleeping).map((c) => ({ id: c.id, name: c.npc?.name ?? c.name, bed: !!(c.bed && !c.bed.floor), x: r1(c.x), z: r1(c.z) })),
          awake: near.filter((c) => !c.sleeping).map((c) => ({ id: c.id, name: c.npc?.name ?? c.name, restless: r1(Math.max(0, c.restless ?? 0)), going: !!c.bed })),
          beds: { total: beds.length, claimedTonight: beds.filter((b) => b.night === n && b.by).length },
        };
      },
    },
    sleep: {
      group: 'player', desc: 'Sleep (data/survival.js SLEEP; docs/design/WEB_SURVIVAL.md). where=bed lies down on the bed within reach (a mattress in a house; snap=true puts you on the nearest one first, for testing), where=bedroll uses a bedroll from your pack, where=car tips back the seat of the car you sit in (it must be parked), where=ground lies on the bare ground (the worst rest). You can lie down only when tired, and never with danger close. Steps the game (time runs x40 asleep) until you wake - rested, woken by danger, pain or a noise, or at hours= game hours if given - and reports why, how long, whether it was a full night (one that breaks a treated fever), and your needs. wake=true gets you up. In the game: N sleeps (a bed you stand at, a bedroll you carry, a parked car), E at a bed, a bedroll from the PACK screen; E gets you up.',
      args: { where: { type: 'string', default: 'bed', enum: ['bed', 'bedroll', 'car', 'ground'] }, snap: { type: 'boolean', default: false }, hours: { type: 'number' }, wake: { type: 'boolean', default: false } },
      run: async ({ where, snap, hours, wake }) => {
        const S2 = g.survival, p = P();
        if (wake) return { woke: S2.wake(), needs: S2.view() };
        let bed = null;
        if (where === 'bed') {
          if (snap) {
            let bd = Infinity;
            for (const b of g.world.spawns.beds ?? []) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; bed = b; } }
            need(bed, 'no beds in this world');
            if (p.inVehicle) g.exitVehicle(true);
            p.x = bed.x; p.z = bed.z;
          } else bed = g.bedNear(p.x, p.z);
          need(bed, 'no bed within reach: stand at a mattress (or snap=true)');
        }
        if (where === 'bedroll') {
          const i = g.inventory.carried.slots.findIndex((s) => s.id === 'bedroll');
          need(i >= 0, 'you carry no bedroll');
          const r = g.inventory.use(i); need(r.ok, r.why);
        } else { const r = S2.sleepAt(where, bed); need(r.ok, r.why); }
        S2.lastWake = null;
        for (let k = 0; k < 4000 && S2.sleep; k++) {
          await api._step(30);
          if (hours !== undefined && S2.sleep && S2.sleep.slept >= hours) S2.wake();
        }
        return { woke: S2.lastWake, needs: S2.view() };
      },
    },
    fever: {
      group: 'player', desc: 'BITE FEVER (canon: docs/design/THE_INFECTED.md §3.6; data/survival.js FEVER). No args: whether you have it, game hours left, treated or not. bite=true gives you the dirty wound a landed bite from the infected gives (36 game hours of stamina regen x0.75, hunger x1.3 and a little sway); treat=true takes antibiotics from your pack; clear=true ends it (testing). Antibiotics and then a full night\'s sleep break it early. It never kills, and you never turn.',
      args: { bite: { type: 'boolean' }, treat: { type: 'boolean' }, clear: { type: 'boolean' } },
      run: async ({ bite, treat, clear }) => {
        const S2 = g.survival, out = {};
        if (bite) S2.bitten();
        if (treat) {
          const i = g.inventory.carried.slots.findIndex((s) => s.id === 'antibiotics');
          need(i >= 0, 'you carry no antibiotics');
          const r = g.inventory.use(i); need(r.ok, r.why); out.used = r.text;
        }
        if (clear) S2.feverEnds('passed');
        S2.update(0);
        const v = S2.view();
        return { ...out, fever: v.fever, effects: v.effects };
      },
    },
    skills: {
      group: 'player', desc: 'Strength, dexterity, endurance (0-10, grown by doing: hits and reloads, sprinting and swimming, hauling a heavy load), what they do for you now, and what you carry (kg against capacity). strength=, dexterity=, endurance= set a level.',
      args: { strength: { type: 'number' }, dexterity: { type: 'number' }, endurance: { type: 'number' } },
      run: async (a) => {
        const S = g.skillsSys;
        for (const k of ['strength', 'dexterity', 'endurance']) if (a[k] !== undefined) { need(a[k] >= 0 && a[k] <= 10, `${k} is 0..10`); S.lv[k] = Math.round(a[k]); S.xp[k] = 0; }
        S.recompute();
        return S.view();
      },
    },
    garage: {
      group: 'vehicle', desc: 'Fit or read a car\'s armour and mounts (data/parts.js): plates=front|rear|left|right|sides|all with points=N (negative removes), mount=mg|oil|caltrops|smoke, refill=true. vehicle defaults to the one you are in (or last drove). pay=true charges your cash like Kenji does.',
      args: { vehicle: { type: 'string' }, plates: { type: 'string' }, points: { type: 'number', default: 4 }, mount: { type: 'string' }, refill: { type: 'boolean', default: false }, pay: { type: 'boolean', default: false } },
      run: async ({ vehicle, plates, points, mount, refill, pay }) => {
        const v = vehicle ? api.findVeh(vehicle) : P().inVehicle ?? g.lastVehicle;
        need(v && !v.dead, vehicle ? `no live vehicle ${vehicle}` : 'not in (or near) a vehicle; pass vehicle=');
        const G = g.garage, out = {};
        if (plates) {
          if (pay) need(g.spend(Math.max(0, points) * PLATE.price * (plates === 'sides' ? 2 : plates === 'all' ? 4 : 1)), 'not enough cash');
          const r = G.plate(v, plates, points); need(r.ok, r.why); out.added = r.added;
        }
        if (mount) { if (pay) need(g.spend(MOUNTS[mount]?.price ?? 0), 'not enough cash'); const r = G.mount(v, mount); need(r.ok, r.why); }
        if (refill) out.refilled = G.refill(v);
        return { ...G.view(v), ...out };
      },
    },
    dropper: {
      group: 'vehicle', desc: 'Drop whatever your car\'s tail carries (oil slick, caltrops, smoke) behind it. Keyboard: B while driving.',
      run: async () => { const v = P().inVehicle; need(v && v.driver === P(), 'you need to be driving'); const k = g.garage.drop(v); need(k, 'no dropper fitted, or it is empty'); return { dropped: k, left: v.mounts.rear.charges, hazards: g.garage.hazards.length }; },
    },
    inventory: {
      group: 'player', desc: 'What you carry (data/items.js): the pack you wear, weight and room, every item with uses left and freshness, and the container you have open. In the game: I or Tab opens the PACK screen; V uses whatever you need most (patch up, drink, eat).',
      run: async () => g.inventory.view(),
    },
    item: {
      group: 'player', desc: 'Work your pack. give=<id> n= adds; use=<id> uses one (food, water, meds; tools act on what is near: a fuel can on the car you are at, duct tape on its worst part); use=<med> on=<character> patches somebody else up instead (within 4.5 m, hurt or bleeding: a heal deed, the medic\'s work - in the game, talk to them); drop=<id> n= puts it on the ground; wear=<id> swaps your pack; take=<id> n= / stow=<id> n= move between you and the other side (the box or body at your feet, else the car you are at, else the ground); quick=true is the V key. Item ids: see data/items.js.',
      args: { give: { type: 'string' }, use: { type: 'string' }, on: { type: 'string' }, drop: { type: 'string' }, wear: { type: 'string' }, take: { type: 'string' }, stow: { type: 'string' }, n: { type: 'number', default: 1 }, quick: { type: 'boolean', default: false } },
      run: async ({ give, use, on, drop, wear, take, stow, n, quick }) => {
        const inv = g.inventory, C = inv.carried, idx = (box, id) => box.slots.findIndex((s) => s.id === id);
        const known = (id) => need(ITEMS[id], `unknown item ${id}; known: ${Object.keys(ITEMS).join(', ')}`);
        const out = {};
        if (quick) { const r = g.quickUse(); out.quick = r ? r.text : null; }
        if (give) { known(give); out.given = inv.add(C, give, n, ITEMS[give].uses ? { left: ITEMS[give].uses } : {}); inv.changed(); }
        if (use && on) {
          known(use); const c = api.findChar(on); need(c && c !== P(), `no character ${on}`);
          const r = inv.treat(c, use); need(r.ok, r.why); out.used = r.text; out.patient = { id: c.id, hp: Math.round(c.hp), maxHp: c.maxHp, bleeding: (c.bleed ?? 0) > 0.1 };
        } else if (use) { known(use); const i = idx(C, use); need(i >= 0, `you carry no ${use}`); const r = inv.use(i); need(r.ok, r.why); out.used = r.text; }
        if (drop) { known(drop); const i = idx(C, drop); need(i >= 0, `you carry no ${drop}`); out.dropped = inv.move(C, i, inv.groundAt(P().x, P().z), n); inv.prune(); }
        if (wear) { known(wear); const i = idx(C, wear); need(i >= 0, `you carry no ${wear}`); const r = inv.swapPack(i); need(r.ok, r.why); out.worn = r.worn; }
        if (take || stow) {
          const other = g.invUI.pickOther(), id = take ?? stow; known(id);
          const [from, to] = take ? [other, C] : [C, other], i = idx(from, id);
          need(i >= 0, take ? `no ${id} in ${other.label}` : `you carry no ${id}`);
          out.moved = inv.move(from, i, to, n); out.other = other.label;
          if (!take) inv.prune();
        }
        return { ...out, ...inv.view() };
      },
    },
    pack: {
      group: 'player', desc: 'Open or close the PACK screen (what a player sees with I). on=true opens it beside whatever is at your feet; screenshots only show the world, so read the result.',
      args: { on: { type: 'boolean', default: true } },
      run: async ({ on }) => { g.invUI.toggle(on); return { open: g.invUI.open, other: g.invUI.other ? g.inventory.boxView(g.invUI.other) : null }; },
    },
    gun: {
      group: 'player', desc: 'Your guns as things (data/items.js GUN_*). No args: each gun slung on you - condition (1 clean, 0 broken), state (ok | worn | jammed | broken), rounds loaded, rounds for it in your pockets. sling=<gun item id> takes a gun from the other side (the body or box at your feet, else the car you are at, else the ground) or from your pack and slings it, swapped for yours if you carry one of its kind; stow=<weapon> puts a slung gun on the other side, drop=<weapon> on the ground (your last gun stays on you); clean=true uses a cleaning kit on the gun in your hands; fix=true pays the gunsmith\'s rate to make it clean (the agent skips the walk to Ike); cond=0..1 and jam=true|false set the gun in your hands (testing). In the game: R (or a pull of the dead trigger) clears a jam, the PACK screen (I) slings and stows.',
      args: { sling: { type: 'string' }, stow: { type: 'string' }, drop: { type: 'string' }, clean: { type: 'boolean' }, fix: { type: 'boolean' }, cond: { type: 'number' }, jam: { type: 'boolean' } },
      run: async ({ sling, stow, drop, clean, fix, cond, jam }) => {
        const inv = g.inventory, out = {}, k = g.inv.current;
        if (sling) {
          need(ITEMS[sling]?.kind === 'gun', `not a gun item; guns: ${Object.values(GUN_ITEM).join(', ')}`);
          const other = g.invUI.pickOther();
          let box = other, i = other.slots.findIndex((s) => s.id === sling);
          if (i < 0) { box = inv.carried; i = box.slots.findIndex((s) => s.id === sling); }
          need(i >= 0, `no ${sling} in ${other.label} or your pack`);
          const r = inv.sling(box, i); need(r.ok, r.why); out.slung = r.text; out.from = box.label;
        }
        if (stow || drop) {
          const w = stow ?? drop;
          need(g.inv.weapons.includes(w), `not slung on you; slung: ${g.inv.weapons.join(', ')}`);
          const r = inv.stowGun(w, drop ? inv.groundAt(P().x, P().z) : g.invUI.pickOther()); need(r.ok, r.why); out.stowed = r.text;
        }
        if (cond !== undefined) { g.inv.cond[g.inv.current] = Math.max(0, Math.min(1, cond)); inv.changed(); }
        if (jam !== undefined) { if (jam) g.inv.jam[g.inv.current] = true; else delete g.inv.jam[g.inv.current]; }
        if (clean) { const i = inv.carried.slots.findIndex((s) => s.id === 'cleaning_kit' && s.left > 0); need(i >= 0, 'you carry no cleaning kit'); const r = inv.use(i); need(r.ok, r.why); out.cleaned = r.text; }
        if (fix) { const cost = inv.smithQuote(g.inv.current), r = inv.smithFix(g.inv.current); need(r.ok, r.why); out.fixed = { weapon: k, cost }; }
        return { ...out, current: g.inv.current, guns: inv.gunView() };
      },
    },
    trade: {
      group: 'player', desc: 'Buy and sell over a trader\'s counter (data/trade.js, systems/trade.js): stand at a shelf in their shop with them there (Ike: guns, rounds, tools; Doc Reyes: meds; Kenji: parts, tools, packs; Mags: water, food, valuables). No args: the deal here - who, the standing tier, the buy and sell multipliers, their stock with prices, what of yours they would buy and for how much. buy=<item id> n= buys from the shelf at your feet (as many as fit and you can pay for; a gun you carry none of is slung); sell=<item id> n= sells from your pack; sellgun=<weapon> sells a slung gun. Price = worth (value, less wear, use and age) x the tier multiplier. With the trader away, taking from their shelf is stealing. In the game: the PACK screen at their shelf (Space buys or sells, E buys one and uses it).',
      args: { buy: { type: 'string' }, sell: { type: 'string' }, sellgun: { type: 'string' }, n: { type: 'number', default: 1 } },
      run: async ({ buy, sell, sellgun, n }) => {
        const inv = g.inventory, T = g.trade, box = g.invUI.pickOther(), D = T.at(box);
        need(D, box?.owner ? `${box.ownerName} is not at the counter (taking from ${box.label} would be stealing)` : `${box?.label ?? 'nothing here'} is nobody's shop: stand at a trader's shelf`);
        need(!D.refuse, `${D.name} won't deal with you (${D.tier})`);
        const out = {};
        if (buy) { const i = box.slots.findIndex((s) => s.id === buy); need(i >= 0, `${D.name} has no ${buy} on this shelf; here: ${box.slots.map((s) => s.id).join(', ') || 'nothing'}`); const r = T.buy(box, i, n, D); need(r.ok, r.why); out.bought = r; }
        if (sell) { const i = inv.carried.slots.findIndex((s) => s.id === sell); need(i >= 0, `you carry no ${sell}`); const r = T.sell(i, box, n, D); need(r.ok, r.why); out.sold = r; }
        if (sellgun) { need(g.inv.weapons.includes(sellgun), `not slung on you: ${g.inv.weapons.join(', ')}`); const r = T.sellGun(sellgun, box, D); need(r.ok, r.why); out.soldGun = r; }
        return { ...out, trader: D.id, name: D.name, tier: D.tier, buy: +D.buy.toFixed(3), sell: +D.sell.toFixed(3), cash: g.cash, shelf: box.label,
          stock: box.slots.map((s) => ({ id: s.id, n: s.n, price: T.buyPrice(s, s.n, D), each: T.buyPrice(s, 1, D), cond: s.cond })),
          yours: inv.carried.slots.filter((s) => T.deals(D, s.id)).map((s) => ({ id: s.id, n: s.n, pays: T.sellPrice(s, s.n, D) })) };
      },
    },
    zoom: {
      group: 'player', desc: 'The play camera\'s zoom level (data/camera.js): level=0..4 or a name (CLOSE, STREET, WIDE, FAR, HIGH). Returns the level, the target and current camera height, and viewR - the radius of ground on screen, which spawners and clean-ups treat as "in sight". Keyboard: Z out, Shift+Z in (or - and =).',
      args: { level: { type: 'string' } },
      run: async ({ level }) => {
        if (level !== undefined) {
          const n = /^\d+$/.test(level) ? Number(level) : ZOOM.levels.findIndex((l) => l.name === String(level).toUpperCase());
          need(n >= 0 && n < ZOOM.levels.length, `unknown zoom level; known: ${ZOOM.levels.map((l, i) => `${i}=${l.name}`).join(', ')}`);
          g.setZoom(n);
        }
        const L = ZOOM.levels[g.zoomLevel];
        return { level: g.zoomLevel, name: L.name, target: P().inVehicle ? L.drive : L.foot, camHeight: r1(g.camHeight), viewR: r1(g.viewR), shadowHalf: r1(g.sky.sun.shadow.camera.right) };
      },
    },
    stunts: {
      group: 'vehicle', desc: 'Jumps (data/stunts.js): the ramps, the named jumps (gap lip to lip, pay, times cleared), your records, who is in the air, and the last landing. run=<jump id> drives the car you are in (or a fresh type= car) at that jump from back= metres out, holding speed= m/s to the lip like a steady foot, then reports the landing: air time, distance, height, closing speed vn, grade (clean | rough | hard | crash), cleared, pay. ramp=<id> does the same at any ramp. Wreck Row lands soft at about 18 m/s (40 mph).',
      args: { run: { type: 'string' }, ramp: { type: 'string' }, speed: { type: 'number', default: 18 }, type: { type: 'string', default: 'sedan' }, back: { type: 'number', default: 22 } },
      run: async ({ run, ramp, speed, type, back }) => {
        const S = g.stunts;
        if (!run && !ramp) return S.view();
        const J = run ? S.jumps.find((j) => j.id === run) : null;
        need(!run || J, `no jump ${run}; known: ${S.jumps.map((j) => j.id).join(', ')}`);
        const r = S.byId[J ? J.from : ramp];
        need(r, `no ramp ${ramp}; known: ${S.ramps.map((x) => x.id).join(', ')}`);
        need(VEHICLES[type] && !VEHICLES[type].boat, `type must be a land vehicle: ${Object.keys(VEHICLES).filter((k) => !VEHICLES[k].boat).join(', ')}`);
        // Cars this command left parked (on a landing deck, say) would be in the next run's way: clear them first.
        for (const o of [...g.vehicles]) if (o.stuntCar && o !== P().inVehicle && !o.occ?.some(Boolean)) g.vehiclesSys.remove(o);
        let v = P().inVehicle;
        if (!v || v.driver !== P() || v.boat) {
          if (P().inVehicle) g.exitVehicle(true);
          v = g.vehiclesSys.spawn(type, r.x, r.z, r.h);
          v.stuntCar = true;
          await api.call('enterVehicle', { id: v.id, force: true });
        }
        // Line up on the ramp's centre line, `back` metres before its foot, nose along it, already rolling.
        const d = r.hl + back;
        Object.assign(v, { x: r.x - r.fx * d, z: r.z - r.fz * d, h: r.h, vx: r.fx * speed, vz: r.fz * speed, av: 0, y: 0, vy: 0, gy: 0, pitch: 0, roll: 0, air: false, fallen: false, wheelie: 0, lean: 0 });
        const n0 = S.count;
        let t = 0, flew = false, lip = 0, first = null;
        while (t < 8) {
          const fwd = v.vx * r.fx + v.vz * r.fz;
          g.driveOverride = !flew ? { throttle: Math.max(-1, Math.min(1, (speed - fwd) * 2.5)), steer: 0 } : { throttle: 0, steer: 0 };
          await api._step(1); t += 1 / 60;
          if (v.air && !flew) { flew = true; lip = Math.hypot(v.vx, v.vz); }
          if (flew && !v.air) { first = S.count > n0 ? S.last : null; break; } // the first touchdown is the jump (not a bounce after it)
          if (v.dead || !P().inVehicle) break;
        }
        g.driveOverride = { throttle: -1, steer: 0 }; await api._step(40); g.driveOverride = null;
        return { jump: J?.id ?? null, ramp: r.id, flew, lipSpeed: r1(lip), result: first, ...vehView(g, v) };
      },
    },
    hoodgun: {
      group: 'vehicle', desc: 'Fire the hood gun of the car you are driving: shots=N at x,z or id (it only fires within its arc of the nose). Keyboard: hold LMB aiming ahead.',
      args: { shots: { type: 'number', default: 6 }, x: { type: 'number' }, z: { type: 'number' }, id: { type: 'string' } },
      run: async ({ shots, x, z, id }) => {
        const v = P().inVehicle;
        need(v && v.driver === P() && v.mounts?.front, 'drive a car with a hood gun (garage mount=mg)');
        const t = id ? api.findChar(id) ?? api.findVeh(id) : null;
        let fired = 0, outOfArc = false;
        for (let i = 0; i < Math.min(60, shots); i++) {
          const tx = t ? t.x : x ?? v.x + Math.sin(v.h) * 20, tz = t ? t.z : z ?? v.z + Math.cos(v.h) * 20;
          const before = v.mounts.front.ammo;
          if (!g.garage.fireFront(v, P(), Math.atan2(tx - v.x, tz - v.z))) { outOfArc = true; break; }
          if (v.mounts.front.ammo < before) fired++;
          await api._step(Math.ceil(MOUNTS[v.mounts.front.kind].rate * 60));
        }
        return { fired, ammo: v.mounts.front.ammo, outOfArc, target: t ? { id: t.id, hp: Math.round(t.hp), alive: t.alive ?? !t.dead } : null };
      },
    },
    simTick: {
      group: 'society', desc: 'Run the off-screen world forward N game hours (≤240): income from held places, recruits, a skirmish roll each day for factions at war, camps changing hands; standings drift and roles you are not working at fade (docs/design/WEB_ROLES.md). Returns strength/stores before and after, what happened, and the roles you hold after.',
      args: { hours: { type: 'number', default: 24 } },
      run: async ({ hours }) => {
        need(hours > 0 && hours <= 240, 'hours must be in (0,240]');
        const S = g.society, before = S.sim.view(), seq0 = S.chronicle.seq, t0 = performance.now();
        for (let d = 0; d < Math.floor(hours / 24); d++) S.sim.tickDay();
        S.factions.tickHours(hours); S.sim.advance(hours); g.roles.tickHours(hours);
        const ms = +(performance.now() - t0).toFixed(2);
        return { hours, before, after: S.sim.view(), records: S.chronicle.query({ since: seq0, limit: 50 }).map((r) => readRec(g, r)), roles: g.roles.ids.filter((id) => g.roles.st[id].r > 0.05).map((id) => ({ id, renown: r1(g.roles.st[id].r), tier: ROLE_TIERS[g.roles.st[id].tier] })), ms };
      },
    },
    roles: {
      group: 'society', desc: "What the world calls you (docs/design/WEB_ROLES.md): no class is picked, you become what you keep doing. Every role with its tier (none, rumoured, known, renowned; `active` is what the world acts on, 0 while suspended), renown and how far to the next tier (and the line it would fall back under), why you hold it (what earned it, what wore it), what it opens (how each faction reads you, prices, perks, the dialogue and jobs it unlocks, offices), your jobs and offices, and priceMul per faction. id= one role; brief=true just the held ones. renown= sets that role's renown (staging, like standing set=; the tier still follows the hysteresis). reset=true clears every role.",
      args: { id: { type: 'string' }, brief: { type: 'boolean', default: false }, renown: { type: 'number' }, reset: { type: 'boolean', default: false } },
      run: async ({ id, brief, renown, reset }) => {
        const R = g.roles;
        if (reset) R.reset();
        if (id) need(R.rows[id], `unknown role; known: ${R.ids.join(',')}`);
        if (renown !== undefined) { need(id, 'renown= needs id='); need(renown >= 0 && renown <= 100, 'renown is 0..100'); R.setRenown(id, renown); }
        if (id) return { role: R.view(id, NPCS), perks: { ...R.perk }, priceMul: Object.fromEntries(g.society.factions.ids.map((f) => [f, r1(R.priceMul(f) * 100) / 100])) };
        const v = R.view(null, NPCS);
        if (brief) return { held: v.held, best: v.best, renown: Object.fromEntries(v.roles.filter((r) => r.renown > 0).map((r) => [r.id, { renown: r.renown, tier: r.tier, active: r.active, next: r.next, suspended: r.suspended }])), priceMul: v.priceMul, jobs: v.jobs, offices: v.offices };
        return v;
      },
    },
    registerRole: {
      group: 'content', desc: 'Add or update a role row (a new role is a row, not code; schema in src/data/roles.js): {name, short, color (never purple), blurb, tiers:[rumoured,known,renowned] (rising, ≤100), halfLife (game days), requires:{standing:{faction:min}, wanted, tally/tallyUnder:{"player|kill|rusthaven":n}, skill, carry, place, office}, earn:[{on: deed|drive|jump|search|loot|trade|event|hour, ...filters, pts, per, seen, note}], wear:[...], opens:{factions:{id:{standing, hostile, from}}, prices:{id|*:mul}, perks, director, refusedBy, greet, shout, radio}}.',
      args: { id: { type: 'string', required: true }, def: { type: 'object', required: true } },
      run: async ({ id, def }) => {
        const r = g.roles.register(id, def);
        need(!r.error, r.error);
        return { id, warnings: r.warnings, role: g.roles.view(id, NPCS) };
      },
    },
    registerFaction: {
      group: 'content', desc: 'Add or update a faction row (max 16): {name, archetype, color (never purple), start, stars, forgivesSelfDefense, cohesion, memoryDays, rumorDelay:[lo,hi], hub:[x,z], leaders, relations:{id:n,"*":n}, values:{"verb:self":n, "verb:enemy":n, ...}}.',
      args: { id: { type: 'string', required: true }, def: { type: 'object', required: true } },
      run: async ({ id, def }) => {
        const r = g.society.factions.register(id, def);
        need(!r.error, r.warnings.join('; '));
        return { id, index: r.index, warnings: r.warnings, faction: g.society.factions.view(id) };
      },
    },

    // ---------------------------------------------------------------- content (runtime registration)
    registerWeapon: {
      group: 'content', desc: 'Add/override a weapon row at runtime. def: {name, short, dmg, rate, mag, reload, spread, range, auto, pellets, ammo:pistol|smg|shells, sound:pistol|smg|shotgun, shake}. Then give {weapon:key}.',
      args: { key: { type: 'string', required: true }, def: { type: 'object', required: true } },
      run: async ({ key, def }) => { WEAPONS[key] = { ...(WEAPONS[key] ?? WEAPONS.pistol), ...def }; return { weapon: key, def: WEAPONS[key] }; },
    },
    registerVehicle: {
      group: 'content', desc: 'Add/override a vehicle handling row. Base body shape is copied from def.base (rig|interceptor|buggy|pickup).',
      args: { key: { type: 'string', required: true }, def: { type: 'object', required: true } },
      run: async ({ key, def }) => { VEHICLES[key] = { ...(VEHICLES[def.base ?? 'interceptor']), ...def }; return { vehicle: key, def: VEHICLES[key] }; },
    },
    registerNpc: {
      group: 'content', desc: 'Create a named NPC with a portrait + branching dialogue and spawn them. def follows src/data/npcs.js (id,name,title,flag,faction,portrait,start,nodes). Node choices may use simple effects: {t, next|end, cost:N, give:{cash,ammo,weapon}, setQuest:{key:value}, ifQuest:{key:value}, weather:"STORM"} — no functions needed.',
      args: { def: { type: 'object', required: true }, x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ def, x, z }) => {
        need(def.id && def.name && def.nodes && def.start, 'def needs id, name, start, nodes');
        need(def.nodes[def.start], `start node "${def.start}" missing`);
        const warnings = validateNpc(def);
        const npc = compileNpc(def);
        NPCS.push(npc);
        const p = npc.portrait ?? { seed: Math.floor(Math.random() * 1e6) };
        const c = g.addChar({ x: x ?? P().x + 3, z: z ?? P().z, faction: npc.faction ?? 'drifter', weapon: npc.weapon ?? null, npc, name: npc.name, flag: npc.flag ?? 'US', hp: 140,
          colors: { skin: p.skin ?? '#c68863', hair: p.hair ?? '#2a1a12', shirt: p.shirt ?? '#5a4a38', pants: '#2f2a24' } });
        need(c, 'character budget full');
        return { id: c.id, npc: npc.id, nodes: Object.keys(npc.nodes), warnings };
      },
    },
    content: {
      group: 'content', desc: 'Content-pack load report (errors + warnings per pack) and registered keys: weapons, vehicles, weather, flags, npcs.',
      run: async () => ({ packs: g.contentReport ?? [], weapons: Object.keys(WEAPONS), vehicles: Object.keys(VEHICLES), weather: Object.keys(WEATHER), flags: FLAG_KEYS, npcs: NPCS.map((n) => n.id) }),
    },

    // ---------------------------------------------------------------- scripting
    scenario: {
      group: 'script', budget: 900, desc: 'Run a scenario module from src/scenarios/<name>.js (export default async (DL, game) => summary). List with name=list.',
      args: { name: { type: 'string', required: true } },
      run: async ({ name }) => {
        const mods = import.meta.glob('../scenarios/*.js');
        const keys = Object.keys(mods).map((k) => k.split('/').pop().replace('.js', ''));
        if (name === 'list') return { scenarios: keys };
        const key = `../scenarios/${name}.js`;
        need(mods[key], `no scenario "${name}"; have: ${keys.join(', ')}`);
        const mod = await mods[key]();
        const out = await mod.default(api.bind(), g);
        return { scenario: name, summary: out ?? null };
      },
    },
    exec: {
      group: 'script', desc: 'Escape hatch: run JS with (game, DL) in scope; return value is JSON-serialised. Use sparingly; prefer a real command.',
      args: { code: { type: 'string', required: true } },
      run: async ({ code }) => {
        // eslint-disable-next-line no-new-func
        // Try as an expression first; fall back to a function body (use `return`).
        let fn;
        try { fn = new Function('game', 'DL', `return (async () => (${code}))()`); }
        catch { fn = new Function('game', 'DL', `return (async () => { ${code} })()`); }
        const v = await fn(g, api.bind());
        return { value: JSON.parse(JSON.stringify(v ?? null, (k, x) => (typeof x === 'object' && x?.isObject3D ? '[Object3D]' : x))) };
      },
    },
    bench: {
      group: 'script', desc: 'Measure real frame cost: runs N frames of sim + full render, returns avg/p95/max ms, est. fps, draw calls, triangles.',
      args: { frames: { type: 'number', default: 240 }, width: { type: 'number', default: 1280 }, height: { type: 'number', default: 720 } },
      run: async ({ frames, width, height }) => {
        const r = g.renderer, cam = g.camera;
        const prevPR = r.getPixelRatio(), prevW = r.domElement.width / prevPR, prevH = r.domElement.height / prevPR, prevAspect = cam.aspect;
        r.setPixelRatio(1); r.setSize(width, height, false); cam.aspect = width / height; cam.updateProjectionMatrix();
        const sim = [], total = [];
        const gl = r.getContext();
        const px = new Uint8Array(4);
        const wasPaused = g.paused; g.paused = false;
        let calls = 0, tris = 0;
        for (let i = 0; i < frames; i++) {
          const t0 = performance.now();
          g.frame(1 / 60);
          const t1 = performance.now();
          g.render(1 / 60);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // force GPU sync so timings are honest
          const t2 = performance.now();
          sim.push(t1 - t0); total.push(t2 - t0);
          calls = Math.max(calls, r.info.render.calls); tris = Math.max(tris, r.info.render.triangles);
        }
        g.paused = wasPaused;
        r.setPixelRatio(prevPR); r.setSize(prevW, prevH, false); cam.aspect = prevAspect; cam.updateProjectionMatrix();
        const stat = (a) => { const s2 = [...a].sort((x, y) => x - y); const avg = a.reduce((x, y) => x + y, 0) / a.length; return { avg: +avg.toFixed(2), p95: +s2[Math.floor(a.length * 0.95)].toFixed(2), max: +s2[a.length - 1].toFixed(2) }; };
        const t = stat(total);
        return { frames, resolution: `${width}x${height}`, simMs: stat(sim), frameMs: t, estFps: Math.round(1000 / t.avg), maxDrawCalls: calls, maxTriangles: tris,
          gpu: (() => { const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })(),
          chars: g.chars.length, vehicles: g.vehicles.length };
      },
    },
    save: {
      group: 'script', desc: 'Serialise the full game state (player, inventory, quests, time, weather, every character + vehicle) to JSON. Pass the result to load.',
      run: async () => ({ save: snapshot(g) }),
    },
    load: {
      group: 'script', desc: 'Restore a state produced by save (positions, health, deaths, inventory, quests, time, weather, vehicles).',
      args: { save: { type: 'object', required: true } },
      run: async ({ save }) => restore(g, save),
    },
    selftest: {
      group: 'script', budget: 300, desc: 'Run the engine self-test battery (spawn, shoot, gore, drive, harpoon, dialogue, weather, interiors). Restores nothing — run on a fresh page.',
      run: async () => runSelfTest(api),
    },
  };
}

// Turn declarative choice effects into the function hooks the dialogue system uses.
// Quest condition: every key must match (AND). null means "not set yet".
const questMatch = (g, cond) => Object.entries(cond).every(([k, v]) => (g.quests[k] ?? null) === v);
const PORTRAIT = { hat: ['short', 'long', 'bald', 'mohawk', 'cap', 'cowboy', 'wrap'], gear: ['none', 'goggles', 'scar', 'bandana', 'eyepatch', 'bandolier'], mood: ['neutral', 'smile', 'angry'] };

// Content-pack lint: returned as `warnings` (and listed in contentReport).
export function validateNpc(def) {
  const warn = [];
  for (const [k, list] of Object.entries(PORTRAIT)) if (def.portrait?.[k] !== undefined && !list.includes(def.portrait[k])) warn.push(`portrait.${k}="${def.portrait[k]}" is not one of ${list.join('|')} (ignored)`);
  if (def.flag && !FLAGS[def.flag]) warn.push(`flag "${def.flag}" unknown; known: ${FLAG_KEYS.join(',')}`);
  for (const [id, n] of Object.entries(def.nodes ?? {})) for (const c of n.choices ?? []) if (c.next && !def.nodes[c.next]) warn.push(`node "${id}" choice "${c.t}" -> missing node "${c.next}"`);
  for (const s2 of def.startIf ?? []) if (!def.nodes?.[s2.node]) warn.push(`startIf -> missing node "${s2.node}"`);
  return warn;
}

// Turn declarative choice effects into the function hooks the dialogue system uses.
// Society conditions for pack dialogue (WEB_WORLD_MEMORY phase 2), checked against the person you're talking to:
//   ifMemory / ifNotMemory: a memory kind they hold of you ("killedKin")
//   ifOpinion: { atLeast, atMost }   ifTier: { faction (default theirs), atLeast, atMost } with tiers hunted..allied
const TIER_ORDER = ['hunted', 'hostile', 'wary', 'neutral', 'friendly', 'allied'];
function societyMatch(g, c) {
  const who = g.dialogue?.npc, S = g.society;
  if (!who || !S) return !(c.ifMemory || c.ifOpinion || c.ifTier);
  const holds = (kind) => !!S.memory.byNpc.get(who.npc?.id)?.mems.some((m) => m.kind === kind && Math.abs(S.memory.value(m)) >= 1);
  if (c.ifMemory && !holds(c.ifMemory)) return false;
  if (c.ifNotMemory && holds(c.ifNotMemory)) return false;
  if (c.ifOpinion) { const o = S.memory.opinion(who); if (c.ifOpinion.atLeast !== undefined && o < c.ifOpinion.atLeast) return false; if (c.ifOpinion.atMost !== undefined && o > c.ifOpinion.atMost) return false; }
  if (c.ifTier) {
    const F = S.factions, i = F.index[c.ifTier.faction ?? who.fid], t = TIER_ORDER.indexOf(F.tiers[i]);
    if (c.ifTier.atLeast && t < TIER_ORDER.indexOf(c.ifTier.atLeast)) return false;
    if (c.ifTier.atMost && t > TIER_ORDER.indexOf(c.ifTier.atMost)) return false;
  }
  return true;
}

// Role conditions (docs/design/WEB_ROLES.md): ifRole { role, atLeast (default known) } · ifNotRole { role, atLeast
// (default rumoured) } · ifJob { job, is: open | active | ready } · ifOffice: an office id you hold.
function roleMatch(g, c) {
  const R = g.roles;
  if (!R) return !(c.ifRole || c.ifJob || c.ifOffice);
  if (c.ifRole && !R.atLeast(c.ifRole.role, c.ifRole.atLeast ?? 'known')) return false;
  if (c.ifNotRole && R.atLeast(c.ifNotRole.role, c.ifNotRole.atLeast ?? 'rumoured')) return false;
  if (c.ifJob) { const is = c.ifJob.is ?? 'open', j = c.ifJob.job; if (!(is === 'open' ? R.jobOpen(j) : is === 'active' ? R.jobActive(j) : R.jobReady(j))) return false; }
  if (c.ifOffice && !R.office(c.ifOffice)) return false;
  return true;
}

function compileNpc(def) {
  const nodes = {};
  for (const [id, n] of Object.entries(def.nodes)) {
    nodes[id] = {
      text: n.text,
      choices: (n.choices ?? [{ t: '[Leave]', end: true }]).map((c) => ({
        t: c.t, next: c.next, end: c.end ?? !c.next, deed: c.deed,
        role: c.ifRole?.role, from: c.ifRole ? c.ifRole.atLeast ?? 'known' : undefined, // read by the roles command (what a role opens)
        req: c.ifQuest || c.ifNotQuest || c.ifMemory || c.ifNotMemory || c.ifOpinion || c.ifTier || c.ifRole || c.ifNotRole || c.ifJob || c.ifOffice
          ? (g) => (!c.ifQuest || questMatch(g, c.ifQuest)) && (!c.ifNotQuest || !questMatch(g, c.ifNotQuest)) && societyMatch(g, c) && roleMatch(g, c)
          : c.req,
        do: (g) => {
          // Role effects: start or pay out a role job, take an office (data/roles.js ROLE_JOBS / ROLE_OFFICES).
          if (c.job?.start) g.roles?.jobStart(c.job.start);
          if (c.job?.pay) g.roles?.jobPay(c.job.pay);
          if (c.swear) g.roles?.swear(c.swear, def.id);
          if (c.cost && !g.spend(c.cost)) return;
          if (c.give) g.give({ cash: c.give.cash ?? 0, ammo: c.give.ammo ?? {} });
          if (c.give?.weapon && WEAPONS[c.give.weapon] && !g.inv.weapons.includes(c.give.weapon)) g.inventory.gainGun(c.give.weapon);
          if (c.setQuest) Object.assign(g.quests, c.setQuest);
          if (c.weather) g.sky.setWeather(c.weather);
          if (c.toast) g.hud.toast(c.toast, 'job');
          // Point the player somewhere: GPS waypoint + tracker text ("objective": null clears both).
          if (c.waypoint) g.qol.setWaypoint({ x: c.waypoint.x, z: c.waypoint.z });
          if (c.objective !== undefined) { g.qol.customObjective = c.objective ? { text: c.objective, target: c.waypoint ?? null } : null; if (!c.objective) g.qol.setWaypoint(null); }
          if (c.horde) g.zombies.horde(c.horde.x, c.horde.z, c.horde.count ?? 8, c.horde.runners ?? 0.2);
        },
      })),
    };
  }
  // startIf: [{ ifQuest | ifNotQuest, node }] — the first match picks the opening node.
  const startFor = def.startIf ? (g) => (def.startIf.find((s2) => (!s2.ifQuest || questMatch(g, s2.ifQuest)) && (!s2.ifNotQuest || !questMatch(g, s2.ifNotQuest)))?.node ?? def.start) : null;
  return { faction: 'drifter', flag: 'US', title: 'Wanderer', ...def, nodes, startFor };
}


async function runSelfTest(api) {
  const g = api.g;
  const results = [];
  const check = async (name, fn) => {
    // Only true/undefined pass. Checks report failure by returning a diagnostic string, and this used
    // to be `v !== false`, which counted every such string as a PASS: the suite read green while
    // several checks were failing.
    try { const v = await fn(); const pass = v === true || v === undefined; results.push({ name, pass, detail: pass ? '' : v }); }
    catch (e) { results.push({ name, pass: false, detail: String(e.message ?? e) }); }
  };
  const C = (cmd, a) => api.call(cmd, a);
  await C('start');
  await C('god', { on: true });
  // The director would drop hunters or a herd into unrelated checks: its own checks fire events by hand.
  const directorWas = g.society.director.paused;
  g.society.director.paused = true;
  await check('state readable', async () => (await C('state')).player.alive === true);
  await check('step returns state + events', async () => { const r = await C('step', { seconds: 0.1 }); return r.ok && r.player && Array.isArray(r.events) ? true : JSON.stringify(r).slice(0, 80); });
  await check('teleport snaps out of walls', async () => { const r = await C('teleport', { x: 0, z: -40 }); return r.ok; });
  await check('weather cycles', async () => { for (const k of ['RAIN', 'DUST', 'STORM', 'CLEAR']) { const r = await C('setWeather', { key: k, instant: true }); if (!r.ok) return false; } return true; });
  await check('day/night', async () => { await C('setTime', { hour: 23 }); await C('step', { seconds: 0.2 }); const n = g.sky.night; await C('setTime', { hour: 12 }); await C('step', { seconds: 0.2 }); return n > 0.8 && g.sky.night < 0.2 ? true : `night=${n} day=${g.sky.night}`; });
  await check('raider spawn + gunfight kill', async () => {
    const { ids } = await C('spawn', { kind: 'raider', x: g.player.x + 10, z: g.player.z, hp: 30 });
    await C('give', { pistol: 50 });
    const decalsBefore = g.fx.dNext;
    const r = await C('fire', { id: ids[0], shots: 6 });
    const dead = !api.findChar(ids[0]).alive;
    return dead && g.fx.dNext !== decalsBefore ? true : `dead=${dead} killed=${r.killed}`;
  });
  await check('SMG registered + auto fire', async () => { await C('give', { weapon: 'smg', smg: 64 }); const r = await C('equip', { weapon: 'smg' }); return r.ok; });
  await check('dialogue tree', async () => {
    // The raider check before this one can drop her with a stray round (an essential person is downed 45 s, and the
    // downed do not talk): wait her out rather than read a flake as a failure.
    const sheriff = g.chars.find((c) => c.npc?.id === 'okonkwo');
    if (sheriff?.downedT > 0) await C('step', { seconds: sheriff.downedT + 0.5 });
    const t = await C('talk', { id: 'okonkwo', force: true });
    if (!t.open || !t.choices.length) return 'no dialogue';
    const c = await C('choose', { index: t.choices.length - 1 });
    return c.ok && !c.open;
  });
  await check('runtime NPC with declarative dialogue', async () => {
    const r = await C('registerNpc', { def: { id: 'selftest_bot', name: 'Test Dummy', flag: 'CA', start: 'a', nodes: { a: { text: 'Hello agent.', choices: [{ t: 'Pay me', give: { cash: 5 }, end: true }] } } } });
    const cash = g.cash;
    await C('talk', { id: 'selftest_bot', force: true });
    await C('choose', { index: 0 });
    return r.ok && g.cash === cash + 5;
  });
  await check('enter the Whaler + drive', async () => {
    const rig = g.vehicles.find((v) => v.type === 'rig');
    await C('teleport', { x: rig.x + 4, z: rig.z });
    const e = await C('enterVehicle', { id: rig.id, force: true });
    const x0 = rig.x, z0 = rig.z;
    await C('drive', { throttle: 1, seconds: 2 });
    return e.ok && Math.hypot(rig.x - x0, rig.z - z0) > 3;
  });
  await check('harpoon hooks a car', async () => {
    const rig = g.player.inVehicle;
    rig.vx = rig.vz = 0;
    const tgt = await C('spawnVehicle', { type: 'buggy', x: rig.x + Math.sin(rig.h) * 18, z: rig.z + Math.cos(rig.h) * 18, ai: 'none' });
    const r = await C('harpoon', { id: tgt.id });
    await C('step', { seconds: 0.4 });
    const hooked = g.vehiclesSys.harpoon?.state === 'attached';
    if (hooked) await C('harpoon', { id: tgt.id }); // yank
    return hooked ? true : `state=${r.state}`;
  });
  await check('exit vehicle', async () => (await C('exitVehicle')).ok);
  await check('interior roof hides', async () => {
    const b = g.world.buildings.find((x) => x.enterable && x.roofIdx.length && x.district === 'town');
    await C('teleport', { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 });
    await C('step', { seconds: 0.1 });
    return g.insideBuilding === b;
  });
  await check('audio synthesizes positional sound', async () => {
    const before = Object.values(g.audio.counts).reduce((a, b) => a + b, 0);
    await C('fire', { x: g.player.x + 5, z: g.player.z, shots: 2 });
    await C('moveTo', { x: g.player.x + 4, z: g.player.z, wait: true });
    const after = Object.values(g.audio.counts).reduce((a, b) => a + b, 0);
    return g.audio.ctx && after > before + 2 ? true : `ctx=${!!g.audio.ctx} played ${after - before}`;
  });
  await check('gore: blood soaks clothes, head pops, footprints', async () => {
    const { ids } = await C('spawn', { kind: 'drifter', x: g.player.x + 6, z: g.player.z });
    const c = api.findChar(ids[0]);
    g.combat.damage(c, 30, null, 1, 0);
    const soaked = c.blood > 0;
    await C('kill', { id: ids[0], cause: 'explosion' });
    const decals = g.fx.dNext;
    g.player.x = c.x; g.player.z = c.z; // stand in the pool
    await C('moveTo', { x: c.x + 8, z: c.z, wait: true });
    return soaked && c.headless && g.fx.dNext !== decals ? true : `soaked=${soaked} headless=${c.headless} footprints=${g.fx.dNext !== decals}`;
  });
  await check('every building interior + NPC home walkable', async () => {
    const n = g.nav.foot, bad = [];
    for (const b of g.world.buildings) {
      if (!b.enterable || !b.doors.length) continue;
      const d = b.doors[0];
      const pts = [[(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2], [b.minX + 1.5, b.minZ + 1.5], [b.maxX - 1.5, b.maxZ - 1.5], [b.minX + 1.5, b.maxZ - 1.5], [b.maxX - 1.5, b.minZ + 1.5]];
      if (!pts.every(([x, z]) => !n.free(x, z) || n.find(d.x, d.z, x, z))) bad.push(`${Math.round((b.minX + b.maxX) / 2)},${Math.round((b.minZ + b.maxZ) / 2)}`);
    }
    for (const c of g.chars) if (c.npc && !n.find(0, -40, c.home.x, c.home.z)) bad.push(c.npc.id);
    return bad.length ? `sealed: ${bad.join(' ')}` : true;
  });
  await check('moveTo id reaches a vehicle and an NPC promptly', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    await C('teleport', { x: -16, z: -16 });
    const a = await C('moveTo', { id: 'okonkwo', run: true });
    const rig = g.vehicles.find((v) => v.type === 'rig' && !v.dead && !v.driver);
    const b = rig ? await C('moveTo', { id: rig.id, run: true }) : { arrived: true, secondsUsed: 0 };
    return a.arrived && b.arrived && a.secondsUsed < 30 && b.secondsUsed < 30 ? true : `npc ${a.arrived}/${a.secondsUsed}s rig ${b.arrived}/${b.secondsUsed}s`;
  });
  await check('vehicle damage: crash dents the front, hurts engine/radiator, panels tear off', async () => {
    const v = api.findVeh((await C('spawnVehicle', { type: 'sedan', x: 400, z: 40, heading: 0 })).id);
    for (let i = 0; i < 4; i++) g.vehDamage.hit(v, v.x, v.z + v.len / 2 + 0.3, 30, 'crash');
    g.vehDamage.deform(v);
    const d = v.dmg;
    return d.zones.front > 0.6 && d.engine < 1 && d.radiator < 0.5 && Object.keys(d.off).length > 0 ? true : JSON.stringify({ front: d.zones.front, engine: d.engine, rad: d.radiator, off: d.off });
  });
  await check('vehicle damage: flat tyre pulls, leaking tank drains fuel', async () => {
    const r = await C('spawnVehicle', { type: 'interceptor', x: 420, z: 40, heading: 0 });
    const v = api.findVeh(r.id);
    g.vehDamage.popTyre(v, 'FL');
    v.dmg.tank = 0.2;
    const fuel0 = v.fuel;
    g.vehDamage.effects(v, 1);
    const fx = g.vehDamage.effects(v, 1);
    return fx.pull !== 0 && fx.grip < 1 && v.fuel < fuel0 ? true : JSON.stringify({ pull: fx.pull, grip: fx.grip, fuel: [fuel0, v.fuel] });
  });
  await check('seats: back seats, passenger boarding, seat swap hands the wheel to an ally', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    const r = await C('spawnVehicle', { type: 'sedan', x: 440, z: 40, heading: 0 });
    const v = api.findVeh(r.id);
    await C('teleport', { x: 442.5, z: 40 });
    const { ids } = await C('spawn', { kind: 'drifter', x: 443, z: 41, weapon: 'pistol' });
    await C('recruit', { id: ids[0] });
    const e = await C('enterVehicle', { id: r.id });
    await C('step', { seconds: 1.5 }); // ally walks over and boards
    const ally = api.findChar(ids[0]);
    const boarded = ally.inVehicle === v && ally.seat > 0;
    await C('seat', { seat: 'next' });
    const allyDriving = v.driver === ally && v.ai === 'chauffeur';
    return e.ok && v.seats.length === 4 && boarded && allyDriving ? true : JSON.stringify({ seats: v.seats.length, boarded, allySeat: ally.seat, driver: v.driver?.id, ai: v.ai });
  });
  await check('motorcycle: leans in turns, wheelies on boost, crash throws the rider', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    // Open desert inside the map: x=460 was inside the east boundary wall (x 450..470).
    const r = await C('spawnVehicle', { type: 'bike', x: -410, z: 405, heading: 0 });
    const v = api.findVeh(r.id);
    await C('enterVehicle', { id: r.id, force: true });
    // Boost off the line (through the drive command, as the keyboard does): wheelies are a launch thing,
    // under 24 m/s. After the old order (a 1.2 s full-throttle turn first) the bike was already past that.
    await C('drive', { throttle: 1, boost: true, seconds: 0.6 });
    const wheelie = v.wheelie > 0.1;
    await C('drive', { throttle: 1, steer: 1, seconds: 1.2 });
    const leaned = Math.abs(v.lean) > 0.05;
    // Crash: slam it into a wall at speed.
    v.vx = 0; v.vz = 25; v.h = 0;
    g.statics.add(v.x - 3, v.z + 1.5, v.x + 3, v.z + 2.5, 'wall', 3);
    await C('step', { seconds: 0.3 });
    const thrown = !g.player.inVehicle && v.fallen;
    return leaned && wheelie && thrown ? true : JSON.stringify({ lean: v.lean, wheelie: v.wheelie, inVehicle: !!g.player.inVehicle, fallen: v.fallen });
  });
  await check('throwables: frag kills a group, molotov burns, smoke blocks sight, flash blinds, sticky sticks', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    // Open dry desert. The old spot (420,90) is the river now: the player threw while swimming, the
    // dead stopped at the bank short of the frag and the target car floated in the channel.
    const X = 364, Z = 39;
    const pin = (id, x, z) => { const c = api.findChar(id); c.x = x; c.z = z; return c; }; // spawn jitters ±2 m
    await C('teleport', { x: X, z: Z });
    await C('give', { frag: 3, molotov: 2, smoke: 2, flash: 2, sticky: 2 });
    // Three infected staged to stand still (zSpeed 0) round a spot 12 m east, 0.9+ m apart so the crowd doesn't shove them.
    const a = await C('spawn', { kind: 'zombie', runner: false, x: X + 12, z: Z, count: 3 });
    a.ids.forEach((id, i) => { pin(id, X + 12 + [-0.6, -0.6, 0.9][i], Z + [-0.8, 0.8, 0][i]).zSpeed = 0; });
    // Cooked so it bursts as it lands (the 12 m lob is ~1 s in the air). Left to its 2.8 s fuse a frag
    // bounces on ~3.5 m past where it lands, out of killing range: grenades are cooked into a group.
    const f = await C('throw', { type: 'frag', x: X + 12, z: Z, cook: 1.7 });
    const fragOk = a.ids.every((id) => !api.findChar(id)?.alive);
    const b = await C('spawn', { kind: 'drifter', x: X + 6, z: Z + 8 });
    pin(b.ids[0], X + 6, Z + 8).hold = true; // stands still: a wandering target walked out of the 3.4 m fire (a flaky check)
    const m = await C('throw', { type: 'molotov', id: b.ids[0] });
    const burned = m.effects.some((e) => e.type === 'ignited') || (api.findChar(b.ids[0])?.burning ?? 0) > 0 || !api.findChar(b.ids[0])?.alive;
    await C('throw', { type: 'smoke', x: X, z: Z + 16 });
    await C('step', { seconds: 2 });
    const smokeBlocks = !g.los(X, Z + 10, X, Z + 22);
    const r = await C('spawn', { kind: 'raider', x: X - 10, z: Z, weapon: 'pistol' });
    pin(r.ids[0], X - 10, Z);
    await C('throw', { type: 'flash', x: X - 10, z: Z });
    const blind = (api.findChar(r.ids[0])?.blind ?? 0) > 0 || !api.findChar(r.ids[0])?.alive;
    const car = await C('spawnVehicle', { type: 'sedan', x: X - 6, z: Z - 10 });
    // The throw report says what it stuck to. (Peeking 0.5 s after release never could: an 11 m lob
    // is still in the air at 0.5 s.)
    const st = await C('throw', { type: 'sticky', id: car.id });
    const stuck = st.stuckTo === car.id;
    return f.ok && fragOk && burned && smokeBlocks && blind && stuck ? true : JSON.stringify({ frag: fragOk, fk: f.kills, burned, smokeBlocks, blind, stuck, stuckTo: st.stuckTo });
  });
  await check('dive roll covers ground and costs stamina; crouch hides you', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    await C('teleport', { x: 365, z: -240 }); // dry ground: (420,140) is in the river now
    g.player.stamina = 1;
    const d = await C('dive', { x: 375, z: -240 });
    return d.ok && d.moved > 3 && d.stamina < 0.9 ? true : JSON.stringify(d);
  });
  await check('terrain: mountains are solid and routed around', async () => {
    const pk = g.terrain.peaks;
    const big = pk.reduce((b, p) => (p.r > b.r ? p : b), pk[0]);
    const blocked = g.statics.pointBlocked(big.x, big.z, 0.5);
    const path = await C('path', { fx: big.x - big.r - 8, fz: big.z, x: big.x + big.r + 8, z: big.z, mode: 'car' });
    return pk.length >= 15 && blocked && path.found && path.length > big.r * 2.2 ? true : JSON.stringify({ peaks: pk.length, blocked, path: path.found, len: path.length, r: big.r });
  });
  await check('water: lake is deep, bridge deck is dry, swimming + diving hides you', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    const deep = g.water.depthAt(390, 398) > 5, deck = g.water.depthAt(416, 0) === 0, underDeck = g.water.depthAt(416, 0, true) > 1;
    // Swim mid-river with a raider on the bank 8 m off: close enough to spot even a crouching swimmer, so
    // only being under the water can hide you. (The old raider stood in deep water by the dock, 25 m out:
    // it couldn't see a crouching player anyway, and the lake patrol boat's route ran it over.)
    await C('teleport', { x: 417.4, z: 200 });
    await C('step', { seconds: 0.3 });
    const swimming = !!g.player.swim;
    await C('submerge', { on: true });
    const { ids } = await C('spawn', { kind: 'raider', x: 409.4, z: 200, weapon: 'smg' });
    const rd = api.findChar(ids[0]); rd.x = 409.4; rd.z = 200; // spawn jitters ±2 m
    await C('step', { seconds: 2 });
    const hidden = !rd.target;
    const b0 = g.player.breath;
    await C('submerge', { on: false });
    g.crouchOverride = false;
    await C('step', { seconds: 1 });
    const spotted = rd.target === g.player; // up for air: there you are
    return deep && deck && underDeck && swimming && g.player.underwater === false && b0 < 1 && hidden && spotted ? true : JSON.stringify({ deep, deck, underDeck, swimming, b0, hidden, target: rd.target?.id ?? null, spotted });
  });
  await check('cars flood and sink; boats float and beach', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    const car = api.findVeh((await C('spawnVehicle', { type: 'sedan', x: 385, z: 398 })).id);
    await C('step', { seconds: 6 });
    const sank = car.sunk;
    const boat = api.findVeh((await C('spawnVehicle', { type: 'airboat', x: 380, z: 392, heading: 0 })).id);
    await C('teleport', { x: 380, z: 389 });
    await C('enterVehicle', { id: boat.id, force: true });
    await C('drive', { throttle: 1, seconds: 2 });
    const moved = g.vehiclesSys.speed(boat) > 6;
    const land = api.findVeh((await C('spawnVehicle', { type: 'jetski', x: 250, z: 250 })).id);
    land.driver = g.player; land.throttle = 1; // dry land: a waterbike can't go
    for (let i = 0; i < 60; i++) { g.vehiclesSys.drive(land, 1 / 60); }
    land.driver = null;
    const beached = g.vehiclesSys.speed(land) < 1.5;
    return sank && moved && beached ? true : JSON.stringify({ sank, flood: car.flood, moved: g.vehiclesSys.speed(boat), beached: g.vehiclesSys.speed(land) });
  });
  await check('the infected cannot swim: they stop at the waterline', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    await C('teleport', { x: 395, z: 398 });
    const { ids } = await C('horde', { x: 330, z: 398, count: 4, runners: 1, radius: 2 });
    await C('step', { seconds: 6 });
    const wet = ids.map((id) => api.findChar(id)).filter((c) => c && c.alive && !c.grabbing && g.water.depthAt(c.x, c.z) > 0.7); // hanging off a boat isn't swimming
    const why = wet.map((c) => ({ id: c.id, x: r1(c.x), z: r1(c.z), depth: r1(g.water.depthAt(c.x, c.z)), target: c.ztarget?.id ?? null }));
    for (const id of ids) await C('remove', { id });
    return wet.length === 0 ? true : `${wet.length} infected in deep water: ${JSON.stringify(why)}`;
  });
  await check('train: brakes into the station, carries riders, kills on the rails, tanker blows', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    const T = g.train;
    const SZ = T.view().station.z;
    T.state = 'running'; T.head = SZ - 70; T.speed = 14;
    for (let i = 0; i < 30 && T.state !== 'dwell'; i++) await C('step', { seconds: 0.5 });
    const stopped = T.state === 'dwell' && Math.abs(T.head - SZ) < 3;
    await C('teleport', { x: -357, z: SZ - 20 });
    await C('train', { action: 'board' });
    const riding = !!g.player.onTrain && g.player.seatPose?.y > 3;
    T.dwell = 0; await C('step', { seconds: 4 });
    const carried = g.player.z > SZ - 18;
    await C('train', { action: 'leave' });
    const off = !g.player.onTrain && Math.abs(g.player.x + 360) > 2;
    const { ids } = await C('spawn', { kind: 'raider', x: -360, z: T.head + 6 });
    const rr = api.findChar(ids[0]); rr.x = -360; rr.z = T.head + 6; // on the rails: spawn jitters ±2 m and the train only hits within 1.9 m
    T.speed = 17; T.state = 'running2';
    await C('step', { seconds: 0.6 });
    const splat = !api.findChar(ids[0])?.alive;
    const r = await C('train', { action: 'blowTanker' });
    g.player.hp = g.player.maxHp;
    return stopped && riding && carried && off && splat && r.tanker === 'blown' ? true : JSON.stringify({ stopped, state: T.state, head: T.head, riding, carried, z: g.player.z, off, splat, tanker: r.tanker });
  });
  await check('convoy: rolls in formation, breaks to engage, hauler spills cargo', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    if (g.player.onTrain) g.train.leave(g.player);
    await C('teleport', { x: 0, z: 200 });
    const v0 = await C('convoy', { action: 'spawn', dir: 'east' });
    const x0 = v0.members[0].x;
    await C('step', { seconds: 4 });
    const v1 = await C('convoy');
    const rolled = v1.members[0].x > x0 + 25 && !v1.engaged;
    const ordered = v1.members.find((m) => m.role === 'hauler').x < v1.members[0].x;
    const gun = v1.members.find((m) => m.role === 'gun');
    await C('teleport', { x: gun.x + 30, z: 30 });
    await C('step', { seconds: 0.5 });
    const engaged = g.convoy.active.engaged;
    const hauler = api.findVeh(v1.members.find((m) => m.role === 'hauler').id);
    const before = g.pickups.filter((p) => p.alive).length;
    g.vehiclesSys.explode(hauler, g.player);
    await C('step', { seconds: 0.3 });
    const looted = g.convoy.active.looted && g.pickups.filter((p) => p.alive).length >= before + 8;
    await C('convoy', { action: 'clear' });
    await C('teleport', { x: 0, z: 200 });
    g.player.hp = g.player.maxHp;
    return rolled && ordered && engaged && looted ? true : JSON.stringify({ rolled, x0, x1: v1.members[0].x, ordered, engaged, looted });
  });
  await check('feedback layer: damage arc points at the shooter, kill feed, loot floater, flag tags, compass markers', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    await C('teleport', { x: 40, z: -120 });
    await C('step', { seconds: 0.2 });
    const { ids } = await C('spawn', { kind: 'raider', x: 52, z: -120, weapon: 'pistol' });   // due EAST of the player
    const r = api.findChar(ids[0]);
    // The hit has to land: in god mode combat.damage returns before anything happens (no 'hurt' event,
    // so no arc). And aim through the API: g.aim is re-read from the mouse every frame.
    g.godMode = false; g.combat.damage(g.player, 12, r, -1, 0); g.godMode = true;
    await C('aim', { x: r.x, z: r.z });
    await C('step', { seconds: 0.1 });
    await C('aim', {});
    const h1 = g.feedback.view();
    const arc = h1.damageIndicators.find((d) => Math.abs(d.bearing - 90) < 15);
    const tag = h1.nameTags.find((t) => t.id === r.id && t.flag);
    g.combat.damage(r, 999, g.player, 1, 0);
    g.dropPickup(g.player.x + 0.3, g.player.z, 'cash');
    await C('step', { seconds: 0.3 });
    const h2 = await C('hud');
    const feed = h2.killFeed.some((k) => k.startsWith('YOU'));
    const floater = h2.floaters.some((f) => f.startsWith('+$'));
    await C('waypoint', { x: 40, z: -300 });
    await C('step', { seconds: 0.1 });
    const wp = g.feedback.view().compass.markers.find((m) => m.label === '◆');
    await C('waypoint', {});
    g.player.hp = g.player.maxHp;
    return arc && tag && feed && floater && wp && Math.abs(wp.bearing - 0) < 10 ? true : JSON.stringify({ arcs: h1.damageIndicators, tag: !!tag, feed: h2.killFeed, floater: h2.floaters, wp });
  });
  await check('details: brass piles up, civilians cower, horn sends people diving, tracks in the sand, brake lights', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    // Open sand off every road. The car used to start on Iron St (x=160) and roll onto the z=-160
    // crossing: tarmac all the way, so no tracks, whatever the tyres did.
    const X = 232, Z = -380, A = g.ambient;
    await C('teleport', { x: X, z: Z });
    const e0 = A.view().brassEjected;
    const { ids } = await C('spawn', { kind: 'drifter', x: X + 6, z: Z });
    const civ = api.findChar(ids[0]); civ.weapon = null; civ.x = X + 6; civ.z = Z;
    // A close shot makes a civilian cower 55% of the time: up to 16 quick shots, all while they're still
    // in earshot even if they bolt (6 shots a quarter-second apart missed about 1 run in 120).
    let cowered = false;
    const mine = [], newest = () => A.shells[(A.bNext + A.shells.length - 1) % A.shells.length]; // the ring's last write
    for (let k = 0; k < 16 && !cowered; k++) {
      if (g.combat.fire(g.player, 'pistol', Math.PI)) mine.push(newest());
      await C('step', { seconds: 1 / 15 }); cowered = civ.cowerT > 0;
    }
    await C('step', { seconds: 1 });
    // Our own shells landed and lie still. The on-ground count can't show it: the 240-shell ring is
    // full long before this check, so it never goes up.
    const brass = mine.length > 0 && mine.every((s) => s.rest) && A.view().brassEjected >= e0 + mine.length;
    civ.cowerT = 0; civ.crouch = false; civ.handsUp = false;
    const car = api.findVeh((await C('spawnVehicle', { type: 'sedan', x: X + 20, z: Z - 25, heading: 0 })).id);
    await C('enterVehicle', { id: car.id, force: true });
    const w = await C('spawn', { kind: 'drifter', x: X + 20.5, z: Z - 16 });
    const ped = api.findChar(w.ids[0]); ped.x = X + 20.5; ped.z = Z - 16;
    const h = await C('honk');
    await C('step', { seconds: 0.7 });
    const dodged = h.dodged >= 1 && Math.abs(ped.x - (X + 20)) > 1.5;
    const t0 = A.view().tracksLaid;
    await C('drive', { throttle: 1, steer: 0.3, seconds: 2 });
    const tracks = A.view().tracksLaid > t0;
    car.throttle = -1; g.vehiclesSys.update(1 / 60, 0);
    const brakeLit = car.braking === true || g.vehiclesSys.speed(car) < 0.5;
    g.exitVehicle(true);
    for (const id of [...ids, ...w.ids]) await C('remove', { id });
    return cowered && brass && dodged && tracks && brakeLit ? true : JSON.stringify({ cowered, brass, dodged, honk: h, pedX: ped.x, tracks, brakeLit });
  });
  await check('NaN sentinel: a poisoned position is healed and named by phase; ambient never latches on', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    const caught = [];
    g.reportError = (e) => caught.push(String(e?.message ?? e)); // capture: this check poisons on purpose
    try {
      const { ids } = await C('spawn', { kind: 'drifter', x: g.player.x + 6, z: g.player.z });
      const c = api.findChar(ids[0]);
      await C('step', { seconds: 0.1 });
      const x0 = c.x, b = g.ambient.birds[0], w = g.ambient.weeds[0];
      c.x = NaN; c.face = NaN; g.player.face = NaN; b.x = b.cx = NaN; w.x = NaN;
      await C('step', { seconds: 0.2 });
      const healed = Math.abs(c.x - x0) < 2 && Number.isFinite(c.face) && Number.isFinite(g.player.face);
      const named = caught.some((m) => m.includes(`on ${c.id} `) && m.includes("after '"));
      const amb = Number.isFinite(b.x + b.cx) && Number.isFinite(w.x);
      await C('remove', { id: c.id });
      return healed && named && amb ? true : JSON.stringify({ healed, x: c.x, x0, named, amb, caught: caught.slice(0, 2) });
    } finally { delete g.reportError; }
  });
  await check('save/load rebuilds the infected with their pace (they once came back at NaN m/s and spread it)', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    const { ids } = await C('horde', { x: g.player.x + 25, z: g.player.z, count: 3, runners: 1, radius: 2 });
    const sv = (await C('save')).save;
    for (const id of ids) await C('remove', { id });
    const caught = [];
    g.reportError = (e) => caught.push(String(e?.message ?? e));
    try {
      await C('load', { save: sv });
      await C('step', { seconds: 1 });
      const back = ids.map((id) => api.findChar(id)).filter(Boolean);
      const paced = back.every((c) => c.zSpeed > 0 && Number.isFinite(c.x + c.z));
      for (const c of back) await C('remove', { id: c.id });
      return back.length === 3 && paced && !caught.length ? true : JSON.stringify({ back: back.length, paced, caught: caught.slice(0, 2) });
    } finally { delete g.reportError; }
  });
  await check('cars turn about the rear axle: the nose swings in, the tail follows (not forklift steering)', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    const v = api.findVeh((await C('spawnVehicle', { type: 'sedan', x: -200, z: -262, heading: 0 })).id);
    await C('enterVehicle', { id: v.id, force: true });
    await C('drive', { throttle: 1, seconds: 0.6 });
    // A tight, slow turn (~5 m radius). About the centre, both ends travel the same distance; about
    // the rear axle the tail runs an inner arc, ~13% shorter at this radius.
    const end = (s) => [v.x + Math.sin(v.h) * v.len * 0.3 * s, v.z + Math.cos(v.h) * v.len * 0.3 * s];
    let front = 0, rear = 0, pf = end(1), pr = end(-1);
    for (let i = 0; i < 10; i++) {
      await C('drive', { throttle: 0.3, steer: 1, seconds: 0.1 });
      const f = end(1), r = end(-1);
      front += Math.hypot(f[0] - pf[0], f[1] - pf[1]); rear += Math.hypot(r[0] - pr[0], r[1] - pr[1]);
      pf = f; pr = r;
    }
    g.exitVehicle(true);
    return rear < front * 0.94 ? true : JSON.stringify({ front: +front.toFixed(2), rear: +rear.toFixed(2) });
  });
  await check('photo mode freezes the sim and frames a free camera', async () => {
    const t0 = g.time;
    const r = await C('photo', { x: 0, z: 0, zoom: 90, tilt: 0.4 });
    await yieldNow(); await yieldNow();
    const frozen = g.paused && document.getElementById('ui').classList.contains('photo');
    const camOk = Math.abs(g.camera.position.y - 90) < 0.5;
    await C('photo', { on: false });
    return r.photo && frozen && camOk && !g.paused ? true : JSON.stringify({ r, frozen, camOk, paused: g.paused, dt: g.time - t0 });
  });
  await check('A* path around buildings', async () => {
    const r = await C('path', { x: -300, z: 300, fx: 0, fz: -40, mode: 'car' });
    return r.found && r.waypoints.length > 1 ? true : JSON.stringify(r).slice(0, 120);
  });
  await check('objective tracker', async () => { const o = await C('objective'); return !!o.text; });
  await check('vehicle burns before exploding', async () => {
    const v = await C('spawnVehicle', { type: 'buggy', x: g.player.x + 30, z: g.player.z });
    const veh = api.findVeh(v.id);
    g.vehiclesSys.damage(veh, 9999, null);
    const burning = veh.onFire > 0 && !veh.dead;
    await C('step', { seconds: 4.5 });
    return burning && veh.dead ? true : `burning=${burning} dead=${veh.dead}`;
  });
  // ---- doors, locks and windows (systems/interiors.js). Staged at buildings in the ruins with the bystanders
  // cleared away; the player moves and interacts on its own keys (the same input path a person uses).
  const I2 = g.interiors;
  const keyFor = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'KeyD' : 'KeyA') : dz > 0 ? 'KeyS' : 'KeyW');
  const holdKey = async (code, seconds, until) => {
    g.input.down.add(code); g.input.pressed.add(code);
    try { for (let f = 0; f < seconds * 60; f++) { await api._step(1); if (until?.()) break; } } finally { g.input.down.delete(code); }
  };
  const tapKey = async (code) => { g.input.down.add(code); g.input.pressed.add(code); await api._step(1); g.input.down.delete(code); await api._step(1); };
  const outSide = (o, x, z) => (x - o.x) * o.nx + (z - o.z) * o.nz; // + outside the wall, - inside
  const clearAt = (o, k) => g.nav.foot.free(o.x + o.nx * k, o.z + o.nz * k) && g.nav.foot.free(o.x - o.nx * k, o.z - o.nz * k);
  const inRuins = (o) => Math.max(Math.abs(o.x), Math.abs(o.z)) > 100;
  const backDoor = (pred) => I2.doors.find((d) => d.kind === 'back' && d.leaves.length === 1 && inRuins(d) && clearAt(d, 3) && pred(d));
  const stageAt = async (o, k) => {
    if (g.player.inVehicle) g.exitVehicle(true);
    if (g.player.onTrain) g.train.leave(g.player);
    g.autopilot = null; g.aimOverride = null; g.crouchOverride = false;
    g.player.knockT = 0; g.player.vault = null; g.player.stamina = 1;
    await C('setTime', { hour: 12 });
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - o.x, c.z - o.z) < 26) g.removeChar(c);
    await C('teleport', { x: o.x + o.nx * k, z: o.z + o.nz * k });
    await api._step(2);
  };
  const extra = (kind, x, z, props = {}) => { const c = g.addChar({ x, z, faction: kind, weapon: null, colors: outfit(kind), name: `${kind} (selftest)`, flag: 'US', hp: 300 }); c.x = x; c.z = z; return Object.assign(c, props); };
  await check('doors: a closed door swings open for whoever walks into it, and they get through (you on your keys, a drifter on its own feet)', async () => {
    const d = backDoor((x) => !x.locked);
    if (!d) return 'no unlocked single back door in the ruins';
    await C('door', { id: d.id, action: 'close' });
    await stageAt(d, 2.5);
    let widest = 0;
    await holdKey(keyFor(-d.nx, -d.nz), 3, () => { widest = Math.max(widest, Math.abs(d.leaves[0].th)); return outSide(d, g.player.x, g.player.z) < -1.6; });
    const youThrough = outSide(d, g.player.x, g.player.z) < -1.2;
    // A drifter walking home through the same door, shut again; you wait off to one side.
    await C('door', { id: d.id, action: 'close' });
    await C('teleport', { x: d.x + d.nx * 6 + d.ux * 4, z: d.z + d.nz * 6 + d.uz * 4 });
    const c = extra('drifter', d.x + d.nx * 2.5, d.z + d.nz * 2.5);
    c.home = { x: d.x - d.nx * 2.5, z: d.z - d.nz * 2.5 }; c.wx = c.home.x; c.wz = c.home.z; c.timer = 99;
    let npcWidest = 0;
    for (let t = 0; t < 8 && outSide(d, c.x, c.z) > -1.2; t += 0.1) { await api._step(6); npcWidest = Math.max(npcWidest, Math.abs(d.leaves[0].th)); }
    const npcThrough = outSide(d, c.x, c.z) < -1.2;
    g.removeChar(c);
    return youThrough && widest > 0.6 && npcThrough && npcWidest > 0.4 ? true : JSON.stringify({ door: d.id, youThrough, widest: r1(widest), npcThrough, npcWidest: r1(npcWidest), npc: [r1(c.x), r1(c.z)] });
  });
  await check('doors: a door shoved open at a run knocks down whoever stands behind it (door bash), and they get back up', async () => {
    const d = backDoor((x) => !x.locked);
    await C('door', { id: d.id, action: 'close' });
    await stageAt(d, 2.6);
    const L = d.leaves[0];
    const v = extra('drifter', L.hx + L.dx * 0.8 - d.nx * 0.7, L.hz + L.dz * 0.8 - d.nz * 0.7, { hold: true }); // just inside, in the leaf's swing
    const since = g.eventSeq;
    g.input.down.add('ShiftLeft');
    try { await holdKey(keyFor(-d.nx, -d.nz), 1.5, () => v.knockT > 0); } finally { g.input.down.delete('ShiftLeft'); }
    const bash = g.events.find((e) => e.seq > since && e.type === 'doorBash' && e.victim === v.id);
    const down = v.knockT > 0;
    await api._step(Math.round((DOOR.knockDown + 0.6) * 60));
    const up = !(v.knockT > 0) && v.alive;
    g.removeChar(v);
    return bash && down && up ? true : JSON.stringify({ door: d.id, bash: bash ?? null, down, up, th: r1(L.th), w: r1(L.w), v: [r1(v.x), r1(v.z)] });
  });
  await check('locks: a locked door holds you and the AI until you kick it in (2-3 kicks, each loud enough to scatter a bystander)', async () => {
    let d = backDoor((x) => x.locked);
    if (!d) { d = backDoor(() => true); if (!d) return 'no single back door in the ruins'; await C('door', { id: d.id, action: 'lock' }); }
    await stageAt(d, 2.4);
    // A drifter heading in through it stays outside: NPCs never open a locked door.
    const n = extra('drifter', d.x + d.nx * 2.4 + d.ux * 0.2, d.z + d.nz * 2.4 + d.uz * 0.2);
    n.home = { x: d.x - d.nx * 2.5, z: d.z - d.nz * 2.5 }; n.wx = n.home.x; n.wz = n.home.z; n.timer = 99;
    await C('teleport', { x: d.x + d.nx * 6 + d.ux * 4, z: d.z + d.nz * 6 + d.uz * 4 });
    await api._step(150);
    const npcHeld = outSide(d, n.x, n.z) > 0.2;
    g.removeChar(n);
    await C('teleport', { x: d.x + d.nx * 2.4, z: d.z + d.nz * 2.4 });
    const key = keyFor(-d.nx, -d.nz);
    await holdKey(key, 1.2);
    const held = outSide(d, g.player.x, g.player.z) > 0.3 && Math.abs(d.leaves[0].th) < 0.01 && d.locked;
    const ear = extra('drifter', d.x + d.nx * 8 + d.ux * 8, d.z + d.nz * 8 + d.uz * 8); // hears it from round the corner
    const since = g.eventSeq;
    for (let i = 0; i < 5 && d.locked; i++) { await tapKey('KeyE'); await api._step(38); }
    const kicks = g.events.filter((e) => e.seq > since && e.type === 'doorKick' && e.door === d.id).length;
    const scattered = ear.flee > 0;
    g.removeChar(ear);
    await api._step(20);
    await holdKey(key, 3, () => outSide(d, g.player.x, g.player.z) < -1.4);
    const through = outSide(d, g.player.x, g.player.z) < -1;
    return npcHeld && held && !d.locked && kicks >= 2 && kicks <= 3 && scattered && through ? true : JSON.stringify({ door: d.id, npcHeld, held, locked: d.locked, kicks, scattered, through, th: r1(d.leaves[0].th) });
  });
  let pane = null;
  await check('windows: glass cracks, then shatters under fire, and stops blocking bullets once it is gone', async () => {
    pane = I2.windows.find((w) => w.state === 'intact' && inRuins(w) && clearAt(w, 3) && g.nav.foot.free(w.x + w.nx * 6, w.z + w.nz * 6));
    if (!pane) return 'no intact window in the ruins';
    await stageAt(pane, 6);
    const t = extra('drifter', pane.x - pane.nx * 3, pane.z - pane.nz * 3, { hold: true });
    await C('give', { pistol: 30 }); await C('equip', { weapon: 'pistol' });
    const hp0 = t.hp;
    await C('fire', { id: t.id, shots: 1 });
    const cracked = pane.state === 'intact' && pane.hp < WINDOW.hp && t.hp === hp0;
    await C('fire', { id: t.id, shots: 1 });
    const shattered = pane.state === 'shattered' && t.hp === hp0;
    await C('fire', { id: t.id, shots: 1 });
    const through = t.hp < hp0;
    g.removeChar(t);
    return cracked && shattered && through ? true : JSON.stringify({ window: pane.id, cracked, shattered, through, state: pane.state, glassHp: pane.hp, hp: [hp0, t.hp] });
  });
  await check('windows: hold E at a broken window to board it up; the boards block sight and stop a bullet', async () => {
    const w = pane?.state === 'shattered' ? pane : I2.windows.find((x) => x.state === 'shattered' && inRuins(x) && clearAt(x, 3) && g.nav.foot.free(x.x + x.nx * 6, x.z + x.nz * 6));
    if (!w) return 'no broken window to board';
    await stageAt(w, 1.1);
    await holdKey('KeyE', WINDOW.holdTap + WINDOW.boardTime + 0.5, () => w.state === 'boarded');
    const boarded = w.state === 'boarded' && w.boardSide === 1;
    await C('teleport', { x: w.x + w.nx * 6, z: w.z + w.nz * 6 });
    const t = extra('drifter', w.x - w.nx * 3, w.z - w.nz * 3, { hold: true });
    const blind = !g.los(g.player.x, g.player.z, t.x, t.z);
    const b0 = w.boardHp, hp0 = t.hp;
    await C('fire', { x: t.x, z: t.z, shots: 1 });
    const stopped = t.hp === hp0 && w.boardHp < b0 && w.state === 'boarded';
    g.removeChar(t);
    return boarded && blind && stopped ? true : JSON.stringify({ window: w.id, boarded, side: w.boardSide, blind, stopped, boardHp: [b0, w.boardHp], hp: [hp0, t.hp] });
  });
  await check('windows: walk into a broken window and you climb through it; a dive goes straight through the glass', async () => {
    const w = I2.windows.find((x) => x.state === 'shattered' && x !== pane && inRuins(x) && clearAt(x, 3));
    if (!w) return 'no broken window to climb';
    await stageAt(w, 1.6);
    let t = 0, started = -1;
    await holdKey(keyFor(-w.nx, -w.nz), 3, () => { t += 1 / 60; if (g.player.vault && started < 0) started = t; return started >= 0 && !g.player.vault; });
    const climbed = outSide(w, g.player.x, g.player.z) < -0.6 && started > 0.1;
    const w2 = I2.windows.find((x) => x.state === 'intact' && x !== pane && inRuins(x) && clearAt(x, 3));
    if (!w2) return 'no intact window to dive through';
    await stageAt(w2, 2.4);
    await C('dive', { x: w2.x - w2.nx * 3, z: w2.z - w2.nz * 3 });
    for (let i = 0; i < 60 && g.player.vault; i++) await api._step(1);
    const dove = w2.state === 'shattered' && outSide(w2, g.player.x, g.player.z) < -0.5;
    return climbed && dove ? true : JSON.stringify({ window: w.id, climbed, started: r1(started), at: r1(outSide(w, g.player.x, g.player.z)), dive: w2.id, glass: w2.state, diveAt: r1(outSide(w2, g.player.x, g.player.z)) });
  });

  // ---- world memory (docs/design/WEB_WORLD_MEMORY.md §8). Staged on open sand between roads in the Glass Flats,
  // everyone else cleared out of sight, standings and pending rumors reset, the clock at noon.
  const STAGE = { x: 280, z: -120 };
  const stage = async () => {
    // An event the director had running when the battery started (a raid, hunters) would keep shooting
    // through every check: send its people home first.
    for (const ev of [...g.society.director.active]) g.society.director.cancel(ev.id);
    if (g.player.inVehicle) g.exitVehicle(true);
    await C('crouch', { on: false });
    await C('setTime', { hour: 12 }); await C('setWeather', { key: 'CLEAR', instant: true });
    await C('teleport', STAGE);
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - STAGE.x, c.z - STAGE.z) < 90) g.removeChar(c);
    const F = g.society.factions, D = g.society.deeds;
    g.roles.reset(); // what the battery did so far (kills, drives, searches) must not colour how the factions read you
    for (const id of F.ids) { const row = F.row(id); if (row.memory !== 'none') F.set(id, row.start); }
    for (const r of D.rumors) r.live = false;
    D.pending = 0; D.nextDue = Infinity; g.wanted = 0; g.witnesses.clear();
    g.inv.ammo.pistol = Math.max(g.inv.ammo.pistol, 60); // topped up, not piled on: rounds weigh now
    for (const k of g.inv.weapons) { if (g.inventory.cond(k) < 0.7) g.inv.cond[k] = 0.85; delete g.inv.jam[k]; } // no check trips on a worn gun
    await C('equip', { weapon: 'pistol' });
    await C('step', { seconds: 0.2 });
  };
  const person = (kind, dx, dz, extra = {}) => {
    const p = g.player, c = g.addChar({ x: p.x + dx, z: p.z + dz, faction: kind, weapon: kind === 'warden' ? 'smg' : null, colors: outfit(kind), name: `${kind} (selftest)`, flag: 'US', hp: extra.hp ?? 100 });
    c.home = { x: c.x, z: c.z }; c.wx = c.x; c.wz = c.z; c.face = Math.atan2(p.x - c.x, p.z - c.z); // looking at the player
    c.hold = true; // stands its ground: no wandering off, no turning away, no fleeing the gunfire
    Object.assign(c, extra);
    g.society.factions.assign(c);
    return c;
  };
  const shootDead = async (c) => { for (let i = 0; i < 6 && c.alive; i++) await C('fire', { id: c.id, shots: 1 }); return !c.alive; };
  const drifterStanding = () => g.society.factions.standing[g.society.factions.index.drifters];
  const quickRumors = async (fn) => { const row = g.society.factions.row('drifters'), d = row.rumorDelay; row.rumorDelay = [5, 7]; try { return await fn(); } finally { row.rumorDelay = d; } };
  await check('world memory: the chronicle keeps its last 512 records, and the tally keeps every count', async () => {
    const C0 = g.society.chronicle, key = 'player|hurt|', n0 = C0.tally.get(key)?.n ?? 0, s0 = C0.seq;
    for (let i = 0; i < 600; i++) await C('deed', { verb: 'hurt', witness: false, x: STAGE.x, z: STAGE.z });
    const recs = (await C('chronicle', { limit: 25 })).records;
    const mono = recs.every((r, i) => i === 0 || r.seq < recs[i - 1].seq);
    const n = (C0.tally.get(key)?.n ?? 0) - n0;
    return C0.size === 512 && n === 600 && C0.seq - s0 === 600 && mono && C0.legend.length <= 96 ? true : JSON.stringify({ size: C0.size, tally: n, seq: C0.seq - s0, mono, legend: C0.legend.length });
  });
  await check('world memory: a witness 15 m off names you at noon, but not at 23:00 from a crouch', async () => {
    await stage();
    const w = person('drifter', 0, 15);
    const noon = (await C('witnesses')).identified.some((c) => c.id === w.id);
    await C('setTime', { hour: 23 }); await C('crouch', { on: true }); await C('step', { seconds: 0.3 }); // the sky reads the new hour
    w.x = g.player.x; w.z = g.player.z + 15; w.face = Math.PI; // still looking straight at you
    const r = await C('witnesses');
    const night = r.identified.some((c) => c.id === w.id);
    await C('crouch', { on: false }); await C('setTime', { hour: 12 });
    g.removeChar(w);
    return noon && !night ? true : JSON.stringify({ noon, night, idRange: r.idRange, sight: r.sight });
  });
  await check("world memory: a witnessed killing reaches the victim's people, and their standing drops", async () => quickRumors(async () => {
    await stage();
    const victim = person('drifter', 5, 0, { hp: 30 }), w = person('drifter', 5, 10, { hp: 400 });
    w.face = Math.atan2(victim.x - w.x, victim.z - w.z);
    const s0 = drifterStanding(), since = g.eventSeq;
    const dead = await shootDead(victim);
    const rec = g.society.chronicle.query({ verb: 'kill', limit: 1 })[0];
    const named = !!rec?.w.includes(w.id);
    await C('step', { seconds: 9 });
    const landed = g.events.some((e) => e.seq > since && e.type === 'rumor' && e.witness === w.id);
    const s1 = drifterStanding();
    g.removeChar(w);
    return dead && named && landed && s1 < s0 ? true : JSON.stringify({ dead, named, landed, s0, s1, rec: rec && { w: rec.w, k: rec.k }, pending: g.society.deeds.view().pending });
  }));
  await check('world memory: kill the only witness before they talk, and the word dies with them', async () => quickRumors(async () => {
    await stage();
    const victim = person('drifter', 5, 0, { hp: 30 }), w = person('drifter', 5, 10, { hp: 30 });
    w.face = Math.atan2(victim.x - w.x, victim.z - w.z);
    const s0 = drifterStanding(), since = g.eventSeq;
    await shootDead(victim);
    const queued = g.society.deeds.view().pending.some((r) => r.witness === w.id);
    await shootDead(w); // well inside the 5-7 s it takes them to tell anyone
    await C('step', { seconds: 9 });
    const silenced = g.events.some((e) => e.seq > since && e.type === 'rumorSilenced' && e.witness === w.id);
    const silence = g.society.chronicle.query({ verb: 'silence', limit: 1 })[0]?.o === w.id;
    const s1 = drifterStanding();
    return queued && silenced && silence && Math.abs(s1 - s0) < 0.5 ? true : JSON.stringify({ queued, silenced, silence, s0, s1 });
  }));
  await check('world memory: standing decides who shoots you on sight (raise the Dustwolves and their guns go quiet)', async () => {
    await stage();
    const r = person('raider', 30, 0, { weapon: 'smg' }), warden = person('warden', -30, 0);
    await C('standing', { faction: 'dustwolves', set: 70 });
    const friendly = g.ai.hostile(r, g.player);
    await C('standing', { faction: 'dustwolves', set: -90 });
    const hunted = g.ai.hostile(r, g.player);
    const war = g.ai.hostile(warden, r) && g.ai.hostile(r, warden);
    await C('standing', { faction: 'dustwolves', set: -60 });
    g.removeChar(r); g.removeChar(warden);
    return !friendly && hunted && war ? true : JSON.stringify({ friendly, hunted, war });
  });
  await check('world memory: at 23:00, crouched, 25 m from the only bystander - nobody knows, no stars', async () => {
    await stage();
    await C('setTime', { hour: 23 }); await C('crouch', { on: true }); await C('step', { seconds: 0.3 });
    const victim = person('drifter', 3, 0, { hp: 30 }), by = person('drifter', 0, 25);
    const s0 = drifterStanding();
    await shootDead(victim);
    const rec = g.society.chronicle.query({ verb: 'kill', limit: 1 })[0];
    await C('step', { seconds: 3 });
    const s1 = drifterStanding(), stars = g.wanted;
    await C('crouch', { on: false }); await C('setTime', { hour: 12 });
    g.removeChar(by);
    return rec && rec.k & K.unwitnessed && stars === 0 && Math.abs(s1 - s0) < 0.5 ? true : JSON.stringify({ k: rec?.k, w: rec?.w, stars, s0, s1 });
  });
  await check('world memory: a Rust Haven bull who sees you shoot someone raises the stars at once', async () => {
    await stage();
    const victim = person('drifter', 4, 0, { hp: 400 }), bull = person('warden', -6, 0);
    await C('fire', { id: victim.id, shots: 1 });
    const stars = g.wanted;
    const rec = g.society.chronicle.query({ verb: 'hurt', limit: 1 })[0];
    g.wanted = 0; g.removeChar(bull); g.removeChar(victim);
    return stars > 0 && rec?.w.includes(bull.id) ? true : JSON.stringify({ stars, w: rec?.w, bull: bull.id });
  });
  await check('world memory: standings, the chronicle and word on its way survive save/load', async () => {
    await stage();
    const F = g.society.factions, D = g.society.deeds;
    await C('standing', { faction: 'drifters', set: -33 });
    const w = person('drifter', 6, 0), victim = person('drifter', 3, 2, { hp: 400 });
    await C('fire', { id: victim.id, shots: 1 }); // a hurt the bystander (and the victim) will report
    const pending = D.pending, seq = g.society.chronicle.seq;
    const sv = (await C('save')).save;
    await C('standing', { faction: 'drifters', set: 50 });
    for (let i = 0; i < 3; i++) await C('deed', { verb: 'trade', witness: false });
    const r = await C('load', { save: sv });
    const st = F.standing[F.index.drifters];
    const ok = r.ok && Math.abs(st + 33) < 0.01 && D.pending === pending && g.society.chronicle.seq === seq;
    for (const c of [w, victim]) if (g.chars.includes(c)) g.removeChar(c);
    for (const r2 of D.rumors) r2.live = false;
    D.pending = 0; D.nextDue = Infinity; F.set('drifters', F.row('drifters').start);
    return pending > 0 && ok ? true : JSON.stringify({ pending, after: D.pending, seq, seqAfter: g.society.chronicle.seq, standing: st });
  });
  await check('world memory: a killed-kin memory closes the shop, forgetting reopens it, and a vendetta turns a gun on you', async () => {
    await stage();
    const since = g.eventSeq;
    await C('remember', { id: 'ike', kind: 'killedKin', about: 'Mateo' });
    const shut = await C('talk', { id: 'ike', force: true });
    const refused = g.events.some((e) => e.seq > since && e.type === 'refused' && e.npc === 'ike');
    g.dialogue.close();
    await C('remember', { id: 'ike', forget: true });
    const open = await C('talk', { id: 'ike', force: true });
    g.dialogue.close();
    const vo = g.chars.find((c) => c.npc?.id === 'vo');
    await C('remember', { id: 'vo', kind: 'killedKin', about: 'his brother' });
    const hunt = !!vo && g.ai.hostile(vo, g.player);
    await C('remember', { id: 'vo', forget: true });
    const calm = !!vo && !g.ai.hostile(vo, g.player);
    return refused && shut.choices?.length === 1 && open.choices?.length > 1 && hunt && calm ? true : JSON.stringify({ refused, shut: shut.choices?.length, open: open.choices?.length, hunt, calm, vo: !!vo });
  });
  await check("world memory: Mateo remembers being shot, and the word reaches his sister Rosa", async () => quickRumors(async () => {
    await stage();
    const mateo = g.chars.find((c) => c.npc?.id === 'mateo'), rosa = g.chars.find((c) => c.npc?.id === 'rosa');
    if (!mateo || !rosa) return `letter-quest pack not loaded (mateo=${!!mateo}, rosa=${!!rosa})`;
    await C('teleport', { x: mateo.x - 6, z: mateo.z });
    mateo.hold = true; mateo.face = Math.atan2(g.player.x - mateo.x, g.player.z - mateo.z);
    await C('fire', { id: mateo.id, shots: 1 });
    const firsthand = (await C('memory', { id: 'mateo' })).memories.some((m) => m.kind === 'shotMe' && !m.heard);
    await C('step', { seconds: 9 });
    const heard = (await C('memory', { id: 'rosa' })).memories.some((m) => m.kind === 'shotKin' && m.heard && m.about === 'Mateo Quintero');
    mateo.hold = false; mateo.hp = mateo.maxHp;
    for (const id of ['mateo', 'rosa']) g.society.memory.forget(id);
    return firsthand && heard ? true : JSON.stringify({ firsthand, heard, mateo: (await C('memory', { id: 'mateo' })).memories, rosa: (await C('memory', { id: 'rosa' })).memories, rumors: g.society.deeds.view() });
  }));
  await check('director: an enraged Rust Haven sends hunters from out of sight, and killing them goes in the chronicle', async () => {
    await stage();
    const D = g.society.director;
    await C('standing', { faction: 'rusthaven', set: -70 });
    const r = await C('fireEvent', { tpl: 'hunters', faction: 'rusthaven' });
    const ev = D.active.find((e) => e.id === r.event), hunters = ev?.members ?? [];
    const mean = () => hunters.reduce((s, c) => s + Math.hypot(c.x - g.player.x, c.z - g.player.z), 0) / Math.max(1, hunters.length);
    const spawned = hunters.length >= 2 && hunters.every((c) => c.fid === 'rusthaven' && c.target === g.player);
    const d0 = mean();
    await C('step', { seconds: 2 });
    const d1 = mean();
    for (const c of hunters) if (c.alive) await C('kill', { id: c.id });
    await C('step', { seconds: 1 });
    const resolved = !!ev && ev.outcome === 'success' && !D.active.includes(ev);
    const rec = g.society.chronicle.query({ verb: 'hunters_success', limit: 1 })[0];
    await C('standing', { faction: 'rusthaven', set: 10 });
    return spawned && d0 >= 85 && d1 < d0 && resolved && !!rec ? true : JSON.stringify({ spawned, n: hunters.length, d0: r1(d0), d1: r1(d1), outcome: ev?.outcome, rec: !!rec });
  });
  await check('director: STATIC 1660 AM reads the chronicle on air', async () => {
    const vo = g.chars.find((c) => c.npc?.id === 'vo');
    if (!vo) return 'no Vo to report on';
    await C('deed', { verb: 'kill', target: vo.id, witness: false });
    const since = g.eventSeq;
    await C('fireEvent', { tpl: 'radio_news' });
    const said = g.events.find((e) => e.seq > since && e.type === 'radio');
    return said && /Ghost/.test(said.line) ? true : JSON.stringify({ said: said?.line ?? null });
  });
  // ---- rest and bite fever (docs/design/WEB_SURVIVAL.md) ----
  // Sleep checks test sleep, not the war: Rust Haven's wardens trade fire with Dustwolf raiders at the edge of town most
  // of the day, and the night brings hordes to the wall, and a shot that close wakes anyone. Hush pauses the raids and
  // the hordes, clears the raiders and the infected, and puts everything back afterwards.
  const hush = async (fn) => {
    const zOn = g.zombies.enabled, rt = g.raiderTimer;
    g.zombies.enabled = false; g.raiderTimer = 1e9;
    for (const c of [...g.chars]) if (c.faction === 'zombie' || c.faction === 'raider') g.removeChar(c);
    for (const c of g.chars) c.restless = 0;
    try { return await fn(); } finally { g.zombies.enabled = zOn; g.raiderTimer = rt; }
  };
  const withNeeds = async (fn) => hush(async () => {
    const N = g.needs, keep = { water: N.water, food: N.food, rest: N.rest, fever: N.fever };
    N.water = 0.9; N.food = 0.9; N.rest = 0.9; N.fever = null; N.blackout = 0;
    try { return await fn(); } finally {
      if (g.survival.sleep) g.survival.wake();
      Object.assign(N, keep, { blackout: 0 }); g.survival.update(0);
      await C('setTime', { hour: 12 });
    }
  });
  await check('rest: hours awake tire you into sway and microsleeps; a bed refills you while the night runs x40; one of the infected walking up wakes you', async () => withNeeds(async () => {
    await stage();
    const S = g.survival, N = g.needs, p = g.player;
    N.rest = 0.05; await C('step', { seconds: 0.3 });
    const tired = N.pips.rest === 3 && N.sway >= 1.35 && N.staminaRegen <= 0.6 + 1e-9;
    N.rest = 0; S.microT = 0.05; await C('step', { seconds: 0.3 });
    const micro = N.pips.rest === 4 && N.blackout > 0;
    const x0 = p.x; await holdKey('KeyD', 0.4); // the hands let go: a held key moves nothing
    const still = Math.abs(p.x - x0) < 0.05;
    await C('step', { seconds: 1.6 });
    const back = N.blackout === 0;
    // a bed: lie down, the night runs, up rested; a full night
    N.rest = 0.3;
    const r = await C('sleep', { where: 'bed', snap: true });
    const slept = r.woke?.why === 'rested' && r.woke.full && N.rest > 0.99 && Math.abs(r.woke.hours - 0.7 / (1 / 7)) < 0.6 && !p.sleeping;
    // on the bare ground, and one of the infected comes up the street: woken, not rested
    await stage();
    N.rest = 0.3;
    const lay = S.sleepAt('ground');
    const z = g.zombies.spawn(p.x + 20, p.z, false);
    for (let i = 0; i < 60 && S.sleep; i++) await C('step', { seconds: 0.25 });
    const woken = !!lay.ok && !S.sleep && /infected/.test(S.lastWake?.why ?? '') && S.lastWake.full === false;
    g.removeChar(z);
    return tired && micro && still && back && slept && woken ? true : JSON.stringify({ tired, sway: N.sway, micro, still, back, slept, woke: r.woke, lay: lay.ok ? true : lay.why, woken, why: S.lastWake?.why });
  }));
  await check('sleep in a parked car: N tips the seat back, the car stays parked, a night in the seat rests you slower than a bed; it will not do it rolling', async () => withNeeds(async () => {
    await stage();
    const S = g.survival, N = g.needs, p = g.player;
    const v = g.vehiclesSys.spawn('sedan', p.x + 4, p.z, 0);
    await C('enterVehicle', { id: v.id, force: true });
    const x0 = v.x, z0 = v.z;
    N.rest = 0.3;
    v.vx = 6; // rolling: no
    const rolling = g.trySleep();
    v.vx = 0; v.vz = 0; await C('step', { seconds: 0.5 });
    const r = g.trySleep(); // N, parked
    for (let k = 0; k < 4000 && S.sleep; k++) await api._step(30);
    const w = S.lastWake, moved = Math.hypot(v.x - x0, v.z - z0);
    const want = 0.7 / (1 / 7 * 0.65); // 7.5 game hours in the seat, against 4.9 in a bed
    const ok = !rolling.ok && r.ok && w?.why === 'rested' && Math.abs(w.hours - want) < 0.8 && moved < 0.6 && p.inVehicle === v;
    if (p.inVehicle) g.exitVehicle(true);
    g.vehiclesSys.remove(v);
    return ok ? true : JSON.stringify({ rolling: rolling.ok ? 'slept rolling' : rolling.why, slept: r.ok ? true : r.why, woke: w, want: +want.toFixed(2), moved: +moved.toFixed(2) });
  }));
  await check('the town sleeps: at 23:00 Ike goes to bed and most of the town with him; asleep he keeps no counter and witnesses nothing; a gunshot wakes him', async () => {
    const inv = g.inventory, ike = g.chars.find((c) => c.npc?.id === 'ike' && c.alive);
    const box = ike && [...inv.boxes.values()].find((b) => b.owner === ike.id);
    if (!ike || !box) return `ike: ${!!ike}, a shelf of his: ${!!box}`;
    if (g.player.inVehicle) g.exitVehicle(true);
    return hush(async () => { try {
      for (const c of g.chars) if (g.ai.sleeper(c)) { c.target = null; c.grudge = null; c.flee = 0; c.hold = 0; } // earlier checks' fights and staging
      await C('setTime', { hour: 23 });
      await C('teleport', { x: box.x + 7, z: box.z });
      for (let i = 0; i < 60 && !ike.sleeping; i++) await C('step', { seconds: 0.5 });
      const asleep = ike.sleeping === true;
      // The rest walk to their beds from across town: give them up to 20 s to settle (a bed 90 m off is ~20 s at a walk).
      let town, most = false;
      for (let i = 0; i < 10 && !most; i++) { await C('step', { seconds: 2 }); town = await C('town', { radius: 150 }); most = town.asleep.length >= Math.ceil((town.asleep.length + town.awake.length) * 0.6); }
      g.player.x = box.x + 0.8; g.player.z = box.z;
      const noCounter = g.trade.at(box) === null;
      const saw = g.society.deeds.witnessPass(box.x, box.z, g.player, null).includes(ike);
      g.noise(g.player.x, g.player.z, 30, g.player); // a shot in the shop
      const woke = !ike.sleeping && ike.restless > 0;
      const up = g.chars.filter((c) => c !== g.player && c.alive && g.ai.sleeper(c) && !c.sleeping && Math.hypot(c.x - g.player.x, c.z - g.player.z) < 150).slice(0, 8)
        .map((c) => ({ n: c.name, restless: r1(c.restless ?? 0), target: !!c.target, flee: r1(c.flee ?? 0), hold: !!c.hold, bed: !!c.bed, bedT: r1(c.bedT ?? 0), runner: !!c.runner }));
      return asleep && most && noCounter && !saw && woke ? true : JSON.stringify({ asleep, most, asleepN: town.asleep.length, awakeN: town.awake.length, noCounter, saw, woke, up });
    } finally { await C('setTime', { hour: 12 }); await C('step', { seconds: 0.5 }); } });
  });
  await check('fever: a bite that lands starts a 36-hour fever (stamina regen x0.75, hunger x1.3); antibiotics then a full night break it; untreated it passes and never kills', async () => withNeeds(async () => {
    await stage();
    const S = g.survival, N = g.needs, p = g.player, inv = g.inventory;
    await C('god', { on: false });
    try {
      p.hp = p.maxHp;
      const z = g.zombies.spawn(p.x + 0.9, p.z, false); z.cool = 0;
      for (let i = 0; i < 30 && !N.fever; i++) await C('step', { seconds: 0.1 });
      g.removeChar(z);
      const started = !!N.fever && Math.abs(N.fever.until - S.hours() - 36) < 0.5 && p.alive;
      await C('step', { seconds: 0.1 });
      const taxed = Math.abs(N.staminaRegen - 0.75) < 1e-6;
      // hunger runs 1.3x: over a fast-forwarded stretch, food falls by 1.3 x its waking rate
      g.sky.fast = true;
      const h0 = S.hours(), f0 = N.food;
      await C('step', { seconds: 1.5 });
      g.sky.fast = false;
      const dh = S.hours() - h0, df = f0 - N.food, want = dh * (1 / 80) * 1.3;
      const hungry = dh > 0.5 && Math.abs(df - want) < want * 0.06;
      // treated, then a full night in a bed: broken
      inv.add(inv.carried, 'antibiotics', 1); inv.changed();
      const used = inv.use(inv.carried.slots.findIndex((s) => s.id === 'antibiotics'));
      const treated = used.ok && N.fever?.treated === true;
      p.hp = p.maxHp; N.rest = 0.4;
      const r = await C('sleep', { where: 'bed', snap: true });
      const broke = r.woke?.full === true && N.fever === null;
      // untreated, it runs out on its own; it never took a point of health
      await stage();
      S.bitten();
      const hp0 = p.hp;
      N.fever.until = S.hours() + 0.02;
      g.sky.fast = true; await C('step', { seconds: 0.5 }); g.sky.fast = false;
      const passed = N.fever === null && p.hp === hp0;
      return started && taxed && hungry && treated && broke && passed ? true : JSON.stringify({ started, until: N.fever?.until, taxed, regen: N.staminaRegen, hungry, dh: +dh.toFixed(2), df: +df.toFixed(4), want: +want.toFixed(4), treated, broke, woke: r.woke, passed });
    } finally { await C('god', { on: true }); }
  }));
  await check('survival: thirst wears in pips, slows stamina recovery, and a bottle of water fixes it', async () => {
    await stage();
    const before = g.needs.water;
    await C('step', { seconds: 6 }); // noon heat: 6 s is 0.2 game hours of drain
    const drained = g.needs.water < before;
    const parched = await C('needs', { water: 0.1, food: 0.9 });
    const slowed = parched.pips.water === 2 && parched.effects.staminaRegen < 1;
    // A found bottle goes in your pack; drinking it (V) is what fixes the thirst.
    const bottles = () => g.inventory.carried.slots.filter((s) => s.id === 'water_bottle' || s.id === 'canteen').length;
    const b0 = bottles();
    g.dropPickup(g.player.x + 0.4, g.player.z, 'water');
    await C('step', { seconds: 0.3 });
    const packed = bottles() > b0;
    for (let k = 0; k < 6 && g.needs.water < 0.5; k++) await C('item', { quick: true });
    const after = g.survival.view();
    await C('needs', { water: 0.85, food: 0.8 });
    return drained && slowed && packed && after.water > 0.35 && after.pips.water === 0 ? true : JSON.stringify({ drained, before, parched: parched.pips, regen: parched.effects.staminaRegen, packed, after: after.water });
  });
  await check('skills: hits teach dexterity, dexterity steadies the shot and the reload, a heavy load slows you and stops the sprint', async () => {
    await stage();
    const S = g.skillsSys, xp0 = S.xp.dexterity, lv0 = S.lv.dexterity;
    const target = person('drifter', 6, 0, { hp: 900 });
    await C('fire', { id: target.id, shots: 1 });
    const learned = S.xp.dexterity > xp0 || S.lv.dexterity > lv0;
    g.removeChar(target);
    const base = { spread: g.skills.spreadMul, reload: g.skills.reloadMul };
    await C('skills', { dexterity: 6 });
    const steadier = g.skills.spreadMul < base.spread && g.skills.reloadMul < base.reload;
    await C('skills', { dexterity: lv0 });
    const shells = g.inv.ammo.shells, cap0 = g.inventory.carried.cap;
    g.inventory.carried.cap = 999; // 28 litres of shells fit no pack: room for the weighing only
    g.inv.ammo.shells += 700; S.recompute(); // ~31 kg of shells: over a starting back's 24 kg
    const over = g.skills.overloaded && g.skills.speedMul < 1;
    const x0 = g.player.x, t0 = g.time;
    g.autopilot = null; g.aimOverride = null;
    await C('moveTo', { x: g.player.x + 30, z: g.player.z, maxSeconds: 1 }).catch(() => null);
    // Speed over the game time that actually passed: real-time frames can run during the step loop's
    // yields, so "1 s" of moveTo sometimes walks a little more than 1 s (it read 4.5 m against 4.4).
    const moved = Math.abs(g.player.x - x0), pace = moved / Math.max(0.5, g.time - t0);
    g.inv.ammo.shells = shells; g.inventory.carried.cap = cap0; S.recompute();
    return learned && steadier && over && pace < 4.4 ? true : JSON.stringify({ learned, steadier, over, load: +g.skills.load.toFixed(2), moved: r1(moved), pace: r1(pace) });
  });
  await check('garage: a plated nose stops rounds until it is breached, plate slows the car, the hood gun fires where the nose points, oil spins a car', async () => {
    await stage();
    const v = api.findVeh((await C('spawnVehicle', { type: 'sedan', x: g.player.x + 12, z: g.player.z, heading: -Math.PI / 2 })).id); // nose toward you
    const base = { accel: v.accel, maxSpeed: v.maxSpeed };
    await C('garage', { vehicle: v.id, plates: 'front', points: 10 });
    const heavier = v.accel < base.accel && v.maxSpeed < base.maxSpeed;
    const hp0 = v.hp;
    await C('fire', { id: v.id, shots: 1 });
    const absorbed = v.hp === hp0 && v.plates.front < 10;
    for (let i = 0; i < 8 && v.plates.front > 0; i++) await C('fire', { id: v.id, shots: 1 });
    const breached = v.plates.front === 0;
    await C('fire', { id: v.id, shots: 1 });
    const through = v.hp < hp0;
    await C('garage', { vehicle: v.id, mount: 'mg' });
    await C('enterVehicle', { id: v.id, force: true });
    const target = person('drifter', 0, 0, { hp: 900 });
    target.x = v.x + Math.sin(v.h) * 14; target.z = v.z + Math.cos(v.h) * 14;
    const hg = await C('hoodgun', { id: target.id, shots: 12 });
    const gunned = target.hp < 900;
    g.exitVehicle(true); g.removeChar(target);
    // Oil: a car rolling through a fresh slick loses its grip.
    const w = api.findVeh((await C('spawnVehicle', { type: 'sedan', x: g.player.x - 20, z: g.player.z + 20 })).id);
    g.garage.hazard('oil', w.x, w.z, 4.5, 30);
    w.vx = 8; g.garage.update(1 / 60);
    const slipped = (w.gripMul ?? 1) < 1;
    for (const x of [v, w]) g.vehiclesSys.remove(x);
    g.garage.hazards.length = 0;
    return heavier && absorbed && breached && through && gunned && slipped ? true : JSON.stringify({ heavier, absorbed, breached, through, gunned, hg, slipped, plates: v.plates });
  });
  await check('faction sim: ten days off-screen move strength and stores, skirmish at war, and run in under 20 ms', async () => {
    const S = g.society, sv = S.sim.save();
    const r = await C('simTick', { hours: 240 });
    const moved = JSON.stringify(r.before) !== JSON.stringify(r.after);
    const skirmished = r.records.some((x) => x.verb === 'skirmish');
    S.sim.load(sv);
    return moved && skirmished && r.ms < 20 ? true : JSON.stringify({ moved, skirmished, ms: r.ms, n: r.records.length });
  });
  await check('the morning radio reads yesterday back: the dead, and a jump somebody saw', async () => {
    await stage();
    const S = g.society, seq0 = g.eventSeq;
    const c = person('raider', 7, 0); await C('kill', { id: c.id });
    S.deeds.record('stunt', { x: 355, z: 28, m: 1, label: 'Wreck Row', flags: K.feat, witness: false, src: 'stunt' });
    await C('setTime', { hour: 23.9 }); await C('step', { seconds: 0.3 });
    await C('setTime', { hour: 7 }); await C('step', { seconds: 0.3 }); // the day rolls; dawn has come
    const ev = g.events.find((e) => e.seq > seq0 && e.type === 'radioDigest');
    const body = ev?.lines?.[1] ?? '';
    await C('setTime', { hour: 12 });
    return ev && /dead/.test(body) && body.includes('Wreck Row') && ev.lines.length === 3 ? true : JSON.stringify({ ev: ev ?? null, day: S.day });
  });
  await check('faction sim: a strong Dustwolf band raids Rust Haven at night, and beating them off costs the band', async () => {
    await stage();
    const S = g.society, sim = S.sim, dw = S.factions.index.dustwolves, sv = sim.save();
    await C('setTime', { hour: 23 }); await C('step', { seconds: 0.3 }); // (the sim catches up the hours the clock jumped)
    sim.strength[dw] = 80; sim.resources[dw] = 60;
    // Pacing isn't what this checks: a raid the director already sent (one can ride in before the battery
    // starts) leaves its 30-minute cooldown, so clear the raid's cooldowns and put them back after.
    const D = S.director, cool0 = { ...D.cool };
    for (const k of ['raid:dustwolves', 'tpl:raid', 'global']) D.cool[k] = 0;
    let ev;
    try { ev = D.fire('raid'); } catch (e) { sim.load(sv); D.cool = cool0; await C('setTime', { hour: 12 }); return String(e.message ?? e); }
    D.cool = cool0;
    const raiders = ev.members, s0 = sim.strength[dw];
    const rode = raiders.length >= 4 && raiders.every((c) => c.faction === 'raider' && c.raidOf === ev.id);
    for (const c of raiders) if (c.alive) await C('kill', { id: c.id });
    await C('step', { seconds: 1 });
    const s1 = sim.strength[dw], beaten = ev.outcome === 'success' && s1 <= s0 - 6;
    sim.load(sv); await C('setTime', { hour: 12 });
    return rode && beaten ? true : JSON.stringify({ rode, n: raiders.length, outcome: ev.outcome, s0, s1 });
  });
  await check('ATV: rides astride like a bike, drives like a small car, never tips over', async () => {
    await stage();
    const v = api.findVeh((await C('spawnVehicle', { type: 'atv', x: g.player.x + 6, z: g.player.z, heading: Math.PI / 2 })).id);
    await C('enterVehicle', { id: v.id, force: true });
    const x0 = v.x;
    await C('drive', { throttle: 1, seconds: 1.5 });
    const moved = Math.abs(v.x - x0), pose = g.player.seatPose;
    const astride = pose?.kind === 'bike' && Math.abs(Math.cos(v.h) * (pose.x - v.x) - Math.sin(v.h) * (pose.z - v.z)) < 0.05;
    g.exitVehicle(true); g.vehiclesSys.remove(v);
    return moved > 8 && astride && !v.fallen ? true : JSON.stringify({ moved: r1(moved), pose: pose && { kind: pose.kind }, fallen: v.fallen });
  });
  // Jumps (data/stunts.js): staged runs at real speed through real physics; only the start line is placed.
  const jumpRun = async (args) => {
    for (const o of [...g.vehicles]) if (o.ai && !o.occ?.includes(g.player) && Math.abs(o.z - 28) < 40 && Math.abs(o.x - 330) < 40) g.vehiclesSys.remove(o); // no traffic on the run-up
    return C('stunts', { back: 12, ...args });
  };
  const jumpDone = () => { if (g.player.inVehicle) g.exitVehicle(true); for (const o of [...g.vehicles]) if (o.stuntCar && !o.occ?.some(Boolean)) g.vehiclesSys.remove(o); };
  await check('jumps: Wreck Row at 40 mph flies five wrecks, lands clean on the deck, pays and gets talked about', async () => {
    await stage();
    const sv = JSON.parse(JSON.stringify(g.stunts.save())), cash0 = g.cash, seq0 = g.eventSeq;
    g.stunts.cleared = {};
    const r = await jumpRun({ run: 'wreckrow', speed: 18.2 });
    const res = r.result ?? {}, paid = g.cash - cash0;
    const talked = g.events.some((e) => e.seq > seq0 && e.type === 'deed' && e.verb === 'stunt');
    jumpDone(); g.stunts.load(sv); g.cash = cash0;
    return r.flew && res.cleared && res.landing === 'clean' && res.landedOn === 'wreckrow_down' && res.dist > 22 && paid === 60 && talked ? true
      : JSON.stringify({ flew: r.flew, lip: r.lipSpeed, res, paid, talked });
  });
  await check('jumps: too slow meets the landing deck\'s face (a crash, no clear); too fast flies past the deck (cleared, hard)', async () => {
    await stage();
    const sv = JSON.parse(JSON.stringify(g.stunts.save())), cash0 = g.cash;
    const slow = (await jumpRun({ run: 'wreckrow', speed: 16 })).result ?? {}; jumpDone();
    const fast = (await jumpRun({ run: 'wreckrow', speed: 22 })).result ?? {}; jumpDone();
    g.stunts.load(sv); g.cash = cash0;
    const ok = !slow.cleared && slow.landing === 'crash' && fast.cleared && fast.landedOn === null && (fast.landing === 'hard' || fast.landing === 'rough');
    return ok ? true : JSON.stringify({ slow, fast });
  });
  await check('jumps: a dune is a bump at a crawl and air at speed; kickers are solid from the side; people stand on dirt', async () => {
    await stage();
    const crawl = await jumpRun({ ramp: 'dune1', speed: 5, back: 8 }); jumpDone();
    const fast = await jumpRun({ ramp: 'dune1', speed: 25, back: 8 }); jumpDone();
    // A car driven square into the side of the takeoff kicker, near its lip, stops against it instead of climbing on.
    const v = g.vehiclesSys.spawn('sedan', 337.5, 18, 0); v.stuntCar = true;
    await C('enterVehicle', { id: v.id, force: true });
    v.vz = 10;
    g.driveOverride = { throttle: 0.6, steer: 0 }; await api._step(90); g.driveOverride = null;
    const blocked = v.z < 24.2 && v.y < 0.2;
    jumpDone();
    const standOn = g.charR.groundAt(349, 58); // the table's flat top
    const ok = !crawl.flew && fast.flew && (fast.result?.air ?? 0) > 0.4 && blocked && Math.abs(standOn - 1.8) < 0.01 && g.stunts.warnings.length === 0;
    return ok ? true : JSON.stringify({ crawl: { flew: crawl.flew }, fast: { flew: fast.flew, air: fast.result?.air }, blocked, z: r1(v.z), y: r1(v.y), standOn, warnings: g.stunts.warnings });
  });
  await check('inventory: a found bottle rides in the pack, V drinks from it, a tin needs a blade, packs swap', async () => {
    await stage();
    const inv = g.inventory, sv = JSON.parse(JSON.stringify(inv.save())), water0 = g.needs.water;
    inv.carried.slots = []; inv.worn = null; inv.wear('satchel');
    g.needs.water = 0.3; g.needs.food = 0.9; g.player.hp = g.player.maxHp; g.player.bleed = 0;
    await C('item', { give: 'water_bottle' });
    const q = await C('item', { quick: true });
    const bottle = inv.carried.slots.find((s) => s.id === 'water_bottle');
    const drank = g.needs.water > 0.42 && bottle?.left === 2;
    await C('item', { give: 'beans_tin' });
    const tried = await C('item', { use: 'beans_tin' }); // commands answer ok:false rather than throw
    const blocked = tried.ok === false && /blade|opener/.test(String(tried.error));
    await C('item', { give: 'knife' }); g.needs.food = 0.5;
    const ate = !!(await C('item', { use: 'beans_tin' })).used && g.needs.food > 0.75;
    await C('item', { give: 'backpack' });
    const worn = (await C('item', { wear: 'backpack' })).worn === 'backpack' && inv.carried.cap > 20 && inv.carried.slots.some((s) => s.id === 'satchel');
    inv.load(sv); g.needs.water = water0;
    return q.quick && drank && blocked && ate && worn ? true : JSON.stringify({ quick: q.quick, drank, water: g.needs.water, bottle, blocked, ate, worn });
  });
  await check('inventory: the dead can be searched (the same loot every time), and what you carry weighs', async () => {
    await stage();
    const inv = g.inventory, sv = JSON.parse(JSON.stringify(inv.save()));
    const c = person('raider', 1.2, 0); await C('kill', { id: c.id });
    const box = inv.boxes.get(`body:${c.id}`);
    if (!box) { inv.load(sv); return 'no body container'; }
    inv.open(box);
    for (let sd = 1; !box.slots.length && sd < 60; sd++) { box.seed = sd; inv.roll(box); } // a body that carried something
    const items = box.slots.map((x) => x.id);
    const twin = inv.place('selftest:twin', 'raider', 0, 0, 20, 'TWIN', box.seed); inv.open(twin);
    const again = twin.slots.map((x) => x.id);
    const kg0 = g.skills.kg;
    await C('item', { give: 'scrap', n: 4 }); // 6 kg of steel in 4 litres
    const heavier = g.skills.kg > kg0 + 5.9;
    inv.boxes.delete(box.id); inv.boxes.delete(twin.id); inv.opened = null; inv.load(sv);
    return items.length > 0 && JSON.stringify(items) === JSON.stringify(again) && heavier ? true : JSON.stringify({ items, again, kg0, kg: g.skills.kg });
  });
  await check('inventory: shop shelves are searchable and owned - take from Doc Reyes\'s shelf in front of her and she remembers it', async () => {
    await stage();
    const inv = g.inventory, sv = JSON.parse(JSON.stringify(inv.save()));
    const box = [...inv.boxes.values()].find((b) => b.ownerName === 'Doc Lupe Reyes');
    const reyes = g.chars.find((c) => c.npc?.id === 'reyes');
    if (!box || !reyes) { inv.load(sv); return JSON.stringify({ box: !!box, reyes: !!reyes }); }
    const mems0 = (await C('memory', { id: 'reyes' })).memories.filter((m) => m.kind === 'robbedMe').length;
    await C('teleport', { x: box.x + 1, z: box.z + 0.6 });
    const home = { x: reyes.x, z: reyes.z };
    reyes.x = g.player.x + 0.7; reyes.z = g.player.z + 0.3; reyes.hold = 1.5; // at your shoulder
    inv.open(box); box.slots = []; inv.add(box, 'bandage', 2); box.stealT = -99;
    const seq0 = g.eventSeq;
    const took = (await C('item', { take: 'bandage', n: 2 })).moved;
    const deed = g.events.find((e) => e.seq > seq0 && e.type === 'deed' && e.verb === 'steal');
    const mems = (await C('memory', { id: 'reyes' })).memories.filter((m) => m.kind === 'robbedMe').length;
    reyes.x = home.x; reyes.z = home.z; inv.opened = null; box.stealT = -99; inv.load(sv);
    g.society.memory.entry('reyes').mems = g.society.memory.entry('reyes').mems.filter((m) => m.kind !== 'robbedMe');
    return took === 2 && deed?.witnesses >= 1 && mems > mems0 ? true : JSON.stringify({ took, deed: deed ?? null, mems0, mems });
  });
  await check('locks: lockpicks open a locked door without a sound (one pick spent); a crowbar opens it loud and stays in your pack', async () => {
    await stage();
    const I = g.interiors, inv = g.inventory, sv = JSON.parse(JSON.stringify(inv.save()));
    const door = I.doors.find((d) => d.locked && d.kind === 'back') ?? I.doors.find((d) => d.kind === 'back');
    if (!door) { inv.load(sv); return 'no back door'; }
    I.setLocked(door, true);
    const out = { x: door.x + door.nx * 1.3, z: door.z + door.nz * 1.3 }, out2 = { x: door.x - door.nx * 1.3, z: door.z - door.nz * 1.3 };
    await C('teleport', I.nearest({ x: out.x, z: out.z }) === door ? out : out2); await C('step', { seconds: 0.1 });
    let noises = 0; const noise = g.noise; g.noise = (...a) => { noises++; return noise.apply(g, a); };
    try {
      inv.carried.slots = []; await C('item', { give: 'lockpicks' });
      const picked = (await C('item', { use: 'lockpicks' })).used === 'LOCK PICKED' && !door.locked && noises === 0 && inv.carried.slots.find((s) => s.id === 'lockpicks')?.left === 5;
      I.setLocked(door, true); inv.carried.slots = []; await C('item', { give: 'crowbar' });
      const pried = (await C('item', { use: 'crowbar' })).used === 'PRIED OPEN' && !door.locked && noises > 0 && inv.carried.slots.some((s) => s.id === 'crowbar');
      return picked && pried ? true : JSON.stringify({ picked, pried, noises, locked: door.locked });
    } finally { g.noise = noise; inv.load(sv); I.setLocked(door, false); }
  });
  // ---- the military base (data/bases.js, systems/bases.js; docs/design/WEB_MILITARY.md §8). Staged at OUTPOST NINE with
  // the player on their own keys; the Remnant's standing, the post's alert and anything opened are put back after.
  const OB = g.bases.byId.outpost9, RF = g.society.factions, RI = RF.index.remnant;
  const baseReset = () => { g.bases.calm(OB, 'selftest', true); OB.warnedAt = -1e9; OB.cleared = false; OB.shotWarned = false; };
  const withRemnant = async (standing, fn) => {
    const s0 = RF.standing[RI], l0 = RF.lifetime[RI];
    if (g.player.inVehicle) g.exitVehicle(true);
    g.autopilot = null; g.aimOverride = null; g.crouchOverride = false; g.player.crouch = false;
    baseReset(); RF.set('remnant', standing);
    try { return await fn(); } finally { baseReset(); RF.standing[RI] = s0; RF.lifetime[RI] = l0; RF.retier(RI, false); await C('setTime', { hour: 12 }); await C('teleport', STAGE); }
  };
  await check('base: the chain-link stops you on foot and a car at speed, but not sight or a round; the way in is the gate', async () => withRemnant(40, async () => {
    const f = OB.fence;
    await C('setTime', { hour: 12 });
    await C('teleport', { x: f.x1 + 2.2, z: OB.oz - 3 });
    await holdKey('KeyA', 2.5); // walk west, into the east fence
    const walker = g.player.x > f.x1;
    const v = g.vehiclesSys.spawn('sedan', f.x1 + 15, OB.oz - 9, -Math.PI / 2); v.stuntCar = true;
    await C('enterVehicle', { id: v.id, force: true });
    v.vx = -13; g.driveOverride = { throttle: 1, steer: 0 }; await api._step(150); g.driveOverride = null;
    const car = v.x > f.x1, carX = v.x;
    g.exitVehicle(true); g.vehiclesSys.remove(v);
    const path = g.nav.foot.find(f.x1 + 3, OB.oz - 3, OB.ox, OB.oz), gx = OB.ox + OB.row.gate.at;
    const viaGate = !!path && path.some((p) => Math.abs(p.x - gx) < 5 && Math.abs(p.z - f.z1) < 3);
    const see = g.los(f.x1 + 6, OB.oz - 3, f.x1 - 6, OB.oz - 3);
    const round = g.statics.raycast(f.x1 + 6, OB.oz - 3, -1, 0, 12, RAY_BULLET) >= 11.9;
    return walker && car && viaGate && see && round ? true : JSON.stringify({ walker, x: r1(g.player.x), car, carX: r1(carX), fence: f.x1, viaGate, see, round });
  }));
  await check('base: a sentry warns you once inside the wire, stay and the post opens fire; a Remnant-friendly player is waved through; a shot inside brings it down at once', async () => withRemnant(RF.row('remnant').start, async () => {
    const gx = OB.ox + OB.row.gate.at, gz = OB.fence.z1;
    await C('setTime', { hour: 12 });
    await C('teleport', { x: gx, z: gz + 3.5 }); // on the spur, past the chicane, facing the gate
    const seq0 = g.eventSeq;
    await holdKey('KeyW', 3, () => g.player.z < gz - 4); // in through the gate on your own feet
    await api._step(20);
    const warned = OB.alert === 'warned' && g.events.some((e) => e.seq > seq0 && e.type === 'baseWarning');
    const heldFire = OB.guards.every((c) => !g.ai.hostile(c, g.player));
    await api._step(Math.round((BASE_RULES.grace + 1) * 60));
    const hostile = OB.alert === 'hostile' && OB.guards.filter((c) => c.alive && g.ai.hostile(c, g.player)).length >= 6;
    const alarm = g.events.find((e) => e.seq > seq0 && e.type === 'baseAlarm');
    const warnings = g.events.filter((e) => e.seq > seq0 && e.type === 'baseWarning').length;
    // Friendly: the same walk is waved through.
    baseReset(); RF.set('remnant', 40);
    await C('teleport', { x: gx, z: gz + 3.5 });
    const seq1 = g.eventSeq;
    await holdKey('KeyW', 3, () => g.player.z < gz - 4);
    await api._step(Math.round((BASE_RULES.grace + 1) * 60));
    const waved = OB.alert === 'calm' && g.events.some((e) => e.seq > seq1 && e.type === 'baseCleared') && !g.events.some((e) => e.seq > seq1 && e.type === 'baseWarning');
    // Neutral again and inside: one shot fired and the post comes down without a warning.
    baseReset(); RF.set('remnant', RF.row('remnant').start);
    await C('give', { pistol: 12 }); await C('equip', { weapon: 'pistol' });
    const seq2 = g.eventSeq;
    await C('fire', { x: g.player.x + 4, z: g.player.z - 9, shots: 1 });
    const shot = OB.alert === 'hostile' && g.events.some((e) => e.seq > seq2 && e.type === 'baseAlarm' && e.why === 'shots');
    return warned && heldFire && hostile && alarm?.why === 'stayed' && warnings === 1 && waved && shot ? true
      : JSON.stringify({ warned, heldFire, hostile, alarm: alarm ?? null, warnings, waved, shot, alert: OB.alert, at: [r1(g.player.x), r1(g.player.z)] });
  }));
  await check('base: the armory is a locked steel door that holds you, and its ammo crates roll military loot', async () => withRemnant(40, async () => {
    const d = OB.doors.find((x) => x.building === 'armory'), door = g.interiors.byId.get(d.id);
    await C('teleport', { x: door.x + door.nx * 1.6 + door.ux * 0.3, z: door.z + door.nz * 1.6 + door.uz * 0.3 });
    await api._step(6);
    await holdKey(keyFor(-door.nx, -door.nz), 1.5);
    const held = outSide(door, g.player.x, g.player.z) > 0.2 && door.locked && Math.abs(door.leaves[0].th) < 0.01;
    const steel = door.material === 'metal' && DOOR_MATERIALS.metal.name === 'steel door' && door.kicks === DOOR_MATERIALS.metal.kicks;
    const allowed = new Set(LOOT.military.rows.map((r) => r[0]));
    const crates = [...g.inventory.boxes.values()].filter((b) => b.id.startsWith('box:base:outpost9:armory'));
    const rolls = crates.map((b) => { const was = b.rolled; g.inventory.open(b); const ids = b.slots.map((x) => x.id); if (!was) { b.rolled = false; b.slots = []; } return ids; });
    g.inventory.opened = null;
    const military = crates.length === 3 && crates.every((b) => b.kind === 'military') && rolls.every((r) => r.length > 0 && r.every((id) => allowed.has(id)));
    const sealed = !g.world.buildings.find((b) => b.baseBuilding === 'armory').doors.length; // no unlocked way in
    // placeFurniture() gives every crate/shelf in a building a home or shop table: inside the wire, only the base's own
    // boxes (and bodies, ground piles) may be containers.
    const f = OB.fence, strays = [...g.inventory.boxes.values()].filter((b) => b.x > f.x0 && b.x < f.x1 && b.z > f.z0 && b.z < f.z1 && !b.id.startsWith('box:base:') && b.kind !== 'ground' && !b.id.startsWith('body:')).map((b) => `${b.id}=${b.kind}`);
    return held && steel && military && sealed && !strays.length ? true : JSON.stringify({ door: d.id, held, at: r1(outSide(door, g.player.x, g.player.z)), locked: door.locked, steel, rolls, sealed, strays });
  }));
  await check('base: the motor pool parks a PATROL TRUCK and an ARMORED CARRIER; both are vehicle rows that spawn anywhere and drive', async () => {
    const parked = OB.vehicles.filter((v) => !v.dead && Math.hypot(v.x - OB.ox, v.z - OB.oz) < 45).map((v) => v.type).sort().join(',');
    const out = {};
    for (const [type, need2] of [['patrol', 14], ['apc', 8]]) {
      await stage();
      const r = await C('spawnVehicle', { type, x: STAGE.x + 6, z: STAGE.z - 14, heading: Math.PI / 2 });
      const v = api.findVeh(r.id);
      await C('enterVehicle', { id: v.id, force: true });
      const x0 = v.x;
      await C('drive', { throttle: 1, seconds: 2.5 });
      out[type] = { name: r.name, moved: r1(v.x - x0), ok: v.x - x0 > need2 && !v.dead };
      g.exitVehicle(true); g.vehiclesSys.remove(v);
    }
    return parked === 'apc,patrol' && out.patrol.ok && out.apc.ok && out.patrol.name === 'PATROL TRUCK' && out.apc.name === 'ARMORED CARRIER' ? true : JSON.stringify({ parked, out });
  });
  await check('base: at night the searchlights sweep and the floodlights burn; a sentry picks you out further in a beam than in the dark', async () => withRemnant(40, async () => {
    const tw = OB.towers.find((t) => t.id === 'tower_nw'), sentry = OB.guards.find((c) => c.post?.id === 'tower_nw' && c.alive);
    await C('setTime', { hour: 23 }); await api._step(20);
    const on = OB.poolMesh.visible && OB.beamMesh.visible;
    const p0 = { x: tw.poolX, z: tw.poolZ };
    await api._step(240);
    const swept = Math.hypot(tw.poolX - p0.x, tw.poolZ - p0.z) > 1;
    // 25 m down the west fence from the tower, in the open: dark, then under its beam.
    await C('teleport', { x: tw.x, z: tw.z + 25 });
    const search = OB.pools.filter((p) => p.kind === 'search');
    for (const p of search) { p.x = OB.ox + 200; p.z = OB.oz; }
    const dark = !g.bases.lit(OB, g.player.x, g.player.z) && !g.bases.spotter(OB, [sentry]);
    const beam = search.find((p) => p.tower === tw); beam.x = g.player.x; beam.z = g.player.z;
    const lit = g.bases.lit(OB, g.player.x, g.player.z) && g.bases.spotter(OB, [sentry]) === sentry;
    await C('setTime', { hour: 12 }); await api._step(10);
    const off = !OB.poolMesh.visible && !OB.beamMesh.visible;
    return on && swept && dark && lit && off && sentry ? true : JSON.stringify({ on, swept, dark, lit, off, sentry: sentry?.id ?? null, range: r1(g.bases.spotRange(OB)) });
  }));
  await check('zoom: Z steps out to HIGH; squads still arrive from out of sight, shadows reach the edge, still under 150 draw calls', async () => {
    await stage();
    const lv0 = g.zoomLevel;
    for (let k = 0; k < 6; k++) g.setZoom(g.zoomLevel + 1); // past the end: it stops at HIGH
    await C('step', { seconds: 4 }); // the height settles
    const high = g.zoomLevel === ZOOM.levels.length - 1, vr = g.viewR;
    const ring = g.society.director.ringPoint(90, 125); // the hunters' ring
    const ringOut = !ring || Math.hypot(ring.x - g.player.x, ring.z - g.player.z) > vr;
    const shadowOk = g.sky.sun.shadow.camera.right >= vr;
    g.render(0); const p = await C('perf');
    g.setZoom(lv0); await C('step', { seconds: 4 });
    const back = Math.abs(g.camHeight - ZOOM.levels[lv0].foot) < 3;
    return high && vr > 100 && ringOut && shadowOk && p.drawCalls < 150 && back ? true : JSON.stringify({ high, vr: r1(vr), ringOut, shadow: g.sky.sun.shadow.camera.right, draws: p.drawCalls, back, camHeight: r1(g.camHeight) });
  });
  // ---- rounds and guns as things (docs/design/WEB_INVENTORY.md, guns) ----
  await check('rounds are things: a reload takes them out of your pockets, they weigh what they weigh, what will not fit lands at your feet, and an old save\'s numbers become rounds', async () => {
    await stage();
    const inv = g.inventory, box = inv.carried, A = g.inv.ammo, p = g.player;
    const keep = { pistol: A.pistol, mag: g.inv.mag.pistol };
    A.pistol = 30; g.inv.mag.pistol = 0; p.reloading = 0;
    const kg0 = inv.kg();
    g.reload(); await C('step', { seconds: WEAPONS.pistol.reload + 0.5 });
    const reloaded = g.inv.mag.pistol === 6 && A.pistol === 24 && box.count('ammo_pistol') === 24;
    const kgDrop = kg0 - inv.kg(), weighs = Math.abs(kgDrop - 6 * ITEMS.ammo_pistol.kg) < 1e-6;
    // more shells than the pack has room for: the rest spill at your feet
    const s0 = A.shells, fit = Math.floor((inv.room(box) + 1e-6) / ITEMS.ammo_shells.bulk);
    A.shells = s0 + fit + 40;
    const pile = inv.groundAt(p.x, p.z), spilled = pile.count('ammo_shells') === 40 && A.shells === s0 + fit;
    pile.slots = pile.slots.filter((s) => s.id !== 'ammo_shells'); inv.prune();
    A.shells = s0;
    // a save from before rounds were items: none in the pack, the count a plain number
    const slots = box.slots.map((s) => ({ ...s }));
    box.slots = box.slots.filter((s) => !ITEMS[s.id]?.ammo);
    g.inv.ammo = { pistol: 50, smg: 0, shells: 0 };
    inv.bindAmmo();
    const migrated = g.inv.ammo.pistol === 50 && box.count('ammo_pistol') === 50 && JSON.parse(JSON.stringify(g.inv)).ammo.pistol === 50;
    box.slots = slots; // as it was (the view reads the pack, so the count follows it)
    g.inv.ammo.pistol = keep.pistol; g.inv.mag.pistol = keep.mag; inv.changed();
    return reloaded && weighs && spilled && migrated ? true : JSON.stringify({ reloaded, mag: g.inv.mag.pistol, reserve: A.pistol, kgDrop: +kgDrop.toFixed(4), spilled, pile: pile.count('ammo_shells'), migrated });
  });
  await check('guns are things: a dead soldier leaves his rifle and spare rounds; taken it is slung, loaded as it lay; it stows in a trunk; a worn gun jams, its trigger goes dead and R clears it; a kit cleans; broken will not fire until the gunsmith', async () => {
    await stage();
    const inv = g.inventory, p = g.player, I = g.input;
    const keep = { weapons: g.inv.weapons.slice(), current: g.inv.current, cond: { ...g.inv.cond }, mag: { ...g.inv.mag }, cash: g.cash };
    const s = g.bases.spawnSoldier(p.x + 1.5, p.z, Math.random, 'rifle');
    g.combat.damage(s, 9999, null, 0, 0, 'bullet');
    const body = inv.boxes.get(`body:${s.id}`), lay = body?.slots.find((x) => x.id === 'gun_rifle');
    const fair = !!lay && lay.cond >= 0.62 && lay.cond <= 0.95 && lay.loaded >= 9 && lay.loaded <= 30 && body.count('ammo_rifle') >= 20;
    // the PACK screen over the body: Space on the rifle slings it (you carry none) and puts it in your hands
    g.invUI.toggle(true);
    const atBody = g.invUI.other === body;
    g.invUI.side = 1; g.invUI.sel[1] = body.slots.indexOf(lay); g.invUI.act('move');
    const slung = g.inv.weapons.includes('rifle') && g.inv.current === 'rifle' && g.inv.mag.rifle === lay?.loaded && Math.abs(inv.cond('rifle') - lay?.cond) < 1e-9 && !body.slots.includes(lay);
    g.invUI.toggle(false);
    // into the trunk of a car beside you: Space on the slung rifle
    p.x += 12; await C('step', { seconds: 0.1 });
    const v = g.vehiclesSys.spawn('sedan', p.x + 2.3, p.z + 2.3, 0), trunk = inv.trunk(v);
    g.invUI.toggle(true);
    const atTrunk = g.invUI.other === trunk;
    g.invUI.side = 0; g.invUI.sel[0] = g.inv.weapons.indexOf('rifle'); g.invUI.act('move');
    const inTrunk = trunk.slots.find((x) => x.id === 'gun_rifle');
    const stowed = !!inTrunk && inTrunk.loaded === lay?.loaded && Math.abs(inTrunk.cond - lay?.cond) < 1e-9 && !g.inv.weapons.includes('rifle') && g.inv.current !== 'rifle';
    g.invUI.toggle(false);
    // a worn revolver, and the dice say jam: the trigger goes dead (a pull starts clearing it, nothing fires)
    g.switchWeapon('pistol'); g.inv.mag.pistol = 6; g.inv.cond.pistol = 0.2; p.reloading = 0; p.cool = 0;
    const rnd = Math.random; let jammed;
    try { Math.random = () => 0; jammed = inv.shot('pistol'); } finally { Math.random = rnd; }
    const mag0 = g.inv.mag.pistol;
    I.mouse.leftPressed = true; I.mouse.left = true;
    g.handleShooting(1 / 60, 0);
    I.mouse.leftPressed = false; I.mouse.left = false;
    const dead = jammed && p.clearing && p.reloading > 0 && g.inv.mag.pistol === mag0;
    await C('step', { seconds: GUN_CARE.clearTime + 0.3 });
    const cleared = !g.inv.jam.pistol && !p.clearing && g.inv.mag.pistol === mag0 - 1; // the stuck round is thrown away
    // a kit puts some condition back
    inv.add(inv.carried, 'cleaning_kit', 1); inv.changed();
    const c0 = inv.cond('pistol'), used = inv.use(inv.carried.slots.findIndex((x) => x.id === 'cleaning_kit'));
    const cleaned = used.ok && Math.abs(inv.cond('pistol') - Math.min(GUN_CARE.kitMax, c0 + GUN_CARE.kit)) < 1e-9;
    // broken: the trigger does nothing, a kit will not touch it, the gunsmith's bench will
    g.inv.cond.pistol = 0; p.cool = 0;
    const m1 = g.inv.mag.pistol;
    I.mouse.leftPressed = true; I.mouse.left = true;
    g.handleShooting(1 / 60, 0);
    I.mouse.leftPressed = false; I.mouse.left = false;
    const kitNo = inv.use(inv.carried.slots.findIndex((x) => x.id === 'cleaning_kit'));
    const broken = inv.gunState('pistol') === 'broken' && g.inv.mag.pistol === m1 && !(p.reloading > 0) && !kitNo.ok;
    g.cash = 500;
    const quote = inv.smithQuote('pistol'), fx = inv.smithFix('pistol');
    const fixed = fx.ok && inv.cond('pistol') === 1 && g.cash === 500 - quote && quote === Math.round(ITEMS.gun_pistol.value * GUN_CARE.smith);
    // tidy: the body, the car, the kit; your guns as they were
    g.removeChar(s); inv.boxes.delete(`body:${s.id}`);
    g.vehiclesSys.remove(v); inv.trunks.delete(v.id);
    const ki = inv.carried.slots.findIndex((x) => x.id === 'cleaning_kit'); if (ki >= 0) inv.take(inv.carried, ki, 1);
    g.inv.weapons = keep.weapons; g.inv.cond = keep.cond; g.inv.mag = keep.mag; g.inv.jam = {}; g.cash = keep.cash; g.switchWeapon(keep.current); inv.changed();
    const ok = fair && atBody && slung && atTrunk && stowed && dead && cleared && cleaned && broken && fixed;
    return ok ? true : JSON.stringify({ fair, lay: lay && { cond: lay.cond, loaded: lay.loaded }, spare: body?.count('ammo_rifle'), atBody, slung, atTrunk, stowed, jammed, dead, cleared, mag: g.inv.mag.pistol, cleaned, broken, fixed, quote });
  });
  // ---- trade (docs/design/WEB_TRADE.md) ----
  await check('trade: at Ike\'s shelf with Ike there, taking is buying at his people\'s prices (no theft) and putting is selling what he deals in; hostile, no deal; Ike gone, no counter', async () => {
    const inv = g.inventory, T = g.trade, ike = g.chars.find((c) => c.npc?.id === 'ike' && c.alive);
    const box = ike && [...inv.boxes.values()].find((b) => b.owner === ike.id);
    if (!ike || !box) return `ike: ${!!ike}, a shelf of his: ${!!box}`;
    if (g.player.inVehicle) g.exitVehicle(true);
    const F = g.society.factions, fi = ike.fi, keep = { s: F.standing[fi], l: F.lifetime[fi], cash: g.cash, ike: { x: ike.x, z: ike.z }, p: { x: g.player.x, z: g.player.z }, pistol: g.inv.ammo.pistol };
    inv.open(box);
    const slots0 = box.slots.map((s) => ({ ...s }));
    try {
      F.set(ike.fid, 0); // neutral
      g.player.x = box.x + 0.8; g.player.z = box.z; ike.x = box.x + 3; ike.z = box.z; // Ike behind his counter
      box.slots = []; inv.add(box, 'ammo_pistol', 30);
      box.stockDay = g.society?.day ?? 0; // stocked today: no restock rolls goods into the shelf mid-check (a reused page is days on)
      const D = T.at(box), stolen0 = box.stolen ?? 0;
      const counter = !!D && !D.refuse && D.tier === 'neutral' && D.id === 'ike';
      g.cash = 100;
      const r = D && T.buy(box, 0, 12, D);
      const bought = !!r?.ok && r.n === 12 && r.cost === Math.ceil(ITEMS.ammo_pistol.value * 12 * D.buy - 1e-9) && g.cash === 100 - r.cost
        && box.count('ammo_pistol') === 18 && g.inv.ammo.pistol === keep.pistol + 12 && (box.stolen ?? 0) === stolen0; // paid for: no theft
      // selling: a wrench is his trade, a photograph is not
      inv.add(inv.carried, 'photograph', 1); inv.add(inv.carried, 'wrench', 1);
      const refused = D && !T.sell(inv.carried.slots.findIndex((x) => x.id === 'photograph'), box, 1, D).ok;
      const cashB = g.cash, sr = D && T.sell(inv.carried.slots.findIndex((x) => x.id === 'wrench'), box, 1, D);
      const sold = !!sr?.ok && sr.pay === Math.floor(ITEMS.wrench.value * D.sell + 1e-9) && g.cash === cashB + sr.pay && box.count('wrench') === 1;
      // his people turn hostile: he is there but will not deal (taking would be stealing)
      F.set(ike.fid, -60);
      const H = T.at(box), hostile = !!H && H.refuse;
      F.set(ike.fid, 0);
      // he walks out of the shop: no counter at all
      ike.x = box.x + 30;
      const gone = T.at(box) === null;
      const pi = inv.carried.slots.findIndex((x) => x.id === 'photograph'); if (pi >= 0) inv.take(inv.carried, pi, 1);
      return counter && bought && refused && sold && hostile && gone ? true : JSON.stringify({ counter, tier: D?.tier, buy: D?.buy, bought, cost: r?.cost, why: r?.why, refused, sold, pay: sr?.pay, hostile, gone });
    } finally {
      box.slots = slots0; g.cash = keep.cash; g.inv.ammo.pistol = keep.pistol;
      ike.x = keep.ike.x; ike.z = keep.ike.z; g.player.x = keep.p.x; g.player.z = keep.p.z;
      F.standing[fi] = keep.s; F.lifetime[fi] = keep.l; F.retier(fi, false);
      inv.opened = null; inv.changed();
    }
  });
  // ---- roles (data/roles.js, systems/roles.js; docs/design/WEB_ROLES.md §8). Staged at STAGE like world memory; every
  // check clears the roles again, so nothing after it is read through them. `roles renown=` stages a role the way
  // `standing set=` stages a faction - only where the check is about what the role DOES, never where it is about earning it.
  const R = g.roles, hurtHere = (dx, dz) => { const c = person('drifter', dx, dz); c.hp = 30; c.bleed = 0.5; return c; };
  const has = (t, re) => (t.choices ?? []).findIndex((c) => re.test(c.text));
  await check('roles: patch up three hurt strangers with bandages through the real dialogue and the world starts calling you a medic: a toast, a tape on the HUD, the PACK header, and a save keeps it', async () => {
    await stage();
    const inv = g.inventory, sv = JSON.parse(JSON.stringify(inv.save())), seq0 = g.eventSeq, people = [];
    try {
      inv.carried.slots = inv.carried.slots.filter((s) => ITEMS[s.id]?.kind !== 'med'); inv.changed();
      await C('item', { give: 'bandage', n: 3 });
      people.push(hurtHere(1.6, 0), hurtHere(-1.6, 0.4), hurtHere(0.3, 1.7));
      const before = R.tier('medic');
      let patched = 0;
      for (const c of people) {
        const t = await C('talk', { id: c.id });
        const i = has(t, /patch you up/i);
        if (i >= 0) { await C('choose', { index: i }); if (c.hp > 30 && !(c.bleed > 0)) patched++; }
        g.dialogue.close();
      }
      await C('step', { seconds: 0.5 }); // the HUD's slow lane draws the tape
      const m = (await C('roles', { id: 'medic' })).role;
      const earned = g.events.some((e) => e.seq > seq0 && e.type === 'roleEarned' && e.role === 'medic');
      const toast = g.events.some((e) => e.seq > seq0 && e.type === 'toast' && /MEDIC/.test(e.text));
      const tape = (await C('hud')).plates.roles?.some((r) => r.id === 'medic' && r.text === 'MEDIC' && r.chevrons === 1);
      g.invUI.render(); const header = /MEDIC/.test(document.querySelector('.inv-roles')?.textContent ?? '');
      const heals = g.society.chronicle.query({ verb: 'heal', actor: 'player', limit: 5 }).length;
      // ...and a save keeps it: cleared, then loaded back, the medic is the same medic.
      const sv2 = (await C('save')).save, r0 = R.st.medic.r;
      R.reset(); const wiped = R.tier('medic') === 0;
      await C('load', { save: sv2 });
      const kept = wiped && R.tier('medic') === 1 && Math.abs(R.st.medic.r - r0) < 0.01;
      return before === 0 && patched === 3 && m.tier === 'rumoured' && earned && toast && tape && header && heals >= 3 && inv.carried.count('bandage') === 0 && kept ? true
        : JSON.stringify({ before, patched, tier: m.tier, renown: m.renown, earned, toast, tape, header, heals, bandages: inv.carried.count('bandage'), kept });
    } finally { for (const c of people) if (g.chars.includes(c)) g.removeChar(c); inv.load(sv); R.reset(); }
  });
  await check('roles: time wears a role away, but not at the first dip under the line - still a medic at 18 renown (hysteresis), forgotten under 15', async () => {
    await stage();
    const sim = g.society.sim.save(), seq0 = g.eventSeq;
    try {
      await C('roles', { id: 'medic', renown: 22 });
      const held = R.tier('medic') === 1;
      await C('simTick', { hours: 60 }); // 12 hours' grace, then 48 of fading: 22 -> about 18.5
      const r1st = R.st.medic.r, dipped = r1st < 20 && r1st > 15 && R.tier('medic') === 1;
      await C('simTick', { hours: 120 }); // about 12: under 0.75 x 20
      const gone = R.tier('medic') === 0 && g.events.some((e) => e.seq > seq0 && e.type === 'roleLost' && e.role === 'medic');
      const toast = g.events.some((e) => e.seq > seq0 && e.type === 'toast' && /NOBODY CALLS YOU A MEDIC/.test(e.text));
      return held && dipped && gone && toast ? true : JSON.stringify({ held, after60: r1(r1st), dipped, now: r1(R.st.medic.r), tier: R.tier('medic'), gone, toast });
    } finally { g.society.sim.load(sim); R.reset(); }
  });
  await check("roles: a known Dustwolf rider walks into their sights and the guns stay down - standing unmoved at -60; Rust Haven reads the rider colder and Ike's counter charges more (priceMul through trade.js); lose the role and the wolves open up again", async () => {
    await stage();
    const F = g.society.factions, dw = F.index.dustwolves, rh = F.index.rusthaven;
    const wolf = person('raider', 12, 0, { weapon: 'smg' });
    const ike = g.chars.find((c) => c.npc?.id === 'ike' && c.alive), box = ike && [...g.inventory.boxes.values()].find((b) => b.owner === ike.id);
    // Ike's price for one box of rounds, at his own counter (staged: you and Ike at his shelf, then back).
    const counter = () => {
      if (!box) return null;
      const keep = { p: { x: g.player.x, z: g.player.z }, i: { x: ike.x, z: ike.z } };
      g.player.x = box.x + 0.8; g.player.z = box.z; ike.x = box.x + 3; ike.z = box.z;
      const D = g.trade?.at(box);
      g.player.x = keep.p.x; g.player.z = keep.p.z; ike.x = keep.i.x; ike.z = keep.i.z;
      return D && !D.refuse ? D.buy : null;
    };
    try {
      const s0 = F.standing[dw], before = g.ai.hostile(wolf, g.player), buy0 = counter();
      await C('roles', { id: 'rider', renown: 50 });
      const after = g.ai.hostile(wolf, g.player), s1 = F.standing[dw], buy1 = counter();
      wolf.target = null; await C('step', { seconds: 2 }); // the AI's own scan: nobody draws on you
      const quiet = wolf.target !== g.player, tier = F.tiers[dw];
      const pm = R.priceMul('dustwolves', wolf), colder = F.reading(rh) < F.standing[rh], dearer = buy0 > 0 && buy1 > buy0;
      await C('roles', { id: 'rider', renown: 0 });
      const back = g.ai.hostile(wolf, g.player);
      return before && !after && quiet && back && s1 === s0 && s0 === -60 && tier === 'wary' && pm < 1 && colder && dearer ? true
        : JSON.stringify({ before, after, quiet, back, s0, s1, tier, pm, colder, buy0, buy1 });
    } finally { g.removeChar(wolf); R.reset(); }
  });
  await check("roles: Doc Reyes offers a medic's shift only to a known medic - the kit lands in the pack, and three patients later she pays $90", async () => {
    await stage();
    const inv = g.inventory, sv = JSON.parse(JSON.stringify(inv.save())), cash0 = g.cash, people = [];
    try {
      inv.carried.slots = inv.carried.slots.filter((s) => ITEMS[s.id]?.kind !== 'med'); inv.changed();
      const t0 = await C('talk', { id: 'reyes', force: true }); g.dialogue.close();
      const closed = has(t0, /work for a medic/i) < 0;
      await C('roles', { id: 'medic', renown: 50 });
      const t1 = await C('talk', { id: 'reyes', force: true }), i = has(t1, /work for a medic/i);
      if (i < 0) { g.dialogue.close(); return JSON.stringify({ closed, offered: false, choices: t1.choices }); }
      const t2 = await C('choose', { index: i });
      await C('choose', { index: has(t2, /^I will/) }); g.dialogue.close();
      const kit = inv.carried.count('first_aid') === 1 && inv.carried.count('bandage') === 2 && R.jobActive('medic_shift');
      await C('teleport', STAGE); await C('step', { seconds: 0.2 });
      people.push(hurtHere(1.5, 0), hurtHere(-1.5, 0), hurtHere(0, 1.5));
      for (const [c, item] of [[people[0], 'bandage'], [people[1], 'bandage'], [people[2], 'first_aid']]) await C('item', { use: item, on: c.id });
      const ready = R.jobReady('medic_shift');
      const t3 = await C('talk', { id: 'reyes', force: true }), k = has(t3, /shift is done/i);
      if (k >= 0) await C('choose', { index: k });
      g.dialogue.close();
      const paid = g.cash === cash0 + 90 && !R.jobActive('medic_shift') && !R.jobOpen('medic_shift'); // once a day
      return closed && kit && ready && paid ? true : JSON.stringify({ closed, kit, ready, paid, cash: g.cash - cash0, job: R.jobs.medic_shift });
    } finally { for (const c of people) if (g.chars.includes(c)) g.removeChar(c); inv.load(sv); g.cash = cash0; R.reset(); }
  });
  await check('roles: Rust Haven swears in a known deputy - a star in the pack, one wanted star of slack from the bulls, $20 for a Dustwolf put down; shoot a townsman in front of a bull and the star is taken back', async () => {
    await stage();
    const F = g.society.factions, inv = g.inventory, sv = JSON.parse(JSON.stringify(inv.save())), cash0 = g.cash, extras = [];
    try {
      await C('standing', { faction: 'rusthaven', set: 30 }); // the deputy's gate: Rust Haven has to trust you
      const bull = person('warden', -8, 0); extras.push(bull);
      g.wanted = 1; const noSlack = g.ai.hostile(bull, g.player); g.wanted = 0;
      await C('roles', { id: 'deputy', renown: 50 });
      const t = await C('talk', { id: 'okonkwo', force: true }), i = has(t, /needs deputies/i);
      if (i >= 0) { const t2 = await C('choose', { index: i }); await C('choose', { index: has(t2, /swear it/i) }); }
      g.dialogue.close();
      const sworn = R.office('deputy'), star = inv.carried.count('tin_star') === 1;
      await C('teleport', STAGE); await C('step', { seconds: 0.2 });
      bull.x = g.player.x - 8; bull.z = g.player.z;
      g.wanted = 1; const slack = !g.ai.hostile(bull, g.player); g.wanted = 2; const twoStars = g.ai.hostile(bull, g.player); g.wanted = 0;
      const wolf = person('raider', 6, 0, { hp: 30 }); extras.push(wolf);
      await shootDead(wolf);
      const ready = R.jobReady('deputy_bounty');
      const t3 = await C('talk', { id: 'okonkwo', force: true }), k = has(t3, /deputy's bounty/i);
      if (k >= 0) await C('choose', { index: k });
      g.dialogue.close();
      const paid = g.cash === cash0 + 20;
      // A Rust Haven townsman shot dead in front of a bull: the stars rise, the deputy is suspended, the star goes back.
      await C('teleport', STAGE); await C('step', { seconds: 0.2 });
      bull.x = g.player.x - 6; bull.z = g.player.z; bull.face = Math.atan2(g.player.x - bull.x, 0);
      const towns = person('drifter', 4, 0, { hp: 30 }); towns.fid = 'rusthaven'; F.assign(towns); extras.push(towns);
      const seq0 = g.eventSeq;
      await shootDead(towns);
      const stripped = !R.office('deputy') && inv.carried.count('tin_star') === 0 && g.events.some((e) => e.seq > seq0 && e.type === 'officeLost' && e.office === 'deputy');
      // The deputy lapses either way: the shots and the killing wear it under its line, and the stars suspend it.
      const lapsed = g.events.some((e) => e.seq > seq0 && (e.type === 'roleSuspended' || e.type === 'roleLost') && e.role === 'deputy') && !R.atLeast('deputy', 'rumoured');
      return noSlack && sworn && star && slack && twoStars && ready && paid && stripped && lapsed ? true
        : JSON.stringify({ noSlack, sworn, star, slack, twoStars, ready, paid: g.cash - cash0, stripped, lapsed, wanted: g.wanted, deputy: R.view('deputy')?.renown });
    } finally { for (const c of extras) if (g.chars.includes(c)) g.removeChar(c); g.wanted = 0; inv.load(sv); g.cash = cash0; R.reset(); }
  });
  await check('roles: Kenji offers a known stunt driver a crowd at Wreck Row; a clean clear at 40 mph pays his $150, and the crowd pays a known stunt driver more than $60', async () => {
    await stage();
    const sv = JSON.parse(JSON.stringify(g.stunts.save())), cash0 = g.cash;
    try {
      g.stunts.cleared = {};
      await C('roles', { id: 'stuntdriver', renown: 50 });
      const t = await C('talk', { id: 'kenji', force: true }), i = has(t, /stunt driver/i);
      if (i >= 0) { const t2 = await C('choose', { index: i }); await C('choose', { index: has(t2, /^Deal/) }); }
      g.dialogue.close();
      const started = R.jobActive('wreck_show');
      const run = await jumpRun({ run: 'wreckrow', speed: 18.2 }); jumpDone();
      const res = run.result ?? {}, clean = res.cleared && res.landing === 'clean', crowd = res.pay > 60;
      const ready = R.jobReady('wreck_show'), cash1 = g.cash;
      const t3 = await C('talk', { id: 'kenji', force: true }), k = has(t3, /Wreck Row, clean/i);
      if (k >= 0) await C('choose', { index: k });
      g.dialogue.close();
      const paid = g.cash === cash1 + 150;
      return started && clean && crowd && ready && paid ? true : JSON.stringify({ started, clean, landing: res.landing, pay: res.pay, ready, paid: g.cash - cash1 });
    } finally { jumpDone(); g.stunts.load(sv); g.cash = cash0; R.reset(); }
  });
  await check('roles: the director sends a known medic somebody bleeding who walks up asking for one, and patching them ends it well; the morning radio names you by your best-known role', async () => {
    await stage();
    const D = g.society.director, inv = g.inventory, sv = JSON.parse(JSON.stringify(inv.save())), seq0 = g.eventSeq;
    // Pacing isn't what this checks (a role call fired earlier on this page leaves a 10-minute cooldown): clear the
    // role call's and put the director's cooldowns back after, as the raid check does.
    const cool0 = { ...D.cool };
    delete D.cool['tpl:role_call'];
    let caller = null;
    try {
      await C('roles', { id: 'medic', renown: 50 });
      const dv = D.view(), offered = dv.eligible.some((e) => e.tpl === 'role_call');
      if (!offered) return JSON.stringify({ offered, blocked: dv.blocked, active: dv.active, cooldowns: dv.cooldowns, alive: g.player.alive, talking: g.dialogue.active, medic: R.view('medic')?.active });
      const r = await C('fireEvent', { tpl: 'role_call' });
      caller = r.ok ? api.findChar(r.spawned?.[0]?.id) : null;
      if (!caller) return JSON.stringify({ offered, fired: r });
      const hurt = caller.hp < caller.maxHp * 0.5 && caller.bleed > 0;
      const dist = () => Math.hypot(caller.x - g.player.x, caller.z - g.player.z), d0 = dist();
      await C('step', { seconds: 3 });
      const walks = dist() < d0 - 2;
      await C('teleport', { x: caller.x + 1.4, z: caller.z }); // meet them (staging), then the real dialogue
      inv.carried.slots = inv.carried.slots.filter((s) => ITEMS[s.id]?.kind !== 'med'); await C('item', { give: 'bandage', n: 1 });
      const t = await C('talk', { id: caller.id }), i = has(t, /patch you up/i);
      if (i >= 0) await C('choose', { index: i });
      g.dialogue.close();
      await C('step', { seconds: 1 });
      const end = g.events.find((e) => e.seq > seq0 && e.type === 'director' && e.tpl === 'role_call' && e.phase === 'end');
      const well = end?.outcome === 'success';
      await C('setTime', { hour: 23.9 }); await C('step', { seconds: 0.3 });
      await C('setTime', { hour: 7 }); await C('step', { seconds: 0.3 }); // the day rolls; dawn has come
      const dg = g.events.find((e) => e.seq > seq0 && e.type === 'radioDigest'), named = !!dg && /patching people up/.test(dg.lines?.[1] ?? '');
      return offered && hurt && walks && well && named ? true : JSON.stringify({ offered, hurt, walks, d0: r1(d0), outcome: end?.outcome ?? null, digest: dg?.lines ?? null });
    } finally { if (caller && g.chars.includes(caller)) g.removeChar(caller); inv.load(sv); await C('setTime', { hour: 12 }); R.reset(); D.cool = cool0; }
  });
  await check('roles: a new role is a data row - registered at runtime, earned by the deed it names (a trade with Mags), read by the faction and the prices it names', async () => {
    await stage();
    const F = g.society.factions, dr = F.index.drifters, cash0 = g.cash;
    try {
      const reg = await C('registerRole', { id: 'selftest_hauler', def: { name: 'Water Hauler', short: 'HAULER', color: '#5b8fa8', tiers: [10, 30, 60], halfLife: 5,
        earn: [{ on: 'deed', verb: 'trade', pts: 12, note: 'water bought' }], opens: { factions: { drifters: { standing: 20 } }, prices: { drifters: 0.8 } } } });
      const t = await C('talk', { id: 'mags', force: true }), i = has(t, /canteen/i);
      if (i >= 0) await C('choose', { index: i });
      g.dialogue.close();
      const v = R.view('selftest_hauler');
      const ok = reg.ok && !reg.warnings?.length && v.tier === 'rumoured' && R.priceMul('drifters') < 1 && F.bias[dr] > 0;
      return ok ? true : JSON.stringify({ reg: reg.ok ? 'ok' : reg.error, warnings: reg.warnings, tier: v?.tier, renown: v?.renown, pm: R.priceMul('drifters'), bias: F.bias[dr] });
    } finally { R.unregister('selftest_hauler'); g.cash = cash0; R.reset(); }
  });
  // Witnesses who run home (systems/witnesses.js), last in the battery: they kill Rust Haven's own, and the chronicle keeps
  // that (four killings of the town on record bar the deputy's office in the role checks above). Staged out at STAGE with Rust Haven's hub moved 30-40 m away, so a
  // run takes seconds, not a minute through the hills; the townsfolk are Rust Haven's by an explicit fid.
  const runHome = async (fn) => {
    const F = g.society.factions, row = F.row('rusthaven'), hub = row.hub;
    try { return await fn(row); } finally { row.hub = hub; g.witnesses.clear(); g.aimOverride = null; }
  };
  const runStage = async (row, hubDx) => {
    await stage();
    row.hub = [g.player.x + hubDx, g.player.z];
    const victim = person('drifter', 4, 0, { hp: 30, fid: 'rusthaven' }), w = person('drifter', -3, 3, { hp: 400, fid: 'rusthaven' });
    w.face = Math.atan2(victim.x - w.x, victim.z - w.z);
    return { victim, w };
  };
  const rhStanding = () => g.society.factions.standing[g.society.factions.index.rusthaven];
  await check('witnesses run home: one who saw a killing runs to their people and the word lands when they get there; kill a runner and it dies with them', async () => runHome(async (row) => {
    let { victim, w } = await runStage(row, -36);
    const s0 = rhStanding(), since = g.eventSeq;
    await shootDead(victim);
    const ran = g.events.some((e) => e.seq > since && e.type === 'witnessRuns' && e.id === w.id);
    const x0 = w.x;
    let arrived = false;
    for (let t = 0; t < 20 && !arrived; t += 0.5) { await C('step', { seconds: 0.5 }); arrived = g.events.some((e) => e.seq > since && e.type === 'wordArrived' && e.id === w.id); }
    await C('step', { seconds: 0.2 });
    const landed = g.events.some((e) => e.seq > since && e.type === 'rumor' && e.witness === w.id && e.verb === 'kill');
    const moved = x0 - w.x, s1 = rhStanding();
    const first = { ran, arrived, landed, moved: +moved.toFixed(1), s0, s1 };
    g.removeChar(w);
    // A second killing, and this time the runner doesn't make it.
    ({ victim, w } = await runStage(row, -40));
    w.hp = 30;
    const s2 = rhStanding(), since2 = g.eventSeq;
    await shootDead(victim);
    const ran2 = !!w.runner;
    await C('step', { seconds: 1 });
    await shootDead(w);
    await C('step', { seconds: 1 });
    const silenced = g.events.some((e) => e.seq > since2 && e.type === 'rumorSilenced' && e.witness === w.id);
    const silence = g.society.chronicle.query({ verb: 'silence', limit: 1 })[0]?.o === w.id;
    const s3 = rhStanding();
    const killLanded = g.events.some((e) => e.seq > since2 && e.type === 'rumor' && e.verb === 'kill');
    const second = { ran2, silenced, silence, s2, s3, killLanded };
    return ran && arrived && landed && moved > 10 && s1 < s0 && ran2 && silenced && silence && Math.abs(s3 - s2) < 0.5 && !killLanded ? true : JSON.stringify({ first, second, runners: g.witnesses.view() });
  }));
  await check('witnesses run home: a gun held on a runner makes most give it up (their word never lands, a threat goes in the book), and cash buys the rest', async () => runHome(async (row) => {
    let { victim, w } = await runStage(row, -60);
    const since = g.eventSeq, rnd = Math.random;
    await shootDead(victim);
    const ran = !!w.runner;
    if (w.runner) w.runner.speed = 1; // a slow runner: the check is the gun, not the chase
    if (Math.hypot(w.x - g.player.x, w.z - g.player.z) > 6) await C('teleport', { x: w.x + 3, z: w.z }); // within the 9 m a gun reads at
    Math.random = () => 0.99; // their nerve fails
    let cowed = false;
    try {
      for (let t = 0; t < 4 && !cowed; t += 0.1) { g.aimOverride = { x: w.x, z: w.z }; await C('step', { seconds: 0.1 }); cowed = g.events.some((e) => e.seq > since && e.type === 'witnessCowed' && e.id === w.id); }
    } finally { Math.random = rnd; g.aimOverride = null; }
    const gaveUp = g.events.some((e) => e.seq > since && e.type === 'rumorSilenced' && e.witness === w.id && e.how === 'cowed');
    const handsUp = w.cowerT > 0, runner = !!w.runner;
    const threat = g.society.chronicle.query({ verb: 'threaten', limit: 1 })[0]?.o === w.id;
    const killLanded = () => g.events.some((e) => e.seq > since && e.type === 'rumor' && e.verb === 'kill');
    await C('step', { seconds: 3 });
    const gun = { ran, cowed, gaveUp, handsUp, runner, threat, killLanded: killLanded() };
    g.removeChar(w);
    // Paid: catch them up and press E.
    ({ victim, w } = await runStage(row, -60));
    const since2 = g.eventSeq;
    await shootDead(victim);
    const ran2 = !!w.runner;
    if (w.runner) w.runner.speed = 0.5;
    const cost = g.witnesses.bribeCost(w);
    g.cash = 500;
    await C('teleport', { x: w.x + 1.2, z: w.z });
    await C('step', { seconds: 0.1 });
    await tapKey('KeyE'); await C('step', { seconds: 0.2 });
    const paid = g.events.some((e) => e.seq > since2 && e.type === 'witnessPaid' && e.id === w.id);
    const cash = g.cash;
    await C('step', { seconds: 3 });
    const bribe = { ran2, cost, paid, cash, runner: !!w.runner, killLanded: g.events.some((e) => e.seq > since2 && e.type === 'rumor' && e.verb === 'kill') };
    g.removeChar(w);
    return ran && cowed && gaveUp && handsUp && !runner && threat && !gun.killLanded && ran2 && paid && cash === 500 - cost && !bribe.runner && !bribe.killLanded ? true : JSON.stringify({ gun, bribe, runners: g.witnesses.view() });
  }));
  await check('save/load round-trip', async () => {
    const sv = (await C('save')).save;
    const cash = g.cash, x = g.player.x;
    await C('give', { cash: 999 }); await C('teleport', { x: 300, z: 300 });
    const r = await C('load', { save: sv });
    return r.ok && g.cash === cash && Math.abs(g.player.x - x) < 0.01 ? true : `cash=${g.cash}/${cash} x=${g.player.x}/${x}`;
  });
  await check('perf budget (< 150 draw calls)', async () => { g.render(0); const p = await C('perf'); return p.drawCalls < 150 ? true : `drawCalls=${p.drawCalls}`; });
  await check('no runtime errors during the battery', async () => (g.errors?.length ? g.errors.map((e) => e.msg).join(' || ').slice(0, 300) : true));
  g.society.director.paused = directorWas;
  await C('god', { on: false });
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, results };
}

// ---- save / load ------------------------------------------------------------------
export function snapshot(g) {
  const p = g.player;
  return {
    v: 1, time: g.sky.time, weather: g.sky.weatherKey, cash: g.cash, wanted: g.wanted,
    inv: JSON.parse(JSON.stringify(g.inv)), quests: JSON.parse(JSON.stringify(g.quests)), stats: { ...g.stats },
    player: { x: p.x, z: p.z, hp: p.hp, face: p.face, vehicle: p.inVehicle?.id ?? null },
    chars: g.chars.filter((c) => c !== p).map((c) => ({ id: c.id, x: c.x, z: c.z, hp: c.hp, alive: c.alive, face: c.face, faction: c.faction, weapon: c.weapon, name: c.name, flag: c.flag, npc: c.npc?.id ?? null, colors: c.colors, vehicle: c.inVehicle?.id ?? null, blood: c.blood, headless: c.headless, runner: c.runner || undefined, zSpeed: c.zSpeed, fid: c.fid ?? undefined })),
    vehicles: g.vehicles.map((v) => ({ id: v.id, type: v.type, x: v.x, z: v.z, h: v.h, hp: v.hp, dead: v.dead, paint: v.paint, ai: v.ai,
      plates: v.plates ? { ...v.plates } : undefined, mounts: v.mounts ? JSON.parse(JSON.stringify(v.mounts)) : undefined })),
    society: g.society.save(), // additive: a save without it loads with fresh standings
    needs: g.survival.save(),
    skills: g.skillsSys.save(),
    stunts: g.stunts.save(), // jump records and which named jumps you have cleared
    inventory: g.inventory.save(), // what you carry, and every container anyone has been through
    interiors: g.interiors.save(), // doors swung, locks kicked in, glass broken, windows boarded (only what changed)
    bases: g.bases.save(), // each base's alert, warnings, and which soldier holds which post
    roles: g.roles.save(), // what the world calls you: renown, tiers, jobs, offices (docs/design/WEB_ROLES.md)
  };
}

export function restore(g, s) {
  if (!s || s.v !== 1) throw new Error('not a save from this engine (v1)');
  g.sky.time = s.time; g.sky.setWeather(s.weather); Object.assign(g.sky.cur, WEATHER[s.weather]);
  g.cash = s.cash; g.wanted = s.wanted; g.inv = JSON.parse(JSON.stringify(s.inv)); g.quests = JSON.parse(JSON.stringify(s.quests)); g.stats = { ...s.stats };
  if (g.player.inVehicle) g.exitVehicle(true);
  g.vehiclesSys.releaseHarpoon();
  // Vehicles: update existing by id, spawn missing ones.
  const vmap = new Map(g.vehicles.map((v) => [v.id, v]));
  for (const sv of s.vehicles) {
    let v = vmap.get(sv.id);
    if (!v) { v = g.vehiclesSys.spawn(sv.type, sv.x, sv.z, sv.h, sv.paint, { ai: sv.ai }); v.id = sv.id; }
    Object.assign(v, { x: sv.x, z: sv.z, h: sv.h, hp: sv.hp, vx: 0, vz: 0, av: 0, ai: sv.ai, driver: null });
    v.plates = sv.plates ? { ...sv.plates } : undefined; v.mounts = sv.mounts ? JSON.parse(JSON.stringify(sv.mounts)) : undefined;
    g.garage.retune(v);
    if (sv.dead && !v.dead) { v.dead = true; v.mesh.material = g.vehiclesSys.wreckMat; }
  }
  // Characters: remove everyone not in the save, update or recreate the rest.
  const keep = new Set(s.chars.map((c) => c.id));
  for (const c of [...g.chars]) if (c !== g.player && !keep.has(c.id)) g.removeChar(c);
  const cmap = new Map(g.chars.map((c) => [c.id, c]));
  for (const sc of s.chars) {
    let c = cmap.get(sc.id);
    if (!c) {
      const npc = sc.npc ? NPCS.find((n) => n.id === sc.npc) : null;
      // The infected come from their own factory: addChar alone left them without zSpeed (NaN walkers).
      c = sc.faction === 'zombie' ? g.zombies.spawn(sc.x, sc.z, !!sc.runner)
        : g.addChar({ x: sc.x, z: sc.z, faction: sc.faction, weapon: sc.weapon, npc, name: sc.name, flag: sc.flag, colors: sc.colors });
      if (!c) continue;
      c.id = sc.id;
      if (sc.faction === 'zombie') { c.name = sc.name ?? c.name; c.flag = sc.flag ?? c.flag; c.colors = sc.colors ?? c.colors; if (sc.zSpeed > 0) c.zSpeed = sc.zSpeed; }
    }
    Object.assign(c, { x: sc.x, z: sc.z, hp: sc.hp, alive: sc.alive, face: sc.face, target: null, grudge: null, flee: 0, inVehicle: null, deadTime: sc.alive ? 0 : 1, blood: sc.blood ?? 0, headless: !!sc.headless, knockT: 0, vault: null, vaultY: 0, sleeping: false, bedY: 0, bed: null, restless: 0 });
    if (sc.fid !== undefined) { c.fid = sc.fid; g.society.factions.assign(c); }
    g.charR.paint(c);
    if (sc.vehicle) { const v = g.vehicles.find((x) => x.id === sc.vehicle); if (v) g.seats.board(c, v, sc.seat ?? 0); }
  }
  const p = g.player;
  Object.assign(p, { x: s.player.x, z: s.player.z, hp: s.player.hp, face: s.player.face, alive: s.player.hp > 0, inVehicle: null, knockT: 0, vault: null, vaultY: 0 });
  p.weapon = g.inv.current;
  if (s.player.vehicle) { const v = g.vehicles.find((x) => x.id === s.player.vehicle); if (v) g.enterVehicle(v); }
  // Id counter must stay ahead of restored ids.
  g.nextId = Math.max(g.nextId, ...s.chars.map((c) => Number(c.id.slice(1)) || 0));
  // The society last: pending rumors find their witnesses by id among the people just restored.
  if (s.society) g.society.load(s.society);
  if (s.needs) g.survival.load(s.needs);
  if (s.skills) g.skillsSys.load(s.skills); else g.skillsSys.recompute(); // the restored inventory has its own weight
  if (s.stunts) g.stunts.load(s.stunts);
  if (s.inventory) g.inventory.load(s.inventory);
  g.inventory.bindAmmo(); // g.inv came back as plain numbers: they become the rounds you carry
  if (s.interiors) g.interiors.load(s.interiors); // an older save leaves the doors and windows as they are
  if (s.bases) g.bases.load(s.bases); // soldiers back on their posts (by id), the alert as it was
  if (s.roles) g.roles.load(s.roles); else g.roles.reset(); // after the pack: an office's star is in it (a save from before roles: none)
  g.camLook.x = p.x; g.camLook.z = p.z;
  return { restored: { chars: s.chars.length, vehicles: s.vehicles.length }, player: { x: +p.x.toFixed(1), z: +p.z.toFixed(1), hp: p.hp } };
}
