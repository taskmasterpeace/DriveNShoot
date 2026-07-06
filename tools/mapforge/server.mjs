#!/usr/bin/env node
// MapForge — the DEATHLANDS USA map editor + REST API.
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

const save = () => writeFileSync(MAP_PATH, JSON.stringify(map));
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
	name: "MapForge API — read, build, and expand the DEATHLANDS USA map",
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
	],
	examples: [
		`curl localhost:${PORT}/api/cell?x=120\\&z=40`,
		`curl -X POST localhost:${PORT}/api/paint -d '{"biome":"forest","rect":[100,38,110,44]}'`,
		`curl -X POST localhost:${PORT}/api/towns -d '{"id":"newville","name":"NEW VILLE","pos":[-2000,5000],"kind":"ville"}'`,
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
			map.roads = map.roads.filter((r) => r.id !== body.id);
			map.roads.push({ id: body.id, kind: body.kind || "interstate", pts: body.pts });
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
			map.towns.push({ id: body.id, name: body.name, pos: body.pos, kind: body.kind || "ville", ...(body.landmark ? { landmark: body.landmark } : {}) });
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
		json(res, 404, { error: "no such endpoint", help: "/api/help" });
	} catch (e) {
		json(res, 500, { error: String(e) });
	}
});

server.listen(PORT, () => {
	console.log(`MapForge up: http://localhost:${PORT}  (editing ${MAP_PATH})`);
	console.log(`API docs:    http://localhost:${PORT}/api/help`);
});
