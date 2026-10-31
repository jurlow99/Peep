import {handleCors,jsonResponse,errorResponse} from '../_shared/cors.ts';
import {getServiceClient,requireUser} from '../_shared/supabase.ts';
Deno.serve(async req=>{
 const cors=handleCors(req);if(cors)return cors;
 if(req.method!=='POST')return errorResponse('Use POST.',405);
 const client=getServiceClient();let user;
 try{user=await requireUser(req,client);}catch{return errorResponse('Sign in again to manage your account.',401);}
 let verifiedToken: string|undefined;
 try{
  const body=await req.json();
  if(body.user_id||body.confirmation!=='DELETE MY ACCOUNT'||typeof body.password!=='string'||!body.password||body.password.length>4096)return errorResponse('Enter your password and type DELETE MY ACCOUNT.');
  // Verify ownership again with a fresh password grant; never trust a supplied ID.
  const verify=await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:body.password})});
  const verified=await verify.json();
  if(!verify.ok||verified.user?.id!==user.id)return errorResponse('Password verification failed.',403);
  verifiedToken=verified.access_token;
  const {data:profile,error:profileError}=await client.from('profiles').select('role,is_admin').eq('id',user.id).single();
  if(profileError)throw profileError;
  if(profile.is_admin||profile.role==='admin')return errorResponse('Administrator accounts must be managed through admin support.',409);
  const {data:sub,error:subError}=await client.from('subscriptions').select('status,stripe_subscription_id').eq('user_id',user.id).maybeSingle();
  if(subError)throw subError;
  if(sub?.stripe_subscription_id&&!['canceled','cancelled','inactive','expired'].includes(sub.status))return errorResponse('Cancel your paid subscription before deleting your account so billing does not continue.',409);
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const {error:signOutError}=await client.auth.admin.signOut(token,'global');
  if(signOutError)throw signOutError;
  // Let database FK cascades delete profile-owned records atomically. Do not
  // partially delete profile data before Auth deletion succeeds.
  const {error}=await client.auth.admin.deleteUser(user.id);
  if(error)return errorResponse('Account deletion could not finish. Your account has not been confirmed deleted. Sign in again or contact privacy@watchpeep.tv.',409);
  return jsonResponse({success:true});
 }catch{return errorResponse('Could not delete your account. Please try again.',500);}
 finally{if(verifiedToken)await client.auth.admin.signOut(verifiedToken,'local').catch(()=>{});}
});
