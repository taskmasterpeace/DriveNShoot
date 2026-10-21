#!/usr/bin/env node
// DEATHLANDS agent CLI — drive the running game from any shell.
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
//
// Values: numbers/booleans/JSON are auto-parsed; everything else is a string.
// Env: DL_URL (default http://localhost:3141)

import { writeFileSync, readFileSync } from 'node:fs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const argv = process.argv.slice(2);
const flags = {};
const rest = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i++; } else rest.push(argv[i]);
}
const [cmd = 'help', ...pairs] = rest;

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
  const res = await fetch(`${BASE}/agent/cmd`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json();
  if (out.image && flags.out) {
    writeFileSync(flags.out, Buffer.from(out.image.split(',')[1], 'base64'));
    out.image = `saved to ${flags.out}`;
  } else if (out.image) out.image = `${out.image.slice(0, 40)}... (pass --out file.jpg to save)`;
  print(out);
  process.exitCode = out.ok === false ? 1 : 0;
}

function print(o) {
  if (flags.raw !== undefined) console.log(JSON.stringify(o));
  else console.log(JSON.stringify(o, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.message ?? e), hint: `Is "npm run dev" running at ${BASE}?` }));
  process.exitCode = 2;
});
