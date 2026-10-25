import { readFileSync, writeFileSync } from 'node:fs';
import { parseDocument, sampleAnimation, detectAt } from '../src/schema.js';
import { detectCollisions } from '../src/geometry.js';
const load=n=>parseDocument(readFileSync(new URL(`../data/${n}.json`,import.meta.url),'utf8'));
const a=load('experiments'), b=load('B'), c=load('C');
const parallel=y=>detectCollisions([{id:'left',diameter:.01,points:[[-.05,0,0],[.05,0,0]]},{id:'right',diameter:.01,points:[[-.05,y,0],[.05,y,0]]}]);
const sampled=sampleAnimation(c,16), max=sampled.flatMap(s=>s.collisions.map(x=>({time:s.time,penetration:x.penetration}))).sort((x,y)=>y.penetration-x.penetration)[0];
const result={A:{separated:parallel(.012),penetrating:parallel(.008),contact:parallel(.01)},B:detectCollisions(b.ropes),C:{start:detectAt(c,0),end:detectAt(c,1),analyticMid:detectAt(c,.4),sampledMax:max,endpointOnlyMisses:true},D:{fixture:a.ropes.map(r=>r.id)}};
writeFileSync('report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
