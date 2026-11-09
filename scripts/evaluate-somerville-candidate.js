import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRopeState,materialResiduals} from '../src/rope-state.js';
import {makeTube,checkTube} from '../src/rope-tube.js';
import {seedClearance} from '../src/somerville-build.js';
import {validateOperations} from '../src/somerville-verify.js';
import {correspondenceSpans,worldByTargetId,unexplainedVisible} from '../src/somerville-pose-targets.js';
import {fitPoseCamera,scorePose} from '../src/somerville-pose-fit.js';
import {evaluateAcceptance} from '../src/rope-acceptance.js';

export function evaluateSomervilleCandidate(){
 const doc=JSON.parse(readFileSync('data/somerville-final/continuation.json','utf8')),rope=doc.ropes[0],m=doc.somerville;
 const source=readFileSync('data/somerville-final/loose-v2.json'),reference=JSON.parse(source),referenceId=createHash('sha256').update(source).digest('hex');
 const stored=m.material,s0=reference.somerville.materialArc;
 const matches=stored?.referenceId===referenceId&&JSON.stringify(stored.s0)===JSON.stringify(s0)&&rope.points.length===s0.length;
 const state=createRopeState(rope.points,{diameter:rope.diameter,materialCoordinates:s0,column:m.column,referenceId}),material=materialResiduals(state);
 const lineage={...m.lineage,status:matches?'REFERENCE_PRESERVED':'FAIL',referenceId,continuousMotion:m.lineage?.continuousMotion??'UNVERIFIED'};
 const annotation=JSON.parse(readFileSync('data/somerville-pose148.json','utf8'));
 let spans={},camera={projection:'orthographic',pixelsPerMetre:5000,originPixel:[460,555],rollRadians:0},correspondenceError=null;
 try{spans=correspondenceSpans(doc,annotation);camera=fitPoseCamera(worldByTargetId(rope.points,spans),annotation).camera;}catch(e){correspondenceError=e.message;spans={};}
 const score=scorePose(worldByTargetId(rope.points,spans),annotation,camera),extra=unexplainedVisible(rope.points,rope.segmentLabels,spans,annotation,camera,{columnRadius:m.column.radius});
 const tube=checkTube(makeTube(rope.points,rope.diameter/2),{column:m.column}),clearance=seedClearance(doc),operations=validateOperations(doc,{scope:'final'});
 const acceptance=evaluateAcceptance({tube,operations,pose:score,unexplainedVisible:extra,clearance,material,lineage});
 const report={...acceptance,lineage,material,correspondenceError,pose:score,crossingPose:score.crossingPose,camera,unexplainedVisible:{count:extra.count,maxDistancePx:extra.maxDistancePx,byRole:extra.byRole},tube,clearance,operations,limitations:['Full swept tube motion remains unverified.','Root-branch correspondence and final crossing positions are not accepted.','Current shape is a bounded continuation candidate, not the 148-second posture.']};
 m.stage='material-continuation-candidate';m.pose={annotation:'data/somerville-pose148.json',camera,spans};m.acceptance={...acceptance,geometry:tube.valid?'PASS':'FAIL',operations:operations.valid?'PASS':'FAIL',pose:score.centerlinePose.status};m.lineage=lineage;
 writeFileSync('data/somerville-final/final.json',JSON.stringify(doc)+'\n');writeFileSync('reports/somerville-final-report.json',JSON.stringify(report,null,2)+'\n');
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(evaluateSomervilleCandidate().checks));
