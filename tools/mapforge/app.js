// MapForge v4 — the road & world editor client.
// World-space viewport (pan/zoom like a real map tool), vertex-level road
// editing, milepost exits, districts, the shared PLAN layer, and the
// drive-time MEASURE tool. Talks only to the v4 REST API — everything the UI
// does, a script or an AI can do with curl. No purple.

"use strict";

// ---------- state ----------
let meta = null, rows = [], states = [], roads = [], towns = [], placements = [];
let exits = [], archetypes = [], structures = [], footprints = [];
let districts = [], notes = [], junctions = [], vehicles = [], health = null;
let regions = [], ecology = null;           // v4.1: state cards + what-lives-where
let trackPieces = [];                       // Racing Destruction Set catalog (track_pieces.json)
const stateMasks = {};                      // state char -> tinted offscreen mask
let ecoTint = null;                         // offscreen wildlife-richness tint
let tool = "select";
let sel = null;            // {type, id}
let biome = "forest", brush = 1;
let painting = false, paintStroke = [], paintPrev = [];
let districtDraft = [];    // [[wx,wz],...] while drawing a district
let measure = { a: null, b: null, result: null, busy: false };
let drag = null;           // active drag op
let spaceDown = false;
let pendingExit = null;    // [wx,wz] while the exit dialog is up
let pendingNotePos = null; // [wx,wz] for a new note
let editingNoteId = null;
let selStructId = null, structOpen = false;
let hoverWorld = null;

const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
const mini = document.getElementById("minimap"), mctx = mini.getContext("2d");
const stage = document.getElementById("stage");
const view = { cx: 0, cz: 0, scale: 0.01 }; // world center + px per meter
let fitScale = 0.01;

const COLORS = {
	ocean: "#0d1a26", water: "#1e4a63", forest: "#3d5426", scrub: "#6b5a3d",
	plains: "#736b46", farmland: "#8c7a42", desert: "#94764c", mountains: "#6b6862",
	swamp: "#40513a", urban: "#7d776e",
};
const BIOME_INFO = {
	ocean: "The world edge — nothing spawns, keeps the coastline closed.",
	water: "Lakes & rivers. BOGS cars (cross at road bridges). No scatter.",
	forest: "Dense trees, some solid trunks you can't drive through.",
	scrub: "Sparse brush & rocks — the open, drivable wasteland.",
	plains: "Light scatter, roadside copses. Fast open driving.",
	farmland: "Crop rows + barns. Caches here hold food.",
	desert: "Sparse scatter + cracked dirt. Wide and empty.",
	mountains: "Solid rock formations — real obstacles.",
	swamp: "Water pools + trees + brush. Lurker country.",
	urban: "Ruined city blocks, husks for cover, tool caches.",
};
// road drawing: world width (m) + color per kind
const ROAD_STYLE = {
	interstate: { w: 26, c: "#d9c98f" }, us_route: { w: 18, c: "#c4b078" },
	state_road: { w: 14, c: "#b3a06c" }, county: { w: 10, c: "#a08c60" },
	street: { w: 7, c: "#8b8578" }, dirt: { w: 4, c: "#7a5c3e", dash: true },
	exit: { w: 8, c: "#b0a070" }, backroad: { w: 8, c: "#9c8a5e" },
};
const DISTRICT_FILL = {
	downtown: "rgba(240,180,41,.16)", commercial: "rgba(232,224,207,.10)",
	industrial: "rgba(138,74,43,.20)", residential: "rgba(55,178,160,.10)",
	port: "rgba(55,178,160,.18)", combat_zone: "rgba(192,57,43,.16)",
	farmland: "rgba(127,174,76,.14)", custom: "rgba(154,143,120,.14)",
};
const DISTRICT_EDGE = {
	downtown: "#f0b429", commercial: "#e8e0cf", industrial: "#8a4a2b",
	residential: "#37b2a0", port: "#37b2a0", combat_zone: "#c0392b",
	farmland: "#7fae4c", custom: "#9a8f78",
};
const NOTE_COLOR = { open: "#f0b429", doing: "#e8e0cf", done: "#7fae4c" };

const layers = {
	states: true, rivers: true, highways: true, minor: true, streets: true,
	dirt: true, ramps: true, junctions: false, exits: true, towns: true,
	placements: true, districts: true, notes: true, orphans: false, ecology: false,
};
const LAYER_DEFS = [
	["states", "state lines", "#e8e0cf"], ["ecology", "ECOLOGY (what lives where)", "#7fae4c"],
	["rivers", "rivers", "#1e4a63"],
	["highways", "interstates / US routes", "#d9c98f"], ["minor", "state + county", "#a08c60"],
	["streets", "town streets", "#8b8578"], ["dirt", "dirt spurs", "#7a5c3e"],
	["ramps", "exit ramps", "#b0a070"], ["junctions", "junctions", "#f0b429"],
	["exits", "exit nodes + numbers", "#f0b429"], ["towns", "towns", "#c9995c"],
	["placements", "structures", "#37b2a0"], ["districts", "districts", "#f0b429"],
	["notes", "plan notes", "#f0b429"], ["orphans", "ORPHANS (bake gaps)", "#c0392b"],
];

// offscreen biome bitmap (1px per cell) + precomputed state-border path
const bmp = document.createElement("canvas");
const bmpCtx = bmp.getContext("2d");
let statePath = null;

// ---------- api ----------
async function api(path, opts) {
	const r = await fetch(path, opts);
	const j = await r.json();
	if (!r.ok) throw new Error(j.error || r.status);
	return j;
}
function savedFlash(msg) {
	const el = document.getElementById("saved");
	el.textContent = msg;
	clearTimeout(el._t); el._t = setTimeout(() => (el.textContent = ""), 2200);
}

// ---------- undo ----------
const undoStack = [], redoStack = [];
function pushUndo(label, undoFn, redoFn) {
	undoStack.push({ label, undoFn, redoFn });
	if (undoStack.length > 100) undoStack.shift();
	redoStack.length = 0;
}
async function doUndo() {
	const op = undoStack.pop();
	if (!op) return savedFlash("nothing to undo");
	await op.undoFn(); redoStack.push(op);
	await refresh(); savedFlash(`undid: ${op.label}`);
}
async function doRedo() {
	const op = redoStack.pop();
	if (!op) return savedFlash("nothing to redo");
	await op.redoFn(); undoStack.push(op);
	await refresh(); savedFlash(`redid: ${op.label}`);
}

// ---------- load ----------
async function load() {
	meta = await api("/api/meta");
	rows = (await api("/api/grid?layer=biomes")).rows;
	states = (await api("/api/grid?layer=states")).rows;
	await refresh(false);
	({ structures, footprints } = await api("/api/structures"));
	try { trackPieces = (await api("/api/track_pieces")).track_pieces || []; } catch { trackPieces = []; }
	vehicles = (await api("/api/vehicles")).vehicles;
	regions = await api("/api/regions");
	ecology = await api("/api/ecology");
	buildEcoTint();
	document.getElementById("mapname").textContent =
		`${meta.name} · ${meta.compression}× · ${meta.world_km[0]}×${meta.world_km[1]} km · ${meta.roads} roads · ${meta.exits} exits · ${meta.junctions} junctions`;
	buildBmp(); buildStatePath(); buildPalette(); buildVehicleSel(); buildFootprintSel();
	buildStructList(); buildBuildingSel(); buildExitArch();
	fitView(); requestDraw();
	refreshHealth();
}
// re-pull the mutable row sets (cheap; grids stay cached)
async function refresh(redraw = true) {
	roads = await api("/api/roads");
	towns = await api("/api/towns");
	placements = await api("/api/placements");
	({ exits, archetypes } = await api("/api/exits"));
	districts = await api("/api/districts");
	notes = await api("/api/plan");
	junctions = await api("/api/junctions");
	buildExitList(); buildPlanList(); renderInspector();
	if (redraw) requestDraw();
}
async function refreshHealth() {
	try {
		health = await api("/api/graph_health");
		document.getElementById("healthline").innerHTML =
			`<b>${health.nodes}</b> nodes · <b>${health.components}</b> components · main <b>${(health.main_share * 100).toFixed(1)}%</b> · <b>${health.orphan_roads.length}</b> orphan roads`;
	} catch { /* pre-bake maps have no graph */ }
	requestDraw();
}

// ---------- viewport ----------
function resize() {
	const dpr = devicePixelRatio || 1;
	const r = stage.getBoundingClientRect();
	cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	cv._w = r.width; cv._h = r.height;
	requestDraw();
}
function fitView() {
	if (!meta) return;
	const wm = meta.w * meta.cell_m, hm = meta.h * meta.cell_m;
	fitScale = Math.min(cv._w / wm, cv._h / hm) * 0.95;
	view.scale = fitScale;
	view.cx = meta.world_offset[0] + wm / 2;
	view.cz = meta.world_offset[1] + hm / 2;
}
const w2sx = (wx) => (wx - view.cx) * view.scale + cv._w / 2;
const w2sz = (wz) => (wz - view.cz) * view.scale + cv._h / 2;
const s2wx = (sx) => (sx - cv._w / 2) / view.scale + view.cx;
const s2wz = (sz) => (sz - cv._h / 2) / view.scale + view.cz;
function setZoom(k, anchorSx, anchorSz) {
	const ns = Math.min(4, Math.max(fitScale * 0.5, view.scale * k));
	if (anchorSx !== undefined) {
		const wx = s2wx(anchorSx), wz = s2wz(anchorSz);
		view.scale = ns;
		view.cx = wx - (anchorSx - cv._w / 2) / ns;
		view.cz = wz - (anchorSz - cv._h / 2) / ns;
	} else view.scale = ns;
	requestDraw();
}

// ---------- offscreen layers ----------
function buildBmp() {
	bmp.width = meta.w; bmp.height = meta.h;
	for (let z = 0; z < meta.h; z++)
		for (let x = 0; x < meta.w; x++) {
			bmpCtx.fillStyle = COLORS[meta.legend[rows[z][x]]] || "#222";
			bmpCtx.fillRect(x, z, 1, 1);
		}
	drawMini();
}
function paintBmpCell(x, z) {
	bmpCtx.fillStyle = COLORS[meta.legend[rows[z][x]]] || "#222";
	bmpCtx.fillRect(x, z, 1, 1);
}
function buildStatePath() {
	statePath = new Path2D();
	const cm = meta.cell_m, ox = meta.world_offset[0], oz = meta.world_offset[1];
	for (let z = 0; z < meta.h; z++)
		for (let x = 0; x < meta.w; x++) {
			if (x + 1 < meta.w && states[z][x] !== states[z][x + 1] && states[z][x] !== "." && states[z][x + 1] !== ".") {
				statePath.moveTo(ox + (x + 1) * cm, oz + z * cm);
				statePath.lineTo(ox + (x + 1) * cm, oz + (z + 1) * cm);
			}
			if (z + 1 < meta.h && states[z][x] !== states[z + 1][x] && states[z][x] !== "." && states[z + 1][x] !== ".") {
				statePath.moveTo(ox + x * cm, oz + (z + 1) * cm);
				statePath.lineTo(ox + (x + 1) * cm, oz + (z + 1) * cm);
			}
		}
}
function drawMini() {
	mctx.imageSmoothingEnabled = false;
	mctx.drawImage(bmp, 0, 0, mini.width, mini.height);
}
// v4.1: a tinted mask per state (built lazily, cached — states never change here)
function stateMask(ch) {
	if (stateMasks[ch]) return stateMasks[ch];
	const c = document.createElement("canvas");
	c.width = meta.w; c.height = meta.h;
	const x2 = c.getContext("2d");
	x2.fillStyle = "rgba(240,180,41,.34)";
	for (let z = 0; z < meta.h; z++)
		for (let x = 0; x < meta.w; x++)
			if (states[z][x] === ch) x2.fillRect(x, z, 1, 1);
	stateMasks[ch] = c;
	return c;
}
// v4.1: wildlife-richness tint — greener where more creature rows can live
function buildEcoTint() {
	if (!ecology) return;
	ecoTint = document.createElement("canvas");
	ecoTint.width = meta.w; ecoTint.height = meta.h;
	const x2 = ecoTint.getContext("2d");
	const maxN = Math.max(1, ...Object.values(ecology.by_biome).map((l) => l.length));
	for (let z = 0; z < meta.h; z++)
		for (let x = 0; x < meta.w; x++) {
			const b = meta.legend[rows[z][x]];
			const n = (ecology.by_biome[b] || []).length;
			if (!n) continue;
			x2.fillStyle = `rgba(127,174,76,${(0.12 + 0.5 * (n / maxN)).toFixed(2)})`;
			x2.fillRect(x, z, 1, 1);
		}
}
// blit an offscreen cell-grid canvas through the visible-cell clip (the same
// law as the biome blit — a full-map blit at deep zoom wedges the renderer)
function blitCells(src) {
	const cm = meta.cell_m, ox = meta.world_offset[0], oz = meta.world_offset[1];
	const cx0 = Math.max(0, Math.floor((s2wx(0) - ox) / cm));
	const cz0 = Math.max(0, Math.floor((s2wz(0) - oz) / cm));
	const cx1 = Math.min(meta.w, Math.ceil((s2wx(cv._w) - ox) / cm));
	const cz1 = Math.min(meta.h, Math.ceil((s2wz(cv._h) - oz) / cm));
	if (cx1 > cx0 && cz1 > cz0)
		ctx.drawImage(src, cx0, cz0, cx1 - cx0, cz1 - cz0,
			w2sx(ox + cx0 * cm), w2sz(oz + cz0 * cm),
			(cx1 - cx0) * cm * view.scale, (cz1 - cz0) * cm * view.scale);
}

// ---------- draw ----------
let drawQueued = false;
function requestDraw() {
	if (drawQueued) return;
	drawQueued = true;
	requestAnimationFrame(() => { drawQueued = false; draw(); });
}
function roadVisible(r) {
	const k = r.kind || "interstate";
	if (k === "interstate" || k === "us_route") return layers.highways;
	if (k === "state_road" || k === "county" || k === "backroad") return layers.minor;
	if (k === "street") return layers.streets;
	if (k === "dirt") return layers.dirt;
	if (k === "exit") return layers.ramps;
	return true;
}
function tracePoly(pts) {
	ctx.beginPath();
	for (let i = 0; i < pts.length; i++) {
		const x = w2sx(pts[i][0]), z = w2sz(pts[i][1]);
		i ? ctx.lineTo(x, z) : ctx.moveTo(x, z);
	}
}
function draw() {
	if (!meta) return;
	ctx.clearRect(0, 0, cv._w, cv._h);
	// biomes — blit ONLY the visible cells: a full-map blit at high zoom asks the
	// rasterizer for a ~100k-px destination rect and wedges the tab.
	const cm = meta.cell_m;
	ctx.imageSmoothingEnabled = false;
	blitCells(bmp);
	// v4.1 overlays on the land itself
	if (layers.ecology && ecoTint) blitCells(ecoTint);
	if (sel?.type === "state") blitCells(stateMask(sel.id));
	// state borders (world-space path under a transform)
	if (layers.states && statePath) {
		ctx.save();
		ctx.setTransform((devicePixelRatio || 1) * view.scale, 0, 0, (devicePixelRatio || 1) * view.scale,
			(devicePixelRatio || 1) * (cv._w / 2 - view.cx * view.scale), (devicePixelRatio || 1) * (cv._h / 2 - view.cz * view.scale));
		ctx.strokeStyle = "rgba(232,224,207,.25)";
		ctx.lineWidth = 1.2 / view.scale;
		ctx.stroke(statePath);
		ctx.restore();
	}
	// rivers
	if (layers.rivers)
		for (const rv of (window._rivers || [])) {
			ctx.strokeStyle = "#1e4a63"; ctx.lineWidth = Math.max(1, 40 * view.scale);
			ctx.lineCap = "round"; ctx.lineJoin = "round";
			tracePoly(rv.pts); ctx.stroke();
		}
	// districts under roads
	if (layers.districts) {
		for (const d of districts) drawDistrict(d, sel?.type === "district" && sel.id === d.id);
		if (districtDraft.length) drawDistrictDraft();
	}
	// roads
	const orphanSet = layers.orphans && health ? new Set(health.orphan_roads) : null;
	ctx.lineCap = "round"; ctx.lineJoin = "round";
	for (const r of roads) {
		if (r.pts.length < 2 || !roadVisible(r)) continue;
		const st = ROAD_STYLE[r.kind || "interstate"] || ROAD_STYLE.backroad;
		const selMe = sel?.type === "road" && sel.id === r.id;
		ctx.strokeStyle = selMe ? "#ffcf3f" : st.c;
		ctx.lineWidth = Math.max(selMe ? 1.6 : 0.75, st.w * view.scale);
		ctx.setLineDash(st.dash ? [Math.max(3, 30 * view.scale), Math.max(3, 22 * view.scale)] : []);
		tracePoly(r.pts); ctx.stroke();
		ctx.setLineDash([]);
		// divided-highway median at close zoom
		if (r.divided && view.scale > 0.06) {
			ctx.strokeStyle = "#4d4432";
			ctx.lineWidth = Math.max(0.5, 1.6 * view.scale * 10);
			tracePoly(r.pts); ctx.stroke();
		}
		// orphan tint on top
		if (orphanSet && orphanSet.has(r.id)) {
			ctx.strokeStyle = "#c0392b";
			ctx.lineWidth = Math.max(1.2, st.w * view.scale * 0.5);
			ctx.setLineDash([6, 5]);
			tracePoly(r.pts); ctx.stroke();
			ctx.setLineDash([]);
		}
		// ELEVATION tint (Racing Destruction Set): segments climb toward amber;
		// per-segment so a ramp reads as a gradient along the road
		if (Array.isArray(r.elev) && r.elev.some((e) => e)) {
			for (let i = 0; i + 1 < r.pts.length; i++) {
				const ea = r.elev[i] || 0, eb = r.elev[i + 1] || 0;
				if (!ea && !eb) continue;
				ctx.strokeStyle = elevTint((ea + eb) / 2);
				ctx.lineWidth = Math.max(1.0, st.w * view.scale * 0.6);
				ctx.beginPath();
				ctx.moveTo(w2sx(r.pts[i][0]), w2sz(r.pts[i][1]));
				ctx.lineTo(w2sx(r.pts[i + 1][0]), w2sz(r.pts[i + 1][1]));
				ctx.stroke();
			}
		}
	}
	// vertex handles for the selected/edited road
	const vr = vertexRoad();
	if (vr) {
		for (let i = 0; i < vr.pts.length; i++) {
			const x = w2sx(vr.pts[i][0]), z = w2sz(vr.pts[i][1]);
			ctx.fillStyle = i === 0 ? "#7fae4c" : i === vr.pts.length - 1 ? "#ff5a3b" : "#ffcf3f";
			ctx.strokeStyle = "#14110c"; ctx.lineWidth = 1;
			ctx.fillRect(x - 3.5, z - 3.5, 7, 7); ctx.strokeRect(x - 3.5, z - 3.5, 7, 7);
			// ELEV: nonzero heights label their vertex; the ARMED vertex wears a ring
			const h = Array.isArray(vr.elev) ? (vr.elev[i] || 0) : 0;
			if (elevSel && elevSel.id === vr.id && elevSel.i === i) {
				ctx.strokeStyle = "#ffd27f"; ctx.lineWidth = 2;
				ctx.beginPath(); ctx.arc(x, z, 8, 0, 7); ctx.stroke();
			}
			if (h || (tool === "elev" && elevSel && elevSel.id === vr.id && elevSel.i === i)) {
				ctx.fillStyle = h > 0 ? "#ffd27f" : h < 0 ? "#8fb7c9" : "#e8e0cf";
				ctx.font = "10px ui-monospace, monospace";
				ctx.fillText(`${h > 0 ? "+" : ""}${h.toFixed(1)}m`, x + 6, z - 6);
			}
		}
		// ghost line to cursor in ROAD tool
		if (tool === "road" && hoverWorld) {
			const end = nearestEnd(vr, hoverWorld);
			ctx.strokeStyle = "rgba(255,207,63,.5)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
			ctx.beginPath();
			ctx.moveTo(w2sx(end.pt[0]), w2sz(end.pt[1]));
			ctx.lineTo(w2sx(hoverWorld[0]), w2sz(hoverWorld[1]));
			ctx.stroke(); ctx.setLineDash([]);
		}
	}
	// junctions
	if (layers.junctions && view.scale > 0.015) {
		for (const j of junctions) {
			const x = w2sx(j.pos[0]), z = w2sz(j.pos[1]);
			if (x < -10 || x > cv._w + 10 || z < -10 || z > cv._h + 10) continue;
			const g = j.grade || "flat";
			if (g === "separated_pending") { ctx.fillStyle = "#c0392b"; }
			else if (g === "deck") { ctx.fillStyle = "#e8e0cf"; }
			else { ctx.fillStyle = "#f0b429"; }
			ctx.fillRect(x - 2, z - 2, 4, 4);
		}
	}
	// exits
	if (layers.exits)
		for (const e of exits) drawExit(e, sel?.type === "exit" && sel.id === e.id);
	// towns
	if (layers.towns) {
		for (const t of towns) {
			const x = w2sx(t.pos[0]), z = w2sz(t.pos[1]);
			if (x < -60 || x > cv._w + 60 || z < -20 || z > cv._h + 20) continue;
			const selMe = sel?.type === "town" && sel.id === t.id;
			ctx.fillStyle = selMe ? "#ffcf3f" : t.kind === "city" ? "#f0b429" : "#c9995c";
			ctx.beginPath(); ctx.arc(x, z, t.kind === "city" ? 4.5 : 3, 0, 7); ctx.fill();
			if (view.scale > 0.008) {
				ctx.fillStyle = "#e8e0cf";
				ctx.font = `${Math.min(13, Math.max(9, 11 * Math.sqrt(view.scale / 0.02)))}px ui-monospace, monospace`;
				ctx.fillText(t.name, x + 6, z + 3);
			}
		}
	}
	// placements — real footprint rectangles once you're close (v4.1); the
	// catalog's footprint_m + the row's rot make placement TRUE, not symbolic
	if (layers.placements && view.scale > 0.04) {
		for (const p of placements) {
			const x = w2sx(p.pos[0]), z = w2sz(p.pos[1]);
			if (x < -40 || x > cv._w + 40 || z < -40 || z > cv._h + 40) continue;
			const selMe = sel?.type === "placement" && sel.id === p.id;
			const fp = footprintById[p.building];
			if (fp && view.scale > 0.25) {
				ctx.save();
				ctx.translate(x, z);
				ctx.rotate(-(p.rot || 0)); // Godot Y-rotation is CCW; canvas y is down
				const wpx = fp[0] * view.scale, dpx = fp[1] * view.scale;
				ctx.fillStyle = selMe ? "rgba(255,207,63,.5)" : "rgba(55,178,160,.35)";
				ctx.strokeStyle = selMe ? "#ffcf3f" : "#37b2a0"; ctx.lineWidth = 1;
				ctx.fillRect(-wpx / 2, -dpx / 2, wpx, dpx);
				ctx.strokeRect(-wpx / 2, -dpx / 2, wpx, dpx);
				// the door edge (front = -z in placement space) reads as a notch
				ctx.fillStyle = selMe ? "#ffcf3f" : "#bfeee6";
				ctx.fillRect(-wpx * 0.12, -dpx / 2 - 1.5, wpx * 0.24, 3);
				ctx.restore();
				ctx.fillStyle = "#bfeee6"; ctx.font = "9px ui-monospace";
				ctx.fillText(p.building, x + wpx / 2 + 3, z + 3);
			} else {
				const s = Math.max(3, Math.min(10, 12 * view.scale * 4));
				ctx.fillStyle = selMe ? "#ffcf3f" : "#37b2a0"; ctx.strokeStyle = "#0a2b27"; ctx.lineWidth = 1;
				ctx.fillRect(x - s / 2, z - s / 2, s, s); ctx.strokeRect(x - s / 2, z - s / 2, s, s);
				if (view.scale > 0.3) { ctx.fillStyle = "#bfeee6"; ctx.font = "9px ui-monospace"; ctx.fillText(p.building, x + s, z + 3); }
			}
		}
	}
	// plan notes
	if (layers.notes)
		for (const n of notes) drawNote(n, sel?.type === "note" && sel.id === n.id);
	// measure overlay
	drawMeasure();
	// minimap viewport rect
	drawMini();
	const mx = (v) => ((v - meta.world_offset[0]) / (meta.w * cm)) * mini.width;
	const mz = (v) => ((v - meta.world_offset[1]) / (meta.h * cm)) * mini.height;
	mctx.strokeStyle = "#f0b429"; mctx.lineWidth = 1;
	mctx.strokeRect(mx(s2wx(0)), mz(s2wz(0)), mx(s2wx(cv._w)) - mx(s2wx(0)), mz(s2wz(cv._h)) - mz(s2wz(0)));
}
function drawExit(e, selMe) {
	const x = w2sx(e.pos[0]), z = w2sz(e.pos[1]);
	if (x < -80 || x > cv._w + 80 || z < -40 || z > cv._h + 40) return;
	const qx = w2sx(e.dest[0]), qz = w2sz(e.dest[1]);
	ctx.strokeStyle = "rgba(240,180,41,.4)"; ctx.lineWidth = 1;
	ctx.beginPath(); ctx.moveTo(x, z); ctx.lineTo(qx, qz); ctx.stroke();
	const dr = selMe ? 7 : Math.max(4, Math.min(7, 60 * view.scale));
	ctx.fillStyle = selMe ? "#ffcf3f" : "#f0b429"; ctx.strokeStyle = "#14110c"; ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x, z - dr); ctx.lineTo(x + dr, z); ctx.lineTo(x, z + dr); ctx.lineTo(x - dr, z);
	ctx.closePath(); ctx.fill(); ctx.stroke();
	if (view.scale > 0.012) {
		// the milepost badge — the same number the in-game sign speaks
		const label = `EXIT ${e.exit_number}`;
		ctx.font = "bold 10px ui-monospace, monospace";
		const w = ctx.measureText(label).width + 8;
		ctx.fillStyle = "#1f3a1f"; ctx.strokeStyle = "#e8e0cf"; ctx.lineWidth = 1;
		ctx.fillRect(x + dr + 3, z - 8, w, 14); ctx.strokeRect(x + dr + 3, z - 8, w, 14);
		ctx.fillStyle = "#e8e0cf"; ctx.fillText(label, x + dr + 7, z + 3);
		if (view.scale > 0.03) {
			ctx.fillStyle = "#f0b429"; ctx.font = "10px ui-monospace, monospace";
			ctx.fillText(e.name, x + dr + w + 8, z + 3);
		}
	}
}
function drawNote(n, selMe) {
	const x = w2sx(n.pos[0]), z = w2sz(n.pos[1]);
	if (x < -40 || x > cv._w + 40 || z < -40 || z > cv._h + 40) return;
	const c = NOTE_COLOR[n.status] || "#f0b429";
	ctx.strokeStyle = c; ctx.lineWidth = selMe ? 2.5 : 1.5;
	ctx.beginPath(); ctx.moveTo(x, z); ctx.lineTo(x, z - 12); ctx.stroke();
	ctx.fillStyle = c; ctx.strokeStyle = "#14110c";
	ctx.beginPath(); ctx.arc(x, z - 15, selMe ? 6 : 4.5, 0, 7); ctx.fill(); ctx.stroke();
	if (n.status === "done") {
		ctx.strokeStyle = "#14110c"; ctx.lineWidth = 1.5;
		ctx.beginPath(); ctx.moveTo(x - 2, z - 15); ctx.lineTo(x - 0.5, z - 13); ctx.lineTo(x + 2.5, z - 17.5); ctx.stroke();
	}
	if (view.scale > 0.05 || selMe) {
		ctx.fillStyle = c; ctx.font = "10px ui-monospace, monospace";
		const t = n.text.length > 26 ? n.text.slice(0, 24) + "…" : n.text;
		ctx.fillText(t, x + 8, z - 12);
	}
}
function drawDistrict(d, selMe) {
	if (!(d.poly || []).length) return;
	ctx.beginPath();
	d.poly.forEach((p, i) => { const x = w2sx(p[0]), z = w2sz(p[1]); i ? ctx.lineTo(x, z) : ctx.moveTo(x, z); });
	ctx.closePath();
	ctx.fillStyle = DISTRICT_FILL[d.kind] || DISTRICT_FILL.custom;
	ctx.fill();
	ctx.strokeStyle = selMe ? "#ffcf3f" : DISTRICT_EDGE[d.kind] || DISTRICT_EDGE.custom;
	ctx.lineWidth = selMe ? 2 : 1;
	ctx.setLineDash(selMe ? [] : [4, 3]);
	ctx.stroke(); ctx.setLineDash([]);
	if (view.scale > 0.02) {
		const cx = d.poly.reduce((s, p) => s + p[0], 0) / d.poly.length;
		const cz = d.poly.reduce((s, p) => s + p[1], 0) / d.poly.length;
		ctx.fillStyle = DISTRICT_EDGE[d.kind] || "#9a8f78";
		ctx.font = "bold 11px ui-monospace, monospace";
		ctx.textAlign = "center";
		ctx.fillText(d.name, w2sx(cx), w2sz(cz));
		ctx.textAlign = "left";
	}
}
function drawDistrictDraft() {
	ctx.strokeStyle = "#f0b429"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
	ctx.beginPath();
	districtDraft.forEach((p, i) => { const x = w2sx(p[0]), z = w2sz(p[1]); i ? ctx.lineTo(x, z) : ctx.moveTo(x, z); });
	if (hoverWorld) ctx.lineTo(w2sx(hoverWorld[0]), w2sz(hoverWorld[1]));
	ctx.stroke(); ctx.setLineDash([]);
	for (const p of districtDraft) {
		ctx.fillStyle = "#f0b429";
		ctx.fillRect(w2sx(p[0]) - 2.5, w2sz(p[1]) - 2.5, 5, 5);
	}
}
function drawMeasure() {
	if (!measure.a && !measure.b) return;
	const flag = (p, label, color) => {
		const x = w2sx(p[0]), z = w2sz(p[1]);
		ctx.strokeStyle = color; ctx.lineWidth = 2;
		ctx.beginPath(); ctx.moveTo(x, z); ctx.lineTo(x, z - 16); ctx.stroke();
		ctx.fillStyle = color;
		ctx.beginPath(); ctx.moveTo(x, z - 16); ctx.lineTo(x + 11, z - 12); ctx.lineTo(x, z - 8); ctx.closePath(); ctx.fill();
		ctx.font = "bold 11px ui-monospace"; ctx.fillStyle = "#14110c"; ctx.fillText(label, x + 2, z - 11);
	};
	if (measure.result?.polyline?.length) {
		ctx.strokeStyle = "#ff5a3b"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
		ctx.setLineDash([9, 5]);
		tracePoly(measure.result.polyline); ctx.stroke();
		ctx.setLineDash([]);
	} else if (measure.a && measure.b) {
		ctx.strokeStyle = "rgba(255,90,59,.6)"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
		ctx.beginPath(); ctx.moveTo(w2sx(measure.a[0]), w2sz(measure.a[1])); ctx.lineTo(w2sx(measure.b[0]), w2sz(measure.b[1])); ctx.stroke();
		ctx.setLineDash([]);
	}
	if (measure.a) flag(measure.a, "A", "#7fae4c");
	if (measure.b) flag(measure.b, "B", "#ff5a3b");
}

// ---------- hit testing ----------
function distToSeg(p, a, b) {
	const abx = b[0] - a[0], abz = b[1] - a[1];
	const l2 = abx * abx + abz * abz || 1e-4;
	const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2));
	return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
}
function vertexRoad() {
	if (sel?.type === "road") return roads.find((r) => r.id === sel.id) || null;
	return null;
}
function nearestEnd(road, p) {
	const d0 = Math.hypot(road.pts[0][0] - p[0], road.pts[0][1] - p[1]);
	const d1 = Math.hypot(road.pts[road.pts.length - 1][0] - p[0], road.pts[road.pts.length - 1][1] - p[1]);
	return d0 < d1 ? { end: "start", pt: road.pts[0] } : { end: "end", pt: road.pts[road.pts.length - 1] };
}
function hitVertex(w, road) {
	if (!road) return -1;
	const tol = 8 / view.scale;
	for (let i = 0; i < road.pts.length; i++)
		if (Math.hypot(road.pts[i][0] - w[0], road.pts[i][1] - w[1]) < tol) return i;
	return -1;
}
function pointInPoly(p, poly) {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
		if (((zi > p[1]) !== (zj > p[1])) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
	}
	return inside;
}
function hitTest(w) {
	const tolPx = 8;
	// notes first (small, on top)
	for (const n of notes) {
		const dx = (w[0] - n.pos[0]) * view.scale, dz = (w[1] - n.pos[1]) * view.scale;
		if (Math.hypot(dx, dz + 15) < tolPx) return { type: "note", id: n.id };
	}
	for (const e of exits) {
		const d = Math.hypot(w[0] - e.pos[0], w[1] - e.pos[1]) * view.scale;
		if (d < tolPx + 2) return { type: "exit", id: e.id };
	}
	for (const t of towns) {
		const d = Math.hypot(w[0] - t.pos[0], w[1] - t.pos[1]) * view.scale;
		if (d < tolPx) return { type: "town", id: t.id };
	}
	if (view.scale > 0.04)
		for (const p of placements) {
			const d = Math.hypot(w[0] - p.pos[0], w[1] - p.pos[1]) * view.scale;
			if (d < tolPx) return { type: "placement", id: p.id };
		}
	// roads: nearest within tolerance, prefer visible + selected kind priority
	let bestRoad = null, bestD = Infinity;
	for (const r of roads) {
		if (r.pts.length < 2 || !roadVisible(r)) continue;
		for (let i = 0; i + 1 < r.pts.length; i++) {
			const d = distToSeg(w, r.pts[i], r.pts[i + 1]) * view.scale;
			if (d < bestD) { bestD = d; bestRoad = r; }
		}
	}
	if (bestRoad && bestD < tolPx) return { type: "road", id: bestRoad.id };
	if (layers.districts)
		for (const d of districts) if (pointInPoly(w, d.poly || [])) return { type: "district", id: d.id };
	return null;
}

// ---------- bake ----------
let bakeTimer = null;
function scheduleBake() {
	clearTimeout(bakeTimer);
	document.getElementById("bakestat").textContent = "bake queued…";
	bakeTimer = setTimeout(runBake, 2000);
}
async function runBake() {
	clearTimeout(bakeTimer);
	const el = document.getElementById("bakestat");
	el.textContent = "BAKING…";
	try {
		const r = await api("/api/junctions/bake", { method: "POST", body: "{}" });
		el.textContent = `baked ${r.junctions} junctions ✓`;
		junctions = await api("/api/junctions");
		refreshHealth();
		setTimeout(() => { if (el.textContent.startsWith("baked")) el.textContent = ""; }, 4000);
	} catch (e) { el.textContent = "bake failed: " + e.message; }
	requestDraw();
}

// ---------- inspector ----------
function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
function renderInspector() {
	const el = document.getElementById("inspector");
	if (!sel) { el.innerHTML = `<div class="hint">Click anything on the map with SELECT.</div>`; return; }
	const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>`;
	if (sel.type === "road") {
		const r = roads.find((x) => x.id === sel.id);
		if (!r) { sel = null; return renderInspector(); }
		let len = 0;
		for (let i = 0; i + 1 < r.pts.length; i++) len += Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]);
		el.innerHTML = `<div class="title">🛣 ${esc(r.id)}</div>` +
			kv("kind", r.kind || "interstate") + kv("length", (len / 1000).toFixed(1) + " km") +
			kv("points", r.pts.length) + kv("lanes", r.lanes ?? "—") + kv("divided", r.divided ? "yes" : "no") +
			kv("surface", r.surface || "asphalt") + (r.nickname ? kv("nickname", r.nickname) : "") +
			kv("danger", r.danger ?? 0) + (r.toll ? kv("toll", JSON.stringify(r.toll)) : "") +
			`<div class="form">
				<label>nickname<input type="text" id="i-nickname" value="${esc(r.nickname || "")}"></label>
				<div class="pair">
					<label>danger<input type="number" id="i-danger" min="0" max="5" value="${r.danger ?? 0}"></label>
					<label>lanes<input type="number" id="i-lanes" min="1" max="8" value="${r.lanes ?? 2}"></label>
				</div>
				<label>surface<select id="i-surface">${["asphalt", "gravel", "dirt", "concrete"].map((s) =>
					`<option value="${s}"${(r.surface || "asphalt") === s ? " selected" : ""}>${s}</option>`).join("")}</select></label>
			</div>
			<div class="actions">
				<button id="i-apply">APPLY</button>
				<button id="i-delroad" class="danger">DELETE ROAD</button>
			</div>
			<div class="hint">Drag the square handles on the map to reshape. Green = start, red = end.
			Surface repaints the whole road — grip/handling follow it in-game (the handling-character law).</div>`;
		document.getElementById("i-apply").onclick = async () => {
			const prevRow = { ...r };
			const body = { id: r.id, pts: r.pts, nickname: document.getElementById("i-nickname").value, danger: Number(document.getElementById("i-danger").value), lanes: Number(document.getElementById("i-lanes").value), surface: document.getElementById("i-surface").value };
			await api("/api/roads", { method: "POST", body: JSON.stringify(body) });
			pushUndo(`edit ${r.id}`, async () => api("/api/roads", { method: "POST", body: JSON.stringify(prevRow) }),
				async () => api("/api/roads", { method: "POST", body: JSON.stringify(body) }));
			await refresh(); savedFlash(`${r.id} updated`);
		};
		document.getElementById("i-delroad").onclick = async () => {
			if (!confirm(`Delete ${r.id}?`)) return;
			const prevRow = { ...r };
			await api(`/api/roads?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
			pushUndo(`delete ${r.id}`, async () => api("/api/roads", { method: "POST", body: JSON.stringify(prevRow) }),
				async () => api(`/api/roads?id=${encodeURIComponent(r.id)}`, { method: "DELETE" }));
			sel = null; await refresh(); scheduleBake(); savedFlash(`${r.id} deleted`);
		};
	} else if (sel.type === "exit") {
		const e = exits.find((x) => x.id === sel.id);
		if (!e) { sel = null; return renderInspector(); }
		el.innerHTML = `<div class="title">◆ ${esc(e.id)} — EXIT ${e.exit_number}</div>` +
			kv("name", e.name) + kv("highway", e.highway_id) + kv("archetype", e.archetype) +
			kv("tier", e.community_tier) + kv("risk", e.risk_rating) +
			kv("services", (e.service_tags || []).join(", ") || "—") +
			kv("return ramp", e.has_return_ramp ? "yes" : "no") +
			(e.town_id ? kv("town", e.town_id) : "") +
			`<div class="actions"><button id="i-delexit" class="danger">DELETE EXIT + RAMPS</button></div>
			<div class="hint">Drag the diamond to slide this exit along its highway — it renumbers by milepost (the address law).</div>`;
		document.getElementById("i-delexit").onclick = async () => {
			if (!confirm(`Delete ${e.id} (${e.name}) and its ramps?`)) return;
			const prev = { ...e };
			await api(`/api/exits?id=${encodeURIComponent(e.id)}`, { method: "DELETE" });
			pushUndo(`delete exit ${e.id}`,
				async () => api("/api/exits", { method: "POST", body: JSON.stringify({ id: prev.id, dest: prev.dest, name: prev.name, archetype: prev.archetype, community_tier: prev.community_tier, has_return_ramp: prev.has_return_ramp, exit_number: prev.exit_number, highway_id: prev.highway_id }) }),
				async () => api(`/api/exits?id=${encodeURIComponent(prev.id)}`, { method: "DELETE" }));
			sel = null; await refresh(); scheduleBake(); savedFlash(`${e.id} gone (ramps too)`);
		};
	} else if (sel.type === "town") {
		const t = towns.find((x) => x.id === sel.id);
		if (!t) { sel = null; return renderInspector(); }
		el.innerHTML = `<div class="title">● ${esc(t.name)}</div>` +
			kv("id", t.id) + kv("kind", t.kind || "holdout") + kv("pos", `${Math.round(t.pos[0])}, ${Math.round(t.pos[1])}`) +
			(t.authored ? kv("authored", "yes") : "") +
			`<div class="actions"><button id="i-deltown" class="danger">DELETE TOWN</button></div>`;
		document.getElementById("i-deltown").onclick = async () => {
			if (!confirm(`Delete town ${t.name}?`)) return;
			const prev = { ...t };
			await api(`/api/towns?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
			pushUndo(`delete town ${t.id}`, async () => api("/api/towns", { method: "POST", body: JSON.stringify(prev) }),
				async () => api(`/api/towns?id=${encodeURIComponent(prev.id)}`, { method: "DELETE" }));
			sel = null; await refresh(); savedFlash(`${t.name} removed`);
		};
	} else if (sel.type === "placement") {
		const p = placements.find((x) => x.id === sel.id);
		if (!p) { sel = null; return renderInspector(); }
		el.innerHTML = `<div class="title">▪ ${esc(p.id)}</div>` +
			kv("building", p.building) + kv("pos", `${Math.round(p.pos[0])}, ${Math.round(p.pos[1])}`) + kv("rot", p.rot ?? 0) +
			`<div class="actions"><button id="i-delplace" class="danger">DELETE</button></div>`;
		document.getElementById("i-delplace").onclick = async () => {
			const prev = { ...p };
			await api(`/api/placements?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
			pushUndo(`delete ${p.id}`, async () => api("/api/placements", { method: "POST", body: JSON.stringify(prev) }),
				async () => api(`/api/placements?id=${encodeURIComponent(prev.id)}`, { method: "DELETE" }));
			sel = null; await refresh(); savedFlash(`${p.id} removed`);
		};
	} else if (sel.type === "district") {
		const d = districts.find((x) => x.id === sel.id);
		if (!d) { sel = null; return renderInspector(); }
		const area = Math.abs(d.poly.reduce((s, p, i) => { const q = d.poly[(i + 1) % d.poly.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2);
		el.innerHTML = `<div class="title">▨ ${esc(d.name)}</div>` +
			kv("id", d.id) + kv("kind", d.kind) + kv("corners", d.poly.length) + kv("area", (area / 1e6).toFixed(2) + " km²") +
			`<div class="actions"><button id="i-deldist" class="danger">DELETE DISTRICT</button></div>`;
		document.getElementById("i-deldist").onclick = async () => {
			if (!confirm(`Delete district ${d.name}?`)) return;
			const prev = { ...d };
			await api(`/api/districts?id=${encodeURIComponent(d.id)}`, { method: "DELETE" });
			pushUndo(`delete district ${d.id}`, async () => api("/api/districts", { method: "POST", body: JSON.stringify(prev) }),
				async () => api(`/api/districts?id=${encodeURIComponent(prev.id)}`, { method: "DELETE" }));
			sel = null; await refresh(); savedFlash(`${d.name} removed`);
		};
	} else if (sel.type === "state") {
		const st = regions.find((s) => s.ch === sel.id);
		if (!st) { sel = null; return renderInspector(); }
		const totalCells = Math.max(1, st.cells);
		const biomeMix = Object.entries(st.biomes).sort((a, b) => b[1] - a[1]).slice(0, 4)
			.map(([b, n]) => `${b} ${Math.round((n / totalCells) * 100)}%`).join(" · ");
		// wildlife = creatures whose biomes exist in this state, ranked by coverage
		const wl = (ecology?.creatures || []).map((c) => {
			const cov = c.biomes.reduce((s, b) => s + (st.biomes[b] || 0), 0);
			return { c, cov };
		}).filter((x) => x.cov > 0).sort((a, b) => b.cov - a.cov);
		el.innerHTML = `<div class="title">🗺 ${esc(st.name)}</div>` +
			(st.ruler ? kv("ruler", `${st.ruler.ruler} (${st.ruler.title})`) + kv("attitude ×", st.ruler.attitude) : "") +
			(st.bandit_strength !== null ? kv("bandit strength", st.bandit_strength + "/5") : "") +
			kv("area", `${st.cells} cells · ${Math.round(st.cells * 0.25)} km²`) +
			kv("towns", st.towns.length) + kv("exits", st.exits.length) +
			(st.districts.length ? kv("districts", st.districts.map((d) => d.name).join(", ")) : "") +
			`<div class="hint" style="margin-top:4px">${esc(biomeMix)}</div>` +
			`<div class="hint" style="margin-top:4px">🐾 ${wl.length ? wl.map((x) => esc(x.c.name)).join(" · ") : "no creature rows live here yet"}</div>` +
			(st.towns.length ? `<div class="listbox" style="margin-top:6px;max-height:110px">` +
				st.towns.slice(0, 12).map((t) => `<div class="listrow" data-jump="${t.pos[0]},${t.pos[1]}"><span>${esc(t.name)} · ${esc(t.kind || "")}</span></div>`).join("") + `</div>` : "") +
			`<div class="actions"><button id="i-zoomstate">ZOOM TO STATE</button></div>`;
		document.getElementById("i-zoomstate").onclick = () => {
			const [x0, z0, x1, z1] = st.bbox;
			view.cx = (x0 + x1) / 2; view.cz = (z0 + z1) / 2;
			view.scale = Math.min(cv._w / (x1 - x0), cv._h / (z1 - z0)) * 0.9;
			requestDraw();
		};
		el.querySelectorAll("[data-jump]").forEach((row) => row.onclick = () => {
			const [jx, jz] = row.dataset.jump.split(",").map(Number);
			view.cx = jx; view.cz = jz; view.scale = Math.max(view.scale, 0.3);
			requestDraw();
		});
	} else if (sel.type === "note") {
		const n = notes.find((x) => x.id === sel.id);
		if (!n) { sel = null; return renderInspector(); }
		el.innerHTML = `<div class="title">📌 ${esc(n.id)}</div>` +
			kv("status", n.status) + (n.author ? kv("author", n.author) : "") + (n.created ? kv("created", n.created) : "") +
			`<div style="margin-top:6px;font-size:11px;color:var(--bone)">${esc(n.text)}</div>
			<div class="actions">
				<button id="i-editnote">EDIT</button>
				<button id="i-cyclenote">→ ${n.status === "open" ? "doing" : n.status === "doing" ? "done" : "open"}</button>
			</div>`;
		document.getElementById("i-editnote").onclick = () => openNoteDlg(n);
		document.getElementById("i-cyclenote").onclick = async () => {
			const next = n.status === "open" ? "doing" : n.status === "doing" ? "done" : "open";
			await api("/api/plan", { method: "POST", body: JSON.stringify({ id: n.id, status: next }) });
			await refresh(); savedFlash(`${n.id} → ${next}`);
		};
	}
}

// ---------- measure ----------
async function runMeasure() {
	if (!measure.a || !measure.b || measure.busy) return;
	measure.busy = true;
	const box = document.getElementById("measurebox");
	box.style.display = "block";
	box.innerHTML = `<h3>MEASURE</h3><div class="dim">routing…</div>`;
	const vid = document.getElementById("vehiclesel").value;
	try {
		const r = await api(`/api/route?ax=${measure.a[0]}&az=${measure.a[1]}&bx=${measure.b[0]}&bz=${measure.b[1]}&vehicle=${encodeURIComponent(vid)}`);
		measure.result = r;
		if (!r.found) {
			box.innerHTML = `<h3>MEASURE</h3><div class="big">${(r.straight_m / 1000).toFixed(1)} km straight</div><div class="dim">no road route found (${esc(r.error || "")})</div>`;
		} else {
			const veh = vehicles.find((v) => v.id === vid);
			box.innerHTML = `<h3>MEASURE — A → B</h3>
				<div class="big">${(r.len_m / 1000).toFixed(1)} km <span class="dim">by road (${(r.straight_m / 1000).toFixed(1)} straight)</span></div>
				<div style="margin-top:4px"><b>${esc(veh?.name || "law")}</b>: ${esc(r.time_real)} at the wheel → <b>${esc(r.time_game)}</b> on the game clock</div>
				<div class="dim">GPS law time: ${esc(r.time_law_real)} → ${esc(r.time_law_game)} game</div>
				${r.reached === false ? `<div class="dim" style="color:var(--blood)">⚠ destination is off the connected net — route reaches within ${r.reached_within_m} m (see ORPHANS layer)</div>` : ""}
				${r.snap_b_m > 400 ? `<div class="dim">B snapped ${r.snap_b_m} m to the nearest road</div>` : ""}
				<div class="route-roads">${esc(r.text)}</div>
				<div class="dim" style="margin-top:4px">click a new A to measure again · ESC clears</div>`;
		}
	} catch (e) {
		box.innerHTML = `<h3>MEASURE</h3><div class="dim">route failed: ${esc(e.message)}</div>`;
	}
	measure.busy = false;
	requestDraw();
}
function clearMeasure() {
	measure = { a: null, b: null, result: null, busy: false };
	document.getElementById("measurebox").style.display = "none";
	requestDraw();
}

// ---------- tools: pointer handling ----------
function evWorld(ev) {
	const r = cv.getBoundingClientRect();
	return [s2wx(ev.clientX - r.left), s2wz(ev.clientY - r.top)];
}
function evScreen(ev) {
	const r = cv.getBoundingClientRect();
	return [ev.clientX - r.left, ev.clientY - r.top];
}
cv.addEventListener("contextmenu", (ev) => ev.preventDefault());
cv.addEventListener("wheel", (ev) => {
	ev.preventDefault();
	// ELEV tool with an armed vertex: the wheel RAISES/LOWERS instead of zooming
	if (tool === "elev" && elevSel && nudgeElev(ev.deltaY < 0 ? 1 : -1)) return;
	const [sx, sz] = evScreen(ev);
	setZoom(ev.deltaY < 0 ? 1.25 : 0.8, sx, sz);
}, { passive: false });

cv.addEventListener("mousedown", async (ev) => {
	const w = evWorld(ev);
	const [sx, sz] = evScreen(ev);
	// pan: middle button, or space+left, or right-drag (right-click w/o move = context action)
	if (ev.button === 1 || (ev.button === 0 && spaceDown) || ev.button === 2) {
		drag = { kind: "pan", sx, sz, cx: view.cx, cz: view.cz, button: ev.button, moved: false, w };
		return;
	}
	if (ev.button !== 0) return;

	if (tool === "select") {
		// vertex drag on the selected road?
		const vr = vertexRoad();
		const vi = vr ? hitVertex(w, vr) : -1;
		if (vi >= 0) {
			drag = { kind: "vertex", road: vr, i: vi, prevPts: vr.pts.map((p) => [...p]) };
			return;
		}
		const hit = hitTest(w);
		if (hit?.type === "exit") {
			const e = exits.find((x) => x.id === hit.id);
			sel = hit; renderInspector(); requestDraw();
			drag = { kind: "exit", exit: e, start: w, prevDest: [...e.dest], moved: false };
			return;
		}
		if (hit?.type === "note") {
			const n = notes.find((x) => x.id === hit.id);
			sel = hit; renderInspector(); requestDraw();
			drag = { kind: "note", note: n, start: w, prevPos: [...n.pos], moved: false };
			return;
		}
		if (hit?.type === "placement") {
			const p = placements.find((x) => x.id === hit.id);
			sel = hit; renderInspector(); requestDraw();
			drag = { kind: "placement", p, start: w, prevPos: [...p.pos], moved: false };
			return;
		}
		if (hit?.type === "town") {
			const t = towns.find((x) => x.id === hit.id);
			sel = hit; renderInspector(); requestDraw();
			drag = { kind: "town", t, start: w, prevPos: [...t.pos], moved: false };
			return;
		}
		// empty land → select the STATE under the cursor (v4.1 region select)
		if (!hit) {
			const cx = Math.floor((w[0] - meta.world_offset[0]) / meta.cell_m);
			const cz = Math.floor((w[1] - meta.world_offset[1]) / meta.cell_m);
			const ch = states[cz]?.[cx];
			hit = ch && ch !== "." ? { type: "state", id: ch } : null;
		}
		sel = hit; renderInspector(); requestDraw();
		if (!hit || hit.type === "state") footerInfoAt(w);
	} else if (tool === "road") {
		const r = vertexRoad();
		if (!r) { savedFlash("select a road first (or NEW ROAD)"); return; }
		const vi = hitVertex(w, r);
		if (vi >= 0) { drag = { kind: "vertex", road: r, i: vi, prevPts: r.pts.map((p) => [...p]) }; return; }
		// append at nearest end
		const prevPts = r.pts.map((p) => [...p]);
		const end = nearestEnd(r, w);
		if (end.end === "start") r.pts.unshift([Math.round(w[0]), Math.round(w[1])]);
		else r.pts.push([Math.round(w[0]), Math.round(w[1])]);
		await postRoad(r, prevPts, `extend ${r.id}`);
		roadStatus();
	} else if (tool === "elev") {
		// ELEVATION (Racing Destruction Set): click a vertex of the selected road
		// to arm it, then WHEEL or +/- nudge its height (postRoad is field-
		// preserving, so surface/side/geom survive; `elev` rides the same law).
		const r = vertexRoad();
		if (!r) { savedFlash("select a road first (SELECT), then click its vertices"); return; }
		const vi = hitVertex(w, r);
		if (vi < 0) { savedFlash("click ON a vertex handle to set its height"); return; }
		elevSel = { id: r.id, i: vi };
		roadStatus(); requestDraw();
	} else if (tool === "exit") {
		pendingExit = w;
		openExitDlg(ev);
	} else if (tool === "measure") {
		if (!measure.a || (measure.a && measure.b)) { measure = { a: w, b: null, result: null, busy: false }; document.getElementById("measurebox").style.display = "none"; }
		else { measure.b = w; runMeasure(); }
		requestDraw();
	} else if (tool === "district") {
		districtDraft.push([Math.round(w[0]), Math.round(w[1])]);
		requestDraw();
	} else if (tool === "note") {
		pendingNotePos = w;
		openNoteDlg(null, ev);
	} else if (tool === "paint") {
		painting = true; paintStroke = []; paintPrev = [];
		paintAtWorld(w);
	} else if (tool === "town") {
		const name = prompt("Town name (empty = cancel):");
		if (!name) return;
		const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
		const t = { id, name: name.toUpperCase(), pos: [Math.round(w[0]), Math.round(w[1])], kind: "holdout" };
		await api("/api/towns", { method: "POST", body: JSON.stringify(t) });
		pushUndo(`found ${t.name}`, async () => api(`/api/towns?id=${id}`, { method: "DELETE" }),
			async () => api("/api/towns", { method: "POST", body: JSON.stringify(t) }));
		await refresh(); savedFlash(`${t.name} founded`);
	} else if (tool === "place") {
		const building = document.getElementById("buildingsel").value;
		const r = await api("/api/placements", { method: "POST", body: JSON.stringify({ building, pos: [Math.round(w[0]), Math.round(w[1])] }) });
		pushUndo(`place ${building}`, async () => api(`/api/placements?id=${encodeURIComponent(r.id)}`, { method: "DELETE" }),
			async () => api("/api/placements", { method: "POST", body: JSON.stringify({ id: r.id, building, pos: [Math.round(w[0]), Math.round(w[1])] }) }));
		await refresh(); savedFlash(`${building} pinned`);
	}
});

addEventListener("mousemove", (ev) => {
	const overCv = ev.target === cv;
	if (overCv && meta) {
		hoverWorld = evWorld(ev);
		const [cx, czi] = [Math.floor((hoverWorld[0] - meta.world_offset[0]) / meta.cell_m), Math.floor((hoverWorld[1] - meta.world_offset[1]) / meta.cell_m)];
		const biomeName = rows[czi]?.[cx] ? meta.legend[rows[czi][cx]] : "?";
		document.getElementById("pos").innerHTML =
			`world <b>${Math.round(hoverWorld[0])}, ${Math.round(hoverWorld[1])}</b> m · cell <b>${cx},${czi}</b> · <b>${biomeName ?? "?"}</b>` +
			(layers.states && states[czi]?.[cx] && states[czi][cx] !== "." ? ` · ${meta.state_legend[states[czi][cx]]}` : "") +
			(layers.ecology && ecology && biomeName ? ` · 🐾 ${(ecology.by_biome[biomeName] || []).join(", ") || "nothing"}` : "");
		if (tool === "road" || (tool === "district" && districtDraft.length) || tool === "paint") requestDraw();
	}
	if (!drag) return;
	if (drag.kind === "pan") {
		const [sx, sz] = evScreen(ev);
		if (Math.hypot(sx - drag.sx, sz - drag.sz) > 4) drag.moved = true;
		view.cx = drag.cx - (sx - drag.sx) / view.scale;
		view.cz = drag.cz - (sz - drag.sz) / view.scale;
		requestDraw();
	} else if (drag.kind === "vertex") {
		const w = evWorld(ev);
		drag.road.pts[drag.i] = [Math.round(w[0]), Math.round(w[1])];
		requestDraw();
	} else if (drag.kind === "exit") {
		const w = evWorld(ev);
		if (Math.hypot(w[0] - drag.start[0], w[1] - drag.start[1]) > 2) drag.moved = true;
		drag.exit.dest = [drag.prevDest[0] + (w[0] - drag.start[0]), drag.prevDest[1] + (w[1] - drag.start[1])];
		// live preview: anchor follows the highway
		const hw = roads.find((r) => r.id === drag.exit.highway_id);
		if (hw) {
			let best = null, bd = Infinity;
			for (let i = 0; i + 1 < hw.pts.length; i++) {
				const a = hw.pts[i], b = hw.pts[i + 1];
				const abx = b[0] - a[0], abz = b[1] - a[1];
				const l2 = abx * abx + abz * abz || 1e-4;
				const t = Math.max(0, Math.min(1, ((drag.exit.dest[0] - a[0]) * abx + (drag.exit.dest[1] - a[1]) * abz) / l2));
				const qp = [a[0] + abx * t, a[1] + abz * t];
				const d = Math.hypot(drag.exit.dest[0] - qp[0], drag.exit.dest[1] - qp[1]);
				if (d < bd) { bd = d; best = qp; }
			}
			if (best) drag.exit.pos = best;
		}
		requestDraw();
	} else if (drag.kind === "note" || drag.kind === "placement" || drag.kind === "town") {
		const w = evWorld(ev);
		if (Math.hypot(w[0] - drag.start[0], w[1] - drag.start[1]) > 2) drag.moved = true;
		const obj = drag.note || drag.p || drag.t;
		obj.pos = [Math.round(drag.prevPos[0] + w[0] - drag.start[0]), Math.round(drag.prevPos[1] + w[1] - drag.start[1])];
		requestDraw();
	} else if (drag.kind === "paintmove") { /* handled below */ }
	if (painting && overCv) paintAtWorld(evWorld(ev));
});

addEventListener("mouseup", async (ev) => {
	if (painting) {
		painting = false;
		if (paintStroke.length) {
			const cells = paintStroke.slice(), prev = paintPrev.slice(), b = biome;
			await api("/api/paint", { method: "POST", body: JSON.stringify({ biome: b, cells }) });
			pushUndo(`paint ${cells.length} cells`, async () => {
				// restore each previous char (group by char for fewer calls)
				const byCh = {};
				prev.forEach(([x, z, ch]) => (byCh[ch] = byCh[ch] || []).push([x, z]));
				for (const [ch, cs] of Object.entries(byCh))
					await api("/api/paint", { method: "POST", body: JSON.stringify({ biome: meta.legend[ch], cells: cs }) });
				rows = (await api("/api/grid?layer=biomes")).rows; buildBmp();
			}, async () => {
				await api("/api/paint", { method: "POST", body: JSON.stringify({ biome: b, cells }) });
				rows = (await api("/api/grid?layer=biomes")).rows; buildBmp();
			});
			savedFlash(`${paintStroke.length} cells → disk`);
		}
	}
	if (!drag) return;
	const d = drag; drag = null;
	if (d.kind === "pan") {
		// right-click without movement = context action (delete vertex in road tool)
		if (d.button === 2 && !d.moved && tool === "road") {
			const r = vertexRoad();
			const vi = r ? hitVertex(d.w, r) : -1;
			if (r && vi >= 0 && r.pts.length > 2) {
				const prevPts = r.pts.map((p) => [...p]);
				r.pts.splice(vi, 1);
				await postRoad(r, prevPts, `delete point ${vi + 1} of ${r.id}`);
			}
		}
		return;
	}
	if (d.kind === "vertex") {
		const r = d.road;
		if (JSON.stringify(r.pts) !== JSON.stringify(d.prevPts)) await postRoad(r, d.prevPts, `move point on ${r.id}`);
		return;
	}
	if (d.kind === "exit") {
		if (!d.moved) return;
		const e = d.exit;
		const body = { id: e.id, dest: e.dest.map((v) => Math.round(v)), name: e.name, archetype: e.archetype, community_tier: e.community_tier, has_return_ramp: e.has_return_ramp, highway_id: e.highway_id, service_tags: e.service_tags, risk_rating: e.risk_rating };
		const prevBody = { ...body, dest: d.prevDest, exit_number: e.exit_number };
		try {
			const r = await api("/api/exits", { method: "POST", body: JSON.stringify(body) });
			pushUndo(`move exit ${e.id}`, async () => api("/api/exits", { method: "POST", body: JSON.stringify(prevBody) }),
				async () => api("/api/exits", { method: "POST", body: JSON.stringify(body) }));
			await refresh(); scheduleBake();
			savedFlash(`${e.id} → EXIT ${r.exit.exit_number}`);
		} catch (err) { savedFlash("move failed: " + err.message); await refresh(); }
		return;
	}
	if (d.kind === "note") {
		if (!d.moved) return;
		await api("/api/plan", { method: "POST", body: JSON.stringify({ id: d.note.id, pos: d.note.pos }) });
		pushUndo(`move ${d.note.id}`, async () => api("/api/plan", { method: "POST", body: JSON.stringify({ id: d.note.id, pos: d.prevPos }) }),
			async () => api("/api/plan", { method: "POST", body: JSON.stringify({ id: d.note.id, pos: d.note.pos }) }));
		savedFlash(`${d.note.id} moved`);
		return;
	}
	if (d.kind === "placement") {
		if (!d.moved) return;
		const p = d.p;
		await api("/api/placements", { method: "POST", body: JSON.stringify({ id: p.id, building: p.building, pos: p.pos, rot: p.rot }) });
		pushUndo(`move ${p.id}`, async () => api("/api/placements", { method: "POST", body: JSON.stringify({ id: p.id, building: p.building, pos: d.prevPos, rot: p.rot }) }),
			async () => api("/api/placements", { method: "POST", body: JSON.stringify({ id: p.id, building: p.building, pos: p.pos, rot: p.rot }) }));
		savedFlash(`${p.id} moved`);
		return;
	}
	if (d.kind === "town") {
		if (!d.moved) return;
		const t = d.t;
		await api("/api/towns", { method: "POST", body: JSON.stringify(t) });
		pushUndo(`move ${t.id}`, async () => api("/api/towns", { method: "POST", body: JSON.stringify({ ...t, pos: d.prevPos }) }),
			async () => api("/api/towns", { method: "POST", body: JSON.stringify(t) }));
		savedFlash(`${t.name} moved`);
	}
});

cv.addEventListener("dblclick", async (ev) => {
	const w = evWorld(ev);
	if (tool === "district" && districtDraft.length >= 3) return finishDistrict(ev);
	// insert a vertex on the selected road's nearest segment
	const r = vertexRoad();
	if (!r || (tool !== "road" && tool !== "select")) return;
	let bi = -1, bd = Infinity;
	for (let i = 0; i + 1 < r.pts.length; i++) {
		const d = distToSeg(w, r.pts[i], r.pts[i + 1]) * view.scale;
		if (d < bd) { bd = d; bi = i; }
	}
	if (bi < 0 || bd > 10) return;
	const prevPts = r.pts.map((p) => [...p]);
	r.pts.splice(bi + 1, 0, [Math.round(w[0]), Math.round(w[1])]);
	await postRoad(r, prevPts, `insert point on ${r.id}`);
});

async function postRoad(r, prevPts, label) {
	const body = { ...r };
	try {
		await api("/api/roads", { method: "POST", body: JSON.stringify(body) });
		pushUndo(label,
			async () => api("/api/roads", { method: "POST", body: JSON.stringify({ ...r, pts: prevPts }) }),
			async () => api("/api/roads", { method: "POST", body: JSON.stringify(body) }));
		scheduleBake();
		savedFlash(label);
	} catch (e) { savedFlash("save failed: " + e.message); }
	requestDraw();
}

// ---------- ELEVATION (Racing Destruction Set P3) ----------
// One armed vertex; wheel / +/- nudge in 0.5m steps, clamped -5..+30 (the
// engine's own row law). Writes ride the field-preserving /api/roads overlay.
let elevSel = null; // { id, i }
let elevSaveTimer = null;
function elevRoad() { return elevSel ? roads.find((x) => x.id === elevSel.id) : null; }
function nudgeElev(dir) {
	const r = elevRoad();
	if (!r || tool !== "elev") return false;
	if (!Array.isArray(r.elev)) r.elev = [];
	while (r.elev.length < r.pts.length) r.elev.push(0);
	const prevElev = [...r.elev];
	r.elev[elevSel.i] = Math.max(-5, Math.min(30, Math.round((r.elev[elevSel.i] + dir * 0.5) * 2) / 2));
	requestDraw();
	// debounce the write — a scroll burst lands as ONE undoable save
	clearTimeout(elevSaveTimer);
	elevSaveTimer = setTimeout(async () => {
		const body = { ...r };
		try {
			await api("/api/roads", { method: "POST", body: JSON.stringify(body) });
			pushUndo(`elev ${r.id}[${elevSel?.i}] → ${r.elev[elevSel?.i ?? 0]}m`,
				async () => api("/api/roads", { method: "POST", body: JSON.stringify({ ...r, elev: prevElev }) }),
				async () => api("/api/roads", { method: "POST", body: JSON.stringify(body) }));
			scheduleBake();
			savedFlash(`${r.id} elev[${elevSel?.i}] = ${r.elev[elevSel?.i ?? 0]}m`);
		} catch (e) { savedFlash("elev save failed: " + e.message); }
	}, 450);
	return true;
}
// amber climb tint: 0m = base road color, 30m = hot amber-white
function elevTint(h) {
	const t = Math.max(0, Math.min(1, h / 18));
	const lerp = (a, b) => Math.round(a + (b - a) * t);
	return `rgb(${lerp(150, 255)},${lerp(120, 214)},${lerp(70, 130)})`;
}

function paintAtWorld(w) {
	const x = Math.floor((w[0] - meta.world_offset[0]) / meta.cell_m);
	const z = Math.floor((w[1] - meta.world_offset[1]) / meta.cell_m);
	const half = Math.floor(brush / 2);
	const ch = Object.entries(meta.legend).find(([, n]) => n === biome)[0];
	for (let dz = -half; dz <= half; dz++)
		for (let dx = -half; dx <= half; dx++) {
			const nx = x + dx, nz = z + dz;
			if (nx < 0 || nx >= meta.w || nz < 0 || nz >= meta.h) continue;
			if (rows[nz][nx] === ch) continue;
			paintPrev.push([nx, nz, rows[nz][nx]]);
			rows[nz] = rows[nz].substring(0, nx) + ch + rows[nz].substring(nx + 1);
			paintStroke.push([nx, nz]);
			paintBmpCell(nx, nz);
		}
	requestDraw();
}

async function footerInfoAt(w) {
	try {
		const info = await api(`/api/cell?wx=${Math.round(w[0])}&wz=${Math.round(w[1])}`);
		document.getElementById("info").innerHTML =
			`<b>${info.biome}</b> · ${info.state || "open water"} · road <b>${info.nearest_road?.id ?? "—"}</b> ${info.nearest_road ? info.nearest_road.dist_m + " m" : ""} · town <b>${info.nearest_town?.name ?? "—"}</b> ${info.nearest_town ? info.nearest_town.dist_m + " m" : ""}`;
	} catch { /* off grid */ }
}

// ---------- minimap ----------
mini.addEventListener("mousedown", (ev) => {
	const r = mini.getBoundingClientRect();
	view.cx = meta.world_offset[0] + ((ev.clientX - r.left) / r.width) * meta.w * meta.cell_m;
	view.cz = meta.world_offset[1] + ((ev.clientY - r.top) / r.height) * meta.h * meta.cell_m;
	requestDraw();
});

// ---------- dialogs ----------
function placeDlg(dlg, ev) {
	dlg.style.display = "block";
	dlg.style.left = Math.max(8, Math.min((ev?.clientX ?? innerWidth / 2) + 14, innerWidth - 300)) + "px";
	dlg.style.top = Math.max(8, Math.min((ev?.clientY ?? innerHeight / 3) + 10, innerHeight - 360)) + "px";
}
// exit dialog
function nearestInterstateJS(wx, wz) {
	let best = null, bestD = Infinity;
	for (const r of roads) {
		if (r.kind && r.kind !== "interstate") continue;
		for (let i = 0; i + 1 < r.pts.length; i++) {
			const d = distToSeg([wx, wz], r.pts[i], r.pts[i + 1]);
			if (d < bestD) { bestD = d; best = r.id; }
		}
	}
	return best ? { id: best, dist: Math.round(bestD) } : null;
}
function openExitDlg(ev) {
	const near = nearestInterstateJS(pendingExit[0], pendingExit[1]);
	document.getElementById("exitanchor").textContent = near
		? `dest ${Math.round(pendingExit[0])}, ${Math.round(pendingExit[1])} · anchors on ${near.id} (~${near.dist} m ramp)`
		: "no interstate on the map — the server will refuse this";
	placeDlg(document.getElementById("exitdlg"), ev);
	const name = document.getElementById("exitname");
	name.value = "";
	setTimeout(() => name.focus(), 0);
}
function closeExitDlg() { document.getElementById("exitdlg").style.display = "none"; pendingExit = null; }
document.getElementById("exitcancel").onclick = closeExitDlg;
document.getElementById("exitname").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("exitgo").click(); });
document.getElementById("exitpiece").onchange = () => {
	const p = document.getElementById("exitpiece").value;
	document.getElementById("exitreturn").checked = p !== "exit";
};
document.getElementById("exitgo").onclick = async () => {
	if (!pendingExit) return closeExitDlg();
	const piece = document.getElementById("exitpiece").value;
	const name = document.getElementById("exitname").value.trim();
	const payload = {
		dest: pendingExit.map((v) => Math.round(v)),
		archetype: document.getElementById("exitarch").value,
		has_return_ramp: document.getElementById("exitreturn").checked,
	};
	if (name) payload.name = name.toUpperCase();
	try {
		const r = await api("/api/exits", { method: "POST", body: JSON.stringify(payload) });
		// pieces: exit + a stamped cluster at the destination
		const TPL = { service_stop: "waystation", town_connector: "hamlet", outpost_stop: "outpost" };
		let stamped = null;
		if (TPL[piece])
			stamped = await api("/api/stamp_template", { method: "POST", body: JSON.stringify({ template: TPL[piece], pos: payload.dest, name: (name || r.exit.id).toLowerCase().replace(/[^a-z0-9]/g, "") }) });
		pushUndo(`exit ${r.exit.id}`, async () => {
			await api(`/api/exits?id=${encodeURIComponent(r.exit.id)}`, { method: "DELETE" });
			if (stamped) for (const p of stamped.stamped) await api(`/api/placements?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
		}, async () => {
			await api("/api/exits", { method: "POST", body: JSON.stringify({ ...payload, id: r.exit.id, exit_number: r.exit.exit_number }) });
			if (stamped) await api("/api/stamp_template", { method: "POST", body: JSON.stringify({ template: TPL[piece], pos: payload.dest, name: (name || r.exit.id).toLowerCase().replace(/[^a-z0-9]/g, "") }) });
		});
		await refresh(); scheduleBake();
		savedFlash(`${r.exit.id} · EXIT ${r.exit.exit_number} ${r.exit.name}${stamped ? ` + ${stamped.stamped.length} structures` : ""}`);
		closeExitDlg();
	} catch (e) { savedFlash("exit failed: " + e.message); }
};
function buildExitArch() {
	const sel2 = document.getElementById("exitarch");
	const keep = sel2.value;
	sel2.innerHTML = archetypes.map((a) => `<option value="${a.id}">${a.id} · ${a.tier_default} · danger ${a.danger}</option>`).join("");
	sel2.value = archetypes.some((a) => a.id === keep) ? keep
		: (archetypes.some((a) => a.id === "service") ? "service" : (archetypes[0]?.id ?? ""));
}

// district dialog
function finishDistrict(ev) {
	if (districtDraft.length < 3) return savedFlash("a district needs 3+ corners");
	placeDlg(document.getElementById("districtdlg"), ev);
	setTimeout(() => document.getElementById("d-name").focus(), 0);
}
document.getElementById("districtcancel").onclick = () => { document.getElementById("districtdlg").style.display = "none"; };
document.getElementById("districtgo").onclick = async () => {
	const id = document.getElementById("d-id").value.trim() || document.getElementById("d-name").value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
	const name = document.getElementById("d-name").value.trim();
	if (!id || !name) return savedFlash("need id + name");
	const body = { id, name: name.toUpperCase(), kind: document.getElementById("d-kind").value, poly: districtDraft.slice() };
	try {
		await api("/api/districts", { method: "POST", body: JSON.stringify(body) });
		pushUndo(`district ${id}`, async () => api(`/api/districts?id=${id}`, { method: "DELETE" }),
			async () => api("/api/districts", { method: "POST", body: JSON.stringify(body) }));
		districtDraft = [];
		document.getElementById("districtdlg").style.display = "none";
		document.getElementById("d-id").value = ""; document.getElementById("d-name").value = "";
		await refresh(); savedFlash(`${name} district saved`);
	} catch (e) { savedFlash("district failed: " + e.message); }
};

// note dialog
function openNoteDlg(existing, ev) {
	editingNoteId = existing?.id || null;
	document.getElementById("notedlg-title").textContent = existing ? `EDIT ${existing.id}` : "NEW PLAN NOTE";
	document.getElementById("n-text").value = existing?.text || "";
	document.getElementById("n-status").value = existing?.status || "open";
	document.getElementById("notedel").style.display = existing ? "" : "none";
	placeDlg(document.getElementById("notedlg"), ev);
	setTimeout(() => document.getElementById("n-text").focus(), 0);
}
document.getElementById("notecancel").onclick = () => { document.getElementById("notedlg").style.display = "none"; pendingNotePos = null; editingNoteId = null; };
document.getElementById("notego").onclick = async () => {
	const text = document.getElementById("n-text").value.trim();
	if (!text) return savedFlash("note needs text");
	const body = { text, status: document.getElementById("n-status").value, author: "owner" };
	if (editingNoteId) body.id = editingNoteId;
	else body.pos = pendingNotePos.map((v) => Math.round(v));
	try {
		const r = await api("/api/plan", { method: "POST", body: JSON.stringify(body) });
		if (!editingNoteId)
			pushUndo(`note ${r.note.id}`, async () => api(`/api/plan?id=${r.note.id}`, { method: "DELETE" }),
				async () => api("/api/plan", { method: "POST", body: JSON.stringify({ ...body, id: r.note.id, pos: r.note.pos }) }));
		document.getElementById("notedlg").style.display = "none";
		pendingNotePos = null; editingNoteId = null;
		await refresh(); savedFlash(`${r.note.id} saved`);
	} catch (e) { savedFlash("note failed: " + e.message); }
};
document.getElementById("notedel").onclick = async () => {
	if (!editingNoteId) return;
	const n = notes.find((x) => x.id === editingNoteId);
	await api(`/api/plan?id=${editingNoteId}`, { method: "DELETE" });
	if (n) pushUndo(`delete ${n.id}`, async () => api("/api/plan", { method: "POST", body: JSON.stringify(n) }),
		async () => api(`/api/plan?id=${n.id}`, { method: "DELETE" }));
	document.getElementById("notedlg").style.display = "none";
	sel = null; editingNoteId = null;
	await refresh(); savedFlash("note deleted");
};

// ---------- panels ----------
function buildPalette() {
	const pal = document.getElementById("palette");
	pal.innerHTML = "";
	const desc = document.getElementById("biomedesc");
	for (const [, name] of Object.entries(meta.legend)) {
		const d = document.createElement("div");
		d.className = "sw" + (name === biome ? " on" : "");
		d.innerHTML = `<i style="background:${COLORS[name] || "#333"}"></i>${name}`;
		d.onmouseenter = () => { desc.textContent = BIOME_INFO[name] || name; };
		d.onclick = () => { biome = name; document.querySelectorAll(".sw").forEach((s) => s.classList.remove("on")); d.classList.add("on"); };
		pal.appendChild(d);
	}
}
function buildLayers() {
	const el = document.getElementById("layers");
	el.innerHTML = "";
	for (const [key, label, color] of LAYER_DEFS) {
		const d = document.createElement("label");
		d.className = "lay";
		d.innerHTML = `<input type="checkbox" ${layers[key] ? "checked" : ""}><i style="background:${color}"></i>${label}`;
		d.querySelector("input").onchange = (ev) => { layers[key] = ev.target.checked; requestDraw(); };
		el.appendChild(d);
	}
}
function buildVehicleSel() {
	const s = document.getElementById("vehiclesel");
	s.innerHTML = vehicles.map((v) => `<option value="${v.id}">${v.name} — top ${v.top} m/s</option>`).join("");
	s.onchange = () => { if (measure.a && measure.b) runMeasure(); };
}
let footprintById = {}; // building id -> [w, d] meters (drawn as true rectangles)
function buildBuildingSel() {
	const s = document.getElementById("buildingsel");
	footprintById = {};
	const byCat = {};
	for (const x of structures) {
		footprintById[x.id] = x.footprint_m || [10, 8];
		(byCat[x.category || "misc"] = byCat[x.category || "misc"] || []).push(x);
	}
	let html = "";
	// TRACK first — the Racing Destruction Set palette (rows from track_pieces.json;
	// placements land namespaced "track:<id>", materialized by track_piece.gd)
	if (trackPieces.length) {
		for (const t of trackPieces) footprintById["track:" + t.id] = [t.size?.[0] || 4, t.size?.[2] || 6];
		html += `<optgroup label="TRACK — destruction set">` + trackPieces.map((t) =>
			`<option value="track:${t.id}">${t.kind === "ramp" ? "⛰" : t.kind === "bank" ? "⌒" : t.destructible ? "💥" : "▮"} ${t.label || t.id} (${t.size?.[0]}×${t.size?.[2]}m${t.destructible ? " · breaks" : ""})</option>`).join("") + `</optgroup>`;
	}
	for (const cat of Object.keys(byCat).sort()) {
		html += `<optgroup label="${cat}">` + byCat[cat].map((x) => `<option value="${x.id}">${x.sign_glyph || "▪"} ${x.id} (${(x.footprint_m || [])[0]}×${(x.footprint_m || [])[1]}m)</option>`).join("") + `</optgroup>`;
	}
	html += `<optgroup label="legacy">` + ["safehouse", "gas_station", "ruined_house", "market_stall"].map((i) => `<option>${i}</option>`).join("") + `</optgroup>`;
	s.innerHTML = html;
}
function buildExitList() {
	document.getElementById("exithdr").textContent = `${document.getElementById("exitlistwrap").style.display === "none" ? "▸" : "▾"} Exit nodes (${exits.length})`;
	const el = document.getElementById("exitlist");
	el.innerHTML = "";
	const sorted = [...exits].sort((a, b) => a.highway_id === b.highway_id ? a.exit_number - b.exit_number : a.highway_id.localeCompare(b.highway_id));
	for (const e of sorted) {
		const row = document.createElement("div");
		row.className = "listrow";
		row.innerHTML = `<span>${e.highway_id} X${e.exit_number} · ${esc(e.name)}</span>`;
		row.title = `${e.id} — ${e.archetype} ${e.community_tier} · click to jump`;
		row.onclick = () => { view.cx = e.pos[0]; view.cz = e.pos[1]; view.scale = Math.max(view.scale, 0.12); sel = { type: "exit", id: e.id }; renderInspector(); requestDraw(); };
		el.appendChild(row);
	}
}
function buildPlanList() {
	document.getElementById("planhdr").textContent = `${document.getElementById("planlistwrap").style.display === "none" ? "▸" : "▾"} Plan notes (${notes.length})`;
	const el = document.getElementById("planlist");
	el.innerHTML = "";
	for (const n of notes) {
		const row = document.createElement("div");
		row.className = "listrow";
		row.innerHTML = `<span style="color:${NOTE_COLOR[n.status]}">${n.status === "done" ? "✓" : n.status === "doing" ? "◐" : "○"}</span><span>${esc(n.text)}</span>`;
		row.title = `${n.id} (${n.status}${n.author ? " · " + n.author : ""}) — click to jump`;
		row.onclick = () => { view.cx = n.pos[0]; view.cz = n.pos[1]; view.scale = Math.max(view.scale, 0.1); sel = { type: "note", id: n.id }; renderInspector(); requestDraw(); };
		el.appendChild(row);
	}
}
document.getElementById("exithdr").onclick = () => {
	const w = document.getElementById("exitlistwrap");
	w.style.display = w.style.display === "none" ? "" : "none";
	buildExitList();
};
document.getElementById("planhdr").onclick = () => {
	const w = document.getElementById("planlistwrap");
	w.style.display = w.style.display === "none" ? "" : "none";
	buildPlanList();
};

// ---------- structure catalog (spec §7) ----------
const S_TEXT = ["id", "display_name", "sign_glyph", "category", "loot_table", "interior_template"];
const S_CSV = ["allowed_tiers", "districts", "entrances", "npc_jobs", "law_hooks", "event_hooks", "faction_overrides"];
const S_BOOL = ["enterable", "power_required", "can_be_safehouse"];
const sEl = (k) => document.getElementById("s-" + k);
function buildFootprintSel() {
	sEl("footprint").innerHTML = footprints.map((f) => `<option>${f}</option>`).join("");
}
function structLine(s) {
	const t = s.allowed_tiers || [], fm = s.footprint_m || [];
	const tiers = t.length > 1 ? `${t[0]}-${t[t.length - 1]}` : (t[0] || "?");
	return `${s.sign_glyph || "▪"} ${s.display_name || s.id} · ${s.category} · ${tiers} · ${fm[0] ?? "?"}×${fm[1] ?? "?"}m`;
}
function buildStructList() {
	document.getElementById("structfold").textContent = `${structOpen ? "▾" : "▸"} Structure catalog (${structures.length})`;
	const el = document.getElementById("structlist");
	el.innerHTML = "";
	for (const s of structures) {
		const d = document.createElement("div");
		d.className = "structrow" + (s.id === selStructId ? " on" : "");
		d.textContent = structLine(s);
		d.onclick = () => { selStructId = s.id; loadStructForm(s); buildStructList(); };
		el.appendChild(d);
	}
}
function loadStructForm(s) {
	for (const k of S_TEXT) sEl(k).value = s[k] ?? "";
	for (const k of S_CSV) sEl(k).value = (s[k] || []).join(", ");
	for (const k of S_BOOL) sEl(k).checked = !!s[k];
	sEl("footprint").value = s.footprint || "small_rect";
	sEl("fw").value = s.footprint_m?.[0] ?? 10;
	sEl("fd").value = s.footprint_m?.[1] ?? 8;
	sEl("floors").value = s.floors ?? 1;
	sEl("danger").value = s.danger ?? 1;
	showProblems([]);
}
function serializeStructForm() {
	const s = {};
	for (const k of S_TEXT) s[k] = sEl(k).value.trim();
	for (const k of S_CSV) s[k] = sEl(k).value.split(",").map((x) => x.trim()).filter(Boolean);
	for (const k of S_BOOL) s[k] = sEl(k).checked;
	s.footprint = sEl("footprint").value;
	s.footprint_m = [Number(sEl("fw").value), Number(sEl("fd").value)];
	s.floors = Number(sEl("floors").value);
	s.danger = Number(sEl("danger").value);
	return s;
}
function showProblems(list) {
	document.getElementById("sproblems").textContent = list.length ? "NOT LAWFUL:\n· " + list.join("\n· ") : "";
}
document.getElementById("structfold").onclick = () => {
	structOpen = !structOpen;
	document.getElementById("structbody").style.display = structOpen ? "block" : "none";
	buildStructList();
};
document.getElementById("s-new").onclick = () => {
	selStructId = null;
	loadStructForm({ footprint: footprints[0] || "small_rect", footprint_m: [10, 8], floors: 1, danger: 1, enterable: true, interior_template: "none" });
	buildStructList();
	sEl("id").focus();
};
document.getElementById("s-save").onclick = async () => {
	const s = serializeStructForm();
	const r = await fetch("/api/structures", { method: "POST", body: JSON.stringify(s) });
	const j = await r.json();
	if (!r.ok) return showProblems(j.problems || [j.error || String(r.status)]);
	selStructId = j.structure.id;
	({ structures, footprints } = await api("/api/structures"));
	buildStructList(); buildBuildingSel(); showProblems([]);
	savedFlash(`${j.structure.id} → catalog (${j.total} rows)`);
};
document.getElementById("s-del").onclick = async () => {
	const id = sEl("id").value.trim();
	if (!id) return savedFlash("no structure loaded");
	if (!confirm(`Delete structure profile '${id}'?`)) return;
	await api(`/api/structures?id=${encodeURIComponent(id)}`, { method: "DELETE" });
	if (selStructId === id) selStructId = null;
	({ structures, footprints } = await api("/api/structures"));
	buildStructList(); buildBuildingSel(); savedFlash(`${id} removed`);
};

// ---------- tool switching + keys ----------
const TOOL_SECTIONS = { paint: "paintsec", measure: "measuresec", road: "roadsec", place: "placesec" };
function setTool(t) {
	tool = t;
	document.querySelectorAll("#tools button[id^=t-]").forEach((b) => b.classList.remove("on"));
	document.getElementById("t-" + t)?.classList.add("on");
	for (const [k, id] of Object.entries(TOOL_SECTIONS))
		document.getElementById(id).style.display = k === t ? "" : "none";
	if (t !== "exit") closeExitDlg();
	if (t !== "district") districtDraft = [];
	if (t !== "measure") clearMeasure();
	if (t !== "elev") elevSel = null;
	roadStatus();
	requestDraw();
}
for (const t of ["select", "road", "elev", "exit", "measure", "district", "note", "paint", "town", "place"])
	document.getElementById("t-" + t).onclick = () => setTool(t);

function roadStatus() {
	const el = document.getElementById("roadstatus");
	const r = vertexRoad();
	el.textContent = !r ? "no road selected — click one with SELECT or NEW ROAD"
		: `▸ ${r.id}: ${r.pts.length} pts — click to extend the nearest end`;
}
document.getElementById("road-new").onclick = async () => {
	const id = prompt("Road id (e.g. US-50):");
	if (!id) return;
	const kind = document.getElementById("roadkindsel").value;
	sel = { type: "road", id };
	roads.push({ id, kind, pts: [] });
	setTool("road");
	savedFlash(`${id} (${kind}): click 2+ points on the map`);
};

document.getElementById("zoom-in").onclick = () => setZoom(1.25, cv._w / 2, cv._h / 2);
document.getElementById("zoom-out").onclick = () => setZoom(0.8, cv._w / 2, cv._h / 2);
document.getElementById("zoom-fit").onclick = () => { fitView(); requestDraw(); };
document.getElementById("zoom-meridian").onclick = () => { view.cx = 110; view.cz = -325; view.scale = 0.35; requestDraw(); };
document.getElementById("bake").onclick = runBake;
document.getElementById("undo").onclick = doUndo;
document.getElementById("redo").onclick = doRedo;
document.getElementById("reload").onclick = async () => {
	await api("/api/reload", { method: "POST", body: "{}" }); // server re-reads disk first
	await load(); savedFlash("re-read from disk");
};
document.getElementById("helpbtn").onclick = () => document.getElementById("helppanel").classList.toggle("open");
document.getElementById("helpclose").onclick = () => document.getElementById("helppanel").classList.remove("open");

document.querySelectorAll(".brush").forEach((b) => b.onclick = () => {
	brush = Number(b.dataset.b);
	document.querySelectorAll(".brush").forEach((x) => x.classList.remove("on"));
	b.classList.add("on");
});

addEventListener("keydown", async (e) => {
	if (e.key === " " && !e.target.matches("input, select, textarea")) { spaceDown = true; cv.style.cursor = "grab"; e.preventDefault(); }
	if (e.key === "Escape") {
		document.getElementById("helppanel").classList.remove("open");
		closeExitDlg();
		document.getElementById("districtdlg").style.display = "none";
		document.getElementById("notedlg").style.display = "none";
		districtDraft = []; clearMeasure(); requestDraw();
		return;
	}
	if (e.target.matches("input, select, textarea")) return;
	if (tool === "elev" && elevSel && (e.key === "+" || e.key === "=")) { nudgeElev(1); return; }
	if (tool === "elev" && elevSel && (e.key === "-" || e.key === "_")) { nudgeElev(-1); return; }
	if (e.key === "Enter" && tool === "district" && districtDraft.length >= 3) finishDistrict();
	if ("1359".includes(e.key)) document.querySelector(`.brush[data-b="${e.key}"]`)?.click();
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); await doUndo(); }
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); await doRedo(); }
	if (e.key === "Delete" && sel) {
		const btn = document.querySelector("#inspector .actions button.danger");
		if (btn) btn.click();
	}
});
addEventListener("keyup", (e) => { if (e.key === " ") { spaceDown = false; cv.style.cursor = "crosshair"; } });

// ---------- boot ----------
addEventListener("resize", resize);
new ResizeObserver(resize).observe(stage);
(async () => {
	resize();
	await load();
	// rivers ride along on /api/map only — pull once
	try { window._rivers = (await api("/api/map")).rivers || []; } catch { window._rivers = []; }
	buildLayers();
	requestDraw();
})();
