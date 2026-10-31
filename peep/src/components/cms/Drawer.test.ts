// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import Drawer from './Drawer';
it('opens a centered accessible editor, closes by Escape, and restores focus',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),onClose=vi.fn();
 await act(async()=>root.render(createElement(Drawer,{title:'Edit channel',onClose},createElement('input',{'aria-label':'Name'}))));
 const dialog=host.querySelector('[role="dialog"]')!;
 expect(dialog.getAttribute('aria-modal')).toBe('true');expect(dialog.textContent).toContain('Edit channel');
 expect(document.body.style.overflow).toBe('hidden');expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 expect(onClose).toHaveBeenCalledTimes(1);
 await act(async()=>root.unmount());expect(document.activeElement).toBe(trigger);expect(document.body.style.overflow).toBe('');
 host.remove();trigger.remove();
});
