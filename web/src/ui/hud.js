import { HALF, locationName, districtName } from '../world/city.js';
import { WEAPONS } from '../systems/combat.js';
import * as ART from './hudart.js';
import { NEEDS } from '../data/survival.js';

const NEED_WORDS = Object.fromEntries(Object.entries(NEEDS).map(([k, v]) => [k, v.words])); // the ailments' words: one source

// The HUD: stamped steel, rust, paper and brass, laid out like the 2026-10-22 target
// (docs/design/hud-target-2026-10-22.jpg). Every texture is painted once at boot (hudart.js); per frame
// this only writes what changed: text when it changes, meter segments when a segment flips, needles when
// they move, the minimap at 30 Hz, the respect chips and the needs gauges at 4 Hz. Nothing allocates in
// the steady state.

const ICONS = {
  sun: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="24" cy="24" r="9"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/></svg>',
  moon: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M38 29.5A15 15 0 1 1 20.5 9a12 12 0 0 0 17.5 20.5z"/><path d="M36 8v4M34 10h4M30 18v2M29 19h2" stroke-linecap="round"/></svg>',
  rain: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 29h20a8 8 0 0 0 0-16h-.6A11 11 0 0 0 12.2 16 6.5 6.5 0 0 0 14 29z"/><path d="M16 35l-2 5M24 35l-2 5M32 35l-2 5"/></svg>',
  storm: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 27h20a8 8 0 0 0 0-16h-.6A11 11 0 0 0 12.2 14 6.5 6.5 0 0 0 14 27z"/><path d="M25 30l-5 8h7l-4 7"/></svg>',
  dust: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 17h24a5 5 0 1 0-5-5M6 25h32a5 5 0 1 1-5 5M6 33h16"/><circle cx="36" cy="16" r="1" fill="currentColor"/><circle cx="28" cy="38" r="1" fill="currentColor"/></svg>',
  cloud: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M13 34h22a9 9 0 0 0 0-18h-.7A12 12 0 0 0 11 20a7 7 0 0 0 2 14z"/></svg>',
  fog: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M8 16h26M14 23h28M6 30h30M12 37h22"/></svg>',
  ash: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M13 27h22a8 8 0 0 0 0-16h-.6A11 11 0 0 0 11.2 14 6.5 6.5 0 0 0 13 27z"/><g fill="currentColor" stroke="none"><circle cx="16" cy="34" r="1.6"/><circle cx="25" cy="38" r="1.6"/><circle cx="33" cy="33" r="1.6"/><circle cx="20" cy="43" r="1.6"/></g></svg>',
};
const WX_ICON = { RAIN: 'rain', STORM: 'storm', DUST: 'dust', ASHFALL: 'ash', FOG: 'fog', OVERCAST: 'cloud' };

const SEG = 15;           // health / stamina segments
const SEG_SMALL = 10;     // breath, fuel, hull
const TIER_CLASS = { hunted: 't-bad', hostile: 't-bad', wary: 't-wary', neutral: 't-neutral', friendly: 't-good', allied: 't-good' };
const DASH = [5, 3.5], SOLID = [];
const STATUS_W = { needs: 670, bare: 432 }; // three dials (food, water, rest) on the plate
const segs = (cls, n) => `<div class="seg ${cls}">${'<i></i>'.repeat(n)}</div>`;
const gauge = (cls, label) => `<div class="gauge ${cls}"><span class="g-label">${label}</span><div class="g-dial"><canvas></canvas><i class="g-needle"></i><b class="g-hub"></b></div></div>`;

export class HUD {
  constructor(game, root) {
    this.g = game;
    this.root = root;
    root.insertAdjacentHTML('beforeend', `
      <div class="hud">
        <div class="hud-tl"><div class="obj-slot"></div><div class="feed"></div></div>
        <div class="hud-tr">
          <div class="plate wx-plate"><canvas class="tex"></canvas>
            <div class="wx-top"><span class="wx-icon"></span><div class="wx-read"><b class="clock-time">00:00</b><span class="clock-sub">CLEAR - NIGHT</span></div></div>
            <div class="wx-rule"></div>
            <div class="wanted-row"><span class="wanted-label">WANTED</span><div class="wanted">${'<i></i>'.repeat(5)}</div></div>
          </div>
          <div class="respect"></div>
          <div class="cash-plate"><canvas class="tex"></canvas><div class="cash">$0</div></div>
          <div class="kill-slot"></div>
        </div>
        <div class="hud-bl">
          <div class="status"><canvas class="tex"></canvas>
            <div class="st-bars">
              <div class="st-row"><span class="st-label">HEALTH</span><b class="hp-num">100</b></div>${segs('seg-hp', SEG)}
              <div class="st-row"><span class="st-label">STAMINA</span></div>${segs('seg-stam', SEG)}
            </div>
            <div class="needs hidden">${gauge('g-food', 'FOOD')}${gauge('g-water', 'WATER')}${gauge('g-rest', 'REST')}</div>
          </div>
          <div class="flagpatch"><canvas></canvas></div>
          <div class="ailments"></div>
          <div class="roles"></div>
          <div class="breath-tab hidden"><canvas class="tex"></canvas><span class="st-label">BREATH</span>${segs('seg-breath', SEG_SMALL)}</div>
          <div class="sign"><canvas class="tex"></canvas><div class="loc-name">RUST HAVEN</div><div class="loc-sub">PHOENIX - ARIZONA</div></div>
          <div class="mm"><canvas class="minimap" width="200" height="200"></canvas><canvas class="mm-bezel"></canvas></div>
        </div>
        <div class="hud-br">
          <div class="weapon-panel"><canvas class="tex"></canvas>
            <div class="w-name">.45 REVOLVER</div>
            <div class="w-ammo"><b class="w-mag">6</b><span class="w-res">/ 36</span></div>
            <div class="w-carts"></div>
            <div class="w-rule"></div>
            <div class="w-cond" data-state="ok" title="Condition: every round wears a gun; a worn one jams"><i><em></em></i><b>100%</b></div>
            <div class="w-stamp hidden"></div>
            <div class="w-slots"></div>
            <div class="w-throw"><i class="w-ticon"></i><b class="w-tcount">×2</b><span class="w-tname">FRAG</span><span class="w-tkeys"><kbd>Q</kbd>throw <kbd>X</kbd>next</span></div>
          </div>
          <div class="speedo hidden"><canvas class="tex"></canvas>
            <div class="sp-name"><b class="speedo-name">WHALER</b><span class="sp-hint hidden"><kbd>H</kbd>HARPOON</span></div>
            <div class="sp-dial"><canvas></canvas><i class="sp-needle"></i><b class="sp-hub"></b><div class="sp-read"><b class="speedo-num">0</b><span class="speedo-unit">MPH</span></div></div>
            <div class="sp-side">
              <canvas class="win-diagram" width="64" height="96" title="Windows: blue intact · white cracked · red broken · dots = people hanging on"></canvas>
              <div class="sp-bars">
                <div class="st-row"><span class="st-label veh-label">HULL</span></div>${segs('seg-hull', SEG_SMALL)}
                <div class="st-row"><span class="st-label">FUEL</span></div>${segs('seg-fuel', SEG_SMALL)}
              </div>
            </div>
          </div>
        </div>
        <div class="prompt hidden"></div>
        <div class="subtitle hidden"></div>
        <div class="vignette"></div>
        <div class="hurt"></div>
        <div class="flashbang"></div>
        <div class="underwater"></div>
        <div class="tired"></div>
        <div class="sleep-screen hidden"><div class="sl-title">ASLEEP</div><div class="sl-clock"></div><div class="sl-rest"><span>REST</span><i><em></em></i><b></b></div><div class="sl-sub"><kbd>E</kbd> GET UP</div></div>
        <div class="blackout"></div>
        <div class="dead-screen hidden"><div class="dead-title">YOU BLED OUT</div><div class="dead-sub">Doc Reyes found you in the dirt. She took her fee.</div></div>
        <div class="stats hidden"></div>
        <div class="reticle"></div>
      </div>`);
    const q = (s) => root.querySelector(s);
    const qa = (s) => [...root.querySelectorAll(s)];
    this.el = {
      hud: q('.hud'), objSlot: q('.obj-slot'), feed: q('.feed'), killSlot: q('.kill-slot'),
      wxPlate: q('.wx-plate canvas'), time: q('.clock-time'), sub: q('.clock-sub'), wx: q('.wx-icon'), wanted: q('.wanted'), stars: qa('.wanted i'),
      respect: q('.respect'), cashPlate: q('.cash-plate canvas'), cash: q('.cash'),
      status: q('.status'), statusTex: q('.status canvas'), hpNum: q('.hp-num'), hpSegs: qa('.seg-hp i'), stamSegs: qa('.seg-stam i'),
      needs: q('.needs'), foodDial: q('.g-food canvas'), waterDial: q('.g-water canvas'), foodNeedle: q('.g-food .g-needle'), waterNeedle: q('.g-water .g-needle'), restDial: q('.g-rest canvas'), restNeedle: q('.g-rest .g-needle'),
      ailments: q('.ailments'), tired: q('.tired'), sleep: q('.sleep-screen'), slClock: q('.sl-clock'), slRest: q('.sl-rest em'), slRestT: q('.sl-rest b'), blackout: q('.blackout'),
      flag: q('.flagpatch'), flagTex: q('.flagpatch canvas'), roles: q('.hud-bl .roles'),
      breathRow: q('.breath-tab'), breathTex: q('.breath-tab canvas'), breathSegs: qa('.seg-breath i'),
      signTex: q('.sign canvas'), loc: q('.loc-name'), locSub: q('.loc-sub'),
      mm: q('.minimap'), bezel: q('.mm-bezel'),
      wpanel: q('.weapon-panel'), wTex: q('.weapon-panel canvas'), wname: q('.w-name'), wmag: q('.w-mag'), wres: q('.w-res'), wcarts: q('.w-carts'), wslots: q('.w-slots'), wcond: q('.w-cond'), wcondFill: q('.w-cond em'), wcondT: q('.w-cond b'), wstamp: q('.w-stamp'),
      wthrow: q('.w-throw'), tIcon: q('.w-ticon'), tCount: q('.w-tcount'), tName: q('.w-tname'),
      speedo: q('.speedo'), spTex: q('.speedo canvas'), spDial: q('.sp-dial canvas'), spNeedle: q('.sp-needle'), sNum: q('.speedo-num'), sName: q('.speedo-name'), spHint: q('.sp-hint'),
      winDiagram: q('.win-diagram'), vehLabel: q('.veh-label'), hullSegs: qa('.seg-hull i'), fuelSegs: qa('.seg-fuel i'),
      prompt: q('.prompt'), subtitle: q('.subtitle'), hurt: q('.hurt'), vignette: q('.vignette'), dead: q('.dead-screen'), flash: q('.flashbang'), under: q('.underwater'),
      stats: q('.stats'), reticle: q('.reticle'),
    };
    this.mmCtx = this.el.mm.getContext('2d');
    this.winCtx = this.el.winDiagram.getContext('2d');
    this.measure = document.createElement('canvas').getContext('2d');
    this.hurtV = 0;
    this.shakeV = 0;
    this.subT = 0;
    this.mmT = 1;
    this.slowT = 1;
    this.winT = 1;
    this.s = {};            // last written values, so every write is change-only
    this.chips = [];
    this.carts = [];
    this.lastWeapons = [];
    this.tapes = [];        // the role tapes on show: { id, short, tier }
    this.tapeTier = {};     // id -> tier last drawn (a tape stamps in when it rises)

    // Shared sprites ride on CSS custom properties: painted once, used by every chip, tag and cartridge.
    const st = root.style;
    st.setProperty('--speckle', `url(${ART.speckleURL()})`);
    st.setProperty('--carts', `url(${ART.cartridgeSprite()})`);
    st.setProperty('--throws', `url(${ART.throwSprite()})`);
    this.paint();
    document.fonts?.ready?.then(() => {
      this.paint(true); this.s.loc = this.s.cash = undefined;
      if (this.g.player && this.g.paused) this.update(0); // the plates under the title show the real moment, not placeholders
    });
    this.rescale();
    addEventListener('resize', () => this.rescale());
  }

  // One scale for the whole HUD: 1.0 at 1600x900, clamped so 1280x720 and 4K both read.
  rescale() {
    const k = Math.max(0.62, Math.min(1.35, Math.min(innerWidth / 1600, innerHeight / 900)));
    this.root.style.setProperty('--s', k.toFixed(3));
    this.scaleK = k;
  }

  // Static art. Text-bearing faces (bezel numbers, gauge labels) repaint once the webfonts land.
  paint(textOnly = false) {
    const e = this.el, P = ART.paintPlate;
    if (!textOnly) {
      const rv = (w, h, n, inset = 8) => Array.from({ length: n }, (_, i) => [inset + ((w - inset * 2) * (i + 0.5)) / n, h]);
      P(272, 166, { seed: 4, chamfer: 12, rust: 0.7, scratch: 34, screws: [[16, 16, 6], [256, 16, 6], [16, 150, 6], [256, 150, 6]],
        rivets: [...rv(272, 9, 6, 40).map(([x, y]) => [x, y]), ...rv(272, 157, 6, 40), [9, 58], [9, 104], [263, 58], [263, 104]] }, e.wxPlate);
      this.swapCanvas(e.cashPlate, ART.paintLicence(226, 112));
      this.swapCanvas(e.signTex, ART.paintSign(352, 112));
      P(307, 252, { seed: 8, chamfer: 14, rust: 0.8, scratch: 70, scratchAlpha: 0.26, screws: [[22, 22, 8], [285, 22, 8], [22, 230, 8], [285, 230, 8]] }, e.wTex);
      P(330, 252, { seed: 9, chamfer: 14, rust: 0.7, scratch: 60, scratchAlpha: 0.24, screws: [[22, 22, 8], [308, 22, 8], [22, 230, 8], [308, 230, 8]] }, e.spTex);
      P(186, 44, { seed: 13, chamfer: 6, rust: 0.4, scratch: 10, screws: [[10, 22, 4.5]] }, e.breathTex);
      this.paintStatus(!!this.g.needs);
      this.paintFlag(this.g.player?.flag ?? 'US');
    }
    this.swapCanvas(e.bezel, ART.paintBezel(232, 84));
    const needs = { sweep: 115, ticks: 4, minor: 4, zone: [0, 0.22], labelY: -0.38, labelSize: 0.13 };
    ART.paintGauge(64, { ...needs, label: 'FOOD', seed: 62 }, e.foodDial);
    ART.paintGauge(64, { ...needs, label: 'WATER', seed: 63 }, e.waterDial);
    ART.paintGauge(64, { ...needs, label: 'REST', seed: 64 }, e.restDial);
    this.s.dialMax = undefined; // the speedometer face is painted per vehicle
  }
  swapCanvas(target, painted) {
    target.width = painted.width; target.height = painted.height;
    target.getContext('2d').drawImage(painted, 0, 0);
  }
  paintStatus(needs) {
    const w = needs ? STATUS_W.needs : STATUS_W.bare;
    ART.paintPlate(w, 132, { seed: 15, chamfer: 9, cut: { tr: 30 }, rust: 0.85, scratch: 50, screws: [[w - 22, 38, 6.5], [w - 18, 112, 6.5], [58, 114, 6.5]] }, this.el.statusTex);
    this.el.status.style.width = `${w}px`;
    this.el.flag.style.left = `${200 + w - 86}px`;
    this.el.needs.classList.toggle('hidden', !needs);
    this.s.hasNeeds = needs;
  }
  paintFlag(code) { ART.paintClothFlag(code, 132, 86, this.el.flagTex); this.s.flag = code; }

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
    if (!text) { if (this.s.prompt !== null) { this.el.prompt.classList.add('hidden'); this.s.prompt = null; } return; }
    if (text !== this.s.prompt) { this.el.prompt.innerHTML = text; this.s.prompt = text; }
    this.el.prompt.classList.remove('hidden');
  }

  // ---- change-only writers ------------------------------------------------------------------------------------
  // text() takes a constant string or a number (compared first, stringified only when it changed).
  text(key, el, v, pre = '') { if (this.s[key] !== v) { this.s[key] = v; el.textContent = pre ? pre + v : v; } }
  flag(key, el, cls, on) { if (this.s[key] !== on) { this.s[key] = on; el.classList.toggle(cls, on); } }
  opacity(key, el, v) { v = Math.round(v * 100) / 100; if (this.s[key] !== v) { this.s[key] = v; el.style.opacity = v; } }
  meter(key, list, n) {
    const was = this.s[key] ?? -1;
    if (was === n) return;
    this.s[key] = n;
    for (let i = 0; i < list.length; i++) { const on = i < n; if ((i < was) !== on || was < 0) list[i].classList.toggle('on', on); }
  }
  needle(key, el, deg) { if (Math.abs((this.s[key] ?? 1e9) - deg) < 0.25) return; this.s[key] = deg; el.style.transform = `rotate(${deg.toFixed(1)}deg)`; }

  update(dt) {
    const g = this.g, p = g.player, sky = g.sky, s = this.s;
    // clock + weather plate
    const mins = Math.floor(sky.time * 60);
    if (mins !== s.mins) { s.mins = mins; this.el.time.textContent = sky.clock; }
    const night = sky.phase === 'NIGHT';
    const icon = WX_ICON[sky.weatherKey] ?? (night ? 'moon' : 'sun');
    if (icon !== s.icon) { s.icon = icon; this.el.wx.innerHTML = ICONS[icon]; }
    if (sky.label !== s.wxLabel || sky.phase !== s.phase) { s.wxLabel = sky.label; s.phase = sky.phase; this.el.sub.textContent = `${sky.label} - ${sky.phase}`; }
    if (g.wanted !== s.wanted) {
      const before = s.wanted ?? 0;
      s.wanted = g.wanted;
      this.el.stars.forEach((st, i) => {
        st.classList.toggle('on', i < g.wanted);
        if (i >= before && i < g.wanted) st.animate?.([{ transform: 'scale(1.9)', filter: 'brightness(2.2)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
      });
    }
    if (g.cash !== s.cash) { s.cash = g.cash; this.el.cash.textContent = `$${g.cash.toLocaleString('en-US')}`; this.fit(this.el.cash, `700 80px "Barlow Condensed"`, 80, 186, 34); }

    // where you are
    const px = p.inVehicle ? p.inVehicle.x : p.x, pz = p.inVehicle ? p.inVehicle.z : p.z;
    const loc = locationName(px, pz);
    if (loc !== s.loc) {
      s.loc = loc;
      this.el.loc.textContent = loc;
      this.fit(this.el.loc, `700 64px "Overpass"`, 64, 312, 30);
      const d = districtName(px, pz), W = g.streamer?.W;
      // Past the island the state comes from the map (world/worldindex.js), and the road you are near names the stretch.
      const out = W && (Math.abs(px) > 464 || Math.abs(pz) > 464);
      this.text('locSub', this.el.locSub, out ? `${W.project(px, pz, 2048).d < 2000 ? W.road.nickname : 'NO ROAD'} - ${d}` : d === 'THE GLASS FLATS' ? 'MARICOPA CO. - ARIZONA' : 'PHOENIX - ARIZONA');
    }

    // health / stamina / breath
    const hp = Math.max(0, p.hp);
    this.meter('hp', this.el.hpSegs, Math.ceil((hp / p.maxHp) * SEG - 0.001));
    this.text('hpNum', this.el.hpNum, Math.ceil(hp));
    this.flag('low', this.el.status, 'low', p.hp < 35);
    this.meter('stam', this.el.stamSegs, Math.round((p.stamina ?? 1) * SEG));
    const breath = p.breath ?? 1;
    this.flag('breathHidden', this.el.breathRow, 'hidden', !p.swim && breath >= 1);
    this.meter('breath', this.el.breathSegs, Math.ceil(breath * SEG_SMALL - 0.001));
    this.flag('breathLow', this.el.breathRow, 'low', breath < 0.3);
    this.opacity('under', this.el.under, p.underwater ? 0.75 : p.swim ? 0.12 : 0);
    this.flashT = Math.max(0, (this.flashT ?? 0) - dt);
    this.opacity('flash', this.el.flash, this.flashT > 0 ? Math.min(1, this.flashT / Math.max(0.5, (this.flashMax ?? 1) * 0.5)) : 0);

    // slow lane (4 Hz): needs gauges, respect chips, the flag you wear
    this.slowT += dt;
    if (this.slowT >= 0.25) { this.slowT = 0; this.updateSlow(); }

    const v = p.inVehicle;
    this.flag('driving', this.el.hud, 'driving', !!v);
    this.flag('talking', this.el.hud, 'talking', !!g.dialogue.active);
    this.flag('uiTalking', this.root, 'talking', !!g.dialogue.active);
    if (v) {
      this.flag('spHidden', this.el.speedo, 'hidden', false);
      this.flag('wHidden', this.el.wpanel, 'hidden', true);
      this.updateDash(v, dt);
    } else {
      this.flag('spHidden', this.el.speedo, 'hidden', true);
      this.flag('wHidden', this.el.wpanel, 'hidden', false);
      this.updateWeapon();
    }

    // asleep, tired, a microsleep
    const nd = g.needs, S = g.survival?.sleep;
    this.flag('sleepHidden', this.el.sleep, 'hidden', !S);
    if (S) {
      this.text('slClock', this.el.slClock, sky.clock);
      const rp = Math.round((nd?.rest ?? 0) * 100);
      if (rp !== s.slRest) { s.slRest = rp; this.el.slRest.style.width = `${rp}%`; this.el.slRestT.textContent = `${rp}%`; }
    }
    this.opacity('tired', this.el.tired, S ? 0 : nd?.vignette ?? 0);
    this.opacity('blackout', this.el.blackout, nd?.blackout > 0 ? 1 : 0);

    // hurt / low-health vignette
    this.hurtV = Math.max(0, this.hurtV - dt * 1.4);
    const low = p.alive ? Math.max(0, 1 - p.hp / 45) : 1;
    this.opacity('hurt', this.el.hurt, Math.min(1, this.hurtV + (low > 0 ? low * (0.45 + Math.sin(performance.now() * 0.006) * 0.15) : 0)));
    this.flag('deadHidden', this.el.dead, 'hidden', p.alive);
    this.shakeV = Math.max(0, this.shakeV - dt * 2.5);
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.el.subtitle.classList.add('hidden'); }

    const mx = g.input.mouse.x, my = g.input.mouse.y;
    if (mx !== s.mx || my !== s.my) { s.mx = mx; s.my = my; this.el.reticle.style.transform = `translate(${mx}px, ${my}px)`; }
    this.flag('retHidden', this.el.reticle, 'hidden', !!g.dialogue.active);
    this.mmT += dt;
    if (this.mmT >= 1 / 30) { this.mmT = 0; this.drawMinimap(px, pz, p.inVehicle ? p.inVehicle.h : p.face); }
  }

  // Shrink a readout's font until it fits its plate (canvas measure: no layout read).
  fit(el, font, size, maxW, minSize) {
    const m = this.measure;
    m.font = font;
    const w = m.measureText(el.textContent).width;
    const fs = Math.max(minSize, Math.min(size, Math.floor((size * maxW) / Math.max(1, w))));
    el.style.fontSize = `${fs}px`;
  }

  updateSlow() {
    const g = this.g, s = this.s;
    // FOOD / WATER: no hunger system yet. The gauges read g.needs.{food,water} (0..1) and stay hidden without it.
    const nd = g.needs;
    if (!!nd !== s.hasNeeds) this.paintStatus(!!nd);
    if (nd) {
      const f = Math.max(0, Math.min(1, nd.food ?? 1)), w = Math.max(0, Math.min(1, nd.water ?? 1));
      this.needle('food', this.el.foodNeedle, -115 + 230 * f);
      this.needle('water', this.el.waterNeedle, -115 + 230 * w);
      this.flag('foodLow', this.el.foodNeedle.parentNode, 'low', f < 0.22);
      this.flag('waterLow', this.el.waterNeedle.parentNode, 'low', w < 0.22);
      const r = Math.max(0, Math.min(1, nd.rest ?? 1));
      this.needle('rest', this.el.restNeedle, -115 + 230 * r);
      this.flag('restLow', this.el.restNeedle.parentNode, 'low', r < 0.22);
      this.updateAilments(nd);
    }
    const code = g.player?.flag ?? 'US';
    if (code !== s.flag) this.paintFlag(code);
    this.updateRespect();
    this.updateRoles();
  }

  // What the world calls you (systems/roles.js): stitched cloth tapes on the status plate beside the street sign, one per role you are known
  // for (best first, up to three), chevrons for the tier. Rebuilt only when the roles' version moves; tucked away
  // while the breath tab needs the room.
  updateRoles() {
    const R = this.g.roles, s = this.s;
    if (!R) return;
    this.flag('rolesSwim', this.el.roles, 'hidden', !this.el.breathRow.classList.contains('hidden'));
    if (R.version === s.rolesV) return;
    s.rolesV = R.version;
    const list = R.shown(3), el = this.el.roles;
    el.textContent = '';
    list.forEach((r, i) => {
      const t = document.createElement('div');
      t.className = 'role-tape';
      t.dataset.role = r.id;
      t.style.setProperty('--rc', r.color);
      t.style.setProperty('--tr', `${[-1.4, 0.9, -0.5][i % 3]}deg`);
      t.title = `${r.name}: ${['', 'rumoured', 'known', 'renowned'][r.tier]}`;
      const b = document.createElement('b'); b.textContent = r.short;
      const k = document.createElement('span'); k.className = 'rank'; k.innerHTML = '<i></i>'.repeat(r.tier);
      t.append(b, k);
      el.appendChild(t);
      if ((this.tapeTier[r.id] ?? 0) < r.tier) t.animate?.([{ transform: `rotate(${[-1.4, 0.9, -0.5][i % 3]}deg) scale(1.35)`, filter: 'brightness(1.9)' }, { transform: `rotate(${[-1.4, 0.9, -0.5][i % 3]}deg) scale(1)`, filter: 'brightness(1)' }], { duration: 560, easing: 'ease-out' });
    });
    this.tapeTier = Object.fromEntries(list.map((r) => [r.id, r.tier]));
    this.tapes = list.map((r) => ({ id: r.id, short: r.short, tier: r.tier }));
  }

  // What's wrong with you, in words, beside the vitals: a fever, bleeding, and any need two pips down or worse.
  updateAilments(nd) {
    const p = this.g.player, F = nd.fever, tags = [];
    if (F) tags.push(F.treated ? ['warn', 'FEVER · TREATED'] : ['hot', 'FEVER · DIRTY WOUND']);
    if (p?.bleed > 0.2) tags.push(['hot', 'BLEEDING']);
    for (const k of ['water', 'food', 'rest']) {
      const pip = nd.pips?.[k] ?? 0;
      if (pip >= 2) tags.push([pip >= 3 ? 'hot' : 'warn', NEED_WORDS[k][pip]]);
    }
    const key = tags.map((t) => t[1]).join('|');
    if (key === this.s.ailments) return;
    this.s.ailments = key;
    this.el.ailments.innerHTML = tags.map(([cls, t]) => `<span class="md ${cls}">${t}</span>`).join('');
  }

  // GTA2-style respect: one stamped chip per faction that remembers you (the infected don't).
  updateRespect() {
    const F = this.g.society?.factions;
    if (!F) return;
    if (F.ids.length !== this.s.rsN) this.buildRespect(F);
    for (const ch of this.chips) {
      // The meter shows how they read you: your standing as your roles colour it (systems/roles.js).
      const i = ch.i, st = Math.round(F.reading(i)), t = F.tiers[i];
      if (st !== ch.s || t !== ch.t) {
        ch.s = st;
        ch.fill.style.left = `${st >= 0 ? 50 : 50 + st / 2}%`;
        ch.fill.style.width = `${Math.abs(st) / 2}%`;
        const b = Math.round(F.bias[i]);
        ch.el.title = `${ch.name}: ${st > 0 ? '+' : ''}${st} (${t})${b ? ` - standing ${Math.round(F.standing[i])}, ${b > 0 ? '+' : ''}${b} for what they call you` : ''}`;
      }
      if (t !== ch.t) {
        const changed = ch.t !== undefined;
        ch.t = t;
        ch.el.className = `chip ${TIER_CLASS[t] ?? 't-neutral'}`;
        ch.tier.textContent = t.toUpperCase();
        if (changed) ch.el.animate?.([{ transform: 'scale(1.18)', filter: 'brightness(1.9)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 520, iterations: 3, easing: 'ease-out' });
      }
    }
  }
  buildRespect(F) {
    this.s.rsN = F.ids.length;
    this.el.respect.textContent = '';
    this.chips = [];
    F.ids.forEach((id, i) => {
      const row = F.rows[i];
      if (!row || row.memory === 'none') return;
      const el = document.createElement('div');
      el.className = 'chip t-neutral';
      el.innerHTML = '<div class="chip-head"><b class="chip-pip"></b><span class="chip-name"></span></div><div class="chip-foot"><div class="chip-meter"><i></i></div><span class="chip-tier"></span></div>';
      const name = String(row.short ?? row.name ?? id).replace(/^the\s+/i, '').toUpperCase(); // a row's `short` fits the chip
      el.querySelector('.chip-name').textContent = name;
      el.querySelector('.chip-pip').style.background = row.color ?? '#9a8a6a';
      this.el.respect.appendChild(el);
      this.chips.push({ i, id, name, el, fill: el.querySelector('.chip-meter i'), tier: el.querySelector('.chip-tier'), s: undefined, t: undefined });
    });
  }

  updateWeapon() {
    const g = this.g, p = g.player, s = this.s, inv = g.inv;
    const cur = inv.current, w = WEAPONS[cur];
    if (!w) return;
    if (cur !== s.wcur) {
      s.wcur = cur;
      this.el.wname.textContent = w.name;
      // one cartridge per round, or per pair once the magazine gets long
      const n = Math.min(w.mag, 16), kind = w.ammo === 'shells' ? 'shell' : w.ammo === 'pistol' ? 'pistol' : w.ammo === 'rifle' ? 'rifle' : 'smg';
      this.el.wcarts.innerHTML = `<i class="c-${kind}"></i>`.repeat(n);
      this.carts = [...this.el.wcarts.children];
      this.cartPer = w.mag / n;
      s.cartsLit = -1;
    }
    const mag = inv.mag[cur] ?? 0, reloading = p.reloading > 0;
    this.text('wmag', this.el.wmag, reloading ? '··' : mag);
    this.text('wres', this.el.wres, inv.ammo[w.ammo] ?? 0, '/ ');
    const lit = reloading ? 0 : Math.ceil(mag / this.cartPer - 0.001);
    if (lit !== s.cartsLit) {
      const was = s.cartsLit;
      s.cartsLit = lit;
      for (let i = 0; i < this.carts.length; i++) { const spent = i >= lit; if (was < 0 || (i >= was) !== spent) this.carts[i].classList.toggle('spent', spent); }
    }
    // the gun's condition: the gauge on the rule, and a stamp across the rounds when it jams or breaks
    const st = g.inventory.gunState(cur), pct = Math.round(g.inventory.cond(cur) * 100);
    if (pct !== s.wcond) { s.wcond = pct; this.el.wcondFill.style.height = `${pct}%`; this.el.wcondT.textContent = `${pct}%`; }
    if (st !== s.wstate) {
      s.wstate = st;
      this.el.wcond.dataset.state = st;
      this.el.wstamp.textContent = st === 'jammed' ? 'JAMMED · R' : st === 'broken' ? 'BROKEN' : '';
      this.el.wstamp.classList.toggle('hidden', st !== 'jammed' && st !== 'broken');
      this.el.wstamp.classList.toggle('jam', st === 'jammed');
    }
    // dog tags, one per slot; the one in your hands is brass
    const list = inv.weapons;
    let same = list.length === this.lastWeapons.length && cur === s.tagCur;
    for (let i = 0; same && i < list.length; i++) same = list[i] === this.lastWeapons[i];
    if (!same) {
      this.lastWeapons = list.slice();
      s.tagCur = cur;
      this.el.wslots.dataset.n = list.length;
      this.el.wslots.innerHTML = list.map((k, i) => `<span class="dogtag${k === cur ? ' on' : ''}" style="--r:${[-14, 9, -6, 12, -9][i % 5]}deg"><em>${i + 1} ${WEAPONS[k]?.short ?? k.toUpperCase()}</em></span>`).join('');
    }
    // the throwable in your belt
    const tk = inv.throwable, tn = inv.throwables[tk] ?? 0;
    if (tk !== s.tk) {
      s.tk = tk;
      const idx = ART.THROW_KINDS.indexOf(tk);
      this.el.tIcon.style.backgroundPosition = `${-(idx < 0 ? 0 : idx) * ART.THROW_ICON.w}px 0`;
      this.el.tName.textContent = (window.__THROW_NAMES?.[tk] ?? tk).toUpperCase();
    }
    this.text('tn', this.el.tCount, tn, '×');
    this.flag('tEmpty', this.el.wthrow, 'empty', tn <= 0);
  }

  updateDash(v, dt) {
    const g = this.g, s = this.s;
    const top = v.maxSpeed * 2.237;
    const dialMax = Math.max(40, Math.ceil((top * 1.12) / 20) * 20);
    if (dialMax !== s.dialMax) {
      s.dialMax = dialMax;
      const step = dialMax <= 60 ? 10 : 20, nums = [];
      for (let k = 0; k <= dialMax; k += step) nums.push(String(k));
      ART.paintGauge(172, { sweep: 125, ticks: nums.length - 1, minor: step === 20 ? 4 : 2, nums, zone: [Math.min(0.97, top / dialMax), 1], seed: 64 }, this.el.spDial);
    }
    const mph = g.vehiclesSys.speed(v) * 2.237;
    this.needle('spd', this.el.spNeedle, -125 + 250 * Math.min(1.03, Math.max(0, mph / dialMax)));
    this.text('mph', this.el.sNum, Math.round(mph));
    this.text('vname', this.el.sName, v.name);
    this.flag('spHint', this.el.spHint, 'hidden', !v.harpoon);
    this.meter('hull', this.el.hullSegs, Math.ceil(Math.max(0, v.hp / v.maxHp) * SEG_SMALL - 0.001));
    this.flag('hullLow', this.el.speedo, 'hull-low', v.hp < v.maxHp * 0.3);
    this.meter('fuel', this.el.fuelSegs, Math.ceil(Math.max(0, (v.fuel ?? 1) / (v.fuelCap ?? 1)) * SEG_SMALL - 0.001));
    this.winT += dt;
    if (this.winT >= 0.1) { this.winT = 0; g.carCombat.drawHud(this.winCtx, v); }
  }

  drawMinimap(px, pz, heading) {
    const c = this.mmCtx, S = 200, R = 100;
    if (!this.mmTint) { this.mmTint = ART.tintMap(this.g.world.minimap); this.mmMesh = ART.paintRadarMesh(S); }
    // The radar opens out with speed (docs/design/WEB_STREAMING.md F13: 150 m + 6 s of road, up to 426 m).
    const pv = this.g.player.inVehicle, want = Math.min(426, 150 + 6 * (pv ? this.g.vehiclesSys.speed(pv) : 0));
    this.mmView = (this.mmView ?? 150) + (want - (this.mmView ?? 150)) * 0.06;
    const view = this.mmView, scale = R / view;
    c.fillStyle = '#0c1209'; c.fillRect(0, 0, S, S);
    // Phoenix's own map while the radar stays inside it; past its edge, the streamer's window of chunk tiles (2 m a
    // pixel, 1,280 m across, the island drawn into it from this same map).
    const win = Math.abs(px) + view > HALF || Math.abs(pz) + view > HALF ? this.g.streamer?.minimap(this.mmTint) : null;
    if (win) c.drawImage(win.canvas, (px - view - win.x0) / 2, (pz - view - win.z0) / 2, view, view, 0, 0, S, S);
    else { const src = this.mmTint, k = src.width / (HALF * 2); c.drawImage(src, (px + HALF) * k - view * k, (pz + HALF) * k - view * k, view * 2 * k, view * 2 * k, 0, 0, S, S); }
    c.drawImage(this.mmMesh, 0, 0);
    // GPS route: dashed amber, a ring at the end
    const r = this.g.qol?.route;
    if (r && r.length > 1) {
      c.strokeStyle = '#f39a2a'; c.lineWidth = 2.6; c.lineJoin = 'round'; c.lineCap = 'round'; c.setLineDash(DASH);
      c.beginPath();
      for (let i = 0; i < r.length; i++) { const x = R + (r[i].x - px) * scale, y = R + (r[i].z - pz) * scale; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke(); c.setLineDash(SOLID);
      const e = r[r.length - 1];
      c.lineWidth = 2; c.beginPath(); c.arc(R + (e.x - px) * scale, R + (e.z - pz) * scale, 5, 0, 6.3); c.stroke();
    }
    for (const ch of this.g.chars) {
      if (!ch.alive || ch === this.g.player || ch.inVehicle) continue;
      if (Math.abs(ch.x - px) > view || Math.abs(ch.z - pz) > view) continue;
      if (ch.npc) this.blip(ch.x - px, ch.z - pz, scale, '#f5c542', 3.8);
      else if (ch.faction === 'raider') this.blip(ch.x - px, ch.z - pz, scale, '#ff4a3a', 2.6);
      else if (ch.faction === 'warden') this.blip(ch.x - px, ch.z - pz, scale, '#9fd86a', 2.4);
    }
    // A witness running home to tell it: a pulsing red ring, held at the rim when they're off the map (systems/witnesses.js).
    const run = this.g.witnesses?.runners;
    if (run?.length) {
      const pulse = 4.5 + 2 * Math.sin(this.g.time * 9), m = R - 12;
      c.strokeStyle = '#ff4a3a'; c.lineWidth = 2.2;
      for (const ch of run) {
        if (!ch.runner || !ch.alive) continue;
        const bx = (ch.x - px) * scale, bz = (ch.z - pz) * scale, d = Math.hypot(bx, bz), k = d > m ? m / d : 1;
        c.beginPath(); c.arc(R + bx * k, R + bz * k, pulse, 0, 6.3); c.stroke();
        c.fillStyle = '#ff4a3a'; c.beginPath(); c.arc(R + bx * k, R + bz * k, 2.2, 0, 6.3); c.fill();
      }
    }
    for (const v of this.g.vehicles) if (!v.dead && v !== this.g.player.inVehicle) this.blip(v.x - px, v.z - pz, scale, v.driver?.faction === 'raider' ? '#ff4a3a' : '#e8e2d4', 2.8);
    c.fillStyle = '#ff4a3a'; c.font = 'bold 12px "Barlow Condensed"'; c.textAlign = 'center';
    for (const camp of this.g.world.spawns.camps) {
      const bx = (camp.x - px) * scale, bz = (camp.z - pz) * scale, d = Math.hypot(bx, bz), m = R - 12;
      c.fillText('✕', R + (d > m ? (bx / d) * m : bx), R + (d > m ? (bz / d) * m : bz) + 4);
    }
    // you
    c.save();
    c.translate(R, R);
    c.rotate(-heading + Math.PI);
    c.fillStyle = '#f5a623'; c.strokeStyle = '#1b1410'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -10); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  blip(dx, dz, scale, col, r) {
    const R = 100, bx = R + dx * scale, bz = R + dz * scale;
    if ((bx - R) ** 2 + (bz - R) ** 2 > (R - 16) ** 2) return;
    const c = this.mmCtx;
    c.fillStyle = col; c.beginPath(); c.arc(bx, bz, r, 0, 6.3); c.fill();
  }

  // What the plates say, for agents (the screenshot command only sees the 3D world).
  view() {
    const g = this.g, p = g.player, v = p.inVehicle, F = g.society?.factions;
    return {
      clock: g.sky.clock, weather: `${g.sky.label} - ${g.sky.phase}`, wanted: g.wanted, cash: g.cash,
      location: this.el.loc.textContent, region: this.el.locSub.textContent,
      health: Math.ceil(Math.max(0, p.hp)), healthSegments: this.s.hp, staminaSegments: this.s.stam,
      needs: g.needs ? { food: +(g.needs.food ?? 1).toFixed(2), water: +(g.needs.water ?? 1).toFixed(2) } : null,
      flag: this.s.flag,
      respect: this.chips.map((c) => ({ id: c.id, name: c.name, standing: Math.round(F?.standing[c.i] ?? 0), reading: Math.round(F?.reading(c.i) ?? 0), tier: F?.tiers[c.i] })),
      // The role tapes as drawn in the DOM (what the world calls you).
      roles: [...this.el.roles.children].map((t) => ({ id: t.dataset.role, text: t.querySelector('b')?.textContent, chevrons: t.querySelectorAll('.rank i').length })),
      weapon: v ? null : { name: this.el.wname.textContent, mag: this.el.wmag.textContent, reserve: this.el.wres.textContent.replace('/ ', ''), cartridges: this.carts.length, loaded: this.s.cartsLit, cond: this.s.wcond, state: this.s.wstate, slots: this.lastWeapons, throwable: { kind: g.inv.throwable, count: g.inv.throwables[g.inv.throwable] ?? 0 } },
      dash: v ? { vehicle: v.name, mph: +this.el.sNum.textContent, dialMax: this.s.dialMax, hullSegments: this.s.hull, fuelSegments: this.s.fuel } : null,
    };
  }

  stats(info) {
    this.el.stats.textContent = info;
  }
}
