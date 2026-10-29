#!/usr/bin/env node
// THE GOAL LOOP: a dream loop for a process (Robert, 2026-10-28; WEB_DEPTH_PLAN §5; skill .claude/skills/goal-loop).
// A GOAL is a row (tools/goals/<name>.json): a metric command whose last line is a number, a target, the files the loop
// may change, the checks that must stay green, and a brief for the agent. Each round:
//   measure -> met? stop -> snapshot the allowed files -> an agent changes ONE thing in them -> checks -> re-measure ->
//   keep it only if the metric rose and every check is green, else put the files back exactly -> log the round -> repeat
// until the target is met or the rounds run out. Every round is appended to docs/design/goal-loop-log/<goal>.md.
//
//   node tools/goal-loop.mjs <goal> [--rounds N] [--agent "<cmd>"] [--dry]
//     --agent   the command that edits (the prompt arrives on stdin; default: the goal's `agent`, else claude -p)
//     --dry     measure and check once, print the prompt the agent would get, change nothing
// Changes outside the allowed files are never kept: the loop stops and reports them (it never reverts what it did not
// snapshot). Exact files only: the loop restores what it saved byte for byte; it never runs git checkout or reset.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const web = fileURLToPath(new URL('..', import.meta.url));
const repo = join(web, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const name = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--rounds' && argv[argv.indexOf(a) - 1] !== '--agent');
if (!name) { console.error('usage: node tools/goal-loop.mjs <goal> [--rounds N] [--agent "<cmd>"] [--dry]'); process.exit(2); }
const G = JSON.parse(readFileSync(join(web, 'tools/goals', `${name}.json`), 'utf8'));
const rounds = Number(opt('--rounds', G.rounds ?? 12));
const agentCmd = opt('--agent', G.agent ?? 'claude -p --model sonnet --permission-mode acceptEdits --allowedTools Read Edit Grep');
const dry = argv.includes('--dry');
const logPath = join(repo, 'docs/design/goal-loop-log', `${G.name}.md`);
mkdirSync(dirname(logPath), { recursive: true });

const sh = (cmd, input) => {
  const r = spawnSync(cmd, { cwd: web, shell: true, encoding: 'utf8', input, maxBuffer: 64 << 20, timeout: (G.timeoutS ?? 900) * 1000 });
  return { code: r.status ?? (r.error ? -1 : 0), out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
const measure = () => {
  const r = sh(G.metric);
  const last = r.out.trim().split(/\r?\n/).pop();
  const v = Number(last);
  if (!Number.isFinite(v)) throw new Error(`metric did not end in a number: ${last}`);
  return { v, out: r.out.trim() };
};
const met = (v) => (G.direction === 'down' ? v <= G.target : v >= G.target);
const better = (a, b) => (G.direction === 'down' ? a < b - 1e-9 : a > b + 1e-9);
const checks = () => { const res = []; for (const c of G.checks ?? []) { const r = sh(c); res.push({ c, ok: r.code === 0, out: r.out.trim().split(/\r?\n/).slice(-6).join(' | ') }); } return res; };
const snap = () => new Map(G.files.map((f) => [f, readFileSync(join(web, f), 'utf8')]));
const restore = (S) => { for (const [f, s] of S) writeFileSync(join(web, f), s); };
const dirty = () => sh('git status --porcelain -- .').out.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).trim().replace(/^web\//, ''));
const diffStat = () => sh(`git diff --stat -- ${G.files.join(' ')}`).out.trim().split(/\r?\n/).pop() ?? '';
const diffOf = (S) => { // a small unified-ish diff of what the round changed, against the snapshot (not git)
  const out = [];
  for (const [f, before] of S) {
    const a = before.split('\n'), b = readFileSync(join(web, f), 'utf8').split('\n');
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    let ja = a.length - 1, jb = b.length - 1; while (ja >= i && jb >= i && a[ja] === b[jb]) { ja--; jb--; }
    if (ja < i && jb < i) continue;
    out.push(`${f} @${i + 1}`); for (let k = i; k <= ja; k++) out.push(`- ${a[k].trim().slice(0, 220)}`); for (let k = i; k <= jb; k++) out.push(`+ ${b[k].trim().slice(0, 220)}`);
  }
  return out.slice(0, 24).join('\n');
};

// the log
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 16);
if (!existsSync(logPath)) writeFileSync(logPath, `# Goal loop log: ${G.name}\n\n${G.title ?? ''}\n\n- metric: \`${G.metric}\` (${G.direction ?? 'up'} to ${G.target})\n- may change: ${G.files.map((f) => `\`${f}\``).join(', ')}\n- checks: ${(G.checks ?? []).map((c) => `\`${c}\``).join(', ')}\n`);
const history = [];
const prompt = (m, detail) => [
  `You are one round of a GOAL LOOP in the repo at ${web} (a three.js game, DIVIDED STATES OF AMERICA).`,
  `GOAL: ${G.title}`, G.brief,
  `METRIC: \`${G.metric}\` prints ${m.v}; the target is ${G.target} (${G.direction ?? 'up'}).`,
  `What the metric says now:\n${m.out.split(/\r?\n/).slice(-3).join('\n')}`,
  detail ? `Detail (\`${G.detail}\`):\n${detail.slice(0, 6000)}` : '',
  history.length ? `Earlier rounds (do not repeat a rejected idea):\n${history.slice(-10).map((h) => `- round ${h.round}: ${h.verdict} ${h.before} -> ${h.after}: ${h.change}`).join('\n')}` : '',
  `RULES: change exactly ONE thing (one row or one knob, or one coherent edit to one row), ONLY in: ${G.files.join(', ')}. Read the file first. Keep every check green: ${(G.checks ?? []).join(', ')}. Never edit GOAL, never touch other files, never run git.`,
  `When you are done, reply with exactly one line: CHANGE: <what you changed and why, in plain words>.`,
].filter(Boolean).join('\n\n');


// ---- STEPWISE MODE: any agent (a subagent, a person, a session) is the editor --------------------------------------------
//   node tools/goal-loop.mjs <goal> --begin            measure; met -> exit 0; else snapshot the files, print the prompt
//   ...the agent changes ONE thing in the goal's files...
//   node tools/goal-loop.mjs <goal> --judge "<change>" checks + re-measure: keep (and log the diff) or restore exactly; log
//   node tools/goal-loop.mjs <goal> --abort            restore the snapshot without judging
// The round's state (snapshot, before value, round number, history) lives in <repo>/scratchpad/goal-loop/<goal>.json.
const statePath = join(repo, 'scratchpad/goal-loop', `${G.name}.json`);
const loadState = () => (existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { round: 0, history: [], open: null });
const saveState = (st) => { mkdirSync(dirname(statePath), { recursive: true }); writeFileSync(statePath, JSON.stringify(st)); };
if (argv.includes('--begin') || argv.includes('--judge') || argv.includes('--abort')) {
  const st = loadState();
  history.push(...st.history);
  if (argv.includes('--abort')) { if (st.open) { restore(new Map(Object.entries(st.open.snap))); st.open = null; saveState(st); } console.log('[goal-loop] aborted; files restored'); process.exit(0); }
  if (argv.includes('--begin')) {
    if (st.open) { console.log(`[goal-loop] round ${st.open.round} is open: --judge "<change>" or --abort first`); process.exit(2); }
    const m0 = measure(), cs = checks();
    if (!cs.every((c) => c.ok)) { console.log(`[goal-loop] checks red before the round:\n${cs.filter((c) => !c.ok).map((c) => `  ${c.c}: ${c.out}`).join('\n')}`); process.exit(1); }
    if (met(m0.v)) { console.log(`[goal-loop] ${G.name}: ${m0.v} - TARGET MET`); process.exit(0); }
    if (!st.round) appendFileSync(logPath, `\n## Stepwise run ${now()} (start ${m0.v}, target ${G.target}; the editor is whoever runs --begin/--judge)\n\n| round | before | after | verdict | change | checks |\n|---|---|---|---|---|---|\n`);
    st.round++; st.open = { round: st.round, before: m0.v, snap: Object.fromEntries(snap()), outside: dirty().filter((f) => !G.files.includes(f)) }; st.start ??= m0.v;
    saveState(st);
    console.log(prompt(m0, G.detail ? sh(G.detail).out : ''));
    process.exit(10); // 10 = a round is open, waiting for the edit
  }
  // --judge
  if (!st.open) { console.log('[goal-loop] no open round (--begin first)'); process.exit(2); }
  const change = String(opt('--judge', '') || '(no description)').replace(/\|/g, '/').slice(0, 300);
  const S = new Map(Object.entries(st.open.snap)), before = st.open.before, rn = st.open.round;
  const outside = dirty().filter((f) => !G.files.includes(f) && !st.open.outside.includes(f));
  const d = diffOf(S);
  let verdict, after = before, ck = '-';
  if (outside.length) { restore(S); verdict = `REJECTED (touched ${outside.join(', ')})`; }
  else if (!d) verdict = 'no change';
  else {
    const cs = checks(), green = cs.every((c) => c.ok);
    try { after = measure().v; } catch { after = NaN; }
    const keep = green && Number.isFinite(after) && better(after, before);
    verdict = keep ? 'KEPT' : !green ? 'REJECTED (checks red)' : 'REJECTED (no gain)';
    if (!keep) restore(S);
    ck = cs.map((c) => (c.ok ? 'green' : `red: ${c.out.slice(0, 160).replace(/\|/g, '/')}`)).join('; ');
    if (keep) appendFileSync(logPath.replace(/\.md$/, '.diffs.md'), `\n### round ${rn} (${now()}): ${before} -> ${after}\n\`\`\`diff\n${d}\n\`\`\`\n`);
  }
  appendFileSync(logPath, `| ${rn} | ${before} | ${after} | ${verdict} | ${change} | ${ck} |\n`);
  st.history.push({ round: rn, verdict, before, after, change }); st.open = null;
  const now2 = measure().v;
  if (met(now2)) { appendFileSync(logPath, `\n**Result:** ${st.start} -> ${now2} in ${rn} rounds; TARGET MET.\n`); st.round = 0; st.history = []; st.start = undefined; }
  saveState(st);
  console.log(`[goal-loop] round ${rn}: ${before} -> ${after} ${verdict}${met(now2) ? ' - TARGET MET' : ''}`);
  process.exit(met(now2) ? 0 : verdict === 'KEPT' ? 11 : 12);
}

let m = measure();
const c0 = checks();
const start = m.v;
console.log(`[goal-loop] ${G.name}: ${m.v} (target ${G.target}); checks ${c0.every((c) => c.ok) ? 'green' : 'RED'}`);
if (!c0.every((c) => c.ok)) { console.log(c0.filter((c) => !c.ok).map((c) => `  ${c.c}: ${c.out}`).join('\n')); if (!dry) process.exit(1); }
if (dry) { console.log(prompt(m, G.detail ? sh(G.detail).out : '')); process.exit(0); }
appendFileSync(logPath, `\n## Run ${now()} (start ${m.v}, target ${G.target}, up to ${rounds} rounds, agent \`${agentCmd}\`)\n\n| round | before | after | verdict | change | checks |\n|---|---|---|---|---|---|\n`);
let round = 0;
for (; round < rounds && !met(m.v); round++) {
  const S = snap();
  const outside0 = new Set(dirty().filter((f) => !G.files.includes(f)));
  const detail = G.detail ? sh(G.detail).out : '';
  const r = sh(agentCmd, prompt(m, detail));
  if (r.code !== 0) { appendFileSync(logPath, `| ${round + 1} | ${m.v} | - | AGENT FAILED | \`${agentCmd}\` exited ${r.code}: ${(r.out.trim().split(/\r?\n/).pop() ?? '').replace(/\|/g, '/').slice(0, 200)} | - |\n`); console.log(`[goal-loop] the agent command failed (${r.code}); use the stepwise mode (--begin / --judge)`); process.exit(5); }
  const change = (r.out.match(/CHANGE:\s*(.+)/)?.[1] ?? r.out.trim().split(/\r?\n/).pop() ?? '(no reply)').replace(/\|/g, '/').slice(0, 300);
  const outside = dirty().filter((f) => !G.files.includes(f) && !outside0.has(f));
  if (outside.length) {
    restore(S);
    appendFileSync(logPath, `| ${round + 1} | ${m.v} | - | STOPPED | the agent changed files outside the goal: ${outside.join(', ')} (left as they are; the goal files were restored) | - |\n`);
    console.log(`[goal-loop] round ${round + 1}: the agent touched ${outside.join(', ')}; stopping`); process.exit(3);
  }
  const d = diffOf(S);
  if (!d) { history.push({ round: round + 1, verdict: 'NO CHANGE', before: m.v, after: m.v, change }); appendFileSync(logPath, `| ${round + 1} | ${m.v} | ${m.v} | no change | ${change} | - |\n`); console.log(`[goal-loop] round ${round + 1}: no change`); continue; }
  const cs = checks(), green = cs.every((c) => c.ok);
  let after = null; try { after = measure().v; } catch (e) { after = NaN; }
  const keep = green && Number.isFinite(after) && better(after, m.v);
  const verdict = keep ? 'KEPT' : !green ? 'REJECTED (checks red)' : 'REJECTED (no gain)';
  if (!keep) restore(S);
  const ck = cs.map((c) => (c.ok ? 'green' : `red: ${c.out.slice(0, 160).replace(/\|/g, '/')}`)).join('; ');
  appendFileSync(logPath, `| ${round + 1} | ${m.v} | ${after} | ${verdict} | ${change} | ${ck} |\n`);
  history.push({ round: round + 1, verdict, before: m.v, after, change });
  console.log(`[goal-loop] round ${round + 1}: ${m.v} -> ${after} ${verdict}: ${change}`);
  if (keep) { appendFileSync(logPath.replace(/\.md$/, '.diffs.md'), `\n### round ${round + 1} (${now()}): ${m.v} -> ${after}\n\`\`\`diff\n${d}\n\`\`\`\n`); m = measure(); }
}
const final = measure();
appendFileSync(logPath, `\n**Result:** ${start} -> ${final.v} in ${round} rounds; ${met(final.v) ? 'TARGET MET' : 'target not met'}.\n\n\`\`\`\n${final.out.split(/\r?\n/).slice(-2).join('\n')}\n\`\`\`\n`);
console.log(`[goal-loop] ${G.name}: ${start} -> ${final.v} in ${round} rounds; ${met(final.v) ? 'TARGET MET' : 'target not met'}`);
process.exit(met(final.v) ? 0 : 4);
