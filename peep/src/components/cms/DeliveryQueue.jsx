import {useState} from 'react';
import './DeliveryQueue.css';
const labels={draft:'Draft',submitted:'In review',changes_requested:'Changes needed',approved:'Approved',published:'Published'};
export function deliveryNextStep(status,admin=false){
 const steps=admin?{
  draft:['Open draft','Provider is preparing this delivery.'],submitted:['Review delivery','Check the files, details and rights.'],changes_requested:['View requested changes','Waiting for the provider to correct and resubmit.'],approved:['Prepare publication','Approved. Publication is still a separate step.'],published:['View delivery','Published to the catalog.']
 }:{draft:['Continue draft','Finish the details and files, then send for review.'],submitted:['View status','Peep is reviewing your submission.'],changes_requested:['Make changes','Read the review note, update your delivery and resend.'],approved:['View status','Approved. Peep will handle publication.'],published:['View delivery','Published to the catalog.']};
 return steps[status]||['View delivery','Open this delivery for details.'];
}
export default function DeliveryQueue({rows,providers,admin,reviewOnly,busy,onOpen,onTrash}){
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState('');
 const providerName=d=>providers.find(p=>p.id===d.provider_id)?.name||'Provider';
 const filters=reviewOnly?['all','submitted','approved']:['all','draft','changes_requested','submitted','approved','published'];
 const visible=rows.filter(d=>(filter==='all'||d.status===filter)&&[d.title,providerName(d),d.details?.type,admin?d.submitter_email:''].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 return <section className="delivery-card delivery-queue" aria-label="Deliveries">
  <div className="delivery-section-heading"><div><h2>{admin?'Provider deliveries':'Your deliveries'}</h2><p>{admin?'Review submissions and follow each delivery through publication.':'Pick up a draft or check what happens next.'}</p></div>{onTrash&&<button className="secondary" disabled={busy} onClick={onTrash}>Trash</button>}</div>
  <div className="delivery-queue-tools"><div className="delivery-queue-filters" role="group" aria-label="Delivery status">{filters.map(status=><button className="secondary" key={status} aria-pressed={filter===status} onClick={()=>setFilter(status)}>{status==='all'?'All':labels[status]} <span>{status==='all'?rows.length:rows.filter(d=>d.status===status).length}</span></button>)}</div><label className="delivery-queue-search">Search deliveries<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Title or provider"/></label></div>
  <p className="delivery-queue-count" aria-live="polite">{visible.length} {visible.length===1?'delivery':'deliveries'}{filter!=='all'||query?' matching':''}</p>
  <div className="delivery-queue-items">{visible.map(d=>{const [action,hint]=deliveryNextStep(d.status,admin);return <button className="delivery-queue-item" key={d.id} disabled={busy} onClick={()=>onOpen(d)}>
   <div className="delivery-queue-title"><span className={`delivery-badge ${d.status}`}>{labels[d.status]||d.status}</span><strong>{d.title}</strong><small>{providerName(d)} · {d.details?.type||'movie'}{admin&&d.submitter_email?` · Submitted by ${d.submitter_email}`:''}</small></div>
   <div className="delivery-queue-next"><span>{hint}</span>{d.status==='changes_requested'&&d.review_note&&<small className="delivery-queue-note">Review note: {d.review_note}</small>}</div>
   <span className="delivery-queue-action">{action} <span aria-hidden="true">→</span></span>
  </button>;})}</div>
  {!visible.length&&<div className="delivery-empty"><strong>{rows.length?'No matching deliveries.':reviewOnly?'No submissions waiting for review.':'No deliveries yet.'}</strong><p>{rows.length?'Try a different status or search.':reviewOnly?'Submitted and approved deliveries appear here.':'Start a delivery above. Your drafts and updates will appear here.'}</p>{rows.length>0&&<button className="secondary" onClick={()=>{setQuery('');setFilter('all');}}>Clear filters</button>}</div>}
 </section>;
}
