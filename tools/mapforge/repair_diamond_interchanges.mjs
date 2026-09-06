// Exact-scope diamond migration. Dry by default; --write atomically replaces
// the selected map only after ownership, geometry and stale-source validation.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDiamondInterchanges } from './bake_junctions.mjs';
import { buildRoadCorridors, footprintRoadConflicts, placementFootprint, roadHalfWidth } from './road_clearance.mjs';

export { applyDiamondInterchanges } from './bake_junctions.mjs';

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

function selectedRoadOwners(map, exitIds) {
	const selected = new Set(exitIds), owners = new Map();
	for (const exit of map.exits || []) {
		if (!selected.has(exit.id)) continue;
		for (const roadId of [...(exit.ramp_ids || []), ...(exit.connector_ids || [])]) owners.set(roadId, exit.id);
	}
	return owners;
}

function buildingConflicts(map, exitIds, profiles) {
	const owners = selectedRoadOwners(map, exitIds);
	const corridors = buildRoadCorridors((map.roads || []).filter((road) => owners.has(road.id)));
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
	const owners = selectedRoadOwners(map, exitIds);
	const managed = (map.roads || []).filter((road) => owners.has(road.id));
	const conflicts = new Map();
	for (const road of managed) {
		const owner = owners.get(road.id), exit = exits.get(owner);
		for (const other of map.roads || []) {
			const otherOwner = owners.get(other.id);
			if (other.id === road.id || otherOwner === owner) continue;
			if (other.id === exit.highway_id) continue;
			for (let i = 1; i < road.pts.length; i++) for (let j = 1; j < other.pts.length; j++) {
				const pos = segmentIntersection(road.pts[i - 1], road.pts[i], other.pts[j - 1], other.pts[j]);
				if (!pos) continue;
				const atDestination = road.id === `${exit.id}-town-link`
					&& Math.hypot(pos[0] - exit.dest[0], pos[1] - exit.dest[1]) <= 1.01;
				if (atDestination) continue;
				const key = [road.id, other.id].sort().join('\0');
				if (!conflicts.has(key)) conflicts.set(key, { exit: exit.id, managed_road: road.id,
					external_road: other.id, ...(otherOwner ? { external_exit: otherOwner } : {}),
					pos: pos.map((value) => Math.round(value * 100) / 100) });
			}
		}
	}
	return [...conflicts.values()];
}

function distanceToRoad(point, road) {
	let best = Infinity;
	for (let i = 1; i < road.pts.length; i++) {
		const a = road.pts[i - 1], b = road.pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
		const length2 = dx * dx + dz * dz;
		const t = length2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length2)) : 0;
		best = Math.min(best, Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t));
	}
	return best;
}

export function repairMouthTerminalArcs(map, exitIds) {
	assert.ok(Array.isArray(exitIds) && exitIds.length, 'At least one explicit exit selection is required');
	assert.equal(new Set(exitIds).size, exitIds.length, 'Duplicate exit selections are not allowed');
	assert.ok(Array.isArray(map.roads) && Array.isArray(map.exits) && Array.isArray(map.junctions),
		'Mouth arc repair requires roads, exits and junctions arrays');
	const working = structuredClone(map);
	const roads = new Map(working.roads.map((road) => [road.id, road]));
	assert.equal(roads.size, working.roads.length, 'Duplicate road IDs prevent mouth arc repair');
	const changedJunctions = new Set(), corrections = [];
	let changedLegs = 0;
	for (const exitId of exitIds) {
		const matchingExits = working.exits.filter((exit) => exit.id === exitId);
		assert.equal(matchingExits.length, 1, `Expected one selected exit ${exitId}`);
		const exit = matchingExits[0], highway = roads.get(exit.highway_id);
		assert.ok(highway && highway.kind !== 'exit' && Array.isArray(highway.pts) && highway.pts.length >= 2,
			`Exit ${exitId}: missing owning highway ${exit.highway_id}`);
		assert.ok(Array.isArray(exit.ramp_ids) && exit.ramp_ids.length && new Set(exit.ramp_ids).size === exit.ramp_ids.length,
			`Exit ${exitId}: distinct owned ramp IDs required`);
		const owned = new Set(exit.ramp_ids);
		for (const rampId of exit.ramp_ids) {
			const ramp = roads.get(rampId);
			assert.ok(ramp && ramp.kind === 'exit', `Exit ${exitId}: missing owned ramp ${rampId}`);
			assert.ok(!(ramp.exit_id && ramp.exit_id !== exitId) && !(ramp.interchange_id && ramp.interchange_id !== exitId)
				&& !working.exits.some((other) => other.id !== exitId && other.ramp_ids?.includes(rampId)),
				`Ramp ${rampId}: foreign or multiply claimed ownership`);
			assert.ok(ramp.authored !== true && ramp.owner_authored !== true && ramp.generated !== false,
				`Ramp ${rampId}: authored or explicitly nongenerated rows cannot be repaired`);
			assert.equal(ramp.geom, 'peel_v1', `Ramp ${rampId}: unsupported legacy geom scheme`);
			assert.ok(ramp.side === -1 || ramp.side === 1, `Ramp ${rampId}: side must be +1 or -1`);
			assert.ok(Array.isArray(ramp.pts) && ramp.pts.length >= 2
				&& ramp.pts.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)),
				`Ramp ${rampId}: finite terminal polyline required`);
			const threshold = roadHalfWidth(highway) + 4;
			const startNear = distanceToRoad(ramp.pts[0], highway) <= threshold;
			const endNear = distanceToRoad(ramp.pts.at(-1), highway) <= threshold;
			let role = ramp.ramp_role;
			assert.ok(role === undefined || role === 'off' || role === 'on', `Ramp ${rampId}: invalid explicit role`);
			if (role === undefined) {
				assert.notEqual(startNear, endNear, `Ramp ${rampId}: ambiguous highway terminal`);
				role = startNear ? 'off' : 'on';
			} else {
				assert.ok(role === 'off' ? startNear && !endNear : endNear && !startNear,
					`Ramp ${rampId}: explicit role contradicts actual highway terminal`);
			}
			const mouths = working.junctions.filter((junction) => junction.kind === 'ramp_mouth'
				&& (junction.legs || []).some((leg) => leg.road === rampId));
			if (role === 'on') {
				assert.equal(mouths.length, 0, `Ramp ${rampId}: on-ramp contradicts ramp_mouth metadata`);
				continue;
			}
			assert.equal(mouths.length, 1, `Ramp ${rampId}: expected one unique matching ramp mouth`);
			const mouth = mouths[0], rampLegs = mouth.legs.filter((leg) => leg.road === rampId);
			const highwayLegs = mouth.legs.filter((leg) => leg.road === exit.highway_id);
			assert.equal(rampLegs.length, 1, `Ramp ${rampId}: expected one unique mouth leg`);
			assert.equal(highwayLegs.length, 1, `Ramp ${rampId}: mouth must name owning highway ${exit.highway_id}`);
			for (const leg of mouth.legs) {
				const legRoad = roads.get(leg.road);
				if (legRoad?.kind === 'exit') assert.ok(owned.has(leg.road),
					`Ramp ${rampId}: mouth contains foreign ramp leg ${leg.road}`);
			}
			if (rampLegs[0].arc_m !== 0) {
				corrections.push({ junction: mouth.id, road: rampId, from_arc_m: rampLegs[0].arc_m, to_arc_m: 0 });
				rampLegs[0].arc_m = 0;
				changedLegs++;
				changedJunctions.add(mouth.id);
			}
		}
	}
	map.junctions = working.junctions;
	return { junctions: changedJunctions.size, legs: changedLegs, corrections };
}

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
	let temp = null;
	try {
		const args = process.argv.slice(2);
		assert.ok(args.every((arg) => arg === '--write' || arg === '--mouth-arcs-only' || arg.startsWith('--map=') || arg.startsWith('--exit=')
			|| arg.startsWith('--expect-source-sha256=')), 'expected --write, --mouth-arcs-only, --map=PATH, --exit=ID and/or --expect-source-sha256=HEX');
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
		const mouthArcsOnly = args.includes('--mouth-arcs-only');
		const mouthRepair = mouthArcsOnly ? repairMouthTerminalArcs(map, exitIds) : null;
		const counts = mouthArcsOnly
			? { junctions: mouthRepair.junctions, legs: mouthRepair.legs }
			: applyDiamondInterchanges(map, exitIds);
		let conflicts = [], roadConflicts = [];
		if (!mouthArcsOnly) {
			const profileRows = JSON.parse(readFileSync(new URL('../../game/data/world/structure_profiles.json', import.meta.url), 'utf8')).structures;
			const profiles = Object.fromEntries(profileRows.map((row) => [row.id, row]));
			conflicts = buildingConflicts(map, exitIds, profiles);
			roadConflicts = externalRoadConflicts(map, exitIds);
		}
		const output = JSON.stringify(map);
		if (args.includes('--write')) {
			if (!mouthArcsOnly) {
				assert.equal(conflicts.length, 0, `Building footprint conflicts prevent write: ${conflicts.map((row) => row.placement).join(', ')}`);
				assert.equal(roadConflicts.length, 0, `External road conflicts prevent write: ${roadConflicts.map((row) => row.external_road).join(', ')}`);
			}
			assert.deepEqual(readFileSync(path), source, 'Map changed since inspection; refusing stale write');
			temp = path + '.diamond-' + randomUUID() + '.tmp';
			writeFileSync(temp, output, { flag: 'wx' });
			renameSync(temp, path);
			temp = null;
		}
		console.log(JSON.stringify({ mode: args.includes('--write') ? 'write' : 'read-only',
			...(mouthArcsOnly ? { operation: 'mouth-arcs-only', corrections: mouthRepair.corrections } : {}), map: path,
			source_sha256: sourceDigest, selected: exitIds, counts,
			...(!mouthArcsOnly ? { building_conflicts: conflicts, external_road_conflicts: roadConflicts } : {}) }, null, 2));
	} catch (error) {
		if (temp) try { unlinkSync(temp); } catch {}
		console.error(error.message);
		process.exitCode = 1;
	}
}
