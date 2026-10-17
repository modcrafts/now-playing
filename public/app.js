import { DEFAULTS, SKINS, applySkin, skinDefaults, migrateConfig, outputSize, visualizationMode } from '/shared.js';
import {openEventStream} from '/event-stream.js';
const $ = id => document.getElementById(id);
let profiles = [], profileId = localStorage.getItem('np-profile') || 'default';
let config = { ...DEFAULTS }, currentTrack = null, currentBridge = null;
let currentAudio = null;
let filter = 'all', eventsOnline = false, ready = false, dialogMode = 'new';
let requestedSkin = new URLSearchParams(location.search).get('skin');
let saveTimer, toastTimer, saveQueue = Promise.resolve(), saveVersion = 0, acknowledgedVersion = 0;
const fields = $('settings-form').elements;
const componentLabels = { showCover: '专辑封面 / 唱片图标', showArtist: '艺术家', showAlbum: '专辑名称', showProgress: '显示进度', showTime: '播放时间', showBadge: 'Apple Music 标识', showVisualizer: '频谱 / 律动效果' };
for (const [name, label] of Object.entries(componentLabels)) {
  const row = document.createElement('div'); row.className = 'toggle-row';
  const caption = document.createElement('label'); caption.textContent = label; caption.htmlFor = `toggle-${name}`;
  const toggle = document.createElement('label'); toggle.className = 'switch';
  const input = document.createElement('input'); input.type = 'checkbox'; input.name = name; input.id = `toggle-${name}`; input.checked = DEFAULTS[name]; input.setAttribute('aria-label', label);
  toggle.append(input, document.createElement('span')); row.append(caption, toggle); $('component-toggles').append(row);
}
async function request(path, method = 'GET', data) {
  const res = await fetch(path, { method, ...(data !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const result = await res.json(); if (!res.ok) throw Error(result.error || '请求失败'); return result;
}
function toast(message, error = false) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').className = `toast visible${error ? ' error' : ''}`;
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), error ? 6000 : 2600);
}
function overlayUrl() { return `${location.origin}/overlay?profile=${encodeURIComponent(profileId)}`; }
function updateOutput() {
  const { width, height } = outputSize(config);
  $('obs-url').value = overlayUrl(); $('guide-url').textContent = overlayUrl();
  $('obs-dimensions').textContent = `${width} × ${height}`;
  $('guide-dimensions').textContent = `${width} × ${height}`;
  $('canvas-size').textContent = `${config.width} px · ${SKINS.find(s => s.id === config.skin)?.name || config.skin}`;
}
function postPreview() { $('preview').contentWindow?.postMessage({ type: 'preview-config', config }, location.origin); }
$('preview').addEventListener('load', postPreview);
function setPreviewSource() {
  $('preview').src = `/overlay?profile=${encodeURIComponent(profileId)}${$('live-preview').checked ? '&dashboard=1' : '&preview=1'}`;
  $('preview-chip').textContent = $('live-preview').checked ? '实时歌曲' : '演示模式';
  $('preview-chip').style.color = $('live-preview').checked ? '#c4f46d' : '';
  updatePreviewDescription();
  if(currentAudio)renderAudio(currentAudio);
}
function updatePreviewDescription() {
  $('preview-description').textContent = $('live-preview').checked ? (currentTrack?.connected ? `${currentTrack.title} — ${currentTrack.artist}` : '等待 Apple Music 播放 · OBS 输出透明') : '示例歌曲 · Midnight City — M83';
}
function syncForm() {
  for (const [key, value] of Object.entries(config)) {
    const input = fields.namedItem(key); if (!input) continue;
    if (input.type === 'checkbox') input.checked = value; else input.value = value;
    const output = document.querySelector(`[data-output="${key}"]`); if (output) output.value = value;
    const color = document.querySelector(`[data-color="${key}"]`); if (color) color.textContent = String(value).toUpperCase();
    if (input.type === 'range') input.style.setProperty('--fill', `${(value - input.min) / (input.max - input.min) * 100}%`);
  }
  $('current-skin').textContent = SKINS.find(s => s.id === config.skin)?.name || config.skin;
  fields.namedItem('accent').disabled=Boolean(config.accentFromArtwork);
  updateOutput(); postPreview();
  if(currentAudio)renderAudio(currentAudio);
  for (const card of document.querySelectorAll('.skin-card')) { const selected = card.dataset.skin === config.skin; card.classList.toggle('selected', selected); card.setAttribute('aria-pressed', selected); }
}
function renderProfileOptions() {
  $('profile').replaceChildren(...profiles.map(p => { const option = document.createElement('option'); option.value = p.id; option.textContent = p.name; return option; }));
  $('profile').value = profileId;
}
function selectProfile(id) {
  const profile = profiles.find(p => p.id === id) || profiles[0]; if (!profile) return;
  profileId = profile.id; config = migrateConfig(profile.config);
  localStorage.setItem('np-profile', profileId); renderProfileOptions(); syncForm(); setPreviewSource();
}
function queueSave() {
  if (!ready) return;
  const id = profileId, payload = { ...config }, version = ++saveVersion;
  const local = profiles.find(p => p.id === id); if (local) local.config = payload;
  $('save-status').textContent = '保存中…';
  // Serialize writes, including across profile switches. Never let old writes replace newer local edits.
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    try {
      await request(`/api/profiles/${id}`, 'PATCH', { config: payload });
      acknowledgedVersion = Math.max(acknowledgedVersion, version);
      if (version === saveVersion) $('save-status').textContent = '已保存';
    } catch (err) { $('save-status').textContent = '保存失败'; toast(`设置未保存：${err.message}`, true); throw err; }
  });
  saveQueue.catch(() => {});
}
function scheduleSave() { clearTimeout(saveTimer); $('save-status').textContent = '编辑中…'; saveTimer = setTimeout(queueSave, 220); }
async function flushSave() { clearTimeout(saveTimer); queueSave(); await saveQueue; }
$('settings-form').addEventListener('input', event => {
  const input = event.target; if (!input.name || !(input.name in DEFAULTS)) return;
  if (!input.checkValidity()) { $('save-status').textContent = '数值超出范围'; return; }
  config[input.name] = input.type === 'checkbox' ? input.checked : ['number', 'range'].includes(input.type) ? Number(input.value) : input.value;
  if(input.name==='visualization'&&['spectrum','progress'].includes(input.value)){
    config.showProgress=true;config.showTime=true;
    if(input.value==='spectrum'){config.showVisualizer=true;config.animate=true;}
  }
  if(input.name==='showProgress')config.visualization=input.checked?'progress':'none';
  syncForm(); scheduleSave();
});
$('settings-form').addEventListener('submit', e => e.preventDefault());
function renderSkins() {
  $('skin-grid').replaceChildren();
  for (const skin of SKINS.filter(s => filter === 'all' || s.category === filter)) {
    const card = document.createElement('button'); card.type = 'button'; card.className = `skin-card${skin.id === config.skin ? ' selected' : ''}`; card.dataset.skin = skin.id;
    card.setAttribute('aria-label', `选择 ${skin.name}：${skin.label}`); card.setAttribute('aria-pressed', skin.id === config.skin);
    const preview = document.createElement('div'); preview.className = 'skin-card-preview';
    const iframe = document.createElement('iframe'); iframe.src = `/overlay?preview=1&card=1&skin=${skin.id}`; iframe.title = `${skin.name} 示例`; iframe.loading = 'lazy'; iframe.tabIndex = -1;
    const check = document.createElement('span'); check.className = 'skin-check'; check.textContent = '✓';
    preview.append(iframe, check);
    const info = document.createElement('div'); info.className = 'skin-card-info';
    const names = document.createElement('div'), strong = document.createElement('strong'), small = document.createElement('small');
    strong.textContent = skin.name; small.textContent = skin.label; names.append(strong, small);
    const tag = document.createElement('span'); tag.className = 'skin-tag'; tag.textContent = skin.tag; info.append(names, tag); card.append(preview, info);
    card.addEventListener('click', () => { config = applySkin(config, skin.id); syncForm(); scheduleSave(); });
    $('skin-grid').append(card);
  }
}
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {
  filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === button)); renderSkins();
});
$('reset-filter').addEventListener('click', () => document.querySelector('[data-filter="all"]').click());
for (const button of document.querySelectorAll('[data-bg]')) button.addEventListener('click', () => {
  $('preview-canvas').className = `preview-canvas ${button.dataset.bg}`;
  document.querySelectorAll('[data-bg]').forEach(b => b.classList.toggle('selected', b === button));
});
$('live-preview').addEventListener('change', setPreviewSource);
$('fullscreen-preview').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('preview-canvas').requestFullscreen(); } catch { toast('浏览器暂不支持全屏预览', true); } });
$('profile').addEventListener('change', async () => { const id = $('profile').value; try { await flushSave(); selectProfile(id); } catch { $('profile').value = profileId; } });
$('open-overlay').addEventListener('click', async () => { try { await flushSave(); window.open(overlayUrl(), '_blank', 'noopener'); } catch {} });
async function copyUrl() {
  try { await flushSave(); await navigator.clipboard.writeText(overlayUrl()); toast('已复制组件链接，粘贴到 OBS 浏览器来源即可'); }
  catch { $('obs-url').focus(); $('obs-url').select(); toast('请在链接框中按 Ctrl+C 复制', true); }
}
for (const id of ['copy-url', 'copy-url-icon', 'guide-copy']) $(id).addEventListener('click', copyUrl);
$('reset-settings').addEventListener('click', () => { config = applySkin(config, config.skin); syncForm(); scheduleSave(); toast('已恢复当前皮肤的参考样式'); });
$('export-settings').addEventListener('click', () => {
  const profile = profiles.find(p => p.id === profileId);
  const blob = new Blob([JSON.stringify({ format: 'nowplaying-v1', name: profile?.name, config }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'nowplaying-config.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('import-settings').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 65536) throw Error('配置文件过大');
    const data = JSON.parse(await file.text()); if (data.format !== 'nowplaying-v1' || !data.config) throw Error('不是有效的 Now Playing 配置');
    await flushSave();
    const updated = await request(`/api/profiles/${profileId}`, 'PATCH', { config: migrateConfig(data.config) });
    config = updated.config; profiles.find(p => p.id === profileId).config = config; syncForm(); toast('配置已导入');
  } catch (err) { toast(`导入失败：${err.message}`, true); } finally { event.target.value = ''; }
});
$('add-profile').addEventListener('click', () => {
  dialogMode = 'new'; $('dialog-title').textContent = '新建场景'; $('dialog-description').textContent = '复制当前样式，为新的 OBS 场景创建独立链接。'; $('scene-name').value = ''; $('scene-dialog').showModal();
});
$('scene-menu').addEventListener('click', () => {
  dialogMode = 'rename'; $('dialog-title').textContent = '重命名场景'; $('dialog-description').textContent = '重命名后，现有 OBS 地址保持有效。'; $('scene-name').value = profiles.find(p => p.id === profileId)?.name || ''; $('scene-dialog').showModal();
});
$('scene-dialog').addEventListener('close', async () => {
  if ($('scene-dialog').returnValue !== 'save') return;
  const name = $('scene-name').value.trim(); if (!name) return;
  try {
    await flushSave();
    if (dialogMode === 'new') { const p = await request('/api/profiles', 'POST', { name, config }); profiles = [...profiles.filter(x => x.id !== p.id), p]; selectProfile(p.id); toast('已创建独立 OBS 场景'); }
    else { const p = await request(`/api/profiles/${profileId}`, 'PATCH', { name }); profiles = profiles.map(x => x.id === p.id ? p : x); renderProfileOptions(); toast('场景已重命名'); }
  } catch (err) { toast(err.message, true); }
});
function route() {
  const page = ['connection', 'guide'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'studio';
  for (const name of ['studio', 'connection', 'guide']) $(`${name}-page`).classList.toggle('hidden', name !== page);
  document.querySelectorAll('[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  $('page-crumb').textContent = { studio: '组件工作室', connection: '音乐连接', guide: 'OBS 接入指南' }[page];
}
window.addEventListener('hashchange', route); route();
$('help-button').addEventListener('click', () => { location.hash = '#guide'; });
function time(seconds) { const s = Math.max(0, seconds || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
function updatePlaybackTime() {
  if (!currentTrack) return;
  const elapsed = eventsOnline && currentTrack.playing ? Math.max(0, (Date.now() - currentTrack.updatedAt) / 1000) * (currentTrack.rate || 1) : 0;
  const position = Math.min(currentTrack.duration || 0, (currentTrack.position || 0) + elapsed);
  $('live-position').textContent = time(position); $('live-duration').textContent = currentTrack.duration ? time(currentTrack.duration) : '--:--';
  $('live-progress-fill').style.width = `${currentTrack.duration ? position / currentTrack.duration * 100 : 0}%`;
}
function renderAudio(audio){
  if(!audio)return;currentAudio=audio;
  const source=$('audio-source');if(source&&source!==document.activeElement)source.value=audio.source;
  const target=$('audio-status');if(!target)return;
  const scope=audio.source==='apple'?'Apple Music 进程':audio.source==='system'?'默认输出设备':'采集关闭';
  const info={idle:'按需启动',starting:'正在连接',waiting:'等待 Apple Music',capturing:audio.signal?'收到音频信号':'已连接 · 当前无有效信号',off:'已关闭',unavailable:'此环境不支持',error:'采集失败'}[audio.status]||audio.status;
  target.textContent=`${scope} · ${info}`;target.classList.toggle('audio-error',audio.status==='error');
  target.title=audio.message||'';
  if($('live-preview').checked)$('preview-chip').textContent=visualizationMode(config)==='spectrum'?(audio.status==='capturing'?(audio.signal?'真实音频频谱':'频谱无信号'):'等待音频频谱'):'实时歌曲';
  if($('audio-detail'))$('audio-detail').textContent=`${scope} · ${info}${audio.status==='error'?'：'+audio.message:''}`;
}
$('audio-source').addEventListener('change',async event=>{
  try{renderAudio(await request('/api/audio','POST',{mode:event.target.value}));toast('音频来源已更新');}
  catch(err){toast(err.message,true);if(currentAudio)event.target.value=currentAudio.source;}
});
function renderState({ track, bridge, recent, audio }) {
  if(audio)renderAudio(audio);
  currentTrack = track; currentBridge = bridge;
  const connected = Boolean(track.connected && eventsOnline);
  $('nav-status').classList.toggle('connected', connected); $('connection-indicator').classList.toggle('connected', connected);
  $('connection-short').textContent = connected ? (track.playing ? '已连接 · 正在播放' : '已连接 · 已暂停') : '等待 Apple Music 播放';
  $('connection-detail').textContent = connected ? '已通过 Windows 媒体会话直连' : '尚未检测到 Apple Music 会话';
  $('connection-message').textContent = connected ? '连接成功。歌曲信息会自动同步至 OBS 浏览器来源。' : bridge.status === 'waiting' ? '请打开 Windows 官方 Apple Music，开始播放一首歌曲。检测成功后会自动连接。' : bridge.message;
  $('live-title').textContent = connected ? track.title || '未知歌曲' : '等待播放';
  $('live-artist').textContent = connected ? track.artist || '未知艺术家' : '在 Apple Music 中播放一首歌';
  $('live-album').textContent = connected ? track.album || '' : '';
  const artwork = connected && track.artwork ? `/api/artwork?v=${encodeURIComponent(track.artwork)}` : '/placeholder.svg';
  if ($('live-cover').getAttribute('src') !== artwork) $('live-cover').src = artwork;
  $('diag-bridge').textContent = ({ connected: '正常', waiting: '正常 · 等待歌曲', error: '读取失败', starting: '启动中', unavailable: '不可用' })[bridge.status] || bridge.status;
  $('diag-update').textContent = bridge.lastUpdate ? new Date(bridge.lastUpdate).toLocaleTimeString('zh-CN', { hour12: false }) : '—';
  $('diag-sessions').textContent = bridge.sessions?.length ? bridge.sessions.join('\n') : '未检测到媒体会话';
  $('transport-toggle').textContent = track.playing ? 'Ⅱ' : '▶';
  document.querySelectorAll('[data-action]').forEach(b => { b.disabled = !connected; });
  updatePreviewDescription(); updatePlaybackTime();
  if (recent?.length) {
    $('history-list').replaceChildren(...recent.map((item, index) => {
      const row = document.createElement('div'); row.className = 'history-item';
      const n = document.createElement('span'); n.className = 'history-number'; n.textContent = String(index + 1).padStart(2, '0');
      const text = document.createElement('div'), title = document.createElement('strong'), artist = document.createElement('small'); title.textContent = item.title; artist.textContent = item.artist; text.append(title, artist);
      const timestamp = document.createElement('time'); timestamp.textContent = new Date(item.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); row.append(n, text, timestamp); return row;
    }));
  }
}
for (const button of document.querySelectorAll('[data-action]')) button.addEventListener('click', async () => {
  button.disabled = true;
  try { await request('/api/control', 'POST', { action: button.dataset.action }); }
  catch (err) { toast(err.message, true); }
  finally { button.disabled = !currentTrack?.connected || !eventsOnline; }
});
function setOnline(online) {
  eventsOnline = online; $('service-text').textContent = online ? '本地服务已连接' : '服务连接中断';
  document.querySelector('.service-badge').classList.toggle('offline', !online); $('diag-service').textContent = online ? '正常 · 127.0.0.1' : '连接中断，正在重试';
  if (!online) { $('connection-short').textContent = '本地服务连接中断'; document.querySelectorAll('[data-action]').forEach(b => b.disabled = true); }
}
renderSkins(); syncForm();
const events = openEventStream('/api/events');
events.addEventListener('snapshot', event => {
  const data = JSON.parse(event.data); setOnline(true); profiles = data.profiles;
  if (!ready) {
    selectProfile(profileId); ready = true;
    if (requestedSkin && SKINS.some(s=>s.id===requestedSkin)) {
      config=applySkin(config,requestedSkin); syncForm(); scheduleSave(); requestedSkin=null;
      const cleanUrl=new URL(location.href); cleanUrl.searchParams.delete('skin'); history.replaceState(null,'',cleanUrl);
    }
  }
  else if (saveVersion === acknowledgedVersion && !$('save-status').textContent.includes('编辑')) { selectProfile(profileId); }
  renderState(data);
});
events.addEventListener('state', event => { setOnline(true); renderState(JSON.parse(event.data)); });
events.addEventListener('audio-status', event => renderAudio(JSON.parse(event.data)));
events.addEventListener('profiles', event => {
  const incoming = JSON.parse(event.data);
  // Event arrives before the matching PATCH response. Preserve local changes while saving.
  if (saveVersion > acknowledgedVersion || $('save-status').textContent === '编辑中…') {
    const local = profiles.find(p => p.id === profileId);
    profiles = incoming.map(p => p.id === profileId && local ? { ...p, config: local.config } : p); renderProfileOptions(); return;
  }
  profiles = incoming; const active = profiles.find(p => p.id === profileId);
  if (!active) selectProfile(profiles[0]?.id); else { config = { ...DEFAULTS, ...active.config }; renderProfileOptions(); syncForm(); }
});
events.onerror = () => { setOnline(false); if (currentTrack) renderState({ track: currentTrack, bridge: currentBridge, recent: [] }); };
setInterval(updatePlaybackTime, 250);
window.addEventListener('beforeunload', () => {
  if (!ready) return;
  clearTimeout(saveTimer);
  fetch(`/api/profiles/${profileId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }), keepalive: true }).catch(() => {});
});
