// Visual interpolation only: FFT values, gain and target heights stay intact.
// Quiet onsets, silence and larger movements remain immediate.
export function smallChangeTransitionMs(previousHeight,nextHeight) {
  if(!Number.isFinite(previousHeight)||previousHeight<=2||nextHeight<=2)return 0;
  return Math.abs(nextHeight-previousHeight)<=1.25?40:0;
}
