import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackClock} from '../public/playback-clock.js';

const track=(changes={})=>({connected:true,playing:true,source:'AppleMusic',title:'Demo',artist:'Artist',album:'Album',position:80,duration:240,updatedAt:1000,...changes});
const read=(clock,value,time,tick=time)=>clock.position(value,time,tick);

test('small report corrections keep moving without pauses or catch-up jumps',()=>{
  const clock=createPlaybackClock();
  assert.equal(read(clock,track(),1000),80);
  assert.equal(read(clock,track(),1600),80.6);
  const correction=track({position:79.4,updatedAt:1700});
  let previous=read(clock,correction,1700);
  assert.ok(Math.abs(previous-80.7)<1e-10,'a new report does not overwrite the advancing clock');
  for(let time=1800;time<=3000;time+=100){
    const value=read(clock,correction,time),step=value-previous;
    assert.ok(step>=.095-1e-10&&step<=.105+1e-10,'each step stays within five percent of playback speed');
    previous=value;
  }
  const forward=track({position:correction.position+(3100-correction.updatedAt)/1000+1.3,updatedAt:3100});
  const value=read(clock,forward,3100);
  assert.ok(value-previous<=.105+1e-10,'small forward corrections cannot create a burst');
});

test('repeated quantized reports advance continuously with bounded error',()=>{
  const clock=createPlaybackClock();let last=0;
  for(let time=1000;time<=121000;time+=100){
    const sampleAt=1000+Math.floor((time-1000)/700)*700;
    const reported=80+Math.floor((sampleAt-1000)/1000);
    const position=read(clock,track({position:reported,updatedAt:sampleAt}),time);
    if(time>1000){
      const step=position-last;
      assert.ok(step>=.095-1e-10&&step<=.105+1e-10,'neither stalls nor bursts at media update boundaries');
    }
    assert.ok(Math.abs(position-(80+(time-1000)/1000))<1,'timing error stays below report quantization instead of accumulating');
    last=position;
  }
});

test('a persistent small timing offset converges gradually instead of remaining inaccurate',()=>{
  const clock=createPlaybackClock();read(clock,track(),1000);let position=80;
  for(let time=1100;time<=61100;time+=100){
    const source=track({position:80+(time-1000)/1000-1.3,updatedAt:time});
    position=read(clock,source,time);
  }
  const actual=80+(61100-1000)/1000-1.3;
  assert.ok(Math.abs(position-actual)<.02,'small phase errors are corrected without permanently retaining the old offset');
});

test('backward seeks, restarting and changing tracks or sessions take effect immediately',()=>{
  const clock=createPlaybackClock();read(clock,track(),1000);
  assert.equal(read(clock,track({position:30,updatedAt:1700}),1700),30);
  assert.equal(read(clock,track({position:0,updatedAt:2400}),2400),0);
  read(clock,track({position:1.5,updatedAt:3000}),3000);
  assert.equal(read(clock,track({position:0,updatedAt:3700}),3700),0,'replay near the beginning resynchronizes immediately');
  read(clock,track(),4000);
  assert.equal(read(clock,track({title:'New demo',position:79,updatedAt:4000}),4000),79);
  assert.equal(read(clock,track({title:'New demo',source:'Other',position:78,updatedAt:4100}),4100),78);
});

test('pause, resume, rate changes, duration bounds and disconnect stay accurate',()=>{
  const clock=createPlaybackClock();read(clock,track(),2000);
  const paused=track({playing:false,position:80.5,updatedAt:2100});
  assert.equal(read(clock,paused,2100),80.5);
  assert.equal(read(clock,paused,9000),80.5);
  assert.equal(read(clock,track({position:79.5,updatedAt:9000}),9000),79.5,'resume synchronizes to the player');
  assert.equal(read(clock,track({rate:2}),10000),98);
  assert.equal(read(clock,track({position:239.8,updatedAt:10000}),11000),240);
  assert.equal(read(clock,track({duration:0}),11000),0);
  assert.equal(read(clock,track({connected:false}),11000),0);
  assert.equal(read(clock,track({position:1,updatedAt:11000}),11000),1);
  clock.reset();assert.equal(read(clock,track({position:.5,updatedAt:11000}),11000),.5);
});

test('wall-clock adjustments do not interrupt monotonic playback',()=>{
  const clock=createPlaybackClock(),source=track();
  read(clock,source,1000,100);
  assert.equal(read(clock,source,1200,300),80.2);
  assert.ok(Math.abs(read(clock,source,700,500)-80.4)<1e-10);
});
