import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { validateSomervilleReferences, validateSomervilleStructure, renderSomervilleSvg } from '../src/somerville-topology.js';

const topology = JSON.parse(readFileSync('data/somerville-bowline-topology.json', 'utf8'));
const structural = validateSomervilleStructure(topology);
const reference = validateSomervilleReferences(topology);
if (!structural.valid) throw new Error(`Phase 4 structural validation failed: ${structural.errors.join('; ')}`);
mkdirSync('diagrams', { recursive: true });
for (const view of topology.views) writeFileSync(`diagrams/somerville-${view.id}.svg`, renderSomervilleSvg(topology, view.id) + '\n');
const report = { variant: topology.variant, structural, reference, crossings: topology.crossings.map(({id, relationshipId, participants, ropePortions, over, under, status, multiplicityStatus, tutorialStep, tutorialSteps, evidence}) => ({id, relationshipId, participants, ropePortions, over, under, status, multiplicityStatus, tutorialStep, tutorialSteps, evidence})), crossingTraversalOrder: topology.crossingTraversalOrder, passages: topology.passages, columnWrapping: topology.columnWrapping, geometryGeneratorAssessment: 'Phase 3 accepts structured segment-position crossing constraints and deterministic clearance construction, but Phase 4 does not yet provide a confirmed strand-level crossing ledger or unambiguous material-route positions. Do not feed this provisional topology into the generator until reference review resolves those assignments.', milestones: topology.tutorialMilestones.map(({id,title,sourceSteps,status}) => ({id,title,sourceSteps,status})), unresolved: reference.pendingReview, generatedDiagrams: topology.views.map(view => `diagrams/somerville-${view.id}.svg`) };
writeFileSync('phase4-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
