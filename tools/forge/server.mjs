// THE FORGE — the one-command DRIVN editor hub (:8900)
// Starts (or adopts, if already running) every forge server, fronts them in one
// tabbed UI, and reports their health. Zero deps — node builtins only.
//
//   node tools/forge/server.mjs          → starts everything + opens the browser
//   node tools/forge/server.mjs --no-open
//
// Children keep their own ports (map 8899 · media 8897 · vehicles 8898 · motion 8896),
// so every existing bookmark, API script, and doc still works.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = resolve(HERE, "..");
const PORT = Number(process.env.FORGE_PORT || 8900);
const NO_OPEN = process.argv.includes("--no-open");

const CHILDREN = [
  { id: "map",      name: "MapForge",     dir: "mapforge",     port: 8899 },
  { id: "media",    name: "MediaForge",   dir: "mediaforge",   port: 8897 },
  { id: "vehicles", name: "VehicleForge", dir: "vehicleforge", port: 8898 },
  { id: "motion",   name: "MotionForge",  dir: "motionforge",  port: 8896 },
  { id: "showroom", name: "THE SHOWROOM", dir: "showroom",     port: 8901 },
];

const tag = (c) => `[${c.id.toUpperCase().padEnd(8)}]`;

async function probe(port, timeoutMs = 800) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`http://localhost:${port}/`, { signal: ctl.signal });
    return r.ok;
  } catch { return false; }
  finally { clearTimeout(t); }
}

function startChild(c) {
  const script = resolve(TOOLS_DIR, c.dir, "server.mjs");
  c.proc = spawn(process.execPath, [script], { cwd: resolve(TOOLS_DIR, c.dir), windowsHide: true });
  c.proc.stdout.on("data", (d) => process.stdout.write(`${tag(c)} ${d}`));
  c.proc.stderr.on("data", (d) => process.stderr.write(`${tag(c)} ! ${d}`));
  c.proc.on("exit", (code) => {
    c.proc = null;
    console.log(`${tag(c)} exited (code ${code})`);
    c.respawns = (c.respawns || 0) + 1;
    if (c.respawns <= 3) {
      console.log(`${tag(c)} respawning in 2s (${c.respawns}/3)…`);
      setTimeout(() => startChild(c), 2000);
    } else {
      console.log(`${tag(c)} gave up after 3 respawns — if the port is stuck, kill zombie node/Godot console processes and restart the hub.`);
    }
  });
}

async function boot() {
  console.log(`⚒ THE FORGE — DRIVN editor hub`);
  for (const c of CHILDREN) {
    if (await probe(c.port)) {
      c.adopted = true;
      console.log(`${tag(c)} already running on :${c.port} — adopted as-is.`);
    } else {
      console.log(`${tag(c)} starting on :${c.port}…`);
      startChild(c);
    }
  }
}

const hub = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    // re-read every request: hub UI edits show on refresh, no restart
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(resolve(HERE, "index.html")));
    return;
  }
  if (url.pathname === "/api/status") {
    const out = {};
    await Promise.all(CHILDREN.map(async (c) => { out[c.id] = await probe(c.port); }));
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(out));
    return;
  }
  if (url.pathname === "/api/help") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      hub: `http://localhost:${PORT}/`,
      status: "/api/status",
      children: CHILDREN.map((c) => ({ id: c.id, name: c.name, url: `http://localhost:${c.port}/`, api: `http://localhost:${c.port}/api/help` })),
    }, null, 2));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("THE FORGE: not found. Try / or /api/status");
});

hub.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.log(`⚒ THE FORGE is already running on :${PORT} — opening it instead.`);
    if (!NO_OPEN && process.platform === "win32") spawn("cmd", ["/c", "start", "", `http://localhost:${PORT}/`], { windowsHide: true });
    process.exit(0);
  }
  throw e;
});

hub.listen(PORT, async () => {
  console.log(`⚒ hub up: http://localhost:${PORT}/   (status: /api/status)`);
  await boot();
  console.log(`⚒ all set — close this window to stop every editor.`);
  if (!NO_OPEN && process.platform === "win32") spawn("cmd", ["/c", "start", "", `http://localhost:${PORT}/`], { windowsHide: true });
});

function shutdown() {
  for (const c of CHILDREN) if (c.proc) { try { c.proc.kill(); } catch {} }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
