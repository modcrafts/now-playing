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
test('tiny trends pass through unchanged while repeated rapid wobbles are damped',()=>{
  const smoother=createSpectrumSmoother(1);smoother.update([.5],0);
  const slight=smoother.update([.503],20)[0];
  assert.equal(slight,.503,'a tiny change is not attenuated');
  for(let i=0;i<12;i++){
    const target=.503+(i+1)*.0001,value=smoother.update([target],40+i*20)[0];
    assert.equal(value,target,'a subtle one-direction trend has no added lag or attenuation');
  }
  const output=[];
  for(let i=0;i<40;i++)output.push(smoother.update([i%2?.48:.52],300+i*20)[0]);
  const settled=output.slice(5);
  assert.ok(Math.max(...settled)-Math.min(...settled)<.02,'rapid small reversals are damped after detecting the pattern');
  assert.ok(new Set(settled).size>4,'the spectrum still moves continuously rather than freezing');
});
test('large beats stay responsive without queued frames or a long release tail',()=>{
  const smoother=createSpectrumSmoother(1);smoother.update([.2],0);
  assert.equal(smoother.update([.9],20)[0],.9);
  assert.equal(smoother.update([.1],40)[0],.1);
  assert.equal(smoother.update([0],60)[0],0);
});
test('small overall volume changes pass through even when they change direction rapidly',()=>{
  const smoother=createSpectrumSmoother(8),base=Array.from({length:8},(_,i)=>.2+i*.05);
  smoother.update(base,0);
  for(let i=0;i<20;i++){
    const frame=base.map(value=>value*(i%2?1.005:.995));
    assert.deepEqual(smoother.update(frame,(i+1)*20),frame);
  }
});
