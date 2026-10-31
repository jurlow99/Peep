import {supabase} from '../supabase';
export const R2_VOD_LIMIT=10*1024**3;
export async function r2VODRequest(action,body={}){
  const {data,error}=await supabase.functions.invoke('r2-vod',{body:{...body,action}});
  if(error){let message='R2 is unavailable. Check its setup and try again.';try{message=(await error.context.json()).error||message;}catch{}throw new Error(message);}
  if(data?.error)throw new Error(data.error);
  return data;
}
// Multipart data travels directly from the browser to private R2, never through
// Supabase's 50 MiB Storage limit or the Edge Function request body.
export async function createR2VODUpload({file,id,providerID,deliveryID,assetRole,onProgress,onSuccess,onError}){
  let upload=null,part=1,paused=true,running=false,xhr=null,completedBytes=0;
  async function send(url,blob){
    return new Promise((resolve,reject)=>{
      xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.timeout=180000;
      xhr.setRequestHeader('Content-Type','application/octet-stream');
      xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round((completedBytes+e.loaded)/file.size*100));};
      xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error('R2 part upload failed.'));
      xhr.onerror=()=>reject(new Error('R2 upload failed. Check the connection and bucket CORS.'));
      xhr.ontimeout=()=>reject(new Error('R2 upload timed out.'));
      xhr.onabort=()=>reject(new DOMException('Upload paused.','AbortError'));xhr.send(blob);
    });
  }
  async function run(){
    if(running)return;running=true;paused=false;
    try{
      if(!upload)upload=await r2VODRequest('create',{id,name:file.name,size:file.size,...(providerID?{providerID}:{}),...(deliveryID?{deliveryID,assetRole}:{})});
      if(paused)return;
      if(upload.complete){onSuccess({path:upload.path});return;}
      while(completedBytes<file.size&&!paused){
        const end=Math.min(completedBytes+upload.partSize,file.size),blob=file.slice(completedBytes,end);
        let sent=false;
        for(let attempt=0;attempt<3&&!paused;attempt++){
          try{const signed=await r2VODRequest('part',{id,part,...(deliveryID?{deliveryID}:{})});if(paused)return;await send(signed.url,blob);sent=true;break;}
          catch(e){if(paused)return;if(attempt===2)throw e;}
        }
        if(!sent||paused)return;
        completedBytes=end;part++;onProgress(Math.round(completedBytes/file.size*100));
      }
      if(paused)return;
      const result=await r2VODRequest('complete',{id,...(deliveryID?{deliveryID}:{})});
      if(!paused)onSuccess({path:result.path});
    }catch(e){if(!paused)onError(e);}
    finally{running=false;xhr=null;}
  }
  return {start:()=>{void run();},abort:async()=>{paused=true;xhr?.abort();}};
}
