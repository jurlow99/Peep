// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import HeroVideoPicker from './HeroVideoPicker';
const fixture=vi.hoisted(()=>({list:vi.fn(),sign:vi.fn(),upload:vi.fn()}));
vi.mock('../../supabase',()=>({supabase:{storage:{from:()=>({list:fixture.list,createSignedUrl:fixture.sign})}}}));
vi.mock('../../lib/config',()=>({SUPABASE_URL:'https://dev.supabase.co'}));
vi.mock('../../lib/vodUpload',()=>({createVODUpload:fixture.upload}));
it('offers only MP4 trailers, selects a durable reference, previews privately and removes the draft video',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const group='12345678-1234-1234-1234-123456789abc',path=`inbox/${group}/trailers/clip.mp4`;
 fixture.list.mockImplementation(async(folder:string)=>({data:folder===''?[{name:'inbox',id:null}]:folder==='inbox'?[{name:group,id:null}]:folder===`inbox/${group}`?[{name:'trailers',id:null},{name:'masters',id:null}]:folder.endsWith('/masters')?[{id:'master',name:'private.mp4'}]:[{id:'trailer',name:'clip.mp4'},{id:'mov',name:'source.mov'}],error:null}));
 fixture.sign.mockResolvedValue({data:{signedUrl:'https://dev.supabase.co/preview?token=temporary'},error:null});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let value='';
 const render=()=>root.render(createElement(HeroVideoPicker,{value,onChange:(url:string)=>{value=url;render();},onBusyChange:vi.fn()}));
 try{
  await act(async()=>render());const select=host.querySelector('select')!;
  expect(select.options).toHaveLength(2);expect(select.textContent).not.toContain('private.mp4');
  await act(async()=>{select.value=path;select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(value).toBe(`https://dev.supabase.co/storage/v1/object/authenticated/vod-sources/${path}`);
  expect(value).not.toContain('token');expect(host.querySelector('video')?.src).toContain('token=temporary');
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Remove video from hero')!.click());
  expect(value).toBe('');expect(host.querySelector('video')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('uploads a private MP4 and selects it without saving the Home hero automatically',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 fixture.list.mockResolvedValue({data:[],error:null});fixture.sign.mockResolvedValue({data:{signedUrl:'https://dev.supabase.co/preview?token=test'},error:null});
 fixture.upload.mockImplementation(async(options:any)=>({start:()=>options.onSuccess(),abort:vi.fn()}));
 const onChange=vi.fn(),busy=vi.fn(),host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(HeroVideoPicker,{value:'',onChange,onBusyChange:busy})));
  const input=host.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(input,'files',{value:[new File(['video'],'hero.MP4',{type:'video/mp4'})]});
  await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Upload video')!.click());
  expect(fixture.upload).toHaveBeenCalledWith(expect.objectContaining({bucket:'vod-sources',path:expect.stringMatching(/^inbox\/[a-f0-9-]+\/trailers\/.*-hero.mp4$/)}));
  expect(onChange).toHaveBeenCalledWith(expect.stringContaining('/object/authenticated/vod-sources/inbox/'));
  expect(busy).toHaveBeenLastCalledWith(false);
 }finally{await act(async()=>root.unmount());host.remove();}
});
