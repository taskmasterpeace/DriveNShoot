import { ITEMS } from '../data/items.js';
import { slotKg } from '../systems/inventory.js';

// The PACK screen (I or Tab): what's on you beside the other side - the trunk of the car you're at, a box or a
// body you opened, or the ground at your feet. The world keeps running while you rummage (you stand still), so a
// pack opened in a fight costs you. Keyboard: W/S pick, A/D side, E use, Space move across, X drop, F wear a pack.
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
};
const icon = (kind) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[kind] ?? ICON.paper}</svg>`;

export class InventoryUI {
  constructor(game, root) {
    this.g = game;
    root.insertAdjacentHTML('beforeend', `
      <div class="invmenu hidden">
        <div class="inv-card">
          <div class="inv-head">
            <b class="inv-title">PACK</b><span class="inv-worn"></span>
            <div class="inv-meters">
              <div class="inv-meter"><span>WEIGHT</span><i><em class="inv-kg"></em></i><b class="inv-kg-t"></b></div>
              <div class="inv-meter"><span>ROOM</span><i><em class="inv-l"></em></i><b class="inv-l-t"></b></div>
            </div>
          </div>
          <div class="inv-cols">
            <section class="inv-col" data-side="0"><h4>ON YOU</h4><ol class="inv-list"></ol></section>
            <section class="inv-col" data-side="1"><h4 class="inv-other"></h4><ol class="inv-list"></ol></section>
          </div>
          <div class="inv-detail">
            <div class="inv-dname"></div>
            <div class="inv-desc"></div>
            <div class="inv-stats"></div>
            <div class="inv-acts">
              <button data-a="use"><kbd>E</kbd>USE</button><button data-a="move"><kbd>SPACE</kbd><span class="inv-move-t">MOVE</span></button>
              <button data-a="wear"><kbd>F</kbd>WEAR</button><button data-a="drop"><kbd>X</kbd>DROP</button>
            </div>
          </div>
          <div class="inv-say"></div>
          <div class="inv-keys"><kbd>W</kbd><kbd>S</kbd>pick <kbd>A</kbd><kbd>D</kbd>side <kbd>I</kbd>close</div>
        </div>
      </div>`);
    const q = (s) => root.querySelector(`.invmenu ${s}`);
    this.el = {
      menu: root.querySelector('.invmenu'), worn: q('.inv-worn'), kg: q('.inv-kg'), kgT: q('.inv-kg-t'), l: q('.inv-l'), lT: q('.inv-l-t'),
      lists: [...root.querySelectorAll('.invmenu .inv-list')], cols: [...root.querySelectorAll('.invmenu .inv-col')], other: q('.inv-other'),
      dname: q('.inv-dname'), desc: q('.inv-desc'), stats: q('.inv-stats'), acts: q('.inv-acts'), moveT: q('.inv-move-t'), say: q('.inv-say'),
    };
    this.open = false; this.side = 0; this.sel = [0, 0]; this.other = null; this.sayT = 0;
    this.el.lists.forEach((ol, side) => ol.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]'); if (!li) return;
      this.side = side; this.sel[side] = +li.dataset.i; this.render();
    }));
    this.el.lists.forEach((ol, side) => ol.addEventListener('dblclick', (e) => { const li = e.target.closest('li[data-i]'); if (!li) return; this.side = side; this.sel[side] = +li.dataset.i; this.act('move'); }));
    this.el.acts.addEventListener('click', (e) => { const b = e.target.closest('button[data-a]'); if (b) this.act(b.dataset.a); });
  }

  // The other side: whatever is opened, else a box or body at your feet, else the car you're in or standing at,
  // else the ground.
  pickOther() {
    const g = this.g, inv = g.inventory, p = g.player;
    if (inv.opened && (inv.opened.kind === 'trunk' || Math.hypot(inv.opened.x - p.x, inv.opened.z - p.z) < 3)) return inv.opened;
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
    const box = this.box(this.side);
    if (I.hit('KeyW') || I.hit('ArrowUp')) { this.sel[this.side] = Math.max(0, this.sel[this.side] - 1); this.render(); }
    if (I.hit('KeyS') || I.hit('ArrowDown')) { this.sel[this.side] = Math.min(Math.max(0, box.slots.length - 1), this.sel[this.side] + 1); this.render(); }
    if (I.hit('KeyA') || I.hit('ArrowLeft')) { this.side = 0; this.render(); }
    if (I.hit('KeyD') || I.hit('ArrowRight')) { this.side = 1; this.render(); }
    if (I.hit('KeyE') || I.hit('Enter')) this.act('use');
    if (I.hit('Space')) this.act('move');
    if (I.hit('KeyX')) this.act('drop');
    if (I.hit('KeyF')) this.act('wear');
  }

  box(side) { return side === 0 ? this.g.inventory.carried : this.other; }

  act(a) {
    const inv = this.g.inventory, box = this.box(this.side), i = this.sel[this.side], s = box?.slots[i];
    if (!s) return;
    let r = null;
    if (a === 'use') {
      if (this.side !== 0) { const n = inv.move(box, i, inv.carried, 1); if (!n) return this.tell('NO ROOM ON YOU'); this.side = 0; this.sel[0] = inv.carried.slots.length - 1; }
      r = inv.use(this.sel[0]);
      this.tell(r.ok ? r.text : r.why.toUpperCase(), !r.ok);
    } else if (a === 'move') {
      const to = this.box(1 - this.side), n = inv.move(box, i, to, s.n);
      if (!n) this.tell(this.side === 0 ? `NO ROOM IN ${to.label}` : 'NO ROOM ON YOU', true);
    } else if (a === 'drop') {
      const ground = inv.groundAt(this.g.player.x, this.g.player.z);
      if (box === ground) return;
      inv.move(box, i, ground, s.n);
      if (this.side === 1 && this.other !== ground) this.other = this.other; // stays on the trunk/box
    } else if (a === 'wear') {
      if (this.side !== 0 || !ITEMS[s.id]?.pack) return this.tell('ONLY A PACK GOES ON YOUR BACK', true);
      r = inv.swapPack(i);
      this.tell(r.ok ? `WEARING THE ${ITEMS[r.worn].name.toUpperCase()}` : r.why.toUpperCase(), !r.ok);
    }
    this.sel[this.side] = Math.min(this.sel[this.side], Math.max(0, this.box(this.side).slots.length - 1));
    this.render();
  }

  tell(text, bad = false) { this.el.say.textContent = text; this.el.say.classList.toggle('bad', bad); this.sayT = 2.5; }

  update(dt) {
    if (!this.open) return;
    if (this.sayT > 0 && (this.sayT -= dt) <= 0) this.el.say.textContent = '';
    // Walked away from the other side (or it drove off): fall back to what's here now.
    const o = this.other, p = this.g.player;
    if (o && o.kind !== 'person' && (o.kind === 'trunk' ? !this.g.vehicles.some((v) => o === this.g.inventory.trunks.get(v.id) && (p.inVehicle === v || Math.hypot(v.x - p.x, v.z - p.z) < Math.max(3.6, v.len * 0.7))) : Math.hypot(o.x - p.x, o.z - p.z) > 3.2)) { this.other = this.pickOther(); this.render(); }
    else if (this.g.inventory.dirty) this.render();
    if (!p.alive) this.toggle(false);
  }

  row(s, i, sel) {
    const it = ITEMS[s.id], inv = this.g.inventory, f = inv.freshness(s);
    const tags = [];
    if (it.uses) tags.push(`<em class="uses">${s.left}/${it.uses}</em>`);
    if (f) tags.push(`<em class="f-${f}">${f.toUpperCase()}</em>`);
    return `<li data-i="${i}" class="${sel ? 'sel' : ''} k-${it.kind}">${icon(it.kind)}<span class="nm">${it.name}${s.n > 1 ? ` <i>×${s.n}</i>` : ''}</span>${tags.join('')}<span class="w">${slotKg(s).toFixed(s.n * it.kg < 1 ? 2 : 1)} kg</span></li>`;
  }

  render() {
    const g = this.g, inv = g.inventory;
    inv.dirty = false;
    if (!this.other) this.other = this.pickOther();
    const C = inv.carried, cap = g.skills?.carryKg ?? 24, kg = inv.kg();
    this.el.worn.textContent = inv.worn ? `WEARING ${ITEMS[inv.worn].name.toUpperCase()} · +${ITEMS[inv.worn].pack} L` : 'NO PACK';
    this.el.kg.style.width = `${Math.min(100, (100 * (g.skills?.kg ?? kg)) / cap)}%`;
    this.el.kg.className = `inv-kg ${(g.skills?.kg ?? kg) > cap ? 'over' : (g.skills?.kg ?? kg) > cap * 0.75 ? 'heavy' : ''}`;
    this.el.kgT.textContent = `${(g.skills?.kg ?? kg).toFixed(1)} / ${cap.toFixed(0)} KG`;
    this.el.l.style.width = `${Math.min(100, (100 * C.litres()) / C.cap)}%`;
    this.el.lT.textContent = `${C.litres().toFixed(1)} / ${C.cap} L`;
    const o = this.other;
    this.el.other.textContent = o ? `${o.label}${o.kind === 'ground' ? '' : ` · ${o.litres().toFixed(0)} / ${o.cap} L`}${o.owner ? ` · ${o.ownerName.toUpperCase()}'S: TAKING IS STEALING` : ''}` : '';
    this.el.other.classList.toggle('owned', !!o?.owner);
    for (let side = 0; side < 2; side++) {
      const box = this.box(side), sel = this.sel[side];
      this.el.cols[side].classList.toggle('active', this.side === side);
      this.el.lists[side].innerHTML = box?.slots.length ? box.slots.map((s, i) => this.row(s, i, i === sel)).join('') : `<li class="empty">${side === 0 ? 'Nothing on you.' : o?.kind === 'ground' ? 'Nothing on the ground here.' : 'Empty.'}</li>`;
    }
    const s = this.box(this.side)?.slots[this.sel[this.side]], it = s && ITEMS[s.id];
    this.el.dname.textContent = it ? it.name.toUpperCase() : '';
    this.el.desc.textContent = it ? it.desc : '';
    if (it) {
      const f = inv.freshness(s), bits = [`${slotKg(s).toFixed(2)} kg`, `${(it.bulk * s.n).toFixed(1)} L`, `$${it.value}${f === 'stale' ? ' (stale: half)' : f === 'rotten' ? ' (rotten)' : ''}`];
      if (it.uses) bits.push(`${s.left} of ${it.uses} left`);
      if (it.needs) bits.push(`needs a ${it.needs}${inv.hasTag(it.needs) ? ' ✓' : ' (you have none)'}`);
      if (it.pack) bits.push(`+${it.pack} L worn`);
      this.el.stats.textContent = bits.join(' · ');
    } else this.el.stats.textContent = '';
    this.el.moveT.textContent = this.side === 1 ? 'TAKE' : `PUT ${o?.kind === 'ground' ? 'DOWN' : o?.kind === 'trunk' ? 'IN THE TRUNK' : o?.id?.startsWith('body:') ? 'ON THE BODY' : 'IN THE BOX'}`;
    this.el.acts.querySelector('[data-a="wear"]').classList.toggle('hidden', !(it?.pack && this.side === 0));
    this.el.acts.querySelector('[data-a="use"]').classList.toggle('hidden', !it?.use);
  }
}
