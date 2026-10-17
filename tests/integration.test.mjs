import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { DEFAULTS, SKINS, validateConfig, playbackPosition, normalizeTrack } from '../lib/config.mjs';
import { skinDefaults, applySkin, migrateConfig, outputSize, visualizationMode } from '../public/shared.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 13963;
const base = `http://127.0.0.1:${port}`;
let child, runtime, createdId;
async function api(path, method = 'GET', body, extraHeaders = {}) {
  return fetch(base + path, { method, headers: { Origin: base, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function start() {
  child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port), NP_NO_BRIDGE: '1', NP_RUNTIME_DIR: runtime }, windowsHide: true });
  let errors = ''; child.stderr.on('data', data => errors += data);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Server start timeout: ' + errors)), 5000);
    child.stdout.on('data', data => { if (data.toString().includes('OBS')) { clearTimeout(timer); resolve(); } });
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Server exited ${code}: ${errors}`)); });
  });
}
before(async () => { runtime = await mkdtemp(resolve(root, '.runtime-test-')); await start(); });
after(async () => {
  if (child && child.exitCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
  // Explicitly verify the final absolute target before recursive cleanup on Windows.
  if (runtime && dirname(runtime) === root && runtime.startsWith(resolve(root, '.runtime-test-'))) await rm(runtime, { recursive: true, force: true });
});
test('validate colors, dimensions and booleans; accept all 14 skins', () => {
  assert.equal(SKINS.length, 14);
  for (const skin of SKINS) assert.equal(validateConfig({ skin }).skin, skin);
  for (const invalid of [{ width: 299 }, { width: 1001 }, { scale: 0 }, { opacity: -1 }, { hidePaused: 'true' }, { accent: 'url(evil)' }, { skin: '<script>' }, {visualization:'invalid'}, {spectrumGain:0}, null, []]) assert.throws(() => validateConfig(invalid));
  assert.deepEqual(validateConfig({ width: 700, unsupported: true }), { width: 700 });
  assert.deepEqual(validateConfig({remainingColor:'#65748a'}),{remainingColor:'#65748a'});
  assert.deepEqual(validateConfig({accentFromArtwork:true}),{accentFromArtwork:true});
  assert.throws(()=>validateConfig({accentFromArtwork:'true'}));
  assert.deepEqual(validateConfig({spectrumSmoothing:false}),{spectrumSmoothing:false});
  assert.throws(()=>validateConfig({spectrumSmoothing:'false'}));
  assert.throws(()=>validateConfig({remainingColor:'transparent'}));
});
test('playback clock pauses, scales rate, clamps duration and handles unknown length', () => {
  const baseTrack = { position: 80, duration: 100, updatedAt: 1000, playing: true };
  assert.equal(playbackPosition(baseTrack, 6000), 85);
  assert.equal(playbackPosition({ ...baseTrack, rate: 2 }, 6000), 90);
  assert.equal(playbackPosition({ ...baseTrack, playing: false }, 6000), 80);
  assert.equal(playbackPosition(baseTrack, 90000), 100);
  assert.equal(playbackPosition({ ...baseTrack, duration: 0 }, 6000), 0);
});
test('skin presets and scene migration preserve OBS size and hide behavior', () => {
  const old = { skin:'pulse', width:640, scale:1.5, hidePaused:true, hideDelay:12, accent:'#c4f46d', showProgress:false };
  const migrated = migrateConfig(old);
  assert.equal(migrated.accent,'#f5c518'); assert.equal(migrated.showProgress,true);
  assert.equal(migrated.width,640); assert.equal(migrated.hideDelay,12); assert.equal(migrated.layoutVersion,2);
  assert.deepEqual(migrateConfig({...migrated,accent:'#123456'}),{...migrated,accent:'#123456'});
  const next = applySkin(migrated,'modern');
  assert.equal(next.skin,'modern'); assert.equal(next.width,640); assert.equal(next.showProgress,false);
  assert.equal(applySkin({...migrated,accentFromArtwork:true},'pulse').accentFromArtwork,true);
  assert.equal(migrateConfig({skin:'pulse',layoutVersion:2}).spectrumSmoothing,true);
  assert.equal(applySkin({...migrated,spectrumSmoothing:false},'pulse').spectrumSmoothing,false);
  for (const id of SKINS) {
    const config={...skinDefaults(id),width:1000,scale:2}; const size=outputSize(config);
    assert.equal(size.width,2048); assert.ok(size.height>=248 && size.height<=700,id);
  }
});
test('all skin designs support choosing spectrum or progress; Pulse Progress defaults to a bar',()=>{
  assert.equal(visualizationMode(skinDefaults('pulse')),'spectrum');
  assert.equal(visualizationMode(skinDefaults('pulse-progress')),'progress');
  for(const skin of SKINS){
    assert.equal(visualizationMode({...skinDefaults(skin),visualization:'spectrum'}),'spectrum');
    assert.equal(visualizationMode({...skinDefaults(skin),visualization:'progress'}),'progress');
    assert.equal(visualizationMode({...skinDefaults(skin),visualization:'none'}),'none');
  }
});
test('audio source settings validate and report unavailable capture honestly in test environment',async()=>{
  assert.equal((await api('/api/audio','POST',{mode:'microphone'})).status,400);
  assert.equal((await api('/api/audio','POST',{mode:'apple'})).status,200);
  const abort=new AbortController();
  const response=await fetch(base+'/api/spectrum',{signal:abort.signal});const reader=response.body.getReader();
  try{
    let output='';const deadline=setTimeout(()=>abort.abort(),2000);
    try{while(!output.includes('unavailable'))output+=new TextDecoder().decode((await reader.read()).value);}finally{clearTimeout(deadline);}
    assert.match(output,/audio-status/);assert.match(output,/unavailable/);
  }finally{abort.abort();await reader.cancel().catch(()=>{});}
});
test('normalize Apple Music combined artist and album without changing other sources', () => {
  const track = { source: 'AppleInc.AppleMusicWin_nzyj5cx40ttqa!App', artist: 'Tate McRae — Housewife - Single', album: '' };
  assert.equal(normalizeTrack(track).artist, 'Tate McRae');
  assert.equal(normalizeTrack(track).album, 'Housewife - Single');
  assert.equal(normalizeTrack({ ...track, source: 'Spotify' }).artist, track.artist);
  assert.equal(normalizeTrack({ ...track, album: 'Already supplied' }).artist, track.artist);
});
test('dashboard, overlay and JS assets serve correctly', async () => {
  for (const path of ['/', '/overlay', '/app.js', '/overlay.js', '/overlay.css', '/shared.js', '/skin-renderer.js', '/artwork-color.js', '/title-transition.js', '/spectrum-smoothing.js', '/playback-clock.js', '/event-stream.js', '/spectrum-codec.js', '/skins.html', '/gallery.js', '/gallery.css', '/artwork.svg']) {
    const response = await api(path); assert.equal(response.status, 200, path); assert.ok((await response.text()).length > 30);
  }
  const state = await (await api('/api/state')).json();
  assert.equal(state.track.connected, false); assert.equal(state.profiles[0].config.width, DEFAULTS.width);
});
test('create, edit and persist an independent OBS scene', async () => {
  const created = await api('/api/profiles', 'POST', { name: '游戏直播', config: { skin: 'aurora' } });
  assert.equal(created.status, 201); const profile = await created.json(); createdId = profile.id;
  const patched = await api(`/api/profiles/${createdId}`, 'PATCH', { config: { width: 720, showAlbum: true, accentFromArtwork:true, spectrumSmoothing:false }, name: '主场景' });
  assert.equal(patched.status, 200);
  const saved = JSON.parse(await readFile(resolve(runtime, 'settings.json'), 'utf8'));
  assert.equal(saved[1].config.width, 720); assert.equal(saved[1].config.skin, 'aurora'); assert.equal(saved[1].name, '主场景');
  assert.equal(saved[0].config.width, DEFAULTS.width);
  assert.equal(saved[1].config.accentFromArtwork,true);
  assert.equal(saved[1].config.spectrumSmoothing,false);
  const invalid = await api(`/api/profiles/${createdId}`, 'PATCH', { config: { width: 90000 } }); assert.equal(invalid.status, 400);
  const ended = once(child, 'exit'); child.kill(); await ended; await start();
  const state = await (await api('/api/state')).json(); assert.equal(state.profiles[1].config.width, 720);
  assert.equal(state.profiles[1].config.accentFromArtwork,true);
  assert.equal(state.profiles[1].config.spectrumSmoothing,false);
});
test('SSE streams a snapshot then a live configuration update', async () => {
  const abort = new AbortController();
  const response = await fetch(base + '/api/events', { signal: abort.signal });
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  try {
    const first = decoder.decode((await reader.read()).value); assert.match(first, /event: snapshot/);
    await api(`/api/profiles/${createdId}`, 'PATCH', { config: { skin: 'pulse' } });
    const next = decoder.decode((await reader.read()).value); assert.match(next, /event: profiles/); assert.match(next, /pulse/);
  } finally { abort.abort(); await reader.cancel().catch(() => {}); }
});
test('reject cross-site mutations, invalid JSON, missing profiles and unsafe paths', async () => {
  const rejected = await api('/api/profiles', 'POST', {}, { Origin: 'https://evil.example' }); assert.equal(rejected.status, 403);
  const wrongHost = await new Promise((resolve, reject) => {
    const req = httpRequest(base + '/api/state', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  }); assert.equal(wrongHost, 403);
  const invalid = await fetch(base + '/api/profiles', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{bad' }); assert.equal(invalid.status, 400);
  assert.equal((await api('/api/profiles/missing', 'PATCH', { config: {} })).status, 404);
  assert.equal((await api('/%2e%2e%5cserver.mjs')).status, 403);
  assert.equal((await api('/api/artwork')).status, 404);
  assert.equal((await api('/api/control', 'POST', { action: 'toggle' })).status, 409);
});
test('delete scenes safely while retaining at least one', async () => {
  assert.equal((await api(`/api/profiles/${createdId}`, 'DELETE', {})).status, 200);
  assert.equal((await api('/api/profiles/default', 'DELETE', {})).status, 400);
});
