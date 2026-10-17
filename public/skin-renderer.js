// Independent DOM for every design; the playback engine fills data-role elements.
const title = '<div class="song-title" data-role="title"><span class="title-motion"><span data-text></span></span></div>';
const artist = '<div class="song-artist" data-role="artist"><span data-text></span></div>';
const album = '<div class="song-album" data-role="album"><span data-text></span></div>';
const badge = '<div class="music-badge" data-role="badge">♫ APPLE MUSIC <span data-role="status">NOW PLAYING</span></div>';
const miniWave = '<div class="mini-wave" data-role="visualizer"><i></i><i></i><i></i><i></i><i></i></div>';
const image = (cls='',role='cover') => `<img class="${cls}" data-art data-role="${role}" alt="${role==='cover'?'专辑封面':''}" src="/placeholder.svg">`;
const heights = [55,72,64,88,80,95,70,84,62,58,44,50,36,30,42,28,34,50,46,62,70,66,90,100,82,94,76,70,52,60,40,46,30,38,26,40,50,62,58,74,86,78,64,50];
const wave = `<div class="pulse-wave" data-role="wave" aria-label="播放状态波形动画">${heights.map((h,i)=>`<i style="height:${h}%;--wave-delay:-${((i*.173)%1.7).toFixed(3)}s;--wave-speed:${(.65+i%7*.09).toFixed(2)}s"></i>`).join('')}</div>`;
const clock = `<div class="scrubber"><span class="time time-left" data-role="position">0:00</span><div class="progress-track" data-role="progress"><div class="progress-fill" data-role="fill"></div></div>${wave}<span class="time time-right" data-role="duration">0:00</span></div>`;
const copy = (artistFirst=false) => `${badge}${artistFirst?artist+title:title+artist}${album}${clock}${miniWave}`;
const record = dark => `<div class="record-panel ${dark?'dark-record':'light-record'}"><div class="record-disc" data-role="cover">${image('record-image')}<div class="record-hole"></div></div><div class="copy">${copy()}</div></div>`;
export const SKIN_TEMPLATES = Object.freeze({
  default: `<div class="default-panel">${image('album-backdrop','backdrop')}<div class="default-cover" data-role="cover">${image()}</div><div class="copy">${copy()}</div></div>`,
  experimental: `<div class="experimental-panel"><div class="gradient-rail rail-top"></div><div class="experimental-content"><div class="experimental-cover" data-role="cover">${image()}</div><div class="copy">${copy(true)}</div></div><div class="gradient-rail rail-bottom"></div></div>`,
  aurora: `<div class="aurora-panel">${image('album-backdrop','backdrop')}<div class="aurora-tint"></div><div class="aurora-cover" data-role="cover">${image()}</div><div class="aurora-spine"></div><div class="copy">${copy()}</div><div class="aurora-edge"></div></div>`,
  prism: `<div class="prism-panel"><div class="prism-cover" data-role="cover">${image()}<div class="prism-slash"></div></div><div class="copy">${copy()}</div></div>`,
  pulse: `<div class="pulse-panel">${image('pulse-light','backdrop')}<div class="copy">${badge}${title}${artist}${album}<div class="scrubber pulse-scrubber"><span class="time time-left" data-role="position">0:00</span>${wave}<div class="progress-track" data-role="progress"><div class="progress-fill" data-role="fill"></div></div><span class="time time-right" data-role="duration">0:00</span></div></div></div><div class="pulse-cover" data-role="cover">${image('pulse-glow','glow')}${image('pulse-front')}</div>`,
  'pulse-progress': `<div class="pulse-panel">${image('pulse-light','backdrop')}<div class="copy">${badge}${title}${artist}${album}${clock}</div></div><div class="pulse-cover" data-role="cover">${image('pulse-glow','glow')}${image('pulse-front')}</div>`,
  rotating: record(false),
  'rotating-dark': record(true),
  modern: `<div class="modern-panel"><div class="modern-disc" data-role="cover"><svg viewBox="0 0 40 40" aria-label="旋转唱片图标"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" opacity=".4"/><circle cx="20" cy="20" r="5" fill="currentColor"/><path d="M20 3a17 17 0 0 1 17 17" fill="none" stroke="currentColor" stroke-width="4" opacity=".35"/></svg></div><div class="copy"><div class="song-line">${title}<span class="song-separator"> - </span>${artist}</div>${album}${badge}${clock}${miniWave}</div></div>`,
  'modern-v2': `<div class="modern-two-panel"><div class="modern-heading"><span>NOW</span><span>PLAYING</span></div><div class="modern-divider"></div><div class="copy">${copy()}</div></div>`,
  transparent: `<div class="transparent-panel"><div class="transparent-cover" data-role="cover">${image()}</div><div class="copy">${copy()}</div></div>`,
  'aiden-redesign': `<div class="redesign-panel"><div class="redesign-cover" data-role="cover">${image()}</div><div class="copy">${copy()}</div></div>`,
  rainbow: `<div class="rainbow-panel"><div class="rainbow-cover" data-role="cover">${image()}</div><div class="copy">${copy()}</div></div>`,
  aiden: `<div class="aiden-panel"><div class="aiden-cover" data-role="cover">${image()}</div><div class="copy">${copy(true)}</div></div>`,
});
export function buildSkin(widget,id) {
  if (!SKIN_TEMPLATES[id]) throw Error(`Unknown skin: ${id}`);
  widget.innerHTML = SKIN_TEMPLATES[id];
  for (const img of widget.querySelectorAll('[data-art]')) img.addEventListener('error',()=>{if(!img.src.endsWith('/placeholder.svg'))img.src='/placeholder.svg';});
  return {
    texts:['title','artist','album'].map(role=>[role,widget.querySelector(`[data-role="${role}"] [data-text]`)]),
    art:[...widget.querySelectorAll('[data-art]')],fill:widget.querySelector('[data-role="fill"]'),
    position:widget.querySelector('[data-role="position"]'),duration:widget.querySelector('[data-role="duration"]'),
    status:widget.querySelector('[data-role="status"]'),bars:[...widget.querySelectorAll('.pulse-wave i')],
  };
}
