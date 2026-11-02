import {buildSomerville} from '../../../src/somerville-build.js';
const opts=JSON.parse(process.argv[2]||'{}');const from=+process.argv[3],to=+process.argv[4];
const d=buildSomerville(opts),m=d.somerville,S=m.spine,rb=m.ribbon;
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),norm=a=>Math.hypot(...a);
// spine roles: labels of strand 0 are first spine-length segments
const L=d.ropes[0].segmentLabels;
for(let i=Math.max(1,from);i<Math.min(S.length-1,to);i++){const a=S[i-1],b=S[i],c=S[i+1];const t1=sub(b,a),t2=sub(c,b);const l1=norm(t1),l2=norm(t2);const k=sub(t2.map(v=>v/l2),t1.map(v=>v/l1)).map(v=>v/((l1+l2)/2));const kn=norm(k);const side=rb[i].side;const ks=dot(k,side);console.log(i,L[i],b.map(v=>v.toFixed(4)).join(','),'R',(1/kn*1000).toFixed(1),'Rside',(1/Math.abs(ks)*1000).toFixed(1),'hw',(rb[i].halfWidth*1000).toFixed(1),'twist',rb[i].twist.toFixed(2));}
