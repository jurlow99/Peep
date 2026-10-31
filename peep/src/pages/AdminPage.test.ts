// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({listener:null as any,role:'admin',unsubscribe:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'admin'}}}}),onAuthStateChange:(fn:any)=>{m.listener=fn;return {data:{subscription:{unsubscribe:m.unsubscribe}}};}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:m.role},error:null})})})})}}));
vi.mock('../components/CMS',()=>({CMS:()=>createElement('div',null,'Admin workspace')}));
vi.mock('../components/EnvBadge',()=>({IS_DEV_DB:true}));
import {AdminPage} from './AdminPage';
it('closes stale admin access when another tab signs out or switches accounts',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;m.role='admin';const host=document.createElement('div');const root=createRoot(host);
 await act(async()=>root.render(createElement(AdminPage)));expect(host.textContent).toContain('Admin workspace');
 await act(async()=>{m.listener('SIGNED_OUT',null);await new Promise(r=>setTimeout(r,5));});expect(host.textContent).not.toContain('Admin workspace');expect(host.textContent).toContain('Signing out in another tab');
 m.role='viewer';await act(async()=>{m.listener('SIGNED_IN',{user:{id:'provider'}});await new Promise(r=>setTimeout(r,5));});expect(host.textContent).not.toContain('Admin workspace');expect(host.textContent).toContain("doesn't have admin access");
 await act(async()=>root.unmount());expect(m.unsubscribe).toHaveBeenCalled();
});
