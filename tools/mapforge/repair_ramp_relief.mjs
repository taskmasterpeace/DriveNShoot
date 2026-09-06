// Profile-only migration. Default is read-only; --write atomically replaces
// the selected map after proving that unrelated rows/fields did not change.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bakeRampRelief } from './bake_junctions.mjs';

try {
	const args=process.argv.slice(2);
	assert.ok(args.every(a=>a==='--write' || a.startsWith('--map=')),'expected --write and/or --map=PATH');
	const path=resolve(args.find(a=>a.startsWith('--map='))?.slice(6) || fileURLToPath(new URL('../../game/data/usmap.json',import.meta.url)));
	const source=readFileSync(path,'utf8');
	const before=JSON.parse(source), map=structuredClone(before);
	assert.ok(Array.isArray(map.roads) && Array.isArray(map.exits),'map roads/exits arrays required');
	assert.ok(Number.isFinite(map.cell_m) && map.cell_m>0 && map.world_offset?.length===2 && map.world_offset.every(Number.isFinite),'finite map scale/offset required');
	assert.ok(Array.isArray(map.relief) && map.relief.every(row=>typeof row==='string' && /^[0-9]+$/.test(row)),'numeric relief rows required');
	for(const road of map.roads) {
		assert.ok(road.pts?.length>=2 && road.pts.every(p=>Array.isArray(p) && p.length===2 && p.every(Number.isFinite)),`finite road points required: ${road.id}`);
		assert.ok(!road.elev || (Array.isArray(road.elev) && road.elev.every(Number.isFinite)),`finite road elevation required: ${road.id}`);
	}
	const roads=new Map(map.roads.map(r=>[r.id,r]));
	assert.equal(roads.size,map.roads.length,'duplicate road IDs');
	const owned=new Set();
	for(const exit of map.exits) {
		assert.ok(exit.pos?.length===2 && exit.pos.every(Number.isFinite),'finite exit position required');
		const highway=roads.get(exit.highway_id);
		assert.ok(highway && Array.isArray(highway.elev) && highway.elev.length===highway.pts.length,`complete highway elevation required: ${exit.id}`);
		for(const id of exit.ramp_ids || []) {
			assert.ok(roads.get(id)?.kind==='exit',`owned ramp missing: ${id}`);
			assert.ok(!owned.has(id),`ramp claimed more than once: ${id}`);
			owned.add(id);
		}
	}
	const stats=bakeRampRelief(map);
	assert.deepEqual({...map,roads:[]},{...before,roads:[]},'non-road map fields changed');
	let maxGrade=0;
	for(let i=0;i<map.roads.length;i++) {
		const row=map.roads[i], old=before.roads[i];
		if(!owned.has(row.id)) { assert.deepEqual(row,old,'unowned road changed'); continue; }
		assert.deepEqual({...row,pts:[],elev:[],elev_mode:''},{...old,pts:[],elev:[],elev_mode:''},'road character changed');
		assert.equal(row.elev.length,row.pts.length,'height/path cardinality mismatch');
		assert.ok(row.elev.every(Number.isFinite),'finite output elevation required');
		let cursor=0;
		for(const p of row.pts) if(cursor<old.pts.length && p[0]===old.pts[cursor][0] && p[1]===old.pts[cursor][1]) cursor++;
		assert.equal(cursor,old.pts.length,'original road vertices changed or reordered');
		for(let p=1;p<row.pts.length;p++) {
			const length=Math.hypot(row.pts[p][0]-row.pts[p-1][0],row.pts[p][1]-row.pts[p-1][1]);
			if(length>0.001)maxGrade=Math.max(maxGrade,Math.abs(row.elev[p]-row.elev[p-1])/length);
		}
	}
	assert.ok(maxGrade<=0.061,`ramp grade exceeds the 6% contract plus rounding allowance: ${maxGrade}`);
	const once=JSON.stringify(map);
	bakeRampRelief(map);
	assert.equal(JSON.stringify(map),once,'repair is not idempotent');
	if(args.includes('--write') && stats.ramps>0) {
		assert.equal(readFileSync(path,'utf8'),source,'map changed since inspection; refusing stale write');
		const temp=path+'.ramp-relief-'+randomUUID()+'.tmp';
		writeFileSync(temp,once,{flag:'wx'});
		renameSync(temp,path);
	}
	console.log(JSON.stringify({mode:args.includes('--write')?'write':'read-only',...stats,max_grade:maxGrade,map:path},null,2));
} catch(error) {
	console.error(error.message);
	process.exitCode=1;
}
