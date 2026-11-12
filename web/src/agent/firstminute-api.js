// THE FIRST MINUTE for agents (docs/design/WEB_FIRST_MINUTE.md; rows data/firstminute.js; the rule systems/regions.js):
// the `firstMinute` command (where a new Florida game's first minute stands) and its checks. The player's part is done
// with the real E key; where they stand is staged.
import { FIRST_MINUTE, validateFirstMinute } from '../data/firstminute.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function firstMinuteCommands(api, need) {
  const g = api.g;
  return {
    firstMinute: {
      group: 'player', desc: 'THE FIRST MINUTE (docs/design/WEB_FIRST_MINUTE.md): what a brand-new Florida game asks before the sheriff\'s job - where you are, go back into the clinic, pull its door shut (E), step out again. No args: the beat you are on (null when it is over or was never armed), the tracker line and its pin, the rows and their validation. arm=true starts it as the title\'s PLAY does (Florida start only; refused for the harness\'s Phoenix start unless force=true). reset=true forgets it. Each beat completes only on real state (you inside the clinic, its door shut by your own hand, you outside again).',
      args: { arm: { type: 'boolean' }, reset: { type: 'boolean' }, force: { type: 'boolean' } },
      run: async ({ arm, reset, force }) => {
        const R = g.regions;
        if (reset) delete g.quests.firstminute;
        if (arm) {
          const was = R.start;
          if (force) R.start = 'florida';
          const ok = R.armFirstMinute();
          R.start = was;
          need(ok, g.quests.firstminute !== undefined ? 'it is already running or done (reset=true forgets it)' : 'not a Florida start (force=true arms it anyway, for a test)');
        }
        const F = R.firstMinute(), i = g.quests.firstminute;
        return { beat: F?.beat ?? null, index: typeof i === 'number' ? i : null, of: FIRST_MINUTE.length, text: F?.text ?? null, pin: F?.target ? { x: r1(F.target.x), z: r1(F.target.z) } : null, done: typeof i === 'number' && i >= FIRST_MINUTE.length, rows: FIRST_MINUTE.map((b) => ({ id: b.id, done: b.done, pin: b.pin })), problems: validateFirstMinute() };
      },
    },
  };
}

export async function firstMinuteChecks({ g, api, C, check, stage, hush }) {
  const P = () => g.player, I = g.interiors, R = g.regions;
  const tap = async (code) => { g.input.down.add(code); g.input.pressed.add(code); await api._step(1); g.input.down.delete(code); await api._step(1); };

  await check('first minute: the rows validate (a beat with an unknown condition, a line too long for the tracker and seven beats are each caught), and the harness never arms it (a Phoenix start: the battery and saved games start as they always did)', async () => {
    const a = validateFirstMinute();
    const b = validateFirstMinute([{ id: 'x', text: 'Go somewhere and do something vague.', done: 'whenever', pin: null }]);
    const c = validateFirstMinute([{ id: 'x', text: 'y'.repeat(200), done: 'insideClinic', pin: null }]);
    const d = validateFirstMinute(Array.from({ length: 7 }, (_, k) => ({ id: `b${k}`, text: 'Twenty characters or more here.', done: 'insideClinic', pin: null })));
    const before = g.quests.firstminute;
    const armed = R.start === 'florida' ? null : R.armFirstMinute();
    return (a.length === 0 && b.length === 1 && c.length === 1 && d.length === 1 && armed !== true && g.quests.firstminute === before) || { a, b, c, d, armed, start: R.start };
  });

  await check('first minute: a new Florida game - the tracker says where you are and sends you into the clinic; inside, it asks for the door; E pulls it shut (your own hand) and it moves on; back outside it is over and the sheriff\'s job takes the tracker; nothing advances on a timer; the beat rides a save', async () => hush(async () => {
    await stage();
    const keep = g.quests.firstminute, wasStart = R.start;
    g.godMode = true;
    try {
      const r = await C('region', { action: 'start' });
      if (!r.ok && r.error) return { region: r.error };
      await C('step', { seconds: 4 });
      delete g.quests.firstminute;
      const plain = g.qol.objective().text; // not armed: the sheriff's line, as before this slice
      R.start = 'florida';
      const armed = R.armFirstMinute();
      R.start = wasStart;
      const Cn = R.firstClinic();
      if (!Cn?.door) return { armed, clinic: !!Cn, door: !!Cn?.door };
      const d = Cn.door, ev0 = g.eventSeq;
      for (const L of d.leaves) { L.th = L.th0 || 1.3; L.w = 0; I.orient(L); } I.flush(); d.shutBy = null; // as the town keeps it: open
      for (const c of [...g.chars]) if (c !== P() && !c.npc && Math.hypot(c.x - d.x, c.z - d.z) < 8) g.removeChar(c);
      await C('step', { seconds: 0.3 });
      const o0 = g.qol.objective(), i0 = g.quests.firstminute;
      // a minute of standing in the street changes nothing (no timer)
      await C('step', { seconds: 20 });
      const waited = g.quests.firstminute;
      // 1. inside the clinic
      await C('teleport', { x: d.x - d.nx * 1.5, z: d.z - d.nz * 1.5 }); P().x = d.x - d.nx * 1.5; P().z = d.z - d.nz * 1.5; await api._step(4);
      const o1 = g.qol.objective(), i1 = g.quests.firstminute;
      const saved = await C('save');
      // 2. the door, by your own hand (nobody of the town standing in it)
      for (const c of g.chars) if (c !== P() && c.alive && Math.abs((c.x - d.x) * d.ux + (c.z - d.z) * d.uz) < d.width && Math.abs((c.x - d.x) * d.nx + (c.z - d.z) * d.nz) < 1.2) { c.x += d.ux * 3; c.z += d.uz * 3; }
      await api._step(2);
      const prompt = g.hud.s.prompt ?? '';
      await tap('KeyE'); await api._step(3);
      const shut = I.isShut(d), by = d.shutBy === P().id, o2 = g.qol.objective(), i2 = g.quests.firstminute;
      // the save taken on beat 1 puts you back on beat 1
      g.quests.firstminute = 0;
      await C('load', { save: saved.save });
      const loaded = g.quests.firstminute;
      g.quests.firstminute = i2;
      // 3. out in the street again
      await C('teleport', { x: d.x + d.nx * 3, z: d.z + d.nz * 3 }); await api._step(4);
      const i3 = g.quests.firstminute, o3 = g.qol.objective();
      const ev = g.events.filter((e) => e.seq > ev0), beats = ev.filter((e) => e.type === 'firstMinute').map((e) => e.beat), over = ev.some((e) => e.type === 'firstMinuteDone');
      const ok = /Sheriff Duarte/.test(plain) && armed === true && i0 === 0 && /Meridian/i.test(o0.text) && /inside/.test(o0.text) && o0.target && Math.hypot(o0.target.x - Cn.cl.door.x, o0.target.z - Cn.cl.door.z) < 1
        && waited === 0 && i1 === 1 && /door shut/.test(o1.text) && /Shut the door/.test(prompt) && shut && by && i2 === 2 && /step back out/.test(o2.text) && loaded === 1
        && i3 === FIRST_MINUTE.length && /Sheriff Duarte/.test(o3.text) && over && beats.join(',') === FIRST_MINUTE.map((b) => b.id).join(',');
      return ok || { plain, armed, i0, o0: o0.text, waited, i1, o1: o1.text, prompt, shut, by, i2, o2: o2.text, loaded, i3, o3: o3.text, beats, over };
    } finally { g.godMode = false; R.start = wasStart; if (keep === undefined) delete g.quests.firstminute; else g.quests.firstminute = keep; }
  }));
}
