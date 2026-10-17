import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStreamFactory} from '../public/event-stream.js';

function fixture(){
  const sockets=[],timers=new Map();let nextTimer=0,unload;
  class Socket {
    constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
    open(){this.readyState=1;this.onopen?.();}
    send(data){this.sent.push(JSON.parse(data));}
    message(stream,event,data){this.onmessage?.({data:JSON.stringify({stream,event,data})});}
    close(){this.readyState=3;this.onclose?.();}
  }
  const open=createStreamFactory({Socket,baseUrl:'http://127.0.0.1:3963/overlay',setTimer:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},clearTimer:id=>timers.delete(id),onUnload:callback=>unload=callback});
  return {open,sockets,timers,unload:()=>unload()};
}
const flush=()=>new Promise(resolve=>queueMicrotask(resolve));

test('state and spectrum share one socket and toggling audio does not reconnect',async()=>{
  const f=fixture(),state=f.open('/api/events');let snapshot;
  state.addEventListener('snapshot',event=>snapshot=JSON.parse(event.data));
  await flush();assert.equal(f.sockets.length,1);const socket=f.sockets[0];socket.open();
  socket.message('events','snapshot',{track:{title:'Demo'},profiles:[]});assert.equal(snapshot.track.title,'Demo');
  const spectrum=f.open('/api/spectrum');let bands;
  spectrum.addEventListener('spectrum',event=>bands=JSON.parse(event.data).bands);
  await flush();assert.equal(f.sockets.length,1);assert.deepEqual(socket.sent.at(-1),{type:'spectrum',enabled:true});
  socket.message('spectrum','spectrum',{bands:[.7,.6]});assert.deepEqual(bands,[.7,.6]);
  spectrum.close();await flush();assert.equal(f.sockets.length,1);assert.equal(socket.readyState,1);
  assert.deepEqual(socket.sent.at(-1),{type:'spectrum',enabled:false});
  state.close();await flush();assert.equal(socket.readyState,3);assert.equal(f.timers.size,0);
});

test('reconnection ignores obsolete messages, keeps subscribers and restores spectrum demand',async()=>{
  const f=fixture(),state=f.open('/api/events'),spectrum=f.open('/api/spectrum');let count=0,errors=0;
  state.addEventListener('snapshot',()=>count++);state.onerror=()=>errors++;
  await flush();const old=f.sockets[0];old.open();old.close();assert.equal(errors,1);assert.equal(f.timers.size,1);
  const retry=[...f.timers.values()][0];f.timers.clear();retry();const fresh=f.sockets[1];fresh.open();
  assert.equal(new URL(fresh.url).searchParams.get('spectrum'),'1');
  old.message('events','snapshot',{});assert.equal(count,0);
  fresh.message('events','snapshot',{profiles:[]});assert.equal(count,1);
  f.unload();assert.equal(fresh.readyState,3);assert.equal(f.timers.size,0);
  state.close();spectrum.close();await flush();
});

test('late state subscribers receive the latest merged snapshot',async()=>{
  const f=fixture();f.open('/api/events');await flush();const socket=f.sockets[0];socket.open();
  socket.message('events','snapshot',{track:{position:1},profiles:[],audio:{source:'apple'}});
  socket.message('events','state',{track:{position:2}});socket.message('events','profiles',[{id:'scene'}]);
  socket.message('events','audio-status',{source:'off'});
  let snapshot;f.open('/api/events').addEventListener('snapshot',event=>snapshot=JSON.parse(event.data));await flush();
  assert.equal(snapshot.track.position,2);assert.equal(snapshot.profiles[0].id,'scene');assert.equal(snapshot.audio.source,'off');
  f.unload();
});
