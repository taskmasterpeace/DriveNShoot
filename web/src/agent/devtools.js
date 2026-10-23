// Dev tools as COMMANDS rows (docs/design/WEB_OBSERVER.md): the observer's reads (observe, person, mapBase, mapTiles),
// one control the table lacked (heal), the recorder (record, session, replay) and the three agent multipliers
// (look, snap + diff, watch). buildCommands() in api.js spreads these into COMMANDS, so `help`, the CLI, the MCP
// tools and docs/COMMANDS.md see them like any other row.

import * as THREE from 'three';
import { feedSnapshot, personDetail, mapBase, mapTiles, factionTable, aiState, factionKey, perfLine } from './observe.js';
import { parseSession, sessionAt, heatmap, HEAT_LAYERS, REC, FLAG, KEYS } from './recorder.js';
import { locationName, districtName } from '../world/city.js';
import { WEAPONS } from '../systems/combat.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const list = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v.map(String) : String(v).split(',').map((s) => s.trim()).filter(Boolean));
const _v = new THREE.Vector3();
const DEV = !!import.meta.env?.DEV;

// Events worth a line in a diff (the rest are only counted).
const NOTABLE = new Set(['kill', 'downed', 'deed', 'director', 'trade', 'roleTier', 'residentDied', 'witnessRuns', 'rumor', 'vendetta', 'questComplete', 'jobPaid', 'respawn', 'baseAlarm', 'error', 'playerDied', 'enterVehicle', 'exitVehicle', 'stole']);

export function devtoolsCommands(api, need) {
  const g = api.g;
  const P = () => g.player;
  api.bootId ??= `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  api._snaps ??= new Map();
  api._sessions ??= new Map();

  const fetchJson = async (url, body) => {
    need(DEV, 'the session store lives on the dev server (npm run dev / npm run agent); a production build has no disk');
    const r = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
    const j = await r.json().catch(() => null);
    need(r.ok && j, `${url}: HTTP ${r.status}${j?.error ? ` - ${j.error}` : ''}`);
    return j;
  };
  const loadSession = async (id) => {
    if (!id || id === 'live') { need(g.recorder?.n > 1, 'the recorder has fewer than two samples (record on=true, then let time run)'); return parseSession(g.recorder.session()); }
    if (api._sessions.has(id)) return api._sessions.get(id);
    const S = parseSession(await fetchJson(`/agent/session?id=${encodeURIComponent(id)}`));
    api._sessions.set(id, S);
    if (api._sessions.size > 4) api._sessions.delete(api._sessions.keys().next().value);
    return S;
  };
  const decodeFlags = (f) => Object.entries(FLAG).filter(([, b]) => f & b).map(([k]) => k);
  const decodeKeys = (f) => Object.entries(KEYS).filter(([, b]) => f & b).map(([k]) => k.replace(/^Key/, ''));

  // ---- snapshots for diff -----------------------------------------------------------------------------------------
  const takeSnap = () => {
    const p = P(), F = g.society.factions;
    const chars = {};
    for (const c of g.chars) if (c !== p) chars[c.id] = { x: c.x, z: c.z, hp: Math.round(c.hp), alive: c.alive, state: aiState(c), f: factionKey(c), name: c.npc?.name ?? c.name ?? c.id, veh: c.inVehicle?.id ?? null };
    const vehicles = {};
    for (const v of g.vehicles) vehicles[v.id] = { x: v.x, z: v.z, hp: Math.round(v.hp), dead: !!v.dead, driver: v.driver?.id ?? null, type: v.type };
    const items = {};
    for (const s of g.inventory.carried.slots) items[s.id] = (items[s.id] ?? 0) + s.n;
    const doors = {};
    for (const d of g.interiors.doors) { let a = 0; for (const L of d.leaves) a = Math.max(a, Math.abs(L.th)); doors[d.id] = `${d.locked ? 'locked' : a < 0.12 ? 'closed' : a < 1.2 ? 'ajar' : 'open'}`; }
    const windows = {};
    for (const W of g.interiors.windows) windows[W.id] = W.state;
    return {
      at: { t: r2(g.time), clock: g.sky.clock, day: g.society.day, seq: g.eventSeq, wall: Date.now() },
      player: { x: p.x, z: p.z, hp: Math.round(p.hp), alive: p.alive, cash: g.cash, wanted: g.wanted, vehicle: p.inVehicle?.id ?? null, weapon: g.inv.current, guns: g.inv.weapons.slice(), kills: g.stats.kills, location: locationName(p.x, p.z) },
      items, chars, vehicles, doors, windows,
      standing: Object.fromEntries(F.ids.map((id, i) => [id, Math.round(F.standing[i])])),
      roles: Object.fromEntries((g.roles.view().held ?? []).map((r) => [r.id, r.tier])),
      quests: JSON.parse(JSON.stringify(g.quests)), weather: g.sky.weatherKey,
    };
  };
  const diffSnaps = (A, B, moved, limit) => {
    const out = { from: A.at, to: B.at, seconds: r2(B.at.t - A.at.t) };
    const pl = {};
    for (const k of ['hp', 'alive', 'cash', 'wanted', 'vehicle', 'weapon', 'kills', 'location']) if (A.player[k] !== B.player[k]) pl[k] = [A.player[k], B.player[k]];
    const pm = Math.hypot(B.player.x - A.player.x, B.player.z - A.player.z);
    if (pm > 0.05) pl.moved = r1(pm);
    if (A.player.guns.join() !== B.player.guns.join()) pl.guns = [A.player.guns, B.player.guns];
    out.player = pl;
    const items = {};
    for (const k of new Set([...Object.keys(A.items), ...Object.keys(B.items)])) if ((A.items[k] ?? 0) !== (B.items[k] ?? 0)) items[k] = (B.items[k] ?? 0) - (A.items[k] ?? 0);
    out.items = items;
    const died = [], spawned = [], gone = [], hurt = [], healed = [], mv = [], changed = [];
    for (const [id, b] of Object.entries(B.chars)) {
      const a = A.chars[id];
      if (!a) { spawned.push({ id, name: b.name, faction: b.f, x: r1(b.x), z: r1(b.z), state: b.state }); continue; }
      if (a.alive && !b.alive) died.push({ id, name: b.name, faction: b.f, x: r1(b.x), z: r1(b.z) });
      else if (b.hp < a.hp) hurt.push({ id, name: b.name, hp: [a.hp, b.hp] });
      else if (b.hp > a.hp) healed.push({ id, name: b.name, hp: [a.hp, b.hp] });
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d >= moved) mv.push({ id, name: b.name, m: r1(d), to: [r1(b.x), r1(b.z)] });
      if (a.state !== b.state && b.alive) changed.push({ id, name: b.name, state: [a.state, b.state] });
    }
    for (const [id, a] of Object.entries(A.chars)) if (!B.chars[id]) gone.push({ id, name: a.name, faction: a.f });
    mv.sort((a, b) => b.m - a.m);
    const cap = (arr) => (arr.length > limit ? [...arr.slice(0, limit), { more: arr.length - limit }] : arr);
    out.people = { died: cap(died), spawned: cap(spawned), removed: cap(gone), hurt: cap(hurt), healed: cap(healed), moved: cap(mv), stateChanged: cap(changed) };
    const vd = [];
    for (const [id, b] of Object.entries(B.vehicles)) {
      const a = A.vehicles[id];
      if (!a) { vd.push({ id, type: b.type, spawned: true }); continue; }
      const e = {};
      if (a.hp !== b.hp) e.hp = [a.hp, b.hp];
      if (a.dead !== b.dead) e.dead = b.dead;
      if (a.driver !== b.driver) e.driver = [a.driver, b.driver];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d >= moved) e.moved = r1(d);
      if (Object.keys(e).length) vd.push({ id, type: b.type, ...e });
    }
    for (const id of Object.keys(A.vehicles)) if (!B.vehicles[id]) vd.push({ id, removed: true });
    out.vehicles = cap(vd);
    const dd = [];
    for (const [id, s] of Object.entries(B.doors)) if (A.doors[id] !== s) dd.push({ id, from: A.doors[id], to: s });
    for (const [id, s] of Object.entries(B.windows)) if (A.windows[id] !== s) dd.push({ id, window: true, from: A.windows[id], to: s });
    out.doorsAndWindows = cap(dd);
    const st = {};
    for (const k of Object.keys(B.standing)) if (A.standing[k] !== B.standing[k]) st[k] = [A.standing[k], B.standing[k]];
    out.standing = st;
    const rl = {};
    for (const k of new Set([...Object.keys(A.roles), ...Object.keys(B.roles)])) if (A.roles[k] !== B.roles[k]) rl[k] = [A.roles[k] ?? 'none', B.roles[k] ?? 'none'];
    out.roles = rl;
    const q = {};
    for (const k of new Set([...Object.keys(A.quests), ...Object.keys(B.quests)])) if (JSON.stringify(A.quests[k]) !== JSON.stringify(B.quests[k])) q[k] = [A.quests[k] ?? null, B.quests[k] ?? null];
    out.quests = q;
    if (A.weather !== B.weather) out.weather = [A.weather, B.weather];
    // The events between the two (if the 500-event ring still holds them).
    const evs = g.events.filter((e) => e.seq > A.at.seq && e.seq <= B.at.seq);
    const byType = {};
    for (const e of evs) byType[e.type] = (byType[e.type] ?? 0) + 1;
    out.events = { count: B.at.seq - A.at.seq, held: evs.length, byType, notable: cap(evs.filter((e) => NOTABLE.has(e.type))) };
    const n = died.length + spawned.length + gone.length + hurt.length + mv.length + vd.length + dd.length + Object.keys(pl).length + Object.keys(items).length + Object.keys(st).length;
    out.summary = `${out.seconds}s: ${died.length} died, ${spawned.length} appeared, ${gone.length} removed, ${hurt.length} hurt, ${mv.length} moved >=${moved}m, ${vd.length} vehicles changed, ${dd.length} doors/windows changed, ${out.events.count} events${Object.keys(st).length ? `, standing moved with ${Object.keys(st).join(', ')}` : ''}${pl.moved ? `, you moved ${pl.moved}m` : ''}`;
    out.changes = n;
    return out;
  };

  // ---- look: what is in this frame ---------------------------------------------------------------------------------
  const describeView = (W, H, cam) => {
    const p = P(), aspect = cam.aspect;
    cam.aspect = W / H; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const on = (x, y, z) => {
      _v.set(x, y, z).project(cam);
      if (_v.z > 1 || _v.x < -1 || _v.x > 1 || _v.y < -1 || _v.y > 1) return null;
      return [Math.round((_v.x + 1) * 0.5 * W), Math.round((1 - _v.y) * 0.5 * H)];
    };
    const dist = (o) => r1(Math.hypot(o.x - p.x, o.z - p.z));
    const people = [], vehicles = [], doors = [], windows = [], boxes = [], places = [];
    const F = factionTable(g);
    for (const c of g.chars) {
      if (c === p || c.hidden) continue;
      const s = on(c.x, (c.gy ?? 0) + 1, c.z); if (!s) continue;
      const fk = factionKey(c);
      people.push({ id: c.id, name: c.npc?.name ?? c.name ?? c.id, named: !!c.npc, faction: fk, factionName: F[fk]?.name ?? fk, flag: c.flag ?? null, state: aiState(c), hp: Math.round(c.hp), hostile: g.ai.hostile(c, p), weapon: c.weapon ?? null, target: c.target ? (c.target === p ? 'you' : c.target.id) : null, dist: dist(c), px: s });
    }
    for (const v of g.vehicles) {
      const s = on(v.x, 0.8, v.z); if (!s) continue;
      vehicles.push({ id: v.id, type: v.type, name: v.name, hp: Math.round(v.hp), maxHp: v.maxHp, dead: !!v.dead, onFire: v.onFire > 0, driver: v.driver ? (v.driver === p ? 'you' : v.driver.id) : null, speed: r1(Math.hypot(v.vx, v.vz)), yours: p.inVehicle === v || g.lastVehicle === v, dist: dist(v), px: s });
    }
    for (const d of g.interiors.doors) {
      const s = on(d.x, 1, d.z); if (!s) continue;
      let a = 0; for (const L of d.leaves) a = Math.max(a, Math.abs(L.th));
      doors.push({ id: d.id, state: d.locked ? 'locked' : a < 0.12 ? 'closed' : a < 1.2 ? 'ajar' : 'open', material: d.material, dist: dist(d), px: s });
    }
    for (const Wn of g.interiors.windows) { const s = on(Wn.x, 1.2, Wn.z); if (s) windows.push({ id: Wn.id, state: Wn.state, dist: dist(Wn), px: s }); }
    for (const b of g.inventory.boxes.values()) {
      if (b.x === undefined || b.kind === 'person') continue;
      const s = on(b.x, 0.6, b.z); if (!s) continue;
      boxes.push({ id: b.id, label: b.label, kind: b.kind, owner: b.owner ?? null, opened: !!b.rolled, items: b.rolled ? b.slots.length : null, dist: dist(b), px: s });
    }
    for (const b of g.world.spawns.shops) { if (!b.shopName) continue; const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2, s = on(x, 2, z); if (s) places.push({ name: b.shopName, kind: 'shop', x: r1(x), z: r1(z), px: s }); }
    for (const t of g.streamer.W.towns) { if (!t.built) continue; const s = on(t.x, 0, t.z); if (s) places.push({ name: t.name, kind: 'town', x: r1(t.x), z: r1(t.z), px: s }); }
    // The ground the frame covers (the four image corners cast onto y = 0).
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => { ray.setFromCamera({ x, y }, cam); return ray.ray.intersectPlane(plane, hit) ? [r1(hit.x), r1(hit.z)] : null; });
    cam.aspect = aspect; cam.updateProjectionMatrix();
    for (const arr of [people, vehicles, doors, windows, boxes]) arr.sort((a, b) => a.dist - b.dist);
    return { people, vehicles, doors, windows, containers: boxes, places, footprint: corners, camera: { x: r1(cam.position.x), y: r1(cam.position.y), z: r1(cam.position.z) } };
  };
  const caption = (d) => {
    const p = P(), w = g.inv.current, parts = [];
    parts.push(`${g.sky.clock} ${g.sky.phase}, ${g.sky.label}.`);
    parts.push(`You: ${p.alive ? `${Math.round(p.hp)} hp` : 'DEAD'}${p.inVehicle ? ` driving the ${p.inVehicle.name ?? p.inVehicle.type}` : ''}, ${WEAPONS[w]?.name ?? w} ${g.inv.mag?.[w] ?? 0}/${WEAPONS[w]?.mag ?? '?'}, at ${locationName(p.x, p.z)} (${districtName(p.x, p.z)})${g.wanted ? `, wanted ${g.wanted}*` : ''}.`);
    const alive = d.people.filter((q) => q.state !== 'dead');
    if (alive.length) {
      const groups = {};
      for (const q of alive) (groups[q.factionName] ??= []).push(q);
      const bits = Object.entries(groups).map(([f, qs]) => {
        const named = qs.filter((q) => q.named).map((q) => `${q.name} (${q.state})`);
        const hostile = qs.filter((q) => q.hostile).length;
        const states = {}; for (const q of qs) if (!q.named) states[q.state] = (states[q.state] ?? 0) + 1;
        return `${qs.length} ${f}${hostile ? ` [${hostile} hostile]` : ''}${named.length ? `: ${named.join(', ')}` : ''}${Object.keys(states).length ? ` (${Object.entries(states).map(([k, n]) => `${n} ${k}`).join(', ')})` : ''}`;
      });
      parts.push(`In view: ${bits.join('; ')}. Nearest: ${alive[0].name} ${alive[0].dist} m.`);
    } else parts.push('Nobody alive in view.');
    const dead = d.people.length - alive.length;
    if (dead) parts.push(`${dead} dead on the ground.`);
    if (d.vehicles.length) parts.push(`Vehicles: ${d.vehicles.slice(0, 5).map((v) => `${v.name ?? v.type}${v.dead ? ' (wreck)' : v.onFire ? ' (burning)' : v.driver ? ` (${v.driver === 'you' ? 'yours' : 'driven'})` : ''} ${v.dist} m`).join(', ')}${d.vehicles.length > 5 ? ` +${d.vehicles.length - 5}` : ''}.`);
    if (d.doors.length) { const n = {}; for (const x of d.doors) n[x.state] = (n[x.state] ?? 0) + 1; parts.push(`Doors: ${Object.entries(n).map(([k, v]) => `${v} ${k}`).join(', ')}.`); }
    if (d.containers.length) parts.push(`${d.containers.length} containers (${d.containers.filter((b) => !b.opened).length} unopened).`);
    if (d.places.length) parts.push(`Places: ${d.places.map((x) => x.name).slice(0, 6).join(', ')}.`);
    return parts.join(' ');
  };

  const matcher = (types, not, ids, x, z, radius, text) => (e) => {
    if (types.length && !types.includes(e.type)) return false;
    if (not.length && not.includes(e.type)) return false;
    if (ids.length && !ids.some((id) => [e.victim, e.by, e.id, e.target, e.witness, e.npc, e.vehicle, e.trader].includes(id))) return false;
    if (Number.isFinite(x) && Number.isFinite(z)) {
      let ex = e.x, ez = e.z;
      if (!Number.isFinite(ex)) { const c = api.findChar(e.victim ?? e.id ?? e.witness); if (c) { ex = c.x; ez = c.z; } }
      if (!Number.isFinite(ex) || Math.hypot(ex - x, ez - z) > radius) return false;
    }
    if (text && !JSON.stringify(e).toLowerCase().includes(String(text).toLowerCase())) return false;
    return true;
  };

  return {
    // ------------------------------------------------------------------------------------------ the observer's reads
    observe: {
      group: 'observe', desc: 'THE OBSERVER\'s live frame (docs/design/WEB_OBSERVER.md), the same data observe.html draws: the player card (vitals, pack, roles), every character as a row [id, x, z, face, faction, flag, state, hp, named, name, vehicle, gy, hostile, npcId, targetId], every vehicle [id, type, x, z, heading, hp%, dead, driver, speed, width, length, name, onFire], perf, the recorder. since=<seq> adds the events after it; x0,z0,x1,z1 adds the doors and windows in that box (under 900 x 900 m); sel=<ids> adds each one\'s full card (person); factions=true adds the faction table.',
      args: { since: { type: 'number' }, x0: { type: 'number' }, z0: { type: 'number' }, x1: { type: 'number' }, z1: { type: 'number' }, sel: { type: 'string' }, factions: { type: 'boolean', default: false } },
      run: async ({ since, x0, z0, x1, z1, sel, factions }) => feedSnapshot(api, { since, bbox: [x0, z0, x1, z1].every(Number.isFinite) ? [x0, z0, x1, z1] : null, sel: list(sel), factions }),
    },
    person: {
      group: 'observe', desc: 'One person in full (the observer\'s selection card): AI state (and the raw ai.js state), target and grudge, hp, bleeding, asleep, faction and how hostile, weapon and rounds, what they carry (a body\'s box, a resident\'s things), their household and today\'s plan (ring residents), what a named person remembers of you, a portrait seed and their flag. id=player gives the player\'s vitals and pack.',
      args: { id: { type: 'string', required: true } },
      run: async ({ id }) => { const c = api.findChar(id); need(c, `no character ${id} (query type=char lists who is near)`); return personDetail(api, c); },
    },
    mapBase: {
      group: 'observe', desc: 'The observer map\'s ground, sent once: the island\'s own minimap as a PNG data URL (it covers |x|,|z| <= half), I-10 sampled every 200 m, towns, exits, raider camps, shops, military bases.',
      run: async () => mapBase(g),
    },
    mapTiles: {
      group: 'observe', desc: 'Minimap tiles (128 px PNG data URLs over 256 m) of streamed chunks by key "cx,cz" (comma-joined pairs separated by ";", or a JSON array). Only chunks laid out right now have one; observe lists their keys in `layouts`.',
      args: { keys: { type: 'string', required: true } },
      run: async ({ keys }) => {
        const ks = Array.isArray(keys) ? keys : String(keys).trim().startsWith('[') ? JSON.parse(keys) : String(keys).split(';').map((s) => s.trim()).filter(Boolean);
        need(ks.length <= 64, 'at most 64 tiles a call');
        const tiles = mapTiles(g, ks);
        return { tiles, missing: ks.filter((k) => !tiles[k]) };
      },
    },
    heal: {
      group: 'world', desc: 'Patch a person (or the player) up: hp up by amount (default to full), bleeding stopped, a downed named person back on their feet now. The dead stay dead (spawn another).',
      args: { id: { type: 'string', required: true }, amount: { type: 'number' } },
      run: async ({ id, amount }) => {
        const c = api.findChar(id);
        need(c, `no character ${id}`);
        need(c.alive, `${c.npc?.name ?? c.name ?? id} is dead; the dead stay dead (spawn another)`);
        const before = Math.round(c.hp);
        c.hp = Math.min(c.maxHp, c.hp + (amount ?? c.maxHp));
        c.bleed = 0;
        if (c.downedT > 0) c.downedT = 0.01; // ai.js stands them up on its next tick
        return { id: c.id, hp: [before, Math.round(c.hp)], maxHp: c.maxHp };
      },
    },

    // ------------------------------------------------------------------------------------------------ the recorder
    record: {
      group: 'observe', desc: `The session recorder (docs/design/WEB_OBSERVER.md §3.3): a ring of the player's state (position, heading, hp, speed, flags: ${Object.keys(FLAG).join('/')}), the keys held or tapped (${Object.keys(KEYS).join('/')}) and the aim, at rate= Hz of game time (default ${REC.rate}), plus every game event. on= starts/stops it, reset=true starts a new session id, save=true writes it to web/sessions/<id>.json through the dev server (last=<s> keeps only the tail), autosave=<s> writes it that often (0 = off; a person's tab autosaves every ${REC.autosaveS} s by default). Returns the recorder's state.`,
      args: { on: { type: 'boolean' }, rate: { type: 'number' }, reset: { type: 'boolean', default: false }, save: { type: 'boolean', default: false }, last: { type: 'number' }, autosave: { type: 'number' } },
      run: async ({ on, rate, reset, save, last, autosave }) => {
        const R = g.recorder;
        need(R, 'no recorder in this build (main.js creates g.recorder)');
        if (rate !== undefined) { need(rate >= 0.5 && rate <= 30, 'rate is 0.5..30 Hz'); R.setRate(rate); }
        if (reset) R.reset(true);
        if (on !== undefined) { if (on && !R.on) R.nextT = g.time; R.on = on; }
        if (autosave !== undefined) { need(autosave === 0 || autosave >= 10, 'autosave is 0 (off) or >= 10 s'); api.autosaveS = autosave; }
        let saved = null;
        if (save) {
          need(R.n > 0, 'nothing recorded yet');
          const s = R.session({ last });
          saved = await fetchJson('/agent/session', s);
          R.saved = { at: new Date().toISOString(), id: s.id, path: saved.path, bytes: saved.bytes, seconds: s.seconds };
        }
        return { ...R.view(), autosaveS: api.autosaveS ?? null, ...(saved ? { savedNow: saved } : {}) };
      },
    },
    session: {
      group: 'observe', desc: 'A recorded session: no id = the live ring in this tab, id=<saved id> one from web/sessions/. Returns its summary (span, samples, distance, deaths, kills, events by type); full=true the whole thing (columns + events, the file format); list=true lists the saved ones on disk (newest first).',
      args: { id: { type: 'string' }, full: { type: 'boolean', default: false }, list: { type: 'boolean', default: false }, last: { type: 'number' } },
      run: async ({ id, full, list: ls, last }) => {
        if (ls) return await fetchJson('/agent/sessions');
        if (full && (!id || id === 'live')) { need(g.recorder?.n > 0, 'nothing recorded yet'); return { session: g.recorder.session({ last }) }; }
        const S = await loadSession(id);
        if (full) return { session: { ...S, cols: Object.fromEntries(Object.entries(S.cols).map(([k, a]) => [k, Array.from(a)])) } };
        const C = S.cols;
        let dist = 0, veh = 0;
        for (let i = 1; i < S.n; i++) { const d = Math.hypot(C.x[i] - C.x[i - 1], C.z[i] - C.z[i - 1]); if (d < 80) dist += d; if (C.flags[i] & FLAG.veh) veh++; }
        const byType = {};
        for (const e of S.events) byType[e.y] = (byType[e.y] ?? 0) + 1;
        return { id: S.id, started: S.started, rate: S.rate, samples: S.n, t0: S.t0, t1: S.t1, seconds: S.seconds, metres: Math.round(dist), drivingShare: S.n ? r2(veh / S.n) : 0,
          deaths: byType.playerDied ?? 0, kills: S.events.filter((e) => e.y === 'kill' && e.byYou).length, events: S.events.length, byType, end: S.end };
      },
    },
    replay: {
      group: 'observe', desc: `Read a recorded session back (id=<saved id>, default the live ring). at=<game s> gives the player there (position, heading, hp, speed, flags and keys, interpolated between samples) and the events within window= s of it; heat=${HEAT_LAYERS.join('|')} bins it into cell= m cells (default ${REC.heatCell}) and returns the top= hottest with their centres; goto=true (with at) teleports you to that spot and facing (a bug report's "I was standing here"). The observer page draws the same thing with a scrubber.`,
      args: { id: { type: 'string' }, at: { type: 'number' }, window: { type: 'number', default: 2 }, heat: { type: 'string', enum: HEAT_LAYERS }, cell: { type: 'number', default: REC.heatCell }, top: { type: 'number', default: 10 }, goto: { type: 'boolean', default: false } },
      run: async ({ id, at, window, heat, cell, top, goto }) => {
        const S = await loadSession(id);
        const out = { id: S.id, t0: S.t0, t1: S.t1, samples: S.n };
        if (at !== undefined) {
          need(Number.isFinite(at), 'at is a game time in seconds (t0..t1)');
          const f = sessionAt(S, at);
          out.at = { ...f, flagNames: decodeFlags(f.flags), keyNames: decodeKeys(f.keys), clamped: at < S.t0 || at > S.t1 };
          out.events = S.events.filter((e) => Math.abs(e.t - at) <= window);
          if (goto) out.teleported = await api.call('teleport', { x: f.x, z: f.z }).then((r) => { if (!P().inVehicle) P().face = f.h; return r; });
        }
        if (heat) {
          need(cell >= 1 && cell <= 200, 'cell is 1..200 m');
          const H = heatmap(S, heat, cell);
          out.heat = { layer: heat, cell, cells: H.bins.size, max: r2(H.max), total: r2(H.total),
            top: [...H.bins].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => { const [cx, cz] = k.split(',').map(Number); return { x: (cx + 0.5) * cell, z: (cz + 0.5) * cell, value: r2(v), where: locationName((cx + 0.5) * cell, (cz + 0.5) * cell) }; }) };
        }
        if (at === undefined && !heat) out.hint = 'pass at=<game s> for a moment, heat=went|died|fought for a heatmap';
        return out;
      },
    },

    // ---------------------------------------------------------------------------------------- agent multipliers
    look: {
      group: 'observe', desc: 'A screenshot AND what is in it, in one call: every person in frame (name, faction, flag, AI state, hp, hostile, target, distance, pixel position in the image), vehicles, doors (open/closed/locked), windows, containers (opened or not), named places, the ground the frame covers, and a one-paragraph caption. Same camera args as screenshot (x, z, zoom, tilt); image=false skips the JPEG and describes the game camera\'s view.',
      args: { x: { type: 'number' }, z: { type: 'number' }, zoom: { type: 'number' }, tilt: { type: 'number' }, width: { type: 'number', default: 1280 }, height: { type: 'number', default: 720 }, quality: { type: 'number', default: 0.8 }, image: { type: 'boolean', default: true } },
      run: async ({ x, z, zoom, tilt, width, height, quality, image }) => {
        let shot = null;
        if (image) { shot = await api.COMMANDS.screenshot.run({ x, z, zoom, tilt, width, height, quality }); }
        else if (x !== undefined || z !== undefined || zoom || tilt !== undefined) {
          const cx = x ?? g.camLook.x, cz = z ?? g.camLook.z, h = zoom ?? g.camHeight, t = Math.max(-1.6, Math.min(1.6, tilt ?? 0.14));
          g.camera.position.set(cx, h, cz + h * t); g.camera.lookAt(cx, 0, cz);
        } else g.updateCamera(0.016);
        const d = describeView(width, height, g.camera);
        return { ...(shot ? { image: shot.image } : {}), width, height, caption: caption(d), ...d, counts: { people: d.people.length, hostile: d.people.filter((q) => q.hostile).length, vehicles: d.vehicles.length, doors: d.doors.length, containers: d.containers.length } };
      },
    },
    snap: {
      group: 'observe', desc: 'Remember the world now under name= (default "a"; up to 8 kept): the player, every person (position, hp, alive, AI state), every vehicle, the pack, doors and windows, standings, roles, quests, the event cursor. Compare two with diff.',
      args: { name: { type: 'string', default: 'a' } },
      run: async ({ name }) => {
        api._snaps.set(name, takeSnap());
        if (api._snaps.size > 8) api._snaps.delete(api._snaps.keys().next().value);
        const s = api._snaps.get(name);
        return { name, at: s.at, people: Object.keys(s.chars).length, vehicles: Object.keys(s.vehicles).length, kept: [...api._snaps.keys()] };
      },
    },
    diff: {
      group: 'observe', desc: 'What changed between two snaps (from=, to=; to defaults to now): who died, appeared, was removed, got hurt or healed, moved at least moved= m, changed AI state; vehicles hurt, wrecked, moved or taken; doors and windows; your hp, cash, wanted, pack, guns and position; faction standings; roles; quests; and the events in between counted by type with the notable ones listed. One line `summary` up top. limit= caps each list.',
      args: { from: { type: 'string', default: 'a' }, to: { type: 'string' }, moved: { type: 'number', default: 2 }, limit: { type: 'number', default: 25 } },
      run: async ({ from, to, moved, limit }) => {
        const A = api._snaps.get(from);
        need(A, `no snap "${from}" (snap name=${from} first; kept: ${[...api._snaps.keys()].join(', ') || 'none'})`);
        const B = to ? api._snaps.get(to) : takeSnap();
        need(B, `no snap "${to}"`);
        return diffSnaps(A, B, moved, limit);
      },
    },
    watch: {
      group: 'observe', desc: 'Wait for events that match a filter and return them (instead of a step-and-poll loop): type= (comma list), not= (types to skip), id= (anyone involved: victim, by, target, witness...), x,z,radius (where), text= (substring of the event). mode=step advances the sim at 60 Hz (deterministic, any tab) up to seconds=; mode=real waits on the wall clock while the game (or a person) plays. Stops after count= matches. since=<seq> starts from a cursor (default: now). Returns the matches, the cursor to pass next time, and how long it took. CLI: node tools/dl.mjs watch type=kill --follow streams them.',
      args: { type: { type: 'string' }, not: { type: 'string' }, id: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, radius: { type: 'number', default: 30 }, text: { type: 'string' }, count: { type: 'number', default: 1 }, seconds: { type: 'number', default: 10 }, mode: { type: 'string', default: 'step', enum: ['step', 'real'] }, since: { type: 'number' } },
      run: async ({ type, not, id, x, z, radius, text, count, seconds, mode, since }) => {
        need(seconds > 0 && seconds <= 600, 'seconds is (0, 600]');
        const types = list(type), nots = list(not), ids = list(id).map((q) => api.findChar(q)?.id ?? q);
        const ok = matcher(types, nots, ids, x, z, radius, text);
        let cursor = since ?? g.eventSeq;
        const matches = [];
        // The cursor ends on the last event looked at, so the next call (since=cursor) neither skips nor repeats one.
        const scan = () => { for (const e of g.events) { if (e.seq <= cursor) continue; cursor = e.seq; if (ok(e)) { matches.push(e); if (matches.length >= count) return; } } };
        const t0 = g.time, w0 = performance.now();
        scan();
        if (mode === 'step') {
          const frames = Math.round(seconds * 60);
          for (let f = 0; f < frames && matches.length < count; f += 6) { await api._step(6); scan(); }
        } else {
          while (matches.length < count && performance.now() - w0 < seconds * 1000) { await new Promise((r) => setTimeout(r, 100)); scan(); }
        }
        return { matched: matches.length, done: matches.length >= count, matches: matches.slice(0, count), cursor, gameSeconds: r2(g.time - t0), wallMs: Math.round(performance.now() - w0), mode,
          player: { x: r1(P().x), z: r1(P().z), hp: Math.round(P().hp), alive: P().alive } };
      },
    },
  };
}

export { perfLine };
