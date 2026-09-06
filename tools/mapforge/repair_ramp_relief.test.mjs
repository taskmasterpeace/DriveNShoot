import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

function staged() {
	const root=resolve('build'); mkdirSync(root,{recursive:true});
	const directory=mkdtempSync(join(root,'ramp-repair-test-'));
	const path=join(directory,'map.json');
	const map={world_offset:[0,0],cell_m:100,relief:Array(6).fill('0123456789'),towns:[],
		roads:[{id:'main',kind:'interstate',pts:[[50,50],[950,50]],elev:[2,10],elev_mode:'ground'},
			{id:'ramp',kind:'exit',geom:'peel_v1',pts:[[150,60],[160,220],[450,220]],elev:[3,8,13],side:1,custom:'KEEP'}],
		exits:[{id:'exit',highway_id:'main',pos:[150,50],dest:[450,220],ramp_ids:['ramp']}],
		junctions:[{id:'deck',grade:'deck',deck_road:'main'}],placements:[{id:'home',label:'KEEP'}]};
	writeFileSync(path,JSON.stringify(map));
	return {path,map};
}

test('ramp repair CLI is read-only by default and writes only ramp profile fields when requested',()=>{
	const {path,map}=staged();
	const bytes=readFileSync(path);
	const run=(...args)=>spawnSync(process.execPath,['tools/mapforge/repair_ramp_relief.mjs','--map='+path,...args],{encoding:'utf8'});
	const dry=run(); assert.equal(dry.status,0,dry.stderr);
	assert.deepEqual(readFileSync(path),bytes);
	const write=run('--write'); assert.equal(write.status,0,write.stderr);
	const actual=JSON.parse(readFileSync(path,'utf8'));
	assert.deepEqual(actual.roads[0],map.roads[0]);
	assert.deepEqual(actual.exits,map.exits);
	assert.deepEqual(actual.junctions,map.junctions);
	assert.deepEqual(actual.placements,map.placements);
	assert.equal(actual.roads[1].custom,'KEEP');
	assert.equal(actual.roads[1].elev[0],2.89);
	assert.ok(actual.roads[1].pts.some(p=>p[0]===160 && p[1]===220));
	const after=readFileSync(path);
	const repeat=run('--write'); assert.equal(repeat.status,0,repeat.stderr);
	assert.deepEqual(readFileSync(path),after);
});

test('invalid profile data is rejected before any map write',()=>{
	const {path,map}=staged();
	map.roads[0].elev=[2,'invalid'];
	writeFileSync(path,JSON.stringify(map));
	const before=readFileSync(path);
	const run=spawnSync(process.execPath,['tools/mapforge/repair_ramp_relief.mjs','--map='+path,'--write'],{encoding:'utf8'});
	assert.notEqual(run.status,0);
	assert.match(run.stderr,/finite.*elevation/i);
	assert.deepEqual(readFileSync(path),before);
});

test('an exit with a missing highway is rejected before any map write',()=>{
	const {path,map}=staged();
	map.exits[0].highway_id='missing';
	writeFileSync(path,JSON.stringify(map));
	const before=readFileSync(path);
	const run=spawnSync(process.execPath,['tools/mapforge/repair_ramp_relief.mjs','--map='+path,'--write'],{encoding:'utf8'});
	assert.notEqual(run.status,0);
	assert.match(run.stderr,/complete highway elevation/i);
	assert.deepEqual(readFileSync(path),before);
});
