import { SKINS, skinDefaults } from '/shared.js';
const gallery = document.querySelector('#gallery');
for (const [index,skin] of SKINS.entries()) {
  const article = document.createElement('article'); article.className='gallery-card'; article.dataset.skin=skin.id;
  const stage = document.createElement('div'); stage.className='gallery-stage';
  const iframe = document.createElement('iframe'); iframe.src=`/overlay?preview=1&card=1&skin=${skin.id}`; iframe.title=`${skin.name} 皮肤预览`; stage.append(iframe);
  const info=document.createElement('div'); info.className='gallery-info';
  const heading=document.createElement('div'); heading.className='gallery-title';
  const number=document.createElement('span'); number.textContent=String(index+1).padStart(2,'0');
  const title=document.createElement('h2'); title.textContent=skin.name;
  const link=document.createElement('a'); link.href=`/?skin=${skin.id}#studio`; link.textContent='使用这款 ↗';
  const description=document.createElement('p'); description.textContent=skin.label;
  heading.append(number,title,link); info.append(heading,description); article.append(stage,info); gallery.append(article);
}
document.querySelector('#gallery-count').textContent=`${SKINS.length} / ${SKINS.length}`;
document.querySelector('#gallery-motion').addEventListener('change',event=>{
  for(const iframe of gallery.querySelectorAll('iframe')){
    // Frames are same-origin and receive only this trusted parent message.
    const id=new URL(iframe.src).searchParams.get('skin');
    iframe.contentWindow.postMessage({type:'gallery-motion',animate:event.target.checked,config:skinDefaults(id)},location.origin);
  }
});
