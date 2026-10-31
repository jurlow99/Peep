export function publicFeedURL(value: string): URL {
 const url=new URL(value);
 const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||
   ['localhost','0.0.0.0','::','::1'].includes(host)||/\.(localhost|local|internal)$/.test(host)||
   (url.port&&!['80','443'].includes(url.port)))throw new Error('Use a public HTTP(S) XMLTV URL.');
 return url;
}
export function privateAddress(ip: string): boolean {
 if(ip.includes(':'))return /^(::|fc|fd|fe[89ab])/i.test(ip);
 const p=ip.split('.').map(Number);
 if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return true;
 return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||p[0]===198&&[18,19].includes(p[1]);
}
export async function fetchPublicFeed(value: string, signal: AbortSignal = AbortSignal.timeout(60000)): Promise<Response> {
 let url=publicFeedURL(value);
 for(let redirects=0;redirects<=4;redirects++){
  const host=url.hostname.replace(/^\[|\]$/g,'');
  let addresses: string[]=[];
  if(/^[\d.]+$/.test(host)||host.includes(':'))addresses=[host];
  else {const result=await Promise.allSettled([Deno.resolveDns(host,'A'),Deno.resolveDns(host,'AAAA')]);addresses=result.flatMap(r=>r.status==='fulfilled'?r.value:[]);}
  if(!addresses.length||addresses.some(privateAddress))throw new Error('Feed host must resolve to a public address.');
  const response=await fetch(url,{redirect:'manual',headers:{'User-Agent':'Peep-EPG/1.0'},signal});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel();
   if(!location)throw new Error('Invalid feed redirect.');url=publicFeedURL(new URL(location,url).toString());continue;
  }
  if(!response.ok){await response.body?.cancel();throw new Error(`Feed returned HTTP ${response.status}.`);}
  return response;
 }
 throw new Error('Too many feed redirects.');
}
export async function boundedBytes(stream: ReadableStream<Uint8Array>,limit=32*1024*1024): Promise<Uint8Array> {
 const reader=stream.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('Feed is too large. Ask your provider for a smaller channel feed.');chunks.push(value);}}
 catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let position=0;for(const c of chunks){bytes.set(c,position);position+=c.length;}return bytes;
}
export async function decodedFeedStream(response: Response): Promise<ReadableStream<Uint8Array>> {
 if(!response.body)throw new Error('Empty feed.');
 const reader=response.body.getReader(),prefix:Uint8Array[]=[];let size=0;
 while(size<2){const {done,value}=await reader.read();if(done)break;prefix.push(value);size+=value.length;}
 const first=new Uint8Array(size);let pos=0;for(const chunk of prefix){first.set(chunk,pos);pos+=chunk.length;}
 const stream=new ReadableStream<Uint8Array>({start(controller){if(first.length)controller.enqueue(first);},async pull(controller){try{const {done,value}=await reader.read();if(done){controller.close();reader.releaseLock();}else controller.enqueue(value);}catch(e){controller.error(e);}},cancel(reason){return reader.cancel(reason);}});
 return first[0]===0x1f&&first[1]===0x8b?stream.pipeThrough(new DecompressionStream('gzip')):stream;
}
