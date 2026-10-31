import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../supabase';
import {SUPABASE_URL} from '../../lib/config';
import {createVODUpload} from '../../lib/vodUpload';
import {VOD_SOURCE_BUCKET,VOD_SOURCE_LIMIT,listVODSources,isHeroTrailer,protectedMediaReference,resolveVODPlayback,vodFilePath} from '../../lib/vodStorage';

export default function HeroVideoPicker({value,onChange,onBusyChange}) {
  const [files,setFiles]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[preview,setPreview]=useState(null);
  const request=useRef(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();};},[]);
  async function load() {
    setLoading(true);setError('');
    try{const data=await listVODSources(supabase.storage);if(mounted.current)setFiles(data.filter(item=>isHeroTrailer(item.path)));}
    catch(e){if(mounted.current)setError(e.message);}
    finally{if(mounted.current)setLoading(false);}
  }
  useEffect(()=>{load();},[]);
  useEffect(()=>{
    let active=true;setPreview(null);
    if(value)resolveVODPlayback(supabase,value,SUPABASE_URL,300).then(url=>{if(active)setPreview(url);}).catch(()=>{if(active)setError('This video could not be previewed. Choose another video or check its source.');});
    return()=>{active=false;};
  },[value]);
  function changeBusy(next){setBusy(next);onBusyChange?.(next);}
  async function upload(){
    setError('');
    try{
      if(!file||!file.name.toLowerCase().endsWith('.mp4'))throw new Error('Choose an MP4 video.');
      if(file.size>VOD_SOURCE_LIMIT)throw new Error('The current dev upload limit is 50 MiB.');
      const path=vodFilePath({type:'inbox',id:crypto.randomUUID(),role:'trailers'},file.name);
      changeBusy(true);setProgress(0);
      const next=await createVODUpload({file,bucket:VOD_SOURCE_BUCKET,path,contentType:'video/mp4',
        onProgress:value=>{if(mounted.current)setProgress(value);},
        onSuccess:()=>{if(!mounted.current)return;changeBusy(false);setFile(null);request.current=null;onChange(`${SUPABASE_URL}/storage/v1/object/authenticated/${VOD_SOURCE_BUCKET}/${path}`);load();},
        onError:e=>{if(mounted.current){changeBusy(false);setError(e.message);request.current=null;}},
      });
      if(!mounted.current){next.abort();return;}request.current=next;next.start();
    }catch(e){changeBusy(false);setError(e.message);}
  }
  let selected=null;
  try { selected=protectedMediaReference(value,SUPABASE_URL); } catch { /* The preview reports malformed references without breaking the editor. */ }
  return <section className="hero-video-picker" aria-label="Hero background video">
    <div className="hero-editor-heading"><h3>Background video</h3><span>Optional · muted loop</span></div>
    <p className="hero-editor-help">Choose a private trailer or upload an MP4. The artwork stays visible while video loads or when playback is unavailable.</p>
    <label className="hero-editor-field"><span>Choose an uploaded trailer</span><select value={selected?.bucket===VOD_SOURCE_BUCKET?selected.path:''} disabled={busy||loading} onChange={e=>onChange(e.target.value?`${SUPABASE_URL}/storage/v1/object/authenticated/${VOD_SOURCE_BUCKET}/${e.target.value}`:'')}>
      <option value="">{loading?'Loading trailers…':'No library video selected'}</option>
      {selected?.bucket===VOD_SOURCE_BUCKET&&!files.some(item=>item.path===selected.path)&&<option value={selected.path}>Current video</option>}
      {files.map(item=><option key={item.path} value={item.path}>{item.name.replace(/^[a-f0-9-]{36}-/,'')}</option>)}
    </select></label>
    <button type="button" disabled={busy||loading} onClick={load}>Refresh videos</button>
    <div className="hero-video-upload"><label><span>Upload a new MP4</span><input type="file" accept=".mp4,video/mp4" aria-label="Hero MP4 file" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button type="button" disabled={busy||!file} onClick={upload}>{busy?`Uploading ${progress}%`:'Upload video'}</button></div>
    <p className="hero-editor-help">16:9 · H.264 video / AAC audio · up to 50 MiB in dev. Uploading selects the video in this draft; Save hero changes publishes it.</p>
    {error&&<p role="alert" className="vod-error">{error}</p>}
    {preview&&<video key={preview} aria-label="Hero video preview" src={preview} controls muted playsInline preload="metadata" style={{width:'100%',aspectRatio:'16/9',background:'#0a0a0a',borderRadius:8,marginTop:12}}/>}
    {value&&<button type="button" disabled={busy} onClick={()=>{setError('');onChange('');}} style={{marginTop:12}}>Remove video from hero</button>}
  </section>;
}
