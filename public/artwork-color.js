const hex = rgb => '#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const rgb = color => [1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16));
function luminance(values) {
  const linear=values.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
}
function toHsl(values) {
  const [r,g,b]=values.map(v=>v/255),high=Math.max(r,g,b),low=Math.min(r,g,b),delta=high-low;
  const light=(high+low)/2,saturation=delta/(1-Math.abs(2*light-1))||0;
  const hue=delta?((high===r?(g-b)/delta+6:high===g?(b-r)/delta+2:(r-g)/delta+4)%6):0;
  return {hue,saturation,light};
}
function fromHsl(hue,saturation,light) {
  const c=(1-Math.abs(2*light-1))*saturation,x=c*(1-Math.abs(hue%2-1)),m=light-c/2;
  const channels=hue<1?[c,x,0]:hue<2?[x,c,0]:hue<3?[0,c,x]:hue<4?[0,x,c]:hue<5?[x,0,c]:[c,0,x];
  return channels.map(v=>(v+m)*255);
}

// Choose a populated color cluster rather than averaging contrasting colors
// into grey, or choosing a single bright pixel in a logo.
export function pickArtworkColor(pixels) {
  const buckets=new Map(),neutral=[0,0,0];let visible=0;
  for(let i=0;i<pixels.length;i+=4) {
    const [r,g,b,a]=pixels.slice(i,i+4);
    if(a<128)continue;
    visible++;neutral[0]+=r;neutral[1]+=g;neutral[2]+=b;
    const high=Math.max(r,g,b),low=Math.min(r,g,b);
    if(high<18||low>242)continue;
    const saturation=high?1-low/high:0;
    const weight=a/255*(.3+.7*saturation);
    const key=(r>>5)*64+(g>>5)*8+(b>>5);
    const bucket=buckets.get(key)||{weight:0,r:0,g:0,b:0};
    bucket.weight+=weight;bucket.r+=r*weight;bucket.g+=g*weight;bucket.b+=b*weight;
    buckets.set(key,bucket);
  }
  const best=[...buckets.values()].sort((a,b)=>b.weight-a.weight)[0];
  return best?hex([best.r/best.weight,best.g/best.weight,best.b/best.weight]):visible?hex(neutral.map(v=>v/visible)):null;
}

export function readableArtworkColor(color,background) {
  const source=rgb(color),back=luminance(rgb(background));
  const contrast=values=>{const front=luminance(values);return (Math.max(front,back)+.05)/(Math.min(front,back)+.05);};
  if(contrast(source)>=4.5)return color;
  // Adjust HSL lightness, preserving hue and saturation so a dark blue cover
  // yields a visible blue accent rather than a washed-out grey.
  const {hue,saturation,light}=toHsl(source);
  const end=back<.18?1:0;
  for(let step=1;step<=50;step++) {
    const mixed=fromHsl(hue,saturation,light+(end-light)*step/50);
    if(contrast(mixed)>=4.5)return hex(mixed);
  }
  return hex([end*255,end*255,end*255]);
}

export function contrastingArtworkColor(color,background,fallback='#2ec8c0') {
  const source=toHsl(rgb(color));
  // A literal cover color disappears beside that cover and its blurred glow.
  // Derive a distinct, softer accent instead: pink -> gold, blue -> lavender.
  const hue=source.saturation<.12?toHsl(rgb(fallback)).hue:(source.hue+1.25)%6;
  const saturation=Math.max(.4,Math.min(.65,source.saturation*.8));
  const light=luminance(rgb(background))<.18?.76:.34;
  return readableArtworkColor(hex(fromHsl(hue,saturation,light)),background);
}

export function loadArtworkColor(url) {
  return new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>{
      try {
        const canvas=document.createElement('canvas');canvas.width=canvas.height=48;
        const context=canvas.getContext('2d',{willReadFrequently:true});
        context.drawImage(image,0,0,48,48);
        resolve(pickArtworkColor(context.getImageData(0,0,48,48).data));
      } catch { resolve(null); }
    };
    image.onerror=()=>resolve(null);
    image.src=url;
  });
}
