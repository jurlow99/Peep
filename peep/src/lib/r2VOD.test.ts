import {afterEach,expect,it,vi} from 'vitest';
import {createR2VODUpload} from './r2VOD';
const mocks=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{functions:{invoke:mocks.invoke}}}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('uploads directly in bounded parts and verifies completion before reporting success',async()=>{
 const sent:any[]=[];let failed=false;
 class XHR {upload:any={};status=200;onload:any;onerror:any;onabort:any;timeout=0;url='';open(method:string,url:string){expect(method).toBe('PUT');this.url=url;}setRequestHeader(name:string,value:string){expect([name,value]).toEqual(['Content-Type','application/octet-stream']);}send(blob:Blob){sent.push({url:this.url,size:blob.size});queueMicrotask(()=>{if(!failed){failed=true;this.status=503;}this.onload();});}abort(){this.onabort?.();}}
 vi.stubGlobal('XMLHttpRequest',XHR);
 mocks.invoke.mockImplementation(async(_name:string,{body}:any)=>({data:body.action==='create'?{path:'inbox/id/playback/film.mp4',partSize:16*1024**2}:body.action==='part'?{url:`https://r2.test/part-${body.part}`}:{path:'inbox/id/playback/film.mp4',complete:true},error:null}));
 const size=16*1024**2+7,file={name:'film.mp4',size,slice:(start:number,end:number)=>new Blob([new Uint8Array(end-start)])};
 let done:any;const completed=new Promise(resolve=>{done=resolve;});const onError=vi.fn();
 const task=await createR2VODUpload({file,id:'upload-id',onProgress:vi.fn(),onError,onSuccess:done});task.start();await completed;
 expect(sent.map(p=>p.size)).toEqual([16*1024**2,16*1024**2,7]);
 expect(mocks.invoke.mock.calls.map(call=>call[1].body.action)).toEqual(['create','part','part','part','complete']);
 expect(onError).not.toHaveBeenCalled();
});
it('does not upload again when the server confirms an already completed file',async()=>{
 mocks.invoke.mockResolvedValue({data:{complete:true,path:'inbox/id/playback/film.mp4'},error:null});
 let done:any;const completed=new Promise(resolve=>{done=resolve;});
 const task=await createR2VODUpload({file:{name:'film.mp4',size:8},id:'id',onProgress:vi.fn(),onError:vi.fn(),onSuccess:done});task.start();
 expect(await completed).toEqual({path:'inbox/id/playback/film.mp4'});expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
