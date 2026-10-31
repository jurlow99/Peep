// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({request:vi.fn(),upload:vi.fn()}));
vi.mock('../../lib/r2VOD',()=>({r2VODRequest:m.request,createR2VODUpload:m.upload}));
import ProviderDeliveries from './ProviderDeliveries';
it('keeps unsaved details after an upload and disables sending until required files are ready',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const d={id:'delivery',provider_id:'provider',title:'Original',details:{},status:'draft'};
 m.request.mockImplementation(async(action:string)=>action==='delivery-list'?{providers:[{id:'provider',name:'Filmgrub'}],deliveries:[d]}:action==='delivery-assets'?{assets:[]}:{saved:true});
 m.upload.mockImplementation(async(options:any)=>({start:()=>options.onSuccess(),abort:vi.fn()}));
 const host=document.createElement('div'),root=createRoot(host);
 const click=async(label:string)=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(label))!.click());
 try{await act(async()=>root.render(createElement(ProviderDeliveries)));
 await click('Original');const input=[...host.querySelectorAll('label')].find(l=>l.textContent==='Title · required')!.querySelector('input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Unsaved title');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await click('Files');const file=host.querySelector<HTMLInputElement>('input[aria-label="Upload Video"]')!;
 Object.defineProperty(file,'files',{value:[new File(['video'],'test.mp4',{type:'video/mp4'})]});
 await act(async()=>file.dispatchEvent(new Event('change',{bubbles:true})));
 await click('Details');expect([...host.querySelectorAll('input')].some(i=>i.value==='Unsaved title')).toBe(true);
 await click('Review & send');const send=[...host.querySelectorAll('button')].find(b=>b.textContent==='Send to Peep')!;expect(send.disabled).toBe(true);expect(host.textContent).toContain('Needed');
 }finally{await act(async()=>root.unmount());}
});
it('shows provider submissions in admin review and separates unsubmitted drafts',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 m.request.mockImplementation(async(action:string)=>action==='delivery-list'?{providers:[{id:'p',name:'Filmgrub'}],deliveries:[{id:'sent',title:'Area 51',provider_id:'p',status:'submitted',submitter_email:'admin@example.com',details:{type:'episode'}},{id:'draft',title:'Unsubmitted draft',provider_id:'p',status:'draft',details:{}}],catalog:[]}:{assets:[]});
 const host=document.createElement('div'),root=createRoot(host);
 try{await act(async()=>root.render(createElement(ProviderDeliveries,{admin:true,reviewOnly:true})));
 expect(host.textContent).toContain('Area 51');expect(host.textContent).toContain('Submitted by admin@example.com');expect(host.textContent).not.toContain('Unsubmitted draft');expect(host.textContent).not.toContain('Start delivery');
 }finally{await act(async()=>root.unmount());}
});
it('supports changes, provider resubmission, approval and explicit publication without touching real deliveries',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 let d:any={id:'fixture',provider_id:'p',title:'Fixture film',details:{type:'movie',rights_note:'Test agreement only'},status:'submitted'};
 const assets=[{id:'v',asset_role:'video',state:'ready',object_key:'test/video.mp4',byte_size:100},{id:'p',asset_role:'poster',state:'ready',object_key:'test/poster.jpg',byte_size:100}];
 const actions:string[]=[];
 m.request.mockImplementation(async(action:string,body:any)=>{
  actions.push(action);
  if(action==='delivery-list')return {providers:[{id:'p',name:'Test provider'}],deliveries:[d],catalog:[]};
  if(action==='delivery-assets')return {assets};
  if(action==='playback')return {signedURL:`https://preview.test/${body.id}`};
  if(action==='delivery-review')d={...d,status:body.status,review_note:body.note};
  if(action==='delivery-save')d={...d,title:body.title,details:body.details};
  if(action==='delivery-submit')d={...d,status:'submitted'};
  if(action==='delivery-publish')d={...d,status:'published'};
  return {saved:true};
 });
 const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
 const click=async(label:string)=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(label))!.click());
 const admin=async()=>{await act(async()=>root.render(createElement(ProviderDeliveries,{admin:true,reviewOnly:true})));await click('Fixture film');};
 const restart=async()=>{await act(async()=>root.unmount());root=createRoot(host);};
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 try{
  await admin();expect(host.textContent).toContain('Publication plan');
  expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Request changes')!.disabled).toBe(true);
  await click('Open review previews');expect(host.querySelector('video')?.getAttribute('src')).toBe('https://preview.test/v');expect(host.querySelector('img')?.getAttribute('src')).toBe('https://preview.test/p');
  const note=host.querySelector('textarea')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,'Please replace the audio.');note.dispatchEvent(new Event('input',{bubbles:true}));});
  await click('Request changes');expect(d.status).toBe('changes_requested');
  await restart();await act(async()=>root.render(createElement(ProviderDeliveries)));await click('Fixture film');
  expect(host.textContent).toContain('Please replace the audio.');
  await click('Review & send');await click('Send to Peep');expect(d.status).toBe('submitted');
  await restart();await admin();await click('Approve delivery');expect(d.status).toBe('approved');expect(actions).not.toContain('delivery-publish');
  await click('Publish to catalog');expect(d.status).toBe('approved');
  confirm.mockReturnValue(true);await click('Publish to catalog');expect(d.status).toBe('published');
 }finally{confirm.mockRestore();await act(async()=>root.unmount());host.remove();}
});
