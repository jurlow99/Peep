import StreamPMT from './StreamPMT';
import {useEffect,useRef,useState} from 'react';
import {SUPABASE_URL} from '../../lib/config';
import {getAdminToken} from './adminAuth';
import './StreamInspector.css';
import {streamBreaks} from '../../lib/streamBreaks';
const clock=value=>value==null?'Not supplied':new Date(value).toLocaleString();
export function mergeStreamEvents(previous,incoming,observedAt){
 const merged=new Map(previous.map(e=>[e.key,e]));for(const e of incoming){const old=merged.get(e.key);merged.set(e.key,{...old,...e,time:e.time??old?.time,duration:e.duration??old?.duration,observedAt:old?.observedAt??observedAt});}
 return Array.from(merged.values()).slice(-500);
}
export default function StreamInspector({channelID}){
 const [report,setReport]=useState(null),[events,setEvents]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[watch,setWatch]=useState(false);
 const pending=useRef(false),alive=useRef(true),controller=useRef(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 async function inspect(){if(pending.current)return;pending.current=true;setBusy(true);setError('');controller.current=new AbortController();const timer=setTimeout(()=>controller.current?.abort(),30000);try{
  const token=await getAdminToken();if(!token)throw Error('Sign in as admin to inspect streams.');
  const response=await fetch(`${SUPABASE_URL}/functions/v1/inspect-channel`,{method:'POST',signal:controller.current.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({channel_id:channelID})});const data=await response.json();if(!response.ok)throw Error(data.error||'Inspection failed.');
  if(alive.current){setReport(data);setEvents(previous=>mergeStreamEvents(previous,data.events||[],data.checkedAt));}
 }catch(e){if(alive.current)setError(e.name==='AbortError'?'Inspection timed out. Retry or stop monitoring.':e.message);}finally{clearTimeout(timer);pending.current=false;if(alive.current)setBusy(false);}}
 useEffect(()=>{if(!watch)return;inspect();const interval=setInterval(inspect,15000);return()=>clearInterval(interval);},[watch]);
 const starts=events.filter(e=>e.type==='start');
 const breaks=streamBreaks(events);
 return <section className="stream-inspector">
 <div className="stream-inspector-heading"><div><h3>Stream inspector</h3><p>Read-only inspection of this channel’s saved playback feed.</p></div><button className="secondary" onClick={inspect} disabled={busy}>{busy?'Inspecting…':'Inspect now'}</button><button className="secondary" aria-pressed={watch} onClick={()=>setWatch(!watch)}>{watch?'Stop monitoring':'Monitor while open'}</button></div>
 {error&&<p role="alert">{error}</p>}
 {!report?<p>Run an inspection to detect playlist metadata, sampled tracks and ad signals. No channel settings or playback will change.</p>:<>
 <p className="stream-inspector-stamp">Last sample: {new Date(report.checkedAt).toLocaleTimeString()} · {report.elapsedMs} ms{busy?' · refreshing':''}</p>
 <StreamPMT report={report} />
 <section className="stream-break-timeline"><h4>Break timeline</h4><p>Times use your browser’s local timezone. Expected finish is calculated from the signalled duration; it is confirmed only when an end signal arrives. Receipt time is never treated as the break start.</p>{breaks.length?<div className="stream-inspector-table"><table><thead><tr><th>Start</th><th>Duration</th><th>Expected finish</th><th>Confirmed finish</th><th>Status</th><th>Source / ID</th></tr></thead><tbody>{breaks.map(b=><tr key={b.key}><td>{clock(b.start)}{b.start==null&&b.pts!=null&&<small>Stream PTS: {b.pts.toFixed(3)}s</small>}</td><td>{b.duration==null?'Not supplied':`${b.duration}s`}</td><td>{clock(b.expected)}</td><td>{clock(b.end)}</td><td>{b.status}</td><td>{b.source}<small>{b.id}</small></td></tr>)}</tbody></table></div>:<p>No break starts observed yet. Start monitoring to collect signals from this channel.</p>}<details className="stream-inspector-raw"><summary>Signal details & monitoring limits</summary><p><strong>{starts.length} distinct start signals observed</strong> · {events.filter(e=>e.type==='end').length} end signals. History is kept only while this inspector is mounted (maximum 500 signals). Playlist and in-band signals can describe the same break; this is not a guaranteed unique-break count.</p><p>Monitoring polls every 15 seconds and samples one segment. Short or in-band-only events may be missed. SCTE-35 time_signal messages are shown as signals; segmentation descriptors are not decoded. This does not enable ad insertion.</p>{!events.length?<p>No ad signals observed in the samples yet. This does not prove that the feed lacks signals.</p>:<div className="stream-inspector-table"><table><thead><tr><th>Observed</th><th>Event</th><th>ID</th><th>Duration</th><th>Source</th><th>Declared time</th></tr></thead><tbody>{[...events].reverse().map(e=><tr key={e.key}><td>{new Date(e.observedAt).toLocaleTimeString()}</td><td>{e.type}{e.command?` · ${e.command}`:''}</td><td>{e.id??'—'}</td><td>{e.duration==null?'Not signalled':`${e.duration}s`}</td><td>{e.source}</td><td>{e.time||'Not signalled'}</td></tr>)}</tbody></table></div>}</details></section>
 </>}
 </section>;
}
