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

test('a step that would fold the rope sharper than its radius is shortened', () => {
  const rope = line([-0.04, 0.08, 0.08], [0.04, 0.08, 0.08], 20);
  const mid = 10;
  const r = relaxRope(rope, {
    iterations: 1, maxStep: 0.05, bendSmoothing: 0, minBendRadius: 1e-4, sweeps: 1,
    targets: [{ indices: [mid], positions: [[0, 0.08, 0.12]], weight: 1 }],
  });
  let worst = Infinity;
  for (let i = 1; i < r.points.length - 1; i++) {
    const a = r.points[i - 1], b = r.points[i], c = r.points[i + 1];
    const u = b.map((v, k) => v - a[k]), w = c.map((v, k) => v - b[k]);
    const lu = Math.hypot(...u), lw = Math.hypot(...w);
    const ang = Math.acos(Math.max(-1, Math.min(1, u.reduce((s, v, k) => s + v * w[k], 0) / (lu * lw))));
    worst = Math.min(worst, ang < 1e-8 ? Infinity : (lu + lw) / 2 / ang);
  }
  assert.ok(worst >= 0.003 - 1e-6, `bend radius ${worst} dropped below the rope radius`);
});

test('an unloaded straight rope keeps its segment lengths and position', () => {
  const rope = line([-0.05, 0.1, 0.1], [0.05, 0.1, 0.1], 100), r = relaxRope(rope, { iterations: 50 });
  assert.ok(r.maxStretch < 1e-9);
  assert.ok(r.points.every((p, i) => Math.hypot(...p.map((v, k) => v - rope[i][k])) < 1e-9));
});
