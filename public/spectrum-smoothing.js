// Dampen only repeated, small, rapid reversals. Real level changes pass through
// unchanged, including tiny trends, coherent volume changes and quiet onsets.
export function createSpectrumSmoother(count=44) {
  const levels=Array(count).fill(0),previous=Array(count).fill(0),directions=Array(count).fill(0),reversals=Array(count).fill(0),stepAt=Array(count).fill(-Infinity);
  let lastAt=null;
  return {
    reset(){levels.fill(0);previous.fill(0);directions.fill(0);reversals.fill(0);stepAt.fill(-Infinity);lastAt=null;},
    update(bands,now=performance.now()) {
      const elapsed=lastAt===null?20:Math.max(1,Math.min(50,now-lastAt));lastAt=now;
      const targets=Array.from({length:count},(_,i)=>Number.isFinite(bands[i])?Math.max(0,Math.min(1,bands[i])):0);
      let rising=0,falling=0;
      for(let i=0;i<count;i++)if(targets[i]>0&&previous[i]>0){
        if(targets[i]>previous[i])rising++;else if(targets[i]<previous[i])falling++;
      }
      const moving=rising+falling,coherent=moving>=4&&Math.max(rising,falling)>=moving*.85;
      for(let i=0;i<count;i++) {
        const target=targets[i],input=previous[i],step=target-input,direction=Math.sign(step);
        const small=input>0&&target>0&&Math.abs(step)/Math.max(input,target)<=.08;
        const rapid=now-stepAt[i]<=80;
        if(!small||coherent||!rapid)reversals[i]=0;
        else if(direction&&directions[i]&&direction!==directions[i])reversals[i]++;
        else if(direction)reversals[i]=0;
        if(direction){directions[i]=direction;stepAt[i]=now;}
        const jitter=small&&!coherent&&direction!==0&&reversals[i]>=2;
        levels[i]=jitter?levels[i]+(target-levels[i])*(1-Math.exp(-elapsed/45)):target;
        previous[i]=target;
      }
      return [...levels];
    },
  };
}
