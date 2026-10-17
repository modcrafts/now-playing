import { DEFAULTS, SKINS as DESIGNS } from '../public/shared.js';
export { DEFAULTS };
export const SKINS = DESIGNS.map(skin => skin.id);
export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置格式无效');
  const out = {};
  const limits = { layoutVersion: [2, 2], width: [300, 1000], scale: [0.5, 2], opacity: [0, 100], radius: [0, 48], hideDelay: [0, 60], spectrumGain:[0.25,4] };
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in value)) continue;
    const v = value[key];
    if (key === 'skin') { if (!SKINS.includes(v)) throw new Error('未知皮肤'); }
    else if (key === 'font') { if (!['system', 'serif', 'mono'].includes(v)) throw new Error('未知字体'); }
    else if (key === 'alignment') { if (!['left', 'center', 'right'].includes(v)) throw new Error('对齐方式无效'); }
    else if (key === 'visualization') { if (!['default','spectrum','progress','none'].includes(v)) throw new Error('频谱显示模式无效'); }
    else if (['accent', 'background', 'foreground', 'remainingColor'].includes(key)) { if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error('颜色格式无效'); }
    else if (limits[key]) { if (!Number.isFinite(v) || v < limits[key][0] || v > limits[key][1]) throw new Error(`${key} 超出范围`); }
    else if (typeof v !== 'boolean') throw new Error(`${key} 必须为布尔值`);
    out[key] = v;
  }
  return out;
}
export function playbackPosition(track, now = Date.now()) {
  const elapsed = track.playing ? Math.max(0, (now - track.updatedAt) / 1000) * (track.rate ?? 1) : 0;
  return Math.max(0, Math.min(track.duration || 0, (track.position || 0) + elapsed));
}
export function normalizeTrack(track) {
  const result = { ...track };
  // Apple Music for Windows currently publishes "artist — album" in Artist.
  // Only split this application-specific format when AlbumTitle is absent.
  if (!result.album && /AppleMusic/i.test(result.source || '')) {
    const delimiter = ' — ';
    const index = (result.artist || '').lastIndexOf(delimiter);
    if (index > 0) { result.album = result.artist.slice(index + delimiter.length); result.artist = result.artist.slice(0, index); }
  }
  return result;
}
