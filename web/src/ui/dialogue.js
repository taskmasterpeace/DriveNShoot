import { drawPortrait, FLAGS, drawFlag } from './portrait.js';
import { BARKS } from '../data/npcs.js';
import { ITEMS } from '../data/items.js';

// Conversation panel: portrait (flag backdrop) + typewriter line + numbered choices.
export class Dialogue {
  constructor(game, root) {
    this.g = game;
    this.active = false;
    this.npc = null;
    this.cache = new Map();
    this.el = document.createElement('div');
    this.el.className = 'dlg hidden';
    this.el.innerHTML = `
      <div class="dlg-portrait"><canvas></canvas><div class="dlg-flagchip"></div></div>
      <div class="dlg-body">
        <div class="dlg-head"><span class="dlg-name"></span><span class="dlg-title"></span></div>
        <div class="dlg-text"></div>
        <div class="dlg-choices"></div>
      </div>`;
    root.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.nameEl = this.el.querySelector('.dlg-name');
    this.titleEl = this.el.querySelector('.dlg-title');
    this.textEl = this.el.querySelector('.dlg-text');
    this.choicesEl = this.el.querySelector('.dlg-choices');
    this.flagEl = this.el.querySelector('.dlg-flagchip');
    this.full = ''; this.shown = 0;
  }

  portraitFor(c) {
    const key = c.npc?.id ?? `anon-${c.slot}`;
    if (!this.cache.has(key)) {
      const p = c.npc?.portrait ?? { seed: c.slot * 97 + 13, skin: c.colors.skin, hair: c.colors.hair, shirt: c.colors.shirt };
      this.cache.set(key, drawPortrait({ ...p, flag: c.flag }));
    }
    return this.cache.get(key);
  }

  open(c) {
    this.g.emit('dialogueOpen', { npc: c.id, name: c.npc?.name ?? c.name });
    this.active = true;
    this.npc = c;
    this.extra = null;
    const src = this.portraitFor(c);
    this.canvas.width = src.width; this.canvas.height = src.height;
    this.canvas.getContext('2d').drawImage(src, 0, 0);
    this.nameEl.textContent = (c.npc?.name ?? c.name).toUpperCase();
    this.titleEl.textContent = c.npc?.title ?? (c.faction === 'warden' ? 'Warden · Rust Haven' : 'Drifter');
    this.flagEl.innerHTML = '';
    const f = drawFlag(c.flag, 36, 24);
    this.flagEl.appendChild(f);
    const label = document.createElement('span');
    label.textContent = FLAGS[c.flag].name.toUpperCase();
    this.flagEl.appendChild(label);
    this.el.classList.remove('hidden');
    this.g.audio.blip();
    // They remember you (WEB_WORLD_MEMORY phase 2): too low an opinion and there is no business to do.
    const mem = this.g.society?.memory, roles = this.g.roles;
    if (c.npc && mem?.refuses(c)) {
      const top = mem.top(c);
      this.say(c.npc.refuse?.text ?? (top && top.value < 0 && top.line ? top.line : 'I have nothing to say to you.'), [{ t: '[Leave]', end: true }]);
      this.g.emit('refused', { npc: c.npc.id, opinion: +mem.opinion(c).toFixed(1), kind: top?.kind ?? null });
      return;
    }
    // ...or they won't deal with what you are known as (WEB_ROLES: a known butcher at a trader's counter).
    const no = roles?.refusal(c);
    if (no) {
      this.say(no.line, [{ t: '[Leave]', end: true }]);
      this.g.emit('refused', { npc: c.npc.id, role: no.role });
      return;
    }
    // Somebody hurt in front of you, and something in your pack to patch them with: the first choice is yours to make.
    this.extra = this.g.inventory?.hurtEnough(c) && this.g.inventory.bestFor(c) >= 0 ? [this.treatChoice(c)] : null;
    const remark = c.npc && mem?.remark(c);
    if (remark) { this.g.hud.subtitle(`${c.npc.name}: ${remark}`, 4); this.g.voice?.speak(c, remark, { kind: 'talk' }); }
    else if (c.npc) { const line = roles?.greet(c); if (line) { this.g.hud.subtitle(`${c.npc.name}: ${line}`, 4); this.g.voice?.speak(c, line, { kind: 'talk' }); } } // what you are known for
    if (c.npc) this.show(c.npc.startFor?.(this.g) ?? c.npc.start);
    else {
      // A stranger: their own small talk, or (every other hour, if you are known for something) what they make of you.
      const k = c.slot * 7 + Math.floor(this.g.sky.time), lines = BARKS[c.faction] ?? BARKS.drifter;
      const known = k % 2 === 0 ? roles?.lineFor(c) : null;
      // ...then three things they'll talk about, from the live world (systems/talk.js), and [Leave].
      // ...and, while the local model is up (systems/llmtalk.js), a fourth: talk a while, in their own words.
      const llm = this.g.llmtalk?.available() ? [{ t: 'Talk a while.', ask: (g) => this.talkAWhile(c) }] : [];
      this.say(known?.line ?? lines[k % lines.length], [...(this.g.talk?.topics(c) ?? []), ...llm, { t: '[Leave]', end: true }]);
    }
  }

  // Patch them up with the best thing you carry for it (inventory.js treat: a `heal` deed, the medic's work).
  treatChoice(c) {
    const inv = this.g.inventory, s = inv.carried.slots[inv.bestFor(c)];
    return { t: `Let me patch you up (${(ITEMS[s.id]?.name ?? 'bandage').toLowerCase()})`, treat: true };
  }

  // The local model's answer as a screen: its line, its choices, and the other topics still there. Offline, slow or
  // refused: the authored small talk (talk.js), and the player never knows the model was asked.
  async talkAWhile(c) {
    const ans = await this.g.llmtalk.ask(c, 'small talk');
    const rest = (this.g.talk?.topics(c) ?? []);
    if (!ans) return { text: this.g.talk?.road(c) ?? '...', choices: [...rest, { t: '[Leave]', end: true }] };
    return { text: ans.line, choices: [...this.g.llmtalk.choicesFor(ans), ...rest, { t: '[Leave]', end: true }] };
  }

  // A choice's gate (G5): `req` as a function (the old way: hidden when false) or as data, `check` / a `req` object:
  // { skill, stat, trait, item, trust, crew } read by the deep sheet (systems/stats.js check). A failed check stays on
  // screen, greyed, with the reason - you see what a better you could have said.
  gate(ch) {
    if (typeof ch.req === 'function') return ch.req(this.g) ? ch : null;
    const req = ch.check ?? (ch.req && typeof ch.req === 'object' ? ch.req : null);
    if (!req) return ch;
    const r = this.g.deep?.check(req) ?? { ok: true };
    return r.ok ? { ...ch, passed: req } : { ...ch, locked: r.why };
  }

  show(id) {
    const node = this.npc.npc.nodes[id];
    const text = typeof node.text === 'function' ? node.text(this.g) : node.text;
    this.say(text, node.choices.map((ch) => this.gate(ch)).filter(Boolean));
  }

  say(text, choices) {
    this.full = text; this.shown = 0;
    // Heard as well as read (systems/voice.js): their voice if the line was rendered, text only if not. A line waits
    // for the one before it (a remark on the way in); a stage note in parentheses is never spoken.
    if (this.npc && text && !text.startsWith('(')) this.g.voice?.speak(this.npc, text, { kind: 'talk', after: true });
    this.textEl.textContent = '';
    if (this.extra) { choices = [...this.extra, ...choices]; this.extra = null; } // only on the first screen
    this.choices = choices;
    this.choicesEl.innerHTML = '';
    choices.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'dlg-choice';
      const tag = ch.passed ? `<b style="color:#d9a441">[${this.checkLabel(ch.passed)}]</b> ` : '';
      b.innerHTML = `<kbd>${i + 1}</kbd><span>${tag}${typeof ch.t === 'function' ? ch.t(this.g) : ch.t}${ch.locked ? ` <i style="color:#b06a4f">(${ch.locked})</i>` : ''}</span>`;
      if (ch.locked) { b.style.opacity = '0.45'; b.style.cursor = 'not-allowed'; b.dataset.locked = '1'; }
      b.onclick = () => this.pick(i);
      this.choicesEl.appendChild(b);
    });
    this.choicesEl.style.opacity = 0;
  }

  checkLabel(req) {
    const first = (v) => (typeof v === 'string' ? v : Object.keys(v ?? {})[0]);
    const k = req.skill ? first(req.skill) : req.stat ? first(req.stat) : req.trait ? [].concat(req.trait)[0] : req.item ? first(req.item) : req.crew ? 'CREW' : req.trust !== undefined ? 'TRUST' : '';
    return String(k).replace(/^!/, 'not ').replace(/_/g, ' ').toUpperCase();
  }

  pick(i) {
    const ch = this.choices?.[i];
    if (!ch) return;
    if (this.shown < this.full.length) { this.shown = this.full.length; return; }
    if (ch.locked) { this.g.audio.empty?.(); this.g.emit('dialogueLocked', { npc: this.npc?.id, choice: ch.t, why: ch.locked }); return; }
    this.g.audio.blip();
    // A check you passed teaches what it tested (persuade, intimidate...).
    if (ch.passed?.skill) for (const id of typeof ch.passed.skill === 'string' ? [ch.passed.skill.split(/>=|:/)[0]] : Object.keys(ch.passed.skill)) this.g.deep?.gain(id, 4, 'dialogueCheck');
    if (this.npc) this.g.voice?.hush(this.npc); // you spoke: they stop mid-line to listen
    this.g.emit('dialogueChoice', { npc: this.npc?.id, choice: typeof ch.t === 'function' ? ch.t(this.g) : ch.t });
    if (ch.treat) {
      const c = this.npc, r = this.g.inventory.treat(c);
      const back = c.npc ? [{ t: 'Anything else?', next: c.npc.startFor?.(this.g) ?? c.npc.start }, { t: '[Leave]', end: true }] : [{ t: '[Leave]', end: true }];
      this.say(r.ok ? (c.npc?.thanks ?? 'That is... better. Thank you, stranger.') : `(${r.why})`, back);
      this.shown = this.full.length; this.textEl.textContent = this.full; this.choicesEl.style.opacity = 1;
      return;
    }
    // A topic (systems/talk.js): its reply, with the other topics still on offer.
    if (ch.ask) {
      const c = this.npc;
      this.say('...', []); this.shown = this.full.length; this.textEl.textContent = '...';
      ch.ask(this.g).then((r) => { if (!this.active || this.npc !== c || !r) return; this.say(r.text, r.choices); });
      return;
    }
    if (ch.llm) ch.do?.(this.g); // the model's choice: its (validated) effect, then its acknowledgement
    if (ch.reply) { const text = ch.reply(this.g); this.say(text, this.choices.filter((x) => x !== ch && !x.llm)); return; }
    ch.do?.(this.g);
    // A job paid or a deal struck counts with their people (deliver, trade, pay...).
    if (ch.deed && this.npc) this.g.society?.deeds.direct(ch.deed.v, this.npc, ch.deed.m);
    if (ch.end) this.close();
    else if (ch.next) this.show(ch.next);
  }

  close() {
    this.active = false;
    this.npc = null;
    this.el.classList.add('hidden');
  }

  update(dt, input) {
    this.g.voice?.update(dt); // the voices follow their speakers every frame, talking or not (made in systems/talk.js)
    if (!this.active) return;
    // Whoever you were talking to is gone (removed, streamed out, killed mid-sentence): the talk ends. Left open, it froze you
    // and the world's clock (main.js runs the sim at dt 0 while a talk is open).
    const n = this.npc;
    if (n && (!n.alive || !this.g.chars.includes(n))) { this.close(); return; }
    if (this.shown < this.full.length) {
      this.shown = Math.min(this.full.length, this.shown + dt * 70);
      this.textEl.textContent = this.full.slice(0, Math.floor(this.shown));
      if (this.shown >= this.full.length) this.choicesEl.style.opacity = 1;
    }
    for (let i = 0; i < 9; i++) if (input.hit(`Digit${i + 1}`)) this.pick(i);
    if (input.hit('Escape')) this.close();
    if (input.hit('KeyE') || input.hit('Space')) {
      if (this.shown < this.full.length) { this.shown = this.full.length; this.textEl.textContent = this.full; this.choicesEl.style.opacity = 1; }
      else if (this.choices.length === 1) this.pick(0);
    }
    if (this.npc && (!this.npc.alive || Math.hypot(this.npc.x - this.g.player.x, this.npc.z - this.g.player.z) > 6)) this.close();
  }
}
