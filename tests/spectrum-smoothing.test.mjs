import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smallChangeTransitionMs} from '../public/spectrum-smoothing.js';

test('disabled smoothing removes transitions for every movement size',()=>{
  for(const height of [2,2.001,9.9,10,10.1,12,14,20,30])
    assert.equal(smallChangeTransitionMs(10,height,false),0);
});
test('small and moderate twitches keep a short transition in either direction',()=>{
  for(const distance of [0,.1,1.24,1.25,1.26,2,3]){
    assert.equal(smallChangeTransitionMs(10,10+distance),48);
    assert.equal(smallChangeTransitionMs(10,10-distance),48);
  }
});
test('quiet onsets, near-silent levels and large movements have no added transition',()=>{
  assert.equal(smallChangeTransitionMs(2,2.000028),0);
  assert.equal(smallChangeTransitionMs(2,2.01),0);
  assert.equal(smallChangeTransitionMs(5,2.01),0);
  assert.equal(smallChangeTransitionMs(5,2.5),0);
  assert.equal(smallChangeTransitionMs(2.01,5),0);
  assert.equal(smallChangeTransitionMs(2.5,5),0);
  assert.equal(smallChangeTransitionMs(10,2),0);
  assert.equal(smallChangeTransitionMs(10,17),0);
  assert.equal(smallChangeTransitionMs(17,10),0);
  assert.equal(smallChangeTransitionMs(10,20),0);
  assert.equal(smallChangeTransitionMs(20,10),0);
  assert.equal(smallChangeTransitionMs(NaN,10),0);
});
test('transition fades out continuously as changes grow instead of snapping off',()=>{
  let previous=smallChangeTransitionMs(10,13);
  for(let step=1;step<=40;step++){
    const distance=3+step/10;
    const duration=smallChangeTransitionMs(10,10+distance);
    assert.ok(duration>=0&&duration<=previous,'larger changes never add more lag');
    assert.ok(previous-duration<2,'crossing a size boundary cannot abruptly disable interpolation');
    assert.ok(Math.abs(duration-smallChangeTransitionMs(10,10-distance))<1e-10);
    previous=duration;
  }
  assert.equal(previous,0,'large movements remain immediate');
});
