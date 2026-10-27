import { drawFlag, FLAGS } from './portrait.js';
import { ATTRIBUTES, SKILL_GROUPS } from '../data/stats.js';
import { journal } from '../systems/journal.js';

// THE CHARACTER SHEET (` Backquote; docs/design/WEB_VOICE_STATS.md §5-6). Four tabs over the deep sheet
// (systems/stats.js view()): SHEET (attributes, what they come to, traits, stress, morale, reputation), SKILLS (36, by
// group, tiers, tags, the perks waiting to be picked - click one), BODY (the six zones, injuries, conditions with their
// cures) and JOURNAL (quests active / offered / done / failed, and the chronicle's lines about you). Your flag is the
// backdrop: everybody's from somewhere. Not per-frame: drawn on open and twice a second while open.
// The pause menu gets a JOURNAL button and the LOCAL TALK toggle (injected; ui/qol.js untouched).
const CSS = `
.cs{position:fixed;inset:6vh 50% auto auto;transform:translateX(50%);width:min(980px,94vw);max-height:86vh;z-index:60;background:var(--panel-solid);border:1px solid var(--line);border-radius:10px;box-shadow:0 18px 60px rgba(0,0,0,.6);color:var(--bone);font:14px var(--body);display:flex;flex-direction:column;overflow:hidden}
.cs.hidden{display:none}.cs-flag{position:absolute;inset:0;opacity:.07;pointer-events:none;background-size:cover;background-position:center;filter:saturate(.7)}
.cs-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line);position:relative}
.cs-head canvas{border-radius:3px;box-shadow:0 2px 6px rgba(0,0,0,.5)}.cs-name{font:700 22px var(--display);letter-spacing:-.01em}.cs-sub{color:var(--muted);font-size:12px}
.cs-tabs{margin-left:auto;display:flex;gap:6px}.cs-tab{background:transparent;border:1px solid var(--line);color:var(--sand);padding:5px 12px;border-radius:999px;font:600 13px var(--display);letter-spacing:.06em;cursor:pointer;transition:.2s}
.cs-tab:hover{border-color:var(--gold)}.cs-tab.on{background:var(--gold);color:var(--ink);border-color:var(--gold)}
.cs-body{padding:14px 18px;overflow:auto;position:relative;display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}
.cs-card{background:oklch(0.23 0.014 60 / .8);border:1px solid var(--line);border-radius:10px;padding:12px 14px;transition:box-shadow .2s}.cs-card:hover{box-shadow:0 6px 20px rgba(0,0,0,.35)}
.cs-card h4{margin:0 0 8px;font:700 13px var(--display);letter-spacing:.08em;color:var(--gold)}
.cs-row{display:flex;justify-content:space-between;gap:8px;padding:2px 0;font-size:13px}.cs-row span:first-child{color:var(--sand)}.cs-row b{font-weight:600}
.cs-bar{height:5px;background:oklch(0.3 0.01 60);border-radius:3px;overflow:hidden;margin:2px 0 6px}.cs-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--rust),var(--gold))}
.cs-pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;margin:2px 3px 2px 0;border:1px solid var(--line);color:var(--sand)}.cs-pill.bad{border-color:var(--rust);color:oklch(0.78 0.12 40)}.cs-pill.good{border-color:var(--green);color:oklch(0.85 0.1 145)}
.cs-perk{display:flex;gap:6px;margin:4px 0}.cs-perk button{flex:1;background:transparent;border:1px solid var(--brass);color:var(--bone);border-radius:6px;padding:4px 6px;cursor:pointer;font-size:12px;transition:.2s}.cs-perk button:hover{background:var(--brass);color:var(--ink)}
.cs-muted{color:var(--muted);font-size:12px}.cs-q{border-left:3px solid var(--gold);padding:4px 0 4px 10px;margin:6px 0}.cs-q.done{border-color:var(--green);opacity:.75}.cs-q.failed{border-color:var(--rust);opacity:.75}
`;

export class CharSheet {
  constructor(game) {
    this.g = game; this.open = false; this.tab = 'sheet'; this.timer = null;
    if (typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.el = document.createElement('div');
    this.el.className = 'cs hidden';
    this.el.innerHTML = `<div class="cs-flag"></div><div class="cs-head"><canvas></canvas><div><div class="cs-name"></div><div class="cs-sub"></div></div>
      <div class="cs-tabs">${['sheet', 'skills', 'body', 'journal'].map((t) => `<button class="cs-tab" data-t="${t}">${t.toUpperCase()}</button>`).join('')}</div></div><div class="cs-body"></div>`;
    (document.getElementById('ui') ?? document.body).appendChild(this.el);
    this.el.querySelectorAll('.cs-tab').forEach((b) => (b.onclick = () => { this.tab = b.dataset.t; this.render(); }));
    this.el.querySelector('.cs-body').addEventListener('click', (e) => {
      const b = e.target.closest('[data-perk]'); if (!b) return;
      const [skill, pick] = b.dataset.perk.split(':'); this.g.deep?.pickPerk(skill, pick); this.render();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Backquote' || e.repeat || /INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) return;
      e.preventDefault(); this.toggle();
    });
    this.inject = setInterval(() => this.injectPause(), 1000);
  }

  // The pause menu's two extras: JOURNAL (opens this on its tab) and the local-model toggle.
  injectPause() {
    const box = document.querySelector('.pausemenu .pm-buttons');
    if (!box || box.querySelector('[data-cs]')) return;
    const mk = (label, fn) => { const b = document.createElement('button'); b.dataset.cs = '1'; b.textContent = label; b.onclick = fn; box.appendChild(b); return b; };
    mk('JOURNAL', () => this.toggle(true, 'journal'));
    const L = this.g.llmtalk;
    const t = mk(`LOCAL TALK: ${L?.enabled ? 'ON' : 'OFF'}`, () => { L?.setEnabled(!L.enabled); t.textContent = `LOCAL TALK: ${L?.enabled ? 'ON' : 'OFF'}`; });
    clearInterval(this.inject);
  }

  toggle(on = !this.open, tab = null) {
    if (!this.el) return this.open = on;
    this.open = on; if (tab) this.tab = tab;
    this.el.classList.toggle('hidden', !on);
    clearInterval(this.timer);
    if (on) { this.render(); this.timer = setInterval(() => this.render(), 500); }
    this.g.emit?.('charSheet', { open: on, tab: this.tab });
    return on;
  }

  render() {
    const g = this.g, D = g.deep; if (!this.el || !D) return;
    const v = D.view(), p = g.player;
    const code = FLAGS[p.flag] ? p.flag : 'US';
    if (this.flagCode !== code) {
      this.flagCode = code;
      const big = drawFlag(code, 600, 400); this.el.querySelector('.cs-flag').style.backgroundImage = `url(${big.toDataURL()})`;
      const c = this.el.querySelector('.cs-head canvas'), f = drawFlag(code, 48, 32); c.width = 48; c.height = 32; c.getContext('2d').drawImage(f, 0, 0);
    }
    this.el.querySelector('.cs-name').textContent = (p.name ?? 'YOU').toUpperCase();
    this.el.querySelector('.cs-sub').textContent = `${FLAGS[code]?.name ?? ''} · Morale ${v.morale.band} · Stress ${Math.round(v.stress.value)}/${v.stress.cap}`;
    this.el.querySelectorAll('.cs-tab').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
    const card = (title, inner) => `<div class="cs-card"><h4>${title}</h4>${inner}</div>`;
    const row = (a, b) => `<div class="cs-row"><span>${a}</span><b>${b}</b></div>`;
    const bar = (x, max) => `<div class="cs-bar"><i style="width:${Math.max(0, Math.min(100, (x / max) * 100)).toFixed(0)}%"></i></div>`;
    const pct = (m) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
    let h = '';
    if (this.tab === 'sheet') {
      h += card('ATTRIBUTES', Object.entries(v.attrs).map(([k, x]) => `${row(`${ATTRIBUTES[k].label} <span class="cs-muted">${ATTRIBUTES[k].does}</span>`, x)}${bar(x, 10)}`).join(''));
      h += card('WHAT IT COMES TO', Object.values(v.derived).map((d) => row(d.label, d.value)).join(''));
      const fx = v.fx;
      h += card('IN PLAY NOW', [['Aim spread', pct(fx.spreadMul)], ['Reload time', pct(fx.reloadMul)], ['Move speed', pct(fx.speedMul)], ['Stamina drain', pct(fx.sprintDrainMul)], ['Carry', `${fx.carryKg >= 0 ? '+' : ''}${fx.carryKg} kg`], ['Counter prices', pct(fx.priceMul)], ['Seen at', pct(fx.seenMul)], ['Noise you make', pct(fx.noiseMul)], ['Melee', pct(fx.meleeMul)], ['Handling', pct(fx.handling)], ['Wound healing', pct(fx.healMul)], ['Lock time', pct(fx.lockMul)], ['Damage taken', pct(fx.damageMul)], ['Learning', pct(fx.xpMul)]].map(([a, b]) => row(a, b)).join(''));
      h += card('TRAITS', v.traits.length ? v.traits.map((t) => `<div class="cs-row"><span>${t.label}${t.earned ? ' <span class="cs-pill good">earned</span>' : ''}</span></div><div class="cs-muted">${t.does}</div>`).join('') : '<div class="cs-muted">None yet. Some are earned on the road.</div>');
      h += card('STRESS & MORALE', `${row('Stress', `${Math.round(v.stress.value)} / ${v.stress.cap} (panic at ${v.stress.panicAt}%)`)}${bar(v.stress.value, v.stress.cap)}${row('Morale', `${v.morale.value} ${v.morale.band}`)}${v.morale.mods.map((m) => `<span class="cs-pill ${m.v < 0 ? 'bad' : 'good'}">${m.label} ${m.v > 0 ? '+' : ''}${m.v}</span>`).join('')}`);
      h += card('REPUTATION', Object.values(v.reputation).map((r) => row(r.label, r.value)).join(''));
    } else if (this.tab === 'skills') {
      if (v.pending.length) h += card('PERKS TO PICK', v.pending.map((x) => `<div class="cs-muted">${x.skill.toUpperCase()} tier ${x.tier}</div><div class="cs-perk"><button data-perk="${x.skill}:a">${x.a}</button><button data-perk="${x.skill}:b">${x.b}</button></div>`).join(''));
      for (const grp of SKILL_GROUPS) {
        const list = v.skills[grp]; if (!list) continue;
        h += card(grp, list.map((s) => `${row(`${s.label}${s.tag ? ' <span class="cs-pill good">tag</span>' : ''}`, `${Math.floor(s.level)} <span class="cs-muted">${s.tier}</span>`)}${bar(s.level, 100)}`).join(''));
      }
    } else if (this.tab === 'body') {
      h += card('BODY', v.injuries.map((z) => `${row(z.label, z.state.toUpperCase())}${bar(z.hp, 1)}${z.injuries.map((j) => `<span class="cs-pill bad">${j.label} · ${j.hoursLeft} h</span>`).join('')}`).join(''));
      h += card('CONDITIONS', v.conditions.length ? v.conditions.map((c) => `${row(c.label, `${c.level}/${c.of}`)}<div class="cs-muted">Cure: ${c.cure}</div>`).join('') : '<div class="cs-muted">Nothing on you right now.</div>');
    } else {
      const J = journal(g);
      const q = (x, cls) => `<div class="cs-q ${cls}"><b>${x.title}</b> <span class="cs-muted">· ${x.giver}</span><div>${x.objective}</div>${x.reward ? `<div class="cs-muted">Reward: ${x.reward}</div>` : ''}</div>`;
      h += card('ACTIVE', J.active.length ? J.active.map((x) => q(x, '')).join('') : '<div class="cs-muted">No work in hand. Talk to people.</div>');
      if (J.offered.length) h += card('OFFERED', J.offered.map((x) => q(x, '')).join(''));
      h += card('DONE', J.done.length ? J.done.map((x) => q(x, 'done')).join('') : '<div class="cs-muted">Nothing finished yet.</div>');
      if (J.failed.length) h += card('FAILED', J.failed.map((x) => q(x, 'failed')).join(''));
      h += card('WHAT PEOPLE SAY YOU DID', J.chronicle.length ? J.chronicle.map((c) => `<div class="cs-row"><span>Day ${c.day} ${String(c.hr).padStart(2, '0')}:00</span></div><div>${c.line}${c.witnesses ? ` <span class="cs-muted">(${c.witnesses} saw)</span>` : ''}</div>`).join('') : '<div class="cs-muted">Nobody has a story about you yet.</div>');
    }
    this.el.querySelector('.cs-body').innerHTML = h;
  }
}
