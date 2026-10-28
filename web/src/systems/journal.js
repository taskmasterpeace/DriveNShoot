import { QUESTS, LOOSE, NOT_QUESTS } from '../data/quests.js';

// THE JOURNAL's reading of the world (data/quests.js rows over g.quests, and the chronicle's lines about you).
// Pure: journal(g) -> { active, offered, done, failed, chronicle } for the character sheet's JOURNAL tab and the
// `journal` command. Nothing is stored here; the save already carries g.quests and the chronicle.
const VERB = { kill: 'killed', hurt: 'shot', rob: 'robbed', steal: 'stole from', carjack: 'carjacked', rescue: 'rescued', heal: 'patched up', deliver: 'delivered for', trade: 'traded with', pay: 'paid', defend: 'stood up for', betray: 'betrayed', stunt: 'flew a car over', threaten: 'held a gun on', silence: 'silenced', destroy: 'wrecked', trespass: 'walked into the wire of' };

export function journal(g, limit = 14) {
  const out = { active: [], offered: [], done: [], failed: [], chronicle: [] };
  for (const [id, q] of Object.entries(QUESTS)) {
    let st = null; try { st = q.state(g); } catch { st = null; }
    if (!st) continue;
    const stage = q.stages.find((s) => s.at === st) ?? q.stages[0];
    let text = ''; try { text = stage.text(g); } catch { text = ''; }
    out[st]?.push({ id, title: q.title, giver: q.giver, objective: text, reward: q.reward, pin: q.pin, fails: q.fails });
  }
  for (const [k, v] of Object.entries(g.quests ?? {})) {
    if (QUESTS[k] || NOT_QUESTS.has(k) || typeof v !== 'string') continue;
    const st = LOOSE[v]; if (!st) continue;
    out[st].push({ id: k, title: k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()), giver: 'someone on the road', objective: `A favour, ${v}.`, loose: true });
  }
  const S = g.society;
  for (const r of S?.chronicle?.query({ actor: 'player', limit }) ?? []) {
    if (r.src === 'rumor') continue;
    const place = S.places?.[r.p]?.name ?? 'the flats';
    out.chronicle.push({ day: r.day, hr: r.hr, line: `You ${VERB[r.v] ?? r.v} ${r.on || 'somebody'} at ${place}.`, witnesses: r.ws ?? 0 });
  }
  return out;
}
