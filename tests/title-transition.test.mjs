import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTitleTransition} from '../public/title-transition.js';

class Classes extends Set {remove(name){this.delete(name);}}
globalThis.getComputedStyle=node=>({transform:'none',filter:'none',opacity:node.opacity??'1'});
function fixture() {
  const calls=[],host={clientWidth:360,classList:new Classes(),children:[],append(node){this.children.push(node);}};
  const makeLayer=(value='')=>{
    const text={textContent:value,classList:new Classes(),style:{}};
    const layer={parentElement:host,classList:new Classes(),opacity:'1',querySelector:()=>text,setAttribute(){},
      remove(){host.children=host.children.filter(node=>node!==this);},cloneNode(){return makeLayer(text.textContent);},
      animate(keyframes,options){
        let resolve,reject;
        const animation={finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),resolve:()=>resolve(),cancel(){this.cancelled=true;reject(Error('cancelled'));}};
        calls.push({keyframes,options,animation});return animation;
      },
    };
    text.parentElement=layer;return layer;
  };
  const layer=makeLayer(),text=layer.querySelector();
  return {host,layer,text,calls,transition:createTitleTransition(text)};
}
test('only changed existing titles animate; the first title and disabled motion update immediately',()=>{
  const {transition,text,calls}=fixture();
  transition.set('First song');transition.set('First song');
  assert.equal(text.textContent,'First song');assert.equal(calls.length,0);
  transition.set('Next song',false);
  assert.equal(text.textContent,'Next song');assert.equal(calls.length,0);
});
test('title exit and entrance are quick and bounded, and clean up their temporary layers',async()=>{
  const {transition,calls,host}=fixture();transition.set('Old song');transition.set('New song');
  assert.equal(calls.length,2);assert.equal(host.children.length,1);
  const [exit,enter]=calls;
  assert.ok(exit.options.duration<=150);assert.ok(enter.options.duration+(enter.options.delay||0)<=250);
  const distance=frame=>Math.abs(Number(frame.transform.match(/translateX\((-?[\d.]+)px\)/)[1]));
  assert.ok(distance(exit.keyframes[1])<=16);assert.ok(distance(enter.keyframes[0])<=16);
  assert.equal(exit.keyframes[1].opacity,0);assert.equal(enter.keyframes[1].opacity,1);
  for(const call of calls)call.animation.resolve();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(host.children.length,0);assert.equal(host.classList.has('title-changing'),false);
});
test('rapid skips and disabling motion cancel obsolete changes without restoring an old title',async()=>{
  const {transition,text,calls,host,layer}=fixture();
  transition.set('A');transition.set('B');layer.opacity='0';transition.set('C');
  assert.ok(calls.slice(0,2).every(call=>call.animation.cancelled));
  assert.equal(host.children.length,1);assert.equal(host.children[0].querySelector().textContent,'A');
  assert.equal(text.textContent,'C');transition.finish();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(text.textContent,'C');assert.equal(host.children.length,0);
  assert.ok(calls.every(call=>call.animation.cancelled));
});
