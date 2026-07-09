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

export function bakeJunctions(map) {
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
