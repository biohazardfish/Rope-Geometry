import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCrossings} from '../src/somerville-pose-fit.js';
import {unexplainedVisible} from '../src/somerville-pose-targets.js';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {evaluateSomervilleDressed} from '../scripts/evaluate-somerville-dressed.js';

// Independent review regressions: change discretization, not the embedded curve.
test('a reviewed crossing survives subdivision through the crossing itself', () => {
  const annotation={nominalVisibleRopeDiameterPx:30,crossings:[{
    id:'known-cross',positionPx:[0,0],uncertaintyPx:1,bindingStatus:'reviewed',
    over:{role:'over'},under:{role:'under'},
  }]};
  const camera={projection:'orthographic',pixelsPerMetre:5000,originPixel:[0,0],rollRadians:0};
  const coarse={points:[[-.01,-.01,0],[.01,-.01,0],[0,.01,-.01],[0,.01,.01]],labels:['over','join','under']};
  const split={points:[[-.01,-.01,0],[0,-.01,0],[.01,-.01,0],[0,.01,-.01],[0,.01,0],[0,.01,.01]],labels:['over','over','join','under','under']};
  for(const geometry of [coarse,split]){
    const result=evaluateCrossings({annotation,camera,...geometry});
    assert.equal(result.status,'PASS',JSON.stringify(result));
    assert.equal(result.crossings[0].residualPx,0);
  }
});

test('extra visible length cannot disappear by densely sampling a slanted straight rope', () => {
  const camera={projection:'orthographic',pixelsPerMetre:1000,originPixel:[100,100],rollRadians:0};
  const annotation={imageSize:[300,300],nominalVisibleRopeDiameterPx:6,visiblePolylines:[]};
  for(const n of [2,11,101]){
    const points=Array.from({length:n},(_,i)=>[.1*i/(n-1),.1*i/(n-1),0]);
    const result=unexplainedVisible(points,Array(n-1).fill('line'),{},annotation,camera,{columnRadius:0});
    assert.ok(Math.abs(result.lengthPx-100)<.01,`${n} samples: ${result.lengthPx} px`);
  }
});

test('self-consistent short material coordinates do not satisfy the fixed Somerville total', () => {
  const dir=mkdtempSync(join(tmpdir(),'dressed-independent-'));
  try{
    const candidatePath=join(dir,'short.json');
    writeFileSync(candidatePath,JSON.stringify({schemaVersion:1,units:'m',coordinateSystem:'right-handed Z-up',
      ropes:[{id:'short',diameter:.006,points:[[0,-1,0],[0,-7,0]],segmentLabels:['tail/0']}],
      somerville:{materialArc:[0,6],column:{axis:'X',center:[0,0,0],radius:.0275}},
    }));
    const report=evaluateSomervilleDressed({candidatePath,seedPaths:[],reportPath:join(dir,'report.json'),write:false});
    assert.equal(report.staticReconstruction.checks.materialLength,'FAIL');
    assert.ok(Math.abs(report.material.totalLengthResidual-(6-7.138936637394829))<1e-9);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
