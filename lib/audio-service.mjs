import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export async function createAudioService({ root, runtime, disabled, broadcast }) {
  let mode = 'apple';
  try { const saved=JSON.parse(await readFile(resolve(runtime,'audio.json'),'utf8')); if(['apple','system','off'].includes(saved.mode)) mode=saved.mode; } catch {}
  let state={status:'idle',source:mode,message:'尚未请求频谱',lastUpdate:null,signal:false};
  let child,stopTimer,retryTimer,closed=false,lastSignal=0,lastStatus='';
  const clients=new Set();
  let configQueue=Promise.resolve();
  const zero={bands:Array(44).fill(0),rms:0,peak:0};
  function send(res,event,data) { if(res.writableLength>65536) { res.destroy(); clients.delete(res); } else res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
  function status(value) {
    state={...state,...value,source:mode};
    const key=JSON.stringify({...state,lastUpdate:null});
    if(key!==lastStatus) { lastStatus=key; broadcast('audio-status',state); for(const res of clients) send(res,'audio-status',state); }
  }
  function stop() {
    clearTimeout(retryTimer); retryTimer=null;
    if(child) { const owned=child; child=null; owned.kill(); }
    lastSignal=0;
  }
  function start() {
    if(closed||child||!clients.size) return;
    if(mode==='off') { status({status:'off',message:'音频采集已关闭',signal:false}); return; }
    if(disabled||process.platform!=='win32') { status({status:'unavailable',message:'此环境未启用 Windows 音频环回',signal:false}); return; }
    status({status:'starting',message:'正在启动音频环回…',signal:false});
    const owned=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve(root,'bridge','audio.ps1'),'-Mode',mode],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    child=owned;
    createInterface({input:owned.stdout}).on('line',line=>{
      if(child!==owned) return;
      let data; try { data=JSON.parse(line); } catch { return; }
      if(data.type==='audio-status') {
        status({...data,lastUpdate:Date.now(),signal:false});
        if(data.status!=='capturing') for(const res of clients) send(res,'spectrum',{...zero,at:Date.now()});
      } else if(data.type==='spectrum'&&Array.isArray(data.bands)&&data.bands.length===44&&data.bands.every(n=>Number.isFinite(n)&&n>=0&&n<=1)) {
        const at=Date.now();
        if(data.rms>0.000015) lastSignal=at;
        const signal=at-lastSignal<700;
        status({lastUpdate:at,signal});
        for(const res of clients) send(res,'spectrum',{bands:data.bands,rms:data.rms,peak:data.peak,at});
      }
    });
    owned.stderr.on('data',data=>{ console.error('[audio]',data.toString().slice(0,500)); });
    owned.on('error',err=>{ if(child===owned) status({status:'error',message:err.message,signal:false}); });
    owned.on('exit',()=>{
      if(child!==owned||closed) return;
      child=null; status({status:'error',message:'音频采集已退出，3 秒后重试',signal:false});
      for(const res of clients) send(res,'spectrum',{...zero,at:Date.now()});
      retryTimer=setTimeout(start,3000);
    });
  }
  const heartbeat=setInterval(()=>{for(const res of clients) res.write(': heartbeat\n\n');},15000);
  return {
    getState:()=>({...state,subscribers:clients.size}),
    subscribe(req,res) {
      clearTimeout(stopTimer);
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      clients.add(res); send(res,'audio-status',state); start();
      req.on('close',()=>{clients.delete(res);if(!closed&&!clients.size) stopTimer=setTimeout(()=>{stop();status({status:'idle',message:'没有频谱组件，采集已停止',signal:false});},1500);});
    },
    async configure(value) {
      if(!value||!['apple','system','off'].includes(value.mode)) throw Error('音频来源无效');
      configQueue=configQueue.catch(()=>{}).then(async()=>{
      const temp=resolve(runtime,'audio.tmp'); await writeFile(temp,JSON.stringify({mode:value.mode}),'utf8'); await rename(temp,resolve(runtime,'audio.json'));
      if(mode!==value.mode) { stop();mode=value.mode;status({status:'idle',message:'音频来源已更新',signal:false});for(const res of clients)send(res,'spectrum',{...zero,at:Date.now()});start(); }
      return this.getState();
      });
      return configQueue;
    },
    close() { closed=true;clearTimeout(stopTimer);clearTimeout(retryTimer);clearInterval(heartbeat);stop();for(const res of clients)res.end();clients.clear(); },
  };
}
