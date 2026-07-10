#!/usr/bin/env node
// MapForge v4 — the DIVIDED STATES USA road & world editor + REST API.
// One source of truth: game/data/usmap.json (the same file the game loads).
// The browser editor AND any AI agent (via curl/fetch) read and write the map
// through the same endpoints. Every mutation saves to disk immediately.
//
//   Run:    node tools/mapforge/server.mjs         (http://localhost:8899)
//   Docs:   GET /api/help    ·    tools/mapforge/API.md
//
// v4 (2026-07-10, the road-editor goal): field-PRESERVING road writes (surface/
// side/geom survive edits), milepost-law exit numbering (mirrors usmap.gd
// EXIT_MILE_M), districts, the shared PLAN layer, /api/route drive-time (a port
// of road_graph.gd), /api/vehicles read live from car_3d.gd.
//
// Zero dependencies. No purple.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MAP_PATH = process.env.USMAP_PATH || join(ROOT, "game", "data", "usmap.json");
const PORT = Number(process.env.MAPFORGE_PORT || process.env.PORT || 8899);

if (!existsSync(MAP_PATH)) {
	console.error(`No map at ${MAP_PATH} — run: node tools/mapforge/generate_usa.mjs`);
	process.exit(1);
}
let map = null, mapMtime = 0;
function readMap() {
	map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
	// Back-fill arrays so every endpoint can rely on them (old maps).
	if (!Array.isArray(map.placements)) map.placements = [];
	if (!Array.isArray(map.exits)) map.exits = [];
	// v4: DISTRICTS — named polygon areas (downtown, port, combat zone...). The game
	// ignores unknown top-level keys today; territory/heat systems consume these later.
	if (!Array.isArray(map.districts)) map.districts = [];
	mapMtime = statSync(MAP_PATH).mtimeMs;
}
readMap();

const save = () => { writeFileSync(MAP_PATH, JSON.stringify(map)); mapMtime = statSync(MAP_PATH).mtimeMs; };
// THE MULTI-WRITER GUARD (v4): the FORGE hub's MapForge, a preview instance, and
// any curl-driving AI may run at once — all against ONE disk file. Before every
// request, a cheap stat detects an external write and re-reads, so no process
// ever clobbers another's edits with a stale in-memory map. (Last write inside
// the same millisecond still wins — one human editor at a time is the intended
// mode; this guard is for the tool/AI/hub trio, not real-time co-editing.)
function syncFromDisk() {
	try {
		if (statSync(MAP_PATH).mtimeMs !== mapMtime) { readMap(); invalidateGraph(); }
	} catch { /* transient mid-write stat — next request catches up */ }
}

// --- THE PLAN LAYER (v4): shared owner+AI TODO pins. A SIDECAR file — never
// game data, so the game file stays lean and the plan can be chatty.
const PLAN_PATH = process.env.MAP_PLAN_PATH || join(ROOT, "game", "data", "world", "map_plan.json");
let plan = existsSync(PLAN_PATH)
	? JSON.parse(readFileSync(PLAN_PATH, "utf8"))
	: { _comment: "MapForge PLAN layer — shared owner/AI map TODOs. Not game data.", notes: [] };
if (!Array.isArray(plan.notes)) plan.notes = [];
const savePlan = () => writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2) + "\n");

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

// ---- geometry helpers -------------------------------------------------------------
function segDist(px, pz, a, b) {
	const abx = b[0] - a[0], abz = b[1] - a[1];
	const len2 = abx * abx + abz * abz;
	if (len2 < 1e-4) return Math.hypot(px - a[0], pz - a[1]);
	const t = Math.max(0, Math.min(1, ((px - a[0]) * abx + (pz - a[1]) * abz) / len2));
	return Math.hypot(px - (a[0] + abx * t), pz - (a[1] + abz * t));
}

// Nearest projection of `p` onto a road's polyline → {arc, total, pos, dist}.
// arc is measured from pts[0] — the SAME convention the junction bake's leg
// arc_m uses, so graph math and mileposts can share this.
function roadArcInfo(road, p) {
	let acc = 0, best = { d: Infinity, arc: 0, pos: road.pts[0] };
	for (let i = 0; i + 1 < road.pts.length; i++) {
		const a = road.pts[i], b = road.pts[i + 1];
		const abx = b[0] - a[0], abz = b[1] - a[1];
		const l2 = abx * abx + abz * abz || 1e-4;
		const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2));
		const q = [a[0] + abx * t, a[1] + abz * t];
		const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
		const seg = Math.sqrt(l2);
		if (d < best.d) best = { d, arc: acc + seg * t, pos: q };
		acc += seg;
	}
	return { arc: best.arc, total: acc, pos: best.pos, dist: best.d };
}

// Slice a road's polyline between two arc positions → real geometry for a route.
function slicePolyline(road, arc0, arc1) {
	const lo = Math.min(arc0, arc1), hi = Math.max(arc0, arc1);
	const out = [];
	let acc = 0;
	for (let i = 0; i + 1 < road.pts.length; i++) {
		const a = road.pts[i], b = road.pts[i + 1];
		const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-4;
		const s0 = acc, s1 = acc + seg;
		if (s1 >= lo && s0 <= hi) {
			const t0 = Math.max(0, (lo - s0) / seg), t1 = Math.min(1, (hi - s0) / seg);
			const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
			const p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
			if (!out.length) out.push(p0);
			out.push(p1);
		}
		acc = s1;
	}
	if (arc0 > arc1) out.reverse();
	return out;
}

// Walk `dist` metres along a road's polyline from its nearest point to `from`.
// Returns a world point — where the RETURN RAMP rejoins the highway.
function pointAlong(road, from, dist) {
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

// ---- THE ADDRESS LAW (mirror of usmap.gd EXIT_MILE_M — keep in sync) --------------
// Exit numbers are MILEPOSTS from the highway's south/west origin: one number
// per EXIT_MILE_M game-mile. MERIDIAN = I-95 EXIT 9 is the canon anchor.
const EXIT_MILE_M = 2395.0;

function milepostNumber(road, anchorPoint) {
	const { arc, total } = roadArcInfo(road, anchorPoint);
	const xs = road.pts.map((q) => q[0]), zs = road.pts.map((q) => q[1]);
	const spanX = Math.max(...xs) - Math.min(...xs), spanZ = Math.max(...zs) - Math.min(...zs);
	const first = road.pts[0], last = road.pts[road.pts.length - 1];
	// N-S route → origin at the SOUTHERN end (larger z; the map runs north→south
	// as z grows). E-W route → origin at the WESTERN end (smaller x).
	const originIsFirst = spanZ >= spanX ? first[1] >= last[1] : first[0] <= last[0];
	const fromOrigin = originIsFirst ? arc : total - arc;
	let n = Math.max(1, Math.round(fromOrigin / EXIT_MILE_M));
	const taken = new Set(map.exits.filter((e) => e.highway_id === road.id).map((e) => Number(e.exit_number)));
	while (taken.has(n)) n++; // real interstates do 9A/9B; we bump — numbers stay unique ints
	return n;
}

// ---- THE ROAD GRAPH (port of game/proto3d/road_graph.gd — keep the laws in sync) --
// Nodes = baked junctions; arcs = spans between consecutive junctions along each
// road; separated_pending junctions become PER-ROAD CLONES (you pass under, you
// don't turn). Cost = span / speed. Rebuilt lazily after any topology mutation.
const KIND_SPEED = {
	interstate: 29.0, us_route: 22.0, state_road: 19.0,
	backroad: 16.0, county: 16.0, street: 11.0, dirt: 9.0, exit: 12.0,
};
let _graph = null;
const invalidateGraph = () => { _graph = null; };

function lawSpeed(road) {
	return Number(road.speed_mps || KIND_SPEED[road.kind || "backroad"] || 16.0);
}
// A vehicle runs its TOP on the open interstate; every lesser road caps it at
// the road's own law speed. (top comes from car_3d.gd VCLASSES.)
function vehicleSpeed(road, vtop) {
	const law = lawSpeed(road);
	return (road.kind || "") === "interstate" ? vtop : Math.min(vtop, law);
}

function buildGraph() {
	const nodes = {};      // id -> {pos:[x,z]}
	const adj = {};        // id -> [{to, road, len_m}]
	const roadNodes = {};  // road id -> [{node, arc_m}] (arc-sorted)
	const jById = {};
	for (const j of map.junctions || []) jById[j.id] = j;
	const travelNode = (nid, rid) => {
		const j = jById[nid] || {};
		if ((j.grade || "flat") === "separated_pending") {
			const cid = `${nid}@${rid}`;
			if (!nodes[cid]) { nodes[cid] = { pos: j.pos }; adj[cid] = []; }
			return cid;
		}
		return nid;
	};
	for (const j of map.junctions || []) {
		nodes[j.id] = { pos: j.pos };
		adj[j.id] = adj[j.id] || [];
		for (const l of j.legs || [])
			(roadNodes[l.road] = roadNodes[l.road] || []).push({ node: j.id, arc_m: Number(l.arc_m) });
	}
	for (const rid of Object.keys(roadNodes)) {
		const lst = roadNodes[rid].sort((a, b) => a.arc_m - b.arc_m);
		for (let i = 0; i + 1 < lst.length; i++) {
			const span = Math.abs(lst[i + 1].arc_m - lst[i].arc_m);
			if (span < 1.0) continue;
			const an = travelNode(lst[i].node, rid), bn = travelNode(lst[i + 1].node, rid);
			(adj[an] = adj[an] || []).push({ to: bn, road: rid, len_m: span, arc0: lst[i].arc_m, arc1: lst[i + 1].arc_m });
			(adj[bn] = adj[bn] || []).push({ to: an, road: rid, len_m: span, arc0: lst[i + 1].arc_m, arc1: lst[i].arc_m });
		}
	}
	return { nodes, adj, roadNodes };
}
const graph = () => (_graph ||= buildGraph());

// Snap a world point to the nearest point on ANY road → {road, arc, pos, dist}.
function snapToRoad(p, kinds = null) {
	let best = null;
	for (const r of map.roads) {
		if (r.pts.length < 2) continue;
		if (kinds && !kinds.includes(r.kind || "")) continue;
		const info = roadArcInfo(r, p);
		if (!best || info.dist < best.dist) best = { road: r, arc: info.arc, pos: info.pos, dist: info.dist };
	}
	return best;
}

// Top-k nearest DISTINCT roads to a point. Route endpoints link to several
// candidates because a town's street grid can be a graph ORPHAN (bake gap) —
// the 2nd-nearest road is often the connected one.
function snapCandidates(p, k = 3) {
	const all = [];
	for (const r of map.roads) {
		if (r.pts.length < 2) continue;
		const info = roadArcInfo(r, p);
		all.push({ road: r, arc: info.arc, pos: info.pos, dist: info.dist });
	}
	all.sort((a, b) => a.dist - b.dist);
	return all.slice(0, k);
}

// A→B route on the graph with VIRTUAL endpoint nodes at the exact snap points
// (finer than the engine's nearest-junction snap — an editor wants exact answers).
// speedFn(road) -> m/s decides the cost model (law or a specific vehicle).
function routeBetween(a, b, speedFn) {
	const g = graph();
	const roadById = {};
	for (const r of map.roads) roadById[r.id] = r;
	const candsA = snapCandidates(a, 3), candsB = snapCandidates(b, 3);
	if (!candsA.length || !candsB.length) return { found: false, error: "no roads on the map" };
	const sa = candsA[0], sb = candsB[0];
	// local copies so virtual nodes don't pollute the cache
	const adj = {};
	for (const k of Object.keys(g.adj)) adj[k] = g.adj[k].slice();
	const nodes = { ...g.nodes };
	// A virtual endpoint links into each candidate road; walking the extra snap
	// distance from the click to a farther candidate costs time at 8 m/s so the
	// nearest CONNECTED road wins naturally over a closer orphan.
	const OFFROAD_MPS = 8.0;
	const addVirtual = (id, snaps) => {
		nodes[id] = { pos: snaps[0].pos };
		adj[id] = adj[id] || [];
		for (const snap of snaps) {
			const extra = Math.max(0, snap.dist - snaps[0].dist); // detour beyond the nearest road
			const lst = (g.roadNodes[snap.road.id] || []).slice().sort((x, y) => x.arc_m - y.arc_m);
			const link = (nodeEntry) => {
				// respect the separated_pending clone law for the flanking node too
				const j = (map.junctions || []).find((x) => x.id === nodeEntry.node);
				const nid = j && (j.grade || "flat") === "separated_pending" ? `${nodeEntry.node}@${snap.road.id}` : nodeEntry.node;
				if (!nodes[nid]) { nodes[nid] = { pos: j ? j.pos : snap.pos }; adj[nid] = adj[nid] || []; }
				const span = Math.abs(nodeEntry.arc_m - snap.arc) + extra * (12.0 / OFFROAD_MPS);
				adj[id].push({ to: nid, road: snap.road.id, len_m: Math.max(span, 0.5), arc0: snap.arc, arc1: nodeEntry.arc_m });
				(adj[nid] = adj[nid] || []).push({ to: id, road: snap.road.id, len_m: Math.max(span, 0.5), arc0: nodeEntry.arc_m, arc1: snap.arc });
			};
			const before = [...lst].reverse().find((n) => n.arc_m <= snap.arc);
			const after = lst.find((n) => n.arc_m >= snap.arc);
			if (before) link(before);
			if (after && after !== before) link(after);
		}
	};
	addVirtual("@A", candsA);
	addVirtual("@B", candsB);
	// same road, no junction between them → direct arc
	for (const ca of candsA)
		for (const cb of candsB) {
			if (ca.road.id !== cb.road.id) continue;
			const lst = (g.roadNodes[ca.road.id] || []);
			const lo = Math.min(ca.arc, cb.arc), hi = Math.max(ca.arc, cb.arc);
			const between = lst.some((n) => n.arc_m > lo + 0.5 && n.arc_m < hi - 0.5);
			if (!between) {
				adj["@A"].push({ to: "@B", road: ca.road.id, len_m: Math.max(hi - lo, 0.5), arc0: ca.arc, arc1: cb.arc });
				adj["@B"].push({ to: "@A", road: ca.road.id, len_m: Math.max(hi - lo, 0.5), arc0: cb.arc, arc1: ca.arc });
			}
		}
	// Dijkstra on time-cost (mirror of road_graph.gd route()).
	const dist = { "@A": 0 };
	const prev = {}, prevEdge = {}, done = {};
	let target = "@B", reached = true;
	for (;;) {
		let u = "", ud = Infinity;
		for (const k of Object.keys(dist)) if (!done[k] && dist[k] < ud) { ud = dist[k]; u = k; }
		if (u === "") {
			// exhausted without touching @B — the destination sits on a graph
			// ORPHAN (see /api/graph_health). Route to the reachable node
			// CLOSEST to B and say so honestly, instead of a dead "unreachable".
			let bn = "", bd = Infinity;
			for (const k of Object.keys(dist)) {
				if (k === "@A" || !nodes[k] || !nodes[k].pos) continue;
				const d = Math.hypot(nodes[k].pos[0] - b[0], nodes[k].pos[1] - b[1]);
				if (d < bd) { bd = d; bn = k; }
			}
			if (!bn) return { found: false, error: "unreachable", snap_a_m: Math.round(sa.dist), snap_b_m: Math.round(sb.dist) };
			target = bn; reached = false;
			break;
		}
		if (u === "@B") break;
		done[u] = true;
		for (const e of adj[u] || []) {
			const road = roadById[e.road];
			const mps = Math.max(0.5, speedFn(road));
			const alt = ud + e.len_m / mps;
			if (alt < (dist[e.to] ?? Infinity)) { dist[e.to] = alt; prev[e.to] = u; prevEdge[e.to] = e; }
		}
	}
	// walk back: edges in travel order
	const edges = [];
	let cur = target;
	while (prev[cur] !== undefined) { edges.push(prevEdge[cur]); cur = prev[cur]; }
	edges.reverse();
	let len = 0, timeLaw = 0;
	const roadsOrder = [], polyline = [];
	for (const e of edges) {
		const road = roadById[e.road];
		len += e.len_m;
		timeLaw += e.len_m / Math.max(0.5, lawSpeed(road));
		if (!roadsOrder.length || roadsOrder[roadsOrder.length - 1] !== e.road) roadsOrder.push(e.road);
		const pts = slicePolyline(road, e.arc0, e.arc1);
		for (const p of pts)
			if (!polyline.length || Math.hypot(p[0] - polyline[polyline.length - 1][0], p[1] - polyline[polyline.length - 1][1]) > 0.5)
				polyline.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
	}
	const out = {
		found: true, reached, len_m: Math.round(len), time_s: dist[target], time_law_s: timeLaw,
		roads: roadsOrder, polyline,
		snap_a_m: Math.round(sa.dist), snap_b_m: Math.round(sb.dist),
		text: roadsOrder.join(" → "),
	};
	if (!reached && nodes[target] && nodes[target].pos)
		out.reached_within_m = Math.round(Math.hypot(nodes[target].pos[0] - b[0], nodes[target].pos[1] - b[1]));
	return out;
}

// ---- GRAPH HEALTH (v4): find road-network ORPHANS — street grids and spurs the
// junction bake never tied to the trunk. The editor paints these so broken
// connectivity is VISIBLE instead of a mystery ("the exits don't connect").
function graphHealth() {
	const g = graph();
	const seen = new Set();
	const comps = [];
	for (const n of Object.keys(g.adj)) {
		if (seen.has(n) || !(g.adj[n] || []).length) continue;
		seen.add(n);
		const stack = [n];
		const nodesIn = [], roadsIn = new Set();
		while (stack.length) {
			const u = stack.pop();
			nodesIn.push(u);
			for (const e of g.adj[u] || []) {
				roadsIn.add(e.road);
				if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
			}
		}
		comps.push({ size: nodesIn.length, roads: [...roadsIn] });
	}
	comps.sort((a, b) => b.size - a.size);
	const graphRoads = new Set(comps.flatMap((c) => c.roads));
	const noJunction = map.roads.filter((r) => !graphRoads.has(r.id)).map((r) => r.id);
	return {
		nodes: Object.keys(g.nodes).length,
		components: comps.length,
		main_share: comps.length ? comps[0].size / comps.reduce((s, c) => s + c.size, 0) : 1,
		orphans: comps.slice(1).map((c) => ({ junctions: c.size, roads: c.roads })),
		orphan_roads: comps.slice(1).flatMap((c) => c.roads),
		no_junction_roads: noJunction,
	};
}

// ---- REGIONS + ECOLOGY (v4.1): the state card + what-lives-where -------------------
// Rulers are LIVE mechanics (rulers.json attitude/infamy); bandit_regions carries
// per-state gang strength; creatures.json rows carry biome arrays. The editor
// joins them so a state click answers "who runs it, what lives here".
const RULERS_PATH = join(ROOT, "game", "data", "rulers.json");
const BANDITS_PATH = join(ROOT, "game", "data", "bandit_regions.json");
const CREATURES_PATH = join(ROOT, "game", "data", "creatures.json");
const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };

function pointInPolyS(p, poly) {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
		if (((zi > p[1]) !== (zj > p[1])) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
	}
	return inside;
}

function regionsReport() {
	const rulers = readJson(RULERS_PATH, {});
	const bandits = readJson(BANDITS_PATH, { regions: {} });
	const stateAt = (wx, wz) => {
		const [cx, cz] = worldToCell(wx, wz);
		if (!inGrid(cx, cz)) return ".";
		return map.states_grid[cz][cx];
	};
	const out = {};
	for (const [ch, name] of Object.entries(map.state_legend)) {
		out[ch] = {
			ch, name, cells: 0, biomes: {},
			bbox: [Infinity, Infinity, -Infinity, -Infinity],
			towns: [], exits: [], districts: [],
			ruler: (rulers.states || {})[name] || rulers.default || null,
			bandit_strength: (bandits.regions || {})[name] ?? null,
		};
	}
	for (let z = 0; z < map.h; z++)
		for (let x = 0; x < map.w; x++) {
			const ch = map.states_grid[z][x];
			const st = out[ch];
			if (!st) continue;
			st.cells++;
			const b = map.legend[map.grid[z][x]];
			st.biomes[b] = (st.biomes[b] || 0) + 1;
			const [wx, wz] = cellToWorld(x, z);
			st.bbox[0] = Math.min(st.bbox[0], wx - map.cell_m / 2); st.bbox[1] = Math.min(st.bbox[1], wz - map.cell_m / 2);
			st.bbox[2] = Math.max(st.bbox[2], wx + map.cell_m / 2); st.bbox[3] = Math.max(st.bbox[3], wz + map.cell_m / 2);
		}
	for (const t of map.towns) {
		const st = out[stateAt(t.pos[0], t.pos[1])];
		if (st) st.towns.push({ id: t.id, name: t.name, pos: t.pos, kind: t.kind });
	}
	for (const e of map.exits) {
		const st = out[stateAt(e.pos[0], e.pos[1])];
		if (st) st.exits.push({ id: e.id, name: e.name, number: e.exit_number });
	}
	for (const d of map.districts) {
		const c = (d.poly || []).reduce((s, p) => [s[0] + p[0] / d.poly.length, s[1] + p[1] / d.poly.length], [0, 0]);
		const st = out[stateAt(c[0], c[1])];
		if (st) st.districts.push({ id: d.id, name: d.name, kind: d.kind });
	}
	return Object.values(out).filter((s) => s.cells > 0);
}

function ecologyReport() {
	const cdoc = readJson(CREATURES_PATH, { creatures: [] });
	const creatures = (cdoc.creatures || cdoc || []).map((c) => ({
		id: c.id, name: c.name, group: c.group, biomes: c.biomes || [],
		hp: c.hp, speed: c.speed, loot: c.loot || {}, eco_kill: c.eco_kill,
		noise_flee: c.noise_flee, size: c.size,
	}));
	const byBiome = {};
	for (const b of Object.values(map.legend)) byBiome[b] = [];
	for (const c of creatures)
		for (const b of c.biomes)
			if (byBiome[b]) byBiome[b].push(c.id);
	return { creatures, by_biome: byBiome,
		note: "creature rows from creatures.json (biome-weighted spawn); threats (howlers/lurkers/infected) ride their own directors — swamp is knifeback country, night belongs to the howlers" };
}

// ---- VEHICLES: read the fleet's top speeds LIVE from car_3d.gd ---------------------
// (VCLASSES rows carry "name" and "top" on their first line; trailer's top 0 is
// skipped. If the parse ever fails we fall back to the last-known table.)
const VEHICLE_FALLBACK = [
	{ id: "scavenger", name: "Scavenger", top: 34 }, { id: "motorcycle", name: "Rat Bike", top: 38 },
	{ id: "buggy", name: "Dustrunner", top: 31 }, { id: "pickup", name: "Rustler", top: 30 },
	{ id: "van", name: "Boxer", top: 27 }, { id: "semi", name: "Longhaul", top: 25 },
	{ id: "humvee", name: "Humvee", top: 29 },
];
function parseVehicles() {
	try {
		const src = readFileSync(join(ROOT, "game", "proto3d", "car_3d.gd"), "utf8");
		const out = [];
		const re = /"(\w+)":\s*\{"name":\s*"([^"]+)"[^\n]*?"top":\s*([\d.]+)/g;
		let m;
		while ((m = re.exec(src))) {
			const top = Number(m[3]);
			if (top > 1) out.push({ id: m[1], name: m[2], top });
		}
		return out.length ? out : VEHICLE_FALLBACK;
	} catch { return VEHICLE_FALLBACK; }
}
let vehicles = parseVehicles();

// ---- town-template stamper (Goal 2c) ----------------------------------------------
const TEMPLATES = {
	waystation: [ { building: "gas_station", d: [0, 0] }, { building: "market_stall", d: [16, 6] } ],
	hamlet: [ { building: "ruined_house", d: [-14, -8] }, { building: "ruined_house", d: [12, -10] },
		{ building: "safehouse", d: [0, 12] }, { building: "market_stall", d: [18, 4] } ],
	outpost: [ { building: "safehouse", d: [0, 0] }, { building: "gas_station", d: [-20, 8] } ],
};

// The nearest point on ANY interstate to a world point → {roadId, point, dist}.
function nearestInterstate(px, pz) {
	const s = snapToRoad([px, pz], ["interstate"]);
	return s ? { roadId: s.road.id, point: s.pos, dist: s.dist } : null;
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
	name: "MapForge v4 API — read, build, and expand the DIVIDED STATES USA map",
	file: "game/data/usmap.json (saved on every mutation; the game loads it at boot)",
	coordinates: {
		cell: "x: 0..w-1 (west→east), z: 0..h-1 (north→south)",
		world: "meters; world = world_offset + cell * cell_m; the game's Vector3(x, ·, z)",
	},
	laws: {
		exit_numbers: `mileposts from the highway's south/west origin, one per ${EXIT_MILE_M} m (usmap.gd EXIT_MILE_M — MERIDIAN = I-95 EXIT 9)`,
		road_edits: "field-PRESERVING: surface/side/geom/speed_mps/toll/nickname all survive point edits",
		graph: "routes ride the baked junctions[] — run POST /api/junctions/bake after topology edits",
		speeds: "law m/s by kind: " + Object.entries(KIND_SPEED).map(([k, v]) => `${k} ${v}`).join(", "),
	},
	biomes: "see GET /api/meta legend — chars: . ocean, w water, F forest, f scrub, p plains, a farmland, d desert, m mountains, s swamp, u urban",
	endpoints: [
		"GET  /api/help                         → this document",
		"POST /api/reload                       → v4: re-read every file from disk (multi-writer guard also auto-detects external writes)",
		"GET  /api/meta                         → dims, scale, legends, row counts (no grids — cheap)",
		"GET  /api/map                          → the entire map JSON",
		"GET  /api/grid?layer=biomes|states     → {rows: [...]} the raw char grid",
		"GET  /api/cell?x=&z=  (or ?wx=&wz= world meters) → biome/state/world pos/nearest road+town",
		"PUT  /api/cell        {x, z, biome}    → paint one cell (biome = legend char or name)",
		"POST /api/paint       {biome, cells: [[x,z],...]} or {biome, rect: [x0,z0,x1,z1]} → bulk paint",
		"GET  /api/roads                        → all roads",
		"POST /api/roads       {id, pts: [[wx,wz],...], ...} → add/replace; UNLISTED FIELDS ARE PRESERVED",
		"DELETE /api/roads?id=I-99              → remove a road",
		"GET  /api/towns · POST /api/towns · DELETE /api/towns?id=",
		"GET  /api/query?wx=&wz=&r=2000         → everything within r meters of a world point",
		"GET  /api/placements · POST /api/placements · DELETE /api/placements?id=",
		"GET  /api/exits                        → EXIT NODES + archetype blueprints",
		"POST /api/exits       {dest:[wx,wz] or town, name?, archetype?, highway_id?, ...} → exit node; NUMBERS ITSELF BY MILEPOST",
		"DELETE /api/exits?id=I-95_X1           → remove the node AND its ramp roads",
		"GET  /api/junctions · POST /api/junctions/bake → the junction law (run bake after road edits)",
		"GET  /api/graph_health                 → v4: connectivity report — orphan street grids/spurs the bake never tied to the trunk",
		"GET  /api/districts                    → v4: named polygon areas",
		"POST /api/districts   {id, name, poly:[[wx,wz]x3+], kind?, color?, notes?} → add/replace",
		"DELETE /api/districts?id=meridian_downtown",
		"GET  /api/plan                         → v4: the shared PLAN layer (owner+AI map TODOs)",
		"POST /api/plan        {id?, pos:[wx,wz], text, status? open|doing|done, author?} → pin/update a note",
		"DELETE /api/plan?id=note-3",
		"GET  /api/regions                      → v4.1: the STATE cards — ruler, bandit strength, towns/exits/districts inside, biome mix, bbox",
		"GET  /api/ecology                      → v4.1: creature rows + by-biome index (what lives where)",
		"GET  /api/vehicles                     → v4: the fleet's top speeds, read live from car_3d.gd",
		"GET  /api/route?ax=&az=&bx=&bz=&vehicle=scavenger → v4: A→B drive-time (graph route, polyline, law+vehicle times, 60× game clock)",
		"GET  /api/structures · POST /api/structures · DELETE /api/structures?id=",
		"POST /api/exit        {town} or {pos} [v1 — prefer /api/exits]",
		"POST /api/stamp_template {template, town|pos, name?} (waystation|hamlet|outpost)",
	],
	examples: [
		`curl localhost:${PORT}/api/route?ax=110\\&az=-325\\&bx=-31000\\&bz=14000\\&vehicle=scavenger`,
		`curl -X POST localhost:${PORT}/api/districts -d '{"id":"meridian_downtown","name":"DOWNTOWN","poly":[[0,-500],[400,-500],[400,-100],[0,-100]],"kind":"downtown"}'`,
		`curl -X POST localhost:${PORT}/api/plan -d '{"pos":[110,-325],"text":"grow the port district here","status":"open","author":"owner"}'`,
	],
	guardrails: [
		"keep cell (120,40) region VIRGINIA forest — the authored Meridian/I-9 zone lives at world (-60..220, -440..460)",
		"paint water as 'w' cells; roads crossing water become bridges automatically in-game",
		"'.' (ocean) marks the world edge — keep the coastline closed",
		"after moving roads or exits, POST /api/junctions/bake so the graph + game stay true",
	],
};

function biomeChar(v) {
	if (v in map.legend) return v;
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
		syncFromDisk();
		// ---- static editor ----
		if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html"))
			return res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(join(HERE, "index.html")));
		if (req.method === "GET" && url.pathname === "/app.js")
			return res.writeHead(200, { "content-type": "text/javascript" }).end(readFileSync(join(HERE, "app.js")));

		// ---- API ----
		if (url.pathname === "/api/help") return json(res, 200, HELP);
		if (url.pathname === "/api/reload" && req.method === "POST") {
			readMap(); invalidateGraph();
			plan = existsSync(PLAN_PATH) ? JSON.parse(readFileSync(PLAN_PATH, "utf8")) : { notes: [] };
			if (!Array.isArray(plan.notes)) plan.notes = [];
			structDoc = existsSync(STRUCT_PATH) ? JSON.parse(readFileSync(STRUCT_PATH, "utf8")) : { structures: [] };
			if (!Array.isArray(structDoc.structures)) structDoc.structures = [];
			return json(res, 200, { ok: true, roads: map.roads.length, exits: map.exits.length, junctions: (map.junctions || []).length });
		}
		if (url.pathname === "/api/meta")
			return json(res, 200, {
				name: map.name, version: map.version, compression: map.compression,
				cell_m: map.cell_m, world_offset: map.world_offset, w: map.w, h: map.h,
				legend: map.legend, state_legend: map.state_legend,
				roads: map.roads.length, towns: map.towns.length,
				exits: map.exits.length, junctions: (map.junctions || []).length,
				placements: map.placements.length, districts: map.districts.length,
				plan_notes: plan.notes.length,
				world_km: [map.w * map.cell_m / 1000, map.h * map.cell_m / 1000],
				exit_mile_m: EXIT_MILE_M, kind_speed: KIND_SPEED,
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
			// FIELD-PRESERVING WRITE (v4 law): a road's CHARACTER — danger, family,
			// nickname, toll, lanes, divided, surface, speed_mps, and the bake-minted
			// ramp fields (side, geom) — must survive every point edit. Start from
			// the previous row, overlay only the fields the caller actually sent.
			const prev = map.roads.find((r) => r.id === body.id);
			const kind = body.kind ?? prev?.kind ?? "interstate";
			const lanes = body.lanes ?? prev?.lanes ?? (kind === "interstate" ? 4 : 2);
			const row = prev ? { ...prev } : { kind, danger: 0, family: "", nickname: "", lanes, divided: lanes >= 6 };
			for (const [k, v] of Object.entries(body)) if (v !== undefined) row[k] = v;
			row.id = body.id; row.kind = kind; row.lanes = lanes; row.pts = body.pts;
			// A hand-edit on a RAMP invalidates its crafted peel: clear the bake's
			// idempotence flags so the next bake re-crafts the 12° peel around the
			// new shape (mid-points survive as the authored curve; the mouth obeys
			// the exit geometry law again). Without this, edited ramps keep a stale
			// geom:"peel_v1" and exit_geometry_sim rightly fails them.
			if (kind === "exit" && prev && JSON.stringify(prev.pts) !== JSON.stringify(row.pts)) {
				delete row.geom;
				delete row.side;
			}
			map.roads = map.roads.filter((r) => r.id !== body.id);
			map.roads.push(row);
			save(); invalidateGraph();
			return json(res, 200, { ok: true, road: row, roads: map.roads.length });
		}
		if (url.pathname === "/api/roads" && req.method === "DELETE") {
			const n = map.roads.length;
			map.roads = map.roads.filter((r) => r.id !== q.get("id"));
			save(); invalidateGraph();
			return json(res, 200, { removed: n - map.roads.length });
		}
		if (url.pathname === "/api/towns" && req.method === "GET") return json(res, 200, map.towns);
		if (url.pathname === "/api/towns" && req.method === "POST") {
			if (!body.id || !body.name || !Array.isArray(body.pos))
				return json(res, 400, { error: "need id, name, pos:[wx,wz]" });
			const prev = map.towns.find((t) => t.id === body.id);
			const row = prev ? { ...prev } : { kind: "holdout" };
			for (const [k, v] of Object.entries(body)) if (v !== undefined) row[k] = v;
			map.towns = map.towns.filter((t) => t.id !== body.id);
			map.towns.push(row);
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
			const roads = map.roads.filter((rd) => rd.pts.some((_, i) => i + 1 < rd.pts.length && segDist(wx, wz, rd.pts[i], rd.pts[i + 1]) <= r));
			const districts = map.districts.filter((d) => (d.poly || []).some((p) => Math.hypot(p[0] - wx, p[1] - wz) <= r));
			return json(res, 200, { here, radius_m: r, towns, roads: roads.map((x) => x.id), districts: districts.map((x) => x.id) });
		}
		// ---- THE JUNCTION BAKE (AMERICAN_ROAD M1, rulings 0.2-0.5) ----
		if (url.pathname === "/api/junctions/bake" && req.method === "POST") {
			const { bakeJunctions } = await import("./bake_junctions.mjs");
			const { junctions, lint } = bakeJunctions(map);
			save(); invalidateGraph();
			return json(res, 200, { ok: true, junctions: junctions.length, lint });
		}
		if (url.pathname === "/api/junctions" && req.method === "GET")
			return json(res, 200, map.junctions || []);
		if (url.pathname === "/api/graph_health" && req.method === "GET")
			return json(res, 200, graphHealth());
		// ---- authored placements (Goal 2b) ----
		if (url.pathname === "/api/placements" && req.method === "GET") return json(res, 200, map.placements);
		if (url.pathname === "/api/placements" && req.method === "POST") {
			if (!body.building || !Array.isArray(body.pos))
				return json(res, 400, { error: "need building and pos:[wx,wz]" });
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
			let dest = body.dest || body.pos, label = body.name;
			let townId = body.town || null;
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
				const info = roadArcInfo(road, dest);
				near = { roadId: road.id, point: info.pos, dist: info.dist };
			} else near = nearestInterstate(dest[0], dest[1]);
			if (!near) return json(res, 400, { error: "no interstate to anchor on" });
			const highway = near.roadId;
			const hwRoad = map.roads.find((r) => r.id === highway);
			// THE ADDRESS LAW (v4): exits number themselves by MILEPOST, not by
			// creation order — the same law the engine renumbered by (M3 part 1).
			const number = body.exit_number ?? milepostNumber(hwRoad, near.point);
			// Legacy-era exits kept their creation-order ids when the address law
			// renumbered them (I-95_X1 IS Meridian, exit_number 9) — so a fresh
			// milepost id can collide with an old id. Never clobber: suffix instead.
			let exid = body.id || `${highway}_X${number}`;
			if (!body.id) { let suffix = 2; while (map.exits.some((e) => e.id === exid)) exid = `${highway}_X${number}-${suffix++}`; }
			const name = label || `${arch.name} ${number}`;
			const wantReturn = body.has_return_ramp !== false;
			if (!townId) { // stamp town_id when the exit clearly serves a town (engine convention)
				const t = map.towns.find((x) => Math.hypot(x.pos[0] - dest[0], x.pos[1] - dest[1]) < 600);
				if (t) townId = t.id;
			}
			const rampIds = [];
			const offId = `${exid}-off`;
			map.roads = map.roads.filter((r) => r.id !== offId);
			map.roads.push({ id: offId, kind: "exit", pts: [near.point, dest], danger: arch.danger ?? 1, family: "", nickname: "" });
			rampIds.push(offId);
			if (wantReturn) {
				const onId = `${exid}-on`;
				const rejoin = pointAlong(hwRoad, near.point, Number(body.return_gap_m || 180));
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
				...(townId ? { town_id: townId } : {}),
			};
			map.exits = map.exits.filter((e) => e.id !== exid);
			map.exits.push(node);
			save(); invalidateGraph();
			return json(res, 200, { ok: true, exit: node, ramp_length_m: Math.round(near.dist) });
		}
		if (url.pathname === "/api/exits" && req.method === "DELETE") {
			const ex = map.exits.find((e) => e.id === q.get("id"));
			if (!ex) return json(res, 404, { error: `no exit '${q.get("id")}'` });
			map.exits = map.exits.filter((e) => e.id !== ex.id);
			map.roads = map.roads.filter((r) => !(ex.ramp_ids || []).includes(r.id));
			save(); invalidateGraph();
			return json(res, 200, { removed: ex.id, ramps_removed: (ex.ramp_ids || []).length });
		}

		// ---- DISTRICTS (v4): named polygon areas — future territory/heat rows ------
		if (url.pathname === "/api/districts" && req.method === "GET")
			return json(res, 200, map.districts);
		if (url.pathname === "/api/districts" && req.method === "POST") {
			if (!body.id || !/^[a-z][a-z0-9_]*$/.test(body.id))
				return json(res, 400, { error: "id must be snake_case" });
			if (!body.name) return json(res, 400, { error: "name required" });
			if (!Array.isArray(body.poly) || body.poly.length < 3)
				return json(res, 400, { error: "poly needs >=3 [wx,wz] points" });
			const prev = map.districts.find((d) => d.id === body.id);
			const row = {
				...(prev || {}),
				id: body.id, name: body.name, poly: body.poly,
				kind: body.kind ?? prev?.kind ?? "custom",
				...(body.color !== undefined ? { color: body.color } : prev?.color ? { color: prev.color } : {}),
				...(body.notes !== undefined ? { notes: body.notes } : prev?.notes ? { notes: prev.notes } : {}),
			};
			map.districts = map.districts.filter((d) => d.id !== body.id);
			map.districts.push(row);
			save();
			return json(res, 200, { ok: true, district: row, districts: map.districts.length });
		}
		if (url.pathname === "/api/districts" && req.method === "DELETE") {
			const n = map.districts.length;
			map.districts = map.districts.filter((d) => d.id !== q.get("id"));
			save();
			return json(res, 200, { removed: n - map.districts.length });
		}

		// ---- THE PLAN LAYER (v4): shared owner+AI map TODOs (sidecar, not game data)
		if (url.pathname === "/api/plan" && req.method === "GET")
			return json(res, 200, plan.notes);
		if (url.pathname === "/api/plan" && req.method === "POST") {
			if (!Array.isArray(body.pos) && !body.id) return json(res, 400, { error: "need pos:[wx,wz] (and text) — or id to update" });
			const prev = body.id ? plan.notes.find((n) => n.id === body.id) : null;
			if (body.id && !prev && !Array.isArray(body.pos)) return json(res, 404, { error: `no note '${body.id}'` });
			const id = body.id || `note-${(plan.notes.reduce((m, n) => Math.max(m, Number(String(n.id).split("-")[1]) || 0), 0)) + 1}`;
			const STATUSES = ["open", "doing", "done"];
			const status = body.status ?? prev?.status ?? "open";
			if (!STATUSES.includes(status)) return json(res, 400, { error: `status must be ${STATUSES.join("|")}` });
			const row = {
				...(prev || { created: new Date().toISOString().slice(0, 10) }),
				id, status,
				pos: body.pos ?? prev?.pos,
				text: body.text ?? prev?.text ?? "",
				...(body.author !== undefined ? { author: body.author } : prev?.author ? { author: prev.author } : {}),
			};
			if (!Array.isArray(row.pos)) return json(res, 400, { error: "need pos:[wx,wz]" });
			if (!row.text) return json(res, 400, { error: "need text" });
			plan.notes = plan.notes.filter((n) => n.id !== id);
			plan.notes.push(row);
			savePlan();
			return json(res, 200, { ok: true, note: row, notes: plan.notes.length });
		}
		if (url.pathname === "/api/plan" && req.method === "DELETE") {
			const n = plan.notes.length;
			plan.notes = plan.notes.filter((x) => x.id !== q.get("id"));
			savePlan();
			return json(res, 200, { removed: n - plan.notes.length });
		}

		// ---- REGIONS + ECOLOGY (v4.1) ----------------------------------------------
		if (url.pathname === "/api/regions" && req.method === "GET")
			return json(res, 200, regionsReport());
		if (url.pathname === "/api/ecology" && req.method === "GET")
			return json(res, 200, ecologyReport());

		// ---- VEHICLES + ROUTE (v4): the drive-time answers -------------------------
		if (url.pathname === "/api/vehicles") {
			if (q.get("refresh") === "1") vehicles = parseVehicles();
			return json(res, 200, { vehicles, source: "game/proto3d/car_3d.gd VCLASSES (top m/s)", note: "interstates run the vehicle's top; lesser roads cap at the road law speed" });
		}
		if (url.pathname === "/api/route") {
			const a = [Number(q.get("ax")), Number(q.get("az"))];
			const b = [Number(q.get("bx")), Number(q.get("bz"))];
			if (a.some(isNaN) || b.some(isNaN)) return json(res, 400, { error: "need ax, az, bx, bz (world meters)" });
			if (!(map.junctions || []).length) return json(res, 400, { error: "no junctions[] — POST /api/junctions/bake first" });
			const vid = q.get("vehicle") || "";
			const veh = vehicles.find((v) => v.id === vid) || null;
			const speedFn = veh ? (road) => vehicleSpeed(road, veh.top) : lawSpeed;
			const r = routeBetween(a, b, speedFn);
			const straight = Math.hypot(b[0] - a[0], b[1] - a[1]);
			if (!r.found) return json(res, 200, { ...r, straight_m: Math.round(straight) });
			const comp = Number(map.compression || 60);
			const fmtReal = (s) => s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
			const fmtGame = (s) => { const gs = s * comp, h = Math.floor(gs / 3600), mn = Math.round((gs % 3600) / 60); return h ? `${h}h ${mn}m` : `${mn}m`; };
			return json(res, 200, {
				...r, straight_m: Math.round(straight),
				vehicle: veh ? { id: veh.id, name: veh.name, top_mps: veh.top } : null,
				time_real: fmtReal(r.time_s), time_game: fmtGame(r.time_s),
				time_law_real: fmtReal(r.time_law_s), time_law_game: fmtGame(r.time_law_s),
				compression: comp,
			});
		}

		// ---- STRUCTURE CATALOG (spec §7): the owner CREATES buildings here ---------
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

		// ---- auto off-ramp (Goal 2a, v1 PROOF CASE — prefer /api/exits) ------------
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
			const ramp = { id, kind: "exit", pts: [near.point, pos] };
			map.roads = map.roads.filter((r) => r.id !== id);
			map.roads.push(ramp);
			save(); invalidateGraph();
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
	console.log(`MapForge v4 up: http://localhost:${PORT}  (editing ${MAP_PATH})`);
	console.log(`API docs:       http://localhost:${PORT}/api/help`);
});
