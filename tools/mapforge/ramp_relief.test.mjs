import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bakeRoadRelief, bakeRampRelief } from './bake_junctions.mjs';

function fixture(ramp, relief = '0123456789', highway = [[50,50],[950,50]]) {
	return {world_offset:[0,0],cell_m:100,relief:Array(6).fill(relief),towns:[],
		roads:[{id:'highway',kind:'interstate',pts:highway,lanes:4,divided:true},
			{id:'owned-ramp',kind:'exit',geom:'peel_v1',pts:ramp,side:1,lanes:2,
				divided:false,danger:3,nickname:'KEEP THIS ROAD',toll:7}],
		exits:[{id:'owned-exit',highway_id:'highway',pos:[150,50],dest:ramp.at(-1),ramp_ids:['owned-ramp']}]};
}

function heightAtOriginalPoint(map, point) {
	const ramp=map.roads.find(r=>r.id==='owned-ramp');
	const index=ramp.pts.findIndex(p=>p[0]===point[0] && p[1]===point[1]);
	assert.notEqual(index,-1,'original path vertices must survive densification');
	return ramp.elev[index];
}

test('uneven ramp vertices follow geographic relief, not vertex ordinal',()=>{
	// Each 100m column adds 30/9m. At x160, the literal land height is 3.67m.
	// The preceding leg is mostly along Z; counting it as half the rise is wrong.
	const map=fixture([[150,60],[160,220],[450,220]]);
	bakeRoadRelief(map);
	assert.equal(heightAtOriginalPoint(map,[160,220]),3.67);
	assert.equal(heightAtOriginalPoint(map,[450,220]),13.33);
});

test('return ramp ends on the highway profile, not the underlying hill',()=>{
	// The highway spans two zero-height endpoints across a one-column hill.
	// Its actual baked midpoint is 0m; raw relief at x150 is 3.33m.
	const map=fixture([[250,250],[150,220],[150,60]],'010',[[50,50],[250,50]]);
	map.exits[0].dest=[250,250];
	bakeRoadRelief(map);
	assert.equal(heightAtOriginalPoint(map,[150,60]),0,'on-ramp must join the actual highway height');
	assert.equal(heightAtOriginalPoint(map,[250,250]),0,'town endpoint stays on its local terrain');
	assert.equal(heightAtOriginalPoint(map,[150,220]),3.33,'interior follows the hill away from the join');
});

test('ramp pavement follows an interior hill without shifting vertices or road character',()=>{
	const original=[[50,60],[60,68],[250,220]];
	const map=fixture(structuredClone(original),'010',[[50,50],[250,50]]);
	map.exits[0].pos=[50,50];
	bakeRoadRelief(map);
	const ramp=map.roads[1];
	for(let sample=1;sample<40;sample++) {
		const x=50+sample*5;
		const i=ramp.pts.findIndex((p,i)=>i>0 && p[0]>=x);
		assert.ok(i>0,'sample is covered by actual emitted road geometry');
		const t=(x-ramp.pts[i-1][0])/(ramp.pts[i][0]-ramp.pts[i-1][0]);
		const height=ramp.elev[i-1]+(ramp.elev[i]-ramp.elev[i-1])*t;
		const want=(1-Math.abs(x-150)/100)*30/9;
		assert.ok(Math.abs(height-want)<0.03,`pavement at x${x}: ${height}m must follow the ${want}m hill`);
	}
	for(const point of original)heightAtOriginalPoint(map,point);
	assert.deepEqual({id:ramp.id,side:ramp.side,danger:ramp.danger,nickname:ramp.nickname,toll:ramp.toll},
		{id:'owned-ramp',side:1,danger:3,nickname:'KEEP THIS ROAD',toll:7});
	const once=JSON.stringify(map);
	bakeRoadRelief(map);
	assert.equal(JSON.stringify(map),once,'rebaking must not keep adding points or drift heights');
});

test('ramp-only repair preserves highway humps, junctions, ownership and unrelated rows',()=>{
	const map=fixture([[150,60],[160,220],[450,220]]);
	map.roads[0].elev=[2,10];
	map.roads[0].elev_mode='ground';
	map.junctions=[{id:'bridge',grade:'deck',deck_road:'highway',legs:[]}];
	map.placements=[{id:'home',owner:'unchanged'}];
	const before=structuredClone(map);
	const result=bakeRampRelief(map);
	assert.equal(result.ramps,1);
	assert.deepEqual(map.roads[0],before.roads[0]);
	assert.deepEqual(map.junctions,before.junctions);
	assert.deepEqual(map.placements,before.placements);
	assert.deepEqual(map.exits,before.exits);
	// 100m into the 900m highway: 2 + 8*(100/900), rounded to centimetres.
	assert.equal(heightAtOriginalPoint(map,[150,60]),2.89,'join uses the existing preserved highway profile');
});
