// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({listener:null as any,signOut:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{auth:{signOut:m.signOut,getSession:async()=>({data:{session:null}}),onAuthStateChange:(fn:any)=>{m.listener=fn;return {data:{subscription:{unsubscribe:vi.fn()}}};}}}}));
vi.mock('../components/cms/ProviderDeliveries',()=>({default:({onSignOut}:any)=>createElement('button',{onClick:onSignOut},'Provider deliveries')}));
vi.mock('../components/auth/AuthGates',()=>({EmailVerificationGate:()=>createElement('div',null,'Confirm email')}));
vi.mock('./AuthPages',()=>({SigninPage:({redirectTo}:any)=>createElement('div',null,`Provider sign in: ${redirectTo}`)}));
import ProviderPortal from './ProviderPortal';
it('shows provider sign-in and opens deliveries after login instead of the public landing page',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(createElement(ProviderPortal)));expect(host.textContent).toBe('Provider sign in: /deliveries');
 await act(async()=>m.listener('SIGNED_IN',{user:{id:'provider',email_confirmed_at:'2026-10-27'}}));expect(host.textContent).toBe('Provider deliveries');
 await act(async()=>host.querySelector('button')!.click());expect(m.signOut).toHaveBeenCalledWith({scope:'local'});
 await act(async()=>m.listener('SIGNED_OUT',null));expect(host.textContent).toBe('Provider sign in: /deliveries');
 await act(async()=>root.unmount());
});
