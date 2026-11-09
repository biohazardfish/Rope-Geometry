import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyGeometry} from '../src/verification.js';
import {samplePolyline} from '../src/recovery-sampling.js';
import {assessIntegratedRepair} from '../src/integration-repair.js';
import {auditSomervilleReadiness} from '../src/gauss-evidence.js';
const read=p=>JSON.parse(readFileSync(p));
const column={axis:'X',center:[0,0,0],radius:.055,length:.36};
const fixtures=[['data/crossing-valid.json',0,null],['data/multiple-valid-A.json',0,null],['data/multiple-valid-B.json',0,null],['data/phase5-candidate-A.json',36,column],['data/phase5-recovery/stage-4.json',0,column],['data/phase5-recovery/integrated-trial.json',74,column]];
const rows=fixtures.map(([path,expected,column])=>{
  const doc=read(path),r=verifyGeometry(doc,{column});
  const {pairs,columnPairs,...summary}=r;
  return {path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),expectedPenetrations:expected,regressionPassed:r.selfPenetrations===expected&&r.continuity&&r.columnPenetrations===0,...summary};
});
const core=read('data/phase5-recovery/stage-4.json');
const report={schemaVersion:1,claim:'Reproducible numerical regression, NOT Somerville acceptance',fixtures:rows,
  source:auditSomervilleReadiness(read('data/somerville-bowline-topology-v2.json'),read('data/somerville-gauss-review.json')),
  subdivision:samplePolyline(core.ropes[0],[1,2,4]),
  integration:assessIntegratedRepair(core,read('data/phase5-partial-cuff.json'))};
mkdirSync('reports/verification',{recursive:true});
writeFileSync('reports/verification/current.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({regressionsPassed:rows.every(r=>r.regressionPassed),fixtures:rows.map(r=>({path:r.path,gap:r.minimumRopeGap,penetrations:r.selfPenetrations})),sourceReady:report.source.ready,integration:report.integration.obstacle},null,2));
if(!rows.every(r=>r.regressionPassed)||!report.integration.localSignedConstraintsHold||report.integration.whole?.selfPenetrations!==74)process.exitCode=1;
