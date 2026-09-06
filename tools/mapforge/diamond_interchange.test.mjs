import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = await import('./diamond_interchange.mjs').catch(() => ({}));
test('production diamond builder is exported', () => {
  assert.equal(typeof source.buildDiamondInterchange, 'function', 'missing production diamond builder');
});
const build = (...args) => source.buildDiamondInterchange(...args);
const flat = () => 0;
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const length = r => r.pts.slice(1).reduce((s,p,i)=>s+distance(p,r.pts[i]),0);
function fixture() {
  return {roads:[
    {id:'main',kind:'interstate',pts:[[-1200,0],[1200,0]],elev:[0,0],lanes:6,divided:true},
    {id:'town',kind:'street',pts:[[-520,-300],[-520,-180]],elev:[0,0],lanes:2},
    ...[
      ['cedar',1,[[0,15],[100,100]]], ['violet',1,[[100,100],[35,15]]],
      ['amber',-1,[[0,-15],[-100,-100]]], ['cobalt',-1,[[-100,-100],[-35,-15]]],
    ].map(([id,side,pts])=>({id,side,pts,kind:'exit',lanes:2,divided:false,
      character:{sign:'KEEP'},toll:7,nickname:id+' road'})),
  ],exits:[{id:'X',highway_id:'main',pos:[0,0],dest:[-520,-240],
    ramp_ids:['cedar','violet','amber','cobalt'],name:'KEEP EXIT',payload:{key:4}}],
    placements:[{id:'untouched',pos:[200,300]}]};
}
function checkProfiles(result) {
  for(const r of result.roads) {
    assert.equal(r.elev.length,r.pts.length);
    assert.ok(r.elev.every(Number.isFinite));
    for(let i=1;i<r.pts.length;i++) {
      const span=distance(r.pts[i],r.pts[i-1]);
      assert.ok(span>0 && span<=16.00001,`${r.id} span ${span}`);
      assert.ok(Math.abs(r.elev[i]-r.elev[i-1])/span<=0.061,`${r.id} grade`);
    }
  }
}
test('keeps IDs, role direction, destination and arbitrary payload without input mutation',()=>{
  const map=fixture(), before=structuredClone(map), result=build(map,'X',{terrainAt:flat});
  assert.deepEqual(map,before);
  assert.deepEqual(result.exit.dest,[-520,-240]);
  assert.equal(result.exit.name,'KEEP EXIT');
  assert.deepEqual(result.exit.payload,{key:4});
  assert.equal(result.roads.length,6);
  for(const [id,role,side] of [['cedar','off',1],['violet','on',1],['amber','off',-1],['cobalt','on',-1]]) {
    const r=result.roads.find(r=>r.id===id);
    assert.equal(r.ramp_role,role); assert.equal(r.side,side); assert.equal(r.one_way,true);
    assert.deepEqual(r.character,{sign:'KEEP'}); assert.equal(r.toll,7); assert.equal(r.nickname,id+' road');
  }
});
test('four mouths serve right-hand carriageways with legal travel tangents and no median intrusion',()=>{
  const result=build(fixture(),'X',{terrainAt:flat});
  for(const [id,mouth,travel] of [
    ['cedar',[-260,14.6],1],['violet',[260,14.6],1],
    ['amber',[260,-14.6],-1],['cobalt',[-260,-14.6],-1],
  ]) {
    const r=result.roads.find(r=>r.id===id), off=r.ramp_role==='off';
    assert.ok(distance(off?r.pts[0]:r.pts.at(-1),mouth)<0.02);
    const a=off?r.pts[0]:r.pts.at(-2),b=off?r.pts[1]:r.pts.at(-1);
    const angle=Math.acos((b[0]-a[0])*travel/distance(a,b))*180/Math.PI;
    assert.ok(angle>=8 && angle<=15,`${id} tangent ${angle}`);
    assert.ok(r.pts.every(p=>p[1]*r.side>=14.59));
    // A two-lane ramp half-width is 4.6m: even the whole pavement stays outside median.
    assert.ok(r.pts.every(p=>p[1]*r.side-4.6>1.2));
    const local=off?r.pts.at(-1):r.pts[0];
    assert.deepEqual(local,[0,r.side*180]);
    assert.equal(off?r.elev.at(-1):r.elev[0],0);
  }
  checkProfiles(result);
});
test('crossroad is a legal deck and feeder alone reaches behind-anchor town road',()=>{
  const result=build(fixture(),'X',{terrainAt:flat});
  const cross=result.roads.find(r=>r.id===result.exit.connector_ids[0]);
  const link=result.roads.find(r=>r.id===result.exit.connector_ids[1]);
  assert.deepEqual(cross.pts[0],[0,-180]); assert.deepEqual(cross.pts.at(-1),[0,180]);
  const middle=cross.pts.findIndex(p=>distance(p,[0,0])<0.001);
  assert.ok(middle>=0); assert.ok(cross.elev[middle]>=6.2);
  assert.equal(cross.elev[0],0); assert.equal(cross.elev.at(-1),0);
  assert.deepEqual(link.pts[0],[0,-180]); assert.deepEqual(link.pts.at(-1),[-520,-240]);
  assert.ok(link.pts.some(p=>distance(p,[0,-220])<0.001),'40m outward lead');
  assert.ok(link.pts.every(p=>p[1]<=-180));
  assert.equal(result.junctions.length,8);
  const local=result.junctions.find(j=>distance(j.pos,[0,-180])<0.001);
  assert.deepEqual(new Set(local.legs.map(l=>l.road)),new Set(['amber','cobalt',cross.id,link.id]));
  const dest=result.junctions.find(j=>distance(j.pos,[-520,-240])<0.001);
  assert.deepEqual(new Set(dest.legs.map(l=>l.road)),new Set(['town',link.id]));
  assert.equal(dest.legs.find(l=>l.road==='town').arc_m,60);
});
test('highway and ramp junction legs carry true arc distances',()=>{
  const result=build(fixture(),'X',{terrainAt:flat});
  for(const [id,arc] of [['cedar',940],['violet',1460],['amber',1460],['cobalt',940]]) {
    const r=result.roads.find(r=>r.id===id);
    const j=result.junctions.find(j=>j.legs.some(l=>l.road===id)&&j.legs.some(l=>l.road==='main'));
    assert.ok(Math.abs(j.legs.find(l=>l.road==='main').arc_m-arc)<0.001);
    assert.ok(Math.abs(j.legs.find(l=>l.road===id).arc_m-(r.ramp_role==='off'?0:length(r)))<0.001);
  }
});
test('reversing highway order reverses physical carriageway assignments',()=>{
  const map=fixture();map.roads[0].pts.reverse();
  const result=build(map,'X',{terrainAt:flat});
  for(const [id,want] of [['cedar',[260,-14.6]],['violet',[-260,-14.6]],['amber',[-260,14.6]],['cobalt',[260,14.6]]]) {
    const r=result.roads.find(r=>r.id===id);
    assert.ok(distance(r.ramp_role==='off'?r.pts[0]:r.pts.at(-1),want)<0.02);
  }
});
test('rotating the world rotates all four mouths and retained destination',()=>{
  const map=fixture(), rotate=p=>[-p[1],p[0]];
  for(const r of map.roads)r.pts=r.pts.map(rotate);
  map.exits[0].pos=rotate(map.exits[0].pos);map.exits[0].dest=rotate(map.exits[0].dest);
  const result=build(map,'X',{terrainAt:flat});
  for(const [id,want] of [['cedar',[-14.6,-260]],['violet',[-14.6,260]],['amber',[14.6,260]],['cobalt',[14.6,-260]]]) {
    const r=result.roads.find(r=>r.id===id);
    assert.ok(distance(r.ramp_role==='off'?r.pts[0]:r.pts.at(-1),want)<0.02);
  }
  assert.deepEqual(result.exit.dest,[240,-520]);checkProfiles(result);
});
test('destination joins every nearby non-exit segment, not only first matching road',()=>{
  const map=fixture();map.roads.push({id:'town2',kind:'county',pts:[[-600,-240],[-400,-240]]});
  const result=build(map,'X',{terrainAt:flat});
  const j=result.junctions.find(j=>distance(j.pos,[-520,-240])<0.001);
  assert.ok(j.legs.some(l=>l.road==='town2' && l.arc_m===80));
});
for(const [name,change,options,pattern] of [
  ['missing highway',m=>m.roads.shift(),{},/highway/i],
  ['missing ramp',m=>m.roads.splice(2,1),{},/ramp/i],
  ['unowned ramp',m=>m.roads[2].exit_id='OTHER',{},/own/i],
  ['duplicate side and role',m=>m.roads[3].pts=[[0,15],[100,100]],{},/duplicate|role/i],
  ['short highway',m=>m.roads[0].pts=[[-200,0],[200,0]],{},/approach|port|short/i],
  ['impossible raised deck',m=>m.roads[0].elev=[20,20],{},/grade|approach/i],
  ['missing destination road',m=>m.roads.splice(1,1),{},/destination/i],
  ['invalid coordinate',m=>m.exits[0].dest=[NaN,0],{},/finite|coordinate|destination/i],
  ['invalid approach',()=>{}, {approach_m:NaN},/finite|approach/i],
  ['invalid junction offset',()=>{}, {junction_offset_m:0},/offset|positive/i],
  ['invalid clearance',()=>{}, {bridge_clearance_m:-1},/clearance|positive/i],
  ['nonfinite terrain',()=>{}, {terrainAt:()=>NaN},/terrain|finite/i],
])test(`rejects ${name} without mutation`,()=>{
  const map=fixture();change(map);const before=structuredClone(map);
  assert.throws(()=>build(map,'X',{terrainAt:flat,...options}),pattern);assert.deepEqual(map,before);
});
test('requires terrain callback rather than silently assuming flat ground',()=>{
  assert.throws(()=>build(fixture(),'X'),/terrain/i);
});
test('stamps runtime metadata and structure profiles on all six managed roads',()=>{
  const map=fixture();map.exits[0].danger=3;
  const result=build(map,'X',{terrainAt:flat});
  assert.deepEqual(result.exit.interchange,{layout:'diamond_v2',approach_m:260,junction_offset_m:180,bridge_clearance_m:6.2});
  assert.deepEqual(result.exit.connector_ids,['X-crossroad','X-town-link']);
  for(const r of result.roads) {
    assert.equal(r.interchange_id,'X');assert.equal(r.elev_mode,'structure');
    if(r.ramp_role)assert.equal(r.geom,'diamond_v2');
    else {
      assert.equal(r.kind,'state_road');assert.equal(r.lanes,2);assert.equal(r.divided,false);
      assert.equal(r.surface,'asphalt');assert.equal(r.danger,3);assert.ok(r.nickname.length>3);
    }
  }
  for(const id of ['cedar','violet','amber','cobalt']) {
    const port=result.junctions.find(j=>j.legs[0]?.road==='main'&&j.legs.some(l=>l.road===id));
    assert.ok(port.id.includes('X')&&port.id.includes(id));assert.equal(port.control,'riro');
  }
});
test('managed regeneration is deterministic and retains connector character payload',()=>{
  const map=fixture(),first=build(map,'X',{terrainAt:flat});
  map.exits=[structuredClone(first.exit)];map.roads=map.roads.filter(r=>r.kind!=='exit').concat(structuredClone(first.roads));
  map.roads.find(r=>r.id==='X-crossroad').custom={keep:true};
  const before=structuredClone(map),second=build(map,'X',{terrainAt:flat});
  assert.deepEqual(map,before);assert.deepEqual(second.roads.find(r=>r.id==='X-crossroad').custom,{keep:true});
  delete second.roads.find(r=>r.id==='X-crossroad').custom;
  assert.deepEqual(second,first);
});
test('managed regeneration restores fixed connector fields while keeping custom character',()=>{
  const map=fixture(),first=build(map,'X',{terrainAt:flat});
  map.exits=[structuredClone(first.exit)];map.exits[0].danger=4;
  map.roads=map.roads.filter(r=>r.kind!=='exit').concat(structuredClone(first.roads));
  for(const id of first.exit.connector_ids)Object.assign(map.roads.find(r=>r.id===id),{
    kind:'dirt',lanes:4,divided:true,surface:'gravel',danger:99,one_way:true,
    nickname:'Retained local name',custom:{keep:true},toll:7,
  });
  const before=structuredClone(map),result=build(map,'X',{terrainAt:flat});
  assert.deepEqual(map,before);
  for(const r of result.roads.filter(r=>first.exit.connector_ids.includes(r.id))) {
    assert.equal(r.kind,'state_road');assert.equal(r.lanes,2);assert.equal(r.divided,false);
    assert.equal(r.surface,'asphalt');assert.equal(r.danger,4);assert.equal(r.one_way,false);
    assert.equal(r.nickname,'Retained local name');assert.deepEqual(r.custom,{keep:true});assert.equal(r.toll,7);
  }
});
test('rejects smooth terrain hill intersecting an interior crossroad approach',()=>{
  const map=fixture(),before=structuredClone(map);
  // Compact smooth hill: zero at the local junctions, deck crest, and all ramps.
  // At [0,100] terrain is 8m, while the flat-site linear bridge approach is ~3.09m.
  const terrainAt=(x,z)=>Math.abs(x)<15&&Math.abs(z-100)<25
    ? 2*(1+Math.cos(Math.PI*x/15))*(1+Math.cos(Math.PI*(z-100)/25)):0;
  assert.throws(()=>build(map,'X',{terrainAt}),/crossroad.*terrain|terrain.*approach/i);
  assert.deepEqual(map,before);
});
test('never overwrites unrelated connector ID collisions',()=>{
  const map=fixture();map.roads.push({id:'X-crossroad',kind:'street',pts:[[600,400],[700,400]],custom:'authored'});
  assert.throws(()=>build(map,'X',{terrainAt:flat}),/own|collision|managed/i);
});
test('refuses interchange ownership claimed by another exit',()=>{
  const map=fixture();map.roads[2].interchange_id='OTHER';
  assert.throws(()=>build(map,'X',{terrainAt:flat}),/own/i);
});
test('rejects feeder that doubles back through same-side ramps',()=>{
  const map=fixture();map.exits[0].dest=[-240,-20];map.roads[1].pts=[[-240,-60],[-240,20]];
  assert.throws(()=>build(map,'X',{terrainAt:flat}),/conflict|feeder/i);
});
test('uses curved highway arc length and the mouth-local tangent, not anchor tangent',()=>{
  const map=fixture();map.roads[0].pts=[[-1200,-200],[-100,0],[100,0],[1200,200]];map.roads[0].elev=[0,0,0,0];
  const result=build(map,'X',{terrainAt:flat}),r=result.roads.find(r=>r.id==='cedar');
  // The mouth is 160m before [-100,0], along an independently specified 1100:200 segment.
  const h=Math.sqrt(1250000),want=[-100-160*1100/h-14.6*200/h,-160*200/h+14.6*1100/h];
  assert.ok(distance(r.pts[0],want)<0.001);
  const port=result.junctions.find(j=>j.legs.some(l=>l.road==='cedar')&&j.legs[0].road==='main');
  assert.ok(Math.abs(port.legs[0].arc_m-(h-160))<0.001);checkProfiles(result);
});
test('ramp terrain correction is distance-weighted and uses actual raised highway profile',()=>{
  const map=fixture();map.roads[0].elev=[2,2];
  const terrain=(x,z)=>x*0.001+z*0.002,result=build(map,'X',{terrainAt:terrain});
  const r=result.roads.find(r=>r.id==='cedar');assert.equal(r.elev[0],2);assert.equal(r.elev.at(-1),0.36);
  let arc=0;const total=length(r),correction=2-(-260*0.001+14.6*0.002);
  for(let i=0;i<r.pts.length;i++) {
    if(i)arc+=distance(r.pts[i-1],r.pts[i]);
    assert.ok(Math.abs(r.elev[i]-(terrain(...r.pts[i])+correction*(1-arc/total)))<=0.00501);
  }
  checkProfiles(result);
});
test('rejects full-width median intrusion even when a wide ramp centre is on the right side',()=>{
  const map=fixture();map.roads[2].lanes=12;
  assert.throws(()=>build(map,'X',{terrainAt:flat}),/median/i);
});
test('rejects full-width feeder overlap without needing a centreline intersection',()=>{
  const map=fixture();map.exits[0].dest=[-240,-27];map.roads[1].pts=[[-240,-60],[-240,-20]];
  assert.throws(()=>build(map,'X',{terrainAt:flat}),/conflict/i);
});
for(const dest of [[-525.75,-73.4],[-433.19,-104.13],[368.06,66.41]])
  test(`accepts outside-diamond destination ${dest} inside local junction lateral offset`,()=>{
    const map=fixture();map.exits[0].dest=dest;
    map.roads[1].pts=[[dest[0],dest[1]-30],[dest[0],dest[1]+30]];
    const result=build(map,'X',{terrainAt:flat});
    assert.deepEqual(result.roads.find(r=>r.id==='X-town-link').pts.at(-1),dest);
    checkProfiles(result);
  });
