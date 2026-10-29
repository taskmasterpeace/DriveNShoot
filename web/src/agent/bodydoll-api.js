// THE BODY DOLL for agents (data/bodydoll.js, ui/bodydoll.js, the PACK in ui/inventory.js): the selftest's named checks.
// Each stages what it needs (staging positions is the documented exception), drives the real path (a hit through
// combat, a wound through survival, a drag through the PACK's own drop handler) and puts the player back.
import { validateBodyDoll, NEAR_REACH, DOLL_PART_IDS } from '../data/bodydoll.js';
import { SLOTS } from '../data/gear.js';
import { HUD_LAYOUT } from '../data/hudlayout.js';
import { PANELS } from '../data/panellayout.js';
import { LEVEL } from '../data/storeys.js';

export async function bodyDollChecks({ api, g, check }) {
  const frames = (n = 3) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const P = () => g.player, N = () => g.needs, inv = g.inventory, ui = g.invUI, doll = g.hud.doll;
  const at = { x: P().x, z: P().z }, god = g.godMode, hp = P().hp, wounds = N().wounds.splice(0), placed = [];
  const heal = () => { N().wounds.length = 0; P().bleed = 0; P().hp = P().maxHp; for (const q of DOLL_PART_IDS) doll.hurt[q] = 0; };
  const restore = async () => {
    if (ui.open) ui.toggle(false);
    for (const id of placed) inv.boxes.delete(id);
    inv.prune();
    heal(); N().wounds.push(...wounds); g.godMode = god; P().hp = hp;
    await api.call('teleport', at).catch(() => null);
    g.hud.updateSlow();
  };
  const stage = async () => { // an open stretch of street, nothing near your feet but what a check puts there
    if (ui.open) ui.toggle(false);
    if (P().inVehicle) await api.call('exitVehicle').catch(() => null);
    await api.call('teleport', { x: 2, z: -44 });
    for (const [id, b] of inv.boxes) if (b.kind === 'ground' && Math.hypot(b.x - P().x, b.z - P().z) < 6) inv.boxes.delete(id);
    heal(); P().graceT = 0;
  };

  await check('body doll: the rows validate (every paperdoll slot has a place on the doll), the doll has a HUD row, the PACK its regions', async () => {
    const bad = validateBodyDoll(SLOTS), row = HUD_LAYOUT.find((r) => r.id === 'doll'), regs = PANELS.pack.regions.map((r) => r.id);
    const live = !!document.querySelector(row?.sel ?? '#none')?.closest('.hl[data-hud="doll"]');
    const ok = !bad.length && row?.anchor === 'bl' && live && ['doll', 'figure', 'wounds', 'carry', 'near'].every((r) => regs.includes(r));
    return ok ? true : JSON.stringify({ bad, row, live, regs });
  });

  await check('body doll: a broken left arm shows on the HUD doll (that part, nothing else), and splinting it shows splinted', async () => {
    await stage();
    const w = g.survival.wound('fracture', { part: 'arm_l' });
    g.hud.updateSlow();
    const path = (p) => doll.svg.querySelector(`path[data-part="${p}"]`).getAttribute('class');
    const broke = path('arm_l').includes('t-fractured') && DOLL_PART_IDS.filter((p) => p !== 'arm_l').every((p) => !path(p).includes('t-fractured'));
    const tag = doll.tag.textContent;
    inv.add(inv.carried, 'splint', 1);
    const r = inv.use(inv.carried.slots.findIndex((s) => s.id === 'splint')); // used on yourself, as E in the PACK does
    g.hud.updateSlow();
    const set = w.set && path('arm_l').includes('t-splinted');
    await restore();
    return broke && /LEFT ARM/.test(tag) && /BROKEN/.test(tag) && set ? true : JSON.stringify({ broke, tag, set, treated: r, wound: w });
  });

  await check('body doll: a hit lands where it lands (combat → the hurt event → the doll and the wound): head shot shades the head, a hit to the arms wounds one arm', async () => {
    await stage();
    g.godMode = false;
    const seq = g.eventSeq;
    g.combat.damage(P(), 20, null, 0, 0, 'bullet', 'head');
    const ev = g.events.find((e) => e.seq > seq && e.type === 'hurt');
    g.hud.updateSlow();
    const head = doll.states.head === 'hurt' && doll.hurt.head > 0 && doll.hurt.torso === 0;
    const prof = g.survival.profileName, R = Math.random;
    g.survival.readEvents(); // the head shot read as it is (wounds held still): only the next hit rolls one
    g.survival.setProfile('full'); Math.random = () => 0.01; // wounds on (the battery holds them still); flying glass gashes (a bullet with nobody behind it is a fall), the left side
    try { g.combat.damage(P(), 12, null, 0, 0, 'glass', 'arms'); g.survival.readEvents(); } finally { Math.random = R; }
    const gash0 = N().wounds.find((w) => w.kind === 'laceration');
    g.survival.setProfile(prof);
    const gash = gash0;
    g.hud.updateSlow();
    const view = doll.view();
    const arm = gash && (gash.part === 'arm_l' || gash.part === 'arm_r') && doll.states[gash.part] === 'bleeding';
    await restore();
    return ev?.part === 'head' && head && arm ? true : JSON.stringify({ part: ev?.part, amount: ev?.amount, evhp: ev?.hp, max: P().maxHp, view, head, gash, dseq: doll.seq, seq });
  });

  await check('pack: it opens by lifting the HUD doll (the big figure starts where the small one is and settles into place)', async () => {
    await stage();
    g.hud.layout.refresh?.();
    await frames(2);
    const small = doll.el.getBoundingClientRect();
    ui.toggle(true);
    const from = ui.lifted, moving = ui.el.fig.style.transition;
    await frames(2);
    const mid = getComputedStyle(ui.el.fig).transform, big = ui.el.fig.getBoundingClientRect();
    await new Promise((r) => setTimeout(r, 700));
    const end = getComputedStyle(ui.el.fig).transform;
    await restore();
    // it set off from the small doll (the offset is where the HUD doll sat), was moving, and came to rest
    const ok = small.width > 0 && from && Math.abs(from.x - small.left) < 2 && Math.abs(from.y - small.top) < 2 && /transform/.test(moving) && mid !== 'none' && end === 'none';
    return ok ? true : JSON.stringify({ small: [small.left, small.top, small.width], from, moving, mid, end });
  });

  await check('pack: NEAR YOUR FEET lists exactly what is within reach (the ground, the dead, a crate) and nothing farther off', async () => {
    await stage();
    const p = P(), gr = inv.groundAt(p.x + 0.5, p.z);
    inv.add(gr, 'bandage', 2); inv.add(gr, 'water_bottle', 1);
    const near = inv.place('crate:dolltest-near', 'garage', p.x - 1.5, p.z + 0.6, 40, 'NEAR CRATE'); placed.push(near.id);
    const far = inv.place('crate:dolltest-far', 'garage', p.x + 6, p.z, 40, 'FAR CRATE'); placed.push(far.id); inv.open(far); inv.add(far, 'scrap', 3); inv.opened = null;
    ui.toggle(true); await frames(2);
    // What is really within reach on your floor, worked out here from the world (not from the screen).
    const want = {}, y = p.gy ?? 0;
    for (const b of inv.boxes.values()) if (!(b.kind === 'ground' && !b.slots.length) && Math.abs((b.y ?? 0) - y) <= LEVEL.same && Math.hypot(b.x - p.x, b.z - p.z) <= NEAR_REACH) want[b.id] = b.slots.map((s) => `${s.id}x${s.n}`).sort().join(',');
    const car = ui.carAt(); if (car) { const t = inv.trunk(car); want[t.id] = t.slots.map((s) => `${s.id}x${s.n}`).sort().join(','); }
    const shown = {};
    for (const sec of document.querySelectorAll('.inv-groups .inv-group')) shown[sec.dataset.box] = [...sec.querySelectorAll('li[data-i]')].map((li) => { const s = inv.boxes.get(sec.dataset.box)?.slots[+li.dataset.i] ?? ui.near.find((b) => b.id === sec.dataset.box)?.slots[+li.dataset.i]; return s ? `${s.id}x${s.n}` : '?'; }).sort().join(',');
    for (const [id, items] of Object.entries(shown)) if (!items && !want[id] && inv.boxes.get(id)?.kind === 'ground') delete shown[id]; // the empty ground you could drop on
    const same = JSON.stringify(Object.entries(shown).sort()) === JSON.stringify(Object.entries(want).sort());
    const farOut = !(far.id in shown) && near.id in shown && gr.id in shown;
    await restore();
    return same && farOut ? true : JSON.stringify({ shown, want });
  });

  await check('pack: dragging a thing from the ground onto the backpack moves that very thing into the backpack', async () => {
    await stage();
    const p = P(), gr = inv.groundAt(p.x + 0.4, p.z);
    if (!inv.worn) inv.wear('satchel');
    const k = inv.add(gr, 'water_bottle', 1, { left: 2 }); // two sips left: this bottle and no other
    ui.toggle(true); await frames(2);
    const i = gr.slots.findIndex((s) => s.id === 'water_bottle' && s.left === 2);
    const li = document.querySelector(`.inv-group[data-box="${gr.id}"] li[data-i="${i}"]`), target = document.querySelector('.inv-comp[data-comp="pack"]');
    const before = inv.carried.slots.filter((s) => s.id === 'water_bottle' && s.left === 2 && s.where === 'pack').length;
    let dt = null; try { dt = new DataTransfer(); } catch { dt = null; }
    if (li && target) {
      li.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
    const after = inv.carried.slots.filter((s) => s.id === 'water_bottle' && s.left === 2 && s.where === 'pack').length;
    const gone = !gr.slots.some((s) => s.id === 'water_bottle' && s.left === 2);
    const shown = !!document.querySelector('.inv-comp[data-comp="pack"]')?.textContent.includes('Water bottle');
    const j = inv.carried.slots.findIndex((s) => s.id === 'water_bottle' && s.left === 2 && s.where === 'pack');
    if (j >= 0) inv.take(inv.carried, j, 1);
    await restore();
    return k === 1 && li && target && after === before + 1 && gone && shown ? true : JSON.stringify({ k, li: !!li, target: !!target, before, after, gone, shown });
  });
}
