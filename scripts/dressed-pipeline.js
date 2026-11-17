import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// Exit codes: 0 seed frozen (pose may stay UNVERIFIED), 2 seed not frozen, 1 a step threw.
function run(script){
  const result=spawnSync(process.execPath,[script],{stdio:'inherit'});
  if(result.error){console.error(result.error.message);return 1;}
  return result.status??1;
}
const generated=run('scripts/generate-somerville-dressed.js');
if(generated!==0)process.exit(1);
const evaluated=run('scripts/evaluate-somerville-dressed.js');
if(evaluated!==0&&evaluated!==2)process.exit(1);
const seed=JSON.parse(readFileSync('reports/somerville-dressed-seed.json','utf8'));
const pose=JSON.parse(readFileSync('reports/somerville-dressed-report.json','utf8'));
const summary={
  seedFrozen:seed.frozenLooseV3===true,
  penetratingPairs:seed.fixedPreset.penetratingPairs,
  tube:seed.fixedPreset.tube.valid,
  staticReconstruction:pose.staticReconstruction?.status??null,
  motionContinuity:pose.motionContinuity?.status??null,
  evaluatorExit:evaluated
};
console.log(JSON.stringify(summary));
process.exit(summary.seedFrozen?0:2);
