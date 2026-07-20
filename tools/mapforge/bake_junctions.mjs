// THE JUNCTION BAKE (THE_AMERICAN_ROAD M1, rulings 0.2-0.5): derive junctions[]
// from the road coordinates ALREADY in usmap.json — never spec text (0.4), never
// redrawing the owner's roads (0.5: non-endpoint vertices move 0 m; nothing is
// inserted; legs carry arc_m projections instead).
//
// Junction row schema (0.2):
//   { id, kind: tee|cross|ramp_mouth|ramp_rejoin|end_cap,
//     grade: flat|separated_pending|deck, control: gap|riro|none,
//     pos: [x, z], legs: [{ road, arc_m }] }
// gap_half is DERIVED at read time (0.3), never stored.
//
// Usage: node tools/mapforge/bake_junctions.mjs [--dry]
// Also exported as bakeJunctions(map) for server.mjs's POST /api/junctions/bake.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SNAP_M = 40; // endpoint-onto-segment snap radius (roads are 60x-coarse)
const MIN_CROSS_ANGLE_DEG = 15; // shallower than this is a merge, not a crossing
const NETWORK_KINDS = new Set(["interstate", "backroad", "us_route", "state_road", "county", "street", "dirt"]);

const v = (p) => ({ x: p[0], y: p[1] });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a) => Math.hypot(a.x, a.y);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function segs(road) {
	const out = [];
	let arc = 0;
	for (let i = 0; i + 1 < road.pts.length; i++) {
		const a = v(road.pts[i]), b = v(road.pts[i + 1]);
		const l = dist(a, b);
		out.push({ a, b, arc0: arc, len: l, road });
		arc += l;
	}
	return out;
}

function projectOnSeg(p, s) {
	const d = sub(s.b, s.a);
	const l2 = d.x * d.x + d.y * d.y;
	if (l2 < 1e-9) return { t: 0, d: dist(p, s.a) };
	let t = ((p.x - s.a.x) * d.x + (p.y - s.a.y) * d.y) / l2;
	t = Math.max(0, Math.min(1, t));
	const q = { x: s.a.x + d.x * t, y: s.a.y + d.y * t };
	return { t, d: dist(p, q), q };
}

function segIntersect(s1, s2) {
	const d1 = sub(s1.b, s1.a), d2 = sub(s2.b, s2.a);
	const den = d1.x * d2.y - d1.y * d2.x;
	if (Math.abs(den) < 1e-9) return null;
	const dp = sub(s2.a, s1.a);
	const t = (dp.x * d2.y - dp.y * d2.x) / den;
	const u = (dp.x * d1.y - dp.y * d1.x) / den;
	if (t < 0 || t > 1 || u < 0 || u > 1) return null;
	const ang = Math.acos(Math.min(1, Math.abs((d1.x * d2.x + d1.y * d2.y) / (len(d1) * len(d2))))) * 180 / Math.PI;
	return { t, u, ang, q: { x: s1.a.x + d1.x * t, y: s1.a.y + d1.y * t } };
}

function arcAt(road, pos) {
	// arc-length of the closest point on the polyline to pos
	let best = { d: 1e18, arc: 0 };
	for (const s of segs(road)) {
		const pr = projectOnSeg(pos, s);
		if (pr.d < best.d) best = { d: pr.d, arc: s.arc0 + pr.t * s.len };
	}
	return best.arc;
}

// THE ONE GEOMETRY LAW — half-width of a road.
// `ProtoUSMap.road_geometry()` in game/proto3d/usmap.gd is the SINGLE SOURCE OF
// TRUTH for lane math (LANE_W 3.6, SHOULDER_W 1.0, MEDIAN_W 2.4). This function
// returns exactly HALF of that function's `width` for the same road row, and the
// two MUST STAY EQUAL — if road_geometry() ever changes, change this in the same
// commit, or the baked ramps/junctions drift off the road the engine paints.
//   divided:   width = 2*(per_side*3.6 + 1.6) + 2.4  ->  half = per_side*3.6 + 1.6 + 1.2
//   undivided: width = lanes*3.6 + 2.0*SHOULDER_W    ->  half = (lanes*3.6 + 2.0) / 2
function halfWidth(r, divided) {
	const lanes = r.lanes || (r.kind === "interstate" ? 4 : 2);
	const per = Math.max(1, Math.floor(lanes / 2)); // mirrors maxi(1, lanes / 2) (integer division)
	if (divided) return per * 3.6 + 1.6 + 1.2; // half of 2*carriage_w + MEDIAN_W
	return (lanes * 3.6 + 2.0) / 2;            // half of lanes*LANE_W + 2*SHOULDER_W
}

// THE EXIT GEOMETRY LAW v2 (0.18a/b + owner /goal 2026-07-18 "no misaligned exits,
// no dead ends"): every non-authored exit becomes a real DIAMOND INTERCHANGE, built
// deterministically from the exit's on-highway anchor (pos) and its town (dest) —
// so the pass is idempotent and self-repairing (stale ramps are swept, then rebuilt):
//   * TOWN-SIDE half: an off-ramp peels right off the town-side carriageway to dest,
//     and an ON-ramp returns from dest onto that carriageway downstream (kills the
//     one-way-exit trap — you can always get back on).
//   * DIVIDED highways also get the FAR-side half: an off/on pair on the far
//     carriageway landing on the far side (NEVER slicing across the median — the old
//     mirror bug), plus a DECKED cross-street (`-xr`, interchange:true) that bridges
//     the highway to carry the far direction into town. The cross-street is the
//     street INTO town and ties the far side into the connected net (no dead end).
// Authored towns (Meridian) keep their hand-built ramps untouched.
export function rewriteExitGeometry(map) {
	const isDiv = (r) => (r.divided !== undefined ? !!r.divided : (r.lanes || (r.kind === "interstate" ? 4 : 2)) >= 6);
	const stats = { rebuilt: 0, off: 0, on: 0, far_off: 0, far_on: 0, crossroads: 0, authored: 0 };
	const right = (d) => ({ x: -d.y, y: d.x }); // right of travel, top-down
	const norm = (d) => { const l = Math.hypot(d.x, d.y) || 1; return { x: d.x / l, y: d.y / l }; };
	const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
	const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
	const th = (12 * Math.PI) / 180; // the little peel angle

	// local highway direction (along pts order) at the segment nearest to p
	const dirAt = (road, p) => {
		let best = null;
		for (const s of segs(road)) {
			const pr = projectOnSeg(p, s);
			if (!best || pr.d < best.d) best = { ...pr, s };
		}
		const d = norm(sub(best.s.b, best.s.a));
		return { d, foot: best.q ?? best.s.a };
	};

	const authoredTown = new Set((map.towns || []).filter((t) => t.authored).map((t) => t.id));
	// ids WE generate (swept + rebuilt each run so the pass is idempotent). Authored
	// exits KEEP their canon primary off-ramp (ruling 0.5: ids never change —
	// EXIT-meridian survives), but their stale generated mirror/return/cross ARE
	// swept and rebuilt with correct geometry.
	const genIds = (ex) => [`${ex.id}-off`, `${ex.id}-on`, `${ex.id}-off-r`, `${ex.id}-on-r`, `${ex.id}-xr`];
	const managed = new Set();
	const keepPrimary = new Map(); // authored exit id -> its canon primary ramp id
	for (const ex of map.exits || []) {
		for (const id of genIds(ex)) managed.add(id);
		if (authoredTown.has(ex.town_id)) {
			const prim = (ex.ramp_ids || []).find((rid) => !genIds(ex).includes(rid));
			if (prim) keepPrimary.set(ex.id, prim);
		} else {
			for (const rid of ex.ramp_ids || []) managed.add(rid); // sweep the old primary too
		}
	}
	map.roads = (map.roads || []).filter((r) => !managed.has(r.id));
	const R = map.roads;
	const network = R.filter((r) => NETWORK_KINDS.has(r.kind || "interstate"));

	for (const ex of map.exits || []) {
		const hwy = network.find((r) => r.id === ex.highway_id);
		if (!hwy) continue;
		const authored = authoredTown.has(ex.town_id);
		const exPos = v(ex.pos);
		const dest = v(ex.dest || ex.pos);
		const { d: dAlong, foot } = dirAt(hwy, exPos);
		const divided = isDiv(hwy);
		const edge = halfWidth(hwy, divided) + 1.0;
		// town side: the travel direction with dest on its RIGHT
		const toDest = norm(sub(dest, foot));
		const sSign = (right(dAlong).x * toDest.x + right(dAlong).y * toDest.y) >= 0 ? 1 : -1;

		// off-ramp: peel right off the carriageway of direction `sgn`, run to `target`
		const offRamp = (id, sgn, target) => {
			const dS = mul(dAlong, sgn), rS = right(dS);
			const peel = add(foot, mul(rS, edge));
			const out = add(peel, mul({ x: dS.x * Math.cos(th) + rS.x * Math.sin(th), y: dS.y * Math.cos(th) + rS.y * Math.sin(th) }, 70));
			R.push({ id, kind: "exit", pts: [[peel.x, peel.y], [out.x, out.y], [target.x, target.y]],
				danger: ex.risk_rating || 1, family: "", nickname: "", lanes: 2, divided: false, side: sgn, geom: "peel_v1" });
		};
		// on-ramp (return): rise from `source`, merge right onto the carriageway of
		// `sgn`. The merge point is PROJECTED ~180 m downstream onto the REAL highway
		// polyline (dirAt), so a curving highway near the exit never makes the ramp
		// slice back across the carriageways (the I-70_X2 curve case).
		const onRamp = (id, sgn, source) => {
			const provisional = add(foot, mul(mul(dAlong, sgn), 180));
			const { d: dM, foot: footM } = dirAt(hwy, provisional);
			const dS = mul(dM, sgn), rS = right(dS);
			const merge = add(footM, mul(rS, edge));
			const mergeEnd = add(merge, mul(dS, 100));
			R.push({ id, kind: "exit", pts: [[source.x, source.y], [merge.x, merge.y], [mergeEnd.x, mergeEnd.y]],
				danger: ex.risk_rating || 1, family: "", nickname: "", lanes: 2, divided: false, side: sgn, geom: "peel_v1" });
		};

		const ramp_ids = [];
		if (authored && keepPrimary.has(ex.id)) {
			// AUTHORED (Meridian): keep the interchange EXACTLY as hand-built (just the
			// canon primary, ruling 0.5) — no generated road may touch the authored
			// core (dest sits metres from the safehouse). Its county roads (CR-*)
			// already connect it outward, so it is not a dead end. The stale crossing
			// mirror was swept above and is simply not rebuilt.
			ramp_ids.push(keepPrimary.get(ex.id));
			stats.authored++;
			ex.ramp_ids = ramp_ids;
			stats.rebuilt++;
			continue;
		}
		// TOWN-SIDE half-diamond: off (arrive) + on (return — kills the one-way trap)
		offRamp(`${ex.id}-off`, sSign, dest);
		ramp_ids.push(`${ex.id}-off`);
		onRamp(`${ex.id}-on`, sSign, dest);
		ramp_ids.push(`${ex.id}-on`);
		stats.off++; stats.on++;

		if (divided) {
			// reflect dest across the highway LINE (keep the along component, flip the
			// perpendicular) so the far landing sits on the far carriageway's side.
			const vv = sub(dest, foot);
			const alongC = mul(dAlong, vv.x * dAlong.x + vv.y * dAlong.y);
			const perpC = sub(vv, alongC);
			const farLand = add(add(foot, alongC), mul(perpC, -1));
			offRamp(`${ex.id}-off-r`, -sSign, farLand);
			onRamp(`${ex.id}-on-r`, -sSign, farLand);
			// the cross-street INTO town: far landing -> over the highway (at grade,
			// median gapped at the crossing) -> town. Ties the far side into the net.
			R.push({ id: `${ex.id}-xr`, kind: "street", surface: "asphalt",
				pts: [[farLand.x, farLand.y], [foot.x, foot.y], [dest.x, dest.y]],
				danger: 0, family: "", nickname: "", lanes: 2, divided: false, interchange: true });
			ramp_ids.push(`${ex.id}-off-r`, `${ex.id}-on-r`);
			stats.far_off++; stats.far_on++; stats.crossroads++;
		}
		ex.ramp_ids = ramp_ids;
		ex.has_return_ramp = true;
		stats.rebuilt++;
	}
	return stats;
}

// THE ADDRESS LAW (0.1, M3): exit_number = round(arc / EXIT_MILE_M) measured
// from the SOUTH/WEST end of every highway (AASHTO), EXIT_MILE_M tuned so
// MERIDIAN = I-95 EXIT 9. Ids NEVER change — only the display number. Also
// stamps town_id (nearest town within 600 m of dest). Strictly increasing
// along the arc (duplicates bump +1).
export const EXIT_MILE_M = 2395; // TUNED (0.1's own law): Meridian's south-origin arc is 21,557 m → 21557/9 ≈ 2395 makes MERIDIAN = I-95 EXIT 9. The spec's ≈1450 estimate predated the measured arc; the ruling's binding constraint is the canon number, and mile markers use this SAME game-mile so EXIT N stands near MILE N.
export function renumberExits(map) {
	const network = (map.roads || []).filter((r) => NETWORK_KINDS.has(r.kind || "interstate"));
	const stats = { renumbered: 0, meridian: 0, town_ids: 0 };
	const totalLen = (hwy) => segs(hwy).reduce((s, g) => s + g.len, 0);
	const arcFromOrigin = (hwy, pos) => {
		const p0 = v(hwy.pts[0]), pN = v(hwy.pts[hwy.pts.length - 1]);
		const northSouth = Math.abs(pN.y - p0.y) >= Math.abs(pN.x - p0.x);
		const originAtStart = northSouth ? (p0.y > pN.y) : (p0.x < pN.x); // south = +z, west = -x
		const a = arcAt(hwy, pos);
		return originAtStart ? a : totalLen(hwy) - a;
	};
	const byHwy = new Map();
	for (const ex of map.exits || []) {
		if (!byHwy.has(ex.highway_id)) byHwy.set(ex.highway_id, []);
		byHwy.get(ex.highway_id).push(ex);
	}
	for (const [hid, list] of byHwy) {
		const hwy = network.find((r) => r.id === hid);
		if (!hwy) continue;
		list.forEach((ex) => (ex._arc = arcFromOrigin(hwy, v(ex.pos))));
		list.sort((a, b) => a._arc - b._arc);
		let prev = 0;
		for (const ex of list) {
			let n = Math.max(1, Math.round(ex._arc / EXIT_MILE_M));
			if (n <= prev) n = prev + 1; // strictly increasing along the arc
			prev = n;
			ex.exit_number = n;
			delete ex._arc;
			stats.renumbered++;
			if (ex.id === "I-95_X1") stats.meridian = n;
			let bestTown = null, bd = 600;
			for (const t of map.towns || []) {
				const d = dist({ x: t.pos[0], y: t.pos[1] }, v(ex.dest || ex.pos));
				if (d < bd) { bd = d; bestTown = t; }
			}
			if (bestTown) { ex.town_id = bestTown.id; stats.town_ids++; }
		}
	}
	return stats;
}

// THE TOWN GRID GENERATOR (0.19, M3 + owner /goal 2026-07-18 "no unorganized cities,
// streets that go into towns"): every non-authored town becomes a ROBUST CONNECTED
// LATTICE — a main street running IN from the exit + parallel streets + cross streets,
// so the grid can't disconnect (a whole lattice of crossings, not three fragile stubs),
// with buildings LINING the streets (organized), and an APPROACH connector tying the
// grid to the exit ramp. Tier by the town's own kind: a CITY gets a deep grid, a
// HOLDOUT a small main-street. Sweep-and-rebuild (ST- streets + <town>-slot-
// placements) so re-runs replace cleanly.
export function stampTownStreets(map) {
	const stats = { towns: 0, city: 0, holdout: 0, streets: 0, slots: 0 };
	map.roads = (map.roads || []).filter((r) => !String(r.id).startsWith("ST-"));
	map.placements = (map.placements || []).filter((p) => !/-slot-\d+$/.test(String(p.id)));
	const roads = map.roads;
	const placements = map.placements;
	const exitFor = (t) => (map.exits || []).find((e) => e.town_id === t.id);
	const occupied = (p, r) => placements.some((q) => Math.hypot(q.pos[0] - p.x, q.pos[1] - p.y) < r);
	// building kits — a CITY reads as a downtown, a HOLDOUT as a roadside strip.
	const CITY_SET = ["police_station", "courthouse", "clinic_small", "market_general",
		"diner_roadside", "bar_roadhouse", "jeweler", "restaurant_fancy", "warehouse",
		"auto_shop", "radio_station", "school_small", "house_small", "market_general",
		"house_small", "diner_roadside"];
	const HOLDOUT_SET = ["diner_roadside", "market_general", "gas_station_small", "house_small",
		"church_small", "bar_roadhouse", "auto_shop", "motel_strip"];
	let slotSeq = 0;
	const addStreet = (t, tag, a, b) => {
		roads.push({ id: `ST-${t.id}-${tag}`, kind: "street", pts: [[a.x, a.y], [b.x, b.y]],
			danger: 0, family: "", nickname: "", lanes: 2, divided: false });
		stats.streets++;
	};
	const addSlot = (t, sid, p, rot) => {
		if (occupied(p, 15)) return;
		placements.push({ id: `${t.id}-slot-${++slotSeq}`, building: sid, pos: [p.x, p.y], rot });
		stats.slots++;
	};
	for (const t of map.towns || []) {
		if (t.authored) continue;
		const ex = exitFor(t);
		const c = { x: t.pos[0], y: t.pos[1] };
		// MAIN street runs ALONG the approach (from the exit INTO town). No exit ->
		// an E-W default. dir = unit approach (exit -> town); perp is the cross axis.
		let dir = { x: 1, y: 0 };
		if (ex) {
			const d = { x: c.x - ex.pos[0], y: c.y - ex.pos[1] };
			const l = Math.hypot(d.x, d.y) || 1;
			dir = { x: d.x / l, y: d.y / l };
		}
		const perp = { x: -dir.y, y: dir.x };
		// at(a, b): a = along the main drag (+ = away from the exit), b = across it.
		const at = (a, b) => ({ x: c.x + dir.x * a + perp.x * b, y: c.y + dir.y * a + perp.y * b });
		const city = t.kind === "city";
		const nMain = city ? 5 : 3;   // streets parallel to the drag (across offsets)
		const nCross = city ? 5 : 3;  // cross streets (along offsets)
		const SP = 72;                // block size
		const LIP = 60;               // street overhang past the grid — MUST exceed the
		                              // bake's 40 m junction-dedup so the approach tee at
		                              // the main street's exit-side end isn't eaten by the
		                              // first cross (else the approach floats off as its
		                              // own component).
		const halfB = ((nMain - 1) * SP) / 2;   // grid half-width (across)
		const halfA = ((nCross - 1) * SP) / 2;  // grid half-length (along)
		// MAIN streets (parallel to the drag) at each across-offset, full length + a lip
		for (let i = 0; i < nMain; i++) {
			const b = -halfB + i * SP;
			addStreet(t, `m${i}`, at(-halfA - LIP, b), at(halfA + LIP, b));
		}
		// CROSS streets (perpendicular) at each along-offset, full width + a lip
		for (let j = 0; j < nCross; j++) {
			const a = -halfA + j * SP;
			addStreet(t, `x${j}`, at(a, -halfB - 34), at(a, halfB + 34));
		}
		// THE APPROACH: connect the exit ramp/xr (which ends at dest, near town) to the
		// grid's exit-side edge, so the highway literally leads into the street grid.
		if (ex) {
			const dest = { x: (ex.dest || ex.pos)[0], y: (ex.dest || ex.pos)[1] };
			const gate = at(-halfA - LIP, 0); // the -dir edge of the centre main street
			if (Math.hypot(dest.x - gate.x, dest.y - gate.y) > 6) addStreet(t, "approach", dest, gate);
		}
		// BUILDINGS line the main streets (both frontages), facing the street.
		const SET = city ? CITY_SET : HOLDOUT_SET;
		const faceAcross = Math.atan2(perp.x, perp.y); // rot to face across the drag
		let k = 0;
		for (let i = 0; i < nMain; i++) {
			const b = -halfB + i * SP;
			const perBlock = city ? 4 : 3;
			for (let s = 0; s < perBlock; s++) {
				const a = -halfA + 22 + s * ((2 * halfA - 20) / Math.max(1, perBlock - 1));
				for (const side of [1, -1]) {
					const p = at(a, b + side * 13);
					addSlot(t, SET[k % SET.length], p, side > 0 ? faceAcross : faceAcross + Math.PI);
					k++;
				}
			}
		}
		stats.towns++;
		if (city) stats.city++; else stats.holdout++;
	}
	return stats;
}

// THE NETWORK FILL (0.17/0.19, M3b): reclass into the six-class hierarchy +
// stamp the `surface` field on every road; expand COUNTY roads (nearest-town
// links — the secondary net); and THE DIRT DISCOVERY LAYER: every county road
// grows dirt spurs, and EVERY spur carries a `leads_to` payload that lands as
// a real placement — a dead dirt road is a lie the map tells (row-enforced).
export function fillNetwork(map) {
	const stats = { reclassed: 0, surfaced: 0, county_links: 0, spurs: 0, payloads: 0 };
	const roads = map.roads || [];
	const placements = map.placements || [];
	const SURFACE_BY_KIND = { interstate: "asphalt", us_route: "asphalt", state_road: "asphalt",
		street: "asphalt", exit: "asphalt", county: "gravel", dirt: "dirt" };
	for (const r of roads) {
		if (r.kind === "backroad") { r.kind = "county"; stats.reclassed++; } // 0.17: county IS the old backroad
		if (!r.surface) { r.surface = SURFACE_BY_KIND[r.kind] || "asphalt"; stats.surfaced++; }
	}
	// county expansion: each town links to its nearest neighbor within 9 km
	const towns = map.towns || [];
	const linked = new Set(roads.filter((r) => String(r.id).startsWith("CR-")).map((r) => r.id));
	for (const t of towns) {
		let best = null, bd = 9000;
		for (const u of towns) {
			if (u.id === t.id) continue;
			const d = Math.hypot(u.pos[0] - t.pos[0], u.pos[1] - t.pos[1]);
			if (d > 700 && d < bd) { bd = d; best = u; }
		}
		if (!best) continue;
		const [a, b] = [t.id, best.id].sort();
		const cid = `CR-${a}-${b}`;
		if (linked.has(cid)) continue;
		linked.add(cid);
		roads.push({ id: cid, kind: "county", surface: "gravel", pts: [[t.pos[0], t.pos[1]], [best.pos[0], best.pos[1]]],
			danger: 1, family: "", nickname: "", lanes: 2, divided: false });
		stats.county_links++;
	}
	// dirt spurs + payloads (deterministic off the county road's id hash)
	const PAYLOADS = [
		{ kind: "farm", building: "farmhouse_field" },
		{ kind: "hermit", building: "ruined_house" },
		{ kind: "stand", building: "hunting_stand" },
		{ kind: "still", building: "still_shack" },
		{ kind: "quarry", building: "quarry_pit" },
		{ kind: "cemetery", building: "cemetery_old" },
	];
	const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
	for (const r of roads.filter((x) => x.kind === "county")) {
		if (roads.some((x) => String(x.id).startsWith(`DR-${r.id}-`))) continue; // idempotent
		const h = hash(r.id);
		const nSpurs = 1 + (h % 2);
		for (let s = 0; s < nSpurs; s++) {
			const t = s === 0 ? 0.35 : 0.7;
			const a = r.pts[0], b = r.pts[r.pts.length - 1];
			const p = { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
			const d = { x: b[0] - a[0], y: b[1] - a[1] };
			const l = Math.hypot(d.x, d.y) || 1;
			const sgn = ((h >> (s + 2)) & 1) ? 1 : -1;
			const perp = { x: (-d.y / l) * sgn, y: (d.x / l) * sgn };
			const len = 350 + ((h >> (s * 3)) % 350);
			const end = { x: p.x + perp.x * len, y: p.y + perp.y * len };
			const pay = PAYLOADS[(h + s * 7) % PAYLOADS.length];
			const sid = `DR-${r.id}-${s}`;
			const plid = `${sid}-payload`;
			roads.push({ id: sid, kind: "dirt", surface: "dirt", pts: [[p.x, p.y], [end.x, end.y]],
				danger: 1, family: "", nickname: "", lanes: 1, divided: false,
				leads_to: { kind: pay.kind, placement: plid } });
			placements.push({ id: plid, building: pay.building,
				pos: [end.x + perp.x * 14, end.y + perp.y * 14], rot: Math.atan2(-perp.x, -perp.y) });
			stats.spurs++;
			stats.payloads++;
		}
	}
	return stats;
}

// HEAL DEAD ENDS (owner /goal 2026-07-18 "no roads should have dead ends"): every
// network road endpoint that stops in open country — not at the map edge, not at a
// town, not at a payload placement, and not already meeting another road — is EXTENDED
// to whichever is nearest: another road (a real junction), a town centre (it arrives
// somewhere), or the map edge (it leaves the country). The 8 interstates that died
// mid-map and the stray dirt spurs all connect. Run before the junction bake so the
// new meetings bake as tees. Exit ramps are handled by the diamond law, not here.
function nearestEdgePt(p, mn, mx) {
	const dl = p.x - mn[0], dr = mx[0] - p.x, dt = p.y - mn[1], db = mx[1] - p.y;
	const m = Math.min(dl, dr, dt, db);
	if (m === dl) return { x: mn[0], y: p.y };
	if (m === dr) return { x: mx[0], y: p.y };
	if (m === dt) return { x: p.x, y: mn[1] };
	return { x: p.x, y: mx[1] };
}
export function healDeadEnds(map) {
	const roads = map.roads || [], towns = map.towns || [], place = map.placements || [];
	const stats = { healed: 0, to_road: 0, to_town: 0, to_edge: 0 };
	const mn = map.world_offset || [-60000, -20500], cell = map.cell_m || 500;
	const mx = [mn[0] + (map.w || 150) * cell, mn[1] + (map.h || 85) * cell];
	const EDGE = 1600, TOWN_TOL = 1300, PAY_TOL = 130, HEAL_R = 5200;
	const nearEdge = (p) => p.x - mn[0] < EDGE || mx[0] - p.x < EDGE || p.y - mn[1] < EDGE || mx[1] - p.y < EDGE;
	// TWO DIFFERENT ROLES, TWO DIFFERENT SETS:
	//  * the CONNECTED test scans ALL roads, ramps included — an endpoint that meets
	//    an exit ramp IS connected. (Scanning only non-exit roads wrongly judged an
	//    interchange cross-street (`-xr`) a dead end even though its far landing is
	//    served by its own off/on RAMPS; heal then prepended the nearest point on the
	//    highway — already a vertex of that very road — producing doubled-back
	//    polylines like [foot, farLand, foot, dest].)
	//  * heal TARGETS stay non-exit roads only — we still never EXTEND a road onto a ramp.
	const targets = roads.filter((r) => r.kind !== "exit");
	const isTarget = new Set(targets.map((r) => r.id));
	for (const r of roads) {
		if (r.kind === "exit" || !r.pts || r.pts.length < 2) continue;
		for (const which of [0, 1]) {
			// recompute the index each time: healing the start with unshift shifts all
			// indices, so a captured length-1 would then read the wrong (interior) vertex.
			const endIdx = which === 0 ? 0 : r.pts.length - 1;
			const p = { x: r.pts[endIdx][0], y: r.pts[endIdx][1] };
			if (nearEdge(p)) continue;
			if (towns.some((t) => Math.hypot(t.pos[0] - p.x, t.pos[1] - p.y) <= TOWN_TOL)) continue;
			if (place.some((q) => Math.hypot(q.pos[0] - p.x, q.pos[1] - p.y) <= PAY_TOL)) continue;
			let connected = false, bestRoad = null;
			for (const o of roads) {
				if (o.id === r.id) continue;
				const canTarget = isTarget.has(o.id); // a ramp SATISFIES "connected", but is never extended onto
				for (const s of segs(o)) {
					const pr = projectOnSeg(p, s);
					if (pr.d <= SNAP_M) { connected = true; break; }
					if (canTarget && (!bestRoad || pr.d < bestRoad.d)) bestRoad = { d: pr.d, pt: pr.q ?? s.a };
				}
				if (connected) break;
			}
			if (connected) continue;
			const cands = [];
			if (bestRoad) cands.push({ d: bestRoad.d, pt: bestRoad.pt, kind: "road" });
			let bt = null;
			for (const t of towns) {
				const d = Math.hypot(t.pos[0] - p.x, t.pos[1] - p.y);
				if (!bt || d < bt.d) bt = { d, pt: { x: t.pos[0], y: t.pos[1] } };
			}
			if (bt) cands.push({ d: bt.d, pt: bt.pt, kind: "town" });
			const ep = nearestEdgePt(p, mn, mx);
			cands.push({ d: Math.hypot(ep.x - p.x, ep.y - p.y), pt: ep, kind: "edge" });
			cands.sort((a, b) => a.d - b.d);
			const c = cands.find((x) => x.d <= HEAL_R);
			if (!c) continue;
			const np = [c.pt.x, c.pt.y];
			// BELT AND BRACES: never add a vertex this road ALREADY has. Re-adding one
			// doubles the polyline back on itself ([foot, farLand, foot, dest]) instead
			// of extending it; within ~1 m the extension is a no-op anyway.
			if (r.pts.some((q) => Math.hypot(q[0] - np[0], q[1] - np[1]) <= 1.0)) continue;
			if (which === 0) r.pts.unshift(np); else r.pts.push(np);
			stats.healed++; stats["to_" + c.kind]++;
		}
	}
	return stats;
}

export function bakeJunctions(map) {
	// fill the network, ADDRESS the exits (stamps town_id — the town grid needs it to
	// find its exit and run a street in from it), stamp the town grids, rewrite exit
	// geometry to the diamonds, THEN the junction rows read the corrected polylines.
	const fill = fillNetwork(map);
	const addr = renumberExits(map);
	const town = stampTownStreets(map);
	const geo = rewriteExitGeometry(map);
	const heal = healDeadEnds(map);
	const roads = map.roads || [];
	const network = roads.filter((r) => NETWORK_KINDS.has(r.kind || "interstate"));
	const ramps = roads.filter((r) => r.kind === "exit");
	const isDivided = (r) => (r.divided !== undefined ? !!r.divided : (r.lanes || (r.kind === "interstate" ? 4 : 2)) >= 6);
	const junctions = [];
	const lint = { tees: 0, crosses: 0, blind_crossings: [], ramp_mouths: 0, ramp_rejoins: 0, end_caps: 0, exits_ramp_ids: 0 };
	const near = (pos, r) => junctions.find((j) => dist(v(j.pos), pos) <= r);
	let seq = 0;
	const jid = (kind) => `J-${kind}-${++seq}`;
	const push = (kind, grade, control, pos, legs) => {
		junctions.push({ id: jid(kind), kind, grade, control, pos: [Math.round(pos.x * 100) / 100, Math.round(pos.y * 100) / 100], legs });
		return junctions[junctions.length - 1];
	};

	// ---- 1) NETWORK x NETWORK: endpoint tees + true crossings -------------------
	for (let i = 0; i < network.length; i++) {
		for (let j = 0; j < network.length; j++) {
			if (i === j) continue;
			const A = network[i], B = network[j];
			// endpoint of A onto B (interior or endpoint) => TEE (or shared-vertex cross handled below)
			for (const endIdx of [0, A.pts.length - 1]) {
				const p = v(A.pts[endIdx]);
				let best = null;
				for (const s of segs(B)) {
					const pr = projectOnSeg(p, s);
					if (pr.d <= SNAP_M && (!best || pr.d < best.d)) best = { ...pr, s };
				}
				if (!best) continue;
				if (near(best.q ?? p, SNAP_M)) continue; // one node per meeting
				const bothDivided = isDivided(A) && isDivided(B);
				// a tee ONTO a divided road opens a gap in ITS barrier; the arriving
				// road ends here. divided x divided tees still gap (a real T turn).
				const control = isDivided(B) || isDivided(A) ? "gap" : "none";
				const node = best.q ?? p;
				push("tee", "flat", control, node, [
					{ road: B.id, arc_m: Math.round(arcAt(B, node)) },
					{ road: A.id, arc_m: Math.round(arcAt(A, node)) },
				]);
				lint.tees++;
			}
		}
	}
	// true interior crossings (the blind-crossing audit, 0.4). Dedupe rule: a
	// crossing yields only to a node within 12 m, or one within SNAP that
	// involves the SAME two roads — an unrelated tee 40 m away (a town street
	// meeting a county road beside the interstate) must never eat a crossing.
	const MINOR = new Set(["county", "dirt", "street", "backroad"]);
	for (let i = 0; i < network.length; i++) {
		for (let j = i + 1; j < network.length; j++) {
			const A = network[i], B = network[j];
			for (const sa of segs(A)) {
				for (const sb of segs(B)) {
					const hit = segIntersect(sa, sb);
					if (!hit || hit.ang < MIN_CROSS_ANGLE_DEG) continue;
					const dupe = junctions.find((jn) => {
						const d = dist(v(jn.pos), hit.q);
						if (d <= 12) return true;
						if (d > SNAP_M) return false;
						const legs = jn.legs.map((l) => l.road);
						return legs.includes(A.id) && legs.includes(B.id);
					});
					if (dupe) continue;
					const bothDivided = isDivided(A) && isDivided(B);
					// LIMITED ACCESS: a minor road (county/dirt/street) NEVER gaps
					// a divided highway's median at grade — it passes UNDER, walled
					// until a deck makes it real (the crossing-only-via-exits law).
					const minorCross = (isDivided(A) && MINOR.has(B.kind)) || (isDivided(B) && MINOR.has(A.kind));
					// an INTERCHANGE cross-street (`-xr`) is where crossing is MEANT to
					// happen (0.18b v2): it crosses AT GRADE and OPENS the median gap right
					// at the exit — a clean intersection the far direction uses to reach
					// town, instead of a ramp slicing across the carriageways. This is the
					// one sanctioned median crossing (the exit), so limited access holds.
					const interchange = !!A.interchange || !!B.interchange;
					const grade = interchange ? "flat" : (bothDivided || minorCross ? "separated_pending" : "flat");
					const control = interchange ? "gap" : (grade === "flat" ? (isDivided(A) || isDivided(B) ? "gap" : "none") : "none");
					push("cross", grade, control, hit.q, [
						{ road: A.id, arc_m: Math.round(arcAt(A, hit.q)) },
						{ road: B.id, arc_m: Math.round(arcAt(B, hit.q)) },
					]);
					lint.crosses++;
					if (bothDivided)
						lint.blind_crossings.push({ roads: [A.id, B.id], pos: [Math.round(hit.q.x), Math.round(hit.q.y)] });
				}
			}
		}
	}

	// ---- 2) EXITS: ramp mouths + rejoins; write exit.ramp_ids (0.5 dead-code fix)
	const matched = new Set();
	const rampIdsByExit = new Map(); // exit id -> [ramp ids]
	const claim = (ex, rid) => {
		if (!rampIdsByExit.has(ex.id)) rampIdsByExit.set(ex.id, []);
		rampIdsByExit.get(ex.id).push(rid);
		matched.add(rid);
	};
	for (const ex of map.exits || []) {
		const hwy = network.find((r) => r.id === ex.highway_id);
		if (!hwy) continue;
		const exPos = v(ex.pos);
		for (const rp of ramps) {
			if (matched.has(rp.id)) continue;
			const p0 = v(rp.pts[0]);
			// off-ramp: starts at the exit's highway anchor. A mouth dedupes only
			// against OTHER mouths — a tee 3 m away is a different row (kinds
			// drive different engine dressing; I-5_X9 sits beside a backroad tee).
			if (dist(p0, exPos) <= SNAP_M * 2) {
				claim(ex, rp.id);
				const dupe = junctions.find((j) => j.kind === "ramp_mouth" && dist(v(j.pos), exPos) <= 10);
				if (!dupe)
					push("ramp_mouth", "flat", "riro", exPos, [
						{ road: hwy.id, arc_m: Math.round(arcAt(hwy, exPos)) },
						{ road: rp.id, arc_m: 0 },
					]);
				lint.ramp_mouths++;
			}
		}
	}
	// return ramps rejoin the highway DOWNSTREAM of the exit anchor — a second
	// pass projects every unmatched ramp END onto the network and nodes it there.
	for (const rp of ramps) {
		if (matched.has(rp.id)) continue;
		const pN = v(rp.pts[rp.pts.length - 1]);
		let best = null;
		for (const R of network) {
			for (const s of segs(R)) {
				const pr = projectOnSeg(pN, s);
				if (pr.d <= SNAP_M && (!best || pr.d < best.d)) best = { ...pr, R };
			}
		}
		if (!best) continue;
		// attach to its exit: id prefix first ("I-95_X2-on" -> "I-95_X2"), else nearest
		let ex = (map.exits || []).find((e) => rp.id.startsWith(e.id));
		if (!ex) {
			let bd = 1e18;
			for (const e of map.exits || []) {
				const d = dist(v(e.pos), pN);
				if (d < bd) { bd = d; ex = e; }
			}
		}
		if (ex) claim(ex, rp.id);
		const node = best.q;
		if (!near(node, 10))
			push("ramp_rejoin", "flat", "riro", node, [
				{ road: best.R.id, arc_m: Math.round(arcAt(best.R, node)) },
				{ road: rp.id, arc_m: Math.round(arcAt(rp, node)) },
			]);
		lint.ramp_rejoins++;
	}
	for (const ex of map.exits || []) {
		const ids = rampIdsByExit.get(ex.id) || [];
		if (ids.length) {
			ex.ramp_ids = ids;
			lint.exits_ramp_ids++;
		}
	}
	lint.orphan_ramps = ramps.filter((r) => !matched.has(r.id)).map((r) => r.id);

	// ---- 3) END CAPS: network endpoints that meet nothing ----------------------
	for (const A of network) {
		for (const endIdx of [0, A.pts.length - 1]) {
			const p = v(A.pts[endIdx]);
			if (near(p, SNAP_M)) continue;
			push("end_cap", "flat", "none", p, [{ road: A.id, arc_m: Math.round(arcAt(A, p)) }]);
			lint.end_caps++;
		}
	}

	map.junctions = junctions;
	lint.town_stats = town;
	lint.addr_stats = addr;
	lint.geo_stats = geo;
	lint.fill_stats = fill;
	lint.heal_stats = heal;
	return { junctions, lint };
}

// ---- CLI ---------------------------------------------------------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
	const MAP_PATH = process.env.USMAP_PATH || join(ROOT, "game", "data", "usmap.json");
	const map = JSON.parse(readFileSync(MAP_PATH, "utf8"));
	const { junctions, lint } = bakeJunctions(map);
	console.log(`BAKE: ${junctions.length} junctions — tees ${lint.tees} · crosses ${lint.crosses} ` +
		`(${lint.blind_crossings.length} separated_pending) · ramp mouths ${lint.ramp_mouths} · ` +
		`rejoins ${lint.ramp_rejoins} · end caps ${lint.end_caps} · exits with ramp_ids ${lint.exits_ramp_ids}`);
	console.log(`BAKE: towns ${lint.town_stats.towns} stamped (${lint.town_stats.city} city / ` +
		`${lint.town_stats.holdout} holdout) · ${lint.town_stats.streets} street rows · ${lint.town_stats.slots} slots · MERIDIAN=${lint.addr_stats.meridian}`);
	console.log(`BAKE: network fill — ${lint.fill_stats.reclassed} reclassed · ${lint.fill_stats.county_links} county links · ` +
		`${lint.fill_stats.spurs} dirt spurs (every one with a payload: ${lint.fill_stats.payloads})`);
	console.log(`BAKE: interchanges — ${lint.geo_stats.rebuilt} exits rebuilt (${lint.geo_stats.authored} authored primary kept) · ` +
		`${lint.geo_stats.off} town off/${lint.geo_stats.on} on · ${lint.geo_stats.far_off} far off/${lint.geo_stats.far_on} on · ` +
		`${lint.geo_stats.crossroads} cross-streets into town`);
	console.log(`BAKE: healed dead-ends — ${lint.heal_stats.healed} (${lint.heal_stats.to_road} to a road · ` +
		`${lint.heal_stats.to_town} to a town · ${lint.heal_stats.to_edge} off the map edge)`);
	for (const bc of lint.blind_crossings) console.log(`  BLIND (walled, pending deck): ${bc.roads.join(" x ")} at ${bc.pos}`);
	if (!process.argv.includes("--dry")) {
		writeFileSync(MAP_PATH, JSON.stringify(map));
		console.log("BAKE: written to " + MAP_PATH);
	} else {
		console.log("BAKE: dry run, nothing written");
	}
}
