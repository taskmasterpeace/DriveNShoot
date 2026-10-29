import { ITEMS, GUN_ITEM } from '../data/items.js';
import { slotKg } from '../systems/inventory.js';
import { WEAPONS } from '../systems/combat.js';
import { SLOTS, SLOT_LABEL, ARMOR_SLOTS, PARTS, GEAR } from '../data/gear.js';
import { BREEDS, BOND_TIERS } from '../data/dogs.js';

// The PACK screen (I or Tab): what's on you beside the other side - the trunk of the car you're at, a box or a
// body you opened, or the ground at your feet. The world keeps running while you rummage (you stand still), so a
// pack opened in a fight costs you. Keyboard: W/S pick, A/D side, E use, Space move across, X drop, F wear a pack.
// The ON YOU side starts with the guns slung on you (the loadout): E takes one in hand, Space puts it in the other
// side, X puts it down. A gun item anywhere is slung with E (swapped for yours, if you carry one of its kind).
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
};
const icon = (kind) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[kind] ?? ICON.paper}</svg>`;
const STATE = { ok: '', worn: 'WORN', jammed: 'JAMMED', broken: 'BROKEN' };

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
          <div class="inv-doll"></div>
          <div class="inv-dogs"></div>
          <div class="inv-cols">
            <section class="inv-col" data-side="0"><h4>ON YOU</h4><ol class="inv-list"></ol></section>
            <section class="inv-col" data-side="1"><h4 class="inv-other"></h4><ol class="inv-list"></ol></section>
          </div>
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
          <div class="inv-keys"><kbd>W</kbd><kbd>S</kbd>pick <kbd>A</kbd><kbd>D</kbd>side <kbd>I</kbd>close</div>
        </div>
      </div>`);
    const q = (s) => root.querySelector(`.invmenu ${s}`);
    this.el = {
      menu: root.querySelector('.invmenu'), worn: q('.inv-worn'), roles: q('.inv-roles'), kg: q('.inv-kg'), kgT: q('.inv-kg-t'), l: q('.inv-l'), lT: q('.inv-l-t'),
      lists: [...root.querySelectorAll('.invmenu .inv-list')], cols: [...root.querySelectorAll('.invmenu .inv-col')], other: q('.inv-other'),
      doll: q('.inv-doll'), dogs: q('.inv-dogs'), dname: q('.inv-dname'), desc: q('.inv-desc'), stats: q('.inv-stats'), acts: q('.inv-acts'), useT: q('.inv-use-t'), moveT: q('.inv-move-t'), say: q('.inv-say'),
    };
    this.open = false; this.side = 0; this.sel = [0, 0]; this.other = null; this.sayT = 0;
    this.el.lists.forEach((ol, side) => ol.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]'); if (!li) return;
      this.side = side; this.sel[side] = +li.dataset.i; this.render();
    }));
    this.el.lists.forEach((ol, side) => ol.addEventListener('dblclick', (e) => { const li = e.target.closest('li[data-i]'); if (!li) return; this.side = side; this.sel[side] = +li.dataset.i; this.act('move'); }));
    this.el.acts.addEventListener('click', (e) => { const b = e.target.closest('button[data-a]'); if (b) this.act(b.dataset.a); });
    // A worn slot's chip: click takes it off (into the pack; at your feet with no room).
    this.el.doll.addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (!b || !this.g.gear.worn[b.dataset.slot]) return; const r = this.g.gear.takeOff(b.dataset.slot); this.tell(r.ok ? r.text : r.why.toUpperCase(), !r.ok); this.render(); });
  }

  // The other side: whatever is opened, else a box or body at your feet, else the car you're in or standing at,
  // else the ground.
  pickOther() {
    const g = this.g, inv = g.inventory, p = g.player;
    if (inv.opened && (inv.opened.kind === 'trunk' || Math.hypot(inv.opened.x - p.x, inv.opened.z - p.z) < 3 || g.trade?.keeperAt(inv.opened))) return inv.opened; // a counter opened from a talk: anywhere in the shop
    const near = !p.inVehicle && inv.nearest(p.x, p.z, 2.6, true); // a body is long: stand anywhere along it
    if (near) return inv.open(near);
    const v = p.inVehicle ?? g.vehicles.find((c) => !c.dead && !c.sunk && Math.hypot(c.x - p.x, c.z - p.z) < Math.max(3.4, c.len * 0.65));
    if (v) return inv.trunk(v);
    return inv.groundAt(p.x, p.z);
  }

  toggle(on = !this.open) {
    if (on && !this.g.player.alive) return;
    this.open = on;
    this.el.menu.classList.toggle('hidden', !on);
    if (on) { this.other = this.pickOther(); this.side = 0; this.render(); }
    else { const inv = this.g.inventory; inv.opened = null; inv.prune?.(); }
    this.g.emit('pack', { open: on, other: this.other?.id ?? null });
  }

  // Keyboard, while open (main.js stops the player moving).
  input(I) {
    if (I.hit('KeyI') || I.hit('Tab') || I.hit('Escape')) { this.toggle(false); return; }
    if (I.hit('KeyW') || I.hit('ArrowUp')) { this.sel[this.side] = Math.max(0, this.sel[this.side] - 1); this.render(); }
    if (I.hit('KeyS') || I.hit('ArrowDown')) { this.sel[this.side] = Math.min(Math.max(0, this.count(this.side) - 1), this.sel[this.side] + 1); this.render(); }
    if (I.hit('KeyA') || I.hit('ArrowLeft')) { this.side = 0; this.render(); }
    if (I.hit('KeyD') || I.hit('ArrowRight')) { this.side = 1; this.render(); }
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
  deal() { const D = this.g.trade?.at(this.other); return D && !D.refuse ? D : null; }

  act(a) {
    const g = this.g, inv = g.inventory, box = this.box(this.side), e = this.entry(this.side, this.sel[this.side]);
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
        else if (!inv.move(box, e.i, other, s.n)) this.tell(this.side === 0 ? `NO ROOM IN ${other.label}` : gun ? 'NO ROOM ON YOU · E SWAPS IT FOR YOURS' : 'NO ROOM ON YOU', true);
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
    return `<li data-i="${i}" class="${sel ? 'sel' : ''} k-gun slung${g.inv.current === k ? ' hand' : ''}">${icon('gun')}<span class="nm">${W.name}${g.inv.current === k ? ' <i>in hand</i>' : ''}</span>${tags.join('')}<span class="w">${(it?.kg ?? 0).toFixed(1)} kg</span></li>`;
  }

  // A slot: name, count, uses, freshness, a gun's condition and rounds; at a counter, what Space would pay or fetch.
  row(s, i, sel, D, side) {
    const it = ITEMS[s.id], inv = this.g.inventory, f = inv.freshness(s), T = this.g.trade;
    const tags = [];
    let cls = '';
    if (it.uses) tags.push(`<em class="uses">${s.left}/${it.uses}</em>`);
    if (f) tags.push(`<em class="f-${f}">${f.toUpperCase()}</em>`);
    if (it.kind === 'gun') { const c = s.cond ?? 1; tags.push(`<em class="cond c-${c <= 0 ? 'broken' : c < 0.65 ? 'worn' : 'ok'}">${Math.round(c * 100)}%</em>`, `<em class="uses">${s.loaded ?? 0} rds</em>`); }
    if (D && side === 1) tags.push(`<em class="price">$${T.buyPrice(s, s.n, D)}</em>`); // the whole stack, as Space buys it
    else if (D && side === 0) { const pay = T.deals(D, s.id) ? T.sellPrice(s, s.n, D) : 0; if (pay > 0) tags.push(`<em class="price sell">+$${pay}</em>`); else cls = ' no-deal'; }
    return `<li data-i="${i}" class="${sel ? 'sel' : ''} k-${it.kind}${cls}">${icon(it.kind)}<span class="nm">${it.name}${s.n > 1 ? ` <i>×${s.n}</i>` : ''}</span>${tags.join('')}<span class="w">${slotKg(s).toFixed(s.n * it.kg < 1 ? 2 : 1)} kg</span></li>`;
  }

  // The paperdoll: 19 slots in three rows (armor, clothing, accessories), what is in each, the soak per body part; and
  // your dogs (name, breed, bond tier, health, what it is doing).
  renderDoll() {
    const g = this.g, G = g.gear, inv = g.inventory, esc = (t) => String(t).replace(/[<>&]/g, '');
    const chip = (s) => {
      const id = s === 'back' ? inv.worn : G.worn[s], name = id ? (GEAR[id]?.name ?? ITEMS[id]?.name ?? id) : '';
      return `<button class="doll-slot${ARMOR_SLOTS.includes(s) ? ' armor' : ''}${id ? ' worn' : ''}" data-slot="${s}" title="${id ? 'click to take it off' : 'bare'}"><i>${SLOT_LABEL[s]}</i><b>${id ? esc(name) : '—'}</b></button>`;
    };
    const soak = PARTS.map((p) => `<span>${p.toUpperCase()} <b>${Math.round(G.soakBy[p] * 100)}%</b></span>`).join('');
    this.el.doll.innerHTML = `<div class="doll-row">${SLOTS.slice(0, 6).map(chip).join('')}</div><div class="doll-row">${SLOTS.slice(6, 13).map(chip).join('')}</div><div class="doll-row">${SLOTS.slice(13).map(chip).join('')}<div class="doll-soak">SOAK ${soak}</div></div>`;
    const mine = g.dogs?.mine() ?? [];
    this.el.dogs.innerHTML = mine.length ? mine.map((d) => `<span class="dog${d.downed ? ' down' : ''}"><b>${esc(d.name.toUpperCase())}</b> ${BREEDS[d.breed].name.toUpperCase()} · ${BOND_TIERS[g.dogs.tier(d)]} · ${d.downed ? `DOWN ${Math.ceil(d.bleedT)} S` : `${Math.round(d.hp)}/${d.maxHp} HP`} · ${d.ride ? 'RIDING' : d.cmd.toUpperCase()}</span>`).join('') + '<em>C WHISTLES · TAP HEEL · ×2 GUARD · ×3 SEEK · HOLD SIC</em>'
      : `<span class="nodog">NO DOG${(g.dogs?.fallen.length ?? 0) ? ` · REMEMBERED: ${g.dogs.fallen.map((f) => esc(f.name.toUpperCase())).join(', ')}` : ' · FEED A STRAY (JERKY, DRIED MEAT) UNTIL IT FOLLOWS YOU'}</span>`;
  }

  render() {
    const g = this.g, inv = g.inventory;
    inv.dirty = false;
    if (!this.other) this.other = this.pickOther();
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
    // Whose box: a trader's counter (prices by their people's standing with you), somebody's shelf (stealing), or nobody's.
    const o = this.other, at = g.trade?.at(o), D = at && !at.refuse ? at : null;
    const whose = !o?.owner ? '' : D ? ` · ${D.name.toUpperCase()}'S COUNTER · ${D.tier.toUpperCase()} PRICES` : ` · ${o.ownerName.toUpperCase()}'S${at?.refuse ? ` · ${at.name.toUpperCase()} WON'T DEAL WITH YOU` : ''}: TAKING IS STEALING`;
    this.el.other.textContent = o ? `${o.label}${o.kind === 'ground' ? '' : ` · ${o.litres().toFixed(0)} / ${o.cap} L`}${whose}` : '';
    this.el.other.classList.toggle('owned', !!o?.owner && !D);
    this.el.other.classList.toggle('trade', !!D);
    this.renderDoll();
    for (let side = 0; side < 2; side++) {
      const box = this.box(side), sel = this.sel[side], G = this.guns(side);
      this.el.cols[side].classList.toggle('active', this.side === side);
      const rows = G.map((k, i) => this.gunRow(k, i, i === sel, D));
      if (G.length) rows.push('<li class="divider"></li>');
      if (box?.slots.length) box.slots.forEach((s, j) => rows.push(this.row(s, G.length + j, G.length + j === sel, D, side)));
      else rows.push(`<li class="empty">${side === 0 ? 'Nothing else on you.' : o?.kind === 'ground' ? 'Nothing on the ground here.' : 'Empty.'}</li>`);
      this.el.lists[side].innerHTML = rows.join('');
    }
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
