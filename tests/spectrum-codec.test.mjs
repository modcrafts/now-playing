import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeSpectrumFrame,decodeSpectrumFrame,SPECTRUM_BYTES} from '../public/spectrum-codec.js';

const sample=(changes={})=>({bands:Array.from({length:44},(_,i)=>Number((.5+.45*Math.sin(i*.67)).toFixed(3))),rms:.000001,peak:.012345,generatedAt:1700000123456,at:1700000123463,...changes});

test('binary spectrum preserves all source levels across packed-byte boundaries',()=>{
  for(let start=0;start<=1000;start+=44){
    const input=sample({bands:Array.from({length:44},(_,i)=>((start+i)%1001)/1000)});
    const encoded=encodeSpectrumFrame(input);
    assert.equal(encoded.byteLength,91);assert.deepEqual(decodeSpectrumFrame(encoded),input);
  }
});

test('quiet values, full precision meters and millisecond timestamps are retained',()=>{
  const input=sample({bands:Array(44).fill(.001),rms:1e-12,peak:.1234567890123456});
  assert.deepEqual(decodeSpectrumFrame(encodeSpectrumFrame(input)),input);
  const silence=sample({bands:Array(44).fill(0),rms:0,peak:0});delete silence.generatedAt;
  assert.deepEqual(decodeSpectrumFrame(encodeSpectrumFrame(silence)),{...silence,generatedAt:silence.at});
});

test('frames with additional band precision opt out rather than rounding away detail',()=>{
  for(const level of [1e-12,.0001,.123456789,.1+.2]){
    assert.equal(encodeSpectrumFrame(sample({bands:Array(44).fill(level)})),null);
  }
});

test('decoder honors sliced buffers and ignores malformed or unsupported frames',()=>{
  const input=sample(),encoded=encodeSpectrumFrame(input),padded=new Uint8Array(101);
  padded.set(encoded,5);assert.deepEqual(decodeSpectrumFrame(padded.subarray(5,96)),input);
  assert.deepEqual(decodeSpectrumFrame(encoded.buffer),input);
  assert.equal(decodeSpectrumFrame(encoded.subarray(0,90)),null);
  assert.equal(decodeSpectrumFrame('invalid'),null);
  for(const [index,value] of [[0,0],[2,2],[3,2]]){
    const invalid=encoded.slice();invalid[index]=value;assert.equal(decodeSpectrumFrame(invalid),null);
  }
  const invalidBand=encoded.slice();invalidBand[36]=255;invalidBand[37]|=3;
  assert.equal(decodeSpectrumFrame(invalidBand),null);
  const invalidMeter=encoded.slice();new DataView(invalidMeter.buffer).setFloat64(20,NaN,true);
  assert.equal(decodeSpectrumFrame(invalidMeter),null);
  assert.equal(encodeSpectrumFrame(sample({bands:[0]})),null);
  assert.equal(encodeSpectrumFrame(sample({rms:NaN})),null);
});

test('binary payload is fixed-size and substantially smaller than a representative JSON frame',()=>{
  const input=sample(),json=JSON.stringify({stream:'spectrum',event:'spectrum',data:input});
  assert.equal(encodeSpectrumFrame(input).byteLength,SPECTRUM_BYTES);
  assert.ok(SPECTRUM_BYTES<Buffer.byteLength(json)*.25);
});
