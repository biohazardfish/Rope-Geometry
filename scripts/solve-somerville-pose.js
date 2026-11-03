// The main entry starts from loose-v2's fixed material. A shorter generated
// preset can only be a target, never a replacement seed.
import './continue-somerville.js';
import {evaluateSomervilleCandidate} from './evaluate-somerville-candidate.js';
const report=evaluateSomervilleCandidate();
console.log(JSON.stringify({status:report.status,checks:report.checks,material:report.material,correspondenceError:report.correspondenceError},null,2));
if(report.status!=='PASS')process.exitCode=2;
