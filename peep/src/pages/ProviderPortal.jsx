import {useEffect,useState} from 'react';
import {supabase} from '../supabase';
import ProviderDeliveries from '../components/cms/ProviderDeliveries';
import {EmailVerificationGate} from '../components/auth/AuthGates';
import {SigninPage} from './AuthPages';

export default function ProviderPortal(){
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let active=true,eventSeen=false;
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
   eventSeen=true;if(active){setUser(session?.user||null);setLoading(false);setError('');}
  });
  supabase.auth.getSession().then(({data,error})=>{if(active&&!eventSeen){if(error)setError(error.message);setUser(data.session?.user||null);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});
  return()=>{active=false;subscription.unsubscribe();};
 },[]);
 if(loading)return <div role="status" style={{padding:48,color:'white'}}>Opening provider deliveries…</div>;
 if(error)return <div role="alert" style={{padding:48,color:'white'}}>Could not open your session: {error} <button onClick={()=>window.location.reload()}>Retry</button></div>;
 if(!user)return <SigninPage redirectTo="/deliveries" />;
 if(!user.email_confirmed_at)return <EmailVerificationGate user={user}/>;
 return <div className="provider-portal"><ProviderDeliveries key={user.id} signedInEmail={user.email} onSignOut={()=>supabase.auth.signOut({ scope: 'local' })}/></div>;
}
