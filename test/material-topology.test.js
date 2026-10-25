import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnoseMaterialGraph,validateMaterialTopology,renderMaterialSvg} from '../src/material-topology.js';
const load=()=>JSON.parse(readFileSync(new URL('../data/somerville-bowline-topology-v2.json',import.meta.url),'utf8'));
const reject=mutate=>{const t=load();mutate(t);const r=validateMaterialTopology(t);assert.equal(r.inventoryValid,false,JSON.stringify(r));assert.equal(r.referenceStatus,'INCOMPLETE');};
// This abstract three-edge path tests the graph algorithm, not the photographed knot.
const chain=()=>({nodes:[{id:'E0',kind:'physical-end'},{id:'n',kind:'material'},{id:'fold',kind:'fold'},{id:'E1',kind:'physical-end'}],segments:[{id:'a',fromNode:'E0',toNode:'n'},{id:'b',fromNode:'n',toNode:'fold'},{id:'c',fromNode:'fold',toNode:'E1'}],endpoints:['E0','E1'],foldNode:'fold',orderedMaterialPath:['a','b','c']});

test('Phase 4B records consistent partial evidence without certifying a complete rope',()=>{
 const t=load(),before=JSON.stringify(t),r=validateMaterialTopology(t);
 assert.equal(r.inventoryValid,true,r.errors.join(';'));
 assert.equal(r.completeMaterialPath,false);assert.equal(r.referenceStatus,'INCOMPLETE');assert.equal(r.topologyVerified,false);
 assert.equal(r.observedGraph.components,9);assert.equal(r.observedGraph.openPorts.length,14);assert.equal(r.observedGraph.foldValid,true);
 assert.equal(r.finalCrossingInventoryComplete,false);assert.equal(r.finalCrossingsRecorded,0);assert.equal(r.constructionCrossingsRecorded,2);
 assert.equal(t.legacyReview.length,12);assert.equal(JSON.stringify(t),before);
});
test('Phase 4B independent graph check accepts a single path and rejects lost fold, branches, disconnected fragments, and changed order',()=>{
 assert.equal(diagnoseMaterialGraph(chain()).complete,true);
 for(const mutate of [s=>s.nodes.find(n=>n.id==='fold').kind='material',s=>s.segments.push({id:'extra',fromNode:'n',toNode:'E1'}),s=>s.nodes.push({id:'isolated',kind:'material'}),s=>s.orderedMaterialPath=['b','a','c'],s=>s.endpoints=['n','E1'],s=>s.segments[1].toNode='missing']){
  const s=chain();mutate(s);assert.equal(diagnoseMaterialGraph(s).complete,false);
 }
});
test('Phase 4B catches missing fold and structurally misconnected cuff fragments',()=>{
 reject(t=>t.states[0].nodes.find(n=>n.id==='fold').kind='open-observation-port');
 reject(t=>t.states[0].segments.find(s=>s.id==='C1').toNode=t.states[0].segments.find(s=>s.id==='C2').toNode);
 reject(t=>t.column.cuffIds[0]='T0');reject(t=>t.column.cuffIds[0]='C2');
 // A swap of unknown rear connections cannot be disproved visually by this program;
 // no such connections are invented in this partial dataset.
});
test('Phase 4B rejects changed crossing order, lost visits, and wrong O/U',()=>{
 reject(t=>t.crossings[0].visits[0].localOrder=3);
 reject(t=>t.crossings[0].visits.pop());
 reject(t=>t.crossings[0].visits[0].overUnder='under');
 reject(t=>t.crossings[0].visits[0].materialOrdinal=-1);
 reject(t=>t.crossings[1].visits[0].localOrder=1);
 reject(t=>t.crossings[0].visits[0].materialOrdinal=0);
});
test('Phase 4B rejects construction crossing contamination of the completed state',()=>{
 reject(t=>t.crossings[0].stateId='FINAL');
 reject(t=>t.crossings[0].projectionId='invented-view');
});
test('Phase 4B rejects missing evidence, invalid statuses, and unsupported winding sign',()=>{
 reject(t=>t.evidence=t.evidence.filter(e=>e.id!=='duchy-detail-8'));
 reject(t=>t.claims[0].evidence=[]);
 reject(t=>t.claims[0].status='VERIFIED');
 reject(t=>t.column.materialWindingSign=1);
 reject(t=>t.evidence[0].source='missing-source');
});
test('Phase 4B approval flags cannot turn an incomplete observation graph into a verified path',()=>{
 const t=load();t.review.decision='SUPPORTED';t.review.humanApproved=true;t.review.completeMaterialPathSupported=true;t.review.sourceEquivalenceSupported=true;t.claims.forEach(c=>c.status='SUPPORTED');
 const r=validateMaterialTopology(t);assert.equal(r.referenceStatus,'INCOMPLETE');assert.equal(r.completeMaterialPath,false);assert.equal(r.topologyVerified,false);
});
test('Phase 4B diagrams share fragment and crossing IDs without inventing a final traversal',()=>{
 const t=load(),before=JSON.stringify(t);
 for(const v of t.views){const svg=renderMaterialSvg(t,v.id);assert.match(svg,/PARTIAL EVIDENCE/);assert.match(svg,/no complete E0/);}
 const svg=renderMaterialSvg(t,'construction');for(const c of t.crossings)assert.ok(svg.includes(`data-crossing="${c.id}"`));
 assert.equal((svg.match(/data-crossing=/g)||[]).length,2);
 assert.ok((svg.match(/data-unknown-crossing=/g)||[]).length>0,'Unreviewed drawing overlaps must not imply O/U');
 const final=renderMaterialSvg(t,'completed');assert.equal((final.match(/data-crossing=/g)||[]).length,0);assert.match(final,/UNRESOLVED/);
 for(const s of t.states[0].segments)assert.ok(final.includes(`data-segment="${s.id}"`));
 assert.match(renderMaterialSvg(t,'material'),/NOT an end-to-end material sequence/);
 assert.equal((renderMaterialSvg(t,'material').match(/data-open-port=/g)||[]).length,14);
 assert.equal((renderMaterialSvg(t,'material').match(/data-fold=/g)||[]).length,1);
 assert.equal(JSON.stringify(t),before);
});
