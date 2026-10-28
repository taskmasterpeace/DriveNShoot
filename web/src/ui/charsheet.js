import { drawFlag, FLAGS } from './portrait.js';
import { ATTRIBUTES, SKILL_GROUPS } from '../data/stats.js';
import { journal } from '../systems/journal.js';

// THE CHARACTER SHEET (` Backquote; docs/design/WEB_VOICE_STATS.md §3.4). Robert's rule: tabs, never a long scroll -
// each tab is laid out to fit the panel. ATTRIBUTES (the seven, what they come to, what is in play now) · SKILLS (36 in
// their groups, compact) · PERKS (the ones waiting: click to pick; the ones taken) · TRAITS · BODY (six zones, injuries,
// conditions with their cures) · STANDING (stress, morale, reputation) · JOURNAL. Your flag is the backdrop: everybody's
// from somewhere. The HUD's stamped-steel language (ui/hud.css: steel gradients, stencil type, clipped corners).
// Not per-frame: drawn on open and twice a second while open. The pause menu gets a JOURNAL tab (g.qol.addTab when the
// tabbed pause menu is there; a button otherwise) and the LOCAL TALK toggle.
const TABS = ['attributes', 'skills', 'perks', 'traits', 'body', 'standing', 'journal', 'pulls']; // pulls: ui/pullsboard.js (what reached you)
const CSS = `
.cs{position:fixed;left:50%;top:5vh;transform:translateX(-50%);width:min(1040px,95vw);height:min(640px,88vh);z-index:60;color:var(--bone);font:13px var(--body);display:flex;flex-direction:column;
 background:var(--speckle,none),linear-gradient(172deg,var(--steel-hi),var(--steel-lo));border:1px solid oklch(0.11 0.01 60);box-shadow:inset 0 1px 0 rgba(255,250,235,.14),4px 6px 0 rgba(0,0,0,.55);
 clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%,0 14px)}
.cs.hidden{display:none}.cs-flag{position:absolute;inset:0;opacity:.09;pointer-events:none;background-size:cover;background-position:center;filter:saturate(.75) contrast(.9)}
.cs-head{display:flex;align-items:center;gap:12px;padding:12px 18px 10px;border-bottom:2px solid oklch(0.12 0.01 60);position:relative}
.cs-head canvas{box-shadow:2px 2px 0 rgba(0,0,0,.6)}.cs-name{font:900 26px var(--stencil);letter-spacing:.08em;line-height:1;text-shadow:2px 2px 0 rgba(0,0,0,.6)}.cs-sub{color:var(--muted);font-size:12px;margin-top:3px}
.cs-x{margin-left:auto;background:transparent;border:1px solid var(--line);color:var(--sand);font:700 13px var(--display);padding:3px 10px;cursor:pointer;transition:.2s}.cs-x:hover{border-color:var(--gold);color:var(--gold)}
.cs-tabs{display:flex;gap:4px;padding:8px 18px 0;position:relative}
.cs-tab{background:oklch(0.2 0.01 60);border:1px solid oklch(0.12 0.01 60);border-bottom:none;color:var(--sand);padding:6px 14px 5px;font:800 14px var(--stencil);letter-spacing:.1em;cursor:pointer;transition:.2s;clip-path:polygon(6px 0,calc(100% - 6px) 0,100% 6px,100% 100%,0 100%,0 6px)}
.cs-tab:hover{color:var(--gold)}.cs-tab.on{background:var(--gold);color:var(--ink)}
.cs-body{flex:1;min-height:0;padding:12px 18px 14px;position:relative;display:grid;gap:10px;overflow:hidden;border-top:2px solid var(--gold)}
.cs-card{background:oklch(0.17 0.01 60 / .82);border:1px solid oklch(0.12 0.01 60);padding:9px 12px;box-shadow:inset 0 1px 0 rgba(255,250,235,.06);min-height:0;overflow:hidden}
.cs-card h4{margin:0 0 6px;font:800 14px var(--stencil);letter-spacing:.12em;color:var(--gold)}
.cs-row{display:flex;justify-content:space-between;gap:8px;padding:1px 0;line-height:1.35}.cs-row span:first-child{color:var(--sand)}.cs-row b{font-weight:600;white-space:nowrap}
.cs-bar{height:4px;background:oklch(0.28 0.01 60);overflow:hidden;margin:1px 0 4px}.cs-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--rust),var(--gold))}
.cs-pill{display:inline-block;padding:0 6px;font-size:11px;margin:2px 3px 2px 0;border:1px solid var(--line);color:var(--sand)}.cs-pill.bad{border-color:var(--rust);color:oklch(0.78 0.12 40)}.cs-pill.good{border-color:var(--green);color:oklch(0.85 0.1 145)}
.cs-perk{display:flex;gap:6px;margin:3px 0 6px}.cs-perk button{flex:1;background:transparent;border:1px solid var(--brass);color:var(--bone);padding:4px 6px;cursor:pointer;font-size:12px;transition:.2s}.cs-perk button:hover{background:var(--brass);color:var(--ink)}
.cs-muted{color:var(--muted);font-size:11.5px}.cs-q{border-left:3px solid var(--gold);padding:3px 0 3px 9px;margin:5px 0}.cs-q.done{border-color:var(--green);opacity:.75}.cs-q.failed{border-color:var(--rust);opacity:.75}
.cs-big{font:900 30px var(--stencil);color:var(--bone);line-height:1}
`;

export class CharSheet {
  constructor(game) {
    this.g = game; this.open = false; this.tab = 'attributes'; this.timer = null;
    if (typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.el = document.createElement('div');
    this.el.className = 'cs hidden';
    this.el.innerHTML = `<div class="cs-flag"></div><div class="cs-head"><canvas></canvas><div><div class="cs-name"></div><div class="cs-sub"></div></div><button class="cs-x">CLOSE \`</button></div>
      <div class="cs-tabs">${TABS.map((t) => `<button class="cs-tab" data-t="${t}">${t.toUpperCase()}</button>`).join('')}</div><div class="cs-body"></div>`;
    (document.getElementById('ui') ?? document.body).appendChild(this.el);
    this.el.querySelectorAll('.cs-tab').forEach((b) => (b.onclick = () => { this.tab = b.dataset.t; this.render(); }));
    this.el.querySelector('.cs-x').onclick = () => this.toggle(false);
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

  // The pause menu: a JOURNAL tab (the tabbed pause menu's addTab) or, on an older menu, a button; plus LOCAL TALK.
  injectPause() {
    const Q = this.g.qol;
    if (typeof Q?.addTab === 'function') {
      Q.addTab('journal', 'JOURNAL', (el) => { el.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${this.journalCards()}</div>`; });
      Q.addTab('talk', 'SOUND & TALK', (el) => {
        const L = this.g.llmtalk, R = this.g.radio;
        el.innerHTML = `<div class="pm-buttons"><button data-cs="llm">LOCAL TALK: ${L?.enabled ? 'ON' : 'OFF'}</button>${R ? `<button data-cs="radio">RADIO VOLUME: ${Math.round((R.volume ?? 0.6) * 100)}%</button>` : ''}</div>`;
        el.querySelector('[data-cs="llm"]').onclick = () => { L?.setEnabled(!L.enabled); Q.showTab('talk'); };
        const rb = el.querySelector('[data-cs="radio"]'); if (rb) rb.onclick = () => { R.setVolume(((Math.round(R.volume * 10) + 2) % 12) / 10); Q.showTab('talk'); };
      });
      clearInterval(this.inject); return;
    }
    const box = document.querySelector('.pausemenu .pm-buttons');
    if (!box || box.querySelector('[data-cs]')) return;
    const mk = (label, fn) => { const b = document.createElement('button'); b.dataset.cs = '1'; b.textContent = label; b.onclick = fn; box.appendChild(b); return b; };
    mk('JOURNAL', () => this.toggle(true, 'journal'));
    const L = this.g.llmtalk;
    const t = mk(`LOCAL TALK: ${L?.enabled ? 'ON' : 'OFF'}`, () => { L?.setEnabled(!L.enabled); t.textContent = `LOCAL TALK: ${L?.enabled ? 'ON' : 'OFF'}`; });
    clearInterval(this.inject);
  }

  toggle(on = !this.open, tab = null) {
    if (!this.el) return (this.open = on);
    this.open = on; if (tab) this.tab = tab;
    this.el.classList.toggle('hidden', !on);
    clearInterval(this.timer);
    if (on) { this.render(); this.timer = setInterval(() => this.render(), 500); }
    this.g.emit?.('charSheet', { open: on, tab: this.tab });
    return on;
  }

  journalCards() {
    const J = journal(this.g);
    const card = (title, inner) => `<div class="cs-card"><h4>${title}</h4>${inner}</div>`;
    const q = (x, cls) => `<div class="cs-q ${cls}"><b>${x.title}</b> <span class="cs-muted">· ${x.giver}</span><div>${x.objective}</div>${x.reward ? `<div class="cs-muted">Reward: ${x.reward}</div>` : ''}</div>`;
    const open = [...J.active.map((x) => q(x, '')), ...J.offered.map((x) => q(x, ''))].slice(0, 6);
    const closed = [...J.done.map((x) => q(x, 'done')), ...J.failed.map((x) => q(x, 'failed'))].slice(0, 4);
    return card('IN HAND', open.length ? open.join('') : '<div class="cs-muted">No work in hand. Talk to people.</div>')
      + card('FINISHED', closed.length ? closed.join('') : '<div class="cs-muted">Nothing finished yet.</div>')
      + `<div class="cs-card" style="grid-column:1/-1"><h4>WHAT PEOPLE SAY YOU DID</h4>${J.chronicle.length ? J.chronicle.slice(0, 7).map((c) => `<div class="cs-row"><span>Day ${c.day} ${String(c.hr).padStart(2, '0')}:00 · ${c.line}</span><b class="cs-muted">${c.witnesses ? `${c.witnesses} saw` : ''}</b></div>`).join('') : '<div class="cs-muted">Nobody has a story about you yet.</div>'}</div>`;
  }

  render() {
    const g = this.g, D = g.deep; if (!this.el || !D) return;
    const v = D.view(), p = g.player;
    const code = FLAGS[p.flag] ? p.flag : 'US';
    if (this.flagCode !== code) {
      this.flagCode = code;
      this.el.querySelector('.cs-flag').style.backgroundImage = `url(${drawFlag(code, 600, 400).toDataURL()})`;
      const c = this.el.querySelector('.cs-head canvas'), f = drawFlag(code, 48, 32); c.width = 48; c.height = 32; c.getContext('2d').drawImage(f, 0, 0);
    }
    this.el.querySelector('.cs-name').textContent = (p.name ?? 'YOU').toUpperCase();
    this.el.querySelector('.cs-sub').textContent = `${FLAGS[code]?.name ?? ''} · Morale ${v.morale.band} · Stress ${Math.round(v.stress.value)}/${v.stress.cap}${v.pending.length ? ` · ${v.pending.length} PERK${v.pending.length > 1 ? 'S' : ''} TO PICK` : ''}`;
    this.el.querySelectorAll('.cs-tab').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
    const body = this.el.querySelector('.cs-body');
    const card = (title, inner, style = '') => `<div class="cs-card" style="${style}"><h4>${title}</h4>${inner}</div>`;
    const row = (a, b) => `<div class="cs-row"><span>${a}</span><b>${b}</b></div>`;
    const bar = (x, max) => `<div class="cs-bar"><i style="width:${Math.max(0, Math.min(100, (x / max) * 100)).toFixed(0)}%"></i></div>`;
    const pct = (m) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
    const cols = (n) => { body.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`; };
    body.style.display = ''; this.g.pullsUI?.show(this.tab === 'pulls'); // the PULLS tab: the board's own element takes the body's place
    let h = '';
    if (this.tab === 'attributes') {
      cols(3);
      h += card('THE SEVEN', Object.entries(v.attrs).map(([k, x]) => `${row(ATTRIBUTES[k].label, x)}${bar(x, 10)}<div class="cs-muted" style="margin:-3px 0 3px">${ATTRIBUTES[k].does}</div>`).join(''));
      h += card('WHAT THEY COME TO', Object.values(v.derived).map((d) => row(d.label, d.value)).join(''));
      const fx = v.fx;
      h += card('IN PLAY NOW', [['Aim spread', pct(fx.spreadMul)], ['Reload time', pct(fx.reloadMul)], ['Move speed', pct(fx.speedMul)], ['Stamina drain', pct(fx.sprintDrainMul)], ['Carry', `${fx.carryKg >= 0 ? '+' : ''}${fx.carryKg} kg`], ['Counter prices', pct(fx.priceMul)], ['Seen at', pct(fx.seenMul)], ['Noise you make', pct(fx.noiseMul)], ['The dead smell you at', pct(fx.scentMul)], ['Melee', pct(fx.meleeMul)], ['Handling', pct(fx.handling)], ['Wound healing', pct(fx.healMul)], ['Lock time', pct(fx.lockMul)], ['Damage taken', pct(fx.damageMul)], ['Hunger & thirst', pct(fx.drainMul)], ['Wakes to trouble at', pct(fx.wakeMul)], ['Repairs', `+${Math.round(fx.repair * 100)}%`], ['Extra search rolls', fx.luck.toFixed(1)], ['Learning', pct(fx.xpMul)]].map(([a, b]) => row(a, b)).join(''));
    } else if (this.tab === 'skills') {
      cols(4);
      for (const grp of SKILL_GROUPS) {
        const list = v.skills[grp]; if (!list) continue;
        h += card(grp, list.map((s) => `${row(`${s.label}${s.tag ? ' <span class="cs-pill good">TAG</span>' : ''}`, `${Math.floor(s.level)} <span class="cs-muted">${s.tier.slice(0, 4)}</span>`)}${bar(s.level, 100)}`).join(''));
      }
    } else if (this.tab === 'perks') {
      cols(2);
      h += card('WAITING (A TIER CROSSED: PICK ONE)', v.pending.length ? v.pending.slice(0, 6).map((x) => `<div class="cs-muted">${x.skill.toUpperCase()} · TIER ${x.tier}</div><div class="cs-perk"><button data-perk="${x.skill}:a">${x.a}</button><button data-perk="${x.skill}:b">${x.b}</button></div>`).join('') : '<div class="cs-muted">Nothing waiting. Skills cross a tier at 20, 40, 60 and 80.</div>');
      const taken = Object.entries(v.perks).flatMap(([s, picks]) => picks.map((w, i) => `${s.toUpperCase()} ${i + 1}: ${w.toUpperCase()}`));
      h += card('TAKEN', taken.length ? taken.slice(0, 18).map((t) => `<span class="cs-pill good">${t}</span>`).join('') : '<div class="cs-muted">None yet.</div>');
    } else if (this.tab === 'traits') {
      cols(2);
      const made = v.traits.filter((t) => !t.earned), earned = v.traits.filter((t) => t.earned);
      const list = (xs, none) => (xs.length ? xs.slice(0, 9).map((t) => `${row(t.label, '')}<div class="cs-muted" style="margin:-2px 0 4px">${t.does}</div>`).join('') : `<div class="cs-muted">${none}</div>`);
      h += card('MADE WITH', list(made, 'None. (`deep traits=` sets them; they cost or pay back points.)'));
      h += card('EARNED ON THE ROAD', list(earned, 'None yet: a hundred from behind the wheel, thirty fights walked away from...'));
    } else if (this.tab === 'body') {
      cols(2);
      h += card('THE SIX ZONES', v.injuries.map((z) => `${row(z.label, z.state.toUpperCase())}${bar(z.hp, 1)}${z.injuries.map((j) => `<span class="cs-pill bad">${j.label} · ${j.hoursLeft} h</span>`).join('')}`).join(''));
      h += card('CONDITIONS', v.conditions.length ? v.conditions.slice(0, 9).map((c) => `${row(c.label, `${c.level}/${c.of}`)}<div class="cs-muted" style="margin:-2px 0 4px">Cure: ${c.cure}</div>`).join('') : '<div class="cs-muted">Nothing on you right now.</div>');
    } else if (this.tab === 'standing') {
      cols(3);
      h += card('STRESS', `<div class="cs-big">${Math.round(v.stress.value)} <span class="cs-muted">/ ${v.stress.cap}</span></div>${bar(v.stress.value, v.stress.cap)}${row('Panic at', `${v.stress.panicAt}%`)}`);
      h += card('MORALE', `<div class="cs-big">${v.morale.value} <span class="cs-muted">${v.morale.band}</span></div>${v.morale.mods.slice(0, 8).map((m) => `<span class="cs-pill ${m.v < 0 ? 'bad' : 'good'}">${m.label} ${m.v > 0 ? '+' : ''}${m.v}</span>`).join('')}`);
      h += card('REPUTATION', Object.values(v.reputation).map((r) => `${row(r.label, r.value)}${bar(r.value + (r.label.includes('/') ? 100 : 0), r.label.includes('/') ? 200 : 100)}`).join(''));
    } else if (this.tab === 'pulls') {
      body.style.display = 'none'; // the PULLS board is its own element in this panel (ui/pullsboard.js), shown below
    } else {
      cols(2);
      h += this.journalCards();
    }
    body.innerHTML = h;
  }
}
