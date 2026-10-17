// The text's marquee runs inside this layer, independently of the song change.
export function createTitleTransition(text) {
  const layer=text.parentElement,host=layer.parentElement;
  const enterBlur=host.querySelector('#title-ink-in feGaussianBlur'),exitBlur=host.querySelector('#title-ink-out feGaussianBlur');
  let animations=[],outgoing=null,version=0,current=text.textContent,blurFrame=null;
  function finish() {
    version++;
    if(blurFrame!==null)cancelAnimationFrame(blurFrame);blurFrame=null;
    for(const animation of animations)animation.cancel();
    animations=[];outgoing?.remove();outgoing=null;
    text.style.removeProperty('filter');
    enterBlur.setAttribute('stdDeviation','0');exitBlur.setAttribute('stdDeviation','0');
    host.classList.remove('title-changing');
  }
  return {
    set(value,animate=true) {
      if(value===current)return;
      const canAnimate=animate&&current&&value&&host.clientWidth>0&&typeof layer.animate==='function';
      // During rapid skips, keep whichever of the two layers is still visible
      // instead of flashing a title whose entrance has barely started.
      let clone=null,start,oldBlur=0;
      if(canAnimate) {
        const source=outgoing&&Number(getComputedStyle(layer).opacity)<Number(getComputedStyle(outgoing).opacity)?outgoing:layer;
        const style=getComputedStyle(source);
        start={transform:style.transform,opacity:style.opacity};
        oldBlur=Number((source===layer?enterBlur:exitBlur).getAttribute('stdDeviation'))||0;
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
      const oldText=outgoing.querySelector('[data-text]');
      oldText.style.filter='url("#title-ink-out")';text.style.filter='url("#title-ink-in")';
      animations=[
        outgoing.animate([
          start,
          {transform:`translateX(-${distance}px)`,opacity:0},
        ],{duration:110,easing:'cubic-bezier(.55,0,1,.45)',fill:'both'}),
        layer.animate([
          {transform:`translateX(${distance}px)`,opacity:0},
          {transform:'translateX(0)',opacity:1},
        ],{duration:150,delay:80,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'}),
      ];
      // SVG filter regions hard-clip the blur to each glyph span. Animate the
      // Gaussian amount directly: URL filters cannot interpolate as CSS lists.
      const drawBlur=()=>{
        if(ticket!==version)return;
        const exit=animations[0].effect.getComputedTiming().progress??0;
        const enter=animations[1].effect.getComputedTiming().progress??0;
        exitBlur.setAttribute('stdDeviation',String(oldBlur+(5-oldBlur)*exit));
        enterBlur.setAttribute('stdDeviation',String(5*(1-enter)));
        blurFrame=requestAnimationFrame(drawBlur);
      };
      drawBlur();
      Promise.all(animations.map(animation=>animation.finished)).then(()=>{
        if(ticket===version)finish();
      }).catch(()=>{}); // Rapid skips cancel obsolete animations intentionally.
    },
    finish,
    destroy:finish,
  };
}
