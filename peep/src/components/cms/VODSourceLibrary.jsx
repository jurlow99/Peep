import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { SUPABASE_URL, IS_DEV_DB } from '../../lib/config';
import { VOD_SOURCE_BUCKET, VOD_PLAYBACK_BUCKET, VOD_SOURCE_LIMIT, VOD_ROLES, vodFolder, vodFilePath, vodFileType, listVODSources } from '../../lib/vodStorage';
import { createVODUpload } from '../../lib/vodUpload';
import './VODSourceLibrary.css';

export default function VODSourceLibrary({movies=[],shows=[],showToast,logAudit}) {
  const [bucket,setBucket]=useState(VOD_SOURCE_BUCKET);
  const [selection,setSelection]=useState({type:'inbox',id:crypto.randomUUID(),episodeID:'',role:'masters'});
  const [episodes,setEpisodes]=useState([]);
  const [files,setFiles]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[paused,setPaused]=useState(false);
  const [file,setFile]=useState(null),[search,setSearch]=useState(''),[links,setLinks]=useState({});
  const uploadRef=useRef(null),mounted=useRef(true),loadVersion=useRef(0);
  const playback=bucket===VOD_PLAYBACK_BUCKET;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;uploadRef.current?.abort();};},[]);
  useEffect(()=>{
    let active=true;setEpisodes([]);
    if(selection.type==='series' && selection.id) supabase.from('episodes').select('id,title,season,episode_number').eq('show_id',selection.id).order('season').order('episode_number').then(({data,error})=>{if(active){setEpisodes(data||[]);if(error)setError(error.message);}});
    return()=>{active=false;};
  },[selection.type,selection.id]);
  async function load() {
    const version=++loadVersion.current;setLoading(true);setError('');setLinks({});
    try { const next=await listVODSources(supabase.storage,'',bucket);if(mounted.current && version===loadVersion.current)setFiles(next); }
    catch(e){if(mounted.current && version===loadVersion.current){setFiles([]);setError(e.message);}}
    finally{if(mounted.current && version===loadVersion.current)setLoading(false);}
  }
  useEffect(()=>{load();},[bucket]);
  function chooseType(type) {setSelection({type,id:type==='inbox'?crypto.randomUUID():'',episodeID:'',role:'masters'});setFile(null);}
  let folder='Choose a title';
  try {folder=vodFolder(selection);if(playback)folder=folder.replace(/\/masters$/,'/playback');} catch { /* Incomplete draft. */ }
  async function upload() {
    setError('');
    try {
      if(!file)throw new Error('Choose a file.');
      if(file.size>VOD_SOURCE_LIMIT)throw new Error('The FARRIS dev upload limit is 50 MiB. Larger VOD files require a higher Supabase plan/global limit and updated bucket limits.');
      if(playback && (selection.type==='inbox'||!file.name.toLowerCase().endsWith('.mp4')))throw new Error('Playback needs an existing movie or episode and an MP4 file.');
      let path=vodFilePath(selection,file.name);
      if(playback)path=path.replace('/masters/','/playback/');
      const contentType=vodFileType(file.name,selection.role);
      setBusy(true);setProgress(0);setPaused(false);
      const request=await createVODUpload({file,bucket,path,contentType,
        onProgress:p=>{if(mounted.current)setProgress(p);},
        onSuccess:()=>{if(!mounted.current)return;setBusy(false);setFile(null);uploadRef.current=null;showToast('VOD upload stored privately.');logAudit?.('upload','vod_asset',path,{bucket});load();},
        onError:e=>{if(!mounted.current)return;setBusy(false);setError(e.message);uploadRef.current=null;},
      });
      if(!mounted.current){request.abort();return;}uploadRef.current=request;request.start();
    } catch(e){setBusy(false);setError(e.message);}
  }
  async function preview(item) {
    setError('');
    const {data,error}=await supabase.storage.from(bucket).createSignedUrl(item.path,300);
    if(error){setError(error.message);return;}
    setLinks(current=>({...current,[item.path]:data.signedUrl}));
  }
  async function useForPlayback(item) {
    const match=item.path.match(/^(?:movies\/([a-f0-9-]{36})|series\/\d+\/episodes\/(\d+))\/playback\/[^/]+\.mp4$/i);
    if(!match){setError('This file is not in a supported movie/episode playback folder.');return;}
    const table=match[1]?'videos':'episodes',id=match[1]||match[2];
    const url=`${SUPABASE_URL}/storage/v1/object/authenticated/${VOD_PLAYBACK_BUCKET}/${item.path}`;
    if(!window.confirm('Use this file for this title’s playback? This replaces its current playback link.'))return;
    const {data,error}=await supabase.from(table).update({url}).eq('id',id).select('id');
    if(error||!data?.length){setError(error?.message||'The title could not be updated.');return;}
    showToast('Protected playback linked to the title.');logAudit?.('update',table,id,'Linked protected VOD playback');
  }
  const visible=files.filter(item=>item.path.toLowerCase().includes(search.toLowerCase()));
  return <section className="vod-library" aria-label="VOD media library">
    <header><div><h2>VOD media library</h2><p>Private originals and protected playback, organized by title.</p></div><span className="vod-private">Private · admin uploads</span></header>
    {!IS_DEV_DB && <p className="vod-notice">This storage setup was applied to FARRIS dev. Deploy its bucket policies before using it in another environment.</p>}
    <div className="vod-tabs">{[[VOD_SOURCE_BUCKET,'Originals & supporting files'],[VOD_PLAYBACK_BUCKET,'Finished playback']].map(([id,label])=><button key={id} type="button" aria-pressed={bucket===id} disabled={busy} onClick={()=>{setFiles([]);setBucket(id);setSelection(s=>({...s,type:'movies',id:'',episodeID:'',role:'masters'}));setFile(null);}}>{label}</button>)}</div>
    <p className="vod-notice">{playback?'Required for protected VOD playback: create the movie or episode first, upload its playback-ready H.264/AAC MP4 here, then click Use for playback. Uploading alone does not attach the video. Viewers must sign in and pass the catalog’s access rules to obtain a temporary playback URL.':'Optional archive: masters and supporting files are not required to publish VOD. You can upload finished MP4s directly in Finished playback. Uploading a source does not attach trailers or captions to the viewer experience or publish artwork.'}</p>
    <fieldset disabled={busy} className="vod-upload"><legend>Upload {playback?'finished video':'source asset'}</legend>
      <div className="vod-fields">
        <label>Collection<select value={selection.type} onChange={e=>chooseType(e.target.value)}>{!playback&&<option value="inbox">Inbox · not linked yet</option>}<option value="movies">Movies</option><option value="series">Series</option></select></label>
        {selection.type!=='inbox'&&<label>Title<select value={selection.id} onChange={e=>setSelection(s=>({...s,id:e.target.value,episodeID:''}))}><option value="">Choose a title…</option>{(selection.type==='movies'?movies:shows).map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
        {selection.type==='series'&&<label>Episode<select value={selection.episodeID} onChange={e=>setSelection(s=>({...s,episodeID:e.target.value}))}><option value="">{playback?'Choose an episode…':'Series-level asset'}</option>{episodes.map(item=><option key={item.id} value={item.id}>S{item.season} E{item.episode_number} · {item.title}</option>)}</select></label>}
        {!playback&&<label>Asset type<select value={selection.role} onChange={e=>setSelection(s=>({...s,role:e.target.value}))}>{VOD_ROLES.map(role=><option key={role} value={role}>{role}</option>)}</select></label>}
      </div>
      <p className="vod-path">{bucket}/{folder}/</p>
      <input aria-label="VOD file" type="file" accept={playback?'.mp4':selection.role==='artwork'?'.jpg,.jpeg,.png,.webp':selection.role==='captions'?'.vtt,.srt':'.mp4,.mov,.webm,.mkv'} onChange={e=>setFile(e.target.files?.[0]||null)} />
      <button type="button" onClick={upload} disabled={!file}>Upload privately</button>
      <small>50 MiB dev upload limit (Supabase Free). Larger files require a plan/global-limit and bucket-limit change. Large uploads use 6 MiB chunks with network retries. Keep this page open until complete.</small>
    </fieldset>
    {busy&&<div className="vod-progress"><progress max={100} value={progress}/><span>{progress}% {paused?'· paused':''}</span><button type="button" onClick={async()=>{if(!uploadRef.current)return;if(paused){uploadRef.current?.start();setPaused(false);}else{await uploadRef.current?.abort();setPaused(true);}}}>{paused?'Resume':'Pause'}</button></div>}
    {error&&<p role="alert" className="vod-error">{error}</p>}
    <div className="vod-list-header"><label>Find files<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search a title ID, folder or filename"/></label><button type="button" disabled={busy||loading} onClick={load}>Refresh files</button></div>
    {loading?<p role="status">Loading private files…</p>:visible.length===0?<p className="vod-empty">{search?'No matching files.':'No files yet. Your title folders appear automatically after the first upload.'}</p>:<div className="vod-file-list">{visible.map(item=><article key={item.path}><div><strong>{item.name}</strong><code>{item.path}</code><small>{((item.metadata?.size||0)/1024/1024).toFixed(1)} MiB</small></div><div className="vod-actions">{links[item.path]?<a href={links[item.path]} target="_blank" rel="noreferrer">Open preview · expires in 5 min</a>:<button type="button" onClick={()=>preview(item)}>Get private preview</button>}{playback&&<button type="button" disabled={busy} onClick={()=>useForPlayback(item)}>Use for playback</button>}</div></article>)}</div>}
  </section>;
}
