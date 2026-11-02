import { readFileSync } from 'node:fs';
import { auditSomervilleReadiness } from '../src/gauss-evidence.js';
const read=(p)=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const report=auditSomervilleReadiness(read('../data/somerville-bowline-topology-v2.json'),read('../data/somerville-gauss-review.json'));
console.log(JSON.stringify(report,null,2));
// This reports an intentionally unresolved source, not a broken test. Exit 0.
