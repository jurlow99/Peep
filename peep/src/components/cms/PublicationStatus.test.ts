// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({resolve:vi.fn(async()=> 'https://private.test/signed.mp4')}));
vi.mock('../../supabase',()=>({supabase:{}}));
vi.mock('../../lib/config',()=>({SUPABASE_URL:'https://dev.test'}));
vi.mock('../../lib/vodStorage',()=>({resolveVODPlayback:m.resolve}));
import PublicationStatus from './PublicationStatus';
it('shows curation eligibility and resolves protected playback only after preview is requested',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(createElement(PublicationStatus,{item:{id:'film',title:'Film',poster:'p',url:'private-reference',tags:['Comedy']},type:'movie',rows:[{title:'Have a Laugh',type:'category',filter_value:'Comedy',pages:'home'}]})));
 expect(host.textContent).toContain('Assets ready');expect(host.textContent).toContain('1 row placement');expect(m.resolve).not.toHaveBeenCalled();
 await act(async()=>host.querySelector('button')!.click());expect(host.textContent).toContain('Have a Laugh');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Preview playback')!.click());
 expect(m.resolve).toHaveBeenCalledWith(expect.anything(),'private-reference','https://dev.test',3600);
 expect(host.querySelector('video')!.getAttribute('src')).toBe('https://private.test/signed.mp4');
 await act(async()=>root.unmount());host.remove();
});
