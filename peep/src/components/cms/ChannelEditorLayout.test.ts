// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect} from 'vitest';
import ChannelEditorLayout from './ChannelEditorLayout';
it('keeps entered details across sections and mounts stream tools only when opened',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(createElement(ChannelEditorLayout,{basics:createElement('input',{defaultValue:'Channel A'}),source:'Playback',tools:createElement('span',{'data-tools':true},'Inspector'),actions:createElement('button',{},'Save changes')})));
 const input=host.querySelector('input')!;input.value='Edited channel';expect(host.querySelector('[data-tools]')).toBeNull();
 const button=(text:string)=>Array.from(host.querySelectorAll('nav button')).find(b=>b.textContent===text) as HTMLButtonElement;
 await act(async()=>button('Stream tools').click());expect(host.querySelector('[data-tools]')).not.toBeNull();expect(input.closest('[hidden]')).not.toBeNull();
 await act(async()=>button('Channel details').click());expect(input.value).toBe('Edited channel');expect(input.closest('[hidden]')).toBeNull();expect(host.querySelector('[data-tools]')).toBeNull();expect(host.querySelector('footer')?.textContent).toContain('Save changes');
 await act(async()=>root.unmount());host.remove();
});
