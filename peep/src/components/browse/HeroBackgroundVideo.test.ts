// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import HeroBackgroundVideo from './HeroBackgroundVideo';
const mock=vi.hoisted(()=>({sign:vi.fn()}));
vi.mock('../../supabase',()=>({supabase:{storage:{from:()=>({createSignedUrl:mock.sign})}}}));
vi.mock('../../lib/config',()=>({SUPABASE_URL:'https://dev.supabase.co'}));
it('never mounts a raw private URL, falls back for guests/denial, and uses only a signed muted loop',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;Object.defineProperty(document,'hidden',{configurable:true,value:false});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const url='https://dev.supabase.co/storage/v1/object/authenticated/vod-sources/inbox/test/trailers/clip.mp4';
 try{
  await act(async()=>root.render(createElement(HeroBackgroundVideo,{url,userID:undefined})));
  expect(host.querySelector('video')).toBeNull();expect(mock.sign).not.toHaveBeenCalled();
  mock.sign.mockResolvedValue({data:null,error:new Error('denied')});
  await act(async()=>root.render(createElement(HeroBackgroundVideo,{url,userID:'denied'})));
  expect(host.querySelector('video')).toBeNull();
  mock.sign.mockResolvedValue({data:{signedUrl:'https://dev.supabase.co/signed.mp4?token=test'},error:null});
  await act(async()=>root.render(createElement(HeroBackgroundVideo,{url,userID:'allowed'})));
  expect(host.querySelector('video')?.src).toContain('token=test');expect(host.querySelector('video')?.loop).toBe(true);
  await act(async()=>host.querySelector('video')!.dispatchEvent(new Event('error')));
  expect(host.querySelector('video')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
