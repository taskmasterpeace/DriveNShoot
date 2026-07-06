#!/usr/bin/env node
// VehicleForge — the DRIVN fleet editor + REST API (MASTER_PLAN Goal 3).
// One source of truth: game/data/vehicles.json (the SAME rows DrivnData folds into
// the engine at boot). Tune stats, cargo, seats, and armor with no code — the
// browser editor AND any AI agent (curl/fetch) read/write through these endpoints.
// Every mutation saves to disk; relaunch the game to drive the change.
//
//   Run:  node tools/vehicleforge/server.mjs      (http://localhost:8898)
//   Docs: GET /api/help
//
// Zero dependencies. No purple.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const DATA = process.env.VEHICLES_PATH || join(ROOT, "game", "data", "vehicles.json");
const PORT = Number(process.env.VEHICLEFORGE_PORT || 8898);

// The body ARCHETYPES a new vehicle can be built from (ProtoCar3D.VEHICLES keys) —
// geometry is engine-side; a row picks a proven chassis and tunes the stats.
const ARCHETYPES = ["scavenger", "motorcycle", "buggy", "pickup", "van", "semi", "trailer"];
const FAMILIES = ["car", "bike", "truck", "van", "suv", "rig"];

if (!existsSync(DATA)) {
	console.error(`No fleet at ${DATA} — expected game/data/vehicles.json (Goal 1).`);
	process.exit(1);
}
let doc = JSON.parse(readFileSync(DATA, "utf8"));
if (!Array.isArray(doc.vehicles)) doc.vehicles = [];

const save = () => writeFileSync(DATA, JSON.stringify(doc, null, 2) + "\n");
const byId = (id) => doc.vehicles.find((v) => v.id === id);
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Normalize + validate a row (defaults mirror DrivnVehicle.from_dict). Returns the
// clean row or throws a message the UI/agent can show.
const KNOWN = ["id", "name", "archetype", "family", "mass", "engine_force", "top_speed",
	"reverse_top", "tire_grip", "trunk_volume", "passenger_seats", "dog_seats", "armor",
	"wound_mult", "mounts"];

function normalize(v) {
	if (!v || !v.id) throw "need an id";
	if (v.archetype && !ARCHETYPES.includes(v.archetype)) throw `unknown archetype '${v.archetype}' (valid: ${ARCHETYPES.join(", ")})`;
	const g = v.tire_grip || {}, a = v.armor || {};
	// OPEN SCHEMA: unknown keys (camper, seats, …) pass through untouched.
	const extra = Object.fromEntries(Object.entries(v).filter(([k]) => !KNOWN.includes(k)));
	return { ...extra, ...{
		id: String(v.id), name: String(v.name || v.id), archetype: String(v.archetype || v.id),
		family: FAMILIES.includes(v.family) ? v.family : "car",
		mass: num(v.mass, 1000), engine_force: num(v.engine_force, 6500),
		top_speed: num(v.top_speed, 32), reverse_top: num(v.reverse_top, 11),
		tire_grip: { front: num(g.front, 5.5), rear: num(g.rear, 5.0), dirt: num(g.dirt, 0.8) },
		trunk_volume: num(v.trunk_volume, 40), passenger_seats: Math.round(num(v.passenger_seats, 1)),
		dog_seats: Math.round(num(v.dog_seats, 0)),
		armor: { front: clamp(num(a.front, 40), 0, 100), rear: clamp(num(a.rear, 30), 0, 100), side: clamp(num(a.side, 30), 0, 100) },
		wound_mult: num(v.wound_mult, 1.0), mounts: Array.isArray(v.mounts) ? v.mounts : [],
	} };
}

const HELP = {
	name: "VehicleForge API — read and tune the DRIVN fleet (game/data/vehicles.json)",
	note: "The game folds these rows into ProtoCar3D.VEHICLES at boot (DrivnData). Relaunch to drive a change.",
	archetypes: ARCHETYPES, families: FAMILIES,
	fields: "id, name, archetype, family, mass, engine_force, top_speed, reverse_top, tire_grip{front,rear,dirt}, trunk_volume, passenger_seats, dog_seats, armor{front,rear,side} (0-100), wound_mult, mounts[]",
	endpoints: [
		"GET  /api/help                       -> this document",
		"GET  /api/vehicles                   -> the whole fleet (array of rows)",
		"GET  /api/vehicle?id=suv             -> one row",
		"GET  /api/archetypes                 -> valid body archetypes + families",
		"POST /api/vehicles  {row}            -> add or replace a vehicle by id (validated)",
		"PATCH /api/vehicle?id=suv  {fields}  -> update only the given fields of one row",
		"DELETE /api/vehicles?id=suv          -> remove a vehicle",
	],
	examples: [
		`curl localhost:${PORT}/api/vehicles`,
		`curl -X PATCH localhost:${PORT}/api/vehicle?id=suv -d '{"armor":{"front":70}}'`,
		`curl -X POST localhost:${PORT}/api/vehicles -d '{"id":"apc","name":"APC","archetype":"van","family":"suv","armor":{"front":90,"rear":80,"side":85},"engine_force":9000}'`,
	],
};

const json = (res, code, obj) => {
	res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
	res.end(JSON.stringify(obj));
};

const server = createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);
	const q = url.searchParams;
	let body = null;
	if (["POST", "PUT", "PATCH"].includes(req.method)) {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
		catch { return json(res, 400, { error: "bad JSON body" }); }
	}
	try {
		if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html"))
			return res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(join(HERE, "index.html")));
		if (url.pathname === "/api/help") return json(res, 200, HELP);
		if (url.pathname === "/api/archetypes") return json(res, 200, { archetypes: ARCHETYPES, families: FAMILIES });
		if (url.pathname === "/api/vehicles" && req.method === "GET") return json(res, 200, doc.vehicles);
		if (url.pathname === "/api/vehicle" && req.method === "GET") {
			const v = byId(q.get("id"));
			return v ? json(res, 200, v) : json(res, 404, { error: `no vehicle '${q.get("id")}'` });
		}
		if (url.pathname === "/api/vehicles" && req.method === "POST") {
			let row; try { row = normalize(body); } catch (e) { return json(res, 400, { error: String(e) }); }
			doc.vehicles = doc.vehicles.filter((v) => v.id !== row.id);
			doc.vehicles.push(row); save();
			return json(res, 200, { ok: true, row, fleet: doc.vehicles.length });
		}
		if (url.pathname === "/api/vehicle" && req.method === "PATCH") {
			const cur = byId(q.get("id"));
			if (!cur) return json(res, 404, { error: `no vehicle '${q.get("id")}'` });
			// Deep-merge tire_grip/armor so a partial {armor:{front:70}} keeps the rest.
			const merged = { ...cur, ...body,
				tire_grip: { ...cur.tire_grip, ...(body.tire_grip || {}) },
				armor: { ...cur.armor, ...(body.armor || {}) } };
			let row; try { row = normalize(merged); } catch (e) { return json(res, 400, { error: String(e) }); }
			doc.vehicles = doc.vehicles.map((v) => (v.id === row.id ? row : v)); save();
			return json(res, 200, { ok: true, row });
		}
		// --- PROVING GROUNDS integration ---
		if (url.pathname === "/api/laptimes") {
			const p = join(ROOT, "game", "data", "laptimes.json");
			if (!existsSync(p)) return json(res, 200, { laps: {} });
			return json(res, 200, JSON.parse(readFileSync(p, "utf8")));
		}
		if (url.pathname === "/api/testdrive" && req.method === "POST") {
			if (!byId(body.id)) return json(res, 404, { error: `no vehicle '${body.id}'` });
			const godot = process.env.GODOT_EXE || "C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64.exe";
			if (!existsSync(godot)) return json(res, 400, { error: `Godot not found at ${godot} — set GODOT_EXE` });
			const child = spawn(godot, ["--path", join(ROOT, "game"), "res://proto3d/track/track.tscn", "--", `vehicle=${body.id}`],
				{ detached: true, stdio: "ignore" });
			child.unref();
			return json(res, 200, { ok: true, launched: body.id, track: "proving grounds" });
		}
		if (url.pathname === "/api/vehicles" && req.method === "DELETE") {
			const n = doc.vehicles.length;
			doc.vehicles = doc.vehicles.filter((v) => v.id !== q.get("id")); save();
			return json(res, 200, { removed: n - doc.vehicles.length });
		}
		json(res, 404, { error: "no such endpoint", help: "/api/help" });
	} catch (e) { json(res, 500, { error: String(e) }); }
});

server.listen(PORT, () => {
	console.log(`VehicleForge up: http://localhost:${PORT}  (editing ${DATA})`);
	console.log(`API docs:        http://localhost:${PORT}/api/help`);
});
