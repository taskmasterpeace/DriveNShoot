// POLICE RESPONSE as COMMANDS rows and the selftest's police checks (docs/design/WEB_POLICE_RESPONSE.md; systems/police.js,
// data/police.js). buildCommands() in api.js spreads policeCommands into COMMANDS (help, the CLI, the MCP tools and
// docs/COMMANDS.md see it like any other row); policeChecks is the selftest share (each check returns true or a diagnostic).
import { STATION_TIERS, FORCES, RESPONSES, SEVERITY, CHANNELS, PATROLS, SIREN, validatePolice } from '../data/police.js';
import { ARCHETYPES } from '../data/citygen.js';
import { WEAPONS } from '../systems/combat.js';
import { GEAR } from '../data/gear.js';
import { VEHICLES } from '../systems/vehicles.js';
import { layoutTown } from '../world/citygen/layout.js';
import { tierOf, bearingOf, routeLen } from '../systems/police.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function policeCommands(api, need) {
  const g = api.g, P = () => g.player, PO = () => g.police;
  const desk = (town) => {
    const T = PO().towns;
    if (town) { const D = T.get(town); need(D, `no desk ${town}; live desks: ${[...T.keys()].join(', ') || 'none (stand in a town with a police station)'}`); return D; }
    const D = PO().deskAt(P().x, P().z, 400) ?? [...T.values()][0];
    need(D, 'no live town with a police station near you (citygen action=stamp archetype=county_seat teleport=true makes one)');
    return D;
  };
  return {
    police: {
      group: 'society',
      desc: 'POLICE RESPONSE (docs/design/WEB_POLICE_RESPONSE.md; rows in data/police.js; systems/police.js). Every live generated town with a police station keeps a desk: its tier by size (post 30+ buildings, station 60+, precinct 110+; the heavy team in precincts, major cities and rich stations), its force by owner (sheriff\'s bulls, a family\'s militia, a raider boss\'s enforcers), a motor pool at the station\'s bays, an armory roster, holding cells, and the town\'s own street graph. action=stations: each desk. action=patrols: the beats (car loops round the centre\'s crossings, foot pairs on the main street) with their route, next stop, laps and the stops they made, on the day/night shifts. action=dispatch: the open cases (the REPORTED spot, the channel it came by, severity), the reports still on their way (a witness running to the station), and the counts by channel and rung. action=units: the units out (rung patrol|posse|heavy, mode roll|search|stack|inside|contact|home, where they were sent, their route length, the men, shield, ram). action=report files a report AS IF it reached the desk by channel= (patrol|heard|alarm|witness) at at=x,z (default: where you stand) with sev= (1-2 patrol car, 3-4 posse, 5+ heavy team where kept) and building= (a breach): the desk then answers it like any other. action=clear sends everyone home. on=false stops the desk listening; beats=false keeps the patrols in.',
      args: { action: { type: 'string', default: 'stations', enum: ['stations', 'patrols', 'dispatch', 'units', 'report', 'clear', 'siren'] }, town: { type: 'string' }, at: { type: 'string' }, sev: { type: 'number', default: 2 },
        channel: { type: 'string', default: 'patrol', enum: ['patrol', 'heard', 'alarm', 'witness'] }, building: { type: 'string' }, verb: { type: 'string' }, on: { type: 'boolean' }, beats: { type: 'boolean' } },
      run: async ({ action, town, at, sev, channel, building, verb, on, beats }) => {
        const S = PO();
        if (on !== undefined) S.enabled = on;
        if (beats !== undefined) S.beatsOn = beats;
        S.scan();
        if (action === 'clear') { S.clear(); return { cleared: true, police: S.view() }; }
        if (action === 'stations') return { shift: S.shiftNow(), stations: [...S.towns.values()].map((D) => S.stationView(D)) };
        if (action === 'patrols') return { shift: S.shiftNow(), beatsOn: S.beatsOn, beats: [...S.towns.values()].flatMap((D) => D.beats.map((b) => S.beatView(D, b))) };
        if (action === 'units') return { units: S.units.map((u) => S.unitView(u)) };
        if (action === 'siren') return { heard: S.heard, loudest: S.loudest ?? null, range: SIREN.range, audible: SIREN.audible };
        if (action === 'dispatch' && !at && channel === 'patrol' && sev === 2 && !building) { const v = S.view(); return { cases: v.cases, pending: v.pending, lastReport: v.lastReport, counts: v.counts }; }
        // report (or dispatch with a spot): the desk gets it by the channel given, after that channel's delay.
        const D = desk(town);
        let x = P().x, z = P().z;
        if (at) { const m = String(at).split(',').map(Number); need(m.length === 2 && m.every(Number.isFinite), 'at=x,z'); [x, z] = m; }
        if (building) need(D.T.buildings.some((b) => b.id === building), `building= one of ${D.T.buildings.filter((b) => b.kind === 'shop' || b.kind === 'house').slice(0, 6).map((b) => b.id).join(', ')}...`);
        const delay = channel === 'patrol' ? CHANNELS.patrol.radio : channel === 'alarm' ? Math.hypot(x - D.front.x, z - D.front.z) / CHANNELS.alarm.wire + CHANNELS.alarm.delay : channel === 'heard' ? CHANNELS.heard.tell : Math.hypot(x - D.front.x, z - D.front.z) / CHANNELS.witness.run + CHANNELS.witness.tell;
        const r = S.file({ town: D.id, channel, x, z, sev, verb: verb ?? null, suspect: channel === 'patrol' ? 'player' : null, building: building ?? null, due: g.time + delay, from: 'the command' });
        need(r, 'the desk is off (on=true)');
        return { filed: r.id, town: D.id, channel, sev, dueIn: r1(delay), rung: S.rungFor(D, sev), at: { x: r1(x), z: r1(z) } };
      },
    },
  };
}

// ---- the selftest share ---------------------------------------------------------------------------------------------
// Each check stages in a generated town of its own (a precinct-sized county seat; a station-sized grain town for the
// heavy-team check), with the dead, raiders and convoys held off, the desk cleared between checks, and puts it all back.
export async function policeChecks(api, check, C) {
  const g = api.g, P = () => g.player, S = g.police;
  const was = { on: S.enabled, beats: S.beatsOn, z: g.zombies.enabled, r: g.raiderTimer, conv: g.convoy.next, hour: g.sky.time, cg: g.citygen.enabled, god: g.godMode };
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9; g.citygen.enabled = false;
  const made = [], extras = [];
  const stamp = async (archetype, seed, near) => {
    const s = freeSpot(g, near.x, near.z, (ARCHETYPES[archetype].sizeM[1]) / 2 + 40);
    if (!s) return null;
    const t = g.citygen.stampAt({ arch: archetype, seed, x: s.x, z: s.z, id: `police-${archetype}-${seed}` });
    made.push(t.rec.id);
    await C('teleport', { x: t.rec.x, z: t.rec.z });
    await C('step', { seconds: 1.5 });
    S.scan();
    return S.towns.get(t.rec.id) ?? null;
  };
  const home = async (x, z) => { if (g.dialogue?.active) g.dialogue.close(); const v = P().inVehicle; if (v) { g.exitVehicle(true); } await C('teleport', { x, z }); };
  const reset = () => { S.clear(); S.enabled = true; S.beatsOn = false; for (const c of extras.splice(0)) if (g.chars.includes(c)) g.removeChar(c); };
  const person = (x, z, face = 0) => { const c = g.addChar({ x, z, faction: 'drifter', name: 'Test Townsperson', flag: 'MX' }); if (c) { c.face = face; c.hold = true; extras.push(c); } return c; };
  const stepUntil = async (fn, secs, dt = 0.5) => { for (let t = 0; t < secs; t += dt) { await C('step', { seconds: dt }); const v = fn(); if (v) return v; } return null; };
  const evs = (type, since) => g.events.filter((e) => e.type === type && e.seq > since);
  const seq = () => (g.events.length ? g.events[g.events.length - 1].seq : 0);
  // An open spot on a street of D, about `m` m of street from the station, and the street foot there.
  const streetSpot = (D, m) => {
    let best = null, bd = Infinity;
    for (const n of D.SG.nodes) { const L = routeLen(D.SG.route(D.pool[0].x, D.pool[0].z, n.x, n.z)); if (Math.abs(L - m) < bd && n.x > D.T.x0 + 20 && n.x < D.T.x1 - 20 && n.z > D.T.z0 + 20 && n.z < D.T.z1 - 20) { bd = Math.abs(L - m); best = n; } }
    return best && { x: best.x, z: best.z };
  };
  let D = null, Dsmall = null;
  try {
    g.godMode = true;
    await check('police: the rows are whole (tiers climb; every force names a real car and an arrest it can carry out; every response real weapons and gear; the breach truck seats the heavy team; lights one red one blue, never purple)', async () => {
      const v = validatePolice(undefined, { weapons: WEAPONS, gear: GEAR, vehicles: VEHICLES });
      return v.ok && VEHICLES.breach_truck ? true : v.bad.join(', ') || 'no breach_truck row';
    });

    await check('police: the response table by town size - under 30 buildings no station; post / station / precinct by size; the heavy team only in precincts, major cities and stations rich enough (every archetype x 3 seeds)', async () => {
      const bad = [], table = {};
      for (const [a, A] of Object.entries(ARCHETYPES)) for (const seed of [1, 3, 404]) {
        const T = layoutTown({ arch: a, seed, x: 0, z: 0 }), n = T.buildings.filter((b) => !b.outbuilding).length, t = tierOf(n, T.wealth ?? A.wealth, A.major);
        if (!!T.police !== !!t && n >= 30) bad.push(`${a}/${seed}: station ${!!T.police} tier ${t?.id}`);
        if (t && t.heavy !== (t.id === 'precinct' || !!A.major || (t.id === 'station' && (T.wealth ?? A.wealth) >= 0.6))) bad.push(`${a}/${seed}: heavy`);
        const k = t ? `${t.id}${t.heavy ? '+heavy' : ''}` : 'none'; table[k] = (table[k] ?? 0) + 1;
      }
      const kinds = Object.keys(table);
      return !bad.length && kinds.includes('none') && kinds.some((k) => k.startsWith('post')) && kinds.includes('station') && kinds.includes('precinct+heavy') ? true : JSON.stringify({ bad: bad.slice(0, 6), table });
    });

    D = await stamp('county_seat', 3, { x: 2600, z: 0 });
    await check('police: a county seat of size keeps a precinct - a desk at its police station, a motor pool at the bays, the heavy team, an armory roster and cells, its own street graph', async () => {
      if (!D) return `no desk (live: ${[...S.towns.keys()]})`;
      const v = S.stationView(D);
      return v.tier === 'precinct' && v.heavy && v.motorPool.carsLeft >= 3 && v.motorPool.truckLeft === 1 && v.armory.left > 6 && v.cells.n >= 4 && v.streets.crossings >= 8 && FORCES[v.force] ? true : JSON.stringify(v);
    });
    if (!D) throw new Error('police: no county seat desk to stage the rest in');

    await check('police: a crime nobody saw or heard never dispatches anyone (a killing with no witness, a shot outside every ear: 60 s, no report, no case, no unit)', async () => {
      reset();
      const far = streetSpot(D, 260) ?? { x: D.T.x0 + 30, z: D.T.z0 + 30 };
      await home(far.x, far.z);
      for (const c of [...g.chars]) if (c !== P() && c.alive && Math.hypot(c.x - P().x, c.z - P().z) < 70 && !c.pol) { g.removeChar(c); }
      const victim = person(P().x + 2, P().z, Math.PI / 2); // facing away (east): the only one there
      const n0 = { ...S.counts, byChannel: { ...S.counts.byChannel } }, s0 = seq();
      const rec = g.society.deeds.record('kill', { target: victim, x: victim.x, z: victim.z, m: 4, tf: victim.fid });
      g.combat.damage(victim, 999, P(), 0, 0, 'melee');
      const ds = Math.hypot(P().x - D.front.x, P().z - D.front.z);
      g.noise(P().x, P().z, 45, P()); // a shot: the station is ds m off, out of its ear when ds > 45 x stationEar
      await C('step', { seconds: 60 });
      const filed = evs('crimeReported', s0).length, cases = evs('caseOpen', s0).length, sent = evs('policeDispatched', s0).length;
      return filed === 0 && cases === 0 && sent === 0 && S.units.length === 0 && ds > 45 * CHANNELS.heard.stationEar ? true : JSON.stringify({ filed, cases, sent, units: S.units.length, ds: r1(ds), witnesses: rec?.ws, reports: S.counts.reports - n0.reports });
    });

    let times = null;
    await check('police: a reported crime dispatches from the station and the unit drives the town\'s streets there, in game time proportional to the distance (a near and a far call)', async () => {
      reset();
      const out = [];
      for (const m of [110, 330]) {
        const spot = streetSpot(D, m);
        if (!spot) return `no street spot ${m} m out`;
        // The scene: you, a theft, and a townsperson beside you who sees it and runs to the station.
        await home(spot.x + 6, spot.z + 6);
        const w = person(spot.x + 9, spot.z + 3, Math.atan2(P().x - (spot.x + 9), P().z - (spot.z + 3)));
        w.hold = 0;
        const s0 = seq();
        g.society.deeds.record('steal', { x: P().x, z: P().z, m: 2, label: 'a shelf' });
        const sent = await stepUntil(() => evs('policeDispatched', s0)[0], 240);
        if (!sent) return JSON.stringify({ m, why: 'never dispatched', pending: S.view().pending, reported: evs('crimeReported', s0).length });
        const u = S.units.find((q) => q.id === sent.data?.id ?? sent.id) ?? S.units[S.units.length - 1];
        const fromStation = Math.hypot((sent.data ?? sent).from.x - D.front.x, (sent.data ?? sent).from.z - D.front.z);
        let onStreet = 0, n = 0;
        const arrived = await stepUntil(() => { const v = u.cars[0]; if (v && !v.dead) { const f = D.SG.foot(v.x, v.z); n++; if (f && f.d < 9) onStreet++; } return evs('policeArrived', s0)[0]; }, 120, 0.25);
        if (!arrived) return JSON.stringify({ m, why: 'never arrived', unit: S.unitView(u) });
        const a = arrived.data ?? arrived;
        out.push({ m, secs: a.secs, routeM: a.routeM, fromStation: r1(fromStation), street: r1(onStreet / Math.max(1, n)) });
        S.clear(); extras.splice(0).forEach((c) => g.chars.includes(c) && g.removeChar(c));
      }
      times = out;
      const [A, B] = out, ratioT = B.secs / A.secs, ratioM = B.routeM / A.routeM;
      const ok = out.every((o) => o.fromStation < 30 && o.street >= 0.85) && B.routeM > A.routeM * 1.8 && Math.abs(ratioT / ratioM - 1) < 0.45;
      return ok ? true : JSON.stringify({ out, ratioT: r1(ratioT), ratioM: r1(ratioM) });
    });

    await check('police: responders go to the REPORTED spot, not your true position (shots the station heard: the spot is where the desk thinks it was; you are 200 m off by then and they never come for you)', async () => {
      reset();
      const near = D.SG.nodes.map((n) => ({ ...n, d: Math.hypot(n.x - D.front.x, n.z - D.front.z) })).filter((n) => n.d > 40 && n.d < 80).sort((a, b) => a.d - b.d)[0];
      if (!near) return 'no crossing 40-80 m from the station';
      await home(near.x + 3, near.z + 3);
      const s0 = seq(), shotAt = { x: P().x, z: P().z };
      g.noise(P().x, P().z, 45, P());
      // Gone at once, far across town (another crossing ~200 m away, out of their sight).
      const away = D.SG.nodes.map((n) => ({ ...n, d: Math.hypot(n.x - shotAt.x, n.z - shotAt.z) })).filter((n) => n.d > 180).sort((a, b) => a.d - b.d)[0];
      await home(away.x + 4, away.z + 4);
      const rep = await stepUntil(() => evs('crimeReported', s0)[0], 20);
      if (!rep) return 'the station never heard the shot';
      const arrived = await stepUntil(() => evs('policeArrived', s0)[0], 120, 0.25);
      if (!arrived) return JSON.stringify({ why: 'never arrived', units: S.units.map((u) => S.unitView(u)) });
      await C('step', { seconds: 8 });
      const C0 = S.cases[S.cases.length - 1], u = S.units[0], a = arrived.data ?? arrived;
      const reportedOff = Math.hypot(C0.x - shotAt.x, C0.z - shotAt.z), carToReport = Math.hypot(a.at.x - C0.x, a.at.z - C0.z), carToYou = Math.hypot(a.at.x - P().x, a.at.z - P().z);
      const menToYou = u ? Math.min(...u.men.filter((c) => c.alive).map((c) => Math.hypot(c.x - P().x, c.z - P().z))) : Infinity;
      const ok = rep.data?.channel === 'heard' || (rep.channel ?? rep.data?.channel) === 'heard';
      return ok && reportedOff > 3 && carToReport < 30 && carToYou > 120 && menToYou > 100 && !evs('policeContact', s0).length ? true : JSON.stringify({ channel: rep.data?.channel ?? rep.channel, reportedOff: r1(reportedOff), carToReport: r1(carToReport), carToYou: r1(carToYou), menToYou: r1(menToYou), contact: evs('policeContact', s0).length });
    });

    await check('police: sirens are heard before the unit arrives, from a distance, and from the right direction (a posse rolling to a call beside you)', async () => {
      reset();
      const spot = streetSpot(D, 300);
      await home(spot.x + 5, spot.z + 5);
      const s0 = seq();
      await C('police', { action: 'report', at: `${r1(spot.x)},${r1(spot.z)}`, sev: 3, channel: 'heard', verb: 'shots' });
      let atHeard = null;
      const heard = await stepUntil(() => { const e = evs('sirenHeard', s0)[0]; if (e && !atHeard) { const u = S.units.find((q) => q.id === (e.data ?? e).unit), v = u?.cars[0]; atHeard = v && { true: bearingOf(v.x - P().x, v.z - P().z), d: Math.hypot(v.x - P().x, v.z - P().z), mode: u.mode }; } return e; }, 90, 0.25);
      if (!heard) return JSON.stringify({ why: 'never heard', units: S.units.map((u) => S.unitView(u)) });
      const arrived = await stepUntil(() => evs('policeArrived', s0)[0], 90, 0.25);
      const h = heard.data ?? heard, a = arrived?.data ?? arrived;
      const diff = Math.abs(((h.bearing - atHeard.true + 540) % 360) - 180);
      const heardFirst = arrived && heard.seq < arrived.seq;
      return heardFirst && atHeard.mode === 'roll' && atHeard.d > 60 && diff < 20 && a?.rung === 'posse' ? true : JSON.stringify({ heard: h, atHeard, diff: r1(diff), arrived: a ?? null });
    });

    await check('police: a witness runs to the station; stopped on the way, the word never reaches the desk (no case); one who gets there opens it, in their run time', async () => {
      reset();
      const spot = streetSpot(D, 200);
      await home(spot.x + 4, spot.z + 4);
      const mk = () => { const w = person(P().x + 5, P().z + 1, Math.atan2(-5, -1)); w.hold = 0; return w; };
      let w = mk(), s0 = seq();
      g.society.deeds.record('steal', { x: P().x, z: P().z, m: 2, label: 'a crate' });
      await C('step', { seconds: 3 });
      const ran = evs('witnessToStation', s0)[0];
      g.combat.damage(w, 999, null, 0, 0, 'melee'); // somebody stops them (the check's hand: not you, no new deed)
      await C('step', { seconds: 40 });
      const silenced = evs('reportSilenced', s0).length, opened = evs('caseOpen', s0).length;
      w = mk(); const s1 = seq(), t1 = g.time, d = Math.hypot(w.x - D.front.x, w.z - D.front.z);
      g.society.deeds.record('steal', { x: P().x, z: P().z, m: 2, label: 'a second crate' });
      const open = await stepUntil(() => evs('caseOpen', s1)[0], 200);
      const secs = open ? g.time - t1 : null, expect = d / CHANNELS.witness.run + CHANNELS.witness.tell;
      return ran && silenced === 1 && opened === 0 && open && secs > expect * 0.6 && secs < expect * 2.2 ? true : JSON.stringify({ ran: !!ran, silenced, opened, open: !!open, secs: secs && r1(secs), expect: r1(expect) });
    });

    await check('police: the heavy team stacks at the door (shield first, the ram behind) and breaches a building the report names; its truck and six come out of the precinct only', async () => {
      reset();
      const B = D.T.buildings.filter((b) => b.kind === 'shop' && b.doors.some((d) => d.kind === 'door')).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - D.front.x, (a.z0 + a.z1) / 2 - D.front.z) - Math.hypot((b.x0 + b.x1) / 2 - D.front.x, (b.z0 + b.z1) / 2 - D.front.z))[2];
      if (!B) return 'no shop with a door';
      const bx = (B.x0 + B.x1) / 2, bz = (B.z0 + B.z1) / 2;
      await home(bx + (B.x1 - B.x0) / 2 + 30, bz); // across the street, watching
      await C('step', { seconds: 1 });
      const dd = B.doors.find((d) => d.kind === 'door'), dp = dd.side === 'N' ? [dd.at, B.z0] : dd.side === 'S' ? [dd.at, B.z1] : dd.side === 'W' ? [B.x0, dd.at] : [B.x1, dd.at];
      let door = null, bd = 3.5; for (const q of g.interiors.doors) { const k = Math.hypot(q.x - dp[0], q.z - dp[1]); if (k < bd) { bd = k; door = q; } }
      if (door) g.interiors.setLocked(door, true);
      const s0 = seq();
      await C('police', { action: 'report', at: `${r1(bx)},${r1(bz)}`, sev: 6, channel: 'patrol', building: B.id, verb: 'kill' });
      const sent = await stepUntil(() => evs('policeDispatched', s0)[0], 10);
      const u = S.units.find((q) => q.rung === 'heavy');
      if (!u) return JSON.stringify({ why: 'no heavy unit', sent: sent?.data ?? sent });
      const stack = await stepUntil(() => evs('policeStack', s0)[0], 150, 0.25);
      const breach = await stepUntil(() => evs('policeBreach', s0)[0], 40, 0.25);
      const st = stack?.data ?? stack, br = breach?.data ?? breach;
      return u.cars[0].type === 'breach_truck' && u.men.length === 6 && st?.shield && st?.ram && br && (!door || !door.locked) ? true : JSON.stringify({ truck: u.cars[0].type, men: u.men.length, stack: st, breach: br, door: door ? { locked: door.locked } : null, mode: u.mode });
    });

    Dsmall = await stamp('plains_grain_town', 1, { x: 2600, z: 1600 });
    await check('police: the heavy team exists only in towns that keep one - the same call (an officer killed) brings the breach truck in the precinct and two cars in a station-sized grain town', async () => {
      reset();
      if (!Dsmall) return 'no grain-town desk';
      const small = S.stationView(Dsmall), s0 = seq();
      await C('police', { action: 'report', town: Dsmall.id, at: `${r1(Dsmall.cx)},${r1(Dsmall.cz)}`, sev: 6, channel: 'patrol', verb: 'kill' });
      const sent = await stepUntil(() => evs('policeDispatched', s0)[0], 10);
      const s = sent?.data ?? sent, carTypes = S.units.flatMap((u) => u.cars.map((v) => v.type));
      return small.tier === 'station' && !small.heavy && small.motorPool.truckLeft === 0 && s?.rung === 'posse' && !carTypes.includes('breach_truck') && s.cars.length === 2 ? true : JSON.stringify({ small: { tier: small.tier, heavy: small.heavy, truck: small.motorPool.truckLeft, buildings: small.buildings }, sent: s, carTypes });
    });

    await check('police: patrols follow their route on schedule - the day shift goes out from the station at 06:00, the cars drive their corners in order, and at 18:00 they go home and the night shift comes out', async () => {
      reset();
      const Dp = Dsmall ?? D;
      await home(Dp.front.x + 20, Dp.front.z + 20);
      S.beatsOn = true; Dp.shift = null; g.sky.time = 9;
      const s0 = seq();
      await C('step', { seconds: 1 });
      const day = Dp.beats.filter((b) => b.shift === 'day'), row = STATION_TIERS[Dp.tier];
      const car = day.find((b) => b.kind === 'car');
      if (!car) return JSON.stringify({ why: 'no day car beat', beats: Dp.beats.map((b) => b.id) });
      const startD = Math.hypot(car.v.x - Dp.front.x, car.v.z - Dp.front.z);
      await stepUntil(() => car.visits.length >= 3, 160, 0.5);
      const order = car.visits.map((q) => q.i), inOrder = order.every((i, k) => k === 0 || i === (order[k - 1] + 1) % car.loop.length);
      g.sky.time = 18.2;
      const s1 = seq();
      const back = await stepUntil(() => evs('beatIn', s1).length >= day.length, 200, 0.5);
      const night = Dp.beats.filter((b) => b.shift === 'night');
      return day.filter((b) => b.kind === 'car').length === row.carBeats.day && startD < 30 && car.visits.length >= 3 && inOrder && order[0] === car.i0 && back && night.filter((b) => b.kind === 'car').length === row.carBeats.night ? true
        : JSON.stringify({ day: day.map((b) => b.id), startD: r1(startD), visits: car.visits, inOrder, back: !!back, beatIn: evs('beatIn', s1).length, night: night.map((b) => b.id), out: evs('beatOut', s0).length });
    });
  } finally {
    S.clear(); for (const c of extras) if (g.chars.includes(c)) g.removeChar(c);
    S.enabled = was.on; S.beatsOn = was.beats; g.zombies.enabled = was.z; g.raiderTimer = was.r; g.convoy.next = was.conv; g.sky.time = was.hour; g.godMode = was.god;
    for (const id of made) g.citygen.remove(id);
    S.scan();
    g.citygen.enabled = was.cg;
    await C('teleport', { x: -16, z: -16 });
  }
}
