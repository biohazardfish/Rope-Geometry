import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {generateCoreStage,validateCore,validateUnderCuff,validateColumn,integrateCore,recoverySpec} from '../src/phase5-recovery.js';
import {samplePolyline} from '../src/recovery-sampling.js';
import {validateCandidate} from '../src/phase5.js';

const out='reports/phase5-recovery',data='data/phase5-recovery';
mkdirSync(out,{recursive:true});mkdirSync(data,{recursive:true});
const read=p=>JSON.parse(readFileSync(p)),write=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const diagnosis=read(`${out}/diagnosis.json`),cuff=read('data/phase5-partial-cuff.json');
const preservation=Object.entries(diagnosis.hashes).map(([path,expected])=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),expected}));
if(preservation.some(x=>x.sha256!==x.expected))throw Error('Frozen source changed; stop recovery');
const stages=[];let latest;
for(let stage=1;stage<=4;stage++){
  const doc=generateCoreStage(stage),r=validateCore(doc),column=validateColumn(doc);
  const under=stage>=3?validateUnderCuff(doc,cuff):null;
  const gate=r.status==='LOCAL_FIXTURE_VALID_TOPOLOGY_UNVERIFIED'&&!column.penetrations.length&&(!under||under.satisfied);
  const result={...r,column,underCuff:under,stageGatePassed:gate};
  write(`${data}/stage-${stage}.json`,doc);write(`${out}/stage-${stage}.json`,result);
  stages.push(result);if(!gate)break;latest=doc;
}
let integration=null;
if(latest?.recovery.stage===4){
  const doc=integrateCore(latest,cuff),r=validateCore(doc),column=validateColumn(doc),under=validateUnderCuff(doc,cuff);
  const groups={};for(const c of r.pairs.filter(c=>c.state==='penetrating')){const key=[...c.roles].sort().join(' × ');groups[key]=(groups[key]??0)+1;}
  integration={...r,column,underCuff:under,collisionLocations:groups,topologyInvalid:false,topologyVerified:false,reason:'The unchanged core and cuff conflict at roots and at four new interface connectors. This is a failed embedding, not a demonstrated contradiction in the source topology.'};
  write(`${data}/integrated-trial.json`,doc);write(`${out}/integrated-trial.json`,integration);
}
const sampling={
  method:'Exact subdivision of saved polylines at factors 1,2,4,8; no smoothing, no altered epsilon or adjacency rule. Original-parent attribution NEVER removes collisions from raw results.',
  localCore:latest?samplePolyline(latest.ropes[0]):[],
  preservedPartialCuff:samplePolyline(cuff.ropes[0]),
  interpretation:'Base-resolution local core and cuff have zero reports. Refinement introduces same/adjacent-original-segment capsule overlaps under the unchanged index-based adjacency rule. They are not sampling-independent physical certificates. All original nonadjacent distances are compared, not only penetrations.'
};
write(`${out}/sampling.json`,sampling);
const unresolved=[
  {id:'core-cuff-embedding',status:'GEOMETRY_FAILED',detail:'Preserved cuff and fixed loop roots overlap, in addition to connector collisions. A later experiment needs explicit cuff attachment tangents and compatible loop-root placement; no whole-model adjustment was attempted here.'},
  {id:'right-handed-root-sign',status:'ASSUMED',detail:'The selected root-over-root sign and rigid frame are a reversible candidate assignment. PDF procedure does not bind all physical limbs to the target video.'},
  {id:'rear-and-endpoint-permutation',status:'UNRESOLVED',detail:'Phase 4B rear cuff and endpoint binding remain unchanged. No source evidence was upgraded.'},
  {id:'extra-crossings-and-locking',status:'UNRESOLVED',detail:'Four named local relations do not prove full crossing inventory, knot equivalence, or mechanical locking. New interface crossings have not been accepted as intended topology.'},
  {id:'sampling-policy',status:'LIMITATION',detail:'Only immediate segment adjacency is exempt. Raw results depend on segmentation. Fine-sampling raw failures remain visible; neither thresholds nor exclusions were changed.'}
];
const ledger=latest?latest.recovery.segmentRoles.reduce((a,role,i)=>{if(a.at(-1)?.role===role)a.at(-1).lastSegment=i;else a.push({role,firstSegment:i,lastSegment:i,evidenceState:'ASSUMED_EMBEDDING'});return a;},[]):[];
write(`${out}/local-core-material-ledger.json`,{order:'E0 → standing limb 0 → fixture substitute → working limb 0 → fold → working limb 1 reversed → fixture substitute → standing limb 1 reversed → E1',ledger});
const cuffCheck=validateCandidate(cuff);
cuffCheck.status=cuffCheck.continuity&&!cuffCheck.selfPenetrations&&!cuffCheck.columnPenetrations?'VALID_PARTIAL_CUFF_AT_ORIGINAL_SAMPLING':'GEOMETRY_FAILED';
const summary={phase5Accepted:false,outcome:integration?'LOCAL_CORE_RECOVERED_INTEGRATION_FAILED':'INCREMENTAL_CORE_BLOCKED',spec:recoverySpec,preservation,diagnosis:{count:diagnosis.classification.length,counts:diagnosis.counts,sampling:diagnosis.sampling},stages:stages.map(s=>({stage:s.stage,status:s.status,stageGatePassed:s.stageGatePassed,segments:s.segments,selfPenetrations:s.selfPenetrations,minimumGap:s.minimumGap,columnMinimumGap:s.column.minimumGap,underCuffMinimumGap:s.underCuff?.minimumGap??null})),integration:integration?{status:integration.status,segments:integration.segments,selfPenetrations:integration.selfPenetrations,maximumPenetration:integration.maximumPenetration,columnPenetrations:integration.column.penetrations.length,collisionLocations:integration.collisionLocations}:null,mostAdvancedLocalGeometry:latest?`${data}/stage-${latest.recovery.stage}.json`:null,preservedPartialCuff:cuffCheck,unresolved};
write(`${out}/summary.json`,summary);
const mm=x=>(x*1000).toFixed(6);
writeFileSync(`${out}/README.md`, `# Phase 5 Recovery — local core recovered, integration failed

Phase 5 is **NOT accepted**. This is a bounded recovery experiment, not a verified Somerville Bowline.

## Frozen baseline: all 36 pairs diagnosed before any construction

- 17 insufficient-clearance pairs, 6 sharp-return pairs, 13 doubled-arm offset/routing defects.
- Every pair, original segment IDs, structural roles, closest points and penetration are in [diagnosis.json](diagnosis.json) and [collisions.csv](collisions.csv).
- These are geometric attributions. The old missing signed X and double passage are an incomplete routing specification, not proof that all 36 collisions have a topological cause.
- None of the original 36 disappears on exact subdivision. Their maximum distance discrepancy is ${Math.max(...diagnosis.sampling.map(s=>s.maxDistanceDifferenceOnOriginal36M))} m; maximum penetration remains 9.060448 mm.
- Raw pair counts at 1× / 2× / 4× / 8× are ${diagnosis.sampling.map(s=>s.rawPenetratingPairs).join(' / ')}. Newly exposed local capsule overlaps account for the growth. Coarsening does not demonstrate improvement.

## Incremental local construction

The source is the local Topologist PDF, pages 1–3. Page 1 introduces the wrap/transfer construction; page 2 explicitly allows forming the standing loop directly, then gives over-X and under-entire-cuff; page 3 requires the same return direction. No double-column or optional finishing hitch is imported.

All metric coordinates, the signed loop-root assignment, physical limb pairing and rigid frame are **ASSUMED**. The unchanged Phase 4B evidence layer is authoritative about what has actually been observed.

The exported local model is one open, continuous physical polyline with two endpoints and one working fold. A labelled remote fixture connector temporarily substitutes for the cuff. It is not a second rope and is not a reconstructed cuff. Underpass measurements use the exact saved cuff arcs as external test obstacles. The integration trial removes that substitute.

| Stage | Added relation | Self penetrations | Minimum rope gap (mm) | Minimum column gap (mm) | Gate |
|---|---|---:|---:|---:|---|
${stages.map((s,i)=>`| ${s.stage} | ${['Standing loop + first passage','Bight over X','Under the four saved cuff runs','Same-direction return'][i]} | ${s.selfPenetrations} | ${mm(s.minimumGap)} | ${mm(s.column.minimumGap)} | ${s.stageGatePassed?'PASS (local scope)':'FAIL'} |`).join('\n')}

The four strand-pair root crossings and eight over-X crossings are measured from geometry. Each working limb has two signed +1 passages relative to the chosen loop aperture. Along E0→E1 the return limb has -1 material direction, correctly distinguished from working-bight direction. Material operation order is checked separately.

The underpass crosses all four front cuff lanes for each working limb, with ${stages.at(-1)?.underCuff?mm(stages.at(-1).underCuff.minimumGap):'N/A'} mm minimum surface gap. A shallower attempt had 1.119029 mm penetration despite apparently positive projected clearance; its full failed record is preserved in attempts/.

The loop aperture is an explicit interior region in the chosen local projection, not a source-derived metric surface or proof of knot equivalence. These checks establish the specified local relations in this candidate; they do not certify complete knot topology or mechanical locking.

## Integration trial

The exact 144 saved cuff arc segments were inserted with their coordinates and order unchanged; only four interface connector paths were introduced. The core was not refitted. The global result is **${integration?.status??'NOT_ATTEMPTED'}**, with **${integration?.selfPenetrations??'N/A'} penetrating pairs**, maximum penetration **${integration?mm(integration.maximumPenetration):'N/A'} mm**, and **${integration?.column.penetrations.length??'N/A'} column penetrations**. Full pair-level data and locations are in [integrated-trial.json](integrated-trial.json).

This is a failed geometric construction. No demonstrated topological contradiction is claimed. The previously valid cuff is untouched; the most advanced new local geometry is [stage-4.json](../../data/phase5-recovery/stage-4.json), which is not an integrated knot.

## Sampling limitations

[sampling.json](sampling.json) includes 1×/2×/4×/8× checks for the new core and preserved cuff. All raw hits remain reported. Zero at their declared original discretizations is not a sampling-independent certificate. Original-parent grouping explains the new local overlaps; it is never an acceptance exclusion.

## Remaining constraints

${unresolved.map(x=>`- **${x.id} — ${x.status}:** ${x.detail}`).join('\n')}

## Reproduce and inspect

- npm run report:recovery — frozen diagnosis, incremental gates, exported stages, sampling and integration report.
- npm test — prior tests plus recovery positive and negative controls.
- npx vite build — viewer build.
- Existing Phase 5 viewer: choose recovery local core or failed integration. All original options remain.
- No animation, tightening, physical simulation, material changes or collision-engine changes.
`);
console.log(JSON.stringify({outcome:summary.outcome,stages:summary.stages,integration:summary.integration,sampling},null,2));
