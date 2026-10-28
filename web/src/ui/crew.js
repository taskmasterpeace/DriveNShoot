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
.crewp-tabs{display:flex;gap:4px;margin-right:8px}
.crewp-tabs button{border-radius:999px}
.crewp-list{display:flex;flex-direction:column;gap:6px}
.crewp-row{display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid oklch(0.32 0.02 60);border-radius:8px;background:oklch(0.2 0.012 60);font-size:.8rem;flex-wrap:wrap}
.crewp-row:hover{border-color:oklch(0.5 0.1 70)}
.crewp-row .sp,.crewp-head .sp{flex:1}
.crewp-row .sub,.crewp-sec .sub{color:oklch(0.68 0.03 60);font-size:.75rem}
.crewp-row select{background:oklch(0.22 0.015 60);color:#efe3cf;border:1px solid oklch(0.38 0.03 60);border-radius:6px;font:600 .7rem Inter,system-ui;padding:3px}
.crewp-sec{margin:6px 0 10px}
.crewp-sec h4{margin:0 0 6px;font-size:.78rem;letter-spacing:.06em;color:oklch(0.78 0.15 75)}
.crewp-btns{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.dogic{width:52px;height:52px;border-radius:50%;background:oklch(0.3 0.06 60);display:flex;align-items:center;justify-content:center}
.crewp-card{display:flex;flex-direction:column;max-height:88vh}
.crewp-grid,.crewp-list{overflow:hidden}
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
    // The pause menu's tabs (feat/web-qol): a CREW tab, when that build has addTab.
    try { this.g.qol?.addTab?.('crew', 'CREW', (el) => this.pauseTab(el)); } catch { /* an older pause menu: no tabs */ }
    // Tabs by key while the panel is open: TAB cycles, 1-6 jump.
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      const T = ['roster', 'orders', 'jobs', 'gear', 'bonds', 'wall'];
      if (e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); this.setTab(T[(T.indexOf(this.tab ?? 'roster') + (e.shiftKey ? T.length - 1 : 1)) % T.length]); }
      else if (/^Digit[1-6]$/.test(e.code)) { e.stopImmediatePropagation(); this.setTab(T[Number(e.code.slice(5)) - 1]); }
    }, true);
  }


  // ---- input (per frame; DOM writes only when something changes) -----------------------------------------------------
  update(dt) {
    const g = this.g, C = g.controls;
    // A member speaks up when you start talking to someone (the sim is still while a dialogue is open, so it is asked here).
    if (g.crew.members.length && (g.dialogue?.active ? g.dialogue.npc : null) !== g.crew.talkingTo) g.crew.interject();
    if (!C?.st?.crew) return;
    // At a garage U is the workshop's (main.js); the pad's LB hold is still the crew's there.
    const atGarage = !!g.workshop?.siteAt?.(g.player.x, g.player.z) && !C.st.crew.pad;
    const s = C.st.crew, busy = g.invUI?.open || g.dialogue?.active || g.paused || g.workshopUI?.open || (atGarage && !this.open);
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

  // ---- the panel: tabs, never one long scroll (Robert, 2026-10-27) ------------------------------------------------------
  render() {
    const g = this.g, crew = g.crew, list = crew.members.map((m) => crew.view(m)), dogs = g.dogs?.mine?.() ?? [];
    const tab = this.tab ??= 'roster';
    const TABS = [['roster', 'ROSTER'], ['orders', 'ORDERS'], ['jobs', 'JOBS'], ['gear', 'GEAR'], ['bonds', 'BONDS'], ['wall', 'WALL']];
    this.head.innerHTML = `<b>THE CREW</b><span class="sub">${crew.size()}/${CREW_RULES.cap} with you · ${crew.archetypes()}/${CREW_RULES.archetypeCap} cards${dogs.length ? ` · ${dogs.length} dog${dogs.length > 1 ? 's' : ''}` : ''}</span><span class="sp"></span>
      <span class="crewp-tabs">${TABS.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</span><button data-act="close">CLOSE · U</button>`;
    this.grid.className = tab === 'roster' ? 'crewp-grid' : 'crewp-list';
    this.grid.dataset.tab = tab;
    const empty = `<div class="crewp-empty" style="grid-column:1/-1"><div class="ic"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="oklch(0.78 0.15 75)" stroke-width="2"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15 15c3 0 6 1.5 6 4"/></svg></div>You ride alone. Talk to people: some will come, some you hire, some you cut loose.</div>`;
    if (tab === 'roster') this.grid.innerHTML = list.length || dogs.length ? list.map((m) => this.card(m)).join('') + dogs.map((d) => this.dogCard(g.dogs.view(d))).join('') : empty;
    else if (!list.length && tab !== 'wall') this.grid.innerHTML = empty;
    else this.grid.innerHTML = this[`tab_${tab}`](list, crew);
    const mem = crew.memorial.length;
    this.foot.innerHTML = `<span>CAMP: ${crew.camp ? `${Math.round(crew.camp.x)}, ${Math.round(crew.camp.z)}` : 'none'}</span><span>BASE: ${crew.base ? crew.base.name : 'none'}</span><span>PINS: ${crew.pins.length}</span><span>ON THE WALL: ${mem}</span><span>TAB / 1-6 switch tabs</span>`;
  }

  setTab(k) { this.tab = k; this.render(); this.g.emit('crewPanelTab', { tab: k }); }

  card(m) {
    const w = WEAPONS[m.gun], hpPct = Math.round((m.hp / m.maxHp) * 100), trustW = Math.abs(m.trust) / 2;
    const trustCol = m.trust >= 0 ? 'oklch(0.7 0.14 140)' : 'oklch(0.6 0.19 30)';
    const bar = (lbl, v, col) => `<div class="row"><span class="lbl">${lbl}</span><span class="bar"><i style="width:${Math.round(v * 100)}%;background:${col}"></i></span></div>`;
    const status = m.down ? `<span class="down">DOWN · ${Math.ceil(m.bleed)}s TO BLEED OUT</span>` : m.away ? `ON A RUN · BACK AT ${Math.floor(m.away.back % 24)}:00` : `${m.order.toUpperCase()}${m.fire === 'hold' ? ' · HOLD FIRE' : ''}`;
    return `<div class="crewc" data-flag="${m.flag}"><img class="flag" src="${this.flagImg(m.flag)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.6"><div class="shade"></div>
      <div class="in"><img class="face" src="${this.faceImg(m)}" style="width:76px;height:96px;border-radius:6px;object-fit:cover;border:1px solid oklch(0.4 0.03 60)">
        <div><div class="nm">${m.name}</div><div class="cd">${m.card} · ${FLAGS[m.flag]?.name ?? m.flag}</div>
          ${bar('HEALTH', m.down ? 0 : hpPct / 100, 'oklch(0.62 0.17 35)')}
          ${bar('FOOD', m.needs.food, 'oklch(0.72 0.13 85)')}${bar('WATER', m.needs.water, 'oklch(0.66 0.1 210)')}${bar('REST', m.needs.rest, 'oklch(0.7 0.06 100)')}
          <div class="row"><span class="lbl">TRUST</span><span class="bar trust"><i style="width:${trustW}%;background:${trustCol};${m.trust < 0 ? `left:${50 - trustW}%` : ''}"></i></span><span>${Math.round(m.trust)}</span></div>
          <div class="row"><span class="lbl">GUN</span><span>${w ? `${w.short} ${Math.max(0, m.mag)}/${w.mag} · ${m.rounds} spare` : 'unarmed'}</span></div>
          <div class="fl">FLAW: ${m.flaw}</div><div class="fl">${status}${m.job ? ` · ${m.job.name}${m.job.live ? '' : ' (waiting)'}` : ''}</div>
        </div></div></div>`;
  }

  // Your dogs ride with the crew too (systems/dogs.js): bond tier, order, health.
  dogCard(d) {
    return `<div class="crewc dogc"><div class="shade" style="background:linear-gradient(100deg,rgba(18,13,8,.95),rgba(40,28,16,.85))"></div>
      <div class="in" style="grid-template-columns:52px 1fr"><div class="dogic"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="oklch(0.78 0.15 75)" stroke-width="2"><path d="M10 5.2C10 3.7 8.9 2.6 7.5 3 5 3.7 4 7 4 9c0 1.5 1 2 2 2M14 5.2c0-1.5 1.1-2.6 2.5-2.2C19 3.7 20 7 20 9c0 1.5-1 2-2 2"/><path d="M8 14v.5M16 14v.5M11.3 19.4c.5.4 1 .4 1.4 0"/><path d="M6 11c0 5 2.7 9 6 9s6-4 6-9c0-2-1.5-4-6-4s-6 2-6 4z"/></svg></div>
        <div><div class="nm">${d.name}</div><div class="cd">${d.breedName} · ${d.tier}</div>
          <div class="row"><span class="lbl">HEALTH</span><span class="bar"><i style="width:${Math.round((d.hp / d.maxHp) * 100)}%;background:oklch(0.62 0.17 35)"></i></span></div>
          <div class="row"><span class="lbl">BOND</span><span class="bar"><i style="width:${Math.min(100, Math.round(d.bond))}%;background:oklch(0.72 0.13 85)"></i></span></div>
          <div class="fl">${d.state === 'downed' ? '<span class="down">DOWN</span>' : (d.cmd ?? '').toUpperCase()} · C whistles</div></div></div></div>`;
  }

  tab_orders(list) {
    const btn = (o) => `<button data-order="${o}">${ORDER_NAMES[o]}</button>`;
    const F = this.g.crew.formation;
    return `<div class="crewp-sec"><h4>EVERYONE</h4><div class="crewp-btns">${ORDERS.map(btn).join('')}</div>
      <div class="sub">Formation now: ${F.toUpperCase()}. Hold U (pad: hold LB) for the radial in the field.</div></div>
      ${list.map((m) => `<div class="crewp-row"><b>${m.name}</b><span class="sub">${m.card}</span><span class="sp"></span><span class="sub">${m.order.toUpperCase()}${m.fire === 'hold' ? ' · HOLD FIRE' : ''}</span>
        ${['follow', 'holdpos', 'cover', 'fallback', 'mangun'].map((o) => `<button data-order="${o}" data-m="${m.rec}">${ORDER_NAMES[o]}</button>`).join('')}</div>`).join('')}`;
  }

  tab_jobs(list, crew) {
    const jobs = (m) => CREW_JOBS.map((j) => `<option value="${j.id}" ${m.job?.id === j.id ? 'selected' : ''}>${j.where.toUpperCase()} · ${j.name}</option>`).join('');
    return `<div class="crewp-sec"><div class="crewp-btns"><button data-act="camp">MAKE CAMP HERE</button><button data-act="base">${crew.base ? 'MOVE BASE HERE' : 'CLAIM BASE HERE'}</button></div>
      <div class="sub">Road jobs work while you drive and they ride; camp jobs by the camp; base jobs at the base.</div></div>
      ${list.map((m) => `<div class="crewp-row"><b>${m.name}</b><span class="sub">${m.card}</span><span class="sp"></span>
        <span class="sub">${m.job ? `${m.job.live ? 'WORKING' : 'WAITING'} · ${Math.round(m.job.progress * 100)}%` : m.away ? 'ON A RUN' : 'NO JOB'}</span>
        <select data-job="${m.rec}"><option value="none">NO JOB</option>${jobs(m)}</select></div>`).join('')}
      ${crew.pins.length ? `<div class="crewp-sec"><h4>PINS</h4>${crew.pins.slice(-5).map((p) => `<div class="sub">${p.label} · ${p.x}, ${p.z} · ${p.by}</div>`).join('')}</div>` : ''}`;
  }

  tab_gear(list) {
    return list.map((m) => { const w = WEAPONS[m.gun]; return `<div class="crewp-row"><b>${m.name}</b><span class="sub">${w ? `${w.short} ${Math.max(0, m.mag)}/${w.mag} · ${m.rounds} spare` : 'unarmed'}</span><span class="sp"></span>
      <button data-act="rounds" data-m="${m.rec}">GIVE ROUNDS</button>${m.gun ? `<button data-act="takegun" data-m="${m.rec}">TAKE GUN</button>` : `<button data-act="givegun" data-m="${m.rec}">GIVE GUN</button>`}
      <button data-act="dismiss" data-m="${m.rec}">DISMISS</button></div>`; }).join('');
  }

  tab_bonds(list, crew) {
    const M = crew.members, pairs = [];
    for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) pairs.push([M[i], M[j], crew.bond(M[i], M[j])]);
    const word = (v) => v >= 50 ? 'FRIENDS' : v >= 10 ? 'GET ALONG' : v > -10 ? 'NEUTRAL' : v > -40 ? 'FRICTION' : 'RIVALS';
    const col = (v) => v >= 0 ? 'oklch(0.7 0.14 140)' : 'oklch(0.6 0.19 30)';
    return `<div class="crewp-sec"><h4>WHAT THEY THINK OF YOU</h4>${list.map((m) => `<div class="crewp-row"><b>${m.name}</b><span class="sp"></span><span class="sub">TRUST ${Math.round(m.trust)}</span></div>`).join('')}</div>
      <div class="crewp-sec"><h4>WHAT THEY THINK OF EACH OTHER</h4>${pairs.length ? pairs.map(([a, b, v]) => `<div class="crewp-row"><b>${a.name}</b><span class="sub">&amp;</span><b>${b.name}</b><span class="sp"></span><span style="color:${col(v)}">${word(v)} ${Math.round(v)}</span></div>`).join('') : '<div class="sub">One rider: nobody to get along with yet.</div>'}</div>
      <div class="crewp-sec"><h4>HEARD LATELY</h4>${crew.heard.slice(-5).reverse().map((h) => `<div class="sub">${h.name}: ${h.line}</div>`).join('') || '<div class="sub">Quiet.</div>'}</div>`;
  }

  tab_wall(list, crew) {
    const W = crew.memorial, D = this.g.dogs?.fallen ?? [];
    if (!W.length && !D.length) return '<div class="crewp-empty">Nobody on the wall. Keep it that way.</div>';
    return `<div class="crewp-sec"><h4>THE WALL</h4>${W.slice(-8).reverse().map((x) => `<div class="crewp-row"><b>${x.name}</b><span class="sub">${x.card} · ${FLAGS[x.flag]?.name ?? x.flag}</span><span class="sp"></span><span class="sub">day ${x.day} · ${x.days} days riding · ${x.why}</span></div>`).join('')}
      ${D.slice(-4).map((x) => `<div class="crewp-row"><b>${x.name}</b><span class="sub">${x.breed} · ${x.tier}</span><span class="sp"></span><span class="sub">day ${x.day}</span></div>`).join('')}</div>`;
  }

  click(e) {
    const g = this.g, crew = g.crew, b = e.target.closest('button');
    if (!b) { if (e.target === this.el) this.toggle(false); return; }
    if (b.dataset.tab) { this.setTab(b.dataset.tab); return; }
    const m = b.dataset.m ? crew.byAny(b.dataset.m) : null;
    if (b.dataset.order) { crew.order(b.dataset.order, m); this.render(); return; }
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

  // The pause menu's CREW tab (ui/qol.js addTab, when that build has it): the roster, read-only.
  pauseTab(el) {
    const crew = this.g.crew, list = crew.members.map((m) => crew.view(m));
    el.innerHTML = list.length ? list.map((m) => `<div style="display:flex;gap:10px;align-items:center;margin:6px 0"><img src="${this.flagImg(m.flag)}" style="width:36px;height:24px;border-radius:3px"><b>${m.name}</b><span style="opacity:.7">${m.card}</span><span style="margin-left:auto">TRUST ${Math.round(m.trust)} · ${m.down ? 'DOWN' : m.order.toUpperCase()}</span></div>`).join('') + '<div style="opacity:.7;margin-top:8px">Tap U in the field for the CREW panel; hold U for orders.</div>'
      : '<div style="opacity:.7">You ride alone. Tap U in the field for the CREW panel.</div>';
  }
}
