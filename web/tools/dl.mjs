#!/usr/bin/env node
// DSOA agent CLI — drive the running game from any shell.
//
//   node tools/dl.mjs status
//   node tools/dl.mjs help
//   node tools/dl.mjs state
//   node tools/dl.mjs teleport x=0 z=-40
//   node tools/dl.mjs spawn kind=raider count=4 angry=true
//   node tools/dl.mjs registerNpc def='{"id":"bob","name":"Bob","start":"a","nodes":{"a":{"text":"Hi"}}}'
//   node tools/dl.mjs screenshot --out shot.jpg
//   node tools/dl.mjs batch '[{"cmd":"setTime","args":{"hour":22}},{"cmd":"step","args":{"seconds":2}}]'
//   echo '{"cmd":"state"}' | node tools/dl.mjs -        (raw JSON on stdin)
//   node tools/dl.mjs watch type=kill,downed --follow   (stream matching events, one JSON line each, until Ctrl+C)
//   node tools/dl.mjs state --tab q3cjp2                (address one game tab: status lists them in tabList)
//
// Values: numbers/booleans/JSON are auto-parsed; everything else is a string.
// Env: DL_URL (default http://localhost:3141), DL_TAB (a game tab id, same as --tab)

import { writeFileSync, readFileSync } from 'node:fs';
import { request } from 'node:http';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
// POST JSON and wait as long as the game takes. Not fetch(): Node's fetch gives up after 300 s with no response headers,
// and a scenario may run 15 minutes (its budget) - bounty-run used to come back "fetch failed" while it was still going.
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = request(url, { method: 'POST', autoSelectFamily: true, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let s = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { s += c; });
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end(data);
  });
}
const argv = process.argv.slice(2);
const flags = {};
const rest = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i++; } else rest.push(argv[i]);
}
const [cmd = 'help', ...pairs] = rest;
// --follow takes no value: a following word is the next pair, not its value.
const FOLLOW = 'follow' in flags;
if (FOLLOW && flags.follow) { pairs.push(flags.follow); flags.follow = ''; }
const TAB = flags.tab ?? process.env.DL_TAB ?? null;

const coerce = (v) => {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  if (/^[[{"]/.test(v)) { try { return JSON.parse(v); } catch {} }
  return v;
};

async function main() {
  if (cmd === 'reload') {
    // Fresh boot of the game tab (content packs reload), then wait until it answers again.
    await fetch(`${BASE}/agent/cmd`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd: 'exec', args: { code: 'setTimeout(() => location.reload(), 50), true' } }) }).catch(() => {});
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 1500));
    for (;;) {
      try {
        const r = await fetch(`${BASE}/agent/cmd`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd: 'content', timeoutMs: 5000 }) }).then((x) => x.json());
        if (r.ok && r.packs) return print({ ok: true, reloadedInMs: Date.now() - t0, packs: r.packs });
      } catch {}
      if (Date.now() - t0 > 60000) return print({ ok: false, error: 'game tab did not come back within 60s', hint: 'node tools/dl.mjs status' });
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (cmd === 'status') {
    const r = await fetch(`${BASE}/agent/status`).then((x) => x.json());
    return print(r);
  }
  if (cmd === 'watch' && FOLLOW) return follow();
  let body;
  if (cmd === '-') body = JSON.parse(readFileSync(0, 'utf8'));
  else if (cmd === 'batch') body = { batch: JSON.parse(pairs[0]) };
  else {
    const args = {};
    for (const p of pairs) {
      const i = p.indexOf('=');
      if (i < 0) { args[p] = true; continue; }
      args[p.slice(0, i)] = coerce(p.slice(i + 1));
    }
    body = { cmd, args };
  }
  if (TAB) body.tab = TAB;
  const out = await postJson(`${BASE}/agent/cmd`, body);
  if (out.image && flags.out) {
    writeFileSync(flags.out, Buffer.from(out.image.split(',')[1], 'base64'));
    out.image = `saved to ${flags.out}`;
  } else if (out.image) out.image = `${out.image.slice(0, 40)}... (pass --out file.jpg to save)`;
  print(out);
  process.exitCode = out.ok === false ? 1 : 0;
}

// `watch ... --follow`: the watch command in a loop on the wall clock (mode=real), its cursor carried from call to call,
// every match printed as one JSON line the moment it lands. Ctrl+C stops it.
async function follow() {
  const args = {};
  for (const p of pairs) { const i = p.indexOf('='); if (i > 0) args[p.slice(0, i)] = coerce(p.slice(i + 1)); }
  let since = args.since;
  delete args.since;
  for (;;) {
    const out = await postJson(`${BASE}/agent/cmd`, { cmd: 'watch', args: { ...args, mode: 'real', seconds: 5, count: 500, ...(since !== undefined ? { since } : {}) }, ...(TAB ? { tab: TAB } : {}) }).catch((e) => ({ ok: false, error: String(e.message ?? e) }));
    if (!out.ok) { console.error(JSON.stringify(out)); await new Promise((r) => setTimeout(r, 2000)); continue; }
    for (const m of out.matches) console.log(JSON.stringify(m));
    since = out.cursor;
  }
}

function print(o) {
  if (flags.raw !== undefined) console.log(JSON.stringify(o));
  else console.log(JSON.stringify(o, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.message ?? e), hint: `Is "npm run dev" running at ${BASE}?` }));
  process.exitCode = 2;
});
