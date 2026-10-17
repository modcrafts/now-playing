import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {attachLiveUpdates} from '../lib/live-updates.mjs';

async function fixture(t,snapshot={track:{title:'Demo'},profiles:[]}){
  const subscribers=new Set(),sockets=[];
  const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg"/>');});
  server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
  const audio={subscribeEvents(send){subscribers.add(send);send('audio-status',{status:'capturing'});return ()=>subscribers.delete(send);}};
  const live=attachLiveUpdates(server,{port,snapshot:()=>snapshot,audio});
  t.after(async()=>{for(const socket of sockets)socket.close();live.close();await new Promise(resolve=>server.close(resolve));});
  async function connect(spectrum=false){
    const socket=new WebSocket(`ws://127.0.0.1:${port}/api/live?spectrum=${spectrum?1:0}`);sockets.push(socket);
    const queue=[],waiting=[];
    socket.addEventListener('message',message=>{const value=JSON.parse(message.data),index=waiting.findIndex(item=>item.predicate(value));if(index<0)queue.push(value);else{const [item]=waiting.splice(index,1);clearTimeout(item.timer);item.resolve(value);}});
    await Promise.race([once(socket,'open'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('WebSocket open timeout')),2000);timer.unref();})]);
    return {socket,next(predicate){const index=queue.findIndex(predicate);if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);return new Promise((resolve,reject)=>{const item={predicate,resolve,timer:setTimeout(()=>reject(Error('Live message timeout')),2000)};waiting.push(item);});}};
  }
  return {live,connect,subscribers,port,base:`http://127.0.0.1:${port}`};
}
const native={skip:typeof WebSocket==='undefined'};

test('one live socket multiplexes state and on-demand spectrum, and releases capture',native,async t=>{
  const f=await fixture(t),client=await f.connect();
  assert.equal((await client.next(item=>item.event==='snapshot')).data.track.title,'Demo');assert.equal(f.subscribers.size,0);
  client.socket.send(JSON.stringify({type:'spectrum',enabled:true}));
  assert.equal((await client.next(item=>item.stream==='spectrum'&&item.event==='audio-status')).data.status,'capturing');assert.equal(f.subscribers.size,1);
  for(const send of f.subscribers)send('spectrum',{bands:[.7,.6]});
  assert.deepEqual((await client.next(item=>item.event==='spectrum')).data.bands,[.7,.6]);
  f.live.broadcast('state',{track:{position:10}});assert.equal((await client.next(item=>item.event==='state')).data.track.position,10);
  client.socket.send(JSON.stringify({type:'spectrum',enabled:false}));
  for(let i=0;i<50&&f.subscribers.size;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.subscribers.size,0);assert.equal(client.socket.readyState,WebSocket.OPEN);
});

test('twelve live components leave ordinary image requests responsive',native,async t=>{
  const f=await fixture(t),clients=await Promise.all(Array.from({length:12},()=>f.connect(true)));
  await Promise.all(clients.map(client=>client.next(item=>item.event==='snapshot')));assert.equal(f.subscribers.size,12);
  const response=await fetch(f.base+'/artwork.svg',{signal:AbortSignal.timeout(2000)});
  assert.equal(response.status,200);assert.match(await response.text(),/<svg/);
});

test('large state snapshots use extended WebSocket frame lengths',native,async t=>{
  const title='x'.repeat(100000),f=await fixture(t,{track:{title},profiles:[]}),client=await f.connect();
  assert.equal((await client.next(item=>item.event==='snapshot')).data.track.title,title);
});

test('cross-site upgrades are rejected before any state is exposed',async t=>{
  const f=await fixture(t);
  const status=await new Promise((resolve,reject)=>{
    const request=http.request(f.base+'/api/live',{headers:{Connection:'Upgrade',Upgrade:'websocket',Origin:'https://example.com','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ=='}},response=>{response.resume();resolve(response.statusCode);});
    request.on('error',reject);request.end();
  });assert.equal(status,403);
});
