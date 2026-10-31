// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
import SeriesWorkspace,{episodeReadiness} from './SeriesWorkspace';
const mocks=vi.hoisted(()=>({query:vi.fn(),sign:vi.fn(async()=> 'https://signed.test/video.mp4')}));
vi.mock('../../supabase',()=>({supabase:{from:(table:string)=>mocks.query(table)}}));
vi.mock('../../lib/config',()=>({IS_DEV_DB:true,SUPABASE_URL:'https://dev.supabase.co'}));
vi.mock('../../lib/vodStorage',()=>({resolveVODPlayback:mocks.sign}));
vi.mock('../ImageUploader',()=>({ImageUploader:()=>null}));
vi.mock('./EpisodeAutoThumbnail',()=>({default:()=>null}));
vi.mock('./VODUploadFlow',()=>({default:(props:any)=>createElement('div',{'data-series':props.initialShowID,'data-next':props.initialEpisodeNumber,'data-key':props.draftKey,'data-locked':props.lockSeries},'Scoped upload')}));
const show={id:4,title:'Sassy',poster:'poster.jpg',description:'Series synopsis',visibility_tier:'production',is_premium:false};
const episodes=[{id:1,season:1,episode_number:1,title:'Pilot',url:'https://private.test/ep1.mp4',status:'approved'},{id:2,season:2,episode_number:3,title:'Later episode',url:'',status:'pending'}];
beforeEach(()=>{sessionStorage.clear();vi.clearAllMocks();globalThis.IS_REACT_ACT_ENVIRONMENT=true;mocks.query.mockImplementation(()=>({select:()=>({eq:()=>({order:()=>({order:async()=>({data:episodes,error:null})})})})}));});
async function setup(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(createElement(SeriesWorkspace,{show,onBack:vi.fn(),onUpdated:vi.fn(),showToast:vi.fn()})));return {host,cleanup:async()=>{await act(async()=>root.unmount());host.remove();}};}
async function click(host:HTMLElement,label:string){await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===label)!.click());}
it('distinguishes missing video, approval and ready states',()=>{
 expect(episodeReadiness(episodes[0]).label).toBe('Ready');expect(episodeReadiness(episodes[1]).label).toBe('Missing video');expect(episodeReadiness({...episodes[1],url:'video.mp4'}).label).toBe('Needs approval');
});
it('groups episodes by season and scopes uploads to the current series and next number',async()=>{
 const {host,cleanup}=await setup();try{
  expect(host.textContent).toContain('Pilot');expect(host.textContent).toContain('Later episode');
  const season=host.querySelector('select')!;await act(async()=>{season.value='2';season.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(host.textContent).not.toContain('Pilot');
  await click(host,'+ Upload episode');const upload=host.querySelector('[data-series]')!;
  expect(upload.getAttribute('data-series')).toBe('4');expect(upload.getAttribute('data-next')).toBe('4');expect(upload.getAttribute('data-locked')).toBe('true');expect(upload.getAttribute('data-key')).toBe('peep-series-4-upload');
 }finally{await cleanup();}
});
it('resolves protected playback before showing an episode preview',async()=>{
 const {host,cleanup}=await setup();try{
  await click(host,'▶ Preview');expect(mocks.sign).toHaveBeenCalledWith(expect.anything(),'https://private.test/ep1.mp4','https://dev.supabase.co',3600);
  expect(host.querySelector('video')?.getAttribute('src')).toBe('https://signed.test/video.mp4');
 }finally{await cleanup();}
});
it('validates required artwork without sending a metadata update',async()=>{
 const {host,cleanup}=await setup();try{
  await click(host,'Details & artwork');
  const inputs=host.querySelectorAll('input');
  const poster=[...inputs].find(input=>input.value==='poster.jpg')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(poster,'');poster.dispatchEvent(new Event('input',{bubbles:true}));});
  await click(host,'Save series changes');expect(host.textContent).toContain('Series title and poster are required.');
  expect(mocks.query).toHaveBeenCalledTimes(1);
 }finally{await cleanup();}
});
it('saves the series autoplay permission from the details screen',async()=>{
 const {host,cleanup}=await setup();try{
  await click(host,'Details & artwork');
  const label=[...host.querySelectorAll('label')].find(l=>l.textContent?.includes('Allow next-episode autoplay'))!;
  const toggle=label.querySelector('input')!;expect(toggle.checked).toBe(true);
  await act(async()=>toggle.click());
  const update=vi.fn(()=>({eq:()=>({select:async()=>({data:[{id:4}],error:null})})}));
  mocks.query.mockReturnValue({update});
  await click(host,'Save series changes');
  expect(update).toHaveBeenCalledWith(expect.objectContaining({autoplay_next:false}));
 }finally{await cleanup();}
});
