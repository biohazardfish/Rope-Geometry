// Review aid for crossing bindings. Projects a dressed candidate with the fitted camera from the pose report onto the
// 148 s frame, colours the centreline by segment role, and lists which roles pass near each annotated contact.
// It makes no source judgement: nothing is written into data/somerville-pose148.json and no binding is marked reviewed.
//
//   node scripts/overlay-dressed.js                                   loose-v3 with the report camera
//   node scripts/overlay-dressed.js --candidate work/somerville/dressed/march/chained.json
//   node scripts/overlay-dressed.js --out reports/somerville-dressed-overlay
//
// Outputs <out>.png (frame + centreline, needs macOS `sips` to decode the JPEG; otherwise a dark background),
// <out>.svg (same drawing with text labels, references the JPEG) and <out>.json (candidate table).
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {deflateSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {projectPoint} from '../src/somerville-pose-fit.js';

const args=process.argv.slice(2);
const opt=(name,fallback)=>{const i=args.indexOf(name);return i>=0&&args[i+1]!==undefined?args[i+1]:fallback;};
const candidatePath=opt('--candidate','data/somerville-final/loose-v3.json');
const reportPath=opt('--report','reports/somerville-dressed-report.json');
const annotationPath=opt('--annotation','data/somerville-pose148.json');
const framePath=opt('--frame','references/phase4b/duchy-video-148.jpg');
const outBase=opt('--out','reports/somerville-dressed-overlay');

const candidate=JSON.parse(readFileSync(candidatePath,'utf8'));
const report=JSON.parse(readFileSync(reportPath,'utf8'));
const annotation=JSON.parse(readFileSync(annotationPath,'utf8'));
const camera=report.camera;
if(!camera||camera.projection!=='orthographic')throw Error(`${reportPath} has no orthographic camera`);
const rope=candidate.ropes[0],points=rope.points,labels=rope.segmentLabels,materialArc=candidate.somerville?.materialArc;
if(!Array.isArray(materialArc)||materialArc.length!==points.length)throw Error('candidate lacks somerville.materialArc aligned with points');
const [imageW,imageH]=annotation.imageSize;
const baseRole=role=>String(role).replace(/\/\d+$/,'');
const roleOf=i=>labels[Math.min(i,labels.length-1)];

// Colour per base role. Chosen to separate neighbouring roles; the legend is written into the SVG and JSON.
const palette={
  'loop-rim':[255,64,64],'loop-to-cuff':[255,160,0],'cuff':[255,230,0],'cuff-to-first':[160,220,0],
  'first-passage':[0,200,80],'over-root':[0,220,220],'under-approach':[0,140,255],'under-cuff':[90,90,255],
  'return-approach':[170,80,255],'return-passage':[255,0,200],'bight-leg':[255,120,180],'fold':[255,255,255],'tail':[150,150,150]
};
const colourOf=role=>palette[baseRole(role)]??[200,200,200];

// Project the whole centreline once.
const projected=points.map(p=>projectPoint(p,camera));

// --- Candidate table -------------------------------------------------------------------------------------------------
const nominalPx=annotation.nominalVisibleRopeDiameterPx??30;
function pointSegmentDistance2(p,a,b){const vx=b[0]-a[0],vy=b[1]-a[1],den=vx*vx+vy*vy,t=den?Math.max(0,Math.min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/den)):0;const x=a[0]+t*vx-p[0],y=a[1]+t*vy-p[1];return {distance:Math.hypot(x,y),t};}
function intersect2(p,p2,q,q2){const rx=p2[0]-p[0],ry=p2[1]-p[1],sx=q2[0]-q[0],sy=q2[1]-q[1],den=rx*sy-ry*sx;if(Math.abs(den)<1e-12)return null;const qpx=q[0]-p[0],qpy=q[1]-p[1],t=(qpx*sy-qpy*sx)/den,u=(qpx*ry-qpy*rx)/den;if(t<0||t>1||u<0||u>1)return null;return {t,u,point:[p[0]+t*rx,p[1]+t*ry]};}
const lerp=(a,b,t)=>a+(b-a)*t;

function nearbyRoles(contact,radiusPx){
  const byRole=new Map();
  for(let i=0;i<points.length-1;i++){
    const {distance,t}=pointSegmentDistance2(contact.positionPx,projected[i],projected[i+1]);
    if(distance>radiusPx)continue;
    const role=roleOf(i),entry=byRole.get(role)??{role,baseRole:baseRole(role),minDistancePx:Infinity,segments:[],materialRange:[Infinity,-Infinity],depthYRange:[Infinity,-Infinity]};
    entry.minDistancePx=Math.min(entry.minDistancePx,distance);
    entry.segments.push(i);
    const s=lerp(materialArc[i],materialArc[i+1],t),y=lerp(points[i][1],points[i+1][1],t);
    entry.materialRange=[Math.min(entry.materialRange[0],s),Math.max(entry.materialRange[1],s)];
    entry.depthYRange=[Math.min(entry.depthYRange[0],y),Math.max(entry.depthYRange[1],y)];
    byRole.set(role,entry);
  }
  return [...byRole.values()].map(e=>({...e,segmentRange:[e.segments[0],e.segments.at(-1)],segments:undefined})).sort((a,b)=>a.minDistancePx-b.minDistancePx);
}
function crossingPairs(contact,radiusPx){
  // Every pair of non-adjacent segments whose projections intersect within radiusPx of the contact.
  const near=[];
  for(let i=0;i<points.length-1;i++)if(pointSegmentDistance2(contact.positionPx,projected[i],projected[i+1]).distance<=radiusPx)near.push(i);
  const pairs=[];
  for(let a=0;a<near.length;a++)for(let b=a+1;b<near.length;b++){
    const i=near[a],j=near[b];if(Math.abs(i-j)<=1)continue;
    const hit=intersect2(projected[i],projected[i+1],projected[j],projected[j+1]);if(!hit)continue;
    const residual=Math.hypot(hit.point[0]-contact.positionPx[0],hit.point[1]-contact.positionPx[1]);if(residual>radiusPx)continue;
    const yi=lerp(points[i][1],points[i+1][1],hit.t),yj=lerp(points[j][1],points[j+1][1],hit.u);
    // The camera looks from -Y toward +Y: the smaller Y is nearer the camera, so it is the over strand in projection.
    const [over,under]=yi<yj?[{i,t:hit.t,y:yi},{i:j,t:hit.u,y:yj}]:[{i:j,t:hit.u,y:yj},{i,t:hit.t,y:yi}];
    pairs.push({
      overRole:roleOf(over.i),underRole:roleOf(under.i),
      overSegment:over.i,underSegment:under.i,
      overMaterial:lerp(materialArc[over.i],materialArc[over.i+1],over.t),underMaterial:lerp(materialArc[under.i],materialArc[under.i+1],under.t),
      projectedPx:hit.point.map(v=>+v.toFixed(1)),residualPx:+residual.toFixed(1),
      depthDifferenceMm:+((under.y-over.y)*1e3).toFixed(2),
      withinNominalDiameter:residual<=nominalPx
    });
  }
  // Collapse duplicates from consecutive segment pairs of the same two roles, keep the closest.
  const best=new Map();
  for(const p of pairs){const key=`${p.overRole}>${p.underRole}`;if(!best.has(key)||p.residualPx<best.get(key).residualPx)best.set(key,p);}
  return [...best.values()].sort((a,b)=>a.residualPx-b.residualPx);
}
const contacts=(annotation.crossings??[]).map(contact=>{
  const radiusPx=Math.max(2*(contact.uncertaintyPx??annotation.annotationUncertaintyPx??10),nominalPx);
  return {
    id:contact.id,positionPx:contact.positionPx,uncertaintyPx:contact.uncertaintyPx,bindingStatus:contact.bindingStatus,
    currentBinding:{over:contact.over?.role??null,under:contact.under?.role??null},
    observation:contact.observation,
    searchRadiusPx:radiusPx,
    rolesNearby:nearbyRoles(contact,radiusPx),
    projectedCrossingCandidates:crossingPairs(contact,radiusPx),
    wideSearch:{radiusPx:radiusPx*3,rolesNearby:nearbyRoles(contact,radiusPx*3).map(r=>({role:r.role,minDistancePx:+r.minDistancePx.toFixed(1)}))}
  };
});

// --- PNG -------------------------------------------------------------------------------------------------------------
function decodeFrameRGB(path){
  // Pure-Node PNG encoding is easy; JPEG decoding is not. Use macOS sips to get a BMP, else fall back to a dark canvas.
  const tmp=join(tmpdir(),`overlay-${process.pid}-${basename(path)}.bmp`);
  const r=spawnSync('sips',['-s','format','bmp',path,'--out',tmp],{stdio:'ignore'});
  if(r.status!==0||!existsSync(tmp))return {rgb:Buffer.alloc(imageW*imageH*3,24),width:imageW,height:imageH,source:'fallback: sips unavailable, dark background'};
  const bmp=readFileSync(tmp);rmSync(tmp,{force:true});
  const offset=bmp.readUInt32LE(10),width=bmp.readInt32LE(18),heightRaw=bmp.readInt32LE(22),bpp=bmp.readUInt16LE(28),compression=bmp.readUInt32LE(30);
  if(compression!==0&&compression!==3)throw Error(`unsupported BMP compression ${compression}`);
  const height=Math.abs(heightRaw),bottomUp=heightRaw>0,bytes=bpp/8,stride=Math.ceil(width*bytes/4)*4;
  const rgb=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++){const srcRow=bottomUp?height-1-y:y;for(let x=0;x<width;x++){const s=offset+srcRow*stride+x*bytes,d=(y*width+x)*3;rgb[d]=bmp[s+2];rgb[d+1]=bmp[s+1];rgb[d+2]=bmp[s];}}
  return {rgb,width,height,source:'sips bmp'};
}
const frame=decodeFrameRGB(framePath);
if(frame.width!==imageW||frame.height!==imageH)console.warn(`frame ${frame.width}x${frame.height} differs from annotation imageSize ${imageW}x${imageH}`);
const W=frame.width,H=frame.height,rgb=frame.rgb;
function blend(x,y,c,alpha=1){if(x<0||y<0||x>=W||y>=H)return;const d=(y*W+x)*3;for(let k=0;k<3;k++)rgb[d+k]=Math.round(rgb[d+k]*(1-alpha)+c[k]*alpha);}
function disc(cx,cy,r,c,alpha=1){for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++)if((x-cx)**2+(y-cy)**2<=r*r)blend(x,y,c,alpha);}
function line(a,b,c,width=2,alpha=1){const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])));for(let k=0;k<=steps;k++){const t=k/steps;disc(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,width/2,c,alpha);}}
function ring(cx,cy,r,c,thickness=2){for(let y=Math.floor(cy-r-thickness);y<=Math.ceil(cy+r+thickness);y++)for(let x=Math.floor(cx-r-thickness);x<=Math.ceil(cx+r+thickness);x++){const d=Math.hypot(x-cx,y-cy);if(Math.abs(d-r)<=thickness/2)blend(x,y,c);}}
function rect(x0,y0,x1,y1,c){line([x0,y0],[x1,y0],c,2);line([x1,y0],[x1,y1],c,2);line([x1,y1],[x0,y1],c,2);line([x0,y1],[x0,y0],c,2);}

// Annotated visible polylines first (thin white), then the candidate centreline by role, far-from-camera first.
for(const poly of annotation.visiblePolylines??[])for(let k=0;k<poly.points.length-1;k++)line(poly.points[k],poly.points[k+1],[255,255,255],3,.45);
const order=Array.from({length:points.length-1},(_,i)=>i).sort((i,j)=>(points[j][1]+points[j+1][1])-(points[i][1]+points[i+1][1]));
for(const i of order)line(projected[i],projected[i+1],colourOf(roleOf(i)),4,.9);
if(Array.isArray(annotation.lockingCoreRegion)){const [x0,y0,x1,y1]=annotation.lockingCoreRegion;rect(x0,y0,x1,y1,[255,255,0]);}
for(const contact of contacts){ring(contact.positionPx[0],contact.positionPx[1],contact.uncertaintyPx??10,[255,255,255],2);ring(contact.positionPx[0],contact.positionPx[1],contact.searchRadiusPx,[255,255,0],1);}

function crc32(buf){let c,crc=0xffffffff;for(let n=0;n<buf.length;n++){c=(crc^buf[n])&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function encodePNG(rgb,width,height){
  const raw=Buffer.alloc((width*3+1)*height);
  for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;rgb.copy(raw,y*(width*3+1)+1,y*width*3,(y+1)*width*3);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}

// --- SVG (text labels, references the frame) -----------------------------------------------------------------------
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const rgbCss=c=>`rgb(${c.join(',')})`;
const svg=[];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
svg.push(`<image xlink:href="../${framePath}" href="../${framePath}" width="${W}" height="${H}"/>`);
for(const poly of annotation.visiblePolylines??[])svg.push(`<polyline points="${poly.points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="white" stroke-opacity=".45" stroke-width="3"/>`);
let runStart=0;
for(let i=1;i<=points.length-1;i++){
  if(i===points.length-1||baseRole(roleOf(i))!==baseRole(roleOf(runStart))||roleOf(i)!==roleOf(runStart)){
    const pts=projected.slice(runStart,i+1).map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    svg.push(`<polyline points="${pts}" fill="none" stroke="${rgbCss(colourOf(roleOf(runStart)))}" stroke-opacity=".9" stroke-width="4"><title>${esc(roleOf(runStart))} s ${materialArc[runStart].toFixed(3)}–${materialArc[i].toFixed(3)} m</title></polyline>`);
    runStart=i;
  }
}
if(Array.isArray(annotation.lockingCoreRegion)){const [x0,y0,x1,y1]=annotation.lockingCoreRegion;svg.push(`<rect x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" fill="none" stroke="yellow" stroke-width="2"/>`);}
for(const contact of contacts){
  const [cx,cy]=contact.positionPx;
  svg.push(`<circle cx="${cx}" cy="${cy}" r="${contact.uncertaintyPx??10}" fill="none" stroke="white" stroke-width="2"/>`);
  svg.push(`<circle cx="${cx}" cy="${cy}" r="${contact.searchRadiusPx}" fill="none" stroke="yellow" stroke-width="1" stroke-dasharray="4 4"/>`);
  svg.push(`<text x="${cx+contact.searchRadiusPx+6}" y="${cy+4}" fill="white" font-family="monospace" font-size="14" stroke="black" stroke-width=".5">${esc(contact.id)} [${cx},${cy}] ${esc(contact.bindingStatus)}</text>`);
}
let ly=24;
svg.push(`<rect x="8" y="8" width="250" height="${18*Object.keys(palette).length+12}" fill="black" fill-opacity=".55"/>`);
for(const [role,c] of Object.entries(palette)){svg.push(`<line x1="16" y1="${ly}" x2="56" y2="${ly}" stroke="${rgbCss(c)}" stroke-width="5"/><text x="64" y="${ly+5}" fill="white" font-family="monospace" font-size="14">${esc(role)}</text>`);ly+=18;}
svg.push(`<text x="${W-12}" y="${H-12}" text-anchor="end" fill="white" font-family="monospace" font-size="13" stroke="black" stroke-width=".5">${esc(basename(candidatePath))} · camera ${camera.pixelsPerMetre.toFixed(0)} px/m roll ${(camera.rollRadians*180/Math.PI).toFixed(1)}° · rms ${report.pose?.rmsPx?.toFixed(1)} px · review aid, not a binding</text>`);
svg.push('</svg>');

// --- Write -----------------------------------------------------------------------------------------------------------
mkdirSync('reports',{recursive:true});
writeFileSync(`${outBase}.png`,encodePNG(rgb,W,H));
writeFileSync(`${outBase}.svg`,svg.join('\n'));
const table={
  purpose:'Review aid for crossing bindings. Lists roles and material ranges of the projected candidate near each annotated contact. The reviewer decides the binding; this file never marks anything reviewed.',
  generatedAt:new Date().toISOString(),
  candidate:{path:candidatePath,sha256:createHash('sha256').update(readFileSync(candidatePath)).digest('hex'),stage:candidate.somerville?.stage??null,points:points.length},
  camera:{...camera,source:report.cameraSource??null,poseRmsPx:report.pose?.rmsPx??null,poseStatus:report.pose?.status??null,caveat:'the fitted camera has a large residual; projected positions near the core can be off by tens of pixels'},
  frame:{path:framePath,decode:frame.source,imageSize:[W,H]},
  depthConvention:'orthographic view from -Y toward +Y; smaller world Y is nearer the camera (projected over strand)',
  palette:Object.fromEntries(Object.entries(palette).map(([k,v])=>[k,rgbCss(v)])),
  roleMaterialRanges:(()=>{const out={};for(let i=0;i<points.length-1;i++){const r=roleOf(i);out[r]??=[materialArc[i],materialArc[i+1]];out[r][0]=Math.min(out[r][0],materialArc[i]);out[r][1]=Math.max(out[r][1],materialArc[i+1]);}return out;})(),
  contacts,
  howToBind:'For a contact, copy over.role / under.role from a chosen projectedCrossingCandidates entry (or decide from the frame), optionally over.materialRange / under.materialRange from overMaterial / underMaterial ± a few cm, and set bindingStatus to "reviewed" in data/somerville-pose148.json by hand. Then rerun npm run generate:dressed.'
};
writeFileSync(`${outBase}.json`,JSON.stringify(table,null,2));
console.log(JSON.stringify({
  png:`${outBase}.png`,svg:`${outBase}.svg`,json:`${outBase}.json`,frameDecode:frame.source,
  contacts:contacts.map(c=>({id:c.id,rolesNearby:c.rolesNearby.map(r=>`${r.role}@${r.minDistancePx.toFixed(0)}px`),candidates:c.projectedCrossingCandidates.map(p=>`${p.overRole} over ${p.underRole} (${p.residualPx}px, dy ${p.depthDifferenceMm}mm)`)}))
},null,2));
