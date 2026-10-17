import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smallChangeTransitionMs} from '../public/spectrum-smoothing.js';
test('small height changes use a short transition regardless of their direction',()=>{
  assert.equal(smallChangeTransitionMs(10,10.1),40);
  assert.equal(smallChangeTransitionMs(10,9.9),40);
  assert.equal(smallChangeTransitionMs(10.1,10.2),40);
  assert.equal(smallChangeTransitionMs(10,10),40,'unchanged targets do not cancel an ongoing transition');
});
test('quiet onsets, silence and large movements have no added transition',()=>{
  assert.equal(smallChangeTransitionMs(2,2.000028),0);
  assert.equal(smallChangeTransitionMs(2,2.01),0);
  assert.equal(smallChangeTransitionMs(10,2),0);
  assert.equal(smallChangeTransitionMs(10,20),0);
  assert.equal(smallChangeTransitionMs(20,10),0);
  assert.equal(smallChangeTransitionMs(NaN,10),0);
});
test('subtle volume changes keep their exact target height',()=>{
  const heights=[10,10.1,10.2,10.15,10.25];
  const source=[...heights];
  for(let i=1;i<heights.length;i++)assert.equal(smallChangeTransitionMs(heights[i-1],heights[i]),40);
  assert.deepEqual(heights,source,'the helper selects duration only and never rewrites target values');
});
