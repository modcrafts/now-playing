# Development

[中文说明](../README.md) · [English README](../README.en.md)

## Stack

The dashboard and overlays use vanilla JavaScript and CSS. A Node.js HTTP server serves the UI, persists profiles, and streams updates through Server-Sent Events. No npm packages are required.

Windows PowerShell 5.1 bridges the official Apple Music app to the server:

- `bridge/media.ps1` reads Windows media sessions, metadata, artwork, playback position, and playback controls.
- `bridge/audio.ps1` compiles `bridge/AudioCapture.cs` for WASAPI process or system-output loopback. The browser receives 44 FFT band levels, never raw audio.

The audio pipeline uses a 2048-sample window and targets a 16 ms publication interval; the actual interval depends on device callbacks. Slow clients skip obsolete spectrum frames. Session and endpoint checks run outside the capture loop. The browser uses short height transitions for small and moderate visual changes, tapering their duration continuously to zero as movements grow to avoid a hard cutoff. FFT values, sensitivity and target heights are untouched. Quiet onsets, near-silent levels and large movements render immediately; there is no signal filter, direction detector, deadband or added noise gate.

The overlay advances playback progress from a monotonic local clock and renders its color boundary on animation frames. Small timing corrections adjust the clock's rate by at most five percent instead of replacing or holding its position. Comparing consecutive media reports distinguishes larger seeks from the display's gradually corrected offset. Track/session changes, pauses, resumes, rate changes, returning to the beginning and report discontinuities over two seconds resynchronize immediately. Smaller seeks during playback are corrected gradually because the media bridge does not provide a separate seek notification.

## Project map

| Path | Responsibility |
| --- | --- |
| `server.mjs` | Local HTTP API, media bridge, profile persistence, and SSE. |
| `lib/audio-service.mjs` | Audio capture lifecycle and spectrum subscribers. |
| `lib/config.mjs` | Configuration validation and media normalization. |
| `public/shared.js` | Skin catalog, defaults, and configuration migration. |
| `public/skin-renderer.js` | Individual skin layouts. |
| `public/overlay.js` | Playback rendering and live updates. |
| `public/playback-clock.js` | Stable playback progress across small media-report corrections. |
| `public/artwork-color.js` | Cover palette extraction and contrasting accent colors. |
| `public/title-transition.js` | Isolated title text transitions and rapid-skip cleanup. |
| `public/spectrum-smoothing.js` | Transition duration for small visual bar-height changes. |

## Run and test

```powershell
node server.mjs
node --test
```

For a separate development instance, choose another port and runtime directory:

```powershell
$env:PORT = '3964'
$env:NP_RUNTIME_DIR = "$PWD\.runtime\development"
node server.mjs
```

The integration tests use port `13963` and an isolated runtime. Native audio tests run on Windows. `NP_NO_BRIDGE=1` disables Windows capture for UI-only development.

## Diagnostics

Run these in the signed-in Windows desktop session:

```powershell
# Read the current media state once.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\bridge\media.ps1 -RuntimePath "$PWD\.runtime" -Once

# Inspect artwork publication.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\bridge\diagnose.ps1

# Inspect active Apple Music audio sessions.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\bridge\audio.ps1 -Diagnose
```

Apple Music may output audio through `AMPLibraryAgent.exe` rather than its UI process. Capture selects the active Apple audio session; it does not automatically broaden process capture to system audio.

Local settings, artwork, and command files live in `.runtime/`. Treat them as user data and keep them out of commits. Preserve ASCII text and CRLF line endings in `start.cmd`.
