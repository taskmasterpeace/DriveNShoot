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
			const dTravel = mul(dAlong, sgn);
			const alongSrc = (source.x - foot.x) * dTravel.x + (source.y - foot.y) * dTravel.y;
			const build = (lead) => {
				const provisional = add(foot, mul(dTravel, lead));
				const { d: dM, foot: footM } = dirAt(hwy, provisional);
				const dS = mul(dM, sgn), rS = right(dS);
				const merge = add(footM, mul(rS, edge));
				const mergeEnd = add(merge, mul(dS, 100));
				return [[source.x, source.y], [merge.x, merge.y], [mergeEnd.x, mergeEnd.y]];
			};
			const crossesHwy = (pp) => {
				for (let i = 0; i < pp.length - 1; i++) {
					const s1 = { a: { x: pp[i][0], y: pp[i][1] }, b: { x: pp[i + 1][0], y: pp[i + 1][1] } };
					for (let k = 0; k < hwy.pts.length - 1; k++) {
						if (segIntersect(s1, { a: v(hwy.pts[k]), b: v(hwy.pts[k + 1]) })) return true;
					}
				}
				return false;
			};
			// THE MERGE SHOULD LIE DOWNSTREAM OF THE SOURCE. A fixed 180 m from the exit's
			// foot puts it BEHIND the town whenever the town sits further downstream: the
			// car leaves town driving one way, meets the highway, and the 100 m taper runs
			// back the other — a wrong-way merge on a polyline that doubles back (3 of 88
			// on-ramps). Reaching past the town fixes those, but on a CURVING highway the
			// longer chord can cut clean across the carriageways, and a ramp crossing its
			// own highway is far worse than a backward taper. So: prefer the corrected
			// merge, and fall back to the standard one when it would cross.
			let pts = build(Math.max(180, alongSrc + 180));
			if (crossesHwy(pts)) pts = build(180);
			R.push({ id, kind: "exit", pts,
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
			// BRIDGE WHERE THE TOWN IS, not at the exit anchor. Crossing at `foot` makes a V
			// whenever the town sits far ALONG the highway from the anchor: I-90_X11-xr ran
			// 531 m out to the anchor and 531 m back to a point 147 m from where it started
			// — 1,062 m of street to go nowhere. The town's own projection gives a real
			// perpendicular crossing, and the far ramps still land on its far end.
			const xrFoot = dirAt(hwy, dest).foot;
			R.push({ id: `${ex.id}-xr`, kind: "street", surface: "asphalt",
				pts: [[farLand.x, farLand.y], [xrFoot.x, xrFoot.y], [dest.x, dest.y]],
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

// THE TWO-TIER TOWN GENERATOR (0.19, M3): every non-authored town's husk ring
// becomes STREETS + Building-Book placement slots — as ROWS, so the road pass
// drives them, the junction pass bakes them, and MapForge can edit them.
// Tier by the town's exit archetype (metro/county_seat → downtown grid;
// everything else → the main-street kit). Idempotent via the ST- id prefix.
// TOWN LAYOUT v2 (2026-07-14, "improve the cities layout — do not cut corners"):
// real BLOCK EDGES — buildings walk both sides of every street at footprint-aware
// pitch, every building FACES its street (rot from the street's own direction —
// the v1 rot:0 downtowns faced world-north), building types ZONE by distance
// rings from the town center (civic/commercial core → mixed mid → residential
// edge with industry on one flank), residential CLUSTERS stamp trailer parks and
// farmhouses at the outskirts, and every town seeds its own deterministic PRNG
// (same map in → same town out). One-time REGEN: map.town_layout_version < 2
// strips v1 ST-/slot- rows and restamps; after that the ST- prefix keeps it
// idempotent (MapForge edits survive later bakes).
function mulberry32(seed) {
	return function () {
		seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
function hashStr(s) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
	return h >>> 0;
}
let _profileCache = null;
function structureProfiles() {
	if (_profileCache) return _profileCache;
	const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
	try {
		const doc = JSON.parse(readFileSync(join(root, "game", "data", "world", "structure_profiles.json"), "utf8"));
		_profileCache = {};
		for (const s of doc.structures || []) _profileCache[s.id] = s;
	} catch { _profileCache = {}; }
	return _profileCache;
}

// ---------------------------------------------------------------------------
// CITY EXITS (POC 2026-07-16): 33 of 59 towns had NO exit — the interstate ran
// straight PAST Seattle, San Francisco, Atlanta and 26 more with no off-ramp,
// so those cities were unreachable from the highway. Mint one to the PROVEN
// denver/losangeles pattern (measured off the live rows, not invented):
//   pos  = the town projected onto its nearest carriageway
//   dest = ~520 m perpendicular off it — long enough to be a real ramp, and
//          INSIDE renumberExits' 600 m town_id stamp radius so the link sticks
//   ramp = a bare 2-point off-ramp; rewriteExitGeometry peels it into real
//          geometry and auto-mints the divided-highway mirror (-off-r)
// renumberExits then assigns the milepost number and stamps town_id for free.
// `only` gates the POC subset; pass null to serve EVERY exit-less town.
const MINT_EXITS_ONLY = ["seattle", "sanfrancisco", "atlanta"]; // POC — set to null for the full sweep

export function mintTownExits(map, only = null) {
	const stats = { minted: 0, skipped_served: 0, skipped_nohwy: 0, ids: [] };
	const roads = map.roads || [];
	if (!map.exits) map.exits = [];
	const exits = map.exits;
	const HWY = new Set(["interstate", "us_route", "state_road"]);
	const hwys = roads.filter((r) => HWY.has(r.kind || ""));
	const STAMP_R = 600; // MUST mirror renumberExits' town_id radius
	const RUN = 450;     // how far up the highway the ramp starts (a real approach)
	const FALLBACK_OFF = 520; // denver/losangeles offset when a town has no streets
	const r2 = (n) => Math.round(n * 100) / 100;
	const totalLen = (road) => segs(road).reduce((s, g) => s + g.len, 0);
	const pointAtArc = (road, target) => {
		let acc = 0;
		const ss = segs(road);
		for (const g of ss) {
			if (acc + g.len >= target) {
				const t = (target - acc) / Math.max(g.len, 1e-6);
				return { x: g.a.x + (g.b.x - g.a.x) * t, y: g.a.y + (g.b.y - g.a.y) * t };
			}
			acc += g.len;
		}
		return ss.length ? ss[ss.length - 1].b : null;
	};

	// biome probe so a ramp never dead-ends in the sea (Seattle hugs the west edge)
	const cell = map.cell_m || 500;
	const [ox, oy] = map.world_offset || [0, 0];
	const grid = map.grid || [], legend = map.legend || {};
	const wet = (x, y) => {
		const cx = Math.floor((x - ox) / cell), cy = Math.floor((y - oy) / cell);
		if (cy < 0 || cy >= grid.length) return true;
		const row = grid[cy];
		if (cx < 0 || cx >= row.length) return true;
		const b = legend[row[cx]] || "ocean";
		return b === "ocean" || b === "water";
	};

	const served = new Set();
	for (const e of exits) {
		if (e.town_id) served.add(e.town_id);
		const d0 = v(e.dest || e.pos);
		for (const t of map.towns || []) if (dist({ x: t.pos[0], y: t.pos[1] }, d0) < STAMP_R) served.add(t.id);
	}
	const nextIdx = (hid) => {
		let n = 0;
		for (const e of exits) if (e.highway_id === hid) {
			const mm = /_X(\d+)$/.exec(String(e.id));
			if (mm) n = Math.max(n, parseInt(mm[1], 10));
		}
		return n + 1;
	};

	for (const t of map.towns || []) {
		if (only && !only.includes(t.id)) continue;
		if (served.has(t.id)) { stats.skipped_served++; continue; }
		const tp = { x: t.pos[0], y: t.pos[1] };
		let best = { d: 1e18, r: null, s: null, q: null };
		for (const r of hwys) for (const g of segs(r)) {
			const pr = projectOnSeg(tp, g);
			if (pr.d < best.d) best = { d: pr.d, r, s: g, q: pr.q || g.a };
		}
		if (!best.r) { stats.skipped_nohwy++; continue; }
		const foot = best.q;
		const dv = sub(best.s.b, best.s.a), L = Math.hypot(dv.x, dv.y) || 1;
		const dir = { x: dv.x / L, y: dv.y / L };
		const perp = { x: -dv.y / L, y: dv.x / L };
		const sgn = (wet(foot.x + perp.x * FALLBACK_OFF, foot.y + perp.y * FALLBACK_OFF)
			&& !wet(foot.x - perp.x * FALLBACK_OFF, foot.y - perp.y * FALLBACK_OFF)) ? -1 : 1;

		// THE APPROACH LAW: prefer running in from BEHIND the town (dest ends up
		// ahead of the peel = a shallow corner). If the city IS the highway's origin
		// (Seattle on I-90, SF on I-80) there is no road behind — approach from ahead
		// instead and let the SIDE rule below aim the peel backwards.
		const footArc = arcAt(best.r, tp);
		const total = totalLen(best.r);
		const behindArc = footArc - RUN;
		const canBehind = behindArc >= 30 && behindArc <= total - 30;
		const pArc = canBehind ? behindArc : Math.min(Math.max(footArc + RUN, 30), Math.max(30, total - 30));
		const pos = pointAtArc(best.r, pArc) || foot;

		// THE SIDE LAW (the one that actually makes the geometry work):
		// rewriteExitGeometry picks its peel direction as "the travel direction with
		// dest on its RIGHT". So dest MUST sit right-of-approach, or the peel aims
		// the wrong way and the ramp doubles back on itself (measured 132-167 deg).
		// Put dest right-of-approach and the peel always points AT the city.
		const adv = { x: foot.x - pos.x, y: foot.y - pos.y };
		const adL = Math.hypot(adv.x, adv.y) || 1;
		const ad = { x: adv.x / adL, y: adv.y / adL };          // travel dir: pos -> town
		const rightOf = { x: -ad.y, y: ad.x };                   // right of that travel

		// THE DEST LAW: land the ramp ON THE TOWN'S OWN STREET GRID, not in a field.
		// (v1 threw dest 520 m perpendicular and sailed past the city, stranding the
		// player 362-420 m from the nearest street — the whole point of an exit.)
		let dest = null, destOnStreet = false;
		let bestEp = { d: 1e18, p: null };
		for (const r of roads) {
			if (!String(r.id).startsWith(`ST-${t.id}-`)) continue;
			for (const ep of [r.pts[0], r.pts[r.pts.length - 1]]) {
				const e2 = { x: ep[0], y: ep[1] };
				const off = (e2.x - foot.x) * rightOf.x + (e2.y - foot.y) * rightOf.y;
				if (off < 20) continue;               // must be right-of-approach
				const d2 = dist(e2, foot);
				if (d2 < bestEp.d && d2 < STAMP_R) bestEp = { d: d2, p: e2 };
			}
		}
		if (bestEp.p) { dest = bestEp.p; destOnStreet = true; }
		else {
			// no street on that side — fall back to the shipped perpendicular offset,
			// flipping away from the sea if need be (Seattle hugs the west edge).
			const fb = { x: foot.x + rightOf.x * FALLBACK_OFF, y: foot.y + rightOf.y * FALLBACK_OFF };
			dest = wet(fb.x, fb.y)
				? { x: foot.x - rightOf.x * FALLBACK_OFF, y: foot.y - rightOf.y * FALLBACK_OFF } : fb;
		}
		let onArc = Math.min(Math.max(footArc + RUN, 30), Math.max(30, total - 30));
		const onEnd = pointAtArc(best.r, onArc) || foot;

		const id = `${best.r.id}_X${nextIdx(best.r.id)}`;
		const offId = `${id}-off`, onId = `${id}-on`;
		roads.push({ id: offId, kind: "exit", surface: "asphalt",
			pts: [[r2(pos.x), r2(pos.y)], [r2(dest.x), r2(dest.y)]],
			danger: 2, family: "", nickname: "", lanes: 2, divided: false });
		// THE RETURN LAW: 75% of shipped exits are one-way trips — you can drive into
		// the city and never rejoin the highway. Every minted exit gets its on-ramp.
		roads.push({ id: onId, kind: "exit", surface: "asphalt",
			pts: [[r2(dest.x), r2(dest.y)], [r2(onEnd.x), r2(onEnd.y)]],
			danger: 2, family: "", nickname: "", lanes: 2, divided: false });
		exits.push({ id, highway_id: best.r.id, exit_number: 0,
			name: String(t.name || t.id).toUpperCase(),
			archetype: t.kind === "city" ? "industrial" : "county_seat",
			community_tier: "T1",
			service_tags: ["parts", "repair", "scrap"],
			risk_rating: 3, has_return_ramp: true, known_to_player: false,
			pos: [r2(pos.x), r2(pos.y)], dest: [r2(dest.x), r2(dest.y)],
			ramp_ids: [offId, onId], town_id: t.id });
		stats.minted++;
		stats.ids.push(`${id}->${t.id}${destOnStreet ? "" : "(field!)"}`);
	}
	return stats;
}

// ---------------------------------------------------------------------------
// ARC 3 — GHOST SITES (THE_COUNTRY_PLAN): decayed Americana off the dirt
// spurs. A third of county roads grow ONE ghost spur (GR-<rid>) whose payload
// is a placement CLUSTER — ruined shells arranged in the spur's own frame —
// under the SAME payload law as every dirt spur (a dead dirt road is a lie).
// The engine buries a themed cache at the anchor (-p0). Idempotent by prefix.
export function mintGhostSites(map) {
	const stats = { ghosts: 0, placements: 0 };
	const roads = map.roads || [];
	const placements = map.placements || [];
	// cluster rows: [building, along_m, side_m, rot_off] in the spur frame
	const GHOSTS = [
		{ kind: "dead_motel", rows: [["motel_strip", 0, 0, 0], ["ruined_house", 30, 12, 0.6], ["trailer_single", -24, 14, 2.4]] },
		{ kind: "dead_gas", rows: [["gas_station_small", 0, 0, 0], ["junkyard", 34, 16, 1.2], ["ruined_house", -26, 14, 4.0]] },
		{ kind: "drive_in_ruin", rows: [["drive_in_theater", 0, 0, 0], ["market_stall", 30, 20, 2.0], ["ruined_house", -34, 18, 5.2]] },
		{ kind: "roadside_attraction", rows: [["diner_roadside", 0, 0, 0], ["market_stall", 22, 12, 1.5], ["market_stall", -18, 14, 4.4], ["water_tower", 38, -10, 0]] },
	];
	const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
	for (const r of roads.filter((x) => x.kind === "county")) {
		const h = hash("ghost:" + r.id);
		if (h % 3 !== 0) continue; // a third of the county net decays
		const sid = `GR-${r.id}`;
		if (roads.some((x) => x.id === sid)) continue; // idempotent
		const a = r.pts[0], b = r.pts[r.pts.length - 1];
		const t = 0.5;
		const p = { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
		const d = { x: b[0] - a[0], y: b[1] - a[1] };
		const l = Math.hypot(d.x, d.y) || 1;
		const sgn = (h >>> 3) & 1 ? 1 : -1;
		const dir = { x: (-d.y / l) * sgn, y: (d.x / l) * sgn }; // the spur's own axis
		const perp = { x: d.x / l, y: d.y / l };
		const len = 300 + ((h >>> 4) % 250);
		const end = { x: p.x + dir.x * len, y: p.y + dir.y * len };
		const ghost = GHOSTS[(h >>> 2) % GHOSTS.length];
		roads.push({ id: sid, kind: "dirt", surface: "dirt", pts: [[p.x, p.y], [end.x, end.y]],
			danger: 1, family: "", nickname: "", lanes: 1, divided: false,
			leads_to: { kind: ghost.kind, placement: `${sid}-p0` } });
		ghost.rows.forEach(([bid, along, side, rotOff], i) => {
			const px = end.x + dir.x * (14 + along) + perp.x * side;
			const py = end.y + dir.y * (14 + along) + perp.y * side;
			placements.push({ id: `${sid}-p${i}`, building: bid, pos: [px, py],
				rot: Math.atan2(-dir.x, -dir.y) + rotOff });
			stats.placements++;
		});
		stats.ghosts++;
	}
	return stats;
}

// ARC 3 — DISTRICT SLOTS (the Meridian unification seam): when an AUTHORED
// town carries painted districts, the generator may fill their EMPTY ground
// from the district's own building pool — additively, never moving or
// touching a hand placement (meridian_town_sim is the guard). Rows only.
export function bakeDistrictSlots(map) {
	const stats = { districts: 0, slots: 0 };
	const districts = map.districts || [];
	const placements = map.placements || [];
	const roads = map.roads || [];
	const profiles = structureProfiles();
	const POOLS = {
		downtown: ["market_general", "bar_roadhouse", "pawn_gun_shop", "diner_roadside", "library_small"],
		industrial: ["warehouse", "factory_shell", "junkyard", "auto_shop", "substation_power"],
		commercial: ["market_stall", "market_stall", "diner_roadside", "bar_roadhouse"],
	};
	const inPoly = (px, py, poly) => {
		let inside = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const [xi, yi] = poly[i], [xj, yj] = poly[j];
			if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
		}
		return inside;
	};
	const fp = (bid) => (profiles[bid] && profiles[bid].footprint_m) || [10, 10];
	for (const dst of districts) {
		const pool = POOLS[dst.kind];
		if (!pool) continue;
		if (placements.some((pl) => String(pl.id).startsWith(`${dst.id}-dslot-`))) { stats.districts++; continue; }
		const rng = mulberry32(hashStr("dslot:" + dst.id));
		const xs = dst.poly.map((p) => p[0]), ys = dst.poly.map((p) => p[1]);
		const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
		const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
		let placed = 0;
		for (let gy = y0 + 8; gy <= y1 - 8 && placed < 8; gy += 16) {
			for (let gx = x0 + 8; gx <= x1 - 8 && placed < 8; gx += 16) {
				if (!inPoly(gx, gy, dst.poly)) continue;
				if (rng() < 0.3) continue; // breathe — a district is not a parking lot
				const bid = pool[Math.floor(rng() * pool.length) % pool.length];
				const [fw, fh] = fp(bid);
				const myR = Math.max(fw, fh) * 0.5;
				// never crowd a hand placement (or an earlier slot): footprints + 6 m air
				let clear = true;
				for (const pl of placements) {
					const [ow, oh] = fp(pl.building);
					const need = myR + Math.max(ow, oh) * 0.5 + 3;
					if (Math.hypot(pl.pos[0] - gx, pl.pos[1] - gy) < need) { clear = false; break; }
				}
				if (!clear) continue;
				// keep off every road polyline (12 m + half footprint)
				for (const r of roads) {
					if (!clear) break;
					for (let i = 0; i + 1 < r.pts.length && clear; i++) {
						const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1];
						const dx = bx - ax, dy = by - ay;
						const tt = Math.max(0, Math.min(1, ((gx - ax) * dx + (gy - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-6)));
						if (Math.hypot(ax + dx * tt - gx, ay + dy * tt - gy) < myR + 8) clear = false;
					}
				}
				if (!clear) continue;
				placements.push({ id: `${dst.id}-dslot-${placed}`, building: bid, pos: [gx, gy],
					rot: Math.atan2(-(cx - gx), -(cy - gy)) });
				placed++;
				stats.slots++;
			}
		}
		if (placed) stats.districts++;
	}
	return stats;
}

// ---------------------------------------------------------------------------
// ARC 2 — TOWN IDENTITY (THE_COUNTRY_PLAN): every generated town gets ONE
// seeded landmark (the silhouette you navigate by) written as ROWS — the
// engine's _stamp_town materializes it, the welcome sign names it, the atlas
// labels it. The 3 bespoke landmark towns (vegas/stlouis/washington) keep
// their hand-built rows: any town already carrying `landmark` is skipped.
export function bakeTownLandmarks(map) {
	const stats = { named: 0, kept: 0 };
	const KINDS = [
		// [kind, weight, name builder]
		["water_tower", 0.34, (r) => `THE ${pickOne(r, ["RUSTED", "GRAY", "GREEN", "FADED"])} WATER TOWER`],
		["grain_elevator", 0.24, () => "THE GRAIN ELEVATOR"],
		["church_steeple", 0.22, (r) => `THE ${pickOne(r, ["WHITE", "BURNED", "LEANING"])} STEEPLE`],
		["radio_mast", 0.20, () => "THE RADIO MAST"],
	];
	const total = KINDS.reduce((s, k) => s + k[1], 0);
	for (const t of map.towns || []) {
		if (t.landmark) { stats.kept++; continue; }
		const rng = mulberry32(hashStr("landmark:" + t.id));
		let roll = rng() * total;
		let kind = KINDS[KINDS.length - 1];
		for (const k of KINDS) {
			roll -= k[1];
			if (roll <= 0) { kind = k; break; }
		}
		t.landmark_kind = kind[0];
		t.landmark = kind[2](rng);
		stats.named++;
	}
	return stats;
}

function pickOne(rng, arr) {
	return arr[Math.floor(rng() * arr.length) % arr.length];
}

// ARC 2 — THE FARM BELT: towns fade in through worked land. A one-cell ring
// (500m cells ≈ the 300-500m approach) around every town converts plains,
// scrub and forest grid cells to farmland (settlers clear the treeline), so
// the vegetation rows grow crops/windbreaks before the welcome sign. Water,
// urban, desert, mountain and swamp cells are respected — a wheat field in
// the Mojave would be a lie. Idempotent by construction.
export function bakeFarmBelts(map) {
	const stats = { towns: 0, cells: 0 };
	const grid = map.grid || [];
	if (!grid.length) return stats;
	const [ox, oy] = map.world_offset || [0, 0];
	const cell = map.cell_m || 500;
	for (const t of map.towns || []) {
		const cx = Math.floor((t.pos[0] - ox) / cell);
		const cy = Math.floor((t.pos[1] - oy) / cell);
		let touched = 0;
		for (let dy = -1; dy <= 1; dy++) {
			const y = cy + dy;
			if (y < 0 || y >= grid.length) continue;
			let row = grid[y];
			for (let dx = -1; dx <= 1; dx++) {
				const x = cx + dx;
				if (x < 0 || x >= row.length) continue;
				const ch = row[x];
				if (ch === "p" || ch === "f" || ch === "F") {
					row = row.slice(0, x) + "a" + row.slice(x + 1);
					touched++;
				}
			}
			grid[y] = row;
		}
		if (touched) { stats.towns++; stats.cells += touched; }
	}
	return stats;
}

export function stampTownStreets(map) {
	const stats = { towns: 0, downtown: 0, mainstreet: 0, streets: 0, slots: 0 };
	const roads = map.roads || [];
	const placements = map.placements || [];
	const exitFor = (t) => (map.exits || []).find((e) => e.town_id === t.id);
	const hasStreet = (t) => roads.some((r) => String(r.id).startsWith(`ST-${t.id}-`));
	const profiles = structureProfiles();
	const fp = (sid) => (profiles[sid] && profiles[sid].footprint_m) || [10, 10];

	// ---- the v2 REGEN sweep (one-time): strip v1 town fabric, restamp fresh ----
	const TOWN_LAYOUT_VERSION = 4;
	if ((map.town_layout_version || 1) < TOWN_LAYOUT_VERSION) {
		for (const t of map.towns || []) {
			if (t.authored) continue;
			for (let i = roads.length - 1; i >= 0; i--)
				if (String(roads[i].id).startsWith(`ST-${t.id}-`)) roads.splice(i, 1);
			for (let i = placements.length - 1; i >= 0; i--)
				if (String(placements[i].id).startsWith(`${t.id}-slot-`)) placements.splice(i, 1);
		}
		map.town_layout_version = TOWN_LAYOUT_VERSION;
	}

	// ZONING POOLS by catalog category (the one-of-a-kind Meridian rows and the
	// hand-place-only categories stay OUT of the generator's hands).
	const EXCLUDE = new Set(["city_hall", "monument_plaza", "clone_wing", "blackmarket_vat",
		"drone_ring", "fight_pit", "derby_bowl", "race_track_grandstand", "military_base_shell"]);
	const byCat = {};
	for (const sid of Object.keys(profiles)) {
		if (EXCLUDE.has(sid)) continue;
		const cat = profiles[sid].category || "misc";
		(byCat[cat] = byCat[cat] || []).push(sid);
	}
	for (const cat of Object.keys(byCat)) byCat[cat].sort();
	const pool = (cats) => cats.flatMap((c) => byCat[c] || []);
	const CORE_POOL = pool(["civic_law", "civic", "commercial", "media"]);
	const MID_POOL = pool(["commercial", "service", "venue", "medical"]);
	const EDGE_RES = pool(["residential"]);
	const EDGE_IND = pool(["industrial", "industrial_service", "agriculture"]);
	// anchors every town deserves, placed first at the best frontage
	const DOWNTOWN_ANCHORS = ["courthouse", "police_station", "market_general", "clinic_small"];
	const MAIN_ANCHORS = ["diner_roadside", "market_general", "gas_station_small", "church_small"];

	for (const t of map.towns || []) {
		if (t.authored || hasStreet(t)) continue;
		const rng = mulberry32(hashStr("town:" + t.id));
		let slotSeq = 0;
		const townStreets = [];
		const townSlots = []; // {x, y, half} for footprint-aware self-collision
		const addStreet = (tag, a, b) => {
			roads.push({ id: `ST-${t.id}-${tag}`, kind: "street", pts: [[a.x, a.y], [b.x, b.y]],
				danger: 0, family: "", nickname: "", lanes: 2, divided: false });
			townStreets.push({ a, b });
			stats.streets++;
		};
		const nearOtherStreet = (p, ownA, ownB, r) => townStreets.some((s) => {
			if (s.a === ownA && s.b === ownB) return false;
			const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
			const L2 = dx * dx + dy * dy || 1;
			const u = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2));
			return Math.hypot(p.x - (s.a.x + u * dx), p.y - (s.a.y + u * dy)) < r;
		});
		const addSlot = (sid, p, rot) => {
			const half = Math.max(fp(sid)[0], fp(sid)[1]) * 0.5;
			// respect hand placements (the old 16m law) AND our own footprints
			if (placements.some((q) => !String(q.id).startsWith(`${t.id}-slot-`) &&
				Math.hypot(q.pos[0] - p.x, q.pos[1] - p.y) < 16)) return false;
			if (townSlots.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < q.half + half + 2.5)) return false;
			placements.push({ id: `${t.id}-slot-${++slotSeq}`, building: sid, pos: [Math.round(p.x), Math.round(p.y)], rot: Math.round(rot * 1000) / 1000 });
			townSlots.push({ x: p.x, y: p.y, half });
			stats.slots++;
			return true;
		};
		const c = { x: t.pos[0], y: t.pos[1] };
		// FRONTAGE WALK: place buildings along both sides of a street segment,
		// footprint-aware pitch, setback from the centerline, FACING the street.
		const frontage = (a, b, pick, cap) => {
			const dx = b.x - a.x, dy = b.y - a.y;
			const len = Math.hypot(dx, dy) || 1;
			const d = { x: dx / len, y: dy / len };
			const perp = { x: -d.y, y: d.x };
			let placed = 0;
			for (const side of [1, -1]) {
				let u = 14 + rng() * 8;
				while (u < len - 14 && placed < cap) {
					// probe the slot POSITION first (the ring is the building's, not the
					// street's — a corner lot on a core street can still be edge ring)
					const probe = { x: a.x + d.x * u + perp.x * side * 12, y: a.y + d.y * u + perp.y * side * 12 };
					const sid = pick(side, probe);
					if (!sid) break;
					const f = fp(sid);
					const setback = 6.0 + f[1] * 0.5 + 2.5;
					const p = { x: a.x + d.x * u + perp.x * side * setback, y: a.y + d.y * u + perp.y * side * setback };
					const px = perp.x * side, py = perp.y * side;
					u += f[0] + 6 + rng() * 5;
					if (nearOtherStreet(p, a, b, 13)) continue;
					// FACE THE STREET: front is +Z at rot 0 (the main-street kit law) —
					// rot = atan2(-outward.x, -outward.y) points the door at the curb.
					if (addSlot(sid, p, Math.atan2(-px, -py))) placed++;
				}
			}
			return placed;
		};
		// ZONING RINGS sized to the real grid (~±150m): core keeps the law and the
		// ledger, the middle trades, the edge SLEEPS (and works, one flank).
		const RING_CORE = 80, RING_MID = 150;
		const ringPick = (p) => {
			const dist = Math.hypot(p.x - c.x, p.y - c.y);
			if (dist < RING_CORE) return CORE_POOL;
			if (dist < RING_MID) return MID_POOL;
			return null; // edge handled by the caller's residential/industrial pick
		};
		const ex = exitFor(t);
		const tier = ex && ["metro", "county_seat"].includes(ex.archetype) ? "downtown" : "mainstreet";
		let dir = { x: 1, y: 0 };
		if (ex) {
			const dd = { x: c.x - ex.pos[0], y: c.y - ex.pos[1] };
			const l = Math.hypot(dd.x, dd.y) || 1;
			dir = { x: -dd.y / l, y: dd.x / l };
		}
		const perp = { x: -dir.y, y: dir.x };
		const at = (u, w) => ({ x: c.x + dir.x * u + perp.x * w, y: c.y + dir.y * u + perp.y * w });
		stats.towns++;
		let anchors;
		let anchorIdx = 0;
		if (tier === "downtown") {
			stats.downtown++;
			for (let i = 0; i < 3; i++) addStreet(`ew${i}`, at(-140, -70 + i * 70), at(140, -70 + i * 70));
			// RESIDENTIAL OUTSKIRTS (layout v3): the grid no longer dead-ends at a
			// hard empty boundary — two outer streets carry the town's edge ring.
			addStreet(`ew_n`, at(-100, -145), at(100, -145));
			addStreet(`ew_s`, at(-100, 145), at(100, 145));
			for (let j = 0; j < 4; j++) addStreet(`ns${j}`, at(-120 + j * 80, -155), at(-120 + j * 80, 155));
			anchors = DOWNTOWN_ANCHORS.slice();
			// industry claims ONE flank (the yards side), seeded per town
			const indSide = rng() < 0.5 ? 1 : -1;
			const pick = (side) => {
				if (anchorIdx < anchors.length) return anchors[anchorIdx++];
				return null;
			};
			// anchors first along the central drag
			frontage(at(-140, 0), at(140, 0), pick, anchors.length);
			for (const s of townStreets) {
				frontage(s.a, s.b, (side, probe) => {
					const rp = ringPick(probe);
					if (rp) return rp[Math.floor(rng() * rp.length)];
					if (side === indSide && rng() < 0.45 && EDGE_IND.length) return EDGE_IND[Math.floor(rng() * EDGE_IND.length)];
					return EDGE_RES.length ? EDGE_RES[Math.floor(rng() * EDGE_RES.length)] : null;
				}, 12);
			}
		} else {
			stats.mainstreet++;
			addStreet("main", at(-160, 0), at(160, 0));
			addStreet("side0", at(-55, -90), at(-55, 90));
			addStreet("side1", at(65, -90), at(65, 90));
			anchors = MAIN_ANCHORS.slice();
			frontage(at(-160, 0), at(160, 0), (side) => {
				if (anchorIdx < anchors.length) return anchors[anchorIdx++];
				const p2 = rng();
				if (p2 < 0.55) return CORE_POOL[Math.floor(rng() * CORE_POOL.length)];
				if (p2 < 0.8) return MID_POOL[Math.floor(rng() * MID_POOL.length)];
				return EDGE_RES[Math.floor(rng() * EDGE_RES.length)];
			}, 16);
			// residential back streets
			for (const tag of ["side0", "side1"]) {
				const s = townStreets.find((x, i) => i === (tag === "side0" ? 1 : 2));
				frontage(s.a, s.b, () => EDGE_RES[Math.floor(rng() * EDGE_RES.length)], 6);
			}
			// CLUSTER STAMPS at the outskirts: a trailer park (seeded) or a farmhouse
			if (rng() < 0.45 && profiles["trailer_single"]) {
				const base = at(-40 + rng() * 80, (rng() < 0.5 ? 1 : -1) * (105 + rng() * 20));
				for (let r = 0; r < 2; r++)
					for (let k2 = 0; k2 < 3; k2++)
						addSlot("trailer_single", { x: base.x + k2 * 14 - 14, y: base.y + r * 12 }, Math.atan2(-perp.x, -perp.y));
			}
			if (rng() < 0.5 && profiles["farmhouse_field"]) {
				const fu = (rng() < 0.5 ? -1 : 1) * (200 + rng() * 40);
				addSlot("farmhouse_field", at(fu, (rng() - 0.5) * 60), rng() * Math.PI * 2);
			}
		}
	}
	return stats;
}

// THE ROAD RELIEF BAKE (THE_COUNTRY_PLAN 1A): roads CLIMB the painted macro land.
// Mirrors the engine's law exactly — bilinear(relief grid) × MACRO_MAX_M with the
// town-terrace pull — then writes per-point `elev` onto every network road,
// grade-capped at MAX_GRADE with forward/backward slope-limit passes. Ramps blend
// from their highway's height at the peel to the terrain at their tail. Streets
// bench at their town's own height (the terrace the terrain also builds).
// Junction continuity is FREE: every road samples the same field at the same (x,z).
const MACRO_MAX_M = 30.0;
const MAX_GRADE = 0.06;
const TOWN_FLAT_M = 150.0, TOWN_FADE_M = 110.0;
export function bakeRoadRelief(map) {
	const relief = map.relief || [];
	const stats = { roads: 0, points: 0, ramps: 0, streets: 0, capped: 0 };
	if (!relief.length) return stats; // unpainted map: law dormant
	const [ox, oz] = map.world_offset, cm = map.cell_m;
	const cell = (cx, cz) => {
		if (cz < 0 || cz >= relief.length) return 0;
		const row = relief[cz];
		if (cx < 0 || cx >= row.length) return 0;
		return (row.charCodeAt(cx) - 48) / 9.0;
	};
	const relief01 = (x, z) => {
		const fx = (x - ox) / cm - 0.5, fz = (z - oz) / cm - 0.5;
		const x0 = Math.floor(fx), z0 = Math.floor(fz);
		const tx = fx - x0, tz = fz - z0;
		return (cell(x0, z0) * (1 - tx) + cell(x0 + 1, z0) * tx) * (1 - tz)
			+ (cell(x0, z0 + 1) * (1 - tx) + cell(x0 + 1, z0 + 1) * tx) * tz;
	};
	const towns = (map.towns || []).map((t) => ({ x: t.pos[0], y: t.pos[1],
		bench: Math.max(0, Math.min(1, relief01(t.pos[0], t.pos[1]))) * MACRO_MAX_M }));
	const macroY = (x, z) => {
		let h = relief01(x, z) * MACRO_MAX_M;
		let best = null, bd = 1e18;
		for (const t of towns) {
			const d = Math.hypot(x - t.x, z - t.y);
			if (d < bd) { bd = d; best = t; }
		}
		if (best && bd < TOWN_FLAT_M) return best.bench;
		if (best && bd < TOWN_FLAT_M + TOWN_FADE_M)
			return best.bench + (h - best.bench) * ((bd - TOWN_FLAT_M) / TOWN_FADE_M);
		return h;
	};
	const network = new Set(["interstate", "us_route", "state_road", "county", "backroad", "dirt"]);
	const byId = {};
	for (const r of map.roads || []) byId[r.id] = r;
	for (const r of map.roads || []) {
		const kind = r.kind || "interstate";
		if (String(r.id).startsWith("ST-")) {
			// STREETS: the whole town rides one bench — constant elev per row.
			const t0 = towns.reduce((acc, t) => {
				const d = Math.hypot(r.pts[0][0] - t.x, r.pts[0][1] - t.y);
				return d < acc.d ? { d, t } : acc;
			}, { d: 1e18, t: null });
			const bench = t0.t ? Math.round(t0.t.bench * 100) / 100 : 0;
			r.elev = r.pts.map(() => bench);
			r.elev_mode = "ground";
			stats.streets++;
			continue;
		}
		if (!network.has(kind) && kind !== "exit") continue;
		if (kind === "exit") continue; // ramps blended AFTER highways carry heights
		// ADAPTIVE DENSIFY (1A): sparse polylines lerp across kilometres and average
		// the ranges into causeways — insert midpoints wherever the macro deviates
		// from the linear profile by >0.75m (recursive, min span 450m). Colinear
		// insertions preserve the path, so junction arc_m projections stay honest.
		let densified = true;
		let guard = 0;
		while (densified && guard++ < 12) {
			densified = false;
			for (let i = 0; i + 1 < r.pts.length; i++) {
				const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
				const L = Math.hypot(bx - ax, bz - az);
				if (L < 450) continue;
				const mx = (ax + bx) / 2, mz = (az + bz) / 2;
				const linear = (macroY(ax, az) + macroY(bx, bz)) / 2;
				if (Math.abs(macroY(mx, mz) - linear) > 0.75) {
					r.pts.splice(i + 1, 0, [Math.round(mx * 100) / 100, Math.round(mz * 100) / 100]);
					densified = true;
					i++;
				}
			}
		}
		const elev = r.pts.map((p) => macroY(p[0], p[1]));
		// grade cap: forward + backward slope-limiting over segment lengths
		for (let pass = 0; pass < 2; pass++) {
			for (let i = 1; i < elev.length; i++) {
				const L = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]) || 1;
				const dh = elev[i] - elev[i - 1], cap = MAX_GRADE * L;
				if (Math.abs(dh) > cap) { elev[i] = elev[i - 1] + Math.sign(dh) * cap; stats.capped++; }
			}
			for (let i = elev.length - 2; i >= 0; i--) {
				const L = Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]) || 1;
				const dh = elev[i] - elev[i + 1], cap = MAX_GRADE * L;
				if (Math.abs(dh) > cap) { elev[i] = elev[i + 1] + Math.sign(dh) * cap; stats.capped++; }
			}
		}
		r.elev = elev.map((h) => Math.round(Math.max(0, h) * 100) / 100);
		r.elev_mode = "ground"; // terrain BLENDS to ground-mode roads (the road-meets-land law)
		stats.roads++;
		stats.points += elev.length;
	}
	// RAMPS: start at the highway's own height at the peel point, land on terrain.
	const arcH = (road, p) => {
		// height of `road` at the polyline point nearest p (linear within segment)
		let best = { d: 1e18, h: 0 };
		const e = road.elev || [];
		for (let i = 0; i + 1 < road.pts.length; i++) {
			const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
			const dx = bx - ax, dz = bz - az;
			const L2 = dx * dx + dz * dz || 1;
			const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2));
			const d = Math.hypot(p[0] - (ax + t * dx), p[1] - (az + t * dz));
			if (d < best.d) best = { d, h: (e[i] || 0) + ((e[i + 1] || 0) - (e[i] || 0)) * t };
		}
		return best.h;
	};
	for (const ex of map.exits || []) {
		const hwy = byId[ex.highway_id];
		if (!hwy || !hwy.elev) continue;
		for (const rid of ex.ramp_ids || []) {
			const rp = byId[rid];
			if (!rp) continue;
			const startH = arcH(hwy, rp.pts[0]);
			const endH = macroY(rp.pts[rp.pts.length - 1][0], rp.pts[rp.pts.length - 1][1]);
			const n = rp.pts.length - 1 || 1;
			rp.elev = rp.pts.map((_, i) => Math.round(Math.max(0, startH + (endH - startH) * (i / n)) * 100) / 100);
			rp.elev_mode = "structure"; // ramps FLY — the land never warps up to meet them
			stats.ramps++;
		}
	}
	return stats;
}

// THE OVERPASS BAKE (THE_COUNTRY_PLAN 1B): every separated_pending crossing
// becomes a REAL grade separation — the lighter road (fewer lanes; tie → later
// id) climbs a hump over the through road: clearance 6.2m, approach runs 140m
// (≈5.6% grade), junction grade flips to "deck". Point insertion is COLINEAR
// (arc lengths preserved — junction legs' arc_m stay honest) and IDEMPOTENT
// (a nearby existing point is reused instead of duplicated on re-bake). The
// engine side: macro_y skips the road-blend inside deck zones, so the land
// stays at grade while the hump keeps its clearance and the deck law builds
// the physical overpass (deck + rails + pillars) from real clearance.
const OVERPASS_CLEAR_M = 6.2;
const OVERPASS_APPROACH_M = 140.0;
const OVERPASS_TOP_M = 30.0;
export function bakeOverpasses(map, junctions) {
	const stats = { converted: 0, humps: 0, reused_pts: 0, skipped: 0 };
	const byId = {};
	for (const r of map.roads || []) byId[r.id] = r;
	const elevAtArc = (road, arc) => {
		const e = road.elev || [];
		let acc = 0;
		for (let i = 0; i + 1 < road.pts.length; i++) {
			const L = Math.hypot(road.pts[i + 1][0] - road.pts[i][0], road.pts[i + 1][1] - road.pts[i][1]);
			if (arc <= acc + L || i === road.pts.length - 2) {
				const t = Math.max(0, Math.min(1, (arc - acc) / (L || 1)));
				return (e[i] || 0) + ((e[i + 1] || 0) - (e[i] || 0)) * t;
			}
			acc += L;
		}
		return 0;
	};
	// insert (or reuse) a point at arc `A` on `road`, returning its index
	const ensurePointAt = (road, A) => {
		let acc = 0;
		for (let i = 0; i + 1 < road.pts.length; i++) {
			const ax = road.pts[i][0], az = road.pts[i][1];
			const bx = road.pts[i + 1][0], bz = road.pts[i + 1][1];
			const L = Math.hypot(bx - ax, bz - az);
			if (A <= acc + L + 1e-6) {
				// reuse a nearby existing point (idempotent re-bakes)
				if (Math.abs(A - acc) < 8) { stats.reused_pts++; return i; }
				if (Math.abs(A - (acc + L)) < 8) { stats.reused_pts++; return i + 1; }
				const t = (A - acc) / (L || 1);
				const p = [Math.round((ax + (bx - ax) * t) * 100) / 100, Math.round((az + (bz - az) * t) * 100) / 100];
				road.pts.splice(i + 1, 0, p);
				(road.elev = road.elev || road.pts.map(() => 0)).splice(i + 1, 0, elevAtArc(road, A));
				return i + 1;
			}
			acc += L;
		}
		return road.pts.length - 1;
	};
	const roadLen = (road) => {
		let L = 0;
		for (let i = 0; i + 1 < road.pts.length; i++)
			L += Math.hypot(road.pts[i + 1][0] - road.pts[i][0], road.pts[i + 1][1] - road.pts[i][1]);
		return L;
	};
	for (const j of junctions) {
		if (j.grade !== "separated_pending") continue;
		const legs = j.legs || [];
		if (legs.length < 2) { stats.skipped++; continue; }
		const rA = byId[legs[0].road], rB = byId[legs[1].road];
		if (!rA || !rB) { stats.skipped++; continue; }
		const lanesA = rA.lanes || 4, lanesB = rB.lanes || 4;
		let over = rA, overLeg = legs[0], under = rB, underLeg = legs[1];
		if (lanesA > lanesB || (lanesA === lanesB && String(rA.id) < String(rB.id))) {
			over = rB; overLeg = legs[1]; under = rA; underLeg = legs[0];
		}
		const L = roadLen(over);
		const jArc = overLeg.arc_m;
		if (jArc < OVERPASS_TOP_M + 10 || jArc > L - OVERPASS_TOP_M - 10) { stats.skipped++; continue; } // too near an end — leave pending
		const underH = elevAtArc(under, underLeg.arc_m);
		const topH = Math.round((underH + OVERPASS_CLEAR_M) * 100) / 100;
		const marks = [
			[Math.max(2, jArc - OVERPASS_APPROACH_M), null], // approach: keep own elev
			[jArc - OVERPASS_TOP_M, topH],
			[jArc + OVERPASS_TOP_M, topH],
			[Math.min(L - 2, jArc + OVERPASS_APPROACH_M), null],
		];
		// insert outermost-first on each side so arcs stay valid during splices
		const idxs = [];
		for (const [A, hh] of [marks[0], marks[3], marks[1], marks[2]]) {
			const idx = ensurePointAt(over, A);
			if (hh !== null) over.elev[idx] = hh;
			idxs.push(idx);
		}
		j.grade = "deck";
		j.deck_road = over.id;
		stats.converted++;
		stats.humps++;
		// RAISE-ONLY slope limit: hump tops are pinned; approach points LIFT to
		// within the cap so no short reused span exceeds a sane grade. Never
		// lowers anything — climbs stay, the hump stays, the approach lengthens.
		const capm = 0.058;
		for (let pass = 0; pass < 2; pass++) {
			for (let i = 1; i < over.pts.length; i++) {
				const L = Math.hypot(over.pts[i][0] - over.pts[i - 1][0], over.pts[i][1] - over.pts[i - 1][1]) || 1;
				over.elev[i] = Math.max(over.elev[i], Math.round((over.elev[i - 1] - capm * L) * 100) / 100);
			}
			for (let i = over.pts.length - 2; i >= 0; i--) {
				const L = Math.hypot(over.pts[i + 1][0] - over.pts[i][0], over.pts[i + 1][1] - over.pts[i][1]) || 1;
				over.elev[i] = Math.max(over.elev[i], Math.round((over.elev[i + 1] - capm * L) * 100) / 100);
			}
		}
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

// REPAIR: drop any vertex that revisits an earlier point on the SAME road. A road is a
// simple path — a repeat is damage (6 DR- spurs were closed loops, pts[0] == pts[3],
// legacy breakage that predates the heal fix and which fillNetwork's idempotency guard
// preserves rather than rebuilds). Never drops below 2 points.
// --- THE OVERLAP LAW (doubled-back polylines) --------------------------------------
// A road is a simple path. One that REVERSES and drives back along the pavement it just
// laid is DAMAGE: traffic and motorists walk arc-length, so a retrace flips their travel
// direction mid-road, junctions bake at the self-intersection, and the streamer lays
// overlapping slabs on the same tarmac. I-75 carried a 1.9 km return at ZERO separation;
// I-35 an 839 m one.
// But a road that turns back and SEPARATES is a legitimate spur, cross-street or mountain
// switchback and must survive untouched. So the test is NOT the turn angle (a switchback
// reverses through 180 degrees too) — it is whether the two runs SHARE PAVEMENT: mean
// separation below the road's own width, straight off THE ONE GEOMETRY LAW.
function ptSegDist(p, a, b) {
	const dx = b[0] - a[0], dy = b[1] - a[1];
	const L = dx * dx + dy * dy;
	const t = L < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
	return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

// mean distance from samples along segment ia->ia+1 to the run of segments [0, k1)
function meanSepToRun(pts, ia, k1) {
	const a = pts[ia], b = pts[ia + 1];
	let sum = 0, n = 0;
	for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
		const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
		let best = Infinity;
		for (let k = 0; k < k1; k++) best = Math.min(best, ptSegDist(p, pts[k], pts[k + 1]));
		sum += best; n++;
	}
	return n ? sum / n : Infinity;
}

function angDiff(a, b) {
	let d = b - a;
	while (d > Math.PI) d -= 2 * Math.PI;
	while (d < -Math.PI) d += 2 * Math.PI;
	return Math.abs(d);
}

const LOBE_RATIO = 0.15;    // straight-line gap / path travelled — below this the stretch goes nowhere
const LOBE_MIN_PATH = 200;  // metres; shorter than this is a ramp stub, not a lobe

function fixDoubleBacks(r, stats) {
	const divided = r.divided !== undefined ? !!r.divided : (r.lanes || (r.kind === "interstate" ? 4 : 2)) >= 6;
	const width = halfWidth(r, divided) * 2;
	for (let guard = 0; guard < 8; guard++) {
		const pts = r.pts;
		if (!pts || pts.length < 4) return;
		let cut = null;
		for (let i = 1; i < pts.length - 1 && !cut; i++) {
			const h1 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
			const h2 = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
			if (angDiff(h1, h2) <= (150 * Math.PI) / 180) continue;   // not a reversal
			if (meanSepToRun(pts, i, i) >= width) continue;           // separates — a real spur
			// walk the RETURN for as long as it keeps riding the outbound corridor
			let e = i + 1;
			while (e + 1 < pts.length && meanSepToRun(pts, e, i) < width) e++;
			// where on the OUTBOUND run did the retrace get back to?
			let k = 0, best = Infinity;
			for (let m = 0; m <= i; m++) {
				const d = Math.hypot(pts[m][0] - pts[e][0], pts[m][1] - pts[e][1]);
				if (d < best) { best = d; k = m; }
			}
			if (e - k < 2) continue; // nothing enclosed — leave it alone
			cut = { k, e };
		}
		// THE LOBE LAW. "Shares pavement" only catches a retrace laid exactly on top of the
		// outbound run. I-35 returned 10 m to the SIDE — parallel, not overlapping, so one
		// road width could never see it. What actually makes it damage is that the stretch
		// GOES NOWHERE: 3,355 m of interstate to end up 111 m from where it started. That
		// is scale-free and needs no magic distance — measure straight-line gap against
		// path travelled. Real geometry is nowhere near: the lobes score 0.016 / 0.033 /
		// 0.095 and the first legitimate spur scores 0.623, a 4x margin. Short generated
		// ramp stubs never reach LOBE_MIN_PATH, so their generator keeps ownership of them.
		if (!cut) {
			const cum = [0];
			for (let m = 1; m < pts.length; m++) cum.push(cum[m - 1] + Math.hypot(pts[m][0] - pts[m - 1][0], pts[m][1] - pts[m - 1][1]));
			let best = null;
			for (let i = 1; i < pts.length - 1 && !best; i++) {
				const h1 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
				const h2 = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
				if (angDiff(h1, h2) <= (150 * Math.PI) / 180) continue;
				for (let k = 0; k <= i; k++) {
					for (let e = i + 1; e < pts.length; e++) {
						const path = cum[e] - cum[k];
						if (path < LOBE_MIN_PATH) continue;
						const ratio = Math.hypot(pts[k][0] - pts[e][0], pts[k][1] - pts[e][1]) / path;
						if (ratio < LOBE_RATIO && (!best || ratio < best.ratio)) best = { k, e, ratio };
					}
				}
			}
			if (best && best.e - best.k >= 2) cut = best;
		}
		if (!cut) return;
		// splice the excursion out. pts[0] and the tail are NEVER touched: a road's
		// endpoints anchor its junctions, towns and exit addresses.
		stats.points_dropped += cut.e - cut.k - 1;
		stats.doubled_back++;
		if (!stats.roads.includes(r.id)) stats.roads.push(r.id);
		r.pts = pts.slice(0, cut.k + 1).concat(pts.slice(cut.e));
		// CLEAN THE JOIN. Removing an excursion can leave a VESTIGIAL STUB at the splice:
		// I-75's lobe left a 103 m spur pointing SSW before the road reversed NE, and the
		// exit's far ramp then crossed the carriageways right at it. If the join vertex is
		// a short segment that immediately doubles back, it is leftover from the excursion,
		// not road. Scoped to the join alone, so untouched switchbacks can never be hit.
		const j = cut.k + 1;
		if (j > 0 && j < r.pts.length - 1) {
			const A = r.pts[j - 1], B = r.pts[j], C = r.pts[j + 1];
			const hIn = Math.atan2(B[1] - A[1], B[0] - A[0]);
			const hOut = Math.atan2(C[1] - B[1], C[0] - B[0]);
			if (angDiff(hIn, hOut) > (150 * Math.PI) / 180 && Math.hypot(B[0] - A[0], B[1] - A[1]) < 250) {
				r.pts.splice(j, 1);
				stats.points_dropped++;
			}
		}
	}
}

export function repairPolylines(map) {
	const stats = { roads_fixed: 0, points_dropped: 0, doubled_back: 0, roads: [] };
	for (const r of map.roads || []) {
		if (!r.pts || r.pts.length < 3) continue;
		const kept = [];
		for (const p of r.pts) {
			const dupe = kept.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1.0);
			if (dupe && kept.length >= 2) { stats.points_dropped++; continue; }
			if (dupe) continue;
			kept.push(p);
		}
		if (kept.length >= 2 && kept.length !== r.pts.length) {
			r.pts = kept;
			stats.roads_fixed++;
		}
		fixDoubleBacks(r, stats);
	}
	return stats;
}

export function bakeJunctions(map) {
	// towns first (their streets join the junction bake), then exit geometry,
	// then addresses, then the junction rows read the corrected polylines
	const repair = repairPolylines(map);
	const fill = fillNetwork(map);
	const town = stampTownStreets(map);
	const marks = bakeTownLandmarks(map); // ARC 2: town identity rows
	const belts = bakeFarmBelts(map); // ARC 2: the farm-belt approach ring
	const ghosts = mintGhostSites(map); // ARC 3: decayed Americana off the spurs
	const dslots = bakeDistrictSlots(map); // ARC 3: districts fill their own ground
	const cityx = mintTownExits(map, MINT_EXITS_ONLY); // CITY EXITS: give exit-less towns an off-ramp
	const geo = rewriteExitGeometry(map);
	const addr = renumberExits(map);
	const heal = healDeadEnds(map);
	const rel = bakeRoadRelief(map); // 1A: roads climb the painted macro (after ramps exist)
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
	// THE MERGE LAW (v4 connectivity fix): "one node per meeting" used to DROP a
	// meeting's legs when another junction sat within SNAP_M — which silently
	// disconnected every town grid from its feeder road (the road_graph orphans).
	// A nearby node now ABSORBS the meeting instead: missing roads join its legs.
	lint.merged_legs = 0;
	const mergeLegs = (jn, roadsIn) => {
		for (const rd of roadsIn) {
			if (jn.legs.some((l) => l.road === rd.id)) continue;
			jn.legs.push({ road: rd.id, arc_m: Math.round(arcAt(rd, v(jn.pos))) });
			lint.merged_legs++;
		}
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
				const eaten = near(best.q ?? p, SNAP_M);
				if (eaten) { mergeLegs(eaten, [A, B]); continue; } // one node per meeting — legs SURVIVE
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
					if (dupe) { mergeLegs(dupe, [A, B]); continue; }
					const bothDivided = isDivided(A) && isDivided(B);
					// LIMITED ACCESS: a minor road (county/dirt/street) NEVER gaps
					// a divided highway's median at grade — it passes UNDER, walled
					// until a deck makes it real (the crossing-only-via-exits law).
					const minorCross = (isDivided(A) && MINOR.has(B.kind)) || (isDivided(B) && MINOR.has(A.kind));
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
				else mergeLegs(dupe, [hwy, rp]); // a shared mouth still lists every ramp
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
		// attach to its exit: id prefix first ("I-95_X2-on" -> "I-95_X2"), else nearest.
		// THE ID BOUNDARY LAW: match on `id + "-"`, never a bare startsWith —
		// "I-40_X10-on".startsWith("I-40_X1") is TRUE, so X1 silently SWALLOWED
		// X10's on-ramp (a live bug in the shipped map, found 2026-07-16). Without
		// the boundary, every two-digit exit donates its ramps to its X1 neighbour.
		let ex = (map.exits || []).find((e) => rp.id.startsWith(e.id + "-"));
		if (!ex) {
			let bd = 1e18;
			for (const e of map.exits || []) {
				const d = dist(v(e.pos), pN);
				if (d < bd) { bd = d; ex = e; }
			}
		}
		if (ex) claim(ex, rp.id);
		const node = best.q;
		const nearRejoin = near(node, 10);
		if (!nearRejoin)
			push("ramp_rejoin", "flat", "riro", node, [
				{ road: best.R.id, arc_m: Math.round(arcAt(best.R, node)) },
				{ road: rp.id, arc_m: Math.round(arcAt(rp, node)) },
			]);
		else mergeLegs(nearRejoin, [best.R, rp]); // rejoining ONTO a node keeps the ramp leg
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
			const nearCap = near(p, SNAP_M);
			if (nearCap) { mergeLegs(nearCap, [A]); continue; } // the endpoint's road must be a leg SOMEWHERE
			push("end_cap", "flat", "none", p, [{ road: A.id, arc_m: Math.round(arcAt(A, p)) }]);
			lint.end_caps++;
		}
	}

	// 1B: raise the overpasses — pending crossings become real decks (idempotent)
	const op = bakeOverpasses(map, junctions);
	map.junctions = junctions;
	lint.overpass_stats = op;
	lint.town_stats = town;
	lint.landmark_stats = marks;
	lint.farmbelt_stats = belts;
	lint.ghost_stats = ghosts;
	lint.cityexit_stats = cityx;
	lint.dslot_stats = dslots;
	lint.addr_stats = addr;
	lint.geo_stats = geo;
	lint.fill_stats = fill;
	lint.relief_stats = rel;
	lint.heal_stats = heal;
	lint.repair_stats = repair;
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
	console.log(`BAKE: towns ${lint.town_stats.towns} stamped (${lint.town_stats.downtown} downtown / ` +
		`${lint.town_stats.mainstreet} main-street) · ${lint.town_stats.streets} street rows · ${lint.town_stats.slots} slots · MERIDIAN=${lint.addr_stats.meridian}`);
	if (lint.overpass_stats) console.log(`BAKE: overpasses — ${lint.overpass_stats.converted} pending crossings DECKED (${lint.overpass_stats.reused_pts} pts reused, ${lint.overpass_stats.skipped} skipped near road ends)`);
	if (lint.landmark_stats) console.log(`BAKE: landmarks — ${lint.landmark_stats.named} towns named, ${lint.landmark_stats.kept} bespoke kept`);
	if (lint.farmbelt_stats) console.log(`BAKE: farm belts — ${lint.farmbelt_stats.cells} grid cells turned to farmland around ${lint.farmbelt_stats.towns} towns`);
	if (lint.ghost_stats) console.log(`BAKE: ghost sites — ${lint.ghost_stats.ghosts} minted (${lint.ghost_stats.placements} cluster placements)`);
	if (lint.cityexit_stats) console.log(`BAKE: city exits — ${lint.cityexit_stats.minted} minted [${lint.cityexit_stats.ids.join(", ")}] (${lint.cityexit_stats.skipped_served} already served)`);
	if (lint.dslot_stats) console.log(`BAKE: district slots — ${lint.dslot_stats.slots} filled across ${lint.dslot_stats.districts} districts`);
	if (lint.relief_stats) console.log(`BAKE: road relief — ${lint.relief_stats.roads} roads climbed (${lint.relief_stats.points} pts, ${lint.relief_stats.capped} grade-capped) · ${lint.relief_stats.ramps} ramps blended · ${lint.relief_stats.streets} streets benched`);
	console.log(`BAKE: network fill — ${lint.fill_stats.reclassed} reclassed · ${lint.fill_stats.county_links} county links · ` +
		`${lint.fill_stats.spurs} dirt spurs (every one with a payload: ${lint.fill_stats.payloads})`);
	console.log(`BAKE: repaired polylines — ${lint.repair_stats.roads_fixed} roads deduped, ${lint.repair_stats.doubled_back} doubled-back runs spliced out, ${lint.repair_stats.points_dropped} vertices dropped ${JSON.stringify(lint.repair_stats.roads)}`);
	for (const bc of lint.blind_crossings) console.log(`  BLIND (walled, pending deck): ${bc.roads.join(" x ")} at ${bc.pos}`);
	if (!process.argv.includes("--dry")) {
		writeFileSync(MAP_PATH, JSON.stringify(map));
		console.log("BAKE: written to " + MAP_PATH);
	} else {
		console.log("BAKE: dry run, nothing written");
	}
}
