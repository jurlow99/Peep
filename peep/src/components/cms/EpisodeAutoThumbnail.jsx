import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { SUPABASE_URL } from '../../lib/config';
import { resolveVODPlayback } from '../../lib/vodStorage';
import { captureVideoThumbnail } from '../../lib/videoThumbnail';
import { uploadImage } from '../../lib/storageUtils';
import { IS_DEV_DB } from '../EnvBadge';

export default function EpisodeAutoThumbnail({url, thumbnail, onGenerated}) {
  const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const callback=useRef(onGenerated);callback.current=onGenerated;
  const request=useRef(null);
  async function generate(replace=false){
    request.current?.abort();
    const controller=new AbortController();request.current=controller;
    setBusy(true);setStatus('Checking episode snapshots…');
    try{
      const signed=await resolveVODPlayback(supabase,url.trim(),SUPABASE_URL);
      if(controller.signal.aborted)return;
      const file=await captureVideoThumbnail(signed,{signal:controller.signal});
      if(controller.signal.aborted)return;
      const result=await uploadImage(file,IS_DEV_DB?'hero/episodes':'episodes',IS_DEV_DB?'promo-images':undefined);
      if(result.error)throw new Error(result.error);
      if(!controller.signal.aborted){callback.current(result.url,url,replace);setStatus('Snapshot selected. Save the episode to keep it.');}
    }catch(e){if(!controller.signal.aborted)setStatus('Couldn’t find a clear snapshot. Upload one manually.');}
    finally{if(request.current===controller){setBusy(false);request.current=null;}}
  }
  useEffect(()=>{
    request.current?.abort();setBusy(false);setStatus('');
    if(thumbnail||!url?.trim())return;
    const timer=setTimeout(()=>generate(),900);
    return()=>{clearTimeout(timer);request.current?.abort();};
  },[url,thumbnail]);
  useEffect(()=>()=>request.current?.abort(),[]);
  return <div style={{marginBottom:10}}>
    {url?.trim()&&<button type="button" disabled={busy} onClick={()=>generate(true)} style={{padding:'8px 12px',border:'1px solid #cbd5e1',borderRadius:6,background:'#fff',color:'#4338ca',cursor:'pointer'}}>{busy?'Finding snapshot…':thumbnail?'Regenerate from episode':'Get episode snapshot'}</button>}
    <small role="status" style={{display:'block',color:'#64748b',marginTop:6}}>{status||(!thumbnail?'Uses a real episode frame by default.':'')}</small>
  </div>;
}
