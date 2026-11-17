import test from 'node:test';
import assert from 'node:assert/strict';
import { robustClosestSegments as distance } from '../src/robust-distance.js';

test('near-parallel interior intersection is retained across metric scales', () => {
  for (const scale of [1e-6, 1, 1e6]) {
    const p=[[0,0,0],[1,0,0],[0,-1e-8,0],[1,1e-8,0]].map(p=>p.map(x=>x*scale));
    const r=distance(...p);
    assert.ok(r.distance<scale*1e-15);
    assert.ok(Math.abs(r.s-.5)<1e-12 && Math.abs(r.t-.5)<1e-12);
  }
});
test('distance handles parallel, endpoint, degenerate, reversal and skew cases', () => {
  const cases=[
    [[[0,0,0],[1,0,0],[0,2,0],[1,2,0]],2],
    [[[0,0,0],[1,0,0],[2,1,0],[2,2,0]],Math.SQRT2],
    [[[0,0,0],[0,0,0],[0,3,4],[0,3,4]],5],
    [[[-1,0,0],[1,0,0],[0,-1,2],[0,1,2]],2],
  ];
  for(const [p,expected] of cases) {
    for(const q of [p,[p[2],p[3],p[0],p[1]],[p[1],p[0],p[3],p[2]]])
      assert.ok(Math.abs(distance(...q).distance-expected)<1e-12);
  }
  assert.throws(()=>distance([NaN,0,0],[0,0,0],[0,0,0],[1,0,0]),/finite/);
});
