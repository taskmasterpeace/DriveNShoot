// The shard's faces on the page: the LOG IN button on the title, the login modal (username and password, create an
// account, pick or make a character), the name plates over other players (their real flag first), and the roster
// plate (who is in the waste, LOG OUT). Stamped steel, typed paper and the gold button, as the HUD does it. No purple.
import * as THREE from 'three';
import { paintClothFlag } from '../ui/hudart.js';
import { FLAGS, drawFlag } from '../ui/portrait.js';
import { FLAG_CODES, LIMITS } from './protocol.js';

const _v = new THREE.Vector3();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WEAPON_WORD = { pistol: 'REVOLVER', smg: 'SMG', shotgun: 'SHOTGUN', rifle: 'SERVICE RIFLE' };

const CSS = `
.sh-modal { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: radial-gradient(ellipse at 50% 35%, oklch(0.24 0.05 50 / 0.72), oklch(0.08 0.01 50 / 0.94) 72%); pointer-events: auto; font-family: var(--body); }
.sh-panel { position: relative; width: min(560px, calc(100vw - 32px)); padding: 26px 30px 24px; color: var(--bone);
  background: radial-gradient(circle at 14px 14px, oklch(0.55 0.02 70) 0 4px, transparent 5px), radial-gradient(circle at calc(100% - 14px) 14px, oklch(0.55 0.02 70) 0 4px, transparent 5px),
    radial-gradient(circle at 14px calc(100% - 14px), oklch(0.55 0.02 70) 0 4px, transparent 5px), radial-gradient(circle at calc(100% - 14px) calc(100% - 14px), oklch(0.55 0.02 70) 0 4px, transparent 5px),
    repeating-linear-gradient(97deg, oklch(1 0 0 / 0.025) 0 1px, transparent 1px 7px), linear-gradient(168deg, var(--steel-hi), var(--steel-lo) 70%);
  clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px);
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.12), inset 0 -3px 0 oklch(0 0 0 / 0.4); }
.sh-panel.wide { width: min(760px, calc(100vw - 32px)); }
.sh-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; border-bottom: 2px solid oklch(0.12 0.01 60 / 0.8); box-shadow: 0 1px 0 oklch(1 0 0 / 0.08); padding-bottom: 10px; margin-bottom: 18px; }
.sh-head h2 { margin: 0; font: 900 38px var(--stencil); letter-spacing: 0.04em; color: var(--gold); text-shadow: 2px 3px 0 rgba(0,0,0,0.7); line-height: 1; }
.sh-shard { font: 700 14px var(--display); letter-spacing: 0.16em; color: var(--sand); white-space: nowrap; }
.sh-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; background: var(--muted); box-shadow: 0 0 0 2px oklch(0 0 0 / 0.5); vertical-align: 1px; }
.sh-dot.on { background: var(--green); box-shadow: 0 0 8px var(--green), 0 0 0 2px oklch(0 0 0 / 0.5); }
.sh-dot.off { background: var(--blood); }
.sh-field { display: block; margin-bottom: 14px; }
.sh-field span { display: block; font: 700 13px var(--display); letter-spacing: 0.2em; color: var(--sand); margin-bottom: 5px; }
.sh-field input { box-sizing: border-box; width: 100%; font: 400 22px var(--type); color: oklch(0.2 0.015 60); padding: 9px 12px 7px; border: 0; border-left: 5px solid var(--rust); border-radius: 2px; outline: none;
  background: var(--speckle, none), linear-gradient(175deg, oklch(0.93 0.03 86), oklch(0.83 0.045 80)); box-shadow: inset 0 2px 3px oklch(0 0 0 / 0.25), 2px 3px 0 rgba(0,0,0,0.5); transition: border-color 0.2s, box-shadow 0.2s; }
.sh-field input:focus { border-left-color: var(--gold); box-shadow: inset 0 2px 3px oklch(0 0 0 / 0.25), 2px 3px 0 rgba(0,0,0,0.5), 0 0 0 2px oklch(0.8 0.16 75 / 0.55); }
.sh-row { display: flex; gap: 12px; align-items: center; margin-top: 18px; flex-wrap: wrap; }
.sh-btn { all: unset; cursor: pointer; font: 800 19px var(--display); letter-spacing: 0.14em; padding: 10px 26px; border-radius: 3px; text-align: center; transition: transform 0.2s, box-shadow 0.2s, filter 0.2s; }
.sh-btn.gold { background: linear-gradient(oklch(0.86 0.14 85), oklch(0.72 0.15 72)); color: var(--ink); box-shadow: inset 0 1px 0 oklch(0.95 0.08 90 / 0.8), inset 0 -2px 0 oklch(0.5 0.1 65), 4px 5px 0 rgba(0,0,0,0.55); }
.sh-btn.steel { background: linear-gradient(oklch(0.42 0.012 70), oklch(0.28 0.01 70)); color: var(--bone); box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.16), inset 0 -2px 0 oklch(0 0 0 / 0.4), 4px 5px 0 rgba(0,0,0,0.55); }
.sh-btn:hover { transform: translateY(-2px); filter: brightness(1.08); }
.sh-btn:disabled, .sh-btn[aria-disabled="true"] { opacity: 0.5; pointer-events: none; }
.sh-link { all: unset; cursor: pointer; font: 600 14px var(--display); letter-spacing: 0.14em; color: var(--muted); margin-left: auto; transition: color 0.2s; }
.sh-link:hover { color: var(--gold); }
.sh-msg { min-height: 22px; margin-top: 14px; font: 400 15px var(--type); color: var(--sand); }
.sh-msg.bad { color: oklch(0.72 0.17 30); }
.sh-note { font: 400 13px var(--body); color: var(--muted); margin-top: 10px; line-height: 1.45; }
.sh-chars { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
.sh-card { all: unset; cursor: pointer; position: relative; height: 150px; border-radius: 4px; overflow: hidden; background: oklch(0.18 0.012 60); box-shadow: 3px 4px 0 rgba(0,0,0,0.6), inset 0 0 0 1px oklch(0.38 0.03 60 / 0.7); transition: transform 0.2s, box-shadow 0.2s; }
.sh-card:hover, .sh-card:focus-visible { transform: translateY(-3px); box-shadow: 4px 7px 0 rgba(0,0,0,0.55), inset 0 0 0 2px var(--gold); }
.sh-card canvas.bg { position: absolute; inset: -6px; width: calc(100% + 12px); height: calc(100% + 12px); filter: saturate(0.85) brightness(0.62); }
.sh-card .shade { position: absolute; inset: 0; background: linear-gradient(180deg, oklch(0.1 0.01 60 / 0.05), oklch(0.1 0.01 60 / 0.88) 78%); }
.sh-card .who { position: absolute; left: 14px; right: 14px; bottom: 12px; }
.sh-card .nm { font: 800 30px var(--display); letter-spacing: 0.02em; color: var(--bone); text-shadow: 2px 2px 0 rgba(0,0,0,0.8); line-height: 1; text-transform: uppercase; }
.sh-card .meta { font: 400 13px var(--type); color: var(--sand); margin-top: 4px; text-shadow: 1px 1px 0 rgba(0,0,0,0.8); }
.sh-card.new { display: grid; place-items: center; background: repeating-linear-gradient(135deg, oklch(0.22 0.012 60) 0 10px, oklch(0.19 0.012 60) 10px 20px); }
.sh-card.new b { font: 800 22px var(--display); letter-spacing: 0.14em; color: var(--gold); }
.sh-card.new b::before { content: '+'; display: block; text-align: center; font-size: 46px; line-height: 1; margin-bottom: 4px; }
.sh-flags { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin: 4px 0 6px; }
.sh-flag { all: unset; cursor: pointer; border-radius: 3px; padding: 3px; display: grid; place-items: center; transition: transform 0.2s, box-shadow 0.2s; }
.sh-flag:hover { transform: translateY(-2px); }
.sh-flag:focus { outline: none; }
.sh-flag.on { box-shadow: 0 0 0 2px var(--gold), 0 0 12px oklch(0.8 0.16 75 / 0.5); }
.sh-flag canvas { width: 66px; height: 44px; display: block; }
.sh-flagname { font: 700 14px var(--display); letter-spacing: 0.16em; color: var(--gold); min-height: 18px; }
.sh-preview { display: flex; gap: 16px; align-items: center; }
.sh-preview canvas { width: 132px; height: 86px; }
.title .sh-open { margin: 0 auto 14px; display: block; width: max-content; }
.title .play.sh-offline { background: linear-gradient(oklch(0.42 0.012 70), oklch(0.28 0.01 70)); color: var(--bone); font-size: 16px; padding: 9px 30px; box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.16), inset 0 -2px 0 oklch(0 0 0 / 0.4), 4px 5px 0 rgba(0,0,0,0.55); }
.title .sh-status { font: 600 13px var(--display); letter-spacing: 0.2em; color: var(--sand); margin: -8px 0 18px; }
.sh-tags { position: fixed; inset: 0; pointer-events: none; z-index: 4; }
.sh-tag { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 7px; padding: 3px 10px 3px 4px; border-radius: 3px; white-space: nowrap; will-change: transform;
  background: linear-gradient(oklch(0.24 0.012 60 / 0.92), oklch(0.16 0.01 60 / 0.92)); box-shadow: 2px 3px 0 rgba(0,0,0,0.55), inset 0 0 0 1px oklch(0.8 0.16 75 / 0.55); }
.sh-tag canvas { width: 46px; height: 30px; display: block; }
.sh-tag .nm { font: 800 18px var(--display); letter-spacing: 0.04em; color: var(--bone); line-height: 1; text-transform: uppercase; }
.sh-tag .ln { font: 600 11px var(--display); letter-spacing: 0.16em; color: var(--gold); line-height: 1.2; }
.sh-tag.down .ln { color: oklch(0.7 0.17 30); }
.sh-roster { position: fixed; left: 50%; top: 50px; transform: translateX(-50%); z-index: 5; pointer-events: auto; display: flex; align-items: center; gap: 10px; padding: 5px 8px 5px 12px; border-radius: 3px;
  background: linear-gradient(oklch(0.27 0.01 70 / 0.94), oklch(0.18 0.01 70 / 0.94)); box-shadow: 2px 3px 0 rgba(0,0,0,0.55), inset 0 1px 0 oklch(1 0 0 / 0.1); font: 700 13px var(--display); letter-spacing: 0.14em; color: var(--sand); }
.sh-roster .p { display: flex; align-items: center; gap: 5px; color: var(--bone); }
.sh-roster .p canvas { width: 24px; height: 16px; box-shadow: 0 0 0 1px oklch(0 0 0 / 0.6); }
.sh-roster .out { all: unset; cursor: pointer; padding: 3px 9px; border-radius: 2px; color: var(--muted); transition: color 0.2s, background 0.2s; }
.sh-roster .out:hover { color: var(--bone); background: oklch(0.55 0.21 27 / 0.6); }
.sh-roster.lost { box-shadow: 2px 3px 0 rgba(0,0,0,0.55), inset 0 0 0 1px var(--blood); }
`;

export class ShardUI {
  constructor(g, shard) {
    this.g = g; this.s = shard;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const ui = document.getElementById('ui');
    this.tagLayer = document.createElement('div'); this.tagLayer.className = 'sh-tags'; ui.appendChild(this.tagLayer);
    this.tags = new Map(); // remote char id -> { el, key }
    this.roster = null;
    this.flagCache = new Map();
    // Swallow the game's keys while typing in a box (the title reads Y for weather even while it is up).
    this.stopKeys = (e) => e.stopPropagation();
    const params = new URLSearchParams(location.search);
    const agent = params.has('agent') || params.has('autostart');
    if (!agent || params.has('shard')) this.probe(); // an agent's page stays exactly the offline game unless it asks
  }

  // Big flags are woven cloth (the HUD's patch); small ones are the plain flag drawn sharp (cloth frays to mush at 24 px).
  flag(code, w, h) {
    const k = `${code}:${w}x${h}`, c = FLAGS[code] ? code : 'US';
    if (!this.flagCache.has(k)) this.flagCache.set(k, w >= 40 ? paintClothFlag(c, w, h) : drawFlag(c, w * 2, h * 2));
    return this.flagCache.get(k);
  }
  flagCanvas(code, w, h, cls = '') { const src = this.flag(code, w, h), c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); if (cls) c.className = cls; return c; }

  // ---- the title: is there a shard to log in to? --------------------------------------------------------------------
  async probe() {
    const http = this.s.url.replace(/^ws/, 'http').replace(/\/shard.*$/, '/health');
    let h = null;
    try { h = await fetch(http, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); } catch {}
    if (h?.shard) this.s.shardName ??= h.shard;
    this.titleButton(h);
  }

  titleButton(h) {
    const inner = document.querySelector('.title .title-inner');
    if (!inner || inner.querySelector('.sh-open')) return;
    if (!h?.ok) return; // no shard: the title is the offline title, untouched
    const play = inner.querySelector('.play');
    const status = document.createElement('div');
    status.className = 'sh-status';
    status.innerHTML = `<span class="sh-dot on"></span>SHARD ${esc(h.shard)} · ${h.online} IN THE WASTE`;
    const b = document.createElement('button');
    b.className = 'sh-btn gold sh-open'; b.textContent = 'LOG IN'; // never class "play": that one is the offline start
    b.onclick = () => this.open();
    play.before(status, b);
    play.textContent = 'PLAY OFFLINE';
    play.classList.add('sh-offline');
  }

  // ---- the modal ----------------------------------------------------------------------------------------------------
  open(step = 'login') {
    this.close();
    const m = this.modal = document.createElement('div');
    m.className = 'sh-modal';
    m.addEventListener('keydown', this.stopKeys); m.addEventListener('keyup', this.stopKeys);
    document.getElementById('ui').appendChild(m);
    if (step === 'chars') this.renderChars(); else this.renderLogin();
    // Say hello now, so the plate shows which shard and whether it answers before anybody types.
    this.s.connect().then(() => { const d = this.modal?.querySelector('.sh-head .sh-shard'); if (d) d.innerHTML = `<span class="sh-dot on"></span>${esc(this.s.shardName ?? 'THE SHARD')}`; },
      () => { const d = this.modal?.querySelector('.sh-head .sh-shard'); if (d) d.innerHTML = '<span class="sh-dot off"></span>NO SHARD ANSWERING'; });
    return m;
  }
  close() { this.modal?.remove(); this.modal = null; }

  head(title) {
    const on = this.s.ws?.readyState === 1;
    return `<div class="sh-head"><h2>${title}</h2><div class="sh-shard"><span class="sh-dot ${on ? 'on' : ''}"></span>${esc(this.s.shardName ?? 'THE SHARD')}</div></div>`;
  }

  renderLogin(msg = '', bad = false) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('dl.shard.session') ?? 'null'); } catch {}
    this.modal.innerHTML = `<div class="sh-panel">${this.head('LOG IN')}
      <form class="sh-form" autocomplete="on">
        <label class="sh-field"><span>USERNAME</span><input name="user" autocomplete="username" maxlength="${LIMITS.userMax}" spellcheck="false" value="${esc(saved?.user ?? '')}"></label>
        <label class="sh-field"><span>PASSWORD</span><input name="pass" type="password" autocomplete="current-password" maxlength="${LIMITS.passMax}"></label>
        <div class="sh-row">
          <button class="sh-btn gold" type="submit">LOG IN</button>
          <button class="sh-btn steel" type="button" data-act="create">CREATE ACCOUNT</button>
          ${saved?.token ? `<button class="sh-link" type="button" data-act="resume">CONTINUE AS ${esc(saved.user).toUpperCase()}</button>` : ''}
          <button class="sh-link" type="button" data-act="offline">PLAY OFFLINE</button>
        </div>
        <div class="sh-msg ${bad ? 'bad' : ''}">${esc(msg)}</div>
        <div class="sh-note">A shard is a world that keeps going: your character, your pack, your car and your house are kept on it, and everybody else on it is out here with you.</div>
      </form></div>`;
    const f = this.modal.querySelector('form');
    const go = async (create) => {
      const user = f.user.value.trim().toLowerCase(), pass = f.pass.value;
      this.busy(true, create ? 'MAKING THE ACCOUNT...' : 'LOGGING IN...');
      try { await this.s.login(user, pass, create); this.renderChars(); } catch (e) { this.renderLogin(e.message, true); this.modal.querySelector('[name=user]').value = user; }
    };
    f.onsubmit = (e) => { e.preventDefault(); go(false); };
    f.querySelector('[data-act=create]').onclick = () => go(true);
    f.querySelector('[data-act=offline]').onclick = () => this.close();
    const r = f.querySelector('[data-act=resume]');
    if (r) r.onclick = async () => { this.busy(true, 'CONTINUING...'); try { await this.s.resume(saved.token); this.renderChars(); } catch (e) { try { localStorage.removeItem('dl.shard.session'); } catch {} this.renderLogin(e.message, true); } };
    setTimeout(() => (saved?.user ? f.pass : f.user).focus(), 30);
  }

  busy(on, text) {
    for (const b of this.modal?.querySelectorAll('button') ?? []) b.disabled = on;
    const m = this.modal?.querySelector('.sh-msg');
    if (m && text) { m.textContent = text; m.classList.remove('bad'); }
  }

  renderChars(msg = '', bad = false) {
    const chars = this.s.chars ?? [];
    this.modal.innerHTML = `<div class="sh-panel wide">${this.head('PICK YOUR CHARACTER')}
      <div class="sh-chars"></div>
      <div class="sh-row"><button class="sh-link" type="button" data-act="signout">SIGN OUT ${esc(this.s.user ?? '').toUpperCase()}</button></div>
      <div class="sh-msg ${bad ? 'bad' : ''}">${esc(msg)}</div></div>`;
    const grid = this.modal.querySelector('.sh-chars');
    for (const c of chars) {
      const b = document.createElement('button');
      b.className = 'sh-card';
      b.appendChild(this.flagCanvas(c.flag, 240, 170, 'bg'));
      b.insertAdjacentHTML('beforeend', `<div class="shade"></div><div class="who"><div class="nm">${esc(c.name)}</div><div class="meta">${esc(FLAGS[c.flag]?.name ?? c.flag)} · ${c.lastSeen ? `last seen ${esc(c.lastSeen.slice(0, 10))}` : 'never set foot out here'}${c.house ? ' · has a house' : ''}</div></div>`);
      b.onclick = () => this.enter(c.id);
      grid.appendChild(b);
    }
    if (chars.length < LIMITS.charsPerAccount) {
      const n = document.createElement('button');
      n.className = 'sh-card new'; n.innerHTML = '<b>NEW CHARACTER</b>';
      n.onclick = () => this.renderNew();
      grid.appendChild(n);
    }
    this.modal.querySelector('[data-act=signout]').onclick = async () => { await this.s.signout(); this.renderLogin('Signed out.'); };
  }

  renderNew(msg = '', bad = false, keep = {}) {
    const codes = FLAG_CODES.filter((c) => FLAGS[c]);
    let pick = keep.flag ?? 'US';
    this.modal.innerHTML = `<div class="sh-panel wide">${this.head('NEW CHARACTER')}
      <form class="sh-form">
        <label class="sh-field"><span>NAME (SHOWN OVER YOUR HEAD)</span><input name="name" maxlength="${LIMITS.nameMax}" spellcheck="false" value="${esc(keep.name ?? '')}"></label>
        <div class="sh-field"><span>WHERE YOU ARE FROM</span></div>
        <div class="sh-flags"></div>
        <div class="sh-preview"><div class="pv"></div><div class="sh-flagname"></div></div>
        <div class="sh-row"><button class="sh-btn gold" type="submit">MAKE CHARACTER</button><button class="sh-btn steel" type="button" data-act="back">BACK</button></div>
        <div class="sh-msg ${bad ? 'bad' : ''}">${esc(msg)}</div>
      </form></div>`;
    const f = this.modal.querySelector('form'), grid = f.querySelector('.sh-flags'), pv = f.querySelector('.pv'), nm = f.querySelector('.sh-flagname');
    const show = () => {
      for (const b of grid.children) b.classList.toggle('on', b.dataset.code === pick);
      pv.replaceChildren(this.flagCanvas(pick, 132, 86));
      nm.textContent = (FLAGS[pick]?.name ?? pick).toUpperCase();
    };
    for (const code of codes) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sh-flag'; b.dataset.code = code; b.title = FLAGS[code].name;
      b.appendChild(this.flagCanvas(code, 66, 44));
      b.onclick = () => { pick = code; show(); };
      grid.appendChild(b);
    }
    show();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const name = f.name.value.trim();
      this.busy(true, 'WRITING YOU INTO THE BOOK...');
      try { await this.s.newChar(name, pick); this.renderChars(`${name} is ready.`); } catch (err) { this.renderNew(err.message, true, { name, flag: pick }); }
    };
    f.querySelector('[data-act=back]').onclick = () => this.renderChars();
    setTimeout(() => f.name.focus(), 30);
  }

  async enter(id) {
    this.busy(true, 'INTO THE WASTE...');
    try { await this.s.enter(id); this.close(); } catch (e) { this.renderChars(e.message, true); }
  }

  // ---- in the world: name plates and the roster -------------------------------------------------------------------
  update() {
    const s = this.s, g = this.g, cam = g.camera, W = innerWidth, H = innerHeight, p = g.player;
    const seen = new Set();
    for (const r of s.remotes.values()) {
      const c = r.avatar;
      if (!c || !g.chars.includes(c)) continue;
      const x = c.inVehicle?.x ?? c.x, z = c.inVehicle?.z ?? c.z;
      if (Math.hypot(x - p.x, z - p.z) > 70) continue;
      seen.add(r.id);
      let t = this.tags.get(r.id);
      if (!t) {
        const el = document.createElement('div'); el.className = 'sh-tag';
        el.appendChild(this.flagCanvas(r.flag, 46, 30));
        el.insertAdjacentHTML('beforeend', '<div><div class="nm"></div><div class="ln"></div></div>');
        el.querySelector('.nm').textContent = r.name;
        this.tagLayer.appendChild(el);
        t = { el, ln: el.querySelector('.ln'), key: '' };
        this.tags.set(r.id, t);
      }
      const line = !c.alive ? 'DOWN' : c.inVehicle ? String(c.inVehicle.name ?? c.inVehicle.type).toUpperCase() : c.weapon ? WEAPON_WORD[c.weapon] ?? c.weapon.toUpperCase() : 'HANDS FREE';
      if (t.key !== line) { t.key = line; t.ln.textContent = line; t.el.classList.toggle('down', !c.alive); }
      _v.set(x, (c.seatPose?.y ?? c.gy ?? 0) + (c.inVehicle ? 2.6 : 2.35), z).project(cam);
      const on = _v.z < 1 && _v.x > -1.1 && _v.x < 1.1 && _v.y > -1.1 && _v.y < 1.1;
      t.el.style.display = on ? '' : 'none';
      if (on) t.el.style.transform = `translate(${((_v.x + 1) / 2 * W).toFixed(0)}px, ${((1 - _v.y) / 2 * H).toFixed(0)}px) translate(-50%, -100%)`;
    }
    for (const [id, t] of this.tags) if (!seen.has(id)) { t.el.remove(); this.tags.delete(id); }
    this.updateRoster();
  }

  clearTags() { for (const t of this.tags.values()) t.el.remove(); this.tags.clear(); }

  updateRoster() {
    const s = this.s;
    const key = `${s.state}|${s.char?.id}|${[...s.remotes.values()].filter((r) => r.avatar).map((r) => r.id).join(',')}`;
    if (key === this.rosterKey) return;
    this.rosterKey = key;
    if (s.state !== 'inworld' && s.state !== 'reconnecting') { this.roster?.remove(); this.roster = null; return; }
    if (!this.roster) { this.roster = document.createElement('div'); this.roster.className = 'sh-roster'; document.getElementById('ui').appendChild(this.roster); }
    const r = this.roster;
    r.classList.toggle('lost', s.state === 'reconnecting');
    r.innerHTML = `<span><span class="sh-dot ${s.state === 'inworld' ? 'on' : 'off'}"></span>${esc(s.shardName ?? 'SHARD')}</span>`;
    const people = [{ name: s.char?.name, flag: s.char?.flag }, ...[...s.remotes.values()].filter((x) => x.avatar).map((x) => ({ name: x.name, flag: x.flag }))];
    for (const pp of people) {
      const d = document.createElement('span'); d.className = 'p';
      d.appendChild(this.flagCanvas(pp.flag ?? 'US', 24, 16));
      d.appendChild(document.createTextNode(String(pp.name ?? '').toUpperCase()));
      r.appendChild(d);
    }
    const out = document.createElement('button'); out.className = 'out'; out.textContent = 'LOG OUT';
    out.onclick = async () => { out.textContent = 'SAVING...'; try { await s.leave(); } catch {} location.reload(); };
    r.appendChild(out);
  }
}
