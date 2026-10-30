import { ITEMS, GUN_ITEM, BODY_LITRES } from '../data/items.js';
import { slotKg } from '../systems/inventory.js';
import { WEAPONS } from '../systems/combat.js';
import { SLOTS, SLOT_LABEL, ARMOR_SLOTS, PARTS, GEAR } from '../data/gear.js';
import { BREEDS, BOND_TIERS } from '../data/dogs.js';
import { INJURIES } from '../data/survival.js';
import { LEVEL } from '../data/storeys.js';
import { DOLL_PART_IDS, DOLL_SLOTS, NEAR_REACH, NEAR_MAX, compartments, partStates } from '../data/bodydoll.js';
import { dollSVG, paintDoll, partName, stateLabel, stateTone } from './bodydoll.js';
import { drawFlag } from './portrait.js';

// The PACK screen (I or Tab). It opens by lifting the HUD's body doll (ui/bodydoll.js) up into the full equipment view:
//   YOUR BODY       the big doll: every paperdoll slot hung beside the part it sits on, what is wrong with each part
//   ON YOU          what you carry, by the container it is in (data/bodydoll.js COMPARTMENTS): pockets, the belt and
//                   the vest you wear, the backpack; the guns slung on you on top
//   NEAR YOUR FEET  everything within reach (NEAR_REACH): the ground, the dead, crates and cupboards, the trunk you
//                   stand at; one of them is the OTHER side (this.other) Space moves to and from
// Drag a row onto a container (yours or one near you) to move it there; double-click moves it across. The world keeps
// running while you rummage (you stand still), so a pack opened in a fight costs you. Keyboard: W/S pick, A/D side
// (D again: the next thing near you), E use, Space move across, X drop, F wear a pack.
// A trader's own shelf with the trader at the counter is a counter (systems/trade.js): Space on their side buys, on
// yours sells (what they deal in), E buys one and uses it, and every row shows its price. With them gone it's theft.
// Rebuilt only when something changes (inventory.dirty), never per frame.
const ICON = {
  water: '<path d="M12 2.7c-3 4.3-6 7.6-6 11.3a6 6 0 0 0 12 0c0-3.7-3-7-6-11.3z"/>',
  food: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M5 9h14M5 15h14"/>',
  med: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  part: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  pack: '<path d="M6 8a6 6 0 0 1 12 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/><path d="M9 21v-6h6v6M10 4V2h4v2"/>',
  valuable: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/>',
  paper: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  gun: '<path d="M2 7h19v4H11l-2 9H5l2-9H2z"/><path d="M11 11l1 3h2"/>',
  ammo: '<path d="M5 21V11l1.5-5L8 11v10zM10.5 21V11L12 6l1.5 5v10zM16 21V11l1.5-5 1.5 5v10z"/><path d="M5 17h3M10.5 17h3M16 17h3"/>',
  armor: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  gear: '<path d="M8 3h8l1 4-2 14H9L7 7z"/><path d="M7 7h10"/>',
  // the containers
  pockets: '<path d="M4 4h16v9a8 8 0 0 1-16 0z"/><path d="M4 8h16"/>',
  belt: '<rect x="2" y="9" width="20" height="6" rx="1"/><rect x="9" y="7" width="6" height="10" rx="1"/>',
  vest: '<path d="M8 3 4 6v15h6v-8h4v8h6V6l-4-3-4 4z"/>',
  ground: '<path d="M2 20h20M5 20l3-6h8l3 6"/><path d="M9 14l1-4h4l1 4"/>',
  body: '<circle cx="12" cy="5" r="2.5"/><path d="M4 21l3-8h10l3 8M12 8v5"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  trunk: '<path d="M3 13l2-6h14l2 6v5H3z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
};
const icon = (kind) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[kind] ?? ICON.paper}</svg>`;
const STATE = { ok: '', worn: 'WORN', jammed: 'JAMMED', broken: 'BROKEN' };
const esc = (t) => String(t).replace(/[<>&"]/g, '');
const boxIcon = (b) => (b.kind === 'ground' ? 'ground' : b.kind === 'trunk' ? 'trunk' : b.id.startsWith('body:') ? 'body' : 'box');

export class InventoryUI {
  constructor(game, root) {
    this.g = game;
    root.insertAdjacentHTML('beforeend', `
      <div class="invmenu hidden">
        <div class="inv-card">
          <div class="inv-head">
            <b class="inv-title">PACK</b><div class="inv-who"><span class="inv-worn"></span><span class="inv-roles"></span></div>
            <div class="inv-meters">
              <div class="inv-meter"><span>WEIGHT</span><i><em class="inv-kg"></em></i><b class="inv-kg-t"></b></div>
              <div class="inv-meter"><span>ROOM</span><i><em class="inv-l"></em></i><b class="inv-l-t"></b></div>
            </div>
          </div>
          <div class="inv-body">
            <div class="inv-doll">
              <h4>YOUR BODY</h4>
              <div class="dl-wrap"><div class="dl-col l"></div><div class="dl-stage"><canvas class="dl-flag" width="150" height="100"></canvas>${dollSVG('bd-big')}</div><div class="dl-col r"></div></div>
              <div class="dl-wounds"></div>
              <div class="doll-soak"></div>
            </div>
            <section class="inv-carry inv-col" data-side="0"><h4>ON YOU</h4><div class="inv-comps"></div></section>
            <section class="inv-near inv-col" data-side="1"><h4>NEAR YOUR FEET</h4><div class="inv-groups"></div></section>
          </div>
          <div class="inv-dogs"></div>
          <div class="inv-detail">
            <div class="inv-dname"></div>
            <div class="inv-desc"></div>
            <div class="inv-stats"></div>
            <div class="inv-acts">
              <button data-a="use"><kbd>E</kbd><span class="inv-use-t">USE</span></button><button data-a="move"><kbd>SPACE</kbd><span class="inv-move-t">MOVE</span></button>
              <button data-a="wear"><kbd>F</kbd>WEAR</button><button data-a="drop"><kbd>X</kbd>DROP</button>
            </div>
          </div>
          <div class="inv-say"></div>
          <div class="inv-keys"><kbd>W</kbd><kbd>S</kbd>pick <kbd>A</kbd><kbd>D</kbd>side (D again: the next thing near you) · drag a row onto a container to move it · <kbd>I</kbd>close <kbd>Q</kbd>craft</div>
        </div>
      </div>`);
    const q = (s) => root.querySelector(`.invmenu ${s}`);
    this.el = {
      menu: root.querySelector('.invmenu'), card: q('.inv-card'), worn: q('.inv-worn'), roles: q('.inv-roles'), kg: q('.inv-kg'), kgT: q('.inv-kg-t'), l: q('.inv-l'), lT: q('.inv-l-t'),
      cols: [q('.inv-carry'), q('.inv-near')], comps: q('.inv-comps'), groups: q('.inv-groups'),
      doll: q('.inv-doll'), fig: q('.dl-stage'), svg: q('.dl-stage svg'), flag: q('.dl-flag'), colL: q('.dl-col.l'), colR: q('.dl-col.r'), wounds: q('.dl-wounds'), soak: q('.doll-soak'),
      dogs: q('.inv-dogs'), dname: q('.inv-dname'), desc: q('.inv-desc'), stats: q('.inv-stats'), acts: q('.inv-acts'), useT: q('.inv-use-t'), moveT: q('.inv-move-t'), say: q('.inv-say'),
    };
    this.open = false; this.side = 0; this.sel = [0, 0]; this.other = null; this.near = []; this.comps = []; this.sayT = 0; this.flagCode = null; this.states = {};
    const pick = (li) => {
      const side = +li.closest('[data-side]').dataset.side;
      if (side === 1) { const b = this.near.find((x) => x.id === li.closest('[data-box]')?.dataset.box); if (b && b !== this.other) { this.other = b; this.g.inventory.opened = b; } }
      this.side = side; this.sel[side] = +li.dataset.i;
    };
    const body = q('.inv-body');
    body.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (!li) return; pick(li); this.render(); });
    body.addEventListener('dblclick', (e) => { const li = e.target.closest('li[data-i]'); if (!li) return; pick(li); this.act('move'); });
    // Drag a row onto a compartment of yours or a container near you.
    body.addEventListener('dragstart', (e) => {
      const li = e.target.closest('li[data-i]'); if (!li) return;
      this.dragFrom = { side: +li.closest('[data-side]').dataset.side, box: li.closest('[data-box]')?.dataset.box ?? null, i: +li.dataset.i };
      e.dataTransfer?.setData('text/plain', JSON.stringify(this.dragFrom)); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    body.addEventListener('dragover', (e) => { const t = e.target.closest('[data-drop]'); if (!t || !this.dragFrom) return; e.preventDefault(); this.hoverDrop(t); });
    body.addEventListener('dragleave', (e) => { const t = e.target.closest('[data-drop]'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop-on'); });
    body.addEventListener('drop', (e) => {
      const t = e.target.closest('[data-drop]'); e.preventDefault(); this.hoverDrop(null);
      let from = this.dragFrom; this.dragFrom = null;
      if (!from) try { from = JSON.parse(e.dataTransfer?.getData('text/plain') || 'null'); } catch { from = null; }
      if (!t || !from) return;
      const [kind, id] = t.dataset.drop.split(':');
      const r = this.transfer(from, kind === 'comp' ? { comp: id } : { box: id });
      if (r) this.tell(r.ok ? r.text : r.why.toUpperCase(), !r.ok);
      this.render();
    });
    body.addEventListener('dragend', () => { this.dragFrom = null; this.hoverDrop(null); });
    this.el.acts.addEventListener('click', (e) => { const b = e.target.closest('button[data-a]'); if (b) this.act(b.dataset.a); });
    // A worn slot's chip: click takes it off (into the pack; at your feet with no room). Hover lights the part it sits on.
    this.el.doll.addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (!b || !this.wornIn(b.dataset.slot)) return; const r = b.dataset.slot === 'back' ? { ok: false, why: 'swap packs with F on another pack' } : this.g.gear.takeOff(b.dataset.slot); this.tell(r.ok ? r.text : r.why.toUpperCase(), !r.ok); this.render(); });
    this.el.doll.addEventListener('pointerover', (e) => { const b = e.target.closest('[data-part]'); this.lightPart(b?.dataset.part ?? null); });
    this.el.doll.addEventListener('pointerleave', () => this.lightPart(null));
  }

  hoverDrop(t) { for (const x of this.el.menu.querySelectorAll('.drop-on')) if (x !== t) x.classList.remove('drop-on'); t?.classList.add('drop-on'); }
  lightPart(p) { for (const x of this.el.svg.querySelectorAll('path[data-part]')) x.classList.toggle('lit', x.dataset.part === p); }
  wornIn(slot) { return slot === 'back' ? this.g.inventory.worn : this.g.gear.worn[slot]; }

  // The other side: whatever is opened, else a box or body at your feet, else the car you're in or standing at,
  // else the ground.
  pickOther() {
    const g = this.g, inv = g.inventory, p = g.player;
    if (inv.opened && (inv.opened.kind === 'trunk' || Math.hypot(inv.opened.x - p.x, inv.opened.z - p.z) < 3 || g.trade?.keeperAt(inv.opened))) return inv.opened; // a counter opened from a talk: anywhere in the shop
    const near = !p.inVehicle && inv.nearest(p.x, p.z, 2.6, true); // a body is long: stand anywhere along it
    if (near) return g.actions ? g.actions.openTop(near) : inv.open(near); // opened, not searched: what's on top (systems/actions.js)
    const v = this.carAt();
    if (v) return inv.trunk(v);
    return inv.groundAt(p.x, p.z);
  }
  carAt() { const p = this.g.player; return p.inVehicle ?? this.g.vehicles.find((c) => !c.dead && !c.sunk && Math.hypot(c.x - p.x, c.z - p.z) < Math.max(3.4, c.len * 0.65)); }

  // NEAR YOUR FEET: every container within reach on your floor (searched as you look: a first look is a search), the
  // trunk you stand at, the ground here; the other side first, then nearest first. At most NEAR_MAX.
  findNear() {
    const g = this.g, inv = g.inventory, p = g.player, y = p.gy ?? 0, opened = inv.opened, out = [];
    if (!p.inVehicle) {
      const ds = [];
      for (const b of inv.boxes.values()) {
        if (b.kind === 'ground' && !b.slots.length) continue;
        if (Math.abs((b.y ?? 0) - y) > LEVEL.same) continue;
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d <= NEAR_REACH) ds.push([d, b]);
      }
      ds.sort((a, b) => a[0] - b[0]);
      for (const [, b] of ds) { if (!b.rolled) inv.open(b); out.push(b); }
      inv.opened = opened;
    }
    const v = this.carAt();
    if (v) out.push(inv.trunk(v));
    if (!p.inVehicle && !out.some((b) => b.kind === 'ground')) out.push(inv.groundAt(p.x, p.z));
    if (this.other && !out.includes(this.other)) out.unshift(this.other);
    else if (this.other) { out.splice(out.indexOf(this.other), 1); out.unshift(this.other); }
    return out.slice(0, NEAR_MAX);
  }

  toggle(on = !this.open) {
    if (on && !this.g.player.alive) return;
    this.open = on;
    const from = on ? this.g.hud?.doll?.el?.getBoundingClientRect() : null; // the HUD's doll, before the HUD steps aside
    this.el.menu.classList.toggle('hidden', !on);
    if (on) { this.other = this.pickOther(); this.side = 0; this.render(); this.lift(from); }
    else { this.g.craftUI?.setTab(false); const inv = this.g.inventory; inv.opened = null; inv.prune?.(); this.near = []; }
    this.g.emit('pack', { open: on, other: this.other?.id ?? null });
  }

  // The doll animates up out of the HUD into the big one (a FLIP: start where the small one was, settle into place).
  lift(from) {
    const fig = this.el.fig;
    fig.style.transition = 'none'; fig.style.transform = '';
    this.el.card.classList.remove('lifting');
    if (!from?.width) return;
    const to = fig.getBoundingClientRect();
    if (!to.width) return;
    const k = from.height / to.height;
    this.lifted = { x: from.left, y: from.top, k }; // where it set off from (the selftest reads it)
    fig.style.transformOrigin = '0 0';
    fig.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${k})`;
    this.el.card.classList.add('lifting');
    fig.getBoundingClientRect(); // commit the start
    fig.style.transition = 'transform 0.42s cubic-bezier(0.2, 0.8, 0.25, 1)';
    fig.style.transform = '';
    this.liftedAt = performance.now();
  }

  // Keyboard, while open (main.js stops the player moving).
  input(I) {
    if (this.g.craftUI?.input(I)) return; // the CRAFT tab has the keys while it is up
    if (I.hit('KeyQ')) { this.g.craftUI?.setTab(true); return; }
    if (I.hit('KeyI') || I.hit('Tab') || I.hit('Escape')) { this.toggle(false); return; }
    if (I.hit('KeyW') || I.hit('ArrowUp')) { this.sel[this.side] = Math.max(0, this.sel[this.side] - 1); this.render(); }
    if (I.hit('KeyS') || I.hit('ArrowDown')) { this.sel[this.side] = Math.min(Math.max(0, this.count(this.side) - 1), this.sel[this.side] + 1); this.render(); }
    if (I.hit('KeyA') || I.hit('ArrowLeft')) { this.side = 0; this.render(); }
    if (I.hit('KeyD') || I.hit('ArrowRight')) {
      if (this.side === 1 && this.near.length > 1) { this.other = this.near[(this.near.indexOf(this.other) + 1) % this.near.length]; this.g.inventory.opened = this.other; this.sel[1] = 0; }
      this.side = 1; this.render();
    }
    if (I.hit('KeyE') || I.hit('Enter')) this.act('use');
    if (I.hit('Space')) this.act('move');
    if (I.hit('KeyX')) this.act('drop');
    if (I.hit('KeyF')) this.act('wear');
  }

  box(side) { return side === 0 ? this.g.inventory.carried : this.other; }
  guns(side) { return side === 0 ? this.g.inv.weapons : []; }
  count(side) { return this.guns(side).length + (this.box(side)?.slots.length ?? 0); }
  // Row i of a side: a slung gun ({ gun }) or a slot ({ s, i } with i its index in the box).
  entry(side, i) {
    const G = this.guns(side);
    if (i < G.length) return { gun: G[i] };
    const j = i - G.length, s = this.box(side)?.slots[j];
    return s ? { s, i: j } : null;
  }

  // The deal on the other side: its trader at the counter and willing, else null (taking from an owned box is theft).
  deal(box = this.other) { const D = this.g.trade?.at(box); return D && !D.refuse ? D : null; }

  // ---- the containers you wear ------------------------------------------------------------------------------------
  // Your compartments now, and every carried slot put in one (a slot keeps the one it is in while it fits; a loose one
  // goes in the first with room). Sorted by compartment, so the list order is the screen's order.
  placeSlots() {
    const g = this.g, inv = g.inventory, C = inv.carried;
    this.comps = compartments(BODY_LITRES, inv.worn ? ITEMS[inv.worn]?.pack ?? 0 : 0, g.gear?.worn);
    const used = Object.fromEntries(this.comps.map((c) => [c.id, 0])), cap = Object.fromEntries(this.comps.map((c) => [c.id, c.cap]));
    const L = (s) => (ITEMS[s.id]?.bulk ?? 0) * s.n, loose = [];
    for (const s of C.slots) { if (s.where in used && used[s.where] + L(s) <= cap[s.where] + 1e-6) used[s.where] += L(s); else loose.push(s); }
    for (const s of loose) {
      let c = this.comps.find((x) => used[x.id] + L(s) <= x.cap + 1e-6);
      c ??= this.comps.reduce((a, b) => (b.cap - used[b.id] > a.cap - used[a.id] ? b : a));
      s.where = c.id; used[c.id] += L(s);
    }
    const order = Object.fromEntries(this.comps.map((c, i) => [c.id, i]));
    C.slots.sort((a, b) => order[a.where] - order[b.where]);
    for (const c of this.comps) c.used = used[c.id];
  }
  compRoom(id) { const c = this.comps.find((x) => x.id === id); return c ? Math.max(0, c.cap - c.used) : 0; }

  // Move a row somewhere: from { side, box, i } (i: the row on that side; box: the near container's id) to { comp } (a
  // compartment of yours) or { box } (a container near you). The drag-and-drop and the selftest both come through here.
  transfer(from, to) {
    const g = this.g, inv = g.inventory, C = inv.carried;
    this.placeSlots();
    const src = from.side === 0 ? C : this.near.find((b) => b.id === from.box) ?? this.other;
    const G = from.side === 0 ? this.guns(0) : [];
    if (from.side === 0 && from.i < G.length) { // a slung gun
      const k = G[from.i];
      if (to.comp) return { ok: false, why: 'a gun rides on the sling; put it down to stow it' };
      const dest = this.near.find((b) => b.id === to.box);
      return dest ? inv.stowGun(k, dest) : { ok: false, why: 'nowhere to put it' };
    }
    const i = from.i - G.length, s = src?.slots[i];
    if (!s) return { ok: false, why: 'it is gone' };
    const it = ITEMS[s.id], name = it.name.toUpperCase();
    if (to.comp) {
      const c = this.comps.find((x) => x.id === to.comp);
      if (!c) return { ok: false, why: 'you are not wearing that' };
      const fit = it.bulk > 0 ? Math.min(s.n, Math.floor((this.compRoom(c.id) + (src === C && s.where === c.id ? it.bulk * s.n : 0) + 1e-6) / it.bulk)) : s.n;
      if (src === C) { // between your own compartments: the whole stack
        if (s.where === c.id) return null;
        if (fit < s.n) return { ok: false, why: `no room in your ${c.name.toLowerCase()}` };
        s.where = c.id; inv.changed(); return { ok: true, text: `${name} INTO YOUR ${c.name}` };
      }
      const D = this.deal(src);
      if (D) { const r = g.trade.buy(src, i, s.n, D); if (r.ok) { const j = C.slots.findLastIndex((x) => x.id === s.id); if (j >= 0 && this.compRoom(c.id) >= it.bulk * C.slots[j].n) C.slots[j].where = c.id; } return r; }
      if (fit <= 0) return { ok: false, why: `no room in your ${c.name.toLowerCase()}` };
      const n = inv.move(src, i, C, fit, false, c.id);
      return n ? { ok: true, text: `${n > 1 ? `${n} × ` : ''}${name} INTO YOUR ${c.name}` } : { ok: false, why: 'no room on you' };
    }
    const dest = this.near.find((b) => b.id === to.box);
    if (!dest || dest === src) return null;
    const D = this.deal(dest);
    if (src === C && D) return g.trade.sell(i, dest, s.n, D);
    if (src !== C && this.deal(src)) return { ok: false, why: `that's ${this.deal(src).name}'s · buy it first` };
    const n = inv.move(src, i, dest, s.n);
    return n ? { ok: true, text: `${name} ${dest.kind === 'ground' ? 'DOWN' : `INTO ${dest.label}`}` } : { ok: false, why: `no room in ${dest.label}` };
  }

  act(a) {
    const g = this.g, inv = g.inventory;
    if (this.side === 0) this.placeSlots();
    const box = this.box(this.side), e = this.entry(this.side, this.sel[this.side]);
    if (!e) return;
    const other = this.box(1 - this.side), ground = inv.groundAt(g.player.x, g.player.z), D = this.deal();
    const say = (r) => r && this.tell(r.ok ? r.text : r.why.toUpperCase(), !r.ok);
    if (e.gun) { // a gun slung on you
      if (a === 'use') { g.switchWeapon(e.gun); this.tell(`${WEAPONS[e.gun].name} IN HAND`); }
      else if (a === 'move' && D) say(g.trade.sellGun(e.gun, other, D));
      else if (a === 'move' || a === 'drop') say(inv.stowGun(e.gun, a === 'drop' ? ground : other));
      else if (a === 'wear') this.tell('A GUN GOES ON THE SLING, NOT IN A SLOT', true);
    } else {
      const s = e.s, it = ITEMS[s.id], gun = it?.kind === 'gun', theirs = this.side === 1 && D;
      if (a === 'use') {
        if (gun) say(theirs ? g.trade.buy(box, e.i, 1, D) : inv.sling(box, e.i)); // straight to your hands, wherever it lies
        else if (it?.slot && this.side === 0) { const r = g.gear.wear(e.i); say(r); } // E on armor or clothes: put it on
        else {
          let j = e.i;
          if (this.side !== 0) { // into your hands first (bought, over a counter), where it may join a stack you carry
            const got = theirs ? g.trade.buy(box, e.i, 1, D) : { ok: inv.move(box, e.i, inv.carried, 1) > 0, why: 'no room on you' };
            if (!got.ok) { say(got); return this.render(); }
            j = inv.carried.slots.findLastIndex((x) => x.id === s.id);
            this.side = 0; this.sel[0] = this.guns(0).length + j;
          }
          say(inv.use(j));
        }
      } else if (a === 'move') {
        if (D) say(this.side === 1 ? g.trade.buy(box, e.i, s.n, D) : g.trade.sell(e.i, other, s.n, D));
        else if (gun && this.side === 1 && !g.inv.weapons.includes(it.weapon)) say(inv.sling(box, e.i)); // you have none: on the sling
        else if (this.side === 1) { // into the first compartment of yours with room for it
          const c = this.comps.find((x) => this.compRoom(x.id) + 1e-6 >= it.bulk) ?? this.comps[0];
          if (!inv.move(box, e.i, other, s.n, false, c?.id ?? null)) this.tell(gun ? 'NO ROOM ON YOU · E SWAPS IT FOR YOURS' : 'NO ROOM ON YOU', true);
        } else if (!inv.move(box, e.i, other, s.n)) this.tell(`NO ROOM IN ${other.label}`, true);
      } else if (a === 'drop') {
        if (box === ground) return;
        if (theirs) return this.tell(`THAT'S ${D.name.toUpperCase()}'S · SPACE BUYS IT`, true);
        inv.move(box, e.i, ground, s.n);
      } else if (a === 'wear') {
        if (this.side === 0 && it?.slot) { const r = g.gear.wear(e.i); this.tell(r.ok ? r.text : r.why.toUpperCase(), !r.ok); return this.render(); } // armor, clothes, a charm: into its slot
        if (this.side !== 0 || !it?.pack) return this.tell(it?.slot ? 'TAKE IT FIRST, THEN WEAR IT' : 'NOT SOMETHING YOU WEAR', true);
        const r = inv.swapPack(e.i);
        this.tell(r.ok ? `WEARING THE ${ITEMS[r.worn].name.toUpperCase()}` : r.why.toUpperCase(), !r.ok);
      }
    }
    for (const side of [0, 1]) this.sel[side] = Math.min(this.sel[side], Math.max(0, this.count(side) - 1));
    this.render();
  }

  tell(text, bad = false) { this.el.say.textContent = text; this.el.say.classList.toggle('bad', bad); this.sayT = 2.5; }

  update(dt) {
    if (!this.open) return;
    this.g.craftUI?.update(dt);
    if (this.sayT > 0 && (this.sayT -= dt) <= 0) this.el.say.textContent = '';
    // Walked away from the other side (or it drove off): fall back to what's here now.
    const o = this.other, p = this.g.player;
    if (o && o.kind !== 'person' && (o.kind === 'trunk' ? !this.g.vehicles.some((v) => o === this.g.inventory.trunks.get(v.id) && (p.inVehicle === v || Math.hypot(v.x - p.x, v.z - p.z) < Math.max(3.6, v.len * 0.7))) : Math.hypot(o.x - p.x, o.z - p.z) > 3.2 && !this.g.trade?.keeperAt(o))) { this.other = this.pickOther(); this.render(); }
    else if (this.g.inventory.dirty) this.render();
    if (!p.alive) this.toggle(false);
  }

  // A gun slung on you: name, condition, what's in it, and whether it's the one in your hands (and its price at a counter).
  gunRow(k, i, sel, D) {
    const g = this.g, inv = g.inventory, W = WEAPONS[k], st = inv.gunState(k), it = ITEMS[GUN_ITEM[k]];
    const tags = [`<em class="cond c-${st}">${Math.round(inv.cond(k) * 100)}%</em>`, `<em class="uses">${g.inv.mag[k] ?? 0}/${W.mag}</em>`];
    if (STATE[st] && st !== 'worn') tags.push(`<em class="c-${st}">${STATE[st]}</em>`);
    if (D && g.trade.deals(D, GUN_ITEM[k])) tags.push(`<em class="price sell">+$${g.trade.sellPrice({ id: GUN_ITEM[k], n: 1, cond: inv.cond(k) }, 1, D)}</em>`);
    return `<li data-i="${i}" draggable="true" class="${sel ? 'sel' : ''} k-gun slung${g.inv.current === k ? ' hand' : ''}">${icon('gun')}<span class="nm">${W.name}${g.inv.current === k ? ' <i>in hand</i>' : ''}</span>${tags.join('')}<span class="w">${(it?.kg ?? 0).toFixed(1)} kg</span></li>`;
  }

  // A slot: name, count, uses, freshness, a gun's condition and rounds; at a counter, what Space would pay or fetch.
  row(s, i, sel, D, side) {
    const it = ITEMS[s.id], inv = this.g.inventory, f = inv.freshness(s), T = this.g.trade;
    const tags = [];
    let cls = '';
    if (it.uses) tags.push(`<em class="uses">${s.left}/${it.uses}</em>`);
    if (s.cond !== undefined && it.kind !== 'gun') tags.push(`<em class="cond c-${s.cond <= 0 ? 'broken' : s.cond < 0.4 ? 'worn' : 'ok'}">${Math.round(s.cond * 100)}%</em>`); // a made or worn tool
    if (f) tags.push(`<em class="f-${f}">${f.toUpperCase()}</em>`);
    if (it.kind === 'gun') { const c = s.cond ?? 1; tags.push(`<em class="cond c-${c <= 0 ? 'broken' : c < 0.65 ? 'worn' : 'ok'}">${Math.round(c * 100)}%</em>`, `<em class="uses">${s.loaded ?? 0} rds</em>`); }
    if (D && side === 1) tags.push(`<em class="price">$${T.buyPrice(s, s.n, D)}</em>`); // the whole stack, as Space buys it
    else if (D && side === 0) { const pay = T.deals(D, s.id) ? T.sellPrice(s, s.n, D) : 0; if (pay > 0) tags.push(`<em class="price sell">+$${pay}</em>`); else cls = ' no-deal'; }
    return `<li data-i="${i}" draggable="true" class="${sel ? 'sel' : ''} k-${it.kind}${cls}">${icon(it.kind)}<span class="nm">${it.name}${s.n > 1 ? ` <i>×${s.n}</i>` : ''}</span>${tags.join('')}<span class="w">${slotKg(s).toFixed(s.n * it.kg < 1 ? 2 : 1)} kg</span></li>`;
  }

  // YOUR BODY: the big doll (the same figure as the HUD's, the same states), your flag behind it, every paperdoll slot
  // hung beside the part it sits on, what is wrong with each part, the soak per body part; and your dogs.
  renderDoll() {
    const g = this.g, G = g.gear;
    const code = g.player?.flag ?? 'US';
    if (code !== this.flagCode) { this.flagCode = code; const c = drawFlag(code, 150, 100), x = this.el.flag.getContext('2d'); x.clearRect(0, 0, 150, 100); x.drawImage(c, 0, 0); }
    const D = g.hud?.doll;
    D?.readHits();
    partStates(g.needs, INJURIES, D?.shares(), this.states);
    paintDoll(this.el.svg, this.states);
    const chip = (s) => {
      const id = this.wornIn(s), name = id ? (GEAR[id]?.name ?? ITEMS[id]?.name ?? id) : '', P = DOLL_SLOTS[s];
      return `<button class="doll-slot${ARMOR_SLOTS.includes(s) ? ' armor' : ''}${id ? ' worn' : ''} t-${stateTone(this.states[P.part])}" data-slot="${s}" data-part="${P.part}" title="${id ? 'click to take it off' : 'bare'}"><i>${SLOT_LABEL[s]}</i><b>${id ? esc(name) : '—'}</b></button>`;
    };
    const side = (k) => SLOTS.filter((s) => DOLL_SLOTS[s]?.side === k).sort((a, b) => DOLL_SLOTS[a].y - DOLL_SLOTS[b].y).map(chip).join('');
    this.el.colL.innerHTML = side('l'); this.el.colR.innerHTML = side('r');
    const lines = [];
    for (const p of DOLL_PART_IDS) {
      const st = this.states[p];
      if (st === 'ok') continue;
      const ws = (g.needs?.wounds ?? []).filter((w) => (w.part ?? 'torso') === p).map((w) => INJURIES[w.kind]);
      const needs = [...new Set(ws.flatMap((d) => d?.needs ?? []))];
      lines.push(`<span class="t-${stateTone(st)}" data-part="${p}"><b>${partName(p)}</b> ${stateLabel(st)}${ws.length > 1 ? ` <i>(${ws.length} wounds)</i>` : ''}${needs.length && !['bandaged', 'splinted', 'hurt', 'missing'].includes(st) ? ` · <i>${needs.join(', ').toUpperCase()}</i>` : ''}</span>`);
    }
    this.el.wounds.innerHTML = lines.length ? lines.join('') : '<span class="fine">NOTHING WRONG WITH YOU</span>';
    this.el.soak.innerHTML = `SOAK ${PARTS.map((p) => `<span>${p.toUpperCase()} <b>${Math.round(G.soakBy[p] * 100)}%</b></span>`).join('')}`;
    const mine = g.dogs?.mine() ?? [];
    this.el.dogs.innerHTML = mine.length ? mine.map((d) => `<span class="dog${d.downed ? ' down' : ''}"><b>${esc(d.name.toUpperCase())}</b> ${BREEDS[d.breed].name.toUpperCase()} · ${BOND_TIERS[g.dogs.tier(d)]} · ${d.downed ? `DOWN ${Math.ceil(d.bleedT)} S` : `${Math.round(d.hp)}/${d.maxHp} HP`} · ${d.ride ? 'RIDING' : d.cmd.toUpperCase()}</span>`).join('') + '<em>C WHISTLES · TAP HEEL · ×2 GUARD · ×3 SEEK · HOLD SIC</em>'
      : `<span class="nodog">NO DOG${(g.dogs?.fallen.length ?? 0) ? ` · REMEMBERED: ${g.dogs.fallen.map((f) => esc(f.name.toUpperCase())).join(', ')}` : ' · FEED A STRAY (JERKY, DRIED MEAT) UNTIL IT FOLLOWS YOU'}</span>`;
  }

  // ON YOU: the slung guns, then each compartment you wear with what is in it (the row index is the carried list's).
  renderCarry(D) {
    const g = this.g, C = g.inventory.carried, G = this.guns(0), sel = this.sel[0], act = this.side === 0;
    const out = [];
    if (G.length) out.push(`<section class="inv-comp slung-on"><h4>${icon('gun')}SLUNG ON YOU</h4><ol class="inv-list">${G.map((k, i) => this.gunRow(k, i, act && i === sel, D)).join('')}</ol></section>`);
    for (const c of this.comps) {
      const rows = [];
      C.slots.forEach((s, j) => { if (s.where === c.id) rows.push(this.row(s, G.length + j, act && G.length + j === sel, D, 0)); });
      const full = c.used / Math.max(0.01, c.cap);
      out.push(`<section class="inv-comp" data-comp="${c.id}" data-drop="comp:${c.id}"><h4>${icon(c.icon)}${c.name}<span class="cl"><i><em style="width:${Math.min(100, full * 100).toFixed(0)}%" class="${full > 1.001 ? 'over' : ''}"></em></i>${c.used.toFixed(1)} / ${c.cap} L</span></h4><ol class="inv-list">${rows.join('') || '<li class="empty">Empty.</li>'}</ol></section>`);
    }
    this.el.comps.innerHTML = out.join('');
  }

  // NEAR YOUR FEET: each container within reach, its rows; the other side (Space's) marked.
  renderNear(D) {
    const g = this.g, act = this.side === 1, out = [];
    for (const b of this.near) {
      const at = g.trade?.at(b), d = at && !at.refuse ? at : null, cur = b === this.other;
      const whose = !b.owner ? '' : d ? ` · ${d.name.toUpperCase()}'S COUNTER · ${d.tier.toUpperCase()} PRICES` : ` · ${b.ownerName.toUpperCase()}'S${at?.refuse ? ` · ${at.name.toUpperCase()} WON'T DEAL WITH YOU` : ''}: TAKING IS STEALING`;
      const rows = b.slots.map((s, j) => this.row(s, j, act && cur && j === this.sel[1], cur ? D : d, 1));
      const empty = b.kind === 'ground' ? 'Nothing on the ground here.' : 'Empty.';
      out.push(`<section class="inv-group${cur ? ' cur' : ''}" data-box="${esc(b.id)}" data-drop="box:${esc(b.id)}"><h4 class="${b.owner && !d ? 'owned' : d ? 'trade' : ''}">${icon(boxIcon(b))}<span class="lb">${esc(b.label)}${b.kind === 'ground' ? '' : ` · ${b.litres().toFixed(0)} / ${b.cap} L`}${whose}</span></h4><ol class="inv-list">${rows.join('') || `<li class="empty">${empty}</li>`}</ol></section>`);
    }
    this.el.groups.innerHTML = out.join('');
  }

  render() {
    const g = this.g, inv = g.inventory;
    inv.dirty = false;
    if (!this.other) this.other = this.pickOther();
    this.near = this.findNear();
    this.placeSlots();
    const C = inv.carried, cap = g.skills?.carryKg ?? 24, kg = inv.kg();
    this.el.worn.textContent = inv.worn ? `WEARING ${ITEMS[inv.worn].name.toUpperCase()} · +${ITEMS[inv.worn].pack} L` : 'NO PACK';
    // What the world calls you (systems/roles.js), best first.
    const roles = g.roles?.shown(4) ?? [];
    this.el.roles.textContent = roles.length ? `KNOWN AS ${roles.map((r) => `${r.short}${['', ' (RUMOURED)', '', ' (RENOWNED)'][r.tier]}`).join(' · ')}` : 'NOBODY CALLS YOU ANYTHING YET';
    this.el.kg.style.width = `${Math.min(100, (100 * (g.skills?.kg ?? kg)) / cap)}%`;
    this.el.kg.className = `inv-kg ${(g.skills?.kg ?? kg) > cap ? 'over' : (g.skills?.kg ?? kg) > cap * 0.75 ? 'heavy' : ''}`;
    this.el.kgT.textContent = `${(g.skills?.kg ?? kg).toFixed(1)} / ${cap.toFixed(0)} KG`;
    this.el.l.style.width = `${Math.min(100, (100 * C.litres()) / C.cap)}%`;
    this.el.lT.textContent = `${C.litres().toFixed(1)} / ${C.cap} L`;
    const o = this.other, D = this.deal();
    this.renderDoll();
    for (let side = 0; side < 2; side++) this.el.cols[side].classList.toggle('active', this.side === side);
    this.renderCarry(D);
    this.renderNear(D);
    const e = this.entry(this.side, this.sel[this.side]);
    let useT = 'USE', canUse = false, isPack = false;
    if (e?.gun) {
      const k = e.gun, W = WEAPONS[k], it = ITEMS[GUN_ITEM[k]], st = inv.gunState(k);
      this.el.dname.textContent = W.name;
      this.el.desc.textContent = it?.desc ?? '';
      this.el.stats.textContent = [`${Math.round(inv.cond(k) * 100)}% condition${STATE[st] ? ` (${STATE[st].toLowerCase()})` : ''}`, `${g.inv.mag[k] ?? 0} of ${W.mag} loaded`, `${g.inv.ammo[g.arms?.ammoOf(k) ?? W.ammo] ?? 0} rounds for it on you`, `${(it?.kg ?? 0).toFixed(1)} kg`].join(' · ');
      useT = g.inv.current === k ? 'IN HAND' : 'TAKE IN HAND'; canUse = g.inv.current !== k;
    } else if (e) {
      const cash = (v) => (v >= 10 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`);
      const s = e.s, it = ITEMS[s.id], f = inv.freshness(s), worth = g.trade?.worth(s) ?? it.value;
      const bits = [`${slotKg(s).toFixed(2)} kg`, `${(it.bulk * s.n).toFixed(1)} L`];
      if (this.side === 0 && s.where) bits.push(`in your ${this.comps.find((c) => c.id === s.where)?.name.toLowerCase() ?? s.where}`);
      if (!D) bits.push(`worth ${cash(worth)}${s.n > 1 ? ' each' : ''}${f === 'stale' ? ' (stale: half)' : f === 'rotten' ? ' (rotten)' : ''}`);
      if (it.uses) bits.push(`${s.left} of ${it.uses} left`);
      if (it.needs) bits.push(`needs a ${it.needs}${inv.hasTag(it.needs) ? ' ✓' : ' (you have none)'}`);
      if (it.pack) bits.push(`+${it.pack} L worn`);
      const gr = GEAR[s.id];
      if (gr) {
        bits.unshift(`worn: ${SLOT_LABEL[gr.slot].toLowerCase()}${g.gear.worn[gr.slot] ? ` (swaps the ${GEAR[g.gear.worn[gr.slot]].name.toLowerCase()})` : ''}`);
        if (gr.soak) bits.push(`soaks ${Math.round(gr.soak * 100)}% of a hit on the ${gr.covers.join(', ')}`);
        for (const [k, t] of [['carry', (v) => `+${v} kg carried`], ['speed', (v) => `${Math.round(v * 100)}% quicker on foot`], ['reload', (v) => `${Math.round(v * 100)}% quicker reloads`], ['stealth', (v) => `seen ${Math.round(v * 100)}% closer`], ['repair', (v) => `patches ${Math.round(v * 100)}% better`], ['luck', (v) => `+${v} find in every box you open first`], ['unarmed', () => 'teeth for bare fists (no bare-hands fighting yet)']]) if (gr[k]) bits.push(t(gr[k]));
      }
      if (it.kind === 'gun') { bits.unshift(`${Math.round((s.cond ?? 1) * 100)}% condition`, `${s.loaded ?? 0} rounds in it`); useT = g.inv.weapons.includes(it.weapon) ? 'SWAP FOR YOURS' : 'SLING IT'; canUse = true; }
      else { canUse = !!it.use || (!!it.slot && this.side === 0); if (it.slot && this.side === 0) useT = 'WEAR'; }
      if (it.ammo) bits.push(g.inv.weapons.some((k) => WEAPONS[k]?.ammo === it.ammo || WEAPONS[k]?.modes?.some((m) => m.ammo === it.ammo)) ? 'fits a gun you carry' : 'fits none of your guns');
      if (D) bits.push(this.side === 1 ? `${D.name} sells ${s.n > 1 ? `all ${s.n} for` : 'it for'} $${g.trade.buyPrice(s, s.n, D)}` : g.trade.deals(D, s.id) ? `${D.name} pays $${g.trade.sellPrice(s, s.n, D)}${s.n > 1 ? ` for all ${s.n}` : ''}` : `${D.name} doesn't deal in it`);
      this.el.dname.textContent = it.name.toUpperCase();
      this.el.desc.textContent = it.desc;
      this.el.stats.textContent = bits.join(' · ');
      isPack = (!!it.pack || !!it.slot) && this.side === 0;
    } else { this.el.dname.textContent = ''; this.el.desc.textContent = ''; this.el.stats.textContent = ''; }
    this.el.useT.textContent = useT;
    const put = `PUT ${o?.kind === 'ground' ? 'DOWN' : o?.kind === 'trunk' ? 'IN THE TRUNK' : o?.id?.startsWith('body:') ? 'ON THE BODY' : 'IN THE BOX'}`;
    const gunPay = e?.gun && D && g.trade.deals(D, GUN_ITEM[e.gun]) ? g.trade.sellPrice({ id: GUN_ITEM[e.gun], n: 1, cond: inv.cond(e.gun) }, 1, D) : 0;
    const slotPay = e?.s && D && g.trade.deals(D, e.s.id) ? g.trade.sellPrice(e.s, e.s.n, D) : 0;
    this.el.moveT.textContent = !D ? (this.side === 1 ? 'TAKE' : put)
      : this.side === 1 ? (e?.s ? `BUY $${g.trade.buyPrice(e.s, e.s.n, D)}` : 'BUY')
      : gunPay > 0 || slotPay > 0 ? `SELL +$${gunPay || slotPay}` : `${D.name.toUpperCase()} WON'T BUY IT`;
    this.el.acts.querySelector('[data-a="wear"]').classList.toggle('hidden', !isPack);
    this.el.acts.querySelector('[data-a="use"]').classList.toggle('hidden', !canUse);
  }
}
