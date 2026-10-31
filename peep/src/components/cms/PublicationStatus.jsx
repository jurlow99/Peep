import {useEffect,useState} from 'react';
import {supabase} from '../../supabase';
import {SUPABASE_URL} from '../../lib/config';
import {resolveVODPlayback} from '../../lib/vodStorage';
import {contentReadiness,contentPlacements,discoveryGaps} from '../../lib/publicationStatus';
import Drawer from './Drawer';
import './PublicationStatus.css';

export function useSeriesInventory(shows) {
  const [inventory,setInventory]=useState(null);
  useEffect(()=>{
    let cancelled=false;setInventory(null);
    async function load(){
      if(!shows.length){setInventory([]);return;}
      const result=[];
      for(let start=0;start<shows.length;start+=100){
        const ids=shows.slice(start,start+100).map(s=>s.id);
        for(let offset=0;;offset+=1000){
          const {data,error}=await supabase.from('episodes').select('id,show_id,title,season,episode_number,url,status').in('show_id',ids).order('id').range(offset,offset+999);
          if(cancelled||error)return;
          result.push(...(data||[]));if(!data||data.length<1000)break;
        }
      }
      if(!cancelled)setInventory(result);
    }
    load().catch(()=>{if(!cancelled)setInventory(null);});return()=>{cancelled=true;};
  },[shows]);
  return inventory;
}
export default function PublicationStatus({item,type,rows=[],episodes}) {
  const [open,setOpen]=useState(false),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const status=contentReadiness(item,type,episodes),placements=contentPlacements(item,type,rows),gaps=discoveryGaps(item);
  const playable=type==='movie'?item:episodes?.filter(e=>e.url&&['approved','published'].includes(e.status)).sort((a,b)=>(a.season||1)-(b.season||1)||(a.episode_number||0)-(b.episode_number||0))[0];
  async function play(){
    setBusy(true);setError('');
    try{setPreview({url:await resolveVODPlayback(supabase,playable.url,SUPABASE_URL,3600),title:playable.title||item.title});}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <div className="publication-status">
    <div className="publication-badges"><span className={`publication-badge ${status.tone}`}>{status.label}</span><span className="publication-badge">{item.visibility_tier==='test'?'Test accounts':item.visibility_tier==='stage'?'Stage accounts':'Production catalog'}{item.is_premium?' · Subscription':''}</span>{gaps.includes('category or tags')&&<span className="publication-badge notice" title="Without a category or tags this title stays out of genre rows, search by genre and More like this">Add category or tags</span>}</div>
    <button className="publication-placement" onClick={()=>setOpen(!open)} aria-expanded={open}>{placements.length?`${placements.length} row placement${placements.length===1?'':'s'}`:'Not in a configured row'} {open?'▴':'▾'}</button>
    {open&&<div className="publication-details">
      {placements.length?<ul>{placements.map((p,i)=><li key={i}><strong>{p.page==='shorts'?'Movies':p.page==='shows'?'Series':p.page}</strong> · {p.title}{p.tier!=='production'?` · ${p.tier} row`:''}</li>)}</ul>:<p>Add this title through Curation → Screens & rows. It may still appear in browsing, search, or personalized rows.</p>}
      <p>Row eligibility follows category/tags and content type. Account access and row visibility still apply. Asset checks do not verify stream health.</p>
      <button className="publication-preview" disabled={!playable?.url||busy} onClick={play}>{busy?'Preparing…':type==='show'?'Preview first ready episode':'Preview playback'}</button>
      {type==='show'&&episodes==null&&<p>Open Manage series to check episodes if this inventory cannot load.</p>}
      {error&&<p role="alert">{error}</p>}
    </div>}
    {preview&&<Drawer title={`Preview · ${preview.title}`} onClose={()=>setPreview(null)}><video src={preview.url} controls autoPlay playsInline style={{width:'100%',maxHeight:'65vh',background:'#000',borderRadius:12}}/><p className="publication-preview-note">Admin playback preview. Viewer access can differ by subscription and visibility settings.</p></Drawer>}
  </div>;
}
