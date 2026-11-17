import {buildSomerville,seedClearance} from '../../../src/somerville-build.js';
import {makeTube,checkTube} from '../../../src/rope-tube.js';
import {validateOperations} from '../../../src/somerville-verify.js';
const opts=JSON.parse(process.argv[2]||'{}');
const t0=Date.now();const d=buildSomerville(opts);const s=seedClearance(d);delete s.hits;
const p=d.ropes[0].points,L=d.ropes[0].segmentLabels,mesh=makeTube(p,d.ropes[0].diameter/2);
const r=checkTube(mesh,{column:d.somerville.column});
const seg=f=>Math.floor(f/24);
const pairs={};for(const [a,b] of r.intersectionPairs){const k=[L[seg(a)]+'@'+seg(a),L[seg(b)]+'@'+seg(b)].join(' x ');pairs[k]=(pairs[k]||0)+1;}
// folded faces: list segments
const folded=[];mesh.indices.forEach((ids,i)=>{const tri=ids.map(k=>mesh.vertices[k]);const a=tri[1].map((v,k)=>v-tri[0][k]),b=tri[2].map((v,k)=>v-tri[0][k]);const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const e=mesh.expectedNormals[i];if(Math.hypot(...n)<1e-14||n[0]*e[0]+n[1]*e[1]+n[2]*e[2]<=0)folded.push(seg(i));});
const fs=[...new Set(folded)].map(i=>L[i]+'@'+i);
// curvature radius min per label
const curv={};for(let i=1;i<p.length-1;i++){const a=p[i-1],b=p[i],c=p[i+1];const ab=Math.hypot(...b.map((v,k)=>v-a[k])),bc=Math.hypot(...c.map((v,k)=>v-b[k])),ac=Math.hypot(...c.map((v,k)=>v-a[k]));const s2=(ab+bc+ac)/2,area=Math.sqrt(Math.max(0,s2*(s2-ab)*(s2-bc)*(s2-ac)));const R=area>1e-18?ab*bc*ac/(4*area):Infinity;const l=L[i];if(!(l in curv)||R<curv[l].R)curv[l]={R,i};}
const tight=Object.entries(curv).filter(([,v])=>v.R<0.004).map(([k,v])=>`${k}:${(v.R*1000).toFixed(2)}mm@${v.i}`);
console.log(JSON.stringify({opts,points:p.length,seed:{gap:s.minimumNonlocalGap,pen:s.penetratingPairs,groups:s.groups,closest:s.closest},tube:{valid:r.valid,self:r.selfIntersections,folded:r.foldedFaces,col:r.columnPenetrations,minCol:r.minimumColumnGap},pairs,foldedSegs:fs.slice(0,40),tight,ops:validateOperations(d).checks,ms:Date.now()-t0},null,1));
