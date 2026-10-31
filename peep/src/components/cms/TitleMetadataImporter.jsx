import { useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { getAdminToken } from './adminAuth';
import { parseIMDbID, metadataFields } from '../../lib/titleMetadata';

export default function TitleMetadataImporter({type, onApply}) {
  const [input,setInput] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [result,setResult] = useState(null);
  const request = useRef(0);
  async function lookup() {
    const imdbID = parseIMDbID(input);
    if (!imdbID) { setError('Enter an IMDb title link or ID.'); return; }
    const version = ++request.current;
    setBusy(true); setError(''); setResult(null);
    try {
      const token = await getAdminToken();
      if (!token) throw new Error('Sign in as an admin to import details.');
      const {data,error:failure} = await supabase.functions.invoke('title-metadata', {body:{imdbID,type},headers:{Authorization:`Bearer ${token}`}});
      if (failure) {
        let message = 'Metadata import is not configured or is unavailable.';
        try { message = (await failure.context.json()).error || message; } catch {}
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      const fields = metadataFields(data?.metadata,type);
      if (!Object.keys(fields).length) throw new Error('No details available for this title.');
      if (request.current === version) setResult({fields,sourceURL:data.sourceURL});
    } catch (e) { if (request.current === version) setError(e.message); }
    finally { if (request.current === version) setBusy(false); }
  }
  return <section aria-label="Import title details" style={{padding:12,border:'1px solid #e2e8f0',borderRadius:8,background:'#f8fafc'}}>
    <label style={{display:'block',fontSize:12,color:'#475569',marginBottom:6}}>IMDb link · optional</label>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <input aria-label="IMDb link" value={input} onChange={e=>{setInput(e.target.value);setResult(null);setError('');request.current++;setBusy(false);}} placeholder="https://www.imdb.com/title/tt…" style={{flex:1,minWidth:160,padding:10,border:'1px solid #cbd5e1',borderRadius:6}} />
      <button type="button" disabled={busy || !input.trim()} onClick={lookup}>{busy?'Finding…':'Find details'}</button>
    </div>
    {error && <small role="alert" style={{display:'block',marginTop:8,color:'#b91c1c'}}>{error}</small>}
    {result && <div style={{marginTop:12,fontSize:13,color:'#334155'}}>
      <strong>{result.fields.title}</strong>
      <dl>{Object.entries(result.fields).filter(([key])=>key!=='title').map(([key,value])=><div key={key} style={{marginTop:6}}><dt style={{fontWeight:600,textTransform:'capitalize'}}>{key}</dt><dd style={{margin:0}}>{value}</dd></div>)}</dl>
      <button type="button" onClick={()=>{onApply(result.fields,false);setResult(null);}}>Fill empty fields</button>{' '}
      <button type="button" onClick={()=>{onApply(result.fields,true);setResult(null);}}>Replace matching fields</button>
      <small style={{display:'block',marginTop:8}}>Review before saving. Metadata: <a href={result.sourceURL} target="_blank" rel="noreferrer">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</small>
    </div>}
  </section>;
}
