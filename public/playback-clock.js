// Media-session reports can lag behind the locally extrapolated position.
// Hold small backward corrections until the source catches up, rather than
// retaining an offset that would let the display drift ahead on every report.
export function createPlaybackClock() {
  let key=null,position=0,wasPlaying=false,lastNow=0;
  return {
    reset(){key=null;position=0;wasPlaying=false;lastNow=0;},
    position(track,now=Date.now()){
      if(!track?.connected){this.reset();return 0;}
      const duration=Math.max(0,track.duration||0);
      const elapsed=track.playing?Math.max(0,(now-track.updatedAt)/1000)*(track.rate??1):0;
      const reported=Math.max(0,Math.min(duration,(track.position||0)+elapsed));
      const nextKey=JSON.stringify([track.source,track.title,track.artist,track.album,duration]);
      const backward=position-reported;
      const restart=reported<=.25&&position>1;
      const correction=nextKey===key&&track.playing&&wasPlaying&&now>=lastNow&&!restart&&backward>0&&backward<=2;
      if(!correction)position=reported;
      key=nextKey;wasPlaying=Boolean(track.playing);lastNow=now;
      return position;
    },
  };
}
