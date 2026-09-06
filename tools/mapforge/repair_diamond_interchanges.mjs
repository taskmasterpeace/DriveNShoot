// Exact-scope diamond migration. Dry by default; --write atomically replaces
// the selected map only after ownership, geometry and stale-source validation.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDiamondInterchanges } from './bake_junctions.mjs';
import { buildRoadCorridors, footprintRoadConflicts, placementFootprint } from './road_clearance.mjs';

export { applyDiamondInterchanges } from './bake_junctions.mjs';

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

function buildingConflicts(map, exitIds, profiles) {
	const selected = new Set(exitIds);
	const corridors = buildRoadCorridors((map.roads || []).filter((road) => selected.has(road.interchange_id)));
	return (map.placements || []).flatMap((placement) => {
		const roads = footprintRoadConflicts(placementFootprint(placement, profiles), corridors);
		return roads.length ? [{ placement: placement.id, building: placement.building, roads }] : [];
	});
}

function segmentIntersection(a, b, c, d) {
	const ab = [b[0] - a[0], b[1] - a[1]], cd = [d[0] - c[0], d[1] - c[1]];
	const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
	const denominator = cross(ab, cd);
	if (Math.abs(denominator) < 1e-9) return null;
	const ac = [c[0] - a[0], c[1] - a[1]];
	const t = cross(ac, cd) / denominator, u = cross(ac, ab) / denominator;
	return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + ab[0] * t, a[1] + ab[1] * t] : null;
}

function externalRoadConflicts(map, exitIds) {
	const selected = new Set(exitIds);
	const exits = new Map((map.exits || []).filter((exit) => selected.has(exit.id)).map((exit) => [exit.id, exit]));
	const managed = (map.roads || []).filter((road) => selected.has(road.interchange_id));
	const managedIds = new Set(managed.map((road) => road.id));
	const external = (map.roads || []).filter((road) => !managedIds.has(road.id));
	const conflicts = new Map();
	for (const road of managed) {
		const exit = exits.get(road.interchange_id);
		for (const other of external) {
			if (other.id === exit.highway_id) continue;
			for (let i = 1; i < road.pts.length; i++) for (let j = 1; j < other.pts.length; j++) {
				const pos = segmentIntersection(road.pts[i - 1], road.pts[i], other.pts[j - 1], other.pts[j]);
				if (!pos) continue;
				const atDestination = road.id === `${exit.id}-town-link`
					&& Math.hypot(pos[0] - exit.dest[0], pos[1] - exit.dest[1]) <= 1.01;
				if (atDestination) continue;
				const key = `${road.id}\0${other.id}`;
				if (!conflicts.has(key)) conflicts.set(key, { exit: exit.id, managed_road: road.id,
					external_road: other.id, pos: pos.map((value) => Math.round(value * 100) / 100) });
			}
		}
	}
	return [...conflicts.values()];
}

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
	let temp = null;
	try {
		const args = process.argv.slice(2);
		assert.ok(args.every((arg) => arg === '--write' || arg.startsWith('--map=') || arg.startsWith('--exit=')
			|| arg.startsWith('--expect-source-sha256=')), 'expected --write, --map=PATH, --exit=ID and/or --expect-source-sha256=HEX');
		const path = resolve(args.find((arg) => arg.startsWith('--map='))?.slice(6)
			|| fileURLToPath(new URL('../../game/data/usmap.json', import.meta.url)));
		const exitIds = args.filter((arg) => arg.startsWith('--exit=')).map((arg) => arg.slice(7));
		assert.ok(exitIds.length, 'At least one explicit --exit=ID selection is required');
		assert.equal(new Set(exitIds).size, exitIds.length, 'Duplicate --exit selections are not allowed');
		const source = readFileSync(path);
		const sourceDigest = sha256(source);
		const expected = args.find((arg) => arg.startsWith('--expect-source-sha256='))?.slice(23);
		if (expected !== undefined) {
			assert.match(expected, /^[a-f0-9]{64}$/i, 'Expected source digest must be 64 hexadecimal characters');
			assert.equal(sourceDigest, expected.toLowerCase(), 'Stale source digest; refusing migration');
		}
		const before = JSON.parse(source.toString('utf8'));
		const map = structuredClone(before);
		const counts = applyDiamondInterchanges(map, exitIds);
		const profileRows = JSON.parse(readFileSync(new URL('../../game/data/world/structure_profiles.json', import.meta.url), 'utf8')).structures;
		const profiles = Object.fromEntries(profileRows.map((row) => [row.id, row]));
		const conflicts = buildingConflicts(map, exitIds, profiles);
		const roadConflicts = externalRoadConflicts(map, exitIds);
		const output = JSON.stringify(map);
		if (args.includes('--write')) {
			assert.equal(conflicts.length, 0, `Building footprint conflicts prevent write: ${conflicts.map((row) => row.placement).join(', ')}`);
			assert.equal(roadConflicts.length, 0, `External road conflicts prevent write: ${roadConflicts.map((row) => row.external_road).join(', ')}`);
			assert.deepEqual(readFileSync(path), source, 'Map changed since inspection; refusing stale write');
			temp = path + '.diamond-' + randomUUID() + '.tmp';
			writeFileSync(temp, output, { flag: 'wx' });
			renameSync(temp, path);
			temp = null;
		}
		console.log(JSON.stringify({ mode: args.includes('--write') ? 'write' : 'read-only', map: path,
			source_sha256: sourceDigest, selected: exitIds, counts, building_conflicts: conflicts,
			external_road_conflicts: roadConflicts }, null, 2));
	} catch (error) {
		if (temp) try { unlinkSync(temp); } catch {}
		console.error(error.message);
		process.exitCode = 1;
	}
}
