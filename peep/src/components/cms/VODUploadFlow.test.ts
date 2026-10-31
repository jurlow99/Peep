// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
import VODUploadFlow from './VODUploadFlow';
const mocks=vi.hoisted(()=>({upload:vi.fn(),rpc:vi.fn(),capture:vi.fn()}));
vi.mock('../../supabase',()=>({supabase:{rpc:mocks.rpc}}));
vi.mock('../../lib/config',()=>({IS_DEV_DB:true}));
vi.mock('../../lib/vodUpload',()=>({createVODUpload:mocks.upload}));
vi.mock('../../lib/videoThumbnail',()=>({captureVideoThumbnail:mocks.capture}));
vi.mock('../../lib/storageUtils',()=>({uploadImage:vi.fn(async()=>({url:'https://artwork.test/frame.jpg'}))}));
vi.mock('../ImageUploader',()=>({ImageUploader:({label,onUploadSuccess}:any)=>createElement('button',{onClick:()=>onUploadSuccess('https://artwork.test/poster.jpg')},label)}));
beforeEach(()=>{sessionStorage.clear();vi.clearAllMocks();globalThis.IS_REACT_ACT_ENVIRONMENT=true;URL.createObjectURL=vi.fn(()=> 'blob:test');URL.revokeObjectURL=vi.fn();mocks.capture.mockResolvedValue(new File(['frame'],'frame.jpg'));mocks.upload.mockImplementation(async(o:any)=>({start:()=>o.onSuccess(),abort:vi.fn()}));});
async function setup(shows:any[]=[]){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(createElement(VODUploadFlow,{shows,showToast:vi.fn()})));return {host,cleanup:async()=>{await act(async()=>root.unmount());host.remove();}};}
async function click(host:HTMLElement,label:string){await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===label)!.click());}
async function chooseFile(host:HTMLElement,name='episode.mp4'){const input=host.querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(input,'files',{value:[new File(['video'],name,{type:'video/mp4'})]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));}
it('uploads before catalog creation, then saves an existing-series episode with its video automatically attached',async()=>{
 const {host,cleanup}=await setup([{id:4,title:'Sassy',poster:'poster.jpg'}]);
 try{
  await chooseFile(host);expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({bucket:'vod-playback',path:expect.stringMatching(/^inbox\/[a-f0-9-]+\/playback\/.+\.mp4$/)}));
  const select=host.querySelector('select')!;await act(async()=>{select.value='4';select.dispatchEvent(new Event('change',{bubbles:true}));});
  mocks.rpc.mockResolvedValue({data:{id:9,show_id:4,type:'episode'},error:null});
  await click(host,'3. Save episode');
  expect(mocks.rpc).toHaveBeenCalledWith('save_uploaded_vod',expect.objectContaining({p_path:expect.stringMatching(/^inbox\//),p_details:expect.objectContaining({show_id:'4',thumbnail:'https://artwork.test/frame.jpg'})}));
  expect(host.textContent).toContain('Saved to your library');expect(sessionStorage.getItem('peep-vod-upload-draft-v1')).toBeNull();
  await click(host,'Add next episode →');expect(host.textContent).toContain('1. Upload your video');
 }finally{await cleanup();}
});
it('requires a poster and retains the same upload identity when a save fails and is retried',async()=>{
 const {host,cleanup}=await setup();
 try{
  await chooseFile(host,'movie.mp4');await click(host,'Movie');await click(host,'3. Save movie');
  expect(host.textContent).toContain('Add a poster.');expect(mocks.rpc).not.toHaveBeenCalled();
  await click(host,'Upload poster');mocks.rpc.mockResolvedValueOnce({error:{message:'Network error'}}).mockResolvedValueOnce({data:{id:'m',type:'movie'},error:null});
  await click(host,'3. Save movie');expect(host.textContent).toContain('Network error');expect(sessionStorage.getItem('peep-vod-upload-draft-v1')).not.toBeNull();
  await click(host,'3. Save movie');expect(mocks.rpc.mock.calls[0][1].p_upload_id).toBe(mocks.rpc.mock.calls[1][1].p_upload_id);expect(mocks.upload).toHaveBeenCalledTimes(1);
 }finally{await cleanup();}
});
it('rejects unsupported files before upload',async()=>{const {host,cleanup}=await setup();try{await chooseFile(host,'movie.mov');expect(host.textContent).toContain('Choose a finished MP4');expect(mocks.upload).not.toHaveBeenCalled();}finally{await cleanup();}});
it('can start another upload without losing the unfinished episode details or uploaded video',async()=>{
 const {host,cleanup}=await setup([{id:4,title:'Sassy',poster:'poster.jpg'}]);
 try{
  await chooseFile(host,'episode-two.mp4');
  const before=JSON.parse(sessionStorage.getItem('peep-vod-upload-draft-v1')!);
  await click(host,'+ New upload');
  expect(host.querySelector('input[type="file"]')).not.toBeNull();
  expect(sessionStorage.getItem('peep-vod-upload-draft-v1')).toBeNull();
  const pending=JSON.parse(sessionStorage.getItem('peep-vod-pending-uploads-v1')!);
  expect(pending[0]).toEqual(before);
  await click(host,'Resume: episode two');
  expect(host.textContent).toContain('Uploaded privately');
  expect(host.querySelector('input[type="file"]')).toBeNull();
  expect(JSON.parse(sessionStorage.getItem('peep-vod-upload-draft-v1')!).asset.id).toBe(before.asset.id);
  expect(mocks.upload).toHaveBeenCalledTimes(1);
 }finally{await cleanup();}
});
it('keeps series workspace uploads separate from an unfinished general upload',async()=>{
 const original={asset:{id:'general',path:'inbox/general/playback/one.mp4',name:'one.mp4'},details:{type:'movie',title:'Unfinished movie'}};
 sessionStorage.setItem('peep-vod-upload-draft-v1',JSON.stringify(original));
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(VODUploadFlow,{shows:[{id:4,title:'Sassy',poster:'poster.jpg'}],initialShowID:4,initialSeason:2,initialEpisodeNumber:5,lockSeries:true,draftKey:'peep-series-4-upload',showToast:vi.fn()})));
  expect(host.querySelector('input[type="file"]')).not.toBeNull();
  await chooseFile(host);
  expect(host.querySelector('select')?.disabled).toBe(true);
  const scoped=JSON.parse(sessionStorage.getItem('peep-series-4-upload')!);
  expect(scoped.details).toMatchObject({show_id:'4',season:2,episode_number:5,type:'episode'});
  expect(JSON.parse(sessionStorage.getItem('peep-vod-upload-draft-v1')!)).toEqual(original);
 }finally{await act(async()=>root.unmount());host.remove();}
});
