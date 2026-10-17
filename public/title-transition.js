// The text's marquee runs inside this layer, independently of the song change.
export function createTitleTransition(text) {
  const layer=text.parentElement,host=layer.parentElement;
  let animations=[],outgoing=null,version=0,current=text.textContent;
  function finish() {
    version++;
    for(const animation of animations)animation.cancel();
    animations=[];outgoing?.remove();outgoing=null;
    host.classList.remove('title-changing');
  }
  return {
    set(value,animate=true) {
      if(value===current)return;
      const canAnimate=animate&&current&&value&&host.clientWidth>0&&typeof layer.animate==='function';
      // During rapid skips, keep whichever of the two layers is still visible
      // instead of flashing a title whose entrance has barely started.
      let clone=null,start;
      if(canAnimate) {
        const source=outgoing&&Number(getComputedStyle(layer).opacity)<Number(getComputedStyle(outgoing).opacity)?outgoing:layer;
        const style=getComputedStyle(source);
        start={transform:style.transform,filter:style.filter,opacity:style.opacity};
        clone=source.cloneNode(true);
        const oldText=clone.querySelector('[data-text]');
        oldText.classList.remove('marquee');
        oldText.style.transform=getComputedStyle(source.querySelector('[data-text]')).transform;
      }
      finish();
      const ticket=version;
      if(canAnimate) {
        outgoing=clone;
        outgoing.classList.add('title-outgoing');outgoing.setAttribute('aria-hidden','true');
        host.append(outgoing);
      }
      current=value;text.textContent=value;
      if(!canAnimate)return;
      host.classList.add('title-changing');
      const distance=Math.max(8,Math.min(16,host.clientWidth*.035));
      animations=[
        outgoing.animate([
          start,
          {transform:`translateX(-${distance}px)`,filter:'blur(7px)',opacity:0},
        ],{duration:110,easing:'cubic-bezier(.55,0,1,.45)',fill:'both'}),
        layer.animate([
          {transform:`translateX(${distance}px)`,filter:'blur(7px)',opacity:0},
          {transform:'translateX(0)',filter:'blur(0px)',opacity:1},
        ],{duration:150,delay:80,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'}),
      ];
      Promise.all(animations.map(animation=>animation.finished)).then(()=>{
        if(ticket===version)finish();
      }).catch(()=>{}); // Rapid skips cancel obsolete animations intentionally.
    },
    finish,
    destroy:finish,
  };
}
