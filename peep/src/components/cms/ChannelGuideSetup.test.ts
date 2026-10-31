// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(async()=>({data:{program_count:1,coverage_end:'2099-01-01T13:00:00Z'},error:null}))}));
vi.mock('../../supabase',()=>({supabase:{rpc:m.rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null}),order:()=>({limit:async()=>({data:[],error:null})})})})})}}));
vi.mock('../../lib/config',()=>({SUPABASE_URL:'https://dev.test'}));
vi.mock('./adminAuth',()=>({getAdminToken:async()=> 'token'}));
import ChannelGuideSetup from './ChannelGuideSetup';
it('imports only the selected channel atomically and records file-based updates as manual',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(ChannelGuideSetup,{channelID:7,channelName:'News One'})));
  const file=host.querySelector('input[type="file"]')!;
  const xml='<tv><channel id="one"><display-name>News One</display-name></channel><channel id="two"><display-name>News Two</display-name></channel><programme channel="one" start="20990101120000 +0000" stop="20990101130000 +0000"><title>One</title></programme><programme channel="two" start="20990101120000 +0000" stop="20990101130000 +0000"><title>Two</title></programme></tv>';
  Object.defineProperty(file,'files',{value:[{name:'provider.xml',size:xml.length,text:async()=>xml}]});
  await act(async()=>file.dispatchEvent(new Event('change',{bubbles:true})));
  expect(host.querySelector('select')!.value).toBe('one');
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Save guide')!.click());
  expect(m.rpc).toHaveBeenCalledWith('save_channel_guide',expect.objectContaining({p_channel_id:7,p_source_url:null,p_xmltv_channel_id:'one',p_entries:[expect.objectContaining({title:'One'})]}));
  expect(host.textContent).toContain('Upload a fresh file when coverage ends.');
 }finally{await act(async()=>root.unmount());}
});
