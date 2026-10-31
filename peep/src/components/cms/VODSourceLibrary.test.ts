// @vitest-environment jsdom
import { act,createElement } from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import VODSourceLibrary from './VODSourceLibrary';
const mocks=vi.hoisted(()=>({upload:vi.fn(),update:vi.fn(),list:vi.fn(async()=>({data:[],error:null}))}));
vi.mock('../../lib/config',()=>({SUPABASE_URL:'https://dev.supabase.co',IS_DEV_DB:true}));
vi.mock('../../supabase',()=>({supabase:{storage:{from:()=>({list:mocks.list})},from:()=>({update:mocks.update})}}));
vi.mock('../../lib/vodUpload',()=>({createVODUpload:mocks.upload}));
it('uploads an original into its movie folder without publishing or changing playback',async()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const movie='12345678-1234-1234-1234-123456789abc';
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const toast=vi.fn();
  mocks.upload.mockImplementation(async(options:any)=>({start:()=>options.onSuccess(),abort:vi.fn()}));
  try {
    await act(async()=>root.render(createElement(VODSourceLibrary,{movies:[{id:movie,title:'Film'}],showToast:toast,logAudit:vi.fn()})));
    let select=host.querySelector('select')!;
    await act(async()=>{select.value='movies';select.dispatchEvent(new Event('change',{bubbles:true}));});
    select=host.querySelectorAll('select')[1];
    await act(async()=>{select.value=movie;select.dispatchEvent(new Event('change',{bubbles:true}));});
    const input=host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input,'files',{value:[new File(['fixture'],'film.mp4',{type:'video/mp4'})]});
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Upload privately')!.click());
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({bucket:'vod-sources',contentType:'video/mp4',path:expect.stringMatching(new RegExp(`^movies/${movie}/masters/.*-film.mp4$`))}));
    expect(mocks.update).not.toHaveBeenCalled();expect(toast).toHaveBeenCalledWith('VOD upload stored privately.');
    expect(host.textContent).toContain('No files yet');
  }finally{await act(async()=>root.unmount());host.remove();}
});
