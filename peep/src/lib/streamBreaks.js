const timestamp=value=>{const n=Date.parse(value);return Number.isFinite(n)?n:null;};
// Correlate only matching protocol identifiers. Never use receipt time as airtime.
export function streamBreaks(events,now=Date.now()){
 return events.filter(e=>e.type==='start').map(start=>{
  const family=start.key.startsWith('cue:')?'cue':start.key.split(':').slice(0,-1).join(':');
  const end=events.find(e=>e.type==='end'&&(family==='cue'?e.key.startsWith('cue:')&&Number(e.id)>Number(start.id)&&!events.some(s=>s.type==='start'&&s.key.startsWith('cue:')&&Number(s.id)>Number(start.id)&&Number(s.id)<Number(e.id)):e.key.split(':').slice(0,-1).join(':')===family));
  const cancelled=events.some(e=>e.type==='cancel'&&e.key.split(':').slice(0,-1).join(':')===family);
  const begin=timestamp(start.time),finish=timestamp(end?.time);
  const duration=end?.duration??start.duration??(begin!==null&&finish!==null&&finish>=begin?(finish-begin)/1000:null);
  const expected=begin!==null&&duration!==null?begin+duration*1000:null;
  const status=cancelled?'Cancelled':end?'End signal received':begin===null?'Timing unavailable':now<begin?'Upcoming':expected!==null&&now>=expected?'Expected ended · unconfirmed':'Started · unconfirmed';
  return {key:start.key,id:start.id,source:start.source,start:begin,end:finish,expected,duration,status,pts:start.ptsSeconds??null,observedAt:start.observedAt};
 }).sort((a,b)=>(b.start??timestamp(b.observedAt)??0)-(a.start??timestamp(a.observedAt)??0));
}
