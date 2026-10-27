// THE CREW panel and the orders radial (docs/design/WEB_CREW.md §3; systems/crew.js).
//   tap U            the CREW panel: a card per member, the flag as the card's backdrop (Robert's flag law), portrait,
//                    health and needs, gun and rounds, trust, flaw, order and job; a job picker; rounds, gun, dismiss
//   hold U           the radial of orders: point the mouse, let go to give it (nothing picked: nothing given)
//   pad: hold LB     the same radial on the right stick; let go with the stick home opens the panel (LB's tap stays the
//                    grip, which the radial puts back if the hold opened it)
// The panel is UI, not a world view: the crew walk in the world as top-down people. Rebuilt twice a second while open
// (no per-frame DOM writes); the radial only redraws its highlight when the pick changes.
import { drawFlag, drawPortrait, FLAGS } from './portrait.js';
import { ORDERS, ORDER_NAMES } from '../systems/crew.js';
import { CREW_JOBS } from '../data/crewjobs.js';
import { CREW_RULES } from '../data/crew.js';
import { WEAPONS } from '../systems/combat.js';
import { PAD } from '../data/controls.js';

const CSS = `
.crewp{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:60;background:rgba(14,10,6,.55);font-family:Inter,system-ui,sans-serif;color:#efe3cf}
.crewp.hidden,.crewr.hidden{display:none}
.crewp-card{width:min(1080px,94vw);max-height:88vh;overflow:auto;background:oklch(0.18 0.012 60);border:1px solid oklch(0.34 0.03 60);border-radius:10px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.55)}
.crewp-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.crewp-head b{font-size:1.5rem;letter-spacing:-.025em;color:oklch(0.78 0.15 75)}
.crewp-head .sub{color:oklch(0.68 0.03 60);font-size:.8rem}
.crewp-head .sp{flex:1}
.crewp button{background:transparent;color:#efe3cf;border:1px solid oklch(0.38 0.03 60);border-radius:6px;padding:4px 9px;font:600 .72rem Inter,system-ui,sans-serif;cursor:pointer;transition:.2s}
.crewp button:hover{background:oklch(0.3 0.06 60);border-color:oklch(0.6 0.15 70)}
.crewp button.on{background:oklch(0.55 0.15 70);color:#1b140c;border-color:transparent}
.crewp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}
.crewc{position:relative;border-radius:10px;overflow:hidden;min-height:214px;border:1px solid oklch(0.36 0.03 60);transition:.2s}
.crewc:hover{box-shadow:0 6px 22px rgba(0,0,0,.5);border-color:oklch(0.55 0.12 70)}
.crewc canvas.flag{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55}
.crewc .shade{position:absolute;inset:0;background:linear-gradient(100deg,rgba(18,13,8,.94) 0%,rgba(18,13,8,.78) 55%,rgba(18,13,8,.45) 100%)}
.crewc .in{position:relative;display:grid;grid-template-columns:76px 1fr;gap:10px;padding:10px}
.crewc canvas.face{width:76px;height:96px;border-radius:6px;border:1px solid oklch(0.4 0.03 60)}
.crewc .nm{font-weight:700;font-size:1rem;letter-spacing:-.02em}
.crewc .cd{font-size:.72rem;color:oklch(0.78 0.12 75);text-transform:uppercase;letter-spacing:.04em}
.crewc .fl{font-size:.68rem;color:oklch(0.68 0.03 60)}
.crewc .row{display:flex;align-items:center;gap:6px;font-size:.72rem;margin-top:3px}
.crewc .bar{flex:1;height:6px;background:rgba(255,255,255,.08);border-radius:3px;position:relative;overflow:hidden}
.crewc .bar i{position:absolute;top:0;bottom:0;left:0;border-radius:3px}
.crewc .trust i{left:50%}
.crewc .lbl{width:44px;color:oklch(0.68 0.03 60)}
.crewc .acts{display:flex;flex-wrap:wrap;gap:5px;padding:0 10px 10px;position:relative}
.crewc select{background:oklch(0.22 0.015 60);color:#efe3cf;border:1px solid oklch(0.38 0.03 60);border-radius:6px;font:600 .7rem Inter,system-ui;padding:3px}
.crewc .down{color:#ff6a4a;font-weight:700}
.crewp-empty{padding:40px;text-align:center;color:oklch(0.68 0.03 60)}
.crewp-empty .ic{width:64px;height:64px;border-radius:50%;margin:0 auto 12px;background:oklch(0.3 0.08 60);display:flex;align-items:center;justify-content:center}
.crewp-foot{margin-top:12px;font-size:.75rem;color:oklch(0.68 0.03 60);display:flex;gap:18px;flex-wrap:wrap}
.crewr{position:fixed;inset:0;z-index:61;pointer-events:none;display:flex;align-items:center;justify-content:center}
.crewr svg{width:440px;height:440px;filter:drop-shadow(0 6px 18px rgba(0,0,0,.6))}
.crewr text{font:700 11px Inter,system-ui,sans-serif;fill:#efe3cf;text-anchor:middle}
`;

const W = 300, H = 220;

export class CrewUI {
  constructor(game, root) {
    this.g = game;
    this.open = false; this.radial = false; this.pick = -1; this.viaPad = false; this.gripAt = null;
    this.t = 0; this.holdT = 0; this.flagCache = new Map(); this.faceCache = new Map();
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.el = document.createElement('div'); this.el.className = 'crewp hidden';
    this.el.innerHTML = '<div class="crewp-card"><div class="crewp-head"></div><div class="crewp-grid"></div><div class="crewp-foot"></div></div>';
    root.appendChild(this.el);
    this.head = this.el.querySelector('.crewp-head'); this.grid = this.el.querySelector('.crewp-grid'); this.foot = this.el.querySelector('.crewp-foot');
    this.el.addEventListener('click', (e) => this.click(e));
    this.el.addEventListener('change', (e) => { const s = e.target.closest('select[data-job]'); if (s) { const m = this.g.crew.byAny(s.dataset.job); if (m) this.g.crew.assignJob(m, s.value); this.render(); } });
    this.rd = document.createElement('div'); this.rd.className = 'crewr hidden';
    root.appendChild(this.rd);
    this.buildRadial();
  }

  // ---- input (per frame; DOM writes only when something changes) -----------------------------------------------------
  update(dt) {
    const g = this.g, C = g.controls;
    if (!C?.st?.crew) return;
    const s = C.st.crew, busy = g.invUI?.open || g.dialogue?.active || g.paused;
    if (busy && !this.open) { if (this.radial) this.closeRadial(false); return; }
    if (s.held && !this.radial && C.heldFor('crew') >= PAD.holdTime && !this.open) this.openRadial(!!s.pad);
    if (this.radial) {
      this.aimRadial();
      if (!s.held) this.closeRadial(true);
    } else if (s.tapUp) this.toggle();
    if (this.open && (this.t -= dt) <= 0) { this.t = 0.5; this.render(); }
  }

  toggle(on = !this.open) {
    this.open = on;
    this.el.classList.toggle('hidden', !on);
    if (on) { this.t = 0; this.render(); }
    this.g.emit('crewPanel', { open: on });
  }

  // ---- the radial ---------------------------------------------------------------------------------------------------
  buildRadial() {
    const n = ORDERS.length, R0 = 70, R1 = 205, cx = 220, cy = 220;
    let s = `<svg viewBox="0 0 440 440"><circle cx="220" cy="220" r="${R1 + 6}" fill="rgba(18,13,8,.82)" stroke="oklch(0.45 0.05 60)"/>`;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n, a1 = a0 + (Math.PI * 2) / n;
      const p = (r, a) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
      s += `<path data-i="${i}" d="M${p(R0, a0)} L${p(R1, a0)} A${R1} ${R1} 0 0 1 ${p(R1, a1)} L${p(R0, a1)} A${R0} ${R0} 0 0 0 ${p(R0, a0)}Z" fill="rgba(60,44,28,.85)" stroke="oklch(0.35 0.03 60)"/>`;
      const am = (a0 + a1) / 2, words = ORDER_NAMES[ORDERS[i]].split(' ');
      const half = Math.ceil(words.length / 2), l1 = words.slice(0, words.length > 2 ? half : 1).join(' '), l2 = words.slice(words.length > 2 ? half : 1).join(' ');
      const tx = cx + Math.cos(am) * 140, ty = cy + Math.sin(am) * 140;
      s += `<text x="${tx.toFixed(1)}" y="${(ty - (l2 ? 4 : -4)).toFixed(1)}">${l1}</text>${l2 ? `<text x="${tx.toFixed(1)}" y="${(ty + 10).toFixed(1)}">${l2}</text>` : ''}`;
    }
    s += `<circle cx="220" cy="220" r="${R0 - 6}" fill="rgba(30,22,14,.95)" stroke="oklch(0.6 0.15 70)"/><text x="220" y="216" style="font-size:13px;fill:oklch(0.78 0.15 75)">CREW</text><text class="ctr" x="220" y="232" style="font-size:9px">let go: nothing</text></svg>`;
    this.rd.innerHTML = s;
    this.wedges = [...this.rd.querySelectorAll('path[data-i]')];
    this.ctr = this.rd.querySelector('.ctr');
  }

  openRadial(viaPad) {
    const g = this.g;
    this.radial = true; this.viaPad = viaPad; this.pick = -1; this.setPick(-1);
    // LB is the grip's tap too: a hold that opened the radial gives the grip back the way it was.
    if (viaPad && g.arms) { this.gripAt = g.arms.gripPref; }
    this.rd.classList.remove('hidden');
    g.emit('crewRadial', { open: true, pad: viaPad });
  }

  aimRadial() {
    const g = this.g, n = ORDERS.length;
    let dx, dy, mag;
    if (this.viaPad) { dx = g.controls.aimStick.x; dy = g.controls.aimStick.z; mag = g.controls.aimStick.mag; }
    else { const m = g.input.mouse; dx = m.x - innerWidth / 2; dy = m.y - innerHeight / 2; mag = Math.hypot(dx, dy) > 60 ? 1 : 0; }
    let i = -1;
    if (mag > 0.4) { const a = Math.atan2(dy, dx) + Math.PI / 2 + Math.PI / n; i = ((Math.floor((a / (Math.PI * 2)) * n) % n) + n) % n; }
    if (i !== this.pick) this.setPick(i);
  }

  setPick(i) {
    this.pick = i;
    this.wedges?.forEach((w, k) => w.setAttribute('fill', k === i ? 'oklch(0.55 0.15 70)' : 'rgba(60,44,28,.85)'));
    if (this.ctr) this.ctr.textContent = i >= 0 ? ORDER_NAMES[ORDERS[i]] : this.viaPad ? 'let go: the panel' : 'let go: nothing';
  }

  closeRadial(give) {
    const g = this.g;
    this.radial = false; this.rd.classList.add('hidden');
    if (this.viaPad && g.arms && this.gripAt && g.arms.gripPref !== this.gripAt) g.arms.setGrip(this.gripAt);
    this.gripAt = null;
    if (give && this.pick >= 0) g.crew.order(ORDERS[this.pick]);
    else if (give && this.viaPad) this.toggle(true);
    g.emit('crewRadial', { open: false, order: this.pick >= 0 ? ORDERS[this.pick] : null });
  }

  // ---- the panel ----------------------------------------------------------------------------------------------------
  flagImg(code) {
    if (!this.flagCache.has(code)) { const c = drawFlag(FLAGS[code] ? code : 'US', W, H); this.flagCache.set(code, c.toDataURL()); }
    return this.flagCache.get(code);
  }
  faceImg(m) {
    const k = `${m.rec}:${m.flag}`;
    if (!this.faceCache.has(k)) { const c = this.g.crew.members.find((x) => x.id === m.rec)?.c; const p = c?.npc?.portrait; this.faceCache.set(k, p ? drawPortrait({ ...p, flag: m.flag }).toDataURL() : this.flagImg(m.flag)); }
    return this.faceCache.get(k);
  }

  render() {
    const g = this.g, crew = g.crew, list = crew.members.map((m) => crew.view(m));
    const F = crew.formation;
    this.head.innerHTML = `<b>THE CREW</b><span class="sub">${crew.size()}/${CREW_RULES.cap} with you · ${crew.archetypes()}/${CREW_RULES.archetypeCap} cards</span><span class="sp"></span>
      ${['wedge', 'file', 'spread'].map((f) => `<button data-order="${f}" class="${F === f ? 'on' : ''}">${f.toUpperCase()}</button>`).join('')}
      <button data-act="camp">MAKE CAMP</button><button data-act="base">${crew.base ? 'MOVE BASE HERE' : 'CLAIM BASE HERE'}</button><button data-act="close">CLOSE · U</button>`;
    if (!list.length) {
      this.grid.innerHTML = `<div class="crewp-empty" style="grid-column:1/-1"><div class="ic"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="oklch(0.78 0.15 75)" stroke-width="2"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15 15c3 0 6 1.5 6 4"/></svg></div>You ride alone. Talk to people: some will come, some you hire, some you cut loose.</div>`;
    } else this.grid.innerHTML = list.map((m) => this.card(m)).join('');
    const mem = crew.memorial.slice(-4).map((x) => `${x.name} (${x.card}, day ${x.day})`).join(' · ');
    this.foot.innerHTML = `<span>CAMP: ${crew.camp ? `${Math.round(crew.camp.x)}, ${Math.round(crew.camp.z)}` : 'none'}</span><span>BASE: ${crew.base ? crew.base.name : 'none'}</span><span>PINS: ${crew.pins.length}</span>${mem ? `<span>ON THE WALL: ${mem}</span>` : ''}`;
  }

  card(m) {
    const w = WEAPONS[m.gun], hpPct = Math.round((m.hp / m.maxHp) * 100), trustW = Math.abs(m.trust) / 2;
    const trustCol = m.trust >= 0 ? 'oklch(0.7 0.14 140)' : 'oklch(0.6 0.19 30)';
    const bar = (lbl, v, col) => `<div class="row"><span class="lbl">${lbl}</span><span class="bar"><i style="width:${Math.round(v * 100)}%;background:${col}"></i></span></div>`;
    const status = m.down ? `<span class="down">DOWN · ${Math.ceil(m.bleed)}s TO BLEED OUT</span>` : m.away ? `ON A RUN · BACK AT ${Math.floor(m.away.back % 24)}:00` : `${m.order.toUpperCase()}${m.fire === 'hold' ? ' · HOLD FIRE' : ''}`;
    const jobs = CREW_JOBS.map((j) => `<option value="${j.id}" ${m.job?.id === j.id ? 'selected' : ''}>${j.where.toUpperCase()} · ${j.name}</option>`).join('');
    return `<div class="crewc"><img class="flag" src="${this.flagImg(m.flag)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.6"><div class="shade"></div>
      <div class="in"><img class="face" src="${this.faceImg(m)}" style="width:76px;height:96px;border-radius:6px;object-fit:cover;border:1px solid oklch(0.4 0.03 60)">
        <div><div class="nm">${m.name}</div><div class="cd">${m.card} · ${FLAGS[m.flag]?.name ?? m.flag}</div>
          ${bar('HEALTH', m.down ? 0 : hpPct / 100, 'oklch(0.62 0.17 35)')}
          ${bar('FOOD', m.needs.food, 'oklch(0.72 0.13 85)')}${bar('WATER', m.needs.water, 'oklch(0.66 0.1 210)')}${bar('REST', m.needs.rest, 'oklch(0.7 0.06 100)')}
          <div class="row"><span class="lbl">TRUST</span><span class="bar trust"><i style="width:${trustW}%;background:${trustCol};${m.trust < 0 ? `left:${50 - trustW}%` : ''}"></i></span><span>${Math.round(m.trust)}</span></div>
          <div class="row"><span class="lbl">GUN</span><span>${w ? `${w.short} ${Math.max(0, m.mag)}/${w.mag} · ${m.rounds} spare` : 'unarmed'}</span></div>
          <div class="fl">FLAW: ${m.flaw}</div><div class="fl">${status}${m.job ? ` · JOB: ${m.job.name}${m.job.live ? '' : ' (waiting)'}` : ''}</div>
        </div></div>
      <div class="acts"><select data-job="${m.rec}"><option value="none">NO JOB</option>${jobs}</select>
        <button data-act="rounds" data-m="${m.rec}">GIVE ROUNDS</button>${m.gun ? `<button data-act="takegun" data-m="${m.rec}">TAKE GUN</button>` : `<button data-act="givegun" data-m="${m.rec}">GIVE GUN</button>`}
        <button data-act="dismiss" data-m="${m.rec}">DISMISS</button></div></div>`;
  }

  click(e) {
    const g = this.g, crew = g.crew, b = e.target.closest('button');
    if (!b) { if (e.target === this.el) this.toggle(false); return; }
    if (b.dataset.order) { crew.order(b.dataset.order); this.render(); return; }
    const m = b.dataset.m ? crew.byAny(b.dataset.m) : null;
    switch (b.dataset.act) {
      case 'close': this.toggle(false); return;
      case 'camp': crew.camp = { x: g.player.x, z: g.player.z, day: g.society?.day ?? 0 }; g.hud.toast('CAMP MADE HERE', 'job'); break;
      case 'base': crew.claimBase(g.player.x, g.player.z); break;
      case 'rounds': if (m) crew.giveRounds(m); break;
      case 'takegun': if (m) crew.takeGun(m); break;
      case 'givegun': if (m) crew.giveGun(m); break;
      case 'dismiss': if (m && confirm(`Let ${m.name} go? They take their share.`)) crew.dismiss(m); break;
    }
    this.render();
  }
}
