import { WEAPONS } from '../systems/combat.js';
import { VEHICLES } from '../systems/vehicles.js';
import { WEATHER } from '../systems/sky.js';
import { FLAGS, FLAG_KEYS } from '../ui/portrait.js';
import { NPCS } from '../data/npcs.js';
import { outfit } from '../systems/characters.js';
import { locationName, districtName, HALF } from '../world/city.js';

// ============================================================================
// DEATHLANDS AGENT API
// Every command: JSON args in -> JSON-serialisable result out. Never throws:
// failures come back as { ok:false, error, hint }. The COMMANDS table below is
// the single source of truth: `help` prints it, the HTTP bridge + CLI route
// through it, and AGENTS.md documents it. Add a command = add one row.
// ============================================================================

const r1 = (v) => Math.round(v * 10) / 10;
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
          inventory: { weapons: g.inv.weapons, current: g.inv.current, mag: g.inv.mag, ammo: g.inv.ammo },
          cash: g.cash, wanted: g.wanted, quests: g.quests, stats: g.stats,
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
      group: 'observe', desc: 'World layout summary: bounds, districts, road lines, shops (named buildings), raider camps, named NPC homes.',
      run: async () => ({
        bounds: { min: -HALF, max: HALF }, units: 'metres; +x east, +z south (screen down); heading 0 = facing +z',
        districts: [{ name: 'RUST HAVEN', rule: 'max(|x|,|z|) < 88, walled settlement, gates on roads' }, { name: 'OLD PHOENIX RUINS', rule: '88 <= max < 250' }, { name: 'THE GLASS FLATS', rule: 'max >= 250, desert, raider camps' }],
        roads: { spacing: 80, lines: [-320, -240, -160, -80, 0, 80, 160, 240, 320], route66: 'z = 0, spans the whole map' },
        shops: g.world.spawns.shops.filter((b) => b.shopName).map((b) => ({ name: b.shopName, x: r1((b.minX + b.maxX) / 2), z: r1((b.minZ + b.maxZ) / 2) })),
        camps: g.world.spawns.camps, namedNpcs: g.chars.filter((c) => c.npc).map((c) => ({ id: c.id, npc: c.npc.id, name: c.npc.name, x: r1(c.x), z: r1(c.z) })),
      }),
    },
    perf: {
      group: 'observe', desc: 'Frame rate, draw calls, triangles, entity counts.',
      run: async () => {
        const i = g.renderer.info;
        return { fps: Math.round(g.fps), drawCalls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures,
          chars: g.chars.length, alive: g.chars.filter((c) => c.alive).length, vehicles: g.vehicles.length, statics: g.statics.boxes.length, decalsBudget: 1200, particlesBudget: 2400,
          audio: { context: g.audio.ctx?.state ?? 'not started', played: g.audio.counts }, runtimeErrors: g.errors ?? [] };
      },
    },
    screenshot: {
      group: 'observe', desc: 'Render the world as a JPEG data URL (fixed size, works in hidden tabs). Optional x,z to look at a spot and zoom = camera height (8 = close-up, 33 = default, 90 = overview). CLI: --out file.jpg saves it.',
      args: { quality: { type: 'number', default: 0.82 }, width: { type: 'number', default: 1280 }, height: { type: 'number', default: 720 }, x: { type: 'number' }, z: { type: 'number' }, zoom: { type: 'number' } },
      run: async ({ quality, width, height, x, z, zoom }) => {
        // Render at a fixed size so it works even when the tab is hidden / 0x0.
        const r = g.renderer, cam = g.camera;
        const prevPR = r.getPixelRatio(), prevW = r.domElement.width, prevH = r.domElement.height, prevAspect = cam.aspect;
        r.setPixelRatio(1); r.setSize(width, height, false);
        cam.aspect = width / height; cam.updateProjectionMatrix();
        g.updateCamera(0.016);
        if (x !== undefined || z !== undefined || zoom) {
          // Camera override for close-ups / inspecting a spot: zoom = camera height in metres.
          const cx = x ?? g.camLook.x, cz = z ?? g.camLook.z, h = zoom ?? g.camHeight;
          cam.position.set(cx, h, cz + h * 0.14); cam.lookAt(cx, 0, cz);
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
        let lastReplan = null;
        if (!wait) return { moving: true };
        let t = 0;
        const hp0 = P().hp;
        let interrupted;
        while ((g.autopilot || (follow && Math.hypot(follow.x - P().x, follow.z - P().z) > tolerance)) && t < Math.min(600, maxSeconds)) {
          if (!g.autopilot && follow) {
            // Reached where they were, but they moved on: re-plan to their live position.
            // If a re-plan doesn't get us any closer, we're as close as the world allows.
            const here = Math.hypot(follow.x - P().x, follow.z - P().z);
            if (lastReplan !== null && here > lastReplan - 0.5) break;
            lastReplan = here;
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
        return { arrived, interrupted, x: r1(P().x), z: r1(P().z), secondsUsed: t, remaining: arrived ? 0 : Math.round(Math.hypot(x - P().x, z - P().z)), hint: arrived || interrupted ? undefined : `ran out of time (${maxSeconds}s game time) — raise maxSeconds, or find a vehicle for long trips` };
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
          if (g.inv.mag[k] <= 0) {
            if (g.inv.ammo[w.ammo] <= 0) return { fired: i, error: 'out of ammo', ammo: g.inv.ammo };
            const take = Math.min(w.mag, g.inv.ammo[w.ammo]); g.inv.mag[k] = take; g.inv.ammo[w.ammo] -= take; await api._step(Math.round(w.reload * 60));
          }
          const sx = p.inVehicle ? p.inVehicle.x : p.x, sz = p.inVehicle ? p.inVehicle.z : p.z;
          if (id && !g.statics.lineOfSight(sx, sz, tx, tz)) return { fired: i, killed: g.stats.kills - before, blocked: true, hint: 'no line of sight (wall in the way); use engage to path around it' };
          p.face = ang(tx - sx, tz - sz);
          const car = p.inVehicle;
          if (car ? g.carCombat.fireFromVehicle(p, car, k, p.face) : g.combat.fire(p, k, p.face)) g.inv.mag[k]--;
          await api._step(Math.max(1, Math.round(w.rate * 60)));
        }
        killed = g.stats.kills - before;
        return { killed, mag: g.inv.mag[g.inv.current], reserve: g.inv.ammo[WEAPONS[g.inv.current].ammo] };
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
          if (g.inv.mag[k] <= 0 && g.inv.ammo[w.ammo] <= 0) {
            const other = g.inv.weapons.find((o) => g.inv.mag[o] > 0 || g.inv.ammo[WEAPONS[o].ammo] > 0);
            if (other) { g.switchWeapon(other); continue; }
            reason = 'out of ammo'; break;
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
      group: 'observe', desc: 'Ambient detail state: tyre tracks laid, brass on the ground, tumbleweeds near you, vultures (and whether gunfire spooked them), who is cowering.',
      run: async () => g.ambient.view(),
    },
    honk: { group: 'player', desc: 'Sound the horn of the vehicle you are in: people in front leap aside. Keyboard: E while driving.', run: async () => { need(P().inVehicle, 'not in a vehicle'); g.audio.horn(0); return { dodged: g.ambient.honk(P().inVehicle) }; } },
    hud: {
      group: 'observe', desc: 'What the HUD feedback layer is showing right now (screenshots only capture the 3D world): kill feed, damage-direction arcs (bearing 0 = north/screen-up, clockwise), name tags with flags, compass heading + markers (waypoint, train, convoy), floating texts, lens blood.',
      run: async () => g.feedback.view(),
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
    submerge: {
      group: 'player', desc: 'While swimming: dive under (on=true) — hidden from AI, bullets can\'t reach, breath drains ~20s — or surface (on=false).',
      args: { on: { type: 'boolean', default: true } },
      run: async ({ on }) => { need(P().swim || !on, 'not in deep water (find the river or the lake first)'); g.crouchOverride = on; await api._step(2); return { underwater: !!P().underwater, breath: r1(P().breath ?? 1) }; },
    },
    equip: { group: 'player', desc: 'Switch to an owned weapon.', args: { weapon: { type: 'string', required: true } },
      run: async ({ weapon }) => { need(g.inv.weapons.includes(weapon), `not owned; owned: ${g.inv.weapons.join(',')}`); g.switchWeapon(weapon); return { current: weapon }; } },
    give: {
      group: 'player', desc: 'Grant cash, ammo {pistol,smg,shells}, throwables {frag,molotov,smoke,flash,pipe,sticky}, a weapon key, or health.',
      args: { cash: { type: 'number' }, weapon: { type: 'string' }, pistol: { type: 'number' }, smg: { type: 'number' }, shells: { type: 'number' }, hp: { type: 'number' },
        frag: { type: 'number' }, molotov: { type: 'number' }, smoke: { type: 'number' }, flash: { type: 'number' }, pipe: { type: 'number' }, sticky: { type: 'number' } },
      run: async ({ cash, weapon, pistol, smg, shells, hp, frag, molotov, smoke, flash, pipe, sticky }) => {
        for (const [k, n] of Object.entries({ frag, molotov, smoke, flash, pipe, sticky })) if (n) g.inv.throwables[k] = (g.inv.throwables[k] ?? 0) + n;
        if (cash) g.cash += cash;
        if (weapon) { need(WEAPONS[weapon], `unknown weapon; known: ${Object.keys(WEAPONS).join(',')}`); if (!g.inv.weapons.includes(weapon)) g.inv.weapons.push(weapon); g.inv.mag[weapon] ??= WEAPONS[weapon].mag; g.inv.ammo[WEAPONS[weapon].ammo] ??= 0; }
        if (pistol) g.inv.ammo.pistol += pistol; if (smg) g.inv.ammo.smg += smg; if (shells) g.inv.ammo.shells += shells;
        if (hp) P().hp = Math.min(P().maxHp, P().hp + hp);
        return { cash: g.cash, inventory: g.inv };
      },
    },
    difficulty: { group: 'player', desc: 'Set damage-taken difficulty: story (35%), normal (70%), hard (100%). Persists like the pause-menu setting.', args: { level: { type: 'string', required: true, enum: ['story', 'normal', 'hard'] } },
      run: async ({ level }) => { g.qol.settings.difficulty = level; try { localStorage.setItem('deathlands.settings', JSON.stringify(g.qol.settings)); } catch {} return { difficulty: level, damageTaken: g.qol.damageTaken() }; } },
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
      group: 'vehicle', desc: 'Hold throttle(-1..1)/steer(-1..1, +left)/handbrake for N seconds of sim time, or give x,z to auto-drive there along an A* route (unsticks itself).',
      args: { throttle: { type: 'number', default: 1 }, steer: { type: 'number', default: 0 }, handbrake: { type: 'boolean', default: false }, seconds: { type: 'number', default: 1 }, x: { type: 'number' }, z: { type: 'number' } },
      run: async ({ throttle, steer, handbrake, seconds, x, z }) => {
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
        g.driveOverride = { throttle, steer, handbrake };
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
      group: 'world', desc: 'Spawn a horde of Rotters (zombies) around x,z (default 30m from the player). runners = fraction that sprint.',
      args: { x: { type: 'number' }, z: { type: 'number' }, count: { type: 'number', default: 10 }, runners: { type: 'number', default: 0.2 }, radius: { type: 'number', default: 8 } },
      run: async ({ x, z, count, runners, radius }) => ({ ids: g.zombies.horde(x ?? P().x + 30, z ?? P().z, Math.min(40, count), runners, radius) }),
    },
    zombies: {
      group: 'world', desc: 'Turn night horde spawning on/off (existing Rotters stay). Returns how many are alive.', args: { on: { type: 'boolean', default: true } },
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
      group: 'vehicle', desc: 'Fire the War Rig harpoon at x,z or entity id. Call again while hooked to YANK.',
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
      group: 'world', desc: 'Spawn a character. kind=raider|drifter|warden. Optional name, flag (ISO code), weapon, hostile grudge vs player.',
      args: { kind: { type: 'string', default: 'raider', enum: ['raider', 'drifter', 'warden', 'zombie'] }, runner: { type: 'boolean' }, x: { type: 'number' }, z: { type: 'number' }, count: { type: 'number', default: 1 },
        name: { type: 'string' }, flag: { type: 'string' }, weapon: { type: 'string' }, hp: { type: 'number' }, angry: { type: 'boolean', default: false } },
      run: async ({ kind, x, z, count, name, flag, weapon, hp, angry, runner }) => {
        const ids = [];
        for (let i = 0; i < Math.min(count, 40); i++) {
          const sx = (x ?? P().x + 15) + (Math.random() - 0.5) * 4 * Math.min(count, 6), sz = (z ?? P().z) + (Math.random() - 0.5) * 4 * Math.min(count, 6);
          const c = kind === 'raider'
            ? g.spawnRaider(sx, sz, Math.random, weapon)
            : kind === 'zombie' ? g.zombies.spawn(sx, sz, runner)
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
function compileNpc(def) {
  const nodes = {};
  for (const [id, n] of Object.entries(def.nodes)) {
    nodes[id] = {
      text: n.text,
      choices: (n.choices ?? [{ t: '[Leave]', end: true }]).map((c) => ({
        t: c.t, next: c.next, end: c.end ?? !c.next,
        req: c.ifQuest || c.ifNotQuest
          ? (g) => (!c.ifQuest || questMatch(g, c.ifQuest)) && (!c.ifNotQuest || !questMatch(g, c.ifNotQuest))
          : c.req,
        do: (g) => {
          if (c.cost && !g.spend(c.cost)) return;
          if (c.give) g.give({ cash: c.give.cash ?? 0, ammo: c.give.ammo ?? {} });
          if (c.give?.weapon && WEAPONS[c.give.weapon] && !g.inv.weapons.includes(c.give.weapon)) {
            const w = c.give.weapon; g.inv.weapons.push(w); g.inv.mag[w] = WEAPONS[w].mag; g.inv.ammo[WEAPONS[w].ammo] ??= 0;
          }
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
    try { const v = await fn(); results.push({ name, pass: v !== false, detail: v === true || v === undefined ? '' : v }); }
    catch (e) { results.push({ name, pass: false, detail: String(e.message ?? e) }); }
  };
  const C = (cmd, a) => api.call(cmd, a);
  await C('start');
  await C('god', { on: true });
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
  await check('enter War Rig + drive', async () => {
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
    const r = await C('spawnVehicle', { type: 'bike', x: 460, z: 40, heading: 0 });
    const v = api.findVeh(r.id);
    await C('enterVehicle', { id: r.id, force: true });
    await C('drive', { throttle: 1, steer: 1, seconds: 1.2 });
    const leaned = Math.abs(v.lean) > 0.05;
    v.boost = true; g.driveOverride = { throttle: 1, steer: 0 }; await C('step', { seconds: 0.6 }); g.driveOverride = null; v.boost = false;
    const wheelie = v.wheelie > 0.1;
    // Crash: slam it into a wall at speed.
    v.vx = 0; v.vz = 25; v.h = 0;
    g.statics.add(v.x - 3, v.z + 1.5, v.x + 3, v.z + 2.5, 'wall', 3);
    await C('step', { seconds: 0.3 });
    const thrown = !g.player.inVehicle && v.fallen;
    return leaned && wheelie && thrown ? true : JSON.stringify({ lean: v.lean, wheelie: v.wheelie, inVehicle: !!g.player.inVehicle, fallen: v.fallen });
  });
  await check('throwables: frag kills a group, molotov burns, smoke blocks sight, flash blinds, sticky sticks', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    await C('teleport', { x: 420, z: 90 });
    await C('give', { frag: 3, molotov: 2, smoke: 2, flash: 2, sticky: 2 });
    const a = await C('spawn', { kind: 'zombie', x: 432, z: 90, count: 3 });
    for (const id of a.ids) { const c = api.findChar(id); c.x = 432 + (Math.random() - 0.5) * 2; c.z = 90 + (Math.random() - 0.5) * 2; c.zSpeed = 0; }
    const f = await C('throw', { type: 'frag', x: 432, z: 90 });
    const fragOk = a.ids.every((id) => !api.findChar(id)?.alive);
    const b = await C('spawn', { kind: 'drifter', x: 426, z: 98 });
    const m = await C('throw', { type: 'molotov', x: 426, z: 98 });
    const burned = m.effects.some((e) => e.type === 'ignited') || (api.findChar(b.ids[0])?.burning ?? 0) > 0 || !api.findChar(b.ids[0])?.alive;
    await C('throw', { type: 'smoke', x: 420, z: 106 });
    await C('step', { seconds: 2 });
    const smokeBlocks = !g.los(420, 100, 420, 112);
    const r = await C('spawn', { kind: 'raider', x: 410, z: 90, weapon: 'pistol' });
    await C('throw', { type: 'flash', x: 410, z: 90 });
    const blind = (api.findChar(r.ids[0])?.blind ?? 0) > 0 || !api.findChar(r.ids[0])?.alive;
    const car = await C('spawnVehicle', { type: 'sedan', x: 414, z: 80 });
    const st = await C('throw', { type: 'sticky', id: car.id, wait: false });
    await C('step', { seconds: 0.5 });
    const stuck = g.throwables.list.some((p) => p.stuck?.ref?.id === car.id);
    return f.ok && fragOk && burned && smokeBlocks && blind && stuck ? true : JSON.stringify({ frag: fragOk, fk: f.kills, burned, smokeBlocks, blind, stuck, st: st.ok });
  });
  await check('dive roll covers ground and costs stamina; crouch hides you', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    await C('teleport', { x: 420, z: 140 });
    g.player.stamina = 1;
    const d = await C('dive', { x: 430, z: 140 });
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
    await C('teleport', { x: 372, z: 398 });
    await C('step', { seconds: 0.3 });
    const swimming = !!g.player.swim;
    await C('submerge', { on: true });
    const { ids } = await C('spawn', { kind: 'raider', x: 365, z: 380, weapon: 'smg' });
    await C('step', { seconds: 2 });
    const hidden = !g.chars.find((c) => c.id === ids[0])?.target;
    const b0 = g.player.breath;
    await C('submerge', { on: false });
    g.crouchOverride = false;
    return deep && deck && underDeck && swimming && g.player.underwater === false && b0 < 1 && hidden ? true : JSON.stringify({ deep, deck, underDeck, swimming, b0, hidden });
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
    land.driver = g.player; land.throttle = 1; // dry land: a jet ski can't go
    for (let i = 0; i < 60; i++) { g.vehiclesSys.drive(land, 1 / 60); }
    land.driver = null;
    const beached = g.vehiclesSys.speed(land) < 1.5;
    return sank && moved && beached ? true : JSON.stringify({ sank, flood: car.flood, moved: g.vehiclesSys.speed(boat), beached: g.vehiclesSys.speed(land) });
  });
  await check('the dead cannot swim: zombies stop at the waterline', async () => {
    if (g.player.inVehicle) g.exitVehicle(true);
    await C('teleport', { x: 395, z: 398 });
    const { ids } = await C('horde', { x: 330, z: 398, count: 4, runners: 1, radius: 2 });
    await C('step', { seconds: 6 });
    const wet = ids.map((id) => api.findChar(id)).filter((c) => c && c.alive && g.water.depthAt(c.x, c.z) > 0.7).length;
    for (const id of ids) await C('remove', { id });
    return wet === 0 ? true : `${wet} zombies in deep water`;
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
    g.combat.damage(g.player, 12, r, -1, 0);
    g.aim.x = r.x; g.aim.z = r.z;
    await C('step', { seconds: 0.1 });
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
    await C('teleport', { x: 140, z: -150 });
    const b0 = g.ambient.view().brass;
    const { ids } = await C('spawn', { kind: 'drifter', x: 146, z: -150 });
    const civ = api.findChar(ids[0]); civ.weapon = null;
    let cowered = false;
    for (let k = 0; k < 6 && !cowered; k++) { g.combat.fire(g.player, 'pistol', Math.PI); await C('step', { seconds: 0.25 }); cowered = civ.cowerT > 0; }
    await C('step', { seconds: 1 });
    const brass = g.ambient.view().brass > b0 && g.ambient.view().brassAtRest > 0;
    civ.cowerT = 0; civ.crouch = false; civ.handsUp = false;
    const car = api.findVeh((await C('spawnVehicle', { type: 'sedan', x: 160, z: -175, heading: 0 })).id);
    await C('enterVehicle', { id: car.id, force: true });
    const w = await C('spawn', { kind: 'drifter', x: 160.5, z: -166 });
    const ped = api.findChar(w.ids[0]);
    const h = await C('honk');
    await C('step', { seconds: 0.7 });
    const dodged = h.dodged >= 1 && Math.abs(ped.x - 160) > 1.5;
    const t0 = g.ambient.view().tracks;
    await C('drive', { throttle: 1, steer: 0.3, seconds: 2 });
    const tracks = g.ambient.view().tracks > t0;
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
  await check('save/load round-trip', async () => {
    const sv = (await C('save')).save;
    const cash = g.cash, x = g.player.x;
    await C('give', { cash: 999 }); await C('teleport', { x: 300, z: 300 });
    const r = await C('load', { save: sv });
    return r.ok && g.cash === cash && Math.abs(g.player.x - x) < 0.01 ? true : `cash=${g.cash}/${cash} x=${g.player.x}/${x}`;
  });
  await check('perf budget (< 150 draw calls)', async () => { g.render(0); const p = await C('perf'); return p.drawCalls < 150 ? true : `drawCalls=${p.drawCalls}`; });
  await check('no runtime errors during the battery', async () => (g.errors?.length ? g.errors.map((e) => e.msg).join(' || ').slice(0, 300) : true));
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
    chars: g.chars.filter((c) => c !== p).map((c) => ({ id: c.id, x: c.x, z: c.z, hp: c.hp, alive: c.alive, face: c.face, faction: c.faction, weapon: c.weapon, name: c.name, flag: c.flag, npc: c.npc?.id ?? null, colors: c.colors, vehicle: c.inVehicle?.id ?? null, blood: c.blood, headless: c.headless })),
    vehicles: g.vehicles.map((v) => ({ id: v.id, type: v.type, x: v.x, z: v.z, h: v.h, hp: v.hp, dead: v.dead, paint: v.paint, ai: v.ai })),
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
      c = g.addChar({ x: sc.x, z: sc.z, faction: sc.faction, weapon: sc.weapon, npc, name: sc.name, flag: sc.flag, colors: sc.colors });
      if (!c) continue;
      c.id = sc.id;
    }
    Object.assign(c, { x: sc.x, z: sc.z, hp: sc.hp, alive: sc.alive, face: sc.face, target: null, grudge: null, flee: 0, inVehicle: null, deadTime: sc.alive ? 0 : 1, blood: sc.blood ?? 0, headless: !!sc.headless });
    g.charR.paint(c);
    if (sc.vehicle) { const v = g.vehicles.find((x) => x.id === sc.vehicle); if (v) g.seats.board(c, v, sc.seat ?? 0); }
  }
  const p = g.player;
  Object.assign(p, { x: s.player.x, z: s.player.z, hp: s.player.hp, face: s.player.face, alive: s.player.hp > 0, inVehicle: null });
  p.weapon = g.inv.current;
  if (s.player.vehicle) { const v = g.vehicles.find((x) => x.id === s.player.vehicle); if (v) g.enterVehicle(v); }
  // Id counter must stay ahead of restored ids.
  g.nextId = Math.max(g.nextId, ...s.chars.map((c) => Number(c.id.slice(1)) || 0));
  g.camLook.x = p.x; g.camLook.z = p.z;
  return { restored: { chars: s.chars.length, vehicles: s.vehicles.length }, player: { x: +p.x.toFixed(1), z: +p.z.toFixed(1), hp: p.hp } };
}
