// THE CROPS TAB (docs/design/WEB_FARMING.md §3.6, rows in data/farming.js and data/cooking.js): every crop as a row with its
// numbers, a 12-month strip (plant window, best months, frost risk), the live validators, the garden rules and the recipes.
// Read-and-validate today: the rows are edited in data/farming.js / data/cooking.js and the page re-reads them when they
// change (Vite reload); a row writer (the way BRUSH writes brush.json) is the follow-up. `window.FORGE_CROPS()` gives agents the model.
import { el, svg } from './core.js';
import { CROPS, GARDEN, COOP, FROST, MONTH_NAMES, validateFarming } from '../data/farming.js';
import { RECIPES, QUALITY, validateCooking } from '../data/cooking.js';
import { ITEMS } from '../data/items.js';

const days = (c, rate = 1) => Math.round((c.days / rate) * 10) / 10;
const TH = (h) => el('th', { style: { textAlign: 'left', padding: '4px 6px', color: 'var(--muted)', fontSize: '10.5px', letterSpacing: '.08em' } }, h);
const sub = (t) => el('div', { style: { color: 'var(--muted)', fontSize: '11px' } }, t);

function strip(c) {
  const row = el('div', { class: 'cropmonths', style: { display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: '2px', minWidth: '260px' } });
  for (let m = 1; m <= 12; m++) {
    const best = c.best.includes(m), plant = c.plant.includes(m), frost = (FROST[m] ?? 0) * (1 - c.hardy);
    const tip = `${MONTH_NAMES[m - 1]}: ${best ? 'best' : plant ? 'sow' : 'off season (x0.25)'}${frost >= 0.04 ? ` · frost ${Math.round(frost * 100)}%/night` : ''}`;
    row.append(el('div', { title: tip, style: { height: '16px', fontSize: '9px', textAlign: 'center', lineHeight: '16px', color: '#1a1a10', background: best ? '#9ccf5a' : plant ? '#6a9a3a' : '#3a342a', borderBottom: frost >= 0.04 ? '3px solid #6aa8d8' : '3px solid transparent', opacity: plant ? 1 : 0.7 } }, MONTH_NAMES[m - 1][0]));
  }
  return row;
}

export function cropsTab() {
  const pane = el('section', { class: 'pane', id: 'pane-crops' });
  window.FORGE_CROPS = () => ({ crops: CROPS, garden: GARDEN, coop: COOP, recipes: RECIPES, quality: QUALITY, validate: { farming: validateFarming(), cooking: validateCooking() } });
  const render = () => {
    const vf = validateFarming(), vc = validateCooking(), clean = vf.ok && vc.ok;
    const rows = Object.entries(CROPS).map(([id, c]) => el('tr', {},
      el('td', {}, el('b', {}, c.name), sub(id)),
      el('td', {}, strip(c)),
      el('td', {}, `${c.days} d`, sub(`best ${days(c, GARDEN.bestRate)} d`)),
      el('td', {}, `${c.yield[0]}-${c.yield[1]}`, sub(ITEMS[c.item]?.name ?? c.item)),
      el('td', {}, `x${c.thirst}`), el('td', {}, `${Math.round(c.hardy * 100)}%`), el('td', {}, `${c.hold} d`), el('td', {}, `-${Math.round(c.drain * 100)}%`),
      el('td', {}, `${c.seeds[0]}-${c.seeds[1]}`), el('td', {}, c.region ?? 'any')));
    const rec = RECIPES.map((r) => el('tr', {}, el('td', {}, el('b', {}, r.name)), el('td', {}, Object.entries(r.inputs).map(([k, n]) => `${n} ${ITEMS[k]?.name ?? k}`).join(', ')), el('td', {}, r.tools.join(', ') || 'none'), el('td', {}, r.bench), el('td', {}, `${r.hours} h`), el('td', {}, `${r.output.n} x ${r.food}`), el('td', {}, `${r.keepH} h`)));
    pane.replaceChildren(el('div', { class: 'plate', style: { padding: '14px 16px', overflow: 'auto', height: '100%' } },
      el('h2', { html: `${svg('life')}<span> CROPS</span>`, style: { display: 'flex', gap: '8px', alignItems: 'center' } }),
      el('div', { style: { color: 'var(--muted)', fontSize: '12.5px', margin: '4px 0 10px' } }, `${Object.keys(CROPS).length} crops · ${RECIPES.length} recipes · rows in data/farming.js and data/cooking.js. Strip: dark = off season, green = sow, bright = best, blue underline = frost risk. Drive it: garden, meal.`),
      el('div', { style: { padding: '6px 10px', margin: '0 0 12px', border: `1px solid ${clean ? '#5d8a34' : '#d8643a'}`, fontSize: '12px' } }, clean ? 'VALIDATORS: farming and cooking rows are clean.' : `PROBLEMS: ${[...vf.bad, ...vc.bad].join(' | ')}`),
      el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } },
        el('thead', {}, el('tr', {}, ['CROP', 'MONTHS (J-D)', 'GROWS IN', 'YIELD', 'THIRST', 'HARDY', 'HOLDS', 'SOIL COST', 'SEED BACK', 'WHERE'].map(TH))),
        el('tbody', {}, rows)),
      el('h3', { style: { margin: '16px 0 6px' } }, 'THE GARDEN RULES'),
      el('div', { style: { fontSize: '12px', lineHeight: 1.55 } }, `bed ${GARDEN.plotSize.join(' x ')} m · ${GARDEN.maxPlots} a household · a litre is ${GARDEN.litrePerWater * 100}% of a bed · a bed dries at ${GARDEN.evapPerHour * 100}%/h in April · dry under ${GARDEN.dryBelow * 100}% · fence x${GARDEN.pest.fence} pests · scarecrow x${GARDEN.pest.scarecrow} · blight ${GARDEN.blight.perDay * 100}%/day · coop ${COOP.slots} birds, lay ${COOP.lay * 100}%/day, a fox ${COOP.predator.perNight * 100}%/night (latched x${COOP.predator.secure})`),
      el('h3', { style: { margin: '16px 0 6px' } }, 'THE RECIPES'),
      el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } },
        el('thead', {}, el('tr', {}, ['MEAL', 'INGREDIENTS', 'TOOLS', 'BENCH', 'TIME', 'MAKES (n x food)', 'KEEPS'].map(TH))),
        el('tbody', {}, rec))));
  };
  return { id: 'crops', label: 'Crops', icon: 'life', pane, async init() { render(); }, onShow() { render(); } };
}
