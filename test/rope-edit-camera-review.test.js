import test from 'node:test';
import assert from 'node:assert/strict';
import {panStep,classifyNavigationGesture} from '../src/rope-edit-camera.js';

test('tracking the viewport follows the mouse in both screen directions',()=>{
  const camera={position:[0,0,1],target:[0,0,0],up:[0,1,0],fov:40,aspect:1};
  const moved=panStep(camera,20,20,{pixels:100});
  // Camera motion is opposite the apparent scene displacement. Positive mouse
  // Y points down the display, while the camera's screen-up vector points up.
  assert.ok(moved.position[0]<0);
  assert.ok(moved.position[1]>0);
  assert.deepEqual(moved.position.map((v,k)=>v-moved.target[k]),[0,0,1]);
  assert.equal(classifyNavigationGesture({button:0,altKey:true}),null);
});
