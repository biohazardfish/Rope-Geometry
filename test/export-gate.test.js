import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('CLI cannot export a Somerville empty diagram by setting review flags', () => {
  const dir=mkdtempSync(join(tmpdir(),'rope-export-'));
  try {
    const review=JSON.parse(readFileSync(new URL('../data/somerville-gauss-review.json',import.meta.url)));
    review.status='SOURCE_VERIFIED'; review.materialPath.complete=true; review.crossingInventoryComplete=true;
    const input=join(dir,'review.json'), output=join(dir,'diagram.txt');
    writeFileSync(input,JSON.stringify(review)); writeFileSync(output,'preserve existing output');
    const r=spawnSync(process.execPath,['scripts/export-knoto-id.js','gauss',input,output],{encoding:'utf8'});
    assert.equal(r.status,1); assert.match(r.stderr,/source evidence blocks export/);
    assert.equal(readFileSync(output,'utf8'),'preserve existing output');
    review.id='renamed'; delete review.source;
    writeFileSync(input,JSON.stringify(review));
    const renamed=spawnSync(process.execPath,['scripts/export-knoto-id.js','gauss',input,output],{encoding:'utf8'});
    assert.equal(renamed.status,1); assert.match(renamed.stderr,/source evidence blocks export/);
    assert.equal(readFileSync(output,'utf8'),'preserve existing output');
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
