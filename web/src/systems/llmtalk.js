import { denyHits } from '../../tools/ip-terms.mjs';
import { hash32 } from '../data/voices.js';

// STRANGERS' TALK THROUGH THE LOCAL MODEL (docs/design/WEB_VOICE_STATS.md §4). The studio's Mac Mini runs qwen3.5
// under Ollama; the dev server proxies it at /llm (vite.config.js llmProxy). When you talk a while with a stranger, the
// prompt is built from the REAL world - who they are and whose, how their people read you, what they remember of you,
// the news their people have, the road near them, the place, the hour, the weather, what they sell - and the model must
// answer STRICT JSON { line, mood, choices: [{ t, effect }] }. Every answer is validated: the shape, the lengths, every
// effect one of the declarative dialogue effects (cost, give, setQuest, ifQuest, toast) inside caps, and every word
// through the IP lint's deny list. Anything off is thrown away. Answers are cached per (person, topic, world state).
// Authored trees always win: named people keep their own words; the model only fills strangers' small talk.
// Offline, slow (7 s) or refused: talk.js's authored topics, silently - the player never sees an error.
export const MOODS = ['calm', 'wary', 'angry', 'scared', 'friendly', 'sad', 'tired'];
export const EFFECTS = ['cost', 'give', 'setQuest', 'ifQuest', 'toast'];
const CAP = { line: 320, choice: 90, choices: 3, cost: 60, giveCash: 25, toast: 90, questKey: 24, questVal: 24 };
const TIMEOUT = 8000;

export class LlmTalk {
  constructor(game) {
    this.g = game;
    let pref = null;
    try { pref = localStorage.getItem('dsoa.llm'); } catch { /* private window */ }
    this.enabled = pref !== 'off';   // the settings toggle: on by default (used only while the model is reachable)
    this.reachable = null;           // null: not asked yet
    this.checkedAt = -1e9;
    this.base = '/llm';
    this.endpoint = `${this.base}/chat`; // the selftest points this at /llm/mock/<kind>
    this.cache = new Map();
    this.pendingFor = null;
    this.stats = { asked: 0, ok: 0, cached: 0, rejected: 0, dropped: 0, timeout: 0, offline: 0, fallback: 0 };
    this.log = [];
    this.lastPrompt = null;
  }

  setEnabled(on) { this.enabled = !!on; try { localStorage.setItem('dsoa.llm', on ? 'on' : 'off'); } catch { /* fine */ } }

  async status(force = false) {
    if (!force && Date.now() - this.checkedAt < 60000 && this.reachable !== null) return { ok: this.reachable, cached: true };
    this.checkedAt = Date.now();
    try {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 3500);
      const r = await fetch(`${this.base}/status`, { signal: ac.signal, cache: 'no-store' }); clearTimeout(t);
      const s = r.ok ? await r.json() : { ok: false, why: `status ${r.status}` };
      this.reachable = !!s.ok; this.model = s.model;
      return s;
    } catch (e) { this.reachable = false; return { ok: false, why: String(e.message ?? e) }; }
  }
  available() { return this.enabled && this.reachable !== false; }

  // ---- grounding: the real world, as short facts ------------------------------------------------------------------
  facts(c) {
    const g = this.g, S = g.society, F = S?.factions, out = {};
    const safe = (f) => { try { return f(); } catch { return null; } };
    out.name = c.npc?.name ?? c.name ?? 'a stranger';
    out.faction = safe(() => F?.rows?.[F.index[c.fid]]?.name) ?? c.faction ?? 'drifters';
    out.role = c.npc?.title ?? ({ warden: 'a warden on the wall', raider: 'a raider', soldier: 'a soldier', drifter: 'a drifter', meridian: 'a Meridian militia guard' }[c.faction] ?? 'a survivor');
    out.flag = c.flag ?? 'US';
    out.tier = safe(() => g.voice?.tier(c)) ?? 'neutral';
    out.reads_you = safe(() => g.talk?.you(c));
    out.remembers = safe(() => S?.memory?.top?.(c)?.line) ?? null;
    out.news = safe(() => g.talk?.news(c));
    out.road = safe(() => g.talk?.road(c));
    out.place = safe(() => S?.places?.[S.placeAt(c.x, c.z)]?.name) ?? 'the flats';
    const h = g.sky?.time ?? 12; out.hour = `${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    out.weather = g.sky?.weatherKey ?? 'CLEAR';
    out.sells = safe(() => (g.trade?.stockFor?.(c) ?? []).slice(0, 5).map((s) => s.name ?? s.id)) ?? [];
    out.known_as = safe(() => g.roles?.lineFor?.(c)?.line) ?? null;
    out.you = { cash: g.cash ?? 0, hurt: g.player?.hp < (g.player?.maxHp ?? 100) * 0.5, armed: !!g.player?.weapon, fame: Math.round(g.deep?.rep?.fame ?? 0), mercy: Math.round(g.deep?.rep?.mercy ?? 0) };
    out.quests = Object.fromEntries(Object.entries(g.quests ?? {}).filter(([, v]) => typeof v === 'string').slice(0, 6));
    return out;
  }
  prompt(c, topic, facts) {
    const sys = [
      `You are ${facts.name}, ${facts.role} of ${facts.faction}, in the DIVIDED STATES OF AMERICA: a broken country a generation after the collapse. Desert roads, ruined towns, the infected (sick, living people who hunt by smell), raiders.`,
      'Speak as this person to the stranger in front of you: 1 or 2 short plain sentences (under 40 words), in character, no narration, no emoji.',
      'Use ONLY the facts given, in your own words (never repeat a fact word for word); never invent named people or places. Never use names from books, films or other games.',
      'Answer with STRICT JSON only: {"line": string, "mood": one of ' + MOODS.join('|') + ', "choices": [up to 3 of {"t": what the stranger may say next (under 70 chars), "effect": null or ONE of {"toast": string} | {"setQuest": {"key": "value"}} | {"ifQuest": {"key": "value"}} | {"cost": number up to 50} | {"give": {"cash": number up to 20}}}]}.',
      'Most choices need effect null. Offer setQuest only for a small favour this person could really ask for.',
    ].join(' ');
    const user = `Topic: ${topic}.\nFacts: ${JSON.stringify(facts)}`;
    return [{ role: 'system', content: sys }, { role: 'user', content: user }];
  }

  // ---- validation: shape, caps, effects, words ----------------------------------------------------------------------
  validate(raw) {
    let v = raw;
    if (typeof raw === 'string') {
      const s = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      try { v = JSON.parse(s); } catch { return { ok: false, why: 'not JSON' }; }
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, why: 'not an object' };
    const line = typeof v.line === 'string' ? v.line.trim() : '';
    if (!line || line.length > CAP.line) return { ok: false, why: 'line missing or too long' };
    const m = String(v.mood ?? '').toLowerCase().trim(), mood = MOODS.includes(m) ? m : 'calm';
    const choices = [], dropped = [];
    for (const ch of Array.isArray(v.choices) ? v.choices.slice(0, CAP.choices) : []) {
      // A bare string is a choice with no effect (the model's commonest drift); anything else must be {t, effect}.
      const t = typeof ch === 'string' ? ch.trim() : typeof ch?.t === 'string' ? ch.t.trim() : '';
      if (!t || t.length > CAP.choice) { dropped.push('a choice missing words or too long'); continue; }
      const e = this.checkEffect(typeof ch === 'string' ? null : ch.effect ?? null);
      if (e === false) { dropped.push(`effect not allowed: ${JSON.stringify(ch.effect).slice(0, 80)}`); continue; } // a choice whose effect is not ours is dropped; the line may stand
      choices.push({ t, effect: e });
    }
    const words = [line, ...choices.map((c) => c.t), ...choices.map((c) => c.effect?.toast ?? '')].join(' \n ');
    const hits = denyHits(words);
    if (hits.length) return { ok: false, why: `ip-lint: ${hits.map((h) => h.term).join(', ')}` };
    if (/\bzombies?\b/i.test(words)) return { ok: false, why: 'canon: the Z-word' };
    return { ok: true, value: { line, mood, choices }, dropped };
  }
  // One effect -> a clean copy, or false (refused). null stays null.
  checkEffect(e) {
    if (e === null) return null;
    if (typeof e !== 'object' || Array.isArray(e)) return false;
    const keys = Object.keys(e);
    if (keys.length !== 1 || !EFFECTS.includes(keys[0])) return false;
    const k = keys[0], v = e[k];
    const kv = (o) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === 1 && Object.entries(o).every(([a, b]) => /^[a-z_]{1,24}$/i.test(a) && typeof b === 'string' && b.length <= CAP.questVal);
    if (k === 'toast') return typeof v === 'string' && v.length <= CAP.toast ? { toast: v } : false;
    if (k === 'cost') return Number.isFinite(v) && v > 0 && v <= CAP.cost ? { cost: Math.round(v) } : false;
    if (k === 'give') return v && typeof v === 'object' && Object.keys(v).length === 1 && Number.isFinite(v.cash) && v.cash > 0 && v.cash <= CAP.giveCash ? { give: { cash: Math.round(v.cash) } } : false;
    if (k === 'setQuest' || k === 'ifQuest') return kv(v) ? { [k]: { ...v } } : false;
    return false;
  }

  // ---- asking ---------------------------------------------------------------------------------------------------------
  // -> { line, mood, choices } (validated) or null (the caller falls back to authored talk). Never throws.
  async ask(c, topic = 'small talk', { timeoutMs = TIMEOUT } = {}) {
    if (!this.available()) { this.stats.offline++; return null; }
    if (this.reachable === null) { const s = await this.status(); if (!s.ok) { this.stats.offline++; return null; } }
    const facts = this.facts(c);
    const key = `${c.npc?.id ?? c.name ?? c.id}|${topic}|${hash32(JSON.stringify(facts)).toString(36)}`;
    if (this.cache.has(key)) { this.stats.cached++; return this.cache.get(key); }
    const messages = this.prompt(c, topic, facts);
    this.lastPrompt = { key, facts };
    this.stats.asked++;
    const t0 = performance.now();
    let raw = null, why = null;
    try {
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), timeoutMs);
      const r = await fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, timeoutMs }), signal: ac.signal });
      clearTimeout(timer);
      if (!r.ok) why = `status ${r.status}`;
      else raw = (await r.json())?.message?.content ?? null;
    } catch (e) { why = e.name === 'AbortError' ? 'timeout' : String(e.message ?? e); }
    const ms = Math.round(performance.now() - t0);
    if (why === 'timeout') this.stats.timeout++;
    let out = null;
    if (raw !== null) {
      const v = this.validate(raw);
      if (v.ok) { out = v.value; this.stats.ok++; this.stats.dropped += v.dropped.length; if (v.dropped.length) why = v.dropped.join('; '); this.cache.set(key, out); if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value); }
      else { why = v.why; this.stats.rejected++; }
    }
    if (!out) this.stats.fallback++;
    this.log.push({ who: facts.name, topic, ms, ok: !!out, why, line: out?.line?.slice(0, 80) ?? null }); if (this.log.length > 20) this.log.shift();
    this.g.emit('llmTalk', { npc: c.id, topic, ok: !!out, why, ms });
    return out;
  }

  // An answer's choices as dialogue choices (ui/dialogue.js): ifQuest filters, the effect runs on the pick.
  choicesFor(ans) {
    const g = this.g;
    return ans.choices.filter((ch) => !ch.effect?.ifQuest || Object.entries(ch.effect.ifQuest).every(([k, v]) => g.quests?.[k] === v)).map((ch) => ({
      t: ch.t, llm: true,
      do: () => this.apply(ch.effect),
      reply: (gg) => (ch.effect?.cost && (gg.cash ?? 0) < ch.effect.cost ? '(You can\'t cover that.)' : this.ackFor(ch)),
    }));
  }
  ackFor(ch) { return ch.effect?.setQuest ? 'Good. I\'ll hold you to it.' : ch.effect?.cost ? 'Pleasure.' : ch.effect?.give ? 'Here. Don\'t make me regret it.' : '...'; }
  apply(e) {
    const g = this.g;
    if (!e) return;
    if (e.cost) { if ((g.cash ?? 0) < e.cost) return; g.cash -= e.cost; }
    if (e.give?.cash) g.give?.({ cash: e.give.cash });
    if (e.setQuest) Object.assign(g.quests, e.setQuest);
    if (e.toast) g.hud?.toast?.(e.toast, 'job');
  }

  view() { return { enabled: this.enabled, reachable: this.reachable, model: this.model ?? null, endpoint: this.endpoint, cache: this.cache.size, stats: this.stats, recent: this.log.slice(-6) }; }
}
