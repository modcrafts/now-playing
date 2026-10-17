import http from 'node:http';
import { readFile, writeFile, mkdir, rename, readdir, unlink } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { DEFAULTS, validateConfig, normalizeTrack } from './lib/config.mjs';
import { migrateConfig, skinDefaults } from './public/shared.js';
import { createAudioService } from './lib/audio-service.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RUNTIME = resolve(process.env.NP_RUNTIME_DIR || resolve(ROOT, '.runtime'));
const PUBLIC = resolve(ROOT, 'public');
const PORT = Number(process.env.PORT || 3963);
await mkdir(resolve(RUNTIME, 'commands'), { recursive: true });
// Commands from a previous interrupted process must never be replayed.
for (const name of await readdir(resolve(RUNTIME, 'commands'))) {
  if (/^[a-f0-9-]+\.json$/.test(name)) await unlink(resolve(RUNTIME, 'commands', name));
}
let profiles = [{ id: 'default', name: '默认场景', config: { ...DEFAULTS } }];
try {
  const saved = JSON.parse(await readFile(resolve(RUNTIME, 'settings.json'), 'utf8'));
  if (Array.isArray(saved) && saved.length && saved.length <= 30) {
    if (saved.some(p => p.config?.layoutVersion !== 2)) {
      try { await writeFile(resolve(RUNTIME, 'settings-before-skin-update.json'), JSON.stringify(saved, null, 2), { flag: 'wx' }); }
      catch (err) { if (err.code !== 'EEXIST') throw err; }
    }
    profiles = saved.map(p => {
      if (!/^[a-z0-9-]{1,64}$/.test(p.id) || typeof p.name !== 'string') throw Error('配置文件无效');
      return { id: p.id, name: p.name.slice(0, 40), config: migrateConfig(validateConfig(p.config)) };
    });
  }
} catch (err) { if (err.code !== 'ENOENT') console.warn('无法加载已保存设置，将使用默认配置:', err.message); }
let saveQueue = Promise.resolve();
function persist() {
  const content = JSON.stringify(profiles, null, 2);
  const job = saveQueue.catch(() => {}).then(async () => {
    const temp = resolve(RUNTIME, 'settings.tmp');
    await writeFile(temp, content, 'utf8');
    await rename(temp, resolve(RUNTIME, 'settings.json'));
  });
  saveQueue = job;
  return job;
}
let track = { connected: false, playing: false, title: '', artist: '', album: '', position: 0, duration: 0, updatedAt: Date.now(), artwork: null };
let bridge = { status: 'starting', message: '正在连接 Windows 媒体会话…', sessions: [], lastUpdate: null };
let child, restartTimer, shuttingDown = false;
let recent = [];
let lastTrackKey = '';
const clients = new Set();
const pending = new Map();
const snapshot = () => ({ track, bridge, profiles, recent, audio:audio.getState() });
function broadcast(type, data) {
  const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    if (res.writableLength > 256 * 1024) { res.destroy(); clients.delete(res); }
    else res.write(line);
  }
}
function startBridge() {
  if (process.env.NP_NO_BRIDGE === '1' || process.platform !== 'win32') {
    bridge = { ...bridge, status: 'unavailable', message: '需要 Windows 10 1809 / Windows 11 的媒体会话。演示预览仍可使用。' };
    return;
  }
  child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(ROOT, 'bridge', 'media.ps1'), '-RuntimePath', RUNTIME], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  createInterface({ input: child.stdout }).on('line', line => {
    let data;
    try { data = JSON.parse(line.replace(/^\uFEFF/, '')); } catch { return; }
    if (data.type === 'state') {
      const prev = track;
      track = normalizeTrack({ ...data.track, updatedAt: Date.now() });
      bridge = { status: data.status, message: data.message, sessions: data.sessions || [], lastUpdate: Date.now() };
      const key = `${track.title}\0${track.artist}\0${track.album}`;
      if (track.connected && track.playing && track.title && key !== lastTrackKey) {
        recent = [{ title: track.title, artist: track.artist, album: track.album, at: Date.now() }, ...recent].slice(0, 8);
        lastTrackKey = key;
      }
      if (!track.connected) lastTrackKey = '';
      if (prev.connected && !track.connected) console.log('[Apple Music] 等待媒体会话');
      broadcast('state', { track, bridge, recent });
    } else if (data.type === 'command') {
      const request = pending.get(data.id);
      if (request) { clearTimeout(request.timer); pending.delete(data.id); request.resolve(data); }
    }
  });
  child.stderr.on('data', data => {
    const message = data.toString().trim().slice(0, 1000);
    if (message) console.error('[media]', message);
  });
  child.on('error', err => {
    bridge = { ...bridge, status: 'error', message: `媒体桥启动失败：${err.message}` };
    broadcast('state', { track, bridge, recent });
  });
  child.on('exit', code => {
    if (shuttingDown) return;
    bridge = { ...bridge, status: 'error', message: `媒体桥已退出 (${code})，5 秒后重试` };
    track = { ...track, connected: false, playing: false, updatedAt: Date.now() };
    broadcast('state', { track, bridge, recent });
    restartTimer = setTimeout(startBridge, 5000);
  });
}
const audio=await createAudioService({root:ROOT,runtime:RUNTIME,disabled:process.env.NP_NO_BRIDGE==='1',broadcast});
startBridge();
const heartbeat = setInterval(() => { for (const res of clients) res.write(': heartbeat\n\n'); }, 15000);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
function json(res, status, value) { res.writeHead(status, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req) {
  let content = '';
  for await (const chunk of req) { content += chunk; if (content.length > 65536) { const err = Error('请求过大'); err.status = 413; throw err; } }
  try { return JSON.parse(content); } catch { const err = Error('JSON 格式无效'); err.status = 400; throw err; }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    // Only loopback hosts, including for read endpoints, to block DNS rebinding.
    const host = req.headers.host || '';
    if (![`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(host)) return json(res, 403, { error: '仅允许本机访问' });
    const url = new URL(req.url, `http://${host}`);
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin !== `http://127.0.0.1:${PORT}` && origin !== `http://localhost:${PORT}`) return json(res, 403, { error: '拒绝跨站请求' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: '需要 application/json' });
    }
    if (url.pathname === '/api/state' && req.method === 'GET') return json(res, 200, snapshot());
    if (url.pathname === '/api/spectrum' && req.method === 'GET') return audio.subscribe(req,res);
    if (url.pathname === '/api/audio' && req.method === 'POST') return json(res,200,await audio.configure(await body(req)));
    if (url.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
      clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (url.pathname === '/api/profiles' && req.method === 'POST') {
      if (profiles.length >= 30) return json(res, 400, { error: '最多创建 30 个场景' });
      const data = await body(req);
      const profile = { id: randomUUID(), name: String(data.name || '新场景').trim().slice(0, 40) || '新场景', config: { ...skinDefaults(data.config?.skin), ...validateConfig(data.config || {}) } };
      profiles.push(profile); await persist(); broadcast('profiles', profiles); return json(res, 201, profile);
    }
    const match = url.pathname.match(/^\/api\/profiles\/([a-z0-9-]+)$/);
    if (match && req.method === 'PATCH') {
      const profile = profiles.find(p => p.id === match[1]);
      if (!profile) return json(res, 404, { error: '场景不存在' });
      const data = await body(req);
      const config = { ...profile.config, ...validateConfig(data.config || {}) };
      if (data.name !== undefined) profile.name = String(data.name).trim().slice(0, 40) || profile.name;
      profile.config = config; await persist(); broadcast('profiles', profiles); return json(res, 200, profile);
    }
    if (match && req.method === 'DELETE') {
      if (!profiles.some(p => p.id === match[1])) return json(res, 404, { error: '场景不存在' });
      if (profiles.length === 1) return json(res, 400, { error: '请至少保留一个场景' });
      profiles = profiles.filter(p => p.id !== match[1]); await persist(); broadcast('profiles', profiles); return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/control' && req.method === 'POST') {
      const { action } = await body(req);
      if (!['toggle', 'next', 'previous'].includes(action)) return json(res, 400, { error: '无效控制指令' });
      if (!track.connected || bridge.status !== 'connected') return json(res, 409, { error: 'Apple Music 尚未连接' });
      const id = randomUUID();
      const result = new Promise(resolve => {
        const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: 'Apple Music 未响应控制请求' }); }, 5000);
        pending.set(id, { resolve, timer });
      });
      const temp = resolve(RUNTIME, 'commands', `${id}.tmp`);
      await writeFile(temp, JSON.stringify({ id, action }), 'utf8');
      await rename(temp, resolve(RUNTIME, 'commands', `${id}.json`));
      const response = await result; return json(res, response.ok ? 200 : 409, response);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '不支持的请求方法' });
    if (url.pathname === '/api/artwork') {
      if (!track.artwork || !/^[a-f0-9]{32}\.img$/.test(track.artwork)) return json(res, 404, { error: '暂无封面' });
      const file = resolve(RUNTIME, track.artwork);
      const bytes = await readFile(file);
      res.writeHead(200, { 'Content-Type': track.artworkType || 'image/jpeg', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    }
    const route = url.pathname === '/' ? 'index.html' : url.pathname === '/overlay' ? 'overlay.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = resolve(PUBLIC, route);
    if (!file.startsWith(PUBLIC + sep)) return json(res, 403, { error: '禁止访问' });
    if (!mime[extname(file)]) return json(res, 404, { error: '文件不存在' });
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)], 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (err) {
    json(res, err.code === 'ENOENT' ? 404 : err.status || 400, { error: err.code === 'ENOENT' ? '文件不存在' : err.message });
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`\n  Now Playing / Apple Music\n  控制台  http://127.0.0.1:${PORT}\n  OBS     http://127.0.0.1:${PORT}/overlay?profile=default\n  按 Ctrl+C 停止服务。\n`));
server.on('error', err => { console.error('服务启动失败:', err.message); shutdown(); process.exitCode = 1; });
function shutdown() {
  shuttingDown = true; clearTimeout(restartTimer); clearInterval(heartbeat);
  child?.kill(); for (const res of clients) res.end();
  audio.close();
  for (const request of pending.values()) { clearTimeout(request.timer); request.resolve({ ok: false, error: '服务已停止' }); }
  server.close();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
