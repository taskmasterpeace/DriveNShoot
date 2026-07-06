#!/usr/bin/env node
// VehicleForge API smoke test — boots on a TEMP COPY of vehicles.json and exercises
// every endpoint an AI would use to read/tune the fleet.
// Run: node tools/vehicleforge/test_api.mjs  →  "VEHICLEFORGE API: ALL CHECKS PASSED"

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const PORT = 8976;
const BASE = `http://localhost:${PORT}`;

const tmp = mkdtempSync(join(tmpdir(), "vehicleforge-"));
const tmpData = join(tmp, "vehicles.json");
writeFileSync(tmpData, readFileSync(join(ROOT, "game", "data", "vehicles.json")));

const server = spawn(process.execPath, [join(HERE, "server.mjs")], {
	env: { ...process.env, VEHICLES_PATH: tmpData, VEHICLEFORGE_PORT: String(PORT) }, stdio: "ignore",
});

let passed = 0, failed = 0;
const check = (name, ok) => { ok ? (passed++, console.log(`VF: PASS - ${name}`)) : (failed++, console.log(`VF: FAIL - ${name}`)); };
const api = async (path, opts) => { const r = await fetch(BASE + path, opts); return { status: r.status, body: await r.json() }; };

for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/api/help"); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }

try {
	const help = (await api("/api/help")).body;
	check("help documents the endpoints + archetypes", help.endpoints.length >= 6 && help.archetypes.includes("pickup"));

	const fleet = (await api("/api/vehicles")).body;
	check(`the whole fleet lists (${fleet.length}, want >=9)`, fleet.length >= 9);
	check("the new data-only vehicles are present", fleet.some((v) => v.id === "pickup_truck") && fleet.some((v) => v.id === "suv"));

	const suv = (await api("/api/vehicle?id=suv")).body;
	check("GET one vehicle by id", suv.id === "suv" && typeof suv.armor.front === "number");

	// PATCH one armor face — the rest of armor must survive (deep merge)
	const beforeRear = suv.armor.rear;
	const patch = (await api("/api/vehicle?id=suv", { method: "PATCH", body: JSON.stringify({ armor: { front: 77 } }) })).body;
	check("PATCH updates one armor face", patch.ok && patch.row.armor.front === 77);
	check("PATCH keeps the other armor faces (deep merge)", patch.row.armor.rear === beforeRear);

	// armor clamps to 0..100
	const clamp = (await api("/api/vehicle?id=suv", { method: "PATCH", body: JSON.stringify({ armor: { front: 999 } }) })).body;
	check("armor clamps to 100", clamp.row.armor.front === 100);

	// persistence: temp file on disk changed
	const disk = JSON.parse(readFileSync(tmpData, "utf8"));
	check("edits hit vehicles.json on disk", disk.vehicles.find((v) => v.id === "suv").armor.front === 100);

	// POST a brand-new vehicle (pure data)
	const bad = await api("/api/vehicles", { method: "POST", body: JSON.stringify({ id: "apc", archetype: "hovercraft" }) });
	check("bad archetype is refused with the valid list", bad.status === 400 && bad.body.error.includes("archetype"));
	const add = await api("/api/vehicles", { method: "POST", body: JSON.stringify({ id: "apc", name: "APC", archetype: "van", family: "suv", engine_force: 9000, armor: { front: 90, rear: 80, side: 85 } }) });
	check("POST forges a new vehicle from data alone", add.status === 200 && add.body.row.id === "apc");
	check("the new vehicle joins the fleet", (await api("/api/vehicles")).body.some((v) => v.id === "apc"));

	const del = (await api("/api/vehicles?id=apc", { method: "DELETE" })).body;
	check("DELETE removes a vehicle", del.removed === 1);
} catch (e) { failed++; console.log(`VF: FAIL - exception: ${e}`); }

console.log(`VF RESULTS: ${passed} passed, ${failed} failed`);
console.log(`VEHICLEFORGE API: ${failed === 0 ? "ALL CHECKS PASSED" : "FAILURES PRESENT"}`);
server.on("exit", () => process.exit(failed === 0 ? 0 : 1));
server.kill();
setTimeout(() => process.exit(failed === 0 ? 0 : 1), 2000).unref();
