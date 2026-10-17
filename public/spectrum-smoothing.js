// Continuous adaptive smoothing follows small changes while attenuating rapid
// reversals. No deadband or noise gate hides quiet audio or its onset.
export function createSpectrumSmoother(count=44) {
  const levels=Array(count).fill(0);let lastAt=null;
  return {
    reset(){levels.fill(0);lastAt=null;},
    update(bands,now=performance.now()) {
      const elapsed=lastAt===null?20:Math.max(1,Math.min(50,now-lastAt));lastAt=now;
      for(let i=0;i<count;i++) {
        const target=Number.isFinite(bands[i])?Math.max(0,Math.min(1,bands[i])):0;
        const current=levels[i];
        // Preserve every zero-to-signal edge, however quiet, and clear silence.
        if(current===0||target===0){levels[i]=target;continue;}
        const relative=Math.abs(target-current)/Math.max(target,current);
        const tau=relative>.2?8:55;
        levels[i]+=(target-current)*(1-Math.exp(-elapsed/tau));
      }
      return [...levels];
    },
  };
}
