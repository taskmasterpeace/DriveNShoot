import './workshop.css';
import { paintPaper, makeCanvas } from './hudart.js';
import { ITEMS } from '../data/items.js';
import { FACES6, FACE_LABEL, ARMOR, MOUNT_WEAPONS, UTILITY, PAINTS } from '../data/workshop.js';
import { groupOf } from '../systems/garage.js';

// THE WORKSHOP screen (U at a garage with your car parked close, or ask Kenji). The car as a work order pinned to the
// bench: a top-down drawing with its six faces as plates you pick and its mount points with their arcs; beside it the
// parts rack in TABS (never one long scroll), each row a priced tag; under it the numbers the car will have once the
// part is on (weight, top speed, pull, handling, braking, power), ghosted before you pay. Everything here calls
// systems/workshop.js, the same verbs the `workshop` command drives.
// Keys: Q / F (pad LB / RB) the tabs, W S A D (D-pad) the rack, Space (pad Y) the next face or mount, E or Enter (pad A)
// fit, X (pad X) take off, R repair the picked face, U / Tab / Esc (pad B) close. Mouse: click anything, double-click fits.
// Rebuilt only when something changes (never per frame).
const TABS = [
  { id: 'armor', label: 'ARMOR', key: '1' },
  { id: 'weapons', label: 'WEAPONS', key: '2' },
  { id: 'wheels', label: 'WHEELS', key: '3' },
  { id: 'utility', label: 'UTILITY', key: '4' },
  { id: 'ammo', label: 'AMMO', key: '5' },
  { id: 'repair', label: 'REPAIR', key: '6' },
  { id: 'paint', label: 'PAINT', key: '7' },
];
const MOUNT_NAME = { front: 'HOOD', rear: 'TAIL', left: 'LEFT POD', right: 'RIGHT POD', top: 'ROOF' };
const PARTS = ['engine', 'radiator', 'tank', 'lights', 'tyres', 'body'];
const BP = { w: 340, h: 480 };
const MS_TO_MPH = 2.237;
const pct = (k) => `${k >= 1 ? '+' : ''}${Math.round((k - 1) * 100)}%`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class WorkshopUI {
  constructor(game, root) {
    this.g = game;
    root.insertAdjacentHTML('beforeend', `
      <div class="wsmenu hidden">
        <div class="inv-card ws-card">
          <div class="ws-head">
            <b class="ws-title">WORKSHOP</b>
            <div class="ws-who"><span class="ws-site"></span><span class="ws-car"></span></div>
            <div class="ws-scrip"><span>SCRIP</span><b class="ws-cash"></b></div>
          </div>
          <div class="ws-body">
            <div class="ws-bp"><canvas class="ws-bpc"></canvas><div class="ws-bp-cap"></div></div>
            <div class="ws-right">
              <div class="ws-tabs">${TABS.map((t, i) => `<button data-tab="${i}"><kbd>${t.key}</kbd>${t.label}</button>`).join('')}</div>
              <ol class="ws-rack"></ol>
              <div class="ws-detail">
                <div class="ws-dname"></div>
                <div class="ws-desc"></div>
                <div class="ws-bill"></div>
                <div class="ws-acts">
                  <button data-a="fit"><kbd>E</kbd><span class="ws-fit-t">FIT</span></button>
                  <button data-a="off"><kbd>X</kbd>TAKE OFF</button>
                  <button data-a="next"><kbd>SPACE</kbd>NEXT FACE</button>
                  <button data-a="fix"><kbd>R</kbd>REPAIR FACE</button>
                </div>
              </div>
            </div>
          </div>
          <div class="ws-stats"></div>
          <div class="ws-say"></div>
          <div class="inv-keys ws-keys"><kbd>Q</kbd><kbd>F</kbd>tabs <kbd>W</kbd><kbd>S</kbd><kbd>A</kbd><kbd>D</kbd>rack <kbd>SPACE</kbd>face <kbd>E</kbd>fit <kbd>X</kbd>off <kbd>U</kbd>close</div>
        </div>
      </div>`);
    const q = (s) => root.querySelector(`.wsmenu ${s}`);
    this.el = {
      menu: root.querySelector('.wsmenu'), site: q('.ws-site'), car: q('.ws-car'), cash: q('.ws-cash'), bp: q('.ws-bpc'), bpCap: q('.ws-bp-cap'),
      tabs: [...root.querySelectorAll('.wsmenu .ws-tabs button')], rack: q('.ws-rack'), dname: q('.ws-dname'), desc: q('.ws-desc'), bill: q('.ws-bill'),
      acts: q('.ws-acts'), fitT: q('.ws-fit-t'), stats: q('.ws-stats'), say: q('.ws-say'),
    };
    this.open = false; this.tab = 0; this.sel = 0; this.face = 'front'; this.sayT = 0; this.rowsNow = [];
    this.bpCtx = makeCanvas(BP.w, BP.h, this.el.bp)[1];
    this.paper = null;
    this.hit = []; // blueprint click regions
    this.el.tabs.forEach((b) => b.addEventListener('click', () => { this.tab = +b.dataset.tab; this.sel = 0; this.render(); }));
    this.el.rack.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) { this.sel = +li.dataset.i; this.render(); } });
    this.el.rack.addEventListener('dblclick', (e) => { const li = e.target.closest('li[data-i]'); if (li) { this.sel = +li.dataset.i; this.act('fit'); } });
    this.el.acts.addEventListener('click', (e) => { const b = e.target.closest('button[data-a]'); if (b) this.act(b.dataset.a); });
    this.el.bp.addEventListener('click', (e) => {
      const r = this.el.bp.getBoundingClientRect(), x = (e.clientX - r.left) * (BP.w / r.width), y = (e.clientY - r.top) * (BP.h / r.height);
      const h = this.hit.find((k) => x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h);
      if (h) { this.face = h.face; if (h.mount && this.tab === 0) this.tab = 1; this.render(); }
    });
  }

  get car() { return this.g.workshop.car; }

  toggle(on = !this.open, force = false) {
    const W = this.g.workshop;
    if (on) {
      if (!this.g.player.alive) return { ok: false, why: 'dead' };
      const r = W.open(force);
      if (!r.ok) { this.g.hud?.toast?.(r.why.toUpperCase(), 'warn'); return r; }
    }
    this.open = on;
    this.el.menu.classList.toggle('hidden', !on);
    if (on) { this.sel = 0; this.render(); }
    else W.site = null;
    this.g.emit('workshopScreen', { open: on });
    return { ok: true };
  }

  input(I) {
    if (I.hit('KeyU') || I.hit('Tab') || I.hit('Escape') || I.hit('KeyI')) { this.toggle(false); return; }
    for (let i = 0; i < TABS.length; i++) if (I.hit(`Digit${i + 1}`)) { this.tab = i; this.sel = 0; this.render(); }
    if (I.hit('KeyF')) { this.tab = (this.tab + 1) % TABS.length; this.sel = 0; this.render(); }
    if (I.hit('KeyQ')) { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.sel = 0; this.render(); }
    const n = this.rowsNow.length;
    if (I.hit('KeyW') || I.hit('ArrowUp')) { this.sel = Math.max(0, this.sel - 2); this.render(); }
    if (I.hit('KeyS') || I.hit('ArrowDown')) { this.sel = Math.min(Math.max(0, n - 1), this.sel + 2); this.render(); }
    if (I.hit('KeyA') || I.hit('ArrowLeft')) { this.sel = Math.max(0, this.sel - 1); this.render(); }
    if (I.hit('KeyD') || I.hit('ArrowRight')) { this.sel = Math.min(Math.max(0, n - 1), this.sel + 1); this.render(); }
    if (I.hit('Space')) this.act('next');
    if (I.hit('KeyE') || I.hit('Enter')) this.act('fit');
    if (I.hit('KeyX') || I.hit('Delete')) this.act('off');
    if (I.hit('KeyR')) this.act('fix');
  }

  tabIds() { return TABS.map((t) => t.id); }

  // The faces and mount points the current tab picks between (Space walks them).
  targets() {
    const v = this.car, C = v && this.g.garage.chassis(v);
    if (!C) return FACES6;
    if (TABS[this.tab].id === 'weapons') return Object.keys(C.mounts);
    return FACES6.filter((f) => (C.faces[f] ?? 0) > 0);
  }

  // The rows the current tab lists: { id, name, sub, price, ok, why, tag, kind }.
  rows() {
    const g = this.g, W = g.workshop, G = g.garage, v = this.car, t = TABS[this.tab].id, m = W.mul(), out = [];
    if (!v) return out;
    const C = G.chassis(v);
    if (t === 'armor') {
      for (const [id, A] of Object.entries(ARMOR)) {
        const okFace = A.faces.includes(this.face) && (C.faces[this.face] ?? 0) > 0, other = (v.plates?.[this.face] ?? 0) > 0 && G.kindOf(v, this.face) !== id;
        out.push({ id, part: id, name: A.name, sub: `${A.kg} kg / pt · stops ${A.absorb} · ${A.faces.length === 6 ? 'any face' : A.faces.map((f) => FACE_LABEL[f]).join(' ')}`, price: `${Math.round(A.price * m)}/pt`,
          ok: okFace && !other, why: !okFace ? `NOT ON THE ${FACE_LABEL[this.face]}` : other ? 'STRIP THE FACE FIRST' : '', desc: A.desc, kgAdd: 4 * A.kg, op: 'install' });
      }
    } else if (t === 'weapons') {
      for (const [id, R] of Object.entries(MOUNT_WEAPONS)) {
        const why = G.canMount(v, this.face, id), stocked = W.sells(id);
        out.push({ id, part: id, name: R.name, sub: `${R.kg} kg · size ${R.size} · ${R.kind === 'drop' ? 'TAIL' : R.faces.map((f) => FACE_LABEL[f]).join(' ')}${R.ammo ? '' : R.power ? ` · ${R.power} power` : ''}`,
          price: `${Math.round(R.price * m)}`, ok: !why && stocked, why: why ? short(why) : !stocked ? 'NOT SOLD HERE' : '', rare: R.rare, desc: R.desc, kgAdd: R.kg - (MOUNT_WEAPONS[v.mounts?.[this.face]?.kind]?.kg ?? 0), op: 'install', fitted: v.mounts?.[this.face]?.kind === id });
      }
    } else if (t === 'utility' || t === 'wheels') {
      for (const [id, U] of Object.entries(UTILITY)) {
        if ((U.tab ?? 'utility') !== t) continue;
        const have = !!v.utility?.[id], stocked = W.sells(id);
        const swap = U.set ? Object.keys(v.utility ?? {}).find((u) => UTILITY[u]?.set === U.set) : null, swapKg = swap ? UTILITY[swap].kg : 0;
        const room = G.spacesUsed(v) + U.space <= C.spaces, load = G.kgOn(v) - swapKg + U.kg <= C.maxKg;
        const body = !U.chassis || U.chassis.includes(G.chassisKey(v)), glass = !U.glass || !!g.carCombat.layout(v);
        out.push({ id, part: id, name: U.name, sub: U.tread ? `${U.kg} kg · grip ${pct(U.tread.paved)} road / ${pct(U.tread.dirt)} dirt${swap && !have ? ` · swaps ${UTILITY[swap].name.toLowerCase()}` : ''}` : `${U.kg} kg · ${U.space} space${U.space === 1 ? '' : 's'}`,
          price: `${Math.round(U.price * m)}`, ok: !have && stocked && room && load && body && glass,
          why: have ? 'FITTED' : !body ? 'WRONG BODY' : !glass ? 'NO GLASS' : !stocked ? 'NOT SOLD HERE' : !room ? 'NO ROOM' : !load ? 'TOO HEAVY' : '', rare: U.rare, desc: U.desc, kgAdd: U.kg - swapKg, util: id, swap, op: 'install', fitted: have });
      }
    } else if (t === 'ammo') {
      const carried = (id) => (g.inventory?.carried.slots ?? []).reduce((s, x) => s + (x.id === id ? x.n : 0), 0) + (g.inventory?.trunk(v).slots ?? []).reduce((s, x) => s + (x.id === id ? x.n : 0), 0);
      for (const [f, mm] of Object.entries(v.mounts ?? {})) {
        const R = MOUNT_WEAPONS[mm.kind], have = 'charges' in mm ? mm.charges : mm.ammo;
        if (!R.ammo) { out.push({ id: `${f}:${mm.kind}`, face: f, name: `${FACE_LABEL[f]} · ${R.name}`, sub: R.power ? `runs on power (${R.power} a shot)` : 'needs nothing', price: '—', ok: false, why: 'NO ROUNDS', desc: R.desc, op: 'reload' }); continue; }
        const it = ITEMS[R.ammo];
        out.push({ id: `${f}:${mm.kind}`, face: f, name: `${FACE_LABEL[f]} · ${R.name}`, sub: `${have}/${R.mag} loaded · ${it.name} ×${carried(R.ammo)} carried (${R.perItem} each)`, price: `${Math.round(it.value * m)} ea`,
          ok: have < R.mag, why: have >= R.mag ? 'FULL' : '', desc: it.desc, op: 'reload', meter: have / R.mag });
      }
      for (const [u, st] of Object.entries(v.utility ?? {})) {
        const U = UTILITY[u];
        if (!U.ammo) continue;
        const it = ITEMS[U.ammo];
        out.push({ id: `u:${u}`, util: u, name: U.name, sub: `${st.charges}/${U.charges} · ${it.name} ×${carried(U.ammo)} carried`, price: `${Math.round(it.value * m)} ea`, ok: st.charges < U.charges, why: st.charges >= U.charges ? 'FULL' : '', desc: it.desc, op: 'reload', meter: st.charges / U.charges });
      }
      if (!out.length) out.push({ id: 'none', name: 'NOTHING TO LOAD', sub: 'fit a gun, a dropper or a bottle first', price: '', ok: false, why: '', desc: '', op: null });
    } else if (t === 'repair') {
      for (const f of FACES6) {
        const q = W.quote(v, 'repair', { face: f }), full = v.platesFull?.[f] ?? 0;
        if (!full) continue;
        out.push({ id: `face:${f}`, face: f, name: `${FACE_LABEL[f]} PLATE`, sub: `${(v.plates?.[f] ?? 0).toFixed(1)} / ${full} pts · ${ARMOR[G.kindOf(v, f)]?.name}`, price: q.points > 0.01 ? `${q.price + q.labour}` : '', ok: q.points > 0.01, why: q.points > 0.01 ? '' : 'SOUND', desc: 'Weld the slabs that were shot away back on.', op: 'repair', meter: (v.plates?.[f] ?? 0) / full });
      }
      for (const p of PARTS) {
        const q = W.quote(v, 'repair', { part: p });
        if (!q) continue;
        const sound = 1 - Math.min(1, p === 'tyres' ? q.worn / 4 : q.worn); // four tyres: one flat is three quarters sound
        out.push({ id: `part:${p}`, part: p, name: p.toUpperCase(), sub: `${Math.round(sound * 100)}% sound`, price: q.worn > 0.01 ? `${q.price + q.labour}` : '', ok: q.worn > 0.01, why: q.worn > 0.01 ? '' : 'SOUND', desc: PART_DESC[p], op: 'repair', meter: sound });
      }
    } else if (t === 'paint') {
      for (const [id, P] of Object.entries(PAINTS)) out.push({ id, paint: id, name: P.name, sub: v.paintKey === id ? 'on the car now' : 'the spray booth', price: `${Math.round(P.price * m)}`, ok: v.paintKey !== id, why: v.paintKey === id ? 'ON IT' : '', desc: 'Two coats over the rust. It changes nothing but how they see you coming.', op: 'paint', swatch: P.color });
    }
    return out;
  }

  act(a) {
    const g = this.g, W = g.workshop, v = this.car;
    if (!v) return;
    if (a === 'next') { const T = this.targets(), i = T.indexOf(this.face); this.face = T[(i + 1) % T.length] ?? T[0]; this.render(); return; }
    if (a === 'fix') { const r = W.repair(v, { face: this.face }); this.tell(r.ok ? `${FACE_LABEL[this.face]} PLATE MENDED · $${r.cost} · ${r.hours} h` : r.why.toUpperCase(), !r.ok); this.render(); return; }
    const row = this.rowsNow[this.sel];
    if (!row) return;
    let r;
    if (a === 'off') {
      const t = TABS[this.tab].id;
      r = t === 'utility' || t === 'wheels' ? W.remove(v, { part: row.part }) : t === 'armor' ? W.remove(v, { face: this.face, part: 'plate' }) : W.remove(v, { face: this.face });
      this.tell(r.ok ? `TOOK OFF ${String(r.removed).toUpperCase().replace('PLATE:', 'PLATE · ')}${r.refund ? ` · ${r.refund > 0 ? '+' : ''}$${r.refund}` : ''}` : r.why.toUpperCase(), !r.ok);
      this.render(); return;
    }
    if (!row.ok && row.op) { this.tell(row.why || 'CAN\'T', true); return; }
    if (row.op === 'install') r = W.install(v, { part: row.part, face: TABS[this.tab].id === 'utility' || TABS[this.tab].id === 'wheels' ? undefined : this.face, n: 4 });
    else if (row.op === 'reload') r = W.reload(v, { face: row.face, part: row.util });
    else if (row.op === 'repair') r = W.repair(v, { face: row.face, part: row.face ? undefined : row.part });
    else if (row.op === 'paint') r = W.paint(v, row.paint);
    if (!r) return;
    this.tell(r.ok ? `${row.name} · ${r.cost !== undefined ? `$${r.cost}` : r.loaded !== undefined ? `${r.loaded}/${r.of}` : 'DONE'}${r.hours ? ` · ${r.hours} h` : ''}` : r.why.toUpperCase(), !r.ok);
    this.render();
  }

  tell(text, bad = false) { this.el.say.textContent = text; this.el.say.classList.toggle('bad', bad); this.sayT = 4; }
  update(dt) { if (this.sayT > 0 && (this.sayT -= dt) <= 0) this.el.say.textContent = ''; }

  render() {
    const g = this.g, W = g.workshop, G = g.garage, v = this.car, E = this.el;
    if (!this.open || !v) return;
    const T = this.targets();
    if (!T.includes(this.face)) this.face = T[0] ?? 'front';
    E.site.textContent = `${W.site?.name ?? ''} · ${W.site?.where ?? ''}${W.site?.rate ? ` · LABOUR $${Math.round(W.site.rate * W.mul())}/H` : ' · NO LABOUR CHARGE'}`;
    E.car.textContent = `${v.name} · ${G.chassisKey(v).toUpperCase()} CHASSIS`;
    E.cash.textContent = `$${g.cash}`;
    E.tabs.forEach((b, i) => b.classList.toggle('on', i === this.tab));
    const rows = this.rowsNow = this.rows();
    this.sel = Math.min(this.sel, Math.max(0, rows.length - 1));
    E.rack.className = `ws-rack t-${TABS[this.tab].id}`;
    E.rack.innerHTML = rows.map((r, i) => `<li data-i="${i}" class="${i === this.sel ? 'sel' : ''}${r.ok ? '' : ' no'}${r.fitted ? ' fitted' : ''}">
        ${r.swatch ? `<i class="ws-sw" style="background:${r.swatch}"></i>` : ''}<span class="nm"><span>${esc(r.name)}${r.rare ? `<em class="stamp r-${r.rare}">${r.rare === 'prewar' ? 'PRE-WAR' : 'SCARCE'}</em>` : ''}</span><small>${esc(r.sub)}</small>
        ${r.meter !== undefined ? `<i class="ws-meter"><em style="width:${Math.round(Math.max(0, Math.min(1, r.meter)) * 100)}%"></em></i>` : ''}</span>
        ${r.why ? `<b class="why">${esc(r.why)}</b>` : ''}${r.price ? `<span class="tag">$${esc(r.price)}</span>` : ''}</li>`).join('');
    const row = rows[this.sel];
    E.dname.textContent = row?.name ?? '';
    E.desc.textContent = row?.desc ?? '';
    E.bill.innerHTML = this.bill(row);
    E.fitT.textContent = row?.op === 'reload' ? 'LOAD' : row?.op === 'repair' ? 'MEND' : row?.op === 'paint' ? 'SPRAY' : 'FIT';
    this.drawStats(row);
    this.drawBlueprint();
  }

  // What the selected row costs here: price, labour, hours on the clock.
  bill(row) {
    const W = this.g.workshop, v = this.car;
    if (!row?.op) return '';
    if (row.op === 'install') {
      const q = W.quote(v, 'install', { part: row.part, face: this.face, n: 4 });
      return `<b>$${q.price}</b> part${row.part in ARMOR ? 's (4 pts)' : ''} + <b>$${q.labour}</b> labour · <b>${q.hours} h</b> on the clock · <b>+${Math.round(q.kg)} kg</b>`;
    }
    if (row.op === 'repair') { const q = W.quote(v, 'repair', { face: row.face, part: row.face ? undefined : row.part }); return `<b>$${q.price}</b> + <b>$${q.labour}</b> labour · <b>${q.hours} h</b>`; }
    if (row.op === 'reload') return 'From your pack first, then the trunk, then bought here.';
    if (row.op === 'paint') return `<b>$${row.price}</b> · cosmetic`;
    return '';
  }

  // The numbers, now and (ghosted) with the selected row fitted.
  drawStats(row) {
    const G = this.g.garage, v = this.car, C = G.chassis(v), base = G.base(v);
    const now = G.perf(v);
    let then = null, kgAdd = 0;
    if (row?.op === 'install') {
      kgAdd = row.kgAdd ?? 0;
      const u = row.util ? { ...(v.utility ?? {}), [row.util]: {} } : v.utility ?? {};
      if (row.swap) delete u[row.swap];
      then = G.perf(v, kgAdd, u);
    }
    const kg = G.kgOn(v), sp = G.spacesUsed(v), pw = v.power?.cap ?? 20;
    const bar = (label, val, max, nxt, fmt, invert = false) => {
      const f = Math.max(0, Math.min(1, val / max)), n = nxt === null ? f : Math.max(0, Math.min(1, nxt / max));
      const worse = invert ? n > f : n < f;
      return `<div class="ws-bar"><span>${label}</span><i><em style="width:${Math.round(Math.min(f, n) * 100)}%"></em>${n !== f ? `<s class="${worse ? 'worse' : 'better'}" style="left:${Math.round(Math.min(f, n) * 100)}%;width:${Math.round(Math.abs(n - f) * 100)}%"></s>` : ''}</i><b>${fmt(val)}${nxt !== null && fmt(nxt) !== fmt(val) ? ` <u class="${worse ? 'worse' : 'better'}">→ ${fmt(nxt)}</u>` : ''}</b></div>`;
    };
    this.el.stats.innerHTML = [
      bar('TOP SPEED', now.maxSpeed, base.maxSpeed * 1.2, then?.maxSpeed ?? null, (x) => `${Math.round(x * MS_TO_MPH)} mph`),
      bar('PULL', now.accel, base.accel * 1.4, then?.accel ?? null, (x) => `${(x / base.accel * 100).toFixed(0)}%`),
      bar('HANDLING', now.turn, base.turn * 1.1, then?.turn ?? null, (x) => `${(x / base.turn * 100).toFixed(0)}%`),
      bar('BRAKING', now.brake, 1.1, then?.brake ?? null, (x) => `${(x * 100).toFixed(0)}%`),
      bar('LOAD', kg, C.maxKg, then ? kg + kgAdd : null, (x) => `${Math.round(x)} / ${C.maxKg} kg`, true),
      bar('SPACES', sp, C.spaces, row?.op === 'install' && !(row.part in ARMOR) ? sp + ((MOUNT_WEAPONS[row.part]?.size ?? UTILITY[row.part]?.space ?? 0) - (row.util ? 0 : MOUNT_WEAPONS[v.mounts?.[this.face]?.kind]?.size ?? 0)) : null, (x) => `${x} / ${C.spaces}`, true),
      bar('OFF-ROAD', now.dirt, 1.3, then?.dirt ?? null, (x) => `${Math.round(x * 100)}%`),
      bar('POWER', pw, 240, row?.util && UTILITY[row.util]?.power ? pw + UTILITY[row.util].power.cap : null, (x) => `${Math.round(x)}`),
    ].join('');
  }

  // The work order: the car top-down (nose up), six faces as plates, mount points with their arcs.
  drawBlueprint() {
    const c = this.bpCtx, v = this.car, G = this.g.garage, C = G.chassis(v), Wd = BP.w, Ht = BP.h;
    this.paper ??= paintPaper(Wd, Ht, 23);
    c.clearRect(0, 0, Wd, Ht);
    c.drawImage(this.paper, 0, 0, Wd, Ht);
    this.hit.length = 0;
    const cx = Wd / 2, cy = Ht * 0.47, sc = Math.min((Ht * 0.56) / v.len, (Wd * 0.36) / v.wid), L = v.len * sc, Wb = v.wid * sc;
    const x0 = cx - Wb / 2, y0 = cy - L / 2, INK = 'rgba(40,28,14,0.9)', SEL = '#a8321c';
    // arcs first, under everything
    for (const [f, P] of Object.entries(C.mounts)) {
      const m = v.mounts?.[f], Wr = m ? MOUNT_WEAPONS[m.kind] : null, arc = Math.min(Wr?.arc ?? Infinity, P.arc);
      if (Wr?.kind === 'drop') continue;
      const [px, py] = this.mountXY(f, cx, cy, L, Wb), dir = { front: -Math.PI / 2, rear: Math.PI / 2, left: Math.PI, right: 0, top: -Math.PI / 2 }[f];
      const R = f === 'top' ? Math.min(Wd, Ht) * 0.44 : 150;
      c.beginPath(); c.moveTo(px, py); c.arc(px, py, R, dir - Math.min(arc, Math.PI), dir + Math.min(arc, Math.PI)); c.closePath();
      c.fillStyle = m ? (f === this.face ? 'rgba(168,50,28,0.16)' : 'rgba(170,120,30,0.14)') : 'rgba(60,44,24,0.05)'; c.fill();
      c.setLineDash(m ? [] : [4, 4]); c.strokeStyle = m ? 'rgba(150,100,24,0.55)' : 'rgba(60,44,24,0.25)'; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
    }
    // the body
    c.save();
    c.beginPath();
    const r = Math.min(14, Wb * 0.3);
    c.moveTo(x0 + r, y0); c.lineTo(x0 + Wb - r, y0); c.quadraticCurveTo(x0 + Wb, y0, x0 + Wb, y0 + r); c.lineTo(x0 + Wb, y0 + L - 6); c.quadraticCurveTo(x0 + Wb, y0 + L, x0 + Wb - 6, y0 + L);
    c.lineTo(x0 + 6, y0 + L); c.quadraticCurveTo(x0, y0 + L, x0, y0 + L - 6); c.lineTo(x0, y0 + r); c.quadraticCurveTo(x0, y0, x0 + r, y0); c.closePath();
    c.fillStyle = 'rgba(90,70,40,0.08)'; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    // wheels, windshield, roof line
    c.fillStyle = INK;
    for (const [wx, wy] of [[x0 - 5, y0 + L * 0.16], [x0 + Wb - 3, y0 + L * 0.16], [x0 - 5, y0 + L * 0.72], [x0 + Wb - 3, y0 + L * 0.72]]) c.fillRect(wx, wy, 8, L * 0.13);
    c.strokeStyle = 'rgba(40,28,14,0.55)'; c.lineWidth = 1.2;
    c.strokeRect(x0 + Wb * 0.14, y0 + L * 0.3, Wb * 0.72, L * 0.36);
    c.beginPath(); c.moveTo(x0 + Wb * 0.14, y0 + L * 0.3); c.lineTo(x0 + Wb * 0.24, y0 + L * 0.22); c.lineTo(x0 + Wb * 0.76, y0 + L * 0.22); c.lineTo(x0 + Wb * 0.86, y0 + L * 0.3); c.stroke();
    c.restore();
    // the six faces as plates
    const T = 16;
    const rect = { front: [x0, y0 - T - 4, Wb, T], rear: [x0, y0 + L + 4, Wb, T], left: [x0 - T - 12, y0 + 6, T, L - 12], right: [x0 + Wb + 12, y0 + 6, T, L - 12], top: [x0 + Wb * 0.2, y0 + L * 0.36, Wb * 0.6, L * 0.24], under: [cx - 60, Ht - 46, 120, 22] };
    for (const f of FACES6) {
      const max = C.faces[f] ?? 0, [rx, ry, rw, rh] = rect[f];
      if (!max) continue;
      const pts = v.plates?.[f] ?? 0, full = v.platesFull?.[f] ?? pts, frac = full > 0 ? pts / full : 0, kind = pts > 0 ? G.kindOf(v, f) : null;
      c.fillStyle = !pts ? 'rgba(60,44,24,0.06)' : frac < 0.34 ? 'rgba(150,48,26,0.75)' : frac < 0.67 ? 'rgba(160,110,36,0.75)' : 'rgba(70,66,60,0.82)';
      c.fillRect(rx, ry, rw, rh);
      if (pts) { // hatching: one line per four points, the plate's own grain
        c.save(); c.beginPath(); c.rect(rx, ry, rw, rh); c.clip(); c.strokeStyle = 'rgba(255,240,210,0.22)'; c.lineWidth = 1;
        for (let k = -rh; k < rw; k += Math.max(4, 14 - pts / 3)) { c.beginPath(); c.moveTo(rx + k, ry + rh); c.lineTo(rx + k + rh, ry); c.stroke(); }
        c.restore();
      }
      c.setLineDash(pts ? [] : [3, 3]); c.lineWidth = f === this.face ? 3 : 1.4; c.strokeStyle = f === this.face ? SEL : INK; c.strokeRect(rx, ry, rw, rh); c.setLineDash([]);
      c.font = `700 11px 'Barlow Condensed', 'Arial Narrow', sans-serif`; c.fillStyle = f === 'top' && pts ? '#f4ead2' : INK; c.textAlign = 'center';
      const label = `${FACE_LABEL[f]} ${Math.round(pts)}/${max}`;
      if (f === 'left' || f === 'right') { c.save(); c.translate(rx + rw / 2, ry + rh / 2); c.rotate(f === 'left' ? -Math.PI / 2 : Math.PI / 2); c.fillStyle = pts ? '#f4ead2' : INK; c.fillText(label, 0, 4); c.restore(); }
      else if (f === 'top') c.fillText(label, rx + rw / 2, ry + 11); // the roof's label sits at its top edge, clear of the turret ring
      else c.fillText(label, rx + rw / 2, ry + rh / 2 + 4);
      if (kind && f !== 'left' && f !== 'right' && f !== 'top') { c.font = `400 9px 'Special Elite', monospace`; c.fillStyle = 'rgba(40,28,14,0.75)'; c.fillText(ARMOR[kind].name, rx + rw / 2, f === 'front' ? ry - 4 : ry + rh + 11); }
      this.hit.push({ face: f, x: rx - 4, y: ry - 4, w: rw + 8, h: rh + 8 });
    }
    // mount points: brass rings, filled when something is on them, the group number beside
    for (const [f, P] of Object.entries(C.mounts)) {
      const [px, py] = this.mountXY(f, cx, cy, L, Wb), m = v.mounts?.[f], Wr = m ? MOUNT_WEAPONS[m.kind] : null;
      c.beginPath(); c.arc(px, py, 7 + P.size * 2, 0, Math.PI * 2);
      c.fillStyle = m ? '#9a7a3a' : 'rgba(244,234,210,0.85)'; c.fill();
      c.lineWidth = f === this.face && TABS[this.tab].id === 'weapons' ? 3 : 1.5; c.strokeStyle = f === this.face && TABS[this.tab].id === 'weapons' ? SEL : INK; c.stroke();
      c.font = `800 10px 'Barlow Condensed', sans-serif`; c.fillStyle = m ? '#1c140a' : INK; c.textAlign = 'center'; c.fillText(String(groupOf(f, Wr)), px, py + 3.5);
      this.hit.push({ face: f, mount: true, x: px - 12, y: py - 12, w: 24, h: 24 });
    }
    c.font = `400 10px 'Special Elite', monospace`; c.fillStyle = 'rgba(40,28,14,0.7)'; c.textAlign = 'left';
    c.fillText(`WORK ORDER · ${v.name}`, 16, 22);
    c.textAlign = 'right'; c.fillText('NOSE ↑', Wd - 18, 22);
    // The legend under the sheet: the picked face, then what sits on each mount point, by trigger group.
    const legend = Object.keys(C.mounts).filter((f) => v.mounts?.[f]).map((f) => `<span><i>${groupOf(f, MOUNT_WEAPONS[v.mounts[f].kind])}</i>${MOUNT_NAME[f]} ${MOUNT_WEAPONS[v.mounts[f].kind].name}</span>`).join('');
    this.el.bpCap.innerHTML = `<div><b>${FACE_LABEL[this.face]}</b> ${TABS[this.tab].id === 'weapons' ? this.mountCap() : this.faceCap()}</div><div class="ws-legend">${legend || '<span>no mounts fitted</span>'}</div>`;
  }
  mountXY(f, cx, cy, L, Wb) {
    return f === 'front' ? [cx, cy - L / 2 + 16] : f === 'rear' ? [cx, cy + L / 2 - 14] : f === 'left' ? [cx - Wb / 2 + 12, cy - L * 0.04] : f === 'right' ? [cx + Wb / 2 - 12, cy - L * 0.04] : [cx, cy + L * 0.02];
  }
  faceCap() {
    const v = this.car, G = this.g.garage, pts = v.plates?.[this.face] ?? 0;
    return pts > 0 ? `${ARMOR[G.kindOf(v, this.face)].name} · ${pts.toFixed(1)} pts` : 'bare steel';
  }
  mountCap() {
    const v = this.car, P = this.g.garage.chassis(v).mounts[this.face], m = v.mounts?.[this.face];
    return `mount · size ${P?.size ?? 0} · group ${groupOf(this.face, m && MOUNT_WEAPONS[m.kind])}${m ? ` · ${MOUNT_WEAPONS[m.kind].name}` : ' · empty'}`;
  }

  // For agents and the selftest: what the screen shows.
  view() {
    const out = { open: this.open, tab: TABS[this.tab].id, face: this.face, tabs: [] };
    if (!this.open) return out;
    const keep = [this.tab, this.sel];
    for (let i = 0; i < TABS.length; i++) { this.tab = i; out.tabs.push({ id: TABS[i].id, rows: this.rows().map((r) => r.name) }); }
    [this.tab, this.sel] = keep;
    out.dom = { tabs: this.el.tabs.length, rack: this.el.rack.children.length, stats: this.el.stats.children.length };
    return out;
  }
}

// The counter's refusal, short enough for a tag.
const short = (why) => {
  const on = /does not go on the (\w+)/.exec(why);
  if (on) return `NOT ON THE ${on[1] === 'rear' ? 'BACK' : on[1].toUpperCase()}`;
  return /too small/.test(why) ? 'MOUNT TOO SMALL' : /no room/.test(why) ? 'NO ROOM' : /over the/.test(why) ? 'TOO HEAVY' : /has no/.test(why) ? 'NO MOUNT THERE' : why.toUpperCase().slice(0, 24);
};
const PART_DESC = {
  engine: 'Rings, plugs, a gasket. Brings the pull back.', radiator: 'Solder the core where it was holed.', tank: 'Patch the tank and stop the leak.',
  lights: 'New wiring to the lamps.', tyres: 'Four sound tyres off the rack.', body: 'Pull the dents, hang new panels, and the hull is whole again.',
};
