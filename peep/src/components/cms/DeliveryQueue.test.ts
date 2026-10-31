// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import DeliveryQueue,{deliveryNextStep} from './DeliveryQueue';
it('gives providers and admins different next steps without equating approval with publication',()=>{
 expect(deliveryNextStep('submitted',true)[0]).toBe('Review delivery');
 expect(deliveryNextStep('submitted',false)[0]).toBe('View status');
 expect(deliveryNextStep('changes_requested',false)[0]).toBe('Make changes');
 expect(deliveryNextStep('approved',true)[0]).toBe('Prepare publication');
 expect(deliveryNextStep('approved',false)[1]).toContain('handle publication');
});
it('filters the queue and opens the intended delivery',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),open=vi.fn();
 const draft={id:'1',title:'Draft movie',provider_id:'p',status:'draft',details:{type:'movie'}};
 const changes={id:'2',title:'Episode correction',provider_id:'p',status:'changes_requested',details:{type:'episode'},review_note:'Replace the audio track'};
 await act(async()=>root.render(createElement(DeliveryQueue,{rows:[draft,changes],providers:[{id:'p',name:'Filmgrub'}],admin:false,busy:false,onOpen:open})));
 const statusButton=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.startsWith('Changes needed'))!;
 await act(async()=>statusButton.click());
 expect(host.querySelectorAll('.delivery-queue-item')).toHaveLength(1);
 expect(host.textContent).toContain('Replace the audio track');
 expect(host.querySelector('.delivery-queue-items')!.textContent).not.toContain('Draft movie');
 await act(async()=>host.querySelector<HTMLButtonElement>('.delivery-queue-item')!.click());
 expect(open).toHaveBeenCalledWith(changes);
 await act(async()=>root.unmount());host.remove();
});
