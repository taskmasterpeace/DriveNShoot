import { drawPortrait, FLAGS, drawFlag } from './portrait.js';
import { BARKS } from '../data/npcs.js';

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
    if (c.npc) this.show(c.npc.startFor?.(this.g) ?? c.npc.start);
    else {
      const lines = BARKS[c.faction] ?? BARKS.drifter;
      this.say(lines[(c.slot * 7 + Math.floor(this.g.sky.time)) % lines.length], [{ t: '[Leave]', end: true }]);
    }
  }

  show(id) {
    const node = this.npc.npc.nodes[id];
    const text = typeof node.text === 'function' ? node.text(this.g) : node.text;
    this.say(text, node.choices.filter((ch) => !ch.req || ch.req(this.g)));
  }

  say(text, choices) {
    this.full = text; this.shown = 0;
    this.textEl.textContent = '';
    this.choices = choices;
    this.choicesEl.innerHTML = '';
    choices.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'dlg-choice';
      b.innerHTML = `<kbd>${i + 1}</kbd><span>${ch.t}</span>`;
      b.onclick = () => this.pick(i);
      this.choicesEl.appendChild(b);
    });
    this.choicesEl.style.opacity = 0;
  }

  pick(i) {
    const ch = this.choices?.[i];
    if (!ch) return;
    if (this.shown < this.full.length) { this.shown = this.full.length; return; }
    this.g.audio.blip();
    this.g.emit('dialogueChoice', { npc: this.npc?.id, choice: ch.t });
    ch.do?.(this.g);
    if (ch.end) this.close();
    else if (ch.next) this.show(ch.next);
  }

  close() {
    this.active = false;
    this.npc = null;
    this.el.classList.add('hidden');
  }

  update(dt, input) {
    if (!this.active) return;
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
