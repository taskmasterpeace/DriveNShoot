// THE CAROUSEL for agents (docs/design/WEB_CAROUSEL.md): the `carousel` and `ringJump` commands, and the selftest's
// carousel checks (run inside runSelfTest, agent/api.js, with its check() and command caller; every check returns true or
// a JSON diagnostic). The checks drive the real paths (the console's E and its rows, the ring's spin on the sim clock, the
// station's generator, log and keypad); staging a station's power or code is the documented exception.
import { STATIONS, RING, SICK, JUMP_KINDS, RINGBORN, keyId, validateCarousel } from '../data/carousel.js';
import { ITEMS } from '../data/items.js';
import { ATLAS_XZ } from '../data/atlas.js';
import { CREW_BY_ID } from '../data/crew.js';
import { genLevel, planSite } from '../world/undergen.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function carouselCommands(api, need) {
  const g = api.g, Sys = () => g.carousel;
  const station = (id) => { const s = Sys().byId.get(id); need(s, `no ring "${id}" (stations: ${STATIONS.map((q) => q.id).join(', ')})`); return s; };
  const steps = async (secs) => { for (let t = 0; t < secs; t += 0.25) await api.call('step', { seconds: Math.min(0.25, secs - t) }); };
  // Stand on a station's ring deck (its level 2 made live; the far ones stream first), facing the door.
  const stage = async (s, o = {}) => {
    need(s.reach && s.site, `${s.name} is dark: its region (${s.region}) is not streamed`);
    const U = g.under, p = g.player;
    if (p.inVehicle) g.exitVehicle(true);
    if (U.A && U.A.site !== s.site) U.deactivate();
    await api.call('underground', { action: 'enter', id: s.site.id, level: 2 });
    const R = Sys().liveStation();
    need(R, `${s.name}: no ring room on its level 2`);
    const [q] = Sys().slots(R, 1);
    p.x = q.x; p.z = q.z; p.gy = R.y; g.standOn(p);
    g.camLook.x = p.x; g.camLook.z = p.z; g.camFloor = p.gy; g.updateCamera(0.016);
    const rec = U.rec(s.site);
    if (o.power) { U.setPower(true, 'staged'); if (rec.fuel <= 0) rec.fuel = 0.6; }
    if (o.code) U.learn(s.site, 'ring');
    if (o.arm) Sys().arm(s);
    return R;
  };
  return {
    carousel: {
      group: 'world',
      desc: 'THE CAROUSEL (docs/design/WEB_CAROUSEL.md; rows data/carousel.js; the machine systems/carousel.js; a station is an underground site of kind station). No args: every station (region, whether its region streams, its site, known, power, code learned, armed, the key in your pack, wear and bad-throw chance, distance), the live ring (station, state dormant|pending|armed|building|frantic|live|catching, centre, consoles, blast door, on the deck), the spin, ring-sick stacks and their effects, the last ring, rings known, where your rig was left, Ring-born, counters. action=validate: the rows and every station level proved. action=stage id=<station>: stand on its ring deck (level 2), power=true code=true arm=true stage its generator, the code learned, the ring armed. action=power|code|arm on the live station (code: as if you had read its card). action=key give=<station> [n=]: put its access key in your pack (give=blank|cutter: a blank, a keycutter\'s kit). action=sick n=<0..5>: set ring-sick stacks. action=console: open the live ring\'s console panel (its rows). action=pick choice=<row id> (arm | roulette | backspin | pair:<station> | cut | leave): pick a row the way the panel does. action=ringborn station=<id>: the Ring-born start (black, hum, ring-sick, a starter crew, then the blast door).',
      args: { action: { type: 'string', default: 'status', enum: ['status', 'validate', 'stage', 'power', 'code', 'arm', 'key', 'sick', 'console', 'pick', 'ringborn'] }, id: { type: 'string' }, power: { type: 'boolean' }, code: { type: 'boolean' }, arm: { type: 'boolean' },
        give: { type: 'string' }, n: { type: 'number' }, choice: { type: 'string' }, station: { type: 'string' } },
      run: async ({ action, id, power, code, arm, give, n, choice, station: st }) => {
        const S = Sys(), U = g.under;
        const live = () => { const R = S.liveStation(); need(R, 'no ring is live: carousel action=stage id=<station>'); return R; };
        if (action === 'validate') {
          const bad = validateCarousel(STATIONS, { items: ITEMS, bases: ATLAS_XZ.bases, crew: CREW_BY_ID, holdouts: g.streamer?.W?.holdouts?.map((h) => h.id) });
          const levels = [];
          for (const s of S.stations) {
            if (!s.site) continue;
            const row = U.rowOf(s.site);
            for (let k = 1; k <= 2; k++) {
              const L = genLevel(row, k), deck = L.rooms.find((r) => r.type === 'ringdeck'), d = deck ? L.doors.find((q) => q.room === deck.id) : null;
              levels.push({ site: s.site.id, k, proof: L.proof.ok, unreached: L.proof.unreached, rooms: L.rooms.map((r) => r.type), deck: !!deck, door: d ? { blast: d.blast, keypad: d.keypad, locked: d.locked } : null, gen: !!L.generator, logs: L.logs.map((q) => q.id), people: L.spawns.length, inDeck: deck ? L.spawns.filter((q) => q.x > deck.x0 && q.x < deck.x1 && q.z > deck.z0 && q.z < deck.z1).length : 0 });
            }
          }
          return { ok: !bad.length, errors: bad, stations: S.stations.length, lit: S.stations.filter((s) => s.reach).length, levels };
        }
        if (action === 'stage') { const s = station(id); await stage(s, { power, code, arm }); return S.view(true); }
        if (action === 'power') { const R = live(); U.setPower(on(power), 'staged'); if (U.A.rec.fuel <= 0) U.A.rec.fuel = 0.6; return { station: R.station.id, state: S.stateOf(R.station) }; }
        if (action === 'code') { const R = live(); U.learn(R.station.site, 'ring'); return { station: R.station.id, code: S.code(R.station) }; }
        if (action === 'arm') { const R = live(); const r = S.arm(R.station); need(r.ok, r.why); return { ...r, state: S.stateOf(R.station) }; }
        if (action === 'key') {
          need(give, 'give=<station>|blank|cutter');
          const item = give === 'blank' ? 'key_blank' : give === 'cutter' ? 'keycutter' : keyId(station(give).id);
          g.inventory.stow(item, n ?? 1);
          return { item, carried: g.inventory.carried.count(item), keys: S.keysCarried() };
        }
        if (action === 'sick') { need(Number.isFinite(n), 'n=<0..5>'); S.setSick(n); g.survival.update(0); return { sick: S.st.sick, fx: S.sickFx() ? { ...S.sickFx() } : null, sway: +g.needs.sway.toFixed(3), vignette: g.needs.vignette }; }
        if (action === 'console') { const R = live(); S.ui.show(R.station); return { open: S.ui.open, rows: S.ui.rows }; }
        if (action === 'pick') {
          need(S.ui.open, 'the console is not open (action=console)');
          const i = S.ui.rows.findIndex((r) => r.id === choice);
          need(i >= 0, `no row ${choice}; rows: ${S.ui.rows.map((r) => r.id).join(', ')}`);
          S.ui.sel = i; const r = S.ui.pick();
          return { result: r, open: S.ui.open, rows: S.ui.open ? S.ui.rows : null, spin: S.spin };
        }
        if (action === 'ringborn') { const r = S.ringBorn({ station: st ?? null }); need(r.ok, r.why); return r; }
        return S.view(true);
      },
    },
    ringJump: {
      group: 'world', budget: 60,
      desc: `A throw from the live ring through the real path: the spin (${RING.spin + RING.live} s of sim: building, frantic, live), then the throw. kind=${Object.keys(JUMP_KINDS).join('|')}; to=<station> for pair (its key must be in your pack). PAIR and ROULETTE need the ring armed; BACKSPIN needs only power and a last ring. from=<station> stage=true stands you on that ring's deck first, powered, its code learned and armed. Returns where you came out (station, region, site, level), who came (crew, dogs), whether it threw badly, ring-sick stacks after, and where your rig stayed. Never moves a vehicle.`,
      args: { kind: { type: 'string', required: true, enum: Object.keys(JUMP_KINDS) }, to: { type: 'string' }, from: { type: 'string' }, stage: { type: 'boolean', default: false } },
      run: async ({ kind, to, from, stage: st }) => {
        const S = Sys();
        if (st) { need(from, 'stage=true needs from=<station>'); await stage(station(from), { power: true, code: true, arm: true }); }
        const r = S.start(kind, to ?? null);
        need(r.ok, r.why);
        const n0 = S.counts.throws, a0 = S.counts.aborted;
        for (let t = 0; t < RING.spin + RING.live + 3 && S.counts.throws === n0 && S.counts.aborted === a0; t += 0.25) await api.call('step', { seconds: 0.25 });
        need(S.counts.throws > n0, S.counts.aborted > a0 ? 'the throw was aborted (off the deck)' : 'the ring never threw');
        return { ...S.lastThrow, now: { ug: g.player.ug ?? null, x: r1(g.player.x), z: r1(g.player.z), gy: r1(g.player.gy) } };
      },
    },
  };
  function on(v) { return v === undefined ? true : !!v; }
}

// ---- the selftest (docs/design/WEB_CAROUSEL.md §8) ----------------------------------------------------------------------
export async function carouselChecks(api, check, C) {
  const g = api.g, S = g.carousel, U = g.under, K = g.crew, p = g.player;
  const steps = async (secs) => { for (let t = 0; t < secs; t += 0.25) await C('step', { seconds: Math.min(0.25, secs - t) }); };
  const press = async (code) => { g.input.down.add(code); g.input.pressed.add(code); await api._step(1); g.input.down.delete(code); await api._step(1); };
  const clearCrew = () => { for (const m of [...K.members]) { K.leave(m, 'dismissed', false); if (m.c) g.removeChar(m.c); } K.drag = null; };
  const join = async (row) => { const r = await C('crewJoin', { spawn: row }); return r.ok ? K.byAny(String(r.rec)) : null; };
  const home = async () => {
    if (S.ui.open) S.ui.close();
    S.spin = null;
    if (U.A) U.deactivate();
    p.gy = 0; p.ug = null;
    await C('teleport', { x: 0, z: -40 });
    await api._step(3);
  };
  // Every carousel check runs inside this: calm (no hordes, no raids), the crew empty, the ring's state fresh; home after.
  const stage = async (fn) => {
    const zOn = g.zombies.enabled, rt = g.raiderTimer;
    g.zombies.enabled = false; g.raiderTimer = 1e9;
    clearCrew(); S.reset(); S.setSick(0);
    await C('setTime', { hour: 10 }); await C('setWeather', { key: 'CLEAR', instant: true });
    const hp = p.hp;
    try { return await fn(); }
    finally {
      g.zombies.enabled = zOn; g.raiderTimer = rt; p.hp = hp;
      clearCrew(); S.reset(); S.setSick(0); g.survival.update(0);
      for (const id of ['key_blank', 'keycutter', ...STATIONS.map((s) => keyId(s.id))]) { const n = g.inventory.carried.count(id); if (n) g.inventory.spend(id, n); }
      await home();
    }
  };

  await check('carousel: the rows validate (stations, kinds, ring-sick knobs, keys, Ring-born) and every lit station\'s two levels are proved, its ring room behind a keyed blast door with nobody inside it', async () => {
    const r = await C('carousel', { action: 'validate' });
    const bad = r.levels.filter((L) => !L.proof || (L.k === 2 && (!L.deck || !L.door?.blast || L.door.keypad !== 'ring' || !L.door.locked || L.inDeck)) || (L.k === 1 && !L.gen));
    const card = r.levels.some((L) => L.k === 2 && L.logs.includes('ring_card'));
    return r.ok && r.lit >= 3 && !bad.length && card && STATIONS.some((s) => s.region === 'arizona') && S.stations.some((s) => s.region === 'florida' && s.reach) && S.stations.some((s) => !s.reach)
      ? true : JSON.stringify({ errors: r.errors, lit: r.lit, bad: bad.slice(0, 3), card });
  });

  await check('carousel: a station wakes by its ladder - dead keypad, the generator, the ring\'s card, the keypad opens the blast door; the ring reads dormant -> pending -> armed', () => stage(async () => {
    const s = S.byId.get('papago'), out = {};
    if (U.A?.site === s.site) U.deactivate();
    U.recs.delete(s.site.id); U.lvl.delete(`${s.site.id}:1`); U.lvl.delete(`${s.site.id}:2`); // the station as it was made: dark, sealed
    await C('underground', { action: 'enter', id: s.site.id, level: 2 });
    const R = S.liveStation(); if (!R) return 'no ring room live';
    out.dormant = S.stateOf(s);
    const door = R.door; if (!door) return 'no blast door';
    const kp0 = await C('underground', { action: 'keypad', door: door.id }).catch((e) => ({ ok: false, why: String(e.message) }));
    out.deadKeypad = !kp0.ok;
    await C('generator', { action: 'start', fuel: 0.6, force: true });
    out.pending = S.stateOf(s);
    const logs = []; for (const P of U.A.levels.values()) for (const L of P.logs) logs.push(L.id);
    const rd = await C('underground', { action: 'read', log: 'ring_card', force: true });
    out.code = rd.code;
    const kp = await C('underground', { action: 'keypad', door: door.id });
    out.open = kp.ok && !door.locked;
    // E at a console opens the panel; its first row arms the ring (the real keys)
    const c0 = R.consoles[0]; p.x = c0.x + (R.cx > c0.x ? 1.1 : -1.1); p.z = c0.z; g.standOn(p);
    let opened = false;
    for (let i = 0; i < 6 && !opened; i++) { await press('KeyE'); opened = S.ui.open; if (!opened) { p.z += (R.cz > c0.z ? 0.4 : -0.4); g.standOn(p); } }
    out.opened = opened;
    if (opened) { await press('Digit1'); }
    out.armed = S.stateOf(s);
    if (S.ui.open) S.ui.close();
    out.visible = S.group.visible;
    return out.dormant === 'dormant' && out.deadKeypad && out.pending === 'pending' && out.code === 'ring' && out.open && out.opened && out.armed === 'armed' && out.visible ? true : JSON.stringify({ ...out, logs });
  }));

  await check('carousel: the ring\'s look follows the spin (building, then frantic, the vortex coming up) and stepping off the deck spins it down', () => stage(async () => {
    const s = S.byId.get('papago');
    await C('carousel', { action: 'stage', id: 'papago', power: true, code: true, arm: true });
    const r = S.start('roulette'); if (!r.ok) return `start: ${r.why}`;
    await steps(1);
    const b = S.stateOf(s), v1 = S.vortexMat.opacity;
    await steps(2);
    const f = S.stateOf(s), v2 = S.vortexMat.opacity;
    const seq = g.eventSeq, R = S.live;
    p.x = R.cx + RING.platformR + 2.2; p.z = R.cz; g.standOn(p);
    await steps(0.5);
    const aborted = g.events.some((e) => e.seq > seq && e.type === 'ringAbort');
    return b === 'building' && f === 'frantic' && v2 > v1 && aborted && !S.spin && S.counts.throws === 0 ? true : JSON.stringify({ b, f, v1, v2, aborted, spin: S.spin, throws: S.counts.throws });
  }));

  await check('carousel: ROULETTE from Phoenix lands you and your crew in a station in another region, the rig stays where it was parked, ring-sick applies and decays one stack a rest (gap acceptance 9)', () => stage(async () => {
    const out = {};
    // the rig: a pickup parked by the hatch on the street, the last thing you drove
    const s = S.byId.get('papago');
    await C('carousel', { action: 'stage', id: 'papago' });
    const top = planSite(U.rowOf(s.site)).flights[0].top;
    const v = g.vehiclesSys.spawn('pickup', top.x + 9, top.z + 6, 0.3, '#5d6b4a');
    g.lastVehicle = v; const vx = v.x, vz = v.z, vhp = v.hp;
    await C('carousel', { action: 'stage', id: 'papago', power: true, code: true, arm: true });
    const a = await join('wall_veteran'), b = await join('field_medic');
    if (!a || !b) return 'crew did not join';
    const R = S.live, sl = S.slots(R, 3);
    [a, b].forEach((m, i) => { m.c.x = sl[i + 1].x; m.c.z = sl[i + 1].z; m.c.gy = R.y; g.standOn(m.c); });
    const j = await C('ringJump', { kind: 'roulette' });
    out.j = { to: j.to, region: j.region, bad: j.bad, crew: j.crew.length, sick: j.sick };
    const here = S.byId.get(j.to);
    out.ug = p.ug; out.rigStays = g.vehicles.includes(v) && Math.hypot(v.x - vx, v.z - vz) < 0.01 && v.hp === vhp && S.st.rig?.id === v.id;
    out.crewWith = [a, b].every((m) => m.c && m.c.ug === p.ug && Math.abs(m.c.gy - p.gy) < 0.5 && Math.hypot(m.c.x - p.x, m.c.z - p.z) < 6);
    out.far = Math.round(Math.hypot(p.x - vx, p.z - vz));
    // the decay: 20 game minutes of rest takes one stack (the clock moved by hand; nobody after you)
    const s0 = S.st.sick;
    await C('setTime', { hour: g.sky.time + (SICK.decayMin + 1) / 60 }); await api._step(2);
    out.decay = [s0, S.st.sick];
    return j.region !== 'arizona' && here?.region === j.region && out.ug === here.site.id && out.rigStays && out.crewWith && out.far > 100000 && s0 >= 1 && S.st.sick === s0 - 1 && S.st.last === 'papago'
      ? true : JSON.stringify(out);
  }));

  await check('carousel: PAIR wants the key of where you are going - refused without it, thrown there with it (the key stays in your pack)', () => stage(async () => {
    await C('carousel', { action: 'stage', id: 'meridian', power: true, code: true, arm: true });
    const no = S.start('pair', 'papago');
    await C('carousel', { action: 'key', give: 'papago' });
    const j = await C('ringJump', { kind: 'pair', to: 'papago' });
    return !no.ok && /key/.test(no.why) && j.to === 'papago' && p.ug === 'ring_papago' && g.inventory.carried.count(keyId('papago')) === 1 && j.sick === SICK.gain.pair ? true : JSON.stringify({ no, j: { to: j.to, sick: j.sick }, ug: p.ug });
  }));

  await check('carousel: BACKSPIN needs no key and no code - back to the last ring you came out of, one more stack of ring-sick', () => stage(async () => {
    await C('carousel', { action: 'stage', id: 'meridian', power: true, code: true, arm: true });
    await C('carousel', { action: 'key', give: 'papago' });
    await C('ringJump', { kind: 'pair', to: 'papago' });
    await C('carousel', { action: 'power' }); // papago's generator (its code never learned, never armed)
    const s0 = S.st.sick, armed = S.armed(S.byId.get('papago'));
    g.inventory.spend(keyId('papago'), 1); g.inventory.spend(keyId('meridian'), 9);
    const j = await C('ringJump', { kind: 'backspin' });
    return !armed && j.to === 'meridian' && p.ug === 'ring_meridian' && S.st.sick === s0 + 1 && S.st.last === 'papago' ? true : JSON.stringify({ armed, to: j.to, ug: p.ug, s0, s1: S.st.sick, last: S.st.last });
  }));

  await check('carousel: keys are things - found in a ring room\'s boxes, kept by a trader, and a keycutter cuts a blank at a console', () => stage(async () => {
    const lootOk = Object.keys(ITEMS).filter((k) => k.startsWith('ringkey_')).length === STATIONS.length && !!ITEMS.key_blank && !!ITEMS.keycutter;
    const rk = (await import('../data/items.js')).LOOT.ring_keys, keyRows = rk?.rows.filter((r) => r[0].startsWith('ringkey_')).length ?? 0;
    const trade = (await import('../data/trade.js')).TRADERS.kenji?.keeps?.some((k) => k[0] === 'key_blank');
    await C('carousel', { action: 'stage', id: 'papago', power: true });
    await C('carousel', { action: 'key', give: 'cutter' }); await C('carousel', { action: 'key', give: 'blank' });
    await C('carousel', { action: 'console' });
    const r = await C('carousel', { action: 'pick', choice: 'cut' });
    if (S.ui.open) S.ui.close();
    return lootOk && keyRows >= 3 && trade && r.result?.ok && g.inventory.carried.count(keyId('papago')) === 1 && g.inventory.carried.count('key_blank') === 0 ? true : JSON.stringify({ lootOk, keyRows, trade, r: r.result });
  }));

  await check('carousel: ring-sick folds into the one consumers - aim spread +6% a stack (needs.sway), the REST edges, the microsleep from 4, the swimming edges on screen', () => stage(async () => {
    g.survival.update(0); const sw0 = g.needs.sway, vg0 = g.needs.vignette;
    const r = await C('carousel', { action: 'sick', n: 4 });
    const blur = S.ui.blurEl.style.opacity === '1' && /blur/.test(S.ui.blurEl.style.backdropFilter ?? S.ui.blurEl.style.webkitBackdropFilter ?? '');
    const want = Math.min(1.7, sw0 * (1 + SICK.spread * 4));
    const ok = Math.abs(r.sway - want) < 0.02 && r.vignette >= Math.max(vg0, SICK.vignette * 4) - 1e-9 && r.fx.micro && blur;
    await C('carousel', { action: 'sick', n: 0 });
    return ok && g.needs.sway <= sw0 + 1e-6 && S.ui.blurEl.style.opacity === '0' ? true : JSON.stringify({ sw0, r, want, blur });
  }));

  await check('carousel: save -> load keeps the last ring, rings known, keys, ring-sick and where the rig was left', () => stage(async () => {
    const v = g.vehiclesSys.spawn('pickup', 30, 6, 0, '#5d6b4a'); g.lastVehicle = v;
    await C('carousel', { action: 'stage', id: 'papago', power: true, code: true, arm: true });
    await C('carousel', { action: 'key', give: 'gila' });
    const j = await C('ringJump', { kind: 'roulette' });
    const want = { last: S.st.last, known: [...S.st.known].sort().join(), sick: S.st.sick, rig: S.st.rig?.id, ug: p.ug };
    const sv = JSON.parse(JSON.stringify((await C('save')).save)); // as a file would hold it (in-page, its slots are the live ones)
    S.reset(); S.setSick(0); g.inventory.spend(keyId('gila'), 9);
    await C('load', { save: sv }); await api._step(2);
    const got = { last: S.st.last, known: [...S.st.known].sort().join(), sick: S.st.sick, rig: S.st.rig?.id, ug: p.ug };
    return j.ok !== false && JSON.stringify(want) === JSON.stringify(got) && g.inventory.carried.count(keyId('gila')) === 1 && want.rig === v.id ? true : JSON.stringify({ want, got, key: g.inventory.carried.count(keyId('gila')) });
  }));

  await check('carousel: Ring-born opens on black on a ring deck in a station, a starter crew beside you, ring-sick, and the blast door opens after the hold', () => stage(async () => {
    const r = await C('carousel', { action: 'ringborn', station: 'meridian' });
    const black = +S.ui.blackEl.style.opacity, door0 = S.live?.door?.locked;
    const crewOk = K.members.length === RINGBORN.crew.length && K.members.every((m) => m.c && m.c.ug === p.ug && Math.abs(m.c.gy - p.gy) < 0.5 && m.c.flag);
    const sick = S.st.sick;
    await steps(RINGBORN.black + 0.6);
    const door1 = S.live?.door?.locked;
    return r.ok && p.ug === 'ring_meridian' && black >= 0.99 && door0 === true && door1 === false && crewOk && sick === RINGBORN.sick && S.st.ringborn && S.onDeck(p) ? true : JSON.stringify({ r: { ok: r.ok, station: r.station, crew: r.crew?.length }, ug: p.ug, black, door0, door1, crewOk, sick });
  }));
}
