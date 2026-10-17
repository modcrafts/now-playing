import {createHash} from 'node:crypto';
import {encodeSpectrumFrame,SPECTRUM_FORMAT} from '../public/spectrum-codec.js';

function frame(opcode,payload=Buffer.alloc(0)){
  const size=payload.length,extra=size<126?0:size<=65535?2:8;
  const header=Buffer.alloc(2+extra);header[0]=0x80|opcode;header[1]=extra===0?size:extra===2?126:127;
  if(extra===2)header.writeUInt16BE(size,2);
  if(extra===8)header.writeBigUInt64BE(BigInt(size),2);
  return Buffer.concat([header,payload]);
}

// One upgraded connection per page carries state and optional audio frames.
// It does not occupy the browser's ordinary HTTP/SSE connection pool.
export function attachLiveUpdates(server,{port,snapshot,audio}){
  const clients=new Set();
  function upgrade(req,socket,head){
    const host=req.headers.host,origin=req.headers.origin;
    const allowed=[`127.0.0.1:${port}`,`localhost:${port}`];
    const reject=status=>socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    if(!allowed.includes(host)||(origin&&!allowed.some(value=>origin===`http://${value}`)))return reject('403 Forbidden');
    const url=new URL(req.url,`http://${host}`);
    if(url.pathname!=='/api/live')return reject('404 Not Found');
    const binarySpectrum=url.searchParams.get('format')===SPECTRUM_FORMAT;
    const key=req.headers['sec-websocket-key'];
    if(req.method!=='GET'||req.headers.upgrade?.toLowerCase()!=='websocket'||req.headers['sec-websocket-version']!=='13'||typeof key!=='string'||!/^[A-Za-z0-9+/]{22}==$/.test(key))return reject('400 Bad Request');
    const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);socket.setTimeout(0);
    let pending=Buffer.alloc(0),unsubscribe=null,closed=false,alive=true;
    const client={
      send(stream,event,data){
        if(closed||socket.destroyed||socket.writableEnded)return;
        if(socket.writableLength>262144){close(1013);return;}
        if(event==='spectrum'&&socket.writableLength>0)return;
        if(binarySpectrum&&stream==='spectrum'&&event==='spectrum'){
          const payload=encodeSpectrumFrame(data);
          if(payload){socket.write(frame(2,payload));return;}
        }
        socket.write(frame(1,Buffer.from(JSON.stringify({stream,event,data}))));
      },
      ping(){if(!alive){socket.destroy();cleanup();return;}alive=false;socket.write(frame(9));},
      close:()=>close(1001),
    };
    function setSpectrum(enabled){
      if(enabled&&!unsubscribe)unsubscribe=audio.subscribeEvents((event,data)=>client.send('spectrum',event,data));
      else if(!enabled&&unsubscribe){unsubscribe();unsubscribe=null;}
    }
    function cleanup(){if(closed)return;closed=true;clients.delete(client);unsubscribe?.();unsubscribe=null;}
    function close(code){if(closed)return;const payload=Buffer.alloc(2);payload.writeUInt16BE(code);cleanup();socket.end(frame(8,payload));}
    function receive(chunk){
      if(closed)return;
      pending=Buffer.concat([pending,chunk]);
      if(pending.length>65550){close(1009);return;}
      while(pending.length>=2){
        const first=pending[0],second=pending[1],opcode=first&15;
        if((first&0x70)||!(first&0x80)||!(second&0x80)){close(1002);return;}
        let size=second&127,offset=2;
        if(size===126){if(pending.length<4)return;size=pending.readUInt16BE(2);offset=4;}
        else if(size===127){if(pending.length<10)return;const wide=pending.readBigUInt64BE(2);if(wide>65536n){close(1009);return;}size=Number(wide);offset=10;}
        if(opcode>=8&&size>125){close(1002);return;}
        if(pending.length<offset+4+size)return;
        const mask=pending.subarray(offset,offset+4),payload=Buffer.from(pending.subarray(offset+4,offset+4+size));
        for(let i=0;i<size;i++)payload[i]^=mask[i%4];
        pending=pending.subarray(offset+4+size);
        if(opcode===8){if(size===1){close(1002);return;}cleanup();socket.end(frame(8,payload));return;}
        if(opcode===9)socket.write(frame(10,payload));
        else if(opcode===10)alive=true;
        else if(opcode===1){
          if(size>1024){close(1009);return;}
          let command;try{command=JSON.parse(payload.toString('utf8'));}catch{close(1007);return;}
          if(command?.type!=='spectrum'||typeof command.enabled!=='boolean'){close(1008);return;}
          setSpectrum(command.enabled);
        }
        else {close(1003);return;}
      }
    }
    socket.on('data',receive);socket.on('close',cleanup);socket.on('end',cleanup);socket.on('error',()=>{cleanup();socket.destroy();});
    clients.add(client);client.send('events','snapshot',snapshot());
    setSpectrum(url.searchParams.get('spectrum')==='1');
    if(head.length)receive(head);
  }
  server.on('upgrade',upgrade);
  const heartbeat=setInterval(()=>{for(const client of clients)client.ping();},15000);
  return {
    broadcast(event,data){for(const client of clients)client.send('events',event,data);},
    close(){clearInterval(heartbeat);server.off('upgrade',upgrade);for(const client of clients)client.close();clients.clear();},
  };
}
