import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSpectrumSmoother} from '../public/spectrum-smoothing.js';
test('quiet onsets have no added gate and silence clears immediately',()=>{
  const smoother=createSpectrumSmoother(1);
  assert.equal(smoother.update([0],0)[0],0);
  assert.equal(smoother.update([.000001],20)[0],.000001);
  assert.equal(smoother.update([0],40)[0],0);
  assert.equal(smoother.update([.001],60)[0],.001);
  assert.ok(smoother.update([.003],80)[0]>.0028,'a small but real increase still responds quickly');
  smoother.reset();assert.equal(smoother.update([.000001],100)[0],.000001);
});
test('small changes keep moving continuously while repeated rapid wobbles are damped',()=>{
  const smoother=createSpectrumSmoother(1);smoother.update([.5],0);
  const slight=smoother.update([.503],20)[0];
  assert.ok(slight>.5&&slight<.503,'even a tiny change remains visible in the output');
  let last=slight;
  for(let i=0;i<12;i++){
    const value=smoother.update([.503],40+i*20)[0];
    assert.ok(value>last&&value<.503,'small sustained changes settle smoothly without freezing');last=value;
  }
  const output=[];
  for(let i=0;i<40;i++)output.push(smoother.update([i%2?.48:.52],300+i*20)[0]);
  assert.ok(Math.max(...output)-Math.min(...output)<.02,'visible wobble is less than half the raw variation');
});
test('large beats stay responsive without queued frames or a long release tail',()=>{
  const smoother=createSpectrumSmoother(1);smoother.update([.2],0);
  assert.ok(smoother.update([.9],20)[0]>.84);
  assert.ok(smoother.update([.1],40)[0]<.17);
  assert.equal(smoother.update([0],60)[0],0);
});
