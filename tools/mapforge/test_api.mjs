#!/usr/bin/env node
// MapForge API smoke test — boots the server on a TEMP COPY of the map and
// exercises every endpoint an AI would use to read/build/expand the map.
// Run: node tools/mapforge/test_api.mjs   →  "MAPFORGE API: ALL CHECKS PASSED"

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const PORT = 8977;
const BASE = `http://localhost:${PORT}`;

const tmp = mkdtempSync(join(tmpdir(), "mapforge-"));
const tmpMap = join(tmp, "usmap.json");
writeFileSync(tmpMap, readFileSync(join(ROOT, "game", "data", "usmap.json")));

const server = spawn(process.execPath, [join(HERE, "server.mjs")], {
	env: { ...process.env, USMAP_PATH: tmpMap, MAPFORGE_PORT: String(PORT) },
	stdio: "ignore",
});

let passed = 0, failed = 0;
const check = (name, ok) => {
	if (ok) { passed++; console.log(`API: PASS - ${name}`); }
	else { failed++; console.log(`API: FAIL - ${name}`); }
};
const api = async (path, opts) => {
	const r = await fetch(BASE + path, opts);
	return { status: r.status, body: await r.json() };
};

// wait for the server
for (let i = 0; i < 40; i++) {
	try { await fetch(BASE + "/api/meta"); break; }
	catch { await new Promise((r) => setTimeout(r, 150)); }
}

try {
	const meta = (await api("/api/meta")).body;
	check("meta: 150x85 cells, 60x compression", meta.w === 150 && meta.h === 85 && meta.compression === 60);
	check("meta: world is 75x42.5 km", meta.world_km[0] === 75 && meta.world_km[1] === 42.5);

	const help = (await api("/api/help")).body;
	check("help documents every endpoint for the AI", help.endpoints.length >= 12 && help.examples.length >= 3);

	const cell = (await api("/api/cell?x=120&z=40")).body;
	check(`Meridian cell reads VIRGINIA forest (got ${cell.state}/${cell.biome})`, cell.state === "VIRGINIA" && cell.biome === "forest");

	const byWorld = (await api("/api/cell?wx=110&wz=-325")).body;
	check("world-coord lookup lands on the same cell", byWorld.cell[0] === 120 && byWorld.cell[1] === 40);

	// paint a cell and read it back
	const put = await api("/api/cell", { method: "PUT", body: JSON.stringify({ x: 5, z: 5, biome: "swamp" }) });
	check("PUT /api/cell paints one cell", put.status === 200 && put.body.biome === "swamp");
	const rect = (await api("/api/paint", { method: "POST", body: JSON.stringify({ biome: "forest", rect: [10, 10, 13, 12] }) })).body;
	check(`rect paint covers the block (${rect.painted} cells)`, rect.painted === 12);
	const bad = await api("/api/paint", { method: "POST", body: JSON.stringify({ biome: "lava", rect: [0, 0, 1, 1] }) });
	check("unknown biome is refused with the legend attached", bad.status === 400 && !!bad.body.legend);

	// persistence: the temp file on disk actually changed
	const disk = JSON.parse(readFileSync(tmpMap, "utf8"));
	check("edits hit the disk immediately", disk.grid[5][5] === "s" && disk.grid[11][11] === "F");

	// roads: add, list, delete
	const addRoad = await api("/api/roads", { method: "POST", body: JSON.stringify({ id: "US-50", pts: [[-50000, 0], [-40000, 500]] }) });
	check("POST /api/roads adds a highway", addRoad.status === 200);
	const roads = (await api("/api/roads")).body;
	check("the new road is in the network", roads.some((r) => r.id === "US-50"));
	const delRoad = (await api("/api/roads?id=US-50", { method: "DELETE" })).body;
	check("DELETE /api/roads removes it", delRoad.removed === 1);

	// towns: add near a world point, query finds it
	await api("/api/towns", { method: "POST", body: JSON.stringify({ id: "testville", name: "TESTVILLE", pos: [-30000, 4000], kind: "ville" }) });
	const query = (await api("/api/query?wx=-30000&wz=4000&r=3000")).body;
	check("query finds the founded town within radius", query.towns.some((t) => t.id === "testville"));
	check("query names the ground it stands on", typeof query.here.biome === "string" && query.here.state !== undefined);
	const delTown = (await api("/api/towns?id=testville", { method: "DELETE" })).body;
	check("DELETE /api/towns removes it", delTown.removed === 1);

	// --- MapForge v2 (Goal 2): placements, auto-exit, template stamp ---------
	const place = await api("/api/placements", { method: "POST", body: JSON.stringify({ building: "gas_station", pos: [8000, 8000], id: "test-place" }) });
	check("POST /api/placements pins a structure", place.status === 200 && place.body.ok);
	const places = (await api("/api/placements")).body;
	check("the placement is in the authored layer", places.some((p) => p.id === "test-place"));
	const delPlace = (await api("/api/placements?id=test-place", { method: "DELETE" })).body;
	check("DELETE /api/placements removes it", delPlace.removed === 1);

	// PROOF CASE: an off-ramp connects Meridian to the nearest interstate.
	const exit = await api("/api/exit", { method: "POST", body: JSON.stringify({ town: "meridian" }) });
	check("POST /api/exit builds an off-ramp from an interstate", exit.status === 200 && exit.body.ramp.kind === "exit");
	const afterExit = (await api("/api/cell?wx=110&wz=-325")).body;
	check(`Meridian now reaches a road (${afterExit.nearest_road?.dist_m} m, was 1252)`, afterExit.nearest_road && afterExit.nearest_road.dist_m < 50);

	const stamp = await api("/api/stamp_template", { method: "POST", body: JSON.stringify({ template: "waystation", pos: [-20000, 6000], name: "teststamp" }) });
	check("POST /api/stamp_template drops a cluster", stamp.status === 200 && stamp.body.stamped.length >= 2);
	const badTpl = await api("/api/stamp_template", { method: "POST", body: JSON.stringify({ template: "nope", pos: [0, 0] }) });
	check("unknown template is refused with the list", badTpl.status === 400 && Array.isArray(badTpl.body.templates));
} catch (e) {
	failed++;
	console.log(`API: FAIL - exception: ${e}`);
}

console.log(`API RESULTS: ${passed} passed, ${failed} failed`);
console.log(`MAPFORGE API: ${failed === 0 ? "ALL CHECKS PASSED" : "FAILURES PRESENT"}`);
// Let the child die BEFORE we exit — killing and exiting in the same tick trips
// a libuv teardown assertion on Windows and clobbers the exit code.
server.on("exit", () => process.exit(failed === 0 ? 0 : 1));
server.kill();
setTimeout(() => process.exit(failed === 0 ? 0 : 1), 2000).unref();
