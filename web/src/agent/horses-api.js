// The horses' COMMANDS rows (docs/design/WEB_HORSES.md; systems/horses.js, data/horses.js). buildCommands() in api.js spreads
// these into COMMANDS, so help, the CLI, the MCP tools and docs/COMMANDS.md see them like any other row.
import { BREEDS, GAIT_ORDER, validateHorses } from '../data/horses.js';

export function horseCommands(api, need) {
  const g = api.g;
  const P = () => g.player;
  const S = () => g.horses;
  const find = (id) => {
    const p = P();
    if (!id || id === 'mine' || id === 'nearest' || id === 'ridden') {
      if (id === 'ridden' || (!id && p.mount)) return p.mount ?? null;
      let b = null, bd = Infinity;
      for (const H of S().list) { if (!H.alive || (id === 'mine' && H.owner !== 'player')) continue; const d = Math.hypot(H.x - p.x, H.z - p.z); if (d < bd) { bd = d; b = H; } }
      return b;
    }
    return S().get(id) ?? S().list.find((H) => H.name.toLowerCase() === String(id).toLowerCase()) ?? null;
  };
  const stage = (H, force) => { if (force) { const a = S().bodyOf(H) ?? S().spawnBody(H); need(a, 'no room for a body'); const p = P(); p.x = H.x + 1.3; p.z = H.z; p.speed = 0; } };

  return {
    horses: {
      group: 'world', desc: 'Horses (data/horses.js, docs/design/WEB_HORSES.md): the ledger. No args: the summary (total, alive, yours, wild, bodies, the herds and stables placed, stats: mounts, bolts, throws, fed, stolen, bought, tamed, hops, blown, lamed, died, buried) and every horse within radius (default 300 m). id=<horse id | name | nearest | mine | ridden> for one in full: breed, owner, hp, feed, water, stamina (wind), hoof, lame (game hours left, and why), bond and tier, saddle, bags and what is in them, tied, gait and speed, whether it has a body. validate=true runs the rows\' check (what the World Forge runs). stray=true: the nearest wild horse to you (what the radio and the pulls board say). on=false switches the system off.',
      args: { id: { type: 'string' }, radius: { type: 'number', default: 300 }, validate: { type: 'boolean' }, stray: { type: 'boolean' }, on: { type: 'boolean' } },
      run: async ({ id, radius, validate, stray, on }) => {
        const H = S();
        if (on !== undefined) H.enabled = on;
        if (validate) { const issues = validateHorses(); return { ok: !issues.length, issues, breeds: Object.keys(BREEDS) }; }
        if (stray) return { stray: H.strayNear(P().x, P().z, 1e9) };
        if (id) { const h = find(id); need(h, `no horse ${id}`); return { horse: H.view(h) }; }
        const p = P();
        return { ...H.summary(), mounted: p.mount ? H.view(p.mount) : null, horses: H.list.filter((h) => Math.hypot(h.x - p.x, h.z - p.z) <= radius).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).map((h) => H.view(h)) };
      },
    },
    horseSpawn: {
      group: 'world', desc: `Put a horse in the ledger now (testing, staging): breed=<${Object.keys(BREEDS).join('|')}> at x,z (default 8 m ahead of you). owner=player (default, tame), wild, or stable:<id>. saddle=true / bags=true dress it; bond= sets the trust; name=. It is a record like any other and gets a body when you are near.`,
      args: { breed: { type: 'string', default: 'quarter' }, x: { type: 'number' }, z: { type: 'number' }, owner: { type: 'string', default: 'player' }, saddle: { type: 'boolean', default: false }, bags: { type: 'boolean', default: false }, bond: { type: 'number' }, name: { type: 'string' }, feed: { type: 'number' }, water: { type: 'number' } },
      run: async ({ breed, x, z, owner, saddle, bags, bond, name, feed, water }) => {
        need(BREEDS[breed], `unknown breed ${breed}; breeds: ${Object.keys(BREEDS).join(', ')}`);
        const p = P(), px = Number.isFinite(x) ? x : p.x + Math.sin(p.face) * 8, pz = Number.isFinite(z) ? z : p.z + Math.cos(p.face) * 8;
        const H = S().mk(breed, { x: px, z: pz, owner, name, saddle, bags, bond: bond ?? (owner === 'player' ? 40 : 0), feed, water });
        if (bags) S().ensureBags(H);
        S().spawnBody(H);
        return { horse: S().view(H) };
      },
    },
    horseSet: {
      group: 'world', desc: 'Stage a horse\'s state (testing): id=<id|name|nearest|ridden> and any of feed, water, stamina, hoof, bond (0..1 tanks except bond 0..100), hp, lame (game hours), owner, tied (true: tie where it stands), kill=true.',
      args: { id: { type: 'string' }, feed: { type: 'number' }, water: { type: 'number' }, stamina: { type: 'number' }, hoof: { type: 'number' }, bond: { type: 'number' }, hp: { type: 'number' }, lame: { type: 'number' }, owner: { type: 'string' }, tied: { type: 'boolean' }, kill: { type: 'boolean' } },
      run: async ({ id, feed, water, stamina, hoof, bond, hp, lame, owner, tied, kill }) => {
        const H = find(id); need(H, 'no such horse');
        for (const [k, v] of Object.entries({ feed, water, stamina, hoof, bond, lame, owner })) if (v !== undefined) H[k] = v;
        if (hp !== undefined) { H.hp = hp; const a = S().bodyOf(H); if (a) a.hp = hp; }
        if (tied !== undefined) H.tied = tied ? { x: H.x, z: H.z, post: false } : null;
        if (kill) { const a = S().bodyOf(H); if (a) g.fauna.hurt(a, 1e6, null, 0, 0, 'bullet'); else S().died(H, 'staged'); }
        return { horse: S().view(H) };
      },
    },
    mount: {
      group: 'player', desc: 'Mount a horse (the E key beside a tame one): id=<id|name|nearest> within about 3.7 m, else `moveTo` it first (force=true stands you beside it, for tests). A stable\'s horse is bought (buy=true, with the cash you have) or taken (a theft deed, witnessed if its keeper is near). A wild horse is gentled first (`horseCare action=gentle`). The swing up takes about a second; you are in the saddle at once and cannot steer until it is done.',
      args: { id: { type: 'string', default: 'nearest' }, force: { type: 'boolean', default: false }, buy: { type: 'boolean', default: false } },
      run: async ({ id, force, buy }) => {
        const H = find(id); need(H, 'no horse near');
        stage(H, force);
        const o = S().nearFor(P());
        need(o && o.h === H, 'too far from it: moveTo it first');
        const r = o.verb === 'buy' ? S().interact(o, buy ? 'KeyE' : 'KeyF') : S().interact(o);
        need(r.ok, r.why);
        if (P().mount !== H && r.text && o.verb === 'buy') { const m = S().mount(P(), H); need(m.ok, m.why); }
        await api._step(10);
        return { mounted: P().mount === H, horse: S().view(H), text: r.text, stolen: !!r.stolen };
      },
    },
    dismount: {
      group: 'player', desc: 'Get down (E in the saddle). A horse left within about 3 m of a hitching rail is tied to it. thrown=true is a fall instead of a step (testing).',
      args: { thrown: { type: 'boolean', default: false } },
      run: async ({ thrown }) => {
        const p = P(); need(p.mount, 'you are not riding');
        const H = p.mount;
        if (thrown) S().throwRider(p, 'staged'); else S().dismount(p, 'got down');
        await api._step(5);
        return { horse: S().view(H), you: { x: +p.x.toFixed(1), z: +p.z.toFixed(1), hp: Math.round(p.hp) } };
      },
    },
    rideTo: {
      group: 'player', desc: 'Ride to x,z (like moveTo, on a horse; you must be mounted): gait=walk|trot|canter|gallop (default trot), hop=true jumps a low fence in the way, maxSeconds= (default 60). The horse still tires, slows in water and on rough ground, goes blown at an empty wind and cannot canter lame. Returns where it got to, the stamina left and the time taken.',
      args: { x: { type: 'number', required: true }, z: { type: 'number', required: true }, gait: { type: 'string', default: 'trot' }, hop: { type: 'boolean', default: false }, maxSeconds: { type: 'number', default: 60 }, tolerance: { type: 'number', default: 2.2 } },
      run: async ({ x, z, gait, hop, maxSeconds, tolerance }) => {
        const p = P(); need(p.mount, 'you are not mounted');
        need(GAIT_ORDER.includes(gait) && gait !== 'stand', `gait: ${GAIT_ORDER.slice(1).join(', ')}`);
        const H = p.mount; H.goto = { x, z, gait, hop, tol: tolerance };
        const t0 = g.time, x0 = p.x, z0 = p.z; let minStam = H.stamina;
        while (H.goto && p.mount === H && g.time - t0 < maxSeconds) { await api._step(15); minStam = Math.min(minStam, H.stamina); }
        const arrived = !H.goto; H.goto = null;
        return { arrived, mounted: p.mount === H, seconds: +(g.time - t0).toFixed(1), metres: +Math.hypot(p.x - x0, p.z - z0).toFixed(1), remaining: +Math.hypot(p.x - x, p.z - z).toFixed(1), staminaLeft: +H.stamina.toFixed(2), lowestStamina: +minStam.toFixed(2), blown: H.blown, gait: H.gait, horse: S().view(H) };
      },
    },
    horseCare: {
      group: 'player', desc: 'Look after a horse (what the items and the E key do): id=<id|name|nearest|ridden>, action=feed (item=hay|oats; spends one from your pack), gentle (offer oats to a wild one; with a lead rope at the tame bond it is yours), tie / untie (a rail, or a lead rope), saddle / bags (put the item on, or take it off), brush, pick (hooves), treat (a bandage on a lame leg), drink (the horse drinks where it stands, if in water), bury (a dead horse of yours, with something to dig), sell is not a verb: a horse is not a thing you sell to a stranger. force=true stands you beside it.',
      args: { id: { type: 'string', default: 'nearest' }, action: { type: 'string', required: true }, item: { type: 'string' }, force: { type: 'boolean', default: false } },
      run: async ({ id, action, item, force }) => {
        const H = find(id); need(H, 'no such horse');
        if (action !== 'bury' || force) stage(H, force);
        const Hs = S(), p = P();
        let r;
        switch (action) {
          case 'feed': r = Hs.feedHorse(H, item ?? 'hay'); break;
          case 'gentle': r = Hs.gentle(H); break;
          case 'tie': r = Hs.tie(H); break;
          case 'untie': H.tied = null; r = { ok: true, text: 'UNTIED' }; break;
          case 'saddle': r = Hs.useItem('horsetack', 'saddle'); break;
          case 'bags': r = Hs.useItem('horsetack', 'saddlebags'); break;
          case 'brush': r = Hs.groom(H); break;
          case 'pick': r = Hs.useItem('horsetack', 'hoof_pick'); break;
          case 'treat': r = Hs.treat(H); break;
          case 'drink': { const a = Hs.bodyOf(H); const ok = Hs.drink(H, a, 1); r = { ok, why: 'no water in front of its nose' }; break; }
          case 'bury': r = Hs.bury(H); break;
          default: need(false, 'action: feed, gentle, tie, untie, saddle, bags, brush, pick, treat, drink, bury');
        }
        need(r.ok, r.why);
        return { text: r.text, horse: Hs.view(H), distance: +Math.hypot(H.x - p.x, H.z - p.z).toFixed(1) };
      },
    },
    horseBags: {
      group: 'player', desc: 'The saddlebags of a horse (the PACK screen opens them when you stand beside the horse): id=<id|name|nearest|ridden>. put=<item> n= moves from your pack into them; take=<item> n= moves back. No args: what is in them and the room left.',
      args: { id: { type: 'string', default: 'nearest' }, put: { type: 'string' }, take: { type: 'string' }, n: { type: 'number', default: 1 } },
      run: async ({ id, put, take, n }) => {
        const H = find(id); need(H, 'no such horse'); need(H.bags, `${H.name} wears no saddlebags`);
        const box = S().ensureBags(H), inv = g.inventory;
        const shift = (from, to, id, want, why) => { let left = want, moved = 0; for (let guard = 0; left > 0 && guard < 40; guard++) { const i = from.slots.findIndex((x) => x.id === id); if (i < 0) break; const k = inv.move(from, i, to, left); if (k <= 0) break; left -= k; moved += k; } need(moved > 0, why); return moved; };
        if (put) { need(inv.carried.count(put) > 0, `you carry no ${put}`); need(inv.room(box) > 0, 'the bags are full'); shift(inv.carried, box, put, n, 'it does not fit'); }
        if (take) { need(box.slots.some((x) => x.id === take), `no ${take} in the bags`); shift(box, inv.carried, take, n, 'no room in your pack'); }
        return { horse: H.name, litres: +box.litres().toFixed(1), cap: box.cap, kg: +box.kg().toFixed(1), items: box.slots.map((s) => ({ id: s.id, n: s.n })) };
      },
    },
  };
}
