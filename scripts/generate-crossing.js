import { readFileSync, writeFileSync } from 'node:fs';
import { generateCrossing, validateGeneratedCrossing, generateConstrainedRope, validateTopologyGeometry, validateCrossingConstraints, validateConstrainedGeometry } from '../src/topology.js';
const read=name=>JSON.parse(readFileSync(`data/${name}`,'utf8'));
const save=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const single=read('crossing-topology.json');
const p2=generateCrossing(single),p2Report=validateGeneratedCrossing(p2,single);
if(!p2Report.valid)throw new Error('Phase 2 fixture regeneration failed');
p2.validation=p2Report;save('data/crossing-valid.json',p2);
const source=read('multiple-crossings-topology.json');
const inverted={...source,crossings:source.crossings.map((c,i)=>i===1?{...c,over:c.over==='A'?'B':'A'}:{...c})};
const cases=[['multiple-valid-A',source,1],['multiple-valid-B',inverted,1],['multiple-invalid',source,.22]];
const reports={};
for(const [name,topology,liftScale] of cases){
  const geometry=generateConstrainedRope(topology,{liftScale});
  const topologyReport=validateTopologyGeometry(geometry,topology);
  const crossingReport=validateCrossingConstraints(geometry,topology);
  const collisionReport=validateConstrainedGeometry(geometry,topology);
  const valid=topologyReport.valid&&crossingReport.valid&&collisionReport.valid;
  geometry.validation={topology:topologyReport,crossings:crossingReport,collisions:collisionReport,valid};
  reports[name]={topology:topologyReport,crossings:crossingReport,collisions:collisionReport,valid};
  save(`data/${name}.json`,geometry);
}
if(!reports['multiple-valid-A'].valid||!reports['multiple-valid-B'].valid)throw new Error(`Valid topology generation failed: ${JSON.stringify(reports)}`);
if(reports['multiple-invalid'].collisions.penetrationCount<1)throw new Error(`Negative control did not trigger collision detection: ${JSON.stringify(reports['multiple-invalid'])}`);
const a=read('multiple-valid-A.json'),b=read('multiple-valid-B.json');
if(JSON.stringify(a.ropes[0].points)===JSON.stringify(b.ropes[0].points))throw new Error('Changing over/under input did not change generated geometry');
save('phase3-report.json',reports);console.log(JSON.stringify(reports,null,2));
