// Spectrum v1: NP | version | type | generatedAt:f64 | at:f64 | rms:f64 |
// peak:f64 | 44 packed 10-bit levels. Numeric fields are little-endian.
// The native bridge already rounds bands to 0.001, so integers 0..1000
// preserve every source value. RMS/peak retain their full JS precision.
export const SPECTRUM_FORMAT='spectrum-v1';
export const SPECTRUM_BYTES=91;
const BANDS=44,HEADER=36;

export function encodeSpectrumFrame(data){
  if(!Array.isArray(data?.bands)||data.bands.length!==BANDS||data.bands.some(value=>!Number.isFinite(value)||value<0||value>1))return null;
  const generatedAt=data.generatedAt??data.at,at=data.at??generatedAt;
  if(!Number.isSafeInteger(generatedAt)||generatedAt<0||!Number.isSafeInteger(at)||at<0||![data.rms,data.peak].every(value=>Number.isFinite(value)&&value>=0))return null;
  const bytes=new Uint8Array(SPECTRUM_BYTES),view=new DataView(bytes.buffer);
  bytes.set([0x4e,0x50,1,1]);
  view.setFloat64(4,generatedAt,true);view.setFloat64(12,at,true);
  view.setFloat64(20,data.rms,true);view.setFloat64(28,data.peak,true);
  for(let i=0;i<BANDS;i++){
    const scaled=data.bands[i]*1000,value=Math.round(scaled);
    if(value/1000!==data.bands[i])return null;
    const bit=i*10,index=HEADER+(bit>>3),shift=bit&7;
    bytes[index]|=(value<<shift)&255;bytes[index+1]|=value>>(8-shift);
  }
  return bytes;
}

export function decodeSpectrumFrame(input){
  let bytes;
  if(input instanceof ArrayBuffer)bytes=new Uint8Array(input);
  else if(ArrayBuffer.isView(input))bytes=new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
  else return null;
  if(bytes.length!==SPECTRUM_BYTES||bytes[0]!==0x4e||bytes[1]!==0x50||bytes[2]!==1||bytes[3]!==1)return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const generatedAt=view.getFloat64(4,true),at=view.getFloat64(12,true),rms=view.getFloat64(20,true),peak=view.getFloat64(28,true);
  if(!Number.isSafeInteger(generatedAt)||generatedAt<0||!Number.isSafeInteger(at)||at<0||![rms,peak].every(value=>Number.isFinite(value)&&value>=0))return null;
  const bands=[];
  for(let i=0;i<BANDS;i++){
    const bit=i*10,index=HEADER+(bit>>3),shift=bit&7;
    const value=((bytes[index]|bytes[index+1]<<8)>>>shift)&1023;
    if(value>1000)return null;
    bands.push(value/1000);
  }
  return {bands,rms,peak,generatedAt,at};
}
