import {useEffect,useRef,useState} from 'react';
import {r2VODRequest} from '../../lib/r2VOD';
import './DeliveryReview.css';

export function deliveryReviewChecks(delivery,assets){
 const d=delivery.details||{},kind=d.type||'movie';
 const required=kind==='series'?['poster']:kind==='trailer'?['trailer']:kind==='episode'?['video']:['video','poster'];
 return [
  {label:'Title',ready:!!delivery.title?.trim()},
  {label:'Rights & availability supplied',ready:!!d.rights_note?.trim()},
  ...required.map(role=>({label:role==='video'?'Finished video':role==='poster'?'Poster':'Trailer',ready:assets.some(a=>a.asset_role===role&&a.state==='ready')})),
  ...(kind==='episode'?[{label:'Series and episode numbering',ready:!!d.series_ref&&Number.isInteger(Number(d.season))&&Number(d.season)>0&&Number.isInteger(Number(d.episode_number))&&Number(d.episode_number)>0}]:[]),
 ];
}
export default function DeliveryReview({delivery,assets,catalog,deliveries,busy,note,onNote,onReview,onPublish,targetRef,onTarget}){
 const [media,setMedia]=useState(null),[previewBusy,setPreviewBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const d=delivery.details||{},kind=d.type||'movie',checks=deliveryReviewChecks(delivery,assets);
 const complete=checks.every(c=>c.ready);
 const reference=kind==='episode'?d.series_ref:targetRef;
 const parent=reference?.startsWith('delivery:')?deliveries.find(row=>`delivery:${row.id}`===reference&&row.provider_id===delivery.provider_id):null;
 const target=catalog.find(row=>row.ref===reference&&row.provider_id===delivery.provider_id);
 const destination=kind==='movie'?'Create a new movie':kind==='series'?'Create a new series':kind==='episode'?`${target?.title||parent?.title||'Unresolved series'} · Season ${d.season||'?'} · Episode ${d.episode_number||'?'}`:`Attach trailer to ${target?.title||parent?.title||'a selected title'}`;
 const destinationReady=kind==='episode'?!!reference&&!!(target||parent?.status==='published'):kind==='trailer'?!!reference&&!!(target||parent?.status==='published'):true;
 const newest=role=>[...assets].reverse().find(a=>a.asset_role===role&&a.state==='ready');
 const video=newest(kind==='trailer'?'trailer':'video'),artwork=newest('poster')||newest('hero');
 async function openPreviews(){
  setPreviewBusy(true);setError('');
  const results=await Promise.allSettled([video,artwork].map(async asset=>asset?await r2VODRequest('playback',{id:asset.id,deliveryID:delivery.id,expiresIn:900}):null));
  if(!alive.current)return;
  const urls=results.map(result=>result.status==='fulfilled'?result.value?.signedURL:null);
  setMedia({video:urls[0],artwork:urls[1]});
  if(results.some(result=>result.status==='rejected'))setError('Some previews could not load. Retry previews; approval does not verify playback automatically.');
  setPreviewBusy(false);
 }
 return <section className="delivery-review-workspace" aria-label="Delivery review">
  <div className="review-overview"><div><span className="review-eyebrow">REVIEW BEFORE PUBLISHING</span><h3>{kind==='episode'?'Episode review':kind==='series'?'Series review':kind==='trailer'?'Trailer review':'Movie review'}</h3><p>{d.description||'No description supplied.'}</p></div><span className="review-stage">{delivery.status==='approved'?'Approved · not published':'Awaiting review'}</span></div>
  <div className="review-media-grid">
   <div className="review-video">{media?.video?<video src={media.video} controls playsInline/>:<div className="review-media-empty"><strong>{video?'Watch the delivered video':'No finished video in this delivery'}</strong><p>{video?'Check picture, sound and the beginning/end.':'Series artwork is reviewed here; each episode has a separate delivery.'}</p></div>}</div>
   <div className="review-artwork">{media?.artwork?<img src={media.artwork} alt="Provider-delivered artwork"/>:<div className="review-media-empty"><strong>{artwork?'Check delivered artwork':kind==='episode'?'Uses the series poster':'No artwork supplied'}</strong><p>{kind==='episode'&&!artwork?'An episode thumbnail is optional.':'Artwork appears beside the video for review.'}</p></div>}</div>
  </div>
  <div className="review-preview-actions"><button className="secondary" disabled={busy||previewBusy||(!video&&!artwork)} onClick={openPreviews}>{previewBusy?'Loading previews…':media?'Reload previews':'Open review previews'}</button>{media&&<button className="secondary" onClick={()=>setMedia(null)}>Close previews</button>}<span>Private previews expire after 15 minutes.</span></div>
  {error&&<p className="delivery-error" role="alert">{error}</p>}
  <div className="review-info-grid"><section><h4>Submission checks</h4><ul className="review-checks">{checks.map(c=><li key={c.label}><span className={c.ready?'ready':'missing'}>{c.ready?'✓':'○'}</span>{c.label}<small>{c.ready?'Supplied':'Missing'}</small></li>)}</ul><p className="review-help">These checks confirm supplied fields and completed uploads. Your team still verifies quality and distribution rights.</p></section>
   <section><h4>Rights & availability</h4><p className="review-rights">{d.rights_note||'No rights information supplied.'}</p><div className="review-metadata">{[['Genre',d.category],['Year',d.year],['Runtime',d.duration]].filter(([,v])=>v).map(([label,value])=><span key={label}>{label}: {value}</span>)}</div></section></div>
  <section className="review-publish-plan"><h4>Publication plan</h4><strong>{destination}</strong>
   {kind==='trailer'&&<label>Attach trailer to<select value={targetRef||''} disabled={busy} onChange={e=>onTarget(e.target.value)}><option value="">Choose a movie or series…</option>{catalog.filter(c=>c.provider_id===delivery.provider_id&&['movie','series'].includes(c.type)).map(c=><option key={c.ref} value={c.ref}>{c.title}</option>)}</select></label>}
   {!destinationReady&&<p className="review-warning">{parent&&parent.status!=='published'?'Publish the parent series or movie first.':'A valid provider-owned catalog destination is required.'}</p>}
   <p>Publishing creates or updates the catalog. Existing matching rows may include it immediately. Review placement in Curation → Screens & rows.</p><p className="review-help">Current publication uses free access. Dates and territories are not enforced automatically. Published artwork becomes public; optional attachments stay in this delivery.</p>
  </section>
  <label className="review-note">Note to provider<textarea value={note} onChange={e=>onNote(e.target.value)} placeholder="Explain what needs changing, or leave an approval note." disabled={busy}/></label>
  <div className="review-actions"><button className="secondary" disabled={busy||previewBusy||!note.trim()} onClick={()=>onReview('changes_requested')}>Request changes</button><span>{!note.trim()?'A note is required when requesting changes.':''}</span>{delivery.status==='submitted'?<button disabled={busy||previewBusy||!complete} onClick={()=>onReview('approved')}>Approve delivery</button>:<button disabled={busy||previewBusy||!complete||!destinationReady} onClick={()=>{if(window.confirm(`Publish “${delivery.title}”?\n\n${destination}.\nFree access; published artwork becomes public. Existing matching rows may include this title immediately.`))onPublish();}}>Publish to catalog</button>}</div>
 </section>;
}
