// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import HomeHeroEditor from './HomeHeroEditor';
vi.mock('./HeroVideoPicker', () => ({default:() => null}));
vi.mock('../ImageUploader', () => ({ImageUploader:({onUploadSuccess}:any) => createElement('button',{onClick:()=>onUploadSuccess('https://artwork.invalid/new.jpg')},'Replace artwork')}));
it('keeps draft artwork, visibility and content destination editable without submitting until Save', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  let value:any={enabled:true,image_url:'https://artwork.invalid/old.jpg',title:'Feature',subtitle:'Description',badge:'NEW',cta_type:'movie',cta_label:'Watch',cta_value:'m'};
  const save=vi.fn();
  const render=()=>root.render(createElement(HomeHeroEditor,{value,onChange:(update:any)=>{value=update(value);render();},onSave:save,saving:false,movies:[{id:'m',title:'Movie'}],shows:[{id:4,title:'Series'}]}));
  try {
    await act(async()=>render());
    const image=host.querySelector('img')!;
    expect(image.alt).toBe('Full hero artwork preview');
    await act(async()=>image.dispatchEvent(new Event('error')));
    expect(host.textContent).toContain('Image unavailable');
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Replace artwork')!.click());
    expect(value.image_url).toBe('https://artwork.invalid/new.jpg');
    expect(host.querySelector('img')?.src).toBe(value.image_url);
    await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(value.enabled).toBe(false);
    const destination=host.querySelector<HTMLSelectElement>('select')!;
    await act(async()=>{destination.value='show';destination.dispatchEvent(new Event('change',{bubbles:true}));});
    expect(value.cta_value).toBe('');
    const target=host.querySelectorAll('select')[1];
    expect(target.textContent).toContain('Series');
    await act(async()=>{target.value='4';target.dispatchEvent(new Event('change',{bubbles:true}));});
    expect(value.cta_value).toBe('4');expect(save).not.toHaveBeenCalled();
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Save hero changes')!.click());
    expect(save).toHaveBeenCalledTimes(1);
  } finally {await act(async()=>root.unmount());host.remove();}
});
it('reuses landscape artwork, offers the poster, and clears unrelated artwork for a title without assets', async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div'),root=createRoot(host);let value:any={enabled:true,cta_type:'movie',cta_value:'',image_url:'custom.jpg'};const save=vi.fn();
 const movies=[{id:'one',title:'Film',thumbnail:'landscape.jpg',poster:'poster.jpg'},{id:'two',title:'No art'}];
 const render=()=>root.render(createElement(HomeHeroEditor,{value,onChange:(fn:any)=>{value=fn(value);render();},onSave:save,movies}));
 try{await act(async()=>render());const target=host.querySelectorAll('select')[1];
 await act(async()=>{target.value='one';target.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(value.image_url).toBe('landscape.jpg');expect(host.textContent).toContain('Artwork from Film');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Poster')!.click());expect(value.image_url).toBe('poster.jpg');expect(save).not.toHaveBeenCalled();
 await act(async()=>{target.value='two';target.dispatchEvent(new Event('change',{bubbles:true}));});expect(value.image_url).toBe('');expect(host.textContent).toContain('No saved artwork');
 }finally{await act(async()=>root.unmount());}
});
