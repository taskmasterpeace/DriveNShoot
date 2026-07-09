#!/usr/bin/env node
// MapForge — the DIVIDED STATES USA map editor + REST API.
// One source of truth: game/data/usmap.json (the same file the game loads).
// The browser editor AND any AI agent (via curl/fetch) read and write the map
// through the same endpoints. Every mutation saves to disk immediately.
//
//   Run:    node tools/mapforge/server.mjs         (http://localhost:8899)
//   Docs:   GET /api/help    ·    tools/mapforge/API.md
//
// Zero dependencies. No purple.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MAP_PATH = process.env.USMAP_PATH || join(ROOT, "game", "data", "usmap.json");
const PORT = Number(process.env.MAPFORGE_PORT || 8899);

if (!existsSync(MAP_PATH)) {
	console.error(`No map at ${MAP_PATH} — run: node tools/mapforge/generate_usa.mjs`);
	process.exit(1);
}
let map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
// MapForge v2 (Goal 2): the AUTHORED-PLACEMENT layer — specific structures pinned
// at exact world coordinates while biomes stay procedural around them. Back-fill
// the array on old maps so every endpoint can rely on it.
if (!Array.isArray(map.placements)) map.placements = [];
// WORLD-STRUCTURES spec (§5): EXIT NODES — the content sockets on the highways.
// A node anchors ON the interstate, owns its off-ramp (and optional return ramp)
// roads, and carries the decision data (tier/archetype/services/risk).
if (!Array.isArray(map.exits)) map.exits = [];

const save = () => writeFileSync(MAP_PATH, JSON.stringify(map));

// --- The STRUCTURE CATALOG (spec §7) + EXIT BLUEPRINTS (spec §5) ------------------
const STRUCT_PATH = process.env.STRUCTURES_PATH || join(ROOT, "game", "data", "world", "structure_profiles.json");
const BLUEPRINT_PATH = join(ROOT, "game", "data", "world", "exit_blueprints.json");
let structDoc = existsSync(STRUCT_PATH)
	? JSON.parse(readFileSync(STRUCT_PATH, "utf8"))
	: { _comment: "STRUCTURE PROFILES — created by MapForge", structures: [] };
if (!Array.isArray(structDoc.structures)) structDoc.structures = [];
const saveStructures = () => writeFileSync(STRUCT_PATH, JSON.stringify(structDoc, null, 2) + "\n");
const blueprints = existsSync(BLUEPRINT_PATH)
	? JSON.parse(readFileSync(BLUEPRINT_PATH, "utf8")).exit_archetypes || []
	: [];
const FOOTPRINTS = ["small_rect", "medium_rect", "large_rect", "compound", "landmark"];

// Mirror of the engine's DrivnStructure.validate() — the row must be LAWFUL.
function validateStructure(s) {
	const bad = [];
	if (!s.id || !/^[a-z][a-z0-9_]*$/.test(s.id)) bad.push("id must be snake_case");
	if (!s.display_name) bad.push("display_name required");
	if (!s.sign_glyph) bad.push("sign_glyph required (§18)");
	if (!Array.isArray(s.allowed_tiers) || !s.allowed_tiers.length) bad.push("allowed_tiers required");
	if (!Array.isArray(s.districts) || !s.districts.length) bad.push("districts required");
	if (!FOOTPRINTS.includes(s.footprint)) bad.push(`footprint must be one of ${FOOTPRINTS.join("|")}`);
	if (!Array.isArray(s.footprint_m) || s.footprint_m.length < 2 || s.footprint_m[0] < 2 || s.footprint_m[1] < 2)
		bad.push("footprint_m must be [w>=2, d>=2] metres");
	const jobs = (s.loot_table || "") !== "" || (s.npc_jobs || []).length || (s.law_hooks || []).length || (s.event_hooks || []).length;
	if (!jobs) bad.push("no JOB: needs loot_table, npc_jobs, law_hooks, or event_hooks (§9 multi-use rule)");
	return bad;
}

// Walk `dist` metres along a road's polyline from its nearest point to `from`.
// Returns a world point — where the RETURN RAMP rejoins the highway.
function pointAlong(road, from, dist) {
	// find the segment + t of the closest point
	let segI = 0, segT = 0, bestD = Infinity;
	for (let i = 0; i + 1 < road.pts.length; i++) {
		const a = road.pts[i], b = road.pts[i + 1];
		const abx = b[0] - a[0], abz = b[1] - a[1];
		const l2 = abx * abx + abz * abz || 1e-4;
		const t = Math.max(0, Math.min(1, ((from[0] - a[0]) * abx + (from[1] - a[1]) * abz) / l2));
		const q = [a[0] + abx * t, a[1] + abz * t];
		const d = Math.hypot(from[0] - q[0], from[1] - q[1]);
		if (d < bestD) { bestD = d; segI = i; segT = t; }
	}
	// walk forward from (segI, segT)
	let remaining = dist;
	let i = segI, t = segT;
	while (i + 1 < road.pts.length) {
		const a = road.pts[i], b = road.pts[i + 1];
		const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
		const left = segLen * (1 - t);
		if (remaining <= left || i + 2 >= road.pts.length) {
			const nt = Math.min(1, t + remaining / (segLen || 1e-4));
			return [a[0] + (b[0] - a[0]) * nt, a[1] + (b[1] - a[1]) * nt];
		}
		remaining -= left;
		i++; t = 0;
	}
	return road.pts[road.pts.length - 1];
}

// Town-template stamper (Goal 2c): a named cluster of placements dropped around a
// point in one call — the primitive that turns "a dot on the map" into a place.
// d = [dx, dz] metres from the anchor. Keep these buildable-anywhere and small.
const TEMPLATES = {
	waystation: [ { building: "gas_station", d: [0, 0] }, { building: "market_stall", d: [16, 6] } ],
	hamlet: [ { building: "ruined_house", d: [-14, -8] }, { building: "ruined_house", d: [12, -10] },
		{ building: "safehouse", d: [0, 12] }, { building: "market_stall", d: [18, 4] } ],
	outpost: [ { building: "safehouse", d: [0, 0] }, { building: "gas_station", d: [-20, 8] } ],
};

// The nearest point on ANY interstate to a world point → {roadId, point, dist}.
function nearestInterstate(px, pz) {
	let best = null, bestD = Infinity;
	for (const r of map.roads) {
		if (r.kind && r.kind !== "interstate") continue; // exits/ramps don't spawn exits
		for (let i = 0; i + 1 < r.pts.length; i++) {
			const a = r.pts[i], b = r.pts[i + 1];
			const abx = b[0] - a[0], abz = b[1] - a[1];
			const l2 = abx * abx + abz * abz || 1e-4;
			const t = Math.max(0, Math.min(1, ((px - a[0]) * abx + (pz - a[1]) * abz) / l2));
			const q = [a[0] + abx * t, a[1] + abz * t];
			const d = Math.hypot(px - q[0], pz - q[1]);
			if (d < bestD) { bestD = d; best = { roadId: r.id, point: q, dist: d }; }
		}
	}
	return best;
}
const inGrid = (x, z) => x >= 0 && x < map.w && z >= 0 && z < map.h;
const setCell = (layer, x, z, ch) => {
	const rows = layer === "states" ? map.states_grid : map.grid;
	rows[z] = rows[z].substring(0, x) + ch + rows[z].substring(x + 1);
};
const worldToCell = (wx, wz) => [
	Math.floor((wx - map.world_offset[0]) / map.cell_m),
	Math.floor((wz - map.world_offset[1]) / map.cell_m),
];
const cellToWorld = (x, z) => [
	map.world_offset[0] + (x + 0.5) * map.cell_m,
	map.world_offset[1] + (z + 0.5) * map.cell_m,
];

const HELP = {
	name: "MapForge API — read, build, and expand the DIVIDED STATES USA map",
	file: "game/data/usmap.json (saved on every mutation; the game loads it at boot)",
	coordinates: {
		cell: "x: 0..w-1 (west→east), z: 0..h-1 (north→south)",
		world: "meters; world = world_offset + cell * cell_m; the game's Vector3(x, ·, z)",
	},
	biomes: "see GET /api/meta legend — chars: . ocean, w water, F forest, f scrub, p plains, a farmland, d desert, m mountains, s swamp, u urban",
	endpoints: [
		"GET  /api/help                         → this document",
		"GET  /api/meta                         → dims, scale, legends, road/town counts (no grids — cheap)",
		"GET  /api/map                          → the entire map JSON",
		"GET  /api/grid?layer=biomes|states     → {rows: [...]} the raw char grid",
		"GET  /api/cell?x=&z=  (or ?wx=&wz= world meters) → biome/state/world pos/nearest road+town",
		"PUT  /api/cell        {x, z, biome}    → paint one cell (biome = legend char or name)",
		"POST /api/paint       {biome, cells: [[x,z],...]} or {biome, rect: [x0,z0,x1,z1]} → bulk paint",
		"GET  /api/roads                        → all roads",
		"POST /api/roads       {id, kind?, pts: [[wx,wz],...]} → add or replace a road by id",
		"DELETE /api/roads?id=I-99              → remove a road",
		"GET  /api/towns                        → all towns",
		"POST /api/towns       {id, name, pos: [wx,wz], kind?, landmark?} → add or replace a town",
		"DELETE /api/towns?id=vegas             → remove a town",
		"GET  /api/query?wx=&wz=&r=2000         → everything within r meters of a world point",
		"GET  /api/placements                   -> all authored structure placements",
		"POST /api/placements  {id?, building, pos:[wx,wz], rot?} -> pin a structure (biomes stay procedural around it)",
		"DELETE /api/placements?id=safehouse-1  -> remove a placement",
		"POST /api/exit        {town} or {pos:[wx,wz], name?} -> auto-build an OFF-RAMP from the nearest interstate to a town/point (kind:'exit') [v1 — prefer /api/exits]",
		"POST /api/stamp_template {template, town} or {template, pos, name?} -> drop a cluster of placements (templates: waystation|hamlet|outpost)",
		"GET  /api/exits                        -> EXIT NODES (spec §5) + archetype blueprints",
		"POST /api/exits       {dest:[wx,wz] or town, name?, archetype?, highway_id?, community_tier?, has_return_ramp?} -> create an exit node: anchors on the highway, builds off-ramp (+ return ramp), numbers itself",
		"DELETE /api/exits?id=I-95_X1           -> remove the node AND its ramp roads",
		"GET  /api/structures                   -> the STRUCTURE CATALOG (spec §7 rows; created, not placed)",
		"POST /api/structures  {full row}       -> add/replace a structure profile (validated: the §9 JOB rule)",
		"DELETE /api/structures?id=gas_station_small -> remove a profile row",
	],
	examples: [
		`curl localhost:${PORT}/api/cell?x=120\\&z=40`,
		`curl -X POST localhost:${PORT}/api/paint -d '{"biome":"forest","rect":[100,38,110,44]}'`,
		`curl -X POST localhost:${PORT}/api/towns -d '{"id":"newville","name":"NEW VILLE","pos":[-2000,5000],"kind":"holdout"}'`,
	],
	guardrails: [
		"keep cell (120,40) region VIRGINIA forest — the authored Meridian/I-9 zone lives at world (-60..220, -440..460)",
		"paint water as 'w' cells; roads crossing water become bridges automatically in-game",
		"'.' (ocean) marks the world edge — keep the coastline closed",
	],
};

function biomeChar(v) {
	if (v in map.legend) return v; // already a char
	for (const [ch, name] of Object.entries(map.legend)) if (name === v) return ch;
	return null;
}

function cellInfo(x, z) {
	if (!inGrid(x, z)) return { error: "out of grid", x, z, w: map.w, h: map.h };
	const [wx, wz] = cellToWorld(x, z);
	const bch = map.grid[z][x];
	const sch = map.states_grid[z][x];
	let road = null, roadD = Infinity;
	for (const r of map.roads)
		for (let i = 0; i + 1 < r.pts.length; i++) {
			const d = segDist(wx, wz, r.pts[i], r.pts[i + 1]);
			if (d < roadD) { roadD = d; road = r.id; }
		}
	let town = null, townD = Infinity;
	for (const t of map.towns) {
		const d = Math.hypot(t.pos[0] - wx, t.pos[1] - wz);
		if (d < townD) { townD = d; town = t; }
	}
	return {
		cell: [x, z], world: [wx, wz],
		biome: map.legend[bch], biome_char: bch,
		state: sch === "." ? null : map.state_legend[sch],
		nearest_road: road ? { id: road, dist_m: Math.round(roadD) } : null,
		nearest_town: town ? { id: town.id, name: town.name, dist_m: Math.round(townD) } : null,
	};
}

function segDist(px, pz, a, b) {
	const abx = b[0] - a[0], abz = b[1] - a[1];
	const len2 = abx * abx + abz * abz;
	if (len2 < 1e-4) return Math.hypot(px - a[0], pz - a[1]);
	const t = Math.max(0, Math.min(1, ((px - a[0]) * abx + (pz - a[1]) * abz) / len2));
	return Math.hypot(px - (a[0] + abx * t), pz - (a[1] + abz * t));
}

const json = (res, code, obj) => {
	res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
	res.end(JSON.stringify(obj));
};

const server = createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);
	const q = url.searchParams;
	let body = null;
	if (req.method === "POST" || req.method === "PUT") {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
		catch { return json(res, 400, { error: "bad JSON body" }); }
	}

	try {
		// ---- static editor ----
		if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html"))
			return res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(join(HERE, "index.html")));

		// ---- API ----
		if (url.pathname === "/api/help") return json(res, 200, HELP);
		if (url.pathname === "/api/meta")
			return json(res, 200, {
				name: map.name, version: map.version, compression: map.compression,
				cell_m: map.cell_m, world_offset: map.world_offset, w: map.w, h: map.h,
				legend: map.legend, state_legend: map.state_legend,
				roads: map.roads.length, towns: map.towns.length,
				world_km: [map.w * map.cell_m / 1000, map.h * map.cell_m / 1000],
			});
		if (url.pathname === "/api/map") return json(res, 200, map);
		if (url.pathname === "/api/grid") {
			const layer = q.get("layer") || "biomes";
			return json(res, 200, { layer, rows: layer === "states" ? map.states_grid : map.grid });
		}
		if (url.pathname === "/api/cell" && req.method === "GET") {
			let x = q.has("x") ? Number(q.get("x")) : null;
			let z = q.has("z") ? Number(q.get("z")) : null;
			if (q.has("wx")) [x, z] = worldToCell(Number(q.get("wx")), Number(q.get("wz")));
			return json(res, 200, cellInfo(x, z));
		}
		if (url.pathname === "/api/cell" && req.method === "PUT") {
			const ch = biomeChar(body.biome);
			if (!ch) return json(res, 400, { error: `unknown biome '${body.biome}'`, legend: map.legend });
			if (!inGrid(body.x, body.z)) return json(res, 400, { error: "out of grid" });
			setCell("biomes", body.x, body.z, ch);
			save();
			return json(res, 200, cellInfo(body.x, body.z));
		}
		if (url.pathname === "/api/paint" && req.method === "POST") {
			const ch = biomeChar(body.biome);
			if (!ch) return json(res, 400, { error: `unknown biome '${body.biome}'`, legend: map.legend });
			let painted = 0;
			if (Array.isArray(body.cells))
				for (const [x, z] of body.cells) { if (inGrid(x, z)) { setCell("biomes", x, z, ch); painted++; } }
			else if (Array.isArray(body.rect)) {
				const [x0, z0, x1, z1] = body.rect.map(Number);
				for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
					for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
						if (inGrid(x, z)) { setCell("biomes", x, z, ch); painted++; }
			} else return json(res, 400, { error: "need cells:[[x,z],...] or rect:[x0,z0,x1,z1]" });
			save();
			return json(res, 200, { painted, biome: map.legend[ch] });
		}
		if (url.pathname === "/api/roads" && req.method === "GET") return json(res, 200, map.roads);
		if (url.pathname === "/api/roads" && req.method === "POST") {
			if (!body.id || !Array.isArray(body.pts) || body.pts.length < 2)
				return json(res, 400, { error: "need id and pts:[[wx,wz],...] (>=2)" });
			// PRESERVE THE ROAD'S CHARACTER (danger/family/nickname/toll): editing a
			// road's points must never strip its identity (the old handler did).
			const prev = map.roads.find((r) => r.id === body.id) || {};
			map.roads = map.roads.filter((r) => r.id !== body.id);
			// ROAD OVERHAUL: lanes (6/4/2) + divided are part of a road's CHARACTER
			// too — preserved on edit, same law as danger/nickname/toll.
			const kind = body.kind ?? prev.kind ?? "interstate";
			const lanes = body.lanes ?? prev.lanes ?? (kind === "interstate" ? 4 : 2);
			map.roads.push({
				id: body.id, kind, pts: body.pts,
				danger: body.danger ?? prev.danger ?? 0, family: body.family ?? prev.family ?? "",
				nickname: body.nickname ?? prev.nickname ?? "", ...(body.toll ?? prev.toll ? { toll: body.toll ?? prev.toll } : {}),
				lanes, divided: body.divided ?? prev.divided ?? lanes >= 6,
			});
			save();
			return json(res, 200, { ok: true, roads: map.roads.length });
		}
		if (url.pathname === "/api/roads" && req.method === "DELETE") {
			const n = map.roads.length;
			map.roads = map.roads.filter((r) => r.id !== q.get("id"));
			save();
			return json(res, 200, { removed: n - map.roads.length });
		}
		if (url.pathname === "/api/towns" && req.method === "GET") return json(res, 200, map.towns);
		if (url.pathname === "/api/towns" && req.method === "POST") {
			if (!body.id || !body.name || !Array.isArray(body.pos))
				return json(res, 400, { error: "need id, name, pos:[wx,wz]" });
			map.towns = map.towns.filter((t) => t.id !== body.id);
			map.towns.push({ id: body.id, name: body.name, pos: body.pos, kind: body.kind || "holdout", ...(body.landmark ? { landmark: body.landmark } : {}) });
			save();
			return json(res, 200, { ok: true, towns: map.towns.length });
		}
		if (url.pathname === "/api/towns" && req.method === "DELETE") {
			const n = map.towns.length;
			map.towns = map.towns.filter((t) => t.id !== q.get("id"));
			save();
			return json(res, 200, { removed: n - map.towns.length });
		}
		if (url.pathname === "/api/query") {
			const wx = Number(q.get("wx")), wz = Number(q.get("wz")), r = Number(q.get("r") || 2000);
			const [cx, cz] = worldToCell(wx, wz);
			const here = cellInfo(cx, cz);
			const towns = map.towns.filter((t) => Math.hypot(t.pos[0] - wx, t.pos[1] - wz) <= r);
			const roads = map.roads.filter((rd) => rd.pts.some((_, i) => i + 1 < rd.pts.length && segDist(wx, wz, rd.pts[i], rd.pts[i + 1]) <= r)
			);
			return json(res, 200, { here, radius_m: r, towns, roads: roads.map((x) => x.id) });
		}
		// ---- THE JUNCTION BAKE (AMERICAN_ROAD M1, rulings 0.2-0.5) ----
		if (url.pathname === "/api/junctions/bake" && req.method === "POST") {
			const { bakeJunctions } = await import("./bake_junctions.mjs");
			const { junctions, lint } = bakeJunctions(map);
			save();
			return json(res, 200, { ok: true, junctions: junctions.length, lint });
		}
		if (url.pathname === "/api/junctions" && req.method === "GET")
			return json(res, 200, map.junctions || []);
		// ---- authored placements (Goal 2b) ----
		if (url.pathname === "/api/placements" && req.method === "GET") return json(res, 200, map.placements);
		if (url.pathname === "/api/placements" && req.method === "POST") {
			if (!body.building || !Array.isArray(body.pos))
				return json(res, 400, { error: "need building and pos:[wx,wz]" });
			// M0 placement-id validation (AMERICAN_ROAD): the id must be a structure
			// catalog row, a known migration alias, or a legacy massing-box id —
			// anything else is a typo the game would silently box-fallback forever.
			const LEGACY = new Set(["safehouse", "gas_station", "ruined_house", "market_stall"]);
			const catalog = new Set((structDoc.structures || []).map((s) => s.id));
			if (!catalog.has(body.building) && !LEGACY.has(body.building))
				return json(res, 400, { error: `unknown building '${body.building}' — not in structure_profiles.json (${catalog.size} rows) or the legacy set`, known: [...catalog].sort() });
			const id = body.id || `${body.building}-${map.placements.length + 1}`;
			map.placements = map.placements.filter((p) => p.id !== id);
			map.placements.push({ id, building: body.building, pos: body.pos, rot: Number(body.rot || 0) });
			save();
			return json(res, 200, { ok: true, id, placements: map.placements.length });
		}
		if (url.pathname === "/api/placements" && req.method === "DELETE") {
			const n = map.placements.length;
			map.placements = map.placements.filter((p) => p.id !== q.get("id"));
			save();
			return json(res, 200, { removed: n - map.placements.length });
		}

		// ---- EXIT NODES (spec §5): the content sockets the owner ARRANGES ----------
		if (url.pathname === "/api/exits" && req.method === "GET")
			return json(res, 200, { exits: map.exits, archetypes: blueprints });
		if (url.pathname === "/api/exits" && req.method === "POST") {
			// Accept {dest:[wx,wz]} or {town:"id"}; the node ANCHORS on the nearest
			// interstate (or the named highway) and builds its own ramp roads.
			let dest = body.dest || body.pos, label = body.name;
			if (body.town) {
				const t = map.towns.find((x) => x.id === body.town);
				if (!t) return json(res, 400, { error: `no town '${body.town}'` });
				dest = t.pos; label = label || t.name;
			}
			if (!Array.isArray(dest)) return json(res, 400, { error: "need dest:[wx,wz] (or town)" });
			const arch = blueprints.find((a) => a.id === (body.archetype || "service"));
			if (!arch) return json(res, 400, { error: `unknown archetype '${body.archetype}'`, archetypes: blueprints.map((a) => a.id) });
			let near = null;
			if (body.highway_id) {
				const road = map.roads.find((r) => r.id === body.highway_id);
				if (!road) return json(res, 400, { error: `no highway '${body.highway_id}'` });
				let bestD = Infinity;
				for (let i = 0; i + 1 < road.pts.length; i++) {
					const a = road.pts[i], b = road.pts[i + 1];
					const abx = b[0] - a[0], abz = b[1] - a[1];
					const l2 = abx * abx + abz * abz || 1e-4;
					const t = Math.max(0, Math.min(1, ((dest[0] - a[0]) * abx + (dest[1] - a[1]) * abz) / l2));
					const q = [a[0] + abx * t, a[1] + abz * t];
					const d = Math.hypot(dest[0] - q[0], dest[1] - q[1]);
					if (d < bestD) { bestD = d; near = { roadId: road.id, point: q, dist: d }; }
				}
			} else near = nearestInterstate(dest[0], dest[1]);
			if (!near) return json(res, 400, { error: "no interstate to anchor on" });
			const highway = near.roadId;
			const number = body.exit_number ?? (map.exits.filter((e) => e.highway_id === highway).length + 1);
			const exid = body.id || `${highway}_X${number}`;
			const name = label || `${arch.name} ${number}`;
			const wantReturn = body.has_return_ramp !== false; // default: a real interchange
			// The ramps are ROADS (kind 'exit') — the game's road pipeline already
			// materializes and road_near()s them. The node OWNS their ids.
			const rampIds = [];
			const offId = `${exid}-off`;
			map.roads = map.roads.filter((r) => r.id !== offId);
			map.roads.push({ id: offId, kind: "exit", pts: [near.point, dest], danger: arch.danger ?? 1, family: "", nickname: "" });
			rampIds.push(offId);
			if (wantReturn) {
				const onId = `${exid}-on`;
				const rejoin = pointAlong(map.roads.find((r) => r.id === highway), near.point, Number(body.return_gap_m || 180));
				map.roads = map.roads.filter((r) => r.id !== onId);
				map.roads.push({ id: onId, kind: "exit", pts: [dest, rejoin], danger: arch.danger ?? 1, family: "", nickname: "" });
				rampIds.push(onId);
			}
			const node = {
				id: exid, highway_id: highway, exit_number: number, name,
				archetype: arch.id, community_tier: body.community_tier || arch.tier_default,
				service_tags: body.service_tags || arch.service_tags || [],
				risk_rating: body.risk_rating ?? arch.danger ?? 1,
				has_return_ramp: wantReturn, known_to_player: body.known_to_player ?? true,
				pos: near.point.map((v) => Math.round(v * 100) / 100), dest, ramp_ids: rampIds,
			};
			map.exits = map.exits.filter((e) => e.id !== exid);
			map.exits.push(node);
			save();
			return json(res, 200, { ok: true, exit: node, ramp_length_m: Math.round(near.dist) });
		}
		if (url.pathname === "/api/exits" && req.method === "DELETE") {
			const ex = map.exits.find((e) => e.id === q.get("id"));
			if (!ex) return json(res, 404, { error: `no exit '${q.get("id")}'` });
			map.exits = map.exits.filter((e) => e.id !== ex.id);
			map.roads = map.roads.filter((r) => !(ex.ramp_ids || []).includes(r.id)); // the ramps go with it
			save();
			return json(res, 200, { removed: ex.id, ramps_removed: (ex.ramp_ids || []).length });
		}

		// ---- STRUCTURE CATALOG (spec §7): the owner CREATES buildings here ---------
		// (created ≠ placed — placement waits until the roads are arranged.)
		if (url.pathname === "/api/structures" && req.method === "GET")
			return json(res, 200, { structures: structDoc.structures, footprints: FOOTPRINTS });
		if (url.pathname === "/api/structures" && req.method === "POST") {
			const s = {
				id: body.id, category: body.category || "service", display_name: body.display_name || "",
				sign_glyph: body.sign_glyph || "", allowed_tiers: body.allowed_tiers || [],
				districts: body.districts || [], footprint: body.footprint || "small_rect",
				footprint_m: body.footprint_m || [10, 8], floors: Number(body.floors || 1),
				enterable: body.enterable !== false, entrances: body.entrances || [],
				interior_template: body.interior_template || "none", loot_table: body.loot_table || "",
				npc_jobs: body.npc_jobs || [], law_hooks: body.law_hooks || [],
				event_hooks: body.event_hooks || [], faction_overrides: body.faction_overrides || [],
				power_required: !!body.power_required, can_be_safehouse: !!body.can_be_safehouse,
				danger: Number(body.danger || 1),
			};
			const bad = validateStructure(s);
			if (bad.length) return json(res, 400, { error: "row is not lawful", problems: bad });
			structDoc.structures = structDoc.structures.filter((x) => x.id !== s.id);
			structDoc.structures.push(s);
			saveStructures();
			return json(res, 200, { ok: true, structure: s, total: structDoc.structures.length });
		}
		if (url.pathname === "/api/structures" && req.method === "DELETE") {
			const n = structDoc.structures.length;
			structDoc.structures = structDoc.structures.filter((x) => x.id !== q.get("id"));
			saveStructures();
			return json(res, 200, { removed: n - structDoc.structures.length });
		}

		// ---- auto off-ramp: connect a town to the interstate (Goal 2a, PROOF CASE) ----
		if (url.pathname === "/api/exit" && req.method === "POST") {
			let pos = body.pos, label = body.name;
			if (body.town) {
				const t = map.towns.find((x) => x.id === body.town);
				if (!t) return json(res, 400, { error: `no town '${body.town}'` });
				pos = t.pos; label = label || t.id;
			}
			if (!Array.isArray(pos)) return json(res, 400, { error: "need town or pos:[wx,wz]" });
			const near = nearestInterstate(pos[0], pos[1]);
			if (!near) return json(res, 400, { error: "no interstate on the map to branch from" });
			const id = `EXIT-${(label || "ramp").toString().toLowerCase().replace(/[^a-z0-9]/g, "")}`;
			// The ramp runs FROM the interstate TO the town — road_near() then reaches the town.
			const ramp = { id, kind: "exit", pts: [near.point, pos] };
			map.roads = map.roads.filter((r) => r.id !== id);
			map.roads.push(ramp);
			save();
			return json(res, 200, { ok: true, ramp, from_interstate: near.roadId, length_m: Math.round(near.dist) });
		}

		// ---- town-template stamper (Goal 2c) ----
		if (url.pathname === "/api/stamp_template" && req.method === "POST") {
			const tpl = TEMPLATES[body.template];
			if (!tpl) return json(res, 400, { error: `unknown template '${body.template}'`, templates: Object.keys(TEMPLATES) });
			let anchor = body.pos, name = body.name;
			if (body.town) {
				const t = map.towns.find((x) => x.id === body.town);
				if (!t) return json(res, 400, { error: `no town '${body.town}'` });
				anchor = t.pos; name = name || t.id;
			}
			if (!Array.isArray(anchor)) return json(res, 400, { error: "need town or pos:[wx,wz]" });
			const stamped = [];
			tpl.forEach((slot, i) => {
				const p = { id: `${name || "tpl"}-${slot.building}-${i}`, building: slot.building,
					pos: [anchor[0] + slot.d[0], anchor[1] + slot.d[1]], rot: 0 };
				map.placements = map.placements.filter((x) => x.id !== p.id);
				map.placements.push(p);
				stamped.push(p);
			});
			save();
			return json(res, 200, { ok: true, template: body.template, stamped });
		}

		json(res, 404, { error: "no such endpoint", help: "/api/help" });
	} catch (e) {
		json(res, 500, { error: String(e) });
	}
});

server.listen(PORT, () => {
	console.log(`MapForge up: http://localhost:${PORT}  (editing ${MAP_PATH})`);
	console.log(`API docs:    http://localhost:${PORT}/api/help`);
});
