#!/usr/bin/env node
// THE SHOWROOM — render runner. Launches Godot NON-headless (get_viewport().
// get_texture() needs a real GPU swapchain — `--headless` hangs forever waiting
// on RenderingServer.frame_post_draw; the same law every render_*.gd tool in
// game/proto3d/tools/ already follows) to shoot every VEHICLE row
// (ProtoCar3D.VEHICLES, folded with data/vehicles.json) and every STRUCTURE row
// (data/world/structure_profiles.json) to PNG, then reports the manifest the
// showroom stage itself wrote (docs/renders/showroom/manifest.json).
//
//   node tools/showroom/run.mjs              (mode: all)
//   node tools/showroom/run.mjs vehicles
//   node tools/showroom/run.mjs structures
//
// Also the engine behind THE FORGE hub's SHOWROOM tab RE-RENDER button
// (tools/showroom/server.mjs shells this same script).

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const GODOT = process.env.GODOT_EXE || "C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64.exe";
const MANIFEST = join(ROOT, "docs", "renders", "showroom", "manifest.json");
const MODES = ["vehicles", "structures", "all"];

export function runShowroom(mode = "all", onLine = (s) => process.stdout.write(s)) {
	return new Promise((resolveP, rejectP) => {
		if (!MODES.includes(mode)) return rejectP(new Error(`unknown mode '${mode}' — use ${MODES.join(" | ")}`));
		if (!existsSync(GODOT)) return rejectP(new Error(`Godot not found at ${GODOT} — set GODOT_EXE`));
		onLine(`SHOWROOM: launching Godot (windowed — capture needs a real GPU swapchain) mode=${mode}…\n`);
		const child = spawn(GODOT, ["--path", join(ROOT, "game"), "res://proto3d/tools/showroom.tscn", "--", mode],
			{ windowsHide: false });
		child.stdout.on("data", (d) => onLine(d.toString()));
		child.stderr.on("data", (d) => onLine(d.toString()));
		child.on("error", rejectP);
		child.on("close", (code) => {
			if (code !== 0) return rejectP(new Error(`Godot exited with code ${code}`));
			if (!existsSync(MANIFEST)) return rejectP(new Error(`no manifest at ${MANIFEST} — the render likely failed silently`));
			const doc = JSON.parse(readFileSync(MANIFEST, "utf8"));
			onLine(`SHOWROOM: done — ${doc.count} rows, mode=${doc.mode}, generated ${doc.generated}\n`);
			resolveP(doc);
		});
	});
}

// CLI entry (skip when imported by server.mjs)
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
	const mode = process.argv[2] || "all";
	runShowroom(mode).then((doc) => {
		console.log(`SHOWROOM: manifest -> ${MANIFEST.replaceAll("\\", "/")}`);
		process.exit(0);
	}).catch((e) => {
		console.error(`SHOWROOM: ${e.message || e}`);
		process.exit(1);
	});
}
