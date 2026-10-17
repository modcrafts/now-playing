import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pickArtworkColor,readableArtworkColor,contrastingArtworkColor} from '../public/artwork-color.js';
const pixels=(...groups)=>new Uint8ClampedArray(groups.flatMap(([rgba,count])=>Array.from({length:count},()=>rgba).flat()));
test('cover palette favors a populated color over black borders and small bright details',()=>{
  const cover=pixels([[0,0,0,255],80],[[184,48,40,255],100],[[255,255,255,255],12],[[255,205,20,255],4]);
  assert.equal(pickArtworkColor(cover),'#b83028');
  assert.equal(pickArtworkColor(pixels([[20,100,190,255],100])),'#1464be');
});
test('transparent covers fall back and monochrome covers retain a neutral accent',()=>{
  assert.equal(pickArtworkColor(pixels([[200,40,20,0],100])),null);
  for(const shade of [0,100,255]){
    const color=pickArtworkColor(pixels([[shade,shade,shade,255],100]));
    assert.equal(color.slice(1,3),color.slice(3,5));assert.equal(color.slice(3,5),color.slice(5,7));
  }
});
test('cover accents remain visible on dark and light panels',()=>{
  const brightness=color=>{
    const c=[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return .2126*c[0]+.7152*c[1]+.0722*c[2];
  };
  for(const background of ['#0d0d12','#ffffff','#777777'])for(const source of ['#101030','#e8e8ff','#303030','#ffffff']){
    const color=readableArtworkColor(source,background),a=brightness(color),b=brightness(background);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.45,`${color} on ${background}`);
  }
  assert.equal(readableArtworkColor('#f5c518','#0d0d12'),'#f5c518');
});
test('automatic accents are distinct from the cover hue and work on light and dark panels',()=>{
  const hue=color=>{
    const [r,g,b]=[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16)),top=Math.max(r,g,b),bottom=Math.min(r,g,b),d=top-bottom;
    return ((top===r?(g-b)/d:top===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360;
  };
  for(const cover of ['#d9398c','#245cba','#30905d','#cb582c'])for(const panel of ['#0d0d12','#ffffff']){
    const accent=contrastingArtworkColor(cover,panel),distance=Math.abs(hue(accent)-hue(cover));
    assert.ok(Math.min(distance,360-distance)>65,`${accent} must differ visibly from ${cover}`);
    assert.equal(readableArtworkColor(accent,panel),accent,'derived accents remain readable');
  }
  const pinkAccent=contrastingArtworkColor('#d9398c','#0d0d12');
  assert.ok(hue(pinkAccent)>30&&hue(pinkAccent)<65,'pink cover uses a warm gold accent');
  const monochrome=contrastingArtworkColor('#808080','#0d0d12','#f5c518');
  assert.ok(hue(monochrome)>30&&hue(monochrome)<65,'neutral covers derive their hue from the chosen manual color');
});
