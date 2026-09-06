// Pure, explicitly selected diamond-interchange replacement. No map mutation or I/O.
import { roadHalfWidth } from './road_clearance.mjs';

const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const mul=(a,k)=>[a[0]*k,a[1]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const norm=a=>Math.hypot(...a);
const distance=(a,b)=>norm(sub(a,b));
const unit=a=>mul(a,1/norm(a));
const right=a=>[-a[1],a[0]];
const lerp=(a,b,t)=>add(a,mul(sub(b,a),t));
const cm=n=>Math.round(n*100)/100;
const finitePoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);

function polyline(road) {
  if(!Array.isArray(road.pts)||road.pts.length<2||!road.pts.every(finitePoint))
    throw new Error(`Road ${road.id}: finite coordinate polyline required`);
  let length=0;
  const segments=[];
  for(let i=1;i<road.pts.length;i++) {
    const a=road.pts[i-1],b=road.pts[i],size=distance(a,b);
    if(size<=1e-6)throw new Error(`Road ${road.id}: zero-length segment`);
    segments.push({a,b,size,arc:length,index:i-1,tangent:unit(sub(b,a))});length+=size;
  }
  return {segments,length};
}
function project(p,line) {
  let best;
  for(const s of line.segments) {
    const t=Math.max(0,Math.min(1,dot(sub(p,s.a),s.tangent)/s.size));
    const point=lerp(s.a,s.b,t),d=distance(point,p);
    if(!best||d<best.distance)best={point,distance:d,arc:s.arc+t*s.size,t,segment:s};
  }
  return best;
}
function atArc(line,arc) {
  if(arc<0||arc>line.length)throw new Error('Highway too short for diamond approach ports');
  const s=line.segments.find(s=>arc<=s.arc+s.size)||line.segments.at(-1);
  const t=(arc-s.arc)/s.size;
  return {point:lerp(s.a,s.b,t),t,segment:s};
}
function densify(points,step=8) {
  const result=[points[0]];
  for(let i=1;i<points.length;i++) {
    const count=Math.ceil(distance(points[i-1],points[i])/step);
    for(let j=1;j<=count;j++)result.push(j===count?points[i]:lerp(points[i-1],points[i],j/count));
  }
  return result;
}
function cubic(a,b,c,d) {
  const count=Math.max(8,Math.ceil((distance(a,b)+distance(b,c)+distance(c,d))/6));
  const pts=[a];
  for(let i=1;i<count;i++) {
    const t=i/count,u=1-t;
    pts.push(add(add(mul(a,u*u*u),mul(b,3*u*u*t)),add(mul(c,3*u*t*t),mul(d,t*t*t))));
  }
  pts.push(d);return pts;
}
function profile(points,terrain,start,end) {
  const line=polyline({id:'profile',pts:points});
  let arc=0;
  const correction0=start-terrain(points[0]),correction1=end-terrain(points.at(-1));
  return points.map((p,i)=>{
    if(i)arc+=distance(points[i-1],p);
    const t=arc/line.length;
    return cm(terrain(p)+correction0*(1-t)+correction1*t);
  });
}
function validateProfile(road) {
  for(let i=1;i<road.pts.length;i++) {
    const span=distance(road.pts[i-1],road.pts[i]);
    if(!Number.isFinite(road.elev[i])||span>16.000001||
      Math.abs(road.elev[i]-road.elev[i-1])/span>0.061)
      throw new Error(`Road ${road.id}: terrain/profile exceeds 6.1% grade; increase approach or choose another site`);
  }
}
function segmentDistance(a,b,c,d) {
  const ab=sub(b,a),cd=sub(d,c),ac=sub(c,a);
  const cross=(u,v)=>u[0]*v[1]-u[1]*v[0],den=cross(ab,cd);
  if(Math.abs(den)>1e-9) {
    const t=cross(ac,cd)/den,u=cross(ac,ab)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
  }
  const pointDistance=(p,x,y)=>distance(p,lerp(x,y,Math.max(0,Math.min(1,dot(sub(p,x),sub(y,x))/dot(sub(y,x),sub(y,x))))));
  return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
}
function validateSeparation(roads,locals) {
  // Within 28m of a shared local junction the road slabs intentionally meet.
  for(let i=0;i<roads.length;i++)for(let j=i+1;j<roads.length;j++) {
    const a=roads[i],b=roads[j],width=roadHalfWidth(a)+roadHalfWidth(b)+1;
    for(let ai=1;ai<a.pts.length;ai++)for(let bi=1;bi<b.pts.length;bi++) {
      const aa=a.pts[ai-1],ab=a.pts[ai],ba=b.pts[bi-1],bb=b.pts[bi];
      if(locals.some(p=>[aa,ab,ba,bb].every(q=>distance(p,q)<=28)))continue;
      if(segmentDistance(aa,ab,ba,bb)<width)
        throw new Error(`Full-width conflict between ${a.id} and ${b.id}; move destination or increase approach spacing`);
    }
  }
}

export function buildDiamondInterchange(map,exitId,{
  terrainAt,approach_m=260,junction_offset_m=180,bridge_clearance_m=6.2,
}={}) {
  if(typeof terrainAt!=='function')throw new Error('terrainAt callback is required');
  for(const [name,value] of Object.entries({approach_m,junction_offset_m,bridge_clearance_m}))
    if(!Number.isFinite(value)||value<=0)throw new Error(`${name} must be finite and positive`);
  const terrain=p=>{
    const h=terrainAt(...p);
    if(!Number.isFinite(h))throw new Error(`Nonfinite terrain height at ${p}`);
    return h;
  };
  const original=(map.exits||[]).find(e=>e.id===exitId);
  if(!original)throw new Error(`Unknown exit ${exitId}`);
  if(!finitePoint(original.pos)||!finitePoint(original.dest))throw new Error('Exit position and destination require finite coordinates');
  const highway=(map.roads||[]).find(r=>r.id===original.highway_id&&r.kind!=='exit');
  if(!highway)throw new Error(`Exit ${exitId}: missing highway ${original.highway_id}`);
  const line=polyline(highway),anchor=project(original.pos,line),tangent=anchor.segment.tangent;
  const perpendicular=right(tangent),half=roadHalfWidth(highway);
  if(!Number.isFinite(half)||half<=0)throw new Error('Highway width must be finite and positive');
  if(highway.elev && (highway.elev.length!==highway.pts.length||!highway.elev.every(Number.isFinite)))
    throw new Error('Highway elevations must be finite and match its polyline');
  const highwayHeight=sample=>highway.elev
    ? highway.elev[sample.segment.index]*(1-sample.t)+highway.elev[sample.segment.index+1]*sample.t
    :terrain(sample.point);
  atArc(line,anchor.arc-approach_m);atArc(line,anchor.arc+approach_m);
  if(!Array.isArray(original.ramp_ids)||original.ramp_ids.length!==4||new Set(original.ramp_ids).size!==4)
    throw new Error('Exit must own exactly four distinct ramp IDs');
  const owned=original.ramp_ids.map(id=>{
    const r=map.roads.find(r=>r.id===id);
    if(!r||r.kind!=='exit')throw new Error(`Missing ramp ${id}`);
    if((r.exit_id&&r.exit_id!==exitId)||(r.interchange_id&&r.interchange_id!==exitId)||(map.exits||[]).some(e=>e.id!==exitId&&e.ramp_ids?.includes(id)))
      throw new Error(`Ramp ${id} is owned by another exit`);
    polyline(r);
    if(r.side!==1&&r.side!==-1)throw new Error(`Ramp ${id}: side must be +1 or -1`);
    let role=r.ramp_role;
    if(role===undefined) {
      const start=distance(r.pts[0],original.pos)<=80,end=distance(r.pts.at(-1),original.pos)<=80;
      if(start===end)throw new Error(`Ramp ${id}: ambiguous legacy role; require exactly one mouth within 80m`);
      role=start?'off':'on';
    }
    if(role!=='off'&&role!=='on')throw new Error(`Ramp ${id}: invalid ramp role`);
    return {row:r,role};
  });
  if(new Set(owned.map(({row,role})=>`${row.side}:${role}`)).size!==4)
    throw new Error('Duplicate ramp side/role; four serving directions are required');
  const crossId=`${exitId}-crossroad`;
  const linkId=`${exitId}-town-link`;
  if(crossId===linkId||original.ramp_ids.includes(crossId)||original.ramp_ids.includes(linkId))
    throw new Error('Connector IDs collide with ramp ownership');
  const connectorBase=id=>{
    const existing=map.roads.find(r=>r.id===id);
    if(existing && (existing.interchange_id!==exitId||!original.connector_ids?.includes(id)||existing.authored))
      throw new Error(`Connector ${id} collides with an unowned or authored road`);
    return {id,kind:'state_road',lanes:2,divided:false,surface:'asphalt',danger:original.danger??0,
      nickname:`${original.name||exitId} ${id===crossId?'Crossroad':'Town Link'}`,
      ...structuredClone(existing||{}),interchange_id:exitId,elev_mode:'structure'};
  };
  const crossBase=connectorBase(crossId),linkBase=connectorBase(linkId);
  const destinationRoads=(map.roads||[]).filter(r=>r.kind!=='exit'&&r.id!==highway.id&&r.id!==crossId&&r.id!==linkId)
    .map(r=>({road:r,projection:project(original.dest,polyline(r))})).filter(r=>r.projection.distance<=1);
  if(!destinationRoads.length)throw new Error('Destination must meet an existing non-exit road within 1m');
  const local=side=>add(anchor.point,mul(perpendicular,side*junction_offset_m));
  const locals=[local(-1),local(1)],crestHalf=half+6;
  if(junction_offset_m<=crestHalf)throw new Error('Junction offset leaves no bridge approach');
  let crest=highwayHeight(atArc(line,anchor.arc));
  // The crossroad's full pavement covers a strip of highway, not just a single vertex.
  for(let a=Math.max(0,anchor.arc-12);a<=Math.min(line.length,anchor.arc+12);a+=1)
    crest=Math.max(crest,highwayHeight(atArc(line,a)));
  crest+=bridge_clearance_m;
  const endpoints=locals.map(terrain);
  crest=Math.max(crest,...[-crestHalf,0,crestHalf].map(d=>terrain(add(anchor.point,mul(perpendicular,d)))));
  if(endpoints.some(h=>Math.abs(crest-h)/(junction_offset_m-crestHalf)>0.058))
    throw new Error('Bridge approach cannot meet 5.8% target grade with ground-level junctions; increase junction_offset_m');
  const crossPoints=densify([locals[0],add(anchor.point,mul(perpendicular,-crestHalf)),anchor.point,
    add(anchor.point,mul(perpendicular,crestHalf)),locals[1]]);
  const crossroad={...crossBase,
    pts:crossPoints,elev:crossPoints.map(p=>{
      const d=dot(sub(p,anchor.point),perpendicular),index=d<0?0:1;
      return cm(Math.abs(d)<=crestHalf?crest:crest+(endpoints[index]-crest)*(Math.abs(d)-crestHalf)/(junction_offset_m-crestHalf));
    })};
  const radians=12*Math.PI/180,ports=[];
  const ramps=owned.map(({row,role})=>{
    const sign=role==='off'?-1:1,port=atArc(line,anchor.arc+sign*row.side*approach_m);
    const travel=mul(port.segment.tangent,row.side),out=mul(right(port.segment.tangent),row.side);
    const mouth=add(port.point,mul(out,half+1)),toward=mul(travel,role==='off'?1:-1);
    const peel=add(mul(toward,Math.cos(radians)),mul(out,Math.sin(radians)));
    const lead=add(mouth,mul(peel,70)),meeting=local(row.side);
    const endDirection=mul(tangent,row.side*(role==='off'?1:-1));
    let pts=densify([mouth,...cubic(lead,add(lead,mul(peel,80)),sub(meeting,mul(endDirection,80)),meeting)]);
    let elev=profile(pts,terrain,highwayHeight(port),terrain(meeting));
    if(role==='on'){pts.reverse();elev.reverse();}
    const ramp={...structuredClone(row),pts,elev,ramp_role:role,one_way:true,interchange_id:exitId,geom:'diamond_v2',elev_mode:'structure'};
    for(const p of pts) {
      const near=project(p,line),signed=dot(sub(p,near.point),right(near.segment.tangent))*row.side;
      if(signed-roadHalfWidth(ramp)<=1.2)
        throw new Error(`Ramp ${row.id} full width intrudes into highway median; reduce width or choose another site`);
      if(signed<half+0.99)throw new Error(`Ramp ${row.id} crosses its highway carriageway boundary; choose a straighter site`);
    }
    ports.push({ramp,port,mouth,role});return ramp;
  });
  const townSide=Math.sign(dot(sub(original.dest,anchor.point),perpendicular));
  if(!townSide)throw new Error('Destination is on the highway median; no safe feeder route');
  const meeting=local(townSide),out=mul(perpendicular,townSide),lead=add(meeting,mul(out,40));
  if(distance(lead,original.dest)<1)throw new Error('Destination too close to feeder bend');
  const ending=unit(sub(original.dest,lead));
  const linkPoints=densify([meeting,...cubic(lead,add(lead,mul(out,40)),sub(original.dest,mul(ending,40)),[...original.dest])]);
  const link={...linkBase,pts:linkPoints,
    elev:profile(linkPoints,terrain,terrain(meeting),terrain(original.dest))};
  for(const p of linkPoints) {
    const near=project(p,line);
    if(dot(sub(p,near.point),right(near.segment.tangent))*townSide-roadHalfWidth(link)<=1.2)
      throw new Error('Feeder full width crosses highway median; move destination');
  }
  const roads=[...ramps,crossroad,link];roads.forEach(validateProfile);
  validateSeparation([...ramps,link],locals);
  const leg=(r,arc)=>({road:typeof r==='string'?r:r.id,arc_m:arc});
  const junction=(suffix,kind,grade,pos,legs,extra={})=>({id:`${exitId}-${suffix}`,kind,grade,
    control:kind==='ramp_mouth'||kind==='ramp_rejoin'?'riro':'none',pos:[...pos],legs,interchange_id:exitId,...extra});
  const junctions=ports.map(({ramp,mouth,role})=>junction(`${ramp.id}-port`,
    role==='off'?'ramp_mouth':'ramp_rejoin','flat',mouth,
    [leg(highway,project(mouth,line).arc),leg(ramp,role==='off'?0:polyline(ramp).length)]));
  for(const side of [-1,1]) {
    const sideRamps=ramps.filter(r=>r.side===side);
    const legs=sideRamps.map(r=>leg(r,r.ramp_role==='off'?polyline(r).length:0));
    legs.push(leg(crossroad,side===-1?0:polyline(crossroad).length));
    if(side===townSide)legs.push(leg(link,0));
    junctions.push(junction(`local-${side}`,'cross','flat',local(side),legs));
  }
  junctions.push(junction('deck','cross','deck',anchor.point,[leg(highway,anchor.arc),leg(crossroad,junction_offset_m)],{deck_road:crossId}));
  junctions.push(junction('destination','tee','flat',original.dest,[leg(link,polyline(link).length),
    ...destinationRoads.map(({road,projection})=>leg(road,projection.arc))]));
  return {exit:{...structuredClone(original),interchange:{layout:'diamond_v2',approach_m,junction_offset_m,bridge_clearance_m},
    connector_ids:[crossId,linkId]},roads,junctions};
}
