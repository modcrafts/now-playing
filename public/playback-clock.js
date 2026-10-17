// Keep a continuous, monotonic display clock between media-session reports.
// Small phase errors adjust its rate by at most 5%; they never stop the clock
// or directly replace the displayed position. Real discontinuities resync.
export function createPlaybackClock() {
  let key=null,position=0,wasPlaying=false,lastTick=0,rate=1,speed=1,report=null;
  function reset(){key=null;position=0;wasPlaying=false;lastTick=0;rate=1;speed=1;report=null;}
  function project(track,now){
    const duration=Math.max(0,track.duration||0);
    const elapsed=track.playing?Math.max(0,(now-track.updatedAt)/1000)*(track.rate??1):0;
    return Math.max(0,Math.min(duration,(track.position||0)+elapsed));
  }
  return {
    reset,
    position(track,now=Date.now(),tick=performance.now()){
      if(!track?.connected){reset();return 0;}
      const duration=Math.max(0,track.duration||0);
      const reported=project(track,now),nextRate=track.rate??1;
      const nextKey=JSON.stringify([track.source,track.title,track.artist,track.album,duration]);
      const elapsed=(tick-lastTick)/1000;
      const newReport=!report||track.updatedAt!==report.updatedAt||track.position!==report.position||Boolean(track.playing)!==Boolean(report.playing)||nextRate!==(report.rate??1)||nextKey!==key;
      const predicted=Math.min(duration,position+(wasPlaying?Math.max(0,elapsed)*rate*speed:0));
      const restart=newReport&&reported<=.25&&predicted>1;
      // Compare reports against each other, so a slowly corrected display
      // offset cannot be mistaken for a new seek on every render frame.
      const seek=newReport&&report&&Math.abs(reported-project(report,now))>2;
      if(nextKey!==key||Boolean(track.playing)!==wasPlaying||nextRate!==rate||elapsed<0||elapsed>5||restart||seek){
        position=reported;speed=1;
      } else if(!track.playing){position=reported;speed=1;}
      else {
        position=predicted;
        if(newReport)speed=1+Math.max(-.05,Math.min(.05,(reported-position)/(8*nextRate)));
      }
      if(newReport||!report)report={...track};
      key=nextKey;wasPlaying=Boolean(track.playing);lastTick=tick;rate=nextRate;
      return position;
    },
  };
}
