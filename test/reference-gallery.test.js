import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyEvidence,groupReferenceEvidence} from '../src/reference-gallery.js';
const load=()=>JSON.parse(readFileSync(new URL('../data/somerville-bowline-topology-v2.json',import.meta.url),'utf8'));

test('reference gallery displays every inspected evidence image exactly once',()=>{
 const t=load(),groups=groupReferenceEvidence(t.evidence),items=Object.values(groups).flat();
 assert.equal(items.length,90);assert.equal(new Set(items.map(e=>e.id)).size,90);
 assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),{original:11,detail:25,untie:7,duchyVideo:30,nonTarget:5,topologistVideo:12});
});

test('reference gallery keeps construction, untying, creator video and non-target chapters separate',()=>{
 const t=load(),by=id=>classifyEvidence(t.evidence.find(e=>e.id===id));
 assert.equal(by('100427-D0020'),'original');assert.equal(by('duchy-detail-24'),'detail');assert.equal(by('duchy-untie-5'),'untie');
 assert.equal(by('duchy-t148'),'duchyVideo');assert.equal(by('duchy-t149'),'nonTarget');assert.equal(by('topologist-t120'),'topologistVideo');
});
