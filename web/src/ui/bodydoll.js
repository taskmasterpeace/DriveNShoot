import './bodydoll.css';
import { DOLL_PARTS, DOLL_PART_IDS, PART_STATES, partStates } from '../data/bodydoll.js';
import { INJURIES } from '../data/survival.js';
import { drawFlag } from './portrait.js';

// THE BODY DOLL (data/bodydoll.js): your body as six low-poly plates (the puppet's own blocky build), each tinted by
// what is wrong with it. The same figure is drawn twice: small in the HUD (BodyDoll, a HUD layout row: 'doll') and big
// on the PACK screen, which opens by lifting the small one up into place (ui/inventory.js). Your flag hangs behind it.
// Updated on the HUD's slow tick and only written when a part changes.

// Front view: the player's LEFT arm and leg are on the viewer's right. viewBox 0 0 100 200.
const SHAPES = {
  head: 'M40 5h20l4 7v15l-5 6H41l-5-6V12z',
  torso: 'M29 37l11-4h20l11 4 2 27-4 29H32l-4-29z',
  arm_l: 'M72 38l9 3 5 31-1 33h-9l-2-31-4-27z',
  arm_r: 'M28 38l-9 3-5 31 1 33h9l2-31 4-27z',
  leg_l: 'M51 95h14l2 46-2 42 5 7H52l-1-49z',
  leg_r: 'M49 95H35l-2 46 2 42-5 7h17l1-49z',
};
let uid = 0;

// The figure's SVG: one <path data-part> per part, and two stripe patterns (a splint's slats, a break's cracks).
export function dollSVG(cls = '') {
  const id = `bd${++uid}`;
  return `<svg class="bd-fig ${cls}" viewBox="0 0 100 200" aria-hidden="true"><defs>`
    + `<pattern id="${id}s" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(90)"><rect width="6" height="6" class="bd-pat-a"/><rect width="2" height="6" class="bd-pat-b"/></pattern>`
    + `<pattern id="${id}f" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="7" height="7" class="bd-pat-c"/><rect width="1.6" height="7" class="bd-pat-d"/></pattern></defs>`
    + DOLL_PART_IDS.map((p) => `<path data-part="${p}" class="bd-part t-ok" d="${SHAPES[p]}" style="--splint:url(#${id}s);--crack:url(#${id}f)"/>`).join('')
    + '</svg>';
}

const STATE = Object.fromEntries(PART_STATES.map((s) => [s.id, s]));
export const partName = (p) => DOLL_PARTS.find((x) => x.id === p)?.name ?? p.toUpperCase();
export const stateLabel = (s) => STATE[s]?.label ?? s.toUpperCase();
export const stateTone = (s) => STATE[s]?.tone ?? 'ok';
// Tint one figure's parts from a states map; change-only per path (the last tone rides on the element).
export function paintDoll(svg, states) {
  for (const path of svg.querySelectorAll('path[data-part]')) {
    const t = stateTone(states[path.dataset.part]);
    if (path.dataset.tone !== t) { path.dataset.tone = t; path.setAttribute('class', `bd-part t-${t}`); }
  }
}

// The worst part first (a broken arm before a bandaged leg): [part, state] or null when the whole body is fine.
export function worstPart(states) {
  let best = null, rank = PART_STATES.length;
  for (const p of DOLL_PART_IDS) { const r = PART_STATES.findIndex((s) => s.id === states[p]); if (r < rank && states[p] !== 'ok') { rank = r; best = p; } }
  return best ? [best, states[best]] : null;
}

// The HUD's doll: where your missing health came from (each hit's share on the part it landed on, mending as you
// mend) and the wounds on each part.
export class BodyDoll {
  constructor(game, root) {
    this.g = game;
    root.insertAdjacentHTML('beforeend', `<div class="bodydoll"><canvas class="bd-flag" width="120" height="80"></canvas>${dollSVG('bd-hud')}<b class="bd-tag"></b></div>`);
    this.el = root.querySelector('.bodydoll:last-child');
    this.svg = this.el.querySelector('svg'); this.tag = this.el.querySelector('.bd-tag'); this.flagC = this.el.querySelector('.bd-flag');
    this.hurt = Object.fromEntries(DOLL_PART_IDS.map((p) => [p, 0])); // hp each part took, still unmended
    this.states = {};
    this.seq = 0; this.flag = null; this.key = '';
  }

  // New hits since the last look (the 'hurt' events), onto the parts they landed on; then mend them with your health.
  readHits() {
    const g = this.g, E = g.events, p = g.player;
    let i = E.length - 1;
    while (i > 0 && E[i - 1].seq > this.seq) i--;
    for (; i < E.length; i++) {
      const e = E[i];
      if (e.seq <= this.seq) continue;
      this.seq = e.seq;
      if (e.type !== 'hurt' || !(e.amount > 0)) continue;
      if (e.part === 'all') for (const q of DOLL_PART_IDS) this.hurt[q] += e.amount / DOLL_PART_IDS.length;
      else this.hurt[DOLL_PART_IDS.includes(e.part) ? e.part : 'torso'] += e.amount;
    }
    const max = p?.maxHp ?? 100, missing = Math.max(0, max - (p?.hp ?? max));
    let sum = 0;
    for (const q of DOLL_PART_IDS) sum += this.hurt[q];
    if (sum > missing) { const k = sum > 0 ? missing / sum : 0; for (const q of DOLL_PART_IDS) this.hurt[q] *= k; }
  }
  // The share of your full health each part took (0..1), for data/bodydoll.js partStates.
  shares(out = this._sh ??= {}) { const max = this.g.player?.maxHp ?? 100; for (const q of DOLL_PART_IDS) out[q] = this.hurt[q] / max; return out; }
  view() { return { states: { ...this.states }, hurt: Object.fromEntries(DOLL_PART_IDS.map((q) => [q, Math.round(this.hurt[q])])) }; }

  update() {
    const g = this.g;
    if (!g.player) return;
    this.readHits();
    partStates(g.needs, INJURIES, this.shares(), this.states);
    const code = g.player.flag ?? 'US';
    if (code !== this.flag) { this.flag = code; const c = drawFlag(code, 120, 80), x = this.flagC.getContext('2d'); x.clearRect(0, 0, 120, 80); x.drawImage(c, 0, 0); }
    let key = '';
    for (const q of DOLL_PART_IDS) key += this.states[q] + ',';
    if (key === this.key) return;
    this.key = key;
    paintDoll(this.svg, this.states);
    const w = worstPart(this.states);
    this.tag.textContent = w ? `${partName(w[0])} · ${stateLabel(w[1])}` : '';
    this.el.classList.toggle('bd-wounded', !!w);
  }
}
