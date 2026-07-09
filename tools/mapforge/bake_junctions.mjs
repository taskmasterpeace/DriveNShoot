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

export function bakeJunctions(map) {
	// geometry first (0.18), then junction rows read the corrected polylines
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
	// true interior crossings (the blind-crossing audit, 0.4)
	for (let i = 0; i < network.length; i++) {
		for (let j = i + 1; j < network.length; j++) {
			const A = network[i], B = network[j];
			for (const sa of segs(A)) {
				for (const sb of segs(B)) {
					const hit = segIntersect(sa, sb);
					if (!hit || hit.ang < MIN_CROSS_ANGLE_DEG) continue;
					if (near(hit.q, SNAP_M)) continue; // already a tee/shared node
					const bothDivided = isDivided(A) && isDivided(B);
					const grade = bothDivided ? "separated_pending" : "flat";
					const control = grade === "flat" ? (isDivided(A) || isDivided(B) ? "gap" : "none") : "none";
					push("cross", grade, control, hit.q, [
						{ road: A.id, arc_m: Math.round(arcAt(A, hit.q)) },
						{ road: B.id, arc_m: Math.round(arcAt(B, hit.q)) },
					]);
					lint.crosses++;
					if (grade === "separated_pending")
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
	for (const bc of lint.blind_crossings) console.log(`  BLIND (walled, pending deck): ${bc.roads.join(" x ")} at ${bc.pos}`);
	if (!process.argv.includes("--dry")) {
		writeFileSync(MAP_PATH, JSON.stringify(map));
		console.log("BAKE: written to " + MAP_PATH);
	} else {
		console.log("BAKE: dry run, nothing written");
	}
}
