import {useEffect,useState} from 'react';
import {supabase} from '../supabase';
import {SUPABASE_URL} from '../lib/config';
import {SigninPage} from './AuthPages';
export default function DeleteAccountPage(){
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 useEffect(()=>{let active=true;supabase.auth.getUser().then(({data,error})=>{if(active){setUser(data.user);if(error&&error.status!==401)setError(error.message);setLoading(false);}}).catch(()=>{if(active){setError('Could not load your account. Reload to try again.');setLoading(false);}});return()=>{active=false;};},[]);
 async function remove(e){e.preventDefault();if(busy||confirmation!=='DELETE MY ACCOUNT'||!password)return;setBusy(true);setError('');try{
  const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Sign in again before deleting your account.');
  const response=await fetch(`${SUPABASE_URL}/functions/v1/delete-account`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({password,confirmation})});
  const data=await response.json();if(!response.ok||data.success!==true)throw new Error(data.error||'Deletion was not confirmed.');
  setDone(true);setPassword('');await supabase.auth.signOut({scope:'local'});
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 const style={padding:'14px 16px',borderRadius:10,border:'1px solid #444',background:'#171717',color:'white',width:'100%',boxSizing:'border-box'};
 if(loading)return <main style={{padding:48,color:'white'}}>Opening account management…</main>;
 if(!user&&!done&&!error)return <SigninPage redirectTo="/account/delete"/>;
 return <main style={{minHeight:'100vh',background:'#080808',color:'white',padding:'48px 24px',boxSizing:'border-box'}}><section style={{maxWidth:560,margin:'0 auto'}}>
 <a href="/" style={{color:'#facc15'}}>← Back to Peep</a><h1>{done?'Account deleted':'Delete your Peep account'}</h1>
 {done?<p>Your account deletion has been confirmed. You can close this page.</p>:<><p>Signed in as <strong>{user?.email}</strong>. Confirm that this is the account you intend to delete.</p><p>This permanently removes your sign-in, viewer profiles, saved progress and My List. It cannot be undone. Some records may be retained without your account link. Cancel paid subscriptions first; deletion is not a billing cancellation.</p>
 <form onSubmit={remove} style={{display:'grid',gap:20}}><label>Your password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} style={style}/></label><label>Type DELETE MY ACCOUNT<input autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy} style={style}/></label>{error&&<p role="alert">{error}</p>}<button disabled={busy||!user||!password||confirmation!=='DELETE MY ACCOUNT'} style={{...style,background:'#822b31',cursor:'pointer',opacity:busy||!password||confirmation!=='DELETE MY ACCOUNT'?.5:1}}>{busy?'Deleting…':'Permanently delete account'}</button></form><p>Need help? privacy@watchpeep.tv</p></>}
 </section></main>;
}
