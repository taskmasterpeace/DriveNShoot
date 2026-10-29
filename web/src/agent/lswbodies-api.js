// LSW-BODIES as COMMANDS rows and selftest checks (docs/design/WEB_LSW_BODIES.md; systems/lswbodies.js, data/lswbodies.js).
// buildCommands() in api.js spreads lswBodiesCommands into COMMANDS; runSelfTest calls lswBodiesChecks.
import { LSW_RULES, validateLswBodies } from '../data/lswbodies.js';
import { outfit } from '../systems/characters.js';
import { FLAG_KEYS } from '../ui/portrait.js';

const r2 = (v) => Math.round(v * 100) / 100;
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function statsOf(g) {
  const L = g.charR.lsw, S = L.stats;
  const people = [];
  for (const c of g.chars) if (L.drawn[c.slot]) { const r = L.recipeOf[c.slot]; people.push({ id: c.id, name: c.name, preset: r?.preset, sex: r?.female ? 'female' : 'male', frame: r?.frame, muscle: r && r2(r.muscle), hair: r?.hair ?? (r ? 'classic piece' : null), face: r?.face, flag: FLAG_KEYS[L.flagOf[c.slot]], pose: c._pose }); }
  return {
    mode: L.mode, ready: L.ready, error: L.error, near: L.nearN, maxNear: L.rules.maxNear, drawn: S.drawn, flags: L.flagN,
    meshes: L.bodies.map((B) => ({ name: B.mesh.name, count: B.count, triangles: B.mesh.geometry.index.count / 3 })),
    drawCallsAdded: L.bodies.reduce((a, B) => a + (B.count ? 2 : 0), 0) + (L.flagN ? 1 : 0), // each body mesh: the lit pass + the shadow pass
    cpuMsPerFrame: S.frames ? Math.round((S.ms / S.frames) * 1000) / 1000 : 0, frames: S.frames, people,
  };
}

export function lswBodiesCommands(api, need) {
  const g = api.g;
  return {
    bodies: {
      group: 'render', desc: 'LSW-BODIES (docs/design/WEB_LSW_BODIES.md): the people nearest you wear Robert\'s Living Superweapon bodies (Quaternius CC0 skinned meshes, standard / female / lean / heavy by voice and build), posed by the same joint solver as the classic rig; the rest stay classic. action=stats (default): mode, how many are near, who wears which body and flag, the GPU draw calls it adds, CPU ms per frame. action=mode value=lsw|classic: switch (saved with the settings; the pause menu has it too). action=near n=0..32: how many wear LSW bodies. reset=true zeroes the cost counters.',
      args: { action: { type: 'string', enum: ['stats', 'mode', 'near'], default: 'stats' }, value: { type: 'string', enum: ['lsw', 'classic'] }, n: { type: 'number' }, reset: { type: 'boolean' } },
      run: async (a) => {
        const L = g.charR.lsw;
        if (a.reset) { L.stats.ms = 0; L.stats.frames = 0; }
        if (a.action === 'mode') {
          need(a.value === 'lsw' || a.value === 'classic', 'value=lsw or value=classic');
          L.setMode(a.value);
          if (g.qol) { g.qol.settings.bodies = a.value; g.qol.saveSettings(); }
        } else if (a.action === 'near') {
          need(Number.isFinite(a.n), `n=0..${L.rules.maxNear}`);
          L.nearN = Math.max(0, Math.min(L.rules.maxNear, Math.round(a.n)));
        }
        return statsOf(g);
      },
    },
  };
}

export async function lswBodiesChecks(api, check, C) {
  const g = api.g, L = g.charR.lsw;
  const STAGE = { x: 250, z: 470 }; // the south-east flats: open desert, nobody about
  const staged = [];
  const add = (faction, dx, dz, set = {}, weapon = null, flag = 'US') => {
    const c = g.addChar({ x: STAGE.x + dx, z: STAGE.z + dz, faction, weapon, colors: outfit(faction), name: set.name ?? `Lsw Test ${staged.length}`, flag, hp: 100 });
    c.home = { x: c.x, z: c.z }; c.wx = c.x; c.wz = c.z; c.hold = true; c.face = 0;
    Object.assign(c, set); g.society.factions.assign(c);
    staged.push(c);
    return c;
  };
  const vehicles = [];
  const clean = () => {
    for (const c of staged) { if (c.onDeck) g.decks.dismount(c, 'test', true); if (c.inVehicle) g.seats.leave(c, true); if (g.chars.includes(c)) g.removeChar(c); }
    for (const v of vehicles) if (g.vehicles.includes(v)) g.vehiclesSys.remove(v);
    staged.length = 0; vehicles.length = 0;
  };
  // The pose pass alone (no world step): what the renderer draws from the state as it stands.
  const frame = () => { L.was.fill(0); g.charR.sync(g.chars, 0); };
  const stage = async (fn) => {
    const mode = L.mode, n = L.nearN;
    await C('teleport', { x: STAGE.x, z: STAGE.z - 6 });
    for (const c of [...g.chars]) if (c !== g.player && !c.inVehicle && Math.hypot(c.x - STAGE.x, c.z - STAGE.z) < 80 && !staged.includes(c)) g.removeChar(c);
    L.setMode('lsw'); L.nearN = LSW_RULES.near;
    try { return await fn(); } finally { clean(); L.setMode(mode); L.nearN = n; }
  };
  // How far each LSW bone sits from the solver joint it was driven to (m).
  const gaps = (c) => {
    const b = L.bones(c, ['thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r', 'hand_l', 'hand_r']);
    if (!b) return null;
    const S = L.solver, o = c.slot * 24, J = (k) => [S[o + k], S[o + k + 1], S[o + k + 2]];
    const bh = c.build?.h ?? 1, lift = L.bodies[L.meshOf[c.slot]].J.foot_l.y * LSW_RULES.boot[1] - 0.08;
    return {
      // the booted foot rides lift m above DSOA's ankle (its sole on the ground)
      legs: Math.max(dist3(b.thigh_l, J(0)), dist3(b.calf_l, J(3)), Math.abs(dist3(b.foot_l, J(6)) - lift), dist3(b.thigh_r, J(12)), dist3(b.calf_r, J(15)), Math.abs(dist3(b.foot_r, J(18)) - lift)),
      // the LSW wrist sits one palm (LSW_RULES.palm) short of DSOA's hand point, which is the grip
      hands: Math.max(Math.abs(dist3(b.hand_l, J(9)) - LSW_RULES.palm * bh), Math.abs(dist3(b.hand_r, J(21)) - LSW_RULES.palm * bh)),
      b,
    };
  };
  const classicHidden = (c) => { const e = g.charR.meshes.torso.instanceMatrix.array, o = c.slot * 16; return Math.abs(e[o]) + Math.abs(e[o + 5]) + Math.abs(e[o + 10]) < 1e-6; };

  await check('lsw-bodies: the rows are valid (validateLswBodies) and the faceted kit loaded - LSW modular-hero, 53 ual-deform-v1 bones, 46 modules, six faces; provenance on disk names the studio licence and its source sha256', async () => {
    await L.loaded;
    const bad = validateLswBodies();
    if (!L.ready) bad.push(`not ready: ${L.error}`);
    if (L.bodies.length !== 1 || L.bodies[0].names.length !== 53) bad.push(`bodies ${L.bodies.map((B) => B.names.length)}`);
    const base = `${(import.meta.env?.BASE_URL ?? '/')}models/lsw-faceted/`;
    const meta = await (await fetch(`${base}kit.json`)).json();
    if (meta.skeleton !== 'ual-deform-v1' || meta.modules.length !== 46 || Object.keys(meta.faces).length !== 6) bad.push(`kit ${meta.skeleton} ${meta.modules.length} modules ${Object.keys(meta.faces).length} faces`);
    if (!/^[0-9a-f]{64}$/.test(meta.source?.sha256 ?? '')) bad.push('no source sha256');
    const prov = await (await fetch(`${base}PROVENANCE.md`)).text();
    if (!/Proprietary-Internal/.test(prov) || !prov.includes(meta.source.sha256)) bad.push('PROVENANCE.md missing the licence or the source sha256');
    if (/superhero/i.test(JSON.stringify(meta.modules))) bad.push('a superhero part is in the kit');
    return bad.length ? bad.join('; ') : true;
  });

  await check('lsw-bodies: every person gets their OWN faceted body (the generator) - a warden wears the cop preset, a raider the gang preset, a woman (by voice) the nurse preset with the narrow waist, grey hair the elder (glasses); builds pick the frame, hair styles the hair module (the classic hair piece steps aside), and no two of a dozen drifters are identical', () => stage(async () => {
    const out = [];
    const mk = (f, x, z, colors, name) => { const c = add(f, x, z, { name }); if (colors) { c.colors = { ...c.colors, ...colors }; g.charR.paint(c); } return c; };
    const cop = mk('warden', -2, 1, { hatStyle: 'short', hair: '#2a1a10' }, 'Frank Hollis'), gang = mk('raider', -1, 1, { hatStyle: 'short', hair: '#1b1410' }, 'Dax Moreno');
    const woman = mk('drifter', 0, 1, { hatStyle: 'long', hair: '#3a2416' }, 'Lucia Lopez'), old = mk('drifter', 1, 1, { hatStyle: 'short', hair: '#c8c4bc' }, 'Walter Reed');
    const crowd = []; for (let k = 0; k < 12; k++) crowd.push(add('drifter', (k % 6) - 3, 3 + Math.floor(k / 6)));
    await api._step(1); frame();
    const R = (c) => L.recipeOf[c.slot];
    if (!L.drawn[cop.slot] || R(cop)?.preset !== 'cop-off-duty') out.push(`warden -> ${R(cop)?.preset}`);
    if (R(gang)?.preset !== 'gang-member' || R(gang)?.hair !== 'braids') out.push(`raider -> ${R(gang)?.preset}/${R(gang)?.hair}`);
    if (R(woman)?.preset !== 'nurse' || !R(woman)?.female || R(woman)?.hair !== 'bun' || L.look[woman.slot * 8 + 4] !== 1) out.push(`woman -> ${JSON.stringify(R(woman))}`);
    if (R(old)?.preset !== 'elder' || !R(old)?.glasses) out.push(`grey hair -> ${R(old)?.preset}`);
    if (!L.ownsHair(cop)) out.push('a short-haired head kept the classic hair piece');
    const keys = new Set(crowd.filter((c) => L.drawn[c.slot]).map((c) => JSON.stringify([R(c), [...L.look.subarray(c.slot * 8, c.slot * 8 + 8)], c.colors.shirt, c.colors.pants])));
    if (keys.size < 12) out.push(`only ${keys.size} distinct bodies in 12 drifters`);
    const frames = new Set(crowd.map((c) => R(c)?.frame)); if (frames.size < 2) out.push(`one frame for everyone: ${[...frames]}`);
    return out.length ? out.join('; ') : true;
  }));

  await check('lsw-bodies: the nearest N people (24) wear LSW bodies and everyone else the classic rig - the near set is exactly the 24 nearest you, their classic bodies step aside, the far ones stay drawn classic', () => stage(async () => {
    for (let k = 0; k < 36; k++) { const a = k * 2.4, r = 3 + k * 0.9; add(k % 3 ? 'drifter' : 'warden', Math.sin(a) * r, 6 + Math.cos(a) * r, {}, k % 3 ? null : 'smg'); }
    await api._step(2); frame();
    const p = g.player, elig = g.chars.filter((c) => !c.hidden && !c.ownMesh && !(c.inVehicle && !c.seatPose));
    elig.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const want = new Set(elig.slice(0, LSW_RULES.near).map((c) => c.slot));
    const got = new Set(g.chars.filter((c) => L.drawn[c.slot]).map((c) => c.slot));
    const miss = [...want].filter((s) => !got.has(s)), extra = [...got].filter((s) => !want.has(s));
    if (miss.length || extra.length) return `near set wrong: missing ${miss} extra ${extra}`;
    const far = elig.slice(LSW_RULES.near).filter((c) => staged.includes(c));
    if (!far.length) return 'no far staged person to compare';
    const hidden = [...got].filter((s) => !classicHidden({ slot: s })).length, shown = far.filter((c) => classicHidden(c)).length;
    const count = L.bodies.reduce((a, B) => a + B.count, 0);
    return !hidden && !shown && count === LSW_RULES.near ? true : `classic not hidden on ${hidden} near; hidden on ${shown} far; GPU rows ${count}`;
  }));

  await check('lsw-bodies: a standing, crouching, prone, seated (bike), deck-riding (pickup bed) and dead person\'s LSW bones match the solver\'s joints - hips, knees, ankles within 3 cm, the hand one palm from the grip within 3 cm', () => stage(async () => {
    const out = [];
    const stand = add('drifter', 0, 0.5, { name: 'Stand Still' });
    const crouch = add('warden', 1.2, 0.5, { crouch: true, aiming: true, name: 'Kneel Aim' }, 'smg');
    const prone = add('warden', -1.4, 1.5, { aiming: true, name: 'Lay Flat' }, 'rifle');
    g.stance.setProne(prone, true);
    const dead = add('drifter', 2.5, 2, { name: 'Gone Now' });
    const bike = g.vehiclesSys.spawn('bike', STAGE.x - 2.5, STAGE.z + 1, 0, '#5a4a32'); vehicles.push(bike); bike.ai = null; bike.throttle = 0;
    const rider = add('drifter', -2.5, 1, { name: 'Ride Easy' });
    g.seats.board(rider, bike, 0);
    const truck = g.vehiclesSys.spawn('pickup', STAGE.x + 4.5, STAGE.z + 4, 0, '#5a4a32'); vehicles.push(truck); truck.ai = null; truck.throttle = 0;
    const bed = add('drifter', 4.5, 2, { name: 'Bed Rider' });
    await api._step(2);
    g.decks.mount(bed, truck, 0, -1.4, 'test');
    dead.hp = 0; dead.alive = false; dead.deadTime = 0;
    await api._step(2); frame();
    for (const c of [stand, crouch, prone, rider, bed, dead]) {
      const gp = gaps(c);
      if (!gp) { out.push(`${c.name}: not wearing an LSW body (pose ${c._pose}, seat ${!!c.seatPose}, deck ${!!c.onDeck})`); continue; }
      if (!(gp.legs < 0.03)) out.push(`${c.name}: legs ${r2(gp.legs)} m`);
      if (!(gp.hands < 0.03)) out.push(`${c.name}: hands ${r2(gp.hands)} m`);
    }
    if (!prone.prone) out.push('prone did not take');
    if (!rider.seatPose || !bed.onDeck) out.push(`rider seat ${!!rider.seatPose}, bed deck ${!!bed.onDeck}`);
    return out.length ? out.join('; ') : true;
  }));

  await check('lsw-bodies: hands stay on the gun - a two-hand SMG aim, a one-hand pistol, a rifle at low ready: both LSW hands end one palm from the grips the gun is placed at, the fingers closed', () => stage(async () => {
    const out = [];
    const two = add('warden', 0, 1, { aiming: true, name: 'Two Hands' }, 'smg');
    const one = add('drifter', 1.5, 1, { aiming: true, oneHand: true, name: 'One Hand' }, 'pistol');
    const low = add('warden', -1.5, 1, { name: 'Low Ready' }, 'rifle');
    await api._step(1); frame();
    for (const c of [two, one, low]) {
      const gp = gaps(c);
      if (!gp) { out.push(`${c.name}: no LSW body`); continue; }
      if (!['aim', 'low'].includes(c._pose)) out.push(`${c.name}: pose ${c._pose}`);
      if (c === one) { const fh = c.hand === 'L' ? 'hand_l' : 'hand_r', o = c.slot * 24 + (c.hand === 'L' ? 9 : 21); const d = dist3(gp.b[fh], [L.solver[o], L.solver[o + 1], L.solver[o + 2]]); if (Math.abs(d - LSW_RULES.palm) > 0.03) out.push(`one-hand grip ${r2(d)}`); }
      else if (!(gp.hands < 0.03)) out.push(`${c.name}: hands ${r2(gp.hands)} m off`);
    }
    return out.length ? out.join('; ') : true;
  }));

  await check('lsw-bodies: feet on the real terrain - an LSW body standing on the ground has its soles at the ground the solver stands it on (balls of the feet within 6 cm)', () => stage(async () => {
    const c = add('drifter', 0.5, 1, { name: 'Flat Foot' });
    await api._step(2); frame();
    const b = L.bones(c, ['ball_l', 'ball_r']);
    if (!b) return 'no LSW body';
    const gy = c.gy ?? 0, B = L.bodies[L.meshOf[c.slot]], ball = B.J.ball_l.y * LSW_RULES.boot[1];
    const off = Math.max(Math.abs(b.ball_l[1] - gy - ball), Math.abs(b.ball_r[1] - gy - ball));
    return off < 0.06 ? true : `soles ${r2(off)} m off the ground (gy ${r2(gy)}, balls ${r2(b.ball_l[1])}/${r2(b.ball_r[1])})`;
  }));

  await check('lsw-bodies: the REAL flag is on every LSW body - one shoulder patch per body, each showing that person\'s own flag from the atlas (ui/portrait.js FLAGS)', () => stage(async () => {
    const flags = ['MX', 'JP', 'NG', 'HT', 'IE', 'CU', 'US'];
    for (let k = 0; k < 14; k++) add('drifter', (k % 7) - 3, 1 + Math.floor(k / 7) * 1.5, {}, null, flags[k % flags.length]);
    await api._step(1); frame();
    const drawn = g.chars.filter((c) => L.drawn[c.slot]), fa = L.flagMesh.geometry.attributes.iFlag.array, bad = [];
    if (L.flagMesh.count !== drawn.length) bad.push(`${L.flagMesh.count} patches for ${drawn.length} bodies`);
    for (const c of drawn) {
      const f = L.flagAt[c.slot], want = FLAG_KEYS.indexOf(c.flag ?? 'US');
      if (f < 0) { bad.push(`${c.name}: no patch`); continue; }
      const u = Math.round(fa[f * 2] / L.flagCell[0]), v = Math.round(fa[f * 2 + 1] / L.flagCell[1]);
      if (u + v * L.flagCols !== want) bad.push(`${c.name}: patch shows ${FLAG_KEYS[u + v * L.flagCols]} not ${c.flag}`);
    }
    return bad.length ? bad.slice(0, 5).join('; ') : true;
  }));

  await check('lsw-bodies: the infected keep LSW bodies through their own poses (the infected AI) - a crawler (prone), one fallen and getting up (knockT), one overheated (crouch), one shambling: hips, knees and ankles on the solver within 3 cm', () => stage(async () => {
    const out = [], Z = [];
    for (let k = 0; k < 4; k++) { const z = g.zombies.spawn(STAGE.x - 1.5 + k * 1.2, STAGE.z + 1.5, false); if (z) { z.hold = true; staged.push(z); Z.push(z); } }
    if (Z.length < 4) return `spawned ${Z.length} infected`;
    const [crawl, fall, hot, walk] = Z;
    g.zombies.crawler(crawl, 'legs');
    fall.knockT = fall.knockMax = 2; hot.crouch = true; walk.speed = 1.4; walk.walk = 0.8;
    frame();
    for (const [c, n] of [[crawl, 'crawler'], [fall, 'fallen'], [hot, 'overheated'], [walk, 'shambler']]) {
      const gp = gaps(c);
      if (!gp) out.push(`${n}: no LSW body`); else if (!(gp.legs < 0.03)) out.push(`${n}: legs ${r2(gp.legs)} m`);
    }
    if (!crawl.prone) out.push('the crawler is not prone');
    return out.length ? out.join('; ') : true;
  }));

  await check('lsw-bodies: the dead decay on the LSW body as on the classic rig - a bloated body (systems/rites.js rot tint) wears exactly the classic rig\'s rotted shirt, trousers and skin colours', () => stage(async () => {
    const c = add('drifter', 0.5, 1.5, { name: 'Three Days' });
    c.hp = 0; c.alive = false; c.deadTime = 0; c.rot = 0.6; g.charR.paint(c);
    await api._step(1); frame();
    const M = g.charR.meshes;
    if (!L.drawn[c.slot]) return 'the dead body is not wearing a faceted body';
    const same = (j, mesh, idx) => { const v = L.colourOf(c, j); return [0, 1, 2].every((q) => Math.abs(v[q] - mesh.instanceColor.array[idx * 3 + q]) < 1e-6); };
    const ok = same(0, M.torso, c.slot) && same(1, M.hips, c.slot) && same(3, M.head, c.slot);
    const rotted = L.colourOf(c, 0)[1];
    c.rot = 0; g.charR.paint(c);
    const fresh = M.torso.instanceColor.array[c.slot * 3 + 1];
    return ok && Math.abs(fresh - rotted) > 1e-4 ? true : `colours ${ok ? 'match but the tint did nothing' : 'differ from the classic rig'}`;
  }));

  await check('lsw-bodies: draw calls stay under 150 with 160 people (24 faceted bodies cost at most 3 draws: the kit mesh, its shadow, the flag patches) and the skinned cost per frame is measured', () => stage(async () => {
    const room = 160 - g.chars.length;
    for (let k = 0; k < room; k++) add(k % 2 ? 'drifter' : 'warden', ((k % 16) - 8) * 1.4, 2 + Math.floor(k / 16) * 1.6, {}, k % 2 ? null : 'smg');
    await api._step(2);
    L.stats.ms = 0; L.stats.frames = 0;
    for (let f = 0; f < 30; f++) g.charR.sync(g.chars, 1 / 60);
    g.render(0);
    const p = await C('perf'), s = statsOf(g);
    const ms = s.cpuMsPerFrame;
    if (!(p.drawCalls < 150)) return `drawCalls=${p.drawCalls}`;
    if (!(s.drawCallsAdded <= 3)) return `LSW adds ${s.drawCallsAdded} draws`;
    if (s.drawn !== LSW_RULES.near) return `drawn ${s.drawn} of ${LSW_RULES.near} with ${g.chars.length} people`;
    return ms < 2 ? true : `skinned bodies cost ${ms} ms/frame on the CPU`;
  }));

  await check('lsw-bodies: switching to classic restores the old look EXACTLY - every classic instance matrix and colour identical to before LSW bodies were on, the LSW meshes and flag patches gone; the bodies command and setting switch it', () => stage(async () => {
    for (let k = 0; k < 10; k++) add(k % 2 ? 'raider' : 'warden', (k % 5) - 2, 1 + Math.floor(k / 5) * 2, { aiming: k % 3 === 0, crouch: k === 4 }, k % 2 ? 'pistol' : 'smg');
    await api._step(2);
    const snap = () => { const o = {}; for (const [k, m] of Object.entries(g.charR.meshes)) o[k] = [m.count, m.visible, Array.from(m.instanceMatrix.array.subarray(0, m.count * 16)), m.instanceColor ? Array.from(m.instanceColor.array.subarray(0, m.count * 3)) : null]; return JSON.stringify(o); };
    let r = await C('bodies', { action: 'mode', value: 'classic' });
    if (r.mode !== 'classic' || g.qol.settings.bodies !== 'classic') return `mode ${r.mode}, setting ${g.qol.settings.bodies}`;
    frame(); const before = snap();
    r = await C('bodies', { action: 'mode', value: 'lsw' }); frame();
    const lswOn = L.bodies.some((B) => B.mesh.visible) && L.flagMesh.visible, during = snap();
    await C('bodies', { action: 'mode', value: 'classic' }); frame();
    const after = snap(), gone = L.bodies.every((B) => !B.mesh.visible) && !L.flagMesh.visible;
    await C('bodies', { action: 'mode', value: 'lsw' });
    if (!lswOn) return 'LSW bodies never showed';
    if (during === before) return 'LSW mode left the classic rig untouched (near people not swapped)';
    if (after !== before) return 'classic after a round trip differs from classic before';
    return gone ? true : 'LSW meshes still visible in classic';
  }));
}
