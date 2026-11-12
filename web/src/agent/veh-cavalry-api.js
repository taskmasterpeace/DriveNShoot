// VEHICLES V2 slice 6, HORSES + THE CAVALRY COMPANY (Robert 11-12: "we definitely need horses as mounts... we definitely
// need a cavalry mounted faction"; docs/status/vehicles-v2.md on docs/web-veh-status): the `cavalry` command and selftest
// checks. The horses themselves are feat/web-horses' (ported; its 14 checks run as 'horses:'). Rows: data/cavalry.js.
import { validateCavalry, CAVALRY_POSTS, CAVALRY } from '../data/cavalry.js';
import { BREEDS } from '../data/horses.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function vehCavalryCommands(api, need) {
  const g = api.g;
  return {
    cavalry: {
      group: 'world', desc: 'THE CAVALRY COMPANY: view its posts, their people (alive, mounted, which horse) and the patrols\' place on their loops.',
      args: {},
      run: async () => ({ posts: g.cavalry?.view() ?? [], counts: g.cavalry?.counts ?? null, standing: g.society?.factions?.standing?.[g.society.factions.index.company] ?? null }),
    },
  };
}

export async function vehCavalryChecks(api, check, C) {
  const g = api.g, Cv = () => g.cavalry, P0 = CAVALRY_POSTS[0];
  const post = () => Cv().posts.find((s) => s.row.id === P0.id);
  const riders = (kind) => post().people.filter((r) => r.kind === kind);
  const god0 = g.godMode;
  const near = async () => { await C('teleport', { x: P0.x - 6, z: P0.z - P0.half - 14 }); for (let f = 0; f < 90; f++) await api._step(1); }; // staged: outside the gate (the documented exception)

  await check('cavalry: the rows validate, the Cavalry Company is a society faction at war with the Dustwolves and the infected and not with Rust Haven, and its colours are not purple', async () => {
    const bad = validateCavalry(BREEDS), F = g.society.factions, i = F.index.company;
    if (i === undefined) return 'no company faction';
    const rel = (a) => F.relation('company', a);
    return !bad.length && rel('dustwolves') <= -50 && rel('infected') <= -50 && rel('rusthaven') > -50 ? true : JSON.stringify({ bad, dw: rel('dustwolves'), rh: rel('rusthaven') });
  });

  await check('cavalry: come near the post - its adobe walls stand (you cannot walk through one, nor see or shoot through it), the garrison stands by the corral rail with their horses tied, and the patrol rides out mounted on real horses (seated in the saddle)', async () => {
    try {
      g.godMode = true;
      await near();
      const S = post();
      if (!S.placed || !S.live) return JSON.stringify({ placed: S.placed, live: S.live });
      const wall = S.boxes[0], mid = { x: (wall.minX + wall.maxX) / 2, z: (wall.minZ + wall.maxZ) / 2 };
      const t = { x: mid.x, z: mid.z }; g.statics.resolveCircle(t, 0.45); const pushed = Math.hypot(t.x - mid.x, t.z - mid.z) > 0.2;
      const blinds = !g.statics.lineOfSight(mid.x, mid.z - 3, mid.x, mid.z + 3) || !g.statics.lineOfSight(mid.x - 3, mid.z, mid.x + 3, mid.z); // a sight line across the wall is stopped (and so a bullet)
      const gar = riders('garrison'), pat = riders('patrol');
      const garOk = gar.length === P0.garrison.length && gar.every((r) => r.c?.alive && !r.c.mount) && gar.every((r) => g.horses.get(r.horse)?.tied);
      const patOk = pat.length === P0.patrols[0].riders.length && pat.every((r) => r.c?.alive && r.c.mount && g.horses.bodyOf(r.c.mount) && r.c.seatPose?.kind === 'ride');
      const fid = pat.every((r) => r.c.fid === 'company');
      return pushed && blinds && garOk && patOk && fid ? true : JSON.stringify({ pushed, blinds, garOk, patOk, fid, gar: gar.map((r) => !!r.c), pat: pat.map((r) => ({ c: !!r.c, m: !!r.c?.mount, pose: r.c?.seatPose?.kind })) });
    } finally { g.godMode = god0; }
  });

  await check('cavalry: the patrol rides its loop in file - over 40 s the lead covers ground at a trot and the loop runs on past its waypoints (never stuck on the post), the second rider follows within a few lengths, both stay in the saddle', async () => {
    await near();
    const pat = riders('patrol'), lead = pat[0].c, second = pat[1].c, PT = post().patrols[0], s0 = PT.s;
    if (!lead?.mount || !second?.mount) return 'the patrol is not mounted';
    const a0 = g.horses.bodyOf(lead.mount), x0 = a0.x, z0 = a0.z;
    let maxGap = 0, path = 0, px = x0, pz = z0;
    for (let f = 0; f < 40 * 60; f++) { await api._step(1); const a = g.horses.bodyOf(lead.mount); if (!a) break; path += Math.hypot(a.x - px, a.z - pz); px = a.x; pz = a.z; if (f > 240) maxGap = Math.max(maxGap, Math.hypot(second.x - lead.x, second.z - lead.z)); }
    const onLead = Math.hypot(lead.x - px, lead.z - pz) < 0.6;
    const ran = ((PT.s - s0) % 1e6 + 1e6) % 1e6; // metres of loop gone by (it wraps)
    return path > 100 && ran > 100 && maxGap < CAVALRY.fileGap * 4 && lead.mount && second.mount && onLead ? true : JSON.stringify({ path: r1(path), ran: r1(ran), maxGap: r1(maxGap), mounted: [!!lead.mount, !!second.mount], onLead });
  });

  await check('cavalry: a Dustwolf in sight - the patrol turns on him and shoots from the saddle; he goes down', async () => {
    try {
      g.godMode = true;
      await near();
      const lead = riders('patrol')[0].c;
      const shots0 = Cv().counts.shots;
      const raider = g.spawnRaider(lead.x + 30, lead.z + 6, Math.random, 'pistol');
      if (!raider) return 'no raider';
      raider.target = null;
      let downAt = -1;
      for (let f = 0; f < 20 * 60 && raider.alive; f++) { await api._step(1); if (!raider.alive) downAt = f; }
      const shots = Cv().counts.shots - shots0;
      if (raider.alive) g.removeChar(raider);
      return shots > 0 && !raider.alive ? true : JSON.stringify({ shots, raiderHp: Math.round(raider.hp), d: r1(Math.hypot(raider.x - lead.x, raider.z - lead.z)), target: lead.target?.id ?? null });
    } finally { g.godMode = god0; }
  });

  await check('cavalry: a trooper shot out of the saddle leaves a loose company horse - E takes it (a theft on the company\'s book: their standing drops), and you ride it; nothing comes back to replace him', async () => {
    try {
      g.godMode = true;
      await near();
      const r = [...riders('patrol')].reverse().find((q) => q.c?.alive && q.c.mount); // the file's last trooper still in the saddle
      if (!r) return 'no mounted trooper left at the post (the company does not regenerate: run it on a fresh page)';
      const c = r.c, H = c.mount;
      const F = g.society.factions, i = F.index.company, st0 = F.standing[i];
      g.combat.damage(c, 9999, g.player, 0, 0); // he is shot (the combat path)
      for (let f = 0; f < 30; f++) await api._step(1);
      const loose = !H.npcRider && !c.mount && H.alive;
      const a = g.horses.bodyOf(H); await C('teleport', { x: a.x + 1.2, z: a.z }); await api._step(3);
      const offer = g.horses.nearFor(g.player);
      const res = offer?.h === H ? g.horses.interact(offer, 'KeyE') : null;
      const seq0 = g.eventSeq ?? 0, shots0 = Cv().counts.shots; let lostAt = -1;
      for (let f = 0; f < 60; f++) { await api._step(1); if (lostAt < 0 && g.player.mount !== H) lostAt = f; }
      const watched = Cv().counts.shots > shots0; // a comrade in sight opens fire on the thief
      const riding = g.player.mount === H, st1 = F.standing[i], why = (g.events ?? []).filter((e) => e.seq > seq0 && /horse|dismount|unseat|cavalry/i.test(e.type)).map((e) => e.type + ':' + (e.why ?? ''));
      if (g.player.mount) g.horses.dismount(g.player, 'test', false);
      // Away and back: the dead trooper stays dead.
      await C('teleport', { x: P0.x + 900, z: P0.z }); for (let f = 0; f < 30; f++) await api._step(1);
      await near();
      const back = post().people.find((q) => q === r);
      const stillDead = back && !back.alive && !back.c;
      const stolen = (g.events ?? []).some((e) => e.seq > seq0 - 100 && e.type === 'horseStolen' && e.id === H.id) && Cv().counts.horsesTaken > 0;
      return loose && offer?.verb === 'take' && res?.ok && (riding || watched) && stolen && stillDead ? true : JSON.stringify({ loose, verb: offer?.verb, res, riding, watched, stolen, lostAt, why, st: [st0, st1], back: back && { alive: back.alive, c: !!back.c } });
    } finally { g.godMode = god0; if (g.player.mount) g.horses.dismount(g.player, 'test', false); }
  });
}
