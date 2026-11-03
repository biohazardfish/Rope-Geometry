const add=(a,b)=>a.map((v,k)=>v+b[k]),mul=(a,s)=>a.map(v=>v*s);
export function hermitePoint(a,b,u,v,t){return add(add(mul(a,2*t**3-3*t*t+1),mul(b,-2*t**3+3*t*t)),add(mul(u,t**3-2*t*t+t),mul(v,t**3-t*t)));}
export function sampleCurve(fn,steps){if(!Number.isInteger(steps)||steps<1)throw Error('Positive sample count required');return Array.from({length:steps+1},(_,i)=>fn(i/steps));}
export function curvePoint(segment,t){
 const p=segment.parameters;
 if(segment.type==='line')return p.from.map((v,k)=>v+(p.to[k]-v)*t);
 if(segment.type==='hermite')return hermitePoint(p.from,p.to,p.startTangent,p.endTangent,t);
 if(segment.type==='torus-arc'){
  const a=p.startAngle+(p.endAngle-p.startAngle)*t,r=p.majorRadius+p.minorRadius*Math.cos(p.minorTurns*a);
  return [r*Math.cos(p.majorTurns*a),r*Math.sin(p.majorTurns*a),p.minorRadius*Math.sin(p.minorTurns*a)];
 }
 throw Error(`Unknown curve primitive: ${segment.type}`);
}
export function compileRecipe(recipe){
 if(recipe.schemaVersion!==1||!recipe.id||!recipe.segments?.length)throw Error('KnotRecipe with segments required');
 const points=[],labels=[];
 for(const segment of recipe.segments){
  const samples=sampleCurve(t=>curvePoint(segment,t),segment.steps);
  if(points.length&&Math.hypot(...points.at(-1).map((v,k)=>v-samples[0][k]))>1e-9)throw Error(`Disconnected recipe segment ${segment.role}`);
  if(!points.length)points.push(samples[0]);
  for(const p of samples.slice(1)){points.push(p);labels.push(segment.role);}
 }
 return {points,labels};
}
