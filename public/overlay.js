import {DEFAULTS,getSkin,skinDefaults,migrateConfig,visualizationMode} from '/shared.js';
import {buildSkin} from '/skin-renderer.js';
import {loadArtworkColor,contrastingArtworkColor} from '/artwork-color.js';
import {createTitleTransition} from '/title-transition.js';
import {createSpectrumSmoother} from '/spectrum-smoothing.js';
const params=new URLSearchParams(location.search);
const demo=params.get('preview')==='1',card=params.get('card')==='1',dashboard=params.get('dashboard')==='1';
const profileId=params.get('profile')||'default';
document.body.classList.toggle('preview',demo||dashboard);
document.body.classList.toggle('card',card);
const widget=document.querySelector('#widget'),frame=document.querySelector('#frame'),stage=document.querySelector('#stage');
const error=document.querySelector('#overlay-error');
let config={...DEFAULTS},track,view,activeSkin,streamAlive=true,pauseAt,lastArt='',lastCopy='';
let spectrumEvents=null,spectrumFrame=null,spectrumPaintPending=false;
const spectrumSmoother=createSpectrumSmoother();
let titleTransition=null;
let paletteKey='',paletteRequested=false,paletteVersion=0,artworkColor=null;
function applyAccent(){
  widget.style.setProperty('--accent',config.accentFromArtwork&&artworkColor?contrastingArtworkColor(artworkColor,config.background,config.accent):config.accent);
}
function updateArtworkAccent(){
  if(paletteKey!==lastArt){paletteKey=lastArt;paletteRequested=false;artworkColor=null;paletteVersion++;}
  applyAccent();
  if(!config.accentFromArtwork||paletteRequested||!lastArt||lastArt==='/placeholder.svg')return;
  paletteRequested=true;
  const version=paletteVersion;
  loadArtworkColor(lastArt).then(color=>{
    if(version!==paletteVersion)return;
    artworkColor=color;applyAccent();
  });
}
function drawSpectrum(data){
  spectrumFrame=data;
  if(!view||visualizationMode(config)!=='spectrum'||demo)return;
  const fresh=data&&Date.now()-(data.generatedAt??data.receivedAt)<150&&streamAlive&&track?.playing&&config.animate&&config.showVisualizer;
  if(!fresh)spectrumSmoother.reset();
  const levels=fresh?spectrumSmoother.update(data.bands):[];
  view.bars.forEach((bar,i)=>{
    const level=levels[i]||0;
    // Increase sensitivity smoothly, preserving differences instead of clipping
    // every loud band to the same height.
    const height=1-Math.pow(1-level,config.spectrumGain);
    bar.style.height=(2+height*28)+'px';
  });
}
function connectSpectrum(){
  const needed=!demo&&visualizationMode(config)==='spectrum'&&config.showVisualizer&&config.animate;
  widget.classList.toggle('real-spectrum',!demo&&visualizationMode(config)==='spectrum');
  if(!needed){spectrumEvents?.close();spectrumEvents=null;drawSpectrum(null);return;}
  if(spectrumEvents)return;
  drawSpectrum(null);
  spectrumEvents=new EventSource('/api/spectrum');
  spectrumEvents.addEventListener('spectrum',e=>{
    const data=JSON.parse(e.data),now=Date.now();
    if(now-(data.generatedAt??data.at??now)>150)return;
    spectrumFrame={...data,receivedAt:now};
    if(spectrumPaintPending)return;
    spectrumPaintPending=true;
    requestAnimationFrame(()=>{spectrumPaintPending=false;drawSpectrum(spectrumFrame);});
  });
  spectrumEvents.onerror=()=>drawSpectrum(null);
}
const demoStart=Date.now();
function demoTrack(){const playing=params.get('paused')!=='1';return {connected:true,playing,title:params.get('title')||'Midnight City',artist:'M83',album:'Hurry Up, We’re Dreaming',duration:243,position:84+(playing?((Date.now()-demoStart)/1000)%155:0),updatedAt:Date.now(),artwork:'demo'};}
function applyConfig(value){
  config=migrateConfig(value);
  if(card&&params.has('skin'))config=skinDefaults(params.get('skin'));
  if(activeSkin!==config.skin){
    titleTransition?.destroy();activeSkin=config.skin;view=buildSkin(widget,activeSkin);
    titleTransition=createTitleTransition(view.texts.find(([role])=>role==='title')[1]);
    lastArt='';lastCopy='';
  }
  if(!config.animate)titleTransition.finish();
  const meta=getSkin(config.skin);
  widget.className='widget skin-'+config.skin+' font-'+config.font;
  const mode=visualizationMode(config);
  widget.classList.add('mode-'+mode);
  widget.querySelector('[data-role="wave"]')?.setAttribute('aria-label',demo?'模拟频谱演示':'实时音频频谱');
  for(const [key,role]of Object.entries({showCover:'cover',showArtist:'artist',showAlbum:'album',showProgress:'progress',showTime:'time',showBadge:'badge',showVisualizer:'visualizer'}))widget.classList.toggle('no-'+role,!config[key]);
  if(mode==='spectrum'||mode==='progress')widget.classList.remove('no-progress');
  if(mode==='none')widget.classList.add('no-progress','no-time');
  widget.classList.toggle('no-animate',!config.animate);
  widget.classList.toggle('has-extras',config.showAlbum||config.showBadge);
  widget.style.setProperty('--accent',config.accent);widget.style.setProperty('--background',config.background);
  widget.style.setProperty('--foreground',config.foreground);widget.style.setProperty('--radius',config.radius+'px');
  widget.style.setProperty('--remaining',config.remainingColor);
  widget.style.width=meta.width+'px';widget.style.height=meta.height+'px';
  stage.style.justifyContent=demo||dashboard?'center':{left:'flex-start',center:'center',right:'flex-end'}[config.alignment];
  fit();render();connectSpectrum();requestAnimationFrame(detectOverflow);
}
function fit(){
  const meta=getSkin(config.skin);
  let scale=config.width/meta.width*config.scale;
  if(demo||dashboard)scale=Math.min(config.width/meta.width,(innerWidth-(card?22:56))/meta.width,(innerHeight-(card?12:50))/meta.height);
  scale=Math.max(.05,scale);
  frame.style.width=meta.width*scale+'px';frame.style.height=meta.height*scale+'px';
  widget.style.transform='scale('+scale+')';
}
function detectOverflow(){
  for(const [,el]of view.texts){
    if(!el)continue;
    const diff=el.scrollWidth-el.closest('[data-role]').clientWidth;
    el.classList.toggle('marquee',diff>5);el.style.setProperty('--travel',-Math.max(0,diff)+'px');
    el.style.setProperty('--marquee-time',Math.max(8,diff/24+5)+'s');
  }
}
function render(){
  if(demo)track=demoTrack();if(!track||!view)return;
  if(track.playing)pauseAt=null;else pauseAt??=Date.now();
  const hidden=!streamAlive||!track.connected||!track.title||(config.hidePaused&&pauseAt&&Date.now()-pauseAt>=config.hideDelay*1000);
  widget.classList.toggle('is-hidden',Boolean(hidden));widget.style.opacity=hidden?'0':String(config.opacity/100);
  widget.classList.toggle('paused',!track.playing);
  const key=track.title+'\0'+track.artist+'\0'+track.album;
  if(key!==lastCopy){
    lastCopy=key;
    for(const [role,el]of view.texts)if(el){
      const value=track[role]||(role==='artist'?'未知艺术家':'');
      if(role==='title')titleTransition.set(value,config.animate&&!hidden);
      else el.textContent=value;
    }
    requestAnimationFrame(detectOverflow);
  }
  if(hidden)titleTransition.finish();
  if(view.status)view.status.textContent=track.playing?'NOW PLAYING':'PAUSED';
  const art=track.artwork==='demo'?'/artwork.svg':track.artwork?'/api/artwork?v='+encodeURIComponent(track.artwork):'/placeholder.svg';
  if(art!==lastArt){lastArt=art;for(const img of view.art)img.src=art;}
  updateArtworkAccent();
  const elapsed=track.playing?Math.max(0,(Date.now()-track.updatedAt)/1000)*(track.rate||1):0;
  const position=Math.min(track.duration||0,(track.position||0)+elapsed),ratio=track.duration?position/track.duration:0;
  widget.classList.toggle('unknown-duration',!track.duration);
  if(view.fill)view.fill.style.width=ratio*100+'%';
  const time=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
  if(view.position)view.position.textContent=time(position);if(view.duration)view.duration.textContent=track.duration?time(track.duration):'--:--';
  const boundary=ratio*view.bars.length;
  view.bars.forEach((bar,i)=>bar.style.setProperty('--played',Math.max(0,Math.min(1,boundary-i))*100+'%'));
  if(!demo&&visualizationMode(config)==='spectrum'&&(!track.playing||!spectrumFrame||Date.now()-(spectrumFrame.generatedAt??spectrumFrame.receivedAt)>150))drawSpectrum(null);
}
function updateProfiles(profiles){
  const profile=profiles.find(p=>p.id===profileId);
  if(!profile){error.textContent='该场景已删除，请重新复制 OBS 地址';error.hidden=demo;frame.hidden=true;return;}
  frame.hidden=false;error.hidden=true;applyConfig(profile.config);
}
window.addEventListener('resize',()=>{fit();if(view)detectOverflow();});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  if(card&&event.data?.type==='gallery-motion')widget.classList.toggle('no-animate',!event.data.animate);
  if((demo||dashboard)&&!card&&event.data?.type==='preview-config')applyConfig(event.data.config);
});
if(card)applyConfig(skinDefaults(params.get('skin')));
else{
  const events=new EventSource('/api/events');
  events.addEventListener('snapshot',e=>{const data=JSON.parse(e.data);streamAlive=true;track=data.track;updateProfiles(data.profiles);render();});
  events.addEventListener('state',e=>{streamAlive=true;if(!demo)track=JSON.parse(e.data).track;render();});
  events.addEventListener('profiles',e=>updateProfiles(JSON.parse(e.data)));
  events.onerror=()=>{if(!demo){streamAlive=false;render();}};
}
setInterval(render,200);
