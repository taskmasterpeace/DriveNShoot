import { HALF, locationName } from '../world/city.js';
import { WEAPONS } from '../systems/combat.js';

const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3"/><path d="M8 19v2M8 13v2M16 19v2M16 13v2M12 21v2M12 15v2"/></svg>',
  wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
};

export class HUD {
  constructor(game, root) {
    this.g = game;
    root.insertAdjacentHTML('beforeend', `
      <div class="hud">
        <div class="hud-tr">
          <div class="clock"><span class="wx-icon"></span><span class="clock-time">00:00</span></div>
          <div class="clock-sub">CLEAR · NIGHT</div>
          <div class="wanted"></div>
          <div class="cash">$0</div>
        </div>
        <div class="feed"></div>
        <div class="hud-bl">
          <div class="minimap-wrap"><canvas class="minimap" width="200" height="200"></canvas><div class="mm-north">N</div></div>
          <div class="loc"><span class="loc-bar"></span><span class="loc-name">RUST HAVEN</span></div>
          <div class="bars">
            <div class="bar-row"><span class="bar-label">HEALTH</span><div class="bar"><i class="bar-hp"></i></div></div>
            <div class="bar-row"><span class="bar-label">STAMINA</span><div class="bar"><i class="bar-stam"></i></div></div>
            <div class="bar-row breath-row hidden"><span class="bar-label">BREATH</span><div class="bar"><i class="bar-breath"></i></div></div>
            <div class="bar-row veh-only"><span class="bar-label veh-label">VEHICLE</span><div class="bar"><i class="bar-veh"></i></div></div>
            <div class="bar-row veh-only"><span class="bar-label">FUEL</span><div class="bar"><i class="bar-fuel"></i></div></div>
          </div>
        </div>
        <div class="hud-br">
          <div class="weapon-panel">
            <div class="w-name">.45 REVOLVER</div>
            <div class="w-ammo"><b class="w-mag">6</b><span class="w-res">/ 36</span></div>
            <div class="w-slots"></div>
            <div class="w-throw"></div>
          </div>
          <div class="speedo hidden">
            <canvas width="150" height="150"></canvas>
            <div class="speedo-num">0</div><div class="speedo-unit">MPH</div>
            <div class="speedo-name">WAR RIG</div>
            <canvas class="win-diagram" width="64" height="96" title="Windows: blue intact · white cracked · red broken · dots = people hanging on"></canvas>
          </div>
        </div>
        <div class="prompt hidden"></div>
        <div class="subtitle hidden"></div>
        <div class="vignette"></div>
        <div class="hurt"></div>
        <div class="flashbang"></div>
        <div class="underwater"></div>
        <div class="dead-screen hidden"><div class="dead-title">YOU BLED OUT</div><div class="dead-sub">Doc Reyes found you in the dirt. She took her fee.</div></div>
        <div class="stats hidden"></div>
        <div class="reticle"></div>
      </div>`);
    const q = (s) => root.querySelector(s);
    this.el = {
      time: q('.clock-time'), sub: q('.clock-sub'), wx: q('.wx-icon'), cash: q('.cash'), wanted: q('.wanted'),
      feed: q('.feed'), mm: q('.minimap'), loc: q('.loc-name'), hp: q('.bar-hp'), veh: q('.bar-veh'), vehLabel: q('.veh-label'),
      wname: q('.w-name'), wmag: q('.w-mag'), wres: q('.w-res'), wslots: q('.w-slots'), wpanel: q('.weapon-panel'),
      speedo: q('.speedo'), breathRow: q('.breath-row'), breath: q('.bar-breath'), under: q('.underwater'), stam: q('.bar-stam'), fuel: q('.bar-fuel'), wthrow: q('.w-throw'), flash: q('.flashbang'), winDiagram: q('.win-diagram'), sCanvas: q('.speedo canvas'), sNum: q('.speedo-num'), sName: q('.speedo-name'),
      prompt: q('.prompt'), subtitle: q('.subtitle'), hurt: q('.hurt'), vignette: q('.vignette'), dead: q('.dead-screen'),
      stats: q('.stats'), reticle: q('.reticle'), hud: q('.hud'),
    };
    this.mmCtx = this.el.mm.getContext('2d');
    this.hurtV = 0;
    this.shakeV = 0;
    this.lastCash = -1;
    this.lastLoc = '';
    this.subT = 0;
  }

  toast(text, kind = 'info') {
    this.g.emit?.('toast', { text, kind });
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 4200);
    setTimeout(() => d.remove(), 5000);
  }

  subtitle(text, secs = 4) { this.el.subtitle.textContent = text; this.el.subtitle.classList.remove('hidden'); this.subT = secs; }
  flashbang(secs) { this.flashT = Math.max(this.flashT ?? 0, secs); this.flashMax = this.flashT; }
  hurt(dmg) { this.hurtV = Math.min(1, this.hurtV + dmg / 40); this.shake(Math.min(0.5, dmg / 60)); }
  shake(v) { this.shakeV = Math.max(this.shakeV, v); }
  prompt(text) {
    if (!text) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.innerHTML = text;
    this.el.prompt.classList.remove('hidden');
  }

  update(dt) {
    const g = this.g, p = g.player, sky = g.sky;
    this.el.time.textContent = sky.clock;
    const night = sky.phase === 'NIGHT';
    const wk = sky.weatherKey;
    this.el.wx.innerHTML = wk === 'RAIN' ? ICONS.rain : wk === 'STORM' ? ICONS.bolt : wk === 'DUST' || wk === 'ASHFALL' ? ICONS.wind : wk === 'FOG' || wk === 'OVERCAST' ? ICONS.cloud : night ? ICONS.moon : ICONS.sun;
    this.el.sub.textContent = `${sky.label} · ${sky.phase}`;
    if (g.cash !== this.lastCash) { this.el.cash.textContent = `$${g.cash.toLocaleString()}`; this.lastCash = g.cash; }
    this.el.wanted.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < g.wanted ? 'on' : ''}"></i>`).join('');
    const px = p.inVehicle ? p.inVehicle.x : p.x, pz = p.inVehicle ? p.inVehicle.z : p.z;
    const loc = locationName(px, pz);
    if (loc !== this.lastLoc) { this.el.loc.textContent = loc; this.lastLoc = loc; }
    this.el.hp.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    this.el.stam.style.width = `${Math.round((p.stamina ?? 1) * 100)}%`;
    this.el.breathRow.classList.toggle('hidden', !p.swim && (p.breath ?? 1) >= 1);
    this.el.breath.style.width = `${Math.round((p.breath ?? 1) * 100)}%`;
    this.el.breath.classList.toggle('low', (p.breath ?? 1) < 0.3);
    this.el.under.style.opacity = p.underwater ? 0.75 : p.swim ? 0.12 : 0;
    if (p.inVehicle) this.el.fuel.style.width = `${Math.round(((p.inVehicle.fuel ?? 1) / (p.inVehicle.fuelCap ?? 1)) * 100)}%`;
    this.flashT = Math.max(0, (this.flashT ?? 0) - dt);
    this.el.flash.style.opacity = this.flashT > 0 ? Math.min(1, this.flashT / Math.max(0.5, (this.flashMax ?? 1) * 0.5)) : 0;
    this.el.hp.classList.toggle('low', p.hp < 35);

    const v = p.inVehicle;
    this.el.hud.classList.toggle('driving', !!v);
    this.el.hud.classList.toggle('talking', !!g.dialogue.active);
    if (v) {
      this.el.veh.style.width = `${Math.max(0, (v.hp / v.maxHp) * 100)}%`;
      this.el.vehLabel.textContent = v.name;
      this.el.speedo.classList.remove('hidden');
      this.el.wpanel.classList.add('hidden');
      const mph = Math.round(g.vehiclesSys.speed(v) * 2.237);
      this.el.sNum.textContent = mph;
      this.el.sName.textContent = v.harpoon ? `${v.name} · [H] HARPOON` : v.name;
      this.drawSpeedo(mph / (v.maxSpeed * 2.237));
      g.carCombat.drawHud(this.el.winDiagram.getContext('2d'), v);
    } else {
      this.el.speedo.classList.add('hidden');
      this.el.wpanel.classList.remove('hidden');
      const w = WEAPONS[g.inv.current];
      this.el.wname.textContent = w.name;
      this.el.wmag.textContent = p.reloading > 0 ? '··' : g.inv.mag[g.inv.current];
      this.el.wres.textContent = `/ ${g.inv.ammo[w.ammo]}`;
      const tk = g.inv.throwable, tn = g.inv.throwables[tk] ?? 0;
      const tl = `<kbd>Q</kbd>${(window.__THROW_NAMES?.[tk] ?? tk).toUpperCase()} ×${tn} <span class="dim">[X] next</span>`;
      if (tl !== this.lastThrow) { this.el.wthrow.innerHTML = tl; this.lastThrow = tl; }
      const slots = g.inv.weapons.map((k, i) => `<span class="${k === g.inv.current ? 'on' : ''}"><kbd>${i + 1}</kbd>${WEAPONS[k].short}</span>`).join('');
      if (slots !== this.lastSlots) { this.el.wslots.innerHTML = slots; this.lastSlots = slots; }
    }

    // Hurt / low-health vignette.
    this.hurtV = Math.max(0, this.hurtV - dt * 1.4);
    const low = p.alive ? Math.max(0, 1 - p.hp / 45) : 1;
    this.el.hurt.style.opacity = Math.min(1, this.hurtV + low * (0.45 + Math.sin(performance.now() * 0.006) * 0.15));
    this.el.dead.classList.toggle('hidden', p.alive);
    this.shakeV = Math.max(0, this.shakeV - dt * 2.5);
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.el.subtitle.classList.add('hidden'); }

    this.el.reticle.style.transform = `translate(${g.input.mouse.x}px, ${g.input.mouse.y}px)`;
    this.el.reticle.classList.toggle('hidden', !!g.dialogue.active);
    this.drawMinimap(px, pz, p.inVehicle ? p.inVehicle.h : p.face);
  }

  drawSpeedo(f) {
    const c = this.el.sCanvas.getContext('2d');
    c.clearRect(0, 0, 150, 150);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    c.lineCap = 'round';
    c.lineWidth = 9; c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.arc(75, 75, 62, a0, a1); c.stroke();
    const k = Math.min(1, Math.max(0, f));
    const grad = c.createLinearGradient(0, 150, 150, 0);
    grad.addColorStop(0, '#f2e6d0'); grad.addColorStop(0.7, '#f0a23a'); grad.addColorStop(1, '#e8452a');
    c.strokeStyle = grad;
    c.beginPath(); c.arc(75, 75, 62, a0, a0 + (a1 - a0) * k); c.stroke();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      c.beginPath(); c.moveTo(75 + Math.cos(a) * 50, 75 + Math.sin(a) * 50); c.lineTo(75 + Math.cos(a) * 45, 75 + Math.sin(a) * 45); c.stroke();
    }
  }

  drawMinimap(px, pz, heading) {
    const c = this.mmCtx, S = 200, R = 100;
    const src = this.g.world.minimap;
    const k = src.width / (HALF * 2);
    const view = 150; // world units across radius
    const scale = R / view;
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#241b13'; c.fillRect(0, 0, S, S);
    const sx = (px + HALF) * k - view * k, sz = (pz + HALF) * k - view * k;
    c.imageSmoothingEnabled = true;
    c.drawImage(src, sx, sz, view * 2 * k, view * 2 * k, 0, 0, S, S);
    const blip = (x, z, col, r = 3) => {
      const bx = R + (x - px) * scale, bz = R + (z - pz) * scale;
      if ((bx - R) ** 2 + (bz - R) ** 2 > (R - 6) ** 2) return;
      c.fillStyle = col; c.beginPath(); c.arc(bx, bz, r, 0, Math.PI * 2); c.fill();
    };
    for (const ch of this.g.chars) {
      if (!ch.alive || ch === this.g.player || ch.inVehicle) continue;
      if (Math.abs(ch.x - px) > view || Math.abs(ch.z - pz) > view) continue;
      if (ch.npc) blip(ch.x, ch.z, '#f5c542', 4);
      else if (ch.faction === 'raider') blip(ch.x, ch.z, '#ff4a3a', 2.6);
      else if (ch.faction === 'warden') blip(ch.x, ch.z, '#6fb36a', 2.4);
    }
    for (const v of this.g.vehicles) if (!v.dead && v !== this.g.player.inVehicle) blip(v.x, v.z, v.driver?.faction === 'raider' ? '#ff4a3a' : '#e8e2d4', 2.8);
    for (const camp of this.g.world.spawns.camps) {
      const bx = R + (camp.x - px) * scale, bz = R + (camp.z - pz) * scale;
      const d = Math.hypot(bx - R, bz - R);
      const cx = d > R - 10 ? R + ((bx - R) / d) * (R - 10) : bx, cz = d > R - 10 ? R + ((bz - R) / d) * (R - 10) : bz;
      c.fillStyle = '#ff4a3a'; c.font = 'bold 11px Barlow Condensed'; c.textAlign = 'center'; c.fillText('✕', cx, cz + 4);
    }
    this.g.qol?.drawRoute(c, (x, z) => [R + (x - px) * scale, R + (z - pz) * scale], 2.5);
    c.restore();
    // Player arrow.
    c.save();
    c.translate(R, R);
    c.rotate(-heading + Math.PI);
    c.fillStyle = '#f5b21a'; c.strokeStyle = '#1b1410'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6.5, 7); c.lineTo(0, 3.5); c.lineTo(-6.5, 7); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(245,178,26,0.55)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.stroke();
  }

  stats(info) {
    this.el.stats.textContent = info;
  }
}
