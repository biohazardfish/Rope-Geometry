import {mkdirSync,writeFileSync} from 'node:fs';
import {buildSomerville,seedClearance,SOMERVILLE_PRESETS} from '../src/somerville-build.js';
mkdirSync('data/somerville-final',{recursive:true});
for (const [name, preset] of [['loose', SOMERVILLE_PRESETS.loose], ['loose-v2', SOMERVILLE_PRESETS.looseVideo]]) {
  const doc=buildSomerville(preset), check=seedClearance(doc);
  writeFileSync(`data/somerville-final/${name}.json`, JSON.stringify(doc, null, 2)+'\n');
  console.log(name, JSON.stringify({points:doc.ropes[0].points.length, route:doc.somerville.config.route, gap:check.minimumNonlocalGap, column:check.minimumColumnGap, penetratingPairs:check.penetratingPairs}));
}
