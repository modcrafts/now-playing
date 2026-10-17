// Visual interpolation only: FFT values, gain and target heights stay intact.
// Quiet onsets, near-silent levels and larger movements remain immediate.
export function smallChangeTransitionMs(previousHeight,nextHeight,enabled=true) {
  // The silent baseline is 2 px. Bypass interpolation within half a pixel of
  // it in either direction; this does not clamp or discard quiet signals.
  if(!enabled||!Number.isFinite(previousHeight)||previousHeight<=2.5||nextHeight<=2.5)return 0;
  const distance=Math.abs(nextHeight-previousHeight);
  // Cover moderate twitches too, then gradually remove the transition for
  // larger beats. A hard cutoff makes adjacent input sizes visibly snap.
  const blend=Math.max(0,Math.min(1,(distance-3)/4));
  return 48*(1-blend*blend*(3-2*blend));
}
