import PublicationStatus from "./PublicationStatus";
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../supabase';
import {SUPABASE_URL,IS_DEV_DB} from '../../lib/config';
import {resolveVODPlayback} from '../../lib/vodStorage';
import {ImageUploader} from '../ImageUploader';
import EpisodeAutoThumbnail from './EpisodeAutoThumbnail';
import VODUploadFlow from './VODUploadFlow';
import Drawer from './Drawer';
import './SeriesWorkspace.css';

export function episodeReadiness(episode){
  if(!episode.url?.trim())return {label:'Missing video',tone:'warning'};
  if(episode.status!=='approved')return {label:episode.status==='rejected'?'Rejected':'Needs approval',tone:'warning'};
  return {label:'Ready',tone:'ready'};
}
function detailDraft(show){try{return JSON.parse(sessionStorage.getItem(`peep-series-${show.id}-details`));}catch{return null;}}
export default function SeriesWorkspace({show,onBack,onUpdated,showToast,curationRows=[]}){
  const [episodes,setEpisodes]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [season,setSeason]=useState('all'),[tab,setTab]=useState('episodes'),[uploading,setUploading]=useState(false);
  const [draft]=useState(()=>detailDraft(show));
  const [form,setForm]=useState(()=>draft||({...show})),[dirty,setDirty]=useState(!!draft),[saving,setSaving]=useState(false);
  function editForm(update){setDirty(true);setForm(update);}
  const [editing,setEditing]=useState(null),[preview,setPreview]=useState(null),[previewBusy,setPreviewBusy]=useState(null);
  const alive=useRef(true),version=useRef(0),previewVersion=useRef(0);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;version.current++;previewVersion.current++;};},[]);
  useEffect(()=>{if(!dirty)setForm({...show});},[show]);
  useEffect(()=>{if(dirty){try{sessionStorage.setItem(`peep-series-${show.id}-details`,JSON.stringify(form));}catch{}}},[form,dirty,show.id]);
  async function load(){
    const request=++version.current;setLoading(true);setError('');
    const {data,error}=await supabase.from('episodes').select('*').eq('show_id',show.id).order('season').order('episode_number');
    if(!alive.current||request!==version.current)return;
    if(error)setError(error.message);else setEpisodes(data||[]);setLoading(false);
  }
  useEffect(()=>{load();},[show.id]);
  const seasons=[...new Set(episodes.map(e=>e.season||1))].sort((a,b)=>a-b);
  const visible=season==='all'?episodes:episodes.filter(e=>String(e.season||1)===season);
  const currentSeason=season==='all'?(seasons.at(-1)||1):Number(season);
  const nextNumber=Math.max(0,...episodes.filter(e=>(e.season||1)===currentSeason).map(e=>e.episode_number||0))+1;
  async function saveDetails(){
    if(!form.title?.trim()||!form.poster?.trim()){setError('Series title and poster are required.');return;}
    setSaving(true);setError('');
    const fields=['title','description','poster','thumbnail','category','rating','year','trailer_url','is_premium','visibility_tier','tags','score'];
    const payload=Object.fromEntries(fields.map(key=>[key,['year','score'].includes(key)?(form[key]!==''&&form[key]!=null?Number(form[key]):null):form[key]??null]));
    payload.autoplay_next=form.autoplay_next !== false;
    payload.category=payload.category?.trim() || '';
    const {data,error}=await supabase.from('shows').update(payload).eq('id',show.id).select('id');
    setSaving(false);
    if(error||!data?.length){setError(error?.message||'Series was not updated.');return;}
    setDirty(false);try{sessionStorage.removeItem(`peep-series-${show.id}-details`);}catch{}
    showToast('Series details saved.');onUpdated?.();
  }
  async function saveEpisode(){
    if(!editing.title?.trim()){setError('Episode title is required.');return;}
    if(!Number.isInteger(Number(editing.season))||Number(editing.season)<1||!Number.isInteger(Number(editing.episode_number))||Number(editing.episode_number)<1){setError('Use positive whole season and episode numbers.');return;}
    if(episodes.some(e=>e.id!==editing.id&&Number(e.season)===Number(editing.season)&&Number(e.episode_number)===Number(editing.episode_number))){setError('That season and episode number is already used.');return;}
    setSaving(true);setError('');
    const fields=['title','description','url','thumbnail','duration','status','is_premium'];
    const payload={...Object.fromEntries(fields.map(key=>[key,editing[key]??(key==='is_premium'?false:'')])),season:Number(editing.season),episode_number:Number(editing.episode_number)};
    const {data,error}=await supabase.from('episodes').update(payload).eq('id',editing.id).eq('show_id',show.id).select('id');
    setSaving(false);
    if(error||!data?.length){setError(error?.message||'Episode was not updated.');return;}
    setEditing(null);showToast('Episode saved.');load();
  }
  async function play(episode){
    const request=++previewVersion.current;setPreviewBusy(episode.id);setError('');
    try{const url=await resolveVODPlayback(supabase,episode.url,SUPABASE_URL,3600);if(alive.current&&request===previewVersion.current)setPreview({url,title:episode.title});}
    catch(e){if(alive.current)setError(e.message);}
    finally{if(alive.current&&request===previewVersion.current)setPreviewBusy(null);}
  }
  function imageField(key,label,folder){return <section className="series-art-field"><h3>{label}</h3>{form[key]&&<img src={form[key]} alt={`${label} preview`} className={key==='poster'?'portrait':'landscape'}/>}<ImageUploader appearance="light" label={`Replace ${label.split(" ·")[0].toLowerCase()}`} allowUrlImport bucket={IS_DEV_DB?'promo-images':undefined} folder={IS_DEV_DB?`hero/${folder}`:folder} onUploadSuccess={url=>editForm(f=>({...f,[key]:url}))} onError={setError}/><label>Image URL<input value={form[key]||''} onChange={e=>editForm(f=>({...f,[key]:e.target.value}))}/></label></section>;}
  return <section className="series-workspace">
    <button className="series-back" onClick={onBack}>← All series</button>
    <header className="series-overview">{show.poster?<img src={show.poster} alt="Series poster"/>:<div className="series-poster-empty">No poster</div>}
      <div><span className="series-eyebrow">SERIES WORKSPACE</span><h2>{show.title}</h2><p>{[show.category,show.year].filter(Boolean).join(' · ')||'Manage this series in one place.'}</p><div className="series-stats"><span>{episodes.length} episodes</span><span>{seasons.length} seasons</span><span>{episodes.filter(e=>episodeReadiness(e).tone==='ready').length} ready</span>{!show.poster&&<span className="series-status warning">Needs poster</span>}</div></div>
      <button className="series-primary" disabled={loading} onClick={()=>{setTab('episodes');setUploading(true);}}>+ Upload episode</button>
    </header>
    <PublicationStatus item={show} type="show" rows={curationRows} episodes={loading?undefined:episodes} />
    <nav className="series-tabs" aria-label="Series workspace">{[['episodes','Episodes'],['details','Details & artwork']].map(([value,label])=><button key={value} aria-current={tab===value?'page':undefined} onClick={()=>setTab(value)}>{label}</button>)}</nav>
    {error&&<p role="alert" className="series-error">{error}</p>}
    {tab==='episodes'&&(uploading?<div className="series-upload"><button className="series-back" onClick={()=>setUploading(false)}>← Episode list</button><VODUploadFlow key={show.id} shows={[show]} showToast={showToast} initialShowID={show.id} initialSeason={currentSeason} initialEpisodeNumber={nextNumber} lockSeries draftKey={`peep-series-${show.id}-upload`} onSaved={()=>{load();onUpdated?.();}}/></div>:<>
      <div className="series-episode-toolbar"><h3>Episodes</h3><label>Season<select value={season} onChange={e=>setSeason(e.target.value)}><option value="all">All seasons</option>{seasons.map(n=><option key={n} value={n}>Season {n}</option>)}</select></label><button onClick={load} disabled={loading}>Refresh</button></div>
      {loading?<p role="status">Loading episodes…</p>:visible.length===0?<div className="series-empty"><h3>No episodes yet</h3><p>Upload your first MP4 to get started.</p><button className="series-primary" onClick={()=>setUploading(true)}>Upload episode</button></div>:<div className="series-episode-list">{visible.map(episode=>{const status=episodeReadiness(episode);return <article key={episode.id}>
        <div className="series-episode-art">{episode.thumbnail?<img src={episode.thumbnail} alt="Episode snapshot"/>:<span>No snapshot</span>}</div>
        <div className="series-episode-copy"><span className="series-eyebrow">SEASON {episode.season||1} · EPISODE {episode.episode_number||1}</span><h4>{episode.title}</h4><p>{episode.duration||'Runtime not entered'}{!episode.thumbnail?' · Needs snapshot':''}</p></div>
        <span className={`series-status ${status.tone}`}>{status.label}</span>
        <div className="series-episode-actions"><button disabled={!episode.url||previewBusy===episode.id} onClick={()=>play(episode)}>{previewBusy===episode.id?'Loading…':'▶ Preview'}</button><button onClick={()=>{setError('');setEditing({...episode});}}>Edit</button></div>
      </article>;})}</div>}
    </>)}
    {tab==='details'&&<div className="series-details"><section className="series-details-copy"><h3>Series details</h3><label>Title · required<input value={form.title||''} onChange={e=>editForm(f=>({...f,title:e.target.value}))}/></label><label>Description<textarea rows="5" value={form.description||''} onChange={e=>editForm(f=>({...f,description:e.target.value}))}/></label><div className="series-fields">{[['category','Category'],['year','Year'],['rating','Rating']].map(([key,label])=><label key={key}>{label}<input type={key==='year'?'number':'text'} value={form[key]||''} onChange={e=>editForm(f=>({...f,[key]:e.target.value}))}/></label>)}</div>
      <details><summary>More details & access</summary><label>Search & genre tags<input value={Array.isArray(form.tags)?form.tags.join(", "):form.tags||""} onChange={e=>editForm(f=>({...f,tags:e.target.value}))}/></label><label>Score %<input type="number" min="0" max="100" value={form.score??""} onChange={e=>editForm(f=>({...f,score:e.target.value}))}/></label><label>Trailer URL<input value={form.trailer_url||''} onChange={e=>editForm(f=>({...f,trailer_url:e.target.value}))}/></label><label>Visibility<select value={form.visibility_tier||'production'} onChange={e=>editForm(f=>({...f,visibility_tier:e.target.value}))}><option value="production">All eligible users</option><option value="test">Test accounts only</option></select></label><label className="series-check"><input type="checkbox" checked={!!form.is_premium} onChange={e=>editForm(f=>({...f,is_premium:e.target.checked}))}/>Requires subscription</label></details>
      <label className="series-check"><input type="checkbox" checked={form.autoplay_next !== false} onChange={e=>editForm(f=>({...f,autoplay_next:e.target.checked}))}/>Allow next-episode autoplay</label>
      <p style={{color:'#64748b',fontSize:13}}>A 10-second countdown after each episode. Viewers can turn it off in playback settings.</p>
      <button className="series-primary" disabled={saving} onClick={saveDetails}>{saving?'Saving…':'Save series changes'}</button>
    </section><aside>{imageField('poster','Poster · required','posters')}{imageField('thumbnail','Hero image · optional','series')}</aside></div>}
    {editing&&<Drawer title={`Edit episode · ${show.title}`} onClose={()=>{if(!saving){setEditing(null);setError('');}}}><div className="series-workspace series-episode-form">
      {error&&<p role="alert" className="series-error">{error}</p>}
      {['title','season','episode_number','duration','url'].map(key=><label key={key}>{({title:'Title',season:'Season',episode_number:'Episode number',duration:'Duration',url:'Video URL'})[key]}<input type={['season','episode_number'].includes(key)?'number':'text'} value={editing[key]??''} onChange={e=>setEditing(f=>({...f,[key]:e.target.value}))}/></label>)}
      <label>Description<textarea rows="4" value={editing.description||''} onChange={e=>setEditing(f=>({...f,description:e.target.value}))}/></label>
      {editing.thumbnail&&<img src={editing.thumbnail} alt="Episode snapshot preview" style={{width:'100%',borderRadius:8}}/>}
      <EpisodeAutoThumbnail url={editing.url} thumbnail={editing.thumbnail} onGenerated={(thumbnail,source,replace)=>setEditing(f=>f&&f.url===source&&(replace||!f.thumbnail)?{...f,thumbnail}:f)}/>
      <ImageUploader appearance="light" label="Upload snapshot" bucket={IS_DEV_DB?'promo-images':undefined} folder={IS_DEV_DB?'hero/episodes':'episodes'} onUploadSuccess={thumbnail=>setEditing(f=>({...f,thumbnail}))} onError={setError}/>
      <label>Status<select value={editing.status||'pending'} onChange={e=>setEditing(f=>({...f,status:e.target.value}))}><option value="pending">Pending approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
      <label className="series-check"><input type="checkbox" checked={!!editing.is_premium} onChange={e=>setEditing(f=>({...f,is_premium:e.target.checked}))}/>Requires subscription</label>
      <button className="series-primary" disabled={saving} onClick={saveEpisode}>{saving?'Saving…':'Save episode'}</button>
    </div></Drawer>}
    {preview&&<Drawer title={preview.title} onClose={()=>setPreview(null)}><video src={preview.url} controls autoPlay playsInline style={{width:'100%'}}/></Drawer>}
  </section>;
}
