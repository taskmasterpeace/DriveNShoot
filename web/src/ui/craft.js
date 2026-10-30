import './craft.css';
import { ITEMS } from '../data/items.js';
import { GROUPS, RECIPE_BY_ID } from '../data/recipes.js';
import { BENCHES } from '../data/benches.js';
import { SKILLS } from '../data/stats.js';

// The CRAFT tab of the PACK screen (docs/design/WEB_CRAFTING.md §3): what you can make from what you carry and what is in
// reach, missing things in red, what teaches a recipe you do not know, and the queue with its progress bar.
// It lives inside the PACK card (Q / pad LB flips PACK <-> CRAFT); W S pick, A D change group, E / pad A makes it,
// Space queues another, X cancels the head of the queue. Rebuilt only when something changed (crafting.dirty), never per frame.
const esc = (t) => String(t).replace(/[<>&]/g, '');
const GROUP_IDS = ['all', ...Object.keys(GROUPS)];
const hrs = (h) => (h < 0.95 ? `${Math.max(1, Math.round(h * 60))} MIN` : `${h.toFixed(1)} H`);
const pct = (w) => (w >= 0.01 ? `${Math.round(w * 100)}%` : `${(w * 100).toFixed(1)}%`);
const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>';

export class CraftUI {
  constructor(game, root) {
    this.g = game;
    this.active = false; this.group = 0; this.sel = 0; this.sayT = 0; this.rows = []; this.onlyMakeable = false;
    const card = root.querySelector('.invmenu .inv-card'), head = root.querySelector('.invmenu .inv-head');
    head.querySelector('.inv-title').insertAdjacentHTML('afterend', '<div class="inv-tabs"><button data-tab="pack" class="on">PACK</button><button data-tab="craft">CRAFT</button></div>');
    card.insertAdjacentHTML('beforeend', `
      <div class="craft hidden">
        <div class="craft-top"><div class="craft-groups"></div><div class="craft-benches"></div></div>
        <div class="craft-body">
          <ol class="craft-list"></ol>
          <div class="craft-detail"></div>
        </div>
        <div class="craft-queue"></div>
        <div class="craft-say"></div>
        <div class="craft-keys"><kbd>W</kbd><kbd>S</kbd>pick <kbd>A</kbd><kbd>D</kbd>group <kbd>E</kbd>make <kbd>SPACE</kbd>make another <kbd>X</kbd>cancel <kbd>F</kbd>makeable only <kbd>Q</kbd>pack</div>
      </div>`);
    const q = (s) => card.querySelector(s);
    this.el = { card, craft: q('.craft'), groups: q('.craft-groups'), benches: q('.craft-benches'), list: q('.craft-list'), detail: q('.craft-detail'), queue: q('.craft-queue'), say: q('.craft-say'), tabs: head.querySelectorAll('.inv-tabs button') };
    head.querySelector('.inv-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) this.setTab(b.dataset.tab === 'craft'); });
    this.el.groups.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) { this.group = +b.dataset.g; this.sel = 0; this.render(); } });
    this.el.list.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) { this.sel = +li.dataset.i; this.render(); } });
    this.el.list.addEventListener('dblclick', () => this.make());
    this.el.detail.addEventListener('click', (e) => { if (e.target.closest('[data-make]')) this.make(); });
    this.el.queue.addEventListener('click', (e) => { const b = e.target.closest('[data-cancel]'); if (b) { this.g.crafting.cancel(+b.dataset.cancel); this.render(); } });
  }

  setTab(on) {
    this.active = on;
    const card = this.el.card;
    this.el.craft.classList.toggle('hidden', !on);
    for (const c of ['.inv-doll', '.inv-dogs', '.inv-cols', '.inv-detail', '.inv-say', '.inv-keys']) card.querySelector(c)?.classList.toggle('craft-away', on);
    this.el.tabs.forEach((b) => b.classList.toggle('on', (b.dataset.tab === 'craft') === on));
    if (on) { this.g.crafting.dirty = true; this.render(); }
    else this.g.inventory.dirty = true;
  }
  // Called by the PACK screen's input before its own keys. true: handled.
  input(I) {
    if (!this.active) return false;
    if (I.hit('KeyQ')) { this.setTab(false); return true; }
    if (I.hit('Tab') || I.hit('KeyI') || I.hit('Escape')) { this.setTab(false); this.g.invUI.toggle(false); return true; }
    const n = this.rows.length;
    if (I.hit('KeyW') || I.hit('ArrowUp')) { this.sel = Math.max(0, this.sel - 1); this.render(); }
    if (I.hit('KeyS') || I.hit('ArrowDown')) { this.sel = Math.min(Math.max(0, n - 1), this.sel + 1); this.render(); }
    if (I.hit('KeyA') || I.hit('ArrowLeft')) { this.group = (this.group + GROUP_IDS.length - 1) % GROUP_IDS.length; this.sel = 0; this.render(); }
    if (I.hit('KeyD') || I.hit('ArrowRight')) { this.group = (this.group + 1) % GROUP_IDS.length; this.sel = 0; this.render(); }
    if (I.hit('KeyE') || I.hit('Enter') || I.hit('Space')) this.make();
    if (I.hit('KeyX')) { const r = this.g.crafting.cancel(this.g.crafting.queue.length - 1 > 0 && I.hit('ShiftLeft') ? this.g.crafting.queue.length - 1 : 0); this.tell(r.ok ? 'CANCELLED · INPUTS BACK IN YOUR PACK' : r.why.toUpperCase(), !r.ok); this.render(); }
    if (I.hit('KeyF')) { this.onlyMakeable = !this.onlyMakeable; this.sel = 0; this.render(); }
    return true;
  }
  make() {
    const row = this.rows[this.sel];
    if (!row) return;
    const r = this.g.crafting.make(row.id);
    this.tell(r.ok ? `QUEUED · ${RECIPE_BY_ID[row.id].name.toUpperCase()} · ${r.hours} H` : r.why.toUpperCase(), !r.ok);
    this.render();
  }
  tell(text, bad = false) { this.el.say.textContent = text; this.el.say.classList.toggle('bad', bad); this.sayT = 3; }
  update(dt) {
    if (!this.active) return;
    if (this.sayT > 0 && (this.sayT -= dt) <= 0) this.el.say.textContent = '';
    const C = this.g.crafting;
    if (C.queue.length) this.renderQueue(); // the bar moves with the clock
    if (C.dirty || this.g.inventory.dirty) this.render();
  }

  render() {
    const g = this.g, C = g.crafting;
    C.dirty = false; g.inventory.dirty = false;
    const gid = GROUP_IDS[this.group];
    let rows = C.list({ group: gid === 'all' ? null : gid });
    // makeable first, then known with something missing, then the ones you cannot yet learn from here
    rows.sort((a, b) => (b.can - a.can) || (b.known - a.known) || 0);
    if (this.onlyMakeable) rows = rows.filter((r) => r.can);
    this.rows = rows; this.sel = Math.max(0, Math.min(this.sel, rows.length - 1));
    this.el.groups.innerHTML = GROUP_IDS.map((id, i) => `<button data-g="${i}" class="${i === this.group ? 'on' : ''}">${id === 'all' ? 'ALL' : GROUPS[id]}</button>`).join('');
    const here = C.view().benches;
    this.el.benches.innerHTML = `<span>AT HAND</span>` + Object.keys(here).filter((b) => b !== 'hand').map((b) => `<b title="${esc(BENCHES[b].desc)}">${BENCHES[b].name}</b>`).join('') || '';
    if (!Object.keys(here).filter((b) => b !== 'hand').length) this.el.benches.innerHTML = '<span>AT HAND</span><em>NO BENCH · HAND WORK ONLY</em>';
    this.el.list.innerHTML = rows.length ? rows.map((r, i) => `<li data-i="${i}" class="${i === this.sel ? 'sel' : ''} ${r.can ? 'can' : r.known ? 'miss' : 'unknown'}"><i class="dot"></i><span class="nm">${esc(r.known ? r.name : r.name)}</span><em class="gp">${r.known ? esc(GROUPS[r.group]) : esc(r.teaches.toUpperCase())}</em><em class="hr">${hrs(r.hours)}</em></li>`).join('')
      : '<li class="empty">Nothing here yet.</li>';
    const sel = this.el.list.querySelector('li.sel'); sel?.scrollIntoView?.({ block: 'nearest' });
    this.renderDetail();
    this.renderQueue();
  }
  renderDetail() {
    const r = this.rows[this.sel];
    if (!r) { this.el.detail.innerHTML = ''; return; }
    const R = RECIPE_BY_ID[r.id], A = this.g.crafting.assess(r.id);
    const outs = R.outputs.map(([i, n]) => `${n > 1 ? `<b>${n} ×</b> ` : ''}${esc(ITEMS[i].name)}`).join(' + ') || esc(R.effect ? ({ sharpen: 'a keener edge on your worst blade', mend: 'a worn tool restored', mendgear: 'what you wear and carry patched' })[R.effect[0]] : '');
    const by = R.byproducts.length ? `<div class="by">LEAVES ${R.byproducts.map(([i, n]) => `${n} ${esc(ITEMS[i].name.toLowerCase())}`).join(', ')}</div>` : '';
    const inl = A.inputs.map((i) => `<li class="${i.have >= i.need ? 'ok' : 'no'}"><span>${esc(i.name)}</span><b>${Math.min(i.have, 999)} / ${i.need}</b></li>`).join('');
    const tl = A.tools.map((t) => `<li class="${t.have ? 'ok' : 'no'} tool"><span>${esc(t.name)}</span><b>${t.have ? `${Math.round(t.cond * 100)}%` : 'MISSING'}<em> −${pct(t.wear)} PER MAKE</em></b></li>`).join('');
    const sk = SKILLS[R.skill]?.label ?? R.skill, have = Math.floor(A.skill), skOk = A.skill >= R.minSkill;
    const bench = A.bench ? `${BENCHES[A.bench.id].name}${A.bench.fee ? ` · $${A.bench.fee} FOR THE JOB` : ''}${A.bench.standIn ? ' (TOOL ROLL)' : ''}` : `NEEDS ${BENCHES[R.bench].name}`;
    const quality = R.outputs.some(([i]) => ITEMS[i].dur) ? `<div class="q">MADE AT ${Math.round(A.q * 100)}% CONDITION · BETTER WITH SKILL AND A PROPER BENCH</div>` : '';
    const lock = !A.known ? `<div class="lock">UNKNOWN · ${esc(this.g.crafting.teaches(r.id)).toUpperCase()}</div>` : '';
    this.el.detail.innerHTML = `
      <div class="cd-name">${esc(R.name).toUpperCase()}</div>
      <div class="cd-outs">${outs}</div>${by}${lock}
      <div class="cd-sec">COSTS</div><ul class="cd-in">${inl || '<li class="ok"><span>nothing: only the tool and the time</span></li>'}</ul>
      ${tl ? `<div class="cd-sec">TOOLS (THEY WEAR)</div><ul class="cd-in">${tl}</ul>` : ''}
      <div class="cd-meta"><span class="${A.bench ? 'ok' : 'no'}">${bench}</span><span class="${skOk ? 'ok' : 'no'}">${esc(sk).toUpperCase()} ${R.minSkill}${R.minSkill ? ` (YOU ${have})` : ''}</span><span>${hrs(r.hours)} OF GAME TIME</span>${R.noise ? `<span class="loud">LOUD · ${R.noise} M</span>` : ''}</div>
      ${quality}
      <button class="cd-make ${A.ok ? '' : 'off'}" data-make><kbd>E</kbd>${A.ok ? 'MAKE IT' : esc((A.why || 'CANNOT YET').toUpperCase())}</button>`;
  }
  renderQueue() {
    const Q = this.g.crafting.queue;
    this.el.queue.innerHTML = Q.length ? Q.map((j, i) => {
      const R = RECIPE_BY_ID[j.rid], pct = Math.min(100, (100 * j.done) / j.need);
      return `<div class="qj ${i === 0 ? 'head' : ''}${j.paused ? ' paused' : ''}"><span class="qn">${esc(R.name).toUpperCase()}</span><i><em style="width:${pct.toFixed(1)}%"></em></i><b>${j.paused ? 'WAITING AT THE BENCH' : `${hrs(Math.max(0, j.need - j.done))} LEFT`}</b><button data-cancel="${i}" title="cancel: the inputs come back">×</button></div>`;
    }).join('') : '<div class="qj idle"><span class="qn">NOTHING QUEUED</span></div>';
  }
}
