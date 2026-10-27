// Voice casting as rows (docs/design/WEB_VOICE.md §3.2). Who sounds like whom: every named person has a VOICES row,
// everyone else is cast from an archetype TEMPLATES row and the accent of their flag, seeded by their name, so the same
// stranger always sounds the same. Pure data plus two pure functions (castVoice, clipKey) that the game and
// tools/voiceforge share: a clip rendered by the forge is found by the game by the same key.
//
// A voice row is provider-agnostic: who they are (gender, age, accent, pitch, style) plus one recipe per provider.
//   breeze  the self-hosted Breeze TTS 2 on cupcake (free, the default): a voice DESIGN (<=500 chars, the formula
//           gender/age > role > pitch & timbre > texture > accent > pace > register > personality + a clarity term)
//           and a fixed seed (the seed ledger: re-roll = +1, logged here). The forge designs a reference once, then
//           clones every line from it (identity is only stable through the clone).
//   gemini  google/gemini-3.1-flash-tts on Replicate (paid, cents): one of its 30 named voices plus a persona.
//   flite   ffmpeg's built-in flite synthesizer: robotic, offline, free. A DEV placeholder that proves the pipe; never
//           shipped as a performance.
// NEVER change a shipped voice's id or seed: rendered clips and frozen references hang off them. Add a row instead.

const CLEAR = 'Clear, full-bodied, close-mic studio quality.';

// Accent by flag (ui/portrait.js FLAGS): a real accent for the country on their chest. `breeze` is the open model's
// own accent word where it has one (american, us_southern, irish, canadian, japanese, korean...); the rest are written
// out in the design and need an audition before a batch (docs/design/WEB_VOICE.md §5).
export const ACCENTS = {
  US: { say: 'General American accent', breeze: 'american', alt: { say: 'Southern American drawl', breeze: 'us_southern' } },
  MX: { say: 'Mexican Spanish-accented English' },
  CA: { say: 'Canadian English accent', breeze: 'canadian' },
  CU: { say: 'Cuban Spanish-accented English' },
  JM: { say: 'Jamaican English accent' },
  IE: { say: 'Irish accent', breeze: 'irish' },
  NG: { say: 'Nigerian English accent' },
  IT: { say: 'Italian-accented English' },
  DE: { say: 'German-accented English' },
  CO: { say: 'Colombian Spanish-accented English' },
  HT: { say: 'Haitian Creole-accented English' },
  GH: { say: 'Ghanaian English accent' },
  JP: { say: 'Japanese-accented English', breeze: 'japanese' },
  VN: { say: 'Vietnamese-accented English' },
  PH: { say: 'Filipino English accent' },
  KR: { say: 'Korean-accented English', breeze: 'korean' },
  BR: { say: 'Brazilian Portuguese-accented English' },
  PR: { say: 'Puerto Rican English accent' },
};

// The named cast. seed: the Breeze seed ledger (the npc's portrait seed, so the two never drift apart).
export const VOICES = {
  okonkwo: {
    name: 'Sheriff Adaeze Okonkwo', gender: 'f', age: 'forties', flag: 'NG', pitch: 'low alto', style: 'measured, commanding, dry warmth underneath',
    breeze: { seed: 101, design: `Feminine, mature adult in her forties. Frontier sheriff of a walled town. Low, firm alto with a resonant chest voice. Slight grain. Nigerian English accent, crisp consonants. Measured and unhurried, every word placed. Authoritative, dry, quietly warm underneath. ${CLEAR}` },
    gemini: { voice: 'Kore', persona: 'Adaeze Okonkwo, Nigerian-born sheriff of a walled desert town, forties, low firm alto, never raises her voice because she never has to' },
    flite: { voice: 'slt', rate: 0.92 },
  },
  reyes: {
    name: 'Doc Lupe Reyes', gender: 'f', age: 'thirties', flag: 'MX', pitch: 'warm mezzo', style: 'brisk, practical, teasing, compassionate',
    breeze: { seed: 202, design: `Feminine adult in her thirties. A field doctor who works nights. Warm, bright mezzo, a little husky from no sleep. Mexican Spanish-accented English; Spanish words roll naturally. Brisk and practical, teasing, compassionate under it. ${CLEAR}` },
    gemini: { voice: 'Aoede', persona: 'Lupe Reyes, Mexican-born doctor running a one-room clinic, thirties, warm and quick, scolds patients like family' },
    flite: { voice: 'slt', rate: 1.05 },
  },
  ike: {
    name: 'Ike "Two-Hands" Mercer', gender: 'm', age: 'fifties', flag: 'US', pitch: 'gravel baritone', style: 'deadpan, salesman patter',
    breeze: { seed: 303, design: `Masculine, mature adult in his fifties. A gunsmith behind a counter. Gravelly, smoky baritone. Southern American drawl. Unhurried, deadpan, a salesman's patter with a joke in it. ${CLEAR}` },
    gemini: { voice: 'Algenib', persona: 'Ike Mercer, gravel-voiced Southern gunsmith, fifties, deadpan, sells you a gun and a joke' },
    flite: { voice: 'rms', rate: 0.95 },
  },
  kenji: {
    name: 'Kenji Mori', gender: 'm', age: 'thirties', flag: 'JP', pitch: 'light tenor', style: 'precise, proud, dry humour',
    breeze: { seed: 404, design: `Masculine adult in his thirties. A mechanic who welds his own weapons. Light, precise tenor. Japanese-accented English. Quick, exact, proud of his work, dry humour. ${CLEAR}` },
    gemini: { voice: 'Iapetus', persona: 'Kenji Mori, Japanese-born mechanic, thirties, precise and proud, deadpan jokes about rust' },
    flite: { voice: 'kal16', rate: 1.05 },
  },
  mags: {
    name: 'Mags Delacroix', gender: 'f', age: 'fifties', flag: 'HT', pitch: 'rich contralto', style: 'smiling, shrewd, motherly',
    breeze: { seed: 505, design: `Feminine, mature adult in her fifties. A water trader. Rich, rounded contralto. Haitian Creole-accented English. Unhurried and musical, smiling, shrewd, motherly. ${CLEAR}` },
    gemini: { voice: 'Gacrux', persona: 'Mags Delacroix, Haitian-born water trader, fifties, rich warm voice, shrewd and motherly' },
    flite: { voice: 'slt', rate: 0.9 },
  },
  saoirse: {
    name: 'Saoirse "Static" Byrne', gender: 'f', age: 'twenties', flag: 'IE', pitch: 'bright soprano', style: 'radio patter, quick, playful',
    breeze: { seed: 606, design: `Feminine young adult in her twenties. A late-night radio host. Bright, agile soprano with a smile in it. Irish accent. Fast, rhythmic radio patter, playful and warm, never dead air. ${CLEAR}` },
    gemini: { voice: 'Zephyr', persona: 'Saoirse Byrne, Irish radio DJ on the last station in Arizona, twenties, bright and quick, talks like the mic is a friend' },
    flite: { voice: 'slt', rate: 1.12 },
  },
  tomas: {
    name: 'Old Tomás Varela', gender: 'm', age: 'seventies', flag: 'CU', pitch: 'thin, worn baritone', style: 'slow, philosophical, kind',
    breeze: { seed: 707, design: `Masculine elderly man in his seventies. A retired trucker who walks the desert. Thin, worn baritone, a little breathy. Cuban Spanish-accented English. Slow, unhurried, philosophical, kind. ${CLEAR}` },
    gemini: { voice: 'Rasalgethi', persona: 'Tomas Varela, Cuban-born old trucker who walks the desert now, seventies, slow and kind' },
    flite: { voice: 'awb', rate: 0.85 },
  },
  vo: {
    name: 'Vo Thanh "Ghost"', gender: 'm', age: 'twenties', flag: 'VN', pitch: 'tight mid baritone', style: 'jumpy, low, guilty',
    breeze: { seed: 808, design: `Masculine young adult in his twenties. A deserter from a raider gang. Tight, mid-range baritone, kept low. Vietnamese-accented English. Fast and jumpy, then quiet. Wary, guilty, honest. ${CLEAR}` },
    gemini: { voice: 'Fenrir', persona: 'Vo Thanh, Vietnamese-born raider deserter, twenties, jumpy and low, ashamed of what he rode with' },
    flite: { voice: 'rms', rate: 1.1 },
  },
  // The station: STATIC 1660 AM reads the news in Saoirse's voice, through the radio filter (systems/voice.js radio()).
};
export const RADIO_VOICE = 'saoirse';

// Archetypes: everyone without a row above. Two variants per gender, each with its own Breeze seed base and Gemini voice.
export const TEMPLATES = {
  drifter: {
    f: [{ seed: 1100, gemini: 'Leda', flite: 'slt', d: 'Feminine adult. A drifter who has walked the desert for years. Dry, weathered mid-range voice. Wary and tired, plain-spoken, quick to joke' },
      { seed: 1150, gemini: 'Despina', flite: 'slt', d: 'Feminine young adult. A scavenger. Light, sharp voice with a rasp of dust in it. Nervous energy, talks fast, sharp-eyed' }],
    m: [{ seed: 1200, gemini: 'Achird', flite: 'rms', d: 'Masculine adult. A drifter who has walked the desert for years. Dry, weathered baritone. Wary and tired, plain-spoken, slow to trust' },
      { seed: 1250, gemini: 'Umbriel', flite: 'kal16', d: 'Masculine young adult. A scavenger. Reedy tenor, a little hoarse. Restless, talks fast, laughs at bad news' }],
  },
  warden: {
    f: [{ seed: 2100, gemini: 'Achernar', flite: 'slt', d: 'Feminine adult. A town guard on a wall. Clipped, steady alto. Short sentences, all business, protective' },
      { seed: 2150, gemini: 'Sulafat', flite: 'slt', d: 'Feminine adult. A gate guard near the end of a long shift. Firm, low voice, patient but not soft' }],
    m: [{ seed: 2200, gemini: 'Schedar', flite: 'rms', d: 'Masculine adult. A town guard on a wall. Clipped, steady baritone. Short sentences, all business, protective' },
      { seed: 2250, gemini: 'Alnilam', flite: 'awb', d: 'Masculine adult. A veteran gate guard. Deep, even bass-baritone, unimpressed, slow to anger' }],
  },
  raider: {
    f: [{ seed: 3100, gemini: 'Erinome', flite: 'slt', d: 'Feminine adult. A raider who rides with a gang. Hard, husky voice. Sneering and amused, enjoys the fear, sudden bursts of anger' },
      { seed: 3150, gemini: 'Pulcherrima', flite: 'slt', d: 'Feminine young adult. A raider. Bright, mean voice, sing-song taunts, unpredictable' }],
    m: [{ seed: 3200, gemini: 'Orus', flite: 'rms', d: 'Masculine adult. A raider who rides with a gang. Rough, gravelly baritone. Menacing, sneering, impatient, enjoys the fear' },
      { seed: 3250, gemini: 'Sadaltager', flite: 'kal16', d: 'Masculine young adult. A raider. Loud, cracked tenor, wired and twitchy, laughs too much' }],
  },
  // Meridian's militia (data/holdouts.js): a planned town's wall, as many women on it as men.
  meridian: {
    f: [{ seed: 5100, gemini: 'Leda', flite: 'slt', d: 'Feminine adult. A militia guard on a swamp town wall. Even, alert mezzo, proud of her town, brisk' }],
    m: [{ seed: 5200, gemini: 'Charon', flite: 'rms', d: 'Masculine adult. A militia guard on a swamp town wall. Warm, steady baritone, watchful, quick to command' }],
  },
  soldier: {
    f: [{ seed: 4100, gemini: 'Vindemiatrix', flite: 'slt', d: 'Feminine adult. A soldier at a guard post. Crisp, controlled mid-range voice, radio discipline, flat affect' }],
    m: [{ seed: 4200, gemini: 'Zubenelgenubi', flite: 'rms', d: 'Masculine adult. A soldier at a guard post. Crisp, controlled baritone, radio discipline, flat affect' }],
  },
};
// Which archetype a faction speaks as. The infected and the player have no voice (castVoice returns null).
export const ARCHETYPE_OF = { drifter: 'drifter', drifters: 'drifter', rusthaven: 'warden', warden: 'warden', raider: 'raider', dustwolves: 'raider', soldier: 'soldier', remnant: 'soldier', meridian: 'meridian' };

// First names that read as women's in data/npcs.js FIRST (a cast is believable only if the voice fits the name); the
// rest read as men's, and a name that could go either way is decided by its hash.
const FEMININE = new Set(['Marisol', 'Ana', 'Rosa', 'Nia', 'Ines', 'Esme', 'Yuki', 'Lena', 'Aiyana', 'Carmen', 'Efua', 'Greta', 'Ilse', 'Lucia', 'Noor', 'Priya',
  'Ulla', 'Wren', 'Ximena', 'Zora', 'Birgit', 'Dalia', 'Fumiko', 'Hana', 'Kalani', 'Mireille', 'Odette', 'Rania', 'Tala', 'Vera', 'Yara']);
const EITHER = new Set(['Quinn', 'Bo', 'Jun', 'Ray', 'Sione']);

// FNV-1a, 32-bit; two of them make the 64-bit clip key. Deterministic in node and the browser alike.
export function hash32(s, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
// The key a rendered line is filed under: the voice and the exact words. The game finds a clip by it, the forge skips
// a line whose key (and recipe) it has already rendered.
export const clipKey = (voice, text) => { const s = `${voice}\u0001${text.trim()}`; return hash32(s).toString(16).padStart(8, '0') + hash32(s, 0x9747b28c).toString(16).padStart(8, '0'); };

export function genderOf(name = '') {
  const first = String(name).split(' ')[0];
  if (FEMININE.has(first)) return 'f';
  if (!first || EITHER.has(first) || !/^[A-Z]/.test(first)) return hash32(String(name)) & 1 ? 'f' : 'm';
  return 'm';
}

// Who speaks for c: a voice id. A named person (or a pack NPC with `voice:` in its row) gets their own; everyone else
// `<archetype>.<gender><variant>.<flag>`, from their name, so the same stranger sounds the same every time we meet them.
export function castVoice(c) {
  if (!c) return null;
  const n = c.npc;
  if (n?.voice) return typeof n.voice === 'string' ? n.voice : n.id;
  if (n && VOICES[n.id]) return n.id;
  const arch = ARCHETYPE_OF[c.faction] ?? ARCHETYPE_OF[c.fid];
  if (!arch) return null;
  const who = n?.name ?? c.name ?? c.id ?? '';
  const g = genderOf(who), pool = TEMPLATES[arch][g] ?? TEMPLATES[arch].m;
  const v = hash32(`${who}|voice`) % pool.length;
  return `${arch}.${g}${v}.${ACCENTS[c.flag] ? c.flag : 'US'}`;
}

// The full row for a voice id (named or archetype), with a recipe for every provider.
export function voiceRow(id, npcs = null) {
  if (VOICES[id]) return { id, ...VOICES[id] };
  const m = /^(\w+)\.([fm])(\d)\.([A-Z]{2})$/.exec(id ?? '');
  if (!m) {
    const n = npcs?.find((x) => x.id === id);
    return n?.voice && typeof n.voice === 'object' ? { id, ...n.voice } : null;
  }
  const [, arch, g, vi, flag] = m, t = TEMPLATES[arch]?.[g]?.[+vi];
  if (!t) return null;
  let acc = ACCENTS[flag] ?? ACCENTS.US;
  if (flag === 'US' && +vi === 1 && acc.alt) acc = acc.alt; // half the country's second variants drawl
  const flagSeed = hash32(flag) % 50;
  return {
    id, gender: g, flag, archetype: arch, accent: acc.say, pitch: '', style: t.d,
    breeze: { seed: t.seed + flagSeed, design: `${t.d}. ${acc.say}. ${CLEAR}` },
    gemini: { voice: t.gemini, persona: `${t.d}; ${acc.say}` },
    flite: { voice: t.flite, rate: 1 },
  };
}
