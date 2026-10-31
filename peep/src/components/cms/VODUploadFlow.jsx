import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../supabase';
import {IS_DEV_DB,SUPABASE_URL} from '../../lib/config';
import {createVODUpload} from '../../lib/vodUpload';
import {createR2VODUpload,r2VODRequest,R2_VOD_LIMIT} from '../../lib/r2VOD';
import {VOD_PLAYBACK_BUCKET,VOD_SOURCE_LIMIT,vodFilePath,resolveVODPlayback} from '../../lib/vodStorage';
import {captureVideoThumbnail,captureCurrentFrame,readVideoMetadata} from '../../lib/videoThumbnail';
import {formatBytes,formatDuration,formatTimeLeft,recordSample,uploadEstimate} from '../../lib/uploadProgress';
import {uploadImage} from '../../lib/storageUtils';
import {ImageUploader} from '../ImageUploader';
import Drawer from './Drawer';
import './VODSourceLibrary.css';

const DEFAULT_KEY='peep-vod-upload-draft-v1';
const RATINGS=['G','PG','PG-13','R','NR','TV-Y','TV-G','TV-PG','TV-14','TV-MA'];
function pendingDrafts(key){try{return JSON.parse(sessionStorage.getItem(key)) || [];}catch{return [];}}
function restore(key){try{return JSON.parse(sessionStorage.getItem(key)) || null;}catch{return null;}}
const empty=()=>({type:'episode',title:'',description:'',duration:'',year:'',category:'',tags:'',rating:'',trailer_url:'',show_id:'',series_title:'',series_description:'',series_category:'',series_year:'',season:1,episode_number:1,poster:'',thumbnail:'',is_premium:false,visibility_tier:'production'});
const cleanTags=value=>String(value||'').split(',').map(t=>t.trim()).filter(Boolean).join(', ');
const artworkFolder=name=>IS_DEV_DB?`hero/${name}`:name;
const artworkBucket=IS_DEV_DB?'promo-images':undefined;

// Upload-first: the MP4 starts uploading the moment it is chosen, the admin fills in
// the catalog details while it transfers, and Save attaches the finished file.
export default function VODUploadFlow({shows=[],categories=[],showToast,onSaved,onOpenSaved,initialShowID="",initialEpisodeNumber=1,initialSeason=1,draftKey=DEFAULT_KEY,lockSeries=false}) {
  const KEY=draftKey,PENDING_KEY=draftKey===DEFAULT_KEY?'peep-vod-pending-uploads-v1':`${draftKey}-pending`;
  const [initial]=useState(()=>restore(KEY));
  const [pending,setPending]=useState(()=>pendingDrafts(PENDING_KEY));
  const [job,setJob]=useState(null); // the chosen file while it is still transferring
  const [asset,setAsset]=useState(initial?.asset || null);
  const [details,setDetails]=useState(initial?.details?{...empty(),...initial.details}:{...empty(),show_id:String(initialShowID),episode_number:initialEpisodeNumber,season:initialSeason});
  const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[progress,setProgress]=useState(0),[paused,setPaused]=useState(false),[estimate,setEstimate]=useState(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[saved,setSaved]=useState(null),[createdShows,setCreatedShows]=useState([]);
  const [thumbnailBusy,setThumbnailBusy]=useState(false),[frameBusy,setFrameBusy]=useState(false);
  const [meta,setMeta]=useState(null),[previewURL,setPreviewURL]=useState('');
  const [playback,setPlayback]=useState(null),[playbackBusy,setPlaybackBusy]=useState(false);
  const [inventory,setInventory]=useState(null),[inventoryVersion,setInventoryVersion]=useState(0);
  const [contentProviders,setContentProviders]=useState([]),[providerID,setProviderID]=useState('');
  const [provider,setProvider]=useState('supabase'),[r2Ready,setR2Ready]=useState(false);
  const upload=useRef(null),active=useRef(true),generation=useRef(0),pendingFile=useRef(null),pendingAsset=useRef(null);
  const samples=useRef([]),previewVideo=useRef(null),previewObjectURL=useRef(''),episodeTouched=useRef(false);

  useEffect(()=>{if(!r2Ready)return;let live=true;supabase.from('creators').select('id,name').order('name').then(({data})=>{if(live)setContentProviders(data||[]);}).catch(()=>{if(live)setError("Could not load content providers. Retry before uploading provider content.");});return()=>{live=false;};},[r2Ready]);
  useEffect(()=>{let live=true;r2VODRequest('status').then(data=>{if(live&&data.configured){setR2Ready(true);setProvider('r2');}}).catch(()=>{});return()=>{live=false;};},[]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++;upload.current?.abort();if(previewObjectURL.current)URL.revokeObjectURL(previewObjectURL.current);};},[]);
  useEffect(()=>{if(asset&&!saved){try{sessionStorage.setItem(KEY,JSON.stringify({asset,details}));}catch{/* Storage may be unavailable in private browsing. */}}},[asset,details,saved]);
  // Prevent silently abandoning an in-progress upload or unsaved completed video.
  useEffect(()=>{const warn=e=>{e.preventDefault();e.returnValue='';};if(busy||asset&&!saved)window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy,asset,saved]);
  // What the chosen series already has, so numbering is suggested and duplicates are caught before Save.
  useEffect(()=>{
    if(details.type!=='episode'||!details.show_id){setInventory(null);return;}
    let live=true;const show_id=details.show_id;
    (async()=>{try{const {data}=await supabase.from('episodes').select('id,title,season,episode_number').eq('show_id',show_id).order('season').order('episode_number');if(live&&data)setInventory({show_id,episodes:data});}catch{if(live)setInventory(null);}})();
    return()=>{live=false;};
  },[details.type,details.show_id,inventoryVersion]);

  const allShows=[...shows,...createdShows.filter(s=>!shows.some(existing=>String(existing.id)===String(s.id)))];
  const selected=allShows.find(s=>String(s.id)===details.show_id);
  const isEpisode=details.type==='episode',isMovie=!isEpisode;
  const needsPoster=isMovie||!details.show_id||!selected?.poster;
  const seasonNo=Number(details.season),episodeNo=Number(details.episode_number);
  const known=inventory&&inventory.show_id===details.show_id?inventory:null;
  const seasonEpisodes=known?known.episodes.filter(e=>(e.season||1)===seasonNo):[];
  const duplicate=seasonEpisodes.find(e=>(e.episode_number||1)===episodeNo);
  const nextNumber=Math.max(0,...seasonEpisodes.map(e=>e.episode_number||0))+1;
  useEffect(()=>{if(known&&!lockSeries&&!episodeTouched.current&&Number(details.episode_number)!==nextNumber)setDetails(d=>({...d,episode_number:nextNumber}));},[known,nextNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  const working=!!(job||asset)&&!saved;
  const current=asset||job;
  const blockers=[];
  if(!asset)blockers.push(busy?'Wait for the upload to finish.':'Upload a video.');
  if(!details.title.trim())blockers.push('Add a title.');
  if(needsPoster&&!details.poster.trim())blockers.push('Add a poster.');
  if(isEpisode&&!details.show_id&&!details.series_title.trim())blockers.push('Choose a series or enter its title.');
  if(isEpisode&&(!Number.isInteger(seasonNo)||seasonNo<1||!Number.isInteger(episodeNo)||episodeNo<1))blockers.push('Season and episode must be positive whole numbers.');
  else if(duplicate)blockers.push(`Season ${seasonNo}, episode ${episodeNo} is already “${duplicate.title}”. Pick another number.`);

  function keepPending(next){setPending(next);try{sessionStorage.setItem(PENDING_KEY,JSON.stringify(next));}catch{}}
  function clearLocal(){if(previewObjectURL.current){URL.revokeObjectURL(previewObjectURL.current);previewObjectURL.current='';}setPreviewURL('');setMeta(null);setEstimate(null);samples.current=[];}
  function resetFile(){generation.current++;setJob(null);setAsset(null);setSaved(null);setError('');setNotice('');setThumbnailBusy(false);pendingAsset.current=null;pendingFile.current=null;upload.current=null;clearLocal();}
  function newUpload(){
    if(asset&&!saved)keepPending([...pending.filter(d=>d.asset.id!==asset.id),{asset,details}]);
    try{sessionStorage.removeItem(KEY);}catch{}
    resetFile();episodeTouched.current=false;
    setDetails({...empty(),type:details.type,show_id:details.show_id,season:details.season,episode_number:lockSeries?initialEpisodeNumber:1});
  }
  function resume(draft){
    keepPending(pending.filter(d=>d.asset.id!==draft.asset.id));
    resetFile();setAsset(draft.asset);setDetails({...empty(),...draft.details});episodeTouched.current=true;
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
    const next={id,path,name:file.name,size:file.size,provider:selectedProvider,providerID:retry?pendingAsset.current?.providerID:providerID};pendingAsset.current=next;
    setJob(next);setBusy(true);setProgress(0);setPaused(false);samples.current=[];setEstimate(null);
    if(!retry)setDetails(d=>({...d,title:file.name.replace(/\.mp4$/i,'').replace(/[_-]+/g,' ').trim()}));
    try{
      const options={file,id,providerID:next.providerID,bucket:VOD_PLAYBACK_BUCKET,path,contentType:'video/mp4',
        onProgress:p=>{if(!active.current)return;setProgress(p);samples.current=recordSample(samples.current,Math.round(p/100*file.size));setEstimate(uploadEstimate(samples.current,file.size));},
        onSuccess:result=>{if(active.current){setAsset({...next,path:result?.path||next.path});setJob(null);setBusy(false);upload.current=null;pendingFile.current=null;}},
        onError:e=>{if(active.current){setBusy(false);setError(e.message);}},
      };
      const task=await (selectedProvider==='r2'?createR2VODUpload(options):createVODUpload(options));
      if(!active.current){await task.abort();return;}
      upload.current=task;task.start();
    }catch(e){if(active.current){setBusy(false);setError(e.message);}}
    if(retry)return;
    // Local preview, runtime and an automatic snapshot, all from the file already in hand.
    const version=++generation.current;
    if(previewObjectURL.current)URL.revokeObjectURL(previewObjectURL.current);
    const local=URL.createObjectURL(file);previewObjectURL.current=local;setPreviewURL(local);setMeta(null);
    setThumbnailBusy(true);
    try{const info=await readVideoMetadata(local);if(active.current&&generation.current===version&&info?.duration){setMeta(info);setDetails(d=>({...d,duration:d.duration||formatDuration(info.duration)}));}}catch{/* Runtime stays editable by hand. */}
    try{
      const image=await captureVideoThumbnail(local);
      if(!active.current||generation.current!==version)return;
      const result=await uploadImage(image,artworkFolder('episodes'),artworkBucket);
      if(result.error)throw new Error(result.error);
      if(active.current&&generation.current===version)setDetails(d=>({...d,thumbnail:d.thumbnail||result.url}));
    }catch{if(active.current&&generation.current===version)setNotice('No automatic thumbnail yet. Pause the preview on a good frame and use it, or upload one.');}
    finally{if(active.current&&generation.current===version)setThumbnailBusy(false);}
  }
  async function togglePause(){if(paused){upload.current?.start();setPaused(false);}else{await upload.current?.abort();setPaused(true);}}
  async function cancelUpload(){
    const task=upload.current;upload.current=null;generation.current++;
    try{await task?.abort(true);}catch{/* Nothing to clean up if the transfer never started. */}
    if(!active.current)return;
    setBusy(false);setPaused(false);setJob(null);pendingAsset.current=null;pendingFile.current=null;setThumbnailBusy(false);setError('');setNotice('');clearLocal();
  }
  async function useFrame(){
    setFrameBusy(true);setError('');
    try{
      const image=await captureCurrentFrame(previewVideo.current);
      const result=await uploadImage(image,artworkFolder('episodes'),artworkBucket);
      if(result.error)throw new Error(result.error);
      if(active.current){setDetails(d=>({...d,thumbnail:result.url}));setNotice('');}
    }catch(e){if(active.current)setError(e.message);}
    finally{if(active.current)setFrameBusy(false);}
  }
  async function save(){
    setError('');
    if(!asset)return;
    if(blockers.length){setError(blockers[0]);return;}
    setSaving(true);
    try{
      const payload={...details,tags:cleanTags(details.tags),series_tags:cleanTags(details.series_tags),storage_provider:asset.provider||"supabase"};
      const {data,error}=await supabase.rpc('save_uploaded_vod',{p_upload_id:asset.id,p_path:asset.path,p_details:payload});
      if(error)throw error;
      if(!active.current)return;
      setSaved(data);sessionStorage.removeItem(KEY);keepPending(pending.filter(d=>d.asset.id!==asset.id));showToast?.('Video saved and attached.');
      if(data.show_id&&!details.show_id)setCreatedShows(s=>[...s,{id:data.show_id,title:details.series_title,poster:details.poster,is_premium:details.is_premium,visibility_tier:details.visibility_tier}]);
      setInventoryVersion(v=>v+1);
      onSaved?.();
    }catch(e){if(active.current)setError(e.message || 'Save failed. Your uploaded video is retained; try saving again.');}
    finally{if(active.current)setSaving(false);}
  }
  function next(){
    const previous=details;resetFile();episodeTouched.current=false;
    setDetails({...empty(),type:previous.type,show_id:saved?.show_id?String(saved.show_id):previous.show_id,season:previous.season,episode_number:Number(previous.episode_number)+1});
  }
  async function previewSaved(){
    if(!asset)return;
    setPlaybackBusy(true);setError('');
    const reference=asset.provider==='r2'?`${SUPABASE_URL}/functions/v1/r2-vod/play/${asset.id}`:`${SUPABASE_URL}/storage/v1/object/authenticated/${VOD_PLAYBACK_BUCKET}/${asset.path}`;
    try{setPlayback({url:await resolveVODPlayback(supabase,reference,SUPABASE_URL,3600),title:details.title});}
    catch(e){if(active.current)setError(e.message);}
    finally{if(active.current)setPlaybackBusy(false);}
  }

  const stage=saved?3:current?1:0;
  const sent=job?Math.round(progress/100*(job.size||0)):0;
  const seriesName=selected?.title||details.series_title;
  const visibilityLabel=details.visibility_tier==='test'?'Test accounts only':'All eligible users';
  const inherited=isEpisode&&selected?{visibility:selected.visibility_tier==='test'?'Test accounts only':'All eligible users',premium:!!selected.is_premium}:null;
  const hint=saving?'Saving…':thumbnailBusy?'Capturing thumbnail…':busy?`Uploading ${progress}% · fill in the details meanwhile`:blockers.length?`To save: ${blockers[0]}`:'Ready · Save to add it to the catalog';
  const hintTone=saving||thumbnailBusy||busy?'':blockers.length?'blocked':'ready';

  return <section className="vod-library vod-upload-first" aria-label="Add VOD">
    <header><div><span className="vod-eyebrow">CONTENT LIBRARY</span><h2>Add a video</h2><p>From finished MP4 to your catalog in one pass.</p></div><div style={{display:"flex",gap:12,alignItems:"center"}}><span className="vod-private">Protected playback</span>{asset&&!saved&&<button type="button" disabled={saving} onClick={newUpload}>+ New upload</button>}</div></header>
    <ol className="vod-steps" aria-label="Upload progress">{['Upload video','Add details','Save'].map((label,index)=><li key={label} className={index<stage?'done':index===stage?'current':''} aria-current={index===stage?'step':undefined}><span>{index<stage?'✓':index===0&&busy?'…':index+1}</span>{label}</li>)}</ol>
    {!working&&!saved&&pending.length>0&&<div className="vod-pending"><strong>Unfinished uploads</strong>{pending.map(d=><button key={d.asset.id} type="button" disabled={busy} onClick={()=>resume(d)}>Resume: {d.details.title || d.asset.name}</button>)}</div>}
    {saved?<div className="vod-complete" role="status">
      <div className="vod-success-art">{(details.thumbnail||details.poster||selected?.poster)?<img src={details.thumbnail||details.poster||selected?.poster} alt="Saved video artwork"/>:<span aria-hidden="true">▶</span>}<span className="vod-success-check" aria-hidden="true">✓</span></div>
      <div className="vod-success-copy"><span className="vod-success-label">Saved to your library</span><h3>{details.title}</h3>
      <p className="vod-success-meta">{isEpisode?`${seriesName} · Season ${details.season} · Episode ${details.episode_number}`:'Movie'}{details.duration?` · ${details.duration}`:''}</p>
      <ul className="vod-success-list">
        <li className="ok">Video attached · {asset?.provider==='r2'?'private R2':'private storage'}</li>
        <li className={details.poster||selected?.poster?'ok':''}>{details.poster||selected?.poster?'Poster set':'No poster'}</li>
        <li className={details.thumbnail?'ok':'muted'}>{details.thumbnail?'Thumbnail set':'No thumbnail yet · add one from the editor later'}</li>
        <li className={details.description.trim()?'ok':'muted'}>{details.description.trim()?'Description added':'No description yet'}</li>
        <li className="ok">{inherited?`${inherited.visibility} · ${inherited.premium||details.is_premium?'Subscription required':'Free'}`:`${visibilityLabel} · ${details.is_premium?'Subscription required':'Free'}`}</li>
        {isEpisode&&<li className="ok">Approved · plays right away</li>}
      </ul>
      <p>{isMovie?'It shows under Movies now. Add it to a row in Curation to feature it.':'It shows in the series now. Add the series to a row in Curation to feature it.'}</p>
      <div className="vod-success-actions">
        <button type="button" onClick={next}>{isEpisode?'Add next episode':'Add another video'} <span aria-hidden="true">→</span></button>
        <button type="button" className="vod-secondary" disabled={playbackBusy} onClick={previewSaved}>{playbackBusy?'Preparing…':'▶ Preview playback'}</button>
        {onOpenSaved&&<button type="button" className="vod-secondary" onClick={()=>onOpenSaved(saved)}>{isEpisode?'Open series':'Open Movies'}</button>}
      </div></div>
    </div>:working?<>
      <div className={`vod-upload-card${asset?' done':''}`}>
        <div className="vod-upload-card-main">
          <div className="vod-file-icon" aria-hidden="true">{asset?'✓':'↑'}</div>
          <div className="vod-file-info">
            <strong>{current.name}</strong>
            <span className="vod-file-meta">{[formatBytes(current.size),meta&&`${meta.width}×${meta.height}`,meta&&formatDuration(meta.duration),current.provider==='r2'?'Private R2':'Private storage'].filter(Boolean).join(' · ')}</span>
            {asset&&<span className="vod-file-state">✓ Uploaded privately · ready to save</span>}
            {busy&&<div className="vod-progress" role="status"><progress max="100" value={progress}/><div className="vod-progress-row"><span>{progress}% · {formatBytes(sent)} of {formatBytes(job.size)}{paused?' · paused':estimate?` · ${formatTimeLeft(estimate.secondsLeft)}`:''}</span><span className="vod-actions"><button type="button" onClick={togglePause}>{paused?'Resume':'Pause'}</button><button type="button" onClick={cancelUpload}>Cancel upload</button></span></div></div>}
            {!busy&&!asset&&error&&pendingFile.current&&<div className="vod-progress-row"><span>The upload did not finish.</span><span className="vod-actions"><button type="button" onClick={()=>startFile(pendingFile.current,true)}>Retry upload</button><button type="button" onClick={cancelUpload}>Cancel</button></span></div>}
          </div>
        </div>
        {previewURL&&<div className="vod-preview"><video ref={previewVideo} src={previewURL} controls muted playsInline preload="metadata" aria-label="Preview of the chosen video"/><div className="vod-preview-actions"><button type="button" disabled={frameBusy} onClick={useFrame}>{frameBusy?'Saving frame…':'Use this frame as thumbnail'}</button><small>Pause the preview on a frame you like, then use it as the thumbnail. The automatic snapshot is picked for you otherwise.</small></div></div>}
      </div>
      <fieldset disabled={saving} className="vod-upload"><legend>2. Add details</legend>
        <div className="vod-tabs">{(lockSeries?['episode']:['movie','episode']).map(type=><button key={type} type="button" aria-pressed={details.type===type} onClick={()=>field('type',type)}>{type==='movie'?'Movie':'Episode'}</button>)}</div>
        {isEpisode&&<div className="vod-fields" style={{marginTop:16}}>
          <label>Series<select disabled={lockSeries} value={details.show_id} onChange={e=>{episodeTouched.current=false;field('show_id',e.target.value);}}>{!lockSeries&&<option value="">Create a new series</option>}{allShows.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
          {!details.show_id&&<label>Series title · required<input value={details.series_title} onChange={e=>field('series_title',e.target.value)}/></label>}
          <label>Season<input type="number" min="1" step="1" value={details.season} onChange={e=>field('season',e.target.value)}/></label>
          <label>Episode number<input type="number" min="1" step="1" value={details.episode_number} onChange={e=>{episodeTouched.current=true;field('episode_number',e.target.value);}}/></label>
        </div>}
        {isEpisode&&known&&<p className={`vod-series-hint${duplicate?' warning':''}`} role={duplicate?'alert':undefined}>{duplicate?`Season ${seasonNo}, episode ${episodeNo} is already “${duplicate.title}”. Pick another number.`:seasonEpisodes.length?`${selected?.title} · Season ${seasonNo} has ${seasonEpisodes.length} episode${seasonEpisodes.length===1?'':'s'} · this will be episode ${episodeNo}`:`${selected?.title} · Season ${seasonNo} has no episodes yet · this will be the first`}</p>}
        {isEpisode&&!details.show_id&&!lockSeries&&<details className="vod-subsection"><summary>New series details · optional</summary><div className="vod-fields">
          <label>Series description<textarea rows="2" value={details.series_description} onChange={e=>field('series_description',e.target.value)}/></label>
          <label>Series category<input list="vod-categories" value={details.series_category} onChange={e=>field('series_category',e.target.value)}/></label>
          <label>Series year<input type="number" value={details.series_year} onChange={e=>field('series_year',e.target.value)}/></label>
          <label>Series rating<input list="vod-ratings" value={details.series_rating||''} onChange={e=>field('series_rating',e.target.value)}/></label>
          <label>Series tags · comma separated<input value={details.series_tags||''} onChange={e=>field('series_tags',e.target.value)} placeholder="Comedy, Family"/></label>
        </div></details>}
        <div className="vod-fields" style={{marginTop:16}}>
          <label>Title · required<input value={details.title} onChange={e=>field('title',e.target.value)}/></label>
          <label>Runtime{meta&&details.duration?<small className="vod-muted">Read from the file</small>:null}<input value={details.duration} onChange={e=>field('duration',e.target.value)} placeholder="24 min"/></label>
          {isMovie&&<><label>Year<input type="number" value={details.year} onChange={e=>field('year',e.target.value)}/></label>
          <label>Category<input list="vod-categories" value={details.category} onChange={e=>field('category',e.target.value)} placeholder="Comedy"/></label>
          <label>Rating<input list="vod-ratings" value={details.rating} onChange={e=>field('rating',e.target.value)} placeholder="PG-13"/></label>
          <label>Trailer URL<input value={details.trailer_url} onChange={e=>field('trailer_url',e.target.value)} placeholder="https://…"/></label></>}
        </div>
        {isMovie&&<label style={{marginTop:16}}>Tags · comma separated<input value={details.tags} onChange={e=>field('tags',e.target.value)} placeholder="Comedy, Family"/></label>}
        <datalist id="vod-categories">{categories.map(c=><option key={c} value={c}/>)}</datalist>
        <datalist id="vod-ratings">{RATINGS.map(r=><option key={r} value={r}/>)}</datalist>
        <label style={{marginTop:16}}>Description<textarea rows="3" value={details.description} onChange={e=>field('description',e.target.value)}/></label>
        {needsPoster?<div style={{marginTop:20}}><label>{isEpisode?'Series poster':'Poster'} · required</label><p className="vod-muted" style={{margin:'4px 0 10px'}}>1200 × 1800 preferred · Portrait 2:3 · JPG/WebP · No borders or padding</p><ImageUploader appearance="light" label="Upload poster" allowUrlImport folder={artworkFolder('posters')} bucket={artworkBucket} onUploadSuccess={url=>field('poster',url)} onError={setError}/>{details.poster&&<img src={details.poster} alt="Poster preview" style={{width:100,aspectRatio:'2/3',objectFit:'contain',marginTop:8}}/>}</div>:<p className="vod-inherit">✓ Using {selected?.title}’s poster and access settings.</p>}
        <div className="vod-media-access">
          <section><h4>Thumbnail</h4>
            {thumbnailBusy?<p role="status" className="vod-muted">Capturing thumbnail…</p>:notice?<p className="vod-muted">{notice}</p>:null}
            {details.thumbnail?<img src={details.thumbnail} alt="Video thumbnail"/>:!thumbnailBusy&&<div className="vod-thumb-empty">No thumbnail yet</div>}
            <ImageUploader appearance="light" label="Choose a different thumbnail" folder={artworkFolder('episodes')} bucket={artworkBucket} onUploadSuccess={url=>field('thumbnail',url)} onError={setError}/>
          </section>
          <section><h4>Access</h4>
            {inherited?<p className="vod-muted">Follows {selected.title}: {inherited.visibility} · {inherited.premium?'Subscription required':'Free'}</p>:<label>Visibility<select value={details.visibility_tier} onChange={e=>field('visibility_tier',e.target.value)}><option value="production">All eligible users</option><option value="test">Test accounts only</option></select></label>}
            <label className="vod-check"><input type="checkbox" checked={details.is_premium} onChange={e=>field('is_premium',e.target.checked)}/><span>Requires subscription{inherited?' for this episode':''}<small>{inherited?'The series’ own access settings still apply on top of this.':'Viewers need an active subscription to play it. Leave off for free content.'}</small></span></label>
          </section>
        </div>
      </fieldset>
      <div className="vod-save-bar"><span className={`vod-hint ${hintTone}`}>{hint}</span><button className="vod-save" type="button" disabled={saving||thumbnailBusy||!asset} onClick={save}>{saving?'Saving…':'3. Save '+(isMovie?'movie':'episode')}</button></div>
    </>:<div className="vod-upload-start">
      {provider==='r2'&&<label className="vod-provider-field">Content provider<select value={providerID} disabled={busy} onChange={e=>setProviderID(e.target.value)}><option value="">Peep · managed uploads</option>{contentProviders.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><small>Who supplied this video? Leave Peep selected for your own uploads.</small></label>}
      <div className="vod-file-picker"><span className="vod-upload-symbol" aria-hidden="true">↑</span><label>1. Upload your video<input aria-label="Upload VOD MP4" type="file" accept=".mp4,video/mp4" disabled={busy} onChange={e=>startFile(e.target.files?.[0])}/></label>
      <small>Finished MP4 (H.264 + AAC) · {provider==='r2'?'up to 10 GiB with private R2':'up to 50 MiB with Supabase Free'} · the upload starts straight away and you add details while it runs</small></div>
      <details><summary>Video storage</summary><label>Upload to<select value={provider} disabled={busy} onChange={e=>setProvider(e.target.value)}><option value="supabase">Supabase</option><option value="r2" disabled={!r2Ready}>Cloudflare R2{r2Ready?'':' · setup required'}</option></select></label>{!r2Ready&&<small>R2 is not connected yet. Existing Supabase uploads still work.</small>}</details>
    </div>}
    {error&&<p role="alert" className="vod-error">{error}</p>}
    {playback&&<Drawer title={`Preview · ${playback.title}`} onClose={()=>setPlayback(null)}><video src={playback.url} controls autoPlay playsInline style={{width:'100%',maxHeight:'65vh',background:'#000',borderRadius:12}}/><p className="vod-muted" style={{marginTop:10}}>Admin playback preview. Viewer access can differ by subscription and visibility settings.</p></Drawer>}
  </section>;
}
