// Adaptive parameter continuation: every accepted step passes seed, tube and operation checks.
import {buildSomerville,seedClearance} from '../../../src/somerville-build.js';
import {makeTube,checkTube} from '../../../src/rope-tube.js';
import {validateOperations} from '../../../src/somerville-verify.js';
import {writeFileSync} from 'node:fs';
const base=buildSomerville({roundIterations:0}).somerville.config;delete base.roundIterations;delete base.fairing;const from={...base,...JSON.parse(process.argv[2])},to={...from,...JSON.parse(process.argv[3])};const minGap=+(process.argv[4]||0.0002),out=process.argv[5];
const mix=s=>Object.fromEntries(Object.keys({...from,...to}).map(k=>[k,k in to&&k in from?from[k]+(to[k]-from[k])*s:(to[k]??from[k])]));
function evaluate(o){try{const d=buildSomerville(o),sc=seedClearance(d);if(sc.penetratingPairs||sc.minimumNonlocalGap<minGap)return{ok:false,why:`seed gap ${(sc.minimumNonlocalGap*1000).toFixed(2)} ${Object.keys(sc.groups).slice(0,3)} closest ${sc.closest?.roles}`};if(sc.minimumColumnGap<minGap)return{ok:false,why:`column ${sc.minimumColumnGap}`};const ops=validateOperations(d).checks,bad=Object.keys(ops).filter(k=>!ops[k]);if(bad.length)return{ok:false,why:'ops '+bad};const r=checkTube(makeTube(d.ropes[0].points,d.ropes[0].diameter/2),{column:d.somerville.column});if(!r.valid)return{ok:false,why:`tube self ${r.selfIntersections} fold ${r.foldedFaces} col ${r.columnPenetrations}`};return{ok:true,d,gap:sc.minimumNonlocalGap,col:sc.minimumColumnGap,closest:sc.closest.roles};}catch(e){return{ok:false,why:'ERR '+e.message};}}
let s=0,h=1,best=null;
while(s<1&&h>1/64){const t=Math.min(1,s+h),r=evaluate(mix(t));if(r.ok){s=t;best=r;console.log(`ok s=${t.toFixed(4)} gap=${(r.gap*1000).toFixed(2)}mm col=${(r.col*1000).toFixed(2)}mm closest=${r.closest}`);h=Math.min(h*1.5,1);}else{console.log(`fail s=${t.toFixed(4)} ${r.why}`);h/=2;}}
const reached=mix(s);console.log('REACHED',s,JSON.stringify(reached));if(out&&best)writeFileSync(out,JSON.stringify(Object.fromEntries(Object.entries(reached).filter(([k,v])=>v!==base[k]))));
