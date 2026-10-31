import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../supabase';
import {IS_DEV_DB} from '../../lib/config';
import {createVODUpload} from '../../lib/vodUpload';
import {createR2VODUpload,r2VODRequest,R2_VOD_LIMIT} from '../../lib/r2VOD';
import {VOD_PLAYBACK_BUCKET,VOD_SOURCE_LIMIT,vodFilePath} from '../../lib/vodStorage';
import {captureVideoThumbnail} from '../../lib/videoThumbnail';
import {uploadImage} from '../../lib/storageUtils';
import {ImageUploader} from '../ImageUploader';
import './VODSourceLibrary.css';

const KEY='peep-vod-upload-draft-v1';
const PENDING_KEY='peep-vod-pending-uploads-v1';
function pendingDrafts(key=PENDING_KEY){try{return JSON.parse(sessionStorage.getItem(key)) || [];}catch{return [];}}
const empty=()=>({type:'episode',title:'',description:'',duration:'',year:'',category:'',show_id:'',series_title:'',season:1,episode_number:1,poster:'',thumbnail:'',is_premium:false,visibility_tier:'production'});
function restore(key=KEY){try{return JSON.parse(sessionStorage.getItem(key)) || null;}catch{return null;}}
export default function VODUploadFlow({shows=[],showToast,onSaved,initialShowID="",initialEpisodeNumber=1,initialSeason=1,draftKey="peep-vod-upload-draft-v1",lockSeries=false}) {
  const KEY=draftKey,PENDING_KEY=draftKey==="peep-vod-upload-draft-v1"?"peep-vod-pending-uploads-v1":`${draftKey}-pending`;
  const [initial]=useState(()=>restore(KEY));
  const [pending,setPending]=useState(()=>pendingDrafts(PENDING_KEY));
  const [asset,setAsset]=useState(initial?.asset || null),[details,setDetails]=useState(initial?.details || {...empty(),show_id:String(initialShowID),episode_number:initialEpisodeNumber,season:initialSeason});
  const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[progress,setProgress]=useState(0),[paused,setPaused]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[saved,setSaved]=useState(null),[createdShows,setCreatedShows]=useState([]);
  const [thumbnailBusy,setThumbnailBusy]=useState(false);
  const [contentProviders,setContentProviders]=useState([]),[providerID,setProviderID]=useState('');

  const [provider,setProvider]=useState('supabase'),[r2Ready,setR2Ready]=useState(false);
  useEffect(()=>{if(!r2Ready)return;let active=true;supabase.from('creators').select('id,name').order('name').then(({data})=>{if(active)setContentProviders(data||[]);}).catch(()=>{if(active)setError("Could not load content providers. Retry before uploading provider content.");});return()=>{active=false;};},[r2Ready]);
  useEffect(()=>{let active=true;r2VODRequest('status').then(data=>{if(active&&data.configured){setR2Ready(true);setProvider('r2');}}).catch(()=>{});return()=>{active=false;};},[]);
  const upload=useRef(null),active=useRef(true),generation=useRef(0),pendingFile=useRef(null),pendingAsset=useRef(null);
  const allShows=[...shows,...createdShows.filter(s=>!shows.some(existing=>String(existing.id)===String(s.id)))];
  const selected=allShows.find(s=>String(s.id)===details.show_id);
  const needsPoster=details.type==='movie'||!details.show_id||!selected?.poster;
  useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++;upload.current?.abort();};},[]);
  useEffect(()=>{if(asset&&!saved){try{sessionStorage.setItem(KEY,JSON.stringify({asset,details}));}catch{/* Storage may be unavailable in private browsing. */}}},[asset,details,saved]);
  // Prevent silently abandoning an in-progress upload or unsaved completed video.
  useEffect(()=>{const warn=e=>{e.preventDefault();e.returnValue='';};if(busy||asset&&!saved)window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy,asset,saved]);
  function keepPending(next){setPending(next);try{sessionStorage.setItem(PENDING_KEY,JSON.stringify(next));}catch{}}
  function newUpload(){
    if(asset&&!saved)keepPending([...pending.filter(d=>d.asset.id!==asset.id),{asset,details}]);
    try{sessionStorage.removeItem(KEY);}catch{}
    generation.current++;setAsset(null);setSaved(null);setError('');setNotice('');setThumbnailBusy(false);pendingAsset.current=null;pendingFile.current=null;
    setDetails({...empty(),type:details.type,show_id:details.show_id,season:details.season,episode_number:lockSeries?initialEpisodeNumber:1});
  }
  function resume(draft){
    keepPending(pending.filter(d=>d.asset.id!==draft.asset.id));
    setAsset(draft.asset);setDetails(draft.details);setSaved(null);setError('');setNotice('');
  }
  const field=(key,value)=>setDetails(d=>({...d,[key]:value}));
  async function startFile(file,retry=false){
    if(!file)return;
    if(!IS_DEV_DB){setError('Upload-first storage must be deployed in this environment before use.');return;}
    setError('');setNotice('');
    if(!/\.mp4$/i.test(file.name)){setError('Choose a finished MP4 video.');return;}
    const selectedProvider=retry&&pendingAsset.current?pendingAsset.current.provider:provider;
    if(file.size>(selectedProvider==='r2'?R2_VOD_LIMIT:VOD_SOURCE_LIMIT)){setError(selectedProvider==='r2'?'Choose an MP4 up to 10 GiB.':'Supabase Free supports MP4s up to 50 MiB. Configure R2 for larger videos.');return;}
    pendingFile.current=file;
    const id=retry&&pendingAsset.current?pendingAsset.current.id:crypto.randomUUID();
    const path=retry&&pendingAsset.current?pendingAsset.current.path:vodFilePath({type:'inbox',id,role:'masters'},file.name).replace('/masters/','/playback/');
    const next={id,path,name:file.name,provider:selectedProvider,providerID:retry?pendingAsset.current?.providerID:providerID};pendingAsset.current=next;
    setBusy(true);setProgress(0);setPaused(false);
    if(!retry)setDetails(d=>({...d,title:file.name.replace(/\.mp4$/i,'').replace(/[_-]+/g,' ')}));
    try{
      const options={file,id,providerID:next.providerID,bucket:VOD_PLAYBACK_BUCKET,path,contentType:'video/mp4',
        onProgress:p=>{if(active.current)setProgress(p);},
        onSuccess:result=>{if(active.current){setAsset({...next,path:result?.path||next.path});setBusy(false);upload.current=null;pendingFile.current=null;}},
        onError:e=>{if(active.current){setBusy(false);setError(e.message);}},
      };
      const task=await (selectedProvider==='r2'?createR2VODUpload(options):createVODUpload(options));
      if(!active.current){await task.abort();return;}
      upload.current=task;task.start();
    }catch(e){if(active.current){setBusy(false);setError(e.message);}}
    if(retry)return;
    const version=++generation.current;
    setThumbnailBusy(true);
    const local=URL.createObjectURL(file);
    try{
      const image=await captureVideoThumbnail(local);
      if(!active.current||generation.current!==version)return;
      const result=await uploadImage(image,IS_DEV_DB?'hero/episodes':'episodes',IS_DEV_DB?'promo-images':undefined);
      if(result.error)throw new Error(result.error);
      if(active.current&&generation.current===version)setDetails(d=>({...d,thumbnail:d.thumbnail||result.url}));
    }catch{if(active.current&&generation.current===version)setNotice('No automatic thumbnail. You can upload one below.');}
    finally{URL.revokeObjectURL(local);if(active.current&&generation.current===version)setThumbnailBusy(false);}
  }
  async function save(){
    setError('');
    if(!asset)return;
    if(!details.title.trim()){setError('Add a title.');return;}
    if(needsPoster&&!details.poster.trim()){setError('Add a poster.');return;}
    if(details.type==='episode'&&!details.show_id&&!details.series_title.trim()){setError('Choose a series or enter its title.');return;}
    if(details.type==='episode'&&(!Number.isInteger(Number(details.season))||Number(details.season)<1||!Number.isInteger(Number(details.episode_number))||Number(details.episode_number)<1)){setError('Season and episode must be positive whole numbers.');return;}
    setSaving(true);
    try{
      const {data,error}=await supabase.rpc('save_uploaded_vod',{p_upload_id:asset.id,p_path:asset.path,p_details:{...details,storage_provider:asset.provider||"supabase"}});
      if(error)throw error;
      if(!active.current)return;
      setSaved(data);sessionStorage.removeItem(KEY);keepPending(pending.filter(d=>d.asset.id!==asset.id));showToast?.('Video saved and attached.');
      if(data.show_id&&!details.show_id)setCreatedShows(s=>[...s,{id:data.show_id,title:details.series_title,poster:details.poster}]);
      onSaved?.();
    }catch(e){if(active.current)setError(e.message || 'Save failed. Your uploaded video is retained; try saving again.');}
    finally{if(active.current)setSaving(false);}
  }
  function next(){
    const previous=details;generation.current++;setAsset(null);setSaved(null);setError('');setNotice('');setThumbnailBusy(false);pendingAsset.current=null;pendingFile.current=null;
    setDetails({...empty(),type:previous.type,show_id:saved?.show_id?String(saved.show_id):previous.show_id,season:previous.season,episode_number:Number(previous.episode_number)+1});
  }
  return <section className="vod-library vod-upload-first" aria-label="Add VOD">
    <header><div><span className="vod-eyebrow">CONTENT LIBRARY</span><h2>Add a video</h2><p>From provider file to your catalog.</p></div><div style={{display:"flex",gap:12,alignItems:"center"}}><span className="vod-private">Protected playback</span>{asset&&!saved&&<button type="button" disabled={saving} onClick={newUpload}>+ New upload</button>}</div></header>
    <ol className="vod-steps" aria-label="Upload progress">{['Upload video','Add details','Save'].map((label,index)=>{const stage=saved?3:asset?1:0;return <li key={label} className={index<stage?'done':index===stage?'current':''} aria-current={index===stage?'step':undefined}><span>{index<stage?'✓':index+1}</span>{label}</li>;})}</ol>
    {!asset&&pending.length>0&&<div className="vod-pending"><strong>Unfinished uploads</strong>{pending.map(d=><button key={d.asset.id} type="button" disabled={busy} onClick={()=>resume(d)}>Resume: {d.details.title || d.asset.name}</button>)}</div>}
    {saved?<div className="vod-complete" role="status">
      <div className="vod-success-art">{(details.thumbnail||details.poster||selected?.poster)?<img src={details.thumbnail||details.poster||selected?.poster} alt="Saved video artwork"/>:<span aria-hidden="true">▶</span>}<span className="vod-success-check" aria-hidden="true">✓</span></div>
      <div className="vod-success-copy"><span className="vod-success-label">Saved to your library</span><h3>{details.title}</h3>
      <p className="vod-success-meta">{details.type==='episode'?`${selected?.title||details.series_title} · Season ${details.season} · Episode ${details.episode_number}`:'Movie'}{details.duration?` · ${details.duration}`:''}</p>
      <p>Video attached. Ready to feature in Curation.</p>
      <button type="button" onClick={next}>{details.type==='episode'?'Add next episode':'Add another video'} <span aria-hidden="true">→</span></button></div>
    </div>:<>
      {!asset&&<div className="vod-upload-start">
        {provider==='r2'&&<label className="vod-provider-field">Content provider<select value={providerID} disabled={busy} onChange={e=>setProviderID(e.target.value)}><option value="">Peep · managed uploads</option>{contentProviders.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>Who supplied this video? Leave Peep selected for your own uploads.</small></label>}
        <div className="vod-file-picker"><span className="vod-upload-symbol" aria-hidden="true">↑</span><label>1. Upload your video<input aria-label="Upload VOD MP4" type="file" accept=".mp4,video/mp4" disabled={busy} onChange={e=>startFile(e.target.files?.[0])}/></label>
        <small>Finished MP4 · {provider==='r2'?'up to 10 GiB with private R2':'up to 50 MiB with Supabase Free'}</small></div>
        <details style={{marginTop:16}}><summary>Video storage</summary><label>Upload to<select value={provider} disabled={busy} onChange={e=>setProvider(e.target.value)}><option value="supabase">Supabase</option><option value="r2" disabled={!r2Ready}>Cloudflare R2{r2Ready?'':' · setup required'}</option></select></label>{!r2Ready&&<small>R2 is not connected yet. Existing Supabase uploads still work.</small>}</details>
        {busy&&<div className="vod-progress" role="status"><progress max="100" value={progress}/><span>{progress}%{paused?' · paused':''}</span><button type="button" onClick={async()=>{if(paused){upload.current?.start();setPaused(false);}else{await upload.current?.abort();setPaused(true);}}}>{paused?'Resume':'Pause'}</button></div>}
        {!busy&&error&&pendingFile.current&&<button type="button" onClick={()=>startFile(pendingFile.current,true)}>Retry upload</button>}
      </div>}
      {asset&&<><p className="vod-file-ready">✓ {asset.name} · Uploaded privately</p>
      <fieldset disabled={saving} className="vod-upload"><legend>2. Add details</legend>
        <div className="vod-tabs">{(lockSeries?['episode']:['movie','episode']).map(type=><button key={type} type="button" aria-pressed={details.type===type} onClick={()=>field('type',type)}>{type==='movie'?'Movie':'Episode'}</button>)}</div>
        {details.type==='episode'&&<div className="vod-fields" style={{marginTop:16}}>
          <label>Series<select disabled={lockSeries} value={details.show_id} onChange={e=>field('show_id',e.target.value)}>{!lockSeries&&<option value="">Create a new series</option>}{allShows.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
          {!details.show_id&&<label>Series title · required<input value={details.series_title} onChange={e=>field('series_title',e.target.value)}/></label>}
          <label>Season<input type="number" min="1" step="1" value={details.season} onChange={e=>field('season',e.target.value)}/></label>
          <label>Episode number<input type="number" min="1" step="1" value={details.episode_number} onChange={e=>field('episode_number',e.target.value)}/></label>
        </div>}
        <div className="vod-fields" style={{marginTop:16}}><label>Title · required<input value={details.title} onChange={e=>field('title',e.target.value)}/></label><label>Duration · optional<input value={details.duration} onChange={e=>field('duration',e.target.value)} placeholder="24 min"/></label>
        {details.type==='movie'&&<><label>Year · optional<input type="number" value={details.year} onChange={e=>field('year',e.target.value)}/></label><label>Category · optional<input value={details.category} onChange={e=>field('category',e.target.value)}/></label></>}
        </div>
        <label style={{marginTop:16}}>Description · optional<textarea rows="3" value={details.description} onChange={e=>field('description',e.target.value)}/></label>
        {needsPoster?<div style={{marginTop:20}}><label>{details.type==='episode'?'Series poster':'Poster'} · required</label><p style={{color:"#64748b",fontSize:12}}>1200 × 1800 preferred · Portrait 2:3 · JPG/WebP · No borders or padding</p><ImageUploader appearance="light" label="Upload poster" allowUrlImport folder={IS_DEV_DB?'hero/posters':'posters'} bucket={IS_DEV_DB?'promo-images':undefined} onUploadSuccess={url=>field('poster',url)} onError={setError}/>{details.poster&&<img src={details.poster} alt="Poster preview" style={{width:100,aspectRatio:'2/3',objectFit:'contain',marginTop:8}}/>}</div>:<p>✓ Using {selected?.title}’s poster and access settings.</p>}
        <details style={{marginTop:20}}><summary>Thumbnail & access</summary>
          {thumbnailBusy?<p role="status">Capturing thumbnail…</p>:notice&&<p>{notice}</p>}
          {details.thumbnail&&<img src={details.thumbnail} alt="Video thumbnail" style={{width:'100%',maxWidth:320,marginTop:12}}/>}
          <ImageUploader appearance="light" label="Choose a different thumbnail" folder={IS_DEV_DB?'hero/episodes':'episodes'} bucket={IS_DEV_DB?'promo-images':undefined} onUploadSuccess={url=>field('thumbnail',url)} onError={setError}/>
          {(details.type==='movie'||!details.show_id)&&<label>Visibility<select value={details.visibility_tier} onChange={e=>field('visibility_tier',e.target.value)}><option value="production">All eligible users</option><option value="test">Test accounts only</option></select></label>}
          <label style={{display:'flex',marginTop:12}}><input type="checkbox" checked={details.is_premium} onChange={e=>field('is_premium',e.target.checked)}/> Requires subscription{details.type==='episode'&&details.show_id?' (series restrictions also apply)':''}</label>
        </details>
      </fieldset>
      <div className="vod-save-bar"><span>{thumbnailBusy?"Capturing thumbnail…":"Video uploaded · Save to finish"}</span><button className="vod-save" type="button" disabled={saving||thumbnailBusy} onClick={save}>{saving?'Saving…':'3. Save '+(details.type==='movie'?'movie':'episode')}</button></div>
      </>}
      {error&&<p role="alert" className="vod-error">{error}</p>}
    </>}
  </section>;
}
