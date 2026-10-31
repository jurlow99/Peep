export function crc32(bytes:Uint8Array):number{let crc=0xffffffff;for(const byte of bytes){crc^=byte<<24;for(let bit=0;bit<8;bit++)crc=(crc&0x80000000)?(crc<<1)^0x04c11db7:crc<<1;}return crc>>>0;}
class Bits{position:number;constructor(private bytes:Uint8Array,start=0){this.position=start;}read(n:number){if(this.position+n>this.bytes.length*8)throw Error('Truncated section');let value=0;for(let i=0;i<n;i++){value=value*2+((this.bytes[this.position>>3]>>(7-(this.position&7)))&1);this.position++;}return value;}}
export function spliceEvent(section:Uint8Array){
 try{
  if(section[0]!==0xfc)return null;
  const bits=new Bits(section,24);bits.read(8);if(bits.read(1))return null;bits.read(6);const adjustment=bits.read(33);bits.read(8);bits.read(12);bits.read(12);const command=bits.read(8);
  if(command!==5)return {id:null,type:command===0?'heartbeat':'signal',duration:null,command:({0:'splice_null',4:'splice_schedule',6:'time_signal',7:'bandwidth_reservation',255:'private_command'} as Record<number,string>)[command]??`command_${command}`};
  const id=bits.read(32),cancel=bits.read(1);bits.read(7);if(cancel)return {id:String(id),type:'cancel',duration:null,command:'splice_insert'};
  const out=bits.read(1),program=bits.read(1),hasDuration=bits.read(1),immediate=bits.read(1);bits.read(4);
  let ptsSeconds:number|null=null;
  const spliceTime=()=>{if(bits.read(1)){bits.read(6);const pts=bits.read(33);ptsSeconds=((pts+adjustment)%8589934592)/90000;}else bits.read(7);};
  if(program&&!immediate)spliceTime();
  if(!program){const count=bits.read(8);for(let i=0;i<count;i++){bits.read(8);if(!immediate)spliceTime();}}
  let duration:number|null=null;if(hasDuration){bits.read(1);bits.read(6);duration=bits.read(33)/90000;}
  return {id:String(id),type:out?'start':'end',duration,ptsSeconds,command:'splice_insert'};
 }catch{return null;}
}
const codecs:Record<number,[string,string]>={2:['Video','MPEG-2'],27:['Video','H.264'],36:['Video','HEVC'],15:['Audio','AAC'],17:['Audio','AAC LATM'],3:['Audio','MPEG audio'],4:['Audio','MPEG audio'],129:['Audio','AC-3'],135:['Audio','E-AC-3'],134:['SCTE-35','SCTE-35']};
export function inspectTransport(bytes:Uint8Array,durationSeconds:number|null=null){
 const tracks:any[]=[],events:any[]=[],pmts=new Set<number>(),buffers=new Map<number,number[]>(),last=new Map<number,number>();const pidPackets=new Map<number,number>(),sectionCounts=new Map<number,number>();let packets=0,invalidSections=0;
 function section(pid:number,data:Uint8Array){
  if(crc32(data)!==0){invalidSections++;return;}
  sectionCounts.set(pid,(sectionCounts.get(pid)||0)+1);
  if((data[0]===0||data[0]===2)&&!(data[5]&1))return;
  if(pid===0&&data[0]===0){for(let i=8;i+4<=data.length-4;i+=4)if((data[i]<<8|data[i+1])!==0)pmts.add((data[i+2]&31)<<8|data[i+3]);}
  else if(pmts.has(pid)&&data[0]===2){
   const program=data[3]<<8|data[4];let i=12+((data[10]&15)<<8|data[11]);
   while(i+5<=data.length-4){const streamType=data[i],trackPID=(data[i+1]&31)<<8|data[i+2],length=(data[i+3]&15)<<8|data[i+4],end=i+5+length;let language:string|null=null,cuei=false;
    if(end>data.length-4)break;
    for(let d=i+5;d+2<=end;){const tag=data[d],len=data[d+1];if(d+2+len>end)break;if(tag===10&&len>=3)language=String.fromCharCode(...data.slice(d+2,d+5));if(tag===5&&len>=4)cuei=String.fromCharCode(...data.slice(d+2,d+6))==='CUEI';d+=2+len;}
    const [type,codec]=cuei?['SCTE-35','SCTE-35']:codecs[streamType]||['Data',`Stream type 0x${streamType.toString(16)}`];
    const track={pid:trackPID,pmtPID:pid,program,type,codec,language,streamType};if(!tracks.some(t=>t.pid===trackPID&&t.program===program))tracks.push(track);i=end;
   }
  }else if(tracks.some(t=>t.pid===pid&&t.type==='SCTE-35')){const e=spliceEvent(data);if(e)events.push({...e,key:`ts:${pid}:${e.id??Array.from(data).join('.')}:${e.type}`,source:`MPEG-TS PID ${pid}`,time:null});}
 }
 function consume(pid:number){const b=buffers.get(pid)!;while(b.length>=3){if(b[0]===255){b.length=0;return;}const size=3+((b[1]&15)<<8|b[2]);if(size>4096){b.length=0;return;}if(b.length<size)return;section(pid,Uint8Array.from(b.splice(0,size)));}}
 let start=0;while(start<Math.min(188,bytes.length)&&!(bytes[start]===71&&bytes[start+188]===71))start++;
 for(let offset=start;offset+188<=bytes.length;offset+=188){if(bytes[offset]!==71)break;packets++;const pid=(bytes[offset+1]&31)<<8|bytes[offset+2],control=(bytes[offset+3]>>4)&3,pusi=!!(bytes[offset+1]&64),cc=bytes[offset+3]&15;
  pidPackets.set(pid,(pidPackets.get(pid)||0)+1);
  if(bytes[offset+1]&128||bytes[offset+3]&192||control===0||control===2)continue;
  let pos=offset+4;if(control===3)pos+=1+bytes[pos];if(pos>=offset+188)continue;
  if(pid!==0&&!pmts.has(pid)&&!tracks.some(t=>t.pid===pid&&t.type==='SCTE-35'))continue;
  if(last.get(pid)===cc)continue;if(last.has(pid)&&((last.get(pid)!+1)&15)!==cc)buffers.delete(pid);last.set(pid,cc);
  if(pusi){const pointer=bytes[pos++];if(pos+pointer>offset+188)continue;if(pointer&&buffers.has(pid)){buffers.get(pid)!.push(...bytes.slice(pos,pos+pointer));consume(pid);}pos+=pointer;buffers.set(pid,[]);}
  if(!buffers.has(pid))continue;buffers.get(pid)!.push(...bytes.slice(pos,offset+188));consume(pid);
 }
 const measured=durationSeconds!==null&&Number.isFinite(durationSeconds)&&durationSeconds>0&&packets>0;
 for(const track of tracks){track.packetCount=pidPackets.get(track.pid)||0;track.sectionCount=sectionCounts.get(track.pid)||0;track.bitrate=measured?track.packetCount*188*8/durationSeconds:null;}
 return {bitrate:measured?packets*188*8/durationSeconds:null,durationSeconds:measured?durationSeconds:null,tracks,events:Array.from(new Map(events.map(e=>[e.key,e])).values()),packets,invalidSections,pmtDetected:pmts.size>0&&tracks.length>0};
}
