// What THE OBSERVER (web/observe.html, docs/design/WEB_OBSERVER.md) sees of a running game, built in the game tab.
// One compact snapshot (feedSnapshot) serves both the observer's push feed (agent/bridge.js, only while somebody is
// watching) and the `observe` command; personDetail is the selected person's card; mapBase/mapTiles are the map's
// ground (the island's own minimap, the streamed chunks' tiles, I-10, towns).
//
// Nothing here runs per frame. A snapshot walks g.chars once (160 at most) and costs ~0.1-0.3 ms.

import { WEAPONS } from '../systems/combat.js';
import { locationName, districtName, HALF } from '../world/city.js';
import { STREAM } from '../data/streaming.js';
import { WINDOW } from '../data/interiors.js';
import { VEHICLES } from '../systems/vehicles.js';
import { WEATHER } from '../systems/sky.js';
import { EVENTS } from '../data/events.js';
import { FLAGS } from '../ui/portrait.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// The colour a character is drawn in: their society faction's row colour, else these (the infected, allies, you).
const FALLBACK = { zombie: '#7d8a6a', ally: '#c9b48a', player: '#f0b429', town: '#d9a441', warden: '#d9a441', drifter: '#9a8a6a', raider: '#b0301e', soldier: '#7a8456' };
export const STATE_CODES = ['idle', 'walking', 'fighting', 'fleeing', 'driving', 'riding', 'asleep', 'downed', 'knocked', 'dead', 'hunting', 'shambling', 'frozen', 'following', 'holding', 'telling', 'working'];

export function factionKey(c) {
  if (c.fid) return c.fid;
  return c.faction === 'zombie' ? 'infected' : c.faction;
}

// The AI's state in one word (ai.js keeps it spread over several fields).
export function aiState(c) {
  if (c.downedT > 0) return 'downed'; // a named person dropped by someone else: alive=false, back up when it runs out
  if (!c.alive) return 'dead';
  if (c.sleeping) return 'asleep';
  if (c.knockT > 0) return 'knocked';
  if (c.inVehicle) return c.inVehicle.driver === c ? 'driving' : 'riding';
  if (c.faction === 'zombie') return c.frozen ? 'frozen' : c.ztarget ? 'hunting' : 'shambling';
  if (c.telling) return 'telling';
  if (c.target) return 'fighting';
  if (c.flee > 0) return 'fleeing';
  if (c.follower) return 'following';
  if (c.hold) return 'holding';
  if (c.res?.where && c.res.where !== 'bed' && c.speed < 0.3) return 'working';
  return c.speed > 0.3 ? 'walking' : 'idle';
}

export function factionTable(g) {
  const out = {};
  for (const v of g.society.factions.view()) out[v.id] = { name: v.name, color: v.color, standing: Math.round(v.standing), reading: Math.round(v.reading), tier: v.tier, hostile: v.hostileToPlayer, wars: v.wars, alliances: v.alliances };
  for (const [k, col] of Object.entries(FALLBACK)) if (!out[k]) out[k] = { name: k === 'ally' ? 'Your people' : k, color: col, standing: null, tier: null, hostile: k === 'raider' || k === 'zombie' };
  return out;
}

function playerCard(g) {
  const p = g.player, v = p.inVehicle, iv = g.inventory.view();
  return {
    id: p.id, x: r1(p.x), z: r1(p.z), face: r2(p.face), hp: Math.round(p.hp), maxHp: p.maxHp, alive: p.alive, stamina: r2(p.stamina ?? 1), crouch: !!p.crouch,
    gy: r1(p.gy ?? 0), floor: p.storey ? g.storeys.levelOf(p.storey, p.gy ?? 0) : 0, inside: !!g.insideBuilding, water: g.lastWet ?? 'dry', flag: p.flag ?? 'US',
    vehicle: v ? { id: v.id, type: v.type, name: v.name, hp: Math.round(v.hp), maxHp: v.maxHp, speed: r1(Math.hypot(v.vx, v.vz)), fuel: v.fuel !== undefined ? r2(v.fuel) : null } : null,
    location: locationName(p.x, p.z), district: districtName(p.x, p.z),
    cash: g.cash, wanted: g.wanted, god: !!g.godMode, kills: g.stats.kills,
    weapon: g.inv.current, mag: g.inv.mag?.[g.inv.current] ?? 0, magSize: WEAPONS[g.inv.current]?.mag ?? 0, ammo: { ...g.inv.ammo }, guns: g.inv.weapons.slice(), throwables: { ...g.inv.throwables },
    needs: g.survival.view(),
    pack: { worn: iv.worn, kg: iv.kg, litres: iv.carried.litres, cap: iv.carried.cap, items: iv.carried.items.map((s) => ({ id: s.id, name: s.name, n: s.n, kg: s.kg, cond: s.cond })) },
    roles: (g.roles.view().held ?? []).map((r) => (typeof r === 'string' ? r : { id: r.id, tier: r.tier, name: r.name ?? r.id })),
  };
}

// The selected person in full: what the AI is doing and to whom, what they carry, what they remember of you.
export function personDetail(api, c) {
  const g = api.g, p = g.player;
  if (!c) return null;
  if (c === p) return { id: p.id, player: true, ...playerCard(g) };
  const fk = factionKey(c), F = g.society.factions, row = F.row(fk);
  const tgt = c.alive ? c.target ?? c.ztarget ?? null : null; // the dead keep a stale target field
  const out = {
    id: c.id, name: c.npc?.name ?? c.name ?? c.id, named: !!c.npc, npcId: c.npc?.id ?? null, essential: !!c.npc?.essential, flag: c.flag ?? 'US',
    faction: fk, kind: c.faction, factionName: row?.name ?? fk, color: row?.color ?? FALLBACK[c.faction] ?? '#9a8a6a',
    alive: c.alive, hp: Math.round(c.hp), maxHp: c.maxHp, state: aiState(c), aiRaw: c.state ?? null, downedFor: c.downedT > 0 ? r1(c.downedT) : 0,
    x: r1(c.x), z: r1(c.z), gy: r1(c.gy ?? 0), face: r2(c.face), speed: r1(c.speed ?? 0), dist: r1(Math.hypot(c.x - p.x, c.z - p.z)),
    location: locationName(c.x, c.z),
    target: tgt ? { id: tgt.id, name: tgt === p ? 'YOU' : tgt.npc?.name ?? tgt.name ?? tgt.id, dist: r1(Math.hypot(tgt.x - c.x, tgt.z - c.z)), x: r1(tgt.x), z: r1(tgt.z) } : null,
    grudge: c.grudge ? (c.grudge === p ? 'YOU' : `${c.grudge.npc?.name ?? c.grudge.name ?? c.grudge.id} (${c.grudge.id})`) : null, lastAttacker: c.lastAttacker ? (c.lastAttacker === p ? 'YOU' : `${c.lastAttacker.npc?.name ?? c.lastAttacker.name ?? c.lastAttacker.id} (${c.lastAttacker.id})`) : null,
    hostileToPlayer: g.ai.hostile(c, p), follower: !!c.follower, vehicle: c.inVehicle?.id ?? null, home: c.home ? { x: r1(c.home.x), z: r1(c.home.z) } : null,
    body: { bleed: r2(c.bleed ?? 0), blood: r2(c.blood ?? 0), headless: !!c.headless, asleep: !!c.sleeping, knocked: c.knockT > 0, flee: r1(c.flee ?? 0) },
    weapon: c.weapon ?? null, weaponName: c.weapon ? WEAPONS[c.weapon]?.name ?? c.weapon : null, mag: c.mag ?? 0, reloading: (c.reloading ?? 0) > 0,
    portrait: c.npc?.portrait ? { ...c.npc.portrait } : { seed: c.slot * 97 + 13, skin: c.colors?.skin, hair: c.colors?.hair, shirt: c.colors?.shirt },
  };
  if (c.faction === 'zombie') out.infected = { runner: !!c.runner, zSpeed: r2(c.zSpeed ?? 0), kind: c.zkind ?? (c.runner ? 'sprinter' : 'shambler'), aura: c.auraMul ?? 1, frozen: !!c.frozen };
  if (c.telling) out.telling = { verb: c.telling.rec?.v ?? c.telling.verb ?? null, hub: c.telling.hub ? { x: r1(c.telling.hub.x), z: r1(c.telling.hub.z) } : null };
  // What they carry: a body's box once they have one, a resident's carried things, else the gun in hand.
  const box = g.inventory.boxes.get(`body:${c.id}`);
  out.inventory = { gun: c.weapon ? `${WEAPONS[c.weapon]?.name ?? c.weapon} (${c.mag ?? 0} in it)` : null, box: box ? g.inventory.boxView(box) : null, carry: null };
  if (c.res) {
    const m = g.residents.memberView(c.res.rec, c.res.m);
    out.household = { id: c.res.rec.id, kind: c.res.rec.kind, name: c.res.rec.name, where: m.where, plan: m.plan ?? null, bed: m.bed, grudge: m.grudge };
    out.inventory.carry = m.carry;
  }
  // The needs the engine keeps for people: only the player has water/food/rest (systems/survival.js). For everyone
  // else the card says what their body and day are doing.
  out.needs = { hp: `${Math.round(c.hp)}/${c.maxHp}`, bleeding: (c.bleed ?? 0) > 0.05, asleep: !!c.sleeping, plan: out.household?.plan ?? null };
  if (c.npc) {
    try { out.memory = g.society.memory.view(c.npc.id); } catch { out.memory = null; }
  } else out.memory = { note: 'only named people keep memories of you; this one reads you by faction standing', standing: row ? Math.round(F.reading(F.index[fk])) : null, tier: row ? F.tiers[F.index[fk]] : null };
  return out;
}

// One frame of the world for the map. want: { since, bbox:[x0,z0,x1,z1], sel:[ids], full:boolean }
export function feedSnapshot(api, want = {}) {
  const g = api.g, p = g.player;
  const chars = [];
  for (const c of g.chars) {
    if (c === p) continue;
    // [id, x, z, face, faction, flag, state, hp, named, name, vehicle, gy, hostile, npcId, targetId]
    const tg = c.target ?? c.ztarget;
    chars.push([c.id, r1(c.x), r1(c.z), r2(c.face), factionKey(c), c.flag ?? '', aiState(c), Math.round(c.hp), c.npc ? 1 : 0, c.npc?.name ?? c.name ?? '', c.inVehicle?.id ?? '', c.gy > 0.5 ? r1(c.gy) : 0, g.ai.hostile(c, p) ? 1 : 0, c.npc?.id ?? '', tg?.id ?? '']);
  }
  // [id, type, x, z, heading, hp%, dead, driver, speed, width, length, name, onFire]
  const vehicles = g.vehicles.map((v) => [v.id, v.type, r1(v.x), r1(v.z), r2(v.h), v.maxHp ? Math.round((v.hp / v.maxHp) * 100) : 100, v.dead ? 1 : 0, v.driver?.id ?? '', r1(Math.hypot(v.vx, v.vz)), r1(v.wid ?? 2), r1(v.len ?? 4.4), v.name ?? v.type, v.onFire > 0 ? 1 : 0]);
  const out = {
    boot: api.bootId, t: r2(g.time), seq: g.eventSeq, paused: !!g.paused, clock: g.sky.clock, hour: r2(g.sky.time), phase: g.sky.phase, weather: g.sky.weatherKey, weatherLabel: g.sky.label, night: r2(g.sky.night),
    day: g.society.day, director: g.society.director.paused ? 'paused' : 'live', fast: !!g.sky.fast,
    player: playerCard(g), chars, vehicles,
    perf: perfLine(g),
    rec: g.recorder ? { on: g.recorder.on, samples: g.recorder.n, id: g.recorder.id, seconds: g.recorder.view().seconds, saved: g.recorder.saved } : null,
  };
  // Doors and windows in the observer's view (the island has ~140 doors; never the whole list when zoomed out).
  const b = want.bbox;
  if (Array.isArray(b) && b.length === 4 && (b[2] - b[0]) * (b[3] - b[1]) < 900 * 900) {
    const inB = (x, z) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];
    out.doors = [];
    for (const d of g.interiors.doors) {
      if (!inB(d.x, d.z)) continue;
      // [id, x, z, locked, leaves: [hx, hz, angle, len]...]
      out.doors.push([d.id, r1(d.x), r1(d.z), d.locked ? 1 : 0, d.leaves.map((L) => [r2(L.hx), r2(L.hz), r2(L.phi0 + L.th), r2(L.len)])]);
    }
    out.windows = [];
    for (const W of g.interiors.windows) if (inB(W.x, W.z)) out.windows.push([W.id, r1(W.x), r1(W.z), W.axis, W.width, W.state === 'intact' && W.hp < WINDOW.hp ? 'cracked' : W.state]);
  }
  if (want.since !== undefined) out.events = g.events.filter((e) => e.seq > want.since);
  if (Array.isArray(want.sel) && want.sel.length) {
    out.detail = {};
    for (const id of want.sel.slice(0, 4)) { const c = api.findChar(id); if (c) out.detail[id] = personDetail(api, c); }
  }
  if (want.full || want.factions) out.factions = factionTable(g);
  out.layouts = [...g.streamer.layouts.keys()];
  return out;
}

export function perfLine(g) {
  const i = g.renderer.info, S = g.streamer, pump = S.pumpStats?.() ?? null;
  return {
    fps: Math.round(g.fps), frameMs: g.fps > 0 ? r2(1000 / g.fps) : null, drawCalls: i.render.calls, triangles: i.render.triangles,
    chars: g.chars.length, alive: g.chars.filter((c) => c.alive).length, vehicles: g.vehicles.length,
    stalls: S.stalls, byCause: { ...S.byCause }, pump, layouts: S.layouts.size, hot: S.hot.size, errors: g.errors?.length ?? 0,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  };
}

// The map's ground: the island's minimap (a 1024 px canvas over |x|,|z| <= HALF), I-10 sampled every 200 m, towns,
// exits, camps, shops, bases. Sent once per observer load.
export function mapBase(g) {
  const W = g.streamer.W, pts = [];
  for (let s = 0; s <= W.cl.L; s += 200) { const f = W.at(s); pts.push([Math.round(f.x), Math.round(f.z)]); }
  return {
    island: { half: HALF, image: g.world.minimap.toDataURL('image/png') }, chunk: STREAM.C,
    i10: pts,
    towns: W.towns.filter((t) => t.built).map((t) => ({ id: t.id, name: t.name, x: r1(t.x), z: r1(t.z) })),
    exits: W.exits.map((X) => ({ id: X.id, number: X.number, name: X.name, x: r1(X.x), z: r1(X.z) })),
    camps: g.world.spawns.camps.map((c) => ({ x: c.x, z: c.z })),
    shops: g.world.spawns.shops.filter((b) => b.shopName).map((b) => ({ name: b.shopName, x: r1((b.minX + b.maxX) / 2), z: r1((b.minZ + b.maxZ) / 2) })),
    bases: g.bases.sites.map((s) => ({ id: s.id, name: s.name, fence: { ...s.fence } })),
    // What the control modals offer (the same tables the commands validate against).
    catalog: {
      weapons: Object.entries(WEAPONS).map(([k, w]) => ({ id: k, name: w.name ?? k })),
      vehicles: Object.entries(VEHICLES).map(([k, v]) => ({ id: k, name: v.name ?? k })),
      weather: Object.entries(WEATHER).map(([k, w]) => ({ id: k, label: w.label ?? k })),
      events: Object.keys(EVENTS),
      hunters: g.society.factions.ids.filter((id) => g.society.factions.row(id)?.hunters),
      flags: Object.keys(FLAGS),
      spawn: ['raider', 'drifter', 'warden', 'soldier', 'zombie'],
      ammo: ['pistol', 'smg', 'shells', 'rifle'],
      throwables: ['frag', 'molotov', 'smoke', 'flash', 'pipe', 'sticky'],
    },
  };
}

// Streamed chunks' minimap tiles (128 px over 256 m) by key "cx,cz", for those laid out right now.
export function mapTiles(g, keys) {
  const out = {};
  for (const k of keys ?? []) {
    const L = g.streamer.layouts.get(k);
    if (L?.mm) out[k] = L.mm.toDataURL('image/png');
  }
  return out;
}
