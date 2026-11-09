// Independent audit of a saved desktop fixture. Enumerate segment pairs from
// each saved geometry, without relying on the editor's stored gate results.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {certifyPairMotion} from '../src/rope-relax.js';
import {checkTube,makeTube} from '../src/rope-tube.js';
function independentAudit({initial,diameter,s0,pins,steps,column,localArc,gap,tolerance,radialSegments}) {
  const axisIndex='XYZ'.indexOf(column.axis);
  const axes=column.frame?.axes ?? [[1,0,0],[0,1,0],[0,0,1]];
  const solverAxes=[axes[axisIndex],axes[(axisIndex+1)%3],axes[(axisIndex+2)%3]];
  const local=p=>solverAxes.map(axis=>axis.reduce((v,x,k)=>v+x*(p[k]-column.center[k]),0));
  // Rotate the declared column axis onto the kernel's local X axis.
  let points=initial, accepted=0, tests=0, maxLengthError=0, pinDrift=0, maxTotalLengthError=0, invalidMotions=0;
  const surfaces=[];
  const dist=(a,b)=>Math.hypot(...a.map((x,k)=>x-b[k]));
  for(const frames of steps) {
    for(const next of frames) {
      const arc=[0],pairs=[];
      for(let i=1;i<points.length;i++) arc.push(arc[i-1]+dist(points[i-1],points[i]));
      for(let i=0;i<points.length-1;i++) for(let j=i+2;j<points.length-1;j++) {
        if(arc[j]-arc[i+1]>=localArc) pairs.push(i,j);
      }
      if(!certifyPairMotion(points.map(local).flat(),next.map(local).flat(),pairs,{floor:diameter+gap/2,tolerance,columnFloor:column.radius+diameter/2+gap/2})) invalidMotions++;
      for(let i=1;i<next.length;i++) maxLengthError=Math.max(maxLengthError,Math.abs(dist(next[i-1],next[i])-(s0[i]-s0[i-1])));
      const length=next.slice(1).reduce((sum,v,i)=>sum+dist(v,next[i]),0);
      maxTotalLengthError=Math.max(maxTotalLengthError,Math.abs(length-(s0.at(-1)-s0[0])));
      for(const i of pins) pinDrift=Math.max(pinDrift,dist(next[i],initial[i]));
      tests+=pairs.length/2; accepted++;points=next;
    }
    const {valid,selfIntersections,foldedFaces,columnPenetrations}=checkTube(makeTube(points,diameter/2,{radialSegments}),{column});
    surfaces.push({valid,selfIntersections,foldedFaces,columnPenetrations});
  }
  return {accepted,pairIntervals:tests,invalidMotions,maxLengthError,maxTotalLengthError,pinDrift,surfaces};
}
// Verify that each designated material vertex crosses the *interior* of the
// receiving aperture, then ends a full rope radius beyond its plane.
function measurePassage({initial,steps,indices,axis,origin,radius,diameter,sign}) {
  const absHeight=p=>sign*(p[axis]-origin[axis]);
  const radial=p=>Math.hypot(...p.map((v,k)=>k===axis?0:v-origin[k]));
  let prev=initial;
  const crossingRadii=new Map();
  for(const frames of steps) for(const next of frames) {
    for(const i of indices) {
      const a=prev[i],b=next[i],h=absHeight(a),j=absHeight(b);
      if(h<=0 && j>0) {
        const q=a.map((x,k)=>x+(b[k]-x)*(-h)/(j-h));
        crossingRadii.set(i,radial(q));
      } else if(h>=0 && j<0) crossingRadii.delete(i);
    }
    prev=next;
  }
  const farSide=Math.min(...indices.map(i=>absHeight(prev[i]))),maxRadius=Math.max(...crossingRadii.values());
  return {initialSide:Math.max(...indices.map(i=>absHeight(initial[i]))),minFinalDepth:farSide,
          crossed:crossingRadii.size,required:indices.length,maxCrossingRadius:maxRadius,
          success:indices.every(i=>absHeight(initial[i])<=-diameter/2 && crossingRadii.has(i))
             && maxRadius<=radius-diameter/2 && farSide>=diameter/2};
}

const digest=v=>createHash('sha256').update(v).digest('hex');
if(!process.argv[2])throw Error('Supply at least one rope-edit session JSON file');
for(const path of process.argv.slice(2)) {
  const bytes=readFileSync(path),s=JSON.parse(bytes),f=s.initialState;
  if(!['X','Y','Z'].includes(f.column?.axis))throw Error('Expected a declared column axis');
  const steps=s.steps.map(step=>step.accepted.map(frame=>frame.points));
  const indices=[...new Set(f.labels.flatMap((role,i)=>role==='bight'?[i,i+1]:[]))];
  const geometry=independentAudit({initial:f.points,steps,pins:f.pins,column:f.column,diameter:f.diameter,s0:f.s0,...s.parameters,tolerance:s.parameters.ccdTolerance});
  const passage=f.aperture ? measurePassage({initial:f.points,steps,indices,axis:1,origin:f.aperture.center,radius:f.aperture.radius,diameter:f.diameter,sign:1}) : null;
  const hashesMatch=s.steps.every(step=>digest(JSON.stringify(step.accepted.at(-1).points))===step.resultSha256);
  const verified=geometry.invalidMotions===0 && geometry.pinDrift===0 && geometry.maxLengthError<=s.parameters.lengthTolerance && geometry.surfaces.every(x=>x.valid) && (!passage || passage.success) && hashesMatch;
  console.log(JSON.stringify({file:path,verified,fileSha256:digest(bytes),hashesMatch,geometry,passage}));
  if(!verified)process.exitCode=1;
}
