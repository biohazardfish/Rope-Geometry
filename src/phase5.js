import {closestSegments,detectCollisions,EPSILON} from './geometry.js';
const lerp=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
export const candidateA={id:'candidate-A',title:'Flat-cuff minimal-twist hypothesis',diameter:.01,column:{axis:'X',radius:.055,length:.36,center:[0,0,0]},parameters:{cuffRadius:.09,pitch:.032,limbOffset:.008,arcStep:.18},evidenceLayer:'data/somerville-bowline-topology-v2.json',reference:'references/Documents/09 - The Somerville Bowline - A4 print friendly.pdf',claims:[
 {id:'two-wrap',status:'OBSERVED',evidence:['duchy-detail-3','duchy-detail-24'],description:'Two doubled wraps; four cuff runs.'},
 {id:'loop-transfer',status:'OBSERVED',evidence:['PDF p1–2'],description:'360 degree working-bight turn transfers to standing bundle; direct standing-loop construction is also described on p2.'},
 {id:'underpass',status:'OBSERVED',evidence:['PDF p2–3'],description:'Over the X, beneath entire cuff, then through loop in the same direction.'},
 {id:'rear-route',status:'ASSUMED',evidence:['duchy-detail-24'],description:'Two parallel helical limbs, no rear exchange.',affects:['cuff-0','cuff-1'],alternatives:['Rear limb exchange with compensating local twist'],resolution:'Marked limbs continuously visible behind column.'},
 {id:'loop-route',status:'ASSUMED',evidence:['PDF p2–3'],description:'Open standing-loop embedding and working-return waypoints; handedness and two same-direction loop passages require further correspondence review.',affects:['standing','locking-loop','over-X','under-cuff','return-loop'],alternatives:['Opposite loop crossing sign or alternative loop-root attachment'],resolution:'Both roots and both bight limbs visible throughout transfer.'},
 {id:'metric-layout',status:'ASSUMED',evidence:[],description:'All dimensions and offsets are engineering choices, not measurements from sources.',affects:['all'],alternatives:['Different column radius and dressing'],resolution:'Metric capture or manual measurements.'},
 {id:'endpoint-map',status:'ASSUMED',evidence:['duchy-detail-24'],description:'E0 follows limb 0 to fold; limb 1 returns to E1.',affects:['all'],alternatives:['Swap endpoint names; alternative rear pairing'],resolution:'Trace marked E0 and E1 through the complete tie.'},
 {id:'final-equivalence',status:'UNRESOLVED',evidence:['PDF p3','duchy-detail-24'],description:'No proof of final strand-by-strand equivalence or locking behavior.'}
]};
export function generateCandidate(spec=candidateA){
 const {cuffRadius:R,pitch,limbOffset:h,arcStep}=spec.parameters,base=[],roles=[],offsets=[];
 const push=(p,role,offset=[0,h,0])=>{if(base.length&&Math.hypot(...p.map((v,k)=>v-base.at(-1)[k]))<1e-8)return;base.push(p);roles.push(role);offsets.push(offset);};
 const line=(to,role,offset=[0,h,0])=>{const from=base.at(-1),old=offsets.at(-1),n=Math.max(1,Math.floor(Math.hypot(...to.map((v,k)=>v-from[k]))/.018));for(let i=1;i<=n;i++)push(lerp(from,to,i/n),role,lerp(old,offset,i/n));};
 push([-.17,-.19,-.12],'standing');line([-.08,-.14,-.02],'standing');
 const N=16;
 for(let i=0;i<=N;i++){const a=-Math.PI/2+i/N*2*Math.PI;push([-.08+.045*Math.cos(a),-.14+.022*i/N,.025+.045*Math.sin(a)],'locking-loop');}
 line([-.032,-R,0],'loop-root',[h,0,0]);
 for(let turn=0;turn<2;turn++){const n=Math.ceil(2*Math.PI/arcStep);for(let i=1;i<=n;i++){const a=2*Math.PI*i/n;push([-.032+pitch*(turn+i/n),-R*Math.cos(a),R*Math.sin(a)],`cuff-${turn}`,[h,0,0]);}}
 line([.066,-.15,-.03],'over-X',[h,0,0]);line([.066,-.07,0],'under-entry',[h,0,0]);
 line([-.062,-.07,0],'under-cuff',[0,0,h]);line([-.12,-.095,.02],'return-loop',[0,0,h]);line([-.08,-.17,.04],'return-loop',[0,0,h]);line([-.08,-.23,.08],'working-bight',[0,0,h]);
 const points=[],pointRoles=[];for(let i=0;i<base.length;i++){points.push(base[i].map((v,k)=>v+offsets[i][k]));pointRoles.push(roles[i]+'/0');}
 const foldStart=points.length-1,end=base.at(-1); // A broad return fold, not a zero-length join.
 points.push([end[0]-.025,end[1]-.025,end[2]+h],[end[0]-.045,end[1]-.04,end[2]],[end[0]-.025,end[1]-.025,end[2]-h]);pointRoles.push('fold','fold','fold');
 for(let i=base.length-1;i>=0;i--){points.push(base[i].map((v,k)=>v-offsets[i][k]));pointRoles.push(roles[i]+'/1');}
 const ledger=[];let start=0;for(let i=1;i<=points.length;i++)if(i===points.length||pointRoles[i]!==pointRoles[start]){ledger.push({id:pointRoles[start],start,end:i-1,u0:start/(points.length-1),u1:(i-1)/(points.length-1),status:'ASSUMED',dependencies:pointRoles[start].startsWith('cuff')?['rear-route','metric-layout','endpoint-map']:['loop-route','metric-layout','endpoint-map']});start=i;}
 return {schemaVersion:1,units:'m',coordinateSystem:'right-handed Z-up',ropes:[{id:'candidate-A',diameter:spec.diameter,points}],candidate:{spec,ledger,pointRoles,foldStart,geometryStatus:'UNVALIDATED',referenceStatus:'TOPOLOGY_UNVERIFIED'}};
}
export function validateCandidate(doc){
 const rope=doc.ropes[0],p=rope.points,n=p.length-1,r=rope.diameter/2,col=doc.candidate.spec.column;
 const result=detectCollisions(doc.ropes),pairs=[];let minimum=Infinity;
 for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){const c=closestSegments(p[i],p[i+1],p[j],p[j+1]),gap=c.distance-2*r;minimum=Math.min(minimum,gap);if(gap<=EPSILON)pairs.push({segmentA:`${rope.id}:${i}`,segmentB:`${rope.id}:${j}`,uA:(i+c.s)/n,uB:(j+c.t)/n,...c,gap,penetration:Math.max(0,-gap),classification:gap< -EPSILON?'unintended-penetration':'tangential-contact'});}
 // Conservative infinite cylinder: exact radial distance of each linear segment.
 const column=p.slice(0,-1).map((a,i)=>{const b=p[i+1],dy=b[1]-a[1],dz=b[2]-a[2],den=dy*dy+dz*dz,t=den?Math.max(0,Math.min(1,-(a[1]*dy+a[2]*dz)/den)):0,distance=Math.hypot(a[1]+t*dy,a[2]+t*dz),gap=distance-col.radius-r;return {segment:`${rope.id}:${i}`,u:(i+t)/n,distance,gap,penetration:Math.max(0,-gap),classification:gap< -EPSILON?'column-penetration':Math.abs(gap)<=EPSILON?'tangential-contact':'separated'};});
 const continuity=p.every(a=>a.length===3&&a.every(Number.isFinite))&&p.slice(1).every((a,i)=>Math.hypot(...a.map((v,k)=>v-p[i][k]))>0);
 const self=pairs.filter(x=>x.penetration>EPSILON),hits=column.filter(x=>x.penetration>EPSILON);
 const cuffs=doc.candidate.ledger.filter(x=>x.id.startsWith('cuff-'));
 const structuralConstraints=[{id:'two-wrap-four-run',satisfied:cuffs.length===4,evidenceState:'OBSERVED',modelAssignment:'ASSUMED'},{id:'continuous-folded-rope',satisfied:continuity,evidenceState:'INFERRED'},{id:'under-entire-cuff',satisfied:p.some((a,i)=>doc.candidate.pointRoles[i].startsWith('under-cuff')&&a[1]>-.08),evidenceState:'ASSUMED'},{id:'X-over-under-and-two-same-direction-loop-passages',satisfied:false,evidenceState:'UNRESOLVED',reason:'Waypoints alone do not establish signed crossing traversal. This construction is not accepted as the complete locking procedure.'}];
 return {status:!continuity||self.length||hits.length||structuralConstraints.some(x=>!x.satisfied)?'GEOMETRY_FAILED':'GEOMETRY_VALID_TOPOLOGY_UNVERIFIED',topologyInvalid:false,topologyVerified:false,continuity,segments:n,minimumRopeGap:minimum,minimumColumnGap:Math.min(...column.map(x=>x.gap)),selfPenetrations:self.length,columnPenetrations:hits.length,excludedAdjacentPairs:result.excluded.length,pairs,column,structuralConstraints,limitation:'Capsules exclude only immediate topological neighbors. Column test uses an infinite X cylinder conservatively. No geometry failure proves topology invalid.'};
}
export function generatePartialCuff(spec=candidateA){
 const p=[],roles=[],R=spec.parameters.cuffRadius,h=spec.parameters.limbOffset;
 const arm=sign=>{const a=[[-.032+sign*h,-.18,-.06],[-.032+sign*h,-R,0]];for(let i=1;i<=72;i++){const t=4*Math.PI*i/72;a.push([-.032+.064*i/72+sign*h,-R*Math.cos(t),R*Math.sin(t)]);}return a;};
 const a=arm(1),b=arm(-1);p.push(...a,[.064,-.13,.02],[.064,-.18,.02],[0,-.18,.02],[0,-.13,.02],...b.reverse());
 for(let i=0;i<p.length;i++)roles.push(i<a.length?'cuff-arm-0':i<a.length+4?'fold':'cuff-arm-1');
 return {schemaVersion:1,units:'m',coordinateSystem:'right-handed Z-up',ropes:[{id:'partial-cuff',diameter:spec.diameter,points:p}],candidate:{spec,ledger:[],pointRoles:roles,partial:true,referenceStatus:'ASSUMED_REAR_ROUTE',omitted:['locking-loop','over-X','under-cuff','return-loop']}};
}
