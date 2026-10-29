import {HUD_ITEMS, readHudPrefs, setHudPref} from '../hud-prefs.js';
import {HUD_COMPONENT_BY_ID, VITALS_CHILDREN,hudSelector} from '../../data/hud-components.js';
import {HUD_ART_PACKS} from '../../data/ui-themes.js';
import {applyHudArt} from './hud-art.js';
// THE MOBILE LAYOUT EDITOR (issue #361): "move stuff around". An edit mode over the live phone HUD: drag any control
// (the move stick's area, PUNCH, POWER, GUARD, GRAB, DIVE, FLY, BOOST, the altitude rocker, the power slots, stance,
// pause, the health/energy cluster, the radar) to a new spot; resize the selected one (the SIZE slider, the corner
// handle, or a two-finger pinch); RESET, LEFT-HANDED and COMPACT presets; DONE saves it on THIS device.
// The maths is pure (data/touch-layout.js). Buttons move by the individual CSS `translate`/`scale` properties, which
// compose with the touch layer's own transforms (a pressed button's .92 scale) instead of fighting them; the two
// thumb ZONES move by their box (the stick ring inside is position:fixed — a transform on the zone would carry it off
// the thumb). While editing, a full-screen catcher takes every touch, so nothing fires.
import { HUD_CONTROLS as TOUCH_CONTROLS, CONTROL_IDS, PRESETS, SCALE_MIN, SCALE_MAX, normalizeLayout, loadLayout, saveLayout, dragControl, resizeControl, presetLayout, deviceClass, defaultLayout, constrainControl, snapControl, placedRect, exportLayout, importLayout, anchorControl, shippedLayout } from '../../data/touch-layout.js';
import { SETTINGS, saveSettings } from '../../core/settings.js';
import { POWER_SHAPES, POWER_SHAPE_WORDS, normalizePowerShape } from '../../data/power-icons-v2.js';   // "Power you're using": the same setting as Options > Interface (SETTINGS.powerShape)

// A root with no box of its own (the crosshair, the cell label: a zero-size anchor whose children are positioned
// absolutely) is measured by the union of what is inside it, so it can be selected and moved too (2026-10-17).
export function paintedRect(e) {
  const r = e.getBoundingClientRect(); if (r.width > 1 && r.height > 1) return r;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of e.querySelectorAll('*')) { const q = k.getBoundingClientRect(); if (q.width < 1 || q.height < 1) continue; x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
  return x1 > x0 ? { left: x0, top: y0, right: x1, bottom: y1, width: x1 - x0, height: y1 - y0 } : r;
}
export class TouchLayout {
  constructor(game) { this.game = game; this.layout = defaultLayout(); this.device = 'desktop'; this.snap = true; this.editing = false; this.sel = null; this.defaults = {}; this.log = []; }
  get touchRoot() { return document.getElementById('touch'); }
  get storage() { try { return globalThis.localStorage; } catch { return null; } }
  _el(c) { if(this.device==='desktop' && c.touchOnly) return null; if(this.device==='desktop' && c.root!=='hud') return c.id==='stance'?document.querySelector('#posture-hud'):null; const root = c.root === 'hud' ? document : this.touchRoot; return root?.querySelector(c.kitId&&c.root==='hud'?hudSelector(c.kitId,this.device!=='desktop')||c.sel:c.sel) || null; }

  // All six vitals pieces are editable on every device, including conditional samples.
  get controls(){return TOUCH_CONTROLS.filter(c=>c.id!=='vitals'&&(VITALS_CHILDREN.includes(c.id)||this.device==='desktop'||!HUD_COMPONENT_BY_ID[c.kitId]?.anchors.phone_landscape.hidden));}
  safeArea(){const e=document.createElement('div');e.style.cssText='position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';document.body.append(e);const s=getComputedStyle(e);this.safe={top:Math.max(4,parseFloat(s.paddingTop)||0),right:Math.max(4,parseFloat(s.paddingRight)||0),bottom:Math.max(4,parseFloat(s.paddingBottom)||0),left:Math.max(4,parseFloat(s.paddingLeft)||0)};e.remove();}
  constrain(id,v){const c=this.controls.find(c=>c.id===id),kit=HUD_COMPONENT_BY_ID[c?.kitId],d=this.defaults[id];if(!d)return v;
   // an anchored piece (data/touch-layout.js anchorControl) is re-resolved for THIS window, and keeps its anchor
   if(v?.a){const a=anchorControl(d,v,innerWidth,innerHeight),k=this._constrain(c,kit,d,a);return {...k,a:a.a,mx:a.mx,my:a.my};}
   return this._constrain(c,kit,d,v);
  }
  _constrain(c,kit,d,v){
   return constrainControl(d,v,innerWidth,innerHeight,{min:c?.kitId==='touch_action_arc'?[0,0]:kit?.size.min_px||[0,0],touch:this.device!=='desktop',tappable:c?.root!=='hud',safe:this.safe});
  }
  /** Load this device's saved layout and apply it (boot, a rotation, a phone/tablet switch). */
  load() {
    this.safeArea();this.device = deviceClass({ tablet: document.body.classList.contains('tablet'), desktop: !document.body.classList.contains('is-touch') });
    this.layout = loadLayout(this.storage, this.device, {rects:this.measure(),width:innerWidth,height:innerHeight}); this.apply(); this._stateSig = this._stateSignature(); return this.layout;
  }
  /** Measure every control's DEFAULT rect (all overrides removed for one synchronous read). */
  measure() {
    const out = {};
    for (const c of [TOUCH_CONTROLS.find(c=>c.id==='vitals'),...this.controls]) {
      const e = this._el(c); if (!e) continue;
      const hiddenFlight=c.id==='flight_meter'&&e.hidden,oldDisplay=e.style.getPropertyValue('display'),oldPriority=e.style.getPropertyPriority('display');if(hiddenFlight){e.hidden=false;e.style.setProperty('display','flex','important');}
      const saved = { t: e.style.translate, s: e.style.scale, l: e.style.left, tp: e.style.top, w: e.style.width, h: e.style.height, b: e.style.bottom, r: e.style.right };
      e.style.translate = ''; e.style.scale = ''; if (c.kind === 'zone') { e.style.left = e.style.top = e.style.width = e.style.height = e.style.bottom = e.style.right = ''; }
      const r = paintedRect(e),cs=getComputedStyle(e),matrix=new DOMMatrixReadOnly(cs.transform==='none'?undefined:cs.transform),origin=cs.transformOrigin.split(' ').map(parseFloat);const ox=matrix.a*(e.offsetWidth/2-origin[0])+matrix.c*(e.offsetHeight/2-origin[1])+matrix.e,oy=matrix.b*(e.offsetWidth/2-origin[0])+matrix.d*(e.offsetHeight/2-origin[1])+matrix.f;
      if (r.width > 1 && r.height > 1) out[c.id] = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, coordinateScale:VITALS_CHILDREN.includes(c.id)&&e.closest('.player-status')?e.closest('.player-status').getBoundingClientRect().width/e.closest('.player-status').offsetWidth:1,scaleOffsetX:ox,scaleOffsetY:oy,legacyWidth:e.offsetWidth, legacyHeight:Math.max(142,e.offsetHeight) };
      if(hiddenFlight){e.hidden=true;if(oldDisplay)e.style.setProperty('display',oldDisplay,oldPriority);else e.style.removeProperty('display');}
      Object.assign(e.style, { translate: saved.t, scale: saved.s }); if (c.kind === 'zone') Object.assign(e.style, { left: saved.l, top: saved.tp, width: saved.w, height: saved.h, bottom: saved.b, right: saved.r });
    }
    return (this.defaults = { ...this.defaults, ...out });
  }
  apply() {
    const vw = innerWidth, vh = innerHeight;
    // A saved v1/phase-1 cluster is an immutable baseline, never an editor selection.
    // Keep its transform (and non-piece name/effects) intact; child offsets are independent.
    const baseline=JSON.stringify([this.layout.controls.vitals,innerWidth,innerHeight]);
    if(this._vitalsBaseline!==baseline){
      const e=document.querySelector('.player-status'),v=this.layout.controls.vitals,d=this.defaults.vitals;
      if(e){e.style.translate=v?`${v.dx*vw+(1-v.s)*(d?.scaleOffsetX||0)}px ${v.dy*vh+(1-v.s)*(d?.scaleOffsetY||0)}px`:'';e.style.scale=v&&v.s!==1?String(v.s):'';}
      this._vitalsBaseline=baseline;this.measure();
    }
    applyHudArt(this.game.uiLanguage?.theme,this.layout.themes);
    for (const c of this.controls) {
      const e = this._el(c); if (!e) continue; let v = this.layout.controls[c.id]; if(v&&this.defaults[c.id])v=this.layout.controls[c.id]=this.constrain(c.id,v);
      if (c.kind === 'zone') {
        if (!v) { e.style.left = e.style.top = e.style.width = e.style.height = e.style.bottom = e.style.right = ''; continue; }
        const d = this.defaults[c.id] || this.measure()[c.id]; if (!d) continue;
        const w = (d.right - d.left) * v.s, h = (d.bottom - d.top) * v.s, cx = (d.left + d.right) / 2 + v.dx * vw, cy = (d.top + d.bottom) / 2 + v.dy * vh;
        Object.assign(e.style, { left: `${(cx - w / 2).toFixed(1)}px`, top: `${(cy - h / 2).toFixed(1)}px`, width: `${w.toFixed(1)}px`, height: `${h.toFixed(1)}px`, bottom: 'auto', right: 'auto' });
      } else {
        const d=this.defaults[c.id],comp=v&&d?{x:(1-v.s)*(d.scaleOffsetX||0),y:(1-v.s)*(d.scaleOffsetY||0)}:{x:0,y:0};
        e.style.translate = v ? `${(v.dx * vw/(d?.coordinateScale||1)+comp.x).toFixed(1)}px ${(v.dy * vh/(d?.coordinateScale||1)+comp.y).toFixed(1)}px` : '';
        e.style.scale = v && v.s !== 1 ? String(v.s) : '';
      }
    }
  }

  /** A piece the layout moves that was not on screen when the layout loaded (the grenade belt shows only while G is
   *  held) has no measured default, so it could not be placed. ~10 Hz from the HUD tick: the moment it has a box,
   *  measure and place it. Costs one loop over the saved entries while nothing is pending. (2026-10-17) */
  _stateSignature() { return this.controls.filter(c => c.state).map(c => this._el(c) ? 1 : 0).join(''); }
  catchUp() {
    if (this.editing) return false;
    // a STATEFUL piece (data/touch-layout.js state:true: the injury badge vs its F4 list share one root) re-applies when
    // which selector matches flips, so the open list does not keep the badge's spot
    const sig = this._stateSignature();
    if (sig !== this._stateSig) { this._stateSig = sig; this.measure(); this.apply(); return true; }
    const pend = this.controls.filter(c => this.layout.controls[c.id] && !this.defaults[c.id]);
    if (!pend.length) return false;
    if (!pend.some(c => { const e = this._el(c); return e && paintedRect(e).width > 1; })) return false;
    this.measure(); this.apply(); return true;
  }

    // ---------------------------------------------------------------------------------------------- edit mode
  edit() {
    if (this.editing || this.game.running) return false; this.editing = true; this._prefs = readHudPrefs(); this._before=exportLayout(this.layout); this._themeBefore=this.game.uiLanguage.theme;
    const g = this.game, t = this.touchRoot;
    this._wasRunning = g.running; this._overlay = g.combatOverlayOpen;
    g.retireCombatViewInput?.(g.player); g.running = false; g.combatOverlayOpen = true;
    this._shapeBefore=SETTINGS.powerShape;this.safeArea();t?.classList.add('touch-layout-edit'); document.body.classList.add('hud-editing'); this.game.hud?.setPaused(false);
    this._samples=[];this._sampleRecords=[];
    const entries=this.controls;
    for(const c of entries){const e=this._el(c);if(!e)continue;const cs=getComputedStyle(e),box=e.getBoundingClientRect();
      if(e.hidden||cs.display==='none'||box.width<1||box.height<1){
       const record={e,hidden:e.hidden,style:e.style.cssText,parent:e.parentNode,next:e.nextSibling};this._sampleRecords.push(record);this._samples.push(e);e.hidden=false;e.dataset.hudSample='true';
       e.style.setProperty('display',c.id==='vitals'?'grid':c.id==='flight_meter'?'flex':'block','important');e.style.setProperty('visibility','visible','important');
       let r=e.getBoundingClientRect();const kit=HUD_COMPONENT_BY_ID[c.kitId];
       if((r.width<1||r.height<1||r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight)&&kit){
        // Conditional roots whose usual parent is hidden get a temporary editor preview at the kit anchor.
        // The original node, parent, sibling and complete inline style are restored on close.
        document.getElementById('hud').append(e);const a=kit.anchors[this.device==='desktop'?'desktop':'phone_landscape'].rect_pct;
        const w=Math.min(innerWidth-8,Math.max(kit.size.min_px[0],innerWidth*a.w/100)),h=Math.min(innerHeight-8,Math.max(kit.size.min_px[1],innerHeight*a.h/100));
        Object.assign(e.style,{position:'fixed',left:Math.max(4,Math.min(innerWidth-w-4,innerWidth*a.x/100))+'px',top:Math.max(4,Math.min(innerHeight-h-4,innerHeight*a.y/100))+'px',right:'auto',bottom:'auto',width:w+'px',height:h+'px',maxWidth:'none',maxHeight:'none',transform:'none'});
       }
      }
    }
    const flight=document.querySelector('.ps-flight'); if(flight){for(const b of flight.querySelectorAll('.ps-speed b,.ps-alt b')){b.dataset.hudOld=b.textContent;b.textContent='120';}}
    this.measure();this.apply();
    const ui = this.ui = document.createElement('div'); ui.id = 'ui-layout'; ui.className = 'on';
    ui.innerHTML = `<div class="uil-shade"></div><div class="uil-boxes"></div><button class="uil-toggle" type="button" aria-expanded="true">Hide controls</button>
      <div class="uil-bar" role="toolbar" aria-label="Edit HUD"><strong>Edit HUD</strong><span data-selected>Choose a piece</span><select data-piece aria-label="HUD piece"></select><div class="uil-themes">${g.uiLanguage.themes.map(t=>`<button data-theme="${t.id}" aria-pressed="${t.id===g.uiLanguage.theme}">${t.name}</button>`).join('')}</div><label><input type="checkbox" data-piece-visible disabled> Show panel</label><label>Theme for this piece <select data-piece-theme></select></label><label><input type="checkbox" data-snap checked> Snap</label><button data-reset-piece>Reset piece</button><button data-reset-all>Reset all</button><button data-export>Export</button><button data-import>Import</button><input type="file" data-file accept="application/json,.json" hidden><button data-cancel>Cancel</button><span data-error role="status"></span><span class="uil-sub">Drag · pinch or SIZE · saved on this ${this.device}</span>
        <label class="uil-size">Size <input type="range" min="${SCALE_MIN}" max="${SCALE_MAX}" step="0.02" value="1" aria-label="Size of the selected control"></label>
        <span class="uil-shape" role="group" aria-label="Power you're using"><em>Power you're using</em>${POWER_SHAPES.map(v => `<button type="button" data-shape="${v}" aria-pressed="${normalizePowerShape(SETTINGS.powerShape) === v}" title="${POWER_SHAPE_WORDS[v]}">${v}</button>`).join('')}</span>
        ${Object.entries(PRESETS).filter(([k])=>this.device!=='desktop'||k!=='left').map(([k, p]) => `<button type="button" data-preset="${k}" aria-pressed="false">${p.label}</button>`).join('')}
        <button type="button" class="primary" data-done>Done</button></div>
      `;
    document.body.appendChild(ui);
    ui.querySelector('.uil-toggle').onclick=e=>{const hidden=ui.classList.toggle('controls-hidden');e.target.textContent=hidden?'Show controls':'Hide controls';e.target.setAttribute('aria-expanded',String(!hidden));};
    this.boxes = ui.querySelector('.uil-boxes'); this.size = ui.querySelector('.uil-size input');
    ui.querySelector('[data-done]').onclick = () => this.done();
    for (const b of ui.querySelectorAll('[data-preset]')) b.onclick = () => this.preset(b.dataset.preset);
    for (const b of ui.querySelectorAll('[data-shape]')) b.onclick = () => this.setShape(b.dataset.shape);
    this.size.oninput = () => { if (!this.sel) return; const d = this.defaults[this.sel]; if (!d) return; this.layout.controls[this.sel] = resizeControl(d, this.layout.controls[this.sel], +this.size.value, innerWidth, innerHeight); this.layout.preset = 'custom'; this.apply(); this.drawBoxes(); };
    this.pieceSelect=ui.querySelector('[data-piece]');
    const pieces=this.controls.filter(c=>this.defaults[c.id]).map(c=>({id:c.id,label:c.label}));
    this.pieceSelect.innerHTML='<option value="">Choose a piece</option>'+pieces.map(c=>`<option value="${c.id}">${c.label}</option>`).join('');this.pieceSelect.onchange=()=>{const id=this.pieceSelect.value;this.select(id);};
    this.visibleSwitch=ui.querySelector('[data-piece-visible]');
    this.visibleSwitch.onchange=()=>{this._prefs[this.themeKey()]=this.visibleSwitch.checked;};
    this.themeSelect=ui.querySelector('[data-piece-theme]');
    this.themeSelect.onchange=()=>{if(!this.sel)return;const id=this.themeKey();if(this.themeSelect.value)this.layout.themes[id]=this.themeSelect.value;else delete this.layout.themes[id];this.apply();};
    for(const b of ui.querySelectorAll('[data-theme]'))b.onclick=()=>{g.uiLanguage.setTheme(b.dataset.theme,{announce:false});this.measure();this.apply();this.drawBoxes();for(const chip of ui.querySelectorAll('[data-theme]'))chip.setAttribute('aria-pressed',String(chip===b));};
    ui.querySelector('[data-snap]').onchange=e=>this.snap=e.target.checked;
    ui.querySelector('[data-reset-all]').onclick=()=>{this._prefs={};this.preset('default');};
    ui.querySelector('[data-reset-piece]').onclick=()=>{if(!this.sel)return;delete this._prefs[this.themeKey()];delete this.layout.controls[this.sel];delete this.layout.themes[this.themeKey()];this.apply();this.select(this.sel,this.themeTarget);};
    ui.querySelector('[data-cancel]').onclick=()=>this.done(false);
    ui.querySelector('[data-export]').onclick=()=>{const url=URL.createObjectURL(new Blob([exportLayout(this.layout)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`hud-layout-${this.device}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    const file=ui.querySelector('[data-file]');ui.querySelector('[data-import]').onclick=()=>file.click();file.onchange=async()=>{try{this.layout=importLayout(await file.files[0].text(),this.device);this.apply();this.drawBoxes();}catch(e){ui.querySelector('[data-error]').textContent=e.message;}file.value='';};
    this._keys=e=>{if(!this.editing)return;if(e.target.matches('input,select'))return;
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.done(false);return;}
      if(e.key==='Tab'){e.preventDefault();const ids=this.controls.filter(c=>this.defaults[c.id]).map(c=>c.id),i=ids.indexOf(this.sel);this.select(ids[(i+(e.shiftKey?-1:1)+ids.length)%ids.length]);}
      if(e.key.startsWith('Arrow')&&this.sel){e.preventDefault();const n=e.shiftKey?10:1;this.nudge(this.sel,e.key==='ArrowLeft'?-n:e.key==='ArrowRight'?n:0,e.key==='ArrowUp'?-n:e.key==='ArrowDown'?n:0);}
      e.stopPropagation();};document.addEventListener('keydown',this._keys,true);
    ui.addEventListener('wheel',e=>{if(!this.sel||e.target.closest('.uil-bar'))return;e.preventDefault();this.size.value=String((this.layout.controls[this.sel]?.s||1)+(e.deltaY<0?.05:-.05));this.size.oninput();},{passive:false});
    this._bind(ui);
    this.drawBoxes(); this._syncPresetButtons();
    this.log.push({ edit: this.device }); return true;
  }
  drawBoxes() {
    if (!this.boxes) return;
    const vw = innerWidth, vh = innerHeight;
    this.boxes.innerHTML = '';
    for (const c of this.controls) {
      const d = this.defaults[c.id]; if (!d) continue; const v = this.layout.controls[c.id] || { dx: 0, dy: 0, s: 1 };
      const s = v.s ?? 1, cx = (d.left + d.right) / 2 + v.dx * vw, cy = (d.top + d.bottom) / 2 + v.dy * vh, w = (d.right - d.left) * s, h = (d.bottom - d.top) * s;
      const b = document.createElement('div'); b.className = 'uil-box' + (c.kind === 'zone' ? ' zone' : '') + (this.sel === c.id ? ' sel' : ''); b.dataset.ctl = c.id;
      Object.assign(b.style, { left: `${cx - w / 2}px`, top: `${cy - h / 2}px`, width: `${w}px`, height: `${h}px` });
      if (cy - h / 2 < 26) b.classList.add('lab-in');   // a control at the top edge keeps its label inside the box
      const covers=this.controls.filter(o=>o.id!==c.id&&o.kind!=='zone'&&c.kind!=='zone'&&this.defaults[o.id]).filter(o=>{const a=this._el(c),b=this._el(o);if(a&&b&&(a.contains(b)||b.contains(a)))return false;const r=placedRect(this.defaults[o.id],this.layout.controls[o.id],vw,vh);return cx-w/2<r.right&&cx+w/2>r.left&&cy-h/2<r.bottom&&cy+h/2>r.top;});
      b.classList.toggle('overlap',!!covers.length);
      b.innerHTML = `<b>${c.label}${covers.length?` · Covers: ${covers.map(o=>o.label).join(', ')}`:''}</b><i class="uil-h"></i>`; this.boxes.appendChild(b);
    }
  }
  /** Which control is under a point (the smallest box wins, so a button inside a zone is picked over the zone). */
  hit(x, y) {
    const vw = innerWidth, vh = innerHeight; let best = null, area = Infinity;
    for (const c of this.controls) {
      const d = this.defaults[c.id]; if (!d) continue; const v = this.layout.controls[c.id] || { dx: 0, dy: 0, s: 1 };
      const s = v.s ?? 1, cx = (d.left + d.right) / 2 + v.dx * vw, cy = (d.top + d.bottom) / 2 + v.dy * vh, w = (d.right - d.left) * s, h = (d.bottom - d.top) * s;
      if (Math.abs(x - cx) <= w / 2 + 6 && Math.abs(y - cy) <= h / 2 + 6 && w * h < area) { best = c.id; area = w * h; }
    }
    return best;
  }
  themeKey(){const c=this.controls.find(c=>c.id===this.sel);return VITALS_CHILDREN.includes(this.themeTarget)?this.themeTarget:c?.kitId==='touch_action_arc'?this.sel:c?.kitId||this.sel;}
  select(id,themeTarget) { this.sel = id; this.themeTarget=themeTarget; if(this.pieceSelect)this.pieceSelect.value=themeTarget||id||'';
    const c=this.controls.find(c=>c.id===id);if(this.ui)this.ui.querySelector('[data-selected]').textContent=c?.label||'Choose a piece';
    if(this.themeSelect){const kit=VITALS_CHILDREN.includes(themeTarget)?themeTarget:c?.kitId||id;this.themeSelect.innerHTML='<option value="">Same as HUD</option><option value="standard">Plain</option>'+this.game.uiLanguage.themes.filter(t=>HUD_ART_PACKS[t.id]?.components[kit]).map(t=>`<option value="${t.id}">${t.name}</option>`).join('');this.themeSelect.value=this.layout.themes[this.themeKey()]||'';this.themeSelect.disabled=kit==='vitals';this.themeSelect.title=kit==='vitals'?'Choose a part of Health & energy from the piece list.':'';}
 if(this.visibleSwitch){this.visibleSwitch.disabled=!Object.hasOwn(HUD_ITEMS,this.themeKey());this.visibleSwitch.checked=this._prefs[this.themeKey()]!==false;}
 const v = this.layout.controls[id]; if (this.size) this.size.value = String(v?.s ?? 1); this.drawBoxes(); }
  /** Move a control by pixels (the drag, and the proof's scripted touch). */
  nudge(id, px, py) { const d = this.defaults[id]; if (!d) return; this.layout.controls[id] = dragControl(d, this.layout.controls[id], px, py, innerWidth, innerHeight); this.layout.preset = 'custom'; this.apply(); this.drawBoxes(); }
  _bind(catcher) {
    const pts = new Map(); let drag = null, pinch = null;
    const corner = (id, x, y) => { const b = this.boxes.querySelector(`[data-ctl="${id}"] .uil-h`); if (!b) return false; const r = b.getBoundingClientRect(); return x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8; };
    const down = e => {
      if (e.target?.closest?.('.uil-bar,.uil-toggle')) return;   // the toolbar's own buttons and slider
      e.preventDefault(); catcher.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && this.sel) { const [a, b] = [...pts.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: this.layout.controls[this.sel]?.s ?? 1 }; drag = null; return; }
      if (this.sel && corner(this.sel, e.clientX, e.clientY)) { const d = this.defaults[this.sel], c = { x: (d.left + d.right) / 2, y: (d.top + d.bottom) / 2 }; drag = { id: this.sel, resize: true, c, r0: Math.hypot(e.clientX - c.x - (this.layout.controls[this.sel]?.dx || 0) * innerWidth, e.clientY - c.y - (this.layout.controls[this.sel]?.dy || 0) * innerHeight), s0: this.layout.controls[this.sel]?.s ?? 1 }; return; }
      const id = this.hit(e.clientX, e.clientY); if (!id) { this.select(null); return; }
      this.select(id); drag = { id, x: e.clientX, y: e.clientY, initial:{...(this.layout.controls[id]||{dx:0,dy:0,s:1})} };
    };
    const move = e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2 && this.sel) { const [a, b] = [...pts.values()], s = pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d0); this.layout.controls[this.sel] = resizeControl(this.defaults[this.sel], this.layout.controls[this.sel], s, innerWidth, innerHeight); this.layout.preset = 'custom'; this.size.value = String(this.layout.controls[this.sel].s); this.apply(); this.drawBoxes(); return; }
      if (!drag) return;
      if (drag.resize) { const v = this.layout.controls[drag.id] || { dx: 0, dy: 0 }, cx = drag.c.x + (v.dx || 0) * innerWidth, cy = drag.c.y + (v.dy || 0) * innerHeight, r = Math.hypot(e.clientX - cx, e.clientY - cy);
        this.layout.controls[drag.id] = resizeControl(this.defaults[drag.id], v, drag.s0 * r / Math.max(8, drag.r0), innerWidth, innerHeight); this.size.value = String(this.layout.controls[drag.id].s); }
      else { this.layout.controls[drag.id] = dragControl(this.defaults[drag.id], drag.initial, e.clientX - drag.x, e.clientY - drag.y, innerWidth, innerHeight); }
      if(!drag.resize&&this.snap&&!e.shiftKey){const others=Object.entries(this.defaults).filter(([id])=>id!==drag.id).map(([id,d])=>placedRect(d,this.layout.controls[id],innerWidth,innerHeight));this.layout.controls[drag.id]=snapControl(this.defaults[drag.id],this.layout.controls[drag.id],innerWidth,innerHeight,others);}
      this.layout.preset = 'custom'; this.apply(); this.drawBoxes(); this._syncPresetButtons();
    };
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size && drag) { this.log.push({ moved: drag.id, to: this.layout.controls[drag.id] }); drag = null; } };
    catcher.addEventListener('pointerdown', down); catcher.addEventListener('pointermove', move); catcher.addEventListener('pointerup', up); catcher.addEventListener('pointercancel', up);
  }
  /** "Power you're using" (1:1 / 16:9 / 9:16): saved with the other settings, shown on the selected power's button at once. */
  setShape(v) {
    SETTINGS.powerShape = normalizePowerShape(v); try { saveSettings(); } catch { /* storage blocked: this session only */ }
    for (const b of this.ui?.querySelectorAll('[data-shape]') || []) b.setAttribute('aria-pressed', String(b.dataset.shape === SETTINGS.powerShape));
    const g = this.game; g.touch?.updateAccess?.(g.player);   // the game is paused under the editor: redraw the pair now
    this.measure(); this.apply(); this.drawBoxes(); this.log.push({ shape: SETTINGS.powerShape });
  }
  preset(name) {
    // "Default" (Reset all) is the shipped layout (data/hud-default-layouts.json), not the raw CSS positions
    const fresh = name === 'default' ? shippedLayout(this.device) : presetLayout(name, this.defaults, innerWidth, innerHeight); fresh.device=this.device;
    this.layout = fresh; this.apply(); this.select(this.sel,this.themeTarget); this._syncPresetButtons(); this.log.push({ preset: name });
  }
  _syncPresetButtons() { for (const b of this.ui?.querySelectorAll('[data-preset]') || []) b.setAttribute('aria-pressed', String(this.layout.preset === b.dataset.preset && b.dataset.preset !== 'default')); }
  done(save=true) {
    if (!this.editing) return; this.editing = false;
    if(!save){this.setShape(this._shapeBefore);this.layout=importLayout(this._before,this.device);this.game.uiLanguage.setTheme(this._themeBefore,{announce:false});}
    if(save)for(const id of Object.keys(HUD_ITEMS))setHudPref(id,this._prefs[id]!==false);
    this.layout = normalizeLayout(this.layout,this.device); const ok = save?saveLayout(this.storage, this.device, this.layout):true;
    document.removeEventListener('keydown',this._keys,true);document.body.classList.remove('hud-editing');for(const r of this._sampleRecords||[]){r.e.hidden=r.hidden;r.e.style.cssText=r.style;delete r.e.dataset.hudSample;r.e._hudArtSignature=null;if(r.e.parentNode!==r.parent)r.parent.insertBefore(r.e,r.next?.parentNode===r.parent?r.next:null);}this._sampleRecords=[];for(const b of document.querySelectorAll('[data-hud-old]')){b.textContent=b.dataset.hudOld;delete b.dataset.hudOld;}
    this.ui?.remove(); this.ui = null; this.boxes = null;
    this.touchRoot?.classList.remove('touch-layout-edit');
    const g = this.game; g.combatOverlayOpen = this._overlay || false; g.running = save?!!g.player:false; g.hud?.setPaused(!save);
    this.measure();this.apply(); this.log.push({ saved: ok, device: this.device, controls: Object.keys(this.layout.controls) });
    return ok;
  }
  snapshot() { return { device: this.device, preset: this.layout.preset, controls: structuredClone(this.layout.components), editing: this.editing, sel: this.sel }; }
}
export { CONTROL_IDS };
