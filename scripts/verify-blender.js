import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root=process.cwd(),temp=mkdtempSync(join(tmpdir(),'rope-blender-'));
const run=args=>{const r=spawnSync('/Applications/Blender.app/Contents/MacOS/Blender',args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return `${r.stdout}\n${r.stderr}`};
try {
  for(const fixture of ['B.json','crossing-valid.json','multiple-valid-A.json','multiple-valid-B.json']){
    const input=join(root,'data',fixture),blend=join(temp,fixture.replace('.json','.blend'));
    run(['--background','--python',join(root,'scripts/blender_import.py'),'--',input,blend]);
    const check=`import bpy,json,sys\ndoc=json.load(open(sys.argv[-1])); result=[]\nfor rope in doc['ropes']:\n o=bpy.data.objects[rope['id']]; s=o.data.splines[0]\n result.append({'id':rope['id'],'points':[[round(p.co.x,9),round(p.co.y,9),round(p.co.z,9)] for p in s.points],'radius':o.data.bevel_depth,'scale':list(o.scale)})\nprint('VERIFY_JSON='+json.dumps(result))`;
    const out=run(['--background',blend,'--python-expr',check,'--',input]);
    const line=out.split('\n').find(x=>x.startsWith('VERIFY_JSON='));if(!line)throw Error(`Blender emitted no verification result for ${fixture}`);
    const actual=JSON.parse(line.slice(12)),expected=JSON.parse(readFileSync(input,'utf8')).ropes;let max=0;
    if(actual.length!==expected.length)throw Error(`${fixture}: rope count mismatch`);
    for(let i=0;i<expected.length;i++){if(actual[i].points.length!==expected[i].points.length)throw Error(`${fixture}: point count mismatch`);for(let j=0;j<expected[i].points.length;j++)for(let k=0;k<3;k++)max=Math.max(max,Math.abs(actual[i].points[j][k]-expected[i].points[j][k]));max=Math.max(max,Math.abs(actual[i].radius-expected[i].diameter/2));if(actual[i].scale.some(x=>x!==1))throw Error(`${fixture}: unexpected object scale`);}
    if(max>1e-7)throw Error(`${fixture}: Blender mismatch ${max} m`);console.log(`${fixture}: Blender round-trip verified; max coordinate/radius error ${max} m`);
  }
} finally {rmSync(temp,{recursive:true,force:true});}
