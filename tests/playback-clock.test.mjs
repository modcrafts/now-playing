import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackClock} from '../public/playback-clock.js';

const track=(changes={})=>({connected:true,playing:true,source:'AppleMusic',title:'Demo',artist:'Artist',album:'Album',position:80,duration:240,updatedAt:1000,...changes});

test('small backward reports hold the progress boundary until the source catches up',()=>{
  const clock=createPlaybackClock();
  assert.equal(clock.position(track(),1000),80);
  assert.equal(clock.position(track(),1600),80.6);
  const correction=track({position:79.4,updatedAt:1700});
  assert.equal(clock.position(correction,1700),80.6,'a 1.3 second correction cannot move the boundary backward');
  assert.equal(clock.position(correction,2100),80.6);
  assert.equal(clock.position(correction,3000),80.7,'the source catches up without keeping a permanent offset');
});

test('repeated quantized reports never move backward or accumulate extra progress',()=>{
  const clock=createPlaybackClock();let last=0;
  for(let time=1000;time<=21000;time+=100){
    const sampleAt=1000+Math.floor((time-1000)/700)*700;
    const reported=80+Math.floor((sampleAt-1000)/1000);
    const position=clock.position(track({position:reported,updatedAt:sampleAt}),time);
    assert.ok(position>=last,'continuous playback advances monotonically');
    assert.ok(position<=80+(time-1000)/1000+1e-10,'corrections do not build up a clock offset');
    last=position;
  }
});

test('backward seeks, restarting and changing tracks or sessions take effect immediately',()=>{
  const clock=createPlaybackClock();clock.position(track(),1000);
  assert.equal(clock.position(track({position:30,updatedAt:1700}),1700),30);
  assert.equal(clock.position(track({position:0,updatedAt:2400}),2400),0);
  clock.position(track({position:1.5,updatedAt:3000}),3000);
  assert.equal(clock.position(track({position:0,updatedAt:3700}),3700),0,'replay near the beginning bypasses correction holding');
  clock.position(track(),4000);
  assert.equal(clock.position(track({title:'New demo',position:79,updatedAt:4000}),4000),79);
  assert.equal(clock.position(track({title:'New demo',source:'Other',position:78,updatedAt:4100}),4100),78);
});

test('pause, resume, rate changes, duration bounds and disconnect stay accurate',()=>{
  const clock=createPlaybackClock();clock.position(track(),2000);
  const paused=track({playing:false,position:80.5,updatedAt:2100});
  assert.equal(clock.position(paused,2100),80.5);
  assert.equal(clock.position(paused,9000),80.5);
  assert.equal(clock.position(track({position:79.5,updatedAt:9000}),9000),79.5,'resume synchronizes to the player');
  assert.equal(clock.position(track({rate:2}),10000),98);
  assert.equal(clock.position(track({position:239.8,updatedAt:10000}),11000),240);
  assert.equal(clock.position(track({duration:0}),11000),0);
  assert.equal(clock.position(track({connected:false}),11000),0);
  assert.equal(clock.position(track({position:1,updatedAt:11000}),11000),1);
  clock.reset();assert.equal(clock.position(track({position:.5,updatedAt:11000}),11000),.5);
});
