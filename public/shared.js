export const DEFAULTS = {
  layoutVersion:2, skin:'default', accent:'#2ec8c0', accentFromArtwork:false, background:'#1a1a1a', foreground:'#ffffff', remainingColor:'#6b7280',
  width:700, scale:1, opacity:100, radius:30, font:'system',
  showCover:true, showArtist:true, showAlbum:false, showProgress:false,
  showTime:false, showBadge:false, showVisualizer:false,
  animate:true, hidePaused:false, hideDelay:5, alignment:'left', visualization:'default', spectrumGain:1,
};
// Bounds include every overhanging cover and disc.
export const SKINS = [
  {id:'default',name:'Default',label:'悬出封面 · 专辑模糊背景',tag:'经典',category:'minimal',width:710,height:172},
  {id:'experimental',name:'Experimental',label:'上下渐变横条 · 艺术家在上',tag:'创意',category:'creative',width:700,height:200,preset:{accent:'#22c1c3',background:'#000000',radius:0}},
  {id:'aurora',name:'Aurora',label:'专辑氛围光 · 竖向光脊',tag:'光影',category:'animated',width:700,height:176,preset:{background:'#08080c',radius:20}},
  {id:'prism',name:'Prism',label:'斜切宽封面 · 紫粉渐变进度',tag:'光影',category:'creative',width:700,height:168,preset:{accent:'#c65ce8',background:'#06060a',radius:16,showProgress:true,showTime:true}},
  {id:'pulse',name:'Pulse',label:'悬浮方封面 · 长波形进度',tag:'动态',category:'animated',width:700,height:196,preset:{accent:'#f5c518',background:'#0d0d12',radius:18,showProgress:true,showTime:true,showVisualizer:true}},
  {id:'pulse-progress',name:'Pulse Progress',label:'悬浮方封面 · 普通进度条',tag:'新增',category:'minimal',width:700,height:196,preset:{accent:'#f5c518',background:'#0d0d12',radius:18,showProgress:true,showTime:true,visualization:'progress'}},
  {id:'rotating',name:'Rotating',label:'外凸旋转唱片 · 浅色面板',tag:'黑胶',category:'vinyl',width:824,height:264,preset:{background:'#ffffff',foreground:'#54576f',radius:30}},
  {id:'rotating-dark',name:'Rotating Dark',label:'外凸旋转唱片 · 深色面板',tag:'黑胶',category:'vinyl',width:824,height:264,preset:{background:'#1e1e1e',foreground:'#e8e8e8',radius:30}},
  {id:'modern',name:'Modern',label:'旋转唱片图标 · 单行歌曲',tag:'极简',category:'minimal',width:700,height:70,preset:{background:'#0b0b0d',radius:30}},
  {id:'modern-v2',name:'Modern V2',label:'NOW PLAYING 字排 · 竖线分隔',tag:'透明',category:'creative',width:700,height:160,preset:{radius:0}},
  {id:'transparent',name:'Transparent',label:'透明背景 · 金色艺术家',tag:'透明',category:'minimal',width:700,height:160,preset:{accent:'#ffd700',radius:30}},
  {id:'aiden-redesign',name:'Aiden Wallis Redesign',label:'一体封面 · 绿色歌名',tag:'经典',category:'minimal',width:700,height:160,preset:{accent:'#06ab4f',background:'#1e1e1e',radius:30}},
  {id:'rainbow',name:'Rainbow',label:'上浮封面 · 青蓝面板与进度',tag:'经典',category:'animated',width:700,height:200,preset:{background:'#1a3344',foreground:'#b6efe8',radius:30,showProgress:true,showTime:true}},
  {id:'aiden',name:'Aiden Wallis',label:'方形拼接 · 青绿艺术家在上',tag:'经典',category:'minimal',width:700,height:140,preset:{accent:'#25cba3',background:'#1b1d20',radius:0}},
];
export const getSkin = id => SKINS.find(skin => skin.id === id) || SKINS[0];
export function skinDefaults(id) { return {...DEFAULTS,skin:getSkin(id).id,...getSkin(id).preset}; }
export function applySkin(config,id) {
  return {...config,...skinDefaults(id),...Object.fromEntries(['width','scale','opacity','font','hidePaused','hideDelay','alignment','animate','spectrumGain','accentFromArtwork'].filter(k=>k in config).map(k=>[k,config[k]]))};
}
export function migrateConfig(config={}) { return config.layoutVersion===2 ? {...skinDefaults(config.skin),...config} : applySkin(config,config.skin); }
export function outputSize(config) {
  const skin=getSkin(config.skin), width=config.width*config.scale;
  return {width:Math.ceil(width+48),height:Math.ceil(width*skin.height/skin.width+48)};
}
export function visualizationMode(config) {
  if(config.visualization&&config.visualization!=='default')return config.visualization;
  return config.skin==='pulse'?'spectrum':config.showProgress?'progress':'none';
}
