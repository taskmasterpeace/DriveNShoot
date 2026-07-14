#!/usr/bin/env node
// THE SHOWROOM — the DRIVN visual-QA gallery + REST API (:8901).
// Every VEHICLE row (ProtoCar3D.VEHICLES, folded w/ data/vehicles.json) and every
// STRUCTURE row (data/world/structure_profiles.json) gets rendered to PNG from
// useful angles by game/proto3d/tools/showroom.gd (a real-GPU, non-headless
// Godot stage — headless hangs forever on RenderingServer.frame_post_draw, the
// same law as render_body.gd/render_structures.gd/render_creatures.gd). This
// server just shows the pictures and can re-shoot them.
//
//   node tools/showroom/server.mjs         (http://localhost:8901)
//   Docs: GET /api/help
//
// Zero deps — node builtins only, same as motionforge.

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { dirname, join, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runShowroom } from "./run.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const RENDERS = join(ROOT, "docs", "renders", "showroom");
const MANIFEST = join(RENDERS, "manifest.json");
const PORT = Number(process.env.SHOWROOM_PORT || 8901);
const MIME = { ".png": "image/png", ".json": "application/json" };

// ---------- re-render job state (the UI polls GET /api/status) ----------
let busy = false;
let log = [];
const pushLog = (s) => {
	for (const line of String(s).split(/\r?\n/)) {
		if (!line.trim()) continue;
		log.push(line);
		if (log.length > 200) log.shift();
	}
};

function readManifest() {
	if (!existsSync(MANIFEST)) return { count: 0, shots: [], generated: null, mode: null };
	try { return JSON.parse(readFileSync(MANIFEST, "utf8")); }
	catch { return { count: 0, shots: [], generated: null, mode: null, error: "manifest failed to parse" }; }
}

// res://<category>/<file>.png <-> disk, path-escape guarded.
function imgPath(rel) {
	const full = resolve(RENDERS, rel);
	if (!full.startsWith(resolve(RENDERS) + sep) && full !== resolve(RENDERS)) throw new Error("path escapes docs/renders/showroom");
	return full;
}

const json = (res, code, obj) => {
	res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
	res.end(JSON.stringify(obj));
};

const HELP = {
	tool: "THE SHOWROOM",
	what: "A visual render gallery for every VEHICLE + STRUCTURE data row — the owner's law: a green sim proves structure, never looks. Look at the pictures.",
	endpoints: {
		"GET /": "the gallery page",
		"GET /api/manifest": "the current render manifest (rows + angle lists)",
		"GET /img/<category>/<file>.png": "a rendered PNG (category: vehicles | structures)",
		"GET /api/status": "{busy, log} — poll while a re-render runs",
		"POST /api/rerender {mode}": "mode: vehicles | structures | all (default all) — shells the SAME Godot stage as SHOWROOM.bat",
	},
	source: "game/proto3d/tools/showroom.gd + showroom.tscn — headless coverage proof: game/proto3d/tests/showroom_sim.gd",
};

const server = createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);
	let body = null;
	if (req.method === "POST") {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
		catch { return json(res, 400, { error: "bad JSON body" }); }
	}
	try {
		if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html"))
			return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(join(HERE, "index.html")));

		if (url.pathname === "/api/help") return json(res, 200, HELP);

		if (url.pathname === "/api/manifest" && req.method === "GET")
			return json(res, 200, readManifest());

		if (url.pathname === "/api/status" && req.method === "GET")
			return json(res, 200, { busy, log: log.slice(-60), manifest: readManifest() });

		if (url.pathname.startsWith("/img/") && req.method === "GET") {
			let p;
			try { p = imgPath(decodeURIComponent(url.pathname.slice(5))); } catch { return json(res, 403, { error: "forbidden" }); }
			if (!existsSync(p) || !statSync(p).isFile()) return json(res, 404, { error: "no such render" });
			res.writeHead(200, { "content-type": MIME[extname(p).toLowerCase()] || "application/octet-stream",
				"content-length": statSync(p).size, "cache-control": "no-cache" });
			return createReadStream(p).pipe(res);
		}

		if (url.pathname === "/api/rerender" && req.method === "POST") {
			if (busy) return json(res, 409, { error: "a render is already running — poll /api/status" });
			const mode = ["vehicles", "structures", "all"].includes(body?.mode) ? body.mode : "all";
			busy = true; log = [];
			pushLog(`SHOWROOM: re-render requested (mode=${mode})`);
			runShowroom(mode, pushLog)
				.catch((e) => pushLog(`SHOWROOM: FAILED — ${e.message || e}`))
				.finally(() => { busy = false; });
			return json(res, 200, { ok: true, launched: mode });
		}

		json(res, 404, { error: "no such endpoint", help: "/api/help" });
	} catch (e) { json(res, 500, { error: String(e) }); }
});

server.listen(PORT, () => {
	console.log(`THE SHOWROOM up: http://localhost:${PORT}   (renders: ${RENDERS.replaceAll(sep, "/")})`);
	console.log(`API docs:        http://localhost:${PORT}/api/help`);
});
