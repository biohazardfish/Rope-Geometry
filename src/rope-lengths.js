// Solve J Jᵀ λ = -C for the full open chain, then apply Jᵀ λ.
// Adjacent constraints share one vertex, giving a tridiagonal system. This
// moves length information through the whole chain in one Newton sweep.
// inverseMasses is optional. Omitted, or every value 1, keeps the historical
// equal-mass projection used by existing callers.
export function projectChainLengths(P,rest,{iterations=8,tolerance=1e-10,inverseMasses=null}={}){
 if(inverseMasses && inverseMasses.length !== rest.length+1)throw Error('Chain layout mismatch');
 if(inverseMasses&&inverseMasses.some(w=>w!==1))return projectChainLengthsWeighted(P,rest,inverseMasses,iterations,tolerance);
 const m=rest.length;if(P.length!==3*(m+1))throw Error('Chain layout mismatch');
 const u=new Float64Array(3*m),rhs=new Float64Array(m),diagonal=new Float64Array(m),off=new Float64Array(Math.max(0,m-1)),lambda=new Float64Array(m);
 let maxResidual=Infinity;
 for(let sweep=0;sweep<iterations;sweep++){
  maxResidual=0;
  for(let i=0;i<m;i++){
   const a=3*i,b=a+3,dx=P[b]-P[a],dy=P[b+1]-P[a+1],dz=P[b+2]-P[a+2],length=Math.hypot(dx,dy,dz);
   if(length<1e-14||!(rest[i]>0))throw Error('Degenerate chain constraint');
   u[a]=dx/length;u[a+1]=dy/length;u[a+2]=dz/length;
   rhs[i]=rest[i]-length;maxResidual=Math.max(maxResidual,Math.abs(rhs[i]));diagonal[i]=2;
  }
  if(maxResidual<=tolerance)break;
  for(let i=0;i<m-1;i++)off[i]=-(u[3*i]*u[3*i+3]+u[3*i+1]*u[3*i+4]+u[3*i+2]*u[3*i+5]);
  for(let i=1;i<m;i++){const f=off[i-1]/diagonal[i-1];diagonal[i]-=f*off[i-1];rhs[i]-=f*rhs[i-1];}
  lambda[m-1]=rhs[m-1]/diagonal[m-1];
  for(let i=m-2;i>=0;i--)lambda[i]=(rhs[i]-off[i]*lambda[i+1])/diagonal[i];
  for(let i=0;i<m;i++)for(let k=0;k<3;k++){const correction=u[3*i+k]*lambda[i];P[3*i+k]-=correction;P[3*i+3+k]+=correction;}
 }
 return {maxResidual};
}

// A pinned, straight span has one redundant length constraint. Its last
// pivot vanishes even when the requested lengths are perfectly compatible.
function projectChainLengthsWeighted(P, rest, masses, iterations, tolerance) {
 const m = rest.length;
 if (P.length !== 3*(m+1)) throw Error('Chain layout mismatch');
 for (const w of masses) if (!(w >= 0) || !Number.isFinite(w)) throw Error('Invalid inverse mass');
 const units = new Float64Array(3*m), rhs = new Float64Array(m);
 const diagonal = new Float64Array(m), off = new Float64Array(m), lambda = new Float64Array(m);
 const pivotFloor = Math.max(...masses) * Number.EPSILON * 32;
 let maxResidual;
 for (let sweep=0; sweep<=iterations; sweep++) {
  maxResidual=0;
  for (let i=0; i<m; i++) {
   const a=3*i, dx=P[a+3]-P[a], dy=P[a+4]-P[a+1], dz=P[a+5]-P[a+2];
   const length=Math.hypot(dx,dy,dz);
   if (!(length>=1e-14) || !(rest[i]>0)) throw Error('Degenerate chain constraint');
   units.set([dx/length,dy/length,dz/length],a);
   rhs[i]=rest[i]-length;
   maxResidual=Math.max(maxResidual,Math.abs(rhs[i]));
   diagonal[i]=masses[i]+masses[i+1];
  }
  if (maxResidual<=tolerance || sweep===iterations) break;
  for (let i=0; i<m-1; i++) {
   const k=3*i;
   off[i]=-masses[i+1]*(units[k]*units[k+3]+units[k+1]*units[k+4]+units[k+2]*units[k+5]);
  }
  for (let i=1; i<m; i++) {
   if (diagonal[i-1]<=pivotFloor) continue;
   const factor=off[i-1]/diagonal[i-1];
   diagonal[i]-=factor*off[i-1]; rhs[i]-=factor*rhs[i-1];
  }
  for (let i=m-1; i>=0; i--) {
   // Omit the dependent row. The actual residual, recomputed above, still
   // rejects incompatible constraints even for an entirely immovable span.
   lambda[i]=diagonal[i]<=pivotFloor ? 0 :
    (rhs[i]-(i+1<m ? off[i]*lambda[i+1] : 0))/diagonal[i];
  }
  for (let i=0; i<m; i++) for (let k=0; k<3; k++) {
   const correction=units[3*i+k]*lambda[i];
   P[3*i+k]-=masses[i]*correction;
   P[3*i+3+k]+=masses[i+1]*correction;
  }
 }
 return {maxResidual};
}
