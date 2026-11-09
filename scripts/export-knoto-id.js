// Usage: node scripts/export-knoto-id.js gauss INPUT.json [OUTPUT.txt]
//        node scripts/export-knoto-id.js xyz   INPUT.json [OUTPUT.xyz]
import { readFileSync, writeFileSync } from 'node:fs';
import { inspectGaussReview, toKnotoIdExtendedGauss, toKnotoIdXyz } from '../src/extended-gauss.js';
import { auditSomervilleReadiness } from '../src/gauss-evidence.js';

const [kind, input, output] = process.argv.slice(2);
if (!['gauss','xyz'].includes(kind) || !input) {
  console.error('Usage: node scripts/export-knoto-id.js gauss|xyz INPUT.json [OUTPUT]');
  process.exitCode = 2;
} else {
  try {
    const document = JSON.parse(readFileSync(input, 'utf8'));
    if (kind === 'gauss') {
      // This repository's CLI is the Somerville acceptance path. Generic
      // serialization remains available through the library, without a claim
      // of source verification. Renaming a review must not bypass this gate.
      {
        const source = JSON.parse(readFileSync(new URL('../data/somerville-bowline-topology-v2.json', import.meta.url), 'utf8'));
        const audit = auditSomervilleReadiness(source, document);
        if (!audit.ready) throw new Error('Somerville source evidence blocks export: ' + audit.problems.join('; '));
      }
      const report = inspectGaussReview(document);
      if (!report.exportable) throw new Error(
        'Reference topology NOT verified: ' + [...report.errors, ...report.blockers].join('; '));
    }
    const result = kind === 'gauss' ?
      toKnotoIdExtendedGauss(document) : toKnotoIdXyz(document);
    if (output) {
      writeFileSync(output, result);
      console.log('Wrote ' + output);
    } else {
      process.stdout.write(result);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
