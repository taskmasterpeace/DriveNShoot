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

// half-width of a road (mirrors ProtoUSMap.road_geometry: LANE_W 3.6, shoulder
// 2.0, divided carriage +1.6 inner, median 2.4).
function halfWidth(r, divided) {
	const lanes = r.lanes || (r.kind === "interstate" ? 4 : 2);
	const per = Math.max(1, Math.floor(lanes / 2));
	if (divided) return per * 3.6 + 1.6 + 1.2;
	return (lanes * 3.6 + 4.0) / 2;
}

// THE EXIT GEOMETRY LAW (0.18a/b): rewrite every off-ramp to START at the
// carriageway EDGE of the direction it serves and PEEL at ~12° (the owner's
// "little angle"); stamp a `side` (+1 = along pts order, -1 = against) on every
// ramp; and generate the MISSING mirrored off/on ramps on divided highways so
// each travel direction is served from its own carriageway. Idempotent: rows
// already carrying geom:"peel_v1" are left alone; mirrors are keyed by id.
export function rewriteExitGeometry(map) {
	const roads = map.roads || [];
	const network = roads.filter((r) => NETWORK_KINDS.has(r.kind || "interstate"));
	const isDiv = (r) => (r.divided !== undefined ? !!r.divided : (r.lanes || (r.kind === "interstate" ? 4 : 2)) >= 6);
	const stats = { rewritten: 0, mirrors_off: 0, mirrors_on: 0, skipped: 0 };
	const right = (d) => ({ x: -d.y, y: d.x }); // right of travel, top-down
	const norm = (d) => { const l = Math.hypot(d.x, d.y) || 1; return { x: d.x / l, y: d.y / l }; };

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

	for (const ex of map.exits || []) {
		const hwy = network.find((r) => r.id === ex.highway_id);
		if (!hwy) continue;
		const exPos = v(ex.pos);
		const dest = v(ex.dest || ex.pos);
		const { d: dAlong, foot } = dirAt(hwy, exPos);
		const edge = halfWidth(hwy, isDiv(hwy)) + 1.0;
		// serving sense: the travel direction with dest on its RIGHT
		const toDest = norm(sub(dest, foot));
		const sSign = (right(dAlong).x * toDest.x + right(dAlong).y * toDest.y) >= 0 ? 1 : -1;
		const mk = (sgn) => {
			const dS = { x: dAlong.x * sgn, y: dAlong.y * sgn };
			const rS = right(dS);
			const peel = { x: foot.x + rS.x * edge, y: foot.y + rS.y * edge };
			const th = (12 * Math.PI) / 180; // the little angle
			const out = {
				x: peel.x + (dS.x * Math.cos(th) + rS.x * Math.sin(th)) * 70,
				y: peel.y + (dS.y * Math.cos(th) + rS.y * Math.sin(th)) * 70,
			};
			return { peel, out };
		};
		const rampIds = ex.ramp_ids || [];
		for (const rid of rampIds) {
			const rp = roads.find((r) => r.id === rid);
			if (!rp) continue;
			if (rp.geom === "peel_v1") { stats.skipped++; continue; }
			const p0 = v(rp.pts[0]);
			const isOff = dist(p0, exPos) <= SNAP_M * 2;
			if (isOff) {
				const { peel, out } = mk(sSign);
				const tail = rp.pts.slice(1).map((p) => [p[0], p[1]]);
				rp.pts = [[peel.x, peel.y], [out.x, out.y], ...tail];
				rp.side = sSign;
				rp.geom = "peel_v1";
				stats.rewritten++;
			} else {
				// on-ramp: end at the edge of its serving carriageway + a merge run
				const pN = v(rp.pts[rp.pts.length - 1]);
				const { d: dEnd, foot: footN } = dirAt(hwy, pN);
				const fromDest = norm(sub(footN, dest));
				const sIn = (right(dEnd).x * fromDest.x + right(dEnd).y * fromDest.y) <= 0 ? 1 : -1;
				const dS = { x: dEnd.x * sIn, y: dEnd.y * sIn };
				const rS = right(dS);
				const merge = { x: footN.x + rS.x * edge, y: footN.y + rS.y * edge };
				const mergeEnd = { x: merge.x + dS.x * 100, y: merge.y + dS.y * 100 };
				const front = rp.pts.slice(0, -1).map((p) => [p[0], p[1]]);
				rp.pts = [...front, [merge.x, merge.y], [mergeEnd.x, mergeEnd.y]];
				rp.side = sIn;
				rp.geom = "peel_v1";
				stats.rewritten++;
			}
		}
		// mirrored OFF-ramp: a divided highway serves BOTH directions (0.18b);
		// today every exit has one off — mint the reverse-side twin.
		if (isDiv(hwy)) {
			const mirrorId = `${ex.id}-off-r`;
			if (!roads.find((r) => r.id === mirrorId)) {
				const { peel, out } = mk(-sSign);
				roads.push({ id: mirrorId, kind: "exit", pts: [[peel.x, peel.y], [out.x, out.y], [dest.x, dest.y]],
					danger: ex.risk_rating || 1, family: "", nickname: "", lanes: 2, divided: false,
					side: -sSign, geom: "peel_v1" });
				ex.ramp_ids = [...(ex.ramp_ids || []), mirrorId];
				stats.mirrors_off++;
			}
			// mirrored ON-ramp only where a return ramp already exists (mirror the pair)
			const hasOn = (ex.ramp_ids || []).some((rid2) => {
				const rp2 = roads.find((r) => r.id === rid2);
				return rp2 && !rid2.endsWith("-off-r") && dist(v(rp2.pts[0]), exPos) > SNAP_M * 2;
			});
			const mirrorOnId = `${ex.id}-on-r`;
			if (hasOn && !roads.find((r) => r.id === mirrorOnId)) {
				const dS = { x: -dAlong.x * sSign, y: -dAlong.y * sSign };
				const rS = right(dS);
				const merge = { x: foot.x + rS.x * edge + dS.x * 180, y: foot.y + rS.y * edge + dS.y * 180 };
				const mergeEnd = { x: merge.x + dS.x * 100, y: merge.y + dS.y * 100 };
				roads.push({ id: mirrorOnId, kind: "exit", pts: [[dest.x, dest.y], [merge.x, merge.y], [mergeEnd.x, mergeEnd.y]],
					danger: ex.risk_rating || 1, family: "", nickname: "", lanes: 2, divided: false,
					side: -sSign, geom: "peel_v1" });
				ex.ramp_ids = [...(ex.ramp_ids || []), mirrorOnId];
				stats.mirrors_on++;
			}
		}
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
export function stampTownStreets(map) {
	const stats = { towns: 0, downtown: 0, mainstreet: 0, streets: 0, slots: 0 };
	const roads = map.roads || [];
	const placements = map.placements || [];
	const exitFor = (t) => (map.exits || []).find((e) => e.town_id === t.id);
	const hasStreet = (t) => roads.some((r) => String(r.id).startsWith(`ST-${t.id}-`));
	const occupied = (p, r) => placements.some((q) => Math.hypot(q.pos[0] - p.x, q.pos[1] - p.y) < r);
	const MAIN_SET = ["diner_roadside", "market_general", "gas_station_small", "house_small",
		"church_small", "bar_roadhouse", "house_small", "motel_strip"];
	const DOWNTOWN_SET = ["police_station", "courthouse", "clinic_small", "market_general",
		"diner_roadside", "bar_roadhouse", "jeweler", "restaurant_fancy", "warehouse",
		"house_small", "house_small", "auto_shop", "radio_station", "school_small"];
	let slotSeq = 0;
	const addStreet = (t, tag, a, b) => {
		roads.push({ id: `ST-${t.id}-${tag}`, kind: "street", pts: [[a.x, a.y], [b.x, b.y]],
			danger: 0, family: "", nickname: "", lanes: 2, divided: false });
		stats.streets++;
	};
	const addSlot = (t, sid, p, rot) => {
		if (occupied(p, 16)) return;
		placements.push({ id: `${t.id}-slot-${++slotSeq}`, building: sid, pos: [p.x, p.y], rot });
		stats.slots++;
	};
	for (const t of map.towns || []) {
		if (t.authored || hasStreet(t)) continue;
		const ex = exitFor(t);
		const tier = ex && ["metro", "county_seat"].includes(ex.archetype) ? "downtown" : "mainstreet";
		const c = { x: t.pos[0], y: t.pos[1] };
		// orient the main drag toward the exit approach (or E-W default)
		let dir = { x: 1, y: 0 };
		if (ex) {
			const d = { x: c.x - ex.pos[0], y: c.y - ex.pos[1] };
			const l = Math.hypot(d.x, d.y) || 1;
			// the drag runs PERPENDICULAR to the approach — you arrive at Main St
			dir = { x: -d.y / l, y: d.x / l };
		}
		const perp = { x: -dir.y, y: dir.x };
		const at = (u, w) => ({ x: c.x + dir.x * u + perp.x * w, y: c.y + dir.y * u + perp.y * w });
		stats.towns++;
		if (tier === "downtown") {
			stats.downtown++;
			// ~4×3 block grid: 4 streets along the drag axis, 3 across
			for (let i = 0; i < 3; i++) addStreet(t, `ew${i}`, at(-140, -70 + i * 70), at(140, -70 + i * 70));
			for (let j = 0; j < 4; j++) addStreet(t, `ns${j}`, at(-120 + j * 80, -110), at(-120 + j * 80, 110));
			DOWNTOWN_SET.forEach((sid, k) => {
				const row = Math.floor(k / 4);
				const col = k % 4;
				addSlot(t, sid, at(-120 + col * 80 + 32, -70 + row * 70 + 24), 0);
			});
		} else {
			stats.mainstreet++;
			addStreet(t, "main", at(-160, 0), at(160, 0));
			addStreet(t, "side0", at(-55, -90), at(-55, 90));
			addStreet(t, "side1", at(65, -90), at(65, 90));
			MAIN_SET.forEach((sid, k) => {
				const side = k % 2 === 0 ? 1 : -1;
				addSlot(t, sid, at(-130 + Math.floor(k / 2) * 62, side * 16), side > 0 ? Math.PI : 0);
			});
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

export function bakeJunctions(map) {
	// towns first (their streets join the junction bake), then exit geometry,
	// then addresses, then the junction rows read the corrected polylines
	const fill = fillNetwork(map);
	const town = stampTownStreets(map);
	const geo = rewriteExitGeometry(map);
	const addr = renumberExits(map);
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
					const grade = bothDivided || minorCross ? "separated_pending" : "flat";
					const control = grade === "flat" ? (isDivided(A) || isDivided(B) ? "gap" : "none") : "none";
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
	console.log(`BAKE: network fill — ${lint.fill_stats.reclassed} reclassed · ${lint.fill_stats.county_links} county links · ` +
		`${lint.fill_stats.spurs} dirt spurs (every one with a payload: ${lint.fill_stats.payloads})`);
	for (const bc of lint.blind_crossings) console.log(`  BLIND (walled, pending deck): ${bc.roads.join(" x ")} at ${bc.pos}`);
	if (!process.argv.includes("--dry")) {
		writeFileSync(MAP_PATH, JSON.stringify(map));
		console.log("BAKE: written to " + MAP_PATH);
	} else {
		console.log("BAKE: dry run, nothing written");
	}
}
