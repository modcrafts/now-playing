import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);

test('native capture selects routed Apple audio without selecting the mixer or expired sessions',{skip:process.platform!=='win32'},async()=>{
  const fixture=fileURLToPath(new URL('./audio-session-selection.ps1',import.meta.url));
  const source=fileURLToPath(new URL('../bridge/AudioCapture.cs',import.meta.url));
  const {stdout}=await exec('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fixture,'-Source',source],{windowsHide:true,timeout:20000});
  assert.deepEqual(JSON.parse(stdout),{routed:202,audible:101,paused:202,restricted:101,duplicates:202,empty:0});
});
