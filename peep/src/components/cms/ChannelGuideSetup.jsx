import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../supabase';
import {SUPABASE_URL} from '../../lib/config';
import {getAdminToken} from './adminAuth';
import {parseChannelGuide,suggestGuideChannel} from '../../lib/xmltv';
import './ChannelGuideSetup.css';
export default function ChannelGuideSetup({channelID,channelName,onSaved}){
 const [url,setUrl]=useState(''),[source,setSource]=useState(null),[parsed,setParsed]=useState(null),[chosen,setChosen]=useState(''),[fileName,setFileName]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[coverage,setCoverage]=useState(null);
 const version=useRef(0);
 useEffect(()=>{
  const request=++version.current;setParsed(null);setSource(null);setUrl('');setError('');setNotice('');setCoverage(null);setBusy(true);setChosen('');setFileName('');
  if(!channelID){setBusy(false);return;}
  Promise.all([supabase.from('epg_channel_sources').select('source_name,source_url,xmltv_channel_id,imported_at,refresh_error').eq('channel_id',channelID).maybeSingle(),supabase.from('epg_entries').select('end_time').eq('channel_id',channelID).order('end_time',{ascending:false}).limit(1)])
   .then(([saved,guide])=>{if(version.current!==request)return;if(saved.error||guide.error){setError('Could not load guide settings. Reopen the channel to retry.');return;}setSource(saved.data);setUrl(saved.data?.source_url||'');setChosen(saved.data?.xmltv_channel_id||'');setCoverage(guide.data?.[0]?.end_time||null);}).catch(()=>{if(version.current===request)setError('Could not load guide settings. Reopen the channel to retry.');}).finally(()=>{if(version.current===request)setBusy(false);});
  return()=>{version.current++;};
 },[channelID]);
 function parse(text,name){const data=parseChannelGuide(text);setParsed(data);setChosen(suggestGuideChannel(data.channels,channelName,source?.xmltv_channel_id));setFileName(name);}
 async function load(file){
  const request=version.current;setBusy(true);setError('');setNotice('');setParsed(null);
  try{
   if(file){if(file.size>25*1024**2)throw new Error('Choose an XML file under 25 MB.');const text=await file.text();if(version.current!==request)return;parse(text,file.name);}
   else {const token=await getAdminToken();const response=await fetch(`${SUPABASE_URL}/functions/v1/fetch-xmltv?url=${encodeURIComponent(url.trim())}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('Could not load this XMLTV link. Check the provider URL.');const text=await response.text();if(version.current!==request)return;parse(text,'');}
  }catch(e){if(version.current===request)setError(e.message);}finally{if(version.current===request)setBusy(false);}
 }
 const entries=(parsed?.programmes||[]).filter(p=>p.channel===chosen).sort((a,b)=>a.start_time.localeCompare(b.start_time));
 async function save(){
  setBusy(true);setError('');setNotice('');
  try{
   if(!entries.length)throw new Error('Choose a feed channel with programs.');
   const {data,error}=await supabase.rpc('save_channel_guide',{p_channel_id:channelID,p_entries:entries.map(({channel,...p})=>p),p_source_name:fileName||'XMLTV feed',p_source_url:fileName?null:url.trim(),p_xmltv_channel_id:chosen,p_xml_content:null});
   if(error)throw error;
   setSource({source_name:fileName||'XMLTV feed',source_url:fileName?null:url.trim(),xmltv_channel_id:chosen,imported_at:new Date().toISOString()});setCoverage(data.coverage_end);setParsed(null);setNotice(`${data.program_count} programs saved. ${fileName?'Upload a fresh file when coverage ends.':'This link refreshes automatically every 6 hours.'}`);onSaved?.();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="channel-guide-setup"><h3>Program guide</h3><p>Connect the provider’s XMLTV schedule for this channel.</p>
  {!channelID?<p>Save the channel first, then add its program guide.</p>:<>
   {source&&<div className="channel-guide-status"><strong>{coverage&&new Date(coverage)>new Date()?`Schedule through ${new Date(coverage).toLocaleString()}`:'Schedule needs updating'}</strong><span>{source.source_url?'URL feed · automatic refresh':'Uploaded file · manual updates'}{source.refresh_error?' · Last refresh failed':''}</span></div>}
   <label>XMLTV link<div className="channel-guide-url"><input type="url" value={url} disabled={busy} onChange={e=>{setUrl(e.target.value);setParsed(null);setFileName('');}} placeholder="https://provider.com/guide.xml"/><button type="button" disabled={busy||!url.trim()} onClick={()=>load()}>Load guide</button></div></label>
   <label className="channel-guide-upload">Or upload an XMLTV file<input type="file" accept=".xml,application/xml,text/xml" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)load(f);e.target.value='';}}/></label>
   {parsed&&<div className="channel-guide-selection"><label>Matching channel<select value={chosen} disabled={busy} onChange={e=>setChosen(e.target.value)}><option value="">Select the channel in this feed…</option>{Object.entries(parsed.channels).map(([id,name])=><option key={id} value={id}>{name} · {id}</option>)}</select></label><p>{entries.length} programs{parsed.skipped?` · ${parsed.skipped} invalid entries skipped`:''}</p>{entries.slice(0,3).map(p=><div className="channel-guide-program" key={p.start_time}><time>{new Date(p.start_time).toLocaleString()}</time><strong>{p.title}</strong></div>)}<button type="button" disabled={busy||!entries.length} onClick={save}>Save guide</button><small>Only {channelName||'this channel'} is updated. Existing schedules stay in place if saving fails.</small></div>}
   {busy&&<p role="status">Working…</p>}{error&&<p role="alert" className="channel-guide-error">{error}</p>}{notice&&<p role="status" className="channel-guide-success">{notice}</p>}
  </>}
 </section>;
}
