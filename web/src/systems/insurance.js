import { INSURANCE_RULES, POLICIES, KITS } from '../data/insurance.js';
import { VATS } from '../data/clones.js';

// LIFE INSURANCE (docs/design/WEB_INSURANCE_JOURNEYS.md, rows in data/insurance.js). Owned by systems/clone.js (g.clone.ins);
// the pressing stays the mechanism underneath: a policy is a pressing with terms.
//   - POLICIES (DUST / ROAD / IRON COVER): the premium a day out of the brine book, the grace before it lapses, how cold the
//     pressing may get, the kit and the brine sickness you come up with, the tow, the transfer fee, a fresh pressing as you
//     come up.
//   - CENTRES: only the major cities grow bodies (VATS rows with major: true). Every other vat is a PRESSING OFFICE: it scans
//     you and sells a policy; the body grows at its HOME CENTRE (the nearest major city).
//   - THE CITY PICKER: dying with a policy, after the black you choose the centre you come up in: its distance to your
//     husk and to your base, the way home from there by the cheapest line, what the transfer costs.

const r1 = (v) => Math.round(v * 10) / 10;
const IR = INSURANCE_RULES;

export class Insurance {
  constructor(game, clone) {
    this.g = game; this.C = clone;
    this.base = null;      // where home is: { x, z, name } (insurance base / travel plan setBase); default the start holdout
    this.pick = null;      // an agent's choice of centre for the next waking (clone action=die vat=)
    this.picking = null;   // the picker is up: { since, options }
    this.warnedDay = -1;
  }
  get W() { return this.g.streamer?.W ?? null; }

  // ---- rows ------------------------------------------------------------------------------------------------------------
  policy(P = this.C.pressing) { return POLICIES[P?.policy] ?? POLICIES.basic; }
  row(id) { return VATS.find((v) => v.id === id) ?? null; }
  isMajor(id) { return !!this.row(id)?.major; }
  canGrow(id) { return this.isMajor(id); }
  centres() { return VATS.filter((v) => v.major); }
  // Where a vat's town is on the world plane (built or not): the usmap row through the world index.
  townXZ(row) {
    const pl = this.place(row);
    if (pl?.onMap) return { x: pl.x, z: pl.z };
    const L = this.W?.locate(row.town);
    return L ? { x: L.x, z: L.z } : null;
  }
  // The centre a pressing taken at this vat grows at: itself if it is a major centre, else the nearest one.
  homeFor(vatId) {
    const row = this.row(vatId);
    if (!row) return null;
    if (row.major) return row.id;
    if (row.home) return row.home;
    const a = this.townXZ(row);
    let best = 'rust_haven', bd = Infinity;
    if (a) for (const c of this.centres()) { const b = this.townXZ(c); if (!b) continue; const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < bd) { bd = d; best = c.id; } }
    return best;
  }
  homeOf(P = this.C.pressing) { return P?.home ?? this.homeFor(P?.vat) ?? 'rust_haven'; }
  // A centre's place: the cities lane's cloning-centre building when it has one (citygen.cloneCenters()), else the vat row's.
  place(row) {
    if (!row) return null;
    const cc = this.g.citygen?.cloneCenters?.();
    if (Array.isArray(cc)) {
      const b = cc.find((c) => c && (c.vat === row.id || c.id === row.id || c.town === row.town || c.city === row.town));
      if (b && Number.isFinite(b.x) && Number.isFinite(b.z)) return { x: b.x, z: b.z, wake: b.wake ?? b.door ?? { x: b.x + 2, z: b.z + 2 }, onMap: true, building: b.id ?? null };
    }
    return this.C.vatPlace(row);
  }

  // ---- money -------------------------------------------------------------------------------------------------------------
  signPrice(policyId, row) { const pol = POLICIES[policyId] ?? POLICIES.basic; return Math.round(this.C.price(row) * pol.signMul); }
  premium(P = this.C.pressing) {
    if (!P) return 0;
    const row = this.row(P.vat), pol = this.policy(P);
    // The town covers its newcomers' first days (the free starter pressing).
    if (P.free && this.C.hours() - P.at < IR.starterDays * 24) return 0;
    return Math.round(pol.premium * (row?.upkeepMul ?? 1));
  }
  ageHours(P = this.C.pressing) { return P ? Math.max(0, this.C.hours() - P.at) : 0; }
  cold(P = this.C.pressing) { return !!P && this.ageHours(P) > this.policy(P).staleDays * 24; }
  // Coming up somewhere other than the policy's home: the brine is shipped.
  transferFee(homeId, toId, P = this.C.pressing) {
    if (!homeId || homeId === toId) return 0;
    const a = this.row(homeId), b = this.row(toId), pa = a && this.townXZ(a), pb = b && this.townXZ(b);
    const km = pa && pb ? Math.hypot(pb.x - pa.x, pb.z - pa.z) / 1000 : 0, T = IR.transfer;
    return Math.round((T.base + T.perMul * Math.abs((a?.priceMul ?? 1) - (b?.priceMul ?? 1)) + T.perKm * km / 100) * this.policy(P).transferMul);
  }

  // ---- home (the base the picker and the planner measure to) -------------------------------------------------------------
  baseXZ() {
    if (this.base) return this.base;
    const row = this.row(this.C.startVat()), pl = row && this.C.vatPlace(row);
    return pl?.onMap ? { x: pl.wake.x, z: pl.wake.z, name: `${row.short} (where you started)`, auto: true } : { x: -53.5, z: -67.2, name: 'RUST HAVEN', auto: true };
  }
  setBase(x, z, name = 'YOUR BASE') { this.base = { x: r1(x), z: r1(z), name: String(name).toUpperCase() }; this.g.emit('baseSet', { ...this.base }); return this.base; }

  // ---- the city picker ---------------------------------------------------------------------------------------------------
  // Every major centre as a choice: where it is, how far from your husk and your base, the way home from it by the cheapest
  // line, what the transfer costs and whether you can pay it (your pockets are on your husk: the brine book pays).
  options(husk = this.C.husks[this.C.husks.length - 1]) {
    const g = this.g, C = this.C, P = C.pressing, home = this.homeOf(P), base = this.baseXZ(), J = g.travel?.j, cold = this.cold(P);
    const live = husk && !husk.gone ? husk : null;
    return this.centres().map((row) => {
      const pl = this.place(row), xz = this.townXZ(row), fee = this.transferFee(home, row.id, P);
      const from = pl?.onMap ? { x: pl.wake.x, z: pl.wake.z } : row.port ?? null;
      const plan = J && from ? J.plan(from, base) : null;
      const isHome = row.id === home, can = isHome || (!cold && C.bank + g.cash >= fee);
      return { id: row.id, name: row.name, short: row.short, home: isHome, onMap: !!pl?.onMap, fee, can, cold: cold && !isHome,
        kmHusk: live && xz ? r1(Math.hypot(xz.x - live.x, xz.z - live.z) / 1000) : null, kmBase: xz ? r1(Math.hypot(xz.x - base.x, xz.z - base.z) / 1000) : null,
        home2base: plan?.ok ? { hours: plan.hours, fare: plan.fare, first: plan.first, walkKm: plan.walkKm, rides: plan.rides } : null };
    });
  }
  // Up after the black (systems/clone.js wake): the board of centres over the dark screen. done(id) wakes you there.
  openPicker(done) {
    const g = this.g, T = g.travel, ui = T?.ui;
    const opts = this.options();
    this.picking = { since: this.C.hours(), options: opts };
    g.emit('cityPicker', { options: opts.map((o) => ({ id: o.id, fee: o.fee, can: o.can, home: o.home })) });
    const homeId = opts.find((o) => o.home)?.id ?? 'rust_haven';
    const finish = (id) => { if (!this.picking) return; this.picking = null; clearTimeout(this.pickTimer); if (ui?.open && ui.model?.picker) ui.close(); done(id); };
    if (!ui?.wrap) { finish(homeId); return; }
    const pol = this.policy(), base = this.baseXZ();
    const build = () => ({
      hall: true, picker: true, showBank: true, kind: `LIFE INSURANCE · ${pol.name}`, title: 'WHERE DO YOU COME UP?',
      sub: `ONLY THE BIG CITIES GROW BODIES · HOME CENTRE ${this.row(homeId)?.short ?? ''} IS FREE · BASE: ${base.name}`,
      note: this.cold() ? 'YOUR PRESSING WENT COLD: IT CAN ONLY BE GROWN WHERE IT IS FILED.' : 'YOUR POCKETS ARE ON YOUR HUSK. A TRANSFER COMES OUT OF THE BRINE BOOK.',
      head: ['CENTRE', 'TO HUSK', 'TO BASE', 'WAY HOME', 'COST'],
      rows: opts.map((o, k) => ({ key: String(k + 1), cols: [`${o.short}${o.home ? ' (HOME)' : ''}${o.onMap ? '' : ' · PAST THE DUST'}`, o.kmHusk === null ? '-' : `${o.kmHusk} KM`, o.kmBase === null ? '-' : `${o.kmBase} KM`,
        o.home2base ? `${o.home2base.hours} H · $${o.home2base.fare} · ${o.home2base.first}` : 'NO LINE HOME', o.fee ? `$${o.fee}` : 'FREE'], dim: !o.can, hot: o.home })),
      foot: [['1-' + opts.length, 'Come up there'], ['ENTER', 'Home centre']],
      onKey: (code) => {
        if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { finish(homeId); return 'close'; }
        const k = /^Digit([1-9])$/.exec(code)?.[1], o = k && opts[+k - 1];
        if (!o) return false;
        if (!o.can) { g.hud?.toast?.(o.cold ? 'A COLD PRESSING GROWS ONLY WHERE IT IS FILED' : `THE TRANSFER IS $${o.fee}: THE BRINE BOOK HOLDS $${this.C.bank}`, 'warn'); return true; }
        finish(o.id); return 'close';
      },
    });
    ui.show({ ...build(), build });
    if (typeof setTimeout !== 'undefined') this.pickTimer = setTimeout(() => finish(homeId), IR.pickerSecs * 1000);
  }

  // ---- what the centre hands the new body ---------------------------------------------------------------------------------
  kit(P) { return KITS[this.policy(P).kit] ?? KITS.loaner; }
  sickHours(P) { return this.policy(P).sickHours * (this.cold(P) ? IR.coldSickMul : 1); }
  // IRON COVER: your husk's car hauled to the lot behind the centre you came up in, trunk and all.
  tow(h, place) {
    const g = this.g, v = h?.car && g.vehicles.find((x) => x.id === h.car.id);
    if (!v || v.dead || !place?.onMap) return null;
    const lot = { x: place.wake.x + IR.towLot.off, z: place.wake.z };
    g.streamer?.ensureHot?.(lot.x, lot.z, 'load');
    g.statics.resolveCircle(lot, 3.2);
    if (g.player.inVehicle === v) return null;
    v.x = lot.x; v.z = lot.z; v.vx = 0; v.vz = 0; v.h = 0; v.av = 0;
    h.car.x = r1(lot.x); h.car.z = r1(lot.z); h.car.towed = this.C.lastWakeVat ?? true;
    g.emit('carTowed', { vehicle: v.id, x: h.car.x, z: h.car.z });
    return { vehicle: v.id, x: h.car.x, z: h.car.z };
  }

  // ---- the INSURANCE tab: drawn into the pause menu's pane (ui/qol.js addTab), one screen, the menu's own classes ---------
  renderTab(el) {
    const v = this.view(), esc = (x) => String(x ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const grid = (rows) => `<div class="pm-run">${rows.map(([k, x]) => `<span><em>${esc(k)}</em><b>${esc(x)}</b></span>`).join('')}</div>`;
    const P = v.policy, at = v.pressedAt, np = this.g.travel?.j?.nearestPole?.(v.base);
    el.innerHTML = [
      `<div class="pm-section">LIFE INSURANCE · ${esc(P ? P.name : 'NONE')} · ${esc(v.status)}</div>`,
      grid([
        ['Premium', P ? (P.premium === 0 && at?.free ? 'FREE (the town pays)' : `$${P.premium}/day`) : '-'], ['Brine book', `$${v.bank}`], ['Behind', `${v.owed} of ${P?.graceDays ?? 0} days`],
        ['Home centre', v.home?.short ?? '-'], ['Pressed at', at ? `${this.row(at.vat)?.short ?? at.vat}${at.office ? ' (office)' : ''}` : '-'],
        ['Pressing', at ? (at.cold ? 'COLD' : `${Math.round(at.hoursAgo)} h old`) : '-'], ['Cold in', at && !at.cold ? `${Math.round(at.coldIn)} h` : '-'],
        ['You come up', P ? `${P.sickHours} h brine-sick` : 'flat'], ['Tow / re-press', P ? `${P.tow ? 'tow' : 'no tow'} · ${P.repress ? 're-press' : 'no'}` : '-'],
      ]),
      `<div class="pm-section">CLONING CENTRES · WHERE YOU CAN COME UP (TRANSFER FROM HOME)</div>`,
      grid(v.centres.map((c) => [c.short + (c.onMap ? '' : ' · past the dust'), c.id === v.home?.id ? 'HOME · FREE' : c.transfer === null ? '-' : `$${c.transfer}`])),
      `<div class="pm-section">YOUR BASE · ${esc(v.base?.name)}${np ? ` · NEAREST POLE ${esc(np.name)} · ${np.km} KM WALK` : ''}</div>`,
      `<div class="pm-section">THE COVERS · SIGN AT ANY CLINIC OR PRESSING OFFICE (SMALL TOWNS SCAN, ONLY BIG CITIES GROW BODIES)</div>`,
      grid(v.policies.map((q) => [q.name, `$${q.premium}/day · ${q.graceDays}d grace · cold ${q.staleDays}d`])),
    ].join('');
  }

  // ---- the INSURANCE tab (the lead's pause menu): everything about your cover in one read -------------------------------
  view() {
    const g = this.g, C = this.C, P = C.pressing, pol = P ? this.policy(P) : null, home = P ? this.homeOf(P) : null, here = C.vatHere?.();
    const age = this.ageHours(P), stale = pol ? pol.staleDays * 24 : 0;
    return {
      covered: !!P, policy: pol ? { id: pol.id, name: pol.name, tier: pol.tier, blurb: pol.blurb, premium: this.premium(P), graceDays: pol.graceDays, staleDays: pol.staleDays, sickHours: pol.sickHours, kit: pol.kit, tow: pol.tow, repress: pol.repress, transferMul: pol.transferMul } : null,
      status: !P ? 'UNINSURED: DIE NOW AND YOU DIE FLAT' : C.owed ? `BEHIND ${C.owed} DAY${C.owed > 1 ? 'S' : ''} · LAPSES AFTER ${pol.graceDays}` : this.cold(P) ? 'COLD: GET PRESSED AGAIN' : 'IN FORCE',
      pressedAt: P ? { vat: P.vat, name: this.row(P.vat)?.name, office: !this.isMajor(P.vat), hoursAgo: r1(age), coldIn: r1(Math.max(0, stale - age)), cold: this.cold(P), free: !!P.free } : null,
      home: home ? { id: home, name: this.row(home)?.name, short: this.row(home)?.short } : null,
      bank: C.bank, owed: C.owed, base: this.baseXZ(),
      centres: this.centres().map((r) => ({ id: r.id, short: r.short, name: r.name, onMap: !!this.place(r)?.onMap, transfer: P ? this.transferFee(home, r.id, P) : null })),
      offices: VATS.filter((v) => !v.major).map((v) => ({ id: v.id, short: v.short, home: this.homeFor(v.id) })),
      here: here ? { vat: here.id, name: here.name, major: !!here.major, prices: Object.fromEntries(Object.keys(POLICIES).map((k) => [k, this.signPrice(k, here)])) } : null,
      policies: Object.values(POLICIES).map((p) => ({ id: p.id, name: p.name, premium: p.premium, signMul: p.signMul, graceDays: p.graceDays, staleDays: p.staleDays, sickHours: p.sickHours, tow: p.tow, repress: p.repress, blurb: p.blurb })),
      picking: !!this.picking,
    };
  }
}
