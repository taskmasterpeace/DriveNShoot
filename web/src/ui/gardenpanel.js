// THE GARDEN PANEL (docs/design/WEB_FARMING.md §3.6): what is planted, how wet, how many days left, what threatens it.
//   chip   GARDEN n: shown once you hold a bed or a coop; the next thing that needs you (ripe, dry, blight); click opens
//   panel  one card per bed (crop, stage, growth bar, water bar, soil, days left, risk tags), the hens, the seed in your pack
// Refreshed twice a second while open and only when the text changed. Agents: `garden action=panel open=true|false`.
const CSS = `
.gd-chip{position:fixed;left:14px;bottom:168px;z-index:30;display:none;align-items:center;gap:8px;min-width:150px;padding:5px 10px 5px 8px;cursor:pointer;pointer-events:auto;color:#efe6d2;font:700 13px var(--display,system-ui);letter-spacing:.04em;
 background:linear-gradient(172deg,#3b3a2a,#24241a);border:1px solid oklch(0.11 0.01 100);box-shadow:inset 0 1px 0 rgba(255,250,235,.12),3px 4px 0 rgba(0,0,0,.5);clip-path:polygon(8px 0,100% 0,100% 100%,0 100%,0 8px);transition:filter .2s}
.gd-chip:hover{filter:brightness(1.15)}.gd-chip b{font:900 18px var(--stencil,system-ui);color:#9ccf5a;min-width:18px;text-align:center}
.gd-chip .gd-t{display:flex;flex-direction:column;line-height:1.15;min-width:0}.gd-chip .gd-k{font-size:11px;color:#c8b48a;letter-spacing:.12em}
.gd-chip .gd-n{font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}.gd-chip.warn b{color:#e0a83a}.gd-chip.bad b{color:#d8643a}
.gd-panel{position:fixed;left:14px;bottom:214px;z-index:31;display:none;width:min(430px,92vw);max-height:62vh;overflow-y:auto;padding:12px 14px;color:#efe6d2;pointer-events:auto;
 background:linear-gradient(172deg,oklch(0.24 0.02 110 / .97),oklch(0.17 0.015 100 / .97));border:1px solid oklch(0.11 0.01 100);border-top:3px solid #9ccf5a;box-shadow:4px 6px 0 rgba(0,0,0,.5);font:13px var(--body,system-ui)}
.gd-panel h3{margin:0 0 2px;font:800 15px var(--stencil,system-ui);letter-spacing:.1em;color:#9ccf5a}.gd-panel .gd-cal{font-size:11.5px;color:#c8b48a;margin-bottom:8px}
.gd-bed{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:7px 9px;margin:0 0 6px;background:oklch(0.2 0.015 100 / .85);border:1px solid oklch(0.12 0.01 100);border-left:3px solid #5d8a34}
.gd-bed.ripe{border-left-color:#e0a83a}.gd-bed.wilted{border-left-color:#6a5a3a;opacity:.75}.gd-bed.dry{border-left-color:#d8643a}
.gd-name{font:800 13px var(--stencil,system-ui);letter-spacing:.06em}.gd-days{text-align:right;font:800 13px var(--stencil,system-ui);color:#efe6d2}
.gd-bar{height:5px;background:oklch(0.3 0.01 100);margin-top:3px}.gd-bar i{display:block;height:100%}.gd-grow i{background:linear-gradient(90deg,#5d8a34,#9ccf5a)}.gd-wet i{background:linear-gradient(90deg,#8a6a3a,#5aa0b8)}
.gd-meta{grid-column:1/3;font-size:11.5px;color:#c8b48a;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.gd-tag{padding:1px 6px;border:1px solid oklch(0.4 0.03 80);font:700 10.5px var(--stencil,system-ui);letter-spacing:.08em;color:#e0c890}.gd-tag.bad{border-color:#d8643a;color:#f0a080}.gd-tag.ok{border-color:#5d8a34;color:#a8d070}
.gd-empty{padding:18px 0;text-align:center;color:#9a8f7c}.gd-sec{font:800 11px var(--stencil,system-ui);letter-spacing:.14em;color:#c8b48a;margin:10px 0 4px}
`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

export class GardenPanel {
  constructor(g, ui) {
    this.g = g; this.open = false; this.key = '';
    if (typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.chip = document.createElement('div'); this.chip.className = 'gd-chip';
    this.chip.innerHTML = '<b>0</b><span class="gd-t"><span class="gd-k">GARDEN</span><span class="gd-n"></span></span>';
    this.chip.onclick = () => this.toggle();
    this.panel = document.createElement('div'); this.panel.className = 'gd-panel';
    (ui ?? document.body).appendChild(this.chip); (ui ?? document.body).appendChild(this.panel);
    this.timer = setInterval(() => this.refresh(), 500);
  }
  toggle(on = !this.open) { this.open = on; if (this.panel) this.panel.style.display = on ? 'block' : 'none'; this.key = ''; this.refresh(); return this.open; }
  // The next thing that needs you, for the chip.
  next(v) {
    const ripe = v.plots.find((p) => p.stage === 'ripe'); if (ripe) return { t: `${ripe.name} ripe · ${ripe.dist} m`, c: 'warn' };
    const dry = v.plots.find((p) => p.crop && p.stage !== 'wilted' && p.water < 0.2); if (dry) return { t: `${dry.name} is dry · ${dry.dist} m`, c: 'bad' };
    const bl = v.plots.find((p) => p.blight); if (bl) return { t: `blight in the ${bl.name.toLowerCase()}`, c: 'bad' };
    const eg = v.coops.find((c) => c.eggs); if (eg) return { t: `${eg.eggs} eggs`, c: 'warn' };
    const grow = v.plots.filter((p) => p.crop && p.stage !== 'wilted').sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99))[0];
    return { t: grow ? `${grow.name} · ${grow.daysLeft === null ? 'stalled' : `${grow.daysLeft} d to go`}` : v.plots.length ? 'beds bare: sow' : 'a coop', c: '' };
  }
  refresh() {
    const g = this.g, F = g.farming; if (!F || !this.chip) return;
    const v = F.view(), n = v.plots.length + v.coops.length;
    this.chip.style.display = n ? 'flex' : 'none';
    if (!n && this.open) this.toggle(false);
    const nx = this.next(v), key = JSON.stringify([v.plots.map((p) => [p.id, p.stage, p.progress, p.water, p.fert, p.risks, p.dist]), v.coops, v.seeds, v.calendar.month, v.job, this.open]);
    if (key === this.key) return; this.key = key;
    this.chip.className = `gd-chip ${nx.c}`; this.chip.querySelector('b').textContent = String(n); this.chip.querySelector('.gd-n').textContent = nx.t;
    if (!this.open) return;
    const bed = (p) => `<div class="gd-bed ${p.stage === 'ripe' ? 'ripe' : p.stage === 'wilted' ? 'wilted' : p.water < 0.2 && p.crop ? 'dry' : ''}">
      <div><div class="gd-name">${esc(p.name ?? 'BARE BED')} <span style="font-weight:600;color:#c8b48a">· ${esc(p.stage)}</span></div>${p.crop ? `<div class="gd-bar gd-grow" title="growth"><i style="width:${pct(p.progress)}"></i></div>` : ''}</div>
      <div class="gd-days">${p.stage === 'ripe' ? `PICK ~${p.expected}` : p.stage === 'wilted' ? 'DEAD' : p.crop ? (p.daysLeft === null ? 'STALLED' : `${p.daysLeft} D`) : `${p.dist} m`}</div>
      <div class="gd-meta"><span>WATER</span><div class="gd-bar gd-wet" style="width:70px;margin:0"><i style="width:${pct(p.water)}"></i></div><span>SOIL ${pct(p.fert)}</span>${p.fenced ? '<span class="gd-tag ok">FENCED</span>' : ''}${p.scarecrow ? '<span class="gd-tag ok">SCARECROW</span>' : ''}${p.risks.map((r) => `<span class="gd-tag bad">${esc(r)}</span>`).join('')}</div></div>`;
    const coop = (c) => `<div class="gd-bed"><div><div class="gd-name">COOP <span style="font-weight:600;color:#c8b48a">· ${c.hens.length} bird${c.hens.length === 1 ? '' : 's'}${c.secure ? ' · latched' : ''}</span></div></div><div class="gd-days">${c.eggs} EGG${c.eggs === 1 ? '' : 'S'}</div>
      <div class="gd-meta"><span>FEED ${c.feed}/${c.needFeed} a day</span><span>WATER ${c.water}/${c.needWater} L</span></div></div>`;
    this.panel.innerHTML = `<h3>THE GARDEN</h3><div class="gd-cal">${esc(v.calendar.name)} · ${esc(v.calendar.season)}${v.calendar.fixed ? ' · calendar fixed (no seasons yet)' : ''} · farming ${v.farmLevel}</div>`
      + (v.plots.length ? v.plots.map(bed).join('') : '<div class="gd-empty">No beds yet. Hold a house, take a hoe, crouch in the yard and dig.</div>')
      + (v.coops.length ? `<div class="gd-sec">THE HENS</div>${v.coops.map(coop).join('')}` : '')
      + `<div class="gd-sec">SEED IN YOUR PACK</div><div class="gd-meta">${v.seeds.length ? v.seeds.map((s) => `<span class="gd-tag ${s.fits ? 'ok' : 'bad'}">${esc(s.crop)} ×${s.n}${s.fits ? '' : ' (off season)'}</span>`).join('') : '<span>none</span>'}</div>`
      + (v.consign.length ? `<div class="gd-sec">ON THE ROAD TO MARKET</div>${v.consign.map((m) => `<div class="gd-meta"><span>${m.items.map((i) => `${i.n} ${esc(i.id)}`).join(', ')} → ${esc(m.name)}</span></div>`).join('')}` : '');
  }
}
