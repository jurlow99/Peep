import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../supabase';
import {SUPABASE_URL} from '../../lib/config';
import {resolveVODPlayback,protectedMediaReference} from '../../lib/vodStorage';

// Decorative playback fails back to the image; no private reference reaches <video>.
export default function HeroBackgroundVideo({url,userID}) {
  const [resolved,setResolved]=useState(null),[ready,setReady]=useState(false);
  const [visible,setVisible]=useState(!document.hidden),[reduced,setReduced]=useState(false);
  const video=useRef(null);
  useEffect(()=>{
    const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const updateMotion=()=>setReduced(motion?.matches||false),updateVisibility=()=>setVisible(!document.hidden);
    updateMotion();document.addEventListener('visibilitychange',updateVisibility);motion?.addEventListener('change',updateMotion);
    return()=>{document.removeEventListener('visibilitychange',updateVisibility);motion?.removeEventListener('change',updateMotion);};
  },[]);
  useEffect(()=>{
    let active=true;setResolved(null);setReady(false);
    async function resolve(){
      if(!url||reduced||!visible||(protectedMediaReference(url,SUPABASE_URL)&&!userID))return;
      try{const playable=await resolveVODPlayback(supabase,url,SUPABASE_URL,3600);if(active){setReady(false);setResolved({source:url,userID,url:playable});}}
      catch{if(active)setResolved(null);}
    }
    resolve();const timer=setInterval(resolve,30*60*1000);
    return()=>{active=false;clearInterval(timer);};
  },[url,userID,reduced,visible]);
  useEffect(()=>()=>{video.current?.pause();},[]);
  if(!visible||reduced||resolved?.source!==url||resolved?.userID!==userID)return null;
  return <video ref={video} key={resolved.url} src={resolved.url} autoPlay muted loop playsInline aria-hidden="true"
    onPlaying={()=>setReady(true)} onError={()=>{setReady(false);setResolved(null);}}
    style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:ready?1:0,transition:'opacity 800ms ease-in-out'}}/>;
}
