// SEASONS (docs/design/WEB_SEASONS.md): the climate rows the game reads, edited as rows. One line per climate zone (annual
// mean, half-swing, the latitude the mean was read at, how readily the ground keeps snow, the warmest day) with the year's
// air drawn beside it by the engine's own meanAir(), and the calendar's two knobs. Every edit is a row op on
// src/data/seasons.json (field-preserving, undoable, pushed into the attached game with LIVE on); the rows are checked with
// the engine's validateSeasons() before anything is written.
import { F, el, patch, toast, on, addPalette, loadDoc } from './core.js';
import { ZONES, CALENDAR, FORGE_FIELDS, validateSeasons } from '../data/seasons.js';
import { meanAir, dayLength } from '../systems/seasons.js';

const FIELDS = { mean: [-25, 35, 0.5, 'annual mean air, deg C, at lat0'], amp: [0, 30, 0.5, 'half the July-January swing, deg C'], lat0: [20, 55, 0.5, 'the latitude the mean was read at'],
  snowy: [0, 1, 0.05, 'how readily the ground keeps snow (0 none .. 1 always)'], warmest: [0, 1, 0.01, 'year fraction of the warmest day (0 = March 1)'] };

function curve(z) {
  const W = 220, H = 46, pts = [];
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i <= 56; i++) { const v = meanAir(z, i / 56, z.lat0, z.relief0, ''); pts.push(v); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const y = (v) => H - 4 - ((v - Math.min(lo, 0)) / (Math.max(hi, 1) - Math.min(lo, 0) || 1)) * (H - 8), zero = y(0);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${(i / 56 * W).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="M0,${zero.toFixed(1)}H${W}" stroke="#7a8a96" stroke-dasharray="3 3" fill="none"/><path d="${d}" stroke="#d9a441" stroke-width="2" fill="none"/>
    <text x="3" y="11" font-size="9" fill="#9aa">${hi.toFixed(0)}°</text><text x="3" y="${H - 2}" font-size="9" fill="#9aa">${lo.toFixed(0)}°</text></svg>`;
}

export function seasonsTab() {
  const pane = el('section', { class: 'pane pane-stub', id: 'pane-seasons' });
  const card = el('div', { class: 'plate stubcard' });
  pane.append(card);
  const doc = () => F.docs.seasons?.doc;
  async function write(ops, label) { const r = await patch('seasons', ops, { label, tab: 'seasons' }); if (r?.ok) render(); return r; }
  function render() {
    const d = doc(); if (!d) return;
    const rows = d.zones ?? [];
    const problems = validateSeasons();
    card.innerHTML = '';
    card.append(el('h2', {}, 'SEASONS', el('span', { class: 'badge' }, problems.length ? `${problems.length} PROBLEM${problems.length > 1 ? 'S' : ''}` : 'ROWS OK')),
      el('div', { class: 'tagline' }, 'The year, the zones and the air. Edit a number: it is written to src/data/seasons.json, checked, and pushed into the game when LIVE is on.'));
    if (problems.length) card.append(el('ul', { class: 'warn' }, problems.slice(0, 6).map((p) => el('li', {}, p))));
    const cal = el('div', { class: 'plate', style: { margin: '10px 0', display: 'flex', gap: '16px', alignItems: 'center' } }, el('b', {}, 'CALENDAR'));
    for (const [k, lo, hi, step, tip] of [['seasonDays', 2, 120, 1, 'game days in a season (a year is four; a game day is 12 real minutes)'], ['warmest', 0, 1, 0.01, 'the warmest day of the year, as a fraction of it']]) {
      const inp = el('input', { type: 'number', min: lo, max: hi, step, value: d.calendar?.[k] ?? CALENDAR[k], title: tip, style: { width: '72px' } });
      inp.addEventListener('change', () => write([{ op: 'top', key: 'calendar', set: { [k]: Number(inp.value) } }], `calendar ${k}`));
      cal.append(el('label', { title: tip }, k, ' ', inp));
    }
    card.append(cal);
    const tbl = el('table', { class: 'rowtable', style: { width: '100%', borderCollapse: 'collapse' } },
      el('tr', {}, el('th', {}, 'ZONE'), ...FORGE_FIELDS.map((f) => el('th', { title: FIELDS[f][3] }, f.toUpperCase())), el('th', {}, 'THE YEAR'), el('th', {}, 'DAY LENGTH')));
    for (const r of rows) {
      const z = ZONES[r.id]; if (!z) continue;
      const tr = el('tr', {}, el('td', { title: z.states.join(', ') }, el('b', {}, r.name ?? z.name), el('div', { class: 'sub' }, `${z.states.length} state${z.states.length > 1 ? 's' : ''} · ${z.local.map((s) => s.id).join('/')}`)));
      for (const f of FORGE_FIELDS) {
        const [lo, hi, step, tip] = FIELDS[f];
        const inp = el('input', { type: 'number', min: lo, max: hi, step, value: r[f] ?? z[f] ?? '', title: tip, style: { width: '66px' } });
        inp.addEventListener('change', () => { const v = Number(inp.value); if (!(v >= lo && v <= hi)) { toast(`${f} must be ${lo}..${hi}`, 'bad'); inp.value = r[f] ?? z[f]; return; } write([{ op: 'set', coll: 'zones', id: r.id, set: { [f]: v } }], `${r.id} ${f}`); });
        tr.append(el('td', {}, inp));
      }
      tr.append(el('td', { html: curve(z) }), el('td', {}, `${dayLength(z.lat0, 0.3).toFixed(1)} h / ${dayLength(z.lat0, 0.8).toFixed(1)} h`));
      tbl.append(tr);
    }
    card.append(tbl, el('div', { class: 'sub', style: { marginTop: '8px' } }, 'Drive it now: ', el('code', {}, 'season action=at x= z='), ' · ', el('code', {}, 'season action=set season=winter'), ' · ', el('code', {}, 'forgePush file=seasons')));
  }
  return {
    id: 'seasons', label: 'Seasons', icon: 'life', pane,
    async init() { await loadDoc('seasons'); render(); on('written', (e) => { if (e.file === 'seasons') render(); }); addPalette(() => [{ label: 'SEASONS: reload the rows from disk', tag: 'SEASONS', run: async () => { await loadDoc('seasons'); render(); } }]); },
    onShow() { render(); },
  };
}
