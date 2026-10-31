// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest';
import {createVODUpload} from './vodUpload';
const auth=vi.hoisted(()=>({getSession:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{auth}}));
vi.mock('./config',()=>({SUPABASE_URL:'https://dev.supabase.co'}));
afterEach(()=>vi.restoreAllMocks());
it('sends exactly one fresh authorization value per request with XHR append semantics',async()=>{
  auth.getSession.mockResolvedValueOnce({data:{session:{access_token:'initial-token'}},error:null})
    .mockResolvedValueOnce({data:{session:{access_token:'fresh-token'}},error:null})
    .mockResolvedValueOnce({data:{session:{access_token:'next-token'}},error:null});
  const upload=await createVODUpload({file:new File(['video'],'film.mp4'),bucket:'vod-sources',path:'inbox/test/masters/film.mp4',contentType:'video/mp4',onProgress:vi.fn(),onSuccess:vi.fn(),onError:vi.fn()});
  expect(upload.options.endpoint).toBe('https://dev.storage.supabase.co/storage/v1/upload/resumable');
  // This is how tus prepares a browser request: options headers first, then its
  // async hook. XHR appends duplicate values, including case-insensitive names.
  for(const token of ['fresh-token','next-token']) {
    const values=new Map<string,string[]>();
    const request:any={setHeader:(name:string,value:string)=>{const key=name.toLowerCase();values.set(key,[...(values.get(key)||[]),value]);}};
    for(const [key,value] of Object.entries(upload.options.headers||{}))request.setHeader(key,value);
    await upload.options.onBeforeRequest!(request,upload);
    expect(values.get('authorization')).toEqual([`Bearer ${token}`]);
    expect(values.get('x-upsert')).toEqual(['false']);
  }
});
it('rejects signed-out creation and an expired session before transmitting a chunk',async()=>{
  auth.getSession.mockResolvedValue({data:{session:null},error:null});
  const options={file:new File(['video'],'film.mp4'),bucket:'vod-sources',path:'file.mp4',contentType:'video/mp4',onProgress:vi.fn(),onSuccess:vi.fn(),onError:vi.fn()};
  await expect(createVODUpload(options)).rejects.toThrow('Sign in');
  auth.getSession.mockResolvedValueOnce({data:{session:{access_token:'token'}},error:null});
  const upload=await createVODUpload(options);
  const setHeader=vi.fn();
  await expect(upload.options.onBeforeRequest!({setHeader} as any,upload)).rejects.toThrow('expired');
  expect(setHeader).not.toHaveBeenCalled();
});
