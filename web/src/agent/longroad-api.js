// THE LONG ROAD as COMMANDS rows and selftest checks (docs/design/WEB_LONG_ROAD.md; rows in src/data/longroad.js, live in
// src/systems/longroad.js). buildCommands() in api.js spreads longRoadCommands into COMMANDS; runSelfTest() calls
// longRoadChecks (only=long-road runs just these).
import { validateLongRoad, LONG_ROAD as LR, TRAVELLERS } from '../data/longroad.js';
import { ITEMS } from '../data/items.js';

export function longRoadCommands(api, need) {
  const g = api.g, sys = () => g.longroad;
  const view = (b) => ({ id: b.id, kind: b.kind, name: b.name, mile: b.mile, x: Math.round(b.x), z: Math.round(b.z), biome: b.biome, heading: b.dir > 0 ? 'east' : 'west', from: b.from, to: b.to,
    people: b.people.map((p) => ({ ...p, dead: !!sys().dead[p.id] })), live: !!sys().live[b.id], taken: !!sys().taken[b.id], met: !!sys().met[b.id], source: b.source });
  return {
    longRoad: {
      group: 'world', desc: 'THE LONG ROAD (docs/design/WEB_LONG_ROAD.md, rows in src/data/longroad.js): what a drive between towns has in it. action: audit (per game mile along I-10, what a driver can see or meet within sight of the road: signs, exits, towns, roadside sites, billboards, wayside beats; the DEAD stretches longer than maxGapS seconds at cruise; beats=false audits the road without the wayside, as it was) | beats (every wayside beat: kind, mile, the travellers with their origin and destination, its source) | beat id= | near (beats within r of you) | search id= (take a beat\'s cache, once) | trip (the journey under way and the finished trip logs) | end to=<town> (end the journey now, for testing) | validate (the rows).',
      args: { action: { type: 'string', default: 'audit', enum: ['audit', 'beats', 'beat', 'near', 'search', 'trip', 'end', 'validate'] }, id: { type: 'string' }, beats: { type: 'boolean', default: true }, r: { type: 'number', default: 1500 }, to: { type: 'string' }, force: { type: 'boolean', default: false }, gaps: { type: 'boolean', default: true } },
      run: async ({ action, id, beats, r, to, force, gaps }) => {
        const S = sys(); need(S && g.streamer?.W?.cl, 'the long road is not built (no streamer)');
        if (action === 'validate') return { ok: true, ...validateLongRoad(ITEMS) };
        if (action === 'audit') { const A = S.audit(beats); if (!gaps) delete A.gaps; return { ok: true, ...A }; }
        if (action === 'beats') { const B = S.build(), k = {}; for (const b of B) k[b.kind] = (k[b.kind] ?? 0) + 1; return { ok: true, count: B.length, kinds: k, beats: B.map(view) }; }
        if (action === 'beat') { const b = S.beatById(id); need(b, `no beat ${id}`); return { ok: true, ...view(b) }; }
        if (action === 'near') { const P = g.player; return { ok: true, beats: S.build().filter((b) => Math.hypot(b.x - P.x, b.z - P.z) < r).map(view) }; }
        if (action === 'search') { const b = S.beatById(id); need(b, `no beat ${id}`); return S.search(b, force); }
        if (action === 'trip') return { ok: true, trip: S.trip ? { from: S.trip.from, miles: +(S.trip.m / 1609.344).toFixed(1), minutes: +(S.trip.s / 60).toFixed(1), met: S.trip.met.length } : null, trips: S.trips };
        if (action === 'end') { need(S.trip, 'no journey under way'); return { ok: true, log: S.endTrip(to ?? 'HERE') }; }
        return { ok: false, error: `unknown action ${action}` };
      },
    },
  };
}

// ---- the selftest checks (names start "long-road:") -------------------------------------------------------------------
export async function longRoadChecks(api, check) {
  const g = api.g, S = g.longroad;
  if (!S || !g.streamer?.W?.cl) { await check('long-road: the long road is built', async () => 'no g.longroad / corridor'); return; }
  await check('long-road: the rows validate (beats, travellers, caches, view < wake < far)', async () => { const v = validateLongRoad(ITEMS); return v.ok || v.errors.slice(0, 4).join('; '); });
  await check(`long-road: no dead stretch on I-10 longer than ${LR.maxGapS} s of driving at ${LR.cruise} m/s`, async () => {
    const A = S.audit(true); return A.worstS <= LR.maxGapS || `${A.dead} dead stretches, worst ${A.worstS} s at mile ${A.gaps[0]?.from}`;
  });
  await check('long-road: the wayside only fills stretches that were dead (the road without it had them; every beat names its source)', async () => {
    const before = S.audit(false), B = S.build();
    if (!B.length) return before.dead ? 'dead stretches but no beats' : true;
    return (before.dead > 0 && B.every((b) => /^gap audit: I-10 mile/.test(b.source))) || 'a beat with no source, or beats on a road that had no gap';
  });
  await check('long-road: every traveller has an origin and a destination (real towns, or the open road), and a real flag', async () => {
    for (const b of S.build()) for (const p of b.people) {
      if (!b.from || !b.to || b.from === b.to) return `${p.id} ${p.name}: from ${b.from} to ${b.to}`;
      if (!/^[a-z]{2}$/.test(p.flag)) return `${p.id}: no flag`;
      if (!TRAVELLERS[p.role]) return `${p.id}: no role row`;
    }
    return true;
  });
  await check(`long-road: nothing spawns in view (a beat is made real only past ${LR.view} m, and back to its record past ${LR.far} m)`, async () => {
    const b = S.build().find((q) => q.people.length && !S.live[q.id]); if (!b) return 'no beat with people';
    const P = g.player, v = P.inVehicle; if (v) g.exitVehicle(true);
    const x0 = P.x, z0 = P.z;
    try {
      P.x = b.x + 60; P.z = b.z; S.t = 1; S.update(0);
      if (S.live[b.id]) return 'made real 60 m away (in view)';
      P.x = b.x + LR.view + 80; S.t = 1; S.update(0);
      if (!S.live[b.id]) return 'not made real inside wake, outside view';
      const ok = S.live[b.id].chars.every((c) => Math.hypot(c.x - P.x, c.z - P.z) > LR.view - 10) || 'a traveller stood in view';
      P.x = b.x + LR.far + 200; S.t = 1; S.update(0);
      return S.live[b.id] ? 'still real past far' : ok;
    } finally { P.x = x0; P.z = z0; S.t = 1; S.update(0); }
  });
  await check('long-road: a cache is taken once and stays taken (nothing regenerates); the save carries it', async () => {
    const b = S.build().find((q) => q.kind === 'body' || q.kind === 'wreck' || q.kind === 'checkpoint'); if (!b) return 'no cache beat';
    const saved = S.save(); delete S.taken[b.id];
    try {
      const a = S.search(b, true), again = S.search(b, true), round = (S.load(S.save()), !!S.taken[b.id]);
      return (a.ok && !again.ok && round) || `first ${a.ok} again ${again.ok} round ${round}`;
    } finally { S.load(saved); }
  });
  await check('long-road: a journey of more than 4 km ends in a trip log (from, to, miles, what you met)', async () => {
    const saved = S.save(), t0 = S.trip;
    try {
      S.trip = { from: 'TEST', m: 9000, s: 300, met: [S.build()[0]?.id].filter(Boolean), found: 0, fuel0: null, hp0: null, lx: 0, lz: 0, still: 0, day: 0, hour: 12 };
      const L = S.endTrip('THERE');
      return (L.miles > 5 && L.to === 'THERE' && L.met.length === (S.build().length ? 1 : 0)) || JSON.stringify(L);
    } finally { S.load(saved); S.trip = t0; }
  });
}
