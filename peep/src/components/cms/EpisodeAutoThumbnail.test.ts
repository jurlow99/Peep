// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import EpisodeAutoThumbnail from './EpisodeAutoThumbnail';
const mocks=vi.hoisted(()=>({resolve:vi.fn(async()=> 'https://signed.test/video.mp4'),capture:vi.fn(),upload:vi.fn(async()=>({url:'https://artwork.test/snapshot.jpg'}))}));
vi.mock('../../supabase',()=>({supabase:{}}));
vi.mock('../../lib/config',()=>({SUPABASE_URL:'https://dev.supabase.co'}));
vi.mock('../EnvBadge',()=>({IS_DEV_DB:true}));
vi.mock('../../lib/vodStorage',()=>({resolveVODPlayback:mocks.resolve}));
vi.mock('../../lib/videoThumbnail',()=>({captureVideoThumbnail:mocks.capture}));
vi.mock('../../lib/storageUtils',()=>({uploadImage:mocks.upload}));
it('regenerates an existing thumbnail from authorized video and leaves saving to the form',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();mocks.capture.mockResolvedValue(new File(['frame'],'snapshot.jpg'));
 const host=document.createElement('div');const root=createRoot(host),generated=vi.fn();
 try{
  await act(async()=>root.render(createElement(EpisodeAutoThumbnail,{url:'https://private.test/video.mp4',thumbnail:'https://artwork.test/old.jpg',onGenerated:generated})));
  expect(mocks.capture).not.toHaveBeenCalled();
  await act(async()=>host.querySelector('button')!.click());
  expect(mocks.capture).toHaveBeenCalledWith('https://signed.test/video.mp4',expect.objectContaining({signal:expect.any(AbortSignal)}));
  expect(generated).toHaveBeenCalledWith('https://artwork.test/snapshot.jpg','https://private.test/video.mp4',true);
  expect(host.textContent).toContain('Save the episode');
 }finally{await act(async()=>root.unmount());}
});
it('does not apply a snapshot after the episode URL changes',async()=>{
 vi.clearAllMocks();let finish:any;mocks.capture.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const host=document.createElement('div');const root=createRoot(host),generated=vi.fn();
 const render=(url:string)=>root.render(createElement(EpisodeAutoThumbnail,{url,thumbnail:'existing.jpg',onGenerated:generated}));
 try{
  await act(async()=>render('first.mp4'));await act(async()=>host.querySelector('button')!.click());
  await act(async()=>render('second.mp4'));await act(async()=>finish(new File(['frame'],'snapshot.jpg')));
  expect(generated).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());}
});
