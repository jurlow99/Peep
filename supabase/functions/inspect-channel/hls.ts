export function attributes(value:string):Record<string,string>{
 const out:Record<string,string>={};for(const match of value.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g))out[match[1]]=match[2].replace(/^"|"$/g,'');return out;
}
const number=(v:unknown)=>{const n=typeof v==='string'&&v.trim()?Number(v):NaN;return Number.isFinite(n)&&n>=0?n:null;};
export type Marker={key:string;type:string;id:string;duration:number|null;time:string|null;source:string};
export function parseHLS(text:string){
 if(!/^\uFEFF?\s*#EXTM3U(?:\r?\n|$)/.test(text))throw new Error('Not an HLS playlist.');
 const lines=text.split(/\r?\n/).map(l=>l.trim()),variants:any[]=[],audio:any[]=[],events:Marker[]=[],segments:string[]=[],segmentDurations:number[]=[];
 let pending:Record<string,string>|null=null,sequence=0,index=0,time:number|null=null,duration=0,encrypted=false,fragmented=false,byteRanges=false;
 for(const line of lines){
  if(line.startsWith('#EXT-X-MEDIA-SEQUENCE:'))sequence=Number(line.split(':')[1])||0;
  else if(line.startsWith('#EXT-X-STREAM-INF:'))pending=attributes(line.slice(line.indexOf(':')+1));
  else if(line.startsWith('#EXT-X-MEDIA:')){const a=attributes(line.slice(line.indexOf(':')+1));if(a.TYPE==='AUDIO')audio.push({name:a.NAME||null,language:a.LANGUAGE||null,group:a['GROUP-ID']||null});}
  else if(line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')){const n=Date.parse(line.slice(line.indexOf(':')+1));time=Number.isFinite(n)?n:null;}
  else if(line.startsWith('#EXTINF:'))duration=Number(line.slice(8).split(',')[0])||0;
  else if(line.startsWith('#EXT-X-KEY:'))encrypted=attributes(line.slice(11)).METHOD!=='NONE';
  else if(line.startsWith('#EXT-X-MAP:'))fragmented=true;
  else if(line.startsWith('#EXT-X-BYTERANGE:'))byteRanges=true;
  else if(line.startsWith('#EXT-X-DATERANGE:')){
   const a=attributes(line.slice(17)),id=a.ID||`sequence-${sequence+index}`;
   const d=number(a.DURATION)??number(a['PLANNED-DURATION']);
   for(const [field,type] of [['SCTE35-OUT','start'],['SCTE35-IN','end'],['SCTE35-CMD','signal']])if(a[field])events.push({key:`daterange:${id}:${type}`,id,type,duration:d,time:(type==='end'?a['END-DATE']:a['START-DATE'])||null,source:'HLS DATERANGE'});
  }else if(line.startsWith('#EXT-X-CUE-OUT:')||line==='#EXT-X-CUE-OUT'){
   const value=line.slice(15);events.push({key:`cue:${sequence+index}:start`,id:String(sequence+index),type:'start',duration:number(value)??number(attributes(value).DURATION),time:time===null?null:new Date(time).toISOString(),source:'HLS CUE-OUT'});
  }else if(line==='#EXT-X-CUE-IN'||line.startsWith('#EXT-X-CUE-IN:'))events.push({key:`cue:${sequence+index}:end`,id:String(sequence+index),type:'end',duration:null,time:time===null?null:new Date(time).toISOString(),source:'HLS CUE-IN'});
  else if(line&&!line.startsWith('#')){
   if(pending){variants.push({uri:line,bandwidth:number(pending.BANDWIDTH),averageBandwidth:number(pending['AVERAGE-BANDWIDTH']),frameRate:number(pending['FRAME-RATE']),resolution:pending.RESOLUTION||null,codecs:pending.CODECS||null});pending=null;}
   else{segments.push(line);segmentDurations.push(duration);index++;if(time!==null)time+=duration*1000;duration=0;}
  }
 }
 return {variants,audio,events:Array.from(new Map(events.map(e=>[e.key,e])).values()),segments,segmentDurations,encrypted,fragmented,byteRanges,live:!lines.includes('#EXT-X-ENDLIST')};
}
