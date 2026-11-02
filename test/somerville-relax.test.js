import test from 'node:test';
import assert from 'node:assert/strict';
import { relaxRope } from '../src/somerville-relax.js';

const line = (a, b, steps) => Array.from({ length: steps + 1 }, (_, i) => a.map((v, k) => v + (b[k] - v) * i / steps));
const join = (...parts) => parts.reduce((all, part) => all.concat(all.length ? part.slice(1) : part), []);

test('a strong target cannot pull one strand through another in a single step or over many', () => {
  const z = 0.2, under = line([-0.05, 0, z], [0.05, 0, z], 50);
  const rope = join(under, line([0.05, 0, z], [0.05, 0, z + 0.04], 20), line([0.05, 0, z + 0.04], [0, -0.05, z + 0.04], 36), line([0, -0.05, z + 0.04], [0, -0.05, z + 0.01], 15), line([0, -0.05, z + 0.01], [0, 0.05, z + 0.01], 50));
  const over = rope.map((_, i) => i).slice(-51);
  const r = relaxRope(rope, { iterations: 120, targets: [{ indices: over, positions: over.map((i) => [rope[i][0], rope[i][1], z - 0.01]), axes: [2], weight: 0.9 }] });
  const middle = r.points[over[25]], base = r.points[25];
  assert.ok(middle[2] - base[2] >= 0.006 - 1e-6, `strand passed through: ${middle[2] - base[2]}`);
  assert.equal(r.rejected, 0);
});

test('an unloaded straight rope keeps its segment lengths and position', () => {
  const rope = line([-0.05, 0.1, 0.1], [0.05, 0.1, 0.1], 100), r = relaxRope(rope, { iterations: 50 });
  assert.ok(r.maxStretch < 1e-9);
  assert.ok(r.points.every((p, i) => Math.hypot(...p.map((v, k) => v - rope[i][k])) < 1e-9));
});
