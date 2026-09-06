import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { bakeJunctions } from './bake_junctions.mjs';

const script = fileURLToPath(new URL('./repair_diamond_interchanges.mjs', import.meta.url));
const source = await import('./repair_diamond_interchanges.mjs').catch(() => ({}));
const managedIds = new Set(['cedar', 'violet', 'amber', 'cobalt', 'X-crossroad', 'X-town-link']);

function fixture() {
	return {
		world_offset: [-2000, -2000], cell_m: 500, relief: Array(8).fill('00000000'),
		grid: Array(8).fill('p'.repeat(8)), legend: { p: 'plains' }, towns: [], districts: [], placements: [],
		roads: [
			{ id: 'main', kind: 'interstate', pts: [[-1200, 0], [1200, 0]], elev: [0, 0], elev_mode: 'ground', lanes: 6, divided: true },
			{ id: 'town', kind: 'street', pts: [[-520, -300], [-520, -180]], elev: [0, 0], elev_mode: 'ground', lanes: 2 },
			{ id: 'foreign', kind: 'county', pts: [[700, 500], [900, 500]], elev: [0, 0], elev_mode: 'ground', lanes: 2, custom: 'KEEP' },
			{ id: 'cedar', side: 1, pts: [[0, 14.6], [80, 31], [0, 180]], kind: 'exit', lanes: 2, divided: false, custom: 'CEDAR' },
			{ id: 'violet', side: 1, pts: [[0, 180], [180, 31], [260, 14.6]], kind: 'exit', lanes: 2, divided: false, custom: 'VIOLET' },
			{ id: 'amber', side: -1, pts: [[0, -14.6], [-80, -31], [0, -180]], kind: 'exit', lanes: 2, divided: false, custom: 'AMBER' },
			{ id: 'cobalt', side: -1, pts: [[0, -180], [-180, -31], [-260, -14.6]], kind: 'exit', lanes: 2, divided: false, custom: 'COBALT' },
		],
		exits: [{ id: 'X', highway_id: 'main', pos: [0, 0], dest: [-520, -240],
			ramp_ids: ['cedar', 'violet', 'amber', 'cobalt'], name: 'KEEP EXIT', payload: { key: 4 } }],
		junctions: [
			{ id: 'legacy-mouth', kind: 'ramp_mouth', grade: 'flat', control: 'riro', pos: [0, 0], custom: 'KEEP',
				legs: [{ road: 'main', arc_m: 1200 }, { road: 'cedar', arc_m: 0 }, { road: 'amber', arc_m: 0 }, { road: 'foreign', arc_m: 0 }] },
			{ id: 'legacy-violet', kind: 'ramp_rejoin', grade: 'flat', control: 'riro', pos: [260, 0],
				legs: [{ road: 'main', arc_m: 1460 }, { road: 'violet', arc_m: 340 }] },
			{ id: 'legacy-cobalt', kind: 'ramp_rejoin', grade: 'flat', control: 'riro', pos: [-260, 0],
				legs: [{ road: 'main', arc_m: 940 }, { road: 'cobalt', arc_m: 340 }] },
			{ id: 'unrelated', kind: 'end_cap', grade: 'flat', control: 'none', pos: [900, 500], custom: { keep: true },
				legs: [{ road: 'foreign', arc_m: 200 }] },
		],
	};
}

function staged(change = () => {}) {
	const root = resolve('build');
	mkdirSync(root, { recursive: true });
	const directory = mkdtempSync(join(root, 'diamond-repair-test-'));
	const path = join(directory, 'map.json');
	const map = fixture();
	change(map);
	writeFileSync(path, JSON.stringify(map));
	return { directory, path, map };
}

function cleanup(directory) {
	assert.equal(dirname(resolve(directory)), resolve('build'), 'fixture cleanup must stay inside the worktree build directory');
	rmSync(directory, { recursive: true, force: true });
}

function run(path, ...args) {
	return spawnSync(process.execPath, [script, `--map=${path}`, ...args], { encoding: 'utf8' });
}

test('migration CLI is dry by default, writes only selected ownership, and repeats byte-identically', () => {
	const { directory, path, map } = staged();
	try {
		const bytes = readFileSync(path);
		const dry = run(path, '--exit=X');
		assert.equal(dry.status, 0, dry.stderr);
		assert.deepEqual(readFileSync(path), bytes, 'default invocation must preserve exact source bytes');
		const written = run(path, '--write', '--exit=X');
		assert.equal(written.status, 0, written.stderr);
		const after = JSON.parse(readFileSync(path, 'utf8'));
		assert.deepEqual(after.roads.filter((road) => !managedIds.has(road.id)), map.roads.filter((road) => !managedIds.has(road.id)));
		assert.deepEqual(after.exits[0].payload, { key: 4 });
		assert.equal(after.exits[0].interchange.layout, 'diamond_v2');
		assert.deepEqual(after.exits[0].connector_ids, ['X-crossroad', 'X-town-link']);
		for (const id of ['cedar', 'violet', 'amber', 'cobalt']) {
			const ramp = after.roads.find((road) => road.id === id);
			assert.equal(ramp.geom, 'diamond_v2');
			assert.equal(ramp.interchange_id, 'X');
			assert.equal(ramp.custom, id.toUpperCase());
		}
		const retained = after.junctions.find((row) => row.id === 'legacy-mouth');
		assert.equal(retained.custom, 'KEEP');
		assert.deepEqual(retained.legs, [{ road: 'main', arc_m: 1200 }, { road: 'foreign', arc_m: 0 }]);
		assert.deepEqual(after.junctions.find((row) => row.id === 'unrelated'), map.junctions.find((row) => row.id === 'unrelated'));
		const once = readFileSync(path);
		const repeat = run(path, '--write', '--exit=X');
		assert.equal(repeat.status, 0, repeat.stderr);
		assert.deepEqual(readFileSync(path), once, 'repeat write must be byte-identical');
	} finally { cleanup(directory); }
});

test('migration API reports exact selected replacement counts', () => {
	assert.equal(typeof source.applyDiamondInterchanges, 'function', 'missing selective migration API');
	const map = fixture();
	assert.deepEqual(source.applyDiamondInterchanges(map, ['X']), { exits: 1, roads: 6, junctions: 8 });
});

test('missing and ambiguous role ownership reject before write', () => {
	for (const [name, change, pattern] of [
		['missing', (map) => { map.junctions = map.junctions.filter((row) => !row.legs.some((leg) => leg.road === 'cobalt')); }, /role|junction|cobalt/i],
		['ambiguous', (map) => { map.junctions.push({ id: 'contradiction', kind: 'ramp_rejoin', legs: [{ road: 'main' }, { road: 'cedar' }] }); }, /ambiguous|contradict/i],
		['foreign', (map) => { map.junctions[1].legs[0].road = 'foreign'; }, /owning highway|role|violet/i],
		['foreign-extra', (map) => { map.junctions.push({ id: 'foreign-mouth', kind: 'ramp_mouth', legs: [{ road: 'foreign' }, { road: 'cedar' }] }); }, /foreign|owning highway|cedar/i],
		['side', (map) => { map.roads.find((road) => road.id === 'cedar').side = -1; }, /side|direction/i],
	]) {
		const { directory, path } = staged(change);
		try {
			const before = readFileSync(path);
			const result = run(path, '--write', '--exit=X');
			assert.notEqual(result.status, 0, `${name} should reject`);
			assert.match(result.stderr, pattern);
			assert.deepEqual(readFileSync(path), before, `${name} rejection must precede write`);
		} finally { cleanup(directory); }
	}
});

test('stale source digest and unsupported authored layout reject before write', () => {
	for (const [change, args, pattern] of [
		[() => {}, ['--expect-source-sha256=' + '0'.repeat(64)], /stale|digest/i],
		[(map) => { map.exits[0].interchange = { layout: 'authored_cloverleaf' }; }, [], /layout|authored|unsupported/i],
	]) {
		const { directory, path } = staged(change);
		try {
			const before = readFileSync(path);
			const result = run(path, '--write', '--exit=X', ...args);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, pattern);
			assert.deepEqual(readFileSync(path), before);
		} finally { cleanup(directory); }
	}
});

test('expected source digest permits the reviewed write', () => {
	const { directory, path } = staged();
	try {
		const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
		const result = run(path, '--write', '--exit=X', `--expect-source-sha256=${digest}`);
		assert.equal(result.status, 0, result.stderr);
	} finally { cleanup(directory); }
});

test('dry run reports footprint and external-road conflicts while write fails closed', () => {
	const { directory, path } = staged((map) => {
		map.placements.push({ id: 'blocked-building', building: 'safehouse', pos: [0, 100], rot: 0 });
		map.roads.push({ id: 'intruder', kind: 'county', lanes: 2, divided: false, pts: [[-50, 100], [50, 100]], custom: 'KEEP' });
	});
	try {
		const before = readFileSync(path);
		const dry = run(path, '--exit=X');
		assert.equal(dry.status, 0, dry.stderr);
		const report = JSON.parse(dry.stdout);
		assert.ok(report.building_conflicts.some((row) => row.placement === 'blocked-building'));
		assert.ok(report.external_road_conflicts.some((row) => row.external_road === 'intruder'));
		assert.deepEqual(readFileSync(path), before);
		const write = run(path, '--write', '--exit=X');
		assert.notEqual(write.status, 0);
		assert.match(write.stderr, /conflict/i);
		assert.deepEqual(readFileSync(path), before);
	} finally { cleanup(directory); }
});

test('full junction rebakes preserve managed roles, profiles, ports, and deck separation', () => {
	assert.equal(typeof source.applyDiamondInterchanges, 'function', 'missing selective migration API');
	const map = fixture();
	source.applyDiamondInterchanges(map, ['X']);
	const before = new Map(map.roads.filter((road) => managedIds.has(road.id))
		.map((road) => [road.id, { pts: structuredClone(road.pts), elev: structuredClone(road.elev) }]));
	bakeJunctions(map);
	for (const road of map.roads.filter((row) => managedIds.has(row.id))) {
		assert.deepEqual(road.pts, before.get(road.id).pts, `${road.id} geometry changed`);
		assert.deepEqual(road.elev, before.get(road.id).elev, `${road.id} profile changed`);
	}
	for (const id of ['cedar', 'violet', 'amber', 'cobalt']) {
		const ramp = map.roads.find((road) => road.id === id);
		assert.ok(['off', 'on'].includes(ramp.ramp_role));
		assert.equal(ramp.geom, 'diamond_v2');
		assert.equal(ramp.elev_mode, 'structure');
		const port = map.junctions.find((row) => row.legs?.[0]?.road === 'main' && row.legs.some((leg) => leg.road === id));
		assert.ok(port, `${id} must retain its actual highway port`);
		assert.equal(port.control, 'riro');
	}
	const transfers = map.junctions.filter((row) => row.legs?.some((leg) => leg.road === 'main')
		&& row.legs.some((leg) => leg.road === 'X-crossroad'));
	assert.equal(transfers.length, 1);
	assert.equal(transfers[0].grade, 'deck');
	assert.equal(transfers[0].control, 'none');
	const once = JSON.stringify(map);
	bakeJunctions(map);
	assert.equal(JSON.stringify(map), once, 'repeated full bake must not collapse managed geometry or metadata');
});
