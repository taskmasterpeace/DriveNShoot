import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { bakeJunctions, stampTownStreets } from "./bake_junctions.mjs";
import * as clearance from "./road_clearance.mjs";

const profiles = Object.fromEntries(JSON.parse(readFileSync(new URL("../../game/data/world/structure_profiles.json", import.meta.url), "utf8")).structures.map((p) => [p.id, p]));

// Independent SAT oracle: the implementation uses segment-to-box distance.
// These rectangles include the streamer's 3 m end overlap on each end, not a
// building-center exclusion disk or the implementation's capsule algorithm.
function corners(row) {
	const [w, d] = profiles[row.building]?.footprint_m || [8, 8];
	const c = Math.cos(row.rot || 0), s = Math.sin(row.rot || 0);
	return [[-w/2, -d/2], [w/2, -d/2], [w/2, d/2], [-w/2, d/2]]
		.map(([x, z]) => [row.pos[0] + x*c + z*s, row.pos[1] - x*s + z*c]);
}
function overlaps(a, b) {
	for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
		const p = poly[i], q = poly[(i + 1) % poly.length];
		const n = [p[1] - q[1], q[0] - p[0]];
		const ap = a.map(([x, z]) => x*n[0] + z*n[1]);
		const bp = b.map(([x, z]) => x*n[0] + z*n[1]);
		if (Math.max(...ap) <= Math.min(...bp) || Math.max(...bp) <= Math.min(...ap)) return false;
	}
	return true;
}
function roadHits(row, roads) {
	const box = corners(row), hits = [];
	for (const road of roads) {
		const kind = road.kind ?? "interstate";
		const lanes = road.lanes ?? (kind === "interstate" ? 4 : 2), divided = road.divided ?? lanes >= 6;
		const half = divided ? Math.max(1, Math.floor(lanes/2))*3.6 + 2.8 : lanes*1.8 + 1;
		for (let i = 1; i < road.pts.length; i++) {
			const start = road.pts[i-1], end = road.pts[i];
			const len = Math.hypot(end[0]-start[0], end[1]-start[1]);
			if (!len) continue;
			const dx = (end[0]-start[0])/len, dz = (end[1]-start[1])/len;
			const a = [start[0]-dx*3, start[1]-dz*3], b = [end[0]+dx*3, end[1]+dz*3];
			const x = -dz*half, z = dx*half;
			if (overlaps(box, [[a[0]+x,a[1]+z], [b[0]+x,b[1]+z], [b[0]-x,b[1]-z], [a[0]-x,a[1]-z]])) {
				hits.push(road.id); break;
			}
		}
	}
	return hits;
}
function fixture(id = "test-town") {
	return { town_layout_version: 4, towns: [{ id, name: id, kind: "holdout", pos: [0, 0] }],
		roads: [], exits: [], placements: [], districts: [], grid: [], relief: [] };
}
function assertRoadClear(rows, roads) {
	const failures = rows.flatMap((row) => roadHits(row, roads).map((road) => `${row.id} / ${road}`));
	assert.deepEqual(failures, [], "generated footprints must not intersect asphalt");
}

test("town slots keep their entire footprint off a divided highway, not only town streets", () => {
	const map = fixture();
	map.roads.push({ id: "I-fixture", kind: "interstate", lanes: 6, divided: true, pts: [[-1000, 13], [1000, 13]] });
	stampTownStreets(map);
	assert.ok(map.placements.length > 5, "the generator still populates clear land");
	assertRoadClear(map.placements, [map.roads[0]]);
});

test("downtown corners clear crossing streets using rotated catalog footprints", () => {
	const map = fixture("peach-combine-depot");
	map.exits.push({ id: "exit", town_id: "peach-combine-depot", archetype: "county_seat", pos: [132.75, 707.98] });
	stampTownStreets(map);
	assert.ok(map.placements.length > 30);
	assertRoadClear(map.placements, map.roads);
});

test("the real junction bake places slots after final ramp geometry and remains idempotent", () => {
	const map = fixture("seattle");
	map.towns[0].pos = [0, 100];
	map.roads.push({ id: "I-fixture", kind: "interstate", lanes: 6, divided: true, pts: [[-1500, 0], [1500, 0]] });
	map.grid = Array(20).fill("p".repeat(20));
	map.legend = { p: "plains", a: "farmland" };
	map.world_offset = [-5000, -5000];
	map.cell_m = 500;
	bakeJunctions(map);
	const ramps = map.roads.filter((r) => r.kind === "exit");
	assert.ok(ramps.length >= 2, "the real bake minted and rewrote the town ramps");
	assertRoadClear(map.placements.filter((p) => p.id.startsWith("seattle-slot-")), ramps);
	const before = structuredClone(map.placements);
	bakeJunctions(map);
	assert.deepEqual(map.placements, before);
});

test("new town slots respect the full footprint of existing authored buildings", () => {
	const map = fixture();
	const authored = { id: "owner-cinema", building: "drive_in_theater", pos: [0, 20], rot: Math.PI / 4, authored: true };
	map.placements.push(authored);
	stampTownStreets(map);
	const collisions = map.placements.slice(1).filter((row) => overlaps(corners(row), corners(authored)));
	assert.deepEqual(collisions.map((p) => p.id), []);
	assert.deepEqual(map.placements[0], authored);
});

test("road clearance matches lane widths, Godot yaw, finite ends, and degenerate road segments", () => {
	const box = { pos: [0, 0], half: [11, 4], rot: Math.PI / 2 };
	const roads = [
		{ id: "two", lanes: 2, divided: false, pts: [[-100, 15], [100, 15]] },
		{ id: "six", lanes: 6, divided: true, pts: [[-100, 24], [100, 24]] },
		{ id: "default", pts: [[-100, -19], [100, -19]] },
		{ id: "past-end", lanes: 2, pts: [[10, 15], [30, 15]] },
		{ id: "point", lanes: 2, pts: [[0, 15], [0, 15]] },
	];
	assert.deepEqual(clearance.footprintRoadConflicts(box, clearance.buildRoadCorridors(roads, 0)), ["two", "six", "default", "point"]);
	const rotated = clearance.placementFootprint({ building: "motel_strip", pos: [20, 0], rot: Math.PI / 4 }, profiles);
	const point = [{ id: "yaw-sign", lanes: 1, pts: [[27, -7], [27, -7]] }];
	assert.deepEqual(clearance.footprintRoadConflicts(rotated, clearance.buildRoadCorridors(point, 0)), ["yaw-sign"]);
});

test("road end-cap corners reject overlapping footprints at both finite ends", () => {
	const road = { id: "end-cap", lanes: 1, pts: [[0, 0], [0, 100]] };
	// Rendered one-lane slab is x [-2.8, 2.8], z [-3, 103]. This
	// hand-derived box overlaps its far corner by 0.1 m on each axis.
	assert.equal(overlaps([[2.7, 102.9], [4.7, 102.9], [4.7, 104.9], [2.7, 104.9]],
		[[-2.8, -3], [2.8, -3], [2.8, 103], [-2.8, 103]]), true);
	for (const pos of [[3.7, 103.9], [-3.7, -3.9]]) {
		assert.deepEqual(clearance.footprintRoadConflicts({ pos, half: [1, 1], rot: 0 },
			clearance.buildRoadCorridors([road])), ["end-cap"], "both rendered end caps must be reserved");
	}
	assert.deepEqual(clearance.footprintRoadConflicts({ pos: [0, 120], half: [1, 1], rot: 0 },
		clearance.buildRoadCorridors([road])), [], "finite caps must not become infinite road rays");
});

test("road end caps preserve the full one-metre buffer outside the asphalt", () => {
	// Two-lane asphalt ends at z=103; this box begins at z=103.4.
	// It does not hit the asphalt, but its 0.4 m gap violates the 1 m buffer.
	assert.deepEqual(clearance.footprintRoadConflicts({ pos: [5.55, 104.4], half: [1, 1], rot: 0 },
		clearance.buildRoadCorridors([{ id: "end-cap", lanes: 2, pts: [[0, 0], [0, 100]] }])), ["end-cap"]);
});

test("rectangular end caps do not displace buildings on clear ground beyond the buffer", () => {
	// The slab ends at z=103 and this footprint starts at z=106: a real 3 m
	// gap, despite lying inside a wide capsule drawn around the extended axis.
	assert.deepEqual(clearance.footprintRoadConflicts({ pos: [5.4, 107], half: [1, 1], rot: 0 },
		clearance.buildRoadCorridors([{ id: "end-cap", lanes: 2, pts: [[0, 0], [0, 100]] }])), []);
});

test("raw exit and non-interstate defaults match the loader without narrowing interstates or overrides", () => {
	const pts = [[0, -100], [0, 100]];
	const roads = [
		{ id: "exit-default", kind: "exit", pts },
		{ id: "county-default", kind: "county", pts },
		{ id: "us-route-default", kind: "us_route", pts },
		{ id: "interstate-default", kind: "interstate", pts },
		{ id: "missing-kind-default", pts },
		{ id: "exit-explicit-six", kind: "exit", lanes: 6, pts },
	];
	// Nearest footprint edge x=4.8 clears two-lane asphalt (edge 4.6),
	// but lies on a four-lane interstate and the explicit six-lane exit.
	assert.deepEqual(clearance.footprintRoadConflicts({ pos: [5.8, 0], half: [1, 1], rot: 0 },
		clearance.buildRoadCorridors(roads, 0)), ["interstate-default", "missing-kind-default", "exit-explicit-six"]);
});

test("bounded repair relocates generated road conflicts only, preserving identity and payload", () => {
	assert.equal(typeof clearance.repairGeneratedTownPlacements, "function", "bounded repair must be available");
	const map = fixture("peach-combine-depot");
	map.towns[0].name = "PEACH COMBINE DEPOT";
	map.roads.push({ id: "county", lanes: 2, pts: [[-100, 0], [100, 0]] });
	map.placements = [
		{ id: "PEACH COMBINE DEPOT-safehouse-2", building: "safehouse", pos: [0, 1], rot: 0, label: "keep", payload: { loot: "medicine" } },
		{ id: "peach-combine-depot-slot-22", building: "motel_strip", pos: [28, 1], rot: 0.7 },
		{ id: "owner-house", building: "safehouse", pos: [0, 18], rot: 0 },
		{ id: "peach-combine-depot-slot-999", building: "safehouse", pos: [50, 0], rot: 0, authored: true },
		{ id: "OTHER-safehouse-0", building: "safehouse", pos: [-40, 1], rot: 0 },
		{ id: "peach-combine-depot-slot-1000", building: "safehouse", pos: [5000, 1], rot: 0 },
	];
	const before = structuredClone(map);
	const result = clearance.repairGeneratedTownPlacements(map, "peach-combine-depot", profiles);
	assert.deepEqual(result.moves.map((p) => p.id), ["PEACH COMBINE DEPOT-safehouse-2", "peach-combine-depot-slot-22"]);
	assertRoadClear(map.placements.slice(0, 2), map.roads);
	for (let i = 0; i < 2; i++) {
		assert.deepEqual({ ...map.placements[i], pos: before.placements[i].pos }, before.placements[i]);
		for (let j = 0; j < map.placements.length; j++) if (i !== j)
			assert.equal(overlaps(corners(map.placements[i]), corners(map.placements[j])), false, "relocation cannot overlap neighbors");
	}
	assert.deepEqual(map.placements.slice(2), before.placements.slice(2));
	assert.deepEqual(map.roads, before.roads);
	assert.deepEqual(clearance.repairGeneratedTownPlacements(map, "peach-combine-depot", profiles).moves, []);
	const again = structuredClone(before);
	assert.deepEqual(clearance.repairGeneratedTownPlacements(again, "peach-combine-depot", profiles), result);
	assert.deepEqual(again, map);
});

test("failed repair is atomic and refuses authored towns", () => {
	assert.equal(typeof clearance.repairGeneratedTownPlacements, "function", "bounded repair must be available");
	const map = fixture();
	map.roads.push({ id: "road", lanes: 2, pts: [[-100, 0], [100, 0]] });
	map.placements.push({ id: "test-town-slot-1", building: "safehouse", pos: [0, 0], rot: 0 });
	const before = structuredClone(map);
	assert.throws(() => clearance.repairGeneratedTownPlacements(map, "test-town", profiles, { maxMove: 1 }), /No clear location/);
	assert.deepEqual(map, before);
	map.towns[0].authored = true;
	assert.throws(() => clearance.repairGeneratedTownPlacements(map, "test-town", profiles), /authored/);
});

test("repair CLI defaults to read-only and applies exactly the reviewed relocation plan", () => {
	const dir = mkdtempSync(join(tmpdir(), "town-clearance-"));
	try {
		const map = fixture();
		map.roads.push({ id: "road", lanes: 2, pts: [[-100, 0], [100, 0]] });
		map.placements.push({ id: "test-town-slot-1", building: "safehouse", pos: [0, 0], rot: 0, label: "preserve" });
		const mapPath = join(dir, "usmap.json"), text = JSON.stringify(map);
		writeFileSync(mapPath, text);
		const run = (extra = []) => spawnSync(process.execPath,
			[fileURLToPath(new URL("./repair_town_clearance.mjs", import.meta.url)), "--town", "test-town", ...extra],
			{ encoding: "utf8", env: { ...process.env, USMAP_PATH: mapPath } });
		const dry = run();
		assert.equal(dry.status, 0, dry.stderr);
		const report = JSON.parse(dry.stdout);
		assert.equal(report.applied, false);
		assert.equal(report.moves.length, 1);
		assert.equal(readFileSync(mapPath, "utf8"), text, "dry run must not rewrite even formatting");
		const applied = run(["--apply"]);
		assert.equal(applied.status, 0, applied.stderr);
		assert.deepEqual(JSON.parse(applied.stdout).moves, report.moves);
		const after = JSON.parse(readFileSync(mapPath, "utf8"));
		assert.deepEqual(after.placements[0].pos, report.moves[0].to);
		after.placements[0].pos = map.placements[0].pos;
		assert.deepEqual(after, map, "only positions in the report may change");
		assert.deepEqual(JSON.parse(run().stdout).moves, []);
	} finally {
		assert.equal(dirname(resolve(dir)), resolve(tmpdir()), "cleanup stays inside the OS temporary directory");
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the photographed Peach town's persisted generated footprints clear roads and one another", () => {
	const map = JSON.parse(readFileSync(new URL("../../game/data/usmap.json", import.meta.url), "utf8"));
	const rows = map.placements.filter((row) => row.id.startsWith("peach-combine-depot-slot-")
		|| row.id.startsWith("PEACH COMBINE DEPOT-"));
	for (const id of ["PEACH COMBINE DEPOT-safehouse-2", "PEACH COMBINE DEPOT-market_stall-3", "peach-combine-depot-slot-20", "peach-combine-depot-slot-22"])
		assert.ok(rows.some((p) => p.id === id), `${id} must be retained, not deleted`);
	assertRoadClear(rows, map.roads);
	for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++)
		assert.equal(overlaps(corners(rows[i]), corners(rows[j])), false, `${rows[i].id} overlaps ${rows[j].id}`);
});
