// CALIBERS' commands and checks (data/ballistics.js ROUNDS, systems/forensics.js, docs/design/WEB_CALIBERS.md).
import { ROUNDS, TRACER_BEFORE, roundRow, calOf } from '../data/ballistics.js';
import { WEAPONS } from '../systems/combat.js';
import { AMMO_ITEM, GUN_ITEM, ITEMS } from '../data/items.js';
import { MOUNT_WEAPONS } from '../data/workshop.js';
import { RAY_BULLET } from '../engine/collision.js';
import * as THREE from 'three';

const r2 = (v) => (v === null || v === undefined ? v : +(+v).toFixed(2));
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

// Every gun by calibre: what fires what, and what it loads from.
function table() {
  const cals = {};
  for (const [k, r] of Object.entries(ROUNDS)) cals[k] = { name: r.name, short: r.short, ammo: r.ammo, item: r.ammo ? AMMO_ITEM[r.ammo] ?? null : null, velocity: r.velocity, dmg: r.dmg, punch: r.punch, sound: r.sound, casing: r.casing, guns: [], mounts: [] };
  for (const [k, w] of Object.entries(WEAPONS)) {
    cals[calOf(w.cal)]?.guns.push(k);
    for (const m of w.modes ?? []) if (m.cal && m.cal !== w.cal) cals[m.cal]?.guns.push(`${k}.${m.id}`);
  }
  for (const [k, w] of Object.entries(MOUNT_WEAPONS)) if (w.cal) cals[w.cal]?.mounts.push(k);
  return cals;
}

// What is wrong with the guns' calibres: every gun and shell names a row, loads a box that exists, sits near its
// calibre's damage; every bullet mount names one too.
export function validateCalibers() {
  const bad = [];
  for (const [k, w] of Object.entries(WEAPONS)) {
    const R = ROUNDS[w.cal];
    if (!R) { bad.push(`${k}: cal ${w.cal} has no row`); continue; }
    if (!w.content && (!GUN_ITEM[k] || !ITEMS[GUN_ITEM[k]])) bad.push(`${k}: no gun item`); // a content pack's gun is no item yet
    if (!AMMO_ITEM[w.ammo] || !ITEMS[AMMO_ITEM[w.ammo]]) bad.push(`${k}: ammo ${w.ammo} has no box`);
    if (R.ammo !== w.ammo) bad.push(`${k}: loads ${w.ammo}, its calibre ${w.cal} comes in ${R.ammo}`);
    if (w.dmg < R.dmg * 0.5 || w.dmg > R.dmg * 1.6) bad.push(`${k}: dmg ${w.dmg} far from its calibre's ${R.dmg}`);
    for (const m of w.modes ?? []) {
      const c = m.cal ?? w.cal, MR = ROUNDS[c];
      if (!MR) { bad.push(`${k}.${m.id}: cal ${c} has no row`); continue; }
      if ((m.ammo ?? w.ammo) !== MR.ammo) bad.push(`${k}.${m.id}: loads ${m.ammo ?? w.ammo}, its calibre comes in ${MR.ammo}`);
    }
  }
  for (const [k, w] of Object.entries(MOUNT_WEAPONS)) if (w.cal && !ROUNDS[w.cal]) bad.push(`mount ${k}: cal ${w.cal} has no row`);
  for (const [a, it] of Object.entries(AMMO_ITEM)) if (!roundRow(a)) bad.push(`ammo ${a} (${it}): no calibre fires it`);
  return bad;
}

export function calibersCommands(api) {
  const g = api.g;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  return {
    calibers: {
      group: 'world', desc: 'CALIBERS (docs/design/WEB_CALIBERS.md, rows in src/data/ballistics.js ROUNDS): every round a gun can fire, with its name, the pack ammo key and box it loads from, muzzle velocity, damage, penetration (punch), report and casing, and the guns, shotgun shells and vehicle mounts that fire it. Also `bad`: what the calibre validator finds (empty when every gun resolves to a row).',
      args: {},
      run: async () => ({ calibers: table(), bad: validateCalibers() }),
    },
    forensics: {
      group: 'world', desc: 'FORENSICS (systems/forensics.js, docs/design/WEB_CALIBERS.md §5): a bullet wound remembers its calibre, the way it came from and its range; a fired gun drops a casing of its calibre. No args: counts and the bodies the player has read. id=<char id or body box id>: the wounds on that body and the report a search reads off them (law 6: reading it here is the agent\'s view, nobody in the world learns it). x, z, r: the casings lying within r m, by calibre. examiner=<char id> with id: that NPC examines the body (they must stand within 3 m); with x, z instead: they read the casings on the ground there; either way the clue is theirs (their clues list comes back).',
      args: { id: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, r: { type: 'number', default: 8 }, examiner: { type: 'string' } },
      run: async ({ id, x, z, r, examiner }) => {
        const F = g.forensics;
        need(F, 'no forensics system');
        const body = id ? (g.inventory.boxes.get(id) ?? api.findChar(id) ?? null) : null;
        if (id) need(body, `no body or character ${id}`);
        if (examiner) {
          const who = api.findChar(examiner);
          need(who, `no character ${examiner}`);
          const clue = body ? F.examine(who, body) : F.examineScene(who, x ?? who.x, z ?? who.z, r);
          return { clue, clues: F.cluesOf(who), why: clue ? null : 'too far to examine it' };
        }
        if (body) { const W = F.wounds(body); return { wounds: W.map((w) => ({ ...w, name: ROUNDS[w.cal].name })), report: F.report(W) }; }
        if (x !== undefined && z !== undefined) return { casings: F.casingsNear(x, z, r) };
        return F.view();
      },
    },
  };
}

// A straight clear line on the island's flats (heading +z), no box within 3 m, dry.
function clearStrip(g, len) {
  const S = g.statics;
  for (let x = -420; x <= 420; x += 37) for (let z = 280; z + len <= 440; z += 23) {
    let ok = true;
    for (const b of S.boxes) if (b.maxX > x - 3 && b.minX < x + 3 && b.maxZ > z - 3 && b.minZ < z + len + 3) { ok = false; break; }
    if (ok) { S.raycast(x, z, 0, 1, len, RAY_BULLET, -1); if (S.hit.box) ok = false; }
    if (ok && g.water.depthAt(x, z) <= 0 && g.water.depthAt(x, z + len) <= 0) return { x, z };
  }
  return null;
}

// ---- selftest ------------------------------------------------------------------------------------------------------------
export async function calibersChecks(ctx) {
  const { g, api, C, check, extra } = ctx;
  const B = g.ballistics, F = g.forensics, A = g.ambient;
  const cast = [];
  const dummy = (x, z, props = {}) => { const c = extra('drifter', x, z, { hold: true, ...props }); c.x = x; c.z = z; cast.push(c); return c; };
  const settle = async (dt = 1 / 60, max = 240) => { for (let k = 0; k < max && B.inFlight(); k++) await api._step(1, dt); };
  const L = clearStrip(g, 40);
  const stage = async () => {
    if (!L) throw new Error('no clear strip on the flats');
    if (g.player.inVehicle) g.exitVehicle(true);
    for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.abs(c.x - L.x) < 12 && c.z > L.z - 10 && c.z < L.z + 50) g.removeChar(c);
    await C('teleport', { x: L.x, z: L.z }); await api._step(2);
    g.player.x = L.x; g.player.z = L.z;
  };

  try {
    await check('calibers: every gun, shell and bullet mount resolves to a calibre row (9mm, .45, .357, .22, 5.56, 7.62x39, .308, .50, 12 gauge buck/bird/slug), loads a box that exists, and the light, medium and heavy machine guns are there', async () => {
      const bad = validateCalibers();
      const want = { lmg: '556', mmg: '762x51', amr: '50bmg', carbine: '762x39', battle: '762x51', rimfire: '22lr', magnum: '357mag', smg: '9mm', pistol: '45acp', shotgun: '12ga' };
      const wrong = Object.entries(want).filter(([k, c]) => B.rowKey(WEAPONS[k]) !== c).map(([k]) => k);
      const hmg = MOUNT_WEAPONS.hmg?.cal === '50bmg' && MOUNT_WEAPONS.mg1?.cal === '762x51';
      const shells = ['buck', 'bird', 'slug'].map((m) => B.rowKey(WEAPONS.shotgun.modes.find((x) => x.id === m))).join(',');
      return !bad.length && !wrong.length && hmg && shells === '12ga,12ga_bird,12ga_slug' ? true : JSON.stringify({ bad, wrong, hmg, shells });
    });

    await check('calibers: a .50 goes through a concrete-block wall that stops a 9mm: the man behind it is hurt by the .50 only', async () => {
      await stage();
      const M = g.materials, x = L.x, z = L.z + 14, rows = [];
      const wall = M.build('block_wall', x, z, 'x', 3), man = dummy(x, z + 2.5, { hp: 5000 });
      try {
        for (const cal of ['9mm', '50bmg']) {
          const hp0 = man.hp, R = ROUNDS[cal];
          const p = B.launch(g.player, x, L.z + 2, 0, 1, 40, R.dmg, cal, cal), id = p.id;
          for (let n = 0; n < 200 && p.live && p.id === id; n++) await api._step(1);
          rows.push({ cal, kind: p.id === id ? p.hitKind : 'lost', hurt: r2(hp0 - man.hp), stopAt: r2(p.z - z) });
        }
      } finally { M.unbuild(wall); }
      const [nine, fifty] = rows;
      return nine.hurt === 0 && nine.kind === 'wall' && fifty.hurt > 30 ? true : JSON.stringify(rows);
    });

    await check('calibers: a fired gun drops a casing of its calibre - a carbine\'s steel 7.62x39, a birdshot\'s green hull, a .50\'s fat case - and it lies where it fell, read back off the ground by calibre', async () => {
      await stage();
      const p = g.player, I = g.inv, Am = g.arms, keep = Am.mode.shotgun, got = [];
      const newest = () => A.shells[(A.bNext + A.shells.length - 1) % A.shells.length];
      try {
        for (const [k, mode] of [['carbine', null], ['shotgun', 'bird'], ['amr', null]]) {
          if (mode) Am.setMode('shotgun', mode);
          const e0 = A.view().brassEjected;
          g.combat.fire(p, k, Math.PI, mode ? Am.row(k) : WEAPONS[k]); // away from the strip (north)
          const s = newest();
          got.push({ k, cal: s?.cal, fresh: A.view().brassEjected === e0 + 1, size: s?.size, s });
          await api._step(2);
        }
        await api._step(60);
        const col = new THREE.Color();
        const out = got.map(({ k, cal, fresh, size, s }) => { A.brass.getColorAt(s.i, col); return { k, cal, fresh, size, rest: s.rest, color: col.getHexString(), want: new THREE.Color(ROUNDS[cal]?.casing?.color ?? '#000000').getHexString() }; });
        const near = F.casingsNear(p.x, p.z, 6);
        const ok = out[0].cal === '762x39' && out[1].cal === '12ga_bird' && out[2].cal === '50bmg' && out.every((o) => o.fresh && o.rest && o.color === o.want)
          && out[2].size > out[0].size && near['762x39'] >= 1 && near['12ga_bird'] >= 1 && near['50bmg'] >= 1;
        return ok ? true : JSON.stringify({ out, near });
      } finally { Am.mode.shotgun = keep; await settle(); }
    });

    await check('calibers: going through a body you read its wounds - two 7.62 wounds from the north, close range - the true calibre and line; an investigator who examines it knows it, one who did not knows nothing (law 6)', async () => {
      await stage();
      const p = g.player, x = p.x, z = p.z;
      const man = dummy(x, z + 2.2, { hp: 50, hold: true, name: 'Victim (calibers)' });
      man.maxHp = 50;
      for (let k = 0; k < 4 && man.alive; k++) { g.combat.fire(p, 'carbine', 0, { ...WEAPONS.carbine, spread: 0 }); await settle(); await api._step(2); }
      const box = g.inventory.boxes.get(`body:${man.id}`);
      if (!box) return JSON.stringify({ alive: man.alive, hp: man.hp, why: 'no body box' });
      const n = man.shotBy?.length ?? 0;
      const rep = (g.inventory.open(box), F.found.get(box.id));
      g.inventory.opened = null;
      const cop = dummy(x + 1.5, z + 3, { hp: 300, name: 'Investigator (calibers)' }), far = dummy(x + 30, z + 30, { hp: 300, name: 'Bystander (calibers)' });
      const clue = F.examine(cop, box), none = F.examine(far, box);
      const words = rep?.text ?? '';
      const ok = n >= 2 && rep && rep.lines.length === 1 && rep.lines[0].cal === '762x39' && rep.lines[0].from === 'N' && rep.lines[0].range === 'close range'
        && words.startsWith(`${['', 'one', 'two', 'three', 'four'][n]} 7.62 wounds from the north, close range`)
        && clue?.cals?.[0] === '762x39' && F.cluesOf(cop).length === 1 && none === null && F.cluesOf(far).length === 0;
      return ok ? true : JSON.stringify({ n, rep, clue, none, farClues: F.cluesOf(far).length });
    });

    await check('calibers: the tracer is shorter than before, measured in flight: at most half its old length, and slow rounds streak shortest (a .45 under a metre, a 5.56 the longest)', async () => {
      await stage();
      const p = g.player, got = {};
      for (const cal of Object.keys(TRACER_BEFORE)) {
        if (!ROUNDS[cal].tracerEvery) continue;
        p._tracerN = {}; // its first round is a streak
        const rd = B.launch(p, p.x, p.z + 1, 0, 1, 60, 1, cal, cal, { ghost: false }), id = rd.id;
        let len = 0;
        for (let n = 0; n < 6 && rd.live && rd.id === id; n++) {
          await api._step(1);
          if (rd.id === id && rd.live && rd.flown > ROUNDS[cal].tracerLen + 0.5) { B.mesh.getMatrixAt(rd.i, _m); _m.decompose(_p, _q, _s); len = _s.z; break; }
        }
        got[cal] = { len: r2(len), before: TRACER_BEFORE[cal], sp: r2(rd.sp) };
        await settle();
      }
      const vals = Object.entries(got);
      const ok = vals.length >= 5 && vals.every(([, v]) => v.len > 0.05 && v.len <= v.before * 0.5 + 1e-3)
        && got['45acp'].len < 0.8 && got['556'].len > got['45acp'].len && got['556'].len > got['9mm'].len;
      return ok ? true : JSON.stringify(got);
    });
  } finally {
    for (const c of cast) if (g.chars.includes(c)) g.removeChar(c);
  }
}
