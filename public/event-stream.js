// Preserve the small EventSource interface used by the UI, while multiplexing
// state and optional spectrum frames on a single WebSocket per document.
export function createStreamFactory({Socket=globalThis.WebSocket,baseUrl=globalThis.location?.href,setTimer=setTimeout,clearTimer=clearTimeout,onUnload=callback=>globalThis.addEventListener?.('beforeunload',callback)}={}){
  const channels=new Map();let socket=null,timer=null,queued=false,snapshot=null,subscribedSpectrum=false;
  function emit(channel,type,data){
    if(channel.closed)return;
    const event=data===undefined?new Event(type):new MessageEvent(type,{data:JSON.stringify(data)});
    channel.dispatchEvent(event);channel['on'+type]?.(event);
  }
  function emitAll(type){for(const group of channels.values())for(const channel of group)emit(channel,type);}
  function schedule(){if(!queued){queued=true;queueMicrotask(()=>{queued=false;connect();});}}
  function syncSpectrum(){
    const wanted=channels.has('spectrum');
    if(socket?.readyState===1&&subscribedSpectrum!==wanted){socket.send(JSON.stringify({type:'spectrum',enabled:wanted}));subscribedSpectrum=wanted;}
  }
  function connect(){
    const wanted=channels.size>0;
    if(wanted&&socket&&socket.readyState<2){syncSpectrum();return;}
    clearTimer(timer);timer=null;
    const old=socket;socket=null;old?.close();snapshot=null;
    if(!wanted)return;
    const url=new URL('/api/live',baseUrl);url.protocol=url.protocol==='https:'?'wss:':'ws:';
    subscribedSpectrum=channels.has('spectrum');url.searchParams.set('spectrum',subscribedSpectrum?'1':'0');
    const current=new Socket(url.href);socket=current;let failed=false;
    current.onopen=()=>{if(socket===current){syncSpectrum();emitAll('open');}};
    current.onmessage=message=>{
      if(socket!==current)return;
      let envelope;try{envelope=JSON.parse(message.data);}catch{return;}
      const {stream,event,data}=envelope;
      if(stream==='events'){
        if(event==='snapshot')snapshot=data;
        else if(snapshot&&event==='state')snapshot={...snapshot,...data};
        else if(snapshot&&event==='profiles')snapshot={...snapshot,profiles:data};
        else if(snapshot&&event==='audio-status')snapshot={...snapshot,audio:data};
      }
      for(const channel of channels.get(stream)||[])emit(channel,event,data);
    };
    current.onerror=()=>{if(socket===current&&!failed){failed=true;emitAll('error');}};
    current.onclose=()=>{
      if(socket!==current)return;
      socket=null;snapshot=null;
      if(!failed)emitAll('error');
      if(channels.size)timer=setTimer(()=>{timer=null;connect();},1000);
    };
  }
  onUnload(()=>{clearTimer(timer);channels.clear();const old=socket;socket=null;old?.close();});
  return path=>{
    const name=path==='/api/events'?'events':path==='/api/spectrum'?'spectrum':null;
    if(!name)throw Error('Unknown live stream');
    const channel=new EventTarget();channel.closed=false;
    channel.close=()=>{if(channel.closed)return;channel.closed=true;const group=channels.get(name);group?.delete(channel);if(!group?.size)channels.delete(name);schedule();};
    if(!channels.has(name))channels.set(name,new Set());channels.get(name).add(channel);
    if(name==='events'&&snapshot){const cached=snapshot;queueMicrotask(()=>emit(channel,'snapshot',cached));}
    schedule();return channel;
  };
}

export const openEventStream=createStreamFactory();
