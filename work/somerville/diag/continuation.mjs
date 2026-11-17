import {buildSomerville,seedClearance} from '../../../src/somerville-build.js';
import {makeTube,checkTube} from '../../../src/rope-tube.js';
import {validateOperations} from '../../../src/somerville-verify.js';
const loose={frontLift:0,underLift:.0102,cuffExitX:1,returnDepth:2,passBack:.8,cuffLift:.03,cuffWidth:.06,spread:.01,loopRadius:.04,coreDepth:.10,bightReach:.16,rootLift:.028};
const tight=JSON.parse(process.argv[2]);const svals=(process.argv[3]||'0.25,0.5,0.75,1').split(',').map(Number);
for(const s of svals){const o={};for(const k in tight)o[k]=loose[k]+(tight[k]-loose[k])*s;let line=`s=${s} `+JSON.stringify(Object.fromEntries(Object.entries(o).map(([k,v])=>[k,+v.toFixed(4)])));
 try{const d=buildSomerville(o),sc=seedClearance(d);line+=` seedPen=${sc.penetratingPairs} gap=${(sc.minimumNonlocalGap*1000).toFixed(2)}mm col=${(sc.minimumColumnGap*1000).toFixed(2)}mm`;if(!sc.penetratingPairs){const r=checkTube(makeTube(d.ropes[0].points,.003),{column:d.somerville.column});line+=` tube self=${r.selfIntersections} fold=${r.foldedFaces} col=${r.columnPenetrations}`;}else line+=' '+JSON.stringify(sc.groups);const ops=validateOperations(d).checks;line+=' opsFail='+Object.keys(ops).filter(k=>!ops[k]);}catch(e){line+=' ERR '+e.message;}console.log(line);}
