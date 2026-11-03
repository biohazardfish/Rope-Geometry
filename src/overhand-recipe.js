import {curvePoint,compileRecipe} from './rope-curves.js';
import {createRopeState} from './rope-state.js';
// An open (2,3) torus-knot arc is the geometric fixture for a loose overhand.
// This is a second recipe, not a second rope engine or a photographed pose.
export function overhandRecipe({scale=.025,diameter=.006,steps=500,tailLength=.10}={}){
 const body={role:'knot-body',type:'torus-arc',steps,parameters:{majorRadius:2*scale,minorRadius:scale,majorTurns:2,minorTurns:3,startAngle:.35,endAngle:2*Math.PI-.35}};
 const start=curvePoint(body,0),after=curvePoint(body,1e-5),end=curvePoint(body,1),before=curvePoint(body,1-1e-5);
 const extend=(p,q)=>{const v=p.map((x,k)=>x-q[k]),n=Math.hypot(...v);return p.map((x,k)=>x+tailLength*v[k]/n);};
 return {schemaVersion:1,id:'overhand',diameter,column:null,materialPath:'E0 → overhand body → E1',basis:'analytic loose overhand fixture; no video reconstruction claim',segments:[{role:'tail/0',type:'line',steps:80,parameters:{from:extend(start,after),to:start}},body,{role:'tail/1',type:'line',steps:80,parameters:{from:end,to:extend(end,before)}}]};
}
export function buildOverhand(options={}){const recipe=overhandRecipe(options),{points,labels}=compileRecipe(recipe),state=createRopeState(points,{diameter:recipe.diameter,labels,referenceId:'overhand-seed'});return {recipe,state};}
