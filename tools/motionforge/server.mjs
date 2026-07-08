#!/usr/bin/env node
// MotionForge — the DRIVN motion editor + REST API (the next Forge).
//
// DRIVN's animation is PROCEDURAL — sin()-driven box rigs (ProtoPuppet, the quadruped)
// fed parameter rows, not keyframed clips (docs/MOVESET.txt SPEC B). MotionForge edits
// those rows: pick a rig, pick a motion, drag the numbers — or DESCRIBE the change in
// plain words — and the tuned row saves to game/data/motions.json. The engine folds
// that file over its stock literals at boot (additively: only params you touched
// change). The game-side reader + treadmill preview scene are separate work.
//
//   Run:  node tools/motionforge/server.mjs      (http://localhost:8896)
//   Docs: GET /api/help
//
// Zero dependencies. No purple. Sibling of VehicleForge (:8898) / MapForge (:8899).

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const DATA = process.env.MOTIONS_PATH || join(ROOT, "game", "data", "motions.json");
const PORT = Number(process.env.MOTIONFORGE_PORT || 8896);
const ID_RE = /^[a-z0-9_]+$/;

// ---------------------------------------------------------------------------
// STOCK — the engine's literals today, served read-only via /api/defaults so
// the UI can show "stock" vs "tuned". Effective params = stock ⊕ tuned row.
// ---------------------------------------------------------------------------
const DEFAULTS = {
	puppet: {
		gait: { cadence_base: 2.0, cadence_speed: 1.15, stride_amp: 0.6, arm_swing: 0.85,
			step_bob: 0.12, breath_amp: 0.02, lean_turn: 0.22, crouch_drop: 0.34,
			// crouch no-kiss rows (the shimmer fix) — were engine-only, now sliders too
			hip_fold_max: 0.40, hip_drop_frac: 0.50, hip_joint_gap: 0.03, torso_scale_min: 0.81,
			// RIG V2 follow-through: elbows/knees ride their parents as fractions.
			// knee_follow is the single biggest look upgrade — tune it FIRST.
			knee_follow: 0.55, knee_phase: 0.45, knee_rest: 0.06, crouch_knee: 0.55,
			elbow_follow: 0.35, elbow_rest: 0.14,
			// THE DOORKNOB FIX (2026-07-08): the chest LEADS a turn (spine twist) +
			// banks into it — real body english instead of a rigid flat yaw.
			turn_twist: 0.34, turn_bank: 0.30 },
		// THE MELEE READ — swing/punch/kick timings + angles, fully tunable
		// (press M / P / K on the treadmill stage to preview each strike).
		melee: { windup_s: 0.06, windup_yaw: 0.7, windup_lift: 0.25,
			slash_s: 0.1, slash_yaw: 0.85, slash_dip: 0.15, gun_twist: 0.45,
			settle_s: 0.12,
			punch_out_s: 0.05, punch_reach: 1.45, punch_back_s: 0.12,
			kick_out_s: 0.07, kick_height: 1.5, kick_back_s: 0.18, kick_lean: 0.25 },
		// RIG V2 PHASE 3: the recoil SPRING (F / SHIFT+F on the stage previews the
		// kick at strength 0 / 8). k = stiffness, c = damping (settle feel),
		// strength_eat = how much each STRENGTH level shaves off the kick.
		recoil: { k: 180.0, c: 22.0, strength_eat: 0.06 },
	},
	quadruped: {
		gait: { cadence_base: 3.0, cadence_speed: 1.4, stride_amp: 0.5, sniff_depth: 0.25,
			sniff_wobble: 0.12, body_lilt: 0.06, wag_speed_lo: 4.0, wag_speed_hi: 16.0,
			wag_amp_lo: 0.12, wag_amp_hi: 0.7 },
		leap: { launch_h: 7.2, tuck_front: 0.9, tuck_hind: 0.8, head_up: 0.35 },
		dig: { scrape_hz: 18.0, scrape_amp: 0.55, head_down: 0.4 },
	},
};

const COMMENT = "MotionForge rows — tuned overrides for the procedural sin() rigs. " +
	"The engine folds these over its stock literals at boot (additive: only listed params change). " +
	"Edit at http://localhost:8896 or via the REST API (GET /api/help).";

// ---------------------------------------------------------------------------
// The document — {"_comment": ..., "rigs": {"<rig>": {"<motion>": {param: number}}}}.
// Open schema: any [a-z0-9_]+ rig/motion/param id, values must be finite numbers.
// Created on first save if missing; every mutation writes to disk immediately.
// ---------------------------------------------------------------------------
let doc = { _comment: COMMENT, rigs: {} };
if (existsSync(DATA)) {
	try { doc = JSON.parse(readFileSync(DATA, "utf8")); }
	catch (e) { console.error(`Could not parse ${DATA}: ${e.message} — fix or remove it.`); process.exit(1); }
	if (typeof doc.rigs !== "object" || doc.rigs === null || Array.isArray(doc.rigs)) doc.rigs = {};
	if (!doc._comment) doc._comment = COMMENT;
}
const save = () => { mkdirSync(dirname(DATA), { recursive: true }); writeFileSync(DATA, JSON.stringify(doc, null, 2) + "\n"); };

const stockOf = (rig, m) => (DEFAULTS[rig] && DEFAULTS[rig][m]) || null;
const tunedOf = (rig, m) => (doc.rigs[rig] && doc.rigs[rig][m]) || null;
const effective = (rig, m) => ({ ...(stockOf(rig, m) || {}), ...(tunedOf(rig, m) || {}) });
const motionExists = (rig, m) => !!(stockOf(rig, m) || tunedOf(rig, m));

function rigIndex() { // every rig id + its motions (defaults ∪ tuned) + which are tuned
	const rigs = {};
	for (const r of new Set([...Object.keys(DEFAULTS), ...Object.keys(doc.rigs)])) {
		const motions = new Set([...Object.keys(DEFAULTS[r] || {}), ...Object.keys(doc.rigs[r] || {})]);
		rigs[r] = { motions: [...motions].sort(), tuned: Object.keys(doc.rigs[r] || {}).sort() };
	}
	return rigs;
}

// Validate a {param: number} patch body. Returns the clean patch or throws a string.
function cleanPatch(body) {
	if (!body || typeof body !== "object" || Array.isArray(body)) throw "body must be a JSON object of {param: number}";
	const entries = Object.entries(body);
	if (!entries.length) throw "empty patch — send at least one {param: number}";
	const clean = {};
	for (const [k, v] of entries) {
		if (!ID_RE.test(k)) throw `bad param id '${k}' (ids are [a-z0-9_]+)`;
		if (typeof v !== "number" || !Number.isFinite(v)) throw `param '${k}' must be a finite number (got ${JSON.stringify(v)})`;
		clean[k] = v;
	}
	return clean;
}

// ---------------------------------------------------------------------------
// DESCRIBE — the heuristic natural-language patcher (no external AI calls).
// "the run looks stiff, loosen the front legs" → { stride_amp: +15% }.
// Direction words pick an AXIS (+/-): amp (looser/stiffer, wider/narrower,
// more/less), speed (faster/slower), vert (deeper/lower vs higher/shallower).
// Target words narrow WHICH params (legs/arms/head/tail/bob/lean/cadence/…).
// ±15% per hit, ±30% when the clause says much/way/a lot. Complaint phrasing
// ("too stiff", "looks stiff") is inverted — the fix is the opposite.
// ---------------------------------------------------------------------------
const DIRECTIONS = [ // order matters: speed phrases before bare vert words ("slow down" ≠ "down")
	{ re: /\b(loosen|looser|loose|wider|widen|bigger|big|exaggerated?|stronger|heavier|springier|bouncier)\b/, axis: "amp", dir: +1 },
	{ re: /\b(stiffen|stiffer|stiff|tighten|tighter|tight|narrower|narrow|smaller|subtler|subtle|softer|weaker|lighter)\b/, axis: "amp", dir: -1 },
	{ re: /\b(speed(\s+\w+)?\s+up|faster|quicker|quick|snappier|snappy)\b/, axis: "speed", dir: +1 },
	{ re: /\b(slow(\s+\w+)?\s+down|slower|slowly|slow|sluggish|lazier|lazy)\b/, axis: "speed", dir: -1 },
	{ re: /\b(deeper|deepen|deep|lower|dip|drops?|sink|down(ward)?)\b/, axis: "vert", dir: -1 }, // toward the ground
	{ re: /\b(higher|high|raise|lift|shallower|shallow|taller|up(ward)?)\b/, axis: "vert", dir: +1 }, // away from it
	{ re: /\bmore\b/, axis: "amp", dir: +1 },
	{ re: /\b(less|fewer)\b/, axis: "amp", dir: -1 },
];
const TARGETS = [ // first match wins; pat filters param NAMES in the motion
	{ re: /\b(front\s+legs?|hind\s+legs?|legs?|stride|steps?|feet|foot|paws?)\b/, pat: /stride/ },
	{ re: /\b(arms?|hands?)\b/, pat: /arm/ },
	{ re: /\bsniff(ing)?\b/, pat: /sniff/ },
	{ re: /\b(head|nose|snout)\b/, pat: /head|sniff/ },
	{ re: /\b(tail|wag(ging)?)\b/, pat: /wag/ },
	{ re: /\b(bob(bing)?|bounce|bouncy|bounciness|springier|bouncier)\b/, pat: /bob|lilt/ },
	{ re: /\blean(ing)?\b/, pat: /lean/ },
	{ re: /\b(cadence|pace|tempo|rhythm|speed)\b/, pat: /cadence/ },
	{ re: /\bcrouch(ing)?\b/, pat: /crouch/ },
	{ re: /\b(breath(ing)?|chest)\b/, pat: /breath/ },
	{ re: /\b(launch|jump|leap|airtime|height)\b/, pat: /launch/ },
	{ re: /\btuck(ed)?\b/, pat: /tuck/ },
	{ re: /\b(scrape|scratch|dig(ging)?|claws?)\b/, pat: /scrape/ },
	{ re: /\b(body|torso)\b/, pat: /lilt|bob|lean/ },
];
// A param's axis, by name convention (works for unknown/open-schema params too).
const paramAxis = (n) => /cadence|speed|_hz$|freq|rate/.test(n) ? "speed"
	: /depth|drop|_down$|_up$|launch|height|_h$/.test(n) ? "vert" : "amp";
// vert polarity: value UP moves the part DOWN for these (sniff_depth, crouch_drop, head_down).
const downPolarity = (n) => /depth|drop|_down$/.test(n);
const round4 = (x) => Math.round(x * 10000) / 10000;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function resolveClause(clause, params) {
	let hit = null;
	for (const d of DIRECTIONS) { const m = clause.match(d.re); if (m) { hit = { axis: d.axis, dir: d.dir, word: m[0] }; break; } }
	if (!hit) return null;
	// complaint phrasing describes the PROBLEM — flip to the fix ("too stiff" → loosen)
	if (new RegExp(`\\b(too|looks?|seems?|feels?|reads?|is|are|was|were)\\s+(?:\\w+\\s+){0,2}${esc(hit.word)}`).test(clause)) hit.dir = -hit.dir;
	const mag = /\b(much|way|a\s+lot|really|significantly|drastically|very|far)\b/.test(clause) ? 0.30 : 0.15;
	let tpat = null, tword = null;
	for (const t of TARGETS) { const m = clause.match(t.re); if (m) { tpat = t.pat; tword = m[0]; break; } }
	const names = Object.keys(params);
	const cand = tpat ? names.filter((n) => tpat.test(n)) : names.slice();
	let picked = cand.filter((n) => paramAxis(n) === hit.axis);
	// fallbacks: untargeted "slower" means the motion's TEMPO (cadence) — not every speed knob;
	// a targeted clause whose axis finds nothing still nudges the target's params.
	if (!tpat && hit.axis === "speed") { const cad = picked.filter((n) => /cadence/.test(n)); if (cad.length) picked = cad; }
	if (!picked.length && hit.axis === "speed") picked = names.filter((n) => /cadence/.test(n));
	if (!picked.length && tpat) picked = cand;
	if (!picked.length) return null;
	const changes = picked.map((n) => {
		const eff = (hit.axis === "vert" && downPolarity(n)) ? -hit.dir : hit.dir; // "lower head" = MORE sniff_depth
		const from = params[n];
		const to = round4(from === 0 ? eff * mag : from * (1 + eff * mag));
		return { param: n, from, to, pct: Math.round(eff * mag * 100) };
	});
	return { axis: hit.axis, dir: hit.dir, word: hit.word, tword, targeted: !!tpat, changes };
}

function describe(text, params) {
	const clauses = String(text).toLowerCase().split(/[,;.!\n]+|\band\b|\bbut\b|\bthen\b/).map((s) => s.trim()).filter(Boolean);
	const resolved = clauses.map((c) => resolveClause(c, params)).filter(Boolean);
	// diagnosis+instruction pattern ("the run looks stiff, loosen the front legs"):
	// a targeted clause outranks untargeted clauses pushing the same axis+direction.
	const targeted = resolved.filter((r) => r.targeted);
	const kept = resolved.filter((r) => r.targeted || !targeted.some((t) => t.axis === r.axis && t.dir === r.dir));
	const diff = {}, was = {}, notes = [];
	for (const r of kept) {
		for (const c of r.changes) { diff[c.param] = c.to; if (!(c.param in was)) was[c.param] = c.from; } // later clauses win
		notes.push(`${r.word}${r.tword ? " " + r.tword : ""} → ` +
			r.changes.map((c) => c.from === 0 ? `${c.param} → ${c.to}` : `${c.param} ${c.pct > 0 ? "+" : ""}${c.pct}%`).join(", "));
	}
	return { diff, was, rationale: notes.join("; ") };
}

const UNDERSTANDS = {
	directions: "looser/stiffer · wider/narrower · more/less · faster/slower · deeper/shallower · higher/lower/raise/dip · stronger/softer · bigger/smaller",
	targets: "legs/stride/steps · arms · head/nose/sniff · tail/wag · bob/bounce · lean · cadence/speed/tempo · crouch · breath · launch/jump/leap · tuck · scrape/dig · body",
	modifiers: "much / way / a lot → ±30% (otherwise ±15%); 'too X' / 'looks X' is read as the problem and inverted",
	examples: ["make the sniff deeper and slower", "the run looks stiff, loosen the front legs",
		"tail wag much wider", "raise the head", "slow the dig way down"],
};

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const HELP = {
	name: "MotionForge API — read and tune DRIVN's procedural motion rows (game/data/motions.json)",
	note: "Rows are OVERRIDES over the engine's stock literals (see /api/defaults). The engine folds them in at boot (F10 → FORGE reload while running). Open schema: any [a-z0-9_]+ rig/motion/param, numbers only.",
	data: DATA,
	endpoints: [
		"GET    /api/help                                  -> this document",
		"GET    /api/rigs                                  -> rig ids + their motion ids (defaults merged with tuned)",
		"GET    /api/defaults                              -> the stock param sets (read-only engine literals)",
		"GET    /api/rig?id=puppet&motion=gait             -> effective params (stock ⊕ tuned) + the tuned overrides",
		"POST   /api/rig?id=puppet&motion=gait  {p:n,...}  -> merge params into the tuned row, save, return new effective",
		"PATCH  same as POST",
		"DELETE /api/rig?id=puppet&motion=gait             -> clear the tuned row (back to stock)",
		"POST   /api/describe  {rig,motion,text}           -> heuristic NL patch: parses the text, applies ±15%/±30% diffs, returns {diff, rationale}",
		"   (path style works too: /api/rig/puppet/motion/gait)",
	],
	describe_understands: UNDERSTANDS,
	examples: [
		`curl localhost:${PORT}/api/rigs`,
		`curl localhost:${PORT}/api/rig?id=quadruped&motion=leap`,
		`curl -X PATCH "localhost:${PORT}/api/rig?id=puppet&motion=gait" -d '{"stride_amp":0.75}'`,
		`curl -X POST localhost:${PORT}/api/describe -d '{"rig":"quadruped","motion":"gait","text":"make the sniff deeper and slower"}'`,
		`curl -X DELETE "localhost:${PORT}/api/rig?id=puppet&motion=gait"`,
	],
};

const json = (res, code, obj) => {
	res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
	res.end(JSON.stringify(obj));
};
const motionPayload = (rig, motion) => ({ rig, motion, params: effective(rig, motion), tuned: tunedOf(rig, motion) || {}, stock: stockOf(rig, motion) || {} });

const server = createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);
	const q = url.searchParams;
	let body = null;
	if (["POST", "PUT", "PATCH"].includes(req.method)) {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
		catch { return json(res, 400, { error: "bad JSON body" }); }
	}
	try {
		if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html"))
			return res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(join(HERE, "index.html")));
		if (url.pathname === "/api/help") return json(res, 200, HELP);
		if (url.pathname === "/api/rigs") return json(res, 200, { rigs: rigIndex() });
		if (url.pathname === "/api/defaults") return json(res, 200, DEFAULTS);

		// /api/rig — query style (?id=&motion=) or path style (/api/rig/:id/motion/:m)
		const pm = url.pathname.match(/^\/api\/rig\/([^/]+)\/motion\/([^/]+)$/);
		if (url.pathname === "/api/rig" || pm) {
			const rig = pm ? pm[1] : (q.get("id") || q.get("rig"));
			const motion = pm ? pm[2] : (q.get("motion") || q.get("m"));
			if (!rig || !motion) return json(res, 400, { error: "need ?id=<rig>&motion=<motion> (or /api/rig/:id/motion/:m)" });
			if (!ID_RE.test(rig) || !ID_RE.test(motion)) return json(res, 400, { error: "rig/motion ids are [a-z0-9_]+" });
			if (req.method === "GET") {
				if (!motionExists(rig, motion)) return json(res, 404, { error: `no motion '${rig}/${motion}'`, known: rigIndex() });
				return json(res, 200, motionPayload(rig, motion));
			}
			if (req.method === "POST" || req.method === "PATCH") { // open schema: unknown rig/motion creates a row
				let patch; try { patch = cleanPatch(body); } catch (e) { return json(res, 400, { error: String(e) }); }
				(doc.rigs[rig] ||= {})[motion] = { ...(doc.rigs[rig][motion] || {}), ...patch };
				save();
				return json(res, 200, { ok: true, ...motionPayload(rig, motion) });
			}
			if (req.method === "DELETE") {
				let cleared = 0;
				if (tunedOf(rig, motion)) {
					delete doc.rigs[rig][motion];
					if (!Object.keys(doc.rigs[rig]).length) delete doc.rigs[rig];
					save(); cleared = 1;
				}
				return json(res, 200, { ok: true, cleared, ...motionPayload(rig, motion) });
			}
		}

		if (url.pathname === "/api/describe" && req.method === "POST") {
			const { rig, motion, text } = body || {};
			if (!rig || !motion || !text) return json(res, 400, { error: "need {rig, motion, text}" });
			if (!motionExists(rig, motion)) return json(res, 404, { error: `no motion '${rig}/${motion}'`, known: rigIndex() });
			const { diff, was, rationale } = describe(text, effective(rig, motion));
			if (!Object.keys(diff).length)
				return json(res, 422, { error: "could not read a change out of that — say a direction (and ideally a body part)", understands: UNDERSTANDS });
			(doc.rigs[rig] ||= {})[motion] = { ...(doc.rigs[rig][motion] || {}), ...diff }; // APPLY it
			save();
			return json(res, 200, { ok: true, diff, was, rationale, ...motionPayload(rig, motion) });
		}

		json(res, 404, { error: "no such endpoint", help: "/api/help" });
	} catch (e) { json(res, 500, { error: String(e) }); }
});

server.listen(PORT, () => {
	console.log(`MotionForge up: http://localhost:${PORT}  (editing ${DATA}${existsSync(DATA) ? "" : " — will be created on first save"})`);
	console.log(`API docs:       http://localhost:${PORT}/api/help`);
});
