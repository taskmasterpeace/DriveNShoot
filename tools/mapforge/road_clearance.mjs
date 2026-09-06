// Write-side geometry companion to ProtoUSMap.road_geometry and Godot's Y yaw.
// Profiles describe the full ground footprint; center-only checks miss corners.
export function roadHalfWidth(road) {
	// These are raw JSON rows, before ProtoUSMap.load_file fills lane defaults.
	const kind = road.kind ?? "interstate";
	const lanes = Number(road.lanes ?? (kind === "interstate" ? 4 : 2));
	const divided = road.divided ?? lanes >= 6;
	return divided ? Math.max(1, Math.floor(lanes / 2)) * 3.6 + 1.6 + 1.2
		: (lanes * 3.6 + 2.0) * 0.5;
}

export function placementFootprint(row, profiles) {
	const sid = row.building === "gas_station" ? "gas_station_small" : row.building;
	const profile = profiles[sid];
	const [w, d] = profile?.footprint_m || [8, 8];
	// The runtime's uncatalogued fallback box is not rotated.
	return { pos: row.pos, half: [w * 0.5, d * 0.5], rot: profile ? Number(row.rot || 0) : 0 };
}

export function buildRoadCorridors(roads, clearance = 1) {
	return roads.flatMap((road) => {
		const width = roadHalfWidth(road), half = width + clearance;
		return (road.pts || []).slice(1).map((end, i) => {
			const start = road.pts[i];
			const dx = end[0] - start[0], dz = end[1] - start[1];
			const length = Math.hypot(dx, dz);
			// _build_road_stretch renders length + 6 m: reserve 3 m at BOTH
			// ends before applying the broad-phase capsule and full clearance.
			// A capsule around unextended points cuts off the slab's corners.
			const ex = length ? dx / length * 3 : 0, ez = length ? dz / length * 3 : 0;
			const a = [start[0] - ex, start[1] - ez], b = [end[0] + ex, end[1] + ez];
			const px = length ? -dz / length * width : 0, pz = length ? dx / length * width : 0;
			const corners = [[a[0]+px, a[1]+pz], [b[0]+px, b[1]+pz], [b[0]-px, b[1]-pz], [a[0]-px, a[1]-pz]];
			const rect = length ? { pos: [(start[0]+end[0])*0.5, (start[1]+end[1])*0.5],
				half: [width, length*0.5+3], rot: Math.atan2(dx, dz) } : null;
			return { road: road.id, a, b, half, clearance, corners, rect,
				min: [Math.min(a[0], b[0]) - half, Math.min(a[1], b[1]) - half],
				max: [Math.max(a[0], b[0]) + half, Math.max(a[1], b[1]) + half] };
		});
	});
}

function localPoint(point, box) {
	const dx = point[0] - box.pos[0], dz = point[1] - box.pos[1];
	const c = Math.cos(box.rot), s = Math.sin(box.rot);
	return [dx * c - dz * s, dx * s + dz * c];
}

function pointSegmentDistance(p, a, b) {
	const dx = b[0] - a[0], dz = b[1] - a[1];
	const length2 = dx * dx + dz * dz;
	const u = length2 ? Math.max(0, Math.min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dz) / length2)) : 0;
	return Math.hypot(p[0] - a[0] - dx*u, p[1] - a[1] - dz*u);
}

function segmentBoxDistance(a, b, half) {
	let lo = 0, hi = 1;
	for (let axis = 0; axis < 2; axis++) {
		const delta = b[axis] - a[axis];
		if (Math.abs(delta) < 1e-12) {
			if (Math.abs(a[axis]) > half[axis]) { hi = -1; break; }
		} else {
			const u = (-half[axis] - a[axis]) / delta, v = (half[axis] - a[axis]) / delta;
			lo = Math.max(lo, Math.min(u, v));
			hi = Math.min(hi, Math.max(u, v));
		}
	}
	if (lo <= hi) return 0;
	const pointBox = (p) => Math.hypot(Math.max(0, Math.abs(p[0]) - half[0]), Math.max(0, Math.abs(p[1]) - half[1]));
	let distance = Math.min(pointBox(a), pointBox(b));
	for (const x of [-half[0], half[0]]) for (const z of [-half[1], half[1]])
		distance = Math.min(distance, pointSegmentDistance([x, z], a, b));
	return distance;
}

export function footprintRoadConflicts(box, corridors) {
	const c = Math.abs(Math.cos(box.rot)), s = Math.abs(Math.sin(box.rot));
	const extent = [c * box.half[0] + s * box.half[1], s * box.half[0] + c * box.half[1]];
	const hits = new Set();
	for (const segment of corridors) {
		if (box.pos[0] + extent[0] < segment.min[0] || box.pos[0] - extent[0] > segment.max[0]
			|| box.pos[1] + extent[1] < segment.min[1] || box.pos[1] - extent[1] > segment.max[1]) continue;
		if (segmentBoxDistance(localPoint(segment.a, box), localPoint(segment.b, box), box.half) > segment.half) continue;
		if (segment.rect) {
			// Exact rendered-rectangle narrow phase: containment or minimum edge
			// distance. The enclosing capsule alone over-reserves clear end ground.
			const center = localPoint(box.pos, segment.rect);
			const contained = Math.abs(center[0]) <= segment.rect.half[0] && Math.abs(center[1]) <= segment.rect.half[1];
			const points = segment.corners.map((point) => localPoint(point, box));
			if (!contained && !points.some((point, i) => segmentBoxDistance(point, points[(i+1)%4], box.half) <= segment.clearance)) continue;
		}
		hits.add(segment.road);
	}
	return [...hits];
}

export function footprintsOverlap(a, b, gap = 0) {
	const ah = a.half.map((h) => h + gap * 0.5), bh = b.half.map((h) => h + gap * 0.5);
	if (Math.hypot(a.pos[0]-b.pos[0], a.pos[1]-b.pos[1]) >= Math.hypot(...ah) + Math.hypot(...bh)) return false;
	const axes = (box) => [[Math.cos(box.rot), -Math.sin(box.rot)], [Math.sin(box.rot), Math.cos(box.rot)]];
	const aa = axes(a), ba = axes(b);
	const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
	const delta = [b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]];
	for (const axis of [...aa, ...ba]) {
		const ar = ah[0] * Math.abs(dot(aa[0], axis)) + ah[1] * Math.abs(dot(aa[1], axis));
		const br = bh[0] * Math.abs(dot(ba[0], axis)) + bh[1] * Math.abs(dot(ba[1], axis));
		if (Math.abs(dot(delta, axis)) >= ar + br) return false;
	}
	return true;
}

// These four rows were traced to corridor_pass's hamlet template. Never infer
// legacy ownership from a town-name prefix: a human can stamp templates too.
const AUDITED_LEGACY = {
	"peach-combine-depot": new Set([
		"PEACH COMBINE DEPOT-ruined_house-0", "PEACH COMBINE DEPOT-ruined_house-1",
		"PEACH COMBINE DEPOT-safehouse-2", "PEACH COMBINE DEPOT-market_stall-3",
	]),
};

export function repairGeneratedTownPlacements(map, townId, profiles, { maxMove = 80, townRadius = 350 } = {}) {
	const town = (map.towns || []).find((t) => t.id === townId);
	if (!town) throw new Error(`Unknown town: ${townId}`);
	if (town.authored) throw new Error(`Refusing authored town: ${townId}`);
	if (!Number.isFinite(maxMove) || maxMove < 1 || maxMove > 100 || !Number.isFinite(townRadius) || townRadius < 1 || townRadius > 500)
		throw new Error("Repair bounds must be finite: maxMove 1..100 m, townRadius 1..500 m");
	const rows = map.placements || [];
	const corridors = buildRoadCorridors(map.roads || []);
	const boxes = rows.map((row) => placementFootprint(row, profiles));
	const generated = (row) => {
		if (row.authored || row.owner_authored || row.generated === false) return false;
		if (Math.hypot(row.pos[0] - town.pos[0], row.pos[1] - town.pos[1]) > townRadius) return false;
		const slot = String(row.id).startsWith(`${townId}-slot-`) && /^\d+$/.test(String(row.id).slice(`${townId}-slot-`.length));
		return slot || Boolean(AUDITED_LEGACY[townId]?.has(row.id));
	};
	const targets = rows.map((row, index) => ({ row, index }))
		.filter(({ row, index }) => generated(row) && footprintRoadConflicts(boxes[index], corridors).length)
		.sort((a, b) => a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0);
	// Nearest-first integer-metre search; ties are stable and no RNG is involved.
	const offsets = [];
	for (let x = -maxMove; x <= maxMove; x++) for (let z = -maxMove; z <= maxMove; z++)
		if ((x || z) && x*x + z*z <= maxMove*maxMove) offsets.push([x, z]);
	offsets.sort((a, b) => a[0]*a[0] + a[1]*a[1] - b[0]*b[0] - b[1]*b[1] || a[0] - b[0] || a[1] - b[1]);
	const onLand = (pos) => {
		if (!map.grid?.length) return true;
		const [ox, oz] = map.world_offset || [0, 0], cell = map.cell_m || 500;
		const ch = map.grid[Math.floor((pos[1] - oz) / cell)]?.[Math.floor((pos[0] - ox) / cell)];
		const biome = map.legend?.[ch];
		return biome !== undefined && biome !== "water" && biome !== "ocean";
	};
	const moves = [];
	for (const { row, index } of targets) {
		const box = boxes[index], roads = footprintRoadConflicts(box, corridors);
		let next = null;
		for (const [x, z] of offsets) {
			const pos = [row.pos[0] + x, row.pos[1] + z];
			if (Math.hypot(pos[0] - town.pos[0], pos[1] - town.pos[1]) > townRadius || !onLand(pos)) continue;
			const candidate = { ...box, pos };
			if (footprintRoadConflicts(candidate, corridors).length) continue;
			if (boxes.some((other, j) => j !== index && footprintsOverlap(candidate, other, 2.5))) continue;
			next = candidate;
			break;
		}
		if (!next) throw new Error(`No clear location within ${maxMove} m for ${row.id}; no placements changed`);
		boxes[index] = next;
		moves.push({ id: row.id, building: row.building, from: [...row.pos], to: next.pos, roads });
	}
	// Atomic at the map boundary: a failed bounded search never half-applies.
	for (const move of moves) rows.find((row) => row.id === move.id).pos = move.to;
	return { town: townId, moves };
}
