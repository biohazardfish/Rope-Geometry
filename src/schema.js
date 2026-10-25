export function validateDocument(doc) {
  const fail = message => { throw new Error(`Invalid rope document: ${message}`); };
  if (!doc || doc.schemaVersion !== 1 || doc.units !== 'm' || doc.coordinateSystem !== 'right-handed Z-up') fail('expected schemaVersion 1, units m, right-handed Z-up');
  if (!Array.isArray(doc.ropes) || !doc.ropes.length) fail('ropes must be a non-empty array');
  const ids = new Set();
  for (const rope of doc.ropes) {
    if (!rope || typeof rope.id !== 'string' || !rope.id || ids.has(rope.id)) fail('rope IDs must be unique non-empty strings');
    ids.add(rope.id);
    if (!(Number.isFinite(rope.diameter) && rope.diameter > 0)) fail(`rope ${rope.id} diameter must be positive`);
    if (!Array.isArray(rope.points) || rope.points.length < 2 || rope.points.some(p => !Array.isArray(p) || p.length !== 3 || p.some(n => !Number.isFinite(n)))) fail(`rope ${rope.id} needs at least two finite xyz points`);
  }
  if (doc.animation !== undefined) {
    const frames = doc.animation.frames;
    if (!Array.isArray(frames) || frames.length < 2 || frames.some((f, i) => !Number.isFinite(f.time) || (i && f.time <= frames[i - 1].time))) fail('animation times must be finite and strictly increasing');
    for (const frame of frames) {
      if (!Array.isArray(frame.ropes) || frame.ropes.length !== doc.ropes.length) fail('animation rope layout changed');
      frame.ropes.forEach((r, i) => {
        if (r.id !== doc.ropes[i].id || !Array.isArray(r.points) || r.points.length !== doc.ropes[i].points.length || r.points.some(p => !Array.isArray(p) || p.length !== 3 || p.some(n => !Number.isFinite(n)))) fail('animation IDs, point counts, order and coordinates must match base geometry');
      });
    }
  }
  return doc;
}
export const parseDocument = text => validateDocument(JSON.parse(text));
export const serializeDocument = doc => JSON.stringify(validateDocument(doc), null, 2);

export function evaluateAt(doc, time) {
  validateDocument(doc);
  if (!doc.animation) return doc.ropes;
  const frames = doc.animation.frames;
  if (time <= frames[0].time) return frames[0].ropes.map((r, i) => ({ ...doc.ropes[i], points: r.points }));
  if (time >= frames.at(-1).time) return frames.at(-1).ropes.map((r, i) => ({ ...doc.ropes[i], points: r.points }));
  let i = 0;
  while (frames[i + 1].time < time) i++;
  const a = frames[i], b = frames[i + 1], t = (time - a.time) / (b.time - a.time);
  return a.ropes.map((rope, r) => ({ ...doc.ropes[r], points: rope.points.map((p, k) => p.map((x, axis) => x + (b.ropes[r].points[k][axis] - x) * t)) }));
}

export function sampleAnimation(doc, steps = 16) {
  if (!Number.isInteger(steps) || steps < 1) throw new Error('steps must be a positive integer');
  const [start, end] = [doc.animation.frames[0].time, doc.animation.frames.at(-1).time];
  const samples = [];
  for (let k = 0; k <= steps; k++) {
    const time = start + (end - start) * k / steps;
    const result = detectAt(doc, time);
    samples.push({ time, ...result });
  }
  return samples;
}
import { detectCollisions } from './geometry.js';
export function detectAt(doc, time) { return { time, ...detectCollisions(evaluateAt(doc, time)) }; }
