import { Upload } from 'tus-js-client';
import { supabase } from '../supabase';
import { SUPABASE_URL } from './config';

export async function createVODUpload({file,bucket,path,contentType,onProgress,onSuccess,onError}) {
  const {data:{session},error} = await supabase.auth.getSession();
  if (error || !session) throw new Error('Sign in as an admin before uploading.');
  const origin = new URL(SUPABASE_URL);
  if (origin.hostname.endsWith('.supabase.co')) origin.hostname = origin.hostname.replace('.supabase.co','.storage.supabase.co');
  return new Upload(file,{
    endpoint:`${origin.origin}/storage/v1/upload/resumable`,
    chunkSize:6*1024*1024, retryDelays:[0,3000,5000,10000,20000],
    uploadDataDuringCreation:true, removeFingerprintOnSuccess:true,
    // XHR appends repeated headers rather than replacing them. Authorization
    // must be set only in onBeforeRequest, never also in these static headers.
    headers:{'x-upsert':'false'},
    metadata:{bucketName:bucket,objectName:path,contentType,cacheControl:'3600'},
    // Refresh the token between chunks on long uploads. Authorization stays in RLS.
    onBeforeRequest:async request => {
      const {data:{session}} = await supabase.auth.getSession();
      if (!session) throw new Error('Your session expired. Sign in again.');
      request.setHeader('authorization',`Bearer ${session.access_token}`);
    },
    onProgress:(sent,total)=>onProgress(Math.round(sent/total*100)),onSuccess,onError,
  });
}
