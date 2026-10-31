export function xmltvDate(value){
 const m=String(value||'').trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(?:(\d{2})(\d{2})?)?(?:\s*([+-]\d{4}))?$/);
 if(!m)return null;
 const [,y,mo,d,h,mi='00',s='00',offset]=m;
 const date=new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset?offset.slice(0,3)+':'+offset.slice(3):'Z'}`);
 return Number.isFinite(date.getTime())?date:null;
}
export function parseChannelGuide(xml){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('XMLTV files with document types or entities are not supported.');
 const doc=new DOMParser().parseFromString(xml,'text/xml');
 if(doc.querySelector('parsererror')||doc.documentElement.nodeName!=='tv')throw new Error('Choose a valid XMLTV file.');
 const channels={};for(const c of doc.querySelectorAll('channel')){const id=c.getAttribute('id');if(id)channels[id]=c.querySelector('display-name')?.textContent?.trim()||id;}
 const programmes=[],seen=new Set();let skipped=0;
 for(const p of doc.querySelectorAll('programme')){
  const channel=p.getAttribute('channel'),start=xmltvDate(p.getAttribute('start')),end=xmltvDate(p.getAttribute('stop'));
  const title=p.querySelector('title')?.textContent?.trim();
  if(!channel||!start||!end||end<=start||!title){skipped++;continue;}
  if(!channels[channel])channels[channel]=channel;
  const key=`${channel}|${start.toISOString()}`;if(seen.has(key))continue;seen.add(key);
  programmes.push({channel,title,description:p.querySelector('desc')?.textContent?.trim()||null,thumbnail:p.querySelector('icon')?.getAttribute('src')||null,start_time:start.toISOString(),end_time:end.toISOString()});
 }
 if(!programmes.length)throw new Error('No valid programs found. Each program needs a title, start and stop time.');
 return {channels,programmes,skipped};
}
export function suggestGuideChannel(channels,name,savedID){
 if(savedID&&channels[savedID])return savedID;
 const normalized=v=>String(v||'').trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 const matches=Object.entries(channels).filter(([id,label])=>normalized(label)===normalized(name)||normalized(id)===normalized(name));
 return matches.length===1?matches[0][0]:'';
}
