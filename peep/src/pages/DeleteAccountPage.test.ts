// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({getUser:vi.fn(),getSession:vi.fn(),signOut:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{auth:mock}}));
vi.mock('./AuthPages',()=>({SigninPage:({redirectTo}:any)=>createElement('div',null,`Sign in to ${redirectTo}`)}));
vi.mock('../lib/config',()=>({SUPABASE_URL:'https://test.invalid'}));
import DeleteAccountPage from './DeleteAccountPage';
it('opening the page never deletes and signed-out visitors keep the direct destination',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;mock.getUser.mockResolvedValue({data:{user:null}});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(createElement(DeleteAccountPage)));
 expect(host.textContent).toContain('Sign in to /account/delete');expect(fetch).not.toHaveBeenCalled();
 await act(async()=>root.unmount());vi.unstubAllGlobals();
});
it('requires password and exact confirmation, sends no user ID, and only signs out after success',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;mock.getUser.mockResolvedValue({data:{user:{id:'owner',email:'test@example.invalid'}}});mock.getSession.mockResolvedValue({data:{session:{access_token:'test-token'}}});mock.signOut.mockReset().mockResolvedValue({});
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true})});vi.stubGlobal('fetch',fetch);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(createElement(DeleteAccountPage)));
 expect(host.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
 for(const [index,value] of ['test-password','DELETE MY ACCOUNT'].entries())await act(async()=>{const input=host.querySelectorAll('input')[index];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(fetch).not.toHaveBeenCalled();
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({password:'test-password',confirmation:'DELETE MY ACCOUNT'});
 expect(host.textContent).toContain('Account deleted');expect(mock.signOut).toHaveBeenCalledWith({scope:'local'});
 await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
});
