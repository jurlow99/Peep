import {describe,it,expect} from 'vitest';
import {parseHLS} from '../../../supabase/functions/inspect-channel/hls';
import {crc32,inspectTransport,spliceEvent} from '../../../supabase/functions/inspect-channel/transport';
import {mergeStreamEvents} from '../components/cms/StreamInspector';
function section(data:number[]){const c=crc32(Uint8Array.from(data));return Uint8Array.from([...data,c>>>24,(c>>>16)&255,(c>>>8)&255,c&255]);}
function packet(pid:number,data:Uint8Array,cc=0){const p=new Uint8Array(188).fill(255);p.set([71,64|(pid>>8),pid&255,16|cc,0]);p.set(data,5);return p;}
function join(...arrays:Uint8Array[]){return Uint8Array.from(arrays.flatMap(a=>Array.from(a)));}
const pat=section([0,176,13,0,1,193,0,0,0,1,225,0]);
const pmt=section([2,176,34,0,1,193,0,0,225,1,240,0,27,225,1,240,0,15,225,2,240,6,10,4,101,110,103,0,134,225,227,240,0]);
function splice(){// splice_insert event 7, immediate out, 90-second duration
 const bits:number[]=[];const put=(v:number,n:number)=>{for(let i=n-1;i>=0;i--)bits.push(Math.floor(v/2**i)%2);};
 put(0,8);put(0,1);put(0,6);put(0,33);put(0,8);put(4095,12);put(20,12);put(5,8);put(7,32);put(0,1);put(127,7);put(15,4);put(15,4);put(1,1);put(63,6);put(8100000,33);put(1,16);put(1,8);put(1,8);put(0,16);
 const body=[];for(let i=0;i<bits.length;i+=8)body.push(bits.slice(i,i+8).reduce((a,b)=>a*2+b,0));const len=body.length+4;return section([252,48|(len>>8),len&255,...body]);
}
describe('stream inspection',()=>{
 it('reads advertised variants without splitting quoted codecs',()=>{const h=parseHLS('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1200000,FRAME-RATE=29.97,CODECS="avc1.4d,mp4a.40.2"\nlow.m3u8');expect(h.variants[0]).toMatchObject({bandwidth:1200000,frameRate:29.97,codecs:'avc1.4d,mp4a.40.2'});});
 it('deduplicates date range updates and records cue duration and timestamp',()=>{const h=parseHLS('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:42\n#EXT-X-PROGRAM-DATE-TIME:2026-10-28T12:00:00Z\n#EXT-X-CUE-OUT:90\n#EXTINF:6,\na.ts\n#EXT-X-CUE-IN\n#EXT-X-DATERANGE:ID="a",SCTE35-OUT=0xFC,PLANNED-DURATION=30\n#EXT-X-DATERANGE:ID="a",SCTE35-OUT=0xFC,DURATION=31');expect(h.events).toHaveLength(3);expect(h.events[0]).toMatchObject({duration:90,time:'2026-10-28T12:00:00.000Z'});expect(h.events[1].time).toBe('2026-10-28T12:00:06.000Z');expect(h.events[2].duration).toBe(31);});
 it('flags unsupported sample types and rejects non-HLS',()=>{expect(()=>parseHLS('<html>')).toThrow();expect(parseHLS('#EXTM3U\n#EXT-X-BYTERANGE:100@0\na.ts').byteRanges).toBe(true);expect(parseHLS('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128').encrypted).toBe(true);});
 it('decodes real PMT PID 483, language and repeated splice messages',()=>{expect(crc32(pmt)).toBe(0);const cue=splice();expect(spliceEvent(cue)).toMatchObject({id:'7',type:'start',duration:90});const r=inspectTransport(join(packet(0,pat),packet(256,pmt),packet(483,cue),packet(483,cue,1)));expect(r.pmtDetected).toBe(true);expect(r.tracks).toHaveLength(3);expect(r.tracks[1].language).toBe('eng');expect(r.tracks[2]).toMatchObject({pid:483,type:'SCTE-35',packetCount:2,sectionCount:2});expect(r.events).toHaveLength(1);});
 it('ignores bad checksums, future tables and incomplete data',()=>{const bad=pat.slice();bad[8]^=1;expect(inspectTransport(join(packet(0,bad),packet(256,pmt))).invalidSections).toBe(1);const future=section([0,176,13,0,1,192,0,0,0,1,225,0]);expect(inspectTransport(join(packet(0,future),packet(256,pmt))).tracks).toEqual([]);expect(inspectTransport(new Uint8Array(20)).pmtDetected).toBe(false);expect(spliceEvent(Uint8Array.of(252))).toBeNull();});
 it('preserves first observation and bounds local history',()=>{const a={key:'a',type:'start'};expect(mergeStreamEvents([{...a,observedAt:'first'}],[a],'second')[0].observedAt).toBe('first');expect(mergeStreamEvents([],Array.from({length:501},(_,i)=>({key:String(i)})),'now')).toHaveLength(500);});
});
it('measures total and per-PID transport rate using media duration, never download speed',()=>{
 const bytes=join(packet(0,pat),packet(256,pmt),packet(483,splice()));
 const report=inspectTransport(bytes,6);
 expect(report.bitrate).toBe(3*188*8/6);expect(report.tracks.find(t=>t.pid===483)?.bitrate).toBe(188*8/6);
 expect(inspectTransport(bytes).bitrate).toBeNull();expect(inspectTransport(bytes,0).bitrate).toBeNull();
 expect(parseHLS('#EXTM3U\n#EXTINF:6,\na.ts\n#EXTINF:4.5,\nb.ts').segmentDurations).toEqual([6,4.5]);
});

it('distinguishes a declared SCTE track from received cue packets',()=>{
 const report=inspectTransport(join(packet(0,pat),packet(256,pmt)));
 expect(report.tracks.find(t=>t.pid===483)).toMatchObject({packetCount:0,sectionCount:0});
 expect(report.events).toEqual([]);
});

it('identifies the captured splice-null heartbeat without inventing a break',()=>{
 const data=Uint8Array.from([252,48,17,0,0,0,0,0,0,0,255,240,0,0,0,0,122,79,191,255]);
 expect(crc32(data)).toBe(0);
 expect(spliceEvent(data)).toMatchObject({type:'heartbeat',command:'splice_null',duration:null});
});

it('decodes Dog the Bounty Hunter’s captured embedded two-minute break cue',()=>{
 const bytes=Uint8Array.from([252, 48, 71, 0, 0, 0, 0, 0, 0, 0, 0, 192, 20, 5, 0, 63, 188, 113, 127, 239, 254, 247, 252, 238, 94, 254, 0, 164, 227, 14, 0, 0, 0, 0, 0, 34, 2, 32, 67, 85, 69, 73, 0, 0, 0, 1, 127, 255, 0, 0, 164, 227, 14, 14, 12, 50, 55, 49, 50, 51, 95, 50, 48, 48, 50, 48, 52, 34, 1, 1, 168, 120, 90, 205]);
 expect(crc32(bytes)).toBe(0);
 expect(spliceEvent(bytes)).toMatchObject({id:'4177009',type:'start',command:'splice_insert',duration:120.067});
 expect(spliceEvent(bytes)?.ptsSeconds).toBeCloseTo(46228.316066666666,5);
});
